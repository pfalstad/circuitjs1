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

// GWT conversion (c) 2015 by Iain Sharp

// For information about the theory behind this, see Electronic Circuit & System Simulation Methods by Pillage
// or https://github.com/sharpie7/circuitjs1/blob/master/INTERNALS.md

import { CirSim } from "./CirSim";
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class CircuitXMLSerializer {
    app: CirSim;

    constructor(app: CirSim) { this.app = app; }

    static escapeXml(s: string): string {
        return s.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
    }

    static prettyPrint(doc: Document): string {
        return CircuitXMLSerializer.prettyPrintNode(doc.documentElement, 0);
    }

    private static prettyPrintNode(node: Node, indent: number): string {
        let sb = "";
        const indentStr = "  ".repeat(indent);

        // Print opening tag
        sb += indentStr + "<" + node.nodeName;

        // Add attributes
        if (node.nodeType === Node.ELEMENT_NODE) {
            const elem = node as Element;
            for (let i = 0; i < elem.attributes.length; i++) {
                const attr = elem.attributes[i];
                sb += " " + attr.name + "=\"" + CircuitXMLSerializer.escapeXml(attr.value) + "\"";
            }
        }

        const children = node.childNodes;
        if (children.length === 0) {
            // Self-closing tag if no children
            sb += "/>\n";
        } else {
            sb += ">";

            // Recursively process children
            let hasElementChildren = false;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (!hasElementChildren)
                        sb += "\n";
                    hasElementChildren = true;
                    sb += CircuitXMLSerializer.prettyPrintNode(child, indent + 1);
                } else if (child.nodeType === Node.TEXT_NODE) {
                    const text = (child.nodeValue ?? "").trim();
                    if (text !== "")
                        sb += CircuitXMLSerializer.escapeXml(text);
                }
            }

            // Closing tag — indent if we had element children
            if (hasElementChildren)
                sb += indentStr;
            sb += "</" + node.nodeName + ">\n";
        }

        return sb;
    }

    // true while making a comparison dump, for checking whether the circuit has changed since
    // it was loaded or saved.  that leaves out simulation state and scopes (whose settings drift
    // as they run: auto scale, plot speed), the sidebar sliders, and anything else that is just
    // operating the circuit rather than changing it (elements check this, e.g. switch positions)
    static comparing = false;

    dumpCircuit(comparing: boolean = false): string {
        const prev = CircuitXMLSerializer.comparing;
        CircuitXMLSerializer.comparing = comparing;
        try {
            return this.dumpCircuitInner();
        } finally {
            CircuitXMLSerializer.comparing = prev;
        }
    }

    private dumpCircuitInner(): string {
        const comparing = CircuitXMLSerializer.comparing;
        const doc = document.implementation.createDocument(null, "cir", null);
        const root = doc.documentElement;

        const menus = this.app.menus;
        let f = (menus.dotsCheckItem.getState()) ? 1 : 0;
        f |= (menus.smallGridCheckItem.getState()) ? 2 : 0;
        f |= (menus.voltsCheckItem.getState()) ? 0 : 4;
        f |= (menus.powerCheckItem.getState()) ? 8 : 0;
        f |= (menus.showValuesCheckItem.getState()) ? 0 : 16;
        // 32 = linear scale in afilter
        const sim = this.app.sim;
        f |= sim.adjustTimeStep ? 64 : 0;
        f |= this.app.autoDCOnReset ? 128 : 0;
        CircuitXMLSerializer.dumpAttr(root, "f", f);
        CircuitXMLSerializer.dumpAttr(root, "ts", sim.maxTimeStep);
        const ui = this.app.ui;
        if (!comparing) {
            CircuitXMLSerializer.dumpAttr(root, "ic", this.app.getIterCount());
            CircuitXMLSerializer.dumpAttr(root, "cb", ui.currentBar.getValue());
            CircuitXMLSerializer.dumpAttr(root, "pb", ui.powerBar.getValue());
        }
        CircuitXMLSerializer.dumpAttr(root, "vr", CircuitElm.voltageRange);
        CircuitXMLSerializer.dumpAttr(root, "mts", sim.minTimeStep);
        if (sim.solverType !== 0)
            CircuitXMLSerializer.dumpAttr(root, "st", sim.solverType);

        for (const ce of this.app.elmList) {
            const elem = doc.createElement(ce.getXmlDumpType());
            ce.dumpXml(doc, elem);
            if (!comparing)
                ce.dumpXmlState(doc, elem);
            else
                this.removeSliderControlledAttrs(ce, elem, doc);
            root.appendChild(elem);
        }
        const sm = this.app.scopeManager;
        if (!comparing)
            for (let i = 0; i !== sm.scopeCount; i++)
                sm.scopes[i].dumpXml(doc, root);
        for (let i = 0; i !== this.app.adjustables.length; i++)
            this.app.adjustables[i].dumpXml(doc, root, this.app);
        if (this.app.hintType !== -1) {
            const h = doc.createElement("h");
            CircuitXMLSerializer.dumpAttr(h, "t", this.app.hintType);
            CircuitXMLSerializer.dumpAttr(h, "i1", this.app.hintItem1);
            CircuitXMLSerializer.dumpAttr(h, "i2", this.app.hintItem2);
            root.appendChild(h);
        }
        return CircuitXMLSerializer.prettyPrint(doc);
    }

    // for a comparison dump: leave out the values that sliders (see Adjustable) control, so
    // moving a slider doesn't count as a change.  we don't know which attributes an edit item
    // is saved in, so find out by moving the value on a copy of the element and seeing which
    // attributes change.  (if that fails, the attributes stay, and moving the slider counts.)
    // this can't tell a slider move from other edits, so typing a new value for something that
    // has a slider (in the edit dialog, say) doesn't count as a change either.
    private removeSliderControlledAttrs(ce: CircuitElm, elem: Element, doc: Document): void {
        const adjs = this.app.adjustables.filter((a: any) => a.elm === ce);
        if (adjs.length === 0)
            return;
        const orig = elem.cloneNode(true) as Element;
        const remove = new Set<string>();
        for (const adj of adjs) {
            let copy: CircuitElm | null = null;
            try {
                const className = CirSim.xmlDumpTypeMap.get(orig.tagName);
                copy = className != null ? this.app.constructElement(className, 0, 0) : null;
                if (copy == null)
                    continue;
                const xml = new CircuitXMLDeserializer(this.app);
                xml.currentXmlElement = orig;
                xml.currentElm = copy;
                copy.undumpXml(xml);
                copy.allocNodes();
                copy.setPositionFromXml(orig);
                const ei = copy.getEditInfo(adj.editItem);
                if (ei == null || ei.text != null)
                    continue;
                ei.value = (ei.value !== adj.maxValue) ? adj.maxValue : adj.minValue;
                if (ei.value === adj.maxValue && ei.value === adj.minValue)
                    ei.value = ei.value * 2 + 1;
                ei.continuous = true;
                copy.setEditValue(adj.editItem, ei);
                const moved = doc.createElement(orig.tagName);
                copy.dumpXml(doc, moved);
                for (const a of Array.from(orig.attributes))
                    if (moved.getAttribute(a.name) !== a.value)
                        remove.add(a.name);
                for (const a of Array.from(moved.attributes))
                    if (orig.getAttribute(a.name) === null)
                        remove.add(a.name);
            } catch (e) {
                console.log("can't find slider attribute: " + e);
            } finally {
                try { copy?.delete(); } catch (e) { /* ignore */ }
            }
        }
        for (const name of remove)
            elem.removeAttribute(name);
    }

    static checkAttr(elem: Element, name: string): void {
        if (elem.getAttribute(name) !== null)
            throw new Error("naming conflict: " + name);
    }

    static dumpAttr(elem: Element, name: string, value: string | number | boolean): void {
        CircuitXMLSerializer.checkAttr(elem, name);
        if (typeof value === "string") {
            value = value.replace(/&/g, "&amp;")
                         .replace(/"/g, "&quot;")
                         .replace(/'/g, "&apos;")
                         .replace(/</g, "&lt;");  // `>` doesn't need escaping
        }
        elem.setAttribute(name, String(value));
    }
}
