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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { XMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";
import { Scrollbar } from "./UIManager";
import { Locale } from "./Locale";
import { CircuitElm } from "./CircuitElm";

export class VarRailElm extends RailElm {
    slider: Scrollbar | null = null;
    labelEl: HTMLElement | null = null;
    sliderText: string = "Voltage";

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya, VoltageElm.WF_VAR);
            this.sliderText = "Voltage";
            this.frequency = this.maxVoltage;
            this.createSlider();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            let text = st!.nextToken();
            while (st!.hasMoreTokens())
                text += ' ' + st!.nextToken();
            this.sliderText = text.replace(/%2[bB]/g, "+");
            this.createSlider();
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        XMLSerializer.dumpAttr(elem, "st", this.sliderText);
    }

    undumpXml(xml: XMLDeserializer): void {
        super.undumpXml(xml);
        this.sliderText = xml.parseStringAttr("st", this.sliderText);
        if (this.labelEl != null)
            this.labelEl.textContent = Locale.LS(this.sliderText);
        const value = Math.round((this.frequency - this.bias) * 100 / (this.maxVoltage - this.bias));
        this.slider?.setValue(value);
    }

    getDumpType(): number { return 172; }

    dump(): string {
        // encode '+' for the old text format tokenizer
        return super.dump() + " " + this.sliderText.replace(/\+/g, "%2B");
    }

    createSlider(): void {
        this.waveform = VoltageElm.WF_VAR;
        const denom = this.maxVoltage - this.bias;
        const value = denom !== 0 ? Math.round((this.frequency - this.bias) * 100 / denom) : 0;

        const lbl = document.createElement('div');
        lbl.textContent = Locale.LS(this.sliderText);
        lbl.className = 'topSpace';
        this.labelEl = lbl;
        CircuitElm.app.addWidgetToVerticalPanel(lbl);

        this.slider = new Scrollbar(Scrollbar.HORIZONTAL, value, 1, 0, 101);
        CircuitElm.app.addWidgetToVerticalPanel(this.slider.element);
    }

    getVoltage(): number {
        this.frequency = this.slider!.getValue() * (this.maxVoltage - this.bias) / 100 + this.bias;
        return this.frequency;
    }

    delete(): void {
        if (this.labelEl != null)
            CircuitElm.app.removeWidgetFromVerticalPanel(this.labelEl);
        if (this.slider != null)
            CircuitElm.app.removeWidgetFromVerticalPanel(this.slider.element);
        super.delete();
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Min Voltage", this.bias, -20, 20);
        if (n === 1)
            return new EditInfo("Max Voltage", this.maxVoltage, -20, 20);
        if (n === 2) {
            const ei = new EditInfo("Slider Text", 0, -1, -1);
            ei.text = this.sliderText;
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.bias = ei.value;
        if (n === 1)
            this.maxVoltage = ei.value;
        if (n === 2) {
            this.sliderText = ei.textf!.value;
            if (this.labelEl != null)
                this.labelEl.textContent = Locale.LS(this.sliderText);
            CircuitElm.app.setiFrameHeight();
        }
    }

    getShortcut(): number { return 0; }

    setMouseElm(v: boolean): void {
        super.setMouseElm(v);
        this.slider?.draw();
    }
}
