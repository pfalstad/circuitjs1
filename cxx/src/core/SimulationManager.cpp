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

#include "SimulationManager.h"

#include <cmath>
#include <iostream>

#include "CircuitElm.h"
#include "JsNumber.h"
#include "SimApp.h"
#include "../elements/GroundElm.h"
#include "../elements/BusSplitterElm.h"
#include "../elements/WireElm.h"

NodeRef CircuitNode::ground = std::make_shared<CircuitNode>();
SimulationManager *SimulationManager::theSim = nullptr;

void VoltageSource::assignMatrix() {
    if (n1 && n1 != CircuitNode::ground && n1->matrix != nullptr)
        matrix = n1->matrix;
    else if (n2 && n2 != CircuitNode::ground && n2->matrix != nullptr)
        matrix = n2->matrix;
    else
        matrix = elm->getNode(elm->getPostCount() - 1)->matrix;
    if (matrix == nullptr)
        std::cerr << "null matrix! " << elm->getClassName() << "\n";
}

SimulationManager::SimulationManager(SimApp *a) : app(a) {
    theSim = this;
}

void SimulationManager::console(const std::string &text) {
    std::cerr << text << "\n";
}

// zero all node voltages; nodes are shared between elements so this must be done
// centrally rather than per-element
void SimulationManager::resetNodes() {
    for (auto &cn : nodeList)
        cn->v = 0;
}

CircuitNode *SimulationManager::getCircuitNode(int n) {
    if (n >= (int) nodeList.size())
        return nullptr;
    return nodeList[n].get();
}

CircuitElm *SimulationManager::getElm(int n) {
    if (n >= (int) elmList.size())
        return nullptr;
    return elmList[n];
}

static std::string xyKey(const Point &p) {
    return std::to_string(p.x) + "," + std::to_string(p.y);  // z=0 for map key
}

// detect bus widths for wires based on connected elements
void SimulationManager::detectBusWidthsForList(std::vector<CircuitElm *> &list) {
    busMismatchList.clear();
    std::unordered_map<std::string, int> widthMap;
    for (CircuitElm *ce : list) {
        if (ce->isRemovableWire())
            continue;
        for (int j = 0; j < ce->getPostCount(); j++) {
            int w = ce->getPostWidth(j);
            if (w > 1) {
                Point pt = ce->getPost(j);
                std::string key = xyKey(pt);
                auto it = widthMap.find(key);
                if (it != widthMap.end() && it->second != w)
                    busMismatchList.push_back(pt);
                if (it == widthMap.end() || w > it->second)
                    widthMap[key] = w;
            }
        }
    }
    // propagate bus widths through wire chains and matching labels until stable
    bool changed = true;
    while (changed) {
        changed = false;
        for (CircuitElm *ce : list) {
            if (ce->isWireElm()) {
                WireElm *wire = static_cast<WireElm *>(ce);
                std::string k1 = xyKey(wire->point1);
                std::string k2 = xyKey(wire->point2);
                auto i1 = widthMap.find(k1);
                auto i2 = widthMap.find(k2);
                std::optional<int> w1, w2;
                if (i1 != widthMap.end()) w1 = i1->second;
                if (i2 != widthMap.end()) w2 = i2->second;
                int w = 1;
                if (w1) w = *w1;
                if (w2 && *w2 > w) w = *w2;
                if (w != wire->busWidth) {
                    wire->busWidth = w;
                    wire->currents.assign(w > 1 ? w : 0, 0.0);
                    wire->allocNodes();
                    changed = true;
                }
                if (w > 1) {
                    if (!w1 || *w1 < w) { widthMap[k1] = w; changed = true; }
                    if (!w2 || *w2 < w) { widthMap[k2] = w; changed = true; }
                }
            }
            // TODO: LabeledNodeElm case, when that is ported
            else if (ce->isBusSplitterElm()) {
                BusSplitterElm *bs = static_cast<BusSplitterElm *>(ce);
                // bus side is at pin 0 position
                std::string p = xyKey(bs->pins[0].post);
                int bw = bs->bits;
                auto it = widthMap.find(p);
                if (it != widthMap.end() && it->second != bw)
                    busMismatchList.push_back(bs->pins[0].post);
                if (it == widthMap.end() || it->second < bw) {
                    widthMap[p] = bw;
                    changed = true;
                }
            }
        }
    }
    // check for width mismatches: compare each non-wire element's post width
    // against the propagated widthMap.  this catches both direct and wire-mediated mismatches.
    for (CircuitElm *ce : list) {
        if (ce->isRemovableWire())
            continue;
        for (int j = 0; j < ce->getPostCount(); j++) {
            int w = ce->getPostWidth(j);
            if (w > 1) {
                Point pt = ce->getPost(j);
                auto it = widthMap.find(xyKey(pt));
                if (it != widthMap.end() && it->second != w)
                    busMismatchList.push_back(pt);
            }
        }
    }
}

// find groups of nodes connected by wire equivalents and map them to the same node.  this speeds things
// up considerably by reducing the size of the matrix.  We do this for wires, labeled nodes, and ground.
// The actual node we map to is not assigned yet.  Instead we map to the same NodeMapEntry.
void SimulationManager::calculateWireClosure() {
    // TODO: LabeledNodeElm::resetNodeList() when ported
    GroundElm::resetNodeList();
    calculateWireClosureForList(elmList, false);
}

// run wire closure on a given element list.  if uiList is true, treat LabeledNodeElm.getConnectedPost()
// as null (since labeled nodes in subcircuits connect to composite terminals, not to each other)
void SimulationManager::calculateWireClosureForList(std::vector<CircuitElm *> &list, bool uiList) {
    std::unordered_map<std::string, std::shared_ptr<NodeMapEntry>> nm;
    wireInfoList.clear();
    wireInfoElmSet = std::unordered_set<CircuitElm *>(list.begin(), list.end());
    for (CircuitElm *ce : list) {
        if (!ce->isRemovableWire())
            continue;
        ce->getWireSegments(wireInfoList);

        // for bus wires/labels, merge each bit's endpoints; for others, just one pair
        int bw = ce->getBusWidth();
        for (int j = 0; j < bw; j++) {
            Point p0 = ce->getPost(j);
            std::string k0 = pointKey(p0);
            std::shared_ptr<NodeMapEntry> cn;
            auto it0 = nm.find(k0);
            if (it0 != nm.end())
                cn = it0->second;

            // what post are we connected to
            std::optional<Point> p1;
            if (!(uiList && ce->isLabeledNodeElm()))
                p1 = ce->getConnectedPost(j);
            if (!p1) {
                // no connected post (true for labeled node the first time it's encountered, or ground)
                if (!cn)
                    nm[k0] = std::make_shared<NodeMapEntry>();
                continue;
            }
            std::string k1 = pointKey(*p1);
            std::shared_ptr<NodeMapEntry> cn2;
            auto it1 = nm.find(k1);
            if (it1 != nm.end())
                cn2 = it1->second;
            if (cn && cn2) {
                // merge nodes; go through map and change all keys pointing to cn2 to point to cn
                for (auto &kv : nm)
                    if (kv.second == cn2)
                        kv.second = cn;
            } else if (cn) {
                nm[k1] = cn;
            } else if (cn2) {
                nm[k0] = cn2;
            } else {
                // new entry
                cn = std::make_shared<NodeMapEntry>();
                nm[k0] = cn;
                nm[k1] = cn;
            }
        }
    }

    if (uiList)
        uiNodeMap = nmToPointMap(nm, list);
    else
        nodeMap = nmToPointMap(nm, list);
}

