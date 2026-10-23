// A CircuitDesc as plain data: what crosses from the app into the WASM engine, and what the
// differential harness (scripts/bench-wasm.ts) saves to disk and replays on both engines.
//
// serializeCircuitDesc() evaluates everything a CircuitDesc holds as closures: each LUT cell's
// logic becomes its truth table (computed exactly the way Chip's constructor does), and each
// custom cell becomes its nativeKinds.ts kind and parameters. deserializeCircuitDesc() goes the
// other way, back to a CircuitDesc the TypeScript engine runs unchanged. flattenNetlist()
// resolves the names into chip indices and connect() calls for the WASM engine, mirroring
// circuit.ts's CircuitBuilder step for step (the harness checks the two agree).

import type { ChipDesc, CustomLogic } from "./chip_desc";
import { chipStart, customChipStart, MAX_PINS } from "./chip_desc";
import type { CircuitDesc } from "./circuit_desc";
import { CHIP, CONNECTION, OPTIMIZATION_HINT, circuitLayout } from "./circuit_desc";
import type { CircuitEntry } from "./circuit_desc";
import { EVENT_QUEUE_SIZE, SUBCYCLE_SIZE } from "./circuit";
import { assertLinkBit } from "./chip";
import { TIMESCALE } from "./constants";
import {
    nopCell, clockCell, sourceCell, sramBitCell, monostableQCell, monostableExpCell,
    type MonostableShared, type SramMemory,
} from "./nativeKinds";

export type SerialNative =
    | { kind: "nop" }
    | { kind: "clock"; initialDelay: number }
    | { kind: "source"; high: number }
    | { kind: "sram"; mem: number; addrBits: number; bitMask: number; invert: number }
    | { kind: "monoQ"; group: number; invert: number; fallDelay: number; retriggerable: number }
    | { kind: "monoExp"; group: number; fallDelay: number }
    // A custom cell with no built-in kind: `id` indexes the closures passed alongside (see
    // serializeCircuitDesc()'s `jsCells`), so only an in-memory netlist can hold one.
    | { kind: "js"; id: number };

export interface SerialCell {
    inPins: number[];
    evPins: number[];
    outPin: number;
    prevOutPin: number;
    delay: [number, number]; // seconds
    initOutput: number;
    lut?: number[];          // LUT cells: truth table words, bit i = output for LUT index i
    native?: SerialNative;   // custom cells
}

export interface SerialChip {
    name: string;
    cells: SerialCell[];
    label?: string;          // the owning element's name, for a harness to find it (ExtVoltageElm)
    optimizationDisabled?: boolean;
}

export interface SerialDesc {
    timescale: number;
    chips: SerialChip[];
    connections: [string, number, string, number][];
    hints: [string, number, number][];
    srams: { addrBits: number; words: number[] }[];
    monoGroups: number;
    // seedInitialDigitalState()'s entries, resolved: [chip name, cell index, value].
    seeds?: [string, number, number][];
}

/** The truth table Chip's constructor would build for `d`, as 32-bit words. */
function computeLut(d: ChipDesc): number[] {
    const numInputPins = d.inPins.length;
    const lutSize = numInputPins + d.evPins.length + (d.prevOutPin ? 1 : 0);
    const words = new Array<number>(lutSize <= 5 ? 1 : 1 << (lutSize - 5)).fill(0);
    const pin = new Int32Array(MAX_PINS + 1);
    const prevPin = new Int32Array(MAX_PINS + 1);
    const eventPin = new Int32Array(MAX_PINS + 1);
    for (let i = 0; i < (1 << lutSize); i++) {
        pin.fill(0); prevPin.fill(0); eventPin.fill(0);
        let x = i;
        for (let j = 0; j < numInputPins; j++) { pin[d.inPins[j]] = x & 1; x >>= 1; }
        for (let j = 0; j < d.evPins.length; j++) { eventPin[d.evPins[j]] = x & 1; x >>= 1; }
        if (d.prevOutPin) prevPin[d.prevOutPin] = x & 1;
        d.logic!(pin, prevPin, eventPin, null);
        if (pin[d.outPin]) words[i >> 5] = (words[i >> 5] | (1 << (i & 31))) >>> 0;
    }
    return words;
}

