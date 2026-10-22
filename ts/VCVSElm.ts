/*
    Copyright (C) Paul Falstad

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

import { ChipElm, Pin } from "./ChipElm";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { CircuitNode } from "./CircuitNode";
import { VCCSElm } from "./VCCSElm";
import { SimulationManager } from "./SimulationManager";

export class VCVSElm extends VCCSElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined)
            super(xa, ya);
        else
            super(xa, ya, xb, yb!, f!, st!);
    }

    setupPins(): void {
        if (!this.inputCount)
	    this.inputCount = 0;
        this.sizeX = 2;
        this.sizeY = this.inputCount > 2 ? this.inputCount : 2;
        this.pins = new Array(this.inputCount + 2);
        for (let i = 0; i !== this.inputCount; i++)
            this.pins[i] = new Pin(this, i, ChipElm.SIDE_W, String.fromCharCode(65 + i)); // 'A'+i
        this.pins[this.inputCount] = new Pin(this, 0, ChipElm.SIDE_E, "V+");
        this.pins[this.inputCount].output = true;
        this.pins[this.inputCount + 1] = new Pin(this, 1, ChipElm.SIDE_E, "V-");
        this.allocExprArrays();
        this.allocNodes();
    }

    getChipName(): string { return "VCVS"; }

    stamp(): void {
        const sim = SimulationManager.theSim;
        const vs = this.pins[this.inputCount].voltSource!;
        sim.stampNonLinearVS(vs);
        sim.stampVoltageSource(this.nodes[this.inputCount + 1], this.nodes[this.inputCount], vs);
    }

    doStep(): void {
        const sim = SimulationManager.theSim;

        // check convergence
        if (!this.engine.checkConvergence(this.getConvergeLimit()))
            sim.converged = false;

        const vn = this.pins[this.inputCount].voltSource!;
        if (this.expr != null) {
            const rs = this.engine.evalAndStamp(false);
            const v0 = this.engine.value;
            if (Math.abs(this.nodes[this.inputCount].v - this.nodes[this.inputCount + 1].v - v0) > Math.abs(v0) * 0.01 && sim.subIterations < 100)
                sim.converged = false;
            sim.stampRightSideVS(vn, rs);
        }

        this.engine.saveInputs();
    }

    // our output is a voltage source, so derivatives go into its matrix row
    stampInputDerivative(pos: CircuitNode, neg: CircuitNode, dx: number): void {
        const sim = SimulationManager.theSim;
        const vn = this.pins[this.inputCount].voltSource!;
        sim.stampMatrixNV(vn, pos, -dx);
        sim.stampMatrixNV(vn, neg, dx);
    }

    stampInputDerivativeVS(ivs: VoltageSource, dx: number): void {
        SimulationManager.theSim.stampMatrixVV(this.pins[this.inputCount].voltSource!, ivs, -dx);
    }

    stepFinished(): void {
        this.exprState.updateLastValues(this.nodes[this.inputCount].v - this.nodes[this.inputCount + 1].v);
    }

    getPostCount(): number { return this.inputCount + 2; }
    getVoltageSourceCount(): number { return 1; }
    getDumpType(): number { return 212; }
    hasCurrentOutput(): boolean { return false; }

    setVoltageSource(j: number, vs: VoltageSource): void {
        super.setVoltageSource(j, vs);
        vs.setNodes(this.nodes[this.inputCount + 1], this.nodes[this.inputCount]);
    }

    setCurrent(vs: VoltageSource, c: number): void {
        if (this.pins[this.inputCount].voltSource === vs) {
            this.pins[this.inputCount].current = c;
            this.pins[this.inputCount + 1].current = -c;
        }
    }
}
