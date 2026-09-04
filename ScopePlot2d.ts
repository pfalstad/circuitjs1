/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

import { CircuitElm } from "./CircuitElm";
import { Color } from "./Color";
import { Graphics } from "./Graphics";
import { Scope } from "./Scope";
import { ChipState } from "./digital/chip";
import type { Chip, HistoryWatcher } from "./digital/chip";

export class ScopePlot2d implements HistoryWatcher {
    enabled: boolean = false;
    plotXY: boolean = false;
    scaleX: number;
    scaleY: number;

    // X/Y axis plot indices (into scope.plots)
    plotX: number = 0;
    plotY: number = 1;
    // Modulator plot indices (-1 = none)
    plotBrightness: number = -1;
    plotColorR: number = -1;
    plotColorG: number = -1;
    plotColorB: number = -1;
    // Auto-scales for modulator plots
    scaleBrightness: number = 5;
    scaleR: number = 5;
    scaleG: number = 5;
    scaleB: number = 5;

    // --- Digital raster mode ---
    //
    digitalRaster: boolean = false;
    rasterLineWidthSec: number = 1e-5;
    rasterFrameLengthSec: number = 1e-3;
    private rasterFrameIndex: number = -1;

    // Tick (relative to the scheduler, not the frame) already painted up to
    private rasterFilledTick: number = -1;

    // globalTime as of the start of the current "cold" catch-up - refreshed in fillDigitalRaster()
    private historyEpoch: number = 0;

    // The raw 0/1 digital value in effect as of rasterFilledTick
    private curVal: number = 0;

    private watchedChip: Chip | null = null;

    private imageCanvas: HTMLCanvasElement | null = null;
    private imageContext: CanvasRenderingContext2D | null = null;
    private draw_ox: number = -1;
    private draw_oy: number = -1;
    private alphaCounter: number = 0;
    trailPersistence: number = 0;
    static readonly DEFAULT_TRAIL_PERSISTENCE = 0;
    lastTrailSimTime: number = -1;

    scope: Scope;

    constructor(scope: Scope) {
        this.scope = scope;
        this.scaleX = 5;
        this.scaleY = .1;
    }

    allocImage(): void {
        if (!this.enabled)
            return;
        if (this.imageCanvas === null) {
            this.imageCanvas = document.createElement("canvas");
            this.imageContext = this.imageCanvas.getContext("2d");
        }
        this.imageCanvas.width  = this.scope.rect.width;
        this.imageCanvas.height = this.scope.rect.height;
        this.clearView();
        // Canvas just got wiped/resized - force fillDigitalRaster() to
        // clear-and-restart the current frame rather than trying to resume
        // painting into content that no longer exists.
        this.rasterFrameIndex = -1;
        this.rasterFilledTick = -1;
    }

    clearView(): void {
        if (this.imageContext !== null) {
            this.imageContext.fillStyle = this.scope.app.isPrintable() ? "#eee" : "#111";
            this.imageContext.fillRect(0, 0, this.scope.rect.width - 1, this.scope.rect.height - 1);
        }
        this.draw_ox = this.draw_oy = -1;
    }

    calcGridPx(width: number, height: number): number {
        const m = Math.min(width, height);
        return (m / 2) / (this.scope.manDivisions / 2 + 0.05);
    }

    // Draw a segment from (ox,oy) to (x2,y2) with the given color and alpha.
    drawSegment(ox: number, oy: number, x2: number, y2: number, color: string, alpha: number): void {
        if (alpha !== 1.0)
            this.imageContext!.globalAlpha = alpha;
        this.imageContext!.strokeStyle = color;
        this.imageContext!.beginPath();
        this.imageContext!.moveTo(ox, oy);
        this.imageContext!.lineTo(x2, y2);
        this.imageContext!.stroke();
        if (alpha !== 1.0)
            this.imageContext!.globalAlpha = 1.0;
    }

    drawTo(x2: number, y2: number, color?: string, alpha?: number): void {
        if (this.draw_ox === -1) {
            this.draw_ox = x2;
            this.draw_oy = y2;
            return;
        }
        const c = color ?? (this.scope.app.isPrintable() ? "#000000" : "#ffffff");
        this.drawSegment(this.draw_ox, this.draw_oy, x2, y2, c, alpha ?? 1.0);
        this.draw_ox = x2;
        this.draw_oy = y2;
    }

