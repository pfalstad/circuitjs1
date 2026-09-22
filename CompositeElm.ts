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

// Circuit element made up of a composition of other circuit elements
// Using this will be (relatively) inefficient in terms of simulation performance because
// all the internal workings of the element are simulated from the individual components.
// However, it may allow some types of components to be more quickly programed in to the simulator
// than writing each component from scratch.
//
// It also provides a path to allow user created circuits to be
// re-imported in to the simulation as new circuit elements.

import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { CircuitNodeLink } from "./CircuitNodeLink";
import { StringTokenizer } from "./StringTokenizer";
import { CustomLogicModel } from "./CustomLogicModel";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";
import { Point } from "./Point";
import { SubcircuitModel } from "./SubcircuitModel";
import { parseIntStrict } from "./NumberParse";

export abstract class CompositeElm extends CircuitElm {
    // need to use escape() instead of converting spaces to _'s so composite elements can be nested
    static readonly FLAG_ESCAPE = 1;

    // list of elements contained in this subcircuit
    compElmList: CircuitElm[] = [];

    // list of nodes, mapping each one to a list of elements that reference that node
    protected compNodeList: CircuitNode[] | null = null;

    protected numPosts: number = 0;
    protected numNodes: number = 0;
    protected posts: Point[] = [];

    // node info strings for each element (space-separated node numbers), stored for deferred node list building
    compNodeInfo: string[] = [];
    // per child, the node numbers its expression refers to by name (the "rn" attribute).
    // empty for the old text format, which predates expression references.
    compRefNodeInfo: string[] = [];

