package com.lushprojects.circuitjs1.client;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Vector;

import com.google.gwt.user.client.Window;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.XMLParser;
import com.lushprojects.circuitjs1.client.util.Locale;

public class SimulationManager {

    CirSim app;
    static SimulationManager theSim;

    // this is different than the main elmList; it has CompositeElm child elms in it
    Vector<CircuitElm> elmList;
    
    Vector<CircuitNode> nodeList;
    CircuitElm voltageSources[];

    double circuitMatrix[][], circuitRightSide[], lastNodeVoltages[], nodeVoltages[], origRightSide[], origMatrix[][];
    RowInfo circuitRowInfo[];
    int circuitPermute[];
    boolean circuitNonLinear;
    int voltageSourceCount;
    int circuitMatrixSize, circuitMatrixFullSize;
    boolean circuitNeedsMap;
    boolean needsStamp;
    CircuitElm elmArr[];
    double t;

    // current timestep (time between iterations)
    double timeStep;

    // maximum timestep (== timeStep unless we reduce it because of trouble
    // converging)
    double maxTimeStep;
    double minTimeStep;

    // accumulated time since we incremented timeStepCount
    double timeStepAccum;

    // incremented each time we advance t by maxTimeStep
    int timeStepCount;

    boolean adjustTimeStep;

    long lastIterTime;
    
    public static native void console(String text) /*-{ console.log(text) }-*/;
    public static native void debugger() /*-{ debugger; }-*/;

    SimulationManager(CirSim app_) { theSim = this; app = app_; }
    
    void resetTime() {
    	t = timeStepAccum = 0;
    	timeStepCount = 0;
    }
    
    public CircuitNode getCircuitNode(int n) {
	if (n >= nodeList.size())
	    return null;
	return nodeList.elementAt(n);
    }

    public CircuitElm getElm(int n) {
	if (n >= elmList.size())
	    return null;
	return elmList.elementAt(n);
    }
    
    class NodeMapEntry {
	int node;
	NodeMapEntry() { node = -1; }
	NodeMapEntry(int n) { node = n; }
    }
    // map points to node numbers
    HashMap<Point,NodeMapEntry> nodeMap;
    // separate node map for UI element list (when viewing composite internals)
    HashMap<Point,NodeMapEntry> uiNodeMap;
    
    class WireInfo {
	CircuitElm wire;
	Vector<CircuitElm> neighbors;
	int post;
	WireInfo(CircuitElm w) {
	    wire = w;
	}
    }
    
    // info about each wire and its neighbors, used to calculate wire currents
    Vector<WireInfo> wireInfoList;
    // the element list that wireInfoList was built from
    HashSet<CircuitElm> wireInfoElmSet;
    
    // find groups of nodes connected by wire equivalents and map them to the same node.  this speeds things
    // up considerably by reducing the size of the matrix.  We do this for wires, labeled nodes, and ground.
    // The actual node we map to is not assigned yet.  Instead we map to the same NodeMapEntry.
    void calculateWireClosure() {
	LabeledNodeElm.resetNodeList();
	GroundElm.resetNodeList();
	calculateWireClosureForList(elmList, false);
    }

    // run wire closure on a given element list.  if uiList is true, treat LabeledNodeElm.getConnectedPost()
    // as null (since labeled nodes in subcircuits connect to composite terminals, not to each other)
    void calculateWireClosureForList(Vector<CircuitElm> list, boolean uiList) {
	int i;
	HashMap<Point,NodeMapEntry> nm = new HashMap<Point,NodeMapEntry>();
	wireInfoList = new Vector<WireInfo>();
	wireInfoElmSet = new HashSet<CircuitElm>(list);
	for (i = 0; i != list.size(); i++) {
	    CircuitElm ce = list.get(i);
	    if (!ce.isRemovableWire())
		continue;
	    ce.hasWireInfo = false;
	    wireInfoList.add(new WireInfo(ce));
	    Point p0 = ce.getPost(0);
	    NodeMapEntry cn  = nm.get(p0);

	    // what post are we connected to
	    Point p1 = (uiList && ce instanceof LabeledNodeElm) ? null : ce.getConnectedPost();
	    if (p1 == null) {
		// no connected post (true for labeled node the first time it's encountered, or ground)
		if (cn == null) {
		    cn = new NodeMapEntry();
		    nm.put(p0, cn);
		}
		continue;
	    }
	    NodeMapEntry cn2 = nm.get(p1);
	    if (cn != null && cn2 != null) {
		// merge nodes; go through map and change all keys pointing to cn2 to point to cn
		for (Map.Entry<Point, NodeMapEntry> entry : nm.entrySet()) {
		    if (entry.getValue() == cn2)
			entry.setValue(cn);
		}
		continue;
	    }
	    if (cn != null) {
		nm.put(p1, cn);
		continue;
	    }
	    if (cn2 != null) {
		nm.put(p0, cn2);
		continue;
	    }
	    // new entry
	    cn = new NodeMapEntry();
	    nm.put(p0, cn);
	    nm.put(p1, cn);
	}
	if (uiList)
	    uiNodeMap = nm;
	else
	    nodeMap = nm;
    }

