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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";

export class TimeDelayRelayElm extends ChipElm {
    lastTransition: number = 0;
    poweredState: boolean = false;
    onState: boolean = false;
    readonly vinResistance = 10e3;
    resistance: number;
    onDelay: number;
    offDelay: number;
    onResistance: number;
    offResistance: number;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            this.onDelay = parseFloat(st.nextToken());
            this.offDelay = parseFloat(st.nextToken());
            this.onResistance = parseFloat(st.nextToken());
            this.offResistance = this.resistance = parseFloat(st.nextToken());
        } else {
            this.onDelay = 1;
            this.offDelay = 0;
            this.onResistance = 1;
            this.offResistance = this.resistance = 10e6;
        }
    }

    reset(): void {
        this.lastTransition = 0;
        this.poweredState = this.onState = false;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ond", this.onDelay);
        CircuitXMLSerializer.dumpAttr(elem, "ofd", this.offDelay);
        CircuitXMLSerializer.dumpAttr(elem, "onr", this.onResistance);
        CircuitXMLSerializer.dumpAttr(elem, "ofr", this.offResistance);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.onDelay = xml.parseDoubleAttr("ond", this.onDelay);
        this.offDelay = xml.parseDoubleAttr("ofd", this.offDelay);
        this.onResistance = xml.parseDoubleAttr("onr", this.onResistance);
        this.offResistance = xml.parseDoubleAttr("ofr", this.offResistance);
        this.resistance = this.offResistance;
    }

    getChipName(): string { return "time delay relay"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 2;
        this.pins = new Array(4);
        this.pins[0] = new Pin(this, 1, ChipElm.SIDE_W, "Vin");
        this.pins[1] = new Pin(this, 1, ChipElm.SIDE_E, "gnd");
        this.pins[2] = new Pin(this, 0, ChipElm.SIDE_W, "in");
        this.pins[3] = new Pin(this, 0, ChipElm.SIDE_E, "out");
    }

    nonLinear(): boolean { return true; }

    stamp(): void {
        this.resistance = this.onState ? this.onResistance : this.offResistance;
        CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], this.vinResistance);
        CircuitElm.sim.stampNonLinear(this.nodes[2]);
        CircuitElm.sim.stampNonLinear(this.nodes[3]);
    }

    doStep(): void {
        this.resistance = this.onState ? this.onResistance : this.offResistance;
        CircuitElm.sim.stampResistor(this.nodes[2], this.nodes[3], this.resistance);
    }

    stepFinished(): void {
        // power applied, then delay, then in and out are connected
        const oldState = this.poweredState;
        this.poweredState = (this.nodes[0].v - this.nodes[1].v > 2.5);
        if (oldState !== this.poweredState)
            this.lastTransition = CircuitElm.sim.t;
        if (CircuitElm.sim.t > this.lastTransition + (this.poweredState ? this.onDelay : this.offDelay))
            this.onState = this.poweredState;
    }

    draw(g: Graphics): void {
        this.pins[0].current = -(this.nodes[0].v - this.nodes[1].v) / this.vinResistance;
        this.pins[2].current = -(this.nodes[2].v - this.nodes[3].v) / this.resistance;
        this.pins[1].current = -this.pins[0].current;
        this.pins[3].current = -this.pins[2].current;
        this.drawChip(g);
    }

    isDigitalChip(): boolean { return false; }
    getPostCount(): number { return 4; }
    getVoltageSourceCount(): number { return 0; }
    getDumpType(): number { return 414; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("On Delay (s)", this.onDelay, 0, 0);
        if (n === 1)
            return new EditInfo("Off Delay (s)", this.offDelay, 0, 0);
        if (n === 2)
            return new EditInfo("On Resistance (ohms)", this.onResistance, 0, 0).setPositive();
        if (n === 3)
            return new EditInfo("Off Resistance (ohms)", this.offResistance, 0, 0).setPositive();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.onDelay = ei.value;
        if (n === 1)
            this.offDelay = ei.value;
        if (n === 2)
            this.onResistance = ei.value;
        if (n === 3)
            this.offResistance = ei.value;
    }
}
