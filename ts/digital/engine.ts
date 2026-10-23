// What the app (SimulationManager, scopes, element getInfo(), JSInterface) needs from a built
// digital circuit and its chips. Both engines provide it: circuit.ts's Circuit/Chip directly,
// and wasmEngine.ts's WasmCircuit/WasmChip by forwarding into the WASM module. Anything beyond
// this (seeding, pushing a source value, retiming a clock) is engine-specific and goes through
// the helpers in DigitalGraphBuilder.ts/nativeKinds.ts, which check which engine they have.

import type { HistoryEntry, HistoryWatcher } from "./chip";

export interface EngineChip {
    readonly state: number;
    readonly output: number;
    readonly cycleTime: number;
    readonly inputLinks: ArrayLike<unknown>;
    readonly circuit: { readonly globalTime: number };
    optimizationDisabled: boolean;
    /** Append-only list of output changes, while a watcher is attached (see Chip.history). */
    readonly history: HistoryEntry[];
    currentValue(): number;
    backfillHistory(now: number): number;
    skipBackfillTo(target: number): void;
    addHistoryWatcher(w: HistoryWatcher): void;
    removeHistoryWatcher(w: HistoryWatcher): void;
    trimHistory(): void;
}

export interface EngineCircuit {
    readonly chips: readonly EngineChip[];
    readonly globalTime: number;
    /** Every chip a history watcher has ever attached to (see Chip.trimHistory()). */
    readonly historyWatchedChips: Set<EngineChip>;
    runWithDeadline(ticks: number, deadlineMs?: number): number;
    run(ticks: number): void;
    drainZeroDelayEvents(): void;
}

export type EngineName = "wasm" | "ts";
