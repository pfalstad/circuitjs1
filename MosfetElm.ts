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
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { Diode } from "./Diode";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class MosfetElm extends CircuitElm {
    pnp: number;
    readonly FLAG_PNP = 1;
    readonly FLAG_SHOWVT = 2;
    readonly FLAG_DIGITAL = 4;
    readonly FLAG_FLIP = 8;
    readonly FLAG_HIDE_BULK = 16;
    readonly FLAG_BODY_DIODE = 32;
    readonly FLAG_BODY_TERMINAL = 64;
    readonly FLAG_SHOW_BODY_DIODE = 128;
    readonly FLAGS_GLOBAL: number;
    bodyTerminal: number;

    vt: number;
    beta: number;
    static globalFlags: number = 0;
    diodeB1: Diode;
    diodeB2: Diode;
    diodeCurrent1: number = 0;
    diodeCurrent2: number = 0;
    bodyCurrent: number = 0;
    curcount_body1: number = 0;
    curcount_body2: number = 0;
    static lastBeta: number = 0;

    readonly hs = 16;

    // points for source and drain (swapped on PNP)
    src: Point[];
    drn: Point[];

    // points for gate, body, and circle on PNP digital
    gate: Point[];
    body: Point[];
    pcircle: Point;
    pcircler: number;
    arrowPoly: Polygon;
    bodyDiodePoly: Polygon;
    bodyDiodePoly2: Polygon;
    bodyDiodeCathode: Point[];
    bodyDiodeCathode2: Point[];
    bodyDiodeLeads: Point[];

    constructor(xx: number, yy: number, pnpflag: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrPnp?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (typeof xbOrPnp === "boolean") {
            super(xa, ya);
            this.pnp = xbOrPnp ? -1 : 1;
            this.flags = xbOrPnp ? this.FLAG_PNP : 0;
            this.flags |= this.FLAG_BODY_DIODE;
            this.noDiagonal = true;
            this.FLAGS_GLOBAL = this.FLAG_HIDE_BULK | this.FLAG_DIGITAL | this.FLAG_SHOW_BODY_DIODE;
            this.setupDiodes();
            this.beta = this.getDefaultBeta();
            this.vt = this.getDefaultThreshold();
        } else {
            super(xa, ya, xbOrPnp!, yb!, f!);
            this.pnp = ((f! & this.FLAG_PNP) !== 0) ? -1 : 1;
            this.noDiagonal = true;
            this.FLAGS_GLOBAL = this.FLAG_HIDE_BULK | this.FLAG_DIGITAL | this.FLAG_SHOW_BODY_DIODE;
            this.setupDiodes();
            this.vt = this.getDefaultThreshold();
            this.beta = this.getBackwardCompatibilityBeta();
            try {
                this.vt = parseFloat(st!.nextToken());
                this.beta = parseFloat(st!.nextToken());
            } catch (e) {}
            MosfetElm.globalFlags = this.flags & this.FLAGS_GLOBAL;
            this.allocNodes(); // make sure volts[] has right number of elements when hasBodyTerminal() is true
        }
    }

    setupDiodes(): void {
        // diode from node 1 to body terminal
        this.diodeB1 = new Diode(CircuitElm.sim);
        this.diodeB1.setupForDefaultModel();
        // diode from node 2 to body terminal
        this.diodeB2 = new Diode(CircuitElm.sim);
        this.diodeB2.setupForDefaultModel();
    }

    getDefaultThreshold(): number { return 1.5; }

    getDefaultBeta(): number { return MosfetElm.lastBeta === 0 ? this.getBackwardCompatibilityBeta() : MosfetElm.lastBeta; }

    // Not sure where this value came from, but the ZVP3306A has a beta of about .027.  Power MOSFETs have much higher betas (like 80 or more)
    getBackwardCompatibilityBeta(): number { return .02; }

    nonLinear(): boolean { return true; }
    drawDigital(): boolean { return (this.flags & this.FLAG_DIGITAL) !== 0; }
    showBulk(): boolean { return (this.flags & (this.FLAG_DIGITAL | this.FLAG_HIDE_BULK)) === 0; }
    hasBodyTerminal(): boolean { return (this.flags & this.FLAG_BODY_TERMINAL) !== 0 && this.doBodyDiode(); }
    doBodyDiode(): boolean { return (this.flags & this.FLAG_BODY_DIODE) !== 0 && this.showBulk(); }
    showBodyDiode(): boolean { return (this.flags & this.FLAG_SHOW_BODY_DIODE) !== 0 && this.doBodyDiode(); }

    reset(): void {
        this.lastv1 = this.lastv2 = this.volts[0] = this.volts[1] = this.volts[2] = this.curcount = 0;
        this.curcount_body1 = this.curcount_body2 = 0;
        this.diodeB1.reset();
        this.diodeB2.reset();
        if (this.doBodyDiode())
            this.volts[this.bodyTerminal] = 0;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "vt", this.vt);
        CircuitXMLSerializer.dumpAttr(elem, "be", this.beta);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = 0;
        super.undumpXml(xml);
        this.vt = xml.parseDoubleAttr("vt", this.vt);
        this.beta = xml.parseDoubleAttr("be", this.beta);
        MosfetElm.globalFlags = this.flags & this.FLAGS_GLOBAL;
        this.pnp = ((this.flags & this.FLAG_PNP) !== 0) ? -1 : 1;
        this.allocNodes();
    }

    getDumpType(): number { return 'f'.charCodeAt(0); }

    draw(g: Graphics): void {
        // pick up global flags changes
        if ((this.flags & this.FLAGS_GLOBAL) !== MosfetElm.globalFlags)
            this.setPoints();

        this.setBbox(this.point1, this.point2, this.hs);

        // draw source/drain terminals
        this.setVoltageColor(g, this.volts[1]);
        CircuitElm.drawThickLine(g, this.src[0], this.src[1]);
        this.setVoltageColor(g, this.volts[2]);
        CircuitElm.drawThickLine(g, this.drn[0], this.drn[1]);

        // draw line connecting source and drain
        const segments = 6;
        this.setPowerColor(g, true);
        const power = this.showPower();
        const segf = 1. / segments;
        const enhancement = this.vt > 0 && this.showBulk();
        const ps1 = new Point(0, 0);
        const ps2 = new Point(0, 0);
        for (let i = 0; i !== segments; i++) {
            if ((i === 1 || i === 4) && enhancement) continue;
            const v = this.volts[1] + (this.volts[2] - this.volts[1]) * i / segments;
            if (!power)
                this.setVoltageColor(g, v);
            this.interpPoint(this.src[1], this.drn[1], ps1, i * segf);
            this.interpPoint(this.src[1], this.drn[1], ps2, (i + 1) * segf);
            CircuitElm.drawThickLine(g, ps1, ps2);
        }

        // draw little extensions of that line
        if (!power)
            this.setVoltageColor(g, this.volts[1]);
        CircuitElm.drawThickLine(g, this.src[1], this.src[2]);
        if (!power)
            this.setVoltageColor(g, this.volts[2]);
        CircuitElm.drawThickLine(g, this.drn[1], this.drn[2]);

        // draw bulk connection
        if (this.showBulk()) {
            this.setVoltageColor(g, this.volts[this.bodyTerminal]);
            if (!this.hasBodyTerminal())
                CircuitElm.drawThickLine(g, this.pnp === -1 ? this.drn[0] : this.src[0], this.body[0]);
            CircuitElm.drawThickLine(g, this.body[0], this.body[1]);
        }

        // draw body diode symbol(s)
        if (this.showBodyDiode()) {
            if (!this.hasBodyTerminal()) {
                // single offset diode with L-shaped leads
                this.setVoltageColor(g, this.volts[1]);
                g.fillPolygon(this.bodyDiodePoly);
                CircuitElm.drawThickLine(g, this.src[0], this.bodyDiodeLeads[0]);
                CircuitElm.drawThickLine(g, this.bodyDiodeLeads[0], this.bodyDiodeLeads[1]);
                this.setVoltageColor(g, this.volts[2]);
                CircuitElm.drawThickLine(g, this.bodyDiodeCathode[0], this.bodyDiodeCathode[1]);
                CircuitElm.drawThickLine(g, this.bodyDiodeLeads[2], this.bodyDiodeLeads[3]);
                CircuitElm.drawThickLine(g, this.drn[0], this.bodyDiodeLeads[3]);
                this.adjustBbox(this.bodyDiodeLeads[0], this.bodyDiodeLeads[3]);
            } else {
                // two inline diodes: src↔body and body↔drn
                const anode1 = (this.pnp === 1) ? this.bodyTerminal : 1;
                const cathode1 = (this.pnp === 1) ? 1 : this.bodyTerminal;
                this.setVoltageColor(g, this.volts[anode1]);
                g.fillPolygon(this.bodyDiodePoly);
                this.setVoltageColor(g, this.volts[cathode1]);
                g.drawLine(this.bodyDiodeCathode[0], this.bodyDiodeCathode[1]);
                const anode2 = (this.pnp === 1) ? this.bodyTerminal : 2;
                const cathode2 = (this.pnp === 1) ? 2 : this.bodyTerminal;
                this.setVoltageColor(g, this.volts[anode2]);
                g.fillPolygon(this.bodyDiodePoly2);
                this.setVoltageColor(g, this.volts[cathode2]);
                g.drawLine(this.bodyDiodeCathode2[0], this.bodyDiodeCathode2[1]);
            }
        }

        // draw arrow
        if (!this.drawDigital()) {
            this.setVoltageColor(g, this.volts[this.bodyTerminal]);
            g.fillPolygon(this.arrowPoly);
        }
        if (power)
            g.setColor(Color.gray);

        // draw gate
        this.setVoltageColor(g, this.volts[0]);
        CircuitElm.drawThickLine(g, this.point1, this.gate[1]);
        CircuitElm.drawThickLine(g, this.gate[0], this.gate[2]);
        if (this.drawDigital() && this.pnp === -1)
            CircuitElm.drawThickCircle(g, this.pcircle.x, this.pcircle.y, this.pcircler);

        if ((this.flags & this.FLAG_SHOWVT) !== 0) {
            const s = "" + (this.vt * this.pnp);
            g.setColor(CircuitElm.whiteColor);
            g.setFont(CircuitElm.unitsFont);
            this.drawCenteredText(g, s, this.x2 + 2, this.y2, false);
        }
        this.curcount = this.updateDotCountImpl(-this.ids, this.curcount);
        this.drawDots(g, this.src[0], this.src[1], this.curcount);
        this.drawDots(g, this.src[1], this.drn[1], this.curcount);
        this.drawDots(g, this.drn[1], this.drn[0], this.curcount);

        if (this.showBulk()) {
            this.curcount_body1 = this.updateDotCountImpl(this.diodeCurrent1, this.curcount_body1);
            this.curcount_body2 = this.updateDotCountImpl(this.diodeCurrent2, this.curcount_body2);
            if (this.showBodyDiode() && !this.hasBodyTerminal()) {
                const cur = -this.curcount_body1 + this.curcount_body2;
                this.drawDots(g, this.src[0], this.bodyDiodeLeads[0], cur);
                this.drawDots(g, this.bodyDiodeLeads[0], this.bodyDiodeLeads[3], cur);
                this.drawDots(g, this.bodyDiodeLeads[3], this.drn[0], cur);
            } else {
                this.drawDots(g, this.src[0], this.body[0], -this.curcount_body1);
                this.drawDots(g, this.body[0], this.drn[0], this.curcount_body2);
            }
        }

        // label pins when highlighted
        if (this.needsHighlight() || this.isCreating()) {
            g.setColor(CircuitElm.whiteColor);
            g.setFont(CircuitElm.unitsFont);

            const dsx = CircuitElm.sign(this.dx);
            const dsy = CircuitElm.sign(this.dy);
            const dsyn = this.dy === 0 ? 0 : 1;

            g.drawString("G", this.gate[1].x - (this.dx < 0 ? -2 : 12), this.gate[1].y + ((this.dy > 0) ? -5 : 12));
            const extra = this.showBodyDiode() && !this.hasBodyTerminal() && this.dy === 0 ? 16 * this.dsign : 0;
            g.drawString(this.pnp === -1 ? "D" : "S", this.src[0].x - 3 + 9 * (dsx - dsyn * this.pnp) + extra, this.src[0].y + 4);
            g.drawString(this.pnp === -1 ? "S" : "D", this.drn[0].x - 3 + 9 * (dsx - dsyn * this.pnp) + extra, this.drn[0].y + 4);
            if (this.hasBodyTerminal())
                g.drawString("B", this.body[0].x - 3 + 9 * (dsx - dsyn * this.pnp), this.body[0].y + 4);
        }

        this.drawPosts(g);
    }

    // post 0 = gate, 1 = source for NPN, 2 = drain for NPN, 3 = body (if present)
    // for PNP, 1 is drain, 2 is source
    getPost(n: number): Point {
        return (n === 0) ? this.point1 : (n === 1) ? this.src[0] :
            (n === 2) ? this.drn[0] : this.body[0];
    }

    getCurrent(): number { return this.ids; }
    getPower(): number {
        return this.ids * (this.volts[2] - this.volts[1])
            - this.diodeCurrent1 * (this.volts[1] - this.volts[this.bodyTerminal])
            - this.diodeCurrent2 * (this.volts[2] - this.volts[this.bodyTerminal]);
    }
    getPostCount(): number { return this.hasBodyTerminal() ? 4 : 3; }

    addRoutingObstacle(router: WireRouter): void {
        router.addObstacle([this.gate[0], this.gate[2], this.src[0], this.drn[0], this.src[2], this.drn[2]]);
        router.addWire(this.point1.x, this.point1.y, this.gate[1].x, this.gate[1].y);
    }

    setPoints(): void {
        super.setPoints();

        // these two flags apply to all mosfets
        this.flags &= ~this.FLAGS_GLOBAL;
        this.flags |= MosfetElm.globalFlags;

        const hs2 = this.hs * this.dsign * ((this.flags & this.FLAG_FLIP) !== 0 ? -1 : 1);

        this.src = this.newPointArray(3);
        this.drn = this.newPointArray(3);
        this.interpPoint2(this.point1, this.point2, this.src[0], this.drn[0], 1, -hs2);
        this.interpPoint2(this.point1, this.point2, this.src[1], this.drn[1], 1 - 22 / this.dn, -hs2);
        this.interpPoint2(this.point1, this.point2, this.src[2], this.drn[2], 1 - 22 / this.dn, -hs2 * 4 / 3);

        this.gate = this.newPointArray(3);
        this.interpPoint2(this.point1, this.point2, this.gate[0], this.gate[2], 1 - 28 / this.dn, hs2 / 2);
        this.interpPoint(this.gate[0], this.gate[2], this.gate[1], .5);

        if (this.showBulk()) {
            this.body = this.newPointArray(2);
            this.interpPoint(this.src[0], this.drn[0], this.body[0], .5);
            this.interpPoint(this.src[1], this.drn[1], this.body[1], .5);
        }

        if (!this.drawDigital()) {
            if (this.pnp === 1) {
                if (!this.showBulk())
                    this.arrowPoly = this.calcArrow(this.src[1], this.src[0], 10, 4);
                else
                    this.arrowPoly = this.calcArrow(this.body[0], this.body[1], 12, 5);
            } else {
                if (!this.showBulk())
                    this.arrowPoly = this.calcArrow(this.drn[0], this.drn[1], 12, 5);
                else
                    this.arrowPoly = this.calcArrow(this.body[1], this.body[0], 12, 5);
            }
        } else if (this.pnp === -1) {
            this.interpPoint(this.point1, this.point2, this.gate[1], 1 - 36 / this.dn);
            const dist = (this.dsign < 0) ? 32 : 31;
            this.pcircle = this.interpPoint(this.point1, this.point2, 1 - dist / this.dn);
            this.pcircler = 3;
        }

        if (this.showBodyDiode()) {
            let pa = this.newPointArray(2);
            if (!this.hasBodyTerminal()) {
                // single diode offset from body line, with L-shaped leads
                const diodeHs = 6;
                this.bodyDiodeCathode = this.newPointArray(2);
                this.bodyDiodeLeads = this.newPointArray(4);
                const dp1 = this.interpPoint(this.src[0], this.drn[0], .5 - (diodeHs / 2.) / this.hs, -hs2);
                const dp2 = this.interpPoint(this.src[0], this.drn[0], .5 + (diodeHs / 2.) / this.hs, -hs2);
                this.interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
                this.interpPoint2(dp1, dp2, this.bodyDiodeCathode[0], this.bodyDiodeCathode[1], 1, diodeHs);
                this.bodyDiodePoly = this.createPolygon(pa[0], pa[1], dp2);
                this.bodyDiodeLeads[0] = this.interpPoint(this.src[0], this.drn[0], 0, -hs2);
                this.bodyDiodeLeads[1] = dp1;
                this.bodyDiodeLeads[2] = dp2;
                this.bodyDiodeLeads[3] = this.interpPoint(this.src[0], this.drn[0], 1, -hs2);
            } else {
                // two inline diodes: src[0]↔body[0] and body[0]↔drn[0], no offset
                const diodeHs = 3;
                this.bodyDiodeCathode = this.newPointArray(2);
                this.bodyDiodeCathode2 = this.newPointArray(2);
                const a1 = (this.pnp === 1) ? this.body[0] : this.src[0];
                const b1 = (this.pnp === 1) ? this.src[0] : this.body[0];
                let dp1 = this.interpPoint(a1, b1, .3);
                let dp2 = this.interpPoint(a1, b1, .7);
                this.interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
                this.interpPoint2(dp1, dp2, this.bodyDiodeCathode[0], this.bodyDiodeCathode[1], 1, diodeHs);
                this.bodyDiodePoly = this.createPolygon(pa[0], pa[1], dp2);
                pa = this.newPointArray(2);
                const a2 = (this.pnp === 1) ? this.body[0] : this.drn[0];
                const b2 = (this.pnp === 1) ? this.drn[0] : this.body[0];
                dp1 = this.interpPoint(a2, b2, .3);
                dp2 = this.interpPoint(a2, b2, .7);
                this.interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
                this.interpPoint2(dp1, dp2, this.bodyDiodeCathode2[0], this.bodyDiodeCathode2[1], 1, diodeHs);
                this.bodyDiodePoly2 = this.createPolygon(pa[0], pa[1], dp2);
            }
        }
    }

    lastv1: number = 0;
    lastv2: number = 0;
    ids: number = 0;
    mode: number = 0;
    gm: number = 0;

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);

        if (this.hasBodyTerminal())
            this.bodyTerminal = 3;
        else
            this.bodyTerminal = (this.pnp === -1) ? 2 : 1;

        if (this.doBodyDiode()) {
            if (this.pnp === -1) {
                // pnp: diodes conduct when S or D are higher than body
                this.diodeB1.stamp(this.nodes[1], this.nodes[this.bodyTerminal]);
                this.diodeB2.stamp(this.nodes[2], this.nodes[this.bodyTerminal]);
            } else {
                // npn: diodes conduct when body is higher than S or D
                this.diodeB1.stamp(this.nodes[this.bodyTerminal], this.nodes[1]);
                this.diodeB2.stamp(this.nodes[this.bodyTerminal], this.nodes[2]);
            }
        }
    }

    nonConvergence(last: number, now: number): boolean {
        let diff = Math.abs(last - now);

        // high beta MOSFETs are more sensitive to small differences, so we are more strict about convergence testing
        if (this.beta > 1)
            diff *= 100;

        // difference of less than 10mV is fine
        if (diff < .01)
            return false;
        // larger differences are fine if value is large
        if (CircuitElm.sim.subIterations > 10 && diff < Math.abs(now) * .001)
            return false;
        // if we're having trouble converging, get more lenient
        if (CircuitElm.sim.subIterations > 100 && diff < .01 + (CircuitElm.sim.subIterations - 100) * .0001)
            return false;
        return true;
    }

    stepFinished(): void {
        this.calculate(true);

        // fix current if body is connected to source or drain
        if (this.bodyTerminal === 1)
            this.diodeCurrent1 = -this.diodeCurrent2;
        if (this.bodyTerminal === 2)
            this.diodeCurrent2 = -this.diodeCurrent1;
    }

    doStep(): void {
        this.calculate(false);
    }

    lastv0: number = 0;

    // called in doStep to stamp the matrix, and also in stepFinished() to calculate the current
    calculate(finished: boolean): void {
        let vs: number[];
        if (finished) {
            vs = this.volts;
        } else {
            // limit voltage changes to .5V
            vs = [this.volts[0], this.volts[1], this.volts[2]];
            if (vs[1] > this.lastv1 + .5) vs[1] = this.lastv1 + .5;
            if (vs[1] < this.lastv1 - .5) vs[1] = this.lastv1 - .5;
            if (vs[2] > this.lastv2 + .5) vs[2] = this.lastv2 + .5;
            if (vs[2] < this.lastv2 - .5) vs[2] = this.lastv2 - .5;
        }

        let source = 1;
        let drain = 2;

        // if source voltage > drain (for NPN), swap source and drain (opposite for PNP)
        if (this.pnp * vs[1] > this.pnp * vs[2]) {
            source = 2;
            drain = 1;
        }
        const gateIdx = 0;
        const vgs = vs[gateIdx] - vs[source];
        const vds = vs[drain] - vs[source];
        if (!finished && (this.nonConvergence(this.lastv1, vs[1]) || this.nonConvergence(this.lastv2, vs[2]) || this.nonConvergence(this.lastv0, vs[0])))
            CircuitElm.sim.converged = false;
        this.lastv0 = vs[0];
        this.lastv1 = vs[1];
        this.lastv2 = vs[2];
        const realvgs = vgs;
        const realvds = vds;
        const vgsP = vgs * this.pnp;
        const vdsP = vds * this.pnp;
        this.ids = 0;
        this.gm = 0;
        let Gds = 0;
        if (vgsP < this.vt) {
            // should be all zero, but that causes a singular matrix,
            // so instead we treat it as a large resistor
            Gds = 1e-8;
            this.ids = vdsP * Gds;
            this.mode = 0;
        } else if (vdsP < vgsP - this.vt) {
            // linear
            this.ids = this.beta * ((vgsP - this.vt) * vdsP - vdsP * vdsP * .5);
            this.gm = this.beta * vdsP;
            Gds = this.beta * (vgsP - vdsP - this.vt);
            this.mode = 1;
        } else {
            // saturation; Gds = 0
            this.gm = this.beta * (vgsP - this.vt);
            // use very small Gds to avoid nonconvergence
            Gds = 1e-8;
            this.ids = .5 * this.beta * (vgsP - this.vt) * (vgsP - this.vt) + (vdsP - (vgsP - this.vt)) * Gds;
            this.mode = 2;
        }

        if (this.doBodyDiode()) {
            this.diodeB1.doStep(this.pnp * (this.volts[this.bodyTerminal] - this.volts[1]));
            this.diodeCurrent1 = this.diodeB1.calculateCurrent(this.pnp * (this.volts[this.bodyTerminal] - this.volts[1])) * this.pnp;
            this.diodeB2.doStep(this.pnp * (this.volts[this.bodyTerminal] - this.volts[2]));
            this.diodeCurrent2 = this.diodeB2.calculateCurrent(this.pnp * (this.volts[this.bodyTerminal] - this.volts[2])) * this.pnp;
        } else {
            this.diodeCurrent1 = this.diodeCurrent2 = 0;
        }

        const ids0 = this.ids;

        // flip ids if we swapped source and drain above
        if ((source === 2 && this.pnp === 1) || (source === 1 && this.pnp === -1))
            this.ids = -this.ids;

        if (finished)
            return;

        const rs = -this.pnp * ids0 + Gds * realvds + this.gm * realvgs;
        CircuitElm.sim.stampMatrix(this.nodes[drain], this.nodes[drain], Gds);
        CircuitElm.sim.stampMatrix(this.nodes[drain], this.nodes[source], -Gds - this.gm);
        CircuitElm.sim.stampMatrix(this.nodes[drain], this.nodes[gateIdx], this.gm);

        CircuitElm.sim.stampMatrix(this.nodes[source], this.nodes[drain], -Gds);
        CircuitElm.sim.stampMatrix(this.nodes[source], this.nodes[source], Gds + this.gm);
        CircuitElm.sim.stampMatrix(this.nodes[source], this.nodes[gateIdx], -this.gm);

        CircuitElm.sim.stampRightSide(this.nodes[drain], rs);
        CircuitElm.sim.stampRightSide(this.nodes[source], -rs);
    }

    getFetInfo(arr: string[], n: string): void {
        arr[0] = ((this.pnp === -1) ? "p-" : "n-") + n;
        arr[0] += " (Vt=" + CircuitElm.getVoltageText(this.pnp * this.vt);
        arr[0] += ", β=" + this.beta + ")";
        arr[1] = ((this.pnp === 1) ? "Ids = " : "Isd = ") + CircuitElm.getCurrentText(this.ids);
        arr[2] = "Vgs = " + CircuitElm.getVoltageText(this.volts[0] - this.volts[this.pnp === -1 ? 2 : 1]);
        arr[3] = ((this.pnp === 1) ? "Vds = " : "Vsd = ") + CircuitElm.getVoltageText(this.volts[2] - this.volts[1]);
        arr[4] = (this.mode === 0) ? "off" : (this.mode === 1) ? "linear" : "saturation";
        arr[5] = "gm = " + CircuitElm.getUnitText(this.gm, "A/V");
        arr[6] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        if (this.showBulk())
            arr[7] = "Ib = " + CircuitElm.getUnitText(
                this.bodyTerminal === 1 ? -this.diodeCurrent1 :
                this.bodyTerminal === 2 ? this.diodeCurrent2 :
                -this.pnp * (this.diodeCurrent1 + this.diodeCurrent2), "A");
    }

    getElmType(): string { return "MOSFET"; }

    getInfo(arr: string[]): void {
        this.getFetInfo(arr, "MOSFET");
    }

    getScopeText(v: number): string {
        return ((this.pnp === -1) ? "p-" : "n-") + "MOSFET";
    }

    canViewInScope(): boolean { return true; }
    getVoltageDiff(): number { return this.volts[2] - this.volts[1]; }
    getConnection(n1: number, n2: number): boolean { return !(n1 === 0 || n2 === 0); }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Threshold Voltage", this.pnp * this.vt, .01, 5);
        if (n === 1)
            return new EditInfo(EditInfo.makeLink("mosfet-beta.html", "Beta"), this.beta, .01, 5).setPositive();
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Bulk", this.showBulk());
            return ei;
        }
        if (n === 3) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Swap D/S", (this.flags & this.FLAG_FLIP) !== 0);
            return ei;
        }
        if (n === 4 && !this.showBulk()) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Digital Symbol", this.drawDigital());
            return ei;
        }
        if (n === 4 && this.showBulk()) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Simulate Body Diode", (this.flags & this.FLAG_BODY_DIODE) !== 0);
            return ei;
        }
        if (n === 5 && this.doBodyDiode()) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Body Terminal", (this.flags & this.FLAG_BODY_TERMINAL) !== 0);
            return ei;
        }
        if (n === 6 && this.doBodyDiode()) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Body Diode", this.showBodyDiode());
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.vt = this.pnp * ei.value;
        if (n === 1 && ei.value > 0)
            this.beta = MosfetElm.lastBeta = ei.value;
        if (n === 2) {
            MosfetElm.globalFlags = (!ei.checkbox.getState()) ? (MosfetElm.globalFlags | this.FLAG_HIDE_BULK) :
                (MosfetElm.globalFlags & ~(this.FLAG_HIDE_BULK | this.FLAG_DIGITAL));
            ei.newDialog = true;
        }
        if (n === 3) {
            this.flags = (ei.checkbox.getState()) ? (this.flags | this.FLAG_FLIP) :
                (this.flags & ~this.FLAG_FLIP);
        }
        if (n === 4 && !this.showBulk()) {
            MosfetElm.globalFlags = (ei.checkbox.getState()) ? (MosfetElm.globalFlags | this.FLAG_DIGITAL) :
                (MosfetElm.globalFlags & ~this.FLAG_DIGITAL);
        }
        if (n === 4 && this.showBulk()) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_BODY_DIODE);
            ei.newDialog = true;
        }
        if (n === 5) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_BODY_TERMINAL);
        }
        if (n === 6) {
            MosfetElm.globalFlags = ei.changeFlag(MosfetElm.globalFlags, this.FLAG_SHOW_BODY_DIODE);
        }

        // lots of different cases where the body terminal might have gotten removed/added so just do this all the time
        this.allocNodes();
        this.setPoints();
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return 0;
        if (n === 3) return -this.diodeCurrent1 - this.diodeCurrent2;
        if (n === 1) return this.ids + this.diodeCurrent1;
        return -this.ids + this.diodeCurrent2;
    }

    flipX(c2: number, count: number): void {
        if (this.x === this.x2)
            this.flags ^= this.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.y === this.y2)
            this.flags ^= this.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= this.FLAG_FLIP;
        super.flipXY(xmy, count);
    }
}

export class NMosfetElm extends MosfetElm {
    constructor(xx: number, yy: number) { super(xx, yy, false); }
    getDumpClass(): typeof MosfetElm { return MosfetElm; }
    getShortcut(): number { return 'N'.charCodeAt(0); }
}

export class PMosfetElm extends MosfetElm {
    constructor(xx: number, yy: number) { super(xx, yy, true); }
    getDumpClass(): typeof MosfetElm { return MosfetElm; }
    getShortcut(): number { return 'P'.charCodeAt(0); }
}