// convert string-key map to Point-key map by scanning element posts
SimulationManager::PointMap SimulationManager::nmToPointMap(
        std::unordered_map<std::string, std::shared_ptr<NodeMapEntry>> &nm, std::vector<CircuitElm *> &list) {
    PointMap result;
    for (CircuitElm *ce : list) {
        int bw = ce->isRemovableWire() ? ce->getBusWidth() : ce->getPostCount();
        for (int j = 0; j < bw; j++) {
            Point p = ce->getPost(j);
            auto it = nm.find(pointKey(p));
            if (it != nm.end())
                result[p] = it->second;
        }
        // also check connectedPost
        if (ce->isRemovableWire()) {
            for (int j = 0; j < ce->getBusWidth(); j++) {
                std::optional<Point> p = ce->getConnectedPost(j);
                if (!p)
                    continue;
                auto it = nm.find(pointKey(*p));
                if (it != nm.end())
                    result[*p] = it->second;
            }
        }
    }
    return result;
}

NodeMapEntry *SimulationManager::getFromPointMap(PointMap &map, const Point &pt) {
    auto it = map.find(pt);
    return it == map.end() ? nullptr : it->second.get();
}

// assign nodes to UI wires (which aren't part of simulation) based on neighboring non-wire elements
// that already have nodes assigned by makeNodeList.  also add wire links to nodeList so calcWireInfo works.
void SimulationManager::assignUiWireNodes() {
    std::vector<CircuitElm *> &uiList = *app->uiElmList;

    // build point-to-node map from non-wire elements in UI list,
    // and add their links to nodeList so calcWireInfo can find neighbors
    // and so setNodeVoltages() updates their volts[] for display
    for (CircuitElm *ce : uiList) {
        if (ce->isRemovableWire())
            continue;
        for (int j = 0; j != ce->getPostCount(); j++) {
            Point pt = ce->getPost(j);
            NodeMapEntry *nme = getFromPointMap(uiNodeMap, pt);
            const NodeRef &cn = ce->getNode(j);
            if (nme != nullptr && !nme->node && cn)
                nme->node = cn;
            // always link non-wire elements to nodeList so their volts[]
            // get updated, even if the post isn't at a wire endpoint
            if (cn)
                cn->links.push_back({j, ce});
        }
    }

    // assign nodes to wires and add their links to nodeList
    for (CircuitElm *ce : uiList) {
        if (!ce->isRemovableWire())
            continue;
        for (int j = 0; j != ce->getPostCount(); j++) {
            Point pt = ce->getPost(j);
            NodeMapEntry *nme = getFromPointMap(uiNodeMap, pt);
            if (nme != nullptr && nme->node) {
                NodeRef cn = nme->node;
                ce->setNode(j, cn);
                cn->links.push_back({j, ce});
            } else if (!ce->isLabeledNodeElm()) {
                console("missing node for " + pt.toString());
            }
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
bool SimulationManager::isWireInfoResolved(CircuitElm *ce, int bit) {
    auto it = wireInfoResolved.find(ce);
    return it != wireInfoResolved.end() && it->second.count(bit) > 0;
}

void SimulationManager::setWireInfoResolved(CircuitElm *ce, int bit) {
    wireInfoResolved[ce].insert(bit);
}

static bool startsWith(const std::string &s, const char *prefix) {
    return s.rfind(prefix, 0) == 0;
}

bool SimulationManager::calcWireInfo() {
    int moved = 0;
    wireInfoResolved.clear();

    // build label endpoint map: label string -> list of WireSegments sharing that label
    std::unordered_map<std::string, std::vector<WireSegment *>> labelMap;
    for (auto &ws : wireInfoList) {
        if (ws->endpoint1 && startsWith(*ws->endpoint1, "label:"))
            labelMap[*ws->endpoint1].push_back(ws.get());
    }

    for (int i = 0; i != (int) wireInfoList.size(); i++) {
        WireSegment *ws = wireInfoList[i].get();
        CircuitElm *wire = ws->wire;
        NodeRef cn1 = wire->getNode(ws->bit);
        if (!cn1) {
            // dangling labeled node not connected to anything inside composite -- no current
            ws->neighbors.clear();
            ws->labelNeighbors.clear();
            setWireInfoResolved(wire, ws->bit);
            continue;
        }

        std::vector<CircuitElm *> neighbors0;
        std::vector<CircuitElm *> neighbors1;
        std::vector<WireSegment *> labelNeighbors;
        bool isReady0 = true, isReady1 = !wire->isGroundElm();

        // position-based matching via cn.links
        for (size_t j = 0; j != cn1->links.size(); j++) {
            const CircuitNodeLink &cnl = cn1->links[j];
            CircuitElm *ce = cnl.elm;
            if (ce == wire)
                continue;
            if (!wireInfoElmSet.count(ce))
                continue;
            if (cnl.num >= ce->getPostCount())
                continue;
            std::string ptKey = pointKey(ce->getPost(cnl.num));

            int neighborBit = cnl.num % ce->getBusWidth();
            bool notReady = (ce->isRemovableWire() && !isWireInfoResolved(ce, neighborBit));

            if (ws->endpoint0 == ptKey) {
                neighbors0.push_back(ce);
                if (notReady) isReady0 = false;
            } else if (ws->endpoint1 && !startsWith(*ws->endpoint1, "label:") && *ws->endpoint1 == ptKey) {
                neighbors1.push_back(ce);
                if (notReady) isReady1 = false;
            }
        }

        // label-based matching: find other WireSegments sharing the same label endpoint
        if (ws->endpoint1 && startsWith(*ws->endpoint1, "label:")) {
            auto it = labelMap.find(*ws->endpoint1);
            if (it != labelMap.end()) {
                for (WireSegment *other : it->second) {
                    if (other == ws)
                        continue;
                    bool notReady = !isWireInfoResolved(other->wire, other->bit);
                    labelNeighbors.push_back(other);
                    if (notReady) isReady1 = false;
                }
            }
        }

        if (isReady0) {
            ws->neighbors = neighbors0;
            ws->post = 0;
            setWireInfoResolved(wire, ws->bit);
            moved = 0;
        } else if (isReady1 && (ws->endpoint1 || !wire->isGroundElm())) {
            ws->neighbors = neighbors1;
            ws->labelNeighbors = labelNeighbors;
            ws->post = 1;
            setWireInfoResolved(wire, ws->bit);
            moved = 0;
        } else {
            // move to the end of the list and try again later
            std::unique_ptr<WireSegment> p = std::move(wireInfoList[i]);
            wireInfoList.erase(wireInfoList.begin() + i);
            wireInfoList.push_back(std::move(p));
            i--;
            moved++;
            if (moved > (int) wireInfoList.size() * 2) {
                console("wire loop detected, " + std::to_string(wireInfoList.size()) + " wires total");
                stop("wire loop detected", wire);
                return false;
            }
        }
    }
    return true;
}

// find or allocate ground node
void SimulationManager::setGroundNode(bool subcircuit) {
    bool gotGround = false;
    bool gotRail = false;
    CircuitElm *volt = nullptr;
    CircuitElm *battery = nullptr;

    // allocate ground node
    NodeRef cn = std::make_shared<CircuitNode>();
    cn->index = 0;
    nodeList.push_back(cn);
    CircuitNode::ground = cn;

    // look for voltage or ground element
    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        if (ce->isGroundElm()) {
            gotGround = true;

            // set ground node
            NodeMapEntry *nme = getFromPointMap(nodeMap, ce->getPost(0));
            if (nme != nullptr)
                nme->node = CircuitNode::ground;
            break;
        }
        if (ce->isRailElm())
            gotRail = true;
        if (volt == nullptr && ce->isVoltageElm())
            volt = ce;
        if (battery == nullptr && ce->isBatteryElm())
            battery = ce;
    }

    // if no ground, and no rails, then the voltage elm's first terminal is ground;
    // if there's no plain voltage elm, fall back to a battery's negative terminal
    // (but not for subcircuits)
    if (!subcircuit && !gotGround && (volt != nullptr || battery != nullptr) && !gotRail) {
        Point pt = (volt != nullptr ? volt : battery)->getPost(0);

        // update node map
        NodeMapEntry *cln = getFromPointMap(nodeMap, pt);
        if (cln != nullptr)
            cln->node = CircuitNode::ground;
        else
            nodeMap[pt] = std::make_shared<NodeMapEntry>(CircuitNode::ground);
    }
}

// make list of nodes
void SimulationManager::makeNodeList() {
    int vscount = 0;

    // call preStamp() on all elements first so CompositeElm can build
    // its internal node list based on final child element state
    for (int i = 0; i != (int) elmList.size(); i++)
        getElm(i)->preStamp();

    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        int inodes = ce->getInternalNodeCount();
        int ivs = ce->getVoltageSourceCount();
        int posts = ce->getPostCount();

        // allocate a node for each post and match posts to nodes
        for (int j = 0; j != posts; j++) {
            Point pt = ce->getPost(j);
            NodeMapEntry *cln = getFromPointMap(nodeMap, pt);

            // is this node not in map yet?  or is the node number unallocated?
            // (we don't allocate nodes before this because changing the allocation order
            // of nodes changes circuit behavior and breaks backward compatibility;
            // the code below to connect unconnected nodes may connect a different node to ground)
            if (cln == nullptr || !cln->node) {
                NodeRef cn2 = std::make_shared<CircuitNode>();
                cn2->index = (int) nodeList.size();
                cn2->links.push_back({j, ce});
                ce->setNode(j, cn2);
                if (cln != nullptr)
                    cln->node = cn2;
                else
                    nodeMap[pt] = std::make_shared<NodeMapEntry>(cn2);
                nodeList.push_back(cn2);
            } else {
                NodeRef cn2 = cln->node;
                cn2->links.push_back({j, ce});
                ce->setNode(j, cn2);
                // if it's the ground node, make sure calculateCurrent() gets called for
                // this element, since it's never in m.nodeList (ground has no matrix row)
                // and so setNodeVoltages() will never call it for this link otherwise
                if (cn2 == CircuitNode::ground)
                    ce->calculateCurrent();
            }
        }
        for (int j = 0; j != inodes; j++) {
            NodeRef cn2 = std::make_shared<CircuitNode>();
            cn2->index = (int) nodeList.size();
            cn2->internal = true;
            cn2->links.push_back({j + posts, ce});
            ce->setNode(j + posts, cn2);
            nodeList.push_back(cn2);
        }

        // also count voltage sources so we can allocate array
        vscount += ivs;
    }

    // second pass for nodes referenced by name (v(label)/i(meter) in an expression).  this
    // has to come after the loop above, because it's LabeledNodeElm.setNode() and the
    // meters' own posts that give us something to resolve a name to, and the target may
    // belong to an element we hadn't processed yet.  it has to come before
    // findUnconnectedNodes() and calculateClosures(), since the whole point is to get the
    // referenced node into the same matrix as the element referencing it.
    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        int refs = ce->getRefNodeCount();
        if (refs == 0)
            continue;
        ce->resolveExprRefs(elmList);
        int base = ce->getPostCount() + ce->getInternalNodeCount();
        for (int j = 0; j != refs; j++) {
            const NodeRef &cn2 = ce->getNode(base + j);
            if (!cn2 || cn2 == CircuitNode::ground)
                continue;  // unresolved, or referenced against ground; nothing to link
            cn2->links.push_back({base + j, ce});
        }
    }

    voltageSources.clear();
    voltageSources.resize(vscount);
}

