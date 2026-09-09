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

import { Point } from "./Point";
import { CircuitNode } from "./CircuitNode";
import { CircuitNodeLink } from "./CircuitNodeLink";
import { CircuitMatrix } from "./CircuitMatrix";
import { VoltageSource } from "./VoltageSource";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";

import { DMatrixSparseCSC } from "./matrix/DMatrixSparseCSC";
import { SparseLU } from "./matrix/SparseLU";
import { HookRegistry } from "./HookRegistry";

// declared before SimulationManager so they can be referenced in static members
export class WireSegment {
    wire: any;  // CircuitElm
    bit: number;
    endpoint0: string;
    endpoint1: string | null; // string keys for each endpoint
    neighbors: any[] | null = null; // position-based neighbors (CircuitElm[])
    labelNeighbors: WireSegment[] | null = null; // neighbors at shared label endpoint
    post: number = 0; // 0 or 1: which endpoint was used for current calc
    current: number = 0; // set by calcWireCurrents, for label neighbor use

    constructor(w: any, b: number, ep0: string, ep1: string | null) {
	this.wire = w; this.bit = b; this.endpoint0 = ep0; this.endpoint1 = ep1;
    }
}

export class RoutedWireConnection {
    wire: any;  // RoutedWireElm
    wirePost: number;   // which post of the RoutedWireElm (0 or 1)
    elmPost: number;    // which post of the non-routed element

    constructor(wire: any, wirePost: number, elmPost: number) {
	this.wire = wire;
	this.wirePost = wirePost;
	this.elmPost = elmPost;
    }
}

export class SimulationManager {

    app: CirSim;
    static theSim: SimulationManager | null = null;

    // this is different than the main elmList; it has CompositeElm child elms in it
    elmList: any[] = [];  // CircuitElm[]

    nodeList: CircuitNode[] = [];
    voltageSources: VoltageSource[] = [];

    matrices: CircuitMatrix[] | null = null;
    circuitNonLinear: boolean = false;
    voltageSourceCount: number = 0;
    needsStamp: boolean = false;

    // mapping from elements to connected routed wires
    routedWireMap: Map<any, RoutedWireConnection[]> = new Map();
    elmArr: any[] = [];  // CircuitElm[]
    t: number = 0;

    // Solver type: 0=Auto, 1=Dense, 2=Sparse
    static readonly SOLVER_AUTO   = 0;
    static readonly SOLVER_DENSE  = 1;
    static readonly SOLVER_SPARSE = 2;
    static readonly SPARSE_THRESHOLD = 150;
    solverType: number = SimulationManager.SOLVER_AUTO;
    usingSparse: boolean = false;

    // current timestep (time between iterations)
    timeStep: number = 0;

    // maximum timestep (== timeStep unless we reduce it because of trouble converging)
    maxTimeStep: number = 0;
    minTimeStep: number = 0;

    // accumulated time since we incremented timeStepCount
    timeStepAccum: number = 0;

    // incremented each time we advance t by maxTimeStep
    timeStepCount: number = 0;

    adjustTimeStep: boolean = false;

    lastIterTime: number = 0;

    static console(text: string): void { console.log(text); }
    static debugger(): void { debugger; }

    constructor(app: CirSim) {
	SimulationManager.theSim = this; this.app = app;

	/*
	// load solver preference from localStorage
	try {
	    let stor = localStorage;
	    if (stor != null) {
		let s = stor.getItem("solverType");
		if (s != null) this.solverType = parseInt(s);
	    }
	} catch (e) {}
	*/
    }

    resetTime(): void {
    	this.t = this.timeStepAccum = 0;
    	this.timeStepCount = 0;
    }

    getCircuitNode(n: number): CircuitNode | null {
	if (n >= this.nodeList.length)
	    return null;
	return this.nodeList[n];
    }

    getElm(n: number): any {  // CircuitElm
	if (n >= this.elmList.length)
	    return null;
	return this.elmList[n];
    }

    // map points to node numbers
    nodeMap: Map<Point, NodeMapEntry> = new Map();
    // separate node map for UI element list (when viewing composite internals)
    uiNodeMap: Map<Point, NodeMapEntry> = new Map();

    // info about each wire segment and its neighbors, used to calculate wire currents
    wireInfoList: WireSegment[] = [];
    // the element list that wireInfoList was built from
    wireInfoElmSet: Set<any> = new Set();  // Set<CircuitElm>
    // tracks which (element, bit) pairs have been resolved in calcWireInfo
    wireInfoResolved: Map<any, Set<number>> = new Map();  // Map<CircuitElm, Set<Integer>>

    // detect bus widths for wires based on connected elements
    busMismatchList: Point[] = [];

    detectBusWidths(): void { this.detectBusWidthsForList(this.elmList); }

    detectBusWidthsForList(list: any[]): void {
	this.busMismatchList = [];
	const widthMap: Map<string, number> = new Map();
	for (let i = 0; i < list.length; i++) {
	    const ce = list[i];
	    if (ce.isRemovableWire()) continue;
	    for (let j = 0; j < ce.getPostCount(); j++) {
		const w = ce.getPostWidth(j);
		if (w > 1) {
		    const pt = ce.getPost(j);
		    const key = pt.x + "," + pt.y; // z=0 for map key
		    const existing = widthMap.get(key);
		    if (existing != null && existing !== w)
			this.busMismatchList.push(pt);
		    if (existing == null || w > existing)
			widthMap.set(key, w);
		}
	    }
	}
	// propagate bus widths through wire chains and matching labels until stable
	const labelWidthMap: Map<string, number> = new Map();
	let changed = true;
	while (changed) {
	    changed = false;
	    for (let i = 0; i < list.length; i++) {
		const ce = list[i];
		if (ce.isWireElm()) {
		    const wire = ce;
		    const k1 = wire.point1.x + "," + wire.point1.y;
		    const k2 = wire.point2.x + "," + wire.point2.y;
		    const w1 = widthMap.get(k1);
		    const w2 = widthMap.get(k2);
		    let w = 1;
		    if (w1 != null) w = w1;
		    if (w2 != null && w2 > w) w = w2;
		    if (w !== wire.busWidth) {
			wire.busWidth = w;
			wire.currents = (w > 1) ? new Array(w).fill(0) : null;
			wire.allocNodes();
			changed = true;
		    }
		    if (w > 1) {
			if (w1 == null || w1 < w) { widthMap.set(k1, w); changed = true; }
			if (w2 == null || w2 < w) { widthMap.set(k2, w); changed = true; }
		    }
		} else if (ce.isLabeledNodeElm()) {
		    const ln = ce;
		    // get max width from position map and label name map
		    const k = ln.point1.x + "," + ln.point1.y;
		    const w = widthMap.get(k);
		    const lw = labelWidthMap.get(ln.text);
		    let bw = 1;
		    if (w != null) bw = w;
		    if (lw != null && lw > bw) bw = lw;
		    if (bw !== ln.busWidth) {
			ln.busWidth = bw;
			ln.currents = (bw > 1) ? new Array(bw).fill(0) : null;
			ln.allocNodes();
			changed = true;
		    }
		    if (bw > 1) {
			if (w == null || w < bw) { widthMap.set(k, bw); changed = true; }
			if (lw == null || lw < bw) { labelWidthMap.set(ln.text, bw); changed = true; }
		    }
		} else if (ce.isBusSplitterElm()) {
		    const bs = ce;
		    // bus side is at pin 0 position
		    const p = bs.pins[0].post.x + "," + bs.pins[0].post.y;
		    const bw = bs.bits;
		    const w = widthMap.get(p);
		    if (w != null && w !== bw)
			this.busMismatchList.push(bs.pins[0].post);
		    if (w == null || w < bw) {
			widthMap.set(p, bw);
			changed = true;
		    }
		}
	    }
	}
	// check for width mismatches: compare each non-wire element's post width
	// against the propagated widthMap.  this catches both direct and wire-mediated mismatches.
	for (let i = 0; i < list.length; i++) {
	    const ce = list[i];
	    if (ce.isRemovableWire()) continue;
	    for (let j = 0; j < ce.getPostCount(); j++) {
		const w = ce.getPostWidth(j);
		if (w > 1) {
		    const pt = ce.getPost(j);
		    const key = pt.x + "," + pt.y;
		    const propagated = widthMap.get(key);
		    if (propagated != null && propagated !== w)
			this.busMismatchList.push(pt);
		}
	    }
	}
    }

