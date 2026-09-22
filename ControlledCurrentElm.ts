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
import { Polygon } from "./Polygon";
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { StringTokenizer } from "./StringTokenizer";
import { ControlledSourceElm } from "./ControlledSourceElm";
import { FindPathInfo } from "./FindPathInfo";
import { SimulationManager } from "./SimulationManager";

// Two-terminal controlled current source: the diamond symbol with an arrow inside.
// The output current is the expression, which refers to the rest of the circuit by name
// with v(label) and i(label).
export class ControlledCurrentElm extends ControlledSourceElm {
    broken: boolean = false;

    private ashaft1!: Point;
    private ashaft2!: Point;
    private arrow!: Polygon;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined)
            super(xa, ya);
        else
            super(xa, ya, xb, yb!, f!, st!);
    }

    protected getDefaultExpr(): string { return ".001*v(in)"; }
    protected getOutputValue(): number { return this.current; }
    protected getExprLabel(): string { return "Output Current"; }

    // integer dump types are for the obsolete text format; this element is XML only
    getDumpType(): number { return 0; }
    getXmlDumpType(): string { return "ci"; }
    getElmType(): string { return "Controlled Current Source"; }

    getVoltageSourceCount(): number { return 0; }

    setPoints(): void {
        super.setPoints();
        // arrow along the diamond's long axis, pointing from post 1 to post 2
        this.ashaft1 = this.interpPoint(this.lead1!, this.lead2!, 0.3) as Point;
        this.ashaft2 = this.interpPoint(this.lead1!, this.lead2!, 0.7-.1) as Point;
        const tip = this.interpPoint(this.lead1!, this.lead2!, 0.85-.1) as Point;
        this.arrow = this.calcArrow(this.center, tip, 7, 6);
    }

    stamp(): void {
        const sim = SimulationManager.theSim;
        if (this.broken) {
            // no current path; stamping a current source would cause a matrix error
            sim.stampResistor(this.nodes[0], this.nodes[1], 1e8);
            return;
        }
        sim.stampNonLinear(this.nodes[0]);
        sim.stampNonLinear(this.nodes[1]);
    }

    doStep(): void {
        const sim = SimulationManager.theSim;
        if (this.broken || this.expr == null) {
            this.current = 0;
            return;
        }

        if (!this.engine.checkConvergence(this.getConvergeLimit()))
            sim.converged = false;

        const rs = this.engine.evalAndStamp(false);
        sim.stampCurrentSource(this.nodes[0], this.nodes[1], rs);
        this.current = this.engine.value;
        this.engine.saveInputs();
    }

    // our output is a current source from post 1 to post 2
    stampInputDerivative(pos: CircuitNode, neg: CircuitNode, dx: number): void {
        SimulationManager.theSim.stampVCCurrentSource(this.nodes[0], this.nodes[1], pos, neg, dx);
    }

    stampInputDerivativeVS(ivs: VoltageSource, dx: number): void {
        SimulationManager.theSim.stampCCCS(this.nodes[0], this.nodes[1], ivs, dx);
    }

    // a current source with nowhere for the current to go is a matrix error, so check
    validate(): boolean {
        const fpi = new FindPathInfo(FindPathInfo.INDUCT, this, this.getNode(1), SimulationManager.theSim);
        this.broken = !fpi.findPath(this.getNode(0));
        return true;
    }

    draw(g: Graphics): void {
        this.draw2Leads(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : Color.gray);
        this.setPowerColor(g, false);
        this.drawDiamond(g);

        CircuitElm.drawThickLine(g, this.ashaft1, this.ashaft2);
        g.fillPolygon(this.arrow);

        this.setBbox(this.point1, this.point2, ControlledSourceElm.diamondSize);
        this.doDots(g);
        this.drawPosts(g);
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        if (this.broken) {
            let i = 0;
            while (arr[i] != null) i++;
            arr[i] = "(no current path)";
        }
    }
}
