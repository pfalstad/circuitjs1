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
import { MosfetModel } from "./MosfetModel";
import { CirSim } from "./CirSim";
import { EditMosfetModelDialog } from "./EditMosfetModelDialog";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { Choice } from "./Choice";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";
import { ScrollValuePopup } from "./ScrollValuePopup";
import { TypeScrollPopup } from "./TypeScrollPopup";
import { parseFloatStrict } from "./NumberParse";

export class MosfetElm extends CircuitElm {
    pnp: number;
    readonly FLAG_PNP = 1;
    readonly FLAG_SHOWVT = 2;
    readonly FLAG_FLIP = 8;
    // these bits are no longer set on new elements (the settings they controlled now live on
    // MosfetModel), but the values are still needed to decode old circuit files that have them
    // packed into the element's own flags.
    readonly FLAG_DIGITAL_LEGACY = 4;
    readonly FLAG_HIDE_BULK_LEGACY = 16;
    readonly FLAG_BODY_DIODE_LEGACY = 32;
    readonly FLAG_BODY_TERMINAL_LEGACY = 64;
    readonly FLAG_SHOW_BODY_DIODE_LEGACY = 128;
    bodyTerminal: number = 0;

    vt: number;
    // beta = 1/(RdsON*(Vgs-Vt))
    beta: number;
    // junction capacitance state (backward euler companion model)
    capVoltGS: number = 0;
    capVoltGD: number = 0;
    capCurGS: number = 0;
    capCurGD: number = 0;
    geqGS: number = 0;
    geqGD: number = 0;
    ceqGS: number = 0;
    ceqGD: number = 0;
    diodeB1: Diode;
    diodeB2: Diode;
    diodeCurrent1: number = 0;
    diodeCurrent2: number = 0;
    bodyCurrent: number = 0;
    curcount_body1: number = 0;
    curcount_body2: number = 0;
    curcount_gate: number = 0;
    curcount_source: number = 0;
    curcount_drain: number = 0;
    modelName: string;
    model: MosfetModel;
    static lastModelName: string = "default";

