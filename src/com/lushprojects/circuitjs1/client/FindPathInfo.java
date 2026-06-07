package com.lushprojects.circuitjs1.client;

class FindPathInfo {
    static final int INDUCT  = 1;
    static final int VOLTAGE = 2;
    static final int SHORT   = 3;
    static final int CAP_V   = 4;
    boolean visited[];
    CircuitNode dest;
    CircuitElm firstElm;
    int type;
    SimulationManager sim;

    // State object to help find loops in circuit subject to various conditions (depending on type_)
    // elm_ = source and destination element.  dest_ = destination node.
    FindPathInfo(int type_, CircuitElm elm_, CircuitNode dest_, SimulationManager sim_) {
	dest = dest_;
	type = type_;
	firstElm = elm_;
	sim = sim_;
	visited  = new boolean[sim.nodeList.size()];
    }

    // look through circuit for loop starting at node n1 of firstElm, for a path back to
    // dest node of firstElm
    boolean findPath(CircuitNode n1) {
	if (n1 == dest)
	    return true;

	// depth first search, don't need to revisit already visited nodes!
	if (visited[n1.index])
	    return false;

	visited[n1.index] = true;
	int i;
	for (i = 0; i != n1.links.size(); i++) {
	    CircuitNodeLink cnl = n1.links.get(i);
	    CircuitElm ce = cnl.elm;
	    if (checkElm(n1, ce))
		return true;
	}
	if (n1 == CircuitNode.ground) {
	    for (i = 0; i != sim.nodesWithGroundConnection.size(); i++)
		if (checkElm(CircuitNode.ground, sim.nodesWithGroundConnection.get(i)))
		    return true;
	}
	return false;
    }

    boolean checkElm(CircuitNode n1, CircuitElm ce) {
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
	if (n1 == CircuitNode.ground) {
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
		if (ce.hasGroundConnection(j) && findPath(CircuitNode.ground))
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