    // find groups of nodes connected by wire equivalents and map them to the same node.  this speeds things
    // up considerably by reducing the size of the matrix.  We do this for wires, labeled nodes, and ground.
    // The actual node we map to is not assigned yet.  Instead we map to the same NodeMapEntry.
    calculateWireClosure(): void {
	HookRegistry.resetLabeledNodeList?.();
	HookRegistry.resetGroundNodeList?.();
	this.calculateWireClosureForList(this.elmList, false);
    }

    // run wire closure on a given element list.  if uiList is true, treat LabeledNodeElm.getConnectedPost()
    // as null (since labeled nodes in subcircuits connect to composite terminals, not to each other)
    calculateWireClosureForList(list: any[], uiList: boolean): void {
	let i: number;
	const nm: Map<string, NodeMapEntry> = new Map();
	this.wireInfoList = [];
	this.wireInfoElmSet = new Set(list);
	for (i = 0; i !== list.length; i++) {
	    const ce = list[i];
	    if (!ce.isRemovableWire())
		continue;
	    ce.getWireSegments(this.wireInfoList);

	    // for bus wires/labels, merge each bit's endpoints; for others, just one pair
	    const bw = ce.getBusWidth();
	    for (let j = 0; j < bw; j++) {
		const p0 = ce.getPost(j);
		const k0 = SimulationManager.pointKey(p0);
		let cn = nm.get(k0);

		// what post are we connected to
		const p1 = (uiList && ce.isLabeledNodeElm()) ? null : ce.getConnectedPost(j);
		if (p1 == null) {
		    // no connected post (true for labeled node the first time it's encountered, or ground)
		    if (cn == null) {
			cn = new NodeMapEntry();
			nm.set(k0, cn);
		    }
		    continue;
		}
		const k1 = SimulationManager.pointKey(p1);
		let cn2 = nm.get(k1);
		if (cn != null && cn2 != null) {
		    // merge nodes; go through map and change all keys pointing to cn2 to point to cn
		    for (const [key, val] of nm.entries()) {
			if (val === cn2)
			    nm.set(key, cn);
		    }
		} else if (cn != null) {
		    nm.set(k1, cn);
		} else if (cn2 != null) {
		    nm.set(k0, cn2);
		} else {
		    // new entry
		    cn = new NodeMapEntry();
		    nm.set(k0, cn);
		    nm.set(k1, cn);
		}
	    }
	}

	// convert string-keyed map back to Point-keyed for the rest of the code
	// we store these as Point-keyed maps using pointKey() for lookup
	if (uiList)
	    this.uiNodeMap = this.nmToPointMap(nm, list);
	else
	    this.nodeMap = this.nmToPointMap(nm, list);
    }

    // convert string-key map to Point-key map by scanning element posts
    private nmToPointMap(nm: Map<string, NodeMapEntry>, list: any[]): Map<Point, NodeMapEntry> {
	const result: Map<Point, NodeMapEntry> = new Map();
	for (const ce of list) {
	    const bw = ce.isRemovableWire() ? ce.getBusWidth() : ce.getPostCount();
	    for (let j = 0; j < bw; j++) {
		const p = ce.isRemovableWire() ? ce.getPost(j) : ce.getPost(j);
		if (p == null) continue;
		const key = SimulationManager.pointKey(p);
		const entry = nm.get(key);
		if (entry != null)
		    result.set(p, entry);
	    }
	    // also check connectedPost
	    if (ce.isRemovableWire()) {
		for (let j = 0; j < ce.getBusWidth(); j++) {
		    const p = ce.getConnectedPost(j);
		    if (p == null) continue;
		    const key = SimulationManager.pointKey(p);
		    const entry = nm.get(key);
		    if (entry != null)
			result.set(p, entry);
		}
	    }
	}
	return result;
    }

    // assign nodes to UI wires (which aren't part of simulation) based on neighboring non-wire elements
    // that already have nodes assigned by makeNodeList.  also add wire links to nodeList so calcWireInfo works.
    assignUiWireNodes(): void {
	const uiList = this.app.ui.elmList;

	// build point-to-node map from non-wire elements in UI list,
	// and add their links to nodeList so calcWireInfo can find neighbors
	// and so setNodeVoltages() updates their volts[] for display
	for (let i = 0; i !== uiList.length; i++) {
	    const ce = uiList[i];
	    if (ce.isRemovableWire())
		continue;
	    for (let j = 0; j !== ce.getPostCount(); j++) {
		const pt = ce.getPost(j);
		const nme = this.getFromPointMap(this.uiNodeMap, pt);
		const cn = ce.getNode(j);
		if (nme != null && nme.node == null && cn != null)
		    nme.node = cn;
		// always link non-wire elements to nodeList so their volts[]
		// get updated, even if the post isn't at a wire endpoint
		// (e.g. composite elements whose posts connect directly)
		if (cn != null) {
		    const cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    cn.links.push(cnl);
		}
	    }
	}

	// assign nodes to wires and add their links to nodeList
	for (let i = 0; i !== uiList.length; i++) {
	    const ce = uiList[i];
	    if (!ce.isRemovableWire())
		continue;
	    for (let j = 0; j !== ce.getPostCount(); j++) {
		const pt = ce.getPost(j);
		const nme = this.getFromPointMap(this.uiNodeMap, pt);
		if (nme != null && nme.node != null) {
		    const cn = nme.node;
		    ce.setNode(j, cn);
		    const cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    cn.links.push(cnl);
		} else if (!ce.isLabeledNodeElm()) {
		    SimulationManager.console("missing node for " + pt);
		}
	    }
	}
    }

    // look up Point in a Point-keyed map using coordinate equality
    private getFromPointMap<V>(map: Map<Point, V>, pt: Point): V | undefined {
	for (const [k, v] of map.entries()) {
	    if (k.x === pt.x && k.y === pt.y && k.z === pt.z)
		return v;
	}
	return undefined;
    }

    // generate info we need to calculate wire currents.  Most other elements calculate currents using
    // the voltage on their terminal nodes.  But wires have the same voltage at both ends, so we need
    // to use the neighbors' currents instead.  We used to treat wires as zero voltage sources to make
    // this easier, but this is very inefficient, since it makes the matrix 2 rows bigger for each wire.
    // We create a list of WireInfo objects instead to help us calculate the wire currents instead,
    // so we make the matrix less complex, and we only calculate the wire currents when we need them
    // (once per frame, not once per subiteration).  We need the WireInfos arranged in the correct order,
    // each one containing a list of neighbors and which end to use (since one end may be ready before
    // the other)
    isWireInfoResolved(ce: any, bit: number): boolean {
	const bits = this.wireInfoResolved.get(ce);
	return bits != null && bits.has(bit);
    }

    setWireInfoResolved(ce: any, bit: number): void {
	let bits = this.wireInfoResolved.get(ce);
	if (bits == null) {
	    bits = new Set<number>();
	    this.wireInfoResolved.set(ce, bits);
	}
	bits.add(bit);
    }

