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
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";

export class TunnelDiodeElm extends CircuitElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
        }
        this.setup();
    }

    nonLinear(): boolean { return true; }

    setup(): void {}

    getDumpType(): number { return 175; }

    readonly hs = 8;
    poly!: Polygon;
    cathode!: Point[];

    setPoints(): void {
        super.setPoints();
        this.calcLeads(16);
        this.cathode = this.newPointArray(4);
        const pa = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, pa[0], pa[1], 0, this.hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.cathode[0], this.cathode[1], 1, this.hs);
        this.interpPoint2(this.lead1!, this.lead2!, this.cathode[2], this.cathode[3], .8, this.hs);
        this.poly = this.createPolygon(pa[0], pa[1], this.lead2!);
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.hs);

        const v1 = this.nodes[0].v;
        const v2 = this.nodes[1].v;

        this.draw2Leads(g);

        // draw arrow thingy
        this.setPowerColor(g, true);
        this.setVoltageColor(g, v1);
        g.fillPolygon(this.poly);

        // draw thing arrow is pointing to
        this.setVoltageColor(g, v2);
        CircuitElm.drawThickLine(g, this.cathode[0], this.cathode[1]);
        CircuitElm.drawThickLine(g, this.cathode[2], this.cathode[0]);
        CircuitElm.drawThickLine(g, this.cathode[3], this.cathode[1]);

        this.doDots(g);
        this.drawPosts(g);
    }

    reset(): void {
        this.lastvoltdiff = this.curcount = 0;
    }

    lastvoltdiff: number = 0;

    limitStep(vnew: number, vold: number): number {
        // Prevent voltage changes of more than 1V when iterating.
        if (vnew > vold + 1)
            return vold + 1;
        if (vnew < vold - 1)
            return vold - 1;
        return vnew;
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
    }

    static readonly pvp  = .1;
    static readonly pip  = 4.7e-3;
    static readonly pvv  = .37;
    static readonly pvt  = .026;
    static readonly pvpp = .525;
    static readonly piv  = 370e-6;

    doStep(): void {
        let voltdiff = this.nodes[0].v - this.nodes[1].v;
        if (Math.abs(voltdiff - this.lastvoltdiff) > .01)
            CircuitElm.sim.converged = false;
        voltdiff = this.limitStep(voltdiff, this.lastvoltdiff);
        this.lastvoltdiff = voltdiff;

        const { pvp, pip, pvv, pvt, pvpp, piv } = TunnelDiodeElm;
        const i0 = piv * Math.exp(-pvv);
        const i = pip * Math.exp(-pvpp / pvt) * (Math.exp(voltdiff / pvt) - 1) +
            pip * (voltdiff / pvp) * Math.exp(1 - voltdiff / pvp) +
            piv * Math.exp(voltdiff - pvv) - i0;

        const geq = pip * Math.exp(-pvpp / pvt) * Math.exp(voltdiff / pvt) / pvt +
            pip * Math.exp(1 - voltdiff / pvp) / pvp
            - Math.exp(1 - voltdiff / pvp) * pip * voltdiff / (pvp * pvp) +
            Math.exp(voltdiff - pvv) * piv;
        const nc = i - geq * voltdiff;
        CircuitElm.sim.stampConductance(this.nodes[0], this.nodes[1], geq);
        CircuitElm.sim.stampCurrentSource(this.nodes[0], this.nodes[1], nc);
    }

    calculateCurrent(): void {
        const voltdiff = this.nodes[0].v - this.nodes[1].v;
        const { pvp, pip, pvv, pvt, pvpp, piv } = TunnelDiodeElm;
        const i0 = piv * Math.exp(-pvv);
        this.current = pip * Math.exp(-pvpp / pvt) * (Math.exp(voltdiff / pvt) - 1) +
            pip * (voltdiff / pvp) * Math.exp(1 - voltdiff / pvp) +
            piv * Math.exp(voltdiff - pvv) - i0;
    }

    getInfo(arr: string[]): void {
        arr[0] = "tunnel diode";
        arr[1] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
        arr[2] = "Vd = " + CircuitElm.getVoltageText(this.getVoltageDiff());
        arr[3] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
    }
}