    // Compute the draw color from R/G/B modulator plots.
    computeColor(): string {
        if (this.plotColorR < 0 && this.plotColorG < 0 && this.plotColorB < 0)
            return this.scope.app.isPrintable() ? "#000000" : "#ffffff";
        let r = 0, g = 0, b = 0;
        if (this.plotColorR >= 0 && this.plotColorR < this.scope.plots.length) {
            const rv = this.scope.plots[this.plotColorR].lastValue;
            while (rv > this.scaleR) this.scaleR *= 2;
            r = Math.trunc(Math.max(0, Math.min(255, (rv / this.scaleR) * 255)));
        }
        if (this.plotColorG >= 0 && this.plotColorG < this.scope.plots.length) {
            const gv = this.scope.plots[this.plotColorG].lastValue;
            while (gv > this.scaleG) this.scaleG *= 2;
            g = Math.trunc(Math.max(0, Math.min(255, (gv / this.scaleG) * 255)));
        }
        if (this.plotColorB >= 0 && this.plotColorB < this.scope.plots.length) {
            const bv = this.scope.plots[this.plotColorB].lastValue;
            while (bv > this.scaleB) this.scaleB *= 2;
            b = Math.trunc(Math.max(0, Math.min(255, (bv / this.scaleB) * 255)));
        }
        return "rgb(" + r + "," + g + "," + b + ")";
    }

    // Compute draw alpha from the brightness modulator plot (0 = off, 1 = full).
    computeAlpha(): number {
        if (this.plotBrightness < 0 || this.plotBrightness >= this.scope.plots.length)
            return 1.0;
        const bv = Math.abs(this.scope.plots[this.plotBrightness].lastValue);
        while (bv > this.scaleBrightness) this.scaleBrightness *= 2;
        return this.scaleBrightness > 0 ? bv / this.scaleBrightness : 0;
    }

    // Clamp plotX/plotY to valid range.
    validPlotIndex(idx: number, defaultIdx: number): number {
        if (this.scope.plots.length === 0) return 0;
        if (idx < 0 || idx >= this.scope.plots.length) return Math.min(defaultIdx, this.scope.plots.length - 1);
        return idx;
    }

    // HistoryWatcher: everything fillDigitalRaster() has already painted (i.e. everything
    // before rasterFilledTick) is gone for good - a raster span, once drawn into the persistent
    // canvas bitmap, is never read from `history` again. -1 (nothing painted yet, or just
    // switched signals - see fillDigitalRaster()'s own sync check) reports no floor at all, so
    // Chip.trimHistory() won't discard anything on this watcher's account until it catches up.
    historyFloor(): bigint {
        return this.rasterFilledTick < 0 ? -1n : BigInt(this.rasterFilledTick);
    }

    // Stops watching this raster's current chip (if any) for good - called wherever the owning
    // Scope itself is being discarded rather than just reconfigured (see Scope.ts's setElm()).
    detach(): void {
        this.watchedChip?.removeHistoryWatcher(this);
        this.watchedChip = null;
    }

