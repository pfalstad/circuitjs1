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
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { ScopeDataIterator } from "./ScopeDataIterator";
import { ScopePlot } from "./ScopePlot";
import type { Scope } from "./Scope";

export class ScopeOverlays {
    scope: Scope;
    textY: number = 0;

    constructor(scope: Scope) {
        this.scope = scope;
    }

    drawInfoText(g: Graphics, text: string): void {
        if (this.scope.rect.y + this.scope.rect.height <= this.textY + 5)
            return;
        g.drawString(text, 0, this.textY);
        this.textY += 15;
    }

    drawScale(plot: ScopePlot, g: Graphics): void {
        if (!this.scope.isManualScale()) {
            if (this.scope.gridStepY !== 0 && !(this.scope.showV && this.scope.showI)) {
                const vScaleText = " V=" + plot.getUnitText(this.scope.gridStepY) + "/div";
                this.drawInfoText(g, "H=" + CircuitElm.getUnitText(this.scope.gridStepX, "s") + "/div" + vScaleText);
            }
        } else {
            if (this.scope.rect.y + this.scope.rect.height <= this.textY + 5)
                return;
            let x = 0;
            const hs = "H=" + CircuitElm.getUnitText(this.scope.gridStepX, "s") + "/div";
            g.drawString(hs, 0, this.textY);
            x += g.measureWidth(hs);
            const bulletWidth = 17;
            for (let i = 0; i < this.scope.visiblePlots.length; i++) {
                const p = this.scope.visiblePlots[i];
                const s = p.getUnitText(p.manScale);
                if (p !== null) {
                    const vScaleText = "=" + s + "/div";
                    const vScaleWidth = g.measureWidth(vScaleText);
                    if (x + bulletWidth + vScaleWidth > this.scope.rect.width) {
                        x = 0;
                        this.textY += 15;
                        if (this.scope.rect.y + this.scope.rect.height <= this.textY + 5)
                            return;
                    }
                    g.setColor(p.color);
                    g.fillOval(x + 7, this.textY - 9, 8, 8);
                    x += bulletWidth;
                    g.setColor(CircuitElm.whiteColor);
                    g.drawString(vScaleText, x, this.textY);
                    x += vScaleWidth;
                }
            }
            this.textY += 15;
        }
    }

    // shared cycle-detection loop for drawAverage, drawRMS, drawDutyCycle.
    // calls onCycleStart at first rising edge, onSample each sample thereafter,
    // onCycleEnd at each subsequent rising edge.  returns end-start span, or 0.
    iterateCycles(sdi: ScopeDataIterator, mid: number,
                  onCycleStart: () => void, onSample: () => void, onCycleEnd: () => void): number {
        const fnz = sdi.skipNonzeroValues();
        let state = (fnz > mid) ? 1 : -1;
        let waveCount = 0;
        let start = 0, end = 0;
        for (const i of sdi) {
            let sw = false;
            if (state === 1) {
                if (sdi.getMax() < mid) sw = true;
            } else if (sdi.getMin() > mid) sw = true;
            if (sw) {
                state = -state;
                if (state === 1) {
                    if (waveCount === 0) {
                        start = i;
                        onCycleStart();
                    } else {
                        end = i;
                        onCycleEnd();
                    }
                    waveCount++;
                }
            }
            if (waveCount > 0)
                onSample();
        }
        return end - start;
    }

    makeSdi(plot: ScopePlot): ScopeDataIterator {
        const ipa = this.scope.displayStartIndex(plot, this.scope.rect.width);
        const validCount = this.scope.validDataCount(plot, ipa, this.scope.rect.width);
        return new ScopeDataIterator(this.scope.scopePointCount, ipa, validCount, plot);
    }

    drawRMS(g: Graphics): void {
        if (!this.scope.canShowRMS()) {
            // backward compatibility: fall back to average
            this.scope.showRMS = false;
            this.scope.showAverage = true;
            this.drawAverage(g);
            return;
        }
        const plot = this.scope.visiblePlots[0];
        const mid = (this.scope.maxValue + this.scope.minValue) / 2;
        const sdi = this.makeSdi(plot);
        let avg = 0, endAvg = 0;
        const span = this.iterateCycles(sdi, mid,
            () => { avg = 0; },
            () => { const m = (sdi.getMax() + sdi.getMin()) * .5; avg += m * m; },
            () => { endAvg = avg; });
        if (span > 0)
            this.drawInfoText(g, plot.getUnitText(Math.sqrt(endAvg / span)) + "rms");
    }

