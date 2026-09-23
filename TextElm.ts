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

import { GraphicElm } from "./GraphicElm";
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Font } from "./Font";
import { Color } from "./Color";
import { StringTokenizer } from "./StringTokenizer";
import { Locale } from "./Locale";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { CustomLogicModel } from "./CustomLogicModel";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { parseIntStrict } from "./NumberParse";

export class TextElm extends GraphicElm {
    text: string;
    lines: string[];
    size: number;
    color: string | null = null;
    editTextArea: any = null;
//    final int FLAG_CENTER = 1;
    static readonly FLAG_BAR    = 2;
    static readonly FLAG_ESCAPE = 4;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.text = "hello";
            this.lines = [this.text];
            this.size = 24;
        } else {
            super(xa, ya, xb, yb!, f!);
            this.size = parseIntStrict(st!.nextToken());
            this.text = st!.nextToken();
            if ((this.flags & TextElm.FLAG_ESCAPE) === 0) {
                // old-style dump before escape/unescape
                while (st!.hasMoreTokens())
                    this.text += ' ' + st!.nextToken();
                this.text = this.text.replace(/%2[bB]/g, "+");
            } else {
                // new-style dump
                this.text = CustomLogicModel.unescape(this.text);
            }
            this.lines = [];
            this.split();
        }
    }

    split(): void {
        this.lines = [];
        let s = this.text;
        while (true) {
            const i = s.search(/\\n/);
            if (i === -1)
                break;
            this.lines.push(s.substring(0, i));
            s = s.substring(i + 2);
        }
        this.lines.push(s);
    }

    dump(): string {
        this.flags |= TextElm.FLAG_ESCAPE;
        return super.dump() + " " + this.size + " " + CustomLogicModel.escape(this.text);
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "si", this.size);
        CircuitXMLSerializer.dumpAttr(elem, "te", this.text);
        if (this.color != null)
            CircuitXMLSerializer.dumpAttr(elem, "co", this.color);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.size = xml.parseIntAttr("si", this.size);
        this.text = xml.parseStringAttr("te", this.text) ?? this.text;
        this.color = xml.parseStringAttr("co", this.color);
        this.split();
    }

    getDumpType(): number { return 'x'.charCodeAt(0); }

    drag(xx: number, yy: number): void {
        this.x = xx;
        this.y = yy;
        this.x2 = xx + 16;
        this.y2 = yy;
    }

    draw(g: Graphics): void {
        g.save();
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : (this.color != null ? new Color(this.color) : CircuitElm.lightGrayColor));
        const f = new Font("SansSerif", 0, this.size);
        g.setFont(f);
        let maxw = -1;
        for (let i = 0; i !== this.lines.length; i++) {
            const w = g.context.measureText(this.lines[i]).width;
            if (w > maxw)
                maxw = w;
        }
        let cury = this.y;
        this.setBbox(this.x, this.y, this.x, this.y);
        for (let i = 0; i !== this.lines.length; i++) {
            const s = Locale.LS(this.lines[i]);
            const sw = g.context.measureText(s).width;
            g.drawString(s, this.x, cury);
            if ((this.flags & TextElm.FLAG_BAR) !== 0) {
                const by = cury - g.currentFontSize;
                g.drawLine(this.x, by, this.x + sw - 1, by);
            }
            this.adjustBbox(this.x, cury - g.currentFontSize, this.x + sw, cury + 3);
            cury += g.currentFontSize + 3;
        }
        this.x2 = this.boundingBox.x + this.boundingBox.width;
        this.y2 = this.boundingBox.y + this.boundingBox.height;
        g.restore();
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Text", 0, -1, -1);
            ei.textArea = { value: this.text.replace(/\\n/g, "\n") };
            this.editTextArea = ei.textArea;
            return ei;
        }
        if (n === 1)
            return new EditInfo("Size", this.size, 5, 100);
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Draw Bar On Top", (this.flags & TextElm.FLAG_BAR) !== 0);
            return ei;
        }
        if (n === 3)
            return new EditInfo("Color", this.color != null ? this.color : CircuitElm.lightGrayColor.getHexValue()).setIsColor();
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.text = (this.editTextArea.element as HTMLTextAreaElement).value.replace(/\n/g, "\\n");
            this.split();
        }
        if (n === 1)
            this.size = Math.trunc(ei.value);
        if (n === 2) {
            if (ei.checkbox!.getState())
                this.flags |= TextElm.FLAG_BAR;
            else
                this.flags &= ~TextElm.FLAG_BAR;
        }
        if (n === 3) {
            const c = (ei.textf as HTMLInputElement).value;
            this.color = c === CircuitElm.lightGrayColor.getHexValue() ? null : c;
        }
    }

//    isCenteredText(): boolean { return (this.flags & FLAG_CENTER) !== 0; }
    getElmType(): string { return "text"; }
    getInfo(arr: string[]): void { arr[0] = this.text; }
    getShortcut(): number { return 't'.charCodeAt(0); }
    canViewInScope(): boolean { return false; }
}
