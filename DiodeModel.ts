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
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";

export class DiodeModel implements Editable, Comparable<DiodeModel> {

    static modelMap: Map<string, DiodeModel>;

    flags: number = 0;
    name: string;
    description: string | null;
    saturationCurrent: number;
    seriesResistance: number;
    emissionCoefficient: number;
    breakdownVoltage: number;

    // used for UI code, not guaranteed to be set
    forwardVoltage: number = 0;
    forwardCurrent: number = 0;

    dumped: boolean = false;
    readOnly: boolean = false;
    builtIn: boolean = false;
    oldStyle: boolean = false;
    internal: boolean = false;
    static readonly FLAGS_SIMPLE = 1;

    // Electron thermal voltage at SPICE's default temperature of 27 C (300.15 K):
    static readonly vt = 0.025865;
    // The diode's "scale voltage", the voltage increase which will raise current by a factor of e.
    vscale: number;
    // The multiplicative equivalent of dividing by vscale (for speed).
    vdcoef: number;
    // voltage drop @ 1A
    fwdrop: number;

    constructor();
    constructor(copy: DiodeModel);
    constructor(sc: number, sr: number, ec: number, bv: number, d: string | null);
    constructor(scOrCopy?: number | DiodeModel, sr?: number, ec?: number, bv?: number, d?: string | null) {
        if (scOrCopy === undefined) {
            // default constructor
            this.saturationCurrent = 1e-14;
            this.seriesResistance = 0;
            this.emissionCoefficient = 1;
            this.breakdownVoltage = 0;
            this.updateModel();
        } else if (scOrCopy instanceof DiodeModel) {
            // copy constructor
            const copy = scOrCopy;
            this.flags = copy.flags;
            this.saturationCurrent = copy.saturationCurrent;
            this.seriesResistance = copy.seriesResistance;
            this.emissionCoefficient = copy.emissionCoefficient;
            this.breakdownVoltage = copy.breakdownVoltage;
            this.forwardCurrent = copy.forwardCurrent;
            this.updateModel();
        } else {
            // full constructor
            this.saturationCurrent = scOrCopy;
            this.seriesResistance = sr!;
            this.emissionCoefficient = ec!;
            this.breakdownVoltage = bv!;
            this.description = d!;
            this.updateModel();
        }
    }

    static getModelWithName(name: string): DiodeModel {
        DiodeModel.createModelMap();
        let lm = DiodeModel.modelMap.get(name);
        if (lm != null)
            return lm;
        lm = new DiodeModel();
        lm.name = name;
        DiodeModel.modelMap.set(name, lm);
        return lm;
    }

    static getModelWithNameOrCopy(name: string, oldmodel: DiodeModel | null): DiodeModel {
        DiodeModel.createModelMap();
        const lm = DiodeModel.modelMap.get(name);
        if (lm != null)
            return lm;
        if (oldmodel == null) {
            CirSim.console("model not found: " + name);
            return DiodeModel.getDefaultModel();
        }
//	CirSim.console("copying to " + name);
        const copy = new DiodeModel(oldmodel);
        copy.name = name;
        DiodeModel.modelMap.set(name, copy);
        return copy;
    }

    static createModelMap(): void {
        if (DiodeModel.modelMap != null)
            return;
        DiodeModel.modelMap = new Map<string, DiodeModel>();
        DiodeModel.addDefaultModel("spice-default", new DiodeModel(1e-14, 0, 1, 0, null));
        DiodeModel.addDefaultModel("default", new DiodeModel(1.7143528192808883e-7, 0, 2, 0, null));
        DiodeModel.addDefaultModel("default-zener", new DiodeModel(1.7143528192808883e-7, 0, 2, 5.6, null));

        // old default LED with saturation current that is way too small (causes numerical errors)
        DiodeModel.addDefaultModel("old-default-led", new DiodeModel(2.2349907006671927e-18, 0, 2, 0, null).setInternal());

        // default for newly created LEDs, https://www.diyaudio.com/forums/software-tools/25884-spice-models-led.html
        DiodeModel.addDefaultModel("default-led", new DiodeModel(93.2e-12, .042, 3.73, 0, null));

        DiodeModel.addDefaultModel("default-optocoupler-led", new DiodeModel(1.714e-7, 0., 4.077, 0., null));

        // https://www.allaboutcircuits.com/textbook/semiconductors/chpt-3/spice-models/
        DiodeModel.addDefaultModel("1N5711", new DiodeModel(315e-9, 2.8, 2.03, 70, "Schottky"));
        DiodeModel.addDefaultModel("1N5712", new DiodeModel(680e-12, 12, 1.003, 20, "Schottky"));

        // https://github.com/peteut/spice-models/blob/master/nxp/sbd/sbd.txt
        DiodeModel.addDefaultModel("BAT85", new DiodeModel(2.076e-7, 2.326, 1.023, 33, "Schottky"));

        // model is inaccurate
        DiodeModel.addDefaultModel("1N34", new DiodeModel(200e-12, 84e-3, 2.19, 60, "germanium").setInternal());

        DiodeModel.addDefaultModel("1N4004", new DiodeModel(18.8e-9, 28.6e-3, 2, 400, "general purpose"));

        // http://users.skynet.be/hugocoolens/spice/diodes/1n4148.htm
        DiodeModel.addDefaultModel("1N4148", new DiodeModel(4.352e-9, .6458, 1.906, 75, "switching"));
        DiodeModel.addDefaultModel("x2n2646-emitter", new DiodeModel(2.13e-11, 0, 1.8, 0, null).setInternal());

        // for TL431
        DiodeModel.loadInternalModel("~tl431ed-d_ed 0 1e-14 5 1 0 0");

        // for LM317
        DiodeModel.loadInternalModel("~lm317-dz 0 1e-14 0 1 6.3 0");
    }

