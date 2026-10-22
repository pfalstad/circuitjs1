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
import { CircuitElm } from "./CircuitElm";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { VoltageElm } from "./VoltageElm";
import { EditInfo } from "./EditInfo";
import { CircuitNode } from "./CircuitNode";
import { VCCSElm } from "./VCCSElm";
import { SimulationManager } from "./SimulationManager";

export class CCVSElm extends VCCSElm {
    static readonly FLAG_SPICE = 2;

    voltageSources: VoltageElm[] = [];
    outputVS: VoltageSource | null = null;
    declare inputPairCount: number;
    declare lastCurrents: number[];
    lastOutput: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.exprString = "2*a";
            this.parseExpr();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.setupPins();
        }
    }

    setupPins(): void {
        if (!this.inputCount)
	    this.inputCount = 0;
        this.sizeX = 2;
        this.sizeY = this.inputCount > 2 ? this.inputCount : 2;
        this.inputPairCount = Math.floor(this.inputCount / 2);
        this.pins = new Array(this.inputCount + 2);
        for (let i = 0; i !== this.inputPairCount; i++) {
            this.pins[i * 2]     = new Pin(this, i * 2,     ChipElm.SIDE_W, String.fromCharCode(65 + i) + "+");
            this.pins[i * 2 + 1] = new Pin(this, i * 2 + 1, ChipElm.SIDE_W, String.fromCharCode(65 + i) + "-");
            this.pins[i * 2 + 1].output = true;
        }
        const i = this.inputPairCount;
        this.pins[i * 2]     = new Pin(this, 0, ChipElm.SIDE_E, "V+");
        this.pins[i * 2].output = true;
        this.pins[i * 2 + 1] = new Pin(this, 1, ChipElm.SIDE_E, "V-");
        this.lastCurrents = new Array(this.inputPairCount).fill(0);
        this.allocExprArrays();
        this.allocNodes();
    }

    // our pin inputs are currents, handled by their own loop below, so the generic
    // expression-input machinery only covers the v()/i() references
    protected getPinExprInputCount(): number { return 0; }

    getChipName(): string { return "CCVS"; }

    stamp(): void {
        const sim = SimulationManager.theSim;
        if (this.isSpiceStyle()) {
            for (let i = 0; i !== this.inputCount; i += 2)
                this.pins[i + 1].voltSource = this.voltageSources[i / 2].getVoltageSource();
        } else {
            // 0V voltage source for each input pair to measure current
            for (let i = 0; i !== this.inputCount; i += 2) {
                const vn1 = this.pins[i + 1].voltSource!;
                sim.stampVoltageSource(this.nodes[i], this.nodes[i + 1], vn1, 0);
            }
        }
        const vn2 = this.pins[this.inputCount].voltSource!;
        this.outputVS = vn2;
        sim.stampNonLinearVS(vn2);
        sim.stampVoltageSource(this.nodes[this.inputCount + 1], this.nodes[this.inputCount], vn2);
    }

    doStep(): void {
        const sim = SimulationManager.theSim;

        if (this.isSpiceStyle()) {
            for (let i = 0; i !== this.inputPairCount; i++)
                this.pins[i * 2 + 1].current = this.voltageSources[i].getCurrent();
        }

        // check convergence on currents
        const convergeLimitCurrent = this.getConvergeLimit() * 0.1;
        for (let i = 0; i !== this.inputPairCount; i++) {
            const cur = this.pins[i * 2 + 1].current;
            if (Math.abs(cur - this.lastCurrents[i]) > convergeLimitCurrent)
                sim.converged = false;
        }

        // check convergence on output voltage
        const convergeLimitVoltage = this.getConvergeLimit();
        if (Math.abs((this.nodes[this.inputCount].v - this.nodes[this.inputCount + 1].v) - this.lastOutput) > convergeLimitVoltage)
            sim.converged = false;

        // check convergence on the v()/i() references
        if (!this.engine.checkConvergence(this.getConvergeLimit()))
            sim.converged = false;

        const vno = this.outputVS!;
        if (this.expr != null) {
            for (let i = 0; i !== this.inputPairCount; i++)
                this.setCurrentExprValue(i, this.pins[i * 2 + 1].current);
            this.exprState.t = sim.t;
            const v0 = this.expr.eval(this.exprState);
            let rs = v0;

            for (let i = 0; i !== this.inputPairCount; i++) {
                const cur = this.pins[i * 2 + 1].current;
                const vni = this.pins[i * 2 + 1].voltSource!;
                // use fixed small delta per Java source
                const dv = 1e-9;
                this.setCurrentExprValue(i, cur);
                const v = this.expr.eval(this.exprState);
                this.setCurrentExprValue(i, cur - dv);
                const v2 = this.expr.eval(this.exprState);
                let dx = (v - v2) / dv;
                if (Math.abs(dx) < 1e-6)
                    dx = this.sign(dx, 1e-6);
                sim.stampMatrixVV(vno, vni, -dx);
                rs -= dx * cur;
                this.setCurrentExprValue(i, cur);
            }
            // partial derivatives for the v()/i() references.  the pin currents were
            // already differentiated above, so this pass only picks up the references;
            // it re-derives the same v0, so subtracting it leaves just their residual.
            if (this.engine.getRefCount() > 0)
                rs += this.engine.evalAndStamp(false) - v0;

            sim.stampRightSideVS(vno, rs);
        }

        this.engine.saveInputs();
        for (let i = 0; i !== this.inputPairCount; i++)
            this.lastCurrents[i] = this.pins[i * 2 + 1].current;
        this.lastOutput = this.nodes[this.inputCount].v - this.nodes[this.inputCount + 1].v;
    }

    // our output is a voltage source, so derivatives go into its matrix row
    stampInputDerivative(pos: CircuitNode, neg: CircuitNode, dx: number): void {
        const sim = SimulationManager.theSim;
        sim.stampMatrixNV(this.outputVS!, pos, -dx);
        sim.stampMatrixNV(this.outputVS!, neg, dx);
    }

    stampInputDerivativeVS(ivs: VoltageSource, dx: number): void {
        SimulationManager.theSim.stampMatrixVV(this.outputVS!, ivs, -dx);
    }

    stepFinished(): void {
        this.exprState.updateLastValues(this.nodes[this.inputCount].v - this.nodes[this.inputCount + 1].v);
        for (let i = 0; i !== this.inputPairCount; i++)
            this.exprState.lastValues[i] = this.pins[i * 2 + 1].current;
    }

    private setCurrentExprValue(n: number, cur: number): void {
        // set index 8 to current for backward compatibility when single input
        if (n === 0 && this.inputPairCount < 9)
            this.exprState.values[8] = cur;
        this.exprState.values[n] = cur;
    }

    getPostCount(): number { return this.inputCount + 2; }
    getVoltageSourceCount(): number { return this.isSpiceStyle() ? 1 : 1 + this.inputPairCount; }
    getDumpType(): number { return 214; }

    getConnection(n1: number, n2: number): boolean {
        return Math.floor(n1 / 2) === Math.floor(n2 / 2);
    }

    hasCurrentOutput(): boolean { return false; }
    isSpiceStyle(): boolean { return (this.flags & CCVSElm.FLAG_SPICE) !== 0; }

    setCurrent(vs: VoltageSource, c: number): void {
        let i = 0;
        if (!this.isSpiceStyle()) {
            for (i = 0; i !== this.inputCount; i += 2) {
                if (this.pins[i + 1].voltSource === vs) {
                    this.pins[i].current = -c;
                    this.pins[i + 1].current = c;
                    return;
                }
            }
        } else {
            i = this.inputCount;
        }
        if (this.pins[i].voltSource === vs) {
            this.pins[i].current = c;
            this.pins[i + 1].current = -c;
        }
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 1) {
            // input count must be even
            if (ei.value < 0 || ei.value > 8 || (ei.value % 2) === 1)
                return;
            this.inputCount = Math.round(ei.value);
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        } else {
            super.setChipEditValue(n, ei);
        }
    }

    setParentList(elmList: CircuitElm[]): void {
        super.setParentList(elmList);   // resolves our v()/i() references
        if (!this.isSpiceStyle())
            return;
        this.voltageSources = new Array(this.inputPairCount).fill(null);
        for (let i = 0; i !== this.inputCount; i += 2) {
            for (let j = 0; j !== elmList.length; j++) {
                const ce = elmList[j];
                if (!ce.isVoltageElm())
                    continue;
                if (ce.getNode(0) === this.nodes[i] && ce.getNode(1) === this.nodes[i + 1])
                    this.voltageSources[i / 2] = ce as VoltageElm;
            }
        }
    }

    setVoltageSource(j: number, vs: VoltageSource): void {
        if (this.isSpiceStyle()) {
            this.pins[this.inputCount].voltSource = vs;
            vs.setNodes(this.nodes[this.inputCount + 1], this.nodes[this.inputCount]);
        } else {
            super.setVoltageSource(j, vs);
            if (j < this.inputPairCount)
                vs.setNodes(this.nodes[j * 2], this.nodes[j * 2 + 1]);
            else
                vs.setNodes(this.nodes[this.inputCount + 1], this.nodes[this.inputCount]);
        }
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        let i = 1;
        let j = 0;
        for (j = 0; j !== this.inputCount; j += 2)
            arr[i++] = this.pins[j].text + " = " + CCVSElm.getCurrentText(-this.pins[j].current);
        arr[i++] = this.pins[j].text + " = " + CCVSElm.getVoltageText(this.nodes[j].v) + "; " +
                   this.pins[j + 1].text + " = " + CCVSElm.getVoltageText(this.nodes[j + 1].v);
        arr[i++] = "I = " + CCVSElm.getCurrentText(this.pins[j].current);
        arr[i] = null!;
    }
}
