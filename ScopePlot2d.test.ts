// Targeted unit tests for ScopePlot2d's Chip.history watcher registration (added alongside the
// unbounded-`history`-growth fix - see chip.ts's HistoryWatcher/trimHistory() comments): the
// raster's actual signal (scope.plots[plotBrightness].digitalChip) can change at runtime, so
// fillDigitalRaster() has to keep its own registration in sync with whatever chip it's currently
// reading from - unlike a ScopePlot, which only ever watches the one chip it was built for.
import { describe, it, expect, vi } from "vitest";
import { ScopePlot2d } from "./ScopePlot2d";
import { ChipState } from "./digital/chip";

// A minimal fake Chip - just the surface fillDigitalRaster()/addHistoryWatcher()/
// removeHistoryWatcher() actually touch. Real add/removeHistoryWatcher semantics (min-of-floors,
// WeakRef pruning, ...) are covered directly against the real Chip in chip.trimHistory.test.ts;
// this only needs to verify ScopePlot2d calls them at the right times, with the right chip.
function fakeChip(nowTicks: number) {
    return {
        circuit: { globalTime: BigInt(nowTicks) },
        state: ChipState.PASSIVE,
        history: [] as { time: bigint; value: number }[],
        output: 0,
        backfillHistory: vi.fn((t: bigint) => t),
        addHistoryWatcher: vi.fn(),
        removeHistoryWatcher: vi.fn(),
    } as any;
}

function fakeCanvasContext() {
    return { fillStyle: "", fillRect: vi.fn() } as any;
}

function fakeScope(plots: any[]) {
    return {
        plots,
        sim: { maxTimeStep: 1e-6 },
        rect: { width: 10, height: 10 },
        app: { isPrintable: () => false },
    } as any;
}

describe("ScopePlot2d digital raster history watching", () => {
    it("registers with the brightness plot's chip the first time it draws", () => {
        const chip = fakeChip(100);
        const scope = fakeScope([{ digitalChip: chip }]);
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.plotBrightness = 0;

        plot2d.fillDigitalRaster();

        expect(chip.addHistoryWatcher).toHaveBeenCalledWith(plot2d);
    });

    it("historyFloor() tracks rasterFilledTick once painted", () => {
        const chip = fakeChip(100);
        const scope = fakeScope([{ digitalChip: chip }]);
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.plotBrightness = 0;

        expect(plot2d.historyFloor()).toBe(-1n); // nothing painted yet
        plot2d.fillDigitalRaster();
        expect(plot2d.historyFloor()).toBe(100n);
    });

    it("switches registration when the brightness source's chip changes", () => {
        const chipA = fakeChip(100);
        const chipB = fakeChip(100);
        const bp = { digitalChip: chipA };
        const scope = fakeScope([bp]);
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.plotBrightness = 0;

        plot2d.fillDigitalRaster();
        expect(chipA.addHistoryWatcher).toHaveBeenCalledTimes(1);

        bp.digitalChip = chipB;
        plot2d.fillDigitalRaster();

        expect(chipA.removeHistoryWatcher).toHaveBeenCalledWith(plot2d);
        expect(chipB.addHistoryWatcher).toHaveBeenCalledWith(plot2d);
        // A stale cursor from chipA's own timeline must not carry over and get misread against
        // chipB's unrelated history - see fillDigitalRaster()'s own comment on why both the
        // raster cursor and the frame index get reset before repainting. Freshly repainted
        // against chipB in this same call, it lands on chipB's own `now` (100n), not some
        // leftover chipA value - the reset itself (the -1n moment in between) isn't separately
        // observable since both happen within one fillDigitalRaster() call.
        expect(plot2d.historyFloor()).toBe(100n);
    });

    it("unregisters when the brightness source disappears (plotBrightness pointing nowhere valid)", () => {
        const chip = fakeChip(100);
        const bp = { digitalChip: chip };
        const scope = fakeScope([bp]);
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.plotBrightness = 0;
        plot2d.fillDigitalRaster();

        plot2d.plotBrightness = -1; // no source selected any more
        plot2d.fillDigitalRaster();

        expect(chip.removeHistoryWatcher).toHaveBeenCalledWith(plot2d);
    });

    it("detach() unregisters and a later draw re-registers from scratch", () => {
        const chip = fakeChip(100);
        const scope = fakeScope([{ digitalChip: chip }]);
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.plotBrightness = 0;
        plot2d.fillDigitalRaster();

        plot2d.detach();
        expect(chip.removeHistoryWatcher).toHaveBeenCalledWith(plot2d);

        plot2d.fillDigitalRaster();
        expect(chip.addHistoryWatcher).toHaveBeenCalledTimes(2); // once before detach, once after
    });
});
