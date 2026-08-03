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
import { CirSim } from "./CirSim";
import { VoltageSource } from "./VoltageSource";
import { Graphics } from "./Graphics";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Checkbox } from "./Checkbox";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { Locale } from "./Locale";

// Battery model: drawn like a DC voltage source, but internally modeled as
//   (-) terminal -- Vsrc -- nodeA -- R0 -- nodeB -- (R1 parallel C1) -- (+) terminal
// Vsrc's voltage is derived from the state of charge (SOC) via a configurable
// table.  SOC is tracked over time by coulomb counting the terminal current.
export class BatteryElm extends CircuitElm {
    static readonly FLAG_SHOW_VOLTAGE = 1;
    static readonly FLAG_SHOW_SOC = 2;

    // BT_CUSTOM is -1 (not an index into batteryTypeNames/batteryTypeTables) so that
    // new preset types can be appended below without renumbering it.
    static readonly BT_ALKALINE = 0;
    static readonly BT_LITHIUM = 1;
    static readonly BT_NIMH = 2;
    static readonly BT_NICD = 3;
    static readonly BT_LEAD_ACID = 4;
    static readonly BT_CUSTOM = -1;
    static readonly batteryTypeNames = ["Alkaline 1.5V", "Lithium-Ion", "NiMH 1.2V", "NiCd 1.2V", "Lead-Acid"];
    static readonly batteryTypeTables = [
        "0=0.8\n10=0.95\n20=1.05\n40=1.18\n60=1.28\n80=1.38\n90=1.43\n100=1.55\n",           // alkaline
        "0=3.00\n5=3.30\n10=3.45\n20=3.55\n30=3.62\n40=3.68\n50=3.73\n60=3.79\n70=3.87\n80=3.97\n90=4.08\n95=4.15\n100=4.20\n", // lithium-ion
        "0=1.00\n10=1.15\n20=1.20\n50=1.25\n80=1.30\n90=1.33\n100=1.40\n",                  // NiMH
        "0=1.00\n10=1.15\n20=1.20\n50=1.22\n80=1.25\n90=1.28\n100=1.35\n",                  // NiCd
        "0=1.75\n10=1.90\n20=1.95\n50=2.05\n80=2.10\n90=2.12\n100=2.15\n",                  // lead-acid
    ];

    // default capacity (Ah), R0 (ohms), R1 (ohms), C1 (F) for each preset battery type,
    // applied when the user switches to that type in the edit dialog
    static readonly batteryTypeDefaults = [
        [2.5,  .15,   .25,  1500],  // alkaline (AA)
        [3.0,  .025,  .020, 2000],  // lithium-ion (18650)
        [2.0,  .030,  .040, 1800],  // NiMH (AA)
        [1.0,  .020,  .025, 1200],  // NiCd (AA)
        [10,   .008,  .012, 5000],  // lead-acid (2V)
    ];

    batteryType: number;
    r0: number; r1: number; c1: number;
    capacityAh: number;
    initialSoc: number;    // 0 to 1, used when resetting
    soc: number = 0;       // 0 to 1, current state of charge

    // internal node indices: nodes[0] = (-) terminal, nodes[1] = (+) terminal,
    // nodes[2] = node between Vsrc and R0, nodes[3] = node between R0 and R1/C1
    compResistance: number = 0;
    capVoltDiff: number = 0;
    capCurrent: number = 0;
    curSourceValue: number = 0;

    socVoltageTable: string;
    socTable: number[][] = []; // each entry is [socPercent, voltage], sorted ascending

    constructor(xx: number, yy: number) {
        super(xx, yy);
        this.r0 = .01;
        this.r1 = .02;
        this.c1 = 2000;
        this.capacityAh = 2;
        this.initialSoc = 1;
        this.flags |= BatteryElm.FLAG_SHOW_VOLTAGE | BatteryElm.FLAG_SHOW_SOC;
        this.batteryType = BatteryElm.BT_LITHIUM;
        this.socVoltageTable = BatteryElm.batteryTypeTables[this.batteryType];
        this.parseSocTable(null);
        this.reset();
    }

    getInternalNodeCount(): number { return 2; }
    getVoltageSourceCount(): number { return 1; }
    getDragVertical(requestedVertical: boolean): boolean { return true; }
    isBatteryElm(): boolean { return true; }