// recursively add child elements to elmList and make node links
void SimulationManager::addChildElms(std::vector<CircuitElm *> &list) {
    for (CircuitElm *ce : list) {
        std::vector<CircuitElm *> *childList = ce->getChildElmList();
        if (childList != nullptr) {
            // this child is itself a composite; add its children instead
            addChildElms(*childList);
            continue;
        }
        elmList.push_back(ce);
        int nodeCount = ce->getNodeCount();
        for (int i = 0; i != nodeCount; i++) {
            const NodeRef &cn = ce->getNode(i);
            cn->links.push_back({i, ce});
            // this is needed so findUnconnectedNodes() works
            cn->internal = false;
        }
    }
}

void SimulationManager::findUnconnectedNodes() {
    int totalNodes = (int) nodeList.size();

    // determine nodes that are not connected indirectly to ground.
    // all nodes must be connected to ground somehow, or else we
    // will get a matrix error.
    std::vector<bool> closure(totalNodes, false);
    unconnectedNodes.clear();
    nodesWithGroundConnection.clear();
    closure[0] = true;

    // one pass over elements: seed closure with implicit ground connections
    // and build nodesWithGroundConnection (one entry per element, no duplicates)
    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        bool hasGround = false;
        for (int j = 0; j < ce->getPostCount(); j++) {
            if (ce->hasGroundConnection(j)) {
                hasGround = true;
                closure[ce->getNode(j)->index] = true;
            }
        }
        if (hasGround)
            nodesWithGroundConnection.push_back(ce);
    }

    // BFS via cn.links: propagate closure through element connections.
    // when the queue drains, scan for an unconnected node and seed it so its
    // whole component is absorbed before we flag the next one.
    std::vector<int> queue;
    for (int i = 0; i < totalNodes; i++)
        if (closure[i]) queue.push_back(i);
    size_t qHead = 0;
    int scanFrom = 1;
    for (;;) {
        if (qHead < queue.size()) {
            int n = queue[qHead++];
            CircuitNode *cn = getCircuitNode(n);
            for (size_t j = 0; j != cn->links.size(); j++) {
                const CircuitNodeLink &cnl = cn->links[j];
                CircuitElm *ce = cnl.elm;
                int post1 = cnl.num;
                // a node an element only refers to by name (v(label)/i(label)) is not a
                // galvanic connection, so we must not flood ground through it
                if (ce->isRefNode(post1))
                    continue;
                for (int k = 0; k != ce->getPostCount(); k++) {
                    if (k == post1)
                        continue;
                    int kn = ce->getNode(k)->index;
                    if (!closure[kn] && ce->getConnection(post1, k)) {
                        closure[kn] = true;
                        queue.push_back(kn);
                    }
                }
            }
        } else {
            // queue drained; find next unconnected non-internal node
            bool found = false;
            for (; scanFrom < totalNodes; scanFrom++) {
                if (!closure[scanFrom] && !getCircuitNode(scanFrom)->internal) {
                    unconnectedNodes.push_back(scanFrom);
                    closure[scanFrom] = true;
                    queue.push_back(scanFrom++);
                    found = true;
                    break;
                }
            }
            if (!found)
                break;
        }
    }
    if (!unconnectedNodes.empty()) {
        std::string s = "unconnected nodes:";
        for (int n : unconnectedNodes)
            s += " " + std::to_string(n);
        console(s);
    }
}

