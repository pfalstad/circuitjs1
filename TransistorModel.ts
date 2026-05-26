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
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";

export class TransistorModel implements Editable, Comparable<TransistorModel> {

    static modelMap: Map<string, TransistorModel>;

    flags: number = 0;
    name: string;
    description: string | null = null;
    satCur: number;
    invRollOffF: number = 0;
    BEleakCur: number = 0;
    leakBEemissionCoeff: number = 1.5;
    invRollOffR: number = 0;
    BCleakCur: number = 0;
    leakBCemissionCoeff: number = 2;
    emissionCoeffF: number = 1;
    emissionCoeffR: number = 1;
    invEarlyVoltF: number = 0;
    invEarlyVoltR: number = 0;
    betaR: number = 1;

    // Junction capacitance parameters (SPICE Gummel-Poon charge storage)
    // These model the physical depletion-layer capacitance of each PN junction.
    // A real transistor junction is a thin insulating depletion region sandwiched
    // between two conducting regions -- physically identical to a parallel-plate
    // capacitor whose plate spacing (and therefore capacitance) varies with the
    // applied voltage.  Reverse bias widens the depletion layer (less capacitance);
    // forward bias narrows it (more capacitance).
    //
    // Without these, the BJT is a pure DC device -- it responds instantly to any
    // signal, no matter how fast.  With them, the transistor has a finite
    // transition frequency (ft) and exhibits the propagation delay and phase
    // shift that real transistors produce.
    //
    // SPICE formula:  C(V) = Cj0 / (1 - V/Vj)^Mj   for V < 0.5*Vj
    //                 (linear extrapolation above 0.5*Vj to avoid singularity)
    //
    // Typical values (from SPICE .model cards):
    //   2N2222A (general-purpose NPN):  CJE=22.01pF VJE=0.7  MJE=0.377
    //                                   CJC=7.306pF VJC=0.75 MJC=0.3416
    //   2N3904  (small-signal NPN):     CJE=4.493pF VJE=0.65 MJE=0.2593
    //                                   CJC=3.638pF VJC=0.75 MJC=0.3085
    //   2N3906  (small-signal PNP):     CJE=4.49pF  VJE=0.632 MJE=0.267
    //                                   CJC=4.43pF  VJC=0.632 MJC=0.33
    junctionCapBE: number = 0;                   // CJE: zero-bias BE depletion capacitance (F), 0=disabled
    junctionCapBC: number = 0;                   // CJC: zero-bias BC depletion capacitance (F), 0=disabled
    junctionPotBE: number = 0.75;                // VJE: BE built-in potential (V)
    junctionPotBC: number = 0.75;                // VJC: BC built-in potential (V)
    junctionExpBE: number = 0.33;                // MJE: BE junction grading coefficient
    junctionExpBC: number = 0.33;                // MJC: BC junction grading coefficient

    // Transit time parameters (SPICE Gummel-Poon diffusion charge storage)
    // These model the minority carrier charge stored in the base region during
    // active operation.  The diffusion capacitance Cd = TT * gm adds to the
    // depletion capacitance above, and is the dominant contributor at high
    // forward bias (where gm is large).
    //
    // Typical values (from SPICE .model cards):
    //   2N2222A:  TF=0.411ns  TR=46.91ns
    //   2N3904:   TF=0.301ns  TR=239ns
    //   2N3906:   TF=0.579ns  TR=94.36ns
    transitTimeF: number = 0;                    // TF: forward transit time (s), 0=disabled
    transitTimeR: number = 0;                    // TR: reverse transit time (s), 0=disabled

    dumped: boolean = false;
    readOnly: boolean = false;
    builtIn: boolean = false;
    internal: boolean = false;