    static addDefaultModel(name: string, dm: DiodeModel): void {
        DiodeModel.modelMap.set(name, dm);
        dm.readOnly = dm.builtIn = true;
        dm.name = name;
    }

    setInternal(): DiodeModel {
        this.internal = true;
        return this;
    }

    // create a new model using given parameters, keeping backward compatibility.  The method we use has problems, but we don't want to
    // change circuit behavior.  We don't do this anymore because we discovered that changing the leakage current to get a given fwdrop
    // does not work well; the leakage currents can be way too high or low.
    static getModelWithParameters(fwdrop: number, zvoltage: number): DiodeModel {
        DiodeModel.createModelMap();

        const emcoef = 2;

        // look for existing model with same parameters
        for (const [, dm] of DiodeModel.modelMap) {
            if (Math.abs(dm.fwdrop - fwdrop) < 1e-8 && dm.seriesResistance === 0 && Math.abs(dm.breakdownVoltage - zvoltage) < 1e-8 && dm.emissionCoefficient === emcoef)
                return dm;
        }

        // create a new one, converting to new parameter values
        const vscale = emcoef * DiodeModel.vt;
        const vdcoef = 1 / vscale;
        const leakage = 1 / (Math.exp(fwdrop * vdcoef) - 1);
        let name = "fwdrop=" + fwdrop;
        if (zvoltage !== 0)
            name = name + " zvoltage=" + zvoltage;
        const dm = DiodeModel.getModelWithName(name);
//	CirSim.console("got model with name " + name);
        dm.saturationCurrent = leakage;
        dm.emissionCoefficient = emcoef;
        dm.breakdownVoltage = zvoltage;
        dm.readOnly = dm.oldStyle = true;
        dm.updateModel();
        return dm;
    }

    static getDefaultModel(): DiodeModel {
        return DiodeModel.getModelWithName("default");
    }

    static loadInternalModel(s: string): void {
        const st = new StringTokenizer(s);
        const dm = DiodeModel.undumpModel(st);
        dm.builtIn = dm.internal = true;
    }

    static clearDumpedFlags(): void {
        if (DiodeModel.modelMap == null)
            return;
        for (const [, dm] of DiodeModel.modelMap)
            dm.dumped = false;
    }

    static getModelList(zener: boolean): DiodeModel[] {
        const vector: DiodeModel[] = [];
        for (const [, dm] of DiodeModel.modelMap) {
            if (dm.internal)
                continue;
            if (zener && dm.breakdownVoltage === 0)
                continue;
            if (!vector.includes(dm))
                vector.push(dm);
        }
        vector.sort((a, b) => a.compareTo(b));
        return vector;
    }

    compareTo(dm: DiodeModel): number {
        return this.name < dm.name ? -1 : this.name > dm.name ? 1 : 0;
    }

    getDescription(): string {
        if (this.description == null)
            return this.name;
        return this.name + " (" + Locale.LS(this.description) + ")";
    }

    static undumpModel(st: StringTokenizer): DiodeModel {
        const name = CustomLogicModel.unescape(st.nextToken());
        const dm = DiodeModel.getModelWithName(name);
        dm.undump(st);
        return dm;
    }

    undump(st: StringTokenizer): void {
        this.flags = parseInt(st.nextToken());
        this.saturationCurrent = parseFloat(st.nextToken());
        this.seriesResistance = parseFloat(st.nextToken());
        this.emissionCoefficient = parseFloat(st.nextToken());
        this.breakdownVoltage = parseFloat(st.nextToken());
        try {
            this.forwardCurrent = parseFloat(st.nextToken());
        } catch (e) {}
        this.updateModel();
    }

    static undumpModelXml(xml: XMLDeserializer): DiodeModel {
        const name = xml.parseStringAttr("nm", null);
        const dm = DiodeModel.getModelWithName(name);
        dm.undumpXml(xml);
        return dm;
    }

