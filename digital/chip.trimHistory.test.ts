// Targeted unit tests for the Chip.history bounding mechanism added alongside the
// `output`-setter-gating fix (see chip.ts's own comments on `historyWatched`, HistoryWatcher,
// addHistoryWatcher()/removeHistoryWatcher()/trimHistory()): `history` used to grow forever for
// every chip, watched or not, with nothing ever reclaiming it. Now (a) only a historyWatched
// chip's `output` setter records anything at all, and (b) whatever it does record gets trimmed
// down to what its currently-registered watchers (ScopePlot/ScopePlot2d in real use) still need.
import { describe, it, expect } from "vitest";
import { Chip } from "./chip";
import type { HistoryWatcher } from "./chip";

// A minimal fake HistoryWatcher whose reported floor can be changed between calls, the same way
// a real ScopePlot's historyFloor() moves forward as it processes more of `history`.
function watcher(floor: bigint): HistoryWatcher & { floor: bigint } {
    return { floor, historyFloor() { return this.floor; } };
}

function bareChip(circuit?: any): Chip {
    const c = circuit ?? { globalTime: 0n, historyWatchedChips: new Set() };
    return new Chip(1, 8, c, { logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: 0, prevOutPin: 0 });
}

// Drives `chip.output` through a real toggle at `time`, the same way live simulation would -
// exercising the actual gated setter rather than poking `history` directly.
function toggleAt(chip: Chip, circuit: { globalTime: bigint }, time: bigint): void {
    circuit.globalTime = time;
    chip.output ^= 1;
}

describe("Chip.output setter only records when historyWatched", () => {
    it("records nothing for a chip nobody has ever watched", () => {
        const circuit = { globalTime: 0n, historyWatchedChips: new Set() };
        const chip = bareChip(circuit);
        toggleAt(chip, circuit, 10n);
        toggleAt(chip, circuit, 20n);
        expect(chip.history).toEqual([]);
    });

    it("records every real transition once a watcher attaches", () => {
        const circuit = { globalTime: 0n, historyWatchedChips: new Set() };
        const chip = bareChip(circuit);
        chip.addHistoryWatcher(watcher(-1n));
        toggleAt(chip, circuit, 10n);
        toggleAt(chip, circuit, 20n);
        expect(chip.history).toEqual([{ time: 10n, value: 1 }, { time: 20n, value: 0 }]);
    });

    it("still skips a no-op write (same value) even while watched", () => {
        const circuit = { globalTime: 0n, historyWatchedChips: new Set() };
        const chip = bareChip(circuit);
        chip.addHistoryWatcher(watcher(-1n));
        circuit.globalTime = 10n;
        chip.output = chip.output; // same value - no real transition
        expect(chip.history).toEqual([]);
    });
});

describe("Chip.addHistoryWatcher()/removeHistoryWatcher()", () => {
    it("sets historyWatched and registers the chip on the circuit's historyWatchedChips", () => {
        const circuit = { globalTime: 0n, historyWatchedChips: new Set<Chip>() };
        const chip = bareChip(circuit);
        expect(chip.historyWatched).toBe(false);
        chip.addHistoryWatcher(watcher(-1n));
        expect(chip.historyWatched).toBe(true);
        expect(circuit.historyWatchedChips.has(chip)).toBe(true);
    });

    it("removeHistoryWatcher() does not clear historyWatched (stays true forever once set)", () => {
        const circuit = { globalTime: 0n, historyWatchedChips: new Set() };
        const chip = bareChip(circuit);
        const w = watcher(-1n);
        chip.addHistoryWatcher(w);
        chip.removeHistoryWatcher(w);
        expect(chip.historyWatched).toBe(true);
    });
});

describe("Chip.trimHistory()", () => {
    // Chip + watcher w, with 5 recorded transitions (t=10..50) ready to trim.
    function seeded(): { chip: Chip; circuit: { globalTime: bigint }; w: HistoryWatcher & { floor: bigint } } {
        const circuit = { globalTime: 0n, historyWatchedChips: new Set() };
        const chip = bareChip(circuit);
        const w = watcher(-1n);
        chip.addHistoryWatcher(w);
        for (const t of [10n, 20n, 30n, 40n, 50n]) toggleAt(chip, circuit, t);
        return { chip, circuit, w };
    }

    it("drops everything strictly before the single watcher's floor", () => {
        const { chip, w } = seeded();
        w.floor = 25n;
        chip.trimHistory();
        expect(chip.history.map(h => h.time)).toEqual([30n, 40n, 50n]);
    });

    it("uses the MINIMUM floor across multiple watchers, never the max", () => {
        const { chip, w } = seeded();
        w.floor = 45n; // the eager one - would keep only the last entry on its own
        chip.addHistoryWatcher(watcher(15n)); // the lagging one - needs everything from 20n on
        chip.trimHistory();
        expect(chip.history.map(h => h.time)).toEqual([20n, 30n, 40n, 50n]);
    });

    it("a watcher reporting -1n (no floor established yet) blocks all trimming", () => {
        const { chip, w } = seeded();
        w.floor = -1n; // just attached/reset, hasn't done its seed pass yet
        chip.addHistoryWatcher(watcher(45n));
        chip.trimHistory();
        expect(chip.history.map(h => h.time)).toEqual([10n, 20n, 30n, 40n, 50n]);
    });

    it("clears `history` outright once the last watcher is removed", () => {
        const { chip, w } = seeded();
        w.floor = 45n;
        chip.trimHistory();
        expect(chip.history.length).toBeGreaterThan(0);

        chip.removeHistoryWatcher(w);
        chip.trimHistory();
        expect(chip.history).toEqual([]);
    });

    it("is a cheap no-op on an already-empty history with no watchers", () => {
        const circuit = { globalTime: 0n, historyWatchedChips: new Set() };
        const chip = bareChip(circuit);
        expect(() => chip.trimHistory()).not.toThrow();
        expect(chip.history).toEqual([]);
    });

    it("a watcher's floor equal to an entry's own time keeps that entry (< floor is dropped, not <=)", () => {
        const { chip, w } = seeded();
        w.floor = 30n; // exactly one recorded entry's own time
        chip.trimHistory();
        expect(chip.history.map(h => h.time)).toEqual([30n, 40n, 50n]);
    });
});