    // assign nodes to UI wires (which aren't part of simulation) based on neighboring non-wire elements
    // that already have nodes assigned by makeNodeList.  also add wire links to nodeList so calcWireInfo works.
    void assignUiWireNodes() {
	Vector<CircuitElm> uiList = app.ui.elmList;

	// build point-to-node map from non-wire elements in UI list,
	// and add their links to nodeList so calcWireInfo can find neighbors
	// and so setNodeVoltages() updates their volts[] for display
	for (int i = 0; i != uiList.size(); i++) {
	    CircuitElm ce = uiList.get(i);
	    if (ce.isRemovableWire())
		continue;
	    for (int j = 0; j != ce.getPostCount(); j++) {
		Point pt = ce.getPost(j);
		NodeMapEntry nme = uiNodeMap.get(pt);
		if (nme != null && nme.node == -1)
		    nme.node = ce.getNode(j);
		// always link non-wire elements to nodeList so their volts[]
		// get updated, even if the post isn't at a wire endpoint
		// (e.g. composite elements whose posts connect directly)
		int node = ce.getNode(j);
		CircuitNode cn = (node >= 0) ? getCircuitNode(node) : null;
		if (cn != null) {
		    CircuitNodeLink cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    cn.links.addElement(cnl);
		}
	    }
	}

	// assign nodes to wires and add their links to nodeList
	for (int i = 0; i != uiList.size(); i++) {
	    CircuitElm ce = uiList.get(i);
	    if (!ce.isRemovableWire())
		continue;
	    for (int j = 0; j != ce.getPostCount(); j++) {
		Point pt = ce.getPost(j);
		NodeMapEntry nme = uiNodeMap.get(pt);
		if (nme != null && nme.node >= 0) {
		    ce.setNode(j, nme.node);
		    CircuitNodeLink cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    getCircuitNode(nme.node).links.addElement(cnl);
		} else
		    console("missing node for " + pt);
	    }
	}
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
    boolean calcWireInfo() {
	int i;
	int moved = 0;
	
	for (i = 0; i != wireInfoList.size(); i++) {
	    WireInfo wi = wireInfoList.get(i);
	    CircuitElm wire = wi.wire;
	    CircuitNode cn1 = nodeList.get(wire.getNode(0));  // both ends of wire have same node #
	    int j;

	    Vector<CircuitElm> neighbors0 = new Vector<CircuitElm>();
	    Vector<CircuitElm> neighbors1 = new Vector<CircuitElm>();
	    
	    // assume each end is ready (except ground nodes which have one end)
	    // labeled nodes are treated as having 2 terminals, see below
	    boolean isReady0 = true, isReady1 = !(wire instanceof GroundElm);

	    // go through elements sharing a node with this wire (may be connected indirectly
	    // by other wires, but at least it's faster than going through all elements)
	    // console("looking at " + wire + " " + wire.getNode(0));
	    for (j = 0; j != cn1.links.size(); j++) {
		CircuitNodeLink cnl = cn1.links.get(j);
		CircuitElm ce = cnl.elm;
		if (ce == wire)
		    continue;
		// skip elements not in the list we're processing
		if (!wireInfoElmSet.contains(ce))
		    continue;
		// skip internal nodes (e.g. from enclosing CompositeElm) which have no position
		if (cnl.num >= ce.getPostCount())
		    continue;
		Point pt = ce.getPost(cnl.num);
		// console("  connected to " + ce + " " + pt + " " + cnl.num + " " + ce.getPostCount());
		if (pt == null)
		    continue;
		
		// is this a wire that doesn't have wire info yet?  If so we can't use it yet.
		// That would create a circular dependency.  So that side isn't ready.
		boolean notReady = (ce.isRemovableWire() && !ce.hasWireInfo);
		
		// which post does this element connect to, if any?
		if (pt.x == wire.x && pt.y == wire.y) {
		    // console("  found immediate neighbor " + ce + " " + pt);
		    neighbors0.add(ce);
		    if (notReady) isReady0 = false;
		} else if (wire.getPostCount() > 1) {
		    Point p2 = wire.getConnectedPost();
		    if (pt.x == p2.x && pt.y == p2.y) { 
			neighbors1.add(ce);
			// console("  found immediate neighbor " + ce + " " + pt);
			if (notReady) isReady1 = false;
		    }
		} else if (ce instanceof LabeledNodeElm && wire instanceof LabeledNodeElm &&
			((LabeledNodeElm) ce).text == ((LabeledNodeElm) wire).text) {
		    // ce and wire are both labeled nodes with matching labels.  treat them as neighbors
		    neighbors1.add(ce);
		    if (notReady) isReady1 = false;
		}
	    }

	    // does one of the posts have all information necessary to calculate current?
	    if (isReady0) {
		wi.neighbors = neighbors0;
		wi.post = 0;
		wire.hasWireInfo = true;
		moved = 0;
	    } else if (isReady1 && (!neighbors1.isEmpty() || !(wire instanceof LabeledNodeElm))) {
		wi.neighbors = neighbors1;
		wi.post = 1;
		wire.hasWireInfo = true;
		moved = 0;
	    } else {
		// no, so move to the end of the list and try again later
		wireInfoList.add(wireInfoList.remove(i--));
		moved++;
		if (moved > wireInfoList.size() * 2) {
		    Vector<CircuitElm> uiList = app.ui.elmList;
		    Vector<CircuitElm> mainList = app.elmList;
		    console("wire loop detected, " + wireInfoList.size() + " wires total, unresolved:");
		    for (int k = i; k < wireInfoList.size(); k++) {
			WireInfo wk = wireInfoList.get(k);
			CircuitElm ww = wk.wire;
			console("  unresolved: " + ww + " (" + ww.x + "," + ww.y + ")-(" + ww.x2 + "," + ww.y2 + ") hasWireInfo=" + ww.hasWireInfo
			    + " inUI=" + uiList.contains(ww) + " inMain=" + mainList.contains(ww));
		    }
		    console("current wire: " + wire + " (" + wire.x + "," + wire.y + ")-(" + wire.x2 + "," + wire.y2 + ")"
			+ " inUI=" + uiList.contains(wire) + " inMain=" + mainList.contains(wire));
		    console("  isReady0=" + isReady0 + " neighbors0=" + neighbors0.size() + " isReady1=" + isReady1 + " neighbors1=" + neighbors1.size());
		    for (int k = 0; k < neighbors0.size(); k++) {
			CircuitElm ne = neighbors0.get(k);
			console("  neighbor0: " + ne + " removable=" + ne.isRemovableWire() + " hasWireInfo=" + ne.hasWireInfo
			    + " inUI=" + uiList.contains(ne) + " inMain=" + mainList.contains(ne));
		    }
		    for (int k = 0; k < neighbors1.size(); k++) {
			CircuitElm ne = neighbors1.get(k);
			console("  neighbor1: " + ne + " removable=" + ne.isRemovableWire() + " hasWireInfo=" + ne.hasWireInfo
			    + " inUI=" + uiList.contains(ne) + " inMain=" + mainList.contains(ne));
		    }
		    stop("wire loop detected", wire);
		    return false;
		}
	    }
	}
	
	return true;
    }

    // find or allocate ground node
    void setGroundNode(boolean subcircuit) {
	int i;
	boolean gotGround = false;
	boolean gotRail = false;
	CircuitElm volt = null;
	    
	//System.out.println("ac1");
	// look for voltage or ground element
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (ce instanceof GroundElm) {
		gotGround = true;
		
		// set ground node to 0
		NodeMapEntry nme = nodeMap.get(ce.getPost(0));
		nme.node = 0;
		break;
	    }
	    if (ce instanceof RailElm)
	    	gotRail = true;
	    if (volt == null && ce instanceof VoltageElm)
	    	volt = ce;
	}

	// if no ground, and no rails, then the voltage elm's first terminal
	// is ground (but not for subcircuits)
	if (!subcircuit && !gotGround && volt != null && !gotRail) {
	    CircuitNode cn = new CircuitNode();
	    Point pt = volt.getPost(0);
	    nodeList.addElement(cn);

	    // update node map
	    NodeMapEntry cln = nodeMap.get(pt);
	    if (cln != null)
		cln.node = 0;
	    else
		nodeMap.put(pt, new NodeMapEntry(0));
	} else {
	    // otherwise allocate extra node for ground
	    CircuitNode cn = new CircuitNode();
	    nodeList.addElement(cn);
	}
    }

    // make list of nodes
    void makeNodeList() {
	int i, j;
	int vscount = 0;

	// call preStamp() on all elements first so CompositeElm can build
	// its internal node list based on final child element state
	for (i = 0; i != elmList.size(); i++)
	    getElm(i).preStamp();

	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    int inodes = ce.getInternalNodeCount();
	    int ivs = ce.getVoltageSourceCount();
	    int posts = ce.getPostCount();
	    
	    // allocate a node for each post and match posts to nodes
	    for (j = 0; j != posts; j++) {
		Point pt = ce.getPost(j);
		NodeMapEntry cln = nodeMap.get(pt);
		
		// is this node not in map yet?  or is the node number unallocated?
		// (we don't allocate nodes before this because changing the allocation order
		// of nodes changes circuit behavior and breaks backward compatibility;
		// the code below to connect unconnected nodes may connect a different node to ground) 
		if (cln == null || cln.node == -1) {
		    CircuitNode cn = new CircuitNode();
		    CircuitNodeLink cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    cn.links.addElement(cnl);
		    ce.setNode(j, nodeList.size());
		    if (cln != null)
			cln.node = nodeList.size();
		    else
			nodeMap.put(pt, new NodeMapEntry(nodeList.size()));
		    nodeList.addElement(cn);
		} else {
		    int n = cln.node;
		    CircuitNodeLink cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    getCircuitNode(n).links.addElement(cnl);
		    ce.setNode(j, n);
		    // if it's the ground node, make sure the node voltage is 0,
		    // cause it may not get set later
		    if (n == 0)
			ce.setNodeVoltage(j, 0);
		}
	    }
	    for (j = 0; j != inodes; j++) {
		CircuitNode cn = new CircuitNode();
		cn.internal = true;
		CircuitNodeLink cnl = new CircuitNodeLink();
		cnl.num = j+posts;
		cnl.elm = ce;
		cn.links.addElement(cnl);
		ce.setNode(cnl.num, nodeList.size());
		nodeList.addElement(cn);
	    }
	    
	    // also count voltage sources so we can allocate array
	    vscount += ivs;
	}
	
