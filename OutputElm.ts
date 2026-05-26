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
import { Font } from "./Font";
import { Choice } from "./Choice";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { WireRouter } from "./WireRouter";
import { Locale } from "./Locale";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class OutputElm extends CircuitElm {
    static readonly FLAG_VALUE = 1;
    static readonly FLAG_FIXED = 2;
    scale: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.scale = CircuitElm.SCALE_AUTO;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.scale = CircuitElm.SCALE_AUTO;
            try {
                this.scale = parseInt(st!.nextToken());
            } catch (e) {}
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "sc", this.scale);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.scale = xml.parseIntAttr("sc", this.scale);
    }

    isOutputElm(): boolean { return true; }
    getDumpType(): number { return 'O'.charCodeAt(0); }
    getPostCount(): number { return 1; }

    setPoints(): void {
        super.setPoints();
        this.lead1 = new Point();
    }

    draw(g: Graphics): void {
        g.save();
        const selected = this.needsHighlight();
        const f = new Font("SansSerif", selected ? Font.BOLD : 0, 14);
        g.setFont(f);
        g.setColor(selected ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        let s = this.showVoltage() ? CircuitElm.getUnitTextWithScale(this.nodes[0].v, "V", this.scale, this.isFixed()) : Locale.LS("out");
//      FontMetrics fm = g.getFontMetrics();
        const role = CircuitElm.app.mouse.scopePlotRoles.get(this);
        if (role != null && role !== "")
            s = role;
        this.interpPoint(this.point1, this.point2, this.lead1!, 1 - (Math.trunc(g.context.measureText(s).width / 2) + 8) / this.dn);
        this.setBbox(this.point1, this.lead1!, 0);
        this.drawCenteredText(g, s, this.x2, this.y2, true);
        this.setVoltageColor(g, this.nodes[0].v);
        if (selected)
            g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawPosts(g);
        g.restore();
    }

    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.x2, this.y2);
        router.addObstacle(this.x2 - 10, this.y2 - 10, this.x2 + 10, this.y2 + 10);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = "output";
        arr[1] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return EditInfo.createCheckbox("Show Voltage", this.showVoltage());
        if (!this.showVoltage())
            return null;
        if (n === 1) {
            const ei = new EditInfo("Scale", 0);
            ei.choice = new Choice();
            ei.choice.add("Auto");
            ei.choice.add("V");
            ei.choice.add("mV");
            ei.choice.add(Locale.muString + "V");
            ei.choice.select(this.scale);
            return ei;
        }
        if (this.scale === CircuitElm.SCALE_AUTO)
            return null;
        if (n === 2)
            return EditInfo.createCheckbox("Fixed Precision", this.isFixed());
        return null;
    }

    isFixed(): boolean { return (this.flags & OutputElm.FLAG_FIXED) !== 0; }
    showVoltage(): boolean { return (this.flags & OutputElm.FLAG_VALUE) !== 0; }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.flags = ei.changeFlag(this.flags, OutputElm.FLAG_VALUE);
            ei.newDialog = true;
        }
        if (n === 1) {
            this.scale = ei.choice!.getSelectedIndex();
            ei.newDialog = true;
        }
        if (n === 2)
            this.flags = ei.changeFlag(this.flags, OutputElm.FLAG_FIXED);
    }

//  void drawHandles(Graphics g, Color c) {
//      g.setColor(c);
//      g.fillRect(x-3, y-3, 7, 7);
//  }
}
