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

// values with sliders
import { CircuitElm } from "./CircuitElm";
import { CirSim } from "./CirSim";
import { StringTokenizer } from "./StringTokenizer";
import { CustomLogicModel } from "./CustomLogicModel";
import { Scrollbar } from "./UIManager";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";

export class Adjustable {
    elm: CircuitElm | null;
    minValue: number;
    maxValue: number;
    sliderStep: number; // step increment; 0 = continuous (no stepping)
    flags: number;
    sliderText: string;
    logarithmic: boolean;

    // null if this Adjustable has its own slider, non-null if it's sharing another one.
    sharedSlider: Adjustable | null;

    readonly FLAG_SHARED = 1;
    readonly FLAG_LOG = 2;

    // index of value in getEditInfo() list that this slider controls
    editItem: number;

    label: HTMLLabelElement | null;
    slider: Scrollbar | null;
    settingValue: boolean;

    constructor(ce: CircuitElm, item: number);
    constructor(st: StringTokenizer, sim: CirSim);
    constructor(ceOrSt: CircuitElm | StringTokenizer, itemOrSim: number | CirSim) {
        if (ceOrSt instanceof CircuitElm) {
            const ce = ceOrSt;
            const item = itemOrSim as number;
            this.minValue = 1;
            this.maxValue = 1000;
            this.flags = 0;
            this.elm = ce;
            this.editItem = item;
            this.sliderText = "";
            this.sliderStep = 0;
            this.logarithmic = false;
            this.sharedSlider = null;
            this.label = null;
            this.slider = null;
            this.settingValue = false;
            const ei = ce.getEditInfo(item);
            if (ei != null && ei.maxVal > 0) {
                this.minValue = ei.minVal;
                this.maxValue = ei.maxVal;
            }
        } else {
            // undump
            const st = ceOrSt as StringTokenizer;
            const sim = itemOrSim as CirSim;
            this.minValue = 1;
            this.maxValue = 1000;
            this.flags = 0;
            this.elm = null;
            this.editItem = 0;
            this.sliderText = "";
            this.sliderStep = 0;
            this.logarithmic = false;
            this.sharedSlider = null;
            this.label = null;
            this.slider = null;
            this.settingValue = false;
            const e = parseInt(st.nextToken());
            if (e === -1)
                return;
            try {
                let ei = st.nextToken();

                // forgot to dump a "flags" field in the initial code, so we have to do this to support backward compatibility
                if (ei.startsWith("F")) {
                    this.flags = parseInt(ei.substring(1));
                    ei = st.nextToken();
                }

                this.editItem = parseInt(ei);
                this.minValue = parseFloat(st.nextToken());
                this.maxValue = parseFloat(st.nextToken());
                if ((this.flags & this.FLAG_SHARED) !== 0) {
                    const ano = parseInt(st.nextToken());
                    this.sharedSlider = ano === -1 ? null : sim.adjustables[ano];
                }
                this.sliderText = CustomLogicModel.unescape(st.nextToken());
            } catch (ex) {}
            this.logarithmic = (this.flags & this.FLAG_LOG) !== 0;
            try {
                this.sliderStep = parseFloat(st.nextToken());
            } catch (ex) {}
            try {
                this.elm = sim.getElm(e);
            } catch (ex) {}
        }
    }

    createSlider(sim: CirSim): boolean {
        if (this.elm == null)
            return false;
        const ei = this.elm.getEditInfo(this.editItem);
        if (ei == null)
            return false;
        if (this.sharedSlider != null)
            return true;
        if (this.sliderText.length === 0)
            return false;
        const value = ei.value;
        this.createSliderWithValue(sim, value);
        return true;
    }

