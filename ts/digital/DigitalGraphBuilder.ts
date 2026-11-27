/*
    Phase 1 of the dice-ts cutover (see noble-stirring-rabin.md): the dynamic netlist builder
    that replaces CircuitWiring.ts's wireDigitalCircuit()/initDigitalElements(). Where the old
    engine wired DigitalElm instances directly (elm.addInput()), this builds a dice-ts
    CircuitDesc from the live element/node graph and hands it to circuit.ts's Circuit
    constructor - the same CHIP()/CONNECTION()/circuitLayout() shape dice-ts's own hand-written
    circuit_desc.ts source files use, just assembled at runtime instead of by hand.

    Types are duck-typed (any), matching CircuitWiring.ts's own convention: this module doesn't
    need to know which concrete CircuitElm subclass it's looking at, only that it implements
    `digitalSynthesis()` (see DigitalSynthesis below) and/or `digitalTie()` (see
    DigitalTieSource below). Phase 2 gives GateElm/InverterElm/RailElm/LogicInputElm these
    methods; later phases add them to the remaining chip elements.
*/

import { ChipState, ChipType } from "./chip";
import type { Chip } from "./chip";
import { chipStart } from "./chip_desc";
import type { ChipDesc, ChipLogic, CustomLogic } from "./chip_desc";
import { CHIP, CONNECTION, OPTIMIZATION_HINT, circuitLayout } from "./circuit_desc";
import type { CircuitEntry, CircuitDesc } from "./circuit_desc";
import { Circuit, SUBCYCLE_SIZE } from "./circuit";
import { serializeCircuitDesc, flattenNetlist } from "./netlist";
import type { SerialDesc } from "./netlist";
import type { EngineChip, EngineCircuit, EngineName } from "./engine";
import type { SramMemory } from "./nativeKinds";
import { WasmCircuit, WasmChip } from "./wasmEngine";

/**
 * What a digital-capable CircuitElm subclass returns from digitalSynthesis(): the ChipDesc[]
 * cell(s) that make up its behavior (a single cell for a gate, a chain of cells wired via
 * internal pins i1..i24 for something like a CounterElm - see chip_desc.ts), plus a map from
 * this element's own post index (a real circuit pin, the numbering CircuitWiring.findDriver()
 * already understands) to the external pin number that post corresponds to within `desc`.
 * Internal-only pins (i1..i24) never appear in pinMap - they're not real circuit posts, so
 * nothing outside this element's own desc[] ever needs to address them by post index.
 *
 * A `null` return (rather than omitting the method) means "not a digital source *right now*"
 * for an instance whose digital-ness depends on runtime state - e.g. a RailElm's waveform, or a
 * LogicInputElm in ternary mode. Such an element is simply left out of the built netlist for
 * this build, same as if it lacked digitalSynthesis() entirely.
 */
export interface DigitalSynthesis {
    desc: ChipDesc[];
    pinMap: Map<number, number>; // postIndex -> external pin number within desc
    // Event queue size for every chip in `desc`, emitted as an OPTIMIZATION_HINT (same as
    // dice-ts's breakout.ts does for E3/E1/C36). Omitted or 0 means the default (128). A chip
    // that gets activationCheck()ed constantly but rarely promotes scans its whole input
    // history each time, so a small queue (e.g. 8) can make it much cheaper.
    queueSize?: number;
    // Run every chip in `desc` unoptimized (the same per-chip optimizationDisabled the global
    // "Disable Digital Optimization" option sets). For a chip that keeps getting promoted and
    // demoted - e.g. Breakout's brick-display gates, fed by an SRAM whose output changes every
    // brick - the churn costs more than promotion saves; even a small queueSize doesn't stop it.
    optimizationDisabled?: boolean;
}

export interface DigitalSynthesizable {
    digitalSynthesis(): DigitalSynthesis | null;
}

export function isDigitalSynthesizable(elm: any): elm is DigitalSynthesizable {
    return elm != null && typeof elm.digitalSynthesis === "function";
}

/**
 * A single-post element whose value is a hardwired constant - a RailElm DC tie, the common
 * "pull this pin to +5V/GND" idiom. Rather than synthesizing a per-instance chip for something
 * that never changes, such an element binds straight to Circuit's own shared `_VCC`/`_GND`
 * sentinel chips (circuit.ts's createSpecialChips()) - dice-ts's own convention for every
 * constant tie in a real circuit_desc.ts source file. Checked before digitalSynthesis() (see
 * synthesizeAll() below); a `null` return falls through to digitalSynthesis() instead (e.g. a
 * RailElm that's a clock rather than a DC tie).
 */
export interface DigitalTieSource {
    digitalTie(): "VCC" | "GND" | null;
}

export function isDigitalTieSource(elm: any): elm is DigitalTieSource {
    return elm != null && typeof elm.digitalTie === "function";
}

interface SynthEntry {
    name: string;
    desc: ChipDesc[];
    pinMap: Map<number, number>;
    isTie: boolean; // true: name is "_VCC"/"_GND", already exists in every Circuit - don't emit a CHIP entry
    queueSize?: number;
    optimizationDisabled?: boolean;
}

const TIE_OUT_PIN = 1;

// Data-only stand-in matching the shape of circuit.ts's own chipVCC/chipGND descriptors - used
// only so isOutputPin() below recognizes a tie's post as an output. Never passed to `new Chip()`
// (ties don't get their own chip - see DigitalTieSource above), so its null logic/custom is fine.
function tieDesc(): ChipDesc[] {
    return [{ logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: TIE_OUT_PIN, prevOutPin: 0 }];
}

/** True if `pin` (an external pin number within `desc`) is some cell's output, per the same
 * convention chip_desc.ts's ChipDesc.outPin already encodes. A pin is exactly one of
 * output/input by construction - it can't be both. */
export function isOutputPin(desc: ChipDesc[], pin: number): boolean {
    return desc.some(d => d.outPin === pin);
}

/**
 * Implemented by an element (TriStateElm, SRAMElm's data pins) whose digital output post is only
 * a REAL driver some of the time - the rest of the time it's meant to be high-impedance, which
 * this optimizer has no third state to represent. Such an element's own digitalSynthesis() must
 * instead compute AND(enable, data) for that post, so a disabled driver contributes a plain 0
 * (matching a bus with an assumed pulldown - there's no true floating value here) rather than
 * fighting whatever else is enabled. `isTriStateOutput(postIndex)` tells resolveNodeDrivers()
 * below which of this element's OUTPUT posts (per digitalSynthesis()'s own pinMap) are built this
 * way, so it knows it's safe to merge multiple such drivers on one shared node instead of
 * treating that sharing as a wiring mistake (see the plain "multiple drivers" warning path).
 */
export interface DigitalTriStateDriver {
    isTriStateOutput(postIndex: number): boolean;
}

export function isDigitalTriStateDriver(elm: any): elm is DigitalTriStateDriver {
    return elm != null && typeof elm.isTriStateOutput === "function";
}

/**
 * Implemented by a tri-state driver whose own output post is genuinely bidirectional - the same
 * real pin also needs to OBSERVE the node's value, not just drive it (SRAM's data pins: an output
 * while reading, but also the thing a write must capture ITS DATA from). A plain wire from this
 * element's own output pin back to some internal "readback" pin would be wrong: per
 * DigitalTriStateDriver's own docstring, THIS element's own output is forced to 0 while it isn't
 * actively driving (e.g. SRAM mid-write) - exactly when an external writer is the one actually
 * putting real data on the bus. So `digitalTriStateReadbackPin(postIndex)` instead names an
 * INTERNAL pin (within this element's own digitalSynthesis() desc, not one of pinMap's external
 * pins) that resolveNodeDrivers() below wires from the node's fully RESOLVED driver - itself, if
 * this is the only thing driving the node (a no-op in practice: nothing is writing if nothing else
 * is there to write from), or the OR-merge glue chip when the node is actually shared - rather
 * than hardcoding a self-connection that would only ever read this element's own contribution.
 * Returns null for a tri-state output post that doesn't need readback (TriStateElm/ROMElm's own
 * data-out pins: pure drivers, nothing on this element ever needs to observe them). */
export interface DigitalTriStateReadback {
    digitalTriStateReadbackPin(postIndex: number): number | null;
}

export function isDigitalTriStateReadback(elm: any): elm is DigitalTriStateReadback {
    return elm != null && typeof elm.digitalTriStateReadbackPin === "function";
}

/**
 * Implemented by a tri-state driver that also exports its ENABLE as an output cell of its own (an
 * internal pin within its digitalSynthesis() desc), so a charge-storing node (see
 * DigitalChargeStorage below) can tell "disabled" apart from "enabled, driving 0" - the
 * AND(enable, data) output alone can't. The enable cell must fall no later than the AND output
 * does, and rise at least two ticks after it (a tick being the engine's own delay unit): the node's
 * resolver sees its merged data one tick late (see resolvePassGroups()), so "disabled" always
 * arrives before the data drops, and the data before "enabled".
 */
export interface DigitalTriStateEnable {
    digitalTriStateEnablePin(postIndex: number): number | null;
}

export function isDigitalTriStateEnable(elm: any): elm is DigitalTriStateEnable {
    return elm != null && typeof elm.digitalTriStateEnablePin === "function";
}

/** Implemented by a non-digital element (a capacitor) whose presence on a node means the node
 * should HOLD its last driven value while nothing drives it, instead of reading 0 - see
 * resolvePassGroups(). */
export interface DigitalChargeStorage {
    digitalHoldsCharge(): boolean;
}

function nodeHoldsCharge(node: any): boolean {
    return (node?.links ?? []).some((l: any) => typeof l.elm?.digitalHoldsCharge === "function" && l.elm.digitalHoldsCharge());
}

interface DriverCandidate {
    entry: SynthEntry;
    pin: number;
    postIndex: number;
    elm: any;
}

/** Every synthesized element's own OUTPUT posts, indexed by the CircuitNode object they land on
 * (assumes wire closure already merged purely-wire-connected posts into one shared CircuitNode -
 * i.e. this must run after SimulationManager.makeNodeList()/calcWireInfo()). The reverse of the
 * old per-consumer findDriver()'s node.links walk: needed so a node fed by more than one output
 * can be resolved as a GROUP (see resolveNodeDrivers() below) instead of one candidate at a
 * time. */
function collectOutputsByNode(synthMap: Map<any, SynthEntry>): Map<any, DriverCandidate[]> {
    const byNode = new Map<any, DriverCandidate[]>();
    for (const [elm, entry] of synthMap) {
        for (const [postIndex, pin] of entry.pinMap) {
            if (!isOutputPin(entry.desc, pin)) continue;
            const node = elm.nodes?.[postIndex];
            if (node == null) continue;
            const candidate: DriverCandidate = { entry, pin, postIndex, elm };
            const list = byNode.get(node);
            if (list) list.push(candidate); else byNode.set(node, [candidate]);
        }
    }
    return byNode;
}