    // point 2, not point 1, should track the mouse during toolbar drag-and-drop
    dragPlace(xa: number, ya: number, vertical: boolean): void {
        super.dragPlace(xa, ya, vertical);
        this.swapDragEndpoints();
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "r0", this.r0);
        CircuitXMLSerializer.dumpAttr(elem, "r1", this.r1);
        CircuitXMLSerializer.dumpAttr(elem, "c1", this.c1);
        CircuitXMLSerializer.dumpAttr(elem, "cap", this.capacityAh);
        CircuitXMLSerializer.dumpAttr(elem, "isoc", this.initialSoc);
        CircuitXMLSerializer.dumpAttr(elem, "bt", this.batteryType);
        if (this.batteryType === BatteryElm.BT_CUSTOM && this.socVoltageTable != null && this.socVoltageTable.length > 0)
            elem.appendChild(doc.createTextNode(this.socVoltageTable));
    }

    dumpXmlState(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "soc", this.soc);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.r0 = xml.parseDoubleAttr("r0", .01);
        this.r1 = xml.parseDoubleAttr("r1", .02);
        this.c1 = xml.parseDoubleAttr("c1", 2000);
        this.capacityAh = xml.parseDoubleAttr("cap", 2);
        this.initialSoc = BatteryElm.clampSoc(xml.parseDoubleAttr("isoc", 1));
        // soc itself isn't lower-clamped (over-discharge is modeled), only capped at 100%
        this.soc = Math.min(1, xml.parseDoubleAttr("soc", this.initialSoc));
        this.batteryType = xml.parseIntAttr("bt", BatteryElm.BT_LITHIUM);
        if (this.batteryType === BatteryElm.BT_CUSTOM) {
            this.socVoltageTable = "";
            try {
                this.socVoltageTable = xml.parseContents() ?? "";
            } catch (e) {
                CirSim.console("exception in undump " + e);
            }
            if (this.socVoltageTable == null || this.socVoltageTable.length === 0)
                this.socVoltageTable = BatteryElm.batteryTypeTables[BatteryElm.BT_LITHIUM];
        } else
            this.socVoltageTable = (this.batteryType >= 0 && this.batteryType < BatteryElm.batteryTypeTables.length) ?
                BatteryElm.batteryTypeTables[this.batteryType] : BatteryElm.batteryTypeTables[BatteryElm.BT_LITHIUM];
        this.parseSocTable(null);
    }

    reset(): void {
        this.soc = BatteryElm.clampSoc(this.initialSoc);
        this.capVoltDiff = this.capCurrent = this.curSourceValue = 0;
        this.curcount = 0;
    }

    static clampSoc(s: number): number {
        if (s < 0) return 0;
        if (s > 1) return 1;
        return s;
    }

    parseSocTable(ei: EditInfo | null): void {
        this.socTable = [];
        if (this.socVoltageTable == null || this.socVoltageTable.length === 0)
            return;
        const lines = this.socVoltageTable.split("\n");
        for (let i = 0; i !== lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0)
                continue;
            const eq = line.indexOf('=');
            if (eq < 0) {
                if (ei != null)
                    ei.setError("missing =: " + line);
                continue;
            }
            try {
                const socPct = parseFloat(line.substring(0, eq).trim());
                const v = parseFloat(line.substring(eq + 1).trim());
                if (isNaN(socPct) || isNaN(v))
                    throw new Error("bad number");
                this.socTable.push([socPct, v]);
            } catch (e) {
                if (ei != null)
                    ei.setError("bad line: " + line);
            }
        }
        // insertion sort by SOC percent (tables are tiny, simplicity over speed)
        for (let i = 1; i < this.socTable.length; i++) {
            const cur = this.socTable[i];
            let j = i - 1;
            while (j >= 0 && this.socTable[j][0] > cur[0]) {
                this.socTable[j + 1] = this.socTable[j];
                j--;
            }
            this.socTable[j + 1] = cur;
        }
    }

    getVoltageForSoc(socFrac: number): number {
        const socPct = socFrac * 100;
        if (socPct < 0) {
            // over-discharged: extrapolate linearly using the slope between 0% and 10%
            const v0 = this.interpSocTable(0);
            const v10 = this.interpSocTable(10);
            const slope = (v10 - v0) / 10; // volts per percent SOC
            return v0 + slope * 3 * socPct;
        }
        return this.interpSocTable(socPct);
    }

    interpSocTable(socPct: number): number {
        if (this.socTable == null || this.socTable.length === 0)
            return 3.7;
        if (this.socTable.length === 1)
            return this.socTable[0][1];
        if (socPct <= this.socTable[0][0])
            return this.socTable[0][1];
        const n = this.socTable.length;
        if (socPct >= this.socTable[n - 1][0])
            return this.socTable[n - 1][1];
        for (let i = 0; i < n - 1; i++) {
            const a = this.socTable[i];
            const b = this.socTable[i + 1];
            if (socPct >= a[0] && socPct <= b[0]) {
                if (b[0] === a[0])
                    return a[1];
                const frac = (socPct - a[0]) / (b[0] - a[0]);
                return a[1] + frac * (b[1] - a[1]);
            }
        }
        return this.socTable[n - 1][1];
    }

    setVoltageSource(n: number, v: VoltageSource): void {
        super.setVoltageSource(n, v);
        v.setNodes(this.nodes[0], this.nodes[2]);
    }

    stamp(): void {
        CircuitElm.sim.stampVoltageSource(this.nodes[0], this.nodes[2], this.voltSource);
        CircuitElm.sim.stampResistor(this.nodes[2], this.nodes[3], this.r0);
        CircuitElm.sim.stampResistor(this.nodes[3], this.nodes[1], this.r1);

        if (this.doDcAnalysis()) {
            // when finding DC operating point, replace cap with a 100M resistor
            this.compResistance = 1e8;
        } else {
            // trapezoidal capacitor companion model (Norton equivalent):
            // resistor in parallel with a current source, between nodes[3] and nodes[1]
            this.compResistance = CircuitElm.sim.timeStep / (2 * this.c1);
        }
        CircuitElm.sim.stampResistor(this.nodes[3], this.nodes[1], this.compResistance);
        CircuitElm.sim.stampRightSide(this.nodes[3]);
        CircuitElm.sim.stampRightSide(this.nodes[1]);
    }

    startIteration(): void {
        if (this.doDcAnalysis())
            this.curSourceValue = 0;
        else
            this.curSourceValue = -this.capVoltDiff / this.compResistance - this.capCurrent;
    }

    doStep(): void {
        CircuitElm.sim.updateVoltageSource(this.nodes[0], this.nodes[2], this.voltSource, this.getVoltageForSoc(this.soc));
        CircuitElm.sim.stampCurrentSource(this.nodes[3], this.nodes[1], this.curSourceValue);
    }

    stepFinished(): void {
        this.capVoltDiff = this.nodes[3].v - this.nodes[1].v;
        if (this.compResistance > 0)
            this.capCurrent = this.capVoltDiff / this.compResistance + this.curSourceValue;

        // coulomb counting: "current" (set from the internal voltage source's solved
        // current) is positive when the battery is discharging, per CircuitElm's
        // getCurrentIntoNode() convention for post 1 (the + terminal).
        if (this.capacityAh > 0 && !this.doDcAnalysis()) {
            this.soc -= this.current * CircuitElm.sim.timeStep / (3600 * this.capacityAh);
            // no lower clamp: below 0% the voltage table is extrapolated (see getVoltageForSoc)
            if (this.soc > 1)
                this.soc = 1;
        }
    }

    readonly circleSize = 17;
    setPoints(): void {
        super.setPoints();
        this.calcLeads(8);
    }

    draw(g: Graphics): void {
        this.setBbox(this.x, this.y, this.x2, this.y2);
        this.draw2Leads(g);
        this.setVoltageColor(g, this.nodes[0].v);
        this.setPowerColor(g, false);
        this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, 0, 10);
        CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);
        this.setVoltageColor(g, this.nodes[1].v);
        this.setPowerColor(g, false);
        const hs = 16;
        this.setBbox(this.point1, this.point2, hs);
        this.interpPoint2(this.lead1!, this.lead2!, CircuitElm.ps1, CircuitElm.ps2, 1, hs);
        CircuitElm.drawThickLine(g, CircuitElm.ps1, CircuitElm.ps2);

        if (this.dx === 0 || this.dy === 0) {
            const showV = (this.flags & BatteryElm.FLAG_SHOW_VOLTAGE) !== 0;
            const showSoc = (this.flags & BatteryElm.FLAG_SHOW_SOC) !== 0;
            let s: string | null = null;
            if (showV && showSoc)
                s = CircuitElm.getShortUnitText(this.getVoltageForSoc(this.soc), "V") + " " + this.getSocText();
            else if (showV)
                s = CircuitElm.getShortUnitText(this.getVoltageForSoc(this.soc), "V");
            else if (showSoc)
                s = this.getSocText();
            if (s != null)
                this.drawValues(g, s, hs);
        }
        this.updateDotCount();
        if (!this.isCreating())
            this.drawDots(g, this.point1, this.point2, this.curcount);
        this.drawPosts(g);
    }

    addRoutingObstacle(wr: WireRouter): void { this.addRoutingObstacleWithLeads(wr, 16); }

    getPower(): number { return -this.getVoltageDiff() * this.current; }
    getVoltageDiff(): number { return this.nodes[1].v - this.nodes[0].v; }

    // SOC is always shown as a whole percentage; getShortUnitText()/getUnitText() would
    // apply metric prefixes or decimal places that don't make sense for a percentage.
    getSocText(): string { return Math.round(this.soc * 100) + "%"; }

    getBatteryTypeName(): string {
        return (this.batteryType >= 0 && this.batteryType < BatteryElm.batteryTypeNames.length) ?
            BatteryElm.batteryTypeNames[this.batteryType] : "Custom";
    }

    getInfo(arr: string[]): void {
        arr[0] = Locale.LS("battery") + " (" + Locale.LS(this.getBatteryTypeName()) + ")";
        arr[1] = "I = " + CircuitElm.getCurrentText(this.getCurrent());
        arr[2] = "Vd = " + CircuitElm.getVoltageText(this.getVoltageDiff());
        arr[3] = "SOC = " + this.getSocText();
        arr[4] = "P = " + CircuitElm.getUnitText(this.getPower(), "W");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Battery Type", this.batteryType, -1, -1);
            ei.choice = new Choice();
            for (let i = 0; i !== BatteryElm.batteryTypeNames.length; i++)
                ei.choice.add(BatteryElm.batteryTypeNames[i]);
            ei.choice.add("Custom");
            // "Custom" is the entry after all the presets, since BT_CUSTOM isn't a valid array index
            ei.choice.select(this.batteryType === BatteryElm.BT_CUSTOM ? BatteryElm.batteryTypeNames.length : this.batteryType);
            return ei;
        }
        if (n === 1)
            return new EditInfo("Capacity (Ah)", this.capacityAh).setPositive();
        if (n === 2)
            return new EditInfo("Initial State of Charge (%)", this.initialSoc * 100, 0, 100).setDimensionless();
        if (n === 3)
            return new EditInfo("R0, Ohmic Resistance (ohms)", this.r0).setPositive();
        if (n === 4)
            return new EditInfo("R1, Polarization Resistance (ohms)", this.r1).setPositive();
        if (n === 5)
            return new EditInfo("C1, Polarization Capacitance (F)", this.c1).setPositive();
        if (n === 6) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show Voltage", (this.flags & BatteryElm.FLAG_SHOW_VOLTAGE) !== 0);
            return ei;
        }
        if (n === 7) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Show State of Charge", (this.flags & BatteryElm.FLAG_SHOW_SOC) !== 0);
            return ei;
        }
        if (n === 8 && this.batteryType === BatteryElm.BT_CUSTOM) {
            const ei = new EditInfo("SOC(%) = Voltage Table", 0);
            ei.textArea = { value: this.socVoltageTable };
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.choice != null) {
            const oldType = this.batteryType;
            const sel = ei.choice.getSelectedIndex();
            this.batteryType = (sel >= BatteryElm.batteryTypeNames.length) ? BatteryElm.BT_CUSTOM : sel;
            if (this.batteryType !== BatteryElm.BT_CUSTOM) {
                this.socVoltageTable = BatteryElm.batteryTypeTables[this.batteryType];
                if (this.batteryType !== oldType) {
                    const d = BatteryElm.batteryTypeDefaults[this.batteryType];
                    this.capacityAh = d[0];
                    this.r0 = d[1];
                    this.r1 = d[2];
                    this.c1 = d[3];
                }
            } else if (oldType !== BatteryElm.BT_CUSTOM)
                this.socVoltageTable = BatteryElm.batteryTypeTables[oldType];
            this.parseSocTable(null);
            if (this.batteryType !== oldType)
                ei.newDialog = true;
        }
        if (n === 1)
            this.capacityAh = ei.value;
        if (n === 2) {
            let v = ei.value;
            if (v < 0) v = 0;
            if (v > 100) v = 100;
            this.initialSoc = v * .01;
        }
        if (n === 3)
            this.r0 = ei.value;
        if (n === 4)
            this.r1 = ei.value;
        if (n === 5)
            this.c1 = ei.value;
        if (n === 6 && ei.checkbox != null)
            this.flags = ei.changeFlag(this.flags, BatteryElm.FLAG_SHOW_VOLTAGE);
        if (n === 7 && ei.checkbox != null)
            this.flags = ei.changeFlag(this.flags, BatteryElm.FLAG_SHOW_SOC);
        if (n === 8) {
            this.socVoltageTable = ei.textArea.element ? ei.textArea.element.value : ei.textArea.value;
            this.parseSocTable(ei);
        }
    }
}
