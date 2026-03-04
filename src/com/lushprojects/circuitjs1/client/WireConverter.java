package com.lushprojects.circuitjs1.client;

import java.util.*;

// Converts chains of WireElm into RoutedWireElm segments.
// Two wires touching at a point are combined, but if 3+ wires
// meet at a point (a junction), they must remain separate.

class WireConverter {

    static void convertWires(CirSim sim) {
	Vector<CircuitElm> elmList = sim.elmList;

	// collect all WireElms (but not RoutedWireElms)
	ArrayList<WireElm> wires = new ArrayList<WireElm>();
	for (CircuitElm ce : elmList) {
	    if (ce instanceof RoutedWireElm)
		continue;
	    if (ce instanceof WireElm)
		wires.add((WireElm) ce);
	}

	if (wires.isEmpty())
	    return;

	// count how many wire endpoints touch each point
	HashMap<Long, Integer> pointCount = new HashMap<Long, Integer>();
	for (WireElm w : wires) {
	    inc(pointCount, key(w.x, w.y));
	    inc(pointCount, key(w.x2, w.y2));
	}

	// non-wire element connections force chain endpoints.
	// add 2 so the point can never be exactly 2 (chain interior).
	for (CircuitElm ce : elmList) {
	    if (ce instanceof WireElm)
		continue;
	    for (int i = 0; i < ce.getPostCount(); i++) {
		Point p = ce.getPost(i);
		long k = key(p.x, p.y);
		if (pointCount.containsKey(k)) {
		    inc(pointCount, k);
		    inc(pointCount, k);
		}
	    }
	}

	// build adjacency: for each wire, map its endpoints to the wire
	// a point is a "chain interior" if exactly 2 wires meet there
	HashMap<Long, ArrayList<WireElm>> pointToWires = new HashMap<Long, ArrayList<WireElm>>();
	for (WireElm w : wires) {
	    addToList(pointToWires, key(w.x, w.y), w);
	    addToList(pointToWires, key(w.x2, w.y2), w);
	}

	// find chains by traversing from chain endpoints
	// a chain endpoint is a point where count != 2
	HashSet<WireElm> visited = new HashSet<WireElm>();
	ArrayList<ArrayList<WireElm>> chains = new ArrayList<ArrayList<WireElm>>();

	for (WireElm w : wires) {
	    if (visited.contains(w))
		continue;

	    // try to start a chain from this wire
	    ArrayList<WireElm> chain = new ArrayList<WireElm>();
	    buildChain(w, chain, visited, pointCount, pointToWires);
	    if (chain.size() >= 2)
		chains.add(chain);
	}

	// convert each chain to a RoutedWireElm
	for (ArrayList<WireElm> chain : chains) {
	    // order the chain and find the two endpoints
	    ArrayList<Point> orderedPoints = orderChain(chain, pointCount);
	    if (orderedPoints == null || orderedPoints.size() < 3)
		continue;

	    Point first = orderedPoints.get(0);
	    Point last = orderedPoints.get(orderedPoints.size() - 1);

	    // create RoutedWireElm with the chain endpoints
	    RoutedWireElm rw = new RoutedWireElm(first.x, first.y);
	    rw.x2 = last.x;
	    rw.y2 = last.y;
	    rw.routePoints = orderedPoints;
	    rw.setPoints();
	    // keep the routed points we built, not the auto-routed ones
	    rw.routePoints = orderedPoints;

	    // remove old wires, add new routed wire
	    for (WireElm w : chain)
		elmList.remove(w);
	    elmList.add(rw);
	}
    }

    // walk along connected wires where interior points have degree 2
    private static void buildChain(WireElm start, ArrayList<WireElm> chain,
				   HashSet<WireElm> visited,
				   HashMap<Long, Integer> pointCount,
				   HashMap<Long, ArrayList<WireElm>> pointToWires) {
	Deque<WireElm> stack = new ArrayDeque<WireElm>();
	stack.push(start);

	while (!stack.isEmpty()) {
	    WireElm w = stack.pop();
	    if (visited.contains(w))
		continue;
	    visited.add(w);
	    chain.add(w);

	    // try to extend from both endpoints
	    long k1 = key(w.x, w.y);
	    long k2 = key(w.x2, w.y2);

	    // only extend through points with exactly degree 2 (chain interior)
	    if (pointCount.get(k1) == 2) {
		for (WireElm neighbor : pointToWires.get(k1)) {
		    if (!visited.contains(neighbor))
			stack.push(neighbor);
		}
	    }
	    if (pointCount.get(k2) == 2) {
		for (WireElm neighbor : pointToWires.get(k2)) {
		    if (!visited.contains(neighbor))
			stack.push(neighbor);
		}
	    }
	}
    }

    // order chain wires into a sequence of points from one endpoint to the other
    private static ArrayList<Point> orderChain(ArrayList<WireElm> chain,
					       HashMap<Long, Integer> pointCount) {
	// build local adjacency for ordering
	HashMap<Long, ArrayList<WireElm>> local = new HashMap<Long, ArrayList<WireElm>>();
	for (WireElm w : chain) {
	    addToList(local, key(w.x, w.y), w);
	    addToList(local, key(w.x2, w.y2), w);
	}

	// find a chain endpoint (degree != 2) to start from
	WireElm startWire = null;
	long startKey = 0;
	for (WireElm w : chain) {
	    long k1 = key(w.x, w.y);
	    long k2 = key(w.x2, w.y2);
	    if (pointCount.get(k1) != 2) {
		startWire = w;
		startKey = k1;
		break;
	    }
	    if (pointCount.get(k2) != 2) {
		startWire = w;
		startKey = k2;
		break;
	    }
	}
	if (startWire == null)
	    return null; // closed loop, skip

	// walk the chain in order
	ArrayList<Point> points = new ArrayList<Point>();
	points.add(new Point(keyX(startKey), keyY(startKey)));

	HashSet<WireElm> used = new HashSet<WireElm>();
	WireElm current = startWire;
	long currentPt = startKey;

	while (current != null) {
	    used.add(current);
	    // find the other endpoint of this wire
	    long k1 = key(current.x, current.y);
	    long k2 = key(current.x2, current.y2);
	    long otherEnd = (k1 == currentPt) ? k2 : k1;
	    points.add(new Point(keyX(otherEnd), keyY(otherEnd)));

	    // find next wire at otherEnd (if it's a chain interior point)
	    current = null;
	    if (pointCount.get(otherEnd) == 2) {
		ArrayList<WireElm> neighbors = local.get(otherEnd);
		if (neighbors != null) {
		    for (WireElm w : neighbors) {
			if (!used.contains(w)) {
			    current = w;
			    currentPt = otherEnd;
			    break;
			}
		    }
		}
	    }
	}

	return points;
    }

    private static long key(int x, int y) {
	return ((long) x << 32) | (y & 0xFFFFFFFFL);
    }

    private static int keyX(long k) {
	return (int) (k >> 32);
    }

    private static int keyY(long k) {
	return (int) k;
    }

    private static void inc(HashMap<Long, Integer> map, long k) {
	Integer v = map.get(k);
	map.put(k, v == null ? 1 : v + 1);
    }

    private static void addToList(HashMap<Long, ArrayList<WireElm>> map, long k, WireElm w) {
	ArrayList<WireElm> list = map.get(k);
	if (list == null) {
	    list = new ArrayList<WireElm>();
	    map.put(k, list);
	}
	list.add(w);
    }
}