/** `labels` optionally names a chip (by its CircuitDesc name) for whoever replays the result.
 * A custom cell with no native kind is an error unless `jsCells` is given, in which case its
 * closure is appended there and the cell refers to it by index. `sramMems`, if given, receives
 * each SRAM's memory at its index in `srams`. */
export function serializeCircuitDesc(desc: CircuitDesc, labels?: Map<string, string>,
        optimizationDisabled?: Set<string>, jsCells?: CustomLogic[], sramMems?: SramMemory[]): SerialDesc {
    if (desc.subCircuits.length) throw new Error("serializeCircuitDesc: sub-circuits are not supported");

    const sramIds = new Map<SramMemory, number>();
    const srams: SerialDesc["srams"] = [];
    const monoIds = new Map<MonostableShared, number>();

    const serialNative = (d: ChipDesc): SerialNative => {
        const n = d.native;
        if (!n) {
            if (!jsCells) throw new Error("serializeCircuitDesc: custom cell with no native kind");
            jsCells.push(d.custom!);
            return { kind: "js", id: jsCells.length - 1 };
        }
        switch (n.kind) {
            case "nop": return { kind: "nop" };
            case "clock": return { kind: "clock", initialDelay: n.initialDelay };
            case "source": return { kind: "source", high: n.high() ? 1 : 0 };
            case "sram": {
                let id = sramIds.get(n.mem);
                if (id === undefined) {
                    id = srams.length;
                    sramIds.set(n.mem, id);
                    const words: number[] = [];
                    for (let a = 0; a < (1 << n.addrBits); a++) words.push(n.mem.read(a));
                    srams.push({ addrBits: n.addrBits, words });
                    sramMems?.push(n.mem);
                }
                return { kind: "sram", mem: id, addrBits: n.addrBits, bitMask: n.bitMask, invert: n.invert };
            }
            case "monoQ":
            case "monoExp": {
                let g = monoIds.get(n.shared);
                if (g === undefined) { g = monoIds.size; monoIds.set(n.shared, g); }
                if (n.kind === "monoQ")
                    return { kind: "monoQ", group: g, invert: n.invert, fallDelay: n.fallDelay(),
                             retriggerable: n.retriggerable() ? 1 : 0 };
                return { kind: "monoExp", group: g, fallDelay: n.fallDelay() };
            }
        }
    };

    const chips: SerialChip[] = desc.chips.map(c => {
        const sc: SerialChip = {
            name: c.name,
            cells: c.desc.map(d => {
                const cell: SerialCell = {
                    inPins: [...d.inPins], evPins: [...d.evPins], outPin: d.outPin, prevOutPin: d.prevOutPin,
                    delay: [d.delay[0], d.delay[1]], initOutput: d.initOutput ?? 0,
                };
                if (d.custom || d.native) cell.native = serialNative(d);
                else if (d.logic) cell.lut = computeLut(d);
                return cell;
            }),
        };
        const label = labels?.get(c.name);
        if (label !== undefined) sc.label = label;
        if (optimizationDisabled?.has(c.name)) sc.optimizationDisabled = true;
        return sc;
    });

    return {
        timescale: TIMESCALE,
        chips,
        connections: desc.connections.map(c => [c.name1, c.pin1, c.name2, c.pin2]),
        hints: desc.hints.map(h => [h.chip, h.queueSize, h.subcycleSize]),
        srams,
        monoGroups: monoIds.size,
    };
}

/** Handles into a deserialized circuit's external state, for whoever drives it. */
export interface DeserializedHandles {
    srams: number[][];
}

/** Back to a CircuitDesc the TypeScript engine runs. The caller must setTimescale(sd.timescale)
 * before constructing the Circuit. `jsCells` supplies the closures for any "js" cells. */
