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
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { EVENT_QUEUE_SIZE } from "./digital/circuit";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import { chipStart } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";
import { CirSim } from "./CirSim";
import { parseIntStrict, parseFloatStrict } from "./NumberParse";

// DICE's 7400 (quad 2-input NAND) propagation delays - used as the shared LH/HL defaults for
// every GateElm subtype (AND/OR/XOR/NAND/NOR/XNOR), since DICE has no plain AND/OR chip to
// match against (see chips/7400.ts, outputDelayNs(11.0, 7.0)).
export const DEFAULT_GATE_DELAY_LH_S = 11.0e-9;
export const DEFAULT_GATE_DELAY_HL_S = 7.0e-9;

/** Shared "Event Queue Size" edit field for gate-like elements (see DigitalSynthesis.queueSize). */
export function queueSizeEditInfo(queueSize: number): EditInfo {
    return new EditInfo(`Event Queue Size (0 = default ${EVENT_QUEUE_SIZE})`, queueSize, -1, -1).setDimensionless();
}

/** Validates an "Event Queue Size" edit: 0, or a power of two from 4 to 4096 (Cirque indexes by
 * mask). Returns the new size, or null after flagging the error on `ei`. */
export function parseQueueSizeEdit(ei: EditInfo): number | null {
    const v = Math.trunc(ei.value);
    if (v === 0 || (v >= 4 && v <= 4096 && (v & (v - 1)) === 0)) return v;
    ei.setError("must be 0 or a power of 2 from 4 to 4096");
    return null;
}

