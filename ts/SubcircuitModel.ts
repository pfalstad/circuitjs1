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

import { ExtListEntry } from "./ExtListEntry";
import { CustomLogicModel } from "./CustomLogicModel";
import { DiodeModel } from "./DiodeModel";
import { RelayModel } from "./RelayModel";
import { TransistorModel } from "./TransistorModel";
import { MosfetModel } from "./MosfetModel";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";
import { StringTokenizer } from "./StringTokenizer";
import { HookRegistry } from "./HookRegistry";
import { ModelRegistry } from "./ModelRegistry";
import { getElmModelType } from "./ModelTypes";
import { parseIntStrict } from "./NumberParse";

// model for subcircuits

export class SubcircuitModel {
    // models loaded from circuit files are local; models saved in storage (or made global by
    // the user) are global
    static readonly registry = new ModelRegistry<SubcircuitModel>(
        () => SubcircuitModel.initModelMap(), "subcircuit:", (m, doc) => {
            const elem = doc.createElement("ccm");
            m.buildXmlElement(doc, elem);
            doc.documentElement.appendChild(elem);
        });

    flags:  number = 0;
    sizeX:  number = 0;
    sizeY:  number = 0;
    name:   string = "";
    extList: ExtListEntry[] = [];
    // XML document storing child element definitions
    elmDoc: Document | null = null;
    modelCircuit: string | null = null;
    dumped:   boolean = false;
    internal: boolean = false;  // don't show in list
    builtin:  boolean = false;  // included by default, don't allow deletion

    // changes whenever the set of models changes
    static get sequenceNumber(): number { return SubcircuitModel.registry.sequenceNumber; }
    static readonly FLAG_SHOW_LABEL = 1;

    setName(n: string): void {
        SubcircuitModel.registry.rename(this, n);
    }

    // add the built-in models (called by the registry when first used)
    private static initModelMap(): void {
        // create default stub model
        const extList: ExtListEntry[] = [];
        extList.push(new ExtListEntry("gnd", 1));
        const d = SubcircuitModel.createModelFromOldFormat("default", "0 0", "GroundElm 1", extList);
        d.sizeX = d.sizeY = 1;
        d.builtin = true;
        SubcircuitModel.registry.makeGlobal(d);

        SubcircuitModel.loadInternalModels();
    }

    static loadModelsFromStorage(): void {
        SubcircuitModel.registry.loadFromStorage((data) => {
            try {
                if (data.startsWith("<")) {
                    SubcircuitModel.loadModelFromStorage(data);
                } else {
                    let firstLine = data;
                    const lineLen = data.indexOf('\n');
                    if (lineLen !== -1) firstLine = data.substring(0, lineLen);
                    const st = new StringTokenizer(firstLine, " ");
                    if (st.nextToken() === ".") {
                        const model = SubcircuitModel.undumpModel(st);
                        if (lineLen !== -1) model.modelCircuit = data.substring(lineLen + 1);
                        // move from local to global since this is from storage
                        SubcircuitModel.registry.makeGlobal(model);
                    }
                }
            } catch (e) {
                CirSim.console("Exception: " + e);
            }
        });
    }

    static getModelWithName(name: string): SubcircuitModel | null {
        return SubcircuitModel.registry.get(name) ?? null;
    }

    // the model to load a definition into (see ModelRegistry.getForLoad)
    private static getModelForLoad(name: string): SubcircuitModel {
        return SubcircuitModel.registry.getForLoad(name, () => new SubcircuitModel());
    }

    // create model from old-style nodeList/elmDump format, converting to XML immediately
    static createModelFromOldFormat(name: string, elmDump: string, nodeList: string, extList: ExtListEntry[]): SubcircuitModel {
        const lm = new SubcircuitModel();
        lm.name = name;
        lm.extList = extList;
        lm.convertOldFormatToXml(nodeList, elmDump);
        SubcircuitModel.registry.setLocal(lm);
        return lm;
    }

    // create model with XML element doc already built
    static createModel(name: string, elmDoc: Document, extList: ExtListEntry[]): SubcircuitModel {
        const lm = new SubcircuitModel();
        lm.name = name;
        lm.elmDoc = elmDoc;
        lm.extList = extList;
        SubcircuitModel.registry.setLocal(lm);
        return lm;
    }

