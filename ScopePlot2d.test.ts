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
        circuit: { globalTime: nowTicks },
        state: ChipState.PASSIVE,
        history: [] as { time: number; value: number }[],
        output: 0,
        backfillHistory: vi.fn((t: number) => t),
        addHistoryWatcher: vi.fn(),
        removeHistoryWatcher: vi.fn(),
    } as any;
}

// Records each fillRect call together with whatever fillStyle was set at the time (fillStyle is
// assigned as a plain property before each fillRect call in the real drawing code, exactly the
// way a real CanvasRenderingContext2D is used) - lets a test check WHAT COLOR got painted WHERE,
// not just that some drawing happened.
function fakeCanvasContext() {
    const calls: { style: string; x: number; y: number; w: number; h: number }[] = [];
    let fillStyle = "";
    return {
        get fillStyle() { return fillStyle; },
        set fillStyle(v: string) { fillStyle = v; },
        fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
            calls.push({ style: fillStyle, x, y, w, h });
        }),
        calls,
    } as any;
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

        expect(plot2d.historyFloor()).toBe(-1); // nothing painted yet
        plot2d.fillDigitalRaster();
        expect(plot2d.historyFloor()).toBe(100);
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
        // against chipB in this same call, it lands on chipB's own `now` (100), not some
        // leftover chipA value - the reset itself (the -1 moment in between) isn't separately
        // observable since both happen within one fillDigitalRaster() call.
        expect(plot2d.historyFloor()).toBe(100);
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

    // Regression for a real reported bug ("white glitches" on a raster, worse the slower the
    // simulated signal): a new raster frame's own fillFromTick used to be `frameStart` alone,
    // computed purely from `now` and the frame width - with no regard for whether recording for
    // this chip (Chip.historyWatched) even went back that far. See historyEpoch's own comment.
    it("never paints a color-guessed span before historyEpoch, even when a frame boundary predates it", () => {
        // 1 tick/line, 10 lines/frame -> frameLengthTicks=10, and canvasHeight=10 makes each
        // line exactly one pixel row (py0=line, py1=line+1) - so row `r` of fillRect calls maps
        // directly to frame-relative tick `r`.
        const chip = fakeChip(25); // attaches at t=25
        chip.history = [{ time: 30, value: 0 }]; // first REAL transition recorded at t=30
        const scope = fakeScope([{ digitalChip: chip }]);
        scope.sim.maxTimeStep = 1;
        scope.rect = { width: 10, height: 10 };
        const plot2d = new ScopePlot2d(scope);
        const ctx = fakeCanvasContext();
        (plot2d as any).imageContext = ctx;
        plot2d.plotBrightness = 0;
        plot2d.rasterLineWidthSec = 1;
        plot2d.rasterFrameLengthSec = 10;

        // t=25: registers (historyEpoch=25). frameStart for t=25 is 20 - a full 5 ticks before
        // historyEpoch, exactly the gap that used to get wrongly painted.
        plot2d.fillDigitalRaster();
        expect((plot2d as any).historyEpoch).toBe(25);

        // t=29: still the same raster frame (frameStart still 20) - paints [25,29) using the
        // "invert hist[0]" guess (curVal=1, valid here since nothing toggled between 25 and 29).
        chip.circuit.globalTime = 29;
        plot2d.fillDigitalRaster();

        const onColor = "#ffffff"; // rasterOnColor() when not printable
        const paintedOnRows = ctx.calls
            .filter((c: any) => c.style === onColor)
            .map((c: any) => c.y);
        // Rows 0-4 are frame-relative ticks 20-24, i.e. before historyEpoch - must never be
        // painted "on" (or any color) by a guess with no data behind it; only rows 5-8 (ticks
        // 25-28, since only [25,29) was ever asked for) may be.
        for (const y of paintedOnRows) {
            expect(y).toBeGreaterThanOrEqual(5);
            expect(y).toBeLessThan(9);
        }
        expect(paintedOnRows.length).toBeGreaterThan(0); // sanity - something WAS painted "on"
    });

    // Regression for the same "white glitches" report, but specifically the "mid-simulation,
    // no chip switch involved" trigger: Scope.ts's allocImage() (called whenever resetGraph()
    // fires - a resize, or a maxTimeStep/speed change) zeroes rasterFilledTick/rasterFrameIndex
    // directly, without going through fillDigitalRaster() at all - it has no way to refresh a
    // private field on this class. If historyEpoch were left at its original (now long-stale)
    // attach-time value, the next cold catch-up would wrongly treat everything back to THAT as
    // safe to read, even though this same watcher's own earlier progress has since let
    // trimHistory() legitimately discard everything before its old rasterFilledTick.
    it("refreshes historyEpoch on a reset that doesn't switch chips (allocImage()'s resize/speed-change path)", () => {
        const chip = fakeChip(5); // original attach
        const scope = fakeScope([{ digitalChip: chip }]);
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.plotBrightness = 0;
        plot2d.fillDigitalRaster();
        expect((plot2d as any).historyEpoch).toBe(5);

        // Simulate having painted/consumed far past the original attach, and trimHistory()
        // having reclaimed everything before that on this watcher's own account - by t=600,
        // nothing from anywhere near t=5 survives any more.
        (plot2d as any).rasterFilledTick = 500;
        chip.history = [];

        // allocImage()'s own reset - same chip, no fillDigitalRaster() call in between.
        (plot2d as any).rasterFilledTick = -1;
        (plot2d as any).rasterFrameIndex = -1;

        chip.circuit.globalTime = 600;
        plot2d.fillDigitalRaster();

        // Refreshed to the NEW cold-restart time, not left at the stale original attach value -
        // gives the "invert hist[0]" bootstrap a floor that's actually still backed by data.
        expect((plot2d as any).historyEpoch).toBe(600);
        expect(chip.addHistoryWatcher).toHaveBeenCalledTimes(1); // still the same registration - no re-add
    });

    it("a reset without a chip switch never paints a guessed span before the refreshed historyEpoch", () => {
        const chip = fakeChip(5);
        chip.history = [{ time: 610, value: 0 }]; // only data from well after the reset survives
        const scope = fakeScope([{ digitalChip: chip }]);
        scope.sim.maxTimeStep = 1;
        scope.rect = { width: 10, height: 10 };
        const plot2d = new ScopePlot2d(scope);
        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.plotBrightness = 0;
        plot2d.rasterLineWidthSec = 1;
        plot2d.rasterFrameLengthSec = 10; // frameLengthTicks=10 -> frame for t=600..609 starts at 600

        plot2d.fillDigitalRaster(); // original attach at t=5 (historyEpoch=5, now stale)

        // Mid-run reset (allocImage(), no chip switch) landing partway through what will be a
        // NEW frame once we resume - frameStart(600)=600, well before historyEpoch would need
        // to be for real data to exist there.
        (plot2d as any).rasterFilledTick = -1;
        (plot2d as any).rasterFrameIndex = -1;

        const ctx = fakeCanvasContext();
        (plot2d as any).imageContext = ctx;
        chip.circuit.globalTime = 604; // t=604: mid-frame, mid-drawing
        plot2d.fillDigitalRaster();

        expect((plot2d as any).historyEpoch).toBe(604); // refreshed to right where we resumed

        const onColor = "#ffffff";
        const paintedOnRows = ctx.calls.filter((c: any) => c.style === onColor);
        // Nothing could have been painted "on" at all: fillFromTick got clamped up to 604 (the
        // refreshed historyEpoch), and `now` is ALSO 604 - a zero-width span, nothing to guess.
        // (Without the fix, fillFromTick would have been frameStart=600, and hist[0]=610 non-
        // empty would trigger the "invert hist[0]" guess across rows 0-3, ticks 600-603 - a span
        // with literally no surviving data behind it.)
        expect(paintedOnRows.length).toBe(0);
    });

    // The behavior this test file is named for: a genuine cold start (first-ever draw here) still
    // clears the whole canvas, so a fresh raster never shows stale content from an unrelated
    // earlier signal or leftover canvas garbage.
    it("clears the whole canvas on a genuine cold start", () => {
        const chip = fakeChip(5);
        const scope = fakeScope([{ digitalChip: chip }]);
        const plot2d = new ScopePlot2d(scope);
        const ctx = fakeCanvasContext();
        (plot2d as any).imageContext = ctx;
        plot2d.plotBrightness = 0;

        plot2d.fillDigitalRaster();

        const fullClear = ctx.calls.some((c: any) => c.x === 0 && c.y === 0 && c.w === 10 && c.h === 10);
        expect(fullClear).toBe(true);
    });

    // The actual fix: an ordinary frame wrap (the raster beam simply starting a new pass, with no
    // chip switch or reset involved) must NOT blank the whole canvas - the previous frame's image
    // stays on screen and gets overwritten only line by line as the beam sweeps over it again (see
    // fillDigitalRaster()'s own docstring). Previously every frame wrap did a full-canvas
    // fillRect() first, flashing the display to black once per frame.
    it("does not clear the whole canvas on an ordinary frame wrap", () => {
        const chip = fakeChip(0);
        const scope = fakeScope([{ digitalChip: chip }]);
        scope.sim.maxTimeStep = 1;
        scope.rect = { width: 10, height: 10 };
        const plot2d = new ScopePlot2d(scope);
        plot2d.plotBrightness = 0;
        plot2d.rasterLineWidthSec = 1;
        plot2d.rasterFrameLengthSec = 10; // frameLengthTicks = 10

        (plot2d as any).imageContext = fakeCanvasContext();
        plot2d.fillDigitalRaster(); // cold start, frame [0,10)

        const ctx = fakeCanvasContext();
        (plot2d as any).imageContext = ctx;
        chip.circuit.globalTime = 15; // now in frame [10,20) - an ordinary wrap, not a reset
        plot2d.fillDigitalRaster();

        const fullClear = ctx.calls.some((c: any) => c.x === 0 && c.y === 0 && c.w === 10 && c.h === 10);
        expect(fullClear).toBe(false);
    });
});
