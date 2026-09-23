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

// contributed by Edward Calver

import { ChipElm, Pin } from "./ChipElm";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { parseIntStrict } from "./NumberParse";

export class DeMultiplexerElm extends ChipElm {
    static readonly FLAG_BUS_SELECT = 1 << 3;
    static readonly FLAG_INVERT_OUTPUTS = 1 << 4;

    // outputMode: 0 = single input, individual outputs (original)
    //             1 = single input, bus output (bit distributor)
    //             2 = bus input, bus outputs
    static readonly OUTPUT_MODE_INDIVIDUAL = 0;
    static readonly OUTPUT_MODE_BUS_BIT    = 1;
    static readonly OUTPUT_MODE_BUS_BUS    = 2;

    selectBitCount: number = 2;
    outputCount: number = 0;
    outputMode: number = 0;
    dataBusWidth: number = 4;
    inputPin: number = 0;
    selectPin: number = 0;
    outputPin: number = 0;

    hasReset(): boolean { return false; }
    busSelect(): boolean { return this.hasFlag(DeMultiplexerElm.FLAG_BUS_SELECT); }
    invertOutputs(): boolean { return this.hasFlag(DeMultiplexerElm.FLAG_INVERT_OUTPUTS); }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.setupPins();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            try {
                this.selectBitCount = parseIntStrict(st!.nextToken());
            } catch (e) {}
	    this.setupPins();
	    this.allocNodes();
        }
    }

    getChipName(): string { return "Demultiplexer"; }

    dump(): string { return super.dump() + " " + this.selectBitCount; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "se", this.selectBitCount);
        if (this.outputMode !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "om", this.outputMode);
        if (this.dataBusWidth !== 4)
            CircuitXMLSerializer.dumpAttr(elem, "dw", this.dataBusWidth);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.selectBitCount = xml.parseIntAttr("se", this.selectBitCount);
        this.outputMode = xml.parseIntAttr("om", 0);
        this.dataBusWidth = xml.parseIntAttr("dw", 4);
        this.setupPins();
        this.allocNodes();
    }

    setupPins(): void {
	if (!this.selectBitCount)
	    this.selectBitCount = 2;
        this.outputCount = 1 << this.selectBitCount;
        const D = DeMultiplexerElm;
        let i: number, n: number;

        if (this.outputMode === D.OUTPUT_MODE_BUS_BUS) {
            const inputPinCount  = this.dataBusWidth;
            const outputPinCount = this.outputCount * this.dataBusWidth;

            this.sizeX = this.selectBitCount + 1;
            this.sizeY = this.outputCount + 1;
            this.pins = new Array(inputPinCount + this.selectBitCount + outputPinCount);

            // input bus on west side
            this.inputPin = 0;
            for (i = 0; i < this.dataBusWidth; i++) {
                this.pins[i] = new Pin(this, 0, ChipElm.SIDE_W, "Q");
                this.pins[i].busWidth = this.dataBusWidth;
                this.pins[i].busZ = i;
            }

            // select pins on south side
            this.selectPin = inputPinCount;
            for (i = 0; i < this.selectBitCount; i++) {
                n = this.selectPin + i;
                if (this.busSelect()) {
                    this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "S");
                    this.pins[n].busWidth = this.selectBitCount;
                    this.pins[n].busZ = i;
                } else {
                    this.pins[n] = new Pin(this, i + 1, ChipElm.SIDE_S, "S" + i);
                }
            }

            // output bus groups on east side
            this.outputPin = this.selectPin + this.selectBitCount;
            for (let g = 0; g < this.outputCount; g++) {
                for (i = 0; i < this.dataBusWidth; i++) {
                    n = this.outputPin + g * this.dataBusWidth + i;
                    this.pins[n] = new Pin(this, g, ChipElm.SIDE_E, "Q" + g);
                    this.pins[n].output = true;
                    this.pins[n].busWidth = this.dataBusWidth;
                    this.pins[n].busZ = i;
                }
            }

        } else if (this.outputMode === D.OUTPUT_MODE_BUS_BIT) {
            this.sizeX = this.selectBitCount + 1;
            this.sizeY = 3;
            this.pins = new Array(1 + this.selectBitCount + this.outputCount);

            // single input on west side
            this.inputPin = 0;
            this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "Q");

            // select pins on south side
            this.selectPin = 1;
            for (i = 0; i < this.selectBitCount; i++) {
                n = this.selectPin + i;
                if (this.busSelect()) {
                    this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "S");
                    this.pins[n].busWidth = this.selectBitCount;
                    this.pins[n].busZ = i;
                } else {
                    this.pins[n] = new Pin(this, i + 1, ChipElm.SIDE_S, "S" + i);
                }
            }

            // bus output on east side
            this.outputPin = this.selectPin + this.selectBitCount;
            for (i = 0; i < this.outputCount; i++) {
                n = this.outputPin + i;
                this.pins[n] = new Pin(this, 1, ChipElm.SIDE_E, "Q");
                this.pins[n].output = true;
                this.pins[n].busWidth = this.outputCount;
                this.pins[n].busZ = i;
            }

        } else {
            // mode 0: single input, individual outputs
            this.sizeX = 1 + this.selectBitCount;
            this.sizeY = 1 + this.outputCount;
            this.pins = new Array(1 + this.selectBitCount + this.outputCount);

            // individual output pins on east side
            this.outputPin = 0;
            for (i = 0; i < this.outputCount; i++) {
                this.pins[i] = new Pin(this, i, ChipElm.SIDE_E, "Q" + i);
                this.pins[i].output = true;
            }

            // select pins on south side
            this.selectPin = this.outputCount;
            for (i = 0; i < this.selectBitCount; i++) {
                n = this.selectPin + i;
                if (this.busSelect()) {
                    this.pins[n] = new Pin(this, 0, ChipElm.SIDE_S, "S");
                    this.pins[n].busWidth = this.selectBitCount;
                    this.pins[n].busZ = i;
                } else {
                    this.pins[n] = new Pin(this, i, ChipElm.SIDE_S, "S" + i);
                }
            }

            // single input on west side
            this.inputPin = this.outputCount + this.selectBitCount;
            this.pins[this.inputPin] = new Pin(this, 0, ChipElm.SIDE_W, "Q");
        }

        this.allocNodes();
    }

    getPostCount(): number {
        const D = DeMultiplexerElm;
	if (!this.dataBusWidth || !this.selectBitCount || !this.outputCount)
	    return 0;
        if (this.outputMode === D.OUTPUT_MODE_BUS_BUS)
            return this.dataBusWidth + this.selectBitCount + this.outputCount * this.dataBusWidth;
        return 1 + this.selectBitCount + this.outputCount;
    }

    getVoltageSourceCount(): number {
        if (this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BUS)
            return this.outputCount * this.dataBusWidth;
        return this.outputCount;
    }

    readSelectValue(): number {
        let sel = 0;
        for (let i = 0; i < this.selectBitCount; i++)
            if (this.pins[this.selectPin + i].value)
                sel |= 1 << i;
        return sel;
    }

    execute(): void {
        const D = DeMultiplexerElm;
        const selectedValue = this.readSelectValue();

        // set inactive outputs to idle level, then copy input (bus) to selected output (group)
        const width = (this.outputMode === D.OUTPUT_MODE_BUS_BUS) ? this.dataBusWidth : 1;
        const idle = this.invertOutputs();
        for (let i = 0; i < this.outputCount * width; i++)
            this.pins[this.outputPin + i].value = idle;
        for (let i = 0; i < width; i++)
            this.pins[this.outputPin + selectedValue * width + i].value = this.pins[this.inputPin + i].value;
    }

    getDumpType(): number { return 185; }
    getXmlDumpType(): string { return "dmux"; }

    getChipEditInfo(n: number): EditInfo | null {
        const D = DeMultiplexerElm;
        if (n === 0)
            return new EditInfo("# of Select Bits", this.selectBitCount).setDimensionless();
        if (n === 1) {
            const ei = new EditInfo("Output Mode", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Individual Outputs");
            ei.choice.add("Bus Output (Bit Distribute)");
            ei.choice.add("Bus Input/Output");
            ei.choice.select(this.outputMode);
            return ei;
        }
        if (n === 2)
            return EditInfo.createCheckbox("Bus Select", this.busSelect());
        if (n === 3)
            return EditInfo.createCheckbox("Keep Inactive Outputs High (74139)", this.invertOutputs());
        if (n === 4 && this.outputMode === D.OUTPUT_MODE_BUS_BUS)
            return new EditInfo("Data Bus Width", this.dataBusWidth, 2, 32).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        const D = DeMultiplexerElm;
        if (n === 0) {
            if (ei.value >= 1 && ei.value <= 6) {
                this.selectBitCount = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 1 and 6");
        }
        if (n === 1) {
            this.outputMode = ei.choice!.getSelectedIndex();
            this.setupPins();
            this.setPoints();
        }
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, D.FLAG_BUS_SELECT);
            this.setupPins();
            this.setPoints();
        }
        if (n === 3) {
            this.flags = ei.changeFlag(this.flags, D.FLAG_INVERT_OUTPUTS);
        }
        if (n === 4) {
            if (ei.value >= 2) {
                this.dataBusWidth = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be >= 2");
        }
    }
}
