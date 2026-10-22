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

#include "LabeledNodeElm.h"

#include <cmath>
#include <cstdio>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

OrderedMap<LabelEntry> LabeledNodeElm::labelList;

LabeledNodeElm::LabeledNodeElm(int xx, int yy) : CircuitElm(xx, yy) {
    text = "label";
}

LabeledNodeElm::LabeledNodeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    text = st.nextToken();
    if ((flags & FLAG_ESCAPE) == 0) {
        // old-style dump before escape/unescape
        while (st.hasMoreTokens())
            text += ' ' + st.nextToken();
    } else {
        // new-style dump
        text = CustomLogicModel::unescape(text);
    }
}

void LabeledNodeElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "te", text);
}

void LabeledNodeElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    text = xml.parseStringAttr("te", text).value_or(text);
}

void LabeledNodeElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - circleSize / dn);
}

// get post we're connected to
std::optional<Point> LabeledNodeElm::getConnectedPost(int n) {
    std::string key = (busWidth > 1) ? text + ":" + std::to_string(n) : text;
    Point myPost = getPost(n);
    LabelEntry *le = labelList.get(key);
    if (le != nullptr)
        return le->point;

    // this is the first time calcWireClosure() encountered this label.  so save our post and
    // return null for now, but return it the next time we see this label so that all nodes
    // with the same label are connected
    LabelEntry newLe;
    newLe.point = myPost;
    labelList.set(key, newLe);
    return std::nullopt;
}

void LabeledNodeElm::setNode(int p, const NodeRef &n) {
    CircuitElm::setNode(p, n);

    // save node so we can return it in getByName()
    std::string key = (busWidth > 1) ? text + ":" + std::to_string(p) : text;
    LabelEntry *le = labelList.get(key);
    if (le != nullptr)  // should never happen
        le->node = n;
}

Point LabeledNodeElm::getPost(int n) {
    if (busWidth == 1)
        return point1;
    return Point(point1.x, point1.y, n);
}

void LabeledNodeElm::getWireSegments(std::vector<std::unique_ptr<WireSegment>> &list) {
    for (int b = 0; b < busWidth; b++) {
        std::string ep0 = SimulationManager::pointKey(getPost(b));
        std::string ep1 = (busWidth > 1) ? "label:" + text + ":" + std::to_string(b) : "label:" + text;
        list.push_back(std::make_unique<WireSegment>(this, b, ep0, ep1));
    }
}

NodeRef LabeledNodeElm::getByName(const std::string &n) {
    LabelEntry *le = labelList.get(n);
    if (le == nullptr)
        return nullptr;
    return le->node;
}

std::optional<std::string> LabeledNodeElm::getLabelForNode(const NodeRef &cn) {
    if (cn == nullptr)
        return std::nullopt;
    for (auto &[key, le] : labelList) {
        if (le.node == cn) {
            size_t ci = key.rfind(':');
            return (ci == std::string::npos) ? key : key.substr(0, ci);
        }
    }
    return std::nullopt;
}

void LabeledNodeElm::drawLabeledNode(Graphics &g, std::string str, const Point &pt1, const Point &pt2) {
    if (isRotateText() && pt1.x == pt2.x) {
        drawRotatedLabeledNode(g, str, pt1, pt2);
        return;
    }
    CircuitElm::drawLabeledNode(g, str, pt1, pt2);
}

void LabeledNodeElm::drawRotatedLabeledNode(Graphics &g, std::string str, const Point &pt1, const Point &pt2) {
    bool lineOver = false;
    if (!str.empty() && str[0] == '/') {
        lineOver = true;
        str = str.substr(1);
    }
    double w = g.measureWidth(str);
    double h = g.currentFontSize;
    g.save();
    g.setTextBaseline(Graphics::BASELINE_MIDDLE);
    int dir = sign(pt2.y - pt1.y);
    // offset text further from the wire to avoid overlap with long names
    double offset = h + std::max(0.0, w / 2 - h);
    double tx = pt2.x;
    double ty = pt2.y + dir * offset;
    g.translate(tx, ty);
    g.rotate(-M_PI / 2);
    g.setTextAlign(Graphics::ALIGN_CENTER);
    g.drawString(str, 0, 0);
    // bbox for rotated text: width becomes height and vice versa
    adjustBbox(tx - h / 2, ty - w / 2, tx + h / 2, ty + w / 2);
    g.restore();
    if (lineOver) {
        double xa = -h / 2 - 1;
        g.save();
        g.translate(tx, ty);
        g.rotate(-M_PI / 2);
        g.drawLine(-w / 2, xa, w / 2, xa);
        g.restore();
    }
}

void LabeledNodeElm::draw(Graphics &g) {
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, lead1, (busWidth > 1) ? 5 : 3);
    g.setColor(needsHighlight() ? selectColor : whiteColor);
    setPowerColor(g, false);
    interpPoint(point1, point2, ps2, 1 + 11 / dn);
    setBbox(point1, ps2, circleSize);
    drawLabeledNode(g, text, point1, lead1);

    if (!currents.empty()) {
        current = 0;
        for (double c : currents)
            current += c;
    }
    updateDotCount();
    drawDots(g, point1, lead1, curcount);
    drawPosts(g);
}

double LabeledNodeElm::getCurrentIntoNode(int n) {
    if (!currents.empty())
        return -currents[n];
    return -current;
}

void LabeledNodeElm::setWireCurrent(int bit, double c) {
    if (!currents.empty())
        currents[bit] = c;
    else
        current = c;
}

int LabeledNodeElm::getBusValue() {
    int value = 0;
    for (int i = 0; i < busWidth; i++)
        if (nodes[i]->v > 2.5)
            value |= 1 << i;
    return value;
}

void LabeledNodeElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS(text) + " (" + Locale::LS("Labeled Node") + ")";
    if (busWidth > 1) {
        int value = getBusValue();
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%X", value);
        arr[1] = "value = " + std::to_string(value);
        arr[2] = std::string("hex = 0x") + buf;
    } else {
        arr[1] = "I = " + getCurrentText(getCurrent());
        arr[2] = "V = " + getVoltageText(nodes[0]->v);
    }
}

std::optional<EditInfo> LabeledNodeElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Text", 0, -1, -1);
        ei.text = text;
        return ei;
    }
    if (n == 1)
        return EditInfo::createCheckbox("Internal Node", isInternal());
    if (n == 2)
        return EditInfo::createCheckbox("Rotate Text When Vertical", isRotateText());
    return std::nullopt;
}

void LabeledNodeElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        text = ei.textf->value;
    if (n == 1)
        flags = ei.changeFlag(flags, FLAG_INTERNAL);
    if (n == 2)
        flags = ei.changeFlag(flags, FLAG_ROTATE_TEXT);
}