    /** Rebuilds the raster image from the signal's own change-list history (Chip.history)
     * instead of sampling every timestep - see ScopePlot.fillFromDigitalHistory() for why
     * (digital fast-path sleep would otherwise be defeated or missed). Called once per draw(),
     * not once per tick.
     *
     * Paints the in-progress frame left-to-right/top-to-bottom as `now` advances, overwriting
     * the previous frame's content line by line as the beam reaches it (CRT-phosphor style) -
     * no separate clear needed except on a genuine cold start (see `coldStart`). If
     * rasterLineWidthSec/rasterFrameLengthSec don't match the signal's real timing the image
     * won't lock, like an old TV's hold controls. */
    fillDigitalRaster(): void {
        if (this.imageContext === null) return;
        const bp = (this.plotBrightness >= 0 && this.plotBrightness < this.scope.plots.length)
            ? this.scope.plots[this.plotBrightness] : null;
        const chip = bp?.digitalChip ?? null;
        if (chip !== this.watchedChip) {
            // Brightness source changed - rebind the history watcher and reset the raster
            // cursor/frame (rasterFilledTick/rasterFrameIndex are meaningless against a
            // different chip's history).
            this.watchedChip?.removeHistoryWatcher(this);
            this.watchedChip = chip;
            if (chip !== null) chip.addHistoryWatcher(this);
            this.rasterFilledTick = -1;
            this.rasterFrameIndex = -1;
        }
        if (chip === null) return;
        // Captured before anything below can mutate rasterFilledTick - tells historyEpoch/curVal
        // seeding below whether this is a true cold (re)start or a continuation.
        const coldStart = this.rasterFilledTick < 0;
        if (coldStart) {
            // Also covers Scope.ts's allocImage() reset (resize/speed change) without a chip
            // switch. historyEpoch must track "now", not a stale earlier attach time - see its
            // own field comment.
            this.historyEpoch = Number(chip.circuit.globalTime);
        }
        const maxTimeStep = this.scope.sim.maxTimeStep;
        if (!(maxTimeStep > 0)) return;

        const lineWidthTicks = Math.max(1, Math.round(this.rasterLineWidthSec / maxTimeStep));
        const linesPerFrame = Math.max(1, Math.round(this.rasterFrameLengthSec / (lineWidthTicks * maxTimeStep)));
        const frameLengthTicks = lineWidthTicks * linesPerFrame;

        const globalTime = chip.circuit.globalTime;
        const backfilledTo = chip.state === ChipState.ASLEEP ? chip.backfillHistory(globalTime) : globalTime;
        // backfillHistory() may not fully catch up in one call (see its own docstring) - clamp
        // to what it actually reached, or the gap gets painted stale and marked done for good.
        const now = Number(backfilledTo < globalTime ? backfilledTo : globalTime);

        const frameIndex = Math.floor(now / frameLengthTicks);
        const frameStart = frameIndex * frameLengthTicks;
        const canvasWidth = this.scope.rect.width;
        const canvasHeight = this.scope.rect.height;

        const hist = chip.history; // ascending {time, value}

        let fillFromTick: number;
        if (frameIndex !== this.rasterFrameIndex) {
            const prevFrameIndex = this.rasterFrameIndex;
            this.rasterFrameIndex = frameIndex;
            if (coldStart) {
                // Only a genuine cold start clears the whole canvas - an ordinary frame wrap
                // leaves the previous frame's image in place, overwritten line by line below.
                this.imageContext.fillStyle = this.rasterOffColor();
                this.imageContext.fillRect(0, 0, canvasWidth, canvasHeight);
            } else {
                // Finish the outgoing frame's tail (wherever the last call left off, through
                // that frame's real end) before switching frames - otherwise the beam restarts
                // at row 0 and the tail near the bottom is dropped on every wrap, never refreshed.
                const prevFrameStart = prevFrameIndex * frameLengthTicks;
                const prevFrameEnd = prevFrameStart + frameLengthTicks;
                let lo3 = 0, hi3 = hist.length;
                while (lo3 < hi3) {
                    const mid = (lo3 + hi3) >> 1;
                    if (Number(hist[mid].time) <= this.rasterFilledTick) lo3 = mid + 1; else hi3 = mid;
                }
                let tCursor = this.rasterFilledTick;
                let v = this.curVal;
                for (let j = lo3; j < hist.length && Number(hist[j].time) < prevFrameEnd; j++) {
                    const t3 = Number(hist[j].time);
                    this.drawRasterSpan(tCursor - prevFrameStart, t3 - prevFrameStart, !!v,
                        lineWidthTicks, linesPerFrame, canvasWidth, canvasHeight);
                    tCursor = t3;
                    v = hist[j].value;
                }
                this.drawRasterSpan(tCursor - prevFrameStart, prevFrameEnd - prevFrameStart, !!v,
                    lineWidthTicks, linesPerFrame, canvasWidth, canvasHeight);
            }
            // Never claim to paint from before this watcher started - see historyEpoch's comment.
            fillFromTick = Math.max(frameStart, this.historyEpoch);
        } else {
            if (this.rasterFilledTick === now) return; // already caught up
            fillFromTick = this.rasterFilledTick;
        }
        // curVal bookkeeping must WALK from rasterFilledTick even when fillFromTick (a frame
        // boundary) is later - transitions in that gap aren't painted (old frame, already
        // handled above) but still have to update curVal.
        const walkFrom = coldStart ? fillFromTick : this.rasterFilledTick;
        let lo = 0, hi = hist.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (Number(hist[mid].time) <= walkFrom) lo = mid + 1; else hi = mid;
        }
        let curVal: number;
        if (coldStart) {
            curVal = lo > 0 ? hist[lo - 1].value : (hist.length > 0 ? (hist[0].value ^ 1) : chip.output);
        } else {
            curVal = this.curVal;
        }
        let cursor = fillFromTick; // painting starts here regardless of where walking started
        let i = lo;
        for (; i < hist.length && Number(hist[i].time) < now; i++) {
            const t = Number(hist[i].time);
            if (t > fillFromTick) {
                this.drawRasterSpan(cursor - frameStart, t - frameStart, !!curVal,
                    lineWidthTicks, linesPerFrame, canvasWidth, canvasHeight);
                cursor = t;
            }
            // Still applied even when t <= fillFromTick (walked but not painted) - keeps curVal
            // correct across a frame-boundary crossing.
            curVal = hist[i].value;
        }
        this.drawRasterSpan(cursor - frameStart, now - frameStart, !!curVal,
            lineWidthTicks, linesPerFrame, canvasWidth, canvasHeight);