    calcWireInfo(): boolean {
	let i: number, j: number;
	let moved = 0;
	this.wireInfoResolved = new Map();

	// build label endpoint map: label string → list of WireSegments sharing that label
	const labelMap: Map<string, WireSegment[]> = new Map();
	for (i = 0; i !== this.wireInfoList.length; i++) {
	    const ws = this.wireInfoList[i];
	    if (ws.endpoint1 != null && ws.endpoint1.startsWith("label:")) {
		let list = labelMap.get(ws.endpoint1);
		if (list == null) { list = []; labelMap.set(ws.endpoint1, list); }
		list.push(ws);
	    }
	}

	for (i = 0; i !== this.wireInfoList.length; i++) {
	    const ws = this.wireInfoList[i];
	    const wire = ws.wire;
	    const cn1: CircuitNode = wire.getNode(ws.bit);
	    if (cn1 == null) {
		// dangling labeled node not connected to anything inside composite — no current
		ws.neighbors = [];
		ws.labelNeighbors = [];
		this.setWireInfoResolved(wire, ws.bit);
		continue;
	    }

	    const neighbors0: any[] = [];
	    const neighbors1: any[] = [];
	    const labelNeighbors: WireSegment[] = [];
	    let isReady0 = true, isReady1 = !wire.isGroundElm();

	    // position-based matching via cn.links
	    for (j = 0; j !== cn1.links.length; j++) {
		const cnl = cn1.links[j];
		const ce = cnl.elm;
		if (ce === wire) continue;
		if (!this.wireInfoElmSet.has(ce)) continue;
		if (cnl.num >= ce.getPostCount()) continue;
		const pt = ce.getPost(cnl.num);
		if (pt == null) continue;
		const ptKey = SimulationManager.pointKey(pt);

		const neighborBit = cnl.num % ce.getBusWidth();
		const notReady = (ce.isRemovableWire() && !this.isWireInfoResolved(ce, neighborBit));

		if (ws.endpoint0 != null && ws.endpoint0 === ptKey) {
		    neighbors0.push(ce);
		    if (notReady) isReady0 = false;
		} else if (ws.endpoint1 != null && !ws.endpoint1.startsWith("label:") && ws.endpoint1 === ptKey) {
		    neighbors1.push(ce);
		    if (notReady) isReady1 = false;
		}
	    }

	    // label-based matching: find other WireSegments sharing the same label endpoint
	    if (ws.endpoint1 != null && ws.endpoint1.startsWith("label:")) {
		const peers = labelMap.get(ws.endpoint1);
		if (peers != null) {
		    for (j = 0; j !== peers.length; j++) {
			const other = peers[j];
			if (other === ws) continue;
			const notReady = !this.isWireInfoResolved(other.wire, other.bit);
			labelNeighbors.push(other);
			if (notReady) isReady1 = false;
		    }
		}
	    }

	    if (isReady0) {
		ws.neighbors = neighbors0;
		ws.post = 0;
		this.setWireInfoResolved(wire, ws.bit);
		moved = 0;
	    } else if (isReady1 && (ws.endpoint1 != null || !wire.isGroundElm())) {
		ws.neighbors = neighbors1;
		ws.labelNeighbors = labelNeighbors;
		ws.post = 1;
		this.setWireInfoResolved(wire, ws.bit);
		moved = 0;
	    } else {
		this.wireInfoList.push(this.wireInfoList.splice(i--, 1)[0]);
		moved++;
		if (moved > this.wireInfoList.length * 2) {
		    SimulationManager.console("wire loop detected, " + this.wireInfoList.length + " wires total, unresolved:");
		    for (let k = i; k < this.wireInfoList.length; k++) {
			if (k < 0)
			    continue;
			const wk = this.wireInfoList[k];
			SimulationManager.console("  unresolved: " + wk.wire.constructor.name
			    + " bit=" + wk.bit + " ep0=" + wk.endpoint0 + " ep1=" + wk.endpoint1
			    + " resolved=" + this.wireInfoResolved.get(wk.wire));
		    }
		    this.stop("wire loop detected", wire);
		    return false;
		}
	    }
	}

	/* for (i = 0; i !== this.wireInfoList.length; i++) {
	    const ws = this.wireInfoList[i];
	    SimulationManager.console("wireInfo[" + i + "]: " + ws.wire.constructor.name
		+ " bit=" + ws.bit + " post=" + ws.post
		+ " ep0=" + ws.endpoint0 + " ep1=" + ws.endpoint1
		+ " neighbors=" + (ws.neighbors != null ? ws.neighbors.length : "null")
		+ " labelNeighbors=" + (ws.labelNeighbors != null ? ws.labelNeighbors.length : "null"));
	} */

	return true;
    }

    // find or allocate ground node
    setGroundNode(subcircuit: boolean): void {
	let i: number;
	let gotGround = false;
	let gotRail = false;
	let volt: any = null;  // CircuitElm
	let battery: any = null;  // CircuitElm

	// allocate ground node
	const cn = new CircuitNode();
	cn.index = 0;
	this.nodeList.push(cn);
	CircuitNode.ground = cn;

	//System.out.println("ac1");
	// look for voltage or ground element
	for (i = 0; i !== this.elmList.length; i++) {
	    const ce = this.getElm(i);
	    if (ce.isGroundElm()) {
		gotGround = true;

		// set ground node
		const nme = this.getFromPointMap(this.nodeMap, ce.getPost(0));
		if (nme != null)
		    nme.node = CircuitNode.ground;
		break;
	    }
	    if (ce.isRailElm())
    		gotRail = true;
	    if (volt == null && ce.isVoltageElm())
    		volt = ce;
	    if (battery == null && ce.isBatteryElm())
    		battery = ce;
	}

	// if no ground, and no rails, then the voltage elm's first terminal is ground;
	// if there's no plain voltage elm, fall back to a battery's negative terminal
	// (but not for subcircuits)
	if (!subcircuit && !gotGround && (volt != null || battery != null) && !gotRail) {
	    const pt = (volt != null ? volt : battery).getPost(0);

	    // update node map
	    const cln = this.getFromPointMap(this.nodeMap, pt);
	    if (cln != null)
		cln.node = CircuitNode.ground;
	    else
		this.nodeMap.set(pt, new NodeMapEntry(CircuitNode.ground));
	}
    }

    // make list of nodes
    makeNodeList(): void {
	let i: number, j: number;
	let vscount = 0;

	// call preStamp() on all elements first so CompositeElm can build
	// its internal node list based on final child element state
	for (i = 0; i !== this.elmList.length; i++)
	    this.getElm(i).preStamp();

	for (i = 0; i !== this.elmList.length; i++) {
	    const ce = this.getElm(i);
	    const inodes = ce.getInternalNodeCount();
	    const ivs = ce.getVoltageSourceCount();
	    const posts = ce.getPostCount();

	    // allocate a node for each post and match posts to nodes
	    for (j = 0; j !== posts; j++) {
		const pt = ce.getPost(j);
		const cln = this.getFromPointMap(this.nodeMap, pt);

		// is this node not in map yet?  or is the node number unallocated?
		// (we don't allocate nodes before this because changing the allocation order
		// of nodes changes circuit behavior and breaks backward compatibility;
		// the code below to connect unconnected nodes may connect a different node to ground)
		if (cln == null || cln.node == null) {
		    const cn2 = new CircuitNode();
		    cn2.index = this.nodeList.length;
		    const cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    cn2.links.push(cnl);
		    ce.setNode(j, cn2);
		    if (cln != null)
			cln.node = cn2;
		    else
			this.nodeMap.set(pt, new NodeMapEntry(cn2));
		    this.nodeList.push(cn2);
		} else {
		    const cn2 = cln.node!;
		    const cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    cn2.links.push(cnl);
		    ce.setNode(j, cn2);
		    // if it's the ground node, make sure calculateCurrent() gets called for
		    // this element, since it's never in m.nodeList (ground has no matrix row)
		    // and so setNodeVoltages() will never call it for this link otherwise
		    if (cn2 === CircuitNode.ground)
			ce.calculateCurrent();
		}
	    }
	    for (j = 0; j !== inodes; j++) {
		const cn2 = new CircuitNode();
		cn2.index = this.nodeList.length;
		cn2.internal = true;
		const cnl = new CircuitNodeLink();
		cnl.num = j + posts;
		cnl.elm = ce;
		cn2.links.push(cnl);
		ce.setNode(cnl.num, cn2);
		this.nodeList.push(cn2);
	    }

	    // also count voltage sources so we can allocate array
	    vscount += ivs;
	}

	this.voltageSources = new Array(vscount);
    }

    // recursively add child elements to elmList and make node links
    addChildElms(list: any[]): void {
	for (const ce of list) {
	    const childList: any[] | null = ce.getChildElmList();
	    if (childList != null) {
		// this child is itself a composite; add its children instead
		this.addChildElms(childList);
		continue;
	    }
	    this.elmList.push(ce);
	    const nodeCount = ce.getNodeCount();
	    for (let i = 0; i !== nodeCount; i++) {
		const cn: CircuitNode = ce.getNode(i);
		const cnl = new CircuitNodeLink();
		cnl.num = i;
		cnl.elm = ce;
		cn.links.push(cnl);
		// this is needed so findUnconnectedNodes() works
		cn.internal = false;
	    }
	}
    }