void SimulationManager::calculateClosures() {
    int totalNodes = (int) nodeList.size();
    std::vector<int> closureIndex(totalNodes, -1);
    closureIndex[0] = -2;  // mark ground as handled

    int closureCount = 0;
    for (int i = 1; i != totalNodes; i++) {
        if (closureIndex[i] >= 0)
            continue;

        // flood-fill from node i
        std::vector<int> stack;
        stack.push_back(i);
        closureIndex[i] = closureCount;

        while (!stack.empty()) {
            int n = stack.back();
            stack.pop_back();
            CircuitNode *cn = getCircuitNode(n);
            for (size_t j = 0; j != cn->links.size(); j++) {
                const CircuitNodeLink &cnl = cn->links[j];
                CircuitElm *ce = cnl.elm;
                int post1 = cnl.num;
                for (int k = 0; k != ce->getNodeCount(); k++) {
                    if (k == post1)
                        continue;
                    if (!ce->getMatrixConnection(post1, k))
                        continue;
                    int kn = ce->getNode(k)->index;
                    if (kn == 0)
                        continue;  // don't flood through ground
                    if (closureIndex[kn] < 0) {
                        closureIndex[kn] = closureCount;
                        stack.push_back(kn);
                    }
                }
            }
        }
        closureCount++;
    }

    // create CircuitMatrix objects, one per closure
    if (closureCount == 0)
        closureCount = 1;
    matrices.clear();
    for (int i = 0; i != closureCount; i++)
        matrices.push_back(std::make_unique<CircuitMatrix>());
    matricesValid = true;

    // count nodes per closure and assign row numbers
    for (int i = 1; i != totalNodes; i++) {
        int ci = closureIndex[i];
        if (ci < 0)
            continue;
        CircuitNode *cn = getCircuitNode(i);
        CircuitMatrix *m = matrices[ci].get();
        m->nodeCount++;
        cn->row = m->nodeCount;  // 1-based
        cn->matrix = m;
        m->nodeList.push_back(cn);
    }

    // ground node: row=0, no matrix
    CircuitNode::ground->row = 0;
    CircuitNode::ground->matrix = nullptr;
}

// take list of unconnected nodes, which we identified earlier, and connect them to ground
// with a big resistor.  otherwise we will get matrix errors.  The resistor has to be big,
// otherwise circuits like 555 Square Wave will break
void SimulationManager::connectUnconnectedNodes() {
    for (int n : unconnectedNodes)
        stampResistor(CircuitNode::ground, nodeList[n], 1e8);
}

bool SimulationManager::validateCircuit() {
    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        if (!ce->validate())
            return false;
    }
    return true;
}

// analyze the circuit when something changes, so it can be simulated.
// Most of this has been moved to preStampCircuit() so it can be avoided if the simulation is stopped.
void SimulationManager::analyzeCircuit() {
    app->setStopElm(nullptr, std::nullopt);
    elmList = app->elmList;
    if (elmList.empty()) {
        app->postDrawList.clear();
        app->badConnectionList.clear();
        return;
    }
    detectBusWidths();
    if (app->uiElmList != &app->elmList)
        detectBusWidthsForList(*app->uiElmList);
    makePostDrawList();

    needsStamp = true;
}

