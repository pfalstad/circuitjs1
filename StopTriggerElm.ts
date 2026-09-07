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
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Font } from "./Font";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { StringTokenizer } from "./StringTokenizer";

export class StopTriggerElm extends CircuitElm {
    triggerVoltage: number = 1;
    triggered: boolean = false;
    stopped: boolean = false;
    conditionActive: boolean = false;
    durationMet: boolean = false;
    delay: number = 0;
    triggerTime: number = 0;
    requiredDuration: number = 0;
    conditionStartTime: number = 0;
    type: number = 0;
    count: number = 1;
    triggerCount: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f);
        if (st !== undefined) {
            this.triggerVoltage = parseFloat(st.nextToken());
            this.type = parseInt(st.nextToken());
            this.delay = parseFloat(st.nextToken());
            this.count = 1;
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "tv", this.triggerVoltage);
        CircuitXMLSerializer.dumpAttr(elem, "tp", this.type);
        CircuitXMLSerializer.dumpAttr(elem, "dl", this.delay);
        CircuitXMLSerializer.dumpAttr(elem, "ct", this.count);
        CircuitXMLSerializer.dumpAttr(elem, "rd", this.requiredDuration);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.triggerVoltage = xml.parseDoubleAttr("tv", this.triggerVoltage);
        this.type = xml.parseIntAttr("tp", this.type);
        this.delay = xml.parseDoubleAttr("dl", this.delay);
        this.count = xml.parseIntAttr("ct", 1);
        if (this.count < 1)
            this.count = 1;
        this.requiredDuration = xml.parseDoubleAttr("rd", 0);
    }

    reset(): void {
        this.triggered = false;
        this.conditionActive = false;
        this.durationMet = false;
        this.triggerCount = 0;
    }
    getDumpType(): number { return 408; }
    getPostCount(): number { return 1; }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1 - 8 / this.dn);
    }

    draw(g: Graphics): void {
        g.save();
        const selected = this.needsHighlight() || this.stopped;
        g.setFont(new Font("SansSerif", selected ? Font.BOLD : 0, 14));
        g.setColor(selected ? CircuitElm.selectColor : CircuitElm.whiteColor);
        this.setBbox(this.point1, this.lead1!, 0);
        this.drawLabeledNode(g, Locale.LS("trigger"), this.point1, this.lead1!);
        this.setVoltageColor(g, this.nodes[0].v);
        if (selected) g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawPosts(g);
        g.restore();
    }

    stepFinished(): void {
        this.stopped = false;
        const condition = (this.type === 0 && this.nodes[0].v >= this.triggerVoltage) ||
            (this.type === 1 && this.nodes[0].v <= this.triggerVoltage);
        if (!this.conditionActive && condition) {
            this.conditionActive = true;
            this.conditionStartTime = CircuitElm.sim.t;
            this.durationMet = false;
        }
        if (this.conditionActive && condition && !this.durationMet &&
                CircuitElm.sim.t - this.conditionStartTime >= this.requiredDuration) {
            this.durationMet = true;
            this.triggerCount++;
            if (!this.triggered && this.triggerCount >= this.count) {
                this.triggered = true;
                this.triggerTime = CircuitElm.sim.t;
            }
        }
        if (this.conditionActive && !condition)
            this.conditionActive = false;
        if (this.triggered && CircuitElm.sim.t >= this.triggerTime + this.delay) {
            this.triggered = false;
            this.triggerCount = 0;
            this.stopped = true;
            CircuitElm.app.setSimRunning(false);
        }
    }

    getVoltageDiff(): number { return this.nodes[0].v; }

    getInfo(arr: string[]): void {
        arr[0] = "stop trigger";
        arr[1] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "Vtrigger = " + CircuitElm.getVoltageText(this.triggerVoltage);
        if (this.triggered)
            arr[3] = "stopping in " + CircuitElm.getUnitText(this.triggerTime + this.delay - CircuitElm.sim.t, "s");
        else if (this.stopped)
            arr[3] = "stopped";
        else
            arr[3] = "waiting";
        if (!this.stopped && this.count > 1)
            arr[3] += " (" + Math.min(this.triggerCount, this.count) + "/" + this.count + ")";
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) return new EditInfo("Voltage", this.triggerVoltage).setUnitStep();
        if (n === 1) {
            const ei = new EditInfo("Trigger Type", this.type, -1, -1);
            ei.choice = new Choice();
            ei.choice.add(">=");
            ei.choice.add("<=");
            ei.choice.select(this.type);
            return ei;
        }
        if (n === 2) return new EditInfo("Delay (s)", this.delay);
        if (n === 3) return new EditInfo("Required Duration (s)", this.requiredDuration);
        if (n === 4) {
            const ei = new EditInfo("Required Count", this.count, -1, -1);
            return ei.setDimensionless().setPositive();
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) this.triggerVoltage = ei.value;
        if (n === 1) this.type = ei.choice!.getSelectedIndex();
        if (n === 2) this.delay = ei.value;
        if (n === 3) {
            this.requiredDuration = ei.value;
            if (this.requiredDuration < 0)
                this.requiredDuration = 0;
        }
        if (n === 4) {
            this.count = Math.trunc(ei.value);
            if (this.count < 1)
                this.count = 1;
        }
    }
}
