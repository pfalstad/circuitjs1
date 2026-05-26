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

// 0 = switch
// 1 = switch end 1
// 2 = switch end 2
// ...
// 3n   = coil
// 3n+1 = coil
// 3n+2 = end of coil resistor

import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { Inductor } from "./Inductor";
import { RelayModel } from "./RelayModel";
import { Color } from "./Color";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Locale } from "./Locale";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";

export class RelayElm extends CircuitElm {
    readonly FLAG_SWAP_COIL      = 1;
    readonly FLAG_SHOW_BOX       = 2;
    readonly FLAG_BOTH_SIDES_COIL = 4;
    readonly FLAG_FLIP           = 8;
    readonly FLAG_PULLDOWN       = 16;

    needsPulldown(): boolean { return this.model != null && this.model.pulldown; }

    coilStyleFromFlags(f: number): number {
        if ((f & this.FLAG_SWAP_COIL) !== 0)       return 2;
        if ((f & this.FLAG_BOTH_SIDES_COIL) !== 0) return 0;
        return 1;
    }

    modelName: string;
    model: RelayModel;
    static lastModelName: string = "default";

    // convenience accessors so the rest of the code doesn't change
    inductance():    number { return this.model.inductance; }
    r_on():          number { return this.model.r_on; }
    r_off():         number { return this.model.r_off; }
    onCurrent():     number { return this.model.onCurrent; }
    offCurrent():    number { return this.model.offCurrent; }
    coilR():         number { return this.model.coilR; }
    switchingTime(): number { return this.model.switchingTime; }
    poleCount():     number { return this.model == null ? 1 : this.model.poleCount; }

    ind: Inductor;
    coilPosts: Point[];
    coilLeads: Point[];
    swposts: Point[][];
    swpoles: Point[][];
    ptSwitch: Point[];
    lines: Point[];
    outline: Point[] = this.newPointArray(4);
    coilCurrent: number;
    switchCurrent: number[];
    coilCurCount: number;
    switchCurCount: number[];

    // fractional position, between 0 and 1 inclusive
    d_position: number = 0;

    // integer position, can be 0 (off), 1 (on), 2 (in between)
    i_position: number = 0;

