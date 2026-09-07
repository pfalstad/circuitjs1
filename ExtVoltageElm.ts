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
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { StringTokenizer } from "./StringTokenizer";
import { customChipStart } from "./digital/chip_desc";
import type { ChipDesc } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";
import type { Chip } from "./digital/chip";

export class ExtVoltageElm extends RailElm {
    name: string;
    voltage: number = 0;

    // A live JS-driven digital source (JSInterface.setExtVoltage()) - same shape as
    // LogicInputElm's own digitalChip/toggle() pattern (see LogicInputElm.digitalChip's
    // docstring), rather than RailElm's waveform-keyed isDigitalClock()/isDigitalConstant()
    // (this elm's waveform is fixed to WF_AC by the constructor below, which RailElm's checks
    // don't recognize as a digital source at all, and RailElm.digitalTie()'s DC path binds to a
    // shared VCC/GND sentinel chip at graph-build time - not something a later setVoltage() call
    // could push a live change into). Set by whoever builds the digital graph
    // (SimulationManager.initDigitalCircuit()) to this element's own synthesized Chip.
    digitalChip: Chip | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xb!, yb!, f!, st);
            this.name = CustomLogicModel.unescape(st.nextToken());
            this.waveform = VoltageElm.WF_AC;
        } else {
            super(xa, ya, VoltageElm.WF_AC);
            this.name = "ext";
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "nm", this.name);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.name = xml.parseStringAttr("nm", this.name) ?? this.name;
    }

    drawRail(g: Graphics): void {
        this.drawRailText(g, this.name);
    }

    // Any nonzero/true value reads as digital HIGH - matches the true/false contract
    // JSInterface.setExtVoltage() documents, while still tolerating a plain numeric voltage.
    private digitalHigh(): boolean { return !!this.voltage; }

    /** Pushes `high` into `chip`'s output as a live 0-delay event if it actually differs -
     * identical semantics to LogicInputElm.pushDigitalValue() (see its own docstring), just not
     * shared since the two elements don't share a base class for it. Called once at
     * Circuit-construction time (via digitalSynthesis()'s customUpdate) for the correct initial
     * value, and again from setVoltage() below for every live setExtVoltage() call. */
    private static pushDigitalValue(chip: Chip, high: boolean): void {
        const newOut = high ? 1 : 0;
        if (newOut !== chip.output) chip.pendingEvent = chip.circuit.queuePush(chip, 0n);
    }

    isDigitalSource(): boolean { return true; }
    // Never bind to the shared VCC/GND sentinel (RailElm's DC-tie path) - this elm always needs
    // its own live-pushable chip, regardless of waveform.
    digitalTie(): "VCC" | "GND" | null { return null; }

    digitalSynthesis(): DigitalSynthesis | null {
        const desc: ChipDesc[] = [
            customChipStart((chip) => ExtVoltageElm.pushDigitalValue(chip, this.digitalHigh())).outputPin(1),
        ];
        return { desc, pinMap: new Map([[0, 1]]) };
    }

    // Fixed logic levels for syncDigitalToNodesNew()'s analog write-back (scope/voltage readouts)
    // - this elm has no configurable hi/lo fields like LogicInputElm, so just use a normal 5V/0V
    // digital swing.
    getDigitalVoltage(v: boolean): number { return v ? 5 : 0; }

    setVoltage(v: number): void {
        if (isNaN(v)) return;
        this.voltage = v;
        if (this.digitalChip) ExtVoltageElm.pushDigitalValue(this.digitalChip, this.digitalHigh());
    }
    getName(): string { return this.name; }

    getVoltage(): number {
        return this.voltage;
    }

    getDumpType(): number { return 418; }
    getShortcut(): number { return 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Name", 0, -1, -1);
            ei.text = this.name;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.name = ei.textf!.value;
    }

    isExtVoltageElm(): boolean { return true; }
    getElmType(): string { return "ext. voltage"; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        arr[0] = Locale.LS("ext. voltage") + " (" + this.name + ")";
    }
}
