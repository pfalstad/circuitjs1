// Shared constants that both chip.ts and circuit.ts need, kept dependency-free to avoid a
// circular import between those two modules. Adapted from dice-ts/src/constants.ts.

// Unlike dice-ts (a fixed 1ps, matching DICE's own Circuit::timescale), TIMESCALE here is the
// existing user-configurable "Time step size (s)" (SimulationManager.maxTimeStep) - so an
// engine tick means exactly the same real-world duration the old digital/ engine's ticks did,
// and every existing per-element delay computed as "N seconds -> ticks" keeps working via the
// same knob. Mutable (not a true constant) because maxTimeStep can change across a circuit
// (re)load; set it once, before constructing any Chip, via setTimescale().
export let TIMESCALE = 1.0e-6;

export function setTimescale(seconds: number): void {
    if (!(seconds > 0)) throw new Error("TIMESCALE must be a positive number of seconds");
    TIMESCALE = seconds;
}

export const MAX_U64 = (1n << 64n) - 1n; // matches `~0ull` used as a sentinel/"infinity" time

// The original C++ prints a per-event trace line ("chip 'X' input changed...") unconditionally.
// Here it's opt-in - toggle for debugging a specific circuit rather than always-on console spam.
export let DEBUG_TRACE = false;

export function setDebugTrace(on: boolean): void {
    DEBUG_TRACE = on;
}
