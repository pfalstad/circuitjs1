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

import { Graphics } from "./Graphics";
import { CircuitElm } from "./CircuitElm";
import { Locale } from "./Locale";
import { FFT } from "./FFT";
import { UNITS_V, UNITS_A } from "./ScopeConstants";
import type { Scope } from "./Scope";
import type { ScopePlot } from "./ScopePlot";

export class ScopeFFT {
    scope: Scope;
    enabled: boolean = false;
    logSpectrum: boolean = false;
    showPhaseAngle: boolean = false;
    fftMaxMagnitude: number = 0;
    fftReal: number[] | null = null;
    fftImag: number[] | null = null;
    private fft: FFT | null = null;

    constructor(scope: Scope) {
        this.scope = scope;
    }

    show(b: boolean): void {
        this.enabled = b;
        if (!this.enabled)
            this.fft = null;
    }

    drawVerticalGridLines(g: Graphics): void {
        let prevEnd = 0;
        const divs = 20;
        const maxFrequency = 1 / (this.scope.sim.maxTimeStep * this.scope.speed * divs * 2);
        for (let i = 0; i < divs; i++) {
            const x = Math.floor(this.scope.rect.width * i / divs);
            if (x < prevEnd) continue;
            const s = "" + Math.round(i * maxFrequency) + "Hz";
            const sWidth = Math.ceil(g.context.measureText(s).width);
            prevEnd = x + sWidth + 4;
            if (i > 0) {
                g.setColor("#880000");
                g.drawLine(x, 0, x, this.scope.rect.height);
            }
            g.setColor("#FF0000");
            g.drawString(s, x + 2, this.scope.rect.height);
        }
    }

    draw(g: Graphics): void {
        if (this.fft === null || this.fft.getSize() !== this.scope.scopePointCount)
            this.fft = new FFT(this.scope.scopePointCount);
        const real = new Array<number>(this.scope.scopePointCount).fill(0);
        const imag = new Array<number>(this.scope.scopePointCount).fill(0);
        const plot: ScopePlot = (this.scope.visiblePlots.length === 0)
            ? this.scope.plots[0]
            : this.scope.visiblePlots[0];
        const maxV = plot.maxValues;
        const minV = plot.minValues;
        const ptr = plot.ptr;
        for (let i = 0; i < this.scope.scopePointCount; i++) {
            const ii = (ptr - i + this.scope.scopePointCount) & (this.scope.scopePointCount - 1);
            // average max and min to prevent DC spike from masking rest of spectrum
            real[i] = 0.5 * (maxV[ii] + minV[ii]);
            imag[i] = 0;
        }
        this.fft.fft(real, imag, true);
        let maxM = 1e-8;
        for (let i = 0; i < this.scope.scopePointCount / 2; i++) {
            const m = this.fft.magnitude(real[i], imag[i]);
            if (m > maxM)
                maxM = m;
        }
        this.fftMaxMagnitude = maxM;
        this.fftReal = real;
        this.fftImag = imag;
        let prevX = 0;
        g.setColor("#FF0000");
        if (!this.logSpectrum) {
            let prevHeight = 0;
            const y = (this.scope.rect.height - 1) - 12;
            for (let i = 0; i < this.scope.scopePointCount / 2; i++) {
                const x = Math.floor(2 * i * this.scope.rect.width / this.scope.scopePointCount);
                const magnitude = this.fft.magnitude(real[i], imag[i]);
                const height = Math.floor((magnitude * y) / maxM);
                if (x !== prevX)
                    g.drawLine(prevX, y - prevHeight, x, y - height);
                prevHeight = height;
                prevX = x;
            }
        } else {
            const dbRange = 80;
            const topMargin = 5;
            const bottomMargin = 12;
            const plotHeight = this.scope.rect.height - topMargin - bottomMargin;
            const pixelsPerDb = plotHeight / dbRange;
            let prevY = 0;
            for (let db = -20; db >= -80; db -= 20) {
                const y = topMargin + Math.floor(-db * pixelsPerDb);
                if (y < 0 || y >= this.scope.rect.height)
                    continue;
                g.setColor("#880000");
                g.drawLine(0, y, this.scope.rect.width, y);
                g.setColor("#FF0000");
                g.drawString(db + " dB", 2, y - 2);
            }
            g.setColor("#FF0000");
            for (let i = 0; i < this.scope.scopePointCount / 2; i++) {
                const x = Math.floor(2 * i * this.scope.rect.width / this.scope.scopePointCount);
                const magnitude = this.fft.magnitude(real[i], imag[i]);
                let db = 20 * Math.log(magnitude / maxM) / Math.log(10);
                if (db < -dbRange)
                    db = -dbRange;
                const y = topMargin + Math.floor(-db * pixelsPerDb);
                if (x !== prevX)
                    g.drawLine(prevX, prevY, x, y);
                prevY = y;
                prevX = x;
            }
        }
    }

