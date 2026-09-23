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
import { VoltageSource } from "./VoltageSource";

export class BusTransceiverElm extends ChipElm {
    dataBits: number;
    aNodes: number;
    bNodes: number;
    intNodes: number;
    vSources: VoltageSource[];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st === undefined) {
            this.dataBits = 4;
            this.setupPins();
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "db", this.dataBits);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.dataBits = xml.parseIntAttr("db", this.dataBits);
        this.setupPins();
    }

    nonLinear(): boolean { return true; }
    allowBus(): boolean { return true; }
    getChipName(): string { return "Bus Transceiver"; }
    defaultBitCount(): number { return 4; }

    setupPins(): void {
        if (!this.dataBits) this.dataBits = 4;
        this.sizeX = 2;
        const dataY = this.useBus() ? 1 : this.dataBits;
        this.sizeY = dataY + 2;
        this.bits = this.dataBits;
        this.pins = new Array(this.getPostCount());

        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "OE");
        this.pins[0].lineOver = true;
        this.pins[1] = new Pin(this, 0, ChipElm.SIDE_E, "DIR");

        this.aNodes = 2;
        this.bNodes = 2 + this.dataBits;
        this.intNodes = 2 + 2 * this.dataBits;

        this.makeBitPins(this.dataBits, this.sizeY - dataY, ChipElm.SIDE_W, this.aNodes, "A", false, false, true);
        this.makeBitPins(this.dataBits, this.sizeY - dataY, ChipElm.SIDE_E, this.bNodes, "B", false, false, true);

        this.allocNodes();
    }

    getPostCount(): number { return 2 + 2 * this.dataBits; }
    getVoltageSourceCount(): number { return this.dataBits; }
    getInternalNodeCount(): number { return this.dataBits; }

    setVoltageSource(j: number, vs: VoltageSource): void {
        if (!this.vSources || this.vSources.length !== this.dataBits)
            this.vSources = new Array(this.dataBits);
        this.vSources[j] = vs;
        vs.setNodes(CircuitNode.ground, this.nodes[this.intNodes + j]);
    }

    getMatrixConnection(n1: number, n2: number): boolean {
        for (let i = 0; i < this.dataBits; i++) {
            if (this.comparePair(n1, n2, this.intNodes + i, this.aNodes + i)) return true;
            if (this.comparePair(n1, n2, this.intNodes + i, this.bNodes + i)) return true;
        }
        return false;
    }

    stamp(): void {
        for (let i = 0; i < this.dataBits; i++) {
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[this.intNodes + i], this.vSources[i]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.intNodes + i]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.aNodes + i]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.bNodes + i]);
        }
    }

    doStep(): void {
        const outputEnabled = this.nodes[0].v < this.getThreshold();
        const dirAtoB = this.nodes[1].v > this.getThreshold();

        for (let i = 0; i < this.dataBits; i++) {
            const srcVal = dirAtoB
                ? this.nodes[this.aNodes + i].v > this.getThreshold()
                : this.nodes[this.bNodes + i].v > this.getThreshold();

            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.intNodes + i],
                this.vSources[i], srcVal ? this.highVoltage : 0);

            const rDst = outputEnabled ? 1 : 1e10;
            if (dirAtoB) {
                CircuitElm.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.aNodes + i], 1e8);
                CircuitElm.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.bNodes + i], rDst);
            } else {
                CircuitElm.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.aNodes + i], rDst);
                CircuitElm.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.bNodes + i], 1e8);
            }
        }
    }

    getInfo(arr: string[]): void {
        arr[0] = "bus transceiver";
        const outputEnabled = this.nodes[0].v < this.getThreshold();
        const dirAtoB = this.nodes[1].v > this.getThreshold();
        arr[1] = outputEnabled ? (dirAtoB ? "A→B" : "B→A") : "hi-Z";
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.dataBits, 1, 1).setDimensionless();
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 1 && ei.value <= 16) {
                this.dataBits = Math.trunc(ei.value);
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 1 and 16");
        }
    }
}