    createSliderWithValue(sim: CirSim, value: number): void {
        const lbl = document.createElement("label");
        lbl.textContent = this.sliderText;
        lbl.classList.add("topSpace");
        this.label = lbl;
        sim.addWidgetToVerticalPanel(lbl);
        const intValue = this.valueToSliderPosition(value);
        this.slider = new Scrollbar(Scrollbar.HORIZONTAL, intValue, 1, 0, 100);
        if (this.sliderStep > 0 && this.maxValue !== this.minValue)
            this.slider.element.step = String(this.sliderStep * 100 / (this.maxValue - this.minValue));
        this.slider.addChangeHandler(() => this.execute());
        sim.addWidgetToVerticalPanel(this.slider.element);
    }

    setSliderValue(value: number): void {
        if (this.sharedSlider != null) {
            this.sharedSlider.setSliderValue(value);
            return;
        }
        if (this.slider == null)
            return;
        const intValue = this.valueToSliderPosition(value);
        this.settingValue = true; // don't recursively set value again in execute()
        this.slider.setValue(intValue);
        this.settingValue = false;
    }

    execute(): void {
        if (this.settingValue)
            return;
        const sim = CirSim.theApp;
        for (let i = 0; i !== sim.adjustables.length; i++) {
            const adj: Adjustable = sim.adjustables[i];
            if (adj === this || adj.sharedSlider === this)
                adj.executeSlider();
        }
    }

    executeSlider(): void {
        CirSim.theApp.analyzeFlag = true;
        if (this.elm == null) return;
        const ei = this.elm.getEditInfo(this.editItem);
        if (ei == null) return;
        ei.value = this.getSliderValue();
        this.elm.setEditValue(this.editItem, ei);
        CirSim.theApp.repaint();
    }

    getSliderValue(): number {
        const val = this.sharedSlider == null
            ? (this.slider ? this.slider.getValue() : 0)
            : (this.sharedSlider.slider ? this.sharedSlider.slider.getValue() : 0);
        let result = this.sliderPositionToValue(val);
        const step = this.sharedSlider != null ? this.sharedSlider.sliderStep : this.sliderStep;
        if (step > 0)
            result = this.minValue + Math.round((result - this.minValue) / step) * step;
        return result;
    }

    // convert a value to a slider position (0-100)
    valueToSliderPosition(value: number): number {
        if (this.logarithmic && this.minValue > 0) {
            const logMin = Math.log(this.minValue);
            const logMax = Math.log(this.maxValue);
            return Math.floor((Math.log(value) - logMin) / (logMax - logMin) * 100);
        }
        return Math.floor((value - this.minValue) * 100 / (this.maxValue - this.minValue));
    }

    // convert a slider position (0-100) to a value
    sliderPositionToValue(pos: number): number {
        if (this.logarithmic && this.minValue > 0) {
            const logMin = Math.log(this.minValue);
            const logMax = Math.log(this.maxValue);
            return Math.exp(logMin + (logMax - logMin) * pos / 100);
        }
        return this.minValue + (this.maxValue - this.minValue) * pos / 100;
    }

    deleteSlider(sim: CirSim): void {
        try {
            if (this.label) sim.removeWidgetFromVerticalPanel(this.label);
            if (this.slider) sim.removeWidgetFromVerticalPanel(this.slider.element);
        } catch (e) {}
        this.label = null;
        this.slider = null;
    }

    setMouseElm(e: CircuitElm): void {
        if (this.slider != null)
            this.slider.draw();
    }

    sliderBeingShared(): boolean {
        for (let i = 0; i !== CirSim.theApp.adjustables.length; i++) {
            const adj: Adjustable = CirSim.theApp.adjustables[i];
            if (adj.sharedSlider === this)
                return true;
        }
        return false;
    }

    dump(): string {
        let ano = -1;
        if (this.sharedSlider != null)
            ano = CirSim.theApp.adjustables.indexOf(this.sharedSlider);

        let dumpFlags = 0;
        if (this.sharedSlider != null)
            dumpFlags |= this.FLAG_SHARED;
        if (this.logarithmic)
            dumpFlags |= this.FLAG_LOG;

        return CirSim.theApp.locateElm(this.elm) + " F" + dumpFlags + " " + this.editItem + " " + this.minValue + " " + this.maxValue + " " + ano + " " +
            CustomLogicModel.escape(this.sliderText) + " " + this.sliderStep;
    }

