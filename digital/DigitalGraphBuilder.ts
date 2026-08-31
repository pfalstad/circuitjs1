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

import type { Chip } from "./chip";
import type { ChipDesc } from "./chip_desc";
import { CHIP, CONNECTION, circuitLayout } from "./circuit_desc";
import type { CircuitEntry, CircuitDesc } from "./circuit_desc";
import { Circuit } from "./circuit";

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
function isOutputPin(desc: ChipDesc[], pin: number): boolean {
    return desc.some(d => d.outPin === pin);
}

/** Finds whichever OTHER synthesized element's output post shares `elm`'s node at `postIndex` -
 * the thing actually driving this input. Assumes wire closure has already merged
 * purely-wire-connected posts into one CircuitNode (i.e. this must run after
 * SimulationManager.makeNodeList()/calcWireInfo()), same precondition CircuitWiring.findDriver()
 * has. Only considers other elements that are themselves digital-synthesizable and expose the
 * matching post as an output - anything else sharing the node (a non-digital sink, an unrelated
 * input) is not a driver. */
function findDriver(elm: any, postIndex: number, synthMap: Map<any, SynthEntry>): { entry: SynthEntry; pin: number } | null {
    const node = elm.nodes[postIndex];
    const candidates = (node?.links ?? []).filter((link: any) => {
        if (link.elm === elm && link.num === postIndex) return false;
        const entry = synthMap.get(link.elm);
        if (!entry) return false;
        const pin = entry.pinMap.get(link.num);
        return pin !== undefined && isOutputPin(entry.desc, pin);
    });

    if (candidates.length === 0) return null;
    if (candidates.length > 1)
        console.log("digital wiring: multiple drivers for " + (elm.getClassName?.() ?? elm) + " post " + postIndex);

    const winner = candidates[0];
    const entry = synthMap.get(winner.elm)!;
    return { entry, pin: entry.pinMap.get(winner.num)! };
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
                synthMap.set(elm, { name: "e" + counter++, desc: synth.desc, pinMap: synth.pinMap, isTie: false });
        }
    }
    return synthMap;
}

/**
 * Assembles a dice-ts CircuitDesc from `synthMap`: one ChipInstanceEntry per non-tie element
 * (under a name unique to this build) plus one ConnectionEntry per input post that has a
 * driver. A missing driver is simply omitted - Circuit's own constructor already grounds any
 * unconnected input pin to GND (see circuit.ts), so there's no need to fabricate a
 * DigitalConst-equivalent here the way the old wireDigitalCircuit() had to.
 */
function layoutFromSynth(synthMap: Map<any, SynthEntry>): CircuitDesc {
    const entries: CircuitEntry[] = [];
    for (const entry of synthMap.values())
        if (!entry.isTie) entries.push(CHIP(entry.name, entry.desc));

    for (const [elm, entry] of synthMap) {
        for (const [postIndex, pin] of entry.pinMap) {
            if (isOutputPin(entry.desc, pin)) continue; // only inputs need a driving connection
            const driver = findDriver(elm, postIndex, synthMap);
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
    return layoutFromSynth(synthesizeAll(elmList));
}

export interface DigitalGraph {
    circuit: Circuit;
    /** Every digital-capable element's own Chip(s), for whoever built this graph to read
     * output/history from or push a live external change into (e.g. LogicInputElm.toggle() -
     * see its own digitalSynthesis()). A tie source's entry is the shared `_VCC`/`_GND` chip
     * (circuit.chips[0]/[1] - see circuit.ts's createSpecialChips(), never pruned since both are
     * CUSTOM_CHIP), same object for every element tied to that rail. Absent for any element
     * digitalSynthesis()/digitalTie() didn't produce a netlist entry for. */
    chipsByElm: Map<any, Chip[]>;
}

/** Full netlist build for a freshly-stamped circuit: synthesize + wire every digital-capable
 * element and construct the dice-ts Circuit that runs them. Must run after the node list and
 * wire closure are built (SimulationManager.makeNodeList()/calcWireInfo()), mirroring
 * CircuitWiring.wireDigitalCircuit()'s own precondition. */
export function buildDigitalCircuit(elmList: any[]): DigitalGraph {
    const synthMap = synthesizeAll(elmList);
    const circuit = new Circuit(layoutFromSynth(synthMap));

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
    }

    return { circuit, chipsByElm };
}
