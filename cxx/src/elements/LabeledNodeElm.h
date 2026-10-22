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

#include "../core/CircuitElm.h"
#include "../core/OrderedMap.h"

struct LabelEntry {
    Point point;
    NodeRef node;
};

class LabeledNodeElm : public CircuitElm {
public:
    ELM_CLASS(LabeledNodeElm)
    static constexpr int FLAG_ESCAPE = 4;
    static constexpr int FLAG_INTERNAL = 1;
    static constexpr int FLAG_ROTATE_TEXT = 8;

    std::string text = "label";
    int busWidth = 1;
    std::vector<double> currents;  // per-bit currents for bus labels (empty otherwise)

    static OrderedMap<LabelEntry> labelList;

    LabeledNodeElm(int xx, int yy);
    LabeledNodeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    bool isInternal() { return (flags & FLAG_INTERNAL) != 0; }
    bool isRotateText() { return (flags & FLAG_ROTATE_TEXT) != 0; }

    static void resetNodeList() { labelList = OrderedMap<LabelEntry>(); }

    static constexpr int circleSize = 17;

    void setPoints() override;
    std::optional<Point> getConnectedPost(int n) override;
    void setNode(int p, const NodeRef &n) override;

    int getDumpType() override { return 207; }
    std::string getXmlDumpType() override { return "ln"; }
    int getPostCount() override { return busWidth; }
    int getPostWidth(int) override { return busWidth; }
    int getBusWidth() override { return busWidth; }
    Point getPost(int n) override;
    void getWireSegments(std::vector<std::unique_ptr<WireSegment>> &list) override;

    // this is basically a wire, since it just connects two or more nodes together
    bool isWireEquivalent() override { return true; }
    bool isRemovableWire() override { return true; }
    bool getConnection(int n1, int n2) override { return n1 == n2; }

    static NodeRef getByName(const std::string &n);
    // find label text for the given node, if any (used to show label in getInfo() for wires)
    static std::optional<std::string> getLabelForNode(const NodeRef &cn);

    void drawLabeledNode(Graphics &g, std::string str, const Point &pt1, const Point &pt2) override;
    void drawRotatedLabeledNode(Graphics &g, std::string str, const Point &pt1, const Point &pt2);
    void draw(Graphics &g) override;

    double getCurrentIntoNode(int n) override;
    void setCurrent(VoltageSource *, double c) override { current = c; }
    void setWireCurrent(int bit, double c) override;

    int getShortcut() override { return 'b'; }
    double getVoltageDiff() override { return nodes[0]->v; }
    std::string getElmType() override { return "Labeled Node"; }
    int getBusValue();
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    std::string getScopeText(int) override { return text; }
    std::string getName() { return text; }
    bool isLabeledNodeElm() override { return true; }
};
