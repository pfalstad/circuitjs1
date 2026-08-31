/*
    Phase 1 of the dice-ts cutover (see noble-stirring-rabin.md): the dynamic netlist builder
    that replaces CircuitWiring.ts's wireDigitalCircuit()/initDigitalElements(). Where the old
    engine wired DigitalElm instances directly (elm.addInput()), this builds a dice-ts
    CircuitDesc from the live element/node graph and hands it to circuit.ts's Circuit
    constructor - the same CHIP()/CONNECTION()/circuitLayout() shape dice-ts's own hand-written
    circuit_desc.ts source files use, just assembled at runtime instead of by hand.

    Types are duck-typed (any), matching CircuitWiring.ts's own convention: this module doesn't
    need to know which concrete CircuitElm subclass it's looking at, only that it implements
    `digitalSynthesis()` (see DigitalSynthesis below). Real elements gain that method in Phase 2
    (GateElm/InverterElm/RailElm/...) - until then, this module and its tests exercise the
    builder algorithm itself against minimal duck-typed stand-ins.
*/

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
 */
export interface DigitalSynthesis {
    desc: ChipDesc[];
    pinMap: Map<number, number>; // postIndex -> external pin number within desc
}

export interface DigitalSynthesizable {
    digitalSynthesis(): DigitalSynthesis;
}

export function isDigitalSynthesizable(elm: any): elm is DigitalSynthesizable {
    return elm != null && typeof elm.digitalSynthesis === "function";
}

interface SynthEntry {
    name: string;
    desc: ChipDesc[];
    pinMap: Map<number, number>;
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

/**
 * Synthesizes every digital-capable element in `elmList` and assembles a dice-ts CircuitDesc:
 * one ChipInstanceEntry per element (its digitalSynthesis().desc, under a name unique to this
 * build) plus one ConnectionEntry per input post that has a driver. A missing driver is simply
 * omitted - Circuit's own constructor already grounds any unconnected input pin to GND (see
 * circuit.ts), so there's no need to fabricate a DigitalConst-equivalent here the way the old
 * wireDigitalCircuit() had to.
 *
 * Pure data in, data out (no Circuit/Chip construction) - kept separate from
 * buildDigitalCircuit() below so the connection-resolution algorithm itself is testable without
 * running the engine.
 */
export function buildCircuitDesc(elmList: any[]): CircuitDesc {
    const synthMap = new Map<any, SynthEntry>();
    let counter = 0;
    for (const elm of elmList) {
        if (!isDigitalSynthesizable(elm)) continue;
        const { desc, pinMap } = elm.digitalSynthesis();
        synthMap.set(elm, { name: "e" + counter++, desc, pinMap });
    }

    const entries: CircuitEntry[] = [];
    for (const entry of synthMap.values()) entries.push(CHIP(entry.name, entry.desc));

    for (const [elm, entry] of synthMap) {
        for (const [postIndex, pin] of entry.pinMap) {
            if (isOutputPin(entry.desc, pin)) continue; // only inputs need a driving connection
            const driver = findDriver(elm, postIndex, synthMap);
            if (driver) entries.push(CONNECTION(driver.entry.name, driver.pin, entry.name, pin));
        }
    }

    return circuitLayout(entries);
}

/** Full netlist build for a freshly-stamped circuit: synthesize + wire every digital-capable
 * element and construct the dice-ts Circuit that runs them. Must run after the node list and
 * wire closure are built (SimulationManager.makeNodeList()/calcWireInfo()), mirroring
 * CircuitWiring.wireDigitalCircuit()'s own precondition. */
export function buildDigitalCircuit(elmList: any[]): Circuit {
    return new Circuit(buildCircuitDesc(elmList));
}
