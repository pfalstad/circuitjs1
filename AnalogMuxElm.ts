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
import { EditInfo } from "./EditInfo";
import { StringTokenizer } from "./StringTokenizer";

export class AnalogMuxElm extends ChipElm {
    static readonly FLAG_PULLDOWN = 2;

    selectBitCount: number = 2;
    inputCount: number = 0;
    outputPin: number = 0;
    r_on: number = 20;
    r_off: number = 1e10;
    threshold: number = 2.5;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            try {
                this.selectBitCount = parseInt(st.nextToken());
                this.r_on = parseFloat(st.nextToken());
                this.r_off = parseFloat(st.nextToken());
                this.threshold = parseFloat(st.nextToken());
            } catch (e) {}
        } else {
            this.flags |= AnalogMuxElm.FLAG_PULLDOWN;
        }
        this.setupPins();
    }

    hasReset(): boolean { return false; }
    getChipName(): string { return "Analog Mux"; }
    nonLinear(): boolean { return true; }
    getDumpType(): number { return 432; }

    dump(): string {
        return super.dump() + " " + this.selectBitCount + " " + this.r_on + " " + this.r_off + " " + this.threshold;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "sb", this.selectBitCount);
        CircuitXMLSerializer.dumpAttr(elem, "ron", this.r_on);
        CircuitXMLSerializer.dumpAttr(elem, "rof", this.r_off);
        CircuitXMLSerializer.dumpAttr(elem, "thr", this.threshold);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        // read selectBitCount before super.undumpXml() since ChipElm calls setupPins() there
        this.selectBitCount = xml.parseIntAttr("sb", this.selectBitCount);
        super.undumpXml(xml);
        this.r_on = xml.parseDoubleAttr("ron", this.r_on);
        this.r_off = xml.parseDoubleAttr("rof", this.r_off);
        this.threshold = xml.parseDoubleAttr("thr", this.threshold);
    }

    setupPins(): void {
        if (!this.selectBitCount) return; // called from base constructor before fields are initialized
        this.inputCount = 1 << this.selectBitCount;
        this.sizeX = this.selectBitCount + 1;
        this.sizeY = this.inputCount + 1;

        this.pins = new Array(this.getPostCount());
        for (let i = 0; i !== this.inputCount; i++)
            this.pins[i] = new Pin(this, i, ChipElm.SIDE_W, "I" + i);
        for (let i = 0; i !== this.selectBitCount; i++)
            this.pins[this.inputCount + i] = new Pin(this, i + 1, ChipElm.SIDE_S, "S" + i);
        this.outputPin = this.inputCount + this.selectBitCount;
        this.pins[this.outputPin] = new Pin(this, 0, ChipElm.SIDE_E, "Z");
        this.allocNodes();
    }

    getPostCount(): number { return this.inputCount + this.selectBitCount + 1; }
    getVoltageSourceCount(): number { return 0; }

    needsPulldown(): boolean { return this.hasFlag(AnalogMuxElm.FLAG_PULLDOWN); }

    stamp(): void {
        for (let i = 0; i !== this.inputCount; i++)
            CircuitElm.sim.stampNonLinear(this.nodes[i]);
        CircuitElm.sim.stampNonLinear(this.nodes[this.outputPin]);
    }

    // stamp r_on between output and selected input.  For the others, if
    // the pulldown flag is set, pull them to ground with r_off instead of
    // connecting them to the output with r_off (better conditioned, and
    // avoids leaving unselected inputs floating).
    doStep(): void {
        let selectedInput = 0;
        for (let i = 0; i !== this.selectBitCount; i++)
            if (this.nodes[this.inputCount + i].v > this.threshold)
                selectedInput |= 1 << i;
        for (let i = 0; i !== this.inputCount; i++) {
            if (i === selectedInput)
                CircuitElm.sim.stampResistor(this.nodes[i], this.nodes[this.outputPin], this.r_on);
            else if (this.needsPulldown())
                CircuitElm.sim.stampResistor(this.nodes[i], CircuitNode.ground, this.r_off);
            else
                CircuitElm.sim.stampResistor(this.nodes[i], this.nodes[this.outputPin], this.r_off);
        }
    }

    calculateCurrent(): void {
        let selectedInput = 0;
        for (let i = 0; i !== this.selectBitCount; i++)
            if (this.nodes[this.inputCount + i].v > this.threshold)
                selectedInput |= 1 << i;
        let outputCurrent = 0;
        for (let i = 0; i !== this.inputCount; i++) {
            if (i === selectedInput) {
                const c = (this.nodes[i].v - this.nodes[this.outputPin].v) / this.r_on;
                this.pins[i].current = -c;
                outputCurrent += c;
            } else if (this.needsPulldown()) {
                this.pins[i].current = -this.nodes[i].v / this.r_off;
            } else {
                const c = (this.nodes[i].v - this.nodes[this.outputPin].v) / this.r_off;
                this.pins[i].current = -c;
                outputCurrent += c;
            }
        }
        this.pins[this.outputPin].current = outputCurrent;
        for (let i = 0; i !== this.selectBitCount; i++)
            this.pins[this.inputCount + i].current = 0;
    }

    getConnection(n1: number, n2: number): boolean {
        if (n1 >= this.inputCount && n1 < this.outputPin) return false;
        if (n2 >= this.inputCount && n2 < this.outputPin) return false;
        return true;
    }

    hasGroundConnection(n1: number): boolean {
        return this.needsPulldown() && n1 < this.inputCount;
    }

    getInfo(arr: string[]): void {
        arr[0] = "analog multiplexer";
        let selectedInput = 0;
        for (let i = 0; i !== this.selectBitCount; i++)
            if (this.nodes[this.inputCount + i].v > this.threshold)
                selectedInput |= 1 << i;
        arr[1] = "selected: I" + selectedInput;
        arr[2] = "Vout = " + CircuitElm.getVoltageText(this.nodes[this.outputPin].v);
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("# of Select Bits", this.selectBitCount, 1, 8).setDimensionless();
        if (n === 1) return new EditInfo("On Resistance (ohms)", this.r_on, 0, 0).setPositive();
        if (n === 2) return new EditInfo("Off Resistance (ohms)", this.r_off, 0, 0).setPositive();
        if (n === 3) return new EditInfo("Threshold Voltage", this.threshold, 0, 0);
        if (n === 4) return EditInfo.createCheckbox("Pulldown Resistor", this.needsPulldown());
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 1 && ei.value <= 6) {
                this.selectBitCount = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else ei.setError("must be between 1 and 6");
            return;
        }
        if (n === 1 && ei.value > 0) this.r_on = ei.value;
        if (n === 2 && ei.value > 0) this.r_off = ei.value;
        if (n === 3) this.threshold = ei.value;
        if (n === 4) this.flags = ei.changeFlag(this.flags, AnalogMuxElm.FLAG_PULLDOWN);
        super.setChipEditValue(n, ei);
    }
}