    unconnectedNodes: number[] = [];
    nodesWithGroundConnection: any[] = [];  // CircuitElm[]
    nodesWithGroundConnectionCount: number = 0;

    findUnconnectedNodes(): void {
	let i: number, j: number, k: number;
	const totalNodes = this.nodeList.length;

	// determine nodes that are not connected indirectly to ground.
	// all nodes must be connected to ground somehow, or else we
	// will get a matrix error.
	const closure: boolean[] = new Array(totalNodes).fill(false);
	this.unconnectedNodes = [];
	this.nodesWithGroundConnection = [];
	closure[0] = true;

	// one pass over elements: seed closure with implicit ground connections
	// and build nodesWithGroundConnection (one entry per element, no duplicates)
	for (i = 0; i !== this.elmList.length; i++) {
	    const ce = this.getElm(i);
	    let hasGround = false;
	    for (j = 0; j < ce.getPostCount(); j++) {
		if (ce.hasGroundConnection(j)) {
		    hasGround = true;
		    closure[ce.getNode(j).index] = true;
		}
	    }
	    if (hasGround)
		this.nodesWithGroundConnection.push(ce);
	}

	// BFS via cn.links: propagate closure through element connections.
	// when the queue drains, scan for an unconnected node and seed it so its
	// whole component is absorbed before we flag the next one.
	// use an index pointer into the array as a queue to avoid O(n) shifts.
	const queue: number[] = [];
	for (i = 0; i < totalNodes; i++)
	    if (closure[i]) queue.push(i);
	let qHead = 0;
	let scanFrom = 1;
	for (;;) {
	    if (qHead < queue.length) {
		const n = queue[qHead++];
		const cn = this.getCircuitNode(n)!;
		for (j = 0; j !== cn.links.length; j++) {
		    const cnl = cn.links[j];
		    const ce = cnl.elm;
		    const post1 = cnl.num;
		    for (k = 0; k !== ce.getPostCount(); k++) {
			if (k === post1)
			    continue;
			const kn = ce.getNode(k).index;
			if (!closure[kn] && ce.getConnection(post1, k)) {
			    closure[kn] = true;
			    queue.push(kn);
			}
		    }
		}
	    } else {
		// queue drained; find next unconnected non-internal node
		let found = false;
		for (; scanFrom < totalNodes; scanFrom++) {
		    if (!closure[scanFrom] && !this.getCircuitNode(scanFrom)!.internal) {
			this.unconnectedNodes.push(scanFrom);
			closure[scanFrom] = true;
			queue.push(scanFrom++);
			found = true;
			break;
		    }
		}
		if (!found)
		    break;
	    }
	}
	if (this.unconnectedNodes.length !== 0) {
	    let s = "unconnected nodes:";
	    for (i = 0; i !== this.unconnectedNodes.length; i++)
		s += " " + this.unconnectedNodes[i];
	    SimulationManager.console(s);
	}
    }

    calculateClosures(): void {
	const totalNodes = this.nodeList.length;
	const closureIndex: number[] = new Array(totalNodes).fill(-1);
	let i: number;
	closureIndex[0] = -2; // mark ground as handled

	let closureCount = 0;
	for (i = 1; i !== totalNodes; i++) {
	    if (closureIndex[i] >= 0)
		continue;

	    // flood-fill from node i
	    const stack: number[] = [];
	    stack.push(i);
	    closureIndex[i] = closureCount;

	    //SimulationManager.console("starting closure " + closureCount + " from node " + i);
	    while (stack.length > 0) {
		const n = stack.pop()!;
		const cn = this.getCircuitNode(n)!;
		let j: number;
		for (j = 0; j !== cn.links.length; j++) {
		    const cnl = cn.links[j];
		    const ce = cnl.elm;
		    const post1 = cnl.num;
		    let k: number;
		    for (k = 0; k !== ce.getNodeCount(); k++) {
			if (k === post1)
			    continue;
			if (!ce.getMatrixConnection(post1, k))
			    continue;
			const kn = ce.getNode(k).index;
			if (kn === 0)
			    continue;  // don't flood through ground
			if (closureIndex[kn] < 0) {
			    //SimulationManager.console("  node " + n + " -> node " + kn + " via " + ce.constructor.name);
			    closureIndex[kn] = closureCount;
			    stack.push(kn);
			}
		    }
		}
	    }
	    closureCount++;
	}

	// create CircuitMatrix objects, one per closure
	if (closureCount === 0)
	    closureCount = 1;
	this.matrices = new Array(closureCount);
	for (i = 0; i !== closureCount; i++)
	    this.matrices[i] = new CircuitMatrix();

	// count nodes per closure and assign row numbers
	for (i = 1; i !== totalNodes; i++) {
	    const ci = closureIndex[i];
	    if (ci < 0)
		continue;
	    const cn = this.getCircuitNode(i)!;
	    const m = this.matrices[ci];
	    m.nodeCount++;
	    cn.row = m.nodeCount;  // 1-based
	    cn.matrix = m;
	    m.nodeList.push(cn);
	}

	// ground node: row=0, no matrix
	CircuitNode.ground.row = 0;
	CircuitNode.ground.matrix = null;

	for (let ci = 0; ci !== closureCount; ci++) {
	    let nodeStr = "";
	    for (i = 1; i !== totalNodes; i++) {
		if (closureIndex[i] === ci) {
		    if (nodeStr.length > 0)
			nodeStr += ", ";
		    nodeStr += i;
		}
	    }
	    //SimulationManager.console("matrix " + ci + ": " + this.matrices[ci].nodeCount + " nodes [" + nodeStr + "]");
	}
    }

    // take list of unconnected nodes, which we identified earlier, and connect them to ground
    // with a big resistor.  otherwise we will get matrix errors.  The resistor has to be big,
    // otherwise circuits like 555 Square Wave will break
    connectUnconnectedNodes(): void {
	let i: number;
	for (i = 0; i !== this.unconnectedNodes.length; i++) {
	    const n = this.unconnectedNodes[i];
	    this.stampResistor(CircuitNode.ground, this.nodeList[n], 1e8);
	}
    }

    validateCircuit(): boolean {
	let i: number;

	for (i = 0; i !== this.elmList.length; i++) {
	    const ce = this.getElm(i);
	    if (!ce.validate())
		return false;
	}
	return true;
    }

    // analyze the circuit when something changes, so it can be simulated.
    // Most of this has been moved to preStampCircuit() so it can be avoided if the simulation is stopped.
    analyzeCircuit(): void {
	this.app.setStopElm(null, null);
	this.elmList = this.app.elmList;
	if (this.elmList.length === 0) {
	    this.app.postDrawList = [];
	    this.app.badConnectionList = [];
	    return;
	}
	this.detectBusWidths();
	if (this.app.ui.elmList !== this.app.elmList)
	    this.detectBusWidthsForList(this.app.ui.elmList);
	this.makePostDrawList();

	this.needsStamp = true;
    }