    drawPhaseAngle(g: Graphics): void {
        let vPlot: ScopePlot | null = null;
        let iPlot: ScopePlot | null = null;
        for (const p of this.scope.visiblePlots) {
            if (p.units === UNITS_V) {
                if (vPlot !== null) return;
                vPlot = p;
            } else if (p.units === UNITS_A) {
                if (iPlot !== null) return;
                iPlot = p;
            } else
                return;
        }
        if (vPlot === null || iPlot === null)
            return;
        if (this.fft === null || this.fft.getSize() !== this.scope.scopePointCount)
            this.fft = new FFT(this.scope.scopePointCount);
        const vReal = new Array<number>(this.scope.scopePointCount).fill(0);
        const vImag = new Array<number>(this.scope.scopePointCount).fill(0);
        const iReal = new Array<number>(this.scope.scopePointCount).fill(0);
        const iImag = new Array<number>(this.scope.scopePointCount).fill(0);
        const ipa = this.scope.displayStartIndex(vPlot, this.scope.rect.width);
        const validCount = this.scope.validDataCount(vPlot, ipa, this.scope.rect.width);
        for (let i = 0; i < validCount; i++) {
            const ip = (i + ipa) & (this.scope.scopePointCount - 1);
            vReal[i] = 0.5 * (vPlot.maxValues[ip] + vPlot.minValues[ip]);
            iReal[i] = 0.5 * (iPlot.maxValues[ip] + iPlot.minValues[ip]);
        }
        this.fft.fft(vReal, vImag, true);
        this.fft.fft(iReal, iImag, true);
        let fund = 1;
        let maxM = 0;
        for (let i = 1; i < this.scope.scopePointCount / 2; i++) {
            const m = this.fft.magnitude(vReal[i], vImag[i]);
            if (m > maxM) { maxM = m; fund = i; }
        }
        if (maxM < 1e-8)
            return;
        const angleV = Math.atan2(vImag[fund], vReal[fund]);
        const angleI = Math.atan2(iImag[fund], iReal[fund]);
        let angle = (angleV - angleI) * 180 / Math.PI;
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        this.scope.drawInfoText(g, Locale.LS("Phase angle: ") + CircuitElm.showFormat.format(angle) + "°");
    }

    addCursorInfo(info: string[], ct: number, mouseCursorX: number): number {
        const maxFrequency = 1 / (this.scope.sim.maxTimeStep * this.scope.speed * 2);
        info[ct++] = CircuitElm.getUnitText(maxFrequency * (mouseCursorX - this.scope.rect.x) / this.scope.rect.width, "Hz");
        if (this.fft !== null && this.fftReal !== null && this.fftMaxMagnitude > 0) {
            const fftIndex = Math.floor((mouseCursorX - this.scope.rect.x) * this.scope.scopePointCount / (2 * this.scope.rect.width));
            if (fftIndex >= 0 && fftIndex < this.scope.scopePointCount / 2) {
                const mag = this.fft.magnitude(this.fftReal[fftIndex], this.fftImag![fftIndex]);
                const db = 20 * Math.log(mag / this.fftMaxMagnitude) / Math.log(10);
                info[ct++] = Math.round(db) + " dB";
            }
        }
        return ct;
    }
}