// do the rest of the pre-stamp circuit analysis
bool SimulationManager::preStampCircuit(bool subcircuit) {
    nodeList.clear();
    elmList = app->elmList;
    calculateWireClosure();
    setGroundNode(subcircuit);

    // allocate nodes and voltage sources
    makeNodeList();

    // if UI is showing composite internals, run wire closure on UI list to assign
    // nodes to display-only wires and build wireInfoList for current display
    if (app->uiElmList != &app->elmList) {
        detectBusWidthsForList(*app->uiElmList);
        calculateWireClosureForList(*app->uiElmList, true);
        assignUiWireNodes();
    }

    if (!calcWireInfo())
        return false;

    nodeMap.clear();  // done with this
    uiNodeMap.clear();

    // add composite child elements to elmList and make node links
    elmList = app->elmList;
    for (CircuitElm *elm : app->elmList) {
        std::vector<CircuitElm *> *list = elm->getChildElmList();
        if (list != nullptr)
            addChildElms(*list);
    }

    int vscount = 0;
    circuitNonLinear = false;

    // determine if circuit is nonlinear.  also set voltage sources
    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        if (ce->nonLinear())
            circuitNonLinear = true;
        int ivs = ce->getVoltageSourceCount();
        for (int j = 0; j != ivs; j++) {
            auto vs = std::make_unique<VoltageSource>();
            vs->index = vscount;
            vs->elm = ce;
            if (vscount >= (int) voltageSources.size())
                voltageSources.resize(vscount + 1);
            voltageSources[vscount] = std::move(vs);
            ce->setVoltageSource(j, voltageSources[vscount].get());
            vscount++;
        }
    }
    voltageSourceCount = vscount;

    // show resistance in voltage sources if there's only one.
    // can't use voltageSourceCount here since that counts internal voltage sources, like the one in GroundElm
    bool gotVoltageSource = false;
    app->showResistanceInVoltageSources = true;
    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        if (ce->isVoltageElm()) {
            if (gotVoltageSource)
                app->showResistanceInVoltageSources = false;
            else
                gotVoltageSource = true;
        }
    }

    findUnconnectedNodes();
    calculateClosures();

    if (!validateCircuit())
        return false;

    // assign voltage sources to matrices
    std::vector<int> vsPerMatrix(matrices.size(), 0);
    for (int i = 0; i != voltageSourceCount; i++)
        voltageSources[i]->assignMatrix();
    // assign VS row numbers (after node rows)
    for (int i = 0; i != voltageSourceCount; i++) {
        VoltageSource *vs = voltageSources[i].get();
        CircuitMatrix *m = vs->matrix;
        int mi = 0;
        for (int j = 0; j != (int) matrices.size(); j++)
            if (matrices[j].get() == m) { mi = j; break; }
        vsPerMatrix[mi]++;
        vs->row = m->nodeCount + vsPerMatrix[mi];  // 1-based, after node rows
        m->voltageSourceList.push_back(vs);
    }
    // set matrix sizes
    for (size_t i = 0; i != matrices.size(); i++)
        matrices[i]->size = matrices[i]->nodeCount + vsPerMatrix[i];

    nodesWithGroundConnectionCount = (int) nodesWithGroundConnection.size();
    // only need this for validation
    nodesWithGroundConnection.clear();

    timeStep = maxTimeStep;
    needsStamp = true;

    app->callAnalyzeHook();
    return true;
}

// do pre-stamping and then stamp circuit
void SimulationManager::preStampAndStampCircuit() {
    int i;

    // preStampCircuit returns false if there's an error.  It can return false if we have capacitor loops
    // but we just need to try again in that case.  Try again 10 times to avoid infinite loop.
    for (i = 0; i != 10; i++)
        if (preStampCircuit(false) || app->stopMessage)
            break;
    if (app->stopMessage)
        return;
    if (i == 10) {
        stop("failed to stamp circuit", nullptr);
        return;
    }

    stampCircuit();
}

// stamp the matrix, meaning populate the matrix as required to simulate the circuit (for all linear elements, at least).
// this gets called after something changes in the circuit, and also when auto-adjusting timestep
void SimulationManager::stampCircuit() {
    // initialize per-matrix arrays
    for (auto &mp : matrices) {
        CircuitMatrix &m = *mp;
        int sz = m.size;
        m.matrix.assign(sz, std::vector<double>(sz, 0.0));
        m.rightSide.assign(sz, 0.0);
        m.origMatrix.assign(sz, std::vector<double>(sz, 0.0));
        m.origRightSide.assign(sz, 0.0);
        m.permute.assign(sz, 0);
        m.nodeVoltages.assign(m.nodeCount, 0.0);
        if ((int) m.lastNodeVoltages.size() != m.nodeCount)
            m.lastNodeVoltages.assign(m.nodeCount, 0.0);
        m.nonLinear = false;
    }

    // set nonLinear flag per matrix
    if (circuitNonLinear) {
        for (auto &m : matrices)
            m->nonLinear = true;
    }

    connectUnconnectedNodes();

    // stamp linear circuit elements
    for (int i = 0; i != (int) elmList.size(); i++) {
        CircuitElm *ce = getElm(i);
        ce->setParentList(elmList);
        ce->stamp();
    }

    // check if we called stop()
    if (!matricesValid)
        return;

    // save original matrices for restoring during nonlinear iterations
    int maxMatrixSize = 0;
    for (auto &mp : matrices) {
        CircuitMatrix &m = *mp;
        if (m.size > maxMatrixSize)
            maxMatrixSize = m.size;
        m.origRightSide = m.rightSide;
        m.origMatrix = m.matrix;
    }
    // determine which solver to use (AUTO uses the largest matrix size to decide)
    if (solverType == SOLVER_SPARSE)
        usingSparse = true;
    else if (solverType == SOLVER_DENSE)
        usingSparse = false;
    else  // SOLVER_AUTO
        usingSparse = (maxMatrixSize >= SPARSE_THRESHOLD);
    // if a matrix is linear, we can do the lu_factor here instead of
    // needing to do it every frame
    for (auto &mp : matrices) {
        CircuitMatrix &m = *mp;
        if (!m.nonLinear) {
            if (!lu_factor(m.matrix, m.size, m.permute, m)) {
                stop("Singular matrix!", nullptr);
                return;
            }
        }
    }

    // copy elmList to an array to avoid a bunch of calls to canCast() when doing simulation
    elmArr = elmList;

    // copy ScopeElms to an array to avoid a second pass over entire list of elms during simulation
    app->scopeElmArr.clear();
    for (CircuitElm *ce : elmArr)
        if (ce->isScopeElm())
            app->scopeElmArr.push_back(ce);

    needsStamp = false;
}

