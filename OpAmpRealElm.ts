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

import { CapacitorElm } from "./CapacitorElm";
import { Checkbox } from "./Checkbox";
import { Choice } from "./Choice";
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CompositeElm } from "./CompositeElm";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { Polygon } from "./Polygon";
import { ResistorElm } from "./ResistorElm";
import { StringTokenizer } from "./StringTokenizer";
import { TransistorElm } from "./TransistorElm";

export class OpAmpRealElm extends CompositeElm {
    private static model741String =
        "NTransistorElm 3 8 9\rNTransistorElm 2 8 10\rPTransistorElm 11 12 9\rPTransistorElm 11 13 10\rNTransistorElm 14 12 1\r" +
        "NTransistorElm 14 13 5\rNTransistorElm 12 7 14\rPTransistorElm 8 8 7\rPTransistorElm 8 11 7\rNTransistorElm 17 11 16\r" +
        "NTransistorElm 17 17 4\rPTransistorElm 18 18 7\rPTransistorElm 18 20 7\rNTransistorElm 20 7 25\rNTransistorElm 13 22 24\r" +
        "NTransistorElm 21 20 22\rNTransistorElm 25 20 6\rNTransistorElm 24 22 23\rPTransistorElm 22 4 15\rNTransistorElm 23 13 4\r" +
        "CapacitorElm 13 20\r" +
        "ResistorElm 15 6\rResistorElm 6 25\r" +
        "ResistorElm 4 1\rResistorElm 4 14\rResistorElm 4 5\rResistorElm 4 16\rResistorElm 4 24\rResistorElm 4 23\rResistorElm 17 18\r" +
        "ResistorElm 22 21\rResistorElm 21 20\r";
    private static model741ExternalNodes = [2, 3, 6, 7, 4];

    private static lm324ModelString =
        "TransistorElm 1 2 3\rCurrentElm 4 3\rTransistorElm 2 2 5\rTransistorElm 2 6 5\rCapacitorElm 6 7\rCurrentElm 4 8\rCurrentElm 4 7\rTransistorElm 8 4 9\r" +
        "TransistorElm 7 4 10\rTransistorElm 10 4 11\rTransistorElm 11 7 12\rResistorElm 11 12\rTransistorElm 7 5 12\rCurrentElm 12 5\rTransistorElm 6 5 8\r" +
        "ResistorElm 9 5\rTransistorElm 9 7 5\rTransistorElm 13 6 3";
    private static lm324ExternalNodes = [1, 13, 12, 4, 5];
    private static lm324ModelDump =
        "0 -1 -0 0 10000/0 0.000006/0 1 0 0 100/0 1 0 0 100/0 1e-11 0/0 0.000004/0 0.0001/0 1 0 0 100/0 1 0 0 100/0 1 0 0 100/0 1 0 0 100/0 25/0 1 0 0 100/0 0.00005/" +
        "0 -1 0 0 100/0 10000/0 1 0 0 100/0 -1 0 0 10000";

