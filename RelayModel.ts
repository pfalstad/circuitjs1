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

import type { Editable } from "./Editable";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Locale } from "./Locale";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";
import { CirSim } from "./CirSim";

interface Comparable<T> {
    compareTo(other: T): number;
}

export class RelayModel implements Editable, Comparable<RelayModel> {
    static modelMap: Map<string, RelayModel>;

    flags: number = 0;
    name: string;
    description: string | null = null;
    inductance: number;
    r_on: number;
    r_off: number;
    onCurrent: number;
    offCurrent: number;
    coilR: number;
    switchingTime: number;
    coilStyle: number;  // 0=both sides, 1=side1, 2=side2
    poleCount: number = 1;
    showBox: boolean;
    pulldown: boolean;

    dumped: boolean = false;
    readOnly: boolean = false;
    builtIn: boolean = false;
    oldStyle: boolean = false;

    constructor();
    constructor(copy: RelayModel);
    constructor(copy?: RelayModel) {
        if (copy === undefined) {
            this.inductance    = .2;
            this.r_on          = .05;
            this.r_off         = 1e6;
            this.onCurrent     = .02;
            this.offCurrent    = .015;
            this.coilR         = 20;
            this.switchingTime = 5e-3;
            this.coilStyle     = 0;
            this.showBox       = true;
            this.pulldown      = true;
        } else {
            this.flags         = copy.flags;
            this.inductance    = copy.inductance;
            this.r_on          = copy.r_on;
            this.r_off         = copy.r_off;
            this.onCurrent     = copy.onCurrent;
            this.offCurrent    = copy.offCurrent;
            this.coilR         = copy.coilR;
            this.switchingTime = copy.switchingTime;
            this.coilStyle     = copy.coilStyle;
            this.poleCount     = copy.poleCount;
            this.showBox       = copy.showBox;
            this.pulldown      = copy.pulldown;
        }
    }

    static getModelWithName(name: string): RelayModel {
        RelayModel.createModelMap();
        let lm = RelayModel.modelMap.get(name);
        if (lm != null)
            return lm;
        lm = new RelayModel();
        lm.name = name;
        RelayModel.modelMap.set(name, lm);
        return lm;
    }

    static getModelWithNameOrCopy(name: string, oldmodel: RelayModel | null): RelayModel {
        RelayModel.createModelMap();
        const lm = RelayModel.modelMap.get(name);
        if (lm != null)
            return lm;
        if (oldmodel == null) {
            CirSim.console("relay model not found: " + name);
            return RelayModel.getDefaultModel();
        }
        const copy = new RelayModel(oldmodel);
        copy.name = name;
        RelayModel.modelMap.set(name, copy);
        return copy;
    }

    static createModelMap(): void {
        if (RelayModel.modelMap != null)
            return;
        RelayModel.modelMap = new Map<string, RelayModel>();
        RelayModel.addDefaultModel("default", new RelayModel());
        const m2 = new RelayModel();
        m2.poleCount = 2;
        RelayModel.addDefaultModel("default-2-poles", m2);
        const m3 = new RelayModel();
        m3.poleCount = 3;
        RelayModel.addDefaultModel("default-3-poles", m3);
    }

    static addDefaultModel(name: string, rm: RelayModel): void {
        RelayModel.modelMap.set(name, rm);
        rm.readOnly = rm.builtIn = true;
        rm.name = name;
    }

    static getDefaultModel(): RelayModel {
        return RelayModel.getModelWithName("default");
    }

