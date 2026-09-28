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

import { CompositeElm } from "./CompositeElm";
import { CircuitElm } from "./CircuitElm";
import { DiodeElm } from "./DiodeElm";
import { DiodeModel } from "./DiodeModel";
import { TransistorElm } from "./TransistorElm";
import { ChipElm } from "./ChipElm";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Graphics } from "./Graphics";
import { Point } from "./Point";

export class OptocouplerElm extends CompositeElm {
    csize: number = 2;
    cspc: number = 0;
    cspc2: number = 0;
    rectPointsX: number[] = [];
    rectPointsY: number[] = [];
    curCounts: number[] = new Array(4).fill(0);
    ctr: number = 1.0; // current transfer ratio (1.0 = 100%)

    private static modelString = "DiodeElm 6 1\rCCCSElm 1 2 3 4\rNTransistorElm 3 4 5";
    private static modelExternalNodes = [6, 2, 4, 5];

    diode: DiodeElm;
    transistor: TransistorElm;
    stubs: Point[] = new Array(4);
    models: DiodeModel[] = [];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.loadComposite(null, OptocouplerElm.modelString, OptocouplerElm.modelExternalNodes);
            this.buildCompNodeList();
            this.allocNodes();
            this.noDiagonal = true;
            this.initOptocoupler();
            this.diode.modelName = "default-optocoupler-led";
            this.diode.setup();
        } else {
            super(xa, ya, xb, yb!, f!);
            // pass null since we don't need to undump sub-element state from text format
            this.loadComposite(null, OptocouplerElm.modelString, OptocouplerElm.modelExternalNodes);
            this.buildCompNodeList();
            this.allocNodes();
            this.noDiagonal = true;
            this.initOptocoupler();
        }
    }

    dumpXmlModel(doc: Document): void {
        const model = this.diode.model;
        if (!(model.builtIn || model.dumped))
            model.dumpXml(doc);
    }

    dumpXml(doc: Document, elem: Element): void {
        const model = this.diode.model;
        if (!(model.builtIn || model.dumped))
            model.dumpXml(doc);
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ctr", this.ctr);
        CircuitXMLSerializer.dumpAttr(elem, "dmo", this.diode.modelName);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.ctr = xml.parseDoubleAttr("ctr", this.ctr);
        // "ix" is set on state-restore calls (from CompositeElm.dumpXmlState); absent on
        // definition/top-level loads where a missing "dmo" should fall back to "default"
        const defaultDmo = (xml.parseStringAttr("ix", null) != null) ? this.diode.modelName : "default";
        this.diode.modelName = xml.parseStringAttr("dmo", defaultDmo) ?? this.diode.modelName;
        this.initOptocoupler();
        this.diode.setup();
    }

    private initOptocoupler(): void {
        this.csize = 2;
        this.cspc  = 8 * 2;
        this.cspc2 = this.cspc * 2;
        this.diode      = this.compElmList[0] as DiodeElm;
        const cccs: any  = this.compElmList[1]; // CCCSElm (not yet fully typed)
        this.transistor = this.compElmList[2] as TransistorElm;

        // from http://www.cel.com/pdf/appnotes/an3017.pdf
        // base expression models a ~100% CTR device; scaled by ctr
        cccs?.setExpr(this.ctr + "*max(0,min(.0001, select(i-.003, (-80000000000*(i)^5+800000000*(i)^4-3000000*(i)^3+5177.2*(i)^2+.2453*(i)-.00005)*1.04/700, (9000000*(i)^5-998113*(i)^4+42174*(i)^3-861.32*(i)^2+9.0836*(i)-.0078)*.945/700)))");

        this.transistor.setBeta(700);
        this.curCounts = new Array(4).fill(0);
    }

    reset(): void {
        super.reset();
        this.curCounts = new Array(4).fill(0);
    }

    getConnection(n1: number, n2: number): boolean {
        return Math.trunc(n1 / 2) === Math.trunc(n2 / 2);
    }

    draw(g: Graphics): void {
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.rectPointsX, this.rectPointsY, 4);

        for (let i = 0; i !== 4; i++) {
            this.setVoltageColor(g, this.nodes[i].v);
            const a = this.posts[i];
            const b = this.stubs[i];
            CircuitElm.drawThickLine(g, a, b);
            this.curCounts[i] = this.updateDotCountImpl(-this.getCurrentIntoNode(i), this.curCounts[i]);
            this.drawDots(g, a, b, this.curCounts[i]);
        }

        this.diode.draw(g);
        this.transistor.draw(g);

        this.drawPosts(g);

        // draw little arrows
        g.setColor(CircuitElm.lightGrayColor);
        const dflip = this.isFlippedX() ? -1 : 1;
        const sx = this.stubs[0].x + 2 * dflip;
        const sy = Math.trunc((this.stubs[0].y + this.stubs[1].y) / 2);
        for (let i = 0; i !== 2; i++) {
            const y = sy + i * 10 - 5;
            const p1 = new Point(sx, y);
            const p2 = new Point(sx + 20 * dflip, y);
            const p = this.calcArrow(p1, p2, 5, 2);
            g.fillPolygon(p);
            g.drawLine(sx + 10 * dflip, y, sx + 15 * dflip, y);
        }
    }

    setPoints(): void {
        super.setPoints();

        // adapted from ChipElm
        const x0 = this.x + this.cspc2;
        const y0 = this.y;
        const xr = x0 - this.cspc;
        const yr = y0 - this.cspc / 2;
        const sizeX = 2;
        const sizeY = 2;
        const xs = sizeX * this.cspc2;
        const ys = sizeY * this.cspc2 - this.cspc;
        this.rectPointsX = [xr, xr + xs, xr + xs, xr];
        this.rectPointsY = [yr, yr, yr + ys, yr + ys];
        this.setBbox(xr, yr, this.rectPointsX[2], this.rectPointsY[2]);
        this.stubs = new Array(4);

        this.setPin(0, x0, y0, 0, 1, -1, 0, 0, 0);
        this.setPin(1, x0, y0, 0, 1, -1, 0, 0, 0);
        this.setPin(2, x0, y0, 0, 1,  1, 0, xs - this.cspc2, 0);
        this.setPin(3, x0, y0, 0, 1,  1, 0, xs - this.cspc2, 0);

        const dflip = this.isFlippedX() ? -1 : 1;
        this.diode.setPosition(this.posts[0].x + 32 * dflip, this.posts[0].y,
                               this.posts[1].x + 32 * dflip, this.posts[1].y);
        this.stubs[0] = this.diode.getPost(0);
        this.stubs[1] = this.diode.getPost(1);

        const midp = Math.trunc((this.posts[2].y + this.posts[3].y) / 2);
        this.transistor.setFlipped(this.isFlippedY());
        this.transistor.setPosition(this.posts[2].x - 40 * dflip, midp,
                                    this.posts[2].x - 24 * dflip, midp);
        this.stubs[2] = this.transistor.getPost(1);
        this.stubs[3] = this.transistor.getPost(2);
    }

    isFlippedX(): boolean { return (this.flags & ChipElm.FLAG_FLIP_X) !== 0; }
    isFlippedY(): boolean { return (this.flags & ChipElm.FLAG_FLIP_Y) !== 0; }
    canFlipXY():  boolean { return false; }

    flipX(center2: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_X;
        if (count !== 1) {
            const xs = 3 * this.cspc2;
            this.x  = center2 - this.x - xs;
            this.x2 = center2 - this.x2;
        }
        this.setPoints();
    }

    flipY(center2: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_Y;
        if (count !== 1) {
            const ys = 1 * this.cspc2;
            this.y  = center2 - this.y - ys;
            this.y2 = center2 - this.y2;
        }
        this.setPoints();
    }

    private setPin(n: number, px: number, py: number,
                   ddx: number, ddy: number, dax: number, day: number,
                   sx: number, sy: number): void {
        const pos = n % 2;
        if (this.isFlippedX()) { ddx = -ddx; dax = -dax; px += this.cspc2; sx = -sx; }
        if (this.isFlippedY()) { ddy = -ddy; day = -day; py += this.cspc2; sy = -sy; }
        const xa = px + this.cspc2 * ddx * pos + sx;
        const ya = py + this.cspc2 * ddy * pos + sy;
        this.setPost(n, new Point(xa + dax * this.cspc2, ya + day * this.cspc2));
        this.stubs[n]  = new Point(xa + dax * this.cspc,  ya + day * this.cspc);
    }

    getDumpType(): number { return 407; }

    getInfo(arr: string[]): void {
        arr[0] = "optocoupler";
        arr[1] = "CTR Scale = " + CircuitElm.showFormat.format(this.ctr);
        arr[2] = "Iin = "  + CircuitElm.getCurrentText(this.getCurrentIntoNode(0));
        arr[3] = "Iout = " + CircuitElm.getCurrentText(this.getCurrentIntoNode(2));
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("CTR Scale", this.ctr, 0, 0).setDimensionless();
        if (n === 1) {
            const ei = new EditInfo("LED Model", 0, -1, -1);
            this.models = DiodeModel.getModelList(false);
            ei.choice = new Choice();
            for (let i = 0; i !== this.models.length; i++) {
                const dm = this.models[i];
                ei.choice.add(dm.getDescription());
                if (dm === this.diode.model)
                    ei.choice.select(i);
            }
            return ei;
        }
        return null;
    }

    updateModels(): void {
        this.diode.setup();
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) {
            this.ctr = ei.value;
            this.initOptocoupler();
        }
        if (n === 1) {
            this.diode.model = this.models[ei.choice!.getSelectedIndex()];
            this.diode.modelName = this.diode.model.name;
            this.diode.setup();
        }
    }
}