    constructor();
    constructor(copy: TransistorModel);
    constructor(d: string, sc: number);
    constructor(dOrCopy?: string | TransistorModel, sc?: number) {
        if (dOrCopy === undefined) {
            // default constructor
            this.updateModel();
        } else if (dOrCopy instanceof TransistorModel) {
            // copy constructor
            const copy = dOrCopy;
            this.flags = copy.flags;
            this.satCur = copy.satCur;
            this.invRollOffF = copy.invRollOffF;
            this.BEleakCur = copy.BEleakCur;
            this.leakBEemissionCoeff = copy.leakBEemissionCoeff;
            this.invRollOffR = copy.invRollOffR;
            this.BCleakCur = copy.BCleakCur;
            this.leakBCemissionCoeff = copy.leakBCemissionCoeff;
            this.emissionCoeffF = copy.emissionCoeffF;
            this.emissionCoeffR = copy.emissionCoeffR;
            this.invEarlyVoltF = copy.invEarlyVoltF;
            this.invEarlyVoltR = copy.invEarlyVoltR;
            this.betaR = copy.betaR;
            this.junctionCapBE = copy.junctionCapBE;
            this.junctionPotBE = copy.junctionPotBE;
            this.junctionExpBE = copy.junctionExpBE;
            this.junctionCapBC = copy.junctionCapBC;
            this.junctionPotBC = copy.junctionPotBC;
            this.junctionExpBC = copy.junctionExpBC;
            this.transitTimeF = copy.transitTimeF;
            this.transitTimeR = copy.transitTimeR;
            this.updateModel();
        } else {
            // (description, satCur) constructor
            this.description = dOrCopy;
            this.satCur = sc!;
            this.emissionCoeffF = this.emissionCoeffR = 1;
            this.leakBEemissionCoeff = 1.5;
            this.leakBCemissionCoeff = 2;
            this.betaR = 1;
            this.junctionCapBE = 0;
            this.junctionCapBC = 0;
            this.junctionPotBE = 0.75;
            this.junctionPotBC = 0.75;
            this.junctionExpBE = 0.33;
            this.junctionExpBC = 0.33;
            this.transitTimeF = 0;
            this.transitTimeR = 0;
            this.updateModel();
        }
    }

    static getModelWithName(name: string): TransistorModel {
        TransistorModel.createModelMap();
        let lm = TransistorModel.modelMap.get(name);
        if (lm != null)
            return lm;
        lm = new TransistorModel();
        lm.name = name;
        TransistorModel.modelMap.set(name, lm);
        return lm;
    }

    static getModelWithNameOrCopy(name: string, oldmodel: TransistorModel | null): TransistorModel {
        TransistorModel.createModelMap();
        const lm = TransistorModel.modelMap.get(name);
        if (lm != null)
            return lm;
        if (oldmodel == null) {
            CirSim.console("model not found: " + name);
            return TransistorModel.getDefaultModel();
        }
        const copy = new TransistorModel(oldmodel);
        copy.name = name;
        TransistorModel.modelMap.set(name, copy);
        return copy;
    }