/**
 * Implemented by an element that connects pairs of its posts bidirectionally while some signal
 * says so (an analog switch). It drives nothing itself: each pair names the internal pin (within
 * its own digitalSynthesis() desc) of a cell that's 1 while the pair is connected, and
 * resolvePassGroups() below does the rest.
 */
export interface DigitalPassSwitch {
    digitalPassPairs(): { a: number; b: number; closedPin: number }[];
}

export function isDigitalPassSwitch(elm: any): elm is DigitalPassSwitch {
    return elm != null && typeof elm.digitalPassPairs === "function";
}

/** Most inputs one group's resolver cell may have: each cell is a lookup table of 2^inputs bits,
 * and every node in the group gets one. */
const MAX_PASS_GROUP_INPUTS = 16;
/** Most inputs of one OR cell in orTree(). */
const OR_TREE_FANIN = 8;

// an output pin of a netlist chip; desc, when known, is that chip's description
type PinRef = { name: string; pin: number; desc?: ChipDesc[] };

/** ORs `sources` together through a tree of OR cells of at most OR_TREE_FANIN inputs (a single
 * source is returned as is), so a node with many drivers doesn't need one huge lookup table.
 * Every cell takes one tick, so two trees over the same number of sources have the same depth. */
function orTree(sources: PinRef[], name: () => string, extra: CircuitEntry[]): PinRef {
    let level = sources;
    while (level.length > 1) {
        const next: PinRef[] = [];
        for (let i = 0; i < level.length; i += OR_TREE_FANIN) {
            const group = level.slice(i, i + OR_TREE_FANIN);
            const n = group.length, outPin = n + 1, cell = name();
            const logic: ChipLogic = (pin) => {
                let r = 0;
                for (let k = 1; k <= n; k++) r |= pin[k];
                pin[outPin] = r;
            };
            const desc = [chipStart(logic).inputPins(...group.map((_, k) => k + 1)).outputPin(outPin)];
            extra.push(CHIP(cell, desc));
            group.forEach((src, k) => extra.push(CONNECTION(src.name, src.pin, cell, k + 1)));
            next.push({ name: cell, pin: outPin, desc });
        }
        level = next;
    }
    return level[0];
}

/** A one-tick buffer of `src` - see DigitalTriStateEnable for why the data needs it. */
function delayOneTick(src: PinRef, name: string, extra: CircuitEntry[]): PinRef {
    extra.push(CHIP(name, [chipStart((pin) => { pin[2] = pin[1]; }).inputPins(1).outputPin(2)]));
    extra.push(CONNECTION(src.name, src.pin, name, 1));
    return { name, pin: 2 };
}

/** One cell computing `logic` over `inputs` (pins 1..n, output n+1). */
function cellOf(inputs: PinRef[], logic: (v: number[]) => number, name: string, extra: CircuitEntry[]): PinRef {
    const n = inputs.length, outPin = n + 1;
    const desc = [chipStart((pin) => {
        const v = new Array<number>(n);
        for (let k = 0; k < n; k++) v[k] = pin[k + 1];
        pin[outPin] = logic(v);
    }).inputPins(...inputs.map((_, k) => k + 1)).outputPin(outPin)];
    extra.push(CHIP(name, desc));
    inputs.forEach((src, k) => extra.push(CONNECTION(src.name, src.pin, name, k + 1)));
    return { name, pin: outPin, desc };
}

/**
 * Implemented by a tri-state driver (with an exported enable - see DigitalTriStateEnable) that has
 * a drive strength: its on-resistance. When several enabled drivers share a node, only those with
 * the lowest resistance count, as in the analog simulator, where 0.1 ohm against 1000 ohm wins
 * outright - e.g. a cell's actively driven feedback against charge stored behind a pass buffer.
 * Drivers of equal resistance are ORed.
 */
export interface DigitalDriveStrength {
    digitalDriveResistance(postIndex: number): number;
}

function isDigitalDriveStrength(elm: any): elm is DigitalDriveStrength {
    return elm != null && typeof elm.digitalDriveResistance === "function";
}

const isTriCandidate = (c: DriverCandidate) => isDigitalTriStateDriver(c.elm) && c.elm.isTriStateOutput(c.postIndex);

/** Most strength levels mergeNodeDrivers() will prioritize on one node; beyond that it treats
 * every driver as one level (each level is two inputs of one cell). */
const MAX_STRENGTH_LEVELS = 7;
/** Most drivers per first-level cell in pullDown() (two inputs each). */
const PULL_DOWN_FANIN = 4;

/** One driver of a node: its output and, for a tri-state, its enable (null: always enabled). */
type Driver = { d: PinRef; en: PinRef | null };

/** Is `c` a tri-state whose enable is exported (see DigitalTriStateEnable)? Its enable pin, or null. */
function exportedEnable(c: DriverCandidate): number | null {
    return isTriCandidate(c) && isDigitalTriStateEnable(c.elm) ? c.elm.digitalTriStateEnablePin(c.postIndex) : null;
}

/**
 * Resolves contention among `drivers` by pulling down: the value is 1 when some driver drives 1
 * and no ENABLED driver drives 0 (a tri-state's output is already AND(enable, data), so 1 means
 * enabled and driving 1). Returns that value and, when `wantEnable`, the OR of the enables (null if
 * any driver is always enabled) at the same depth, so their relative timing (see
 * DigitalTriStateEnable) carries through. A single driver is returned as is.
 */
function pullDown(drivers: Driver[], wantEnable: boolean, cellName: () => string,
        extra: CircuitEntry[]): { value: PinRef; enable: PinRef | null } {
    const always = drivers.some(d => d.en == null);
    if (drivers.length === 1) return { value: drivers[0].d, enable: wantEnable ? drivers[0].en : null };
    const his: PinRef[] = [], los: PinRef[] = [], ens: PinRef[] = [];
    for (let i = 0; i < drivers.length; i += PULL_DOWN_FANIN) {
        const chunk = drivers.slice(i, i + PULL_DOWN_FANIN);
        const inputs: PinRef[] = [];
        const dIdx: number[] = [], eIdx: number[] = [];      // eIdx -1: always enabled
        for (const c of chunk) {
            dIdx.push(inputs.length); inputs.push(c.d);
            if (c.en) { eIdx.push(inputs.length); inputs.push(c.en); } else eIdx.push(-1);
        }
        const m = chunk.length;
        his.push(cellOf(inputs, (v) => {
            let r = 0;
            for (let k = 0; k < m; k++) r |= v[dIdx[k]];
            return r;
        }, cellName(), extra));
        los.push(cellOf(inputs, (v) => {
            let r = 0;
            for (let k = 0; k < m; k++) if ((eIdx[k] < 0 || v[eIdx[k]]) && !v[dIdx[k]]) r = 1;
            return r;
        }, cellName(), extra));
        if (wantEnable && !always) ens.push(cellOf(inputs, (v) => {
            let r = 0;
            for (let k = 0; k < m; k++) r |= v[eIdx[k]];
            return r;
        }, cellName(), extra));
    }
    const hi = orTree(his, cellName, extra), lo = orTree(los, cellName, extra);
    const value = cellOf([hi, lo], (v) => v[0] & (v[1] ^ 1), cellName(), extra);
    const enable = wantEnable && !always ? delayOneTick(orTree(ens, cellName, extra), cellName(), extra) : null;
    return { value, enable };
}

/**
 * Merges one node's drivers. Returns:
 *  - `data`: the merged value of every driver whose enable is known - ordinary always-on outputs
 *    and tri-states that export their enable (see DigitalTriStateEnable) - or null if none;
 *  - `enable`: when `wantEnable`, the OR of those drivers' enables (null if an always-on driver is
 *    among them, or not wanted);
 *  - `unknown`: the OR of the tri-states that don't export an enable (SRAM, ROM), or null. Their
 *    disabled 0 can't be told apart from a driven 0, so they can only be ORed in.
 *
 * Contention among the known drivers pulls the node down (see pullDown()). With several strength
 * levels (see DigitalDriveStrength) a priority cell picks the strongest level that's enabled and
 * only its drivers count; always-on drivers belong to the strongest level, which is then always
 * enabled.
 *
 * When there's an enable the data comes a tick later still, so "disabled" always reaches the
 * consumer before the data drops (see DigitalTriStateEnable).
 */
