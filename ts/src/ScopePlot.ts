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
import { SimulationManager } from "./SimulationManager";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";
import {
    UNITS_V, UNITS_A, UNITS_OHMS, UNITS_W, UNITS_C,
    V_POSITION_STEPS,
} from "./ScopeConstants";

// plot of single value on a scope
export class ScopePlot {
    // The buffers timeStep() records into. Everything outside this class except ScopeTrigger's
    // edge detection reads minValues/maxValues instead (see below).
    liveMin: number[];
    liveMax: number[];
    // Snapshot of liveMin/liveMax taken by ScopeTrigger once a triggered sweep has been fully
    // captured. The live buffer has to keep recording (the next trigger needs pre-trigger
    // history), so without this the displayed sweep gets overwritten as soon as the write pointer
    // laps it - long before a rare trigger event comes around again. null means show live data.
    private frozenMin: number[] | null = null;
    private frozenMax: number[] | null = null;
    scopePointCount: number;
    ptr: number; // ptr is pointer to the current sample
    value: number; // Value - the property being shown - e.g. VAL_CURRENT
    // scopePlotSpeed is in sim timestep units per pixel
    scopePlotSpeed: number;
    units: number;
    lastUpdateTime: number;
    lastValue: number;
    color: string;
    elm: CircuitElm | null;
   // Has a manual scale in "/div" format been put in by the user (as opposed to being
   // inferred from a "MaxValue" format or from an automatically calculated scale)?
   // Manual scales should be kept to sane values anyway, but this shows if this is a user
   // intention we should respect, or if we should try and populate reasonable values from
   // the data we have
    manScaleSet: boolean = false;
    manScale: number = 1.0; // Units per division
    manVPosition: number = 0; // 0 is center of screen. +V_POSITION_STEPS/2 is top of screen
    gridMult: number = 0;
    gridStepY: number = 0; // units per vertical division, set by Scope.calcGridParams
    plotOffset: number = 0;
    acCoupled: boolean = false;
    acAlpha: number = 0.9999; // Filter coefficient for AC coupling
    acDc: number = 0; // DC level removed by AC coupling filter (the coupling capacitor's voltage)
    acCount: number = 0; // samples since filter was reset, for fast start

    static readonly FLAG_AC = 1;

    constructor(e: CircuitElm | null, u: number);
    constructor(e: CircuitElm | null, u: number, v: number, manS: number);
    constructor(e: CircuitElm | null, u: number, v?: number, manS?: number) {
        this.elm = e;
        this.units = u;
        this.value = 0;
        this.scopePointCount = 0;
        this.ptr = 0;
        this.scopePlotSpeed = 0;
        this.lastUpdateTime = 0;
        this.lastValue = 0;
        this.color = "#FFFFFF";
        this.liveMin = [];
        this.liveMax = [];
        if (v !== undefined && manS !== undefined) {
            this.value = v;
            this.manScale = manS;
            // ohms can only be positive, so move the v position to the bottom.
            // power can be negative for caps and inductors, but still move to the bottom (for backward compatibility)
            if (u === UNITS_OHMS || u === UNITS_W || u === UNITS_C)
                this.manVPosition = -V_POSITION_STEPS / 2;
        }
    }

    startIndex(w: number): number {
        return this.ptr + this.scopePointCount - w;
    }

    reset(spc: number, sp: number, full: boolean): void {
        let oldSpc = this.scopePointCount;
        this.scopePointCount = spc;
        if (this.scopePlotSpeed !== sp)
            oldSpc = 0; // throw away old data
        this.scopePlotSpeed = sp;
        // Adjust the time constant of the AC coupled filter in proportion to the number of samples
        // we are seeing on the scope (if my maths is right). The constant is empirically determined
        this.acAlpha = 1.0 - 1.0 / (1.15 * sp * spc);
        // restart AC coupling filter so we don't carry over stale state (e.g. after reset)
        this.acDc = 0;
        this.acCount = 0;
        const oldMin = this.liveMin;
        const oldMax = this.liveMax;
        this.liveMin = new Array(spc).fill(0);
        this.liveMax = new Array(spc).fill(0);
        if (oldMin !== null && oldMin.length > 0 && !full) {
            // preserve old data if possible
            let i;
            for (i = 0; i !== spc && i !== oldSpc; i++) {
                const i1 = (-i) & (spc - 1);
                const i2 = (this.ptr - i) & (oldSpc - 1);
                this.liveMin[i1] = oldMin[i2];
                this.liveMax[i1] = oldMax[i2];
            }
        } else
            this.lastUpdateTime = SimulationManager.theSim!.t;
        this.ptr = 0;
        this.thaw();
    }