    // do the rest of the pre-stamp circuit analysis
    preStampCircuit(subcircuit: boolean): boolean {
	let i: number, j: number;
	this.nodeList = [];
	this.elmList = this.app.elmList;
	this.calculateWireClosure();
	this.setGroundNode(subcircuit);

	// allocate nodes and voltage sources
	this.makeNodeList();

	// if UI is showing composite internals, run wire closure on UI list to assign
	// nodes to display-only wires and build wireInfoList for current display
	if (this.app.ui.elmList !== this.app.elmList) {
	    this.detectBusWidthsForList(this.app.ui.elmList);
	    this.calculateWireClosureForList(this.app.ui.elmList, true);
	    this.assignUiWireNodes();
	}

	if (!this.calcWireInfo())
	    return false;

	this.nodeMap = new Map(); // done with this
	this.uiNodeMap = new Map();

	// add composite child elements to elmList and make node links
	this.elmList = [...this.app.elmList];
	for (const elm of this.elmList) {
	    const list: any[] | null = elm.getChildElmList();
	    if (list != null)
		this.addChildElms(list);
	}

	let vscount = 0;
	this.circuitNonLinear = false;

	// determine if circuit is nonlinear.  also set voltage sources
	for (i = 0; i !== this.elmList.length; i++) {
	    const ce = this.getElm(i);
	    if (ce.nonLinear())
		this.circuitNonLinear = true;
	    const ivs = ce.getVoltageSourceCount();
	    for (j = 0; j !== ivs; j++) {
		const vs = new VoltageSource();
		vs.index = vscount;
		vs.elm = ce;
		this.voltageSources[vscount] = vs;
		ce.setVoltageSource(j, vs);
		vscount++;
	    }
	}
	this.voltageSourceCount = vscount;

	// show resistance in voltage sources if there's only one.
	// can't use voltageSourceCount here since that counts internal voltage sources, like the one in GroundElm
	let gotVoltageSource = false;
	this.app.showResistanceInVoltageSources = true;
	for (i = 0; i !== this.elmList.length; i++) {
	    const ce = this.getElm(i);
	    if (ce.isVoltageElm()) {
		if (gotVoltageSource)
		    this.app.showResistanceInVoltageSources = false;
		else
		    gotVoltageSource = true;
	    }
	}

	this.findUnconnectedNodes();
	this.calculateClosures();

	if (!this.validateCircuit())
	    return false;

	// assign voltage sources to matrices
	const vsPerMatrix: number[] = new Array(this.matrices!.length).fill(0);
	for (i = 0; i !== this.voltageSourceCount; i++) {
	    const vs = this.voltageSources[i];
	    vs.assignMatrix();
	}
	// assign VS row numbers (after node rows)
	for (i = 0; i !== this.voltageSourceCount; i++) {
	    const vs = this.voltageSources[i];
	    const m = vs.matrix!;
	    let mi = 0;
	    for (j = 0; j !== this.matrices!.length; j++)
		if (this.matrices![j] === m) { mi = j; break; }
	    vsPerMatrix[mi]++;
	    vs.row = m.nodeCount + vsPerMatrix[mi];  // 1-based, after node rows
	    m.voltageSourceList.push(vs);
	}
	// set matrix sizes
	for (i = 0; i !== this.matrices!.length; i++) {
	    this.matrices![i].size = this.matrices![i].nodeCount + vsPerMatrix[i];
	    //SimulationManager.console("matrix " + i + ": size=" + this.matrices![i].size + " nodes=" + this.matrices![i].nodeCount + " vs=" + vsPerMatrix[i]);
	}

	this.nodesWithGroundConnectionCount = this.nodesWithGroundConnection.length;
	// only need this for validation
	this.nodesWithGroundConnection = [];

	this.timeStep = this.maxTimeStep;
	this.needsStamp = true;

	this.app.jsInterface?.callAnalyzeHook();
	return true;
    }

    // do pre-stamping and then stamp circuit
    preStampAndStampCircuit(): void {
	let i: number;

	// preStampCircuit returns false if there's an error.  It can return false if we have capacitor loops
	// but we just need to try again in that case.  Try again 10 times to avoid infinite loop.
	for (i = 0; i !== 10; i++)
	    if (this.preStampCircuit(false) || this.app.stopMessage != null)
		break;
	if (this.app.stopMessage != null)
	    return;
	if (i === 10) {
	    this.stop("failed to stamp circuit", null);
	    return;
	}

	this.stampCircuit();
    }

    // stamp the matrix, meaning populate the matrix as required to simulate the circuit (for all linear elements, at least).
    // this gets called after something changes in the circuit, and also when auto-adjusting timestep
    stampCircuit(): void {
	let i: number;

	// initialize per-matrix arrays
	for (i = 0; i !== this.matrices!.length; i++) {
	    const m = this.matrices![i];
	    const sz = m.size;
	    m.matrix = Array.from({length: sz}, () => new Array(sz).fill(0));
	    m.rightSide = new Array(sz).fill(0);
	    m.origMatrix = Array.from({length: sz}, () => new Array(sz).fill(0));
	    m.origRightSide = new Array(sz).fill(0);
	    m.permute = new Array(sz).fill(0);
	    m.nodeVoltages = new Array(m.nodeCount).fill(0);
	    if (m.lastNodeVoltages == null || m.lastNodeVoltages.length !== m.nodeCount)
		m.lastNodeVoltages = new Array(m.nodeCount).fill(0);
	    m.nonLinear = false;
	}

	// set nonLinear flag per matrix
	if (this.circuitNonLinear) {
	    for (i = 0; i !== this.matrices!.length; i++)
		this.matrices![i].nonLinear = true;
	}

	this.connectUnconnectedNodes();

	// stamp linear circuit elements
	for (i = 0; i !== this.elmList.length; i++) {
	    const ce = this.getElm(i);
	    ce.setParentList(this.elmList);
	    ce.stamp();
	}

	// check if we called stop()
	if (this.matrices == null)
	    return;

	// save original matrices for restoring during nonlinear iterations
	let maxMatrixSize = 0;
	for (let mi = 0; mi !== this.matrices.length; mi++) {
	    const m = this.matrices[mi];
	    const sz = m.size;
	    if (sz > maxMatrixSize) maxMatrixSize = sz;
	    for (i = 0; i !== sz; i++)
		m.origRightSide[i] = m.rightSide[i];
	    for (i = 0; i !== sz; i++)
		for (let j2 = 0; j2 !== sz; j2++)
		    m.origMatrix[i][j2] = m.matrix[i][j2];
	    //SimulationManager.console("matrix " + mi + " size: " + sz);
	}
	// determine which solver to use (AUTO uses the largest matrix size to decide)
	if (this.solverType === SimulationManager.SOLVER_SPARSE)
	    this.usingSparse = true;
	else if (this.solverType === SimulationManager.SOLVER_DENSE)
	    this.usingSparse = false;
	else // SOLVER_AUTO
	    this.usingSparse = (maxMatrixSize >= SimulationManager.SPARSE_THRESHOLD);
	// if a matrix is linear, we can do the lu_factor here instead of
	// needing to do it every frame
	for (let mi = 0; mi !== this.matrices.length; mi++) {
	    const m = this.matrices[mi];
	    if (!m.nonLinear) {
		if (!SimulationManager.lu_factor(m.matrix, m.size, m.permute, m)) {
		    this.stop("Singular matrix!", null);
		    return;
		}
	    }
	}

	// copy elmList to an array to avoid a bunch of calls to canCast() when doing simulation
	this.elmArr = new Array(this.elmList.length);
	let scopeElmCount = 0;
	for (i = 0; i !== this.elmList.length; i++) {
	    this.elmArr[i] = this.elmList[i];
	    if (this.elmArr[i].isScopeElm())
		scopeElmCount++;
	}

	// copy ScopeElms to an array to avoid a second pass over entire list of elms during simulation
	const scopeElmArr: any[] = new Array(scopeElmCount);
	let j2 = 0;
	for (i = 0; i !== this.elmList.length; i++) {
	    if (this.elmArr[i].isScopeElm())
		scopeElmArr[j2++] = this.elmArr[i];
	}
	this.app.scopeElmArr = scopeElmArr;

	this.needsStamp = false;
    }