export abstract class GateElm extends CircuitElm {
    static readonly FLAG_SMALL = 1<<0;
    static readonly FLAG_SCHMITT = 1<<1;
    static readonly FLAG_INVERT_INPUTS = 1<<2;
    static readonly FLAG_DEMORGAN = 1<<3;
    inputCount: number = 2;
    lastOutput: boolean = false;
    justLoaded: boolean = false;
    highVoltage: number;
    propagationDelayLH: number = DEFAULT_GATE_DELAY_LH_S; // seconds; matches DICE's 7400 NAND LH delay
    propagationDelayHL: number = DEFAULT_GATE_DELAY_HL_S; // seconds; matches DICE's 7400 NAND HL delay
    queueSize: number = 0; // digital event queue size, 0 = default - see DigitalSynthesis.queueSize
    delayEndTime: number = 0;     // time at which pending output change takes effect
    static lastHighVoltage: number = 5;
    static lastSchmitt: boolean = false;
    getDragLength(): number { return 96; }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.noDiagonal = true;
            this.inputCount = 2;
            this.allocNodes();
            this.setupVolts();
            this.highVoltage = GateElm.lastHighVoltage;
            if (GateElm.lastSchmitt)
                this.flags |= GateElm.FLAG_SCHMITT;
            this.setSize(this.useSmallGrid() ? 1 : 2);
        } else {
            super(xa, ya, xb, yb!, f!);
            this.inputCount = parseIntStrict(st!.nextToken());
            const lastOutputVoltage = parseFloatStrict(st!.nextToken());
            this.noDiagonal = true;
            this.highVoltage = 5;
            try {
                this.highVoltage = parseFloatStrict(st!.nextToken());
            } catch (e) {}
            this.lastOutput = lastOutputVoltage > this.highVoltage * .5;
            this.setSize((f! & GateElm.FLAG_SMALL) !== 0 ? 1 : 2);
            this.allocNodes();
            this.setupVolts();
        }
    }

    isInverting(): boolean { return false; }
    isXorGateElm(): boolean { return false; }

    gsize: number = 0;
    gwidth: number = 0;
    gwidth2: number = 0;
    gheight: number = 0;
    hs2: number = 0;

    setSize(s: number): void {
        this.gsize = s;
        this.gwidth = 7*s;
        this.gwidth2 = 14*s;
        this.gheight = 8*s;
        this.flags &= ~GateElm.FLAG_SMALL;
        this.flags |= (s === 1) ? GateElm.FLAG_SMALL : 0;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.highVoltage !== 5)
            CircuitXMLSerializer.dumpAttr(elem, "hi", this.highVoltage);
        if (this.inputCount !== 2)
            CircuitXMLSerializer.dumpAttr(elem, "in", this.inputCount);
        if (this.propagationDelayLH !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "pd", this.propagationDelayLH);
        if (this.propagationDelayHL !== this.propagationDelayLH)
            CircuitXMLSerializer.dumpAttr(elem, "pdhl", this.propagationDelayHL);
        if (this.queueSize !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "qs", this.queueSize);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        if (this.nodes[this.inputCount].v !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "o", this.nodes[this.inputCount].v);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        // "ix" is present on state-restore calls (from CompositeElm.dumpXmlState/undumpXml).
        // In that case this element already exists with correct flags (set up when the
        // containing model was loaded), and the state element has no "f" attribute, so
        // zeroing flags here would wipe FLAG_SCHMITT/FLAG_INVERT_INPUTS/FLAG_SMALL instead
        // of restoring them.
        const stateRestore = xml.parseStringAttr("ix", null) != null;
        if (!stateRestore)
            this.flags = 0; // SMALL might have gotten set
        super.undumpXml(xml);
        this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
        this.inputCount = xml.parseIntAttr("in", this.inputCount);
        this.propagationDelayLH = xml.parseDoubleAttr("pd", this.propagationDelayLH);
        // old saves had a single symmetric "pd" delay; default HL to it when "pdhl" is absent
        this.propagationDelayHL = xml.parseDoubleAttr("pdhl", this.propagationDelayLH);
        this.queueSize = xml.parseIntAttr("qs", this.queueSize);
        const lastOutputVoltage = xml.parseDoubleAttr("o", 0);
        this.lastOutput = lastOutputVoltage > this.highVoltage * .5;
        this.setSize((this.flags & GateElm.FLAG_SMALL) !== 0 ? 1 : 2);
        this.allocNodes();
        this.setupVolts();
    }

    addRoutingObstacle(router: WireRouter): void {
        // add wires from each input post to gate body
        for (let i = 0; i < this.inputCount; i++)
            router.addWire(this.inPosts[i].x, this.inPosts[i].y, this.inGates[i].x, this.inGates[i].y);
        // add output wire
        router.addWire(this.lead2!.x, this.lead2!.y, this.point2.x, this.point2.y);

        const leadDist = CircuitElm.distance(this.lead1!, this.lead2!);
        const hs2 = this.gwidth * (this.inputCount/2 + 1);
        const pa = this.interpPoint(this.lead1!, this.lead2!, -8/leadDist, hs2) as Point;
        const pb = this.interpPoint(this.lead1!, this.lead2!, 1, -hs2) as Point;
        router.addObstacle(pa.x, pa.y, pb.x, pb.y);
    }

    getXmlDumpType(): string { return this.getClassName().replace("GateElm", ""); }

    inPosts: Point[];
    inGates: Point[];
    inputStates: boolean[];
    ww: number = 0;

    setPoints(): void {
        super.setPoints();
        this.inputStates = new Array(this.inputCount).fill(false);
        if (this.dn > 150 && this.isCreating())
            this.setSize(2);
        const hs = this.gheight;
        this.ww = this.gwidth2;
        if (this.ww > this.dn/2)
            this.ww = Math.trunc(this.dn/2);
        if (this.isInverting() && this.ww + 8 > this.dn/2)
            this.ww = Math.trunc(this.dn/2 - 8);
        this.calcLeads(this.ww*2);
        this.inPosts = this.newPointArray(this.inputCount);
        this.inGates = this.newPointArray(this.inputCount);
        let i0 = -Math.trunc(this.inputCount/2);
        if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS) || this.hasFlag(GateElm.FLAG_DEMORGAN))
            this.icircles = this.newPointArray(this.inputCount);
        else
            this.icircles = null;
        // moved up from after the loop below -- backCurveX() (OR-shaped bodies
        // only) needs the current hs2, not last time's value
        this.hs2 = this.gwidth * (Math.trunc(this.inputCount/2) + 1);
        const andShaped = this.drawAsAndGate();
        for (let i = 0; i !== this.inputCount; i++, i0++) {
            if (i0 === 0 && (this.inputCount & 1) === 0)
                i0++;
            const adj = this.getLeadAdjustment(i);
            this.interpPoint(this.point1, this.point2, this.inPosts[i], 0, hs*i0);
            // bx = true x-offset (from lead1) of the body's back surface at this
            // input's height: always 0 for AND (flat back), or the concave back
            // curve's real position for OR (see backCurveX) -- a flat fraction-0
            // offset is only correct there at the very top/bottom corners.
            // A lead with no bubble should reach exactly bx, the same as AND's
            // flat-back lead always reaches exactly fraction 0. A bubble sits
            // back from bx using the exact same clearance the original AND
            // bubble already used (-4 bubble-center, -8 wire-end).
            const bx = andShaped ? 0 : GateElm.backCurveX(hs*i0, this.hs2, this.ww*2.);
            const inGateOff = this.icircles !== null ? bx - 8 : bx;
            this.interpPoint(this.lead1!, this.lead2!, this.inGates[i],
                inGateOff/(this.ww*2.) + adj, hs*i0);
            if (this.icircles !== null)
                this.interpPoint(this.lead1!, this.lead2!, this.icircles[i], (bx-4)/(this.ww*2.), hs*i0);
        }
        this.setBbox(this.point1, this.point2, this.hs2);
        if (this.hasSchmittInputs())
            this.schmittPoly = this.getSchmittPolygon(this.gsize, .47);

        if (GateElm.useEuroGates()) {
            this.createEuroGatePolygon();
            this.linePoints = null;
        } else {
            // 0 - top left, 1 - start of top curve, 2 - control point for top curve
            // 3 - right, 4 - control point for bottom curve, 5 - start of bottom curve, 6 - bottom right, 7 - control point for left curve
            const triPoints = this.newPointArray(11);

            if (this.drawAsAndGate()) {
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[0], triPoints[6], 0, this.hs2);
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[1], triPoints[5], .5, this.hs2);
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[2], triPoints[4], 1, this.hs2);
                this.interpPoint(this.lead1!, this.lead2!, triPoints[3], 1);
            } else {
                // Fractions tuned to fit the true MIL-STD-806B circular-arc
                // geometry (front nose: radius 2h; back: radius 2h centered
                // sqrt(3)h behind the corners) as closely as a single-control-
                // point bezier can. Old values (.3 flat, .733/.85 front
                // control, .105 back control) deviated from the true arc by
                // ~11% of h; these get both curves down to ~2.4% of h,
                // matching the AND gate's fidelity.
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[0], triPoints[6], 0, this.hs2);
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[1], triPoints[5], .134, this.hs2);
                triPoints[3] = this.lead2!;
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[2], triPoints[4], .664, this.hs2*.8372);
                this.interpPoint(this.lead1!, this.lead2!, triPoints[7], GateElm.orBackCtrlFrac); // was .105 (originally .15)
            }
            if (this.isXorGateElm()) {
                const ww2 = (this.ww === 0) ? this.dn*2 : this.ww*2;
                this.interpPoint2(this.lead1!, this.lead2!, triPoints[8], triPoints[9], -.05-8/ww2, this.hs2);
                this.interpPoint(this.lead1!, this.lead2!, triPoints[10], .1-8/ww2);
            }
            this.gatePoly = this.createPolygon(triPoints);
        }

        if (this.isInverting() !== this.hasFlag(GateElm.FLAG_DEMORGAN)) {
            this.pcircle = this.interpPoint(this.point1, this.point2, .5+(this.ww+4)/this.dn) as Point;
            this.lead2 = this.interpPoint(this.point1, this.point2, .5+(this.ww+8)/this.dn);
        }
    }

    setupVolts(): void {
        this.justLoaded = true;
    }

    getLeadAdjustment(ix: number): number { return 0; }

    // Back-control fraction for the OR gate's concave back curve (the
    // triPoints[6]->[7]->[0] bezierCurveTo built in setPoints() / drawn in
    // drawGatePolygon()) -- named so backCurveX() below always matches
    // whatever the body curve actually draws.
    static readonly orBackCtrlFrac = .195;

    // Real (signed) cube root. Math.pow of a negative base to a non-integer
    // exponent is NaN, so we do the sign handling ourselves.
    static cbrt(x: number): number {
        return (x < 0) ? -Math.pow(-x, 1./3.) : Math.pow(x, 1./3.);
    }

    // True x-offset (from lead1, same units as ww/len) of the OR gate's
    // concave back curve at a given height "target" (same units as hs2).
    // That curve is a bezierCurveTo with a repeated control point --
    // P0=(0,-hs2), P1=P2=(orBackCtrlFrac*len,0), P3=(0,+hs2) -- which reduces
    // to x(t) = 3t(1-t)*orBackCtrlFrac*len, y(t) = hs2*(t^3-(1-t)^3).
    // Solving y(t)=target for t is a depressed cubic in s=2t-1
    // (s^3+3s-4k=0, k=target/hs2), solved here in closed form (Cardano) --
    // y(t) is monotonic in t over [0,1], so there's always exactly one real
    // solution.
    static backCurveX(target: number, hs2: number, len: number): number {
        const k = target/hs2;
        const disc = Math.sqrt(4*k*k+1);
        const s = GateElm.cbrt(2*k+disc) + GateElm.cbrt(2*k-disc);
        const t = (s+1)/2;
        return 3*t*(1-t)*GateElm.orBackCtrlFrac*len;
    }

    createEuroGatePolygon(): void {
        const pts = this.newPointArray(4);
        this.interpPoint2(this.lead1!, this.lead2!, pts[0], pts[1], 0, this.hs2);
        this.interpPoint2(this.lead1!, this.lead2!, pts[3], pts[2], 1, this.hs2);
        this.gatePoly = this.createPolygon(pts);
    }

    getGateText(): string | null { return null; }
    static useEuroGates(): boolean { return CircuitElm.app.menus.euroGatesCheckItem.getState(); }

    drawGatePolygon(g: Graphics): void {
        g.setLineWidth(3.0);
        g.context.beginPath();
        if (this.drawAsAndGate()) {
            g.context.moveTo(this.gatePoly.xpoints[0], this.gatePoly.ypoints[0]);
            g.context.lineTo(this.gatePoly.xpoints[1], this.gatePoly.ypoints[1]);
            g.context.bezierCurveTo(
                this.gatePoly.xpoints[1], this.gatePoly.ypoints[1],
                this.gatePoly.xpoints[2], this.gatePoly.ypoints[2],
                this.gatePoly.xpoints[3], this.gatePoly.ypoints[3]);
            g.context.bezierCurveTo(
                this.gatePoly.xpoints[3], this.gatePoly.ypoints[3],
                this.gatePoly.xpoints[4], this.gatePoly.ypoints[4],
                this.gatePoly.xpoints[5], this.gatePoly.ypoints[5]);
            g.context.lineTo(this.gatePoly.xpoints[6], this.gatePoly.ypoints[6]);
        } else {
            g.context.moveTo(this.gatePoly.xpoints[0], this.gatePoly.ypoints[0]);
            g.context.lineTo(this.gatePoly.xpoints[1], this.gatePoly.ypoints[1]);
            g.context.bezierCurveTo(
                this.gatePoly.xpoints[2], this.gatePoly.ypoints[2],
                this.gatePoly.xpoints[2], this.gatePoly.ypoints[2],
                this.gatePoly.xpoints[3], this.gatePoly.ypoints[3]);
            g.context.bezierCurveTo(
                this.gatePoly.xpoints[4], this.gatePoly.ypoints[4],
                this.gatePoly.xpoints[4], this.gatePoly.ypoints[4],
                this.gatePoly.xpoints[5], this.gatePoly.ypoints[5]);
            g.context.lineTo(this.gatePoly.xpoints[6], this.gatePoly.ypoints[6]);
            g.context.bezierCurveTo(
                this.gatePoly.xpoints[7], this.gatePoly.ypoints[7],
                this.gatePoly.xpoints[7], this.gatePoly.ypoints[7],
                this.gatePoly.xpoints[0], this.gatePoly.ypoints[0]);
        }
        g.context.closePath();

        if (this.isXorGateElm()) {
            g.context.moveTo(this.gatePoly.xpoints[8], this.gatePoly.ypoints[8]);
            g.context.bezierCurveTo(
                this.gatePoly.xpoints[10], this.gatePoly.ypoints[10],
                this.gatePoly.xpoints[10], this.gatePoly.ypoints[10],
                this.gatePoly.xpoints[9], this.gatePoly.ypoints[9]);
        }

        g.context.stroke();
        g.setLineWidth(1.0);
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== this.inputCount; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            CircuitElm.drawThickLine(g, this.inPosts[i], this.inGates[i]);
        }
        this.setVoltageColor(g, this.nodes[this.inputCount].v);
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        if (GateElm.useEuroGates()) {
            CircuitElm.drawThickPolygon(g, this.gatePoly);
            const center = this.interpPoint(this.point1, this.point2, .5) as Point;
            this.drawCenteredText(g, this.getGateText()!, center.x, center.y - 6*this.gsize, true);
        } else
            this.drawGatePolygon(g);
        g.setLineWidth(2);
        if (this.hasSchmittInputs())
            CircuitElm.drawPolygon(g, this.schmittPoly);
        g.setLineWidth(1);
        if (this.linePoints !== null)
            for (let i = 0; i !== this.linePoints!.length - 1; i++)
                CircuitElm.drawThickLine(g, this.linePoints![i], this.linePoints![i+1]);
        if (this.pcircle !== null && this.isInverting() !== this.hasFlag(GateElm.FLAG_DEMORGAN))
            CircuitElm.drawThickCircle(g, this.pcircle.x, this.pcircle.y, 3);
        if (this.icircles !== null)
            for (let i = 0; i !== this.inputCount; i++)
                CircuitElm.drawThickCircle(g, this.icircles[i].x, this.icircles[i].y, 3);
        this.curcount = this.updateDotCountImpl(this.current, this.curcount);
        this.drawDots(g, this.lead2!, this.point2, this.curcount);
        this.drawPosts(g);
    }

    gatePoly: Polygon;
    schmittPoly: Polygon;
    pcircle: Point | null = null;
    linePoints: Point[] | null = null;
    icircles: Point[] | null = null;

    getPostCount(): number { return this.inputCount + 1; }
    getPost(n: number): Point | null {
        if (n === this.inputCount)
            return this.point2;
        return this.inPosts[n];
    }
    getVoltageSourceCount(): number { return 1; }

    abstract getGateName(): string;
    abstract calcFunction(): boolean;
    abstract drawAsAndGate(): boolean;

    /** Two-input reduction step of this gate's family (AND/OR/XOR), as a 0/1 bitwise op -
     * digitalSynthesis() below folds it across pin[1..inputCount] to build the LUT cell's logic
     * function. Matches calcFunction()'s own per-family combine (AndGateElm's `f && ...`,
     * OrGateElm's `f || ...`, XorGateElm's `f !== ...`), just expressed once as a pure function
     * instead of duplicated per subclass's analog-path loop. Nand/Nor/Xnor inherit their base
     * family's reduction unchanged - only isInverting() differs. */
    protected abstract gateOp(a: number, b: number): number;

    /** Phase 2 (see noble-stirring-rabin.md): a single LUT cell computing the same
     * AND/OR/XOR-of-inputs-then-optionally-inverted logic as calcFunction()/isInverting(), with
     * FLAG_INVERT_INPUTS applied per-input first (mirrors getInput()'s own per-input inversion
     * for the analog path). propagationDelayLH/HL (seconds) map directly onto the cell's
     * outputDelayS, replacing the old propagationDelayTicks() hop-scheduling trick. */
    digitalSynthesis(): DigitalSynthesis {
        const n = this.inputCount;
        const invertInputs = this.hasFlag(GateElm.FLAG_INVERT_INPUTS);
        const invertOutput = this.isInverting();
        const outPin = n + 1;

        const logic: ChipLogic = (pin) => {
            let result = invertInputs ? (pin[1] ^ 1) : pin[1];
            for (let i = 2; i <= n; i++) {
                const v = invertInputs ? (pin[i] ^ 1) : pin[i];
                result = this.gateOp(result, v);
            }
            pin[outPin] = invertOutput ? (result ^ 1) : result;
        };

        const inPins: number[] = [];
        const pinMap = new Map<number, number>();
        for (let i = 0; i < n; i++) { inPins.push(i + 1); pinMap.set(i, i + 1); }
        pinMap.set(n, outPin);

        const desc: ChipDesc[] = [
            chipStart(logic).inputPins(...inPins).outputPin(outPin)
                .outputDelayS(this.propagationDelayLH, this.propagationDelayHL),
        ];
        return { desc, pinMap, queueSize: this.queueSize };
    }

    getInfo(arr: string[]): void {
        arr[0] = this.getGateName();
        arr[1] = "Vout = " + CircuitElm.getVoltageText(this.nodes[this.inputCount].v);
        arr[2] = "Iout = " + CircuitElm.getCurrentText(this.getCurrent());
        if (this.propagationDelayLH > 0 || this.propagationDelayHL > 0) {
            if (this.propagationDelayLH === this.propagationDelayHL)
                arr[3] = "delay = " + CircuitElm.getUnitText(this.propagationDelayLH, "s");
            else
                arr[3] = "delay = " + CircuitElm.getUnitText(this.propagationDelayLH, "s") + " (LH), "
                    + CircuitElm.getUnitText(this.propagationDelayHL, "s") + " (HL)";
        }
        if (CircuitElm.app.developerMode)
            appendInfoLine(arr, "opt: " + digitalStateTextForOutput(this, 0));
    }

    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[this.inputCount], this.voltSource);
    }

    hasSchmittInputs(): boolean { return (this.flags & GateElm.FLAG_SCHMITT) !== 0; }

    getInput(x: number): boolean {
        const high = !this.hasFlag(GateElm.FLAG_INVERT_INPUTS);
        if (!this.hasSchmittInputs())
            return (this.nodes[x].v > this.highVoltage * .5) ? high : !high;
        // inputStates is normally allocated in setPoints(), but elements inside a
        // CompositeElm/subcircuit never get setPoints() called, so allocate lazily here too.
        if (this.inputStates == null || this.inputStates.length !== this.inputCount)
            this.inputStates = new Array(this.inputCount).fill(false);
        const res = this.nodes[x].v > this.highVoltage * (this.inputStates[x] ? .35 : .55);
        this.inputStates[x] = res;
        return res ? high : !high;
    }

    oscillationCount: number = 0;
    lastTime: number = 0;

    doStep(): void {
        if (this.justLoaded) {
            this.justLoaded = false;
            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.inputCount], this.voltSource,
                this.lastOutput ? this.highVoltage : 0);
            return;
        }

        let f = this.calcFunction();
        if (this.isInverting())
            f = !f;

        // delay for the edge direction being requested (f is the new output value)
        const effectiveDelay = f ? this.propagationDelayLH : this.propagationDelayHL;

        if (effectiveDelay === 0 && this.lastTime !== CircuitElm.sim.t) {
            // detect oscillation (using same strategy as Atanua)
            if (this.lastOutput === !f) {
                if (this.oscillationCount++ > 50) {
                    // output is oscillating too much, randomly leave output the same
                    this.oscillationCount = 0;
                    if (CircuitElm.app.getrand(10) > 5)
                        f = this.lastOutput;
                }
            } else
                this.oscillationCount = 0;

            this.lastTime = CircuitElm.sim.t;
        }

        // apply propagation delay if configured
        if (effectiveDelay > 0) {
            if (f !== this.lastOutput) {
                // desired output differs from current output
                if (this.delayEndTime === 0)
                    // start the delay timer on first detection of change
                    this.delayEndTime = CircuitElm.sim.t + effectiveDelay;
                else if (CircuitElm.sim.t >= this.delayEndTime) {
                    // delay has elapsed, apply the change
                    this.lastOutput = f;
                    this.delayEndTime = 0;
                }
            } else {
                // output matches desired; cancel any pending delay
                this.delayEndTime = 0;
            }
        } else {
            this.lastOutput = f;
        }

        const res = this.lastOutput ? this.highVoltage : 0;
        CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.inputCount], this.voltSource, res);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Inputs", this.inputCount, 1, 8).setDimensionless();
        if (n === 1)
            return new EditInfo("High Logic Voltage", this.highVoltage, 1, 10).setUnitStep();
        if (n === 2)
            return EditInfo.createCheckbox("Schmitt Inputs", this.hasSchmittInputs());
        if (n === 3)
            return EditInfo.createCheckbox("Invert Inputs", this.hasFlag(GateElm.FLAG_INVERT_INPUTS));
        if (n === 4)
            return new EditInfo("Propagation Delay LH (s)", this.propagationDelayLH, 0, 0);
        if (n === 5)
            return new EditInfo("Propagation Delay HL (s)", this.propagationDelayHL, 0, 0);
        if (n === 6)
            return EditInfo.createCheckbox("DeMorgan's Symbol", this.hasFlag(GateElm.FLAG_DEMORGAN));
        if (n === 7)
            return queueSizeEditInfo(this.queueSize);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 1) {
                this.inputCount = Math.trunc(ei.value);
                this.allocNodes();
                this.setupVolts();
                this.setPoints();
            } else
                ei.setError("must be >= 1");
        }
        if (n === 1)
            this.highVoltage = GateElm.lastHighVoltage = ei.value;
        if (n === 2) {
            if (ei.checkbox.getState())
                this.flags |= GateElm.FLAG_SCHMITT;
            else
                this.flags &= ~GateElm.FLAG_SCHMITT;
            GateElm.lastSchmitt = this.hasSchmittInputs();
            this.setPoints();
        }
        if (n === 3) {
            // Invert Inputs (3) and DeMorgan's Symbol (5) are mutually exclusive
            if (ei.checkbox!.getState()) {
                this.flags |= GateElm.FLAG_INVERT_INPUTS;
                this.flags &= ~GateElm.FLAG_DEMORGAN;
            } else
                this.flags &= ~GateElm.FLAG_INVERT_INPUTS;
            this.setPoints();
            if (CirSim.editDialog != null)
                CirSim.editDialog.resetDialog();
        }
        if (n === 4)
            this.propagationDelayLH = ei.value;
        if (n === 5)
            this.propagationDelayHL = ei.value;
        if (n === 6) {
            if (ei.checkbox!.getState()) {
                this.flags |= GateElm.FLAG_DEMORGAN;
                this.flags &= ~GateElm.FLAG_INVERT_INPUTS;
            } else
                this.flags &= ~GateElm.FLAG_DEMORGAN;
            this.setPoints();
            if (CirSim.editDialog != null)
                CirSim.editDialog.resetDialog();
        }
        if (n === 7) {
            const qs = parseQueueSizeEdit(ei);
            if (qs !== null) this.queueSize = qs;
        }
    }

    validate(): boolean { return this.validateRailNode(this.inputCount); }
    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return (n1 === this.inputCount); }

    getCurrentIntoNode(n: number): number {
        if (n === this.inputCount)
            return this.current;
        return 0;
    }
}

