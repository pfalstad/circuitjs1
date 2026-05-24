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
import { Rectangle } from "./Rectangle";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";
import { WireRouter } from "./WireRouter";

// SPST switch
export class SwitchElm extends CircuitElm {
    momentary: boolean;
    // position 0 == closed, position 1 == open
    position: number;
    posCount: number;
    static readonly FLAG_IEC = 2;
    static readonly FLAG_LABEL = 4;
    label: string | null;
    keyShortcut: string | null;

    constructor(xx: number, yy: number);
    constructor(xx: number, yy: number, mm: boolean);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrMm?: number | boolean, yb?: number, f?: number, st?: StringTokenizer) {
        if (yb === undefined) {
            super(xa, ya);
            if (typeof xbOrMm === 'boolean') {
                const mm = xbOrMm;
                this.position = mm ? 1 : 0;
                this.momentary = mm;
            } else {
                this.momentary = false;
                this.position = 0;
            }
            this.posCount = 2;
            this.label = null;
            this.keyShortcut = null;
        } else {
            super(xa, ya, xbOrMm as number, yb, f!);
            const str = st!.nextToken();
            if (str === 'true')
                this.position = 1;
            else if (str === 'false')
                this.position = 0;
            else
                this.position = parseInt(str);
            this.momentary = st!.nextToken() === 'true';
            this.posCount = 2;
            this.label = null;
            if ((this.flags & SwitchElm.FLAG_LABEL) !== 0)
                this.label = st!.nextToken();
            this.keyShortcut = null;
        }
    }

    getDumpType(): number { return 's'.charCodeAt(0); }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.position !== 0)
            XMLSerializer.dumpAttr(elem, "p", this.position);
        if (this.momentary)
            XMLSerializer.dumpAttr(elem, "mm", this.momentary);
        if (this.label !== null)
            XMLSerializer.dumpAttr(elem, "lab", this.label);
        if (this.keyShortcut !== null)
            XMLSerializer.dumpAttr(elem, "key", this.keyShortcut);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.position = xml.parseIntAttr("p", this.position);
        this.momentary = xml.parseBooleanAttr("mm", this.momentary);
        this.label = xml.parseStringAttr("lab", this.label);
        this.keyShortcut = xml.parseStringAttr("key", this.keyShortcut);
    }

    ps: Point = new Point();
    ps2: Point = new Point();
    extraPoints: Point[] = [];

    readonly openhs = 16;

    setPoints(): void {
        super.setPoints();
        this.calcLeads(32);
        this.ps  = new Point();
        this.ps2 = new Point();

        if (this.useIECSymbol()) {
            this.extraPoints = this.newPointArray(7);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[0], .5, this.openhs/2);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[1], .5, 24);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[2], .5-.1, 24);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[3], .5+.1, 24);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[4], .5, 19);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[5], .5-.1, 16);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[6], .5, 13);
        }
    }

    draw(g: Graphics): void {
        const hs1 = (this.position === 1) ? 0 : 2;
        const hs2 = (this.position === 1) ? this.openhs : 2;
        this.setBbox(this.point1, this.point2, this.openhs);

        this.draw2Leads(g);

        if (this.position === 0)
            this.doDots(g);

        if (!this.needsHighlight())
            g.setColor(CircuitElm.whiteColor);
        this.interpPoint(this.lead1!, this.lead2!, this.ps,  0, hs1);
        this.interpPoint(this.lead1!, this.lead2!, this.ps2, 1, hs2);

        CircuitElm.drawThickLine(g, this.ps, this.ps2);

        if (this.label !== null) {
            g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
            if (Math.abs(this.dy) > Math.abs(this.dx))
                g.drawString(this.label, this.x+10, (this.y < this.y2 ? this.lead1! : this.lead2!).y-5);
            else {
                g.save();
                g.context.textAlign = "center" as CanvasTextAlign;
                g.drawString(this.label, (this.x+this.x2)/2, (this.x2 > this.x) ? this.y+15 : this.y-15);
                g.restore();
            }
        }

        if (this.useIECSymbol()) {
            g.drawLine(this.extraPoints[2], this.extraPoints[3]);
            g.setLineDash(3, 3);
            this.interpPoint(this.lead1!, this.lead2!, this.extraPoints[0], .5, this.position === 1 ? this.openhs/2 : 2);
            if (this.momentary)
                g.drawLine(this.extraPoints[1], this.extraPoints[0]);
            else {
                g.drawLine(this.extraPoints[6], this.extraPoints[0]);
                g.drawLine(this.extraPoints[1], this.extraPoints[4]);
            }
            g.setLineDash(0, 0);
            if (!this.momentary) {
                g.drawLine(this.extraPoints[4], this.extraPoints[5]);
                g.drawLine(this.extraPoints[6], this.extraPoints[5]);
            }
        }

        this.drawPosts(g);
    }

    isSwitchElm(): boolean { return true; }

    getSwitchRect(): Rectangle {
        this.interpPoint(this.lead1!, this.lead2!, this.ps,  0, this.openhs);
        const x = Math.min(this.lead1!.x, this.lead2!.x, this.ps.x);
        const y = Math.min(this.lead1!.y, this.lead2!.y, this.ps.y);
        const w = Math.abs(this.lead2!.x - this.lead1!.x) + Math.abs(this.ps.x - this.lead1!.x);
        const h = Math.abs(this.lead2!.y - this.lead1!.y) + Math.abs(this.ps.y - this.lead1!.y);
        return new Rectangle(x, y, w, h);
    }

    calculateCurrent(): void {
        if (this.position === 1)
            this.current = 0;
    }

    mouseUp(): void {
        if (this.momentary)
            this.toggle();
    }

    simpleToggle(): void {
        this.position++;
        if (this.position >= this.posCount)
            this.position = 0;
    }

    toggle(): void {
        this.simpleToggle();
        if (this.label !== null) {
            for (let i = 0; i !== CircuitElm.sim.elmList.length; i++) {
                const o = CircuitElm.sim.elmList[i];
                if (o instanceof SwitchElm && o !== this) {
                    const s2 = o as SwitchElm;
                    if (this.label === s2.label)
                        s2.simpleToggle();
                }
            }
        }
    }

    getElmType(): string { return "switch (SPST)"; }

    getInfo(arr: string[]): void {
        arr[0] = this.momentary ? "push switch (SPST)" : "switch (SPST)";
        if (this.position === 1) {
            arr[1] = "open";
            arr[2] = "Vd = " + CircuitElm.getVoltageDText(this.getVoltageDiff());
        } else {
            arr[1] = "closed";
            arr[2] = "V = " + CircuitElm.getVoltageText(this.volts[0]);
            arr[3] = "I = " + CircuitElm.getCurrentDText(this.getCurrent());
        }
    }

    getConnection(n1: number, n2: number): boolean { return this.position === 0; }
    isWireEquivalent(): boolean { return this.position === 0; }
    isRemovableWire(): boolean { return this.position === 0; }
    useIECSymbol(): boolean { return (this.flags & SwitchElm.FLAG_IEC) !== 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Momentary Switch", this.momentary);
            return ei;
        }
        if (n === 1)
            return EditInfo.createCheckbox("IEC Symbol", this.useIECSymbol());
        if (n === 2)
            return new EditInfo("Label (for linking)", this.label === null ? "" : this.label);
        if (n === 3)
            return this.getKeyShortcutEditInfo();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.momentary = ei.checkbox!.getState();
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, SwitchElm.FLAG_IEC);
            this.setPoints();
        }
        if (n === 2) {
            this.label = ei.textf!.getText();
            if (this.label.length === 0) {
                this.label = null;
                this.flags &= ~SwitchElm.FLAG_LABEL;
            } else
                this.flags |= SwitchElm.FLAG_LABEL;
        }
        if (n === 3)
            this.setKeyShortcutEditValue(ei);
    }

    // helper methods for keyboard shortcut edit field, usable by subclasses
    getKeyShortcutEditInfo(): EditInfo {
        return new EditInfo("Keyboard Shortcut", this.keyShortcut === null ? "" : this.keyShortcut);
    }

    setKeyShortcutEditValue(ei: EditInfo): void {
        const s = ei.textf!.getText().trim();
        if (s.length === 0)
            this.keyShortcut = null;
        else
            this.keyShortcut = s.substring(0, 1).toLowerCase();
    }

    addRoutingObstacle(router: WireRouter): void {
        if (this.x === this.x2 || this.y === this.y2) {
            router.addWire(this.x, this.y, this.x2, this.y2);
            const pa = this.interpPoint(this.lead1!, this.lead2!, 0, 0);
            const pb = this.interpPoint(this.lead1!, this.lead2!, 1, this.openhs);
            router.addObstacle(pa.x, pa.y, pb.x, pb.y);
        }
    }

    getShortcut(): number { return 's'.charCodeAt(0); }
}