    // cached copies of the model's drawing/behavior settings, refreshed in setup().  Cached
    // (rather than read from model directly) because getPostCount() is called from the base
    // CircuitElm constructor before our own "model" field is assigned; see DiodeElm.hasResistance
    // for the same pattern.
    bulkShown: boolean;
    digitalSymbolShown: boolean;
    bodyDiodeSimulated: boolean;
    bodyTerminalShown: boolean;
    bodyDiodeSymbolShown: boolean;

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
            this.noDiagonal = true;
            this.setupDiodes();
            this.modelName = this.getLastModelName();
            this.setup();
        } else {
            super(xa, ya, xbOrPnp!, yb!, f!);
            this.pnp = ((f! & this.FLAG_PNP) !== 0) ? -1 : 1;
            this.noDiagonal = true;
            this.setupDiodes();
            let vt0 = this.getDefaultThreshold();
            let beta0 = this.getBackwardCompatibilityBeta();
            try {
                vt0 = parseFloatStrict(st!.nextToken());
                beta0 = parseFloatStrict(st!.nextToken());
            } catch (e) {}
            this.model = this.legacyModel(vt0, beta0, this.flags);
            this.modelName = this.model.name;
            this.setup();
            this.allocNodes(); // make sure volts[] has the right number of elements when hasBodyTerminal() is true
        }
    }

    // is this a JFET (vs. a MOSFET)?  Both share MosfetModel; this only affects
    // which default model is used and which UI options are shown.
    isJfet(): boolean { return false; }

    getLastModelName(): string { return MosfetElm.lastModelName; }
    setLastModelName(n: string): void { MosfetElm.lastModelName = n; }

    // build (or find) a model matching the drawing/behavior bits from a pre-model circuit
    // file, where they were packed into the element's own flags instead of into a model.
    // Used for both the old plain-text format (StringTokenizer constructor) and old XML saves
    // (undumpXml, when there's no "mo" model-name attribute).  Also strips those bits out of
    // our own flags field, since they're no longer meaningful there.
    legacyModel(vt0: number, beta0: number, legacyFlags: number): MosfetModel {
        // JFETs never showed a bulk terminal, so FLAG_HIDE_BULK_LEGACY was never meaningfully
        // set/unset for them; force it false here so legacy JFETs match default-jfet (whose
        // showBulk is also false) instead of spawning a spurious "old-jfet" model.
        const legacyShowBulk = !this.isJfet() && (legacyFlags & (this.FLAG_DIGITAL_LEGACY | this.FLAG_HIDE_BULK_LEGACY)) === 0;
        const legacyDigital = (legacyFlags & this.FLAG_DIGITAL_LEGACY) !== 0;
        const legacyBodyDiode = (legacyFlags & this.FLAG_BODY_DIODE_LEGACY) !== 0;
        const legacyBodyTerminal = (legacyFlags & this.FLAG_BODY_TERMINAL_LEGACY) !== 0;
        const legacyShowBodyDiode = (legacyFlags & this.FLAG_SHOW_BODY_DIODE_LEGACY) !== 0;
        this.flags &= ~(this.FLAG_DIGITAL_LEGACY | this.FLAG_HIDE_BULK_LEGACY | this.FLAG_BODY_DIODE_LEGACY |
                   this.FLAG_BODY_TERMINAL_LEGACY | this.FLAG_SHOW_BODY_DIODE_LEGACY);
        return MosfetModel.getModelWithParameters(vt0, beta0, this.isJfet(), legacyShowBulk,
                legacyBodyDiode, legacyBodyTerminal, legacyDigital, legacyShowBodyDiode);
    }

    setup(): void {
        this.model = MosfetModel.getModelWithNameOrCopy(this.modelName, this.model ?? null, this.isJfet());
        this.modelName = this.model.name;
        this.vt = this.model.threshold;
        this.beta = this.model.beta;
        this.bulkShown = this.model.showBulk;
        this.digitalSymbolShown = !this.bulkShown && this.model.digitalSymbol;
        this.bodyDiodeSimulated = this.bulkShown && this.model.bodyDiode;
        this.bodyTerminalShown = this.bodyDiodeSimulated && this.model.bodyTerminal;
        this.bodyDiodeSymbolShown = this.bodyDiodeSimulated && this.model.showBodyDiodeSymbol;
        this.allocNodes(); // post count may have changed (e.g. bodyTerminalShown)
    }

    hasGateCaps(): boolean {
        return this.model.capGS > 0 || this.model.capGD > 0;
    }

    updateModels(): void {
        this.setup();
        this.setPoints();
    }

    // set up body diodes
    setupDiodes(): void {
        // diode from node 1 to body terminal
        this.diodeB1 = new Diode(CircuitElm.sim);
        this.diodeB1.setupForDefaultModel();
        // diode from node 2 to body terminal
        this.diodeB2 = new Diode(CircuitElm.sim);
        this.diodeB2.setupForDefaultModel();
    }

    // fallback vt/beta for old files with no configurable beta.  JfetElm overrides these.
    getDefaultThreshold(): number { return 1.5; }

    // default for elements in old files with no configurable beta.  JfetElm overrides this.
    // Not sure where this value came from, but the ZVP3306A has a beta of about .027.  Power MOSFETs have much higher betas (like 80 or more)
    getBackwardCompatibilityBeta(): number { return .02; }

    nonLinear(): boolean { return true; }

    onMouseWheel(e: WheelEvent): void {
        if (CirSim.typeScrollPopup != null && CirSim.typeScrollPopup.isShowing()) {
            CirSim.typeScrollPopup.doDeltaY(ScrollValuePopup.normalizeWheelDelta(e));
            return;
        }
        CirSim.typeScrollPopup = new TypeScrollPopup(e.clientX, e.clientY, ScrollValuePopup.normalizeWheelDelta(e), this, CircuitElm.app);
    }

    drawDigital(): boolean { return this.digitalSymbolShown; }
    showBulk(): boolean { return this.bulkShown; }
    hasBodyTerminal(): boolean { return this.bodyTerminalShown; }
    doBodyDiode(): boolean { return this.bodyDiodeSimulated; }
    showBodyDiode(): boolean { return this.bodyDiodeSymbolShown; }

    reset(): void {
        this.lastv1 = this.lastv2 = this.curcount = 0;
        this.curcount_body1 = this.curcount_body2 = this.curcount_gate = this.curcount_source = this.curcount_drain = 0;
        this.capVoltGS = this.capVoltGD = this.capCurGS = this.capCurGD = 0;
        this.geqGS = this.geqGD = this.ceqGS = this.ceqGD = 0;
        this.diodeB1.reset();
        this.diodeB2.reset();
    }

    getDumpType(): number { return 'f'.charCodeAt(0); }

    isMosfetElm(): boolean { return true; }

    dumpXml(doc: Document, elem: Element): void {
        if (!(this.model.builtIn || this.model.dumped))
            this.model.dumpXml(doc);
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modelName);
    }

    dumpXmlModel(doc: Document): void {
        if (!(this.model.builtIn || this.model.dumped))
            this.model.dumpXml(doc);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = 0;
        super.undumpXml(xml);
        this.modelName = xml.parseStringAttr("mo", null);
        if (this.modelName == null) {
            // pre-model circuit file: vt/be were dumped directly on the element, and the
            // drawing/behavior options were packed into our own flags
            const vt0 = xml.parseDoubleAttr("vt", this.getDefaultThreshold());
            const beta0 = xml.parseDoubleAttr("be", this.getBackwardCompatibilityBeta());
            this.model = this.legacyModel(vt0, beta0, this.flags);
            this.modelName = this.model.name;
        }
        this.setup();
        this.pnp = ((this.flags & this.FLAG_PNP) !== 0) ? -1 : 1;
    }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.hs);

        // draw source/drain terminals
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.src[0], this.src[1]);
        this.setVoltageColor(g, this.nodes[2].v);
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
            const v = this.nodes[1].v + (this.nodes[2].v - this.nodes[1].v) * i / segments;
            if (!power)
                this.setVoltageColor(g, v);
            this.interpPoint(this.src[1], this.drn[1], ps1, i * segf);
            this.interpPoint(this.src[1], this.drn[1], ps2, (i + 1) * segf);
            CircuitElm.drawThickLine(g, ps1, ps2);
        }

        // draw little extensions of that line
        if (!power)
            this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.src[1], this.src[2]);
        if (!power)
            this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.drn[1], this.drn[2]);

        // draw bulk connection
        if (this.showBulk()) {
            this.setVoltageColor(g, this.nodes[this.bodyTerminal].v);
            if (!this.hasBodyTerminal())
                CircuitElm.drawThickLine(g, this.pnp === -1 ? this.drn[0] : this.src[0], this.body[0]);
            CircuitElm.drawThickLine(g, this.body[0], this.body[1]);
        }

        // draw body diode symbol(s)
        if (this.showBodyDiode()) {
            if (!this.hasBodyTerminal()) {
                // single offset diode with L-shaped leads
                this.setVoltageColor(g, this.nodes[1].v);
                g.fillPolygon(this.bodyDiodePoly);
                CircuitElm.drawThickLine(g, this.src[0], this.bodyDiodeLeads[0]);
                CircuitElm.drawThickLine(g, this.bodyDiodeLeads[0], this.bodyDiodeLeads[1]);
                this.setVoltageColor(g, this.nodes[2].v);
                CircuitElm.drawThickLine(g, this.bodyDiodeCathode[0], this.bodyDiodeCathode[1]);
                CircuitElm.drawThickLine(g, this.bodyDiodeLeads[2], this.bodyDiodeLeads[3]);
                CircuitElm.drawThickLine(g, this.drn[0], this.bodyDiodeLeads[3]);
                this.adjustBbox(this.bodyDiodeLeads[0], this.bodyDiodeLeads[3]);
            } else {
                // two inline diodes: src↔body and body↔drn
                const anode1 = (this.pnp === 1) ? this.bodyTerminal : 1;
                const cathode1 = (this.pnp === 1) ? 1 : this.bodyTerminal;
                this.setVoltageColor(g, this.nodes[anode1].v);
                g.fillPolygon(this.bodyDiodePoly);
                this.setVoltageColor(g, this.nodes[cathode1].v);
                g.drawLine(this.bodyDiodeCathode[0], this.bodyDiodeCathode[1]);
                const anode2 = (this.pnp === 1) ? this.bodyTerminal : 2;
                const cathode2 = (this.pnp === 1) ? 2 : this.bodyTerminal;
                this.setVoltageColor(g, this.nodes[anode2].v);
                g.fillPolygon(this.bodyDiodePoly2);
                this.setVoltageColor(g, this.nodes[cathode2].v);
                g.drawLine(this.bodyDiodeCathode2[0], this.bodyDiodeCathode2[1]);
            }
        }

        // draw arrow
        if (!this.drawDigital()) {
            this.setVoltageColor(g, this.nodes[this.bodyTerminal].v);
            g.fillPolygon(this.arrowPoly);
        }
        if (power)
            g.setColor(Color.gray);

        // draw gate
        this.setVoltageColor(g, this.nodes[0].v);
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
        this.curcount_source = this.updateDotCountImpl(-(this.ids + this.capCurGS), this.curcount_source);
        this.curcount_drain = this.updateDotCountImpl(-this.ids + this.capCurGD, this.curcount_drain);
        this.drawDots(g, this.src[0], this.src[1], this.curcount_source);
        this.drawDots(g, this.src[1], this.drn[1], this.curcount_source);
        this.drawDots(g, this.drn[1], this.drn[0], this.curcount_drain);

        if (this.model.capGS > 0 || this.model.capGD > 0) {
            this.curcount_gate = this.updateDotCountImpl(this.capCurGS + this.capCurGD, this.curcount_gate);
            this.drawDots(g, this.point1, this.gate[1], this.curcount_gate);
        }

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

            // make fiddly adjustments to pin label locations depending on orientation
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
        return this.ids * (this.nodes[2].v - this.nodes[1].v)
            - this.diodeCurrent1 * (this.nodes[1].v - this.nodes[this.bodyTerminal].v)
            - this.diodeCurrent2 * (this.nodes[2].v - this.nodes[this.bodyTerminal].v);
    }
    getPostCount(): number { return this.hasBodyTerminal() ? 4 : 3; }

    addRoutingObstacle(router: WireRouter): void {
        router.addObstacle([this.gate[0], this.gate[2], this.src[0], this.drn[0], this.src[2], this.drn[2]]);
        router.addWire(this.point1.x, this.point1.y, this.gate[1].x, this.gate[1].y);
    }

    setPoints(): void {
        super.setPoints();

        // find the coordinates of the various points we need to draw
        // the MOSFET.
        let hs2 = this.hs * this.dsign;
        if ((this.flags & this.FLAG_FLIP) !== 0)
            hs2 = -hs2;
        this.src = this.newPointArray(3);
        this.drn = this.newPointArray(3);
        this.interpPoint2(this.point1, this.point2, this.src[0], this.drn[0], 1, -hs2);
        this.interpPoint2(this.point1, this.point2, this.src[1], this.drn[1], 1 - 22 / this.dn, -hs2);
        this.interpPoint2(this.point1, this.point2, this.src[2], this.drn[2], 1 - 22 / this.dn, -hs2 * 4 / 3);

        this.gate = this.newPointArray(3);
        this.interpPoint2(this.point1, this.point2, this.gate[0], this.gate[2], 1 - 28 / this.dn, hs2 / 2); // was 1-20/dn
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
                // NPN: anode=body, cathode=src/drn;  PNP: anode=src/drn, cathode=body
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

    startIteration(): void {
        if (CircuitElm.sim.timeStep <= 0)
            return;
        if (this.model.capGS > 0) {
            this.geqGS = this.model.capGS / CircuitElm.sim.timeStep;
            this.ceqGS = -this.geqGS * this.capVoltGS;
        }
        if (this.model.capGD > 0) {
            this.geqGD = this.model.capGD / CircuitElm.sim.timeStep;
            this.ceqGD = -this.geqGD * this.capVoltGD;
        }
    }

    stamp(): void {
        CircuitElm.sim.stampNonLinear(this.nodes[1]);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);
        if (this.hasGateCaps())
            CircuitElm.sim.stampNonLinear(this.nodes[0]);

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

        // save gate cap state for next time step
        if (this.model.capGS > 0 && this.geqGS > 0) {
            this.capVoltGS = this.nodes[0].v - this.nodes[1].v;
            this.capCurGS = this.geqGS * this.capVoltGS + this.ceqGS;
        }
        if (this.model.capGD > 0 && this.geqGD > 0) {
            this.capVoltGD = this.nodes[0].v - this.nodes[2].v;
            this.capCurGD = this.geqGD * this.capVoltGD + this.ceqGD;
        }
    }

    doStep(): void {
        this.calculate(false);
    }

    lastv0: number = 0;

    // this is called in doStep to stamp the matrix, and also called in stepFinished() to calculate the current
    calculate(finished: boolean): void {
        let vs: number[];
        if (finished)
            vs = [this.nodes[0].v, this.nodes[1].v, this.nodes[2].v];
        else {
            // limit voltage changes to .5V
            vs = [this.nodes[0].v, this.nodes[1].v, this.nodes[2].v];
            if (vs[1] > this.lastv1 + .5)
                vs[1] = this.lastv1 + .5;
            if (vs[1] < this.lastv1 - .5)
                vs[1] = this.lastv1 - .5;
            if (vs[2] > this.lastv2 + .5)
                vs[2] = this.lastv2 + .5;
            if (vs[2] < this.lastv2 - .5)
                vs[2] = this.lastv2 - .5;
        }

        let source = 1;
        let drain = 2;

        // if source voltage > drain (for NPN), swap source and drain
        // (opposite for PNP)
        if (this.pnp * vs[1] > this.pnp * vs[2]) {
            source = 2;
            drain = 1;
        }
        const gateIdx = 0;
        let vgs = vs[gateIdx] - vs[source];
        let vds = vs[drain] - vs[source];
        if (!finished && (this.nonConvergence(this.lastv1, vs[1]) || this.nonConvergence(this.lastv2, vs[2]) || this.nonConvergence(this.lastv0, vs[0])))
            CircuitElm.sim.converged = false;
        this.lastv0 = vs[0];
        this.lastv1 = vs[1];
        this.lastv2 = vs[2];
        const realvgs = vgs;
        const realvds = vds;
        vgs *= this.pnp;
        vds *= this.pnp;
        this.ids = 0;
        this.gm = 0;
        let Gds = 0;
        if (vgs < this.vt) {
            // should be all zero, but that causes a singular matrix,
            // so instead we treat it as a large resistor
            Gds = 1e-8;
            this.ids = vds * Gds;
            this.mode = 0;
        } else if (vds < vgs - this.vt) {
            // linear
            const lambda = this.model.lambda;
            this.ids = this.beta * ((vgs - this.vt) * vds - vds * vds * .5) * (1 + lambda * vds);
            this.gm = this.beta * vds * (1 + lambda * vds);
            Gds = this.beta * ((vgs - vds - this.vt) * (1 + lambda * vds) + lambda * ((vgs - this.vt) * vds - vds * vds * .5));
            this.mode = 1;
        } else {
            // saturation; Gds = 0 without lambda
            const lambda = this.model.lambda;
            const vgs_vt = vgs - this.vt;
            this.gm = this.beta * vgs_vt * (1 + lambda * vds);
            Gds = .5 * this.beta * vgs_vt * vgs_vt * lambda;
            // enforce a minimum Gds to avoid a singular matrix when lambda is 0.  The extra
            // current that minimum conductance carries has to be included in ids too, or the
            // device current jumps discontinuously to zero at vgs == vt (where the off branch
            // above gives vds*1e-8).  That discontinuity creates a bogus second operating point
            // just below vgs == vt, which the solver can settle into (e.g. an NMOS inverter with
            // an off pulldown would sit at vt below the supply instead of floating midway).
            let gdsMin = 0;
            if (Gds < 1e-8) {
                gdsMin = 1e-8 - Gds;
                Gds = 1e-8;
            }
            this.ids = .5 * this.beta * vgs_vt * vgs_vt * (1 + lambda * vds) + (vds - vgs_vt) * gdsMin;
            this.mode = 2;
        }

        if (this.doBodyDiode()) {
            this.diodeB1.doStep(this.pnp * (this.nodes[this.bodyTerminal].v - this.nodes[1].v));
            this.diodeCurrent1 = this.diodeB1.calculateCurrent(this.pnp * (this.nodes[this.bodyTerminal].v - this.nodes[1].v)) * this.pnp;
            this.diodeB2.doStep(this.pnp * (this.nodes[this.bodyTerminal].v - this.nodes[2].v));
            this.diodeCurrent2 = this.diodeB2.calculateCurrent(this.pnp * (this.nodes[this.bodyTerminal].v - this.nodes[2].v)) * this.pnp;
        } else
            this.diodeCurrent1 = this.diodeCurrent2 = 0;

        const ids0 = this.ids;

        // flip ids if we swapped source and drain above
        if (source === 2 && this.pnp === 1 ||
            source === 1 && this.pnp === -1)
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

        // gate capacitance companion model stamps (backward euler; avoids the
        // oscillatory behavior trapezoidal integration can cause when RC is
        // small relative to the timestep)
        // Cgs between gate (node 0) and node 1
        if (this.model.capGS > 0 && this.geqGS > 0) {
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[0], this.geqGS);
            CircuitElm.sim.stampMatrix(this.nodes[1], this.nodes[1], this.geqGS);
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[1], -this.geqGS);
            CircuitElm.sim.stampMatrix(this.nodes[1], this.nodes[0], -this.geqGS);
            CircuitElm.sim.stampRightSide(this.nodes[0], -this.ceqGS);
            CircuitElm.sim.stampRightSide(this.nodes[1], this.ceqGS);
        }
        // Cgd between gate (node 0) and node 2
        if (this.model.capGD > 0 && this.geqGD > 0) {
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[0], this.geqGD);
            CircuitElm.sim.stampMatrix(this.nodes[2], this.nodes[2], this.geqGD);
            CircuitElm.sim.stampMatrix(this.nodes[0], this.nodes[2], -this.geqGD);
            CircuitElm.sim.stampMatrix(this.nodes[2], this.nodes[0], -this.geqGD);
            CircuitElm.sim.stampRightSide(this.nodes[0], -this.ceqGD);
            CircuitElm.sim.stampRightSide(this.nodes[2], this.ceqGD);
        }
    }

    getFetInfo(arr: string[], n: string): void {
        arr[0] = Locale.LS(((this.pnp === -1) ? "p-" : "n-") + n) + " (" + this.modelName + ")";
        arr[1] = "Vt=" + CircuitElm.getVoltageText(this.pnp * this.vt) + ", β=" + this.beta;
        arr[2] = ((this.pnp === 1) ? "Ids = " : "Isd = ") + CircuitElm.getCurrentText(this.ids);
        arr[3] = "Vgs = " + CircuitElm.getVoltageText(this.nodes[0].v - this.nodes[this.pnp === -1 ? 2 : 1].v);
        arr[4] = ((this.pnp === 1) ? "Vds = " : "Vsd = ") + CircuitElm.getVoltageText(this.nodes[2].v - this.nodes[1].v);
        arr[5] = Locale.LS((this.mode === 0) ? "off" :
            (this.mode === 1) ? "linear" : "saturation");
        arr[6] = "gm = " + CircuitElm.getUnitText(this.gm, "A/V");
        arr[7] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
        let idx = 8;
        if (this.showBulk())
            arr[idx++] = "Ib = " + CircuitElm.getUnitText(this.bodyTerminal === 1 ? -this.diodeCurrent1 : this.bodyTerminal === 2 ? this.diodeCurrent2 : -this.pnp * (this.diodeCurrent1 + this.diodeCurrent2), "A");
        if (this.model.capGS > 0)
            arr[idx++] = "Cgs = " + CircuitElm.getUnitText(this.model.capGS, "F");
        if (this.model.capGD > 0)
            arr[idx] = "Cgd = " + CircuitElm.getUnitText(this.model.capGD, "F");
    }

    getElmType(): string { return "MOSFET"; }
    getInfo(arr: string[]): void {
        this.getFetInfo(arr, "MOSFET");
    }
    getScopeText(v: number): string {
        return Locale.LS(((this.pnp === -1) ? "p-" : "n-") + "MOSFET");
    }
    canViewInScope(): boolean { return true; }
    getVoltageDiff(): number { return this.nodes[2].v - this.nodes[1].v; }
    getConnection(n1: number, n2: number): boolean {
        if (this.hasGateCaps())
            return true;
        return !(n1 === 0 || n2 === 0);
    }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }
    models: MosfetModel[];

    // does this element support D/S swapping?  JfetElm overrides this to false since its
    // setPoints() doesn't honor FLAG_FLIP.  (The rest of the mosfet-only options - bulk
    // terminal, digital symbol, body diode - now live on MosfetModel, not here.)
    hasSwapDS(): boolean { return true; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model", 0, -1, -1);
            this.models = MosfetModel.getModelList(this.isJfet());
            ei.choice = new Choice();
            for (let i = 0; i !== this.models.length; i++) {
                const mm = this.models[i];
                ei.choice.add(mm.getDescription());
                if (mm === this.model)
                    ei.choice.select(i);
            }
            return ei;
        }
        let idx = 1;
        if (this.hasSwapDS()) {
            if (n === idx++) {
                const ei = new EditInfo("", 0, -1, -1);
                ei.checkbox = new Checkbox("Swap D/S", (this.flags & this.FLAG_FLIP) !== 0);
                return ei;
            }
        }
        if (n === idx) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Create New Model") };
            return ei;
        }
        if (n === idx + 1) {
            if (this.model.readOnly)
                return null;
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Edit Model") };
            return ei;
        }
        return null;
    }

    newModelCreated(mm: MosfetModel): void {
        this.model = mm;
        this.modelName = this.model.name;
        this.setup();
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.model = this.models[ei.choice!.getSelectedIndex()];
            this.modelName = this.model.name;
            this.setLastModelName(this.modelName);
            this.setup();
            ei.newDialog = true;
        } else {
            let idx = 1;
            if (this.hasSwapDS() && n === idx++) {
                this.flags = (ei.checkbox!.getState()) ? (this.flags | this.FLAG_FLIP) :
                    (this.flags & ~this.FLAG_FLIP);
            } else if (n === idx) {
                const newModel = new MosfetModel(this.model);
                const editDialog = new EditMosfetModelDialog(newModel, CirSim.theApp, this);
                CirSim.mosfetModelEditDialog = editDialog;
                editDialog.show();
                return;
            } else if (n === idx + 1) {
                if (this.model.readOnly) {
                    window.alert(Locale.LS("This model cannot be modified.  Change the model name to allow customization."));
                    return;
                }
                const editDialog = new EditMosfetModelDialog(this.model, CirSim.theApp, null);
                CirSim.mosfetModelEditDialog = editDialog;
                editDialog.show();
                return;
            }
        }

        // lots of different cases where the body terminal might have gotten removed/added so just do this all the time
        this.allocNodes();
        this.setPoints();
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) {
            // gate current from cap currents (cap current flows out of gate)
            let gateCur = 0;
            if (this.model.capGS > 0 && this.geqGS > 0)
                gateCur -= this.geqGS * (this.nodes[0].v - this.nodes[1].v) + this.ceqGS;
            if (this.model.capGD > 0 && this.geqGD > 0)
                gateCur -= this.geqGD * (this.nodes[0].v - this.nodes[2].v) + this.ceqGD;
            return gateCur;
        }
        if (n === 3)
            return -this.diodeCurrent1 - this.diodeCurrent2;
        if (n === 1) {
            const capCur = (this.model.capGS > 0 && this.geqGS > 0)
                ? this.geqGS * (this.nodes[0].v - this.nodes[1].v) + this.ceqGS : 0;
            return this.ids + this.diodeCurrent1 + capCur;
        }
        const capCur = (this.model.capGD > 0 && this.geqGD > 0)
            ? this.geqGD * (this.nodes[0].v - this.nodes[2].v) + this.ceqGD : 0;
        return -this.ids + this.diodeCurrent2 + capCur;
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
