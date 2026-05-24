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

import { DiodeElm } from "./DiodeElm";
import { DiodeModel } from "./DiodeModel";
import { Color } from "./Color";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Locale } from "./Locale";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";

export class LEDElm extends DiodeElm {
    colorR: number;
    colorG: number;
    colorB: number;
    maxBrightnessCurrent: number;

    static lastLEDModelName: string = "default-led";

    ledLead1: Point;
    ledLead2: Point;
    ledCenter: Point;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.modelName = LEDElm.lastLEDModelName;
            this.setup();
            this.maxBrightnessCurrent = .01;
            this.colorR = 1; this.colorG = this.colorB = 0;
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            if ((f! & (DiodeElm.FLAG_MODEL | DiodeElm.FLAG_FWDROP)) === 0) {
                const fwdrop = 2.1024259;
                this.model = DiodeModel.getModelWithParameters(fwdrop, 0);
                this.modelName = this.model.name;
                this.setup();
            }
            this.colorR = parseFloat(st!.nextToken());
            this.colorG = parseFloat(st!.nextToken());
            this.colorB = parseFloat(st!.nextToken());
            this.maxBrightnessCurrent = .01;
            try {
                this.maxBrightnessCurrent = parseFloat(st!.nextToken());
            } catch (e) {}
        }
    }

    getDumpType(): number { return 162; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "cr", this.colorR);
        XMLSerializer.dumpAttr(elem, "cg", this.colorG);
        XMLSerializer.dumpAttr(elem, "cb", this.colorB);
        XMLSerializer.dumpAttr(elem, "mbc", this.maxBrightnessCurrent);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.colorR = xml.parseDoubleAttr("cr", this.colorR);
        this.colorG = xml.parseDoubleAttr("cg", this.colorG);
        this.colorB = xml.parseDoubleAttr("cb", this.colorB);
        this.maxBrightnessCurrent = xml.parseDoubleAttr("mbc", this.maxBrightnessCurrent);
    }

    setPoints(): void {
        super.setPoints();
        const cr = 12;
        this.ledLead1  = this.interpPoint(this.point1, this.point2, .5 - cr / this.dn) as Point;
        this.ledLead2  = this.interpPoint(this.point1, this.point2, .5 + cr / this.dn) as Point;
        this.ledCenter = this.interpPoint(this.point1, this.point2, .5) as Point;
    }

    draw(g: Graphics): void {
        if (this.needsHighlight() || this.isCreating()) {
            super.draw(g);
            return;
        }
        this.setVoltageColor(g, this.volts[0]);
        DiodeElm.drawThickLine(g, this.point1, this.ledLead1);
        this.setVoltageColor(g, this.volts[1]);
        DiodeElm.drawThickLine(g, this.ledLead2, this.point2);

        g.setColor(Color.gray);
        const cr = 12;
        DiodeElm.drawThickCircle(g, this.ledCenter.x, this.ledCenter.y, cr);
        const cr2 = cr - 4;
        let w = this.current / this.maxBrightnessCurrent;
        if (w > 0)
            w = 255 * (1 + .2 * Math.log(w));
        if (w > 255) w = 255;
        if (w < 0)   w = 0;
        const cc = new Color(Math.trunc(this.colorR * w), Math.trunc(this.colorG * w), Math.trunc(this.colorB * w));
        g.setColor(cc);
        g.fillOval(this.ledCenter.x - cr2, this.ledCenter.y - cr2, cr2 * 2, cr2 * 2);
        this.setBbox(this.point1, this.point2, cr2);
        this.updateDotCount();
        this.drawDots(g, this.point1, this.ledLead1,  this.curcount);
        this.drawDots(g, this.point2, this.ledLead2, -this.curcount);
        this.drawPosts(g);
    }

    getElmType(): string { return "LED"; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        if (this.model.oldStyle)
            arr[0] = "LED";
        else
            arr[0] = Locale.LS("LED") + " (" + this.modelName + ")";
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Red Value (0-1)",             this.colorR,              0, 1).setDimensionless();
        if (n === 1) return new EditInfo("Green Value (0-1)",           this.colorG,              0, 1).setDimensionless();
        if (n === 2) return new EditInfo("Blue Value (0-1)",            this.colorB,              0, 1).setDimensionless();
        if (n === 3) return new EditInfo("Max Brightness Current (A)",  this.maxBrightnessCurrent, 0, .1);
        return super.getEditInfo(n - 4);
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.colorR = ei.value;
        if (n === 1) this.colorG = ei.value;
        if (n === 2) this.colorB = ei.value;
        if (n === 3) this.maxBrightnessCurrent = ei.value;
        super.setEditValue(n - 4, ei);
    }

    getShortcut(): number { return 'l'.charCodeAt(0); }

    setLastModelName(n: string): void { LEDElm.lastLEDModelName = n; }
}
