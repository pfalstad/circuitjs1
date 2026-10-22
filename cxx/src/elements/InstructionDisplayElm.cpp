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

#include "InstructionDisplayElm.h"

#include <cmath>
#include <cstdint>
#include <cstdio>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Expr.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/WireRouter.h"
#include "../core/XmlDoc.h"

namespace {

// String.prototype.trim() for the ASCII whitespace the lookup table can contain
std::string jsTrim(const std::string &s) {
    const char *ws = " \t\n\r\f\v";
    size_t a = s.find_first_not_of(ws);
    if (a == std::string::npos)
        return "";
    size_t b = s.find_last_not_of(ws);
    return s.substr(a, b - a + 1);
}

bool startsWith(const std::string &s, const char *p) { return s.rfind(p, 0) == 0; }

std::string hexString(int value) {
    char buf[16];
    if (value < 0)
        std::snprintf(buf, sizeof(buf), "-%X", (unsigned) -(int64_t) value);
    else
        std::snprintf(buf, sizeof(buf), "%X", value);
    return buf;
}

}  // namespace

std::string LookupEntry::getText(int value) const {
    std::string result;
    size_t pos = 0;
    while (pos < templ.size()) {
        size_t open = templ.find('{', pos);
        if (open == std::string::npos) {
            result += templ.substr(pos);
            break;
        }
        result += templ.substr(pos, open - pos);
        size_t close = templ.find('}', open);
        if (close == std::string::npos) {
            result += templ.substr(open);
            break;
        }
        std::string exprStr = templ.substr(open + 1, close - open - 1);
        try {
            ExprParser ep(exprStr);
            std::unique_ptr<Expr> expr = ep.parseExpression();
            if (!ep.gotError()) {
                ExprState es;
                es.values[0] = value;  // a = input value
                double res = expr->eval(es);
                double intRes = std::floor(res);
                if (res == intRes)
                    result += jsNumberToString(intRes);
                else
                    result += jsNumberToString(res);
            } else {
                SimulationManager::console("ep.got error: " + exprStr);
                result += "{" + exprStr + "}";
            }
        } catch (...) {
            result += "{" + exprStr + "}";
        }
        pos = close + 1;
    }
    return result;
}

InstructionDisplayElm::InstructionDisplayElm(int xx, int yy) : CircuitElm(xx, yy) {
    lookupText = "0=text0\n1=text1\n0x2-0xF=other ({a})\n";
    parseEntries(nullptr);
}

void InstructionDisplayElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "bw", busWidth);
    if (threshold != 2.5)
        CircuitXMLSerializer::dumpAttr(elem, "th", threshold);
    if (!lookupText.empty())
        elem->text += lookupText;
}

void InstructionDisplayElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    busWidth = xml.parseIntAttr("bw", busWidth);
    threshold = xml.parseDoubleAttr("th", threshold);
    lookupText = "";
    std::optional<std::string> s = xml.parseContents();
    SimulationManager::console("lookupText: " + (s ? *s : std::string("null")));
    lookupText = s.value_or("");
    parseEntries(nullptr);
}

void InstructionDisplayElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = Point();
}

int InstructionDisplayElm::readInputValue() {
    int value = 0;
    for (int i = 0; i != busWidth; i++)
        if (nodes[i]->v > threshold)
            value |= (int32_t) (1u << (i & 31));
    return value;
}

std::string InstructionDisplayElm::getDisplayText() {
    int value = readInputValue();
    for (size_t i = 0; i != entries.size(); i++) {
        const LookupEntry &entry = entries[i];
        if (value >= entry.lo && value <= entry.hi)
            return entry.getText(value);
    }
    return std::to_string(value);
}

void InstructionDisplayElm::draw(Graphics &g) {
    g.save();
    bool sel = needsHighlight();
    const int fontSize = 14;
    g.setFont(Font("SansSerif", sel ? Font::BOLD : 0, fontSize));
    g.setColor(sel ? selectColor : lightGrayColor);
    std::string s = getDisplayText();
    interpPoint(point1, point2, lead1,
        1 - (std::floor(g.measureWidth(s)) / 2 + 8) / dn);
    setBbox(point1, lead1, 0);
    drawCenteredText(g, s, x2, y2, true);
    setVoltageColor(g, nodes[0]->v);
    if (sel)
        g.setColor(selectColor);
    drawThickLine(g, point1, lead1, 5);
    drawPosts(g);
    g.restore();
}

void InstructionDisplayElm::addRoutingObstacle(WireRouter &router) {
    router.addWire(point1.x, point1.y, x2, y2);
    router.addObstacle(x2 - 10, y2 - 10, x2 + 10, y2 + 10);
}

void InstructionDisplayElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "instruction display";
    int value = readInputValue();
    arr[1] = "in = " + std::to_string(value) + " (0x" + hexString(value) + ")";
    arr[2] = "text = " + getDisplayText();
}

std::optional<EditInfo> InstructionDisplayElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Bus Width", busWidth, 2, 32).setDimensionless();
    if (n == 1)
        return EditInfo("Threshold Voltage", threshold);
    if (n == 2) {
        EditInfo ei("Lookup Table", 0);
        ei.textArea = TextArea{lookupText};
        return ei;
    }
    return std::nullopt;
}

void InstructionDisplayElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1 && ei.value <= 32) {
            busWidth = (int) std::floor(ei.value);
            allocNodes();
        } else
            ei.setError("must be between 1 and 32");
    }
    if (n == 1)
        threshold = ei.value;
    if (n == 2) {
        lookupText = ei.textArea->value;
        parseEntries(&ei);
    }
}

void InstructionDisplayElm::parseEntries(EditInfo *ei) {
    entries.clear();
    if (lookupText.empty())
        return;
    size_t start = 0;
    while (true) {
        size_t nl = lookupText.find('\n', start);
        std::string line = jsTrim(lookupText.substr(start, nl == std::string::npos ? std::string::npos : nl - start));
        if (!line.empty()) {
            size_t eq = line.find('=');
            if (eq == std::string::npos) {
                if (ei)
                    ei->setError("missing =: " + line);
            } else {
                std::string key = jsTrim(line.substr(0, eq));
                std::string val = line.substr(eq + 1);
                try {
                    int dash = findDash(key);
                    if (dash >= 0) {
                        int lo = parseNumber(key.substr(0, dash));
                        int hi = parseNumber(key.substr(dash + 1));
                        entries.emplace_back(lo, hi, val);
                    } else {
                        int k = parseNumber(key);
                        entries.emplace_back(k, k, val);
                    }
                } catch (...) {}
            }
        }
        if (nl == std::string::npos)
            break;
        start = nl + 1;
    }
}

int InstructionDisplayElm::findDash(const std::string &s) {
    size_t start = 0;
    if (startsWith(s, "0x") || startsWith(s, "0X"))
        start = 2;
    else if (startsWith(s, "0b") || startsWith(s, "0B"))
        start = 2;
    size_t p = s.find('-', start);
    return p == std::string::npos ? -1 : (int) p;
}

int InstructionDisplayElm::parseNumber(std::string s) {
    s = jsTrim(s);
    if (startsWith(s, "0x") || startsWith(s, "0X"))
        return parseIntStrict(s.substr(2), 16);
    if (startsWith(s, "0b") || startsWith(s, "0B"))
        return parseIntStrict(s.substr(2), 2);
    return parseIntStrict(s);
}