    // What the display shows: the frozen trigger snapshot if there is one, else live data.
    // Assigning replaces the live buffer (and drops any snapshot).
    get minValues(): number[] { return this.frozenMin ?? this.liveMin; }
    set minValues(a: number[]) { this.liveMin = a; this.thaw(); }
    get maxValues(): number[] { return this.frozenMax ?? this.liveMax; }
    set maxValues(a: number[]) { this.liveMax = a; this.thaw(); }

    freeze(): void {
        this.frozenMin = this.liveMin.slice();
        this.frozenMax = this.liveMax.slice();
    }

    thaw(): void {
        this.frozenMin = this.frozenMax = null;
    }

    timeStep(): void {
        if (this.elm === null)
            return;
        let v = this.elm.getScopeValue(this.value);
         // AC coupling filter. 1st order IIR high pass, written as y[i] = x[i] - dc[i] where
         // dc[i] = dc[i-1] + k (x[i]-dc[i-1]).  With k = 1-alpha this is the same as
         // y[i] = alpha x (y[i-1]+x[i]-x[i-1]).  To avoid a long startup transient, k starts at 1
         // and decreases as 1/n, so dc is the running average of all samples so far, until it
         // reaches 1-alpha.
         // We calculate for all iterations (even DC coupled) to prime the data in case they switch to AC later
        this.acCount++;
        const k = Math.max(1 / this.acCount, 1 - this.acAlpha);
        this.acDc += (v - this.acDc) * k;
        this.lastValue = v;
        if (this.isAcCoupled())
            v -= this.acDc;
        if (v < this.liveMin[this.ptr])
            this.liveMin[this.ptr] = v;
        if (v > this.liveMax[this.ptr])
            this.liveMax[this.ptr] = v;
        const maxTimeStep = SimulationManager.theSim!.maxTimeStep;
        if (SimulationManager.theSim!.t - this.lastUpdateTime >= maxTimeStep * this.scopePlotSpeed) {
            this.ptr = (this.ptr + 1) & (this.scopePointCount - 1);
            this.liveMin[this.ptr] = this.liveMax[this.ptr] = v;
            this.lastUpdateTime += maxTimeStep * this.scopePlotSpeed;
        }
    }

    getUnitText(v: number): string {
        switch (this.units) {
        case UNITS_V:
            return CircuitElm.getVoltageText(v);
        case UNITS_A:
            return CircuitElm.getCurrentText(v);
        case UNITS_OHMS:
            return CircuitElm.getUnitText(v, Locale.ohmString);
        case UNITS_W:
            return CircuitElm.getUnitText(v, "W");
        case UNITS_C:
            return CircuitElm.getUnitText(v, "C");
        }
        return "";
    }

    static readonly colors: string[] = [
        "#FF0000", "#FF8000", "#FF00FF", "#7F00FF",
        "#0000FF", "#0080FF", "#FFFF00", "#00FFFF",
    ];

    assignColor(count: number): void {
        if (count > 0) {
            this.color = ScopePlot.colors[(count - 1) % 8];
            return;
        }
        switch (this.units) {
        case UNITS_V:
            this.color = CircuitElm.positiveColor.getHexValue();
            break;
        case UNITS_A:
            this.color = (CirSim.theApp.isPrintable()) ? "#A0A000" : "#FFFF00";
            break;
        default:
            this.color = (CirSim.theApp.isPrintable()) ? "#000000" : "#FFFFFF";
            break;
        }
    }

    setAcCoupled(b: boolean): void {
        if (this.canAcCouple()) {
            this.acCoupled = b;
        } else
            this.acCoupled = false;
    }

    canAcCouple(): boolean {
        return this.units === UNITS_V; // AC coupling is permitted if the plot is displaying volts
    }

    isAcCoupled(): boolean {
        return this.acCoupled;
    }

    getPlotFlags(): number {
        return (this.acCoupled ? ScopePlot.FLAG_AC : 0);
    }
}
