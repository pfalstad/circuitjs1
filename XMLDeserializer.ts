/*
    Copyright (C) Paul Falstad

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

import { CirSim } from "./CirSim";
import { CircuitElm } from "./CircuitElm";
import { CircuitLoader } from "./CircuitLoader";
import { DiodeModel } from "./DiodeModel";
import { RelayModel } from "./RelayModel";
import { TransistorModel } from "./TransistorModel";
import { CustomLogicModel } from "./CustomLogicModel";
import { Scope } from "./Scope";

export class XMLDeserializer {
    app: CirSim;
    currentXmlElement: Element;
    currentElm: CircuitElm | null = null;

    constructor(app: CirSim) { this.app = app; }

    readCircuit(text: string, readFlags: number): void {
        const doc = new DOMParser().parseFromString(text, "text/xml");
        const root = doc.documentElement;

        if ((readFlags & CircuitLoader.RC_RETAIN) === 0)
            this.app.clearCircuit();
        this.currentXmlElement = root;

        if ((readFlags & CircuitLoader.RC_RETAIN) === 0) {
            const flags = this.parseIntAttr("f", 0);
            this.app.loader.readCircuitFlags(flags);
            const sim = this.app.sim;
            sim.maxTimeStep = sim.timeStep = this.parseDoubleAttr("ts", sim.maxTimeStep);
            const sp  = this.parseDoubleAttr("ic", this.app.getIterCount());
            const sp2 = Math.trunc(Math.log(10 * sp) * 24 + 61.5);
            const ui  = this.app.ui;
            ui.speedBar.setValue(sp2);
            ui.currentBar.setValue(this.parseIntAttr("cb", ui.currentBar.getValue()));
            CircuitElm.voltageRange = this.parseDoubleAttr("vr", CircuitElm.voltageRange);
            ui.powerBar.setValue(this.parseIntAttr("pb", ui.powerBar.getValue()));
            sim.minTimeStep = this.parseDoubleAttr("mts", sim.minTimeStep);
            sim.solverType  = this.parseIntAttr("st", sim.solverType);
            this.app.setGrid();
        }

        this.readElements(root);
        this.app.loader.finishReadCircuit(readFlags);
    }

    // read elements from an already-parsed XML document (e.g. from CustomCompositeModel.elmDoc)
    readCircuitFromDoc(doc: Document): void {
        this.app.clearCircuit();
        this.readElements(doc.documentElement);
        this.app.loader.finishReadCircuit(0);
    }

    readElements(root: Element): void {
        const children = root.childNodes;

        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.nodeType !== Node.ELEMENT_NODE)
                continue;

            const elem    = node as Element;
            const tagName = elem.tagName;

            if (tagName === "o") {
                const sc = new Scope(this.app, this.app.sim);
                this.currentXmlElement = elem;
                sc.undumpXml(this);
                this.app.scopeManager.addScope(sc);
                continue;
            }
            if (tagName === "dm") {
                this.currentXmlElement = elem;
                DiodeModel.undumpModelXml(this);
                continue;
            }
            if (tagName === "rlm") {
                this.currentXmlElement = elem;
                RelayModel.undumpModelXml(this);
                continue;
            }
            if (tagName === "tm") {
                this.currentXmlElement = elem;
                TransistorModel.undumpModelXml(this);
                continue;
            }
            if (tagName === "clm") {
                this.currentXmlElement = elem;
                CustomLogicModel.undumpModelXml(this);
                continue;
            }
            if (tagName === "ccm") {
                this.currentXmlElement = elem;
                // (window as any).CustomCompositeModel?.undumpModelXml(this); TODO
                continue;
            }
            if (tagName === "h") {
                this.currentXmlElement = elem;
                this.app.hintType  = this.parseIntAttr("t", -1);
                this.app.hintItem1 = this.parseIntAttr("i1", 0);
                this.app.hintItem2 = this.parseIntAttr("i2", 0);
                continue;
            }
            if (tagName === "adj") {
                this.currentXmlElement = elem;
                (window as any).Adjustable?.undumpXml(this, this.app);
                continue;
            }
            if (tagName === "test") {
                const tm = (window as any).TestManager?.theManager;
                if (tm != null) {
                    this.currentXmlElement = elem;
                    tm.saveTestTag(this.parseDoubleAttr("len", -1));
                }
                continue;
            }
            if (tagName === "switchevent") {
                const tm = (window as any).TestManager?.theManager;
                if (tm != null) {
                    this.currentXmlElement = elem;
                    tm.saveSwitchEvent(this.parseDoubleAttr("t", 0), this.parseIntAttr("en", -1));
                }
                continue;
            }
            if (tagName === "scopedata") {
                const tm = (window as any).TestManager?.theManager;
                if (tm != null) {
                    this.currentXmlElement = elem;
                    const si     = this.parseIntAttr("si", -1);
                    const pi     = this.parseIntAttr("pi", -1);
                    const en     = this.parseIntAttr("en", -1);
                    const v      = this.parseIntAttr("v", 0);
                    const u      = this.parseIntAttr("u", 0);
                    const sp     = this.parseIntAttr("sp", 1);
                    const ts     = this.parseDoubleAttr("ts", 0);
                    const values = this.parseDoubleArray(this.parseContents());
                    tm.saveScopeDataTag(si, pi, en, v, u, sp, ts, values);
                }
                continue;
            }

            const x = elem.getAttribute("x");
            if (x == null)
                continue;
            const className = CirSim.xmlDumpTypeMap.get(tagName);
            if (className == null) {
                this.app.console("unrecognized xml element: " + tagName);
                continue;
            }
            const elm = this.app.constructElement(className, 0, 0);
            this.currentXmlElement = elem;
            this.currentElm = elm;
            elm.undumpXml(this);
            elm.setPositionFromXml(elem);
            this.app.elmList.push(elm);
        }
    }

    parseDoubleAttr(attr: string, def: number): number {
        const v = this.currentXmlElement.getAttribute(attr);
        if (v == null)
            return def;
        return parseFloat(v);
    }

    parseIntAttr(attr: string, def: number): number {
        const v = this.currentXmlElement.getAttribute(attr);
        if (v == null)
            return def;
        return parseInt(v);
    }

    parseBooleanAttr(attr: string, def: boolean): boolean {
        const v = this.currentXmlElement.getAttribute(attr);
        if (v == null)
            return def;
        return v === "true";
    }

    parseStringAttr(attr: string, def: string | null): string | null {
        let s = this.currentXmlElement.getAttribute(attr);
        if (s == null)
            return def;
        s = s.replace(/&quot;/g, '"')
             .replace(/&apos;/g, "'")
             .replace(/&lt;/g, "<")
             .replace(/&gt;/g, ">")
             .replace(/&amp;/g, "&");
        return s;
    }

    parseContents(): string | null {
        try {
            const child = this.currentXmlElement.firstChild;
            return child ? child.nodeValue : null;
        } catch (e) {
            return null;
        }
    }

    parseDoubleArray(text: string | null): number[] {
        if (text == null || text.trim() === "")
            return [];
        return text.trim().split(",").map(s => parseFloat(s.trim()));
    }

    getChildElements(): Element[] {
        const elements: Element[] = [];
        const children = this.currentXmlElement.childNodes;
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.nodeType === Node.ELEMENT_NODE)
                elements.push(node as Element);
        }
        return elements;
    }

    parseChildElement(elem: Element): void { this.currentXmlElement = elem; }
}
