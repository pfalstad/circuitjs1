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
import { TransistorModel } from "./TransistorModel";
import { CustomLogicModel } from "./CustomLogicModel";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { Locale } from "./Locale";
import { EditInfo } from "./EditInfo";
import { WireRouter } from "./WireRouter";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";
import { Scope } from "./Scope";
import { Color } from "./Color";
import { CirSim } from "./CirSim";

export class TransistorElm extends CircuitElm {
    // node 0 = base
    // node 1 = collector
    // node 2 = emitter
    pnp: number;
    beta: number;
    gmin: number = 0;
    modelName: string;
    model: TransistorModel;
    static lastModelName: string = "default"; // never changes??
    static readonly FLAG_FLIP = 1;
    static readonly FLAG_CIRCLE = 2;
    static readonly FLAGS_GLOBAL = TransistorElm.FLAG_CIRCLE;
    static globalFlags: number = 0;
    badIters: number = 0;
    localSubIters: number = 0;

    constructor(xx: number, yy: number, pnpflag?: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrPnp?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (typeof xbOrPnp !== "number") {
            super(xa, ya);
            this.pnp = xbOrPnp ? -1 : 1;
            this.beta = 100;
            this.modelName = TransistorElm.lastModelName;
            this.setup();
        } else {
            super(xa, ya, xbOrPnp!, yb!, f!);
            this.pnp = parseInt(st!.nextToken());
            this.beta = 100;
            try {
                this.lastvbe = parseFloat(st!.nextToken());
                this.lastvbc = parseFloat(st!.nextToken());
                this.volts[0] = 0;
                this.volts[1] = -this.lastvbe;
                this.volts[2] = -this.lastvbc;
                this.beta = parseFloat(st!.nextToken());
                this.modelName = CustomLogicModel.unescape(st!.nextToken());
            } catch (e) {
                this.modelName = "default";
            }
            TransistorElm.globalFlags = f! & TransistorElm.FLAGS_GLOBAL;
            this.setup();
        }
    }

    setup(): void {
        this.model = TransistorModel.getModelWithNameOrCopy(this.modelName, this.model ?? null);
        this.modelName = this.model.name;   // in case we couldn't find that model
        this.vcrit = TransistorElm.vt * Math.log(TransistorElm.vt / (Math.sqrt(2) * this.model.satCur));
        this.noDiagonal = true;
    }

    nonLinear(): boolean { return true; }

    reset(): void {
        this.volts[0] = this.volts[1] = this.volts[2] = 0;
        this.lastvbc = this.lastvbe = this.curcount_c = this.curcount_e = this.curcount_b = 0;
        this.capVoltBE = this.capVoltBC = this.capCurBE = this.capCurBC = 0;
        this.geqBE = this.geqBC = this.ceqBE = this.ceqBC = 0;
        this.badIters = 0;
        this.localSubIters = 0;
    }

    getDumpType(): number { return 't'.charCodeAt(0); }

