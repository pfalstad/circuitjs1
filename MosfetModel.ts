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
import { StringTokenizer } from "./StringTokenizer";
import { CustomLogicModel } from "./CustomLogicModel";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";
import { parseIntStrict, parseFloatStrict } from "./NumberParse";

export class MosfetModel implements Editable, Comparable<MosfetModel> {

    static modelMap: Map<string, MosfetModel>;

    static readonly FLAG_JFET = 1;

    flags: number = 0;
    name: string;
    description: string | null;
    threshold: number;              // Vt: threshold voltage (V)
    beta: number;                   // transconductance parameter (A/V^2)
    lambda: number = 0;             // channel-length modulation (1/V), 0=ideal
    capGS: number = 0;              // Cgs: gate-source capacitance (F), 0=disabled
    capGD: number = 0;              // Cgd: gate-drain capacitance (F), 0=disabled

    // these describe how parts using this model are drawn/simulated; they were formerly
    // per-element (or, worse, circuit-wide) flags, but they really describe the physical
    // part, e.g. whether it exposes a 4th body terminal or has a body diode, so they belong
    // on the model.  Not used for JFETs (isJfet() true), which never show the bulk/body.
    showBulk: boolean = false;
    digitalSymbol: boolean = false;          // draw as a simple digital-logic symbol (only if !showBulk)
    bodyDiode: boolean = false;              // simulate the parasitic body diode (only if showBulk)
    bodyTerminal: boolean = false;           // expose the body as a 4th terminal (only if bodyDiode)
    showBodyDiodeSymbol: boolean = false;    // draw the body diode symbol (only if bodyDiode)

    dumped: boolean = false;
    readOnly: boolean = false;
    builtIn: boolean = false;
    internal: boolean = false;
    // true if this model was synthesized from an old circuit file's inline per-element
    // vt/beta values rather than picked/created by the user; see DiodeModel.oldStyle
    oldStyle: boolean = false;

    constructor();
    constructor(copy: MosfetModel);
    constructor(d: string, vt: number, b: number);
    constructor(dOrCopy?: string | MosfetModel, vt?: number, b?: number) {
        if (dOrCopy === undefined) {
            this.threshold = 1.5;
            this.beta = .02;
            this.showBulk = true;
            this.bodyDiode = true;
        } else if (dOrCopy instanceof MosfetModel) {
            const copy = dOrCopy;
            this.flags = copy.flags;
            this.threshold = copy.threshold;
            this.beta = copy.beta;
            this.lambda = copy.lambda;
            this.capGS = copy.capGS;
            this.capGD = copy.capGD;
            this.showBulk = copy.showBulk;
            this.digitalSymbol = copy.digitalSymbol;
            this.bodyDiode = copy.bodyDiode;
            this.bodyTerminal = copy.bodyTerminal;
            this.showBodyDiodeSymbol = copy.showBodyDiodeSymbol;
        } else {
            this.description = dOrCopy;
            this.threshold = vt!;
            this.beta = b!;
            this.showBulk = true;
            this.bodyDiode = true;
        }
    }

    // is this a model meant for use by JfetElm (vs. MosfetElm)?  JFETs and MOSFETs share this
    // one model class since the only real difference between them is which default parameter
    // values make sense; this flag is just used to filter the model-picker dropdown per element type.
    isJfet(): boolean { return (this.flags & MosfetModel.FLAG_JFET) !== 0; }

    setJfet(): MosfetModel {
        this.flags |= MosfetModel.FLAG_JFET;
        return this;
    }

    static getModelWithName(name: string): MosfetModel {
        MosfetModel.createModelMap();
        let lm = MosfetModel.modelMap.get(name);
        if (lm != null)
            return lm;
        lm = new MosfetModel();
        lm.name = name;
        MosfetModel.modelMap.set(name, lm);
        return lm;
    }

    static getModelWithNameOrCopy(name: string, oldmodel: MosfetModel | null, jfet: boolean): MosfetModel {
        MosfetModel.createModelMap();
        const lm = MosfetModel.modelMap.get(name);
        if (lm != null)
            return lm;
        if (oldmodel == null) {
            CirSim.console("model not found: " + name);
            return MosfetModel.getDefaultModel(jfet);
        }
        const copy = new MosfetModel(oldmodel);
        copy.name = name;
        MosfetModel.modelMap.set(name, copy);
        return copy;
    }

