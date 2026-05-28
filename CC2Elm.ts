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

import { ChipElm, Pin } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";

export class CC2Elm extends ChipElm {
    gain: number;

    constructor(xx: number, yy: number, g?: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrG?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xbOrG!, yb!, f!, st);
            this.gain = parseFloat(st.nextToken());
        } else {
            super(xa, ya);
            this.gain = (xbOrG !== undefined) ? xbOrG : 1;
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ga", this.gain);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.gain = xml.parseDoubleAttr("ga", this.gain);
    }

    getChipName(): string { return "CC2"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 3;
        this.pins = new Array(3);
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "X");
        this.pins[0].output = true;
        this.pins[1] = new Pin(this, 2, ChipElm.SIDE_W, "Y");
        this.pins[2] = new Pin(this, 1, ChipElm.SIDE_E, "Z");
    }

    getElmType(): string { return "CCII"; }

    getInfo(arr: string[]): void {
        arr[0] = (this.gain === 1) ? "CCII+~" : "CCII-~"; // ~ is for localization
        arr[1] = "X,Y = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "Z = " + CircuitElm.getVoltageText(this.nodes[2].v);
        arr[3] = "I = " + CircuitElm.getCurrentText(this.pins[0].current);
    }

    isDigitalChip(): boolean { return false; }

    stamp(): void {
        // X voltage = Y voltage
        CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[0], this.pins[0].voltSource!);
        CircuitElm.sim.stampVCVS(CircuitNode.ground, this.nodes[1], 1, this.pins[0].voltSource!);
        // Z current = gain * X current
        CircuitElm.sim.stampCCCS(CircuitNode.ground, this.nodes[2], this.pins[0].voltSource!, this.gain);
    }

    calculateCurrent(): void {
        super.calculateCurrent();
        this.pins[2].current = this.pins[0].current * this.gain;
    }

    draw(g: Graphics): void {
        this.drawChip(g);
    }

    getPostCount(): number { return 3; }
    getVoltageSourceCount(): number { return 1; }
    getDumpType(): number { return 179; }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }
}