export class AndGateElm extends GateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }

    getGateText(): string { return "&"; }

    getGateName(): string {
        if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS))
            return "NOR gate";
        return "AND gate";
    }
    calcFunction(): boolean {
        let f = true;
        for (let i = 0; i !== this.inputCount; i++)
            f = f && this.getInput(i);
        return f;
    }
    protected gateOp(a: number, b: number): number { return a & b; }
    getDumpType(): number { return 150; }
    getShortcut(): number { return '2'.charCodeAt(0); }
    // false = drawn as OR, true = drawn as AND; FLAG_DEMORGAN and FLAG_INVERT_INPUTS
    // cannot be set at the same time from the Edit popup
    drawAsAndGate(): boolean { return !this.hasFlag(GateElm.FLAG_DEMORGAN); }
}

export class NandGateElm extends AndGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    isInverting(): boolean { return true; }
    getGateName(): string {
        if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS))
            return "OR gate";
        return "NAND gate";
    }
    getDumpType(): number { return 151; }
    getShortcut(): number { return '@'.charCodeAt(0); }
    drawAsAndGate(): boolean { return !this.hasFlag(GateElm.FLAG_DEMORGAN); }
}

export class OrGateElm extends GateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }

    getGateName(): string {
        if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS))
            return "NAND gate";
        return "OR gate";
    }

    // Used to fan the two outermost leads back on large (>3-input) gates,
    // against a flat back reference. It only ever applied to the wire's
    // fraction (inGates), never to the bubble's (icircles), so on any
    // bubbled/DeMorgan large gate the two outer leads' wires pulled back
    // from their bubbles, leaving a visible gap -- and once GateElm's
    // backCurveX() started tracking the OR body's true (curved) back
    // surface, the same pull-back opened an identical gap to the body
    // itself on plain (non-bubbled) large OR/NOR gates. The curve already
    // tapers naturally toward the corners, making this manual fan
    // redundant on top of it, so it's removed rather than patched to also
    // move the bubble -- large gates now touch flush, same as small ones.

    getGateText(): string { return "≥1"; }

    calcFunction(): boolean {
        let f = false;
        for (let i = 0; i !== this.inputCount; i++)
            f = f || this.getInput(i);
        return f;
    }
    protected gateOp(a: number, b: number): number { return a | b; }
    getDumpType(): number { return 152; }
    getShortcut(): number { return '3'.charCodeAt(0); }
    // false = drawn as OR, true = drawn as AND; FLAG_DEMORGAN and FLAG_INVERT_INPUTS
    // cannot be set at the same time from the Edit popup
    drawAsAndGate(): boolean { return this.hasFlag(GateElm.FLAG_DEMORGAN); }
}

