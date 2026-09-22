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

import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { VoltageSource } from "./VoltageSource";
import { Point } from "./Point";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Locale } from "./Locale";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Expr } from "./Expr";
import { ExprEngine } from "./ExprEngine";
import { SimulationManager } from "./SimulationManager";

// Base for the two-terminal controlled sources drawn with the usual diamond symbol.
//
// Unlike VCCSElm and friends these have no input pins: everything the expression depends
// on comes in by name, as v(label) for the voltage of a labeled node or across a named
// voltmeter, and i(label) for the current through a named ammeter.  That keeps the symbol
// to two terminals, which is how dependent sources are normally drawn.
export abstract class ControlledSourceElm extends CircuitElm {
    static readonly diamondSize = 18;

    engine: ExprEngine = new ExprEngine(this);

    get expr(): Expr | null { return this.engine.expr; }
    get exprString(): string { return this.engine.exprString; }

    center!: Point;
    private side1!: Point;
    private side2!: Point;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.setExpr(this.getDefaultExpr());
        } else {
            super(xa, ya, xb, yb!, f!);
            this.setExpr(this.getDefaultExpr());
        }
    }

    protected abstract getDefaultExpr(): string;

    // the label shown in the edit dialog and in getInfo()
    protected abstract getExprLabel(): string;

    getPostCount(): number { return 2; }
    nonLinear(): boolean { return true; }

    getRefNodeCount(): number { return this.engine ? this.engine.getRefNodeCount() : 0; }

    resolveExprRefs(elmList: CircuitElm[]): void { this.engine.resolveRefs(elmList); }

    setParentList(elmList: CircuitElm[]): void {
        super.setParentList(elmList);
        // inside a subcircuit our references came in as node numbers, so an i() reference
        // still needs its element found; at the top level this is already done
        this.engine.resolveRefElmsByNode(elmList);
    }

    // these two sources have no input pins, so every expression input is a reference
    setExpr(exprStr: string): void {
        this.engine.parse(exprStr);
        this.engine.alloc(0);
        this.allocNodes();
    }

    parseExpr(ei?: EditInfo): void {
        const err = this.engine.parse(this.engine.exprString);
        this.engine.alloc(0);
        this.allocNodes();
        if (err != null && ei != null) {
            ei.setErrorFieldName(this.getExprLabel());
            ei.setError(Locale.LS("Parse error in expression") + ": " +
                this.engine.exprString + ": " + err);
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ex", this.engine.exprString);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.engine.exprString = xml.parseStringAttr("ex", this.engine.exprString) ?? this.engine.exprString;
        this.parseExpr();
    }

    // the diamond's long diagonal runs along the element; the leads meet its two tips
    setPoints(): void {
        super.setPoints();
        const d = ControlledSourceElm.diamondSize;
        this.calcLeads(d * 2);
        this.center = this.interpPoint(this.point1, this.point2, 0.5) as Point;
        this.side1  = this.interpPoint(this.point1, this.point2, 0.5,  d) as Point;
        this.side2  = this.interpPoint(this.point1, this.point2, 0.5, -d) as Point;
    }

    protected drawDiamond(g: Graphics): void {
        CircuitElm.drawThickLine(g, this.lead1!, this.side1);
        CircuitElm.drawThickLine(g, this.side1,  this.lead2!);
        CircuitElm.drawThickLine(g, this.lead2!, this.side2);
        CircuitElm.drawThickLine(g, this.side2,  this.lead1!);
    }

    // same widening schedule VCCSElm uses, so a hard-to-converge expression still settles
    protected getConvergeLimit(): number {
        const sim = SimulationManager.theSim;
        if (sim.subIterations < 10)  return 0.001;
        if (sim.subIterations < 200) return 0.01;
        return 0.1;
    }

    reset(): void {
        super.reset();
        this.engine.reset();
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo(EditInfo.makeLink("customfunction.html", this.getExprLabel()), 0, -1, -1);
            ei.text = this.engine.exprString;
            ei.disallowSliders();
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.engine.exprString = ei.textf!.value;
            this.parseExpr(ei);
        }
    }

    getInfo(arr: string[]): void {
        arr[0] = this.getElmType();
        arr[1] = this.getExprLabel() + " = " + this.engine.exprString;
        arr[2] = "V = " + CircuitElm.getVoltageText(this.getVoltageDiff());
        arr[3] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
        this.engine.addUnresolvedInfo(arr, 4);
    }

    getVoltageDiff(): number { return this.nodes[1].v - this.nodes[0].v; }
    getPower(): number { return -this.getVoltageDiff() * this.current; }

    // ExprStampTarget: subclasses stamp into whatever their output is
    abstract stampInputDerivative(pos: CircuitNode, neg: CircuitNode, dx: number): void;
    abstract stampInputDerivativeVS(vs: VoltageSource, dx: number): void;
}
