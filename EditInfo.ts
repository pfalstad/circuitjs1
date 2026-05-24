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

import { Checkbox } from "./Checkbox";
import { Choice } from "./Choice";

export class EditInfo {
    name: string = "";
    text: string | null = null;
    value: number = 0;
    dimensionless: boolean = false;
    noSliders: boolean = false;
    isColor: boolean = false;
    newColumn: boolean = false;
    positive: boolean = false;
    minVal: number = 0;
    maxVal: number = 0;
    error: string | null = null;
    errorFieldName: string | null = null;
    checkbox: Checkbox | null = null;
    choice: Choice | null = null;
    button: any = null;
    textArea: any = null;
    widget: any = null;
    newDialog: boolean = false;
    textf: any = null;
    loadFile: any = null;
    minBox: any = null;
    maxBox: any = null;
    labelBox: any = null;
    stepBox: any = null;

    constructor(name: string, val: number, mn?: number, mx?: number);
    constructor(name: string, txt: string);
    constructor(name: string, valOrTxt: number | string, mn?: number, mx?: number) {
        this.name = name;
        if (typeof valOrTxt === "string") {
            this.text = valOrTxt;
            this.dimensionless = true;
            this.noSliders = true;
        } else {
            this.value = valOrTxt;
            if (mn !== undefined) this.minVal = mn;
            if (mx !== undefined) this.maxVal = mx;
        }
    }

    static createCheckbox(name: string, flag: boolean): EditInfo {
        const ei = new EditInfo("", 0, -1, -1);
        ei.checkbox = new Checkbox(name, flag);
        return ei;
    }

    setDimensionless(): EditInfo { this.dimensionless = true; return this; }
    disallowSliders(): EditInfo { this.noSliders = true; return this; }
    setIsColor(): EditInfo { this.isColor = true; return this; }
    newColumnMethod(): EditInfo { this.newColumn = true; return this; }
    changeFlag(flags: number, bit: number): number {
        if (this.checkbox.getState())
            return flags | bit;
        return flags & ~bit;
    }
    changeFlagInverted(flags: number, bit: number): number {
        if (!this.checkbox.getState())
            return flags | bit;
        return flags & ~bit;
    }
    setError(s: string): void { this.error = s; }
    setErrorFieldName(s: string): EditInfo { this.errorFieldName = s; return this; }
    setPositive(): EditInfo { this.positive = true; return this; }

    canCreateAdjustable(): boolean {
        return this.choice == null && this.checkbox == null && this.button == null &&
            this.textArea == null && this.widget == null && !this.noSliders;
    }

    static makeLink(file: string, text: string): string {
        return `<a href="${file}" target="_blank">${text}</a>`;
    }
}