    static getModelList(): SubcircuitModel[] {
        const result: SubcircuitModel[] = [];
        for (const dm of SubcircuitModel.registry.models()) {
            if (!dm.internal) result.push(dm);
        }
        result.sort((a, b) => a.name.localeCompare(b.name));
        return result;
    }

    static undumpModel(st: StringTokenizer): SubcircuitModel {
        const name = CustomLogicModel.unescape(st.nextToken());
        const model = SubcircuitModel.getModelForLoad(name);
        model.undump(st);
        return model;
    }

    undump(st: StringTokenizer): void {
        this.flags = parseIntStrict(st.nextToken());
        this.sizeX = parseIntStrict(st.nextToken());
        this.sizeY = parseIntStrict(st.nextToken());
        const extCount = parseIntStrict(st.nextToken());
        this.extList = [];
        for (let i = 0; i < extCount; i++) {
            const s  = CustomLogicModel.unescape(st.nextToken());
            const n  = parseIntStrict(st.nextToken());
            const p  = parseIntStrict(st.nextToken());
            const sd = parseIntStrict(st.nextToken());
            this.extList.push(new ExtListEntry(s, n, p, sd));
        }
        const nodeList = CustomLogicModel.unescape(st.nextToken());
        const elmDump  = CustomLogicModel.unescape(st.nextToken());
        this.convertOldFormatToXml(nodeList, elmDump);
    }

    // convert old-style nodeList/elmDump strings to XML element tree
    convertOldFormatToXml(nodeList: string, elmDump: string): void {
        this.elmDoc = document.implementation.createDocument(null, "elms", null);
        const root = this.elmDoc.documentElement;

        const modelLines  = nodeList.split('\r').filter(l => l.length > 0);
        const elmTokenizer = new StringTokenizer(elmDump, " ");

        for (const line of modelLines) {
            const stModel = new StringTokenizer(line, " +\t\n\r\f");
            let ceType = stModel.nextToken();

            let nn = "";
            while (stModel.hasMoreTokens()) {
                if (nn.length > 0) nn += " ";
                nn += stModel.nextToken();
            }

	    if (ceType == 'CustomCompositeElm')
		ceType = 'SubcircuitElm';
            let ce = CirSim.constructElement(ceType, 0, 0);

	    if (ce == null) {
		console.log("can't create element in convertOldFormatToXml", ceType);
		debugger;
	    }

            if (elmTokenizer.hasMoreTokens()) {
                const dumpedCe = CustomLogicModel.unescape(elmTokenizer.nextToken());
                const stCe = new StringTokenizer(dumpedCe, " ");
                const ceFlags = parseIntStrict(stCe.nextToken());
                ce = CirSim.createCe(ce.getDumpType(), 0, 0, 0, 0, ceFlags, stCe);
            }

            if (ce.isGroundElm()) ce.setOldStyle();

            const child = this.elmDoc.createElement(ce.getXmlDumpType());
            CircuitXMLSerializer.dumpAttr(child, "nn", nn);
            ce.dumpXml(this.elmDoc, child);
            child.removeAttribute("x");
            root.appendChild(child);
        }
    }

    isSaved(): boolean {
        return SubcircuitModel.registry.isSaved(this.name);
    }

    setSaved(sv: boolean): void {
        if (sv) {
            SubcircuitModel.registry.store(this);
            SubcircuitModel.registry.setGlobal(this);
        } else {
            SubcircuitModel.registry.unsave(this.name);
        }
    }

    static loadModelFromStorage(data: string): void {
        const doc = new DOMParser().parseFromString(data, "text/xml");
        const root = doc.documentElement;
        const xml = new CircuitXMLDeserializer(CirSim.theApp);
        xml.currentXmlElement = root;
        const modelName = xml.parseStringAttr("nm", null)!;
        const model = new SubcircuitModel();
        model.name = modelName;
        model.parseXmlElement(xml);
        SubcircuitModel.registry.setGlobal(model);
    }

    showLabel(): boolean { return (this.flags & SubcircuitModel.FLAG_SHOW_LABEL) !== 0; }
    isBuiltin(): boolean { return this.builtin; }