    static createModelMap(): void {
        if (MosfetModel.modelMap != null)
            return;
        MosfetModel.modelMap = new Map<string, MosfetModel>();

        MosfetModel.addDefaultModel("default", new MosfetModel("default", 1.5, .02));

        const noDiodeDefault = new MosfetModel("default-nodiode", 1.5, .02);
        noDiodeDefault.bodyDiode = false;
        MosfetModel.addDefaultModel("default-nodiode", noDiodeDefault);

        const bodyTerminalDefault = new MosfetModel("default-body", 1.5, .02);
        bodyTerminalDefault.bodyTerminal = true;
        MosfetModel.addDefaultModel("default-body", bodyTerminalDefault);

        const digitalDefault = new MosfetModel("default-digital", 1.5, .02);
        digitalDefault.showBulk = false;
        digitalDefault.digitalSymbol = true;
        digitalDefault.bodyDiode = false;
        MosfetModel.addDefaultModel("default-digital", digitalDefault);

        // values taken from Hayes+Horowitz p155.  JFETs never show a bulk/body terminal.
        const jfetDefault = new MosfetModel("default-jfet", -4, .00125).setJfet();
        jfetDefault.showBulk = jfetDefault.bodyDiode = false;
        MosfetModel.addDefaultModel("default-jfet", jfetDefault);
    }

    static addDefaultModel(name: string, dm: MosfetModel): void {
        MosfetModel.modelMap.set(name, dm);
        dm.readOnly = dm.builtIn = true;
        dm.name = name;
    }

    static getDefaultModel(jfet: boolean): MosfetModel {
        return MosfetModel.getModelWithName(jfet ? "default-jfet" : "default");
    }

    // Find (or create) a model matching the given legacy per-element vt/beta and drawing/behavior
    // flags, for backward compatibility with old circuit files that stored these inline per
    // element instead of by model name.
    static getModelWithParameters(vt: number, beta: number, jfet: boolean,
            showBulk: boolean, bodyDiode: boolean, bodyTerminal: boolean, digitalSymbol: boolean,
            showBodyDiodeSymbol: boolean): MosfetModel {
        MosfetModel.createModelMap();
        for (const [, mm] of MosfetModel.modelMap) {
            if (mm.isJfet() === jfet && Math.abs(mm.threshold - vt) < 1e-15 && Math.abs(mm.beta - beta) < 1e-15 &&
                mm.lambda === 0 && mm.capGS === 0 && mm.capGD === 0 &&
                mm.showBulk === showBulk && mm.bodyDiode === bodyDiode && mm.bodyTerminal === bodyTerminal &&
                mm.digitalSymbol === digitalSymbol && mm.showBodyDiodeSymbol === showBodyDiodeSymbol)
                return mm;
        }
        const baseName = "old-" + (jfet ? "jfet" : "mosfet");
        let name = baseName;
        if (MosfetModel.modelMap.get(name) != null) {
            let num = 2;
            for (;; num++) {
                const n = baseName + "-" + num;
                if (MosfetModel.modelMap.get(n) == null) {
                    name = n;
                    break;
                }
            }
        }
        const mm = MosfetModel.getModelWithName(name);
        mm.threshold = vt;
        mm.beta = beta;
        mm.showBulk = showBulk;
        mm.bodyDiode = bodyDiode;
        mm.bodyTerminal = bodyTerminal;
        mm.digitalSymbol = digitalSymbol;
        mm.showBodyDiodeSymbol = showBodyDiodeSymbol;
        if (jfet)
            mm.setJfet();
        // unlike DiodeModel's oldStyle models (whose auto-generated name embeds the value, e.g.
        // "fwdrop=0.7", so editing the value in place would make the name misleading), this
        // name ("old-mosfet-2" etc.) doesn't encode the values, so there's no harm in letting the
        // user edit it directly - matches RelayModel's oldStyle models, which are also editable.
        mm.oldStyle = true;
        return mm;
    }

