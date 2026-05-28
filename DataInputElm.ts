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
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { RailElm } from "./RailElm";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageElm } from "./VoltageElm";

class DataFileEntry {
    fileName: string = "";
    data: number[] = [];
}

export class DataInputElm extends RailElm {
    data: number[] | null = null;
    sampleLength: number = 1e-3;
    scaleFactor: number = 1;
    timeOffset: number = 0;
    fileNum: number = 0;
    fileName: string | null = null;
    readonly FLAG_REPEAT = 1 << 8;

    static fileNumCounter: number = 1;
    static dataFileMap: Map<number, DataFileEntry> = new Map();

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xb!, yb!, f!, st);
            this.waveform = VoltageElm.WF_AC;
            this.sampleLength = parseFloat(st.nextToken());
            this.scaleFactor = parseFloat(st.nextToken());
            this.fileNum = parseInt(st.nextToken());
            const ent = DataInputElm.dataFileMap.get(this.fileNum);
            if (ent) { this.fileName = ent.fileName; this.data = ent.data; }
        } else {
            super(xa, ya, VoltageElm.WF_AC);
            this.scaleFactor = 1;
            this.sampleLength = 1e-3;
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "sl", this.sampleLength);
        CircuitXMLSerializer.dumpAttr(elem, "sf", this.scaleFactor);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        if (this.data !== null) {
            if (this.fileNum === 0)
                this.fileNum = DataInputElm.fileNumCounter++;
            const ent = new DataFileEntry();
            ent.fileName = this.fileName ?? "";
            ent.data = this.data;
            DataInputElm.dataFileMap.set(this.fileNum, ent);
            CircuitXMLSerializer.dumpAttr(elem, "fn", this.fileNum);
        }
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.sampleLength = xml.parseDoubleAttr("sl", this.sampleLength);
        this.scaleFactor = xml.parseDoubleAttr("sf", this.scaleFactor);
        this.fileNum = xml.parseIntAttr("fn", 0);
        const ent = DataInputElm.dataFileMap.get(this.fileNum);
        if (ent) { this.fileName = ent.fileName; this.data = ent.data; }
    }

    reset(): void { this.timeOffset = 0; }

    drawRail(g: Graphics): void {
        this.drawRailText(g, this.fileName === null ? Locale.LS("No file") : this.fileName);
    }

    getRailText(): string {
        return this.fileName === null ? Locale.LS("No file") : this.fileName;
    }

    doesRepeat(): boolean { return (this.flags & this.FLAG_REPEAT) !== 0; }

    getVoltage(): number {
        if (this.data === null) return 0;
        let ptr = Math.trunc(this.timeOffset / this.sampleLength);
        if (ptr >= this.data.length) {
            if (this.doesRepeat()) { ptr = 0; this.timeOffset = 0; }
            else ptr = this.data.length - 1;
        }
        return this.data[ptr] * this.scaleFactor;
    }

    stepFinished(): void { this.timeOffset += CircuitElm.sim.timeStep; }

    getDumpType(): number { return 424; }
    getShortcut(): number { return 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            const input = document.createElement("input");
            input.type = "file";
            input.addEventListener("change", () => {
                const file = input.files?.[0];
                if (file) {
                    this.fileName = file.name.replace(/\.[^.]*$/, "");
                    DataInputElm.fetchLoadFileData(this, file);
                }
            });
            ei.widget = input;
            return ei;
        }
        if (n === 1) return new EditInfo("Scale Factor", this.scaleFactor);
        if (n === 2) return new EditInfo("Sample Length (s)", this.sampleLength);
        if (n === 3) return EditInfo.createCheckbox("Repeat", this.doesRepeat());
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 1) this.scaleFactor = ei.value;
        if (n === 2) this.sampleLength = ei.value;
        if (n === 3) this.flags = ei.changeFlag(this.flags, this.FLAG_REPEAT);
    }

    static fetchLoadFileData(elm: DataInputElm, file: File): void {
        const reader = new FileReader();
        reader.onload = (e) => {
            elm.doLoadCallback(e.target!.result as string, file.name);
        };
        reader.readAsText(file);
    }

    doLoadCallback(s: string, name: string): void {
        this.fileName = name.replace(/\.[^.]*$/, "");
        const arr = s.split(/\r?\n/);
        this.data = [];
        for (const line of arr) {
            if (line.length === 0 || line[0] === '#') continue;
            try {
                this.data.push(parseFloat(line));
            } catch (e) {}
        }
    }

    getInfo(arr: string[]): void {
        arr[0] = "data input";
        if (this.data === null) { arr[1] = "no file loaded"; return; }
        arr[1] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "pos = " + CircuitElm.getUnitText(this.timeOffset, "s");
        arr[3] = "dur = " + CircuitElm.getUnitText(this.data.length * this.sampleLength, "s");
    }

    static clearCache(): void { DataInputElm.dataFileMap.clear(); }
}