export class NorGateElm extends OrGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    getGateName(): string {
        if (this.hasFlag(GateElm.FLAG_INVERT_INPUTS))
            return "AND gate";
        return "NOR gate";
    }
    isInverting(): boolean { return true; }
    getDumpType(): number { return 153; }
    getShortcut(): number { return '#'.charCodeAt(0); }
    drawAsAndGate(): boolean { return this.hasFlag(GateElm.FLAG_DEMORGAN); }
}

export class XorGateElm extends OrGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    getGateName(): string { return "XOR gate"; }
    getGateText(): string { return "=1"; }
    isXorGateElm(): boolean { return true; }
    calcFunction(): boolean {
        let f = false;
        for (let i = 0; i !== this.inputCount; i++)
            f = f !== this.getInput(i);
        return f;
    }
    protected gateOp(a: number, b: number): number { return a ^ b; }
    // skip "Invert Inputs" (index 3 in GateElm); shift higher indices down
    getEditInfo(n: number): EditInfo | null {
        if (n >= 3) return super.getEditInfo(n + 1);
        return super.getEditInfo(n);
    }
    setEditValue(n: number, ei: EditInfo): void {
        if (n >= 3) super.setEditValue(n + 1, ei);
        else super.setEditValue(n, ei);
    }
    getDumpType(): number { return 154; }
    getShortcut(): number { return '4'.charCodeAt(0); }
    drawAsAndGate(): boolean { return false; }
}

export class XnorGateElm extends XorGateElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) super(xa, ya);
        else super(xa, ya, xb, yb!, f!, st!);
    }
    getGateName(): string { return "XNOR gate"; }
    isInverting(): boolean { return true; }
    getDumpType(): number { return 431; }
    getShortcut(): number { return '$'.charCodeAt(0); }
    drawAsAndGate(): boolean { return false; }
}