    // Create (or find) a model from old-style per-element parameters for backward compatibility.
    static getModelWithParameters(inductance: number, r_on: number, r_off: number,
            onCurrent: number, offCurrent: number, coilR: number, switchingTime: number,
            coilStyle: number, showBox: boolean, pulldown: boolean, poleCount: number): RelayModel {
        RelayModel.createModelMap();
        for (const rm of RelayModel.modelMap.values()) {
            if (Math.abs(rm.inductance    - inductance)    < 1e-15 &&
                Math.abs(rm.r_on         - r_on)          < 1e-15 &&
                Math.abs(rm.r_off        - r_off)         < 1e-15 &&
                Math.abs(rm.onCurrent    - onCurrent)     < 1e-15 &&
                Math.abs(rm.offCurrent   - offCurrent)    < 1e-15 &&
                Math.abs(rm.coilR        - coilR)         < 1e-15 &&
                Math.abs(rm.switchingTime - switchingTime) < 1e-15 &&
                rm.coilStyle === coilStyle &&
                rm.showBox   === showBox   &&
                rm.pulldown  === pulldown  &&
                rm.poleCount === poleCount)
                return rm;
        }
        const baseName = "old-relay";
        let name = baseName;
        if (RelayModel.modelMap.get(name) != null) {
            let num = 2;
            for (;; num++) {
                const n = baseName + "-" + num;
                if (RelayModel.modelMap.get(n) == null) {
                    name = n;
                    break;
                }
            }
        }
        const rm = RelayModel.getModelWithName(name);
        rm.inductance    = inductance;
        rm.r_on          = r_on;
        rm.r_off         = r_off;
        rm.onCurrent     = onCurrent;
        rm.offCurrent    = offCurrent;
        rm.coilR         = coilR;
        rm.switchingTime = switchingTime;
        rm.coilStyle     = coilStyle;
        rm.showBox       = showBox;
        rm.pulldown      = pulldown;
        rm.poleCount     = poleCount;
        rm.oldStyle      = true;
        return rm;
    }

    static clearDumpedFlags(): void {
        if (RelayModel.modelMap == null)
            return;
        for (const rm of RelayModel.modelMap.values())
            rm.dumped = false;
    }

    static getModelList(): RelayModel[] {
        const list: RelayModel[] = [];
        for (const rm of RelayModel.modelMap.values()) {
            if (!list.includes(rm))
                list.push(rm);
        }
        list.sort((a, b) => a.compareTo(b));
        return list;
    }

    compareTo(rm: RelayModel): number {
        return this.name.localeCompare(rm.name);
    }

    getDescription(): string {
        if (this.description == null)
            return this.name;
        return this.name + " (" + Locale.LS(this.description) + ")";
    }

    pickName(): void {
        this.name = "relaymodel";
        if (RelayModel.modelMap.get(this.name) != null) {
            let num = 2;
            for (;; num++) {
                const n = this.name + "-" + num;
                if (RelayModel.modelMap.get(n) == null) {
                    this.name = n;
                    break;
                }
            }
        }
        RelayModel.modelMap.set(this.name, this);
    }

    dumpXml(doc: Document): void {
        this.dumped = true;
        const elem = doc.createElement("rlm");
        XMLSerializer.dumpAttr(elem, "nm", this.name);
        XMLSerializer.dumpAttr(elem, "f",   this.flags);
        XMLSerializer.dumpAttr(elem, "in",  this.inductance);
        XMLSerializer.dumpAttr(elem, "ron", this.r_on);
        XMLSerializer.dumpAttr(elem, "rof", this.r_off);
        XMLSerializer.dumpAttr(elem, "on",  this.onCurrent);
        XMLSerializer.dumpAttr(elem, "of",  this.offCurrent);
        XMLSerializer.dumpAttr(elem, "coR", this.coilR);
        XMLSerializer.dumpAttr(elem, "sw",  this.switchingTime);
        XMLSerializer.dumpAttr(elem, "cs",  this.coilStyle);
        if (this.poleCount !== 1)
            XMLSerializer.dumpAttr(elem, "po", this.poleCount);
        if (this.showBox)
            XMLSerializer.dumpAttr(elem, "sb", 1);
        if (this.pulldown)
            XMLSerializer.dumpAttr(elem, "pd", 1);
        doc.documentElement.appendChild(elem);
    }

