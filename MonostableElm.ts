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
import { Checkbox } from "./Checkbox";
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { StringTokenizer } from "./StringTokenizer";
import { parseFloatStrict } from "./NumberParse";

export class MonostableElm extends ChipElm {
    static readonly FLAG_INVERT_TRIGGER = 2;

    private prevInputValue: boolean = false;
    private retriggerable: boolean = false;
    private triggered: boolean = false;
    private lastRisingEdge: number = 0;
    private delay: number = 0.01;

    invertTrigger(): boolean { return (this.flags & MonostableElm.FLAG_INVERT_TRIGGER) !== 0; }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            this.retriggerable = st.nextToken() === "true";
            this.delay = parseFloatStrict(st.nextToken());
        }
        this.reset();
    }

    getChipName(): string { return "Monostable"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 2;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "");
        this.pins[0].clock = true;
        this.pins[0].bubble = this.invertTrigger();
        this.pins[1] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
        this.pins[1].output = true;
        this.pins[2] = new Pin(this, 1, ChipElm.SIDE_E, "Q");
        this.pins[2].output = true;
        this.pins[2].lineOver = true;
    }

    reset(): void {
        super.reset();
        this.pins[2].value = true;
        this.triggered = this.prevInputValue = false;
    }

    getPostCount(): number { return 3; }
    getVoltageSourceCount(): number { return 2; }

    execute(): void {
        const trigValue = this.pins[0].value !== this.invertTrigger();
        if (trigValue && this.prevInputValue !== trigValue && (this.retriggerable || !this.triggered)) {
            this.lastRisingEdge = CircuitElm.sim.t;
            this.pins[1].value = true;
            this.pins[2].value = false;
            this.triggered = true;
        }
        if (this.triggered && CircuitElm.sim.t > this.lastRisingEdge + this.delay) {
            this.pins[1].value = false;
            this.pins[2].value = true;
            this.triggered = false;
        }
        this.prevInputValue = trigValue;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "rt", this.retriggerable);
        CircuitXMLSerializer.dumpAttr(elem, "dl", this.delay);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.retriggerable = xml.parseBooleanAttr("rt", this.retriggerable);
        this.delay = xml.parseDoubleAttr("dl", this.delay);
        this.reset();
    }

    getDumpType(): number { return 194; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Retriggerable", this.retriggerable);
            return ei;
        }
        if (n === 1)
            return new EditInfo("Period (s)", this.delay, 0.001, 0.1);
        if (n === 2)
            return EditInfo.createCheckbox("Invert Trigger", this.invertTrigger());
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.retriggerable = ei.checkbox!.getState();
        if (n === 1)
            this.delay = ei.value;
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, MonostableElm.FLAG_INVERT_TRIGGER);
            this.setupPins();
            this.setPoints();
        }
        super.setChipEditValue(n, ei);
    }

    addJSMethods(): void {
        super.addJSMethods();
        const p = this._jsProxy!;
        p['getPeriod'] = () => this.delay;
        p['setPeriod'] = (v: number) => { this.delay = v; };
    }
}