// make list of posts we need to draw.  posts shared by 2 elements should be hidden, all
// others should be drawn.  We can't use the node list for this purpose anymore because wires
// have the same node number at both ends.
void SimulationManager::makePostDrawList() {
    struct PostCount { Point pt; int count; };
    // keep insertion order, like a JS Map
    std::vector<PostCount> posts;
    std::unordered_map<std::string, size_t> postIndex;
    std::vector<CircuitElm *> &drawList = *app->uiElmList;
    for (CircuitElm *ce : drawList) {
        int n = ce->getPostCount();
        for (int j = 0; j != n; j++) {
            Point pt = ce->getPost(j);
            std::string key = pointKey(pt);
            auto it = postIndex.find(key);
            if (it == postIndex.end()) {
                postIndex[key] = posts.size();
                posts.push_back({pt, 1});
            } else {
                posts[it->second].count++;
            }
        }
    }

    app->postDrawList.clear();
    app->badConnectionList.clear();
    for (const PostCount &entry : posts) {
        if (entry.count != 2)
            app->postDrawList.push_back(entry.pt);

        // look for bad connections, posts not connected to other elements which intersect
        // other elements' bounding boxes
        if (entry.count == 1) {
            bool bad = false;
            const Point &cn = entry.pt;
            for (size_t j = 0; j != drawList.size() && !bad; j++) {
                CircuitElm *ce = drawList[j];
                if (ce->isGraphicElm())
                    continue;

                // TODO: routed wires check their path instead of the bounding box

                // does this post intersect elm's bounding box?
                if (!ce->boundingBox.contains(cn.x, cn.y))
                    continue;
                int k;
                // does this post belong to the elm?
                int pc = ce->getPostCount();
                for (k = 0; k != pc; k++) {
                    Point p = ce->getPost(k);
                    if (p.x == cn.x && p.y == cn.y)
                        break;
                }
                if (k == pc)
                    bad = true;
            }
            if (bad)
                app->badConnectionList.push_back(cn);
        }
    }
    for (const Point &p : busMismatchList)
        app->badConnectionList.push_back(p);

    // TODO: routedWireMap, when RoutedWireElm is ported
    routedWireMap.clear();
}

void SimulationManager::stop(const std::string &s, CircuitElm *ce) {
    app->setStopElm(ce, s);  // TODO: Locale::LS
    matricesValid = false;
    app->setSimRunning(false);
    app->analyzeFlag = false;
}

void SimulationManager::stampVCVS(const NodeRef &n1, const NodeRef &n2, double coef, VoltageSource *vs) {
    stampMatrixNV(vs, n1, coef);
    stampMatrixNV(vs, n2, -coef);
}

void SimulationManager::stampVoltageSource(const NodeRef &n1, const NodeRef &n2, VoltageSource *vs, double v) {
    if (vs == nullptr)
        return;
    stampMatrixNV(vs, n1, -1);
    stampMatrixNV(vs, n2, 1);
    stampRightSideVS(vs, v);
    stampMatrixVN(n1, vs, 1);
    stampMatrixVN(n2, vs, -1);
}

void SimulationManager::stampVoltageSource(const NodeRef &n1, const NodeRef &n2, VoltageSource *vs) {
    if (vs == nullptr)
        return;
    stampMatrixNV(vs, n1, -1);
    stampMatrixNV(vs, n2, 1);
    stampMatrixVN(n1, vs, 1);
    stampMatrixVN(n2, vs, -1);
}

void SimulationManager::stampVoltageSourceVS(VoltageSource *vs, double v) {
    stampVoltageSource(vs->n1, vs->n2, vs, v);
}

void SimulationManager::updateVoltageSource(const NodeRef &, const NodeRef &, VoltageSource *vs, double v) {
    if (vs == nullptr)
        return;
    stampRightSideVS(vs, v);
}

void SimulationManager::stampResistor(const NodeRef &n1, const NodeRef &n2, double r) {
    double r0 = 1 / r;
    if (std::isnan(r0) || std::isinf(r0)) {
        console("bad resistance " + jsNumberToString(r) + " " + jsNumberToString(r0));
        return;
    }
    stampMatrix(n1, n1, r0);
    stampMatrix(n2, n2, r0);
    stampMatrix(n1, n2, -r0);
    stampMatrix(n2, n1, -r0);
}

void SimulationManager::stampConductance(const NodeRef &n1, const NodeRef &n2, double r0) {
    stampMatrix(n1, n1, r0);
    stampMatrix(n2, n2, r0);
    stampMatrix(n1, n2, -r0);
    stampMatrix(n2, n1, -r0);
}

void SimulationManager::stampVCCurrentSource(const NodeRef &cn1, const NodeRef &cn2,
                                             const NodeRef &vn1, const NodeRef &vn2, double g) {
    stampMatrix(cn1, vn1, g);
    stampMatrix(cn2, vn2, g);
    stampMatrix(cn1, vn2, -g);
    stampMatrix(cn2, vn1, -g);
}

void SimulationManager::stampCurrentSource(const NodeRef &n1, const NodeRef &n2, double i) {
    stampRightSide(n1, -i);
    stampRightSide(n2, i);
}

void SimulationManager::stampCCCS(const NodeRef &n1, const NodeRef &n2, VoltageSource *vs, double gain) {
    stampMatrixVN(n1, vs, gain);
    stampMatrixVN(n2, vs, -gain);
}

void SimulationManager::stampMatrix(const NodeRef &i, const NodeRef &j, double x) {
    if (!std::isfinite(x))
        console("stampMatrix: non-finite value");
    if (i->row > 0 && j->row > 0) {
        if (i->matrix != j->matrix)
            console("stampMatrix cross-matrix! node " + std::to_string(i->index) + " vs node " + std::to_string(j->index));
        CircuitMatrix *m = (i != CircuitNode::ground) ? i->matrix : j->matrix;
        m->matrix[i->row - 1][j->row - 1] += x;
    }
}

void SimulationManager::stampMatrixNV(VoltageSource *i, const NodeRef &j, double x) {
    if (!std::isfinite(x))
        console("stampMatrixNV: non-finite value");
    if (j->row > 0) {
        if (i->matrix != j->matrix)
            console("stampMatrix cross-matrix! vs row " + std::to_string(i->row) + " vs node " + std::to_string(j->index));
        i->matrix->matrix[i->row - 1][j->row - 1] += x;
    }
}