    // make list of posts we need to draw.  posts shared by 2 elements should be hidden, all
    // others should be drawn.  We can't use the node list for this purpose anymore because wires
    // have the same node number at both ends.
    makePostDrawList(): void {
	const postCountMap: Map<string, {pt: Point, count: number}> = new Map();
	const drawList = this.app.ui.elmList;
	let i: number, j: number;
	for (i = 0; i !== drawList.length; i++) {
	    const ce = drawList[i];
	    const posts = ce.getPostCount();
	    for (j = 0; j !== posts; j++) {
		const pt = ce.getPost(j);
		const key = SimulationManager.pointKey(pt);
		const entry = postCountMap.get(key);
		if (entry == null)
		    postCountMap.set(key, {pt, count: 1});
		else
		    entry.count++;
	    }
	}

	const postDrawList: Point[] = this.app.postDrawList = [];
	const badConnectionList: Point[] = this.app.badConnectionList = [];
	for (const entry of postCountMap.values()) {
	    if (entry.count !== 2)
		postDrawList.push(entry.pt);

	    // look for bad connections, posts not connected to other elements which intersect
	    // other elements' bounding boxes
	    if (entry.count === 1) {
		let bad = false;
		const cn = entry.pt;
		for (j = 0; j !== drawList.length && !bad; j++) {
		    const ce = drawList[j];
		    if (ce.isGraphicElm())
			continue;

		    // routed wire: check path directly instead of bounding box (which is too big)
		    if (ce.isRoutedWireElm()) {
			if (ce.pointOnPath(cn))
			    bad = true;
			continue;
		    }

		    // does this post intersect elm's bounding box?
		    if (!ce.boundingBox.contains(cn.x, cn.y))
			continue;
		    let k: number;
		    // does this post belong to the elm?
		    const pc = ce.getPostCount();
		    for (k = 0; k !== pc; k++)
			if (ce.getPost(k).x === cn.x && ce.getPost(k).y === cn.y)
			    break;
		    if (k === pc)
			bad = true;
		}
		if (bad)
		    badConnectionList.push(cn);
	    }
	}
	badConnectionList.push(...this.busMismatchList);

	// build mapping from elements to connected routed wires
	this.routedWireMap = new Map();
	for (i = 0; i !== drawList.length; i++) {
	    const ce = drawList[i];
	    if (!ce.isRoutedWireElm())
		continue;
	    const rw = ce;
	    const rwPosts = rw.getPostCount();
	    for (let rp = 0; rp < rwPosts; rp++) {
		const rwPt = rw.getPost(rp);
		for (j = 0; j !== drawList.length; j++) {
		    const other = drawList[j];
		    if (other === rw || other.isRoutedWireElm())
			continue;
		    const otherPosts = other.getPostCount();
		    for (let op = 0; op < otherPosts; op++) {
			const op2 = other.getPost(op);
			if (op2.x === rwPt.x && op2.y === rwPt.y) {
			    let list = this.routedWireMap.get(other);
			    if (list == null) {
				list = [];
				this.routedWireMap.set(other, list);
			    }
			    list.push(new RoutedWireConnection(rw, rp, op));
			}
		    }
		}
	    }
	}
    }


    stop(s: string, ce: any): void {
	this.app.setStopElm(ce, Locale.LS(s));
	this.matrices = null;  // causes an exception
	this.app.setSimRunning(false);
	this.app.analyzeFlag = false;
    }

    // control voltage source vs with voltage from n1 to n2 (must
    // also call stampVoltageSource())
    stampVCVS(n1: CircuitNode, n2: CircuitNode, coef: number, vs: VoltageSource): void {
	this.stampMatrixNV(vs, n1, coef);
	this.stampMatrixNV(vs, n2, -coef);
    }

    // stamp independent voltage source #vs, from n1 to n2, amount v
    stampVoltageSource(n1: CircuitNode, n2: CircuitNode, vs: VoltageSource | null, v?: number): void {
	if (vs == null) return;
	if (v !== undefined) {
	    this.stampMatrixNV(vs, n1, -1);
	    this.stampMatrixNV(vs, n2, 1);
	    this.stampRightSideVS(vs, v);
	    this.stampMatrixVN(n1, vs, 1);
	    this.stampMatrixVN(n2, vs, -1);
	} else {
	    // use this if the amount of voltage is going to be updated in doStep(), by updateVoltageSource()
	    this.stampMatrixNV(vs, n1, -1);
	    this.stampMatrixNV(vs, n2, 1);
	    this.stampMatrixVN(n1, vs, 1);
	    this.stampMatrixVN(n2, vs, -1);
	}
    }

    // stamp voltage source using nodes saved in VoltageSource
    stampVoltageSourceVS(vs: VoltageSource, v: number): void {
	this.stampVoltageSource(vs.n1!, vs.n2!, vs, v);
    }

    // update voltage source in doStep()
    updateVoltageSource(n1: CircuitNode, n2: CircuitNode, vs: VoltageSource | null, v: number): void {
	if (vs == null) return;
	this.stampRightSideVS(vs, v);
    }

    stampResistor(n1: CircuitNode, n2: CircuitNode, r: number): void {
	const r0 = 1 / r;
	if (isNaN(r0) || !isFinite(r0)) {
	    console.log("bad resistance " + r + " " + r0 + "\n");
	    return;
	}
	this.stampMatrix(n1, n1, r0);
	this.stampMatrix(n2, n2, r0);
	this.stampMatrix(n1, n2, -r0);
	this.stampMatrix(n2, n1, -r0);
    }

    stampConductance(n1: CircuitNode, n2: CircuitNode, r0: number): void {
	this.stampMatrix(n1, n1, r0);
	this.stampMatrix(n2, n2, r0);
	this.stampMatrix(n1, n2, -r0);
	this.stampMatrix(n2, n1, -r0);
    }

    // specify that current from cn1 to cn2 is equal to voltage from vn1 to vn2, divided by g
    stampVCCurrentSource(cn1: CircuitNode, cn2: CircuitNode, vn1: CircuitNode, vn2: CircuitNode, g: number): void {
	this.stampMatrix(cn1, vn1, g);
	this.stampMatrix(cn2, vn2, g);
	this.stampMatrix(cn1, vn2, -g);
	this.stampMatrix(cn2, vn1, -g);
    }

    stampCurrentSource(n1: CircuitNode, n2: CircuitNode, i: number): void {
	this.stampRightSide(n1, -i);
	this.stampRightSide(n2, i);
    }

    // stamp a current source from n1 to n2 depending on current through vs
    stampCCCS(n1: CircuitNode, n2: CircuitNode, vs: VoltageSource, gain: number): void {
	this.stampMatrixVN(n1, vs, gain);
	this.stampMatrixVN(n2, vs, -gain);
    }

    // stamp value x in row i, column j, meaning that a voltage change
    // of dv in node j will increase the current into node i by x dv.
    // (Unless i or j is a voltage source node.)
    stampMatrix(i: CircuitNode, j: CircuitNode, x: number): void {
	if (!isFinite(x))
	    SimulationManager.debugger();
	if (i.row > 0 && j.row > 0) {
	    if (i.matrix !== j.matrix)
		SimulationManager.console("stampMatrix cross-matrix! node " + i.index + " (matrix row " + i.row + ") vs node " + j.index + " (matrix row " + j.row + ")");
	    const m = (i !== CircuitNode.ground) ? i.matrix! : j.matrix!;
	    m.matrix[i.row-1][j.row-1] += x;
	}
    }

    // stamp from voltage source row to node column
    stampMatrixNV(i: VoltageSource, j: CircuitNode, x: number): void {
	if (!isFinite(x))
	    SimulationManager.debugger();
	if (j.row > 0) {
	    if (i.matrix !== j.matrix)
		SimulationManager.console("stampMatrix cross-matrix! vs row " + i.row + " vs node " + j.index + " (row " + j.row + ")");
	    i.matrix!.matrix[i.row-1][j.row-1] += x;
	}
    }

    // stamp from node row to voltage source column
    stampMatrixVN(i: CircuitNode, j: VoltageSource, x: number): void {
	if (!isFinite(x))
	    SimulationManager.debugger();
	if (i.row > 0) {
	    if (i.matrix !== j.matrix)
		SimulationManager.console("stampMatrix cross-matrix! node " + i.index + " (row " + i.row + ") vs vs row " + j.row);
	    j.matrix!.matrix[i.row-1][j.row-1] += x;
	}
    }

    // stamp voltage source to voltage source
    stampMatrixVV(i: VoltageSource, j: VoltageSource, x: number): void {
	if (!isFinite(x))
	    SimulationManager.debugger();
	if (i.matrix !== j.matrix)
	    SimulationManager.console("stampMatrix cross-matrix! vs row " + i.row + " vs vs row " + j.row);
	i.matrix!.matrix[i.row-1][j.row-1] += x;
    }

    // stamp value x on the right side of row i, representing an
    // independent current source flowing into node i
    stampRightSide(n: CircuitNode, x?: number): void {
	if (x === undefined)
	    return;
	if (n.row > 0)
	    n.matrix!.rightSide[n.row-1] += x;
    }