    openhs: number;
    dflip: number;
    onState: boolean = false;
    readonly nSwitch0 = 0;
    readonly nSwitch1 = 1;
    readonly nSwitch2 = 2;
    nCoil1: number;
    nCoil2: number;
    nCoil3: number;
    currentOffset1: number;
    currentOffset2: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.modelName  = RelayElm.lastModelName;
            this.model      = RelayModel.getModelWithName(this.modelName);
            this.ind        = new Inductor(CircuitElm.sim);
            this.ind.setup(this.inductance(), 0, Inductor.FLAG_BACK_EULER);
            this.noDiagonal = true;
            this.coilCurrent = this.coilCurCount = 0;
            this.setupPoles();
        } else {
            // old text-format constructor: build a model from the per-element parameters for backward compat
            super(xa, ya, xb, yb!, f!);
            const poleCount    = parseInt(st!.nextToken());
            const inductance   = parseFloat(st!.nextToken());
            this.coilCurrent   = parseFloat(st!.nextToken());
            const r_on         = parseFloat(st!.nextToken());
            const r_off        = parseFloat(st!.nextToken());
            const onCurrent    = parseFloat(st!.nextToken());
            const coilR        = parseFloat(st!.nextToken());
            let offCurrent     = onCurrent;
            let switchingTime  = 0;
            try {
                offCurrent    = parseFloat(st!.nextToken());
                switchingTime = parseFloat(st!.nextToken());
                this.d_position = this.i_position = parseInt(st!.nextToken());
            } catch (e) {}
            this.model = RelayModel.getModelWithParameters(inductance, r_on, r_off, onCurrent, offCurrent, coilR,
                switchingTime, this.coilStyleFromFlags(f!), (f! & this.FLAG_SHOW_BOX) !== 0,
                (f! & this.FLAG_PULLDOWN) !== 0, poleCount);
            this.modelName = this.model.name;
            this.postUndump();
        }
    }

    postUndump(): void {
        if (this.i_position === 1)
            this.onState = true;
        if (this.i_position === 2)
            this.d_position = .5;
        this.noDiagonal = true;
        this.ind = new Inductor(CircuitElm.sim);
        this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
        this.setupPoles();
        this.allocNodes();
    }

    setup(): void {
        this.model     = RelayModel.getModelWithNameOrCopy(this.modelName, this.model);
        this.modelName = this.model.name;
        this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
    }

    updateModels(): void {
        this.setup();
        this.setPoints();
    }

    newModelCreated(rm: RelayModel): void {
        this.model          = rm;
        this.modelName      = this.model.name;
        RelayElm.lastModelName = this.modelName;
        this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
        this.setPoints();
    }

    setupPoles(): void {
        this.nCoil1 = 3 * this.poleCount();
        this.nCoil2 = this.nCoil1 + 1;
        this.nCoil3 = this.nCoil1 + 2;
        if (this.switchCurrent == null || this.switchCurrent.length !== this.poleCount()) {
            this.switchCurrent  = new Array(this.poleCount()).fill(0);
            this.switchCurCount = new Array(this.poleCount()).fill(0);
        }
    }

    getDumpType(): number { return 178; }
    getXmlDumpType(): string { return "rl"; }

    dumpXml(doc: Document, elem: Element): void {
        if (!(this.model.builtIn || this.model.dumped))
            this.model.dumpXml(doc);
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modelName);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "i",  this.coilCurrent);
        CircuitXMLSerializer.dumpAttr(elem, "ip", this.i_position);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        const mo = xml.parseStringAttr("mo", null);
        if (mo != null) {
            // new format: model name present; poleCount comes from the model
            this.modelName = mo;
            this.model     = RelayModel.getModelWithNameOrCopy(this.modelName, this.model);
            this.modelName = this.model.name;
        } else if (xml.parseStringAttr("ix", null) == null) {
            // old format: read per-element params and create a model from them.
            // "ix" is present on state-restore calls (CompositeElm.dumpXmlState); skip model
            // creation then so the model set by the definition load is not overwritten.
            const poleCount    = xml.parseIntAttr("po", 1);
            const defaults     = new RelayModel();
            const inductance   = xml.parseDoubleAttr("in",   defaults.inductance);
            const r_on         = xml.parseDoubleAttr("ron",  defaults.r_on);
            const r_off        = xml.parseDoubleAttr("roff", defaults.r_off);
            const onCurrent    = xml.parseDoubleAttr("on",   defaults.onCurrent);
            const coilR        = xml.parseDoubleAttr("coR",  defaults.coilR);
            const offCurrent   = xml.parseDoubleAttr("of",   defaults.offCurrent);
            const switchingTime = xml.parseDoubleAttr("sw",  defaults.switchingTime);
            const coilStyle    = this.coilStyleFromFlags(this.flags);
            const showBox      = (this.flags & this.FLAG_SHOW_BOX) !== 0;
            const pulldown     = (this.flags & this.FLAG_PULLDOWN) !== 0;
            this.model = RelayModel.getModelWithParameters(inductance, r_on, r_off, onCurrent, offCurrent, coilR,
                switchingTime, coilStyle, showBox, pulldown, poleCount);
            this.modelName = this.model.name;
        }
        this.coilCurrent  = xml.parseDoubleAttr("i",  this.coilCurrent);
        this.d_position = this.i_position = xml.parseIntAttr("ip", this.i_position);
        this.postUndump();
    }

    draw(g: Graphics): void {
        for (let i = 0; i !== 2; i++) {
            this.setVoltageColor(g, this.nodes[this.nCoil1 + i].v);
            CircuitElm.drawThickLine(g, this.coilLeads[i], this.coilPosts[i]);
        }
        const x = (this.model.coilStyle === 2) ? 1 : 0;
        this.setPowerColor(g, this.coilCurrent * (this.nodes[this.nCoil1].v - this.nodes[this.nCoil2].v));
        this.drawCoil(g, this.dflip * 6, this.coilLeads[x], this.coilLeads[1 - x],
            this.nodes[this.nCoil1 + x].v, this.nodes[this.nCoil2 - x].v);

        // draw rectangle
        if (this.model.showBox) {
            g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
            CircuitElm.drawThickLine(g, this.outline[0], this.outline[1]);
            CircuitElm.drawThickLine(g, this.outline[1], this.outline[2]);
            CircuitElm.drawThickLine(g, this.outline[2], this.outline[3]);
            CircuitElm.drawThickLine(g, this.outline[3], this.outline[0]);
        }

        // draw lines
        g.setColor(Color.darkGray);
        for (let i = 0; i !== this.poleCount(); i++) {
            if (i === 0) {
                const off = (this.model.coilStyle === 0) ? 4 : 0;
                this.interpPoint(this.point1, this.point2, this.lines[i * 2],
                    .5, this.openhs * 2 + 5 * this.dflip - i * this.openhs * 3 + off);
            } else
                this.interpPoint(this.point1, this.point2, this.lines[i * 2],
                    .5, Math.trunc(this.openhs * (-i * 3 + 3 - .5 + this.d_position)) + 5 * this.dflip);
            this.interpPoint(this.point1, this.point2, this.lines[i * 2 + 1],
                .5, Math.trunc(this.openhs * (-i * 3 - .5 + this.d_position)) - 5 * this.dflip);
            g.setLineDash(4, 4);
            g.drawLine(this.lines[i * 2].x, this.lines[i * 2].y, this.lines[i * 2 + 1].x, this.lines[i * 2 + 1].y);
            g.setLineDash(0, 0);
        }

        for (let p = 0; p !== this.poleCount(); p++) {
            const po = p * 3;
            for (let i = 0; i !== 3; i++) {
                // draw lead
                this.setVoltageColor(g, this.nodes[this.nSwitch0 + po + i].v);
                CircuitElm.drawThickLine(g, this.swposts[p][i], this.swpoles[p][i]);
            }

            this.interpPoint(this.swpoles[p][1], this.swpoles[p][2], this.ptSwitch[p], this.d_position);
            g.setColor(Color.lightGray);
            CircuitElm.drawThickLine(g, this.swpoles[p][0], this.ptSwitch[p]);
            this.switchCurCount[p] = this.updateDotCountImpl(this.switchCurrent[p], this.switchCurCount[p]);
            this.drawDots(g, this.swposts[p][0], this.swpoles[p][0], this.switchCurCount[p]);

            if (this.i_position !== 2)
                this.drawDots(g, this.swpoles[p][this.i_position + 1], this.swposts[p][this.i_position + 1],
                    this.switchCurCount[p]);
        }

        this.coilCurCount = this.updateDotCountImpl(this.coilCurrent, this.coilCurCount);

        if (this.coilCurCount !== 0) {
            this.drawDots(g, this.coilPosts[0], this.coilLeads[0], this.coilCurCount);
            this.drawDots(g, this.coilLeads[0], this.coilLeads[1], this.addCurCount(this.coilCurCount, this.currentOffset1));
            this.drawDots(g, this.coilLeads[1], this.coilPosts[1], this.addCurCount(this.coilCurCount, this.currentOffset2));
        }

        this.drawPosts(g);
        this.setBbox(this.outline[0], this.outline[2], 0);
        this.adjustBbox(this.coilPosts[0], this.coilPosts[1]);
        this.adjustBbox(this.swposts[0][0], this.swposts[0][1]);
    }

    getCurrentIntoNode(n: number): number {
        if (n < 3 * this.poleCount()) {
            const p = Math.trunc(n / 3);
            const k = n % 3;
            if (k === 0)
                return -this.switchCurrent[p];
            if (k === 1 + this.i_position)
                return this.switchCurrent[p];
            return 0;
        }
        if (n === 3 * this.poleCount())
            return -this.coilCurrent;
        return this.coilCurrent;
    }

    setPoints(): void {
        super.setPoints();
        this.setupPoles();
        this.allocNodes();
        this.dflip  = this.hasFlag(this.FLAG_FLIP) ? -this.dsign : this.dsign;
        this.openhs = -this.dflip * 16;

        // switch
        this.calcLeads(32);
        this.swposts = [];
        this.swpoles = [];
        for (let i = 0; i !== this.poleCount(); i++) {
            this.swposts[i] = [new Point(), new Point(), new Point()];
            this.swpoles[i] = [new Point(), new Point(), new Point()];
            this.interpPoint(this.lead1!,  this.lead2!,  this.swpoles[i][0], 0, -this.openhs * 3 * i);
            this.interpPoint(this.lead1!,  this.lead2!,  this.swpoles[i][1], 1, -this.openhs * 3 * i - this.openhs);
            this.interpPoint(this.lead1!,  this.lead2!,  this.swpoles[i][2], 1, -this.openhs * 3 * i + this.openhs);
            this.interpPoint(this.point1, this.point2, this.swposts[i][0], 0, -this.openhs * 3 * i);
            this.interpPoint(this.point1, this.point2, this.swposts[i][1], 1, -this.openhs * 3 * i - this.openhs);
            this.interpPoint(this.point1, this.point2, this.swposts[i][2], 1, -this.openhs * 3 * i + this.openhs);
        }

        // coil
        this.coilPosts = this.newPointArray(2);
        this.coilLeads = this.newPointArray(2);
        this.ptSwitch  = this.newPointArray(this.poleCount());

        const x = (this.model.coilStyle === 2) ? 1 : 0;
        let boxSize: number;
        if (this.model.coilStyle !== 0) {
            this.interpPoint(this.point1, this.point2, this.coilPosts[0],  x,   this.openhs * 2);
            this.interpPoint(this.point1, this.point2, this.coilPosts[1],  x,   this.openhs * 3);
            this.interpPoint(this.point1, this.point2, this.coilLeads[0], .5,   this.openhs * 2);
            this.interpPoint(this.point1, this.point2, this.coilLeads[1], .5,   this.openhs * 3);
            boxSize = 56;
        } else {
            this.interpPoint(this.point1, this.point2, this.coilPosts[0], 0,          this.openhs * 2);
            this.interpPoint(this.point1, this.point2, this.coilPosts[1], 1,          this.openhs * 2);
            this.interpPoint(this.point1, this.point2, this.coilLeads[0], .5 - 16 / this.dn, this.openhs * 2);
            this.interpPoint(this.point1, this.point2, this.coilLeads[1], .5 + 16 / this.dn, this.openhs * 2);
            boxSize = 40;
        }

        // lines
        this.lines = this.newPointArray(this.poleCount() * 2);

        // outline
        const boxWScale = Math.min(0.4, 25.0 / this.dn);
        this.interpPoint(this.point1, this.point2, this.outline[0], 0.5 - boxWScale, -boxSize * this.dflip);
        this.interpPoint(this.point1, this.point2, this.outline[1], 0.5 + boxWScale, -boxSize * this.dflip);
        this.interpPoint(this.point1, this.point2, this.outline[2], 0.5 + boxWScale, -(this.openhs * 3 * this.poleCount()) - (24.0 * this.dflip));
        this.interpPoint(this.point1, this.point2, this.outline[3], 0.5 - boxWScale, -(this.openhs * 3 * this.poleCount()) - (24.0 * this.dflip));

        this.currentOffset1 = CircuitElm.distance(this.coilPosts[0], this.coilLeads[0]);
        this.currentOffset2 = this.currentOffset1 + CircuitElm.distance(this.coilLeads[0], this.coilLeads[1]);
    }

    getPost(n: number): Point {
        if (n < 3 * this.poleCount())
            return this.swposts[Math.trunc(n / 3)][n % 3];
        return this.coilPosts[n - 3 * this.poleCount()];
    }

    getPostCount(): number { return 2 + this.poleCount() * 3; }
    getInternalNodeCount(): number { return 1; }

    reset(): void {
        super.reset();
        this.ind.reset();
        this.coilCurrent = this.coilCurCount = 0;
        for (let i = 0; i !== this.poleCount(); i++)
            this.switchCurrent[i] = this.switchCurCount[i] = 0;
        this.d_position = this.i_position = 0;

        // preserve onState because if we don't, Relay Flip-Flop gets left in a weird state on reset.
        // onState = false;
    }

    stamp(): void {
        // inductor from coil post 1 to internal node
        this.ind.stamp(this.nodes[this.nCoil1], this.nodes[this.nCoil3]);
        // resistor from internal node to coil post 2
        CircuitElm.sim.stampResistor(this.nodes[this.nCoil3], this.nodes[this.nCoil2], this.coilR());

        for (let i = 0; i !== this.poleCount() * 3; i++)
            CircuitElm.sim.stampNonLinear(this.nodes[this.nSwitch0 + i]);

        // stamp pulldown resistors from switch contacts to ground using r_off,
        // matching the analog switch approach
        if (this.needsPulldown()) {
            for (let i = 0; i < this.poleCount(); i++) {
                CircuitElm.sim.stampResistor(this.nodes[this.nSwitch1 + i * 3], CircuitNode.ground, this.r_off());
                CircuitElm.sim.stampResistor(this.nodes[this.nSwitch2 + i * 3], CircuitNode.ground, this.r_off());
            }
        }
    }

    startIteration(): void {
        // using old model?
        if (this.switchingTime() === 0) {
            this.startIterationOld();
            return;
        }
        this.ind.startIteration(this.nodes[this.nCoil1].v - this.nodes[this.nCoil3].v);
        const absCurrent = Math.abs(this.coilCurrent);

        if (this.onState) {
            // on or turning on.  check if we need to turn off
            if (absCurrent < this.offCurrent()) {
                // turning off, set switch to intermediate position
                this.onState    = false;
                this.i_position = 2;
            } else {
                this.d_position += CircuitElm.sim.timeStep / this.switchingTime();
                if (this.d_position >= 1)
                    this.d_position = this.i_position = 1;
            }
        } else {
            // off or turning off.  check if we need to turn on
            if (absCurrent > this.onCurrent()) {
                // turning on, set switch to intermediate position
                this.onState    = true;
                this.i_position = 2;
            } else {
                this.d_position -= CircuitElm.sim.timeStep / this.switchingTime();
                if (this.d_position <= 0)
                    this.d_position = this.i_position = 0;
            }
        }
    }

    startIterationOld(): void {
        this.ind.startIteration(this.nodes[this.nCoil1].v - this.nodes[this.nCoil3].v);

        // magic value to balance operate speed with reset speed not at all realistically
        const magic  = 1.3;
        const pmult  = Math.sqrt(magic + 1);
        const c      = this.onCurrent();
        const p      = this.coilCurrent * pmult / c;
        this.d_position = Math.abs(p * p) - 1.3;
        if (this.d_position < 0)
            this.d_position = 0;
        if (this.d_position > 1)
            this.d_position = 1;
        if (this.d_position < .1)
            this.i_position = 0;
        else if (this.d_position > .9)
            this.i_position = 1;
        else
            this.i_position = 2;
    }

    // we need this to be able to change the matrix for each step
    nonLinear(): boolean { return true; }

    doStep(): void {
        const voltdiff = this.nodes[this.nCoil1].v - this.nodes[this.nCoil3].v;
        this.ind.doStep(voltdiff);
        for (let p = 0; p !== this.poleCount() * 3; p += 3) {
            if (this.i_position === 0) {
                CircuitElm.sim.stampResistor(this.nodes[this.nSwitch0 + p], this.nodes[this.nSwitch1 + p], this.r_on());
                if (!this.needsPulldown())
                    CircuitElm.sim.stampResistor(this.nodes[this.nSwitch0 + p], this.nodes[this.nSwitch2 + p], this.r_off());
            } else if (this.i_position === 1) {
                CircuitElm.sim.stampResistor(this.nodes[this.nSwitch0 + p], this.nodes[this.nSwitch2 + p], this.r_on());
                if (!this.needsPulldown())
                    CircuitElm.sim.stampResistor(this.nodes[this.nSwitch0 + p], this.nodes[this.nSwitch1 + p], this.r_off());
            } else {
                // intermediate position: both contacts open, need r_off
                // to avoid floating pole node
                CircuitElm.sim.stampResistor(this.nodes[this.nSwitch0 + p], this.nodes[this.nSwitch1 + p], this.r_off());
                CircuitElm.sim.stampResistor(this.nodes[this.nSwitch0 + p], this.nodes[this.nSwitch2 + p], this.r_off());
            }
        }
    }

    calculateCurrent(): void {
        const voltdiff = this.nodes[this.nCoil1].v - this.nodes[this.nCoil3].v;
        this.coilCurrent = this.ind.calculateCurrent(voltdiff);

        // actually this isn't correct, since there is a small amount
        // of current through the switch when off
        for (let p = 0; p !== this.poleCount(); p++) {
            if (this.i_position === 2)
                this.switchCurrent[p] = 0;
            else
                this.switchCurrent[p] =
                    (this.nodes[this.nSwitch0 + p * 3].v - this.nodes[this.nSwitch1 + p * 3 + this.i_position].v) / this.r_on();
        }
    }

    getElmType(): string { return "relay"; }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("relay");
        if (this.i_position === 0)
            arr[0] += " (" + Locale.LS("off") + ")";
        else if (this.i_position === 1)
            arr[0] += " (" + Locale.LS("on") + ")";
        if (this.switchingTime() === 0)
            arr[0] += " (" + Locale.LS("old model") + ")";
        let ln = 1;
        for (let i = 0; i !== this.poleCount(); i++)
            arr[ln++] = "I" + (i + 1) + " = " + CircuitElm.getCurrentDText(this.switchCurrent[i]);
        arr[ln++] = Locale.LS("coil I") + " = " + CircuitElm.getCurrentDText(this.coilCurrent);
        arr[ln++] = Locale.LS("coil Vd") + " = " +
            CircuitElm.getVoltageDText(this.nodes[this.nCoil1].v - this.nodes[this.nCoil2].v);
    }

    models: RelayModel[];

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model", 0, -1, -1);
            this.models = RelayModel.getModelList();
            ei.choice = new Choice();
            for (let i = 0; i !== this.models.length; i++) {
                const rm = this.models[i];
                ei.choice.add(rm.getDescription());
                if (rm === this.model)
                    ei.choice.select(i);
            }
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Create New Model") };
            return ei;
        }
        if (n === 2) {
            if (this.model.readOnly)
                return null;
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Edit Model") };
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.model     = this.models[ei.choice!.getSelectedIndex()];
            this.modelName = this.model.name;
            RelayElm.lastModelName = this.modelName;
            this.ind.setup(this.inductance(), this.coilCurrent, Inductor.FLAG_BACK_EULER);
            this.setPoints();
            ei.newDialog = true;
            return;
        }
        if (n === 1) {
            const newModel = new RelayModel(this.model);
            // EditRelayModelDialog not yet implemented
            return;
        }
        if (n === 2) {
            if (!this.model.readOnly) {
                // EditRelayModelDialog not yet implemented
            }
            return;
        }
    }

    getConnection(n1: number, n2: number): boolean {
        if (Math.trunc(n1 / 3) !== Math.trunc(n2 / 3))
            return false;

        // nodes in the same group (both coil or both same switch) are potentially connected
        return true;
    }

    hasGroundConnection(n: number): boolean {
        // switch contact nodes have ground connection via pulldown
        return this.needsPulldown() && n < this.nCoil1;
    }

    getShortcut(): number { return 'R'.charCodeAt(0); }

    flipX(c2: number, count: number): void {
        if (this.dx === 0)
            this.flags ^= this.FLAG_FLIP;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        if (this.dy === 0)
            this.flags ^= this.FLAG_FLIP;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= this.FLAG_FLIP;
        super.flipXY(xmy, count);
    }
}