    static clearDumpedFlags(): void {
        if (MosfetModel.modelMap == null)
            return;
        for (const [, mm] of MosfetModel.modelMap)
            mm.dumped = false;
    }

    // jfet selects whether to return models meant for JfetElm or for MosfetElm
    static getModelList(jfet: boolean): MosfetModel[] {
        MosfetModel.createModelMap();
        const vector: MosfetModel[] = [];
        for (const [, mm] of MosfetModel.modelMap) {
            if (mm.internal || mm.isJfet() !== jfet)
                continue;
            if (!vector.includes(mm))
                vector.push(mm);
        }
        vector.sort((a, b) => a.compareTo(b));
        return vector;
    }

    compareTo(dm: MosfetModel): number {
        return this.name < dm.name ? -1 : this.name > dm.name ? 1 : 0;
    }

    getDescription(): string {
        if (this.description == null || this.description === this.name)
            return this.name;
        return this.name + " (" + Locale.LS(this.description) + ")";
    }

    static undumpModel(st: StringTokenizer): MosfetModel {
        const name = CustomLogicModel.unescape(st.nextToken());
        const dm = MosfetModel.getModelWithName(name);
        dm.undump(st);
        return dm;
    }

    undump(st: StringTokenizer): void {
        this.flags = parseIntStrict(st.nextToken());
        this.threshold = parseFloatStrict(st.nextToken());
        this.beta = parseFloatStrict(st.nextToken());
        try {
            this.lambda = parseFloatStrict(st.nextToken());
        } catch (e) {}
        try {
            this.capGS = parseFloatStrict(st.nextToken());
            this.capGD = parseFloatStrict(st.nextToken());
        } catch (e) {}
        try {
            this.showBulk = parseIntStrict(st.nextToken()) !== 0;
            this.digitalSymbol = parseIntStrict(st.nextToken()) !== 0;
            this.bodyDiode = parseIntStrict(st.nextToken()) !== 0;
            this.bodyTerminal = parseIntStrict(st.nextToken()) !== 0;
            this.showBodyDiodeSymbol = parseIntStrict(st.nextToken()) !== 0;
        } catch (e) {}
    }

    dumpXml(doc: Document): void {
        this.dumped = true;
        const elem = doc.createElement("mm");
        CircuitXMLSerializer.dumpAttr(elem, "nm", this.name);
        CircuitXMLSerializer.dumpAttr(elem, "f", this.flags);
        CircuitXMLSerializer.dumpAttr(elem, "vt", this.threshold);
        CircuitXMLSerializer.dumpAttr(elem, "be", this.beta);
        if (this.lambda !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "la", this.lambda);
        if (this.capGS !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "cgs", this.capGS);
        if (this.capGD !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "cgd", this.capGD);
        // dumped unconditionally (not just when true) since these default to true for MOSFETs;
        // an omitted attribute would otherwise be misread as true again on reload
        CircuitXMLSerializer.dumpAttr(elem, "sb", this.showBulk ? 1 : 0);
        CircuitXMLSerializer.dumpAttr(elem, "dsy", this.digitalSymbol ? 1 : 0);
        CircuitXMLSerializer.dumpAttr(elem, "bd", this.bodyDiode ? 1 : 0);
        CircuitXMLSerializer.dumpAttr(elem, "bt", this.bodyTerminal ? 1 : 0);
        CircuitXMLSerializer.dumpAttr(elem, "sbd", this.showBodyDiodeSymbol ? 1 : 0);
        doc.documentElement.appendChild(elem);
    }

    static undumpModelXml(xml: CircuitXMLDeserializer): MosfetModel {
        const name = xml.parseStringAttr("nm", null);
        const dm = MosfetModel.getModelWithName(name);
        dm.undumpXml(xml);
        return dm;
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = xml.parseIntAttr("f", this.flags);
        this.threshold = xml.parseDoubleAttr("vt", this.threshold);
        this.beta = xml.parseDoubleAttr("be", this.beta);
        this.lambda = xml.parseDoubleAttr("la", this.lambda);
        this.capGS = xml.parseDoubleAttr("cgs", this.capGS);
        this.capGD = xml.parseDoubleAttr("cgd", this.capGD);
        this.showBulk = xml.parseIntAttr("sb", this.showBulk ? 1 : 0) !== 0;
        this.digitalSymbol = xml.parseIntAttr("dsy", this.digitalSymbol ? 1 : 0) !== 0;
        this.bodyDiode = xml.parseIntAttr("bd", this.bodyDiode ? 1 : 0) !== 0;
        this.bodyTerminal = xml.parseIntAttr("bt", this.bodyTerminal ? 1 : 0) !== 0;
        this.showBodyDiodeSymbol = xml.parseIntAttr("sbd", this.showBodyDiodeSymbol ? 1 : 0) !== 0;
    }

