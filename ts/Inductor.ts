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

import { CircuitNode } from "./CircuitNode";
import { SimulationManager } from "./SimulationManager";

export class Inductor {
    static readonly FLAG_BACK_EULER = 2;
    nodes: CircuitNode[];
    flags: number;
    sim: SimulationManager;

    inductance: number;
    compResistance: number;
    current: number;
    curSourceValue: number;
    saturationCurrent: number; // 0 = disabled (linear), >0 = saturation onset current (A)
    constructor(s: SimulationManager) {
        this.sim = s;
        this.nodes = new Array(2);
    }
    setup(ic: number, cr: number, f: number): void;
    setup(ic: number, cr: number, f: number, isat: number): void;
    setup(ic: number, cr: number, f: number, isat?: number): void {
        this.inductance = ic;
        this.current = cr;
        this.flags = f;
        if (isat !== undefined)
            this.saturationCurrent = isat;
    }
    isTrapezoidal(): boolean { return (this.flags & Inductor.FLAG_BACK_EULER) === 0; }
    reset(): void { this.resetTo(0); }
    resetTo(c: number): void {
        // need to set curSourceValue here in case one of inductor nodes is node 0.  In that case
        // calculateCurrent() may get called (from setNodeVoltage()) when analyzing circuit, before
        // startIteration() gets called
        this.curSourceValue = this.current = c;
    }

    // compute effective inductance with saturation: L(I) = L0 / (1 + (I/Isat)^2)
    // smooth rolloff: at |I|=Isat, L=L0/2; at |I|=3*Isat, L=L0/10
    calcEffectiveInductance(i: number): number {
        if (this.saturationCurrent <= 0) return this.inductance;
        const ratio = i / this.saturationCurrent;
        return this.inductance / (1 + ratio * ratio);
    }

    stamp(n0: CircuitNode, n1: CircuitNode): void {
        // inductor companion model using trapezoidal or backward euler
        // approximations (Norton equivalent) consists of a current
        // source in parallel with a resistor.  Trapezoidal is more
        // accurate than backward euler but can cause oscillatory behavior.
        // The oscillation is a real problem in circuits with switches.
        this.nodes[0] = n0;
        this.nodes[1] = n1;
        if (this.saturationCurrent > 0) {
            // nonlinear: conductance changes with current, stamped in doStep()
            this.sim.stampNonLinear(this.nodes[0]);
            this.sim.stampNonLinear(this.nodes[1]);
        } else {
            // linear: fixed companion conductance
            if (this.isTrapezoidal())
                this.compResistance = 2*this.inductance/this.sim.timeStep;
            else // backward euler
                this.compResistance = this.inductance/this.sim.timeStep;
            this.sim.stampResistor(this.nodes[0], this.nodes[1], this.compResistance);
        }
        //this.sim.stampRightSide(this.nodes[0]);
        //this.sim.stampRightSide(this.nodes[1]);
    }
    nonLinear(): boolean { return this.saturationCurrent > 0; }

    startIteration(voltdiff: number): void {
        if (this.saturationCurrent > 0) {
            // recompute companion resistance from current-dependent inductance
            const lEff = this.calcEffectiveInductance(this.current);
            if (this.isTrapezoidal())
                this.compResistance = 2*lEff/this.sim.timeStep;
            else
                this.compResistance = lEff/this.sim.timeStep;
        }
        if (this.isTrapezoidal())
            this.curSourceValue = voltdiff/this.compResistance+this.current;
        else // backward euler
            this.curSourceValue = this.current;
    }

    calculateCurrent(voltdiff: number): number {
        // we check compResistance because this might get called
        // before stamp(), which sets compResistance, causing
        // infinite current
        if (this.compResistance > 0)
            this.current = voltdiff/this.compResistance + this.curSourceValue;
        return this.current;
    }
    doStep(voltdiff: number): void {
        if (this.saturationCurrent > 0) {
            // stamp companion conductance (matrix was restored to origMatrix)
            this.sim.stampConductance(this.nodes[0], this.nodes[1], 1.0/this.compResistance);
        }
        this.sim.stampCurrentSource(this.nodes[0], this.nodes[1], this.curSourceValue);
    }
}