        voltageSources = new CircuitElm[vscount];
    }

    // recursively add child elements to elmList and make node links
    void addChildElms(Vector<CircuitElm> list) {
	for (CircuitElm ce: list) {
	    Vector<CircuitElm> childList = ce.getChildElmList();
	    if (childList != null) {
		// this child is itself a composite; add its children instead
		addChildElms(childList);
		continue;
	    }
	    elmList.add(ce);
	    int nodeCount = ce.getNodeCount();
	    for (int i = 0; i != nodeCount; i++) {
		int cn = ce.getNode(i);
		CircuitNodeLink cnl = new CircuitNodeLink();
		cnl.num = i;
		cnl.elm = ce;
		CircuitNode cnobj = getCircuitNode(cn);
		cnobj.links.addElement(cnl);
		// this is needed so findUnconnectedNodes() works
		cnobj.internal = false;
		// if it's the ground node, make sure the node voltage is 0
		if (cn == 0)
		    ce.setNodeVoltage(i, 0);
	    }
	}
    }

    Vector<Integer> unconnectedNodes;
    Vector<CircuitElm> nodesWithGroundConnection;
    int nodesWithGroundConnectionCount;
    
    void findUnconnectedNodes() {
	int i, j;
	
	// determine nodes that are not connected indirectly to ground.
	// all nodes must be connected to ground somehow, or else we
	// will get a matrix error.
	boolean closure[] = new boolean[nodeList.size()];
	boolean changed = true;
	unconnectedNodes = new Vector<Integer>();
	nodesWithGroundConnection = new Vector<CircuitElm>();
	closure[0] = true;
	while (changed) {
	    changed = false;
	    for (i = 0; i != elmList.size(); i++) {
		CircuitElm ce = getElm(i);
		if (ce instanceof WireElm)
		    continue;
		// loop through all ce's nodes to see if they are connected
		// to other nodes not in closure
		boolean hasGround = false;
		for (j = 0; j < ce.getPostCount(); j++) {
		    boolean hg = ce.hasGroundConnection(j);
		    if (hg)
			hasGround = true;
		    if (!closure[ce.getNode(j)]) {
			if (hg)
			    closure[ce.getNode(j)] = changed = true;
			continue;
		    }
		    int k;
		    for (k = 0; k != ce.getPostCount(); k++) {
			if (j == k)
			    continue;
			int kn = ce.getNode(k);
			if (ce.getConnection(j, k) && !closure[kn]) {
			    closure[kn] = true;
			    changed = true;
			}
		    }
		}
		if (hasGround)
		    nodesWithGroundConnection.add(ce);
	    }
	    if (changed)
		continue;

	    // connect one of the unconnected nodes to ground with a big resistor, then try again
	    for (i = 0; i != nodeList.size(); i++)
		if (!closure[i] && !getCircuitNode(i).internal) {
		    unconnectedNodes.add(i);
		    console("node " + i + " unconnected");
//		    stampResistor(0, i, 1e8);   // do this later in connectUnconnectedNodes()
		    closure[i] = true;
		    changed = true;
		    break;
		}
	}
    }
    
    // take list of unconnected nodes, which we identified earlier, and connect them to ground
    // with a big resistor.  otherwise we will get matrix errors.  The resistor has to be big,
    // otherwise circuits like 555 Square Wave will break
    void connectUnconnectedNodes() {
	int i;
	for (i = 0; i != unconnectedNodes.size(); i++) {
	    int n = unconnectedNodes.get(i);
	    stampResistor(0, n, 1e8);
	}
    }
    
    boolean validateCircuit() {
	int i;
	
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    // look for inductors with no current path
	    if (ce instanceof InductorElm) {
		FindPathInfo fpi = new FindPathInfo(FindPathInfo.INDUCT, ce,
						    ce.getNode(1));
		if (!fpi.findPath(ce.getNode(0))) {
//		    console(ce + " no path");
		    ce.reset();
		}
	    }
	    // look for current sources with no current path
	    if (ce instanceof CurrentElm) {
		CurrentElm cur = (CurrentElm) ce;
		FindPathInfo fpi = new FindPathInfo(FindPathInfo.INDUCT, ce,
						    ce.getNode(1));
		cur.setBroken(!fpi.findPath(ce.getNode(0)));
	    }
	    if (ce instanceof VCCSElm) {
		VCCSElm cur = (VCCSElm) ce;
		FindPathInfo fpi = new FindPathInfo(FindPathInfo.INDUCT, ce,
						    cur.getOutputNode(0));
		if (cur.hasCurrentOutput() && !fpi.findPath(cur.getOutputNode(1))) {
		    cur.broken = true;
		} else
		    cur.broken = false;
	    }
	    
	    // look for voltage source or wire loops.  we do this for voltage sources
	    if (ce.getPostCount() == 2) {
		if (ce instanceof VoltageElm) {
		    FindPathInfo fpi = new FindPathInfo(FindPathInfo.VOLTAGE, ce,
						    ce.getNode(1));
		    if (fpi.findPath(ce.getNode(0))) {
			stop("Voltage source/wire loop with no resistance!", ce);
			return false;
		    }
		}
	    }

	    // look for path from rail to ground
	    if (ce instanceof RailElm || ce instanceof LogicInputElm) {
		FindPathInfo fpi = new FindPathInfo(FindPathInfo.VOLTAGE, ce, ce.getNode(0));
		if (fpi.findPath(0)) {
		    stop("Path to ground with no resistance!", ce);
		    return false;
		}
	    }
	    
	    // look for shorted caps, or caps w/ voltage but no R
	    if (ce.isIdealCapacitor()) {
		FindPathInfo fpi = new FindPathInfo(FindPathInfo.SHORT, ce,
						    ce.getNode(1));
		if (fpi.findPath(ce.getNode(0))) {
		    console(ce + " shorted");
		    ((CapacitorElm) ce).shorted();
		} else {
		    fpi = new FindPathInfo(FindPathInfo.CAP_V, ce, ce.getNode(1));
		    if (fpi.findPath(ce.getNode(0))) {
			// loop of ideal capacitors; set a small series resistance to avoid
			// oscillation in case one of them has voltage on it
			((CapacitorElm) ce).setSeriesResistance(.1);

			// return false to re-stamp the circuit
			return false;
		    }
		}
	    }
	}
	return true;
    }
    
    // analyze the circuit when something changes, so it can be simulated.
    // Most of this has been moved to preStampCircuit() so it can be avoided if the simulation is stopped.
    void analyzeCircuit() {
	app.setStopElm(null, null);
	elmList = app.elmList;
	if (elmList.isEmpty()) {
	    app.postDrawList = new Vector<Point>();
	    app.badConnectionList = new Vector<Point>();
	    return;
	}
	makePostDrawList();

	needsStamp = true;
    }

    // do the rest of the pre-stamp circuit analysis
    boolean preStampCircuit(boolean subcircuit) {
	int i, j;
	nodeList = new Vector<CircuitNode>();
	elmList = app.elmList;

	calculateWireClosure();
	setGroundNode(subcircuit);

	// allocate nodes and voltage sources
	makeNodeList();

	// if UI is showing composite internals, run wire closure on UI list to assign
	// nodes to display-only wires and build wireInfoList for current display
	if (app.ui.elmList != app.elmList) {
	    calculateWireClosureForList(app.ui.elmList, true);
	    assignUiWireNodes();
	}

	if (!calcWireInfo())
	    return false;

	nodeMap = null; // done with this
	uiNodeMap = null;

	// add composite child elements to elmList and make node links
	elmList = new Vector<>(app.elmList);
	for (CircuitElm elm: elmList) {
	    Vector<CircuitElm> list = elm.getChildElmList();
	    if (list != null)
		addChildElms(list);
	}

	int vscount = 0;
	circuitNonLinear = false;

	// determine if circuit is nonlinear.  also set voltage sources
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (ce.nonLinear())
		circuitNonLinear = true;
	    int ivs = ce.getVoltageSourceCount();
	    for (j = 0; j != ivs; j++) {
		voltageSources[vscount] = ce;
		ce.setVoltageSource(j, vscount++);
	    }
	}
	voltageSourceCount = vscount;

	// show resistance in voltage sources if there's only one.
	// can't use voltageSourceCount here since that counts internal voltage sources, like the one in GroundElm
	boolean gotVoltageSource = false;
	app.showResistanceInVoltageSources = true;
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (ce instanceof VoltageElm) {
		if (gotVoltageSource)
		    app.showResistanceInVoltageSources = false;
		else
		    gotVoltageSource = true;
	    }
	}

	findUnconnectedNodes();
	if (!validateCircuit())
	    return false;
	
	nodesWithGroundConnectionCount = nodesWithGroundConnection.size();
	// only need this for validation
	nodesWithGroundConnection = null;
	
	timeStep = maxTimeStep;
	needsStamp = true;
	
	app.jsInterface.callAnalyzeHook();
	return true;
    }

    // do pre-stamping and then stamp circuit
    void preStampAndStampCircuit() {
	int i;

	// preStampCircuit returns false if there's an error.  It can return false if we have capacitor loops
	// but we just need to try again in that case.  Try again 10 times to avoid infinite loop.
	for (i = 0; i != 10; i++)
	    if (preStampCircuit(false) || app.stopMessage != null)
		break;
	if (app.stopMessage != null)
	    return;
	if (i == 10) {
	    stop("failed to stamp circuit", null);
	    return;
	}

	stampCircuit();
    }

    // stamp the matrix, meaning populate the matrix as required to simulate the circuit (for all linear elements, at least).
    // this gets called after something changes in the circuit, and also when auto-adjusting timestep
    void stampCircuit() {
	int i;
	int matrixSize = nodeList.size()-1 + voltageSourceCount;
	circuitMatrix = new double[matrixSize][matrixSize];
	circuitRightSide = new double[matrixSize];
	nodeVoltages = new double[nodeList.size()-1];
	if (lastNodeVoltages == null || lastNodeVoltages.length != nodeVoltages.length)
	    lastNodeVoltages = new double[nodeList.size()-1];
	origMatrix = new double[matrixSize][matrixSize];
	origRightSide = new double[matrixSize];
	circuitMatrixSize = circuitMatrixFullSize = matrixSize;
	circuitRowInfo = new RowInfo[matrixSize];
	circuitPermute = new int[matrixSize];
	for (i = 0; i != matrixSize; i++)
	    circuitRowInfo[i] = new RowInfo();
	circuitNeedsMap = false;
	
	connectUnconnectedNodes();

	// stamp linear circuit elements
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    ce.setParentList(elmList);
	    ce.stamp();
	}

	if (!simplifyMatrix(matrixSize))
	    return;
	
	// check if we called stop()
	if (circuitMatrix == null)
	    return;
	
	// if a matrix is linear, we can do the lu_factor here instead of
	// needing to do it every frame
	if (!circuitNonLinear) {
	    if (!lu_factor(circuitMatrix, circuitMatrixSize, circuitPermute)) {
		stop("Singular matrix!", null);
		return;
	    }
	}
	
	// copy elmList to an array to avoid a bunch of calls to canCast() when doing simulation
	elmArr = new CircuitElm[elmList.size()];
	int scopeElmCount = 0;
	for (i = 0; i != elmList.size(); i++) {
	    elmArr[i] = elmList.get(i);
	    if (elmArr[i] instanceof ScopeElm)
		scopeElmCount++;
	}
	
	// copy ScopeElms to an array to avoid a second pass over entire list of elms during simulation
	ScopeElm scopeElmArr[] = new ScopeElm[scopeElmCount];
	int j = 0;
	for (i = 0; i != elmList.size(); i++) {
	    if (elmArr[i] instanceof ScopeElm)
		scopeElmArr[j++] = (ScopeElm) elmArr[i];
	}	
	app.scopeElmArr = scopeElmArr;

	needsStamp = false;
    }

    // simplify the matrix; this speeds things up quite a bit, especially for digital circuits.
    // or at least it did before we added wire removal
    boolean simplifyMatrix(int matrixSize) {
	int i, j;
	for (i = 0; i != matrixSize; i++) {
	    int qp = -1;
	    double qv = 0;
	    RowInfo re = circuitRowInfo[i];
	    /*System.out.println("row " + i + " " + re.lsChanges + " " + re.rsChanges + " " +
			       re.dropRow);*/
	    
	    //if (qp != -100) continue;   // uncomment this line to disable matrix simplification for debugging purposes
	    
	    if (re.lsChanges || re.dropRow || re.rsChanges)
		continue;
	    double rsadd = 0;

	    // see if this row can be removed
	    for (j = 0; j != matrixSize; j++) {
		double q = circuitMatrix[i][j];
		if (circuitRowInfo[j].type == RowInfo.ROW_CONST) {
		    // keep a running total of const values that have been
		    // removed already
		    rsadd -= circuitRowInfo[j].value*q;
		    continue;
		}
		// ignore zeroes
		if (q == 0)
		    continue;
		// keep track of first nonzero element that is not ROW_CONST
		if (qp == -1) {
		    qp = j;
		    qv = q;
		    continue;
		}
		// more than one nonzero element?  give up
		break;
	    }
	    if (j == matrixSize) {
		if (qp == -1) {
		    // probably a singular matrix, try disabling matrix simplification above to check this
		    stop("Matrix error", null);
		    return false;
		}
		RowInfo elt = circuitRowInfo[qp];
		// we found a row with only one nonzero nonconst entry; that value
		// is a constant
		if (elt.type != RowInfo.ROW_NORMAL) {
		    System.out.println("type already " + elt.type + " for " + qp + "!");
		    continue;
		}
		elt.type = RowInfo.ROW_CONST;
//		console("ROW_CONST " + i + " " + rsadd);
		elt.value = (circuitRightSide[i]+rsadd)/qv;
		circuitRowInfo[i].dropRow = true;
		// find first row that referenced the element we just deleted
		for (j = 0; j != i; j++)
		    if (circuitMatrix[j][qp] != 0)
			break;
		// start over just before that
		i = j-1;
	    }
	}
	//System.out.println("ac7");

	// find size of new matrix
	int nn = 0;
	for (i = 0; i != matrixSize; i++) {
	    RowInfo elt = circuitRowInfo[i];
	    if (elt.type == RowInfo.ROW_NORMAL) {
		elt.mapCol = nn++;
		//System.out.println("col " + i + " maps to " + elt.mapCol);
		continue;
	    }
	    if (elt.type == RowInfo.ROW_CONST)
		elt.mapCol = -1;
	}

	// make the new, simplified matrix
	int newsize = nn;
	double newmatx[][] = new double[newsize][newsize];
	double newrs  []   = new double[newsize];
	int ii = 0;
	for (i = 0; i != matrixSize; i++) {
	    RowInfo rri = circuitRowInfo[i];
	    if (rri.dropRow) {
		rri.mapRow = -1;
		continue;
	    }
	    newrs[ii] = circuitRightSide[i];
	    rri.mapRow = ii;
	    //System.out.println("Row " + i + " maps to " + ii);
	    for (j = 0; j != matrixSize; j++) {
		RowInfo ri = circuitRowInfo[j];
		if (ri.type == RowInfo.ROW_CONST)
		    newrs[ii] -= ri.value*circuitMatrix[i][j];
		else
		    newmatx[ii][ri.mapCol] += circuitMatrix[i][j];
	    }
	    ii++;
	}

//	console("old size = " + matrixSize + " new size = " + newsize);
	
	circuitMatrix = newmatx;
	circuitRightSide = newrs;
	matrixSize = circuitMatrixSize = newsize;
	for (i = 0; i != matrixSize; i++)
	    origRightSide[i] = circuitRightSide[i];
	for (i = 0; i != matrixSize; i++)
	    for (j = 0; j != matrixSize; j++)
		origMatrix[i][j] = circuitMatrix[i][j];
	circuitNeedsMap = true;
	return true;
    }
    
    // make list of posts we need to draw.  posts shared by 2 elements should be hidden, all
    // others should be drawn.  We can't use the node list for this purpose anymore because wires
    // have the same node number at both ends.
    void makePostDrawList() {
        HashMap<Point,Integer> postCountMap = new HashMap<Point,Integer>();
	Vector<CircuitElm> drawList = app.ui.elmList;
	int i, j;
	for (i = 0; i != drawList.size(); i++) {
	    CircuitElm ce = drawList.get(i);
	    int posts = ce.getPostCount();
	    for (j = 0; j != posts; j++) {
		Point pt = ce.getPost(j);
		Integer g = postCountMap.get(pt);
		postCountMap.put(pt, g == null ? 1 : g+1);
	    }
	}

	Vector<Point> postDrawList = app.postDrawList = new Vector<Point>();
	Vector<Point> badConnectionList = app.badConnectionList = new Vector<Point>();
	for (Map.Entry<Point, Integer> entry : postCountMap.entrySet()) {
	    if (entry.getValue() != 2)
		postDrawList.add(entry.getKey());
	    
	    // look for bad connections, posts not connected to other elements which intersect
	    // other elements' bounding boxes
	    if (entry.getValue() == 1) {
		boolean bad = false;
		Point cn = entry.getKey();
		for (j = 0; j != drawList.size() && !bad; j++) {
		    CircuitElm ce = drawList.get(j);
		    if ( ce instanceof GraphicElm )
			continue;
		    // does this post intersect elm's bounding box?
		    if (!ce.boundingBox.contains(cn.x, cn.y))
			continue;
		    int k;
		    // does this post belong to the elm?
		    int pc = ce.getPostCount();
		    for (k = 0; k != pc; k++)
			if (ce.getPost(k).equals(cn))
			    break;
		    if (k == pc)
			bad = true;
		}
		if (bad)
		    badConnectionList.add(cn);
	    }
	}
    }

    class FindPathInfo {
	static final int INDUCT  = 1;
	static final int VOLTAGE = 2;
	static final int SHORT   = 3;
	static final int CAP_V   = 4;
	boolean visited[];
	int dest;
	CircuitElm firstElm;
	int type;

	// State object to help find loops in circuit subject to various conditions (depending on type_)
	// elm_ = source and destination element.  dest_ = destination node.
	FindPathInfo(int type_, CircuitElm elm_, int dest_) {
	    dest = dest_;
	    type = type_;
	    firstElm = elm_;
	    visited  = new boolean[nodeList.size()];
	}

	// look through circuit for loop starting at node n1 of firstElm, for a path back to
	// dest node of firstElm
	boolean findPath(int n1) {
	    if (n1 == dest)
		return true;

	    // depth first search, don't need to revisit already visited nodes!
	    if (visited[n1])
		return false;

	    visited[n1] = true;
	    CircuitNode cn = getCircuitNode(n1);
	    int i;
	    if (cn == null)
		return false;
	    for (i = 0; i != cn.links.size(); i++) {
		CircuitNodeLink cnl = cn.links.get(i);
		CircuitElm ce = cnl.elm;
		if (checkElm(n1, ce))
		    return true;
	    }
	    if (n1 == 0) {
		for (i = 0; i != nodesWithGroundConnection.size(); i++)
		    if (checkElm(0, nodesWithGroundConnection.get(i)))
			return true;
	    }
	    return false;
	}
	
	boolean checkElm(int n1, CircuitElm ce) {
		if (ce == firstElm)
		    return false;
		if (type == INDUCT) {
		    // inductors need a path free of current sources
		    if (ce instanceof CurrentElm)
			return false;
		}
		if (type == VOLTAGE) {
		    // when checking for voltage loops, we only care about voltage sources/wires/ground
		    if (!(ce.isWireEquivalent() || ce instanceof VoltageElm || ce instanceof GroundElm))
			return false;
		}
		// when checking for shorts, just check wires
		if (type == SHORT && !ce.isWireEquivalent())
		    return false;
		if (type == CAP_V) {
		    // checking for capacitor/voltage source loops
		    if (!(ce.isWireEquivalent() || ce.isIdealCapacitor() || ce instanceof VoltageElm))
			return false;
		}
		if (n1 == 0) {
		    // look for posts which have a ground connection;
		    // our path can go through ground
		    int j;
		    for (j = 0; j != ce.getPostCount(); j++)
			if (ce.hasGroundConnection(j) && findPath(ce.getNode(j)))
			    return true;
		}
		int j;
		for (j = 0; j != ce.getPostCount(); j++) {
		    if (ce.getNode(j) == n1) {
			if (ce.hasGroundConnection(j) && findPath(0))
			    return true;
			if (type == INDUCT && ce instanceof InductorElm) {
			    // inductors can use paths with other inductors of matching current
			    double c = ce.getCurrent();
			    if (j == 0)
				c = -c;
			    if (Math.abs(c-firstElm.getCurrent()) > 1e-10)
				continue;
			}
			int k;
			for (k = 0; k != ce.getPostCount(); k++) {
			    if (j == k)
				continue;
			    if (ce.getConnection(j, k) && findPath(ce.getNode(k))) {
				//System.out.println("got findpath " + n1);
				return true;
			    }
			}
		    }
		}
	    return false;
	}
    }

    void stop(String s, CircuitElm ce) {
	app.setStopElm(ce, Locale.LS(s));
	circuitMatrix = null;  // causes an exception
	app.setSimRunning(false);
	app.analyzeFlag = false;
//	cv.repaint();
    }
    
    // control voltage source vs with voltage from n1 to n2 (must
    // also call stampVoltageSource())
    void stampVCVS(int n1, int n2, double coef, int vs) {
	int vn = nodeList.size()+vs;
	stampMatrix(vn, n1, coef);
	stampMatrix(vn, n2, -coef);
    }
    
    // stamp independent voltage source #vs, from n1 to n2, amount v
    void stampVoltageSource(int n1, int n2, int vs, double v) {
	int vn = nodeList.size()+vs;
	stampMatrix(vn, n1, -1);
	stampMatrix(vn, n2, 1);
	stampRightSide(vn, v);
	stampMatrix(n1, vn, 1);
	stampMatrix(n2, vn, -1);
    }

    // use this if the amount of voltage is going to be updated in doStep(), by updateVoltageSource()
    void stampVoltageSource(int n1, int n2, int vs) {
	int vn = nodeList.size()+vs;
	stampMatrix(vn, n1, -1);
	stampMatrix(vn, n2, 1);
	stampRightSide(vn);
	stampMatrix(n1, vn, 1);
	stampMatrix(n2, vn, -1);
    }
    
    // update voltage source in doStep()
    void updateVoltageSource(int n1, int n2, int vs, double v) {
	int vn = nodeList.size()+vs;
	stampRightSide(vn, v);
    }
    
    void stampResistor(int n1, int n2, double r) {
	double r0 = 1/r;
	if (Double.isNaN(r0) || Double.isInfinite(r0)) {
	    System.out.print("bad resistance " + r + " " + r0 + "\n");
	    int a = 0;
	    a /= a;
	}
	stampMatrix(n1, n1, r0);
	stampMatrix(n2, n2, r0);
	stampMatrix(n1, n2, -r0);
	stampMatrix(n2, n1, -r0);
    }

    void stampConductance(int n1, int n2, double r0) {
	stampMatrix(n1, n1, r0);
	stampMatrix(n2, n2, r0);
	stampMatrix(n1, n2, -r0);
	stampMatrix(n2, n1, -r0);
    }

    // specify that current from cn1 to cn2 is equal to voltage from vn1 to 2, divided by g
    void stampVCCurrentSource(int cn1, int cn2, int vn1, int vn2, double g) {
	stampMatrix(cn1, vn1, g);
	stampMatrix(cn2, vn2, g);
	stampMatrix(cn1, vn2, -g);
	stampMatrix(cn2, vn1, -g);
    }

    void stampCurrentSource(int n1, int n2, double i) {
	stampRightSide(n1, -i);
	stampRightSide(n2, i);
    }

    // stamp a current source from n1 to n2 depending on current through vs
    void stampCCCS(int n1, int n2, int vs, double gain) {
	int vn = nodeList.size()+vs;
	stampMatrix(n1, vn, gain);
	stampMatrix(n2, vn, -gain);
    }

    // stamp value x in row i, column j, meaning that a voltage change
    // of dv in node j will increase the current into node i by x dv.
    // (Unless i or j is a voltage source node.)
    void stampMatrix(int i, int j, double x) {
	if (Double.isInfinite(x))
	    debugger();
	if (i > 0 && j > 0) {
	    if (circuitNeedsMap) {
		i = circuitRowInfo[i-1].mapRow;
		RowInfo ri = circuitRowInfo[j-1];
		if (ri.type == RowInfo.ROW_CONST) {
		    //System.out.println("Stamping constant " + i + " " + j + " " + x);
		    circuitRightSide[i] -= x*ri.value;
		    return;
		}
		j = ri.mapCol;
		//System.out.println("stamping " + i + " " + j + " " + x);
	    } else {
		i--;
		j--;
	    }
	    circuitMatrix[i][j] += x;
	}
    }

    // stamp value x on the right side of row i, representing an
    // independent current source flowing into node i
    void stampRightSide(int i, double x) {
	if (i > 0) {
	    if (circuitNeedsMap) {
		i = circuitRowInfo[i-1].mapRow;
		//System.out.println("stamping " + i + " " + x);
	    } else
		i--;
	    circuitRightSide[i] += x;
	}
    }

    // indicate that the value on the right side of row i changes in doStep()
    void stampRightSide(int i) {
	//System.out.println("rschanges true " + (i-1));
	if (i > 0)
	    circuitRowInfo[i-1].rsChanges = true;
    }
    
    // indicate that the values on the left side of row i change in doStep()
    void stampNonLinear(int i) {
	if (i > 0)
	    circuitRowInfo[i-1].lsChanges = true;
    }

    boolean converged;
    int subIterations;
    
    void runCircuit(boolean didAnalyze) {
	if (circuitMatrix == null || elmList.size() == 0) {
	    circuitMatrix = null;
	    return;
	}
	int iter;
	//int maxIter = getIterCount();
	boolean debugprint = app.dumpMatrix;
	app.dumpMatrix = false;
	long steprate = (long) (160*app.getIterCount());
	long tm = System.currentTimeMillis();
	long lit = lastIterTime;
	if (lit == 0) {
	    lastIterTime = tm;
	    return;
	}
	
	// Check if we don't need to run simulation (for very slow simulation speeds).
	// If the circuit changed, do at least one iteration to make sure everything is consistent.
	if (1000 >= steprate*(tm-lastIterTime) && !didAnalyze)
	    return;
	
	boolean delayWireProcessing = app.scopeManager.canDelayWireProcessing();
	
	int timeStepCountAtFrameStart = timeStepCount;
	
	// keep track of iterations completed without convergence issues
	int goodIterations = 100;
	
	int frameTimeLimit = (int) (1000/app.minFrameRate);
	
	for (iter = 1; ; iter++) {
	    if (goodIterations >= 3 && timeStep < maxTimeStep) {
		// things are going well, double the time step
		timeStep = Math.min(timeStep*2, maxTimeStep);
		console("timestep up = " + timeStep + " at " + t);
		stampCircuit();
		goodIterations = 0;
	    }
	    
	    int i, j, subiter;
	    for (i = 0; i != elmArr.length; i++)
		elmArr[i].startIteration();
	    app.ui.steps++;
	    int subiterCount = (adjustTimeStep && timeStep/2 > minTimeStep) ? 100 : 5000;
	    for (subiter = 0; subiter != subiterCount; subiter++) {
		converged = true;
		subIterations = subiter;
//		if (t % .030 < .002 && timeStep > 1e-6)  // force nonconvergence for debugging
//		    converged = false;
		for (i = 0; i != circuitMatrixSize; i++)
		    circuitRightSide[i] = origRightSide[i];
		if (circuitNonLinear) {
		    for (i = 0; i != circuitMatrixSize; i++)
			for (j = 0; j != circuitMatrixSize; j++)
			    circuitMatrix[i][j] = origMatrix[i][j];
		}
		for (i = 0; i != elmArr.length; i++)
		    elmArr[i].doStep();
		if (app.stopMessage != null)
		    return;
		boolean printit = debugprint;
		debugprint = false;
		if (circuitMatrixSize < 8) {
		    // we only need this for debugging purposes, so skip it for large matrices 
		    for (j = 0; j != circuitMatrixSize; j++) {
			for (i = 0; i != circuitMatrixSize; i++) {
			    double x = circuitMatrix[i][j];
			    if (Double.isNaN(x) || Double.isInfinite(x)) {
				stop("nan/infinite matrix!", null);
				console("circuitMatrix " + i + " " + j + " is " + x);
				return;
			    }
			}
		    }
		}
		if (printit) {
		    for (j = 0; j != circuitMatrixSize; j++) {
			String x = "";
			for (i = 0; i != circuitMatrixSize; i++)
			    x += circuitMatrix[j][i] + ",";
			x += "\n";
			console(x);
		    }
		    console("done");
		}
		if (circuitNonLinear) {
		    // stop if converged (elements check for convergence in doStep())
		    if (converged && subiter > 0)
			break;
		    if (!lu_factor(circuitMatrix, circuitMatrixSize,
				  circuitPermute)) {
			stop("Singular matrix!", null);
			return;
		    }
		}
		lu_solve(circuitMatrix, circuitMatrixSize, circuitPermute,
			 circuitRightSide);
		applySolvedRightSide(circuitRightSide);
		if (!circuitNonLinear)
		    break;
	    }
	    if (subiter == subiterCount) {
		// convergence failed
		goodIterations = 0;
		if (adjustTimeStep) {
		    timeStep /= 2;
		    console("timestep down to " + timeStep + " at " + t);
		}
		if (timeStep < minTimeStep || !adjustTimeStep) {
		    console("convergence failed after " + subiter + " iterations");
		    stop("Convergence failed!", null);
		    break;
		}
		// we reduced the timestep.  reset circuit state to the way it was at start of iteration
		setNodeVoltages(lastNodeVoltages);
		stampCircuit();
		continue;
	    }
	    if (subiter > 5 || timeStep < maxTimeStep)
		console("converged after " + subiter + " iterations, timeStep = " + timeStep);
	    if (subiter < 3)
		goodIterations++;
	    else
		goodIterations = 0;
	    t += timeStep;
	    timeStepAccum += timeStep;
	    if (timeStepAccum >= maxTimeStep) {
		timeStepAccum -= maxTimeStep;
		timeStepCount++;
	    }
	    for (i = 0; i != elmArr.length; i++)
		elmArr[i].stepFinished();
	    if (!delayWireProcessing)
		calcWireCurrents();
	    app.onTimeStep();
	    // save last node voltages so we can restart the next iteration if necessary
	    for (i = 0; i != lastNodeVoltages.length; i++)
		lastNodeVoltages[i] = nodeVoltages[i];
//	    console("set lastrightside at " + t + " " + lastNodeVoltages);
		
	    tm = System.currentTimeMillis();
	    lit = tm;
	    // Check whether enough time has elapsed to perform an *additional* iteration after
	    // those we have already completed.  But limit total computation time to 50ms (20fps) by default
	    if ((timeStepCount-timeStepCountAtFrameStart)*1000 >= steprate*(tm-lastIterTime) || (tm-app.ui.lastFrameTime > frameTimeLimit))
		break;
	    if (!app.simRunning)
		break;
	} // for (iter = 1; ; iter++)
	lastIterTime = lit;
	if (delayWireProcessing)
	    calcWireCurrents();
//	System.out.println((System.currentTimeMillis()-lastFrameTime)/(double) iter);
    }

    // set node voltages given right side found by solving matrix
    void applySolvedRightSide(double rs[]) {
//	console("setvoltages " + rs);
	int j;
	for (j = 0; j != circuitMatrixFullSize; j++) {
	    RowInfo ri = circuitRowInfo[j];
	    double res = 0;
	    if (ri.type == RowInfo.ROW_CONST)
		res = ri.value;
	    else
		res = rs[ri.mapCol];
	    if (Double.isNaN(res)) {
		converged = false;
		break;
	    }
	    if (j < nodeList.size()-1) {
		nodeVoltages[j] = res;
	    } else {
		int ji = j-(nodeList.size()-1);
		voltageSources[ji].setCurrent(ji, res);
	    }
	}
	
	setNodeVoltages(nodeVoltages);
    }
    
    // set node voltages in each element given an array of node voltages
    void setNodeVoltages(double nv[]) {
	int j, k;
	for (j = 0; j != nv.length; j++) {
	    double res = nv[j];
	    CircuitNode cn = getCircuitNode(j+1);
	    for (k = 0; k != cn.links.size(); k++) {
		CircuitNodeLink cnl = cn.links.elementAt(k);
		cnl.elm.setNodeVoltage(cnl.num, res);
	    }
	}
    }
    
    // we removed wires from the matrix to speed things up.  in order to display wire currents,
    // we need to calculate them now.
    void calcWireCurrents() {
	int i;
	
	// for debugging
	//for (i = 0; i != wireInfoList.size(); i++)
	 //   wireInfoList.get(i).wire.setCurrent(-1, 1.23);
	
	for (i = 0; i != wireInfoList.size(); i++) {
	    WireInfo wi = wireInfoList.get(i);
	    double cur = 0;
	    int j;
	    Point p = wi.wire.getPost(wi.post);
	    for (j = 0; j != wi.neighbors.size(); j++) {
		CircuitElm ce = wi.neighbors.get(j);
		int n = ce.getNodeAtPoint(p.x, p.y);
		cur += ce.getCurrentIntoNode(n);
	    }
	    // get correct current polarity
	    // (LabeledNodes may have wi.post == 1, in which case we flip the current sign)
	    if (wi.post == 0 || (wi.wire instanceof LabeledNodeElm))
		wi.wire.setCurrent(-1, cur);
	    else
		wi.wire.setCurrent(-1, -cur);
	}
    }
    

    public CustomCompositeModel getCircuitAsComposite() {
	int i;
	Document elmDoc = XMLParser.createDocument();
	Element elmRoot = elmDoc.createElement("elms");
	elmDoc.appendChild(elmRoot);
	CustomLogicModel.clearDumpedFlags();
	DiodeModel.clearDumpedFlags();
	TransistorModel.clearDumpedFlags();
        Vector<LabeledNodeElm> sideLabels[] = new Vector[] {
            new Vector<LabeledNodeElm>(), new Vector<LabeledNodeElm>(),
            new Vector<LabeledNodeElm>(), new Vector<LabeledNodeElm>()
        };
	Vector<ExtListEntry> extList = new Vector<ExtListEntry>();
	boolean sel = app.isSelection();
	    
	boolean used[] = new boolean[nodeList.size()];
	boolean extnodes[] = new boolean[nodeList.size()];
	    
	// redo node allocation to avoid auto-assigning ground
	if (!preStampCircuit(true))
	    return null;

	// find all the labeled nodes, get a list of them, and create a node number map
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (sel && !ce.isSelected())
		continue;
	    if (ce instanceof LabeledNodeElm) {
		LabeledNodeElm lne = (LabeledNodeElm) ce;
		String label = lne.text;
		if (lne.isInternal())
		    continue;
		
		// already added to list?
		if (extnodes[ce.getNode(0)])
		    continue;
		
	    int side = ChipElm.SIDE_W;
	    if (Math.abs(ce.dx) >= Math.abs(ce.dy) && ce.dx > 0) side = ChipElm.SIDE_E;
	    if (Math.abs(ce.dx) <= Math.abs(ce.dy) && ce.dy < 0) side = ChipElm.SIDE_N;
	    if (Math.abs(ce.dx) <= Math.abs(ce.dy) && ce.dy > 0) side = ChipElm.SIDE_S;
	    
		// create ext list entry for external nodes
	    sideLabels[side].add(lne);
		extnodes[ce.getNode(0)] = true;
		if (ce.getNode(0) == 0) {
		    Window.alert("Node \"" + lne.text + "\" can't be connected to ground");
		    return null;
		}
	    }
	}
	    
        Collections.sort(sideLabels[ChipElm.SIDE_W], (LabeledNodeElm a, LabeledNodeElm b) -> Integer.signum(a.y - b.y));
        Collections.sort(sideLabels[ChipElm.SIDE_E], (LabeledNodeElm a, LabeledNodeElm b) -> Integer.signum(a.y - b.y));
        Collections.sort(sideLabels[ChipElm.SIDE_N], (LabeledNodeElm a, LabeledNodeElm b) -> Integer.signum(a.x - b.x));
        Collections.sort(sideLabels[ChipElm.SIDE_S], (LabeledNodeElm a, LabeledNodeElm b) -> Integer.signum(a.x - b.x));

        for (int side = 0; side < sideLabels.length; side++) {
            for (int pos = 0; pos < sideLabels[side].size(); pos++) {
                LabeledNodeElm lne = sideLabels[side].get(pos);
                ExtListEntry ent = new ExtListEntry(lne.text, lne.getNode(0), pos, side);
                extList.add(ent);
            }
        }

	boolean dumpAll = true;

	// build list of elements to dump, separating out non-essential elements.
	// use app.elmList (not elmList) to avoid including flattened composite children.
	Vector<CircuitElm> dumpList = new Vector<CircuitElm>();
	Vector<CircuitElm> extraList = new Vector<CircuitElm>();
	for (i = 0; i != app.elmList.size(); i++) {
	    CircuitElm ce = app.elmList.get(i);
	    if (sel && !ce.isSelected())
		continue;
	    if (ce instanceof WireElm || ce instanceof LabeledNodeElm || ce instanceof ScopeElm ||
		    ce instanceof GraphicElm || ce instanceof GroundElm) {
		if (dumpAll)
		    extraList.add(ce);
	    } else
		dumpList.add(ce);
	}
	dumpList.addAll(extraList);

	// output all the elements as XML
	for (i = 0; i != dumpList.size(); i++) {
	    CircuitElm ce = dumpList.get(i);
	    int j;
	    // build nn (node list) string
	    String nn = "";
	    for (j = 0; j != ce.getPostCount(); j++) {
		int n = ce.getNode(j);
		used[n] = true;
		if (nn.length() > 0)
		    nn += " ";
		nn += n;
	    }
	    Element child = elmDoc.createElement(ce.getXmlDumpType());
	    XMLSerializer.dumpAttr(child, "nn", nn);
	    ce.dumpXml(elmDoc, child);
	    // remove child elements (state) since this is a model definition, not an instance
	    while (child.getFirstChild() != null)
		child.removeChild(child.getFirstChild());
	    if (!dumpAll)
		child.removeAttribute("x");
	    elmRoot.appendChild(child);
	}

	for (i = 0; i != extList.size(); i++) {
	    ExtListEntry ent = extList.get(i);
	    if (!used[ent.node]) {
		Window.alert("Node \"" + ent.name + "\" is not used!");
		return null;
	    }
	}

	CustomCompositeModel ccm = new CustomCompositeModel();
	ccm.elmDoc = elmDoc;
	ccm.extList = extList;

	console("created model " + XMLSerializer.prettyPrint(elmDoc));
	return ccm;
    }
	
	static void invertMatrix(double a[][], int n) {
	    int ipvt[] = new int[n];
	    lu_factor(a, n, ipvt);
	    int i, j;
	    double b[] = new double[n];
	    double inva[][] = new double[n][n];
	    
	    // solve for each column of identity matrix
	    for (i = 0; i != n; i++) {
		for (j = 0; j != n; j++)
		    b[j] = 0;
		b[i] = 1;
		lu_solve(a, n, ipvt, b);
		for (j = 0; j != n; j++)
		    inva[j][i] = b[j];
	    }
	    
	    // return in original matrix
	    for (i = 0; i != n; i++)
		for (j = 0; j != n; j++)
		    a[i][j] = inva[i][j];
	}
    // factors a matrix into upper and lower triangular matrices by
    // gaussian elimination.  On entry, a[0..n-1][0..n-1] is the
    // matrix to be factored.  ipvt[] returns an integer vector of pivot
    // indices, used in the lu_solve() routine.
    static boolean lu_factor(double a[][], int n, int ipvt[]) {
	int i,j,k;
	
	// check for a possible singular matrix by scanning for rows that
	// are all zeroes
	for (i = 0; i != n; i++) { 
	    boolean row_all_zeros = true;
	    for (j = 0; j != n; j++) {
		if (a[i][j] != 0) {
		    row_all_zeros = false;
		    break;
		}
	    }
	    // if all zeros, it's a singular matrix
	    if (row_all_zeros)
		return false;
	}
	
        // use Crout's method; loop through the columns
	for (j = 0; j != n; j++) {
	    
	    // calculate upper triangular elements for this column
	    for (i = 0; i != j; i++) {
		double q = a[i][j];
		for (k = 0; k != i; k++)
		    q -= a[i][k]*a[k][j];
		a[i][j] = q;
	    }

	    // calculate lower triangular elements for this column
	    double largest = 0;
	    int largestRow = -1;
	    for (i = j; i != n; i++) {
		double q = a[i][j];
		for (k = 0; k != j; k++)
		    q -= a[i][k]*a[k][j];
		a[i][j] = q;
		double x = Math.abs(q);
		if (x >= largest) {
		    largest = x;
		    largestRow = i;
		}
	    }
	    
	    // pivoting
	    if (j != largestRow) {
		if (largestRow == -1) {
		    console("largestRow == -1");
		    return false;
		}
		double x;
		for (k = 0; k != n; k++) {
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
	    if (a[j][j] == 0.0) {
		console("didn't avoid zero");
//		a[j][j]=1e-18;
		return false;
	    }

	    if (j != n-1) {
		double mult = 1.0/a[j][j];
		for (i = j+1; i != n; i++)
		    a[i][j] *= mult;
	    }
	}
	return true;
    }

    // Solves the set of n linear equations using a LU factorization
    // previously performed by lu_factor.  On input, b[0..n-1] is the right
    // hand side of the equations, and on output, contains the solution.
    static void lu_solve(double a[][], int n, int ipvt[], double b[]) {
	int i;

	// find first nonzero b element
	for (i = 0; i != n; i++) {
	    int row = ipvt[i];

	    double swap = b[row];
	    b[row] = b[i];
	    b[i] = swap;
	    if (swap != 0)
		break;
	}
	
	int bi = i++;
	for (; i < n; i++) {
	    int row = ipvt[i];
	    int j;
	    double tot = b[row];
	    
	    b[row] = b[i];
	    // forward substitution using the lower triangular matrix
	    for (j = bi; j < i; j++)
		tot -= a[i][j]*b[j];
	    b[i] = tot;
	}
	for (i = n-1; i >= 0; i--) {
	    double tot = b[i];
	    
	    // back-substitution using the upper triangular matrix
	    int j;
	    for (j = i+1; j != n; j++)
		tot -= a[i][j]*b[j];
	    b[i] = tot/a[i][i];
	}
    }
    
    double getLabeledNodeVoltage(String name) {
	Integer node = LabeledNodeElm.getByName(name);
	if (node == null || node == 0)
	    return 0;
	// subtract one because ground is not included in nodeVoltages[]
	return nodeVoltages[node.intValue()-1];
    }	

}
