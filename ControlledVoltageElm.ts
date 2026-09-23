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
import { Graphics } from "./Graphics";
import { Font } from "./Font";
import { Color } from "./Color";
import { StringTokenizer } from "./StringTokenizer";
import { ControlledSourceElm } from "./ControlledSourceElm";
import { SimulationManager } from "./SimulationManager";

// Two-terminal controlled voltage source: the diamond symbol with + and - inside.
// The output voltage is the expression, which refers to the rest of the circuit by name
// with v(label) and i(label).
export class ControlledVoltageElm extends ControlledSourceElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined)
            super(xa, ya);
        else
            super(xa, ya, xb, yb!, f!, st!);
    }

    protected getDefaultExpr(): string { return "v(in)"; }
    protected getOutputValue(): number { return this.getVoltageDiff(); }
    protected getExprLabel(): string { return "Output Voltage"; }

    // integer dump types are for the obsolete text format; this element is XML only
    getDumpType(): number { return 0; }
    getXmlDumpType(): string { return "cv"; }
    getElmType(): string { return "Controlled Voltage Source"; }

    getVoltageSourceCount(): number { return 1; }

    // tell the voltage source which nodes it sits between, so assignMatrix() can find
    // its matrix.  same order as the stamp below.
    setVoltageSource(n: number, v: VoltageSource): void {
        super.setVoltageSource(n, v);
        v.setNodes(this.nodes[0], this.nodes[1]);
    }

    stamp(): void {
        const sim = SimulationManager.theSim;
        sim.stampNonLinearVS(this.voltSource!);
        sim.stampVoltageSource(this.nodes[0], this.nodes[1], this.voltSource);
    }

    doStep(): void {
        const sim = SimulationManager.theSim;
        if (this.expr == null)
            return;

        if (!this.engine.checkConvergence(this.getConvergeLimit()))
            sim.converged = false;

        const rs = this.engine.evalAndStamp(false);

        // the output has to settle too, not just the inputs
        const v0 = this.engine.value;
        if (Math.abs(this.nodes[1].v - this.nodes[0].v - v0) > Math.abs(v0) * 0.01 &&
                sim.subIterations < 100)
            sim.converged = false;

        sim.stampRightSideVS(this.voltSource!, rs);
        this.engine.saveInputs();
    }

    // our output is a voltage source, so derivatives go into its matrix row
    stampInputDerivative(pos: CircuitNode, neg: CircuitNode, dx: number): void {
        const sim = SimulationManager.theSim;
        sim.stampMatrixNV(this.voltSource!, pos, -dx);
        sim.stampMatrixNV(this.voltSource!, neg, dx);
    }

    stampInputDerivativeVS(ivs: VoltageSource, dx: number): void {
        SimulationManager.theSim.stampMatrixVV(this.voltSource!, ivs, -dx);
    }

    setCurrent(_vs: VoltageSource, c: number): void { this.current = c; }

    draw(g: Graphics): void {
        this.draw2Leads(g);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : Color.gray);
        this.setPowerColor(g, false);
        this.drawDiamond(g);

        // post 2 is the + terminal, matching VoltageElm (getVoltageDiff is node1 - node0).
        // position these along the diamond (lead1..lead2), not along the element: the
        // diamond is a fixed size, so element-length fractions drift outside it when the
        // element is stretched.  halfway out to each tip the diamond is still half as
        // wide as it is tall, which leaves room for the glyph.
        g.setFont(new Font("SansSerif", 0, 12));
        const pm = this.interpPoint(this.lead1!, this.lead2!, 0.3);
        const pp = this.interpPoint(this.lead1!, this.lead2!, 0.7);
        this.drawCenteredText(g, "−", pm.x, pm.y, true);
        this.drawCenteredText(g, "+", pp.x, pp.y, true);

        this.setBbox(this.point1, this.point2, ControlledSourceElm.diamondSize);
        this.doDots(g);
        this.drawPosts(g);
    }
}