    static undumpModelXml(xml: XMLDeserializer): RelayModel {
        const name = xml.parseStringAttr("nm", null);
        const rm = RelayModel.getModelWithName(name);
        rm.undumpXml(xml);
        return rm;
    }

    undumpXml(xml: XMLDeserializer): void {
        this.flags         = xml.parseIntAttr("f",   this.flags);
        this.inductance    = xml.parseDoubleAttr("in",  this.inductance);
        this.r_on          = xml.parseDoubleAttr("ron", this.r_on);
        this.r_off         = xml.parseDoubleAttr("rof", this.r_off);
        this.onCurrent     = xml.parseDoubleAttr("on",  this.onCurrent);
        this.offCurrent    = xml.parseDoubleAttr("of",  this.offCurrent);
        this.coilR         = xml.parseDoubleAttr("coR", this.coilR);
        this.switchingTime = xml.parseDoubleAttr("sw",  this.switchingTime);
        this.coilStyle     = xml.parseIntAttr("cs",  this.coilStyle);
        this.poleCount     = xml.parseIntAttr("po",  this.poleCount);
        this.showBox       = xml.parseIntAttr("sb",  this.showBox ? 1 : 0) !== 0;
        this.pulldown      = xml.parseIntAttr("pd",  this.pulldown ? 1 : 0) !== 0;
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model Name", 0);
            ei.text = this.name == null ? "" : this.name;
            return ei;
        }
        if (n === 1)
            return new EditInfo("Inductance (H)", this.inductance, 0, 0).setPositive();
        if (n === 2)
            return new EditInfo("On Resistance (ohms)", this.r_on, 0, 0).setPositive();
        if (n === 3)
            return new EditInfo("Off Resistance (ohms)", this.r_off, 0, 0).setPositive();
        if (n === 4)
            return new EditInfo("On Current (A)", this.onCurrent, 0, 0).setPositive();
        if (n === 5)
            return new EditInfo("Off Current (A)", this.offCurrent, 0, 0).setPositive();
        if (n === 6)
            return new EditInfo("Number of Poles", this.poleCount, 1, 4).setDimensionless();
        if (n === 7)
            return new EditInfo("Coil Resistance (ohms)", this.coilR, 0, 0).setPositive();
        if (n === 8)
            return new EditInfo("Switching Time (s)", this.switchingTime, 0, 0).setPositive();
        if (n === 9) {
            const ei = new EditInfo("Coil Style", this.coilStyle, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Both Sides");
            ei.choice.add("Side 1");
            ei.choice.add("Side 2");
            ei.choice.select(this.coilStyle);
            return ei;
        }
        if (n === 10)
            return EditInfo.createCheckbox("Show Box", this.showBox);
        if (n === 11)
            return EditInfo.createCheckbox("Pulldown Resistor", this.pulldown);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.name = ei.textf.value;
            if (this.name.length > 0)
                RelayModel.modelMap.set(this.name, this);
        }
        if (n === 1 && ei.value > 0) this.inductance    = ei.value;
        if (n === 2 && ei.value > 0) this.r_on          = ei.value;
        if (n === 3 && ei.value > 0) this.r_off         = ei.value;
        if (n === 4 && ei.value > 0) this.onCurrent     = ei.value;
        if (n === 5 && ei.value > 0) this.offCurrent    = ei.value;
        if (n === 6 && ei.value >= 1) this.poleCount    = Math.trunc(ei.value);
        if (n === 7 && ei.value > 0) this.coilR         = ei.value;
        if (n === 8 && ei.value > 0) this.switchingTime = ei.value;
        if (n === 9) this.coilStyle = ei.choice!.getSelectedIndex();
        if (n === 10) this.showBox  = ei.checkbox!.getState();
        if (n === 11) this.pulldown = ei.checkbox!.getState();
        CirSim.theApp.updateModels();
    }
}
