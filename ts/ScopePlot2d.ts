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

export class ScopePlot2d {
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

    private imageCanvas: HTMLCanvasElement | null = null;
    private imageContext: CanvasRenderingContext2D | null = null;
    private tmpCanvas: HTMLCanvasElement | null = null;   // scratch copy of the trail, for rescaling it
    private draw_ox: number = -1;
    private draw_oy: number = -1;
    private alphaCounter: number = 0;
    trailPersistence: number = 0;
    static readonly DEFAULT_TRAIL_PERSISTENCE = 0;
    lastTrailSimTime: number = -1;
    // measured sim time per drawn frame, to express the frame-based default fade in sim time
    simPerFrame: number = 0;
    private lastFrameSimTime: number = -1;

    scope: Scope;

    // ---- Auto-fit (Auto / Auto Max Scale modes) ----
    // Each axis is fitted to the data seen over the last one to two "fit windows" (the scope's
    // horizontal time span), so the plot fills the scope, follows the trace and shrinks again
    // after a transient.  Index [0] is X, [1] is Y.
    includeOrigin: boolean = true;   // keep (0,0) in the fitted range so the axes stay visible
    alignX: boolean = false;         // share the X range with other scopes that also have alignX set
    static readonly FIT_MARGIN = .1;     // fraction of width/height left empty on each edge
    static readonly SHRINK_RATIO = .5;   // shrink when the data uses less than this much of the range
    static readonly EXPAND_TOL = .05;    // a point may overshoot the range by this much (fraction of
                                         // the range, drawn into the edge margin) before we refit
    private curLo: number[] = [0, 0];  private curHi: number[] = [0, 0];    // data range, current window
    private prevLo: number[] = [0, 0]; private prevHi: number[] = [0, 0];   // data range, previous window
    private haveCur: boolean = false;
    private havePrev: boolean = false;
    private windowStart: number = -1;
    private wantLo: number[] = [0, 0]; private wantHi: number[] = [0, 0];   // range this scope wants
    private haveWant: boolean = false;
    private dispLo: number[] = [0, 0]; private dispHi: number[] = [0, 0];   // range being displayed
    private haveDisp: boolean = false;
    private shrinkVotes: number = 0;   // consecutive window checks that found the range too big

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
    }

    clearView(): void {
        this.fillBackground();
        this.draw_ox = this.draw_oy = -1;
    }

    fillBackground(): void {
        if (this.imageContext !== null) {
            this.imageContext.fillStyle = this.scope.app.isPrintable() ? "#eee" : "#111";
            this.imageContext.fillRect(0, 0, this.scope.rect.width - 1, this.scope.rect.height - 1);
        }
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

    timeStep(): void {
        if (this.imageContext === null || this.scope.plots.length < 1)
            return;
        const px = this.validPlotIndex(this.plotX, 0);
        const py = this.validPlotIndex(this.plotY, Math.min(1, this.scope.plots.length - 1));
        const v    = this.scope.plots[px].lastValue;
        const yval = this.scope.plots[py].lastValue;
        let x: number, y: number;
        if (!this.scope.isManualScale()) {
            this.fitPoint(v, yval);
            x = this.toPixel(0, v);
            y = this.toPixel(1, yval);
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
        // X/Y auto-fit just starts over
        this.resetFit();
        this.clearView();
        this.scaleBrightness   *= x;
        this.scaleR            *= x;
        this.scaleG            *= x;
        this.scaleB            *= x;
    }

    resetFit(): void {
        this.haveCur = this.havePrev = this.haveWant = this.haveDisp = false;
        this.windowStart = -1;
        this.shrinkVotes = 0;
    }

    // sim time covered by one fit window: the scope's horizontal span (width * speed timesteps)
    fitWindow(): number {
        return Math.max(this.scope.rect.width, 1) * this.scope.speed * this.scope.sim.maxTimeStep;
    }

    // Record a new X/Y point.  Refit if it leaves the displayed range by more than EXPAND_TOL
    // (without a tolerance, every tiny new extreme -- sampling jitter, a Q-point still settling --
    // forced a refit), or, checked once per window, if the data has become much smaller than the
    // range, so a transient rolls off after a few windows.
    fitPoint(xv: number, yv: number): void {
        const t = this.scope.sim.t;
        if (this.windowStart < 0 || t < this.windowStart) {
            this.resetFit();
            this.windowStart = t;
        }
        let rolled = false;
        if (t - this.windowStart >= this.fitWindow()) {
            for (let a = 0; a < 2; a++) {
                this.prevLo[a] = this.curLo[a];
                this.prevHi[a] = this.curHi[a];
            }
            this.havePrev = this.haveCur;
            this.haveCur = false;
            this.windowStart = t;
            rolled = true;
        }
        if (!this.haveCur) {
            this.curLo[0] = this.curHi[0] = xv;
            this.curLo[1] = this.curHi[1] = yv;
            this.haveCur = true;
        } else {
            this.curLo[0] = Math.min(this.curLo[0], xv); this.curHi[0] = Math.max(this.curHi[0], xv);
            this.curLo[1] = Math.min(this.curLo[1], yv); this.curHi[1] = Math.max(this.curHi[1], yv);
        }
        let refit = !this.haveDisp || this.outside(0, xv) || this.outside(1, yv);
        if (rolled && !refit) {
            // shrink only when two window checks in a row agree, so a trace slower than one
            // window doesn't shrink and re-expand every window
            this.calcWant();
            let small = false;
            for (let a = 0; a < 2; a++)
                if (this.wantHi[a] - this.wantLo[a] < ScopePlot2d.SHRINK_RATIO * (this.dispHi[a] - this.dispLo[a]))
                    small = true;
            this.shrinkVotes = small ? this.shrinkVotes + 1 : 0;
            if (this.shrinkVotes >= 2)
                refit = true;
        }
        if (refit) {
            this.shrinkVotes = 0;
            this.refit();
        }
    }

    outside(a: number, v: number): boolean {
        const tol = ScopePlot2d.EXPAND_TOL * (this.dispHi[a] - this.dispLo[a]);
        return v < this.dispLo[a] - tol || v > this.dispHi[a] + tol;
    }

    // range this scope wants on each axis: data from the last two windows (+ origin if asked)
    calcWant(): void {
        for (let a = 0; a < 2; a++) {
            let lo = this.curLo[a], hi = this.curHi[a];
            if (this.havePrev) {
                lo = Math.min(lo, this.prevLo[a]);
                hi = Math.max(hi, this.prevHi[a]);
            }
            if (this.includeOrigin) {
                lo = Math.min(lo, 0);
                hi = Math.max(hi, 0);
            }
            // a flat trace (e.g. a single Q-point) still needs some range to draw in
            if (hi - lo <= 1e-6 * Math.max(Math.abs(lo), Math.abs(hi))) {
                const c = (hi + lo) / 2;
                const h = (c !== 0) ? Math.abs(c) * .1 : 1e-3;
                lo = c - h;
                hi = c + h;
            }
            this.wantLo[a] = lo;
            this.wantHi[a] = hi;
        }
        this.haveWant = true;
    }

    refit(): void {
        this.calcWant();
        let lo = this.wantLo[0], hi = this.wantHi[0];
        // With "Align X" checked, X is shared with the other aligned scopes plotting the same kind
        // of value (Vce with Vce...), so their curves line up.  Y always stays per scope.
        const group = this.getXGroup();
        for (const o of group)
            if (o.haveWant) {
                lo = Math.min(lo, o.wantLo[0]);
                hi = Math.max(hi, o.wantHi[0]);
            }
        for (const o of group)
            if (o.haveDisp)
                o.setDisp(lo, hi, o.dispLo[1], o.dispHi[1]);
        this.setDisp(lo, hi, this.wantLo[1], this.wantHi[1]);
    }

    // Change the displayed range.  The trail already drawn is rescaled to the new range rather
    // than cleared, so a refit doesn't wipe the screen.
    setDisp(xlo: number, xhi: number, ylo: number, yhi: number): void {
        if (!this.haveDisp) {
            this.dispLo[0] = xlo; this.dispHi[0] = xhi;
            this.dispLo[1] = ylo; this.dispHi[1] = yhi;
            this.haveDisp = true;
            this.clearView();
            return;
        }
        if (this.dispLo[0] === xlo && this.dispHi[0] === xhi && this.dispLo[1] === ylo && this.dispHi[1] === yhi)
            return;
        const oLo = [this.dispLo[0], this.dispLo[1]], oHi = [this.dispHi[0], this.dispHi[1]];
        this.dispLo[0] = xlo; this.dispHi[0] = xhi;
        this.dispLo[1] = ylo; this.dispHi[1] = yhi;
        this.remapImage(oLo, oHi);
    }

    // Redraw the trail from the old range (oLo/oHi) into the current one.  Each axis is a linear
    // map, so this is one scaled drawImage.  A huge zoom would just smear old pixels, so in that
    // case start clean instead.
    remapImage(oLo: number[], oHi: number[]): void {
        if (this.imageContext === null)
            return;
        const ax = (oHi[0] - oLo[0]) / (this.dispHi[0] - this.dispLo[0]);
        const ay = (oHi[1] - oLo[1]) / (this.dispHi[1] - this.dispLo[1]);
        if (ax > 4 || ay > 4 || ax < .05 || ay < .05) {
            this.clearView();
            return;
        }
        // new pixel = a * old pixel + b, matched at the old range's low end
        const bx = this.toPixelD(0, oLo[0]) - ax * this.pixelOf(0, oLo[0], oLo[0], oHi[0]);
        const by = this.toPixelD(1, oLo[1]) - ay * this.pixelOf(1, oLo[1], oLo[1], oHi[1]);
        const w = this.scope.rect.width, h = this.scope.rect.height;
        if (this.tmpCanvas === null)
            this.tmpCanvas = document.createElement("canvas");
        this.tmpCanvas.width = w;   // also clears it
        this.tmpCanvas.height = h;
        this.tmpCanvas.getContext("2d")!.drawImage(this.imageCanvas!, 0, 0);
        this.fillBackground();
        this.imageContext.save();
        this.imageContext.translate(bx, by);
        this.imageContext.scale(ax, ay);
        this.imageContext.drawImage(this.tmpCanvas, 0, 0);
        this.imageContext.restore();
        if (this.draw_ox !== -1) {
            this.draw_ox = Math.trunc(ax * this.draw_ox + bx);
            this.draw_oy = Math.trunc(ay * this.draw_oy + by);
        }
    }

    // what kind of value is on the X axis, for Align X
    xKey(): string {
        const p = this.scope.plots[this.validPlotIndex(this.plotX, 0)];
        return (p.elm !== null && p.elm.isTransistorElm() ? "t" : "e") + p.value + "/" + p.units;
    }

    canShareX(): boolean {
        return this.alignX && this.enabled && !this.scope.isManualScale() && this.scope.plots.length > 0;
    }

    // other aligned auto-fit X/Y scopes (docked or floating) with the same kind of X value
    getXGroup(): ScopePlot2d[] {
        const group: ScopePlot2d[] = [];
        if (!this.canShareX())
            return group;
        const key = this.xKey();
        const sm = this.scope.app.scopeManager;
        for (let i = 0; i < sm.scopeCount; i++)
            this.addToGroup(group, sm.scopes[i], key);
        const arr = this.scope.app.scopeElmArr;
        if (arr !== null)
            for (let i = 0; i < arr.length; i++)
                this.addToGroup(group, arr[i].elmScope, key);
        return group;
    }

    addToGroup(group: ScopePlot2d[], s: Scope | null, key: string): void {
        if (s == null || s === this.scope || !s.plot2d.canShareX() || key !== s.plot2d.xKey())
            return;
        group.push(s.plot2d);
    }

    // value -> pixel within the scope for a given range, leaving FIT_MARGIN empty on each edge
    pixelOf(a: number, v: number, lo: number, hi: number): number {
        const f = (v - lo) / (hi - lo);
        if (a === 0) {
            const m = this.scope.rect.width * ScopePlot2d.FIT_MARGIN;
            return m + f * (this.scope.rect.width - 2 * m);
        }
        const m = this.scope.rect.height * ScopePlot2d.FIT_MARGIN;
        return this.scope.rect.height - m - f * (this.scope.rect.height - 2 * m);
    }

    toPixelD(a: number, v: number): number {
        return this.pixelOf(a, v, this.dispLo[a], this.dispHi[a]);
    }

    toPixel(a: number, v: number): number {
        return Math.trunc(this.toPixelD(a, v));
    }

    fromPixel(a: number, px: number): number {
        let f: number;
        if (a === 0) {
            const m = this.scope.rect.width * ScopePlot2d.FIT_MARGIN;
            f = (px - m) / (this.scope.rect.width - 2 * m);
        } else {
            const m = this.scope.rect.height * ScopePlot2d.FIT_MARGIN;
            f = (this.scope.rect.height - m - px) / (this.scope.rect.height - 2 * m);
        }
        return this.dispLo[a] + f * (this.dispHi[a] - this.dispLo[a]);
    }

    // Trail time constant (sim seconds) of the default fade: alpha .01 every 3 frames, so
    // 3/-ln(.99) ~= 298 frames.  0 if the sim hasn't run yet.
    defaultTrailTime(): number {
        return this.simPerFrame * 3 / -Math.log(.99);
    }

    // trail time constant actually in use (sim seconds)
    trailTime(): number {
        if (this.trailPersistence <= 0)
            return this.defaultTrailTime();
        return this.trailPersistence * this.scope.sim.maxTimeStep;
    }

    draw(g: Graphics): void {
        if (this.imageContext === null)
            return;
        g.context.save();
        g.context.translate(this.scope.rect.x, this.scope.rect.y);
        g.clipRect(0, 0, this.scope.rect.width, this.scope.rect.height);

        const ft = this.scope.sim.t;
        if (this.lastFrameSimTime >= 0 && ft > this.lastFrameSimTime) {
            const d = ft - this.lastFrameSimTime;
            this.simPerFrame = (this.simPerFrame === 0) ? d : this.simPerFrame * .95 + d * .05;
        }
        this.lastFrameSimTime = ft;
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
        if (this.scope.isManualScale()) {
            g.drawLine(0, this.scope.rect.height / 2, this.scope.rect.width - 1, this.scope.rect.height / 2);
            if (!this.plotXY)
                g.setColor(Color.yellow);
            g.drawLine(this.scope.rect.width / 2, 0, this.scope.rect.width / 2, this.scope.rect.height - 1);
        } else if (this.haveDisp) {
            // auto-fit: draw each axis only where zero is actually in view
            if (this.dispLo[1] <= 0 && this.dispHi[1] >= 0) {
                const zy = this.toPixel(1, 0);
                g.drawLine(0, zy, this.scope.rect.width - 1, zy);
            }
            if (!this.plotXY)
                g.setColor(Color.yellow);
            if (this.dispLo[0] <= 0 && this.dispHi[0] >= 0) {
                const zx = this.toPixel(0, 0);
                g.drawLine(zx, 0, zx, this.scope.rect.height - 1);
            }
        }
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
        if (!this.scope.app.modalDialogIsShowing() &&
                this.scope.rect.contains(this.scope.app.mouse.mouseCursorX, this.scope.app.mouse.mouseCursorY) &&
                this.scope.plots.length >= 1 && px < this.scope.plots.length && py < this.scope.plots.length &&
                (this.scope.isManualScale() || this.haveDisp)) {
            const gridPx = this.calcGridPx(this.scope.rect.width, this.scope.rect.height);
            const info: string[] = new Array(2);
            const spx = this.scope.plots[px];
            const spy = this.scope.plots[py];
            let xValue: number, yValue: number;
            if (this.scope.isManualScale()) {
                xValue =  spx.manScale * ((this.scope.app.mouse.mouseCursorX - this.scope.rect.x - this.scope.rect.width  / 2) / gridPx - this.scope.manDivisions * spx.manVPosition / Scope.V_POSITION_STEPS);
                yValue =  spy.manScale * ((-this.scope.app.mouse.mouseCursorY + this.scope.rect.y + this.scope.rect.height / 2) / gridPx - this.scope.manDivisions * spy.manVPosition / Scope.V_POSITION_STEPS);
            } else {
                xValue = this.fromPixel(0, this.scope.app.mouse.mouseCursorX - this.scope.rect.x);
                yValue = this.fromPixel(1, this.scope.app.mouse.mouseCursorY - this.scope.rect.y);
            }
            info[0] = spx.getUnitText(xValue);
            info[1] = spy.getUnitText(yValue);
            this.scope.drawCursorInfo(g, info, 2, this.scope.app.mouse.mouseCursorX, true);
        }
    }
}
