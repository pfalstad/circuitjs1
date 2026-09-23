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
import { parseIntStrict } from "./NumberParse";

// model for subcircuits

export class SubcircuitModel {
    static globalModelMap: Map<string, SubcircuitModel> = new Map();
    static localModelMap:  Map<string, SubcircuitModel> = new Map();

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

    static sequenceNumber: number = 0;
    static readonly FLAG_SHOW_LABEL = 1;

    setName(n: string): void {
        if (SubcircuitModel.localModelMap.delete(this.name)) {
            this.name = n;
            SubcircuitModel.localModelMap.set(this.name, this);
        } else {
            SubcircuitModel.globalModelMap.delete(this.name);
            this.name = n;
            SubcircuitModel.globalModelMap.set(this.name, this);
        }
        SubcircuitModel.sequenceNumber++;
    }

    static initModelMap(): void {
        SubcircuitModel.globalModelMap = new Map();
        SubcircuitModel.localModelMap  = new Map();

        // create default stub model
        const extList: ExtListEntry[] = [];
        extList.push(new ExtListEntry("gnd", 1));
        const d = SubcircuitModel.createModelFromOldFormat("default", "0 0", "GroundElm 1", extList);
        d.sizeX = d.sizeY = 1;
        d.builtin = true;
        SubcircuitModel.localModelMap.delete(d.name);
        SubcircuitModel.globalModelMap.set(d.name, d);
        SubcircuitModel.sequenceNumber = 1;

        SubcircuitModel.loadInternalModels();
    }