void SimulationManager::stampMatrixVN(const NodeRef &i, VoltageSource *j, double x) {
    if (!std::isfinite(x))
        console("stampMatrixVN: non-finite value");
    if (i->row > 0) {
        if (i->matrix != j->matrix)
            console("stampMatrix cross-matrix! node " + std::to_string(i->index) + " vs vs row " + std::to_string(j->row));
        j->matrix->matrix[i->row - 1][j->row - 1] += x;
    }
}

void SimulationManager::stampMatrixVV(VoltageSource *i, VoltageSource *j, double x) {
    if (!std::isfinite(x))
        console("stampMatrixVV: non-finite value");
    if (i->matrix != j->matrix)
        console("stampMatrix cross-matrix! vs row " + std::to_string(i->row) + " vs vs row " + std::to_string(j->row));
    i->matrix->matrix[i->row - 1][j->row - 1] += x;
}

void SimulationManager::stampRightSide(const NodeRef &n, double x) {
    if (n->row > 0)
        n->matrix->rightSide[n->row - 1] += x;
}

void SimulationManager::stampRightSideVS(VoltageSource *vs, double x) {
    vs->matrix->rightSide[vs->row - 1] += x;
}

void SimulationManager::runCircuit(bool didAnalyze) {
    if (!matricesValid || elmList.empty()) {
        matricesValid = false;
        return;
    }
    bool debugprint = app->dumpMatrix;
    app->dumpMatrix = false;
    double steprate = std::trunc(160 * app->getIterCount());
    double tm = app->currentTimeMillis();
    double lit = lastIterTime;
    if (lit == 0) {
        lastIterTime = tm;
        return;
    }

    // Check if we don't need to run simulation (for very slow simulation speeds).
    // If the circuit changed, do at least one iteration to make sure everything is consistent.
    if (1000 >= steprate * (tm - lastIterTime) && !didAnalyze)
        return;

    bool delayWireProcessing = app->canDelayWireProcessing();

    long timeStepCountAtFrameStart = timeStepCount;

    // keep track of iterations completed without convergence issues
    int goodIterations = 100;

    double frameTimeLimit = std::trunc(1000.0 / app->minFrameRate);

    if (CircuitNode::ground->v != 0)
        stop("ground node at nonzero voltage", nullptr);

    for (;;) {
        if (goodIterations >= 3 && timeStep < maxTimeStep) {
            // things are going well, double the time step
            timeStep = std::min(timeStep * 2, maxTimeStep);
            console("timestep up = " + jsNumberToString(timeStep) + " at " + jsNumberToString(t));
            stampCircuit();
            goodIterations = 0;
        }

        for (CircuitElm *ce : elmArr)
            ce->startIteration();
        app->steps++;
        int subiterCount = (adjustTimeStep && timeStep / 2 > minTimeStep) ? 100 : 5000;
        int subiter;
        for (subiter = 0; subiter != subiterCount; subiter++) {
            converged = true;
            subIterations = subiter;
            for (auto &mp : matrices) {
                CircuitMatrix &m = *mp;
                for (int i = 0; i != m.size; i++)
                    m.rightSide[i] = m.origRightSide[i];
                if (m.nonLinear) {
                    for (int i = 0; i != m.size; i++)
                        for (int j = 0; j != m.size; j++)
                            m.matrix[i][j] = m.origMatrix[i][j];
                }
            }
            for (CircuitElm *ce : elmArr)
                ce->doStep();
            if (app->stopMessage)
                return;
            bool printit = debugprint;
            debugprint = false;
            for (size_t mi = 0; mi != matrices.size(); mi++) {
                CircuitMatrix &m = *matrices[mi];
                if (m.size < 8) {
                    for (int j = 0; j != m.size; j++) {
                        for (int i = 0; i != m.size; i++) {
                            double x = m.matrix[i][j];
                            if (std::isnan(x) || std::isinf(x)) {
                                stop("nan/infinite matrix!", nullptr);
                                console("matrix " + std::to_string(mi) + " [" + std::to_string(i) + "][" +
                                        std::to_string(j) + "] is " + jsNumberToString(x));
                                return;
                            }
                        }
                    }
                }
                if (printit) {
                    console("matrix " + std::to_string(mi) + ":");
                    for (int j = 0; j != m.size; j++) {
                        std::string x;
                        for (int i = 0; i != m.size; i++)
                            x += jsNumberToString(m.matrix[j][i]) + ",";
                        console(x);
                    }
                }
                if (m.nonLinear) {
                    if (converged && subiter > 0)
                        continue;
                    if (!lu_factor(m.matrix, m.size, m.permute, m)) {
                        stop("Singular matrix!", nullptr);
                        return;
                    }
                }
                lu_solve(m.matrix, m.size, m.permute, m.rightSide, m);
                applySolvedRightSide(m);
            }
            if (printit)
                console("done");
            if (!circuitNonLinear)
                break;
            if (converged && subiter > 0)
                break;
        }
        if (subiter == subiterCount) {
            // convergence failed
            goodIterations = 0;
            if (adjustTimeStep) {
                timeStep /= 2;
                console("timestep down to " + jsNumberToString(timeStep) + " at " + jsNumberToString(t));
            }
            if (timeStep < minTimeStep || !adjustTimeStep) {
                console("convergence failed after " + std::to_string(subiter) + " iterations");
                stop("Convergence failed!", nullptr);
                break;
            }
            // we reduced the timestep.  reset circuit state to the way it was at start of iteration
            for (auto &mp : matrices)
                setNodeVoltages(*mp, mp->lastNodeVoltages);
            stampCircuit();
            continue;
        }
        if (subiter > 5 || timeStep < maxTimeStep)
            console("converged after " + std::to_string(subiter) + " iterations, timeStep = " + jsNumberToString(timeStep));
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
        for (CircuitElm *ce : elmArr)
            ce->stepFinished();
        if (!delayWireProcessing)
            calcWireCurrents();
        app->onTimeStep();
        // save last node voltages so we can restart the next iteration if necessary
        for (auto &mp : matrices) {
            CircuitMatrix &m = *mp;
            for (int i = 0; i != m.nodeCount; i++)
                m.lastNodeVoltages[i] = m.nodeVoltages[i];
        }

        tm = app->currentTimeMillis();
        lit = tm;

        // Check whether enough time has elapsed to perform an *additional* iteration after
        // those we have already completed.  But limit total computation time to 50ms (20fps) by default
        if ((timeStepCount - timeStepCountAtFrameStart) * 1000 >= steprate * (tm - lastIterTime) ||
            (tm - app->lastFrameTime > frameTimeLimit))
            break;
        if (!app->simRunning)
            break;
    }
    lastIterTime = lit;
    if (delayWireProcessing)
        calcWireCurrents();
}

