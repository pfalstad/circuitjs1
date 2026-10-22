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

#include "WireConverter.h"

#include <algorithm>
#include <map>
#include <set>
#include <utility>
#include <vector>

#include "CircuitElm.h"
#include "SimApp.h"
#include "../elements/RoutedWireElm.h"
#include "../elements/WireElm.h"

namespace {

typedef std::pair<int, int> Key;

Key key(int x, int y) { return Key(x, y); }

int count(const std::map<Key, int> &pointCount, const Key &k) {
    auto it = pointCount.find(k);
    return it == pointCount.end() ? 0 : it->second;
}

// walk along connected wires where interior points have degree 2
void buildChain(CircuitElm *start, std::vector<CircuitElm *> &chain, std::set<CircuitElm *> &visited,
                const std::map<Key, int> &pointCount, std::map<Key, std::vector<CircuitElm *>> &pointToWires) {
    std::vector<CircuitElm *> stack;
    stack.push_back(start);

    while (!stack.empty()) {
        CircuitElm *w = stack.back();
        stack.pop_back();
        if (visited.count(w))
            continue;
        visited.insert(w);
        chain.push_back(w);

        // only extend through points with exactly degree 2 (chain interior)
        for (const Key &k : {key(w->x, w->y), key(w->x2, w->y2)}) {
            if (count(pointCount, k) != 2)
                continue;
            for (CircuitElm *neighbor : pointToWires[k])
                if (!visited.count(neighbor))
                    stack.push_back(neighbor);
        }
    }
}

// order chain wires into a sequence of points from one endpoint to the other;
// returns an empty list for a closed loop
std::vector<Point> orderChain(const std::vector<CircuitElm *> &chain, const std::map<Key, int> &pointCount) {
    // build local adjacency for ordering
    std::map<Key, std::vector<CircuitElm *>> local;
    for (CircuitElm *w : chain) {
        local[key(w->x, w->y)].push_back(w);
        local[key(w->x2, w->y2)].push_back(w);
    }

    // find a chain endpoint (degree != 2) to start from
    CircuitElm *startWire = nullptr;
    Key startKey;
    for (CircuitElm *w : chain) {
        Key k1 = key(w->x, w->y);
        Key k2 = key(w->x2, w->y2);
        if (count(pointCount, k1) != 2) {
            startWire = w;
            startKey = k1;
            break;
        }
        if (count(pointCount, k2) != 2) {
            startWire = w;
            startKey = k2;
            break;
        }
    }
    std::vector<Point> points;
    if (!startWire)
        return points;  // closed loop, skip

    // walk the chain in order
    points.push_back(Point(startKey.first, startKey.second));

    std::set<CircuitElm *> used;
    CircuitElm *current = startWire;
    Key currentPt = startKey;

    while (current) {
        used.insert(current);
        // find the other endpoint of this wire
        Key k1 = key(current->x, current->y);
        Key k2 = key(current->x2, current->y2);
        Key otherEnd = (k1 == currentPt) ? k2 : k1;
        points.push_back(Point(otherEnd.first, otherEnd.second));

        // find next wire at otherEnd (if it's a chain interior point)
        current = nullptr;
        if (count(pointCount, otherEnd) == 2) {
            for (CircuitElm *w : local[otherEnd]) {
                if (!used.count(w)) {
                    current = w;
                    currentPt = otherEnd;
                    break;
                }
            }
        }
    }
    return points;
}

void removeElm(std::vector<CircuitElm *> &elmList, CircuitElm *ce) {
    auto it = std::find(elmList.begin(), elmList.end(), ce);
    if (it == elmList.end())
        return;
    elmList.erase(it);
    ce->deleteElm();
    delete ce;
}

}  // namespace

void WireConverter::convertWires(SimApp &sim) {
    std::vector<CircuitElm *> &elmList = sim.elmList;

    // check if any wires are selected; if so, only convert those
    bool hasSelection = false;
    for (CircuitElm *ce : elmList) {
        if (ce->isWireElm() && !ce->isRoutedWireElm() && ce->isSelected()) {
            hasSelection = true;
            break;
        }
    }

    // collect WireElms (but not RoutedWireElms)
    std::vector<CircuitElm *> wires;
    for (CircuitElm *ce : elmList) {
        if (ce->isRoutedWireElm())
            continue;
        if (ce->isWireElm() && (!hasSelection || ce->isSelected()))
            wires.push_back(ce);
    }

    if (wires.empty())
        return;

    // count how many wire endpoints touch each point
    std::map<Key, int> pointCount;
    for (CircuitElm *w : wires) {
        pointCount[key(w->x, w->y)]++;
        pointCount[key(w->x2, w->y2)]++;
    }

    // non-wire element connections force chain endpoints.
    // add 2 so the point can never be exactly 2 (chain interior).
    for (CircuitElm *ce : elmList) {
        if (ce->isWireElm())
            continue;
        for (int i = 0; i < ce->getPostCount(); i++) {
            Point p = ce->getPost(i);
            auto it = pointCount.find(key(p.x, p.y));
            if (it != pointCount.end())
                it->second += 2;
        }
    }

    // build adjacency: for each wire, map its endpoints to the wire
    std::map<Key, std::vector<CircuitElm *>> pointToWires;
    for (CircuitElm *w : wires) {
        pointToWires[key(w->x, w->y)].push_back(w);
        pointToWires[key(w->x2, w->y2)].push_back(w);
    }

    // find chains by traversing from each unvisited wire
    std::set<CircuitElm *> visited;
    std::vector<std::vector<CircuitElm *>> chains;
    for (CircuitElm *w : wires) {
        if (visited.count(w))
            continue;
        std::vector<CircuitElm *> chain;
        buildChain(w, chain, visited, pointCount, pointToWires);
        chains.push_back(chain);
    }

    // convert each chain to a RoutedWireElm
    for (const std::vector<CircuitElm *> &chain : chains) {
        std::vector<Point> pts;
        if (chain.size() == 1) {
            // single wire, convert directly
            CircuitElm *w = chain[0];
            pts.push_back(Point(w->x, w->y));
            pts.push_back(Point(w->x2, w->y2));
        } else {
            // order the chain and find the two endpoints
            pts = orderChain(chain, pointCount);
            if (pts.size() < 3)
                continue;
        }
        RoutedWireElm *rw = RoutedWireElm::create(pts);

        // remove old wires, add new routed wire
        for (CircuitElm *w : chain)
            removeElm(elmList, w);
        elmList.push_back(rw);
    }
}