    drawAverage(g: Graphics): void {
        const plot = this.scope.visiblePlots[0];
        const mid = (this.scope.maxValue + this.scope.minValue) / 2;
        const sdi = this.makeSdi(plot);
        let avg = 0, endAvg = 0;
        const span = this.iterateCycles(sdi, mid,
            () => { avg = 0; },
            () => { avg += (sdi.getMax() + sdi.getMin()) * .5; },
            () => { endAvg = avg; });
        if (span > 0)
            this.drawInfoText(g, plot.getUnitText(endAvg / span) + Locale.LS(" average"));
    }

    drawDutyCycle(g: Graphics): void {
        const plot = this.scope.visiblePlots[0];
        const mid = (this.scope.maxValue + this.scope.minValue) / 2;
        const sdi = this.makeSdi(plot);
        let dutyLen = 0, prevDuty = 0;
        const span = this.iterateCycles(sdi, mid,
            () => { dutyLen = 0; },
            () => { if (sdi.getMax() > mid) dutyLen++; },
            () => { prevDuty = dutyLen; });
        if (span > 0)
            this.drawInfoText(g, Locale.LS("Duty cycle ") + Math.trunc(100 * prevDuty / span) + "%");
    }

    drawFrequency(g: Graphics): void {
        const plot = this.scope.visiblePlots[0];
        const sdi = this.makeSdi(plot);
        let avg = 0;
        for (const i of sdi)
            avg += sdi.getMin() + sdi.getMax();
        avg /= sdi.validCount * 2;
        let state = 0;
        const thresh = avg * .05;
        let oi = 0;
        let avperiod = 0;
        let periodct = -1;
        let avperiod2 = 0;
        for (const i of sdi) {
            const q = sdi.getMax() - avg;
            const os = state;
            if (q < thresh)
                state = 1;
            else if (q > -thresh)
                state = 2;
            if (state === 2 && os === 1) {
                const pd = i - oi;
                oi = i;
                if (pd < 12)
                    continue;
                if (periodct >= 0) {
                    avperiod  += pd;
                    avperiod2 += pd * pd;
                }
                periodct++;
            }
        }
        avperiod  /= periodct;
        avperiod2 /= periodct;
        const periodstd = Math.sqrt(avperiod2 - avperiod * avperiod);
        const freq = 1 / (avperiod * this.scope.sim.maxTimeStep * this.scope.speed);
        if (periodct < 1 || periodstd > 2 || !isFinite(freq))
            return;
        this.drawInfoText(g, CircuitElm.getUnitText(freq, "Hz"));
    }

    drawElmInfo(g: Graphics): void {
        const info: string[] = [null!];
        this.scope.getElm()!.getInfo(info);
        for (let i = 0; info[i] != null; i++)
            this.drawInfoText(g, info[i]);
    }

    draw(g: Graphics): void {
        g.setColor(CircuitElm.whiteColor);
        this.textY = 10;
        if (this.scope.visiblePlots.length === 0) {
            if (this.scope.showElmInfo)
                this.drawElmInfo(g);
            return;
        }
        const plot = this.scope.visiblePlots[0];
        if (this.scope.showScale)
            this.drawScale(plot, g);
        if (this.scope.showMax)
            this.drawInfoText(g, "Max=" + plot.getUnitText(this.scope.maxValue));
        if (this.scope.showMin) {
            const ym = this.scope.rect.height - 5;
            g.drawString("Min=" + plot.getUnitText(this.scope.minValue), 0, ym);
        }
        if (this.scope.showP2P)
            this.drawInfoText(g, "P-P=" + plot.getUnitText(this.scope.maxValue - this.scope.minValue));
        if (this.scope.showRMS)
            this.drawRMS(g);
        if (this.scope.showAverage)
            this.drawAverage(g);
        if (this.scope.showDutyCycle)
            this.drawDutyCycle(g);
        const t = this.scope.getScopeLabelOrText(true);
        if (t != null && t !== "")
            this.drawInfoText(g, t);
        if (this.scope.showFreq)
            this.drawFrequency(g);
        if (this.scope.showElmInfo)
            this.drawElmInfo(g);
        if (this.scope.fftPlot.showPhaseAngle)
            this.scope.fftPlot.drawPhaseAngle(g);
    }
}
