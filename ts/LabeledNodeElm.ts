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
import { VoltageSource } from "./VoltageSource";
import { Point } from "./Point";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";
import { Locale } from "./Locale";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { CustomLogicModel } from "./CustomLogicModel";
import { SimulationManager } from "./SimulationManager";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { HookRegistry } from "./HookRegistry";

class LabelEntry {
    point!: Point;
    node: CircuitNode | null = null;
}

export class LabeledNodeElm extends CircuitElm {
    static readonly FLAG_ESCAPE      = 4;
    static readonly FLAG_INTERNAL    = 1;
    static readonly FLAG_ROTATE_TEXT = 8;

    text: string = "label";
    busWidth: number = 1;
    currents: number[] | null = null;

    static labelList: Map<string, LabelEntry> = new Map();

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.text = "label";
        } else {
            super(xa, ya, xb, yb!, f!);
            this.text = st!.nextToken();
            if ((this.flags & LabeledNodeElm.FLAG_ESCAPE) === 0) {
                // old-style dump before escape/unescape
                while (st!.hasMoreTokens())
                    this.text += ' ' + st!.nextToken();
            } else {
                // new-style dump
                this.text = CustomLogicModel.unescape(this.text);
            }
        }
    }

    dump(): string {
        this.flags |= LabeledNodeElm.FLAG_ESCAPE;
        return super.dump() + " " + CustomLogicModel.escape(this.text);
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "te", this.text);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.text = xml.parseStringAttr("te", this.text) ?? this.text;
    }

    isInternal(): boolean { return (this.flags & LabeledNodeElm.FLAG_INTERNAL) !== 0; }
    isRotateText(): boolean { return (this.flags & LabeledNodeElm.FLAG_ROTATE_TEXT) !== 0; }

    static resetNodeList(): void {
        LabeledNodeElm.labelList = new Map<string, LabelEntry>();
    }

    readonly circleSize: number = 17;

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - this.circleSize / this.dn);
    }

    // get post we're connected to
    getConnectedPost(n: number = 0): Point {
        const key = (this.busWidth > 1) ? this.text + ":" + n : this.text;
        const myPost = this.getPost(n);
        const le = LabeledNodeElm.labelList.get(key);
        if (le != null)
            return le.point;

        // this is the first time calcWireClosure() encountered this label.  so save our post and
        // return null for now, but return it the next time we see this label so that all nodes
        // with the same label are connected
        const newLe = new LabelEntry();
        newLe.point = myPost!;
        LabeledNodeElm.labelList.set(key, newLe);
        return null!;
    }

    setNode(p: number, n: CircuitNode): void {
        super.setNode(p, n);

        // save node so we can return it in getByName()
        const key = (this.busWidth > 1) ? this.text + ":" + p : this.text;
        const le = LabeledNodeElm.labelList.get(key);
        if (le != null) // should never happen
            le.node = n;
    }

    getDumpType(): number { return 207; }
    getXmlDumpType(): string { return "ln"; }
    getPostCount(): number { return this.busWidth; }
    getPostWidth(n: number): number { return this.busWidth; }
    getBusWidth(): number { return this.busWidth; }

    getPost(n: number): Point {
        if (this.busWidth === 1)
            return this.point1;
        return new Point(this.point1.x, this.point1.y, n);
    }

    getWireSegments(list: InstanceType<typeof SimulationManager.WireSegment>[]): void {
        for (let b = 0; b < this.busWidth; b++) {
            const ep0 = SimulationManager.pointKey(this.getPost(b));
            const ep1 = (this.busWidth > 1) ? "label:" + this.text + ":" + b : "label:" + this.text;
            list.push(new SimulationManager.WireSegment(this, b, ep0, ep1));
        }
    }

    // this is basically a wire, since it just connects two or more nodes together
    isWireEquivalent(): boolean { return true; }
    isRemovableWire(): boolean { return true; }
    getConnection(n1: number, n2: number): boolean { return n1 === n2; }

    static getByName(n: string): CircuitNode | null {
        if (LabeledNodeElm.labelList == null)
            return null;
        const le = LabeledNodeElm.labelList.get(n);
        if (le == null)
            return null;
        return le.node;
    }

    // find label text for the given node, if any (used to show label in getInfo() for wires)
    static getLabelForNode(cn: CircuitNode | null): string | null {
        if (LabeledNodeElm.labelList == null || cn == null)
            return null;
        for (const [key, le] of LabeledNodeElm.labelList) {
            if (le.node === cn) {
                const ci = key.lastIndexOf(':');
                return (ci < 0) ? key : key.substring(0, ci);
            }
        }
        return null;
    }

    drawLabeledNode(g: Graphics, str: string, pt1: Point, pt2: Point): void {
        if (this.isRotateText() && pt1.x === pt2.x) {
            this.drawRotatedLabeledNode(g, str, pt1, pt2);
            return;
        }
        super.drawLabeledNode(g, str, pt1, pt2);
    }

    drawRotatedLabeledNode(g: Graphics, str: string, pt1: Point, pt2: Point): void {
        let lineOver = false;
        if (str.startsWith("/")) {
            lineOver = true;
            str = str.substring(1);
        }
        const w = g.context.measureText(str).width;
        const h = g.currentFontSize;
        g.save();
        g.context.textBaseline = "middle";
        const dir = CircuitElm.sign(pt2.y - pt1.y);
        // offset text further from the wire to avoid overlap with long names
        const offset = h + Math.max(0, w / 2 - h);
        const tx = pt2.x;
        const ty = pt2.y + dir * offset;
        g.context.translate(tx, ty);
        g.context.rotate(-Math.PI / 2);
        g.context.textAlign = "center";
        g.drawString(str, 0, 0);
        // bbox for rotated text: width becomes height and vice versa
        this.adjustBbox(tx - h / 2, ty - w / 2, tx + h / 2, ty + w / 2);
        g.restore();
        if (lineOver) {
            const xa = -h / 2 - 1;
            g.save();
            g.context.translate(tx, ty);
            g.context.rotate(-Math.PI / 2);
            g.drawLine(-w / 2, xa, w / 2, xa);
            g.restore();
        }
    }

    draw(g: Graphics): void {
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!, (this.busWidth > 1) ? 5 : 3);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.whiteColor);
        this.setPowerColor(g, false);
        this.interpPoint(this.point1, this.point2, CircuitElm.ps2, 1 + 11 / this.dn);
        this.setBbox(this.point1, CircuitElm.ps2, this.circleSize);
        this.drawLabeledNode(g, this.text, this.point1, this.lead1!);

        if (this.currents != null) {
            this.current = 0;
            for (let i = 0; i < this.currents.length; i++)
                this.current += this.currents[i];
        }
        this.updateDotCount();
        this.drawDots(g, this.point1, this.lead1!, this.curcount);
        this.drawPosts(g);
    }

    getCurrentIntoNode(n: number): number {
        if (this.currents != null)
            return -this.currents[n];
        return -this.current;
    }

    setCurrent(vs: VoltageSource, c: number): void { this.current = c; }

    setWireCurrent(bit: number, c: number): void {
        if (this.currents != null)
            this.currents[bit] = c;
        else
            this.current = c;
    }

    getShortcut(): number { return 'b'.charCodeAt(0); }
    getVoltageDiff(): number { return this.nodes[0].v; }
    getElmType(): string { return "Labeled Node"; }

    getBusValue(): number {
        let value = 0;
        for (let i = 0; i < this.busWidth; i++)
            if (this.nodes[i].v > 2.5)
                value |= 1 << i;
        return value;
    }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS(this.text) + " (" + Locale.LS("Labeled Node") + ")";
        if (this.busWidth > 1) {
            const value = this.getBusValue();
            arr[1] = "value = " + value;
            arr[2] = "hex = 0x" + value.toString(16).toUpperCase();
        } else {
            arr[1] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
            arr[2] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        }
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Text", 0, -1, -1);
            ei.text = this.text;
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Internal Node", this.isInternal());
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Rotate Text When Vertical", this.isRotateText());
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.text = ei.textf!.value;
        if (n === 1)
            this.flags = ei.changeFlag(this.flags, LabeledNodeElm.FLAG_INTERNAL);
        if (n === 2)
            this.flags = ei.changeFlag(this.flags, LabeledNodeElm.FLAG_ROTATE_TEXT);
    }

    getScopeText(v: number): string {
        return this.text;
    }

    getName(): string { return this.text; }
    isLabeledNodeElm(): boolean { return true; }

    addJSMethods(): void {
        super.addJSMethods();
        const p = this._jsProxy!;
        p['getLabelName'] = () => this.getName();
    }
}

HookRegistry.resetLabeledNodeList = () => LabeledNodeElm.resetNodeList();
HookRegistry.getLabeledNode = (name: string) => LabeledNodeElm.getByName(name);