    getDialogTitle(): string { return "Edit " + (this.isJfet() ? "JFET" : "MOSFET") + " Model"; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model Name", 0);
            ei.text = this.name == null ? "" : this.name;
            return ei;
        }
        if (n === 1) return new EditInfo("Threshold Voltage (Vt)", this.threshold);
        if (n === 2) return new EditInfo(EditInfo.makeLink("mosfet-beta.html", "Beta"), this.beta);
        let idx = 3;
        // JFETs never show the bulk/body, so these options don't apply to jfet models
        if (!this.isJfet()) {
            if (n === idx++)
                return EditInfo.createCheckbox("Show Bulk", this.showBulk);
            if (n === idx++) {
                if (!this.showBulk)
                    return EditInfo.createCheckbox("Digital Symbol", this.digitalSymbol);
                return EditInfo.createCheckbox("Simulate Body Diode", this.bodyDiode);
            }
            if (this.showBulk && this.bodyDiode) {
                if (n === idx++)
                    return EditInfo.createCheckbox("Body Terminal", this.bodyTerminal);
                if (n === idx++)
                    return EditInfo.createCheckbox("Show Body Diode", this.showBodyDiodeSymbol);
            }
        }
        if (n === idx++) return new EditInfo("Lambda", this.lambda).setDimensionless().newColumnMethod();
        if (n === idx++) return new EditInfo("Gate-Source Capacitance (Cgs)", this.capGS);
        if (n === idx) return new EditInfo("Gate-Drain Capacitance (Cgd)", this.capGD);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.name = ei.textf.value;
            if (this.name.length > 0)
                MosfetModel.modelMap.set(this.name, this);
        }
        if (n === 1) this.threshold = ei.value;
        if (n === 2 && ei.value > 0) this.beta = ei.value;
        let idx = 3;
        if (!this.isJfet()) {
            if (n === idx++) {
                const newVal = ei.checkbox!.getState();
                if (newVal !== this.showBulk)
                    ei.newDialog = true;
                this.showBulk = newVal;
            } else if (n === idx++) {
                const newVal = ei.checkbox!.getState();
                if (!this.showBulk) {
                    if (newVal !== this.digitalSymbol)
                        ei.newDialog = true;
                    this.digitalSymbol = newVal;
                } else {
                    if (newVal !== this.bodyDiode)
                        ei.newDialog = true;
                    this.bodyDiode = newVal;
                }
            } else if (this.showBulk && this.bodyDiode && n === idx++) {
                this.bodyTerminal = ei.checkbox!.getState();
            } else if (this.showBulk && this.bodyDiode && n === idx++) {
                this.showBodyDiodeSymbol = ei.checkbox!.getState();
            }
        }
        if (n === idx) this.lambda = (ei.value >= 0) ? ei.value : this.lambda;
        else if (n === idx + 1) this.capGS = (ei.value >= 0) ? ei.value : this.capGS;
        else if (n === idx + 2) this.capGD = (ei.value >= 0) ? ei.value : this.capGD;
        CirSim.theApp.updateModels();
    }

    pickName(): void {
        this.name = this.isJfet() ? "jfetmodel" : "mosfetmodel";
        if (MosfetModel.modelMap.get(this.name) != null) {
            let num = 2;
            for (;; num++) {
                const n = this.name + "-" + num;
                if (MosfetModel.modelMap.get(n) == null) {
                    this.name = n;
                    break;
                }
            }
        }
    }
}

// TypeScript doesn't have Java's Comparable interface, so we define it locally
interface Comparable<T> {
    compareTo(other: T): number;
}