        // A transition exactly at `now` is excluded from the paint above (half-open range) but
        // must still be folded into curVal, since `now` becomes the next call's walkFrom - left
        // for that call instead, its own walkFrom search would skip it too, losing it for good.
        if (i < hist.length && Number(hist[i].time) === now) curVal = hist[i].value;

        this.curVal = curVal;
        this.rasterFilledTick = now;
    }

    // Paints one constant-value run of raster time [fromTick, toTick)
    // (already relative to the current frame's own start) as filled rects.
    private drawRasterSpan(fromTick: number, toTick: number, value: boolean,
            lineWidthTicks: number, linesPerFrame: number, canvasWidth: number, canvasHeight: number): void {
        if (toTick <= fromTick) return;
        this.imageContext!.fillStyle = value ? this.rasterOnColor() : this.rasterOffColor();
        let t = fromTick;
        while (t < toTick) {
            const line = Math.floor(t / lineWidthTicks);
            const lineStartTick = line * lineWidthTicks;
            const offsetInLine = t - lineStartTick;
            const remaining = toTick - t;
            if (offsetInLine === 0 && remaining >= lineWidthTicks) {
                const fullLines = Math.min(Math.floor(remaining / lineWidthTicks), linesPerFrame - line);
                const py0 = line / linesPerFrame * canvasHeight;
                const py1 = (line + fullLines) / linesPerFrame * canvasHeight;
                this.imageContext!.fillRect(0, py0, canvasWidth, py1 - py0);
                t += fullLines * lineWidthTicks;
            } else {
                const segTicks = Math.min(lineWidthTicks - offsetInLine, remaining);
                const px0 = offsetInLine / lineWidthTicks * canvasWidth;
                const px1 = (offsetInLine + segTicks) / lineWidthTicks * canvasWidth;
                const py0 = line / linesPerFrame * canvasHeight;
                const py1 = (line + 1) / linesPerFrame * canvasHeight;
                this.imageContext!.fillRect(px0, py0, Math.max(1, px1 - px0), py1 - py0);
                t += segTicks;
            }
        }
    }

    private rasterOnColor(): string  { return this.scope.app.isPrintable() ? "#000000" : "#ffffff"; }
    private rasterOffColor(): string { return this.scope.app.isPrintable() ? "#ffffff" : "#000000"; }

    timeStep(): void {
        if (this.imageContext === null || this.scope.plots.length < 1)
            return;
        const px = this.validPlotIndex(this.plotX, 0);
        const py = this.validPlotIndex(this.plotY, Math.min(1, this.scope.plots.length - 1));
        const v    = this.scope.plots[px].lastValue;
        const yval = this.scope.plots[py].lastValue;
        let x: number, y: number;
        if (!this.scope.isManualScale()) {
            let newscale = false;
            while (v > this.scaleX || v < -this.scaleX)    { this.scaleX *= 2; newscale = true; }
            while (yval > this.scaleY || yval < -this.scaleY) { this.scaleY *= 2; newscale = true; }
            if (newscale)
                this.clearView();
            x = Math.trunc(this.scope.rect.width  * (1 + v    / this.scaleX) * .499);
            y = Math.trunc(this.scope.rect.height * (1 - yval / this.scaleY) * .499);
        } else {
            const gridPx = this.calcGridPx(this.scope.rect.width, this.scope.rect.height);
            x = Math.trunc(this.scope.rect.width  * .499 + (v    / this.scope.plots[px].manScale) * gridPx + gridPx * this.scope.manDivisions * this.scope.plots[px].manVPosition  / Scope.V_POSITION_STEPS);
            y = Math.trunc(this.scope.rect.height * .499 - (yval / this.scope.plots[py].manScale) * gridPx - gridPx * this.scope.manDivisions * this.scope.plots[py].manVPosition / Scope.V_POSITION_STEPS);
        }
        this.drawTo(x, y, this.computeColor(), this.computeAlpha());
    }

    maxScale(): void {
        const x = 1e-8;
        this.scope.scale[Scope.UNITS_V]    *= x;
        this.scope.scale[Scope.UNITS_A]    *= x;
        this.scope.scale[Scope.UNITS_OHMS] *= x;
        this.scope.scale[Scope.UNITS_W]    *= x;
        this.scope.scale[Scope.UNITS_C]    *= x;
        this.scaleX            *= x;
        this.scaleY            *= x;
        this.scaleBrightness   *= x;
        this.scaleR            *= x;
        this.scaleG            *= x;
        this.scaleB            *= x;
    }

    draw(g: Graphics): void {
        if (this.imageContext === null)
            return;
        if (this.digitalRaster) {
            this.drawRaster(g);
            return;
        }
        g.context.save();
        g.context.translate(this.scope.rect.x, this.scope.rect.y);
        g.clipRect(0, 0, this.scope.rect.width, this.scope.rect.height);

        this.alphaCounter++;
        if (this.alphaCounter > 2) {
            this.alphaCounter = 0;
            let fadeAlpha: number;
            if (this.trailPersistence <= 0) {
                fadeAlpha = 0.01;
            } else {
                // Sim-time exponential fade; time constant = trailPersistence * maxTimeStep (seconds).
                // Don't advance lastTrailSimTime until fadeAlpha is large enough; otherwise sub-pixel
                // alphas have no effect on an 8-bit canvas and the trail never fades at low speed.
                if (this.lastTrailSimTime < 0 || this.scope.sim.t < this.lastTrailSimTime)
                    this.lastTrailSimTime = this.scope.sim.t;
                const elapsed   = this.scope.sim.t - this.lastTrailSimTime;
                const timeConst = this.trailPersistence * this.scope.sim.maxTimeStep;
                fadeAlpha = 1.0 - Math.exp(-elapsed / timeConst);
                if (fadeAlpha >= 3.0 / 255)
                    this.lastTrailSimTime = this.scope.sim.t;
                else
                    fadeAlpha = 0;
            }
            if (fadeAlpha > 0) {
                this.imageContext.globalAlpha = fadeAlpha;
                this.imageContext.fillStyle = this.scope.app.isPrintable() ? "#ffffff" : "#000000";
                this.imageContext.fillRect(0, 0, this.scope.rect.width, this.scope.rect.height);
                this.imageContext.globalAlpha = 1.0;
            }
        }

        g.context.drawImage(this.imageCanvas!, 0, 0);
        g.setColor(CircuitElm.whiteColor);
        g.fillOval(this.draw_ox - 2, this.draw_oy - 2, 5, 5);
        g.setColor(CircuitElm.positiveColor);
        g.drawLine(0, this.scope.rect.height / 2, this.scope.rect.width - 1, this.scope.rect.height / 2);
        if (!this.plotXY)
            g.setColor(Color.yellow);
        g.drawLine(this.scope.rect.width / 2, 0, this.scope.rect.width / 2, this.scope.rect.height - 1);
        if (this.scope.isManualScale()) {
            const gridPx = this.calcGridPx(this.scope.rect.width, this.scope.rect.height);
            g.setColor("#404040");
            for (let i = -this.scope.manDivisions; i <= this.scope.manDivisions; i++) {
                if (i !== 0)
                    g.drawLine(Math.trunc(gridPx * i) + this.scope.rect.width  / 2, 0,
                               Math.trunc(gridPx * i) + this.scope.rect.width  / 2, this.scope.rect.height);
                g.drawLine(0,                          Math.trunc(gridPx * i) + this.scope.rect.height / 2,
                           this.scope.rect.width,      Math.trunc(gridPx * i) + this.scope.rect.height / 2);
            }
        }
        this.scope.overlays.textY = 10;
        g.setColor(CircuitElm.whiteColor);
        if (this.scope.text != null)
            this.scope.drawInfoText(g, this.scope.text);
        const px = this.validPlotIndex(this.plotX, 0);
        const py = this.validPlotIndex(this.plotY, Math.min(1, this.scope.plots.length - 1));
        if (this.scope.showScale && this.scope.plots.length >= 1 && this.scope.isManualScale() &&
                px < this.scope.plots.length && py < this.scope.plots.length) {
            const spx = this.scope.plots[px];
            const spy = this.scope.plots[py];
            this.scope.drawInfoText(g, "X=" + spx.getUnitText(spx.manScale) + "/div, Y=" + spy.getUnitText(spy.manScale) + "/div");
        }
        g.context.restore();
        this.scope.drawSettingsWheel(g);
        if (!this.scope.app.dialogIsShowing() &&
                this.scope.rect.contains(this.scope.app.mouse.mouseCursorX, this.scope.app.mouse.mouseCursorY) &&
                this.scope.plots.length >= 1 && px < this.scope.plots.length && py < this.scope.plots.length) {
            const gridPx = this.calcGridPx(this.scope.rect.width, this.scope.rect.height);
            const info: string[] = new Array(2);
            const spx = this.scope.plots[px];
            const spy = this.scope.plots[py];
            let xValue: number, yValue: number;
            if (this.scope.isManualScale()) {
                xValue =  spx.manScale * ((this.scope.app.mouse.mouseCursorX - this.scope.rect.x - this.scope.rect.width  / 2) / gridPx - this.scope.manDivisions * spx.manVPosition / Scope.V_POSITION_STEPS);
                yValue =  spy.manScale * ((-this.scope.app.mouse.mouseCursorY + this.scope.rect.y + this.scope.rect.height / 2) / gridPx - this.scope.manDivisions * spy.manVPosition / Scope.V_POSITION_STEPS);
            } else {
                xValue =  ((this.scope.app.mouse.mouseCursorX - this.scope.rect.x) / (0.499 * this.scope.rect.width)  - 1.0) * this.scaleX;
                yValue = -((this.scope.app.mouse.mouseCursorY - this.scope.rect.y) / (0.499 * this.scope.rect.height) - 1.0) * this.scaleY;
            }
            info[0] = spx.getUnitText(xValue);
            info[1] = spy.getUnitText(yValue);
            this.scope.drawCursorInfo(g, info, 2, this.scope.app.mouse.mouseCursorX, true);
        }
    }

    /** Draw path for digital raster mode - just the image (built entirely
     * by fillDigitalRaster(), called before this from Scope.draw()) plus a
     * label; none of the X-Y mode's crosshairs/grid/trail-fade/cursor
     * readout apply to a raster image. */
    private drawRaster(g: Graphics): void {
        g.context.save();
        g.context.translate(this.scope.rect.x, this.scope.rect.y);
        g.clipRect(0, 0, this.scope.rect.width, this.scope.rect.height);
        g.context.drawImage(this.imageCanvas!, 0, 0);

        this.scope.overlays.textY = 10;
        g.setColor(CircuitElm.whiteColor);
        if (this.scope.text != null)
            this.scope.drawInfoText(g, this.scope.text);
        const bp = (this.plotBrightness >= 0 && this.plotBrightness < this.scope.plots.length)
            ? this.scope.plots[this.plotBrightness] : null;
        const label = (bp !== null && bp.elm !== null) ? bp.elm.getClassName().replace("Elm", "") : "no signal";
        this.scope.drawInfoText(g, label + ": " + CircuitElm.getUnitText(this.rasterLineWidthSec, "s") + "/line, " +
            CircuitElm.getUnitText(this.rasterFrameLengthSec, "s") + "/frame");

        g.context.restore();
        this.scope.drawSettingsWheel(g);
    }
}