    static createModelMap(): void {
        if (TransistorModel.modelMap != null)
            return;
        TransistorModel.modelMap = new Map<string, TransistorModel>();
        TransistorModel.addDefaultModel("default",       new TransistorModel("default",        1e-13));
        TransistorModel.addDefaultModel("spice-default", new TransistorModel("spice-default",  1e-16));

        // for LM324v2 OpAmpRealElm
        TransistorModel.loadInternalModel("xlm324v2-qpi 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.0034482758620689655 0 1");
        TransistorModel.loadInternalModel("xlm324v2-qpi 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.0034482758620689655 0 1");
        TransistorModel.loadInternalModel("xlm324v2-qpa 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.004081632653061225 0 1");
        TransistorModel.loadInternalModel("xlm324v2-qnq 0 1e-16 200 0 1.5 0 0 2 1 1 0 0 1");
        TransistorModel.loadInternalModel("xlm324v2-qpq 0 1e-16 333.3333333333333 0 1.5 0 0 2 1 1 0 0 1");

        // for TL431
        TransistorModel.loadInternalModel("~tl431ed-qn_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
        TransistorModel.loadInternalModel("~tl431ed-qn_ed-A1.2 0 1.2e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
        TransistorModel.loadInternalModel("~tl431ed-qn_ed-A2.2 0 2.2000000000000002e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
        TransistorModel.loadInternalModel("~tl431ed-qn_ed-A0.5 0 5e-17 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");
        TransistorModel.loadInternalModel("~tl431ed-qp_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.014285714285714285 0.025 1");
        TransistorModel.loadInternalModel("~tl431ed-qn_ed-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1");

        // for LM317
        TransistorModel.loadInternalModel("~lm317-qpl-A0.1 0 1e-17 0 0 1.5 0 0 2 1 1 0.02 0 1");
        TransistorModel.loadInternalModel("~lm317-qnl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.01 0 1");
        TransistorModel.loadInternalModel("~lm317-qpl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.02 0 1");
        TransistorModel.loadInternalModel("~lm317-qnl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.01 0 1");
        TransistorModel.loadInternalModel("~lm317-qpl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.02 0 1");
        TransistorModel.loadInternalModel("~lm317-qnl-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.01 0 1");
        TransistorModel.loadInternalModel("~lm317-qnl-A50 0 5e-15 0 0 1.5 0 0 2 1 1 0.01 0 1");
    }

    static addDefaultModel(name: string, dm: TransistorModel): void {
        TransistorModel.modelMap.set(name, dm);
        dm.readOnly = dm.builtIn = true;
        dm.name = name;
    }

    static getDefaultModel(): TransistorModel {
        return TransistorModel.getModelWithName("default");
    }

    static clearDumpedFlags(): void {
        if (TransistorModel.modelMap == null)
            return;
        for (const [, tm] of TransistorModel.modelMap)
            tm.dumped = false;
    }

    static getModelList(): TransistorModel[] {
        const vector: TransistorModel[] = [];
        for (const [, tm] of TransistorModel.modelMap) {
            if (tm.internal)
                continue;
            if (!vector.includes(tm))
                vector.push(tm);
        }
        vector.sort((a, b) => a.compareTo(b));
        return vector;
    }

    compareTo(dm: TransistorModel): number {
        return this.name < dm.name ? -1 : this.name > dm.name ? 1 : 0;
    }

    getDescription(): string {
        if (this.description == null || this.description === this.name)
            return this.name;
        return this.name + " (" + Locale.LS(this.description) + ")";
    }

    static loadInternalModel(s: string): void {
        const st = new StringTokenizer(s);
        const tm = TransistorModel.undumpModel(st);
        tm.builtIn = tm.internal = true;
    }

    static undumpModel(st: StringTokenizer): TransistorModel {
        const name = CustomLogicModel.unescape(st.nextToken());
        const dm = TransistorModel.getModelWithName(name);
        dm.undump(st);
        return dm;
    }

    undump(st: StringTokenizer): void {
        this.flags = parseInt(st.nextToken());
        this.satCur = parseFloat(st.nextToken());
        this.invRollOffF = parseFloat(st.nextToken());
        this.BEleakCur = parseFloat(st.nextToken());
        this.leakBEemissionCoeff = parseFloat(st.nextToken());
        this.invRollOffR = parseFloat(st.nextToken());
        this.BCleakCur = parseFloat(st.nextToken());
        this.leakBCemissionCoeff = parseFloat(st.nextToken());
        this.emissionCoeffF = parseFloat(st.nextToken());
        this.emissionCoeffR = parseFloat(st.nextToken());
        this.invEarlyVoltF = parseFloat(st.nextToken());
        this.invEarlyVoltR = parseFloat(st.nextToken());
        this.betaR = parseFloat(st.nextToken());

        // Junction capacitance params (optional, for backward compatibility)
        try {
            this.junctionCapBE = parseFloat(st.nextToken());
            this.junctionPotBE = parseFloat(st.nextToken());
            this.junctionExpBE = parseFloat(st.nextToken());
            this.junctionCapBC = parseFloat(st.nextToken());
            this.junctionPotBC = parseFloat(st.nextToken());
            this.junctionExpBC = parseFloat(st.nextToken());
        } catch (e) {}
        try {
            this.transitTimeF = parseFloat(st.nextToken());
            this.transitTimeR = parseFloat(st.nextToken());
        } catch (e) {}

        this.updateModel();
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model Name", 0);
            ei.text = this.name == null ? "" : this.name;
            return ei;
        }
        if (n === 1) return new EditInfo("Transport Saturation Current (IS)", this.satCur);
        if (n === 2) return new EditInfo("Reverse Beta (BR)", this.betaR);
        if (n === 3) return new EditInfo("Forward Early Voltage (VAF)", 1/this.invEarlyVoltF);
        if (n === 4) return new EditInfo("Reverse Early Voltage (VAR)", 1/this.invEarlyVoltR);
        if (n === 5) return new EditInfo("Corner For Forward Beta High Current Roll-Off (IKF)", 1/this.invRollOffF);
        if (n === 6) return new EditInfo("Corner For Reverse Beta High Current Roll-Off (IKR)", 1/this.invRollOffR);
        if (n === 7) return new EditInfo("Forward Current Emission Coefficient (NF)", this.emissionCoeffF);
        if (n === 8) return new EditInfo("Reverse Current Emission Coefficient (NR)", this.emissionCoeffR);
        if (n === 9) return new EditInfo("B-E Leakage Saturation Current (ISE)", this.BEleakCur);
        if (n === 10) return new EditInfo("B-E Leakage Emission Coefficient (NE)", this.leakBEemissionCoeff);
        if (n === 11) return new EditInfo("B-C Leakage Saturation Current (ISC)", this.BCleakCur);
        if (n === 12) return new EditInfo("B-C Leakage Emission Coefficient (NC)", this.leakBCemissionCoeff);
        if (n === 13) return new EditInfo("B-E Zero-Bias Junction Capacitance (CJE)", this.junctionCapBE);
        if (n === 14) return new EditInfo("B-E Junction Potential (VJE)", this.junctionPotBE).setPositive();
        if (n === 15) return new EditInfo("B-E Junction Grading Coefficient (MJE)", this.junctionExpBE).setPositive();
        if (n === 16) return new EditInfo("B-C Zero-Bias Junction Capacitance (CJC)", this.junctionCapBC);
        if (n === 17) return new EditInfo("B-C Junction Potential (VJC)", this.junctionPotBC).setPositive();
        if (n === 18) return new EditInfo("B-C Junction Grading Coefficient (MJC)", this.junctionExpBC).setPositive();
        if (n === 19) return new EditInfo("Forward Transit Time TF (s)", this.transitTimeF);
        if (n === 20) return new EditInfo("Reverse Transit Time TR (s)", this.transitTimeR);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.name = ei.textf.value;
            if (this.name.length > 0)
                TransistorModel.modelMap.set(this.name, this);
        }
        if (n === 1) this.satCur = ei.value;
        if (n === 2) this.betaR = ei.value;
        if (n === 3) this.invEarlyVoltF = 1/ei.value;
        if (n === 4) this.invEarlyVoltR = 1/ei.value;
        if (n === 5) this.invRollOffF = 1/ei.value;
        if (n === 6) this.invRollOffR = 1/ei.value;
        if (n === 7) this.emissionCoeffF = ei.value;
        if (n === 8) this.emissionCoeffR = ei.value;
        if (n === 9) this.BEleakCur = ei.value;
        if (n === 10) this.leakBEemissionCoeff = ei.value;
        if (n === 11) this.BCleakCur = ei.value;
        if (n === 12) this.leakBCemissionCoeff = ei.value;
        if (n === 13) this.junctionCapBE = ei.value;
        if (n === 14) this.junctionPotBE = ei.value;
        if (n === 15) this.junctionExpBE = ei.value;
        if (n === 16) this.junctionCapBC = ei.value;
        if (n === 17) this.junctionPotBC = ei.value;
        if (n === 18) this.junctionExpBC = ei.value;
        if (n === 19) {
            if (ei.value >= 0) this.transitTimeF = ei.value;
            else ei.setError("must be >= 0");
        }
        if (n === 20) {
            if (ei.value >= 0) this.transitTimeR = ei.value;
            else ei.setError("must be >= 0");
        }
        this.updateModel();
        CircuitElm.app.updateModels();
    }

    updateModel(): void {
    }

    pickName(): void {
        this.name = "transistormodel";
        if (TransistorModel.modelMap.get(this.name) != null) {
            let num = 2;
            for (;; num++) {
                const n = this.name + "-" + num;
                if (TransistorModel.modelMap.get(n) == null) {
                    this.name = n;
                    break;
                }
            }
        }
        TransistorModel.modelMap.set(this.name, this);
    }

    dumpXml(doc: Document): void {
        this.dumped = true;
        const elem = doc.createElement("tm");
        CircuitXMLSerializer.dumpAttr(elem, "nm", this.name);
        CircuitXMLSerializer.dumpAttr(elem, "f", this.flags);
        CircuitXMLSerializer.dumpAttr(elem, "is", this.satCur);
        CircuitXMLSerializer.dumpAttr(elem, "ikf", this.invRollOffF);
        CircuitXMLSerializer.dumpAttr(elem, "ise", this.BEleakCur);
        CircuitXMLSerializer.dumpAttr(elem, "ne", this.leakBEemissionCoeff);
        CircuitXMLSerializer.dumpAttr(elem, "ikr", this.invRollOffR);
        CircuitXMLSerializer.dumpAttr(elem, "isc", this.BCleakCur);
        CircuitXMLSerializer.dumpAttr(elem, "nc", this.leakBCemissionCoeff);
        CircuitXMLSerializer.dumpAttr(elem, "nf", this.emissionCoeffF);
        CircuitXMLSerializer.dumpAttr(elem, "nr", this.emissionCoeffR);
        CircuitXMLSerializer.dumpAttr(elem, "vaf", this.invEarlyVoltF);
        CircuitXMLSerializer.dumpAttr(elem, "var", this.invEarlyVoltR);
        CircuitXMLSerializer.dumpAttr(elem, "br", this.betaR);
        if (this.junctionCapBE !== 0) {
            CircuitXMLSerializer.dumpAttr(elem, "cje", this.junctionCapBE);
            CircuitXMLSerializer.dumpAttr(elem, "vje", this.junctionPotBE);
            CircuitXMLSerializer.dumpAttr(elem, "mje", this.junctionExpBE);
        }
        if (this.junctionCapBC !== 0) {
            CircuitXMLSerializer.dumpAttr(elem, "cjc", this.junctionCapBC);
            CircuitXMLSerializer.dumpAttr(elem, "vjc", this.junctionPotBC);
            CircuitXMLSerializer.dumpAttr(elem, "mjc", this.junctionExpBC);
        }
        if (this.transitTimeF !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "tf", this.transitTimeF);
        if (this.transitTimeR !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "tr", this.transitTimeR);
        doc.documentElement.appendChild(elem);
    }

    static undumpModelXml(xml: CircuitXMLDeserializer): TransistorModel {
        const name = xml.parseStringAttr("nm", null);
        const tm = TransistorModel.getModelWithName(name);
        tm.undumpXml(xml);
        return tm;
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = xml.parseIntAttr("f", this.flags);
        this.satCur = xml.parseDoubleAttr("is", this.satCur);
        this.invRollOffF = xml.parseDoubleAttr("ikf", this.invRollOffF);
        this.BEleakCur = xml.parseDoubleAttr("ise", this.BEleakCur);
        this.leakBEemissionCoeff = xml.parseDoubleAttr("ne", this.leakBEemissionCoeff);
        this.invRollOffR = xml.parseDoubleAttr("ikr", this.invRollOffR);
        this.BCleakCur = xml.parseDoubleAttr("isc", this.BCleakCur);
        this.leakBCemissionCoeff = xml.parseDoubleAttr("nc", this.leakBCemissionCoeff);
        this.emissionCoeffF = xml.parseDoubleAttr("nf", this.emissionCoeffF);
        this.emissionCoeffR = xml.parseDoubleAttr("nr", this.emissionCoeffR);
        this.invEarlyVoltF = xml.parseDoubleAttr("vaf", this.invEarlyVoltF);
        this.invEarlyVoltR = xml.parseDoubleAttr("var", this.invEarlyVoltR);
        this.betaR = xml.parseDoubleAttr("br", this.betaR);
        this.junctionCapBE = xml.parseDoubleAttr("cje", this.junctionCapBE);
        this.junctionPotBE = xml.parseDoubleAttr("vje", this.junctionPotBE);
        this.junctionExpBE = xml.parseDoubleAttr("mje", this.junctionExpBE);
        this.junctionCapBC = xml.parseDoubleAttr("cjc", this.junctionCapBC);
        this.junctionPotBC = xml.parseDoubleAttr("vjc", this.junctionPotBC);
        this.junctionExpBC = xml.parseDoubleAttr("mjc", this.junctionExpBC);
        this.transitTimeF = xml.parseDoubleAttr("tf", this.transitTimeF);
        this.transitTimeR = xml.parseDoubleAttr("tr", this.transitTimeR);
        this.updateModel();
    }
}

interface Comparable<T> {
    compareTo(other: T): number;
}