// set node voltages given right side found by solving one matrix
void SimulationManager::applySolvedRightSide(CircuitMatrix &m) {
    for (int j = 0; j != m.size; j++) {
        double res = m.rightSide[j];
        if (std::isnan(res)) {
            converged = false;
            break;
        }
        if (j < m.nodeCount)
            m.nodeVoltages[j] = res;
    }
    // set currents for voltage sources in this matrix
    for (VoltageSource *vs : m.voltageSourceList) {
        double res = m.rightSide[vs->row - 1];
        if (!std::isnan(res))
            vs->elm->setCurrent(vs, res);
    }
    setNodeVoltages(m, m.nodeVoltages);
}

// set node voltages in each element given an array of node voltages for one matrix
void SimulationManager::setNodeVoltages(CircuitMatrix &m, const std::vector<double> &nv) {
    for (CircuitNode *cn : m.nodeList) {
        cn->v = nv[cn->row - 1];
        for (const CircuitNodeLink &cnl : cn->links)
            cnl.elm->calculateCurrent();
    }
}

// we removed wires from the matrix to speed things up.  in order to display wire currents,
// we need to calculate them now.
void SimulationManager::calcWireCurrents() {
    for (auto &wsp : wireInfoList) {
        WireSegment &ws = *wsp;
        double cur = 0;

        if (ws.post == 0) {
            // resolve from endpoint0 (position-based neighbors)
            Point p = ws.wire->getPost(ws.bit);
            for (CircuitElm *ce : ws.neighbors)
                cur += ce->getCurrentIntoNode(ce->getNodeAtPoint(p));
        } else {
            if (ws.endpoint1 && startsWith(*ws.endpoint1, "label:")) {
                // label neighbors: use their already-computed current
                for (WireSegment *ln : ws.labelNeighbors)
                    cur += ln->current;
            } else {
                // position-based neighbors at endpoint1
                Point p = *ws.wire->getConnectedPost(ws.bit);
                for (CircuitElm *ce : ws.neighbors)
                    cur += ce->getCurrentIntoNode(ce->getNodeAtPoint(p));
            }
        }
        // get correct current polarity
        if (ws.post != 0)
            cur = -cur;
        ws.wire->setWireCurrent(ws.bit, cur);
        ws.current = cur;
    }
}

void SimulationManager::invertMatrix(std::vector<std::vector<double>> &a, int n) {
    std::vector<int> ipvt(n);
    lu_factor_dense(a, n, ipvt);
    std::vector<double> b(n, 0.0);
    std::vector<std::vector<double>> inva(n, std::vector<double>(n, 0.0));

    // solve for each column of identity matrix
    for (int i = 0; i != n; i++) {
        for (int j = 0; j != n; j++)
            b[j] = 0;
        b[i] = 1;
        lu_solve_dense(a, n, ipvt, b);
        for (int j = 0; j != n; j++)
            inva[j][i] = b[j];
    }

    // return in original matrix
    for (int i = 0; i != n; i++)
        for (int j = 0; j != n; j++)
            a[i][j] = inva[i][j];
}

// Dispatching lu_factor: uses sparse or dense solver based on solverType setting
bool SimulationManager::lu_factor(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt, CircuitMatrix &) {
    // TODO: sparse solver (DMatrixSparseCSC/SparseLU) for matrices >= SPARSE_THRESHOLD
    return lu_factor_dense(a, n, ipvt);
}

// factors a matrix into upper and lower triangular matrices by
// gaussian elimination.  On entry, a[0..n-1][0..n-1] is the
// matrix to be factored.  ipvt[] returns an integer vector of pivot
// indices, used in the lu_solve() routine.
bool SimulationManager::lu_factor_dense(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt) {
    // check for a possible singular matrix by scanning for rows that
    // are all zeroes
    for (int i = 0; i != n; i++) {
        bool row_all_zeros = true;
        for (int j = 0; j != n; j++) {
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
    for (int j = 0; j != n; j++) {

        // calculate upper triangular elements for this column
        for (int i = 0; i != j; i++) {
            double q = a[i][j];
            for (int k = 0; k != i; k++)
                q -= a[i][k] * a[k][j];
            a[i][j] = q;
        }

        // calculate lower triangular elements for this column
        double largest = 0;
        int largestRow = -1;
        for (int i = j; i != n; i++) {
            double q = a[i][j];
            for (int k = 0; k != j; k++)
                q -= a[i][k] * a[k][j];
            a[i][j] = q;
            double x = std::abs(q);
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
            std::swap(a[largestRow], a[j]);
        }

        // keep track of row interchanges
        ipvt[j] = largestRow;

        // check for zeroes; if we find one, it's a singular matrix.
        // we used to avoid them, but that caused weird bugs.  For example,
        // two inverters with outputs connected together should be flagged
        // as a singular matrix, but it was allowed (with weird currents)
        if (a[j][j] == 0.0) {
            console("didn't avoid zero");
            return false;
        }

        if (j != n - 1) {
            double mult = 1.0 / a[j][j];
            for (int i = j + 1; i != n; i++)
                a[i][j] *= mult;
        }
    }
    return true;
}

// Dispatching lu_solve: uses sparse or dense solver based on solverType setting
void SimulationManager::lu_solve(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt,
                                 std::vector<double> &b, CircuitMatrix &) {
    lu_solve_dense(a, n, ipvt, b);
}

// Solves the set of n linear equations using a LU factorization
// previously performed by lu_factor.  On input, b[0..n-1] is the right
// hand side of the equations, and on output, contains the solution.
void SimulationManager::lu_solve_dense(std::vector<std::vector<double>> &a, int n, std::vector<int> &ipvt,
                                       std::vector<double> &b) {
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
        double tot = b[row];

        b[row] = b[i];
        // forward substitution using the lower triangular matrix
        for (int j = bi; j < i; j++)
            tot -= a[i][j] * b[j];
        b[i] = tot;
    }
    for (i = n - 1; i >= 0; i--) {
        double tot = b[i];

        // back-substitution using the upper triangular matrix
        for (int j = i + 1; j != n; j++)
            tot -= a[i][j] * b[j];
        b[i] = tot / a[i][i];
    }
}

double SimulationManager::getLabeledNodeVoltage(const std::string &) {
    // TODO: needs LabeledNodeElm
    return 0;
}
