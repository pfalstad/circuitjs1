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
import { CircuitElm } from "./CircuitElm";
import { VoltageSource } from "./VoltageSource";
import { StringTokenizer } from "./StringTokenizer";
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";
import { FindPathInfo } from "./FindPathInfo";
import { Expr, ExprState, ExprParser, ExprNodeRef } from "./Expr";
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
    // previous value of each expression input, used for the numeric derivative
    lastInputs: number[] = [];
    // quantities referenced by v(name)/i(name), in ExprState.nodeValues order
    refs: ExprNodeRef[] = [];
    // what each reference resolved to: the meter element for a v()/i() on a named meter,
    // null for a labeled node (whose node we hold directly) or an unresolved name
    refElms: (CircuitElm | null)[] = [];

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

    // size the arrays that depend on how many inputs drive the expression.  called from
    // setupPins() (input count changed) and parseExpr() (v()/i() references changed).
    protected allocExprArrays(): void {
        if (this.exprState != null)
            this.exprState.nodeValues = new Array(this.getRefCount()).fill(0);
        this.lastInputs = new Array(this.getExprInputCount()).fill(0);
    }

    getRefCount(): number { return this.refs ? this.refs.length : 0; }

    // two nodes per reference: the positive and negative end of the referenced quantity
    getRefNodeCount(): number { return 2 * this.getRefCount(); }

    // index in nodes[] of the positive node of reference k
    protected refNodeIndex(k: number): number {
        return this.getPostCount() + this.getInternalNodeCount() + 2 * k;
    }

    resolveExprRefs(elmList: CircuitElm[]): void {
        this.refElms = new Array(this.getRefCount()).fill(null);
        for (let k = 0; k !== this.getRefCount(); k++) {
            const ref = this.refs[k];
            const ix = this.refNodeIndex(k);
            this.setRefNode(ix,     CircuitNode.ground);
            this.setRefNode(ix + 1, CircuitNode.ground);

            // a labeled node wins over an element with the same name
            if (!ref.current) {
                const cn = HookRegistry.getLabeledNode?.(ref.name);
                if (cn != null) {
                    this.setRefNode(ix, cn);
                    continue;
                }
            }

            let elm: CircuitElm | null = null;
            for (let j = 0; j !== elmList.length; j++)
                if (elmList[j].getExprRefName() === ref.name) {
                    elm = elmList[j];
                    break;
                }
            if (elm == null || elm.getPostCount() < 2)
                continue;  // unresolved; the slots stay ground and getInfo() reports it
            this.refElms[k] = elm;
            // take the meter's nodes even for a current reference, where we don't stamp
            // against them: its voltage source row has to land in the same matrix as us.
            this.setRefNode(ix,     elm.getNode(0));
            this.setRefNode(ix + 1, elm.getNode(1));
        }
    }

    // number of expression inputs driven by pin voltages.  0 for the current-controlled
    // subclasses, whose pin inputs are currents rather than voltages.
    protected getPinExprInputCount(): number { return this.inputCount ? this.inputCount : 0; }

    // total number of expression inputs we take a derivative against: the voltage input
    // pins followed by the v()/i() references
    protected getExprInputCount(): number {
        return this.getPinExprInputCount() + this.getRefCount();
    }

    // current value of expression input i
    protected getExprInputValue(i: number): number {
        const pc = this.getPinExprInputCount();
        if (i < pc)
            return this.nodes[i].v;
        const k = i - pc;
        const elm = this.refElms[k];
        if (this.refs[k].current)
            return (elm == null) ? 0 : elm.getCurrent();
        const ix = this.refNodeIndex(k);
        return this.nodes[ix].v - this.nodes[ix + 1].v;
    }

    // store a value in the ExprState slot that expression input i reads
    protected setExprInputValue(i: number, v: number): void {
        const pc = this.getPinExprInputCount();
        if (i < pc)
            this.exprState.values[i] = v;
        else
            this.exprState.nodeValues[i - pc] = v;
    }

    // the node pair expression input i is a voltage across, for stamping its derivative.
    // ground/ground for a current reference, which stamps against a voltage source instead.
    protected getExprInputNodePos(i: number): CircuitNode {
        const pc = this.getPinExprInputCount();
        if (i < pc)
            return this.nodes[i];
        const k = i - pc;
        return this.refs[k].current ? CircuitNode.ground : this.nodes[this.refNodeIndex(k)];
    }

    protected getExprInputNodeNeg(i: number): CircuitNode {
        const pc = this.getPinExprInputCount();
        if (i < pc)
            return CircuitNode.ground;
        const k = i - pc;
        return this.refs[k].current ? CircuitNode.ground : this.nodes[this.refNodeIndex(k) + 1];
    }

    // the voltage source expression input i is the current through, or null if it's a voltage
    protected getExprInputVS(i: number): VoltageSource | null {
        const pc = this.getPinExprInputCount();
        if (i < pc)
            return null;
        const k = i - pc;
        if (!this.refs[k].current)
            return null;
        const elm = this.refElms[k];
        return (elm == null) ? null : elm.voltSource;
    }

    // currents are much smaller than voltages, so they get a tighter convergence window,
    // matching what CCCSElm/CCVSElm already do for their current inputs
    protected getExprInputConvergeLimit(i: number): number {
        const lim = this.getConvergeLimit();
        return this.getExprInputVS(i) != null ? lim * 0.1 : lim;
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
        const eic = this.getExprInputCount();
        for (let i = 0; i !== eic; i++) {
            if (Math.abs(this.getExprInputValue(i) - this.lastInputs[i]) > this.getExprInputConvergeLimit(i))
                sim.converged = false;
        }

        if (this.expr != null) {
            // load inputs into expression state
            for (let i = 0; i !== eic; i++)
                this.setExprInputValue(i, this.getExprInputValue(i));
            this.exprState.t = sim.t;
            const v0 = -this.expr.eval(this.exprState);
            let rs = v0;

            // stamp partial derivatives for linearization
            for (let i = 0; i !== eic; i++) {
                const x0 = this.getExprInputValue(i);
                let dv = x0 - this.lastInputs[i];
                if (Math.abs(dv) < 1e-6) dv = 1e-6;
                this.setExprInputValue(i, x0);
                const v = -this.expr.eval(this.exprState);
                this.setExprInputValue(i, x0 - dv);
                const v2 = -this.expr.eval(this.exprState);
                let dx = (v - v2) / dv;
                if (Math.abs(dx) < 1e-6)
                    dx = this.sign(dx, 1e-6);
                const vs = this.getExprInputVS(i);
                if (vs != null)
                    sim.stampCCCS(this.nodes[this.inputCount + 1], this.nodes[this.inputCount], vs, dx);
                else
                    sim.stampVCCurrentSource(this.nodes[this.inputCount], this.nodes[this.inputCount + 1],
                        this.getExprInputNodePos(i), this.getExprInputNodeNeg(i), dx);
                rs -= dx * x0;
                this.setExprInputValue(i, x0);
            }
            sim.stampCurrentSource(this.nodes[this.inputCount], this.nodes[this.inputCount + 1], rs);
            this.pins[this.inputCount].current     = -v0;
            this.pins[this.inputCount + 1].current = v0;
        }

        for (let i = 0; i !== eic; i++)
            this.lastInputs[i] = this.getExprInputValue(i);
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
        // v()/i() references change our node count, so resize before anyone reads it
        this.refs = parser.getNodeRefs();
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

    // report any v()/i() reference we couldn't resolve
    protected addRefNodeInfo(arr: string[], i: number): void {
        for (let k = 0; k !== this.getRefCount(); k++) {
            const ref = this.refs[k];
            const resolved = this.refElms[k] != null ||
                (!ref.current && HookRegistry.getLabeledNode?.(ref.name) != null);
            if (!resolved)
                arr[i++] = Locale.LS("unknown name") + ": " +
                    (ref.current ? "i(" : "v(") + ref.name + ")";
            else if (ref.current && this.getExprInputVS(k + this.getPinExprInputCount()) == null)
                arr[i++] = Locale.LS("not a current meter") + ": " + ref.name;
        }
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
