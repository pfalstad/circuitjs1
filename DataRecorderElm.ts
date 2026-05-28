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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { StringTokenizer } from "./StringTokenizer";

export class DataRecorderElm extends CircuitElm {
    dataCount: number;
    dataPtr: number = 0;
    lastTimeStepCount: number = 0;
    data: number[];
    dataFull: boolean = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.setDataCount(parseInt(st.nextToken()));
        } else {
            this.setDataCount(10240);
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "dc", this.dataCount);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.setDataCount(xml.parseIntAttr("dc", this.dataCount));
    }

    getDumpType(): number { return 210; }
    getPostCount(): number { return 1; }

    reset(): void {
        this.dataPtr = 0;
        this.dataFull = false;
        this.lastTimeStepCount = 0;
    }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 8 / this.dn);
    }

    draw(g: Graphics): void {
        g.save();
        const selected = this.needsHighlight();
        const f = new Font("SansSerif", selected ? Font.BOLD : 0, 14);
        g.setFont(f);
        g.setColor(selected ? CircuitElm.selectColor : CircuitElm.whiteColor);
        this.setBbox(this.point1, this.lead1!, 0);
        const s = Locale.LS("export");
        this.drawLabeledNode(g, s, this.point1, this.lead1!);
        this.setVoltageColor(g, this.nodes[0].v);
        if (selected)
            g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawPosts(g);
        g.restore();
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = "data export";
        arr[1] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = (this.dataFull ? this.dataCount : this.dataPtr) + "/" + this.dataCount;
    }

    stepFinished(): void {
        if (this.lastTimeStepCount === CircuitElm.sim.timeStepCount)
            return;
        this.data[this.dataPtr++] = this.nodes[0].v;
        this.lastTimeStepCount = CircuitElm.sim.timeStepCount;
        if (this.dataPtr >= this.dataCount) {
            this.dataPtr = 0;
            this.dataFull = true;
        }
    }

    setDataCount(ct: number): void {
        this.dataCount = ct;
        this.data = new Array(ct).fill(0);
        this.dataPtr = 0;
        this.dataFull = false;
    }

    static getBlobUrl(data: string): string {
        const blob = new Blob([data], { type: 'text/plain' });
        const win = window as any;
        if (win.recorderBlob)
            URL.revokeObjectURL(win.recorderBlob);
        const url = URL.createObjectURL(blob);
        win.recorderBlob = url;
        return url;
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            return new EditInfo("# of Data Points", this.dataCount, -1, -1).setDimensionless().setPositive();
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            let dataStr = "# time step = " + CircuitElm.sim.timeStep + " sec\n";
            if (this.dataFull) {
                for (let i = 0; i !== this.dataCount; i++)
                    dataStr += this.data[(i + this.dataPtr) % this.dataCount] + "\n";
            } else {
                for (let i = 0; i !== this.dataPtr; i++)
                    dataStr += this.data[i] + "\n";
            }
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const fname = "data-" + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
                "-" + pad(now.getHours()) + pad(now.getMinutes()) + ".circuitjs.txt";
            const url = DataRecorderElm.getBlobUrl(dataStr);
            const a = document.createElement("a");
            a.textContent = fname;
            a.href = url;
            a.setAttribute("download", fname);
            ei.widget = a;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0)
            this.setDataCount(Math.trunc(ei.value));
    }
}