    static loadModelsFromStorage(): void {
        const stor = window.localStorage;
        if (stor === null) return;
        const len = stor.length;
        for (let i = 0; i < len; i++) {
            const key = stor.key(i);
            if (!key || !key.startsWith("subcircuit:")) continue;
            const data = stor.getItem(key);
            if (!data) continue;
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
                        SubcircuitModel.localModelMap.delete(model.name);
                        SubcircuitModel.globalModelMap.set(model.name, model);
                    }
                }
            } catch (e) {
                CirSim.console("Exception: " + e);
            }
        }
    }

    static getModelWithName(name: string): SubcircuitModel | null {
        if (SubcircuitModel.globalModelMap.size === 0 && SubcircuitModel.localModelMap.size === 0)
            SubcircuitModel.initModelMap();
        const lm = SubcircuitModel.localModelMap.get(name);
        if (lm) return lm;
        return SubcircuitModel.globalModelMap.get(name) ?? null;
    }

    // create model from old-style nodeList/elmDump format, converting to XML immediately
    static createModelFromOldFormat(name: string, elmDump: string, nodeList: string, extList: ExtListEntry[]): SubcircuitModel {
        const lm = new SubcircuitModel();
        lm.name = name;
        lm.extList = extList;
        lm.convertOldFormatToXml(nodeList, elmDump);
        SubcircuitModel.localModelMap.set(name, lm);
        SubcircuitModel.sequenceNumber++;
        return lm;
    }

    // create model with XML element doc already built
    static createModel(name: string, elmDoc: Document, extList: ExtListEntry[]): SubcircuitModel {
        const lm = new SubcircuitModel();
        lm.name = name;
        lm.elmDoc = elmDoc;
        lm.extList = extList;
        SubcircuitModel.localModelMap.set(name, lm);
        SubcircuitModel.sequenceNumber++;
        return lm;
    }

    static clearDumpedFlags(): void {
        for (const m of SubcircuitModel.globalModelMap.values()) m.dumped = false;
        for (const m of SubcircuitModel.localModelMap.values())  m.dumped = false;
    }

    static getModelList(): SubcircuitModel[] {
        // local entries win on name collision
        const merged = new Map<string, SubcircuitModel>(SubcircuitModel.globalModelMap);
        for (const [k, v] of SubcircuitModel.localModelMap) merged.set(k, v);
        const result: SubcircuitModel[] = [];
        for (const dm of merged.values()) {
            if (!dm.internal) result.push(dm);
        }
        result.sort((a, b) => a.name.localeCompare(b.name));
        return result;
    }

    static undumpModel(st: StringTokenizer): SubcircuitModel {
        const name = CustomLogicModel.unescape(st.nextToken());
        let model = SubcircuitModel.getModelWithName(name);
        if (model === null) {
            model = new SubcircuitModel();
            model.name = name;
            SubcircuitModel.localModelMap.set(name, model);
            SubcircuitModel.sequenceNumber++;
        } else if (SubcircuitModel.globalModelMap.has(name) && !SubcircuitModel.localModelMap.has(name)) {
            // create a local shadow instead of modifying global
            model = new SubcircuitModel();
            model.name = name;
            SubcircuitModel.localModelMap.set(name, model);
            SubcircuitModel.sequenceNumber++;
        }
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
        if (!this.name) return false;
        return localStorage.getItem("subcircuit:" + this.name) !== null;
    }

    setSaved(sv: boolean): void {
        if (sv) {
            const doc = document.implementation.createDocument(null, "ccm", null);
            const root = doc.documentElement;
            this.buildXmlElement(doc, root);
            const serializer = new window.XMLSerializer();
            localStorage.setItem("subcircuit:" + this.name, serializer.serializeToString(doc));
            SubcircuitModel.globalModelMap.set(this.name, this);
        } else {
            localStorage.removeItem("subcircuit:" + this.name);
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
        SubcircuitModel.globalModelMap.set(modelName, model);
        SubcircuitModel.sequenceNumber++;
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
        let model = SubcircuitModel.getModelWithName(name);
        if (model === null) {
            model = new SubcircuitModel();
            model.name = name;
            SubcircuitModel.localModelMap.set(name, model);
            SubcircuitModel.sequenceNumber++;
        } else if (SubcircuitModel.globalModelMap.has(name) && !SubcircuitModel.localModelMap.has(name)) {
            model = new SubcircuitModel();
            model.name = name;
            SubcircuitModel.localModelMap.set(name, model);
            SubcircuitModel.sequenceNumber++;
        }
        model.undumpXml(xml);
        return model;
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
                if (tagName === "dm")
                    DiodeModel.undumpModelXml(xml);
                else if (tagName === "rlm")
                    RelayModel.undumpModelXml(xml);
                else if (tagName === "tm")
                    TransistorModel.undumpModelXml(xml);
                else if (tagName === "clm")
                    CustomLogicModel.undumpModelXml(xml);
                else if (tagName === "mm")
                    MosfetModel.undumpModelXml(xml);
                else if (tagName === "ccm")
                    SubcircuitModel.undumpModelXml(xml);
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
        this.setSaved(false);
        SubcircuitModel.localModelMap.delete(this.name);
        SubcircuitModel.globalModelMap.delete(this.name);
        SubcircuitModel.sequenceNumber++;
    }

    // replace a model in whichever map it lives in
    static replaceModel(model: SubcircuitModel): void {
        SubcircuitModel.localModelMap.set(model.name, model);
        SubcircuitModel.sequenceNumber++;
    }

    static clearLocalModels(): void {
        SubcircuitModel.localModelMap.clear();
        SubcircuitModel.sequenceNumber++;
    }

    static loadInternalModels(): void {
        const lm317 = ". ~LM317-v2 0 2 2 3 adj 2 1 1 in 1 0 2 out 3 0 3 JfetElm\\s3\\s4\\s1\\s\\rResistorElm\\s5\\s39\\rCapacitorElm\\s39\\s6\\rCapacitorElm\\s39\\s5\\rTransistorElm\\s39\\s5\\s6\\s\\rResistorElm\\s7\\s40\\rCapacitorElm\\s40\\s8\\rCapacitorElm\\s40\\s5\\rTransistorElm\\s40\\s5\\s8\\s\\rResistorElm\\s5\\s41\\rCapacitorElm\\s41\\s9\\rCapacitorElm\\s41\\s7\\rTransistorElm\\s41\\s7\\s9\\s\\rResistorElm\\s7\\s42\\rCapacitorElm\\s42\\s3\\rCapacitorElm\\s42\\s10\\rTransistorElm\\s42\\s10\\s3\\s\\rResistorElm\\s10\\s43\\rCapacitorElm\\s43\\s11\\rCapacitorElm\\s43\\s3\\rTransistorElm\\s43\\s3\\s11\\s\\rResistorElm\\s10\\s44\\rCapacitorElm\\s44\\s13\\rCapacitorElm\\s44\\s12\\rTransistorElm\\s44\\s12\\s13\\s\\rResistorElm\\s5\\s45\\rCapacitorElm\\s45\\s14\\rCapacitorElm\\s45\\s11\\rTransistorElm\\s45\\s11\\s14\\s\\rResistorElm\\s12\\s46\\rCapacitorElm\\s46\\s11\\rCapacitorElm\\s46\\s15\\rTransistorElm\\s46\\s15\\s11\\s\\rResistorElm\\s5\\s47\\rCapacitorElm\\s47\\s17\\rCapacitorElm\\s47\\s16\\rTransistorElm\\s47\\s16\\s17\\s\\rResistorElm\\s15\\s48\\rCapacitorElm\\s48\\s18\\rCapacitorElm\\s48\\s16\\rTransistorElm\\s48\\s16\\s18\\s\\rResistorElm\\s19\\s49\\rCapacitorElm\\s49\\s16\\rCapacitorElm\\s49\\s3\\rTransistorElm\\s49\\s3\\s16\\s\\rResistorElm\\s20\\s50\\rCapacitorElm\\s50\\s19\\rCapacitorElm\\s50\\s1\\rTransistorElm\\s50\\s1\\s19\\s\\rResistorElm\\s5\\s51\\rCapacitorElm\\s51\\s21\\rCapacitorElm\\s51\\s20\\rTransistorElm\\s51\\s20\\s21\\s\\rResistorElm\\s22\\s52\\rCapacitorElm\\s52\\s20\\rCapacitorElm\\s52\\s3\\rTransistorElm\\s52\\s3\\s20\\s\\rResistorElm\\s23\\s53\\rCapacitorElm\\s53\\s16\\rCapacitorElm\\s53\\s22\\rTransistorElm\\s53\\s22\\s16\\s\\rResistorElm\\s3\\s54\\rCapacitorElm\\s54\\s24\\rCapacitorElm\\s54\\s22\\rTransistorElm\\s54\\s22\\s24\\s\\rResistorElm\\s23\\s55\\rCapacitorElm\\s55\\s16\\rCapacitorElm\\s55\\s23\\rTransistorElm\\s55\\s23\\s16\\s\\rResistorElm\\s3\\s56\\rCapacitorElm\\s56\\s25\\rCapacitorElm\\s56\\s23\\rTransistorElm\\s56\\s23\\s25\\s\\rResistorElm\\s26\\s57\\rCapacitorElm\\s57\\s16\\rCapacitorElm\\s57\\s3\\rTransistorElm\\s57\\s3\\s16\\s\\rResistorElm\\s27\\s58\\rCapacitorElm\\s58\\s3\\rCapacitorElm\\s58\\s26\\rTransistorElm\\s58\\s26\\s3\\s\\rResistorElm\\s28\\s59\\rCapacitorElm\\s59\\s1\\rCapacitorElm\\s59\\s28\\rTransistorElm\\s59\\s28\\s1\\s\\rResistorElm\\s28\\s60\\rCapacitorElm\\s60\\s1\\rCapacitorElm\\s60\\s16\\rTransistorElm\\s60\\s16\\s1\\s\\rResistorElm\\s16\\s61\\rCapacitorElm\\s61\\s29\\rCapacitorElm\\s61\\s28\\rTransistorElm\\s61\\s28\\s29\\s\\rResistorElm\\s31\\s62\\rCapacitorElm\\s62\\s32\\rCapacitorElm\\s62\\s30\\rTransistorElm\\s62\\s30\\s32\\s\\rResistorElm\\s31\\s63\\rCapacitorElm\\s63\\s33\\rCapacitorElm\\s63\\s30\\rTransistorElm\\s63\\s30\\s33\\s\\rResistorElm\\s34\\s64\\rCapacitorElm\\s64\\s35\\rCapacitorElm\\s64\\s1\\rTransistorElm\\s64\\s1\\s35\\s\\rResistorElm\\s35\\s65\\rCapacitorElm\\s65\\s36\\rCapacitorElm\\s65\\s1\\rTransistorElm\\s65\\s1\\s36\\s\\rDiodeElm\\s3\\s4\\rDiodeElm\\s37\\s1\\rDiodeElm\\s32\\s38\\rResistorElm\\s1\\s6\\rResistorElm\\s1\\s9\\rResistorElm\\s1\\s14\\rResistorElm\\s1\\s17\\rResistorElm\\s1\\s21\\rResistorElm\\s4\\s7\\rResistorElm\\s7\\s10\\rResistorElm\\s11\\s12\\rResistorElm\\s8\\s3\\rResistorElm\\s13\\s3\\rResistorElm\\s15\\s3\\rResistorElm\\s18\\s3\\rResistorElm\\s19\\s3\\rResistorElm\\s2\\s24\\rResistorElm\\s24\\s25\\rResistorElm\\s16\\s26\\rResistorElm\\s16\\s31\\rResistorElm\\s29\\s35\\rResistorElm\\s16\\s34\\rResistorElm\\s27\\s30\\rResistorElm\\s30\\s31\\rResistorElm\\s3\\s35\\rResistorElm\\s37\\s38\\rResistorElm\\s33\\s32\\rResistorElm\\s33\\s36\\rResistorElm\\s36\\s3\\rCapacitorElm\\s22\\s3\\rCapacitorElm\\s22\\s2\\rCapacitorElm\\s26\\s27\\rCapacitorElm\\s5\\s3\\rCapacitorElm\\s28\\s3\\rCapacitorElm\\s23\\s3\\r 0\\\\s-7\\\\s0.0001\\s0\\\\s200\\s2\\\\s1.5000000000000002e-13\\\\s0\\\\s0\\s2\\\\s1e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.1\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s200\\s2\\\\s1.5000000000000002e-13\\\\s0\\\\s0\\s2\\\\s1e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.1\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s50\\s2\\\\s4e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A2\\s0\\\\s100\\s2\\\\s3.0000000000000003e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s10\\s2\\\\s3e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A2\\s0\\\\s10\\s2\\\\s3e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s40\\\\s~lm317-qpl-A2\\s0\\\\s50\\s2\\\\s4e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s500\\s2\\\\s4e-13\\\\s0\\\\s0\\s2\\\\s2e-13\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A0.2\\s0\\\\s20\\s2\\\\s1e-11\\\\s0\\\\s0\\s2\\\\s5e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A5\\s0\\\\s2\\s2\\\\s1e-10\\\\s0\\\\s0\\s2\\\\s5e-11\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s80\\\\s~lm317-qnl-A50\\s2\\\\s~lm317-dz\\s2\\\\s~lm317-dz\\s2\\\\s~lm317-dz\\s0\\\\s310\\s0\\\\s310\\s0\\\\s190\\s0\\\\s82\\s0\\\\s5600\\s0\\\\s100000\\s0\\\\s130\\s0\\\\s12400\\s0\\\\s180\\s0\\\\s4100\\s0\\\\s5800\\s0\\\\s72\\s0\\\\s5100\\s0\\\\s12000\\s0\\\\s2400\\s0\\\\s6700\\s0\\\\s12000\\s0\\\\s130\\s0\\\\s370\\s0\\\\s13000\\s0\\\\s400\\s0\\\\s160\\s0\\\\s18000\\s0\\\\s160\\s0\\\\s3\\s0\\\\s0.1\\s2\\\\s3e-11\\\\s0\\\\s0\\s2\\\\s3e-11\\\\s0\\\\s0\\s2\\\\s5e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s1e-12\\\\s0\\\\s0";
        const tl431 = ". ~TL431 0 1 3 3 A 2 0 1 C 1 0 0 ref 3 1 2 ResistorElm\\s3\\s18\\rCapacitorElm\\s18\\s4\\rCapacitorElm\\s18\\s1\\rTransistorElm\\s18\\s1\\s4\\s\\rResistorElm\\s4\\s5\\rResistorElm\\s5\\s6\\rResistorElm\\s5\\s7\\rResistorElm\\s6\\s19\\rCapacitorElm\\s19\\s2\\rCapacitorElm\\s19\\s6\\rTransistorElm\\s19\\s6\\s2\\s\\rResistorElm\\s6\\s20\\rCapacitorElm\\s20\\s8\\rCapacitorElm\\s20\\s7\\rTransistorElm\\s20\\s7\\s8\\s\\rResistorElm\\s8\\s2\\rResistorElm\\s4\\s21\\rCapacitorElm\\s21\\s10\\rCapacitorElm\\s21\\s9\\rTransistorElm\\s21\\s9\\s10\\s\\rResistorElm\\s10\\s11\\rResistorElm\\s7\\s22\\rCapacitorElm\\s22\\s2\\rCapacitorElm\\s22\\s11\\rTransistorElm\\s22\\s11\\s2\\s\\rResistorElm\\s13\\s23\\rCapacitorElm\\s23\\s2\\rCapacitorElm\\s23\\s12\\rTransistorElm\\s23\\s12\\s2\\s\\rResistorElm\\s9\\s24\\rCapacitorElm\\s24\\s14\\rCapacitorElm\\s24\\s9\\rTransistorElm\\s24\\s9\\s14\\s\\rResistorElm\\s9\\s25\\rCapacitorElm\\s25\\s15\\rCapacitorElm\\s25\\s12\\rTransistorElm\\s25\\s12\\s15\\s\\rResistorElm\\s1\\s14\\rResistorElm\\s1\\s15\\rResistorElm\\s12\\s26\\rCapacitorElm\\s26\\s16\\rCapacitorElm\\s26\\s1\\rTransistorElm\\s26\\s1\\s16\\s\\rResistorElm\\s17\\s16\\rResistorElm\\s17\\s27\\rCapacitorElm\\s27\\s2\\rCapacitorElm\\s27\\s1\\rTransistorElm\\s27\\s1\\s2\\s\\rResistorElm\\s17\\s2\\rResistorElm\\s12\\s28\\rCapacitorElm\\s28\\s3\\rCapacitorElm\\s28\\s12\\rTransistorElm\\s28\\s12\\s3\\s\\rDiodeElm\\s2\\s12\\rResistorElm\\s13\\s6\\rDiodeElm\\s2\\s1\\rCapacitorElm\\s1\\s12\\rCapacitorElm\\s7\\s11\\r 0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s3280\\s0\\\\s2400\\s0\\\\s7200\\s0\\\\s33.333333333333336\\s2\\\\s1.2e-12\\\\s0\\\\s0\\s2\\\\s2.4e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A1.2\\s0\\\\s18.18181818181818\\s2\\\\s2.2000000000000003e-12\\\\s0\\\\s0\\s2\\\\s4.400000000000001e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A2.2\\s0\\\\s800\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s4000\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s80\\s2\\\\s5e-13\\\\s0\\\\s0\\s2\\\\s1e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A0.5\\s0\\\\s80\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s3e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s60\\\\s~tl431ed-qp_ed\\s0\\\\s80\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s3e-12\\\\s0\\\\s0\\s0\\\\s-1\\\\s0\\\\s0\\\\s60\\\\s~tl431ed-qp_ed\\s0\\\\s800\\s0\\\\s800\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s0\\\\s150\\s0\\\\s8\\s2\\\\s5e-12\\\\s0\\\\s0\\s2\\\\s1e-11\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed-A5\\s0\\\\s10000\\s0\\\\s40\\s2\\\\s1e-12\\\\s0\\\\s0\\s2\\\\s2e-12\\\\s0\\\\s0\\s0\\\\s1\\\\s0\\\\s0\\\\s140\\\\s~tl431ed-qn_ed\\s2\\\\s~tl431ed-d_ed\\s0\\\\s1000\\s2\\\\s~tl431ed-d_ed\\s2\\\\s1e-11\\\\s0\\\\s0\\s2\\\\s2e-11\\\\s0\\\\s0";

        for (const modelStr of [lm317, tl431]) {
            const st = new StringTokenizer(modelStr, " ");
            st.nextToken(); // "."
            const model = SubcircuitModel.undumpModel(st);
            model.internal = model.builtin = true;
            // move from local to global since these are builtins
            SubcircuitModel.localModelMap.delete(model.name);
            SubcircuitModel.globalModelMap.set(model.name, model);
        }
    }
}

HookRegistry.undumpSubcircuitModel            = (xml) => SubcircuitModel.undumpModelXml(xml as CircuitXMLDeserializer);
HookRegistry.loadSubcircuitModelsFromStorage  = () => SubcircuitModel.loadModelsFromStorage();
HookRegistry.clearSubcircuitModelDumpedFlags  = () => SubcircuitModel.clearDumpedFlags();