export function deserializeCircuitDesc(sd: SerialDesc, jsCells?: CustomLogic[]): { desc: CircuitDesc; handles: DeserializedHandles } {
    const srams = sd.srams.map(s => [...s.words]);
    const mems: SramMemory[] = srams.map(w => ({
        read: (a) => w[a] ?? 0,
        write: (a, v) => { w[a] = v; },
    }));
    const groups: MonostableShared[] = Array.from({ length: sd.monoGroups }, (): MonostableShared => ({ expireChip: null, lastT: false }));

    const cellDesc = (c: SerialCell): ChipDesc => {
        let b;
        if (c.native) {
            const n = c.native;
            switch (n.kind) {
                case "nop": b = nopCell(); break;
                case "clock": b = clockCell(n.initialDelay); break;
                case "source": { const h = n.high !== 0; b = sourceCell(() => h); break; }
                case "sram": b = sramBitCell(mems[n.mem], n.addrBits, n.bitMask, n.invert); break;
                case "monoQ": b = monostableQCell(groups[n.group], n.invert, () => n.fallDelay, () => n.retriggerable !== 0); break;
                case "monoExp": b = monostableExpCell(groups[n.group], () => n.fallDelay); break;
                case "js": b = customChipStart(jsCells![n.id]); break;
            }
        } else {
            // Chip's constructor calls logic once per LUT index, in order, so replaying the
            // table by call count reproduces it exactly - even for a cell whose pins repeat,
            // where decoding the index back out of pin[] would not.
            const lut = c.lut!;
            const size = (c.inPins.length + c.evPins.length + (c.prevOutPin ? 1 : 0));
            const n = 1 << size;
            let i = 0;
            const out = c.outPin;
            b = chipStart((pin) => {
                const k = i++ % n;
                pin[out] = (lut[k >> 5] >>> (k & 31)) & 1;
            });
        }
        b.inputPins(...c.inPins).eventPins(...c.evPins).outputPin(c.outPin).prevOutputPin(c.prevOutPin)
            .outputDelayS(c.delay[0], c.delay[1]).initialOutput(c.initOutput);
        return b;
    };

    const entries: CircuitEntry[] = [];
    for (const c of sd.chips) entries.push(CHIP(c.name, c.cells.map(cellDesc)));
    for (const [chip, q, s] of sd.hints) entries.push(OPTIMIZATION_HINT(chip, q, s));
    for (const [n1, p1, n2, p2] of sd.connections) entries.push(CONNECTION(n1, p1, n2, p2));
    return { desc: circuitLayout(entries), handles: { srams } };
}

// --- Flattening for the WASM engine ---

// Cell kinds, matching engine.cpp's Kind enum.
export const enum NetKind { LUT = 0, VCC = 1, GND = 2, DEOPT = 3, NOP = 4, CLOCK = 5, SOURCE = 6, SRAM = 7, MONO_Q = 8, MONO_EXP = 9, JS = 10 }

const KIND_OF: Record<SerialNative["kind"], NetKind> = {
    nop: NetKind.NOP, clock: NetKind.CLOCK, source: NetKind.SOURCE, sram: NetKind.SRAM,
    monoQ: NetKind.MONO_Q, monoExp: NetKind.MONO_EXP, js: NetKind.JS,
};

// Fields per cell in FlatNetlist.cells: kind, #inputs, #event pins, has prev-output pin,
// queue size, subcycle size, initial output, optimization disabled, then four kind
// parameters (a LUT cell's p2 is its offset into `luts`). Doubles, since some parameters are
// tick counts. engine.cpp's net_build() reads the same layout.
export const CELL_FIELDS = 12;

