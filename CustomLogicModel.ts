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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";

export class CustomLogicModel implements Editable {
    static readonly FLAG_SCHMITT = 1;
    static modelMap: Map<string, CustomLogicModel> | null = null;

    flags: number = 0;
    name: string = "";
    inputs: string[] = [];
    outputs: string[] = [];
    infoText: string = "";
    rules: string = "";
    rulesLeft: string[] = [];
    rulesRight: string[] = [];
    dumped: boolean = false;
    triState: boolean = false;

    static getModelWithName(name: string): CustomLogicModel {
        if (CustomLogicModel.modelMap == null)
            CustomLogicModel.modelMap = new Map<string, CustomLogicModel>();
        let lm = CustomLogicModel.modelMap.get(name);
        if (lm != null)
            return lm;
        lm = new CustomLogicModel();
        lm.name = name;
        lm.infoText = (name === "default") ? "custom logic" : name;
        CustomLogicModel.modelMap.set(name, lm);
        return lm;
    }

    static getModelWithNameOrCopy(name: string, oldmodel: CustomLogicModel | null): CustomLogicModel {
        if (CustomLogicModel.modelMap == null)
            CustomLogicModel.modelMap = new Map<string, CustomLogicModel>();
        const lm = CustomLogicModel.modelMap.get(name);
        if (lm != null)
            return lm;
        const copy = new CustomLogicModel(oldmodel ?? undefined);
        copy.name = name;
        copy.infoText = name;
        CustomLogicModel.modelMap.set(name, copy);
        return copy;
    }

    static clearDumpedFlags(): void {
        if (CustomLogicModel.modelMap == null)
            return;
        for (const m of CustomLogicModel.modelMap.values())
            m.dumped = false;
    }

    constructor(copy?: CustomLogicModel) {
        if (copy === undefined) {
            this.inputs    = this.listToArray("A,B");
            this.outputs   = this.listToArray("C,D");
            this.rulesLeft  = [];
            this.rulesRight = [];
            this.rules = "";
        } else {
            this.flags     = copy.flags;
            this.inputs    = copy.inputs;
            this.outputs   = copy.outputs;
            this.infoText  = copy.infoText;
            this.rules     = copy.rules;
            this.rulesLeft  = copy.rulesLeft;
            this.rulesRight = copy.rulesRight;
        }
    }

    static undumpModel(st: { nextToken(): string }): void {
        const name = CustomLogicModel.unescape(st.nextToken());
        const model = CustomLogicModel.getModelWithName(name);
        model.undump(st);
    }

    undump(st: { nextToken(): string }): void {
        this.flags   = parseInt(st.nextToken());
        this.inputs  = this.listToArray(CustomLogicModel.unescape(st.nextToken()));
        this.outputs = this.listToArray(CustomLogicModel.unescape(st.nextToken()));
        this.infoText = CustomLogicModel.unescape(st.nextToken());
        this.rules   = CustomLogicModel.unescape(st.nextToken());
        this.parseRules(null);
    }

    static undumpModelXml(xml: CircuitXMLDeserializer): void {
        const name = xml.parseStringAttr("nm", null);
        const model = CustomLogicModel.getModelWithName(name!);
        model.undumpXml(xml);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags   = xml.parseIntAttr("f", this.flags);
        this.inputs  = this.listToArray(xml.parseStringAttr("in", null) ?? "");
        this.outputs = this.listToArray(xml.parseStringAttr("o", null) ?? "");
        this.infoText = xml.parseStringAttr("if", null) ?? "";
        this.rules   = (xml.parseContents() ?? "").trim();
        this.parseRules(null);
    }

    arrayToList(arr: string[] | null): string {
        if (arr == null || arr.length === 0)
            return "";
        return arr.join(",");
    }