function mergeNodeDrivers(candidates: DriverCandidate[], wantEnable: boolean, cellName: () => string,
        extra: CircuitEntry[]): { data: PinRef | null; enable: PinRef | null; unknown: PinRef | null } {
    const plain: Driver[] = [], unknown: PinRef[] = [];
    const levels = new Map<number, Driver[]>();
    for (const c of candidates) {
        const d = { name: c.entry.name, pin: c.pin };
        if (!isTriCandidate(c)) { plain.push({ d, en: null }); continue; }
        const en = exportedEnable(c);
        if (en == null) { unknown.push(d); continue; }
        const r = isDigitalDriveStrength(c.elm) ? c.elm.digitalDriveResistance(c.postIndex) : 0;
        let level = levels.get(r);
        if (!level) levels.set(r, level = []);
        level.push({ d, en: { name: c.entry.name, pin: en } });
    }
    // strongest (lowest resistance) first
    let sorted = [...levels.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    if (sorted.length > MAX_STRENGTH_LEVELS) {
        console.log("digital wiring: too many drive strengths on one node; its drivers count as equal");
        sorted = [sorted.flat()];
    }
    if (plain.length) sorted = [[...plain, ...(sorted[0] ?? [])]];

    let data: PinRef | null = null, enable: PinRef | null = null;
    if (sorted.length === 1) {
        ({ value: data, enable } = pullDown(sorted[0], wantEnable, cellName, extra));
    } else if (sorted.length > 1) {
        // inputs v0 e0 v1 e1 ...: each level's value and enable, at the same depth
        const inputs = sorted.flatMap(l => {
            const m = pullDown(l, true, cellName, extra);
            return [m.value, m.enable!];
        });
        const nl = sorted.length;
        data = cellOf(inputs, (v) => {
            for (let k = 0; k < nl; k++) if (v[2 * k + 1]) return v[2 * k];
            return 0;
        }, cellName(), extra);
        if (wantEnable) enable = cellOf(inputs, (v) => {
            let r = 0;
            for (let k = 0; k < nl; k++) r |= v[2 * k + 1];
            return r;
        }, cellName(), extra);
    }
    if (data && enable) data = delayOneTick(data, cellName(), extra);
    return { data, enable, unknown: unknown.length ? orTree(unknown, cellName, extra) : null };
}

/**
 * Resolves the nodes whose value depends on more than their own drivers' outputs:
 *
 *  - nodes joined by pass switches (see DigitalPassSwitch), which form a group however the
 *    switches are set, and
 *  - a node holding charge (DigitalChargeStorage) driven by tri-state outputs, which keeps its
 *    last value while they're all disabled - a group of one.
 *
 * Each node's own drivers are first merged (see mergeNodeDrivers()) into its data and, unless an
 * ordinary always-on driver is among them, its enable (see DigitalTriStateEnable). Then every node
 * in a group gets a resolver cell fed by every node's data and enable and every switch's closed
 * signal: it finds the nodes reachable from its own through closed switches and ANDs the data of
 * those that are enabled (contention pulls down, as within one node) - so a change on either side
 * of a closed switch shows on the other, and opening it splits them again. When nothing reachable is enabled it reads 0, unless a reachable node holds charge:
 * then it reads the OR of those charged nodes' last values, so a stored bit can also be read out
 * through a closed switch. (Charge sharing is approximate: joining a charged 1 and a charged 0 with
 * nothing driving gives 1 on both.) A tri-state that doesn't export its enable (SRAM, ROM) can't
 * tell the node when it's off, so it's ORed into the result, and its node never holds.
 *
 * A group too big for MAX_PASS_GROUP_INPUTS is first split at its nodes with an always-on driver
 * (or ground), which then read only their own drivers. Returns each grouped node's resolver; a
 * group still too big is left out, with a warning, so its switches act open and its nodes don't
 * hold.
 */
function resolvePassGroups(synthMap: Map<any, SynthEntry>, candidatesByNode: Map<any, DriverCandidate[]>,
        extra: CircuitEntry[]): { byNode: Map<any, { entry: SynthEntry; pin: number }>; voltage: Map<any, number> } {
    const byNode = new Map<any, { entry: SynthEntry; pin: number }>();
    const voltage = new Map<any, number>();
    const isTri = (c: DriverCandidate) => isDigitalTriStateDriver(c.elm) && c.elm.isTriStateOutput(c.postIndex);

    // A ground node counts as driven by _GND when splitting a group (see below): GroundElm isn't
    // a tie source in general, but here it's what a DAC's bit switches, each choosing a reference
    // or ground, would otherwise all join through.
    const gndEntry: SynthEntry = { name: "_GND", desc: tieDesc(), pinMap: new Map([[0, TIE_OUT_PIN]]), isTie: true };
    const groundCandidates = (n: any): DriverCandidate[] => {
        const g = (n?.links ?? []).find((l: any) => l.elm?.isGroundElm?.());
        return g ? [{ entry: gndEntry, pin: TIE_OUT_PIN, postIndex: 0, elm: g.elm }] : [];
    };
    // a node with an ordinary (always-enabled) driver, or ground
    const hard = (n: any) => (candidatesByNode.get(n) ?? groundCandidates(n)).some(c => !isTri(c));

    type Pair = { na: any; nb: any; closed: PinRef };
    const pairs: Pair[] = [];
    for (const [elm, entry] of synthMap) {
        if (!isDigitalPassSwitch(elm)) continue;
        for (const p of elm.digitalPassPairs()) {
            const na = (elm as any).nodes?.[p.a], nb = (elm as any).nodes?.[p.b];
            if (na == null || nb == null || na === nb) continue;
            pairs.push({ na, nb, closed: { name: entry.name, pin: p.closedPin } });
        }
    }
    // charge-storing nodes with tri-state drivers, as groups of their own unless a switch joined them
    const charged: any[] = [];
    for (const [node, candidates] of candidatesByNode)
        if (candidates.some(isTri) && nodeHoldsCharge(node)) charged.push(node);

    type Group = { nodes: any[]; pairs: Pair[]; inner: Set<any> };
    // Union-find over the switches. A `boundary` node joins no group: it keeps reading its own
    // drivers, and only feeds the groups on its switches' other sides (listed after their own
    // nodes; not in `inner`).
    const buildGroups = (boundary: (n: any) => boolean): Group[] => {
        const parent = new Map<any, any>();
        const find = (n: any): any => {
            let r = n;
            while (parent.get(r) !== r) r = parent.get(r);
            parent.set(n, r);
            return r;
        };
        const add = (n: any) => { if (!parent.has(n)) parent.set(n, n); };
        const used: Pair[] = [];
        for (const p of pairs) {
            const ba = boundary(p.na), bb = boundary(p.nb);
            if (ba && bb) continue;
            if (!ba) add(p.na);
            if (!bb) add(p.nb);
            if (!ba && !bb) parent.set(find(p.na), find(p.nb));
            used.push(p);
        }
        for (const n of charged) if (!boundary(n)) add(n);
        const groups = new Map<any, Group>();
        for (const n of parent.keys()) {
            const r = find(n);
            if (!groups.has(r)) groups.set(r, { nodes: [], pairs: [], inner: new Set() });
            groups.get(r)!.nodes.push(n);
            groups.get(r)!.inner.add(n);
        }
        for (const p of used) {
            const inner = parent.has(p.na) ? p.na : p.nb, other = inner === p.na ? p.nb : p.na;
            const g = groups.get(find(inner))!;
            g.pairs.push(p);
            if (!parent.has(other) && !g.nodes.includes(other)) g.nodes.push(other);
        }
        return [...groups.values()];
    };

    // each node's drivers (none: nothing ever drives it), and how many resolver inputs its
    // merged drivers take (see mergeNodeDrivers()); ground only counts at a group's boundary
    const driversOf = (group: Group) => {
        const driven: { x: number; candidates: DriverCandidate[]; inputs: number }[] = [];
        for (const [x, node] of group.nodes.entries()) {
            const candidates = candidatesByNode.get(node) ?? (group.inner.has(node) ? [] : groundCandidates(node));
            if (candidates.length === 0) continue;
            const known = candidates.filter(c => !isTri(c) || exportedEnable(c) != null);
            const hasEnable = known.length > 0 && known.every(isTri);
            const hasUnknown = known.length < candidates.length;
            driven.push({ x, candidates, inputs: (known.length ? 1 : 0) + (hasEnable ? 1 : 0) + (hasUnknown ? 1 : 0) });
        }
        const caps = group.nodes.map((nd, i) => group.inner.has(nd) && nodeHoldsCharge(nd) ? i : -1).filter(i => i >= 0);
        const shared = driven.reduce((s, p) => s + p.inputs, 0) + group.pairs.length;
        return { driven, caps, shared, fits: shared + caps.length <= MAX_PASS_GROUP_INPUTS };
    };

    // Each group's resolver is a lookup table over all its inputs, so it can't be too big. A
    // group that is gets split at its hard nodes instead (a chain of dynamic latches, each
    // stage's gate output switched into the next stage's input, would otherwise be one group):
    // each such node then reads only its own drivers, so contention through a closed switch
    // between two always-on drivers isn't seen there. Groups that fit keep the full model.
    let groups = buildGroups(() => false);
    const tooBig = new Set<any>();
    for (const g of groups) if (!driversOf(g).fits) for (const n of g.nodes) tooBig.add(n);
    if (tooBig.size) groups = buildGroups(n => tooBig.has(n) && hard(n));

    let counter = 0, cells = 0;
    const cellName = () => "_pm" + cells++;
    for (const group of groups) {
        const n = group.nodes.length;
        const index = new Map(group.nodes.map((nd, i) => [nd, i]));
        let high = 5;

        const { driven, caps, shared, fits } = driversOf(group);
        for (const p of driven) for (const c of p.candidates) if (typeof c.elm.highVoltage === "number") high = c.elm.highVoltage;
        if (driven.length === 0) continue;
        if (!fits) {
            console.log("digital wiring: too many switches/drivers in one switch-connected group; its switches act open",
                `(nodes ${n}, switches ${group.pairs.length}, driven nodes ${driven.length}, caps ${caps.length})`);
            continue;
        }

        // each node's merged drivers (see mergeNodeDrivers())
        const merged: ReturnType<typeof mergeNodeDrivers>[] = new Array(n).fill(null);
        for (const p of driven) merged[p.x] = mergeNodeDrivers(p.candidates, true, cellName, extra);

        // One single-cell chip per node, so each has its own pin space. Input pins: each driven
        // node's data (+ enable) (+ unknown), each switch's closed signal, each OTHER charged node's resolver
        // output; then the output pin.
        const g = counter++;
        const nameOf = (x: number) => "_pass" + g + "_" + x;
        const pairIdx = group.pairs.map(p => [index.get(p.na)!, index.get(p.nb)!]);
        const outPinOf = (x: number) => shared + caps.filter(y => y !== x).length + 1;

        for (let x = 0; x < n; x++) {
            if (!group.inner.has(group.nodes[x])) continue; // boundary node: resolved by its own drivers
            const name = nameOf(x);
            let next = 1;
            const conns: [PinRef, number][] = [];
            // pin 0: absent
            const dPins = merged.map(m => {
                if (m == null) return null;
                let data = 0, en = 0, unk = 0;
                if (m.data) { data = next++; conns.push([m.data, data]); }
                if (m.enable) { en = next++; conns.push([m.enable, en]); }
                if (m.unknown) { unk = next++; conns.push([m.unknown, unk]); }
                return { data, en, unk };
            });
            const pPins = group.pairs.map(p => { conns.push([p.closed, next]); return next++; });
            const cPins = new Map<number, number>();
            for (const y of caps) if (y !== x) {
                conns.push([{ name: nameOf(y), pin: outPinOf(y) }, next]);
                cPins.set(y, next++);
            }
            const outPin = next;

            const logic: ChipLogic = (pin, prevPin) => {
                const reach = new Array<boolean>(n).fill(false);
                reach[x] = true;
                for (let changed = true; changed;) {
                    changed = false;
                    pairIdx.forEach(([a, b], k) => {
                        if (pin[pPins[k]] && reach[a] !== reach[b]) { reach[a] = reach[b] = true; changed = true; }
                    });
                }
                // contention among the enabled nodes pulls down; unknown drivers are ORed in
                let all = 1, enabled = 0, forced = 0, or = 0;
                dPins.forEach((d, k) => {
                    if (d == null || !reach[k]) return;
                    if (d.data && (d.en ? pin[d.en] : 1)) { enabled = 1; all &= pin[d.data]; }
                    if (d.unk) { forced = 1; or |= pin[d.unk]; }
                });
                let data = (enabled ? all : 0) | or;
                if (!enabled && !forced)
                    for (const y of caps)
                        if (reach[y]) data |= y === x ? prevPin[outPin] : pin[cPins.get(y)!];
                pin[outPin] = data;
            };
            const cell = chipStart(logic).inputPins(...Array.from({ length: outPin - 1 }, (_, i) => i + 1)).outputPin(outPin);
            if (caps.includes(x)) cell.prevOutputPin(outPin);
            const desc: ChipDesc[] = [cell];
            extra.push(CHIP(name, desc));
            for (const [src, inPin] of conns) extra.push(CONNECTION(src.name, src.pin, name, inPin));

            const node = group.nodes[x];
            byNode.set(node, { entry: { name, desc, pinMap: new Map(), isTie: false }, pin: outPin });
            voltage.set(node, high);
        }
    }
    return { byNode, voltage };
}

/**
 * Resolves every node that has at least one digital-output candidate down to a single
 * (entry, pin) that actually drives it, plus any extra CircuitEntry[] needed to make that true.
 * A node with exactly one candidate resolves to it directly, same as before. A node with two or
 * more candidates that are NOT tri-state outputs (see DigitalTriStateDriver above) is a genuine
 * wiring conflict - same "multiple drivers, pick the first and warn" fallback as before. Any other
 * shared node (tri-state outputs, plus at most one ordinary driver - e.g. a logic input on a bus
 * that tri-state buffers also drive) gets synthesized glue cells (see mergeNodeDrivers()): the
 * enabled driver wins, and when several are enabled any one driving 0 pulls the node down (the
 * ordinary driver counting as always enabled). That glue becomes the driver every other input
 * sharing this node resolves to.
 */
function resolveNodeDrivers(synthMap: Map<any, SynthEntry>): {
    byNode: Map<any, { entry: SynthEntry; pin: number }>;
    extra: CircuitEntry[];
    passVoltage: Map<any, number>;
} {
    const candidatesByNode = collectOutputsByNode(synthMap);
    const byNode = new Map<any, { entry: SynthEntry; pin: number }>();
    const extra: CircuitEntry[] = [];
    let trisCounter = 0;
    const pass = resolvePassGroups(synthMap, candidatesByNode, extra);
    for (const [node, resolved] of pass.byNode) byNode.set(node, resolved);

    for (const [node, candidates] of candidatesByNode) {
        let resolved: { entry: SynthEntry; pin: number };
        const grouped = pass.byNode.get(node);
        if (grouped) {
            resolved = grouped;
            wireReadbacks(candidates, resolved, extra);
            continue;
        }

        const isTri = (c: DriverCandidate) => isDigitalTriStateDriver(c.elm) && c.elm.isTriStateOutput(c.postIndex);
        const plainDrivers = candidates.filter(c => !isTri(c)).length;
        if (candidates.length === 1) {
            resolved = { entry: candidates[0].entry, pin: candidates[0].pin };
        } else if (plainDrivers > 1) {
            console.log("digital wiring: multiple drivers for a shared node");
            resolved = { entry: candidates[0].entry, pin: candidates[0].pin };
        } else {
            const cellName = () => "_tris" + trisCounter++;
            const m = mergeNodeDrivers(candidates, false, cellName, extra);
            let out = m.data && m.unknown ? orTree([m.data, m.unknown], cellName, extra) : (m.data ?? m.unknown)!;
            if (!out.desc) out = cellOf([out], (v) => v[0], cellName(), extra);
            resolved = { entry: { name: out.name, desc: out.desc!, pinMap: new Map([[0, out.pin]]), isTie: false }, pin: out.pin };
        }

        byNode.set(node, resolved);
        wireReadbacks(candidates, resolved, extra);
    }

    return { byNode, extra, passVoltage: pass.voltage };
}

/** Wires a node's fully resolved value into any candidate's own readback pin (see
 * DigitalTriStateReadback's own docstring) - deliberately every candidate, not just the one(s)
 * that lost the merge: a bidirectional driver still needs to observe the bus even while IT'S the
 * one actively driving it (SRAM reading back its own just-written value is harmless - the
 * resolved value equals its own contribution whenever it's the sole or winning driver). */
function wireReadbacks(candidates: DriverCandidate[], resolved: { entry: SynthEntry; pin: number },
        extra: CircuitEntry[]): void {
    for (const c of candidates) {
        if (!isDigitalTriStateReadback(c.elm)) continue;
        const readbackPin = c.elm.digitalTriStateReadbackPin(c.postIndex);
        if (readbackPin != null) extra.push(CONNECTION(resolved.entry.name, resolved.pin, c.entry.name, readbackPin));
    }
}

/** Synthesizes every digital-capable element in `elmList`, checking digitalTie() before
 * digitalSynthesis() (see DigitalTieSource above) - either produces a SynthEntry, or the element
 * is simply left out (not digital-capable at all, or not right now). */
function synthesizeAll(elmList: any[]): Map<any, SynthEntry> {
    const synthMap = new Map<any, SynthEntry>();
    let counter = 0;
    for (const elm of elmList) {
        if (isDigitalTieSource(elm)) {
            const tie = elm.digitalTie();
            if (tie != null) {
                synthMap.set(elm, {
                    name: tie === "VCC" ? "_VCC" : "_GND",
                    desc: tieDesc(),
                    pinMap: new Map([[0, TIE_OUT_PIN]]),
                    isTie: true,
                });
                continue;
            }
        }
        if (isDigitalSynthesizable(elm)) {
            const synth = elm.digitalSynthesis();
            if (synth != null)
                synthMap.set(elm, { name: "e" + counter++, desc: synth.desc, pinMap: synth.pinMap, isTie: false,
                    queueSize: synth.queueSize, optimizationDisabled: synth.optimizationDisabled });
        }
    }
    return synthMap;
}

/**
 * Assembles a dice-ts CircuitDesc from `synthMap`: one ChipInstanceEntry per non-tie element
 * (under a name unique to this build) plus one ConnectionEntry per input post that has a
 * driver. A missing driver is simply omitted - Circuit's own constructor already grounds any
 * unconnected input pin to GND (see circuit.ts), so there's no need to fabricate a
 * DigitalConst-equivalent here the way the old wireDigitalCircuit() had to. Takes `resolved`
 * (see resolveNodeDrivers() above) rather than recomputing it, so buildDigitalCircuit() below can
 * reuse the very same byNode map to build triStateChipByNode afterward instead of resolving each
 * node's driver twice.
 */
function layoutFromSynth(synthMap: Map<any, SynthEntry>,
        resolved: { byNode: Map<any, { entry: SynthEntry; pin: number }>; extra: CircuitEntry[] }): CircuitDesc {
    const entries: CircuitEntry[] = [];
    for (const entry of synthMap.values()) {
        if (entry.isTie) continue;
        entries.push(CHIP(entry.name, entry.desc));
        if (entry.queueSize) entries.push(OPTIMIZATION_HINT(entry.name, entry.queueSize, SUBCYCLE_SIZE));
    }

    entries.push(...resolved.extra);

    for (const [elm, entry] of synthMap) {
        for (const [postIndex, pin] of entry.pinMap) {
            if (isOutputPin(entry.desc, pin)) continue; // only inputs need a driving connection
            const node = elm.nodes?.[postIndex];
            const driver = node != null ? resolved.byNode.get(node) : undefined;
            if (driver) entries.push(CONNECTION(driver.entry.name, driver.pin, entry.name, pin));
        }
    }

    return circuitLayout(entries);
}

/**
 * Pure data in, data out (no Circuit/Chip construction) - kept separate from
 * buildDigitalCircuit() below so the connection-resolution algorithm itself is testable without
 * running the engine.
 */
export function buildCircuitDesc(elmList: any[]): CircuitDesc {
    const synthMap = synthesizeAll(elmList);
    return layoutFromSynth(synthMap, resolveNodeDrivers(synthMap));
}

/** The netlist buildDigitalCircuit() would build, as plain data (see netlist.ts), including
 * the seedInitialDigitalState() values - for replaying a real circuit outside the app
 * (scripts/bench-wasm.ts), or for building it on the WASM engine. Each chip is labeled with its
 * element's class and, where it has one, name (`ExtVoltageElm:SERVE`). Custom cells with no
 * native kind are only allowed when `jsCells` is given (see serializeCircuitDesc()). */
export function serializeDigitalCircuit(elmList: any[], jsCells?: CustomLogic[]): SerialDesc {
    const synthMap = synthesizeAll(elmList);
    const desc = layoutFromSynth(synthMap, resolveNodeDrivers(synthMap));
    const labels = new Map<string, string>();
    const optDisabled = new Set<string>();
    for (const [elm, entry] of synthMap) {
        if (entry.isTie) continue;
        const cls = elm.getClassName?.() ?? "";
        const name = typeof elm.getName === "function" ? elm.getName() : undefined;
        labels.set(entry.name, name !== undefined ? `${cls}:${name}` : cls);
        if (entry.optimizationDisabled) optDisabled.add(entry.name);
    }
    const sd = serializeCircuitDesc(desc, labels, optDisabled, jsCells);
    // Resolved the way digitalChipForPin() resolves them: the cell whose outPin is `pin`.
    const seeds: [string, number, number][] = [];
    for (const { chip, value } of initialStateEntries(elmList, (elm, pin) => {
        const entry = synthMap.get(elm);
        if (!entry || entry.isTie) return null;
        const idx = entry.desc.findIndex(d => d.outPin === pin);
        return idx < 0 ? null : [entry.name, idx] as [string, number];
    })) if (chip) seeds.push([chip[0], chip[1], value]);
    if (seeds.length) sd.seeds = seeds;
    return sd;
}

/** A built circuit, on either engine (the type parameters narrow it for code that knows which). */
export interface DigitalGraph<C extends EngineChip = EngineChip, K extends EngineCircuit = EngineCircuit> {
    circuit: K;
    /** The same circuit when it runs on the WASM engine, else null. Freed by
     * disposeDigitalGraph(). */
    wasm: WasmCircuit | null;
    /** The WASM circuit's SRAMs (see SramMemory.syncFromEngine). */
    srams: SramMemory[];
    /** Every digital-capable element's own Chip(s), for whoever built this graph to read
     * output/history from or push a live external change into (e.g. LogicInputElm.toggle() -
     * see its own digitalSynthesis()). A tie source's entry is the shared `_VCC`/`_GND` chip
     * (circuit.chips[0]/[1] - see circuit.ts's createSpecialChips(), never pruned since both are
     * CUSTOM_CHIP), same object for every element tied to that rail. Absent for any element
     * digitalSynthesis()/digitalTie() didn't produce a netlist entry for. */
    chipsByElm: Map<any, C[]>;
    /** The real Chip that actually determines a shared node's resolved value, keyed by the
     * CircuitNode object itself - populated for every node resolveNodeDrivers() saw at least one
     * digital-output candidate for, whether or not that node ended up merged. Needed because a
     * tri-state output post's OWN chip (what chipsByElm would otherwise resolve to) only reflects
     * that ONE element's own AND(enable, data) contribution, not the real bus value once merged
     * with the rest of a shared tri-state node (see DigitalTriStateDriver's own docstring) -
     * anything writing a tri-state post's value back to a real CircuitNode (syncDigitalToNodesNew
     * below; digitalScopeSourceNew/digitalStateTextForOutput similarly) must resolve through here
     * instead, or it silently shows whichever driver's own element happens to run last/first
     * rather than the actual merged bus value. */
    triStateChipByNode: Map<any, C>;
    /** Every node in a switch-connected group (see resolvePassGroups()) with the high voltage to
     * show: syncDigitalToNodesNew() writes these directly, since such a node may have no output
     * post of its own (just the switch and a consumer). */
    passNodeVoltage: Map<any, number>;
}

/** Full netlist build for a freshly-stamped circuit: synthesize + wire every digital-capable
 * element and construct the circuit that runs them, on `engine` (the WASM one needs
 * loadWasmEngine() to have finished). Must run after the node list and wire closure are built
 * (SimulationManager.makeNodeList()/calcWireInfo()), mirroring CircuitWiring.wireDigitalCircuit()'s
 * own precondition. */
export function buildDigitalGraph(elmList: any[], engine: EngineName): DigitalGraph {
    return engine === "wasm" ? buildWasmDigitalCircuit(elmList) : buildDigitalCircuit(elmList);
}

/** buildDigitalGraph() on the TypeScript engine. */
export function buildDigitalCircuit(elmList: any[]): DigitalGraph<Chip, Circuit> {
    const synthMap = synthesizeAll(elmList);
    const resolved = resolveNodeDrivers(synthMap);
    const circuit = new Circuit(layoutFromSynth(synthMap, resolved));

    // circuit.chips[0]/[1] are the shared _VCC/_GND sentinels (see circuit.ts) - they have no
    // debugName of their own (only createChip()-built instances do), so ties are special-cased
    // rather than looked up by name below.
    const byName = new Map<string, Chip[]>();
    for (const chip of circuit.chips) {
        if (!chip.debugName) continue;
        const list = byName.get(chip.debugName);
        if (list) list.push(chip); else byName.set(chip.debugName, [chip]);
    }

    const chipsByElm = new Map<any, Chip[]>();
    for (const [elm, entry] of synthMap) {
        if (entry.isTie) chipsByElm.set(elm, [entry.name === "_VCC" ? circuit.chips[0] : circuit.chips[1]]);
        else chipsByElm.set(elm, byName.get(entry.name) ?? []); // empty: pruned as dead code (see circuit.ts)
        // Safe here, before the circuit has run: every chip is still PASSIVE - the same point the
        // global option sets it at (SimulationManager.initDigitalCircuit()).
        if (entry.optimizationDisabled)
            for (const chip of chipsByElm.get(elm)!) chip.optimizationDisabled = true;
    }

    return { circuit, wasm: null, srams: [], chipsByElm, triStateChipByNode: triStateChips(resolved, byName), passNodeVoltage: resolved.passVoltage };
}

/** buildDigitalGraph() on the WASM engine: the same CircuitDesc, serialized and flattened (see
 * netlist.ts). Custom cells with no native kind (StopTriggerElm's) run as JS callbacks. */
function buildWasmDigitalCircuit(elmList: any[]): DigitalGraph<WasmChip, WasmCircuit> {
    const synthMap = synthesizeAll(elmList);
    const resolved = resolveNodeDrivers(synthMap);
    const optDisabled = new Set<string>();
    for (const entry of synthMap.values()) if (entry.optimizationDisabled) optDisabled.add(entry.name);
    const jsCells: CustomLogic[] = [];
    const srams: SramMemory[] = [];
    const net = flattenNetlist(serializeCircuitDesc(layoutFromSynth(synthMap, resolved), undefined, optDisabled, jsCells, srams));
    const circuit = new WasmCircuit(net, jsCells);
    srams.forEach((mem, id) => {
        const size = 1 << net.srams[id].addrBits;
        mem.syncFromEngine = () => {
            for (let a = 0; a < size; a++) {
                const v = circuit.sramRead(id, a);
                if (v !== mem.read(a)) mem.write(a, v);
            }
        };
    });

    const byName = new Map<string, WasmChip[]>();
    for (const [name, cells] of net.chipCells) byName.set(name, cells.map(i => circuit.chip(i)));
    const chipsByElm = new Map<any, WasmChip[]>();
    for (const [elm, entry] of synthMap) {
        if (entry.isTie) chipsByElm.set(elm, [circuit.chip(entry.name === "_VCC" ? 0 : 1)]);
        else chipsByElm.set(elm, byName.get(entry.name) ?? []);
    }

    return { circuit, wasm: circuit, srams, chipsByElm, triStateChipByNode: triStateChips(resolved, byName), passNodeVoltage: resolved.passVoltage };
}

function triStateChips<C>(resolved: ReturnType<typeof resolveNodeDrivers>, byName: Map<string, C[]>): Map<any, C> {
    const triStateChipByNode = new Map<any, C>();
    for (const [node, driver] of resolved.byNode) {
        // Index by driver.pin's OWN cell, not [0] - an entry with several output cells (a
        // multi-bit TriStateElm bus, ROMElm's per-bit driver cells, ...) would otherwise resolve
        // every one of its nodes to its FIRST cell regardless of which bit actually drives that
        // particular node.
        const idx = driver.entry.desc.findIndex(d => d.outPin === driver.pin);
        const chip = idx >= 0 ? byName.get(driver.entry.name)?.[idx] : undefined;
        if (chip) triStateChipByNode.set(node, chip);
    }
    return triStateChipByNode;
}

/** Pushes the current values of `elm`'s live native-cell parameters (a monostable's period and
 * retrigger flag) into the running WASM circuit, after the element changed them without a
 * rebuild. The TS engine reads them through the cells' closures, so needs nothing. The
 * parameter slots are netlist.ts's flattenNetlist() layout. */
export function refreshNativeParams(elm: any): void {
    if (!currentGraph?.wasm || !isDigitalSynthesizable(elm)) return;
    const chips = currentGraph.chipsByElm.get(elm) as WasmChip[] | undefined;
    const synth = elm.digitalSynthesis();
    if (!chips || synth == null) return;
    synth.desc.forEach((d: ChipDesc, k: number) => {
        const n = d.native;
        if (n?.kind !== "monoQ" && n?.kind !== "monoExp") return;
        chips[k].setParam(2, n.fallDelay());
        if (n.kind === "monoQ") chips[k].setParam(3, n.retriggerable() ? 1 : 0);
    });
}

/** Frees a graph's WASM circuit, first copying its SRAM contents back to their elements. */
export function disposeDigitalGraph(graph: DigitalGraph): void {
    if (!graph.wasm) return;
    for (const mem of graph.srams) {
        mem.syncFromEngine?.();
        mem.syncFromEngine = null;
    }
    graph.wasm.dispose();
}

// --- Phase 5 (see noble-stirring-rabin.md): sync/scope-source helpers against the built
// DigitalGraph, replacing digital/CircuitWiring.ts's isGateLike()/isChipLike()/
// isRailSourceLike()/syncDigitalToNodes()/digitalScopeSource()/digitalStateText()/
// digitalStateSummary(). Those all duck-typed on the OLD engine's DigitalElmInstance/GroupPin
// shape (an element's inputCount/digitalPins/pins array); here every digital-capable element -
// gate, chip, tie, or CUSTOM_CHIP source - resolves the exact same way, through its own
// digitalSynthesis()/digitalTie() plus chipsByElm, so none of that per-shape special-casing is
// needed anymore.

/** Every real post of `elm` that's a digital OUTPUT, in ascending post-index order - which by
 * construction (every digitalSynthesis() implementation maps postIndex -> pin i+1 uniformly, one
 * pin per real post - see e.g. DFlipFlopElm.digitalSynthesis()) is exactly the same order
 * elm.pins[] itself lists them in, without needing to consult elm.pins at all. A DC/GND tie is a
 * single output at post 0 (mirrors TIE_OUT_PIN's own convention above). Empty for anything not
 * digital-capable right now (see DigitalSynthesis's own "null return" docstring). */
export function digitalOutputPosts(elm: any): number[] {
    if (isDigitalTieSource(elm) && elm.digitalTie() != null) return [0];
    if (!isDigitalSynthesizable(elm)) return [];
    const synth = elm.digitalSynthesis();
    if (synth == null) return [];
    const { pinMap, desc } = synth;
    return [...pinMap.entries()]
        .filter(([, pin]) => isOutputPin(desc, pin))
        .sort((a, b) => a[0] - b[0])
        .map(([post]) => post);
}

/** The real, already-built Chip that post `postIndex` of `elm` corresponds to (must be one of
 * `elm`'s own OUTPUT posts - an input post has no chip of its own to resolve to, same as the old
 * engine's isDigitalOutputPost() gate). Same resolution the `chipAt()` test helper in
 * DigitalSynthesisPhase3.test.ts uses ad hoc, promoted to a real export here: `desc`/`pinMap`
 * tell us which cell (index into chipsByElm.get(elm)) owns that pin, since createChip() builds
 * one real Chip per desc[] entry in array order (see circuit.ts's CircuitBuilder.createChip()) -
 * the same order chipsByElm's own build loop above preserves. */
export function digitalOutputChip<C extends EngineChip>(elm: any, postIndex: number, chipsByElm: Map<any, C[]>): C | null {
    if (isDigitalTieSource(elm) && elm.digitalTie() != null)
        return postIndex === 0 ? (chipsByElm.get(elm)?.[0] ?? null) : null;
    const pin = digitalOutputPin(elm, postIndex);
    if (pin == null) return null;
    return digitalChipForPin(elm, pin, chipsByElm);
}

/** Resolves `postIndex` to whichever Chip actually determines this post's live value - ordinarily
 * just digitalOutputChip() above, but for a tri-state-marked output post (see
 * DigitalTriStateDriver), prefers the resolved bus driver recorded in graph.triStateChipByNode:
 * this element's OWN chip only reflects its own AND(enable, data) contribution, not the real
 * merged value once other drivers share the same node (see triStateChipByNode's own docstring on
 * DigitalGraph). Anything writing/reading a tri-state post's value against a live graph -
 * syncDigitalToNodesNew, digitalScopeSourceNew, digitalStateTextForOutput below - needs this
 * instead of digitalOutputChip() directly, or it silently shows whichever driver on the shared
 * node happens to resolve last rather than the actual bus value. */
export function digitalOutputChipResolved<C extends EngineChip>(elm: any, postIndex: number, graph: DigitalGraph<C, EngineCircuit>): C | null {
    // Any output post, not just tri-state-marked ones: an ordinary driver can share a merged node
    // too (see resolveNodeDrivers()). For an unshared node this is just the post's own cell.
    const node = (elm as any).nodes?.[postIndex];
    const chip = node != null ? graph.triStateChipByNode.get(node) : undefined;
    if (chip) return chip;
    return digitalOutputChip(elm, postIndex, graph.chipsByElm);
}

/** The internal pin number (as used in `elm`'s own digitalSynthesis() ChipDesc) that post
 * `postIndex` maps to - what seedInitialDigitalState() below needs a stateful element's own
 * output-post-is-the-state-cell case (e.g. CounterElm, where the post's pin IS its state cell -
 * see digitalSynthesisWholeRegister()) to name via DigitalInitialState, without that element
 * needing to know its own internal pin numbering. */
export function digitalOutputPin(elm: any, postIndex: number): number | null {
    if (!isDigitalSynthesizable(elm)) return null;
    const synth = elm.digitalSynthesis();
    if (synth == null) return null;
    return synth.pinMap.get(postIndex) ?? null;
}

/** The real, already-built Chip whose desc entry's own `outPin` is `pin` - `pin` here is an
 * INTERNAL pin number exactly as used in `elm`'s own digitalSynthesis() ChipDesc, not a post
 * index/pinMap value (digitalOutputChip() above resolves those first, then delegates here). Lets
 * seedInitialDigitalState() below reach a state cell that has no externally-visible post of its
 * own - e.g. JKFlipFlopElm's master cell, which outputs onto an internal-only pin later buffered
 * out to the real Q/notQ posts by separate, memoryless cells (see
 * JKFlipFlopElm.digitalSynthesis()'s own docstring). */
function digitalChipForPin<C extends EngineChip>(elm: any, pin: number, chipsByElm: Map<any, C[]>): C | null {
    if (!isDigitalSynthesizable(elm)) return null;
    const synth = elm.digitalSynthesis();
    if (synth == null) return null;
    const idx = synth.desc.findIndex(d => d.outPin === pin);
    if (idx < 0) return null;
    return chipsByElm.get(elm)?.[idx] ?? null;
}

/** The Chip for `elm`'s `outputIndex`-th output post (0 = its first output post in ascending
 * post-index order, per digitalOutputPosts() above) - what a getInfo() panel iterating "the k-th
 * output pin" (the old engine's `digitalPins[k]` convention - see e.g.
 * CounterElm.getInfo()/DFlipFlopElm.getInfo()) needs instead. For a single-output element (a
 * gate, a rail, a delay buffer, ...) outputIndex is always 0. */
export function digitalOutputChipAt<C extends EngineChip>(elm: any, outputIndex: number, chipsByElm: Map<any, C[]>): C | null {
    const post = digitalOutputPosts(elm)[outputIndex];
    return post === undefined ? null : digitalOutputChip(elm, post, chipsByElm);
}

/** Implemented by an element whose undumpXml()-restored state needs seeding onto specific digital
 * chip(s) right after the FIRST digital build following a circuit load - e.g. CounterElm
 * restoring its saved running count, or JKFlipFlopElm restoring its saved Q - instead of every
 * such element silently restarting from 0/false. Called once per build by
 * seedInitialDigitalState() below. Each entry names an INTERNAL pin number exactly as used in
 * that element's own digitalSynthesis() ChipDesc - for an element whose externally-visible output
 * post's own chip IS the state cell (e.g. CounterElm - see digitalSynthesisWholeRegister()),
 * that's just digitalOutputPin(elm, post); for one where the post is instead driven by a separate
 * downstream buffer cell with no memory of its own (e.g. JKFlipFlopElm's Q, buffered from its
 * master cell - see its own digitalSynthesis() docstring), it's whichever internal pin the master
 * cell itself outputs onto - and the value to seed that cell to. A `null` return means nothing to
 * seed right now. */
export interface DigitalInitialState {
    digitalInitialState(): { pin: number, value: number }[] | null;
}

export function isDigitalInitialStateSource(elm: any): elm is DigitalInitialState {
    return elm != null && typeof elm.digitalInitialState === "function";
}

/** Applies every element's digitalInitialState() (see above) against the just-built `chipsByElm`
 * - called once from SimulationManager.initDigitalCircuit() right after a build, before the
 * circuit has processed a single real tick.
 *
 * Sets a PASSIVE chip's `output`/`prevOutputPin` feedback bit directly rather than scheduling a
 * same-tick self-toggle event the way LogicInputElm.pushDigitalValue() does for a LIVE external
 * change: a multi-cell element (a CounterElm's own bit-cells, wired to read each OTHER's current
 * value - see digitalSynthesisWholeRegister()) needs every one of its own cells seeded together,
 * atomically, in one pass. Scheduling them as SEPARATE queued events instead (tried first - see
 * git history) lets one seeded cell's own cascade reach a SIBLING cell before that sibling's own
 * queued seed event has fired; since the sibling's cascaded recompute (using its still-cold,
 * not-yet-seeded value) can spuriously match its current (also still-cold) output, Chip.
 * updateInputs()'s own "input changed back to already-matching output -> cancel the pending
 * event" branch fires and silently drops that sibling's seed before it ever takes effect.
 * A direct field write sidesteps this - there is no event to cancel.
 *
 * This is safe here in a way it is NOT for carrying live state across an edit mid-simulation
 * (that is seedCarriedValues()'s job, which has to be more careful): every chip this ever runs against has never
 * processed a single real event, so there is no pre-existing bookkeeping (inputEventTable/
 * outputEvents/activeInputs/...) for a raw field write to fall out of sync with - it's simply
 * choosing a different cold-start value than all-zero, the same class of thing Circuit's own
 * constructor already does when a source's digitalSynthesis() customUpdate seeds a non-zero
 * value (see e.g. LogicInputElm.pushDigitalValue() called from Chip.initialize()).
 *
 * Every other chip a seeded chip's output is actually WIRED to - via Chip.connect()'s own
 * outputLinks/mask, not just the self-referential prevOutputPin bit above - also needs its
 * `.inputs` bit corrected to match: a multi-cell whole-register element's own sibling cells read
 * each OTHER's current value through real inPins (see digitalSynthesisWholeRegister()), not only
 * their own memory bit, so leaving a sibling's "what does cell W currently show" bit at its cold
 * 0 default - even though cell W itself just got seeded to 1 - corrupts that sibling's very next
 * real recompute (it reconstructs the whole register's value from these bits). This applies to
 * EVERY outputLink a seeded chip has, whether the receiving chip is itself being seeded (a
 * sibling) or is a genuinely external, still-cold consumer - direct field writes don't cascade on
 * their own the way a real event does, so nothing else will ever correct this bit for either
 * kind of receiver. A sibling's own `output` is left exactly as externally specified though -
 * only a genuinely external (non-seeded) receiver gets Chip.initialize() called on it afterward,
 * to derive (and cascade) ITS OWN combinational value from the now-corrected inputs; calling
 * initialize() on a sibling would instead overwrite its externally-specified seed value with
 * whatever combinational logic recomputes from current inputs, which is not the same value in
 * general (a whole-register cell's "value" only equals prevPin[out] verbatim absent a clock
 * edge - see digitalSynthesisWholeRegister()'s own logic - so this is not a redundant no-op). */
export function seedInitialDigitalState(elmList: any[], chipsByElm: Map<any, Chip[]>): void {
    seedChipValues(initialStateEntries(elmList, (elm, pin) => digitalChipForPin(elm, pin, chipsByElm)));
}

/** seedInitialDigitalState() on either engine, plus - when `carried` is given - the state of
 * the graph this one replaces (see DigitalStateSnapshot). */
export function seedDigitalGraph(elmList: any[], graph: DigitalGraph, carried?: DigitalStateSnapshot | null): void {
    const carry = carried ? carriedStateEntries(graph, carried) : [];
    if (graph.wasm) {
        const chipsByElm = graph.chipsByElm as Map<any, WasmChip[]>;
        graph.wasm.seed(initialStateEntries(elmList, (elm, pin) => digitalChipForPin(elm, pin, chipsByElm)?.index ?? null));
        graph.wasm.seedCarried(carry.map(e => ({ chip: (e.chip as WasmChip).index, value: e.value })));
    } else {
        seedInitialDigitalState(elmList, graph.chipsByElm as Map<any, Chip[]>);
        seedCarriedValues(carry as { chip: Chip; value: number }[]);
    }
}

/**
 * The live state of a digital graph, saved just before a rebuild (any edit restamps the circuit
 * and rebuilds the graph from scratch - SimulationManager.initDigitalCircuit()) so the new graph
 * can carry it on instead of cold-starting. Without this, adding even an unconnected element
 * scrambles every cross-coupled gate latch and charge-storing node in the circuit - only the few
 * elements with a digitalInitialState() would keep their state.
 *
 * Only LUT cells are saved (CUSTOM_CHIP cells - sources, clocks, SRAM - own internal state of their
 * own that a raw output write would contradict), and none belonging to an element with its own
 * digitalInitialState(), which already re-derives its state. Keyed by things that survive a
 * rebuild: an element's cells by the element object, in netlist order (skipped if the element now
 * synthesizes a different number of cells), and a node's resolved driver (a tri-state bus's merge
 * cell, a pass-switch group's or charge-storing node's resolver - cells that belong to no element)
 * by every (element, post) on that node, since the CircuitNode objects themselves are new.
 */
export interface DigitalStateSnapshot {
    byElm: Map<any, (number | null)[]>;
    byPost: Map<any, Map<number, number>>;
}

/** The chips snapshotDigitalState() saves (see DigitalStateSnapshot's docstring), as a filter. */
function carriedChipFilter(graph: DigitalGraph): (chip: EngineChip) => boolean {
    const own = new Set<EngineChip>();
    for (const [elm, chips] of graph.chipsByElm)
        if (isDigitalInitialStateSource(elm)) for (const c of chips) own.add(c);
    return (chip) => chip.type !== ChipType.CUSTOM_CHIP && !own.has(chip);
}

/** See DigitalStateSnapshot. */
export function snapshotDigitalState(graph: DigitalGraph): DigitalStateSnapshot {
    const isCarriedChip = carriedChipFilter(graph);
    const byElm = new Map<any, (number | null)[]>();
    for (const [elm, chips] of graph.chipsByElm) {
        if (!chips.some(isCarriedChip)) continue;
        byElm.set(elm, chips.map(c => isCarriedChip(c) ? c.currentValue() : null));
    }
    const byPost = new Map<any, Map<number, number>>();
    for (const [node, chip] of graph.triStateChipByNode) {
        if (!isCarriedChip(chip)) continue;
        const value = chip.currentValue();
        for (const link of node.links ?? []) {
            let posts = byPost.get(link.elm);
            if (!posts) byPost.set(link.elm, posts = new Map());
            posts.set(link.num, value);
        }
    }
    return { byElm, byPost };
}

/**
 * Implemented by an element whose saved simulation state (dumpXmlState()) says what its part of
 * the digital circuit was doing, so a circuit loaded from a file - or restored by undo - picks up
 * where it was saved instead of cold-starting. Returns that state once, the first time a digital
 * build asks after the element was loaded (null after that, or after a Reset): `chips`, its cells'
 * values in netlist order (null for one it can't say), and/or `posts`, the values of the nodes on
 * its posts. GateElm gives its output ("o"); CapacitorElm the charge it holds ("vd"), which is
 * what a charge-storing node remembers. Counters and flip-flops already do this through
 * digitalInitialState().
 */
export interface DigitalLoadedState {
    takeDigitalLoadedState(): { chips?: (number | null)[]; posts?: Map<number, number> } | null;
}

/** Collects the loaded state of `elmList`'s elements (see DigitalLoadedState) into `into` - for
 * each element or post it doesn't already have a value for - or into a new snapshot, returned;
 * null if there was none. */
export function takeLoadedDigitalState(elmList: any[], into: DigitalStateSnapshot | null): DigitalStateSnapshot | null {
    let snap = into;
    for (const elm of elmList) {
        if (typeof elm?.takeDigitalLoadedState !== "function") continue;
        const loaded = (elm as DigitalLoadedState).takeDigitalLoadedState();
        if (!loaded) continue;
        snap ??= { byElm: new Map(), byPost: new Map() };
        if (loaded.chips && !snap.byElm.has(elm)) snap.byElm.set(elm, loaded.chips);
        if (loaded.posts) {
            let posts = snap.byPost.get(elm);
            if (!posts) snap.byPost.set(elm, posts = new Map());
            for (const [p, v] of loaded.posts) if (!posts.has(p)) posts.set(p, v);
        }
    }
    return snap;
}

/**
 * Writes carried values (see DigitalStateSnapshot) into a freshly built graph's PASSIVE chips.
 * Unlike seedChipValues(), it never lets a carried chip be recomputed with zero delay. The
 * snapshot is a running circuit caught mid-flight, so its values don't all agree with each other
 * (a clock edge has just landed, or the rebuilt clock rail starts on the other side of one).
 * Settling that through Chip.initialize() pushes every edge through the whole circuit in one
 * instant: two-phase logic races, and a latch that flips the wrong way stays flipped. Instead:
 *
 *  1. write every carried output, and fix every consumer's input bits to match - first cancelling
 *     any output event the new graph's own startup scheduled for the chip (a cold-starting source
 *     like a LogicInputElm corrects itself during drainZeroDelayEvents(), and its still-cold
 *     consumers react). An event only toggles the output, so one left queued would flip the
 *     carried value the wrong way when it fires;
 *  2. settle only the chips that weren't carried (tri-state merge cells, pass-group data cells -
 *     glue that belongs to no element) from those values, never re-evaluating a carried chip
 *     (cancelling their startup events too: settling computes their final value directly);
 *  3. give each carried chip whose inputs now disagree with it a normal, delayed output event
 *     (Chip.reevaluate()), so whatever is still in flight propagates at real gate speed.
 *
 * wasm/engine.cpp's circuit_seed_carried() is a port of this.
 */
export function seedCarriedValues(entries: { chip: Chip; value: number }[]): void {
    const carried = new Set<Chip>();
    for (const { chip } of entries) if (chip.state === ChipState.PASSIVE) carried.add(chip);
    const work: Chip[] = [];
    const queued = new Set<Chip>();
    const enqueueConsumers = (chip: Chip) => {
        for (const link of chip.outputLinks)
            if (!carried.has(link.chip) && !queued.has(link.chip)) { queued.add(link.chip); work.push(link.chip); }
    };

    // what updateInputs() does to cancel an output event (the queue skips the stale entry itself)
    const cancelPending = (chip: Chip) => {
        if (chip.pendingEvent === 0) return;
        chip.pendingEvent = 0;
        if (!chip.optimizationDisabled && !chip.outputEvents.empty()) chip.outputEvents.pop_back();
    };

    for (const chip of carried) {
        cancelPending(chip);
        if (chip.output) chip.inputs |= chip.prevOutputMask; else chip.inputs &= ~chip.prevOutputMask;
    }

    for (const { chip, value } of entries) {
        if (!carried.has(chip) || chip.output === value) continue;
        chip.output = value;
        if (value) chip.inputs |= chip.prevOutputMask; else chip.inputs &= ~chip.prevOutputMask;
        for (const link of chip.outputLinks) {
            link.chip.inputs ^= link.mask;
            link.chip.inputs &= link.chip.eventMask; // a seed is not an edge - see seedChipValues()
        }
        enqueueConsumers(chip);
    }

    // Glue has no feedback loops of its own, but bound it like Chip.initialize() does anyway.
    let budget = 1000 * Math.max(1, work.length);
    while (work.length > 0 && budget-- > 0) {
        const chip = work.pop()!;
        queued.delete(chip);
        if (chip.state !== ChipState.PASSIVE) continue;
        if (chip.type !== ChipType.CUSTOM_CHIP) {
            cancelPending(chip);
            if (chip.output) chip.inputs |= chip.prevOutputMask; else chip.inputs &= ~chip.prevOutputMask;
        }
        if (chip.initializeOne()) enqueueConsumers(chip);
    }

    for (const chip of carried) chip.reevaluate();
}

/** The seed entries that carry `snap` into the freshly built `graph` (see DigitalStateSnapshot). */
function carriedStateEntries(graph: DigitalGraph, snap: DigitalStateSnapshot): { chip: EngineChip; value: number }[] {
    const isCarriedChip = carriedChipFilter(graph);
    const out: { chip: EngineChip; value: number }[] = [];
    for (const [elm, chips] of graph.chipsByElm) {
        const values = snap.byElm.get(elm);
        if (!values || values.length !== chips.length) continue;
        chips.forEach((chip, i) => {
            const v = values[i];
            if (v != null && isCarriedChip(chip)) out.push({ chip, value: v });
        });
    }
    for (const [node, chip] of graph.triStateChipByNode) {
        if (!isCarriedChip(chip)) continue;
        for (const link of node.links ?? []) {
            const v = snap.byPost.get(link.elm)?.get(link.num);
            if (v !== undefined) { out.push({ chip, value: v }); break; }
        }
    }
    return out;
}

/** Every element's digitalInitialState() entries, in order, each resolved by `resolve` to the
 * chip it names (null if none) - the input to seedChipValues(). Generic in the chip type so the
 * WASM engine can resolve to chip indices instead. */
export function initialStateEntries<C>(elmList: any[], resolve: (elm: any, pin: number) => C | null): { chip: C | null; value: number }[] {
    const out: { chip: C | null; value: number }[] = [];
    for (const elm of elmList) {
        if (!isDigitalInitialStateSource(elm)) continue;
        const entries = elm.digitalInitialState();
        if (entries == null) continue;
        for (const { pin, value } of entries) out.push({ chip: resolve(elm, pin), value });
    }
    return out;
}

/** The core of seedInitialDigitalState() (see its docstring), on already-resolved chips. The
 * WASM engine's circuit_seed() (wasm/engine.cpp) is a port of this. */
export function seedChipValues(entries: { chip: Chip | null; value: number }[]): void {
    const seeded = new Set<Chip>();
    // Chips whose `.output` this loop actually overwrote to a DIFFERENT value than what
    // Circuit's constructor had already computed for them via its own blanket initialize()
    // pass over every chip (see circuit.ts) - NOT "every chip named by some digitalInitialState()
    // entry" (that's `seeded`, used only for the freshlySynced membership test below). Only a
    // chip in this set has stale consumer-side `.inputs` bits that need correcting: one whose
    // seeded value MATCHED what it had already cold-computed needs nothing fixed, since every
    // consumer's cached bit for it was already set correctly by that same constructor pass.
    const changed = new Set<Chip>();

    // Only the chip a named pin actually resolves to is added to `seeded` - not every chip
    // belonging to the element. A CounterElm names every one of its own bit cells (one per
    // output post), so in practice all of them end up seeded; a JKFlipFlopElm names only its
    // master cell, leaving its qBuf/notQ buffer cells (which hold no state of their own) out of
    // `seeded` - which is what lets the loop below fall them into `freshlySynced` and
    // Chip.initialize() them from the master's now-corrected output, exactly like any other
    // genuinely external, still-cold consumer.
    for (const { chip, value } of entries) {
        if (!chip || chip.state !== ChipState.PASSIVE) continue;
        seeded.add(chip);
        if (chip.output === value) continue;
        chip.output = value;
        changed.add(chip);
        if (value) chip.inputs |= chip.prevOutputMask; else chip.inputs &= ~chip.prevOutputMask;
    }

    const freshlySynced = new Set<Chip>();
    // Only `changed` chips need their consumers corrected - and unconditionally, not "only when
    // the new value is 1" (the previous `if (chip.output) ...` here): each such chip's
    // constructor-time cold value already got XORed into every consumer's `.inputs` once (via
    // Circuit's own initialize() pass, before this function ever runs - see this function's own
    // docstring), so flipping from THAT stale bit to the corrected one is a single XOR regardless
    // of which direction the correction goes. Gating on the new value's truthiness left a 1->0
    // correction (e.g. DFlipFlopElm's inverted-Set/Reset cold value: with S/R both floating 0 at
    // construction, invertBit forces both isSet/isReset "active" and the state cell cold-computes
    // Q=1 before this function corrects it back down to the real saved value of 0) never patching
    // notQ/qBuf's cached view of that pin, permanently stuck at the stale 1 - reproduced via
    // DFlipFlopElm with FLAG_INVERT_SET_RESET set.
    for (const chip of changed) {
        for (const link of chip.outputLinks) {
            link.chip.inputs ^= Number(link.mask);
            // `link.mask` covers BOTH the plain value bit AND, when this pin is also declared an
            // eventPin (an edge-sensitive input - e.g. a ripple counter's inter-stage clock, see
            // digitalSynthesisRipple()), the "this pin just transitioned" event bit (see Chip.
            // connect()) - the XOR above sets both indiscriminately. A real transition earns that
            // event bit; a seed correction (nothing actually just happened) must not appear to
            // one, or the receiving chip's own edge detector (posEdge()/negEdge() - see
            // chip_desc.ts) misreads it as a genuine clock edge and fires a phantom count.
            // Chip.initialize()/updateInputs() already strip this via `eventMask` (bits cleared
            // at every event-pin position) before using `.inputs` for anything; freshlySynced
            // chips get that for free below via initialize(), but a SIBLING (still in `seeded`,
            // never initialize()'d - its own externally-specified value must not be
            // recomputed) needs it applied explicitly right here.
            link.chip.inputs &= link.chip.eventMask;
            if (!seeded.has(link.chip)) freshlySynced.add(link.chip);
        }
    }
    for (const chip of freshlySynced) chip.initialize();
}

/** Finds whichever OTHER element's real output post shares `elm`'s node at `postIndex` - the
 * thing actually driving this input. Same precondition/role as the old engine's own
 * findDriver()/CircuitWiring.findDriver(), but resolves post-build (against chipsByElm, via each
 * candidate's own digitalOutputPosts()) rather than against the transient synthMap findDriver()
 * above only has during buildDigitalCircuit() itself - needed by digitalScopeSourceNew() below to
 * resolve a wire-equivalent passthrough (LabeledNodeElm, ...) added or re-resolved after the
 * graph was already built (see ScopePlot.refreshDigitalSource()'s own docstring for why that
 * matters - a scope can exist before wiring does). */
export function findDigitalDriver(elm: any, postIndex: number): { elm: any; postIndex: number } | null {
    const node = elm.nodes?.[postIndex];
    const candidates = (node?.links ?? []).filter((link: any) =>
        !(link.elm === elm && link.num === postIndex) && digitalOutputPosts(link.elm).includes(link.num));
    if (candidates.length === 0) return null;
    if (candidates.length > 1)
        console.log("digital wiring: multiple drivers for " + (elm.getClassName?.() ?? elm) + " post " + postIndex);
    return { elm: candidates[0].elm, postIndex: candidates[0].num };
}

/** Writes every digital-capable element's current Chip output(s) back into the real
 * CircuitNode(s) it drives, as a plain high/low voltage - replaces
 * CircuitWiring.syncDigitalToNodes()'s isGateLike/isChipLike/isRailSourceLike three-way split
 * with one loop over digitalOutputPosts(), since that already enumerates exactly the posts the
 * old code's three branches handled separately (a gate/chip's single/multiple `highVoltage`
 * posts, a rail/logic-input's `getDigitalVoltage()` post) - the two are told apart here by
 * whichever method the element actually exposes, same duck-typed convention this file already
 * uses throughout.
 *
 * Also refreshes a ChipElm-style element's own `pins[post].value` (guarded by `Array.isArray` -
 * a gate/rail/logic-input has no `pins` array at all) alongside `nodes[post].v`, piggybacking on
 * the same currentValue() this loop already computes for every post every frame - so a
 * DigitalInitialState implementation (CounterElm, the flip-flops, ...), which reads
 * pins[...].value to seed a rebuild triggered by an edit (adding an element, ...), continues the
 * running simulation's actual current state instead of whatever was loaded/reset to at the start
 * of the session. This runs only while the simulation is actually running (see
 * UIManager's simRunning gate on runCircuit()), but that's fine: pins[...].value simply holds
 * whatever it was last synced to while paused, which is exactly the (unchanging, since nothing is
 * ticking) live state at that moment.
 *
 * Resolves each post through digitalOutputChipResolved() (not the plain per-element
 * digitalOutputChip()) so a tri-state output post writes the actual merged bus value - see
 * DigitalGraph.triStateChipByNode's own docstring for why using this element's own chip directly
 * would be wrong whenever it shares a node with another tri-state driver. */
export function syncDigitalToNodesNew(elmList: any[], graph: DigitalGraph): void {
    for (const elm of elmList) {
        for (const post of digitalOutputPosts(elm)) {
            const chip = digitalOutputChipResolved(elm, post, graph);
            if (chip == null) continue;
            // currentValue(), not the raw output field: a chip with no live consumer (e.g. a
            // clock feeding nothing, or any dangling output) falls ASLEEP after its first
            // transition and then never wakes on its own - `output` would stay frozen at that
            // one transition forever even though the wire's voltage still needs to visibly keep
            // changing every frame. See Chip.currentValue()'s own docstring.
            const high = chip.currentValue() === 1;
            if (typeof elm.getDigitalVoltage === "function")
                elm.nodes[post].v = elm.getDigitalVoltage(high);
            else
                elm.nodes[post].v = high ? elm.highVoltage : 0;
            if (Array.isArray(elm.pins)) elm.pins[post].value = high;
        }
    }
    for (const [node, hv] of graph.passNodeVoltage) {
        const chip = graph.triStateChipByNode.get(node);
        if (chip) node.v = chip.currentValue() === 1 ? hv : 0;
    }
}

/** Appends a line to a getInfo() array, which is a fixed-size array pre-filled with null (new
 * Array(10).fill(null)) rather than a plain growable list - writing to arr[arr.length] would
 * land past the end instead of into the first actually-empty slot. No-ops if every slot is
 * already filled. */
export function appendInfoLine(arr: (string | null)[], line: string): void {
    const i = arr.indexOf(null);
    if (i !== -1) arr[i] = line;
}

/** For ChipElm-derived elements NOT digital-synthesizable themselves (pure sinks like
 * DecimalDisplayElm, LEDArrayElm, SevenSegElm - no digitalSynthesis() of their own), refreshes
 * pins[i].value from nodes[i].v for every non-output pin, mirroring what ChipElm.startIteration()
 * used to do every timestep in the old analog loop. That loop isn't called at all on this digital
 * path, so anything reading pins[i].value directly - as these display-only elements' own draw()
 * methods do - would otherwise go stale at whatever it was on construction (typically false/0),
 * regardless of what the digital graph actually computed and already wrote into nodes[i].v via
 * syncDigitalToNodesNew() above. Skips digital-synthesizable elements (CounterElm, ...): those
 * render via nodes[i].v directly (ChipElm.drawChip()'s generic per-pin coloring), so their own
 * pins[i].value is never read for anything real - not worth refreshing here too. */
export function syncNodesToPassiveChips(elmList: any[]): void {
    for (const elm of elmList) {
        if (isDigitalSynthesizable(elm)) continue;
        if (!Array.isArray(elm.pins) || !Array.isArray(elm.nodes) || typeof elm.getThreshold !== "function")
            continue;
        for (let i = 0; i < elm.pins.length; i++)
            if (!elm.pins[i].output)
                elm.pins[i].value = elm.nodes[i].v > elm.getThreshold();
    }
}

/** Optimization-status text for a single Chip, replacing digitalStateText() - same three
 * State/ChipState cases and "Constant" special case (a zero-input Passive chip - a DC tie or a
 * fixed-logic cell - never promotes and never needs to, unlike a real Passive chip still proving
 * periodicity), just phrased against dice-ts's ChipState/cycleTime instead of the old engine's
 * State/cycleTime. */
export function digitalStateTextNew(chip: EngineChip | null): string {
    if (chip == null) return "not wired";
    if (chip.state === ChipState.PASSIVE && chip.inputLinks.length === 0) return "Constant";
    switch (chip.state) {
        case ChipState.PASSIVE: return "Passive (not yet optimized)";
        case ChipState.ACTIVE: return `Active, ${chip.cycleTime} ticks`;
        case ChipState.ASLEEP: return `Asleep, ${chip.cycleTime} ticks`;
        default: return "?";
    }
}

// The live DigitalGraph for whichever circuit is currently simulating - mirrors the old engine's
// DigitalCore.current singleton (digital/DigitalElm.ts's `DigitalElm.current`) convention: an
// element's getInfo() panel (CounterElm.getInfo(), DFlipFlopElm.getInfo(), ...) needs to reach
// "the currently-built graph" to resolve its own optimization-status text, but only
// SimulationManager.initDigitalCircuit() actually builds one - threading chipsByElm through
// every such call site individually would mean plumbing it across ~9 unrelated element files.
let currentGraph: DigitalGraph | null = null;

/** Set by SimulationManager.initDigitalCircuit() right after buildDigitalCircuit() - see
 * currentGraph's own docstring above. Pass null when tearing down (no live circuit). */
export function setCurrentDigitalGraph(graph: DigitalGraph | null): void {
    currentGraph = graph;
}

export function getCurrentDigitalGraph(): DigitalGraph | null {
    return currentGraph;
}

/** digitalStateTextNew() against the currently-live graph (see currentGraph above), for an
 * element's own getInfo() to call directly - replaces every `digitalStateText(this)` /
 * `digitalStateText(this.digitalPins[k])` call site across GateElm/InverterElm/RailElm/
 * LogicInputElm/DelayBufferElm/CounterElm/DFlipFlopElm/JKFlipFlopElm/MultiplexerElm/
 * SevenSegDecoderElm with `digitalStateTextForOutput(this, 0)` (single-output elements) or
 * `digitalStateTextForOutput(this, k)` (the k-th output pin of a multi-output chip, same `k` the
 * old digitalPins[k] loop already computed - see digitalOutputChipAt()'s own docstring). */
export function digitalStateTextForOutput(elm: any, outputIndex: number): string {
    if (currentGraph == null) return "not wired";
    const post = digitalOutputPosts(elm)[outputIndex];
    return digitalStateTextNew(post === undefined ? null : digitalOutputChipResolved(elm, post, currentGraph));
}

// Resolves `elm` to the single real Chip that supplies this element's digital output
// voltage, for ScopePlot to source a 1-d trace from history/backfillHistory() instead of
// per-frame analog sampling.
export function digitalScopeSourceNew(elm: any): EngineChip | null {
    if (elm == null || currentGraph == null) return null;
    const posts = digitalOutputPosts(elm);
    if (posts.length === 1) return digitalOutputChipResolved(elm, posts[0], currentGraph);
    const isPassthrough = (typeof elm.isWireEquivalent === "function" && elm.isWireEquivalent()) ||
        (typeof elm.isOutputElm === "function" && elm.isOutputElm()) ||
        (typeof elm.isLogicOutputElm === "function" && elm.isLogicOutputElm());
    if (posts.length === 0 && isPassthrough && Array.isArray(elm.nodes) &&
            new Set(elm.nodes).size === 1) {
        const driver = findDigitalDriver(elm, 0);
        if (driver) return digitalOutputChipResolved(driver.elm, driver.postIndex, currentGraph);
    }
    return null;
}