    private static lm324v2ModelString =
        "ResistorElm 4 6\rCurrentElm 4 7\rResistorElm 4 29\rResistorElm 8 30\rResistorElm 9 31\rTransistorElm 30 29 31 \rResistorElm 4 32\rResistorElm 2 33\rResistorElm 10 34\r" +
        "TransistorElm 33 32 34 \rResistorElm 9 35\rResistorElm 9 36\rResistorElm 11 37\rTransistorElm 36 35 37 \rResistorElm 10 38\rResistorElm 10 39\rResistorElm 11 40\r" +
        "TransistorElm 39 38 40 \rResistorElm 12 41\rTransistorElm 13 41 4 \rResistorElm 13 42\rTransistorElm 13 42 4 \rResistorElm 4 43\rTransistorElm 12 43 14 \rResistorElm 3 44\r" +
        "TransistorElm 14 44 6 \rResistorElm 15 45\rTransistorElm 6 45 4 \rResistorElm 3 46\rTransistorElm 15 46 16 \rResistorElm 3 47\rTransistorElm 16 47 17 \rResistorElm 17 16\r" +
        "ResistorElm 5 17\rResistorElm 4 48\rTransistorElm 15 48 5 \rResistorElm 15 49\rTransistorElm 17 49 5 \rCurrentElm 18 3\rCurrentElm 19 3\rCurrentElm 20 3\rResistorElm 11 50\r" +
        "TransistorElm 18 50 3 \rResistorElm 14 51\rTransistorElm 19 51 3 \rResistorElm 5 52\rTransistorElm 7 52 4 \rResistorElm 15 53\rTransistorElm 20 53 3 \rCapacitorElm 21 22\r" +
        "ResistorElm 12 21\rResistorElm 12 15\rVCVSElm 3 0 23 8\rVoltageElm 23 1\rCurrentElm 3 4\rResistorElm 4 3\rResistorElm 12 54\rTransistorElm 9 54 11 \rResistorElm 13 55\r" +
        "TransistorElm 10 55 11 \rCapacitorElm 12 13\rCapacitorElm 6 15\rCapacitorElm 3 24\rResistorElm 11 24\rCapacitorElm 1 2\rCapacitorElm 2 0\rCapacitorElm 1 0\r" +
        "VCVSElm 15 0 22 0\rCapacitorElm 5 0\rResistorElm 25 56\rTransistorElm 25 56 0 \rVCCSElm 27 0 4 3\rCurrentElm 0 25\rVoltageElm 25 26\rResistorElm 0 26\r" +
        "VCVSElm 28 26 27 0\rResistorElm 0 27\rVoltageElm 28 0\rResistorElm 0 28";
    private static lm324v2ExternalNodes = [2, 1, 5, 3, 4];
    private static lm324v2ModelDump =
        "0 40000/0 5e-7/0 380/0 1700/0 5/0 -1 0 0 306 xlm324v2-qpi/0 380/0 1700/0 5/0 -1 0 0 300 xlm324v2-qpa/0 380/0 1700/0 5/0 -1 0 0 306 xlm324v2-qpi/0 380/0 1700/0 5/" +
        "0 -1 0 0 306 xlm324v2-qpi/0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/0 300/0 -1 0 0 100 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/" +
        "0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/0 40000/0 18/0 300/0 -1 0 0 100 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 1.2e-7/0 6e-8/0 0.000001/0 300/" +
        "0 -1 0 0 100 xlm324v2-qpq/0 300/0 -1 0 0 100 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 300/0 -1 0 0 100 xlm324v2-qpq/2 4.8e-12 0 0/0 3/0 3000000000/0 2 -0.00001*(a-b)/" +
        "0 0 0 -0.00156/0 0.000005/0 450000/0 300/0 -1 0 0 100 xlm324v2-qpq/0 300/0 -1 0 0 100 xlm324v2-qpq/2 8e-12 0 0/2 1e-12 0 0/2 1e-13 0 0/0 300000/2 2.3e-13 0 0/2 7.9e-13 0 0/" +
        "2 7.9e-13 0 0/0 2 2*(a-b)/2 5e-14 0 0/0 25/0 1 0 0 100 xlm324v2-qnq/0 2 0.0003*(a-b)/0 0.001/0 0 0 -0.25/0 1000000/0 2 1*(a-b)/0 1000000/0 0 0 -0.55/0 1000000";

    static readonly MODEL_741 = 0;
    static readonly MODEL_324 = 1;
    static readonly MODEL_324v2 = 2;

    private static model741resistances = [50, 25, 1e3, 50e3, 1e3, 5e3, 50e3, 50, 39e3, 7500, 4500];

    modelType: number;
    readonly opheight = 16;
    readonly opwidth = 32;
    curCounts: number[];
    slewRate: number;
    currentLimit: number;
    capValue: number = 0;
    readonly defaultCurrentLimit = 0.0231;
    readonly FLAG_SWAP = 2;

