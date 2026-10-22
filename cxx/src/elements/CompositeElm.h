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

#pragma once

#include <optional>

#include "../core/CircuitElm.h"
#include "../core/CircuitNode.h"

// Circuit element made up of a composition of other circuit elements
// Using this will be (relatively) inefficient in terms of simulation performance because
// all the internal workings of the element are simulated from the individual components.
// However, it may allow some types of components to be more quickly programed in to the simulator
// than writing each component from scratch.
//
// It also provides a path to allow user created circuits to be
// re-imported in to the simulation as new circuit elements.
class CompositeElm : public CircuitElm {
public:
    // need to use escape() instead of converting spaces to _'s so composite elements can be nested
    static constexpr int FLAG_ESCAPE = 1;

    // list of elements contained in this subcircuit (owned)
    std::vector<CircuitElm *> compElmList;

protected:
    // list of nodes, mapping each one to a list of elements that reference that node
    std::optional<std::vector<std::vector<CircuitNodeLink>>> compNodeList;
    int numPosts = 0;
    int numNodes = 0;
    std::vector<Point> posts;

public:
    // node info strings for each element (space-separated node numbers), stored for deferred node list building
    std::vector<std::string> compNodeInfo;
    // per child, the node numbers its expression refers to by name (the "rn" attribute).
    // empty for the old text format, which predates expression references.
    std::vector<std::string> compRefNodeInfo;
    // external node IDs, stored for deferred node list building
    std::vector<int> extNodeIds;

    CompositeElm(int xx, int yy) : CircuitElm(xx, yy) {}
    CompositeElm(int xa, int ya, int xb, int yb, int f) : CircuitElm(xa, ya, xb, yb, f) {}
    ~CompositeElm() override;

    std::vector<CircuitElm *> *getChildElmList() override { return &compElmList; }
    bool useEscape() const { return (flags & FLAG_ESCAPE) != 0; }
    void loadComposite(StringTokenizer *stIn, const std::string &model, const std::vector<int> &externalNodes);
    void loadCompositeXml(const std::vector<const XmlElement *> &elmEntries, const std::vector<int> &externalNodes);
    // build compNodeList from stored node info.  called from preStamp() so that sub-elements
    // have their final state (after undumpXml) when we query their internal node counts.
    void buildCompNodeList();
    void preStamp() override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool getConnection(int, int) override { return false; }
    bool hasGroundConnection(int) override { return false; }
    void reset() override;
    int getPostCount() override { return numPosts; }
    int getInternalNodeCount() override { return numNodes - numPosts; }
    Point getPost(int n) override { return posts[n]; }
    void setPost(int n, const Point &p) { posts[n] = p; }
    double getPower() override;
    void stamp() override;
    // called to set node p (local to this element) to equal n (global)
    void setNode(int p, const NodeRef &n) override;
    bool canViewInScope() override { return false; }
    void deleteElm() override;
    double getCurrentIntoNode(int n) override;

protected:
    // delete the current children (the TS version just drops them)
    void clearChildren();
};