    stampRightSideVS(vs: VoltageSource, x: number): void {
	if (x === undefined)
	    return;
	vs.matrix!.rightSide[vs.row-1] += x;
    }

    // indicate that the values on the left side of row change in doStep() (no-ops)
    stampNonLinear(n: CircuitNode): void { }
    stampNonLinearVS(vs: VoltageSource): void { }

    converged: boolean = false;
    subIterations: number = 0;

    runCircuit(didAnalyze: boolean): void {
	if (this.matrices == null || this.elmList.length === 0) {
	    this.matrices = null;
	    return;
	}
	let iter: number;
	//const maxIter = this.app.getIterCount();
	let debugprint = this.app.dumpMatrix;
	this.app.dumpMatrix = false;
	const steprate = Math.trunc(160 * this.app.getIterCount());
	let tm = Date.now();
	let lit = this.lastIterTime;
	if (lit === 0) {
	    this.lastIterTime = tm;
	    return;
	}

	// Check if we don't need to run simulation (for very slow simulation speeds).
	// If the circuit changed, do at least one iteration to make sure everything is consistent.
	if (1000 >= steprate * (tm - this.lastIterTime) && !didAnalyze)
	    return;

	const delayWireProcessing = this.app.scopeManager.canDelayWireProcessing();

	const timeStepCountAtFrameStart = this.timeStepCount;

	// keep track of iterations completed without convergence issues
	let goodIterations = 100;

	const frameTimeLimit = Math.trunc(1000 / this.app.minFrameRate);

	if (CircuitNode.ground.v != 0)
	    this.stop("ground node at nonzero voltage", null);

	for (iter = 1; ; iter++) {
	    if (goodIterations >= 3 && this.timeStep < this.maxTimeStep) {
		// things are going well, double the time step
		this.timeStep = Math.min(this.timeStep * 2, this.maxTimeStep);
		SimulationManager.console("timestep up = " + this.timeStep + " at " + this.t);
		this.stampCircuit();
		goodIterations = 0;
	    }
	    // TODO: TestManager integration

	    let i: number, j: number, subiter: number;
	    for (i = 0; i !== this.elmArr.length; i++)
		this.elmArr[i].startIteration();
	    this.app.ui.steps++;
	    const subiterCount = (this.adjustTimeStep && this.timeStep / 2 > this.minTimeStep) ? 100 : 5000;
	    for (subiter = 0; subiter !== subiterCount; subiter++) {
		this.converged = true;
		this.subIterations = subiter;
		for (let mi = 0; mi !== this.matrices!.length; mi++) {
		    const m = this.matrices![mi];
		    for (i = 0; i !== m.size; i++)
			m.rightSide[i] = m.origRightSide[i];
		    if (m.nonLinear) {
			for (i = 0; i !== m.size; i++)
			    for (j = 0; j !== m.size; j++)
				m.matrix[i][j] = m.origMatrix[i][j];
		    }
		}
		for (i = 0; i !== this.elmArr.length; i++)
		    this.elmArr[i].doStep();
		if (this.app.stopMessage != null)
		    return;
		const printit = debugprint;
		debugprint = false;
		for (let mi = 0; mi !== this.matrices!.length; mi++) {
		    const m = this.matrices![mi];
		    if (m.size < 8) {
			for (j = 0; j !== m.size; j++) {
			    for (i = 0; i !== m.size; i++) {
				const x = m.matrix[i][j];
				if (isNaN(x) || !isFinite(x)) {
				    this.stop("nan/infinite matrix!", null);
				    SimulationManager.console("matrix " + mi + " [" + i + "][" + j + "] is " + x);
				    return;
				}
			    }
			}
		    }
		    if (printit) {
			SimulationManager.console("matrix " + mi + ":");
			for (j = 0; j !== m.size; j++) {
			    let x = "";
			    for (i = 0; i !== m.size; i++)
				x += m.matrix[j][i] + ",";
			    x += "\n";
			    SimulationManager.console(x);
			}
		    }
		    if (m.nonLinear) {
			if (this.converged && subiter > 0)
			    continue;
			if (!SimulationManager.lu_factor(m.matrix, m.size, m.permute, m)) {
			    this.stop("Singular matrix!", null);
			    return;
			}
		    }
		    SimulationManager.lu_solve(m.matrix, m.size, m.permute, m.rightSide, m);
		    this.applySolvedRightSide(m);
		}
		if (printit)
		    SimulationManager.console("done");
		if (!this.circuitNonLinear)
		    break;
		if (this.converged && subiter > 0)
		    break;
	    }
	    if (subiter === subiterCount) {
		// convergence failed
		goodIterations = 0;
		if (this.adjustTimeStep) {
		    this.timeStep /= 2;
		    SimulationManager.console("timestep down to " + this.timeStep + " at " + this.t);
		}
		if (this.timeStep < this.minTimeStep || !this.adjustTimeStep) {
		    SimulationManager.console("convergence failed after " + subiter + " iterations");
		    this.stop("Convergence failed!", null);
		    break;
		}
		// we reduced the timestep.  reset circuit state to the way it was at start of iteration
		for (let mi = 0; mi !== this.matrices!.length; mi++)
		    this.setNodeVoltages(this.matrices![mi], this.matrices![mi].lastNodeVoltages!);
		this.stampCircuit();
		continue;
	    }
	    if (subiter > 5 || this.timeStep < this.maxTimeStep)
		SimulationManager.console("converged after " + subiter + " iterations, timeStep = " + this.timeStep);
	    if (subiter < 3)
		goodIterations++;
	    else
		goodIterations = 0;
	    this.t += this.timeStep;
	    this.timeStepAccum += this.timeStep;
	    if (this.timeStepAccum >= this.maxTimeStep) {
		this.timeStepAccum -= this.maxTimeStep;
		this.timeStepCount++;
	    }
	    for (i = 0; i !== this.elmArr.length; i++)
		this.elmArr[i].stepFinished();
	    if (!delayWireProcessing)
		this.calcWireCurrents();
	    this.app.onTimeStep();
	    // TODO: TestManager.theManager.checkTime()
	    // save last node voltages so we can restart the next iteration if necessary
	    for (let mi = 0; mi !== this.matrices!.length; mi++) {
		const m = this.matrices![mi];
		for (i = 0; i !== m.nodeCount; i++)
		    m.lastNodeVoltages![i] = m.nodeVoltages[i];
	    }
//	    SimulationManager.console("set lastrightside at " + this.t + " " + this.lastNodeVoltages);

	    tm = Date.now();
	    lit = tm;

	    // Check whether enough time has elapsed to perform an *additional* iteration after
	    // those we have already completed.  But limit total computation time to 50ms (20fps) by default
	    if ((this.timeStepCount - timeStepCountAtFrameStart) * 1000 >= steprate * (tm - this.lastIterTime) || (tm - this.app.ui.lastFrameTime > frameTimeLimit))
		break;
	    if (!this.app.simRunning)
		break;
	} // for (iter = 1; ; iter++)
	this.lastIterTime = lit;
	if (delayWireProcessing)
	    this.calcWireCurrents();
//	System.out.println((System.currentTimeMillis()-lastFrameTime)/(double) iter);
    }

    // set node voltages given right side found by solving one matrix
    applySolvedRightSide(m: CircuitMatrix): void {
	let j: number;
	for (j = 0; j !== m.size; j++) {
	    const res = m.rightSide[j];
	    if (isNaN(res)) {
		this.converged = false;
		break;
	    }
	    if (j < m.nodeCount) {
		m.nodeVoltages[j] = res;
	    }
	}
	// set currents for voltage sources in this matrix
	for (j = 0; j !== m.voltageSourceList.length; j++) {
	    const vs = m.voltageSourceList[j];
	    const res = m.rightSide[vs.row-1];
	    if (!isNaN(res))
		vs.elm.setCurrent(vs, res);
	}
	this.setNodeVoltages(m, m.nodeVoltages);
    }

