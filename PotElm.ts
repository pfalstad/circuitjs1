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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Scrollbar } from "./UIManager";
import { Locale } from "./Locale";
import { SimulationManager } from "./SimulationManager";

export class PotElm extends CircuitElm {
    readonly FLAG_SHOW_VALUES = 1;
    readonly FLAG_FLIP        = 2;
    readonly FLAG_FLIP_OFFSET = 4;

    position: number = 0.5;
    maxResistance: number = 1000;
    resistance1: number = 0;
    resistance2: number = 0;
    current1: number = 0;
    current2: number = 0;
    current3: number = 0;
    curcount1: number = 0;
    curcount2: number = 0;
    curcount3: number = 0;
    slider: Scrollbar | null = null;
    labelEl: HTMLElement | null = null;
    sliderText: string = "Resistance";
    link: number = 0;
    sliderOwner: boolean = false;
    deleted: boolean = false;

    post3: Point = new Point();
    corner2: Point = new Point();
    arrowPoint: Point = new Point();
    midpoint: Point = new Point();
    arrow1: Point = new Point();
    arrow2: Point = new Point();
    ps3: Point = new Point();
    ps4: Point = new Point();

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.maxResistance = 1000;
            this.position = 0.5;
            this.sliderText = "Resistance";
            this.flags = this.FLAG_SHOW_VALUES;
            this.createSlider();
        } else {
            super(xa, ya, xb, yb!, f!);
            this.maxResistance = parseFloat(st!.nextToken());
            this.position = parseFloat(st!.nextToken());
            let text = st!.nextToken();
            while (st!.hasMoreTokens())
                text += ' ' + st!.nextToken();
            this.sliderText = text;
            this.createSlider();
        }
    }

    getPostCount(): number { return 3; }
    getDumpType(): number { return 174; }
    getXmlDumpType(): string { return "pt"; }
    isPotElm(): boolean { return true; }

    getPost(n: number): Point {
        return (n === 0) ? this.point1 : (n === 1) ? this.point2 : this.post3;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ma", this.maxResistance);
        CircuitXMLSerializer.dumpAttr(elem, "po", this.position);
        CircuitXMLSerializer.dumpAttr(elem, "sl", this.sliderText);
        if (this.link !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "li", this.link);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.maxResistance = xml.parseDoubleAttr("ma", this.maxResistance);
        this.position      = xml.parseDoubleAttr("po", this.position);
        this.sliderText    = xml.parseStringAttr("sl", this.sliderText);
        this.setLink(xml.parseIntAttr("li", 0));
        this.slider?.setValue(this.calcSliderValue());
        if (this.labelEl != null)
            this.labelEl.textContent = this.sliderText;
    }

    calcSliderValue(): number {
        return Math.round((this.position - 0.005) / 0.0099);
    }

    // detach from slider, transferring ownership to another linked pot if possible
    detachSlider(): void {
        if (!this.sliderOwner) return;
        let transferred = false;
        if (this.link !== 0) {
            for (const ce of CircuitElm.app.elmList) {
                if (ce instanceof PotElm && ce !== this && ce.link === this.link && !ce.deleted) {
                    ce.sliderOwner = true;
                    ce.slider = this.slider;
                    ce.labelEl = this.labelEl;
                    transferred = true;
                    break;
                }
            }
        }
        if (!transferred) {
            if (this.labelEl != null) CircuitElm.app.removeWidgetFromVerticalPanel(this.labelEl);
            if (this.slider  != null) CircuitElm.app.removeWidgetFromVerticalPanel(this.slider.element);
        }
        this.slider = null;
        this.labelEl = null;
        this.sliderOwner = false;
    }

    setLink(newLink: number): void {
        if (newLink === this.link) return;
        this.detachSlider();
        this.link = newLink;
        this.createSlider();
    }

    createSlider(): void {
        if (this.link !== 0) {
            for (const ce of CircuitElm.app.elmList) {
                if (ce instanceof PotElm && ce !== this && ce.link === this.link && ce.slider != null) {
                    this.slider = ce.slider;
                    this.labelEl = ce.labelEl;
                    this.sliderOwner = false;
                    return;
                }
            }
        }
        const lbl = document.createElement('div');
        lbl.textContent = this.sliderText;
        lbl.className = 'topSpace';
        this.labelEl = lbl;
        CircuitElm.app.addWidgetToVerticalPanel(lbl);

        const value = this.calcSliderValue();
        this.slider = new Scrollbar(Scrollbar.HORIZONTAL, value, 1, 0, 101);
        this.slider.addChangeHandler(() => {
            CircuitElm.app.analyzeFlag = true;
            this.setPoints();
            if (this.link !== 0) {
                for (const ce of CircuitElm.app.elmList) {
                    if (ce instanceof PotElm && ce !== this && ce.link === this.link)
                        ce.setPoints();
                }
            }
        });
        CircuitElm.app.addWidgetToVerticalPanel(this.slider.element);
        this.sliderOwner = true;
    }

    delete(): void {
        this.deleted = true;
        this.detachSlider();
        super.delete();
    }

    setPoints(): void {
        super.setPoints();
        const app = CircuitElm.app;
        let offset = 0;
        let myLen = 0;
        if ((CircuitElm.abs(this.dx) > CircuitElm.abs(this.dy)) !== this.hasFlag(this.FLAG_FLIP)) {
            myLen = 2 * app.gridSize * Math.sign(this.dx) *
                    Math.ceil(CircuitElm.abs(this.dx) / (2 * app.gridSize));
            this.point2.x = this.point1.x + myLen;
            offset = (this.dx < 0) ? this.dy : -this.dy;
            this.point2.y = this.point1.y;
        } else {
            myLen = 2 * app.gridSize * Math.sign(this.dy) *
                    Math.ceil(CircuitElm.abs(this.dy) / (2 * app.gridSize));
            if (this.dy !== 0) {
                this.point2.y = this.point1.y + myLen;
                offset = (this.dy > 0) ? this.dx : -this.dx;
                this.point2.x = this.point1.x;
            }
        }
        if (offset === 0)
            offset = this.hasFlag(this.FLAG_FLIP_OFFSET) ? -app.gridSize : app.gridSize;
        this.dn = CircuitElm.distance(this.point1, this.point2);
        const bodyLen = 32;
        this.calcLeads(bodyLen);
        this.position = this.slider!.getValue() * 0.0099 + 0.005;
        const soff = (this.position - 0.5) * bodyLen;
        this.post3     = this.interpPoint(this.point1, this.point2, 0.5, offset);
        this.corner2   = this.interpPoint(this.point1, this.point2, soff / this.dn + 0.5, offset);
        this.arrowPoint = this.interpPoint(this.point1, this.point2, soff / this.dn + 0.5, 8 * CircuitElm.sign(offset));
        this.midpoint   = this.interpPoint(this.point1, this.point2, soff / this.dn + 0.5);
        this.arrow1 = new Point();
        this.arrow2 = new Point();
        const clen = CircuitElm.abs(offset) - 8;
        this.interpPoint2(this.corner2, this.arrowPoint, this.arrow1, this.arrow2, (clen - 8) / clen, 8);
        this.ps3 = new Point();
        this.ps4 = new Point();
    }

    draw(g: Graphics): void {
        const segments = 16;
        const hs = this.showEuroResistors() ? 6 : 8;
        const v1 = this.nodes[0].v;
        const v2 = this.nodes[1].v;
        const v3 = this.nodes[2].v;
        this.setBbox(this.point1, this.point2, hs);
        this.adjustBbox(this.post3, this.post3);
        this.draw2Leads(g);
        this.setPowerColor(g, true);
        const segf = 1.0 / segments;
        const divide = Math.round(segments * this.position);
        if (!this.showEuroResistors()) {
            let ox = 0;
            for (let i = 0; i !== segments; i++) {
                let nx = 0;
                switch (i & 3) {
                case 0: nx = 1; break;
                case 2: nx = -1; break;
                default: nx = 0; break;
                }
                const v = i < divide
                    ? v1 + (v3 - v1) * i / divide
                    : v3 + (v2 - v3) * (i - divide) / (segments - divide);
                this.setVoltageColor(g, v);
                this.interpPoint(this.lead1!, this.lead2!, CircuitElm.ps1, i * segf, hs * ox);
                this.interpPoint(this.lead1!, this.lead2!, CircuitElm.ps2, (i + 1) * segf, hs * nx);
                CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
                ox = nx;
            }
        } else {
            this.setVoltageColor(g, v1);
            this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, 0, hs);
            CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
            for (let i = 0; i !== segments; i++) {
                const v = i < divide
                    ? v1 + (v3 - v1) * i / divide
                    : v3 + (v2 - v3) * (i - divide) / (segments - divide);
                this.setVoltageColor(g, v);
                this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, i * segf, hs);
                this.interpPoint2(this.lead1!, this.lead2!, this.ps3, this.ps4, (i + 1) * segf, hs);
                CircuitElm.drawThickLine(g, CircuitElm.ps1, this.ps3);
                CircuitElm.drawThickLine(g, CircuitElm.ps2, this.ps4);
            }
            this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, 1, hs);
            CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
        }
        this.setVoltageColor(g, v3);
        CircuitElm.drawThickLine(g, this.post3, this.corner2);
        CircuitElm.drawThickLine(g, this.corner2, this.arrowPoint);
        CircuitElm.drawThickLine(g, this.arrow1, this.arrowPoint);
        CircuitElm.drawThickLine(g, this.arrow2, this.arrowPoint);
        this.curcount1 = this.updateDotCountImpl(this.current1, this.curcount1);
        this.curcount2 = this.updateDotCountImpl(this.current2, this.curcount2);
        this.curcount3 = this.updateDotCountImpl(this.current3, this.curcount3);
        if (!this.isCreating()) {
            this.drawDots(g, this.point1, this.midpoint, this.curcount1);
            this.drawDots(g, this.point2, this.midpoint, this.curcount2);
            this.drawDots(g, this.post3, this.corner2, this.curcount3);
            this.drawDots(g, this.corner2, this.midpoint,
                this.addCurCount(this.curcount3, CircuitElm.distance(this.post3, this.corner2)));
        }
        this.drawPosts(g);

        if (this.showValues() && this.resistance1 > 0 && (this.flags & this.FLAG_SHOW_VALUES) !== 0) {
            const reverseY = (this.post3.x < this.lead1!.x && this.lead1!.x === this.lead2!.x);
            const reverseX = (this.post3.y < this.lead1!.y && this.lead1!.x !== this.lead2!.x);
            const rev = (this.lead1!.x === this.lead2!.x && this.lead1!.y < this.lead2!.y) ||
                        (this.lead1!.y === this.lead2!.y && this.lead1!.x > this.lead2!.x);
            const s1 = CircuitElm.getShortUnitText(rev ? this.resistance2 : this.resistance1, "");
            const s2 = CircuitElm.getShortUnitText(rev ? this.resistance1 : this.resistance2, "");
            g.setFont(CircuitElm.unitsFont);
            g.setColor(CircuitElm.whiteColor);
            const ya = g.currentFontSize / 2;
            let w = g.measureWidth(s1);
            if (this.lead1!.x === this.lead2!.x)
                g.drawString(s1, !reverseY ? this.arrowPoint.x + 2 : this.arrowPoint.x - 2 - w, Math.max(this.arrow1.y, this.arrow2.y) + 5 + ya);
            else
                g.drawString(s1, Math.min(this.arrow1.x, this.arrow2.x) - 2 - w, !reverseX ? this.arrowPoint.y + 4 + ya : this.arrowPoint.y - 4);
            w = g.measureWidth(s2);
            if (this.lead1!.x === this.lead2!.x)
                g.drawString(s2, !reverseY ? this.arrowPoint.x + 2 : this.arrowPoint.x - 2 - w, Math.min(this.arrow1.y, this.arrow2.y) - 3);
            else
                g.drawString(s2, Math.max(this.arrow1.x, this.arrow2.x) + 2, !reverseX ? this.arrowPoint.y + 4 + ya : this.arrowPoint.y - 4);
        }
    }

    reset(): void {
        this.curcount1 = this.curcount2 = this.curcount3 = 0;
        super.reset();
    }

    calculateCurrent(): void {
        if (this.resistance1 === 0) return;
        this.current1 = (this.nodes[0].v - this.nodes[2].v) / this.resistance1;
        this.current2 = (this.nodes[1].v - this.nodes[2].v) / this.resistance2;
        this.current3 = -this.current1 - this.current2;
    }

    getCurrentIntoNode(n: number): number {
        if (n === 0) return -this.current1;
        if (n === 1) return -this.current2;
        return -this.current3;
    }

    stamp(): void {
        const sim = SimulationManager.theSim;
        this.resistance1 = this.maxResistance * this.position;
        this.resistance2 = this.maxResistance * (1 - this.position);
        sim.stampResistor(this.nodes[0], this.nodes[2], this.resistance1);
        sim.stampResistor(this.nodes[2], this.nodes[1], this.resistance2);
    }

    getInfo(arr: string[]): void {
        arr[0] = "potentiometer";
        arr[1] = "Vd = " + CircuitElm.getVoltageDText(this.getVoltageDiff());
        arr[2] = "R1 = " + CircuitElm.getUnitText(this.resistance1, Locale.ohmString);
        arr[3] = "R2 = " + CircuitElm.getUnitText(this.resistance2, Locale.ohmString);
        arr[4] = "I1 = " + CircuitElm.getCurrentDText(this.current1);
        arr[5] = "I2 = " + CircuitElm.getCurrentDText(this.current2);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Resistance (ohms)", this.maxResistance, 0, 0);
        if (n === 1) {
            const ei = new EditInfo("Slider Text", 0, -1, -1);
            ei.text = this.sliderText;
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Values", (this.flags & this.FLAG_SHOW_VALUES) !== 0);
            return ei;
        }
        if (n === 3) return new EditInfo("Group Number (for linking)", this.link, -1, -1);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.maxResistance = ei.value;
        if (n === 1) {
            this.sliderText = ei.textf!.value;
            if (this.labelEl != null) this.labelEl.textContent = this.sliderText;
            CircuitElm.app.setiFrameHeight();
        }
        if (n === 2) this.flags = ei.changeFlag(this.flags, this.FLAG_SHOW_VALUES);
        if (n === 3) {
            this.setLink(Math.round(ei.value));
            this.slider?.setValue(this.calcSliderValue());
        }
    }

    setMouseElm(v: boolean): void {
        super.setMouseElm(v);
        this.slider?.draw();
    }

    flipX(c2: number, count: number): void {
        this.flags ^= this.FLAG_FLIP_OFFSET;
        super.flipX(c2, count);
    }

    flipY(c2: number, count: number): void {
        this.flags ^= this.FLAG_FLIP_OFFSET;
        super.flipY(c2, count);
    }

    flipXY(xmy: number, count: number): void {
        if (CircuitElm.abs(this.dx) === CircuitElm.abs(this.dy))
            this.flags ^= this.FLAG_FLIP;
        this.flags ^= this.FLAG_FLIP_OFFSET;
        super.flipXY(xmy, count);
    }
}
