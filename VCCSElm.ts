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
import { CircuitNode } from "./CircuitNode";
import { StringTokenizer } from "./StringTokenizer";
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";
import { FindPathInfo } from "./FindPathInfo";
import { Expr, ExprState, ExprParser } from "./Expr";
import { SimulationManager } from "./SimulationManager";
import { parseIntStrict } from "./NumberParse";
import { HookRegistry } from "./HookRegistry";

export class VCCSElm extends ChipElm {
    gain: number = 0;
    inputCount: number;
    expr: Expr | null = null;
    exprState!: ExprState;
    exprString: string;
    broken: boolean = false;
    lastVolts: number[] = [];
    // labeled nodes referenced by v(name) in the expression, in ExprState.nodeValues order
    refNames: string[] = [];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.inputCount = 2;
            this.exprString = ".1*(a-b)";
            this.parseExpr();
            this.setupPins();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.inputCount = parseIntStrict(st!.nextToken());
            this.exprString = CustomLogicModel.unescape(st!.nextToken());
            this.parseExpr();
            this.setupPins();
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ic", this.inputCount);
        CircuitXMLSerializer.dumpAttr(elem, "ex", this.exprString);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.inputCount = xml.parseIntAttr("ic", this.inputCount);
        this.exprString = xml.parseStringAttr("ex", this.exprString);
        this.parseExpr();
        this.setupPins();
    }

    setupPins(): void {
        if (!this.inputCount)
	    this.inputCount = 0;
        this.sizeX = 2;
        this.sizeY = this.inputCount > 2 ? this.inputCount : 2;
        this.pins = new Array(this.inputCount + 2);
        for (let i = 0; i !== this.inputCount; i++)
            this.pins[i] = new Pin(this, i, ChipElm.SIDE_W, String.fromCharCode(65 + i)); // 'A'+i
        this.pins[this.inputCount]     = new Pin(this, 0, ChipElm.SIDE_E, "C+");
        this.pins[this.inputCount + 1] = new Pin(this, 1, ChipElm.SIDE_E, "C-");
        this.exprState = new ExprState(this.inputCount);
        this.allocExprArrays();
        this.allocNodes();
    }

    // size the arrays that depend on how many node voltages drive the expression.
    // called from setupPins() (input count changed) and parseExpr() (v() references changed).
    protected allocExprArrays(): void {
        if (this.exprState != null)
            this.exprState.nodeValues = new Array(this.getRefNodeCount()).fill(0);
        this.lastVolts = new Array(this.getVoltageInputCount()).fill(0);
    }

    getRefNodeCount(): number { return this.refNames ? this.refNames.length : 0; }
    getRefNodeName(i: number): string | null { return this.refNames[i]; }

    // number of expression inputs driven by pin voltages.  0 for the current-controlled
    // subclasses, whose pin inputs are currents rather than voltages.
    protected getPinVoltageInputCount(): number { return this.inputCount ? this.inputCount : 0; }

    // total number of expression inputs driven by a node voltage: the voltage input pins
    // followed by the nodes referenced by v(name)
    protected getVoltageInputCount(): number {
        return this.getPinVoltageInputCount() + this.getRefNodeCount();
    }

    // the node driving voltage input i
    protected getVoltageInputNode(i: number): CircuitNode {
        const pvc = this.getPinVoltageInputCount();
        if (i < pvc)
            return this.nodes[i];
        return this.nodes[this.getPostCount() + this.getInternalNodeCount() + (i - pvc)];
    }

    // store a value in the ExprState slot that voltage input i reads
    protected setVoltageInputValue(i: number, v: number): void {
        const pvc = this.getPinVoltageInputCount();
        if (i < pvc)
            this.exprState.values[i] = v;
        else
            this.exprState.nodeValues[i - pvc] = v;
    }

    getChipName(): string { return "VCCS~"; }
    nonLinear(): boolean { return true; }
    isDigitalChip(): boolean { return false; }

    stamp(): void {
        const sim = SimulationManager.theSim;
        sim.stampNonLinear(this.nodes[this.inputCount]);
        sim.stampNonLinear(this.nodes[this.inputCount + 1]);
    }

    protected sign(a: number, b: number): number {
        return a > 0 ? b : -b;
    }

    protected getConvergeLimit(): number {
        const sim = SimulationManager.theSim;
        if (sim.subIterations < 10)   return 0.001;
        if (sim.subIterations < 200)  return 0.01;
        return 0.1;
    }

    hasCurrentOutput(): boolean { return true; }

    getOutputNode(n: number): CircuitNode {
        return this.nodes[n + this.inputCount];
    }

    doStep(): void {
        const sim = SimulationManager.theSim;

        if (this.broken) {
            this.pins[this.inputCount].current = 0;
            this.pins[this.inputCount + 1].current = 0;
            sim.stampResistor(this.nodes[this.inputCount], this.nodes[this.inputCount + 1], 1e8);
            return;
        }

        // check convergence
        const vic = this.getVoltageInputCount();
        const convergeLimit = this.getConvergeLimit();
        for (let i = 0; i !== vic; i++) {
            if (Math.abs(this.getVoltageInputNode(i).v - this.lastVolts[i]) > convergeLimit)
                sim.converged = false;
        }

        if (this.expr != null) {
            // load input voltages into expression state
            for (let i = 0; i !== vic; i++)
                this.setVoltageInputValue(i, this.getVoltageInputNode(i).v);
            this.exprState.t = sim.t;
            const v0 = -this.expr.eval(this.exprState);
            let rs = v0;

            // stamp partial derivatives for linearization
            for (let i = 0; i !== vic; i++) {
                const cn = this.getVoltageInputNode(i);
                let dv = cn.v - this.lastVolts[i];
                if (Math.abs(dv) < 1e-6) dv = 1e-6;
                this.setVoltageInputValue(i, cn.v);
                const v = -this.expr.eval(this.exprState);
                this.setVoltageInputValue(i, cn.v - dv);
                const v2 = -this.expr.eval(this.exprState);
                let dx = (v - v2) / dv;
                if (Math.abs(dx) < 1e-6)
                    dx = this.sign(dx, 1e-6);
                sim.stampVCCurrentSource(this.nodes[this.inputCount], this.nodes[this.inputCount + 1],
                    cn, CircuitNode.ground, dx);
                rs -= dx * cn.v;
                this.setVoltageInputValue(i, cn.v);
            }
            sim.stampCurrentSource(this.nodes[this.inputCount], this.nodes[this.inputCount + 1], rs);
            this.pins[this.inputCount].current     = -v0;
            this.pins[this.inputCount + 1].current = v0;
        }

        for (let i = 0; i !== vic; i++)
            this.lastVolts[i] = this.getVoltageInputNode(i).v;
    }

    stepFinished(): void {
        this.exprState.updateLastValues(this.pins[this.inputCount].current);
    }

    draw(g: Graphics): void {
        this.drawChip(g);
    }

    getPostCount(): number { return this.inputCount + 2; }
    getVoltageSourceCount(): number { return 0; }
    getDumpType(): number { return 213; }

    getConnection(n1: number, n2: number): boolean {
        return this.comparePair(this.inputCount, this.inputCount + 1, n1, n2);
    }

    getMatrixConnection(_n1: number, _n2: number): boolean { return true; }

    hasGroundConnection(_n1: number): boolean { return false; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo(EditInfo.makeLink("customfunction.html", "Output Function"), 0, -1, -1);
            ei.text = this.exprString;
            ei.disallowSliders();
            return ei;
        }
        if (n === 1)
            return new EditInfo("# of Inputs", this.inputCount, 1, 8).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.exprString = ei.textf!.value;
            this.parseExpr(ei);
            return;
        }
        if (n === 1) {
            if (ei.value < 0 || ei.value > 8) return;
            this.inputCount = Math.round(ei.value);
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
    }

    setExpr(exprStr: string): void {
        this.exprString = exprStr;
        this.parseExpr();
    }

    parseExpr(ei?: EditInfo): void {
        const parser = new ExprParser(this.exprString);
        this.expr = parser.parseExpression();
        // v(name) references change our node count, so resize before anyone reads it
        this.refNames = parser.getNodeNames();
        this.allocExprArrays();
        this.allocNodes();
        const err = parser.gotError();
        if (err != null && ei != null) {
            ei.setErrorFieldName("Output Function");
            ei.setError(Locale.LS("Parse error in expression") + ": " + this.exprString + ": " + err);
        }
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        let i = 0;
        while (arr[i] != null) i++;
        arr[i] = "I = " + VCCSElm.getCurrentText(this.pins[this.inputCount].current);
        this.addRefNodeInfo(arr, i + 1);
    }

    // report any v(name) reference we couldn't resolve to a labeled node
    protected addRefNodeInfo(arr: string[], i: number): void {
        for (let j = 0; j !== this.getRefNodeCount(); j++)
            if (HookRegistry.getLabeledNode?.(this.refNames[j]) == null)
                arr[i++] = Locale.LS("unknown node label") + ": " + this.refNames[j];
    }

    reset(): void {
        super.reset();
        this.exprState.reset();
    }

    validate(): boolean {
        const fpi = new FindPathInfo(FindPathInfo.INDUCT, this, this.getOutputNode(0), SimulationManager.theSim);
        if (this.hasCurrentOutput() && !fpi.findPath(this.getOutputNode(1)))
            this.broken = true;
        else
            this.broken = false;
        return true;
    }
}