    listToArray(arr: string): string[] {
        return arr.split(",");
    }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Inputs", 0, -1, -1);
            ei.text = this.arrayToList(this.inputs);
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("Outputs", 0, -1, -1);
            ei.text = this.arrayToList(this.outputs);
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("Info Text", 0, -1, -1);
            ei.text = this.infoText;
            return ei;
        }
        if (n === 3) {
            const ei = new EditInfo(EditInfo.makeLink("customlogic.html", "Definition"), 0, -1, -1);
            ei.setErrorFieldName("Definition");
            ei.textArea = { value: this.rules };
            return ei;
        }
        /*
         * not implemented
        if (n === 4) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Schmitt", (this.flags & CustomLogicModel.FLAG_SCHMITT) !== 0);
            return ei;
        }
        */
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0)
            this.inputs  = this.listToArray(ei.textf!.value);
        if (n === 1)
            this.outputs = this.listToArray(ei.textf!.value);
        if (n === 2)
            this.infoText = ei.textf!.value;
        if (n === 3) {
            this.rules = (ei.textArea.element as HTMLTextAreaElement).value;
            this.parseRules(ei);
        }
        if (n === 4) {
            if (ei.checkbox!.getState())
                this.flags |= CustomLogicModel.FLAG_SCHMITT;
            else
                this.flags &= ~CustomLogicModel.FLAG_SCHMITT;
        }
        CirSim.theApp.updateModels();
    }

    parseRules(ei: EditInfo | null): void {
        const lines = this.rules.split("\n");
        this.rulesLeft  = [];
        this.rulesRight = [];
        this.triState = false;
        for (let i = 0; i !== lines.length; i++) {
            const s = lines[i].toLowerCase().trim();
            if (s.length === 0 || s.startsWith("#"))
                continue;
            const s0 = s.replace(/ /g, "").split("=");
            if (s0.length !== 2) {
                if (ei != null)
                    ei.setError("error on line " + (i + 1));
                return;
            }
            if (s0[0].length < this.inputs.length) {
                if (ei != null)
                    ei.setError("must have >= " + this.inputs.length + " digits on left side (line " + (i + 1) + ")");
                return;
            }
            if (s0[0].length > this.inputs.length + this.outputs.length) {
                if (ei != null)
                    ei.setError("must have <= " + (this.inputs.length + this.outputs.length) + " digits on left side (line " + (i + 1) + ")");
                return;
            }
            if (s0[1].length !== this.outputs.length) {
                if (ei != null)
                    ei.setError("must have " + this.outputs.length + " digits on right side (line " + (i + 1) + ")");
                return;
            }
            const rl = s0[0];
            const used: boolean[] = new Array(26).fill(false);
            let newRl = "";
            for (let j = 0; j !== rl.length; j++) {
                const x = rl.charCodeAt(j);
                const xc = rl.charAt(j);
                if (xc === '?' || xc === '+' || xc === '-' || xc === '0' || xc === '1') {
                    newRl += xc;
                    continue;
                }
                if (xc < 'a' || xc > 'z') {
                    if (ei != null)
                        ei.setError("error on line " + (i + 1));
                    return;
                }
                // if a letter appears twice, capitalize it the 2nd time so we can compare
                const idx = x - 'a'.charCodeAt(0);
                if (used[idx]) {
                    newRl += xc.toUpperCase();
                    continue;
                }
                used[idx] = true;
                newRl += xc;
            }
            const rr = s0[1];
            if (rr.includes("_"))
                this.triState = true;
            this.rulesLeft.push(newRl);
            this.rulesRight.push(rr);
        }
    }

    dumpXml(doc: Document): void {
        this.dumped = true;
        const elem = doc.createElement("clm");
        CircuitXMLSerializer.dumpAttr(elem, "nm", this.name);
        CircuitXMLSerializer.dumpAttr(elem, "f",  this.flags);
        CircuitXMLSerializer.dumpAttr(elem, "in", this.arrayToList(this.inputs));
        CircuitXMLSerializer.dumpAttr(elem, "o",  this.arrayToList(this.outputs));
        CircuitXMLSerializer.dumpAttr(elem, "if", this.infoText);
        elem.appendChild(doc.createTextNode(this.rules));
        doc.documentElement.appendChild(elem);
    }

    static escape(s: string): string {
        if (s.length === 0)
            return "\\0";
        return s.replace(/\\/g, "\\\\")
                .replace(/\n/g, "\\n")
                .replace(/ /g, "\\s")
                .replace(/\+/g, "\\p")
                .replace(/=/g, "\\q")
                .replace(/#/g, "\\h")
                .replace(/&/g, "\\a")
                .replace(/\r/g, "\\r");
    }

    static unescape(s: string): string {
        if (s === "\\0")
            return "";
        let i = 0;
        while (i < s.length) {
            if (s.charAt(i) === '\\') {
                const c = s.charAt(i + 1);
                if (c === 'n')
                    s = s.substring(0, i) + "\n" + s.substring(i + 2);
                else if (c === 'r')
                    s = s.substring(0, i) + "\r" + s.substring(i + 2);
                else if (c === 's')
                    s = s.substring(0, i) + " " + s.substring(i + 2);
                else if (c === 'p')
                    s = s.substring(0, i) + "+" + s.substring(i + 2);
                else if (c === 'q')
                    s = s.substring(0, i) + "=" + s.substring(i + 2);
                else if (c === 'h')
                    s = s.substring(0, i) + "#" + s.substring(i + 2);
                else if (c === 'a')
                    s = s.substring(0, i) + "&" + s.substring(i + 2);
                else
                    s = s.substring(0, i) + s.substring(i + 1);
            }
            i++;
        }
        return s;
    }
}