    // external node IDs, stored for deferred node list building
    extNodeIds: number[] = [];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number);
    constructor(xx: number, yy: number, xb?: number, yb?: number, f?: number) {
        if (xb === undefined)
            super(xx, yy);
        else
            super(xx, yy, xb, yb!, f!);
    }

    getChildElmList(): CircuitElm[] { return this.compElmList; }

    useEscape(): boolean { return (this.flags & CompositeElm.FLAG_ESCAPE) !== 0; }

    loadComposite(stIn: StringTokenizer | null, model: string, externalNodes: number[]): void {
        this.compElmList = [];
        const nodeInfoList: string[] = [];

        // Build compElmList from input string, storing node info for later
        const lines = model.split('\r');
        for (const line of lines) {
            const sp = line.indexOf(' ');
            if (sp < 0) continue;
            const ceType = line.substring(0, sp);
            const nodeStr = line.substring(sp + 1);
            let newce: CircuitElm = CirSim.constructElement(ceType, 0, 0);
            if (stIn != null) {
                const tint = newce.getDumpType();
                let dumpedCe = stIn.nextToken();
                if (this.useEscape())
                    dumpedCe = CustomLogicModel.unescape(dumpedCe);
                const stCe = new StringTokenizer(dumpedCe, this.useEscape() ? " " : "_");
                const flags = parseIntStrict(stCe.nextToken());
                newce = CirSim.createCe(tint, 0, 0, 0, 0, flags, stCe);
            }
            if (newce == null) {
                CirSim.console("failed to create " + ceType + " in CompositeElm");
                continue;
            }
            if (newce.isGroundElm())
                (newce as any).setOldStyle();
            newce.parent = this;
            this.compElmList.push(newce);
            nodeInfoList.push(nodeStr);
        }

        this.compNodeInfo = nodeInfoList;
        this.compRefNodeInfo = [];   // the old text format has no expression references
        this.extNodeIds = externalNodes;
        this.numPosts = this.numNodes = externalNodes.length;
        this.posts = new Array(this.numPosts);
        this.allocNodes();

        // dump new circuits with escape()
        this.flags |= CompositeElm.FLAG_ESCAPE;
    }

    loadCompositeXml(elmEntries: Element[], externalNodes: number[]): void {
        const xml = new CircuitXMLDeserializer(CirSim.theApp);
        this.compElmList = [];
        const nodeInfoList: string[] = [];
        const refNodeInfoList: string[] = [];

        for (const childElem of elmEntries) {
            const tagName = childElem.tagName;
            if (tagName === "ccm") {
                // referenced subcircuit model definition, embedded here when this model was
                // originally created from a selection that included an instance of it (see
                // SimulationManager.getCircuitAsComposite()).  Register it so any instance
                // below that references it by name can resolve it, same as
                // CircuitXMLDeserializer's element loading does for a whole-circuit load.
                xml.parseChildElement(childElem);
                SubcircuitModel.undumpModelXml(xml);
                continue;
            }
            const className = CirSim.xmlDumpTypeMap.get(tagName);
            if (className == null)
                continue;
            // skip non-essential display-only elements
            // GroundElm is only skipped if it has coordinates (newer dump, purely visual)
            if (className === "WireElm" || className === "RoutedWireElm" ||
                    className === "LabeledNodeElm" || className === "ScopeElm" ||
                    className === "GraphicElm" ||
                    (className === "GroundElm" && childElem.getAttribute("x") != null))
                continue;
            const newce: CircuitElm = CirSim.constructElement(className, 0, 0);
            if (newce.isGroundElm())
                (newce as any).setOldStyle();
            xml.parseChildElement(childElem);
            newce.undumpXml(xml);
            newce.parent = this;
            this.compElmList.push(newce);
            const nn = childElem.getAttribute("nn");
            nodeInfoList.push(nn != null ? nn : "");
            const rn = childElem.getAttribute("rn");
            refNodeInfoList.push(rn != null ? rn : "");
        }

        this.compNodeInfo = nodeInfoList;
        this.compRefNodeInfo = refNodeInfoList;
        this.extNodeIds = externalNodes;

        // we set numNodes here so allocNodes() will work when creating.
        // the real node count will be filled in during preStamp
        this.numPosts = this.numNodes = externalNodes.length;
        this.posts = new Array(this.numPosts);
        this.flags |= CompositeElm.FLAG_ESCAPE;
    }

    // build compNodeList from stored node info.  called from preStamp() so that sub-elements
    // have their final state (after undumpXml) when we query their internal node counts.
    buildCompNodeList(): void {
        const compNodeHash = new Map<number, CircuitNode>();

        this.compNodeList = [];

        for (let i = 0; i !== this.compElmList.length; i++) {
            const ce = this.compElmList[i];
            const stNodes = new StringTokenizer(this.compNodeInfo[i], " +\t");
            let thisPost = 0;
            while (stNodes.hasMoreTokens()) {
                const nodeOfThisPost = parseIntStrict(stNodes.nextToken());

                // node = 0 means ground
                if (nodeOfThisPost === 0) {
                    ce.setNode(thisPost, CircuitNode.ground);
                    thisPost++;
                    continue;
                }
                const cnLink = new CircuitNodeLink();
                cnLink.num = thisPost;
                cnLink.elm = ce;
                if (!compNodeHash.has(nodeOfThisPost)) {
                    const cn = new CircuitNode();
                    cn.links.push(cnLink);
                    compNodeHash.set(nodeOfThisPost, cn);
                } else {
                    compNodeHash.get(nodeOfThisPost)!.links.push(cnLink);
                }
                thisPost++;
            }

            // reference nodes: same node numbers, but they land past the posts and
            // internal nodes rather than continuing the post sequence
            const refInfo = this.compRefNodeInfo[i];
            if (refInfo == null || refInfo.length === 0)
                continue;
            const stRefs = new StringTokenizer(refInfo, " +\t");
            let thisRef = ce.getRefNodeBase();
            while (stRefs.hasMoreTokens()) {
                const nodeOfThisRef = parseIntStrict(stRefs.nextToken());
                if (nodeOfThisRef === 0) {
                    ce.setNode(thisRef, CircuitNode.ground);
                    thisRef++;
                    continue;
                }
                const cnLink = new CircuitNodeLink();
                cnLink.num = thisRef;
                cnLink.elm = ce;
                if (!compNodeHash.has(nodeOfThisRef)) {
                    const cn = new CircuitNode();
                    cn.links.push(cnLink);
                    compNodeHash.set(nodeOfThisRef, cn);
                } else {
                    compNodeHash.get(nodeOfThisRef)!.links.push(cnLink);
                }
                thisRef++;
            }
        }

        // Flatten compNodeHash in to compNodeList: external nodes first
        try {
            for (let i = 0; i < this.extNodeIds.length; i++) {
                const id = this.extNodeIds[i];
                if (compNodeHash.has(id)) {
                    this.compNodeList.push(compNodeHash.get(id)!);
                    compNodeHash.delete(id);
                } else
                    throw new Error("missing external node");
            }
        } catch (e) {
            this.compNodeList = null;
            return;
        }
        for (const [, cn] of compNodeHash)
            this.compNodeList.push(cn);

        // allocate more nodes for sub-elements' internal nodes
        for (let i = 0; i !== this.compElmList.length; i++) {
            const ce = this.compElmList[i];
            const inodes = ce.getInternalNodeCount();
            for (let j = 0; j !== inodes; j++) {
                const cnLink = new CircuitNodeLink();
                cnLink.num = j + ce.getPostCount();
                cnLink.elm = ce;
                const cn = new CircuitNode();
                cn.links.push(cnLink);
                this.compNodeList.push(cn);
            }
        }

        this.numNodes = this.compNodeList.length;
    }

    preStamp(): void {
        for (const ce of this.compElmList)
            ce.preStamp();
        this.buildCompNodeList();
        this.allocNodes();
    }

    dump(): string {
        return super.dump() + this.dumpElements();
    }

    dumpElements(): string;
    dumpElements(mask: number): string;
    dumpElements(mask?: number): string {
        let dumpStr = "";
        for (let i = 0; i < this.compElmList.length; i++) {
            if (mask !== undefined && (mask & (1 << i)) === 0)
                continue;
            let tstring = this.compElmList[i].dump();
            tstring = tstring.replace(/[A-Za-z0-9]+ 0 0 0 0 /, ""); // remove unused tint x1 y1 x2 y2 coords
            dumpStr += " " + CustomLogicModel.escape(tstring);
        }
        return dumpStr;
    }

    dumpWithMask(mask: number): string {
        return super.dump() + this.dumpElements(mask);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        for (let i = 0; i !== this.compElmList.length; i++) {
            const ce = this.compElmList[i];
            const child = doc.createElement(ce.getXmlDumpType());
            ce.dumpXmlState(doc, child);

            // if no state dumped, skip it
            if (child.attributes.length === 0 && !child.hasChildNodes())
                continue;
            (child as any).setAttribute("ix", i);
            elem.appendChild(child);
        }
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        const state = xml.currentXmlElement;

        for (const elem of xml.getChildElements()) {
            xml.parseChildElement(elem);
            const ix = xml.parseIntAttr("ix", -1);
            if (ix < 0 || ix >= this.compElmList.length) {
                CirSim.console("ix " + ix + " out of range");
                continue;
            }
            const ce = this.compElmList[ix];
            if (elem.tagName !== ce.getXmlDumpType())
                throw new Error("dump type mismatch for composite child: " + ix);
            ce.undumpXml(xml);
        }

        // restore current XML element so superclasses can finish parsing
        xml.parseChildElement(state);
    }

    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return false; }

    reset(): void {
        for (const ce of this.compElmList)
            ce.reset();
    }

    getPostCount(): number { return this.numPosts; }
    getInternalNodeCount(): number { return this.numNodes - this.numPosts; }

    getPost(n: number): Point { return this.posts[n]; }

    setPost(n: number, p: Point): void;
    setPost(n: number, x: number, y: number): void;
    setPost(n: number, pOrX: Point | number, y?: number): void {
        if (typeof pOrX === "number")
            this.posts[n] = new Point(pOrX, y!);
        else
            this.posts[n] = pOrX;
    }

    getPower(): number {
        let power = 0;
        for (const ce of this.compElmList)
            power += ce.getPower();
        return power;
    }

    stamp(): void {
        for (const ce of this.compElmList)
            ce.setParentList(this.compElmList);
    }

    // called to set node p (local to this element) to equal n (global)
    setNode(p: number, n: CircuitNode): void {
        super.setNode(p, n);
        if (this.compNodeList == null)
            return;

        const cnLinks = this.compNodeList[p].links;
        for (let i = 0; i < cnLinks.length; i++)
            cnLinks[i].elm.setNode(cnLinks[i].num, n);
    }

    canViewInScope(): boolean { return false; }

    delete(): void {
        if (this.compElmList != null)
            for (const ce of this.compElmList)
                ce.delete();
        super.delete();
    }

    getCurrentIntoNode(n: number): number {
        let c = 0;
        if (this.compNodeList == null)
            return 0;
        const cnLinks = this.compNodeList[n].links;
        for (let i = 0; i < cnLinks.length; i++)
            c += cnLinks[i].elm.getCurrentIntoNode(cnLinks[i].num);
        return c;
    }
}

export class VoltageSourceRecord {
    vsNumForElement: number = 0;
    vsNode: number = 0;
    elm: CircuitElm | null = null;
}