export interface FlatNetlist {
    numCells: number;          // including the three special chips
    cells: Float64Array;       // CELL_FIELDS per cell
    delays: Float64Array;      // 2 per cell, ticks
    luts: Uint32Array;         // concatenated; a LUT cell's p2 is its offset
    connects: Int32Array;      // [src, dst, inputIndex, extraMask] per connect() call, in order
    srams: { addrBits: number; words: number[] }[];
    monoGroups: number;
    names: string[];           // debugName per cell ("" for the specials)
    seeds: { chip: number | null; value: number }[]; // SerialDesc.seeds, as cell indices
    chipCells: Map<string, number[]>; // CircuitDesc chip name -> its cells' indices
}

/** Resolves `sd` exactly as Circuit's CircuitBuilder would (same chip order, same connect()
 * order), producing data engine.cpp can build from without any string handling. */
export function flattenNetlist(sd: SerialDesc): FlatNetlist {
    interface Cell { idx: number; c: SerialCell | null; outPin: number; inPins: number[]; evPins: number[] }
    const cellList: Cell[] = [];
    const chipMap = new Map<string, Cell[]>();
    const names: string[] = [];
    const kinds: NetKind[] = [];
    const add = (name: string, c: Cell) => {
        let l = chipMap.get(name);
        if (!l) { l = []; chipMap.set(name, l); }
        l.push(c);
    };

    // createSpecialChips()
    const special = (name: string, kind: NetKind) => {
        const c: Cell = { idx: cellList.length, c: null, outPin: 1, inPins: [], evPins: [] };
        cellList.push(c); names.push(""); kinds.push(kind);
        add(name, c);
    };
    special("_VCC", NetKind.VCC);
    special("_GND", NetKind.GND);
    special("_DEOPTIMIZER", NetKind.DEOPT);

    const connOut: Cell[] = [], connIn: Cell[] = [], connPin: number[] = [];
    const queueSizes: number[] = [1, 1, 1], subcycleSizes: number[] = [64, 64, 64];
    const hintList = new Map<string, { q: number; s: number }>();
    for (const [chip, q, s] of sd.hints) hintList.set(chip, { q, s });

    const chipCells = new Map<string, number[]>();
    const optDisabled: boolean[] = [false, false, false];

    // createChips() / createChip()
    for (const chip of sd.chips) {
        const hint = hintList.get(chip.name);
        const created: Cell[] = [];
        const outputPinMap = new Map<number, Cell>();
        for (const sc of chip.cells) {
            const c: Cell = { idx: cellList.length, c: sc, outPin: sc.outPin, inPins: sc.inPins, evPins: sc.evPins };
            cellList.push(c);
            names.push(chip.name);
            kinds.push(sc.native ? KIND_OF[sc.native.kind] : NetKind.LUT);
            queueSizes.push(hint ? hint.q : EVENT_QUEUE_SIZE);
            subcycleSizes.push(hint ? hint.s : SUBCYCLE_SIZE);
            optDisabled.push(!!chip.optimizationDisabled);
            created.push(c);
            add(chip.name, c);
            if (sc.outPin) outputPinMap.set(sc.outPin, c);
        }
        chipCells.set(chip.name, created.map(c => c.idx));
        for (const c of created) {
            for (const inPin of c.inPins) {
                const out = outputPinMap.get(inPin);
                if (out) { connOut.push(out); connIn.push(c); connPin.push(inPin); }
            }
        }
    }

    // findConnections() / findConnection(), prefix "" only.
    const findConnection = (name1: string, name2: string, pin1: number, pin2: number): boolean => {
        const range1 = chipMap.get(name1) ?? [];
        const range2 = chipMap.get(name2) ?? [];
        let connected = false;
        for (const cd1 of range1) {
            if (cd1.outPin === pin1) {
                for (const cd2 of range2)
                    for (const p of cd2.inPins)
                        if (p === pin2) { connected = true; connOut.push(cd1); connIn.push(cd2); connPin.push(pin2); }
                break;
            }
        }
        for (const cd2 of range2) {
            if (cd2.outPin === pin2) {
                for (const cd1 of range1)
                    for (const p of cd1.inPins)
                        if (p === pin1) { connected = true; connOut.push(cd2); connIn.push(cd1); connPin.push(pin1); }
                break;
            }
        }
        return connected;
    };
    for (const [n1, p1, n2, p2] of sd.connections)
        if (!findConnection(n1, n2, p1, p2))
            console.log(`WARNING: Invalid connection: (${n1}.${p1} -> ${n2}.${p2})`);

    // makeAllConnections(): pre-resolve each connect(chip, desc, pin) to (input index, event bits).
    const connects: number[] = [];
    for (let k = 0; k < connOut.length; k++) {
        const dst = connIn[k], pin = connPin[k];
        const i = dst.inPins.indexOf(pin);
        if (i < 0) continue; // connect() finds no matching input pin and does nothing
        assertLinkBit(i, `chip '${names[dst.idx]}' input pin index`);
        let extra = 0;
        for (let j = 0; j < dst.evPins.length; j++)
            if (dst.evPins[j] === pin) {
                assertLinkBit(dst.inPins.length + j, `chip '${names[dst.idx]}' event pin bit`);
                extra |= 1 << (dst.inPins.length + j);
            }
        connects.push(connOut[k].idx, dst.idx, i, extra);
    }

    // Per-cell data.
    const n = cellList.length;
    const cells = new Float64Array(n * CELL_FIELDS);
    const delays = new Float64Array(n * 2);
    const lutWords: number[] = [];
    for (const c of cellList) {
        const o = c.idx * CELL_FIELDS;
        const sc = c.c;
        const kind = kinds[c.idx];
        cells[o + 0] = kind;
        if (sc === null) {
            // _VCC/_GND: no logic, no custom - Chip's constructor returns before touching
            // delay. _DEOPTIMIZER is custom, so its delay is floored like any other.
            if (kind === NetKind.DEOPT) { delays[c.idx * 2] = 1; delays[c.idx * 2 + 1] = 1; }
            cells[o + 1] = 0; cells[o + 2] = 0; cells[o + 3] = 0;
            cells[o + 4] = queueSizes[c.idx]; cells[o + 5] = subcycleSizes[c.idx];
            continue;
        }
        delays[c.idx * 2] = Math.max(1, Math.trunc(sc.delay[0] / sd.timescale));
        delays[c.idx * 2 + 1] = Math.max(1, Math.trunc(sc.delay[1] / sd.timescale));
        cells[o + 1] = sc.inPins.length;
        cells[o + 2] = sc.evPins.length;
        cells[o + 3] = sc.prevOutPin ? 1 : 0;
        cells[o + 4] = queueSizes[c.idx];
        cells[o + 5] = subcycleSizes[c.idx];
        cells[o + 6] = sc.initOutput;
        cells[o + 7] = optDisabled[c.idx] ? 1 : 0;
        const nat = sc.native;
        if (nat) switch (nat.kind) {
            case "clock": cells[o + 8] = nat.initialDelay; break;
            case "source": cells[o + 8] = nat.high; break;
            case "sram": cells[o + 8] = nat.mem; cells[o + 9] = nat.addrBits; cells[o + 10] = nat.bitMask; cells[o + 11] = nat.invert; break;
            case "monoQ": cells[o + 8] = nat.group; cells[o + 9] = nat.invert; cells[o + 10] = nat.fallDelay; cells[o + 11] = nat.retriggerable; break;
            case "monoExp": cells[o + 8] = nat.group; cells[o + 10] = nat.fallDelay; break;
            case "js": cells[o + 8] = nat.id; break;
        }
        if (sc.lut) { cells[o + 10] = lutWords.length; for (const w of sc.lut) lutWords.push(w); }
    }

    return {
        numCells: n, cells, delays, luts: Uint32Array.from(lutWords), connects: Int32Array.from(connects),
        srams: sd.srams, monoGroups: sd.monoGroups, names, chipCells,
        seeds: (sd.seeds ?? []).map(([name, cell, value]) => ({ chip: chipCells.get(name)?.[cell] ?? null, value })),
    };
}
