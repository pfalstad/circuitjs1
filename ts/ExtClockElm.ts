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

import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";

/** A JS-nameable digital clock rail - the digital-fast-path counterpart to ExtVoltageElm. Unlike
 * ExtVoltageElm (a plain settable voltage JS has to keep re-pushing every frame via
 * setExtVoltage() - an analog value the digital engine can't cheaply drive from its own free-
 * running Cycle/outputEvents machinery), this is a real WF_SQUARE RailElm - the same
 * phasedClockLogic()-based CUSTOM_CHIP RailElm.digitalSynthesis() already builds for any digital
 * clock rail - just with a JS-facing name attached so JSInterface.setExtClock() can find it by
 * name and nudge its phase live (see RailElm.retimePhase()) without JS having to call in on every
 * timestep: the engine keeps the signal running on its own between nudges. */
export class ExtClockElm extends RailElm {
    name: string;

    constructor(xx: number, yy: number) {
        super(xx, yy, VoltageElm.WF_SQUARE);
        this.maxVoltage = 2.5;
        this.bias = 2.5;
        this.frequency = 100;
        this.name = "extclock";
        this.flags |= this.FLAG_CLOCK;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "nm", this.name);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.name = xml.parseStringAttr("nm", this.name) ?? this.name;
    }

    getName(): string { return this.name; }

    // override RailElm
    getDumpType(): number { return 0; }

    drawRail(g: Graphics): void {
        this.drawRailText(g, this.name);
    }

    getShortcut(): number { return 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Name", 0, -1, -1);
            ei.text = this.name;
            return ei;
        }
        return super.getEditInfo(n - 1);
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.name = ei.textf!.value;
            return;
        }
        super.setEditValue(n - 1, ei);
    }

    getElmType(): string { return "ext. clock"; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        arr[0] = Locale.LS("ext. clock") + " (" + this.name + ")";
    }
}