    in1p: Point[];
    in2p: Point[];
    textp: Point[];
    rail1p: Point[];
    rail2p: Point[];
    triangle: Polygon;
    plusFont: Font;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xb!, yb!, f!);
            this.noDiagonal = true;
            this.slewRate = parseFloat(st.nextToken());
            this.capValue = parseFloat(st.nextToken());
            this.currentLimit = this.defaultCurrentLimit;
            this.modelType = OpAmpRealElm.MODEL_741;
            try {
                this.currentLimit = parseFloat(st.nextToken());
                this.modelType = parseInt(st.nextToken());
            } catch (e) {}
        } else {
            super(xa, ya);
            this.noDiagonal = true;
            this.slewRate = 0.6;
            this.currentLimit = this.defaultCurrentLimit;
            this.modelType = OpAmpRealElm.MODEL_741;
        }
        this.initModel();
    }

    private initModel(): void {
        this.flags |= CompositeElm.FLAG_ESCAPE;
        switch (this.modelType) {
            case OpAmpRealElm.MODEL_741:   this.init741(); break;
            case OpAmpRealElm.MODEL_324:   this.init324(); break;
            case OpAmpRealElm.MODEL_324v2: this.init324v2(); break;
        }
        this.curCounts = new Array(5).fill(0);
        this.setPoints();
    }

    private init741(): void {
        this.loadComposite(null, OpAmpRealElm.model741String, OpAmpRealElm.model741ExternalNodes);
        const cap = this.getCapacitor();
        if (cap) { cap.capacitance = 30e-12 / (this.slewRate / 0.6); cap.voltdiff = this.capValue; }
        for (let i = 0; i !== 11; i++)
            (this.compElmList[21+i] as ResistorElm).resistance = OpAmpRealElm.model741resistances[i];
        const currentMult = this.currentLimit / this.defaultCurrentLimit;
        (this.compElmList[21] as ResistorElm).resistance /= currentMult;
        (this.compElmList[22] as ResistorElm).resistance /= currentMult;
        (this.compElmList[13] as TransistorElm).setBeta(currentMult * 100);
        (this.compElmList[18] as TransistorElm).setBeta(currentMult * 100);
    }

    private init324(): void {
        const st = new StringTokenizer(OpAmpRealElm.lm324ModelDump, "/");
        this.loadComposite(st, OpAmpRealElm.lm324ModelString, OpAmpRealElm.lm324ExternalNodes);
        const cap = this.getCapacitor();
        if (cap) { cap.capacitance = 10e-12 / (this.slewRate / 0.55); cap.voltdiff = this.capValue; }
        const currentMult = this.currentLimit / this.defaultCurrentLimit;
        (this.compElmList[11] as ResistorElm).resistance /= currentMult;
        (this.compElmList[9]  as TransistorElm).setBeta(currentMult * 100);
        (this.compElmList[10] as TransistorElm).setBeta(currentMult * 100);
        (this.compElmList[12] as TransistorElm).setBeta(currentMult * 100);
        (this.compElmList[16] as TransistorElm).setBeta(currentMult * 100);
    }

    private init324v2(): void {
        const st = new StringTokenizer(OpAmpRealElm.lm324v2ModelDump, "/");
        this.loadComposite(st, OpAmpRealElm.lm324v2ModelString, OpAmpRealElm.lm324v2ExternalNodes);
    }

    reset(): void {
        super.reset();
        this.curCounts = new Array(5).fill(0);
    }

    getCapacitor(): CapacitorElm | null {
        if (this.modelType === OpAmpRealElm.MODEL_324v2) return null;
        return this.compElmList[this.modelType === OpAmpRealElm.MODEL_741 ? 20 : 4] as CapacitorElm;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "slr", this.slewRate);
        CircuitXMLSerializer.dumpAttr(elem, "cl", this.currentLimit);
        CircuitXMLSerializer.dumpAttr(elem, "mt", this.modelType);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        const elm = this.getCapacitor();
        CircuitXMLSerializer.dumpAttr(elem, "vd", elm ? elm.voltdiff : 0);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.slewRate = xml.parseDoubleAttr("slr", this.slewRate);
        this.currentLimit = xml.parseDoubleAttr("cl", this.currentLimit);
        this.modelType = xml.parseIntAttr("mt", this.modelType);
        const voltdiff = xml.parseDoubleAttr("vd", 0);
        this.initModel();
        const cap = this.getCapacitor();
        if (cap) cap.voltdiff = voltdiff;
    }

    getConnection(n1: number, n2: number): boolean { return true; }

    draw(g: Graphics): void {
        this.setBbox(this.point1, this.point2, this.opheight * 2);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.in1p[0], this.in1p[1]);
        this.setVoltageColor(g, this.nodes[1].v);
        CircuitElm.drawThickLine(g, this.in2p[0], this.in2p[1]);
        this.setVoltageColor(g, this.nodes[2].v);
        CircuitElm.drawThickLine(g, this.lead2!, this.point2);
        this.setVoltageColor(g, this.nodes[3].v);
        CircuitElm.drawThickLine(g, this.rail1p[0], this.rail1p[1]);
        this.setVoltageColor(g, this.nodes[4].v);
        CircuitElm.drawThickLine(g, this.rail2p[0], this.rail2p[1]);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        this.setPowerColor(g, true);
        CircuitElm.drawThickPolygon(g, this.triangle);
        g.setFont(this.plusFont);
        this.drawCenteredText(g, "-", this.textp[0].x, this.textp[0].y - 2, true);
        this.drawCenteredText(g, "+", this.textp[1].x, this.textp[1].y, true);
        for (let i = 0; i !== 5; i++)
            this.curCounts[i] = this.updateDotCountImpl(this.getCurrentIntoNode(i), this.curCounts[i]);
        this.drawDots(g, this.in1p[1], this.in1p[0], this.curCounts[0]);
        this.drawDots(g, this.in2p[1], this.in2p[0], this.curCounts[1]);
        this.drawDots(g, this.lead2!, this.point2, this.curCounts[2]);
        this.drawDots(g, this.rail1p[0], this.rail1p[1], -this.curCounts[3]);
        this.drawDots(g, this.rail2p[0], this.rail2p[1], -this.curCounts[4]);
        this.drawPosts(g);
    }

    setPoints(): void {
        super.setPoints();
        let ww = this.opwidth;
        if (ww > this.dn / 2) ww = Math.trunc(this.dn / 2);
        this.calcLeads(ww * 2);
        const hs = this.opheight * this.dsign;
        const hsswap = (this.flags & this.FLAG_SWAP) !== 0 ? -hs : hs;
        this.in1p  = this.newPointArray(2);
        this.in2p  = this.newPointArray(2);
        this.textp = this.newPointArray(2);
        this.rail1p = this.newPointArray(2);
        this.rail2p = this.newPointArray(2);
        this.interpPoint2(this.point1, this.point2, this.in1p[0],  this.in2p[0],  0, hsswap);
        this.interpPoint2(this.lead1!, this.lead2!,  this.in1p[1],  this.in2p[1],  0, hsswap);
        this.interpPoint2(this.lead1!, this.lead2!,  this.textp[0], this.textp[1], 0.2, hsswap);
        const railPos = 0.5 - ((this.dn/2) % CircuitElm.app.gridSize) / (ww * 2);
        this.interpPoint2(this.lead1!, this.lead2!, this.rail1p[1], this.rail2p[1], railPos, hs*2*(1-railPos));
        this.interpPoint2(this.lead1!, this.lead2!, this.rail1p[0], this.rail2p[0], railPos, hs*2);
        const tris = this.newPointArray(2);
        this.interpPoint2(this.lead1!, this.lead2!, tris[0], tris[1], 0, hs*2);
        this.triangle = this.createPolygon(tris[0], tris[1], this.lead2!);
        this.plusFont = new Font("SansSerif", 0, 14);
        this.setPost(0, this.in1p[0]);
        this.setPost(1, this.in2p[0]);
        this.setPost(2, this.point2);
        this.setPost(3, this.rail1p[0]);
        this.setPost(4, this.rail2p[0]);
    }

    getDumpType(): number { return 409; }
    getElmType(): string { return "op-amp"; }

    getInfo(arr: string[]): void {
        const type = this.modelType === OpAmpRealElm.MODEL_741 ? "LM741" : "LM324";
        arr[0] = "op-amp (" + type + ")";
        arr[1] = "V+ = " + CircuitElm.getVoltageText(this.nodes[1].v);
        arr[2] = "V- = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[3] = "Vout = " + CircuitElm.getVoltageText(this.nodes[2].v);
        arr[4] = "Iout = " + CircuitElm.getCurrentText(this.getCurrentIntoNode(2));
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo(EditInfo.makeLink("opampreal.html", "Model"), this.modelType);
            ei.choice = new Choice();
            ei.choice.add("LM741");
            if (this.modelType === OpAmpRealElm.MODEL_324) {
                ei.choice.add("LM324, old");
                ei.choice.add("LM324, fixed");
                ei.choice.select(this.modelType);
            } else {
                ei.choice.add("LM324");
                ei.choice.select(this.modelType === OpAmpRealElm.MODEL_741 ? 0 : 1);
            }
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Swap Inputs", (this.flags & this.FLAG_SWAP) !== 0);
            return ei;
        }
        if (this.modelType === OpAmpRealElm.MODEL_324v2) return null;
        if (n === 2) return new EditInfo("Slew Rate (V/usec)", this.slewRate);
        if (n === 3) return new EditInfo("Output Current Limit (A)", this.currentLimit);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.modelType = ei.choice!.getSelectedIndex();
            if (ei.choice!.getItemCount() === 2 && this.modelType === 1)
                this.modelType = OpAmpRealElm.MODEL_324v2;
            this.capValue = 0;
            this.initModel();
            ei.newDialog = true;
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_SWAP);
            this.setPoints();
        }
        if (n === 2) { this.slewRate = ei.value; this.initModel(); }
        if (n === 3) { this.currentLimit = ei.value; this.initModel(); }
    }

    canFlipX(): boolean { return this.dy === 0; }
    canFlipY(): boolean { return this.dx === 0; }
}
