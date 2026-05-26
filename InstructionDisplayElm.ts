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
import { WireRouter } from "./WireRouter";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { ExprParser, ExprState } from "./Expr";
import { CirSim } from "./CirSim";

class LookupEntry {
    lo: number;
    hi: number;
    template: string;

    constructor(lo: number, hi: number, template: string) {
        this.lo = lo;
        this.hi = hi;
        this.template = template;
    }

    getText(value: number): string {
        let result = "";
        let pos = 0;
        while (pos < this.template.length) {
            const open = this.template.indexOf('{', pos);
            if (open < 0) {
                result += this.template.substring(pos);
                break;
            }
            result += this.template.substring(pos, open);
            const close = this.template.indexOf('}', open);
            if (close < 0) {
                result += this.template.substring(open);
                break;
            }
            const exprStr = this.template.substring(open + 1, close);
            try {
                const ep = new ExprParser(exprStr);
                const expr = ep.parseExpression();
                if (ep.gotError() === null) {
                    const es = new ExprState(1);
                    es.values[0] = value; // a = input value
                    const res = expr!.eval(es);
                    const intRes = Math.floor(res);
                    if (res === intRes)
                        result += intRes;
                    else
                        result += res;
                } else {
                    CirSim.console("ep.got error: " + exprStr);
                    result += "{" + exprStr + "}";
                }
            } catch (e) {
                result += "{" + exprStr + "}";
            }
            pos = close + 1;
        }
        return result;
    }
}

export class InstructionDisplayElm extends CircuitElm {
    busWidth: number = 4;
    threshold: number = 2.5;
    lookupText: string = "";
    entries: LookupEntry[] = [];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.lookupText = "0=text0\n1=text1\n0x2-0xF=other ({a})\n";
            this.parseEntries(null);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
        }
    }

    getXmlDumpType(): string { return "ins"; }
    getPostCount(): number { return this.busWidth; }
    getPostWidth(n: number): number { return this.busWidth; }
    getNumHandles(): number { return 1; }
    getVoltageSourceCount(): number { return 0; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "bw", this.busWidth);
        if (this.threshold !== 2.5)
            CircuitXMLSerializer.dumpAttr(elem, "th", this.threshold);
        if (this.lookupText != null && this.lookupText.length > 0)
            elem.appendChild(doc.createTextNode(this.lookupText));
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.busWidth = xml.parseIntAttr("bw", this.busWidth);
        this.threshold = xml.parseDoubleAttr("th", this.threshold);
        this.lookupText = "";
        try {
            const s = xml.parseContents();
            CirSim.console("lookupText: " + s);
            this.lookupText = s ?? "";
        } catch (e) {
            CirSim.console("exception in undump " + e);
        }
        if (this.lookupText === null)
            this.lookupText = "";
        this.parseEntries(null);
    }

    getPost(n: number): Point {
        return new Point(this.x, this.y, n);
    }

    setPoints(): void {
        super.setPoints();
        this.lead1 = new Point();
    }

    readInputValue(): number {
        let value = 0;
        for (let i = 0; i !== this.busWidth; i++)
            if (this.nodes[i].v > this.threshold)
                value |= 1 << i;
        return value;
    }

    getDisplayText(): string {
        const value = this.readInputValue();
        for (let i = 0; i !== this.entries.length; i++) {
            const entry = this.entries[i];
            if (value >= entry.lo && value <= entry.hi)
                return entry.getText(value);
        }
        return String(value);
    }

    draw(g: Graphics): void {
        g.save();
        const selected = this.needsHighlight();
        const fontSize = 14;
        g.context.font = (selected ? "bold " : "") + fontSize + "px SansSerif";
        g.setColor(selected ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        const s = this.getDisplayText();
        this.interpPoint(this.point1, this.point2, this.lead1,
            1 - (Math.floor(g.context.measureText(s).width) / 2 + 8) / this.dn);
        this.setBbox(this.point1, this.lead1, 0);
        this.drawCenteredText(g, s, this.x2, this.y2, true);
        this.setVoltageColor(g, this.nodes[0].v);
        if (selected)
            g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!, 5);
        this.drawPosts(g);
        g.restore();
    }

    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.x2, this.y2);
        router.addObstacle(this.x2 - 10, this.y2 - 10, this.x2 + 10, this.y2 + 10);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = "instruction display";
        const value = this.readInputValue();
        arr[1] = "in = " + value + " (0x" + value.toString(16).toUpperCase() + ")";
        arr[2] = "text = " + this.getDisplayText();
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Bus Width", this.busWidth, 2, 32).setDimensionless();
        if (n === 1)
            return new EditInfo("Threshold Voltage", this.threshold);
        if (n === 2) {
            const ei = new EditInfo("Lookup Table", 0);
            ei.textArea = { value: this.lookupText, element: null };
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 1 && ei.value <= 32) {
                this.busWidth = Math.floor(ei.value);
                this.allocNodes();
            } else
                ei.setError("must be between 1 and 32");
        }
        if (n === 1)
            this.threshold = ei.value;
        if (n === 2) {
            this.lookupText = ei.textArea.element ? ei.textArea.element.value : ei.textArea.value;
            this.parseEntries(ei);
        }
    }

    parseEntries(ei: EditInfo | null): void {
        this.entries = [];
        if (this.lookupText === null || this.lookupText.length === 0)
            return;
        const lines = this.lookupText.split("\n");
        for (let i = 0; i !== lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0)
                continue;
            const eq = line.indexOf('=');
            if (eq < 0) {
                if (ei !== null)
                    ei.setError("missing =: " + line);
                continue;
            }
            const key = line.substring(0, eq).trim();
            const val = line.substring(eq + 1);
            try {
                const dash = this.findDash(key);
                if (dash >= 0) {
                    const lo = this.parseNumber(key.substring(0, dash));
                    const hi = this.parseNumber(key.substring(dash + 1));
                    this.entries.push(new LookupEntry(lo, hi, val));
                } else {
                    const k = this.parseNumber(key);
                    this.entries.push(new LookupEntry(k, k, val));
                }
            } catch (e) {}
        }
    }

    findDash(s: string): number {
        let start = 0;
        if (s.startsWith("0x") || s.startsWith("0X"))
            start = 2;
        else if (s.startsWith("0b") || s.startsWith("0B"))
            start = 2;
        return s.indexOf('-', start);
    }

    parseNumber(s: string): number {
        s = s.trim();
        if (s.startsWith("0x") || s.startsWith("0X"))
            return parseInt(s.substring(2), 16);
        if (s.startsWith("0b") || s.startsWith("0B"))
            return parseInt(s.substring(2), 2);
        return parseInt(s);
    }

    getConnection(n1: number, n2: number): boolean { return false; }
}
