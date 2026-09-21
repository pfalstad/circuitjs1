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
import { CircuitNode } from "./CircuitNode";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { VoltageElm } from "./VoltageElm";
import { ExprState } from "./Expr";
import { EditInfo } from "./EditInfo";
import { VCCSElm } from "./VCCSElm";
import { SimulationManager } from "./SimulationManager";

export class CCCSElm extends VCCSElm {
    static readonly FLAG_SPICE = 2;

    voltageSources: VoltageElm[] = [];
    declare inputPairCount: number;
    declare lastCurrents: number[];

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
        this.pins[i * 2]     = new Pin(this, 0, ChipElm.SIDE_E, "O+");
        this.pins[i * 2].output = true;
        this.pins[i * 2 + 1] = new Pin(this, 1, ChipElm.SIDE_E, "O-");
        this.exprState = new ExprState(this.inputPairCount);
        this.lastCurrents = new Array(this.inputPairCount + 1).fill(0);
        this.allocExprArrays();
        this.allocNodes();
    }

    // our pin inputs are currents, so the only voltage-driven expression inputs are
    // the nodes referenced by v(name)
    protected getPinVoltageInputCount(): number { return 0; }

    getChipName(): string { return "CCCS"; }

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
        sim.stampNonLinear(this.nodes[this.inputCount]);
        sim.stampNonLinear(this.nodes[this.inputCount + 1]);
    }

    doStep(): void {
        const sim = SimulationManager.theSim;

        if (this.broken) {
            this.pins[this.inputCount].current = 0;
            this.pins[this.inputCount + 1].current = 0;
            sim.stampResistor(this.nodes[this.inputCount], this.nodes[this.inputCount + 1], 1e8);
            return;
        }

        if (this.isSpiceStyle()) {
            for (let i = 0; i !== this.inputPairCount; i++)
                this.pins[i * 2 + 1].current = this.voltageSources[i].getCurrent();
        }

        // check convergence
        const convergeLimit = this.getConvergeLimit() * 0.1;
        for (let i = 0; i <= this.inputPairCount; i++) {
            const cur = this.pins[i * 2 + 1].current;
            if (Math.abs(cur - this.lastCurrents[i]) > convergeLimit)
                sim.converged = false;
        }

        for (let i = 0; i <= this.inputPairCount; i++)
            this.lastCurrents[i] = this.pins[i * 2 + 1].current;

        // check convergence on nodes referenced by v(name)
        const vic = this.getVoltageInputCount();
        for (let i = 0; i !== vic; i++) {
            if (Math.abs(this.getVoltageInputNode(i).v - this.lastVolts[i]) > this.getConvergeLimit())
                sim.converged = false;
        }

        if (this.expr != null) {
            for (let i = 0; i !== this.inputPairCount; i++)
                this.setCurrentExprValue(i, this.pins[i * 2 + 1].current);
            for (let i = 0; i !== vic; i++)
                this.setVoltageInputValue(i, this.getVoltageInputNode(i).v);
            this.exprState.t = sim.t;
            const v0 = this.expr.eval(this.exprState);
            let rs = v0;

            this.pins[this.inputCount].current     = v0;
            this.pins[this.inputCount + 1].current = -v0;

            for (let i = 0; i !== this.inputPairCount; i++) {
                const cur = this.pins[i * 2 + 1].current;
                let dv = cur - this.lastCurrents[i];
                if (Math.abs(dv) < 1e-6) dv = 1e-6;
                this.setCurrentExprValue(i, cur);
                const v = this.expr.eval(this.exprState);
                this.setCurrentExprValue(i, cur - dv);
                const v2 = this.expr.eval(this.exprState);
                let dx = (v - v2) / dv;
                if (Math.abs(dx) < 1e-6)
                    dx = this.sign(dx, 1e-6);
                sim.stampCCCS(this.nodes[this.inputCount + 1], this.nodes[this.inputCount],
                    this.pins[i * 2 + 1].voltSource!, dx);
                rs -= dx * cur;
                this.setCurrentExprValue(i, cur);
            }

            // partial derivatives for the nodes referenced by v(name)
            for (let i = 0; i !== vic; i++) {
                const cn = this.getVoltageInputNode(i);
                let dv = cn.v - this.lastVolts[i];
                if (Math.abs(dv) < 1e-6) dv = 1e-6;
                this.setVoltageInputValue(i, cn.v);
                const v = this.expr.eval(this.exprState);
                this.setVoltageInputValue(i, cn.v - dv);
                const v2 = this.expr.eval(this.exprState);
                let dx = (v - v2) / dv;
                if (Math.abs(dx) < 1e-6)
                    dx = this.sign(dx, 1e-6);
                sim.stampVCCurrentSource(this.nodes[this.inputCount + 1], this.nodes[this.inputCount],
                    cn, CircuitNode.ground, dx);
                rs -= dx * cn.v;
                this.setVoltageInputValue(i, cn.v);
            }

            sim.stampCurrentSource(this.nodes[this.inputCount + 1], this.nodes[this.inputCount], rs);
        }

        for (let i = 0; i !== vic; i++)
            this.lastVolts[i] = this.getVoltageInputNode(i).v;
    }

    stepFinished(): void {
        this.exprState.updateLastValues(this.pins[this.inputCount].current);
    }

    private setCurrentExprValue(n: number, cur: number): void {
        if (n === 0 && this.inputPairCount < 9)
            this.exprState.values[8] = cur;
        this.exprState.values[n] = cur;
    }

    getPostCount(): number { return (this.inputCount ?? 0) + 2; }
    getVoltageSourceCount(): number { return this.isSpiceStyle() ? 0 : this.inputPairCount; }
    getDumpType(): number { return 215; }

    getConnection(n1: number, n2: number): boolean {
        return Math.floor(n1 / 2) === Math.floor(n2 / 2);
    }

    hasCurrentOutput(): boolean { return true; }
    isSpiceStyle(): boolean { return (this.flags & CCCSElm.FLAG_SPICE) !== 0; }

    setCurrent(vs: VoltageSource, c: number): void {
        for (let i = 0; i !== this.inputCount; i += 2) {
            if (this.pins[i + 1].voltSource === vs) {
                this.pins[i].current = -c;
                this.pins[i + 1].current = c;
                return;
            }
        }
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 1) {
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
        if (!this.isSpiceStyle())
            return;
        this.voltageSources = new Array(this.inputPairCount).fill(null);
        for (let i = 0; i !== this.inputCount; i += 2) {
            for (let j = 0; j !== elmList.length; j++) {
                const ce = elmList[j];
                if (!ce.isVoltageElm()) continue;
                if (ce.getNode(0) === this.nodes[i] && ce.getNode(1) === this.nodes[i + 1])
                    this.voltageSources[i / 2] = ce as VoltageElm;
            }
        }
    }

    setVoltageSource(j: number, vs: VoltageSource): void {
        if (this.isSpiceStyle()) {
            this.pins[this.inputCount].voltSource = vs;
        } else {
            super.setVoltageSource(j, vs);
            vs.setNodes(this.nodes[j * 2], this.nodes[j * 2 + 1]);
        }
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        let i = 1;
        let j = 0;
        for (j = 0; j !== this.inputCount; j += 2)
            arr[i++] = this.pins[j].text + " = " + CCCSElm.getCurrentText(-this.pins[j].current);
        arr[i++] = this.pins[j].text + " = " + CCCSElm.getVoltageText(this.nodes[j].v) + "; " +
                   this.pins[j + 1].text + " = " + CCCSElm.getVoltageText(this.nodes[j + 1].v);
        arr[i++] = "I = " + CCCSElm.getCurrentText(this.pins[j].current);
        arr[i] = null!;
    }
}