    dumpXml(doc: Document, elem: Element): void {
        if (!(this.model.builtIn || this.model.dumped))
            this.model.dumpXml(doc);
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "pn", this.pnp);
        XMLSerializer.dumpAttr(elem, "be", this.beta);
        XMLSerializer.dumpAttr(elem, "mo", this.modelName);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        XMLSerializer.dumpAttr(elem, "vbe", this.volts[0] - this.volts[1]);
        XMLSerializer.dumpAttr(elem, "vbc", this.volts[0] - this.volts[2]);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.pnp = xml.parseIntAttr("pn", this.pnp);
        this.beta = xml.parseDoubleAttr("be", this.beta);
        this.modelName = xml.parseStringAttr("mo", this.modelName);
        this.lastvbe = xml.parseDoubleAttr("vbe", 0);
        this.lastvbc = xml.parseDoubleAttr("vbc", 0);
        this.volts[0] = 0;
        this.volts[1] = -this.lastvbe;
        this.volts[2] = -this.lastvbc;
        TransistorElm.globalFlags = this.flags & TransistorElm.FLAGS_GLOBAL;
        this.setup();
    }

    updateModels(): void {
        this.setup();
    }

    dumpXmlModel(doc: Document): void {
        if (!(this.model.builtIn || this.model.dumped))
            this.model.dumpXml(doc);
    }

    ic: number = 0;
    ie: number = 0;
    ib: number = 0;
    curcount_c: number = 0;
    curcount_e: number = 0;
    curcount_b: number = 0;

    // Junction capacitance state (trapezoidal companion model)
    capVoltBE: number = 0;   // junction voltages from end of previous time step
    capVoltBC: number = 0;
    capCurBE: number = 0;    // junction cap currents from end of previous time step
    capCurBC: number = 0;
    geqBE: number = 0;       // companion conductances (computed in startIteration)
    geqBC: number = 0;
    ceqBE: number = 0;       // companion current sources (computed in startIteration)
    ceqBC: number = 0;

    rectPoly: Polygon;
    arrowPoly: Polygon;
    circleCenter: Point;

    hasCircle(): boolean { return (TransistorElm.globalFlags & TransistorElm.FLAG_CIRCLE) !== 0; }

    draw(g: Graphics): void {
        // pick up global flags changes
        if ((this.flags & TransistorElm.FLAGS_GLOBAL) !== TransistorElm.globalFlags)
            this.setPoints();

        this.setBbox(this.point1, this.point2, 16);
        if (this.hasCircle()) {
            g.setColor(Color.gray);
            CircuitElm.drawThickCircle(g, this.circleCenter.x, this.circleCenter.y, 20);
        }
        this.setPowerColor(g, true);
        // draw collector
        this.setVoltageColor(g, this.volts[1]);
        CircuitElm.drawThickLine(g, this.coll[0], this.coll[1]);
        // draw emitter
        this.setVoltageColor(g, this.volts[2]);
        CircuitElm.drawThickLine(g, this.emit[0], this.emit[1]);
        // draw arrow
        g.setColor(CircuitElm.lightGrayColor);
        g.fillPolygon(this.arrowPoly);
        // draw base
        this.setVoltageColor(g, this.volts[0]);
        if (this.showPower())
            g.setColor(Color.gray);
        CircuitElm.drawThickLine(g, this.point1, this.base);
        // draw dots
        this.curcount_b = this.updateDotCountImpl(-this.ib, this.curcount_b);
        this.drawDots(g, this.base, this.point1, this.curcount_b);
        this.curcount_c = this.updateDotCountImpl(-this.ic, this.curcount_c);
        this.drawDots(g, this.coll[1], this.coll[0], this.curcount_c);
        this.curcount_e = this.updateDotCountImpl(-this.ie, this.curcount_e);
        this.drawDots(g, this.emit[1], this.emit[0], this.curcount_e);
        // draw base rectangle
        this.setVoltageColor(g, this.volts[0]);
        this.setPowerColor(g, true);
        g.fillPolygon(this.rectPoly);

        if ((this.needsHighlight() || this.isCreating()) && this.dy === 0) {
            g.setColor(CircuitElm.whiteColor);
// IES
//		g.setFont(unitsFont);
            const ds = CircuitElm.sign(this.dx);
            g.drawString("B", this.base.x - 10*ds, this.base.y - 5);
            g.drawString("C", this.coll[0].x - 3 + 9*ds, this.coll[0].y + 4); // x+6 if ds=1, -12 if -1
            g.drawString("E", this.emit[0].x - 3 + 9*ds, this.emit[0].y + 4);
        }
        this.drawPosts(g);
    }

    getPost(n: number): Point | null {
        return (n === 0) ? this.point1 : (n === 1) ? this.coll[0] : this.emit[0];
    }

    getPostCount(): number { return 3; }

    getPower(): number {
        return (this.volts[0] - this.volts[2]) * this.ib + (this.volts[1] - this.volts[2]) * this.ic;
    }

    rect: Point[];
    coll: Point[];
    emit: Point[];
    base: Point;

    setPoints(): void {
        // these flags apply to all transistors
        this.flags &= ~TransistorElm.FLAGS_GLOBAL;
        this.flags |= TransistorElm.globalFlags;

        super.setPoints();
        const hs = 16;
        if ((this.flags & TransistorElm.FLAG_FLIP) !== 0)
            this.dsign = -this.dsign;
        const hs2 = hs * this.dsign * this.pnp;
        // calc collector, emitter posts
        this.coll = this.newPointArray(2);
        this.emit = this.newPointArray(2);
        this.interpPoint2(this.point1, this.point2, this.coll[0], this.emit[0], 1, hs2);
        // calc rectangle edges
        this.rect = this.newPointArray(4);
        this.interpPoint2(this.point1, this.point2, this.rect[0], this.rect[1], 1 - 16/this.dn, hs);
        this.interpPoint2(this.point1, this.point2, this.rect[2], this.rect[3], 1 - 13/this.dn, hs);
        // calc points where collector/emitter leads contact rectangle
        this.interpPoint2(this.point1, this.point2, this.coll[1], this.emit[1], 1 - 13/this.dn, 6*this.dsign*this.pnp);
        // calc point where base lead contacts rectangle
        this.base = this.interpPoint(this.point1, this.point2, 1 - 16/this.dn) as Point;
        // rectangle
        this.rectPoly = this.createPolygon(this.rect[0], this.rect[2], this.rect[3], this.rect[1]);

        // arrow
        if (this.pnp === 1)
            this.arrowPoly = this.calcArrow(this.emit[1], this.emit[0], 8, 4);
        else {
            const pt = this.interpPoint(this.point1, this.point2, 1 - 11/this.dn, -5*this.dsign*this.pnp) as Point;
            this.arrowPoly = this.calcArrow(this.emit[0], pt, 8, 4);
        }

        this.circleCenter = this.interpPoint(this.base, this.point2, 0.5) as Point;
    }

    addRoutingObstacle(router: WireRouter): void {
        router.addObstacle([this.rect[0], this.rect[1], this.rect[2], this.rect[3], this.coll[0], this.emit[0]]);
        router.addWire(this.point1.x, this.point1.y, this.base.x, this.base.y);
    }

    static readonly leakage = 1e-13; // 1e-6;
    // Electron thermal voltage at SPICE's default temperature of 27 C (300.15 K):
    static readonly vt = 0.025865;
    vcrit: number = 0;
    lastvbc: number = 0;
    lastvbe: number = 0;

    limitStep(vnew: number, vold: number): number {
        let arg: number;

        if (vnew > this.vcrit && Math.abs(vnew - vold) > (TransistorElm.vt + TransistorElm.vt)) {
            if (vold > 0) {
                arg = 1 + (vnew - vold) / TransistorElm.vt;
                if (arg > 0) {
                    vnew = vold + TransistorElm.vt * Math.log(arg);
                } else {
                    vnew = this.vcrit;
                }
            } else {
                vnew = TransistorElm.vt * Math.log(vnew / TransistorElm.vt);
            }
            CircuitElm.sim.converged = false;
        }
        return vnew;
    }

    // Calculate voltage-dependent junction depletion capacitance.
    // This is the SPICE standard formula: the PN junction's depletion
    // layer acts as a parallel-plate capacitor whose plate spacing
    // changes with applied voltage.
    //   vj  = voltage across the junction (positive = forward bias)
    //   cj0 = zero-bias capacitance (the value when no voltage is applied)
    //   vj0 = built-in junction potential (typically 0.6-0.8V for silicon)
    //   mj  = grading coefficient (0.33 for linearly graded, 0.5 for abrupt)
    static calcJunctionCap(vj: number, cj0: number, vj0: number, mj: number): number {
        if (cj0 <= 0)
            return 0;
        const fc = 0.5;
        if (vj < fc * vj0) {
            // Normal depletion region: C increases as reverse bias decreases
            return cj0 / Math.pow(1 - vj/vj0, mj);
        } else {
            // Forward bias beyond fc*Vj: linear extrapolation to avoid
            // the singularity at V=Vj where capacitance would go to infinity
            return cj0 / Math.pow(1 - fc, 1 + mj) * (1 - fc*(1+mj) + mj*vj/vj0);
        }
    }

    startIteration(): void {
        // Compute junction capacitance companion model for this time step.
        // Uses trapezoidal integration (same as CapacitorElm).
        // Total cap = depletion cap (CJE/CJC) + diffusion cap (TF*gm / TR*gm).
        const hasBEcap = this.model.junctionCapBE > 0 || this.model.transitTimeF > 0;
        const hasBCcap = this.model.junctionCapBC > 0 || this.model.transitTimeR > 0;

        if (hasBEcap && CircuitElm.sim.timeStep > 0) {
            const vjBE = this.pnp * this.capVoltBE;  // physical junction voltage
            let cje = TransistorElm.calcJunctionCap(vjBE, this.model.junctionCapBE, this.model.junctionPotBE, this.model.junctionExpBE);
            // Add diffusion capacitance only in forward bias (like SPICE)
            if (this.model.transitTimeF > 0 && vjBE > 0) {
                const vtn = TransistorElm.vt * this.model.emissionCoeffF;
                cje += this.model.transitTimeF * this.model.satCur * Math.exp(vjBE / vtn) / vtn;
            }
            this.geqBE = 2 * cje / CircuitElm.sim.timeStep;
            if (this.geqBE < 1e-20) { this.geqBE = this.ceqBE = this.capCurBE = 0; }
            else this.ceqBE = -this.geqBE * this.capVoltBE - this.capCurBE;
        }
        if (hasBCcap && CircuitElm.sim.timeStep > 0) {
            const vjBC = this.pnp * this.capVoltBC;  // physical junction voltage
            let cjc = TransistorElm.calcJunctionCap(vjBC, this.model.junctionCapBC, this.model.junctionPotBC, this.model.junctionExpBC);
            // Add diffusion capacitance only in forward bias (like SPICE)
            if (this.model.transitTimeR > 0 && vjBC > 0) {
                cjc += this.model.transitTimeR * this.model.satCur * Math.exp(vjBC / (TransistorElm.vt * this.model.emissionCoeffR)) / (TransistorElm.vt * this.model.emissionCoeffR);
            }
            this.geqBC = 2 * cjc / CircuitElm.sim.timeStep;
            if (this.geqBC < 1e-20) { this.geqBC = this.ceqBC = this.capCurBC = 0; }
            else this.ceqBC = -this.geqBC * this.capVoltBC - this.capCurBC;
        }
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[0]);
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);
    }

    doStep(): void {
        let vbc = this.pnp * (this.volts[0] - this.volts[1]); // typically negative
        let vbe = this.pnp * (this.volts[0] - this.volts[2]); // typically positive
        const notConverged = Math.abs(vbc - this.lastvbc) > .01 ||
            Math.abs(vbe - this.lastvbe) > .01;
        if (notConverged)
            CircuitElm.sim.converged = false;

        // track per-transistor convergence difficulty
        if (notConverged)
            this.localSubIters++;
        else
            this.localSubIters = 0;

        // To prevent a possible singular matrix, put a tiny conductance in parallel
        // with each P-N junction.
//	    gmin = leakage * 0.01;
        this.gmin = 1e-12;

        if (this.localSubIters > 100 && this.badIters < 5) {
            // if THIS transistor has trouble converging, put a conductance in
            // parallel with all P-N junctions.  Use per-transistor iteration
            // count to avoid contaminating unrelated transistors elsewhere
            // in the circuit.
            this.gmin = Math.exp(-9*Math.log(10)*(1 - this.localSubIters/300.));
            if (this.gmin > .1)
                this.gmin = .1;
        }

        vbc = this.limitStep(vbc, this.lastvbc);
        vbe = this.limitStep(vbe, this.lastvbe);
        this.lastvbc = vbc;
        this.lastvbe = vbe;

        /*
         *   dc model paramters (from Spice 3f5, bjtload.c)
         */
        const csat = this.model.satCur;
        const oik = this.model.invRollOffF;
        const c2 = this.model.BEleakCur;
        const vte = this.model.leakBEemissionCoeff * TransistorElm.vt;
        const oikr = this.model.invRollOffR;
        const c4 = this.model.BCleakCur;
        const vtc = this.model.leakBCemissionCoeff * TransistorElm.vt;

//          double rbpr=model.minBaseResist;
//          double rbpi=model.baseResist-rbpr;
//          double xjrb=model.baseCurrentHalfResist;

        let vtn = TransistorElm.vt * this.model.emissionCoeffF;
        let evbe: number, cbe: number, gbe: number, cben: number, gben: number, evben: number, evbc: number, cbc: number, gbc: number, cbcn: number, gbcn: number, evbcn: number;
        let qb: number, dqbdve: number, dqbdvc: number, q2: number, sqarg: number, arg: number;
        if (vbe > -5*vtn) {
            evbe = Math.exp(vbe/vtn);
            cbe = csat*(evbe-1) + this.gmin*vbe;
            gbe = csat*evbe/vtn + this.gmin;
            if (c2 === 0) {
                cben = 0;
                gben = 0;
            } else {
                evben = Math.exp(vbe/vte);
                cben = c2*(evben-1);
                gben = c2*evben/vte;
            }
        } else {
            gbe = -csat/vbe + this.gmin;
            cbe = gbe*vbe;
            gben = -c2/vbe;
            cben = gben*vbe;
        }
        vtn = TransistorElm.vt * this.model.emissionCoeffR;
        if (vbc > -5*vtn) {
            evbc = Math.exp(vbc/vtn);
            cbc = csat*(evbc-1) + this.gmin*vbc;
            gbc = csat*evbc/vtn + this.gmin;
            if (c4 === 0) {
                cbcn = 0;
                gbcn = 0;
            } else {
                evbcn = Math.exp(vbc/vtc);
                cbcn = c4*(evbcn-1);
                gbcn = c4*evbcn/vtc;
            }
        } else {
            gbc = -csat/vbc + this.gmin;
            cbc = gbc*vbc;
            gbcn = -c4/vbc;
            cbcn = gbcn*vbc;
        }
        /*
         *   determine base charge terms
         */
        const q1 = 1/(1 - this.model.invEarlyVoltF*vbc - this.model.invEarlyVoltR*vbe);
        if (oik === 0 && oikr === 0) {
            qb = q1;
            dqbdve = q1*qb*this.model.invEarlyVoltR;
            dqbdvc = q1*qb*this.model.invEarlyVoltF;
        } else {
            q2 = oik*cbe + oikr*cbc;
            arg = Math.max(0, 1 + 4*q2);
            sqarg = 1;
            if (arg !== 0) sqarg = Math.sqrt(arg);
            qb = q1*(1 + sqarg)/2;
            dqbdve = q1*(qb*this.model.invEarlyVoltR + oik*gbe/sqarg);
            dqbdvc = q1*(qb*this.model.invEarlyVoltF + oikr*gbc/sqarg);
        }

        let cc = 0;
        const cex = cbe;
        const gex = gbe;
        /*
         *   determine dc incremental conductances
         */
        cc = cc + (cex - cbc)/qb - cbc/this.model.betaR - cbcn;
        const cb = cbe/this.beta + cben + cbc/this.model.betaR + cbcn;

        // get currents
        this.ic = this.pnp * cc;
        this.ib = this.pnp * cb;
        this.ie = this.pnp * (-cc - cb);

/*            double gx=rbpr+rbpi/qb;   // base resistance commented out for now
            if(xjrb != 0) {
                double arg1=Math.max(cb/xjrb,1e-9);
                double arg2=(-1+Math.sqrt(1+14.59025*arg1))/2.4317/Math.sqrt(arg1);
                arg1=Math.tan(arg2);
                gx=rbpr+3*rbpi*(arg1-arg2)/arg2/arg1/arg1;
            }
            if(gx != 0) gx=1/gx;*/
        const gpi = gbe/this.beta + gben;
        const gmu = gbc/this.model.betaR + gbcn;
        const go = (gbc + (cex - cbc)*dqbdvc/qb)/qb;
        const gm = (gex - (cex - cbc)*dqbdve/qb)/qb - go;

        const ceqbe = this.pnp * (cc + cb - vbe*(gm + go + gpi) + vbc*go);
        const ceqbc = this.pnp * (-cc + vbe*(gm + go) - vbc*(gmu + go));

        if (!isFinite(this.ib) || isNaN(this.ic))
            CircuitElm.sim.stop("infinite transistor current", this);

        // stamp matrix.
        // Node 0 is the base, node 1 the collector, node 2 the emitter.
        CircuitElm.sim.stampMatrix(this.nodes[1], this.nodes[1], gmu+go);
        CircuitElm.sim.stampMatrix(this.nodes[1], this.nodes[0], -gmu+gm);
        CircuitElm.sim.stampMatrix(this.nodes[1], this.nodes[2], -gm-go);
        CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[0], gpi+gmu);
        CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[2], -gpi);
        CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[1], -gmu);
        CircuitElm.sim.stampMatrix(this.nodes[2], this.nodes[0], -gpi-gm);
        CircuitElm.sim.stampMatrix(this.nodes[2], this.nodes[1], -go);
        CircuitElm.sim.stampMatrix(this.nodes[2], this.nodes[2], gpi+gm+go);

        /*
         *  load current excitation vector (right side)
         */
        CircuitElm.sim.stampRightSide(this.nodes[0], -ceqbe - ceqbc);
        CircuitElm.sim.stampRightSide(this.nodes[1], ceqbc);
        CircuitElm.sim.stampRightSide(this.nodes[2], ceqbe);

        // Junction capacitance companion model stamps.
        // Each junction cap is modeled as a conductance (Geq) in parallel
        // with a current source (Ceq), using trapezoidal integration.
        // This is identical to how CapacitorElm works, but embedded inside
        // the transistor and with voltage-dependent capacitance.
        if (this.geqBE > 0) {
            // BE junction cap: conductance between base (node 0) and emitter (node 2)
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[0],  this.geqBE);
            CircuitElm.sim.stampMatrix(this.nodes[2], this.nodes[2],  this.geqBE);
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[2], -this.geqBE);
            CircuitElm.sim.stampMatrix(this.nodes[2], this.nodes[0], -this.geqBE);
            // Current source (positive = base to emitter)
            CircuitElm.sim.stampRightSide(this.nodes[0], -this.ceqBE);
            CircuitElm.sim.stampRightSide(this.nodes[2],  this.ceqBE);
        }
        if (this.geqBC > 0) {
            // BC junction cap: conductance between base (node 0) and collector (node 1)
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[0],  this.geqBC);
            CircuitElm.sim.stampMatrix(this.nodes[1], this.nodes[1],  this.geqBC);
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[1], -this.geqBC);
            CircuitElm.sim.stampMatrix(this.nodes[1], this.nodes[0], -this.geqBC);
            // Current source (positive = base to collector)
            CircuitElm.sim.stampRightSide(this.nodes[0], -this.ceqBC);
            CircuitElm.sim.stampRightSide(this.nodes[1],  this.ceqBC);
        }
    }

    isTransistorElm(): boolean { return true; }

    getScopeText(x: number): string {
        let t = "";
        switch (x) {
        case Scope.VAL_IB: t = "Ib"; break;
        case Scope.VAL_IC: t = "Ic"; break;
        case Scope.VAL_IE: t = "Ie"; break;
        case Scope.VAL_VBE: t = "Vbe"; break;
        case Scope.VAL_VBC: t = "Vbc"; break;
        case Scope.VAL_VCE: t = "Vce"; break;
        case Scope.VAL_POWER: t = "P"; break;
        }
        return Locale.LS("transistor") + ", " + t;
    }

    getElmType(): string { return "transistor"; }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("transistor") + " (" + (this.pnp === -1 ? "PNP" : "NPN") + ", " + this.model.name + ", β=" + CircuitElm.showFormat.format(this.beta) + ")";
        const vbc = this.volts[0] - this.volts[1];
        const vbe = this.volts[0] - this.volts[2];
        const vce = this.volts[1] - this.volts[2];
        if (vbc*this.pnp > .2)
            arr[1] = vbe*this.pnp > .2 ? "saturation" : "reverse active";
        else
            arr[1] = vbe*this.pnp > .2 ? "fwd active" : "cutoff";
        arr[1] = Locale.LS(arr[1]);
        arr[2] = "Ic = " + CircuitElm.getCurrentText(this.ic);
        arr[3] = "Ib = " + CircuitElm.getCurrentText(this.ib);
        arr[4] = "Vbe = " + CircuitElm.getVoltageText(vbe);
        arr[5] = "Vbc = " + CircuitElm.getVoltageText(vbc);
        arr[6] = "Vce = " + CircuitElm.getVoltageText(vce);
        arr[7] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        if (this.model.junctionCapBE > 0 || this.model.junctionCapBC > 0 || this.model.transitTimeF > 0 || this.model.transitTimeR > 0) {
            let cjeVal = TransistorElm.calcJunctionCap(vbe*this.pnp, this.model.junctionCapBE, this.model.junctionPotBE, this.model.junctionExpBE);
            let cjcVal = TransistorElm.calcJunctionCap(vbc*this.pnp, this.model.junctionCapBC, this.model.junctionPotBC, this.model.junctionExpBC);
            // Add diffusion capacitance from transit time
            if (this.model.transitTimeF > 0) {
                const vtn = TransistorElm.vt * this.model.emissionCoeffF;
                const gdBE = this.model.satCur * Math.exp(vbe*this.pnp / vtn) / vtn;
                cjeVal += this.model.transitTimeF * gdBE;
            }
            if (this.model.transitTimeR > 0) {
                const vtn = TransistorElm.vt * this.model.emissionCoeffR;
                const gdBC = this.model.satCur * Math.exp(vbc*this.pnp / vtn) / vtn;
                cjcVal += this.model.transitTimeR * gdBC;
            }
            const cTotal = cjeVal + cjcVal;
            if (cTotal > 0 && this.ic !== 0) {
                // gm = Ic / Vt (transconductance at operating point)
                const gmVal = Math.abs(this.ic) / TransistorElm.vt;
                const ft = gmVal / (2 * Math.PI * cTotal);
                arr[8] = "ft = " + CircuitElm.getUnitText(ft, "Hz");
            }
        }
    }

    getScopeValue(x: number): number {
        switch (x) {
        case Scope.VAL_IB: return this.ib;
        case Scope.VAL_IC: return this.ic;
        case Scope.VAL_IE: return this.ie;
        case Scope.VAL_VBE: return this.volts[0] - this.volts[2];
        case Scope.VAL_VBC: return this.volts[0] - this.volts[1];
        case Scope.VAL_VCE: return this.volts[1] - this.volts[2];
        case Scope.VAL_POWER: return this.getPower();
        }
        return 0;
    }

    getScopeUnits(x: number): number {
        switch (x) {
        case Scope.VAL_IB: case Scope.VAL_IC:
        case Scope.VAL_IE: return Scope.UNITS_A;
        case Scope.VAL_POWER: return Scope.UNITS_W;
        default: return Scope.UNITS_V;
        }
    }

    models: TransistorModel[];

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Beta/hFE", this.beta, 10, 1000).setDimensionless();
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            const state = (this.flags & TransistorElm.FLAG_FLIP) !== 0;
            ei.checkbox = { label: "Swap E/C", state, getState: () => state };
            return ei;
        }
        if (n === 2)
            return EditInfo.createCheckbox("Draw Circle", this.hasCircle());
        if (n === 3) {
            const ei = new EditInfo("Model", 0, -1, -1);
            this.models = TransistorModel.getModelList();
            ei.choice = { items: [] as string[], selectedIndex: 0, add: (s: string) => ei.choice.items.push(s), select: (i: number) => { ei.choice.selectedIndex = i; }, getSelectedIndex: () => ei.choice.selectedIndex };
            for (let i = 0; i !== this.models.length; i++) {
                const dm = this.models[i];
                ei.choice.add(dm.getDescription());
                if (dm === this.model)
                    ei.choice.select(i);
            }
            return ei;
        }
        if (n === 4) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Create New Model") };
            return ei;
        }
        if (n === 5) {
            if (this.model.readOnly)
                return null;
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Edit Model") };
            return ei;
        }
        return null;
    }

    newModelCreated(tm: TransistorModel): void {
        this.model = tm;
        this.modelName = this.model.name;
        this.setup();
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.beta = ei.value;
            this.setup();
        }
        if (n === 1) {
            if (ei.checkbox.getState())
                this.flags |= TransistorElm.FLAG_FLIP;
            else
                this.flags &= ~TransistorElm.FLAG_FLIP;
            this.setPoints();
        }
        if (n === 2) {
            TransistorElm.globalFlags = ei.changeFlag(TransistorElm.globalFlags, TransistorElm.FLAG_CIRCLE);
            return;
        }
        if (n === 3) {
            this.model = this.models[ei.choice.getSelectedIndex()];
            this.modelName = this.model.name;
            this.setup();
            ei.newDialog = true;
            return;
        }
        if (n === 4) {
            const newModel = new TransistorModel(this.model);
            // EditTransistorModelDialog not yet ported
            // EditDialog editDialog = new EditTransistorModelDialog(newModel, app, this);
            // CirSim.diodeModelEditDialog = editDialog;
            // editDialog.show();
            return;
        }
        if (n === 5) {
            if (this.model.readOnly) {
                // probably never reached
                window.alert(Locale.LS("This model cannot be modified.  Change the model name to allow customization."));
                return;
            }
            // EditTransistorModelDialog not yet ported
            // EditDialog editDialog = new EditTransistorModelDialog(model, app, null);
            // CirSim.diodeModelEditDialog = editDialog;
            // editDialog.show();
            return;
        }
    }

    setBeta(b: number): void {
        this.beta = b;
        this.setup();
    }

    stepFinished(): void {
        // stop for huge currents that make simulator act weird
        if (Math.abs(this.ic) > 1e12 || Math.abs(this.ib) > 1e12)
            CircuitElm.sim.stop("max current exceeded", this);

        // if this transistor needed gmin ramping, it was a bad iteration.
        // If we have 5 of those in a row, give up on gmin for this transistor.
        if (this.localSubIters > 100)
            this.badIters++;
        else
            this.badIters = 0;

        // Save junction cap state for next time step's companion model.
        // capVoltXX = node voltage difference across junction (circuit reference, not pnp-adjusted).
        // capCurXX  = actual capacitor current at end of this time step.
        if (this.geqBE > 0) {
            this.capVoltBE = this.volts[0] - this.volts[2];
            this.capCurBE = this.geqBE * this.capVoltBE + this.ceqBE;
        }
        if (this.geqBC > 0) {
            this.capVoltBC = this.volts[0] - this.volts[1];
            this.capCurBC = this.geqBC * this.capVoltBC + this.ceqBC;
        }

        // Add junction cap currents to terminal currents for display.
        // BE cap current flows base to emitter; BC cap current flows base to collector.
        if (this.geqBE > 0) {
            const icapBE = this.geqBE * (this.volts[0] - this.volts[2]) + this.ceqBE;
            this.ib += icapBE;
            this.ie -= icapBE;
        }
        if (this.geqBC > 0) {
            const icapBC = this.geqBC * (this.volts[0] - this.volts[1]) + this.ceqBC;
            this.ib += icapBC;
            this.ic -= icapBC;
        }

        this.localSubIters = 0;
    }

    flipX(c2: number, count: number): void {
        if (this.x === this.x2)
            this.flags ^= TransistorElm.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.y === this.y2)
            this.flags ^= TransistorElm.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= TransistorElm.FLAG_FLIP;
        super.flipXY(xmy, count);
    }

    setFlipped(flip: boolean): void {
        if (((this.flags & TransistorElm.FLAG_FLIP) !== 0) !== flip)
            this.flags ^= TransistorElm.FLAG_FLIP;
    }

    canViewInScope(): boolean { return true; }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return -this.ib;
        if (n === 1) return -this.ic;
        return -this.ie;
    }
}

export class NTransistorElm extends TransistorElm {
    constructor(xx: number, yy: number) { super(xx, yy, false); }
    getDumpClass(): typeof TransistorElm { return TransistorElm; }
    getShortcut(): number { return 'n'.charCodeAt(0); }
}

export class PTransistorElm extends TransistorElm {
    constructor(xx: number, yy: number) { super(xx, yy, true); }
    getDumpClass(): typeof TransistorElm { return TransistorElm; }
    getShortcut(): number { return 'p'.charCodeAt(0); }
}