    // get the unlocalized name of the edit item this adjustable controls
    getEditItemName(): string {
        if (this.elm == null) return "";
        const ei = this.elm.getEditInfo(this.editItem);
        return ei != null ? ei.name : "";
    }

    // find the edit item index by name, falling back to the given index
    static findEditItemByName(elm: CircuitElm | null, name: string | null, fallbackIndex: number): number {
        if (elm != null && name != null && name.length > 0) {
            for (let i = 0; ; i++) {
                const ei = elm.getEditInfo(i);
                if (ei == null)
                    break;
                if (name === ei.name)
                    return i;
            }
        }
        return fallbackIndex;
    }

    dumpXml(doc: Document, root: Element, app: CirSim): void {
        const ae = doc.createElement("adj");
        CircuitXMLSerializer.dumpAttr(ae, "e", app.locateElm(this.elm));
        CircuitXMLSerializer.dumpAttr(ae, "ei", this.editItem);
        CircuitXMLSerializer.dumpAttr(ae, "en", this.getEditItemName());
        CircuitXMLSerializer.dumpAttr(ae, "mn", this.minValue);
        CircuitXMLSerializer.dumpAttr(ae, "mx", this.maxValue);
        CircuitXMLSerializer.dumpAttr(ae, "st", this.sliderText);
        if (this.sliderStep > 0)
            CircuitXMLSerializer.dumpAttr(ae, "stp", this.sliderStep);
        if (this.sharedSlider != null)
            CircuitXMLSerializer.dumpAttr(ae, "ss", app.adjustables.indexOf(this.sharedSlider));
        if (this.logarithmic)
            CircuitXMLSerializer.dumpAttr(ae, "log", 1);
        root.appendChild(ae);
    }

    static undumpXml(xml: CircuitXMLDeserializer, app: CirSim): void {
        const e = xml.parseIntAttr("e", -1);
        if (e === -1)
            return;
        const ei = xml.parseIntAttr("ei", 0);
        const en = xml.parseStringAttr("en", null);
        const elm = app.getElm(e);
        const item = Adjustable.findEditItemByName(elm, en, ei);
        const adj = new Adjustable(elm, item);
        adj.minValue  = xml.parseDoubleAttr("mn", 1);
        adj.maxValue  = xml.parseDoubleAttr("mx", 1000);
        adj.sliderText = xml.parseStringAttr("st", "") ?? "";
        adj.sliderStep = xml.parseDoubleAttr("stp", 0);
        const ss = xml.parseIntAttr("ss", -1);
        if (ss !== -1)
            adj.sharedSlider = app.adjustables[ss];
        adj.logarithmic = xml.parseIntAttr("log", 0) !== 0;
        app.adjustables.push(adj);
    }

    // reorder adjustables so that items with sliders come first in the list, followed by items that reference them.
    // this simplifies the UI code, and also makes it much easier to dump/undump the adjustables list, since we will
    // always be undumping the adjustables with sliders first, then the adjustables that reference them.
    static reorderAdjustables(): void {
        const newList: Adjustable[] = [];
        const oldList: Adjustable[] = CirSim.theApp.adjustables;
        for (let i = 0; i !== oldList.length; i++) {
            if (oldList[i].sharedSlider == null)
                newList.push(oldList[i]);
        }
        for (let i = 0; i !== oldList.length; i++) {
            if (oldList[i].sharedSlider != null)
                newList.push(oldList[i]);
        }
        CirSim.theApp.adjustables = newList;
    }
}

// Register on window so CircuitXMLDeserializer and CircuitLoader can access without a circular import
(window as any).Adjustable = Adjustable;