    setShowLabel(sl: boolean): void {
        this.flags = sl ? (this.flags | SubcircuitModel.FLAG_SHOW_LABEL)
                       : (this.flags & ~SubcircuitModel.FLAG_SHOW_LABEL);
    }

    // check if all bus entries have consecutive node numbers so we can use compact format
    busNodesConsecutive(): boolean {
        for (let i = 0; i < this.extList.length; i++) {
            const ent = this.extList[i];
            if (ent.busZ > 0 && ent.node !== this.extList[i - 1].node + 1)
                return false;
        }
        return true;
    }

    // build XML attributes and children into the given element
    buildXmlElement(doc: Document, elem: Element): void {
        CircuitXMLSerializer.dumpAttr(elem, "nm", this.name);
        CircuitXMLSerializer.dumpAttr(elem, "f",  this.flags);
        CircuitXMLSerializer.dumpAttr(elem, "sx", this.sizeX);
        CircuitXMLSerializer.dumpAttr(elem, "sy", this.sizeY);
        const bcs = this.busNodesConsecutive();
        if (bcs) CircuitXMLSerializer.dumpAttr(elem, "bcs", 1);
        for (const ent of this.extList) {
            if (bcs && ent.busZ > 0) continue;
            const ext = doc.createElement("ext");
            CircuitXMLSerializer.dumpAttr(ext, "nm", ent.name);
            CircuitXMLSerializer.dumpAttr(ext, "nd", ent.node);
            CircuitXMLSerializer.dumpAttr(ext, "ps", ent.pos);
            CircuitXMLSerializer.dumpAttr(ext, "sd", ent.side);
            if (ent.busWidth > 1) {
                CircuitXMLSerializer.dumpAttr(ext, "bw", ent.busWidth);
                if (!bcs) CircuitXMLSerializer.dumpAttr(ext, "bz", ent.busZ);
            }
            elem.appendChild(ext);
        }
        // copy child elements from elmDoc into output
        if (this.elmDoc) {
            const children = this.elmDoc.documentElement.childNodes;
            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                const imported = doc.importNode(node, true);
                elem.appendChild(imported);
            }
        }
    }

    dumpXml(doc: Document): void {
        if (this.internal) return;
        this.dumped = true;
        const elem = doc.createElement("ccm");
        this.buildXmlElement(doc, elem);
        doc.documentElement.appendChild(elem);
    }

    static undumpModelXml(xml: CircuitXMLDeserializer): SubcircuitModel {
        const name = xml.parseStringAttr("nm", null)!;
        const model = SubcircuitModel.getModelForLoad(name);
        model.undumpXml(xml);
        return model;
    }

    // register a model definition embedded in another model (a nested subcircuit), unless a model
    // with that name already exists.  The embedded copy is a snapshot taken when the outer model
    // was created, so it may be stale; it must never overwrite a model that instances are using.
    static undumpEmbeddedModelXml(xml: CircuitXMLDeserializer): void {
        const name = xml.parseStringAttr("nm", null)!;
        if (SubcircuitModel.getModelWithName(name) !== null) return;
        const model = new SubcircuitModel();
        model.name = name;
        SubcircuitModel.registry.setLocal(model);
        SubcircuitModel.registry.markEmbedded(model);
        model.undumpXml(xml);
    }

    // register an element model definition embedded in a subcircuit model as the subcircuit is
    // built, unless a model with that name exists.  The definitions are registered when the
    // subcircuit model is loaded, but as local models; a global subcircuit model outlives them.
    // Returns false if elm isn't an element model definition.
    static undumpEmbeddedElmModelXml(xml: CircuitXMLDeserializer, elm: Element): boolean {
        const type = getElmModelType(elm.tagName);
        if (!type)
            return false;
        const name = elm.getAttribute("nm");
        if (name !== null && !type.registry.has(name)) {
            xml.parseChildElement(elm);
            type.registry.makeGlobal(type.undump(xml));
        }
        return true;
    }

    // parse XML attributes and children from deserializer
    parseXmlElement(xml: CircuitXMLDeserializer): void {
        this.flags = xml.parseIntAttr("f", this.flags);
        this.sizeX = xml.parseIntAttr("sx", this.sizeX);
        this.sizeY = xml.parseIntAttr("sy", this.sizeY);
        const bcs = xml.parseIntAttr("bcs", 0) !== 0;
        this.extList = [];

        // build elmDoc from XML children
        this.elmDoc = document.implementation.createDocument(null, "elms", null);
        const root = this.elmDoc.documentElement;

        for (const child of xml.getChildElements()) {
            if (child.tagName === "ext") {
                xml.parseChildElement(child);
                const s  = xml.parseStringAttr("nm", "")!;
                const n  = xml.parseIntAttr("nd", 0);
                const p  = xml.parseIntAttr("ps", 0);
                const sd = xml.parseIntAttr("sd", 0);
                const bw = xml.parseIntAttr("bw", 1);
                if (bcs && bw > 1) {
                    // expand compact bus entries
                    for (let j = 0; j < bw; j++) {
                        const ent = new ExtListEntry(s, n + j, p, sd);
                        ent.busWidth = bw;
                        ent.busZ = j;
                        this.extList.push(ent);
                    }
                } else {
                    const ent = new ExtListEntry(s, n, p, sd);
                    ent.busWidth = bw;
                    ent.busZ = xml.parseIntAttr("bz", 0);
                    this.extList.push(ent);
                }
            } else {
                // element definition - import into elmDoc
                const imported = this.elmDoc.importNode(child, true) as Element;
                root.appendChild(imported);

                // model definitions need to be registered immediately (not just left in elmDoc),
                // since elements like RelayElm look up their model by name as soon as they're
                // instantiated from elmDoc (e.g. in CompositeElm.loadCompositeXml())
                const tagName = child.tagName;
                xml.parseChildElement(child);
                const elmModelType = getElmModelType(tagName);
                if (elmModelType) {
                    const isNew = !elmModelType.registry.hasLocal(child.getAttribute("nm") ?? "");
                    const m = elmModelType.undump(xml);
                    if (isNew)
                        elmModelType.registry.markEmbedded(m);
                }
                else if (tagName === "ccm")
                    SubcircuitModel.undumpEmbeddedModelXml(xml);
            }
        }
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.parseXmlElement(xml);
    }

    // get child elements from elmDoc for use by loadCompositeXml
    getElmEntries(): Element[] {
        if (!this.elmDoc) return [];
        const entries: Element[] = [];
        const children = this.elmDoc.documentElement.childNodes;
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.nodeType === Node.ELEMENT_NODE)
                entries.push(node as Element);
        }
        return entries;
    }

    // reconstruct old-format nodeList string from XML (for loadComposite compatibility)
    getNodeList(): string {
        let nodeList = "";
        for (const child of this.getElmEntries()) {
            const tagName = child.tagName;
            const className = CirSim.xmlDumpTypeMap.get(tagName);
            if (!className) continue;
            const nn = child.getAttribute("nn");
            if (nodeList.length > 0) nodeList += "\r";
            nodeList += className + (nn && nn.length > 0 ? " " + nn : "");
        }
        return nodeList;
    }

    canLoadModelCircuit(): boolean {
        if (this.modelCircuit && this.modelCircuit.length > 0) return true;
        if (this.elmDoc) {
            const children = this.elmDoc.documentElement.childNodes;
            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if ((node as Element).getAttribute("x") !== null) return true;
                }
            }
        }
        return false;
    }

    remove(): void {
        SubcircuitModel.registry.delete(this);
    }

    // replace a model in whichever map it lives in.  A global model replaces any local
    // copy with the same name (e.g. a stale one reloaded from a saved editing context).
    static replaceModel(model: SubcircuitModel): void {
        if (SubcircuitModel.registry.isGlobal(model))
            SubcircuitModel.registry.removeLocal(model.name);
        else
            SubcircuitModel.registry.setLocal(model);
    }

    // the built-in models.  In XML, since loading the old text format builds each element
    // (needing its class loaded), and these are loaded whenever the model list is first used
    static readonly internalModels: string[] = [
        '<ccm nm="~LM317-v2" f="0" sx="2" sy="2" bcs="1"><ext nm="adj" nd="2" ps="1" sd="1"/><ext nm="in" nd="1" ps="0" sd="2"/><ext nm="out" nd="3" ps="0" sd="3"/><j nn="3 4 1" f="0" mo="~lm317-jfet"/><r nn="5 39" f="0" r="200"/><c nn="39 6" f="2" c="1.5000000000000002e-13" iv="0" sr="0"/><c nn="39 5" f="2" c="1e-13" iv="0" sr="0"/><t nn="39 5 6" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.1"/><r nn="7 40" f="0" r="500"/><c nn="40 8" f="2" c="4e-13" iv="0" sr="0"/><c nn="40 5" f="2" c="2e-13" iv="0" sr="0"/><t nn="40 5 8" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="5 41" f="0" r="200"/><c nn="41 9" f="2" c="1.5000000000000002e-13" iv="0" sr="0"/><c nn="41 7" f="2" c="1e-13" iv="0" sr="0"/><t nn="41 7 9" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.1"/><r nn="7 42" f="0" r="500"/><c nn="42 3" f="2" c="4e-13" iv="0" sr="0"/><c nn="42 10" f="2" c="2e-13" iv="0" sr="0"/><t nn="42 10 3" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="10 43" f="0" r="100"/><c nn="43 11" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="43 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="43 3 11" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="10 44" f="0" r="500"/><c nn="44 13" f="2" c="4e-13" iv="0" sr="0"/><c nn="44 12" f="2" c="2e-13" iv="0" sr="0"/><t nn="44 12 13" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="5 45" f="0" r="100"/><c nn="45 14" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="45 11" f="2" c="2e-13" iv="0" sr="0"/><t nn="45 11 14" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="12 46" f="0" r="100"/><c nn="46 11" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="46 15" f="2" c="2e-13" iv="0" sr="0"/><t nn="46 15 11" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="5 47" f="0" r="100"/><c nn="47 17" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="47 16" f="2" c="2e-13" iv="0" sr="0"/><t nn="47 16 17" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="15 48" f="0" r="500"/><c nn="48 18" f="2" c="4e-13" iv="0" sr="0"/><c nn="48 16" f="2" c="2e-13" iv="0" sr="0"/><t nn="48 16 18" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="19 49" f="0" r="100"/><c nn="49 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="49 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="49 3 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="20 50" f="0" r="500"/><c nn="50 19" f="2" c="4e-13" iv="0" sr="0"/><c nn="50 1" f="2" c="2e-13" iv="0" sr="0"/><t nn="50 1 19" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="5 51" f="0" r="100"/><c nn="51 21" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="51 20" f="2" c="2e-13" iv="0" sr="0"/><t nn="51 20 21" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="22 52" f="0" r="100"/><c nn="52 20" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="52 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="52 3 20" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="23 53" f="0" r="100"/><c nn="53 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="53 22" f="2" c="2e-13" iv="0" sr="0"/><t nn="53 22 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="3 54" f="0" r="500"/><c nn="54 24" f="2" c="4e-13" iv="0" sr="0"/><c nn="54 22" f="2" c="2e-13" iv="0" sr="0"/><t nn="54 22 24" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="23 55" f="0" r="100"/><c nn="55 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="55 23" f="2" c="2e-13" iv="0" sr="0"/><t nn="55 23 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="3 56" f="0" r="50"/><c nn="56 25" f="2" c="4e-12" iv="0" sr="0"/><c nn="56 23" f="2" c="2e-12" iv="0" sr="0"/><t nn="56 23 25" f="0" pn="1" be="80" mo="~lm317-qnl-A2"/><r nn="26 57" f="0" r="100"/><c nn="57 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="57 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="57 3 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="27 58" f="0" r="500"/><c nn="58 3" f="2" c="4e-13" iv="0" sr="0"/><c nn="58 26" f="2" c="2e-13" iv="0" sr="0"/><t nn="58 26 3" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="28 59" f="0" r="10"/><c nn="59 1" f="2" c="3e-12" iv="0" sr="0"/><c nn="59 28" f="2" c="2e-12" iv="0" sr="0"/><t nn="59 28 1" f="0" pn="-1" be="40" mo="~lm317-qpl-A2"/><r nn="28 60" f="0" r="10"/><c nn="60 1" f="2" c="3e-12" iv="0" sr="0"/><c nn="60 16" f="2" c="2e-12" iv="0" sr="0"/><t nn="60 16 1" f="0" pn="-1" be="40" mo="~lm317-qpl-A2"/><r nn="16 61" f="0" r="50"/><c nn="61 29" f="2" c="4e-12" iv="0" sr="0"/><c nn="61 28" f="2" c="2e-12" iv="0" sr="0"/><t nn="61 28 29" f="0" pn="1" be="80" mo="~lm317-qnl-A2"/><r nn="31 62" f="0" r="500"/><c nn="62 32" f="2" c="4e-13" iv="0" sr="0"/><c nn="62 30" f="2" c="2e-13" iv="0" sr="0"/><t nn="62 30 32" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="31 63" f="0" r="500"/><c nn="63 33" f="2" c="4e-13" iv="0" sr="0"/><c nn="63 30" f="2" c="2e-13" iv="0" sr="0"/><t nn="63 30 33" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="34 64" f="0" r="20"/><c nn="64 35" f="2" c="1e-11" iv="0" sr="0"/><c nn="64 1" f="2" c="5e-12" iv="0" sr="0"/><t nn="64 1 35" f="0" pn="1" be="80" mo="~lm317-qnl-A5"/><r nn="35 65" f="0" r="2"/><c nn="65 36" f="2" c="1e-10" iv="0" sr="0"/><c nn="65 1" f="2" c="5e-11" iv="0" sr="0"/><t nn="65 1 36" f="0" pn="1" be="80" mo="~lm317-qnl-A50"/><d nn="3 4" f="2" mo="~lm317-dz"/><d nn="37 1" f="2" mo="~lm317-dz"/><d nn="32 38" f="2" mo="~lm317-dz"/><r nn="1 6" f="0" r="310"/><r nn="1 9" f="0" r="310"/><r nn="1 14" f="0" r="190"/><r nn="1 17" f="0" r="82"/><r nn="1 21" f="0" r="5600"/><r nn="4 7" f="0" r="100000"/><r nn="7 10" f="0" r="130"/><r nn="11 12" f="0" r="12400"/><r nn="8 3" f="0" r="180"/><r nn="13 3" f="0" r="4100"/><r nn="15 3" f="0" r="5800"/><r nn="18 3" f="0" r="72"/><r nn="19 3" f="0" r="5100"/><r nn="2 24" f="0" r="12000"/><r nn="24 25" f="0" r="2400"/><r nn="16 26" f="0" r="6700"/><r nn="16 31" f="0" r="12000"/><r nn="29 35" f="0" r="130"/><r nn="16 34" f="0" r="370"/><r nn="27 30" f="0" r="13000"/><r nn="30 31" f="0" r="400"/><r nn="3 35" f="0" r="160"/><r nn="37 38" f="0" r="18000"/><r nn="33 32" f="0" r="160"/><r nn="33 36" f="0" r="3"/><r nn="36 3" f="0" r="0.1"/><c nn="22 3" f="2" c="3e-11" iv="0" sr="0"/><c nn="22 2" f="2" c="3e-11" iv="0" sr="0"/><c nn="26 27" f="2" c="5e-12" iv="0" sr="0"/><c nn="5 3" f="2" c="2e-12" iv="0" sr="0"/><c nn="28 3" f="2" c="1e-12" iv="0" sr="0"/><c nn="23 3" f="2" c="1e-12" iv="0" sr="0"/></ccm>',
        '<ccm nm="~TL431" f="0" sx="1" sy="3" bcs="1"><ext nm="A" nd="2" ps="0" sd="1"/><ext nm="C" nd="1" ps="0" sd="0"/><ext nm="ref" nd="3" ps="1" sd="2"/><r nn="3 18" f="0" r="40"/><c nn="18 4" f="2" c="1e-12" iv="0" sr="0"/><c nn="18 1" f="2" c="2e-12" iv="0" sr="0"/><t nn="18 1 4" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="4 5" f="0" r="3280"/><r nn="5 6" f="0" r="2400"/><r nn="5 7" f="0" r="7200"/><r nn="6 19" f="0" r="33.333333333333336"/><c nn="19 2" f="2" c="1.2e-12" iv="0" sr="0"/><c nn="19 6" f="2" c="2.4e-12" iv="0" sr="0"/><t nn="19 6 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A1.2"/><r nn="6 20" f="0" r="18.18181818181818"/><c nn="20 8" f="2" c="2.2000000000000003e-12" iv="0" sr="0"/><c nn="20 7" f="2" c="4.400000000000001e-12" iv="0" sr="0"/><t nn="20 7 8" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A2.2"/><r nn="8 2" f="0" r="800"/><r nn="4 21" f="0" r="40"/><c nn="21 10" f="2" c="1e-12" iv="0" sr="0"/><c nn="21 9" f="2" c="2e-12" iv="0" sr="0"/><t nn="21 9 10" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="10 11" f="0" r="4000"/><r nn="7 22" f="0" r="40"/><c nn="22 2" f="2" c="1e-12" iv="0" sr="0"/><c nn="22 11" f="2" c="2e-12" iv="0" sr="0"/><t nn="22 11 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="13 23" f="0" r="80"/><c nn="23 2" f="2" c="5e-13" iv="0" sr="0"/><c nn="23 12" f="2" c="1e-12" iv="0" sr="0"/><t nn="23 12 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A0.5"/><r nn="9 24" f="0" r="80"/><c nn="24 14" f="2" c="1e-12" iv="0" sr="0"/><c nn="24 9" f="2" c="3e-12" iv="0" sr="0"/><t nn="24 9 14" f="0" pn="-1" be="60" mo="~tl431ed-qp_ed"/><r nn="9 25" f="0" r="80"/><c nn="25 15" f="2" c="1e-12" iv="0" sr="0"/><c nn="25 12" f="2" c="3e-12" iv="0" sr="0"/><t nn="25 12 15" f="0" pn="-1" be="60" mo="~tl431ed-qp_ed"/><r nn="1 14" f="0" r="800"/><r nn="1 15" f="0" r="800"/><r nn="12 26" f="0" r="40"/><c nn="26 16" f="2" c="1e-12" iv="0" sr="0"/><c nn="26 1" f="2" c="2e-12" iv="0" sr="0"/><t nn="26 1 16" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="17 16" f="0" r="150"/><r nn="17 27" f="0" r="8"/><c nn="27 2" f="2" c="5e-12" iv="0" sr="0"/><c nn="27 1" f="2" c="1e-11" iv="0" sr="0"/><t nn="27 1 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A5"/><r nn="17 2" f="0" r="10000"/><r nn="12 28" f="0" r="40"/><c nn="28 3" f="2" c="1e-12" iv="0" sr="0"/><c nn="28 12" f="2" c="2e-12" iv="0" sr="0"/><t nn="28 12 3" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><d nn="2 12" f="2" mo="~tl431ed-d_ed"/><r nn="13 6" f="0" r="1000"/><d nn="2 1" f="2" mo="~tl431ed-d_ed"/><c nn="1 12" f="2" c="1e-11" iv="0" sr="0"/><c nn="7 11" f="2" c="2e-11" iv="0" sr="0"/></ccm>',
    ];

    // the definitions of the models a text uses by name without containing them, like the
    // built-in ones, which circuits don't save; and of the models those use
    static referencedModelText(text: string): string {
        const found: string[] = [];
        const seen = new Set<SubcircuitModel>();
        const visit = (t: string) => {
            for (const m of SubcircuitModel.registry.models()) {
                if (seen.has(m) || m.elmDoc == null || !t.includes(m.name))
                    continue;
                seen.add(m);
                const def = SubcircuitModel.registry.serialize(m);
                found.push(def);
                visit(def);
            }
        };
        visit(text);
        return found.join("\n");
    }

    static loadInternalModels(): void {
        for (const data of SubcircuitModel.internalModels) {
            const xml = new CircuitXMLDeserializer(CirSim.theApp);
            xml.currentXmlElement = new DOMParser().parseFromString(data, "text/xml").documentElement;
            const model = SubcircuitModel.undumpModelXml(xml);
            model.internal = model.builtin = true;
            // move from local to global since these are builtins
            SubcircuitModel.registry.makeGlobal(model);
        }
    }
}

HookRegistry.undumpSubcircuitModel            = (xml) => SubcircuitModel.undumpModelXml(xml as CircuitXMLDeserializer);
HookRegistry.referencedModelText              = (text) => SubcircuitModel.referencedModelText(text);