    // set node voltages in each element given an array of node voltages for one matrix
    setNodeVoltages(m: CircuitMatrix, nv: number[]): void {
	let j: number, k: number;
	for (j = 0; j !== m.nodeList.length; j++) {
	    const cn = m.nodeList[j];
	    const res = nv[cn.row-1];
	    cn.v = res;
	    for (k = 0; k !== cn.links.length; k++) {
		const cnl = cn.links[k];
		cnl.elm.calculateCurrent();
	    }
	}
    }

    // we removed wires from the matrix to speed things up.  in order to display wire currents,
    // we need to calculate them now.
    calcWireCurrents(): void {
	let i: number, j: number;

	for (i = 0; i !== this.wireInfoList.length; i++) {
	    const ws = this.wireInfoList[i];
	    let cur = 0;

	    if (ws.post === 0) {
		// resolve from endpoint0 (position-based neighbors)
		const p = ws.wire.getPost(ws.bit);
		for (j = 0; j !== ws.neighbors!.length; j++) {
		    const ce = ws.neighbors![j];
		    cur += ce.getCurrentIntoNode(ce.getNodeAtPoint(p));
		}
	    } else {
		if (ws.endpoint1 != null && ws.endpoint1.startsWith("label:")) {
		    // label neighbors: use their already-computed current
		    if (ws.labelNeighbors != null)
			for (j = 0; j !== ws.labelNeighbors.length; j++)
			    cur += ws.labelNeighbors[j].current;
		} else {
		    // position-based neighbors at endpoint1
		    const p = ws.wire.getConnectedPost(ws.bit);
		    for (j = 0; j !== ws.neighbors!.length; j++) {
			const ce = ws.neighbors![j];
			cur += ce.getCurrentIntoNode(ce.getNodeAtPoint(p));
		    }
		}
	    }
	    // get correct current polarity
	    if (ws.post !== 0)
		cur = -cur;
	    ws.wire.setWireCurrent(ws.bit, cur);
	    ws.current = cur;
	}
    }


    getCircuitAsComposite(): any {
	return HookRegistry.getCircuitAsComposite?.(this) ?? null;
    }

    static invertMatrix(a: number[][], n: number): void {
	const ipvt: number[] = new Array(n);
	SimulationManager.lu_factor_dense(a, n, ipvt);
	let i: number, j: number;
	const b: number[] = new Array(n).fill(0);
	const inva: number[][] = Array.from({length: n}, () => new Array(n).fill(0));

	// solve for each column of identity matrix
	for (i = 0; i !== n; i++) {
	    for (j = 0; j !== n; j++)
		b[j] = 0;
	    b[i] = 1;
	    SimulationManager.lu_solve_dense(a, n, ipvt, b);
	    for (j = 0; j !== n; j++)
		inva[j][i] = b[j];
	}

	// return in original matrix
	for (i = 0; i !== n; i++)
	    for (j = 0; j !== n; j++)
		a[i][j] = inva[i][j];
    }

    // Dispatching lu_factor: uses sparse or dense solver based on solverType setting
    static lu_factor(a: number[][], n: number, ipvt: number[], cm: CircuitMatrix): boolean {
	const sm = SimulationManager.theSim;
	if (sm !== null && sm.usingSparse) {
	    const sparse = DMatrixSparseCSC.convert(a, DMatrixSparseCSC.EPS);
	    if (cm.sparseLU === null) cm.sparseLU = new SparseLU();
	    return cm.sparseLU.setA(sparse);
	}
	return SimulationManager.lu_factor_dense(a, n, ipvt);
    }

    // factors a matrix into upper and lower triangular matrices by
    // gaussian elimination.  On entry, a[0..n-1][0..n-1] is the
    // matrix to be factored.  ipvt[] returns an integer vector of pivot
    // indices, used in the lu_solve() routine.
    static lu_factor_dense(a: number[][], n: number, ipvt: number[]): boolean {
	let i: number, j: number, k: number;

	// check for a possible singular matrix by scanning for rows that
	// are all zeroes
	for (i = 0; i !== n; i++) {
	    let row_all_zeros = true;
	    for (j = 0; j !== n; j++) {
		if (a[i][j] !== 0) {
		    row_all_zeros = false;
		    break;
		}
	    }
	    // if all zeros, it's a singular matrix
	    if (row_all_zeros)
		return false;
	}

	// use Crout's method; loop through the columns
	for (j = 0; j !== n; j++) {

	    // calculate upper triangular elements for this column
	    for (i = 0; i !== j; i++) {
		let q = a[i][j];
		for (k = 0; k !== i; k++)
		    q -= a[i][k] * a[k][j];
		a[i][j] = q;
	    }

	    // calculate lower triangular elements for this column
	    let largest = 0;
	    let largestRow = -1;
	    for (i = j; i !== n; i++) {
		let q = a[i][j];
		for (k = 0; k !== j; k++)
		    q -= a[i][k] * a[k][j];
		a[i][j] = q;
		const x = Math.abs(q);
		if (x >= largest) {
		    largest = x;
		    largestRow = i;
		}
	    }

	    // pivoting
	    if (j !== largestRow) {
		if (largestRow === -1) {
		    SimulationManager.console("largestRow == -1");
		    return false;
		}
		let x: number;
		for (k = 0; k !== n; k++) {
		    x = a[largestRow][k];
		    a[largestRow][k] = a[j][k];
		    a[j][k] = x;
		}
	    }

	    // keep track of row interchanges
	    ipvt[j] = largestRow;

	    // check for zeroes; if we find one, it's a singular matrix.
	    // we used to avoid them, but that caused weird bugs.  For example,
	    // two inverters with outputs connected together should be flagged
	    // as a singular matrix, but it was allowed (with weird currents)
	    if (a[j][j] === 0.0) {
		SimulationManager.console("didn't avoid zero");
//		a[j][j]=1e-18;
		return false;
	    }

	    if (j !== n - 1) {
		const mult = 1.0 / a[j][j];
		for (i = j + 1; i !== n; i++)
		    a[i][j] *= mult;
	    }
	}
	return true;
    }

    // Dispatching lu_solve: uses sparse or dense solver based on solverType setting
    static lu_solve(a: number[][], n: number, ipvt: number[], b: number[], cm: CircuitMatrix): void {
	const sm = SimulationManager.theSim;
	if (sm !== null && sm.usingSparse && cm.sparseLU !== null) {
	    cm.sparseLU.solve(b, b);
	    return;
	}
	SimulationManager.lu_solve_dense(a, n, ipvt, b);
    }

    // Solves the set of n linear equations using a LU factorization
    // previously performed by lu_factor.  On input, b[0..n-1] is the right
    // hand side of the equations, and on output, contains the solution.
    static lu_solve_dense(a: number[][], n: number, ipvt: number[], b: number[]): void {
	let i: number;

	// find first nonzero b element
	for (i = 0; i !== n; i++) {
	    const row = ipvt[i];

	    let swap = b[row];
	    b[row] = b[i];
	    b[i] = swap;
	    if (swap !== 0)
		break;
	}

	const bi = i++;
	for (; i < n; i++) {
	    const row = ipvt[i];
	    let j: number;
	    let tot = b[row];

	    b[row] = b[i];
	    // forward substitution using the lower triangular matrix
	    for (j = bi; j < i; j++)
		tot -= a[i][j] * b[j];
	    b[i] = tot;
	}
	for (i = n - 1; i >= 0; i--) {
	    let tot = b[i];

	    // back-substitution using the upper triangular matrix
	    let j: number;
	    for (j = i + 1; j !== n; j++)
		tot -= a[i][j] * b[j];
	    b[i] = tot / a[i][i];
	}
    }

    getLabeledNodeVoltage(name: string): number {
	for (let i = 0; i < this.elmList.length; i++) {
	    const ce = this.elmList[i];
	    if (ce.isLabeledNodeElm() && (ce as any).getName() === name)
		return ce.nodes[0].v;
	}
	return 0;
    }

    static pointKey(p: Point): string { return p.x + "," + p.y + "," + p.z; }

    static WireSegment = WireSegment;
    static RoutedWireConnection = RoutedWireConnection;
}

class NodeMapEntry {
    node: CircuitNode | null;
    constructor(n?: CircuitNode) { this.node = n ?? null; }
}
