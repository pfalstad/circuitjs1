// Integration-level regression coverage for the digital raster's Chip.history trimming
// interaction (see chip.ts's trimHistory()/HistoryWatcher comments and ScopePlot2d.ts's
// historyEpoch comment) - drives a REAL Chip + REAL ScopePlot2d together (not fakes, unlike
// ScopePlot2d.test.ts), with `now` advancing in tiny steps (simulating a slow sim: many draw()
// calls per tick) and real chip.trimHistory() sweeps interleaved (simulating
// SimulationManager.runCircuit()'s per-frame sweep), then checks every painted pixel row against
// an independently computed ground truth, across several consecutive raster frames - including
// attaching mid-frame and repeated mid-run resets without a chip switch (Scope.ts's
// allocImage()). Each fillRect call is tagged with the frameStart in effect AT THE TIME of the
// fillDigitalRaster() call that produced it (known directly from the driving loop, not inferred
// from clear-detection heuristics), so rows are never misattributed even across a mid-frame
// reset that forces an extra clear-and-restart of the SAME frame index.
import { describe, it, expect } from "vitest";
import { Chip } from "./digital/chip";
import { ScopePlot2d } from "./ScopePlot2d";

function bareChip(circuit: any): Chip {
    return new Chip(1, 8, circuit, { logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: 0, prevOutPin: 0 });
}

const FRAME_LEN = 40;
const ON = "#ffffff", OFF = "#000000";

// Toggle schedule (times chip.output flips), starting value 0 at t=0.
const toggles = [8, 15, 22, 31, 44, 53, 67, 75, 88, 95, 103, 110, 118, 130, 140, 150, 158, 170, 179];
function valueAt(t: number): number {
    let v = 0;
    for (const tt of toggles) { if (t >= tt) v ^= 1; else break; }
    return v;
}

describe("digital raster rendering under slow-draw-cadence trimming, vs ground truth", () => {
    function driver() {
        const circuit: any = { globalTime: 0n, historyWatchedChips: new Set() };
        const chip = bareChip(circuit);

        let fillStyle = "";
        // rows: absolute tick -> last color painted there (across the WHOLE run - a row only
        // ever gets overwritten by a LATER call, and every fillRect call is tagged with the
        // frameStart in effect at call time via closure over `frameStartNow`, computed directly
        // from `t`, not inferred).
        const rows = new Map<number, string>();
        let frameStartNow = 0;
        const imageContext: any = {
            get fillStyle() { return fillStyle; },
            set fillStyle(v: string) { fillStyle = v; },
            fillRect: (_x: number, y: number, _w: number, h: number) => {
                if (h === FRAME_LEN && y === 0) return; // full-canvas clear - not a data row
                for (let row = y; row < y + h; row++) rows.set(frameStartNow + row, fillStyle);
            },
        };

        const scope: any = {
            plots: [{ digitalChip: chip }],
            sim: { maxTimeStep: 1 },
            rect: { width: 10, height: FRAME_LEN },
            app: { isPrintable: () => false },
        };
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = imageContext;
        plot2d.plotBrightness = 0;
        plot2d.rasterLineWidthSec = 1;
        plot2d.rasterFrameLengthSec = FRAME_LEN;

        let nextToggleIdx = 0;
        function stepTo(t: number, opts: { trim: boolean } = { trim: true }) {
            circuit.globalTime = BigInt(t);
            if (nextToggleIdx < toggles.length && t === toggles[nextToggleIdx]) {
                chip.output ^= 1;
                nextToggleIdx++;
            }
            frameStartNow = Math.floor(t / FRAME_LEN) * FRAME_LEN;
            plot2d.fillDigitalRaster();
            if (opts.trim) chip.trimHistory();
        }

        return {
            chip, circuit, plot2d, rows, stepTo,
            advanceToggleIdxPast(t: number) { while (nextToggleIdx < toggles.length && toggles[nextToggleIdx] <= t) nextToggleIdx++; },
            get historyEpoch(): number { return (plot2d as any).historyEpoch; },
        };
    }

    function checkAgainstGroundTruth(rows: Map<number, string>, sinceInclusive: number): string[] {
        const bad: string[] = [];
        for (const [t, actual] of rows) {
            if (t < sinceInclusive) continue;
            const expected = valueAt(t) ? ON : OFF;
            if (actual !== expected) bad.push(`t=${t}: expected ${expected}, painted ${actual}`);
        }
        return bad;
    }

    it("attach at t=0 (frame-aligned), trim every tick", () => {
        const d = driver();
        for (let t = 0; t <= 179; t++) d.stepTo(t, { trim: true });
        expect(checkAgainstGroundTruth(d.rows, 0)).toEqual([]);
    });

    it("attach MID-FRAME (t=50, historyEpoch clamp actually engages), trim every tick", () => {
        const d = driver();
        for (let t = 0; t <= 49; t++) {
            d.circuit.globalTime = BigInt(t);
            if (toggles.includes(t)) { d.chip.output ^= 1; d.advanceToggleIdxPast(t); }
        }
        for (let t = 50; t <= 179; t++) d.stepTo(t, { trim: true });
        expect(d.historyEpoch).toBe(50);
        expect(checkAgainstGroundTruth(d.rows, 50)).toEqual([]);
    });

    it("a mid-run allocImage()-style reset (no chip switch) partway through a frame, with ongoing trimming", () => {
        const d = driver();
        for (let t = 0; t <= 179; t++) {
            d.stepTo(t, { trim: true });
            if (t === 97) {
                // allocImage()'s own reset, mid-frame (frame [80,120) not yet finished), no chip
                // switch - the exact trigger the "slowing down mid-drawing" report described.
                (d.plot2d as any).rasterFilledTick = -1;
                (d.plot2d as any).rasterFrameIndex = -1;
            }
        }
        expect(checkAgainstGroundTruth(d.rows, 0)).toEqual([]);
    });

    it("MANY mid-run resets, at irregular ticks, trimming every tick (stress)", () => {
        const d = driver();
        const resetAt = new Set([13, 14, 47, 48, 49, 81, 122, 123, 160]);
        for (let t = 0; t <= 179; t++) {
            d.stepTo(t, { trim: true });
            if (resetAt.has(t)) {
                (d.plot2d as any).rasterFilledTick = -1;
                (d.plot2d as any).rasterFrameIndex = -1;
            }
        }
        expect(checkAgainstGroundTruth(d.rows, 0)).toEqual([]);
    });
});
