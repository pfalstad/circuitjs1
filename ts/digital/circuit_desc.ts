// Port of circuit_desc.h, trimmed of the Pong-specific video/input entry kinds (dice-ts/
// src/circuit_desc.ts's VideoEntry/InputEntry/VIDEO()/INPUT() and their VideoDesc dependency) -
// this is a general circuit editor, not a fixed game console, so those never apply.
//
// The C++ version packs heterogeneous entries (chip instances, connections, optimization
// hints, sub-circuit references) into one array of tagged unions and filters it with typed
// iterators (CircuitDesc::get_chips() etc). Plain discriminated-union arrays plus a bucketing
// pass (circuitLayout) achieve the same effect far more simply in TS.
//
// Unlike dice-ts, where a CircuitDesc's entries are hand-written source (one `CHIP(...)`/
// `CONNECTION(...)` call per real chip catalog instance/wire in a fixed game), here
// DigitalGraphBuilder.ts builds a CircuitEntry[] at runtime from the live, interactively-edited
// element/node graph - this module is unchanged either way, since CHIP/CONNECTION/circuitLayout
// are pure data/functions with no assumption about where the entries came from.

import type { ChipDesc } from "./chip_desc";

export interface ChipInstanceEntry { kind: "chip"; name: string; desc: ChipDesc[]; customData: unknown; }
export interface ConnectionEntry { kind: "connection"; name1: string; pin1: number; name2: string; pin2: number; }
export interface OptimizationHintEntry { kind: "hint"; chip: string; queueSize: number; subcycleSize: number; }
export interface SubcircuitEntry { kind: "subcircuit"; prefix: string; desc: () => CircuitDesc; }

export type CircuitEntry = ChipInstanceEntry | ConnectionEntry | OptimizationHintEntry | SubcircuitEntry;

export interface CircuitDesc {
    chips: ChipInstanceEntry[];
    connections: ConnectionEntry[];
    hints: OptimizationHintEntry[];
    subCircuits: SubcircuitEntry[];
}

export function circuitLayout(entries: CircuitEntry[]): CircuitDesc {
    const desc: CircuitDesc = { chips: [], connections: [], hints: [], subCircuits: [] };
    for (const e of entries) {
        switch (e.kind) {
            case "chip": desc.chips.push(e); break;
            case "connection": desc.connections.push(e); break;
            case "hint": desc.hints.push(e); break;
            case "subcircuit": desc.subCircuits.push(e); break;
        }
    }
    return desc;
}

export function CHIP(name: string, desc: ChipDesc[], customData: unknown = null): CircuitEntry {
    return { kind: "chip", name, desc, customData };
}
export function CONNECTION(name1: string, pin1: number, name2: string, pin2: number): CircuitEntry {
    return { kind: "connection", name1, pin1, name2, pin2 };
}
export function SUB_CIRCUIT(prefix: string, desc: () => CircuitDesc): CircuitEntry {
    return { kind: "subcircuit", prefix, desc };
}

export function DISABLE_OPTIMIZATION(chip: string, pin: number): CircuitEntry {
    return CONNECTION("_DEOPTIMIZER", 1, chip, pin);
}
export function OPTIMIZATION_HINT(chip: string, queueSize: number, subcycleSize: number): CircuitEntry {
    return { kind: "hint", chip, queueSize, subcycleSize };
}

export const VCC = "_VCC";
export const GND = "_GND";