    undumpXml(xml: XMLDeserializer): void {
        this.flags = xml.parseIntAttr("f", this.flags);
        this.saturationCurrent = xml.parseDoubleAttr("is", this.saturationCurrent);
        this.seriesResistance = xml.parseDoubleAttr("rs", this.seriesResistance);
        this.emissionCoefficient = xml.parseDoubleAttr("n", this.emissionCoefficient);
        this.breakdownVoltage = xml.parseDoubleAttr("bv", this.breakdownVoltage);
        this.forwardCurrent = xml.parseDoubleAttr("fi", this.forwardCurrent);
        this.updateModel();
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model Name", 0);
            ei.text = this.name == null ? "" : this.name;
            return ei;
        }
        if (n === 1)
            return new EditInfo("Saturation Current", this.saturationCurrent, -1, -1);
        if (this.isSimple()) {
            if (n === 2)
                return new EditInfo("Forward Voltage", this.forwardVoltage, -1, -1);
            if (n === 3)
                return new EditInfo("Current At Above Voltage (A)", this.forwardCurrent, -1, -1);
        } else {
            if (n === 2)
                return new EditInfo("Series Resistance", this.seriesResistance, -1, -1);
            if (n === 3)
                return new EditInfo(EditInfo.makeLink("diodecalc.html", "Emission Coefficient"), this.emissionCoefficient, -1, -1);
        }
        if (n === 4)
            return new EditInfo("Breakdown Voltage", this.breakdownVoltage, -1, -1);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.name = ei.textf.getText();
            if (this.name.length > 0)
                DiodeModel.modelMap.set(this.name, this);
        }
        if (n === 1)
            this.saturationCurrent = ei.value;
        if (this.isSimple()) {
            if (n === 2)
                this.forwardVoltage = ei.value;
            if (n === 3)
                this.forwardCurrent = ei.value;
            this.setEmissionCoefficient();
        } else {
            if (n === 2)
                this.seriesResistance = ei.value;
            if (n === 3)
                this.emissionCoefficient = ei.value;
        }
        if (n === 4)
            this.breakdownVoltage = Math.abs(ei.value);
        this.updateModel();
        CircuitElm.app.updateModels();
    }

    // set emission coefficient for simple mode if we have enough data
    setEmissionCoefficient(): void {
        if (this.forwardCurrent > 0 && this.forwardVoltage > 0)
            this.emissionCoefficient = (this.forwardVoltage / Math.log(this.forwardCurrent / this.saturationCurrent + 1)) / DiodeModel.vt;

        this.seriesResistance = 0;
    }

    setForwardVoltage(): void {
        if (this.forwardCurrent === 0)
            this.forwardCurrent = 1;
        this.forwardVoltage = this.emissionCoefficient * DiodeModel.vt * Math.log(this.forwardCurrent / this.saturationCurrent + 1);
    }

    updateModel(): void {
        this.vscale = this.emissionCoefficient * DiodeModel.vt;
        this.vdcoef = 1 / this.vscale;
        this.fwdrop = Math.log(1 / this.saturationCurrent + 1) * this.emissionCoefficient * DiodeModel.vt;
    }

    dump(): string {
        this.dumped = true;
        return "34 " + CustomLogicModel.escape(this.name) + " " + this.flags + " " + this.saturationCurrent + " " + this.seriesResistance + " " + this.emissionCoefficient + " " + this.breakdownVoltage + " " + this.forwardCurrent;
    }

    dumpXml(doc: Document): void {
        this.dumped = true;
        const elem = doc.createElement("dm");
        XMLSerializer.dumpAttr(elem, "nm", this.name);
        XMLSerializer.dumpAttr(elem, "f", this.flags);
        XMLSerializer.dumpAttr(elem, "is", this.saturationCurrent);
        XMLSerializer.dumpAttr(elem, "rs", this.seriesResistance);
        XMLSerializer.dumpAttr(elem, "n", this.emissionCoefficient);
        XMLSerializer.dumpAttr(elem, "bv", this.breakdownVoltage);
        if (this.forwardCurrent > 0)
            XMLSerializer.dumpAttr(elem, "fi", this.forwardCurrent);
        doc.documentElement.appendChild(elem);
    }

    isSimple(): boolean {
        return (this.flags & DiodeModel.FLAGS_SIMPLE) !== 0;
    }

    setSimple(s: boolean): void {
        this.flags = s ? DiodeModel.FLAGS_SIMPLE : 0;
    }

    pickName(): void {
        if (this.breakdownVoltage > 0 && this.breakdownVoltage < 20)
            this.name = "zener-" + CircuitElm.showFormat.format(this.breakdownVoltage);
        else if (this.isSimple())
            this.name = "fwdrop=" + CircuitElm.showFormat.format(this.forwardVoltage);
        else
            this.name = "diodemodel";
        if (DiodeModel.modelMap.get(this.name) != null) {
            let num = 2;
            for (;; num++) {
                const n = this.name + "-" + num;
                if (DiodeModel.modelMap.get(n) == null) {
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
