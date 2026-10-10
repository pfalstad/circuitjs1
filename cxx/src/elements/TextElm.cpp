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

#include "TextElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/JsNumber.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"
#include <cmath>

TextElm::TextElm(int xx, int yy) : GraphicElm(xx, yy) {
    text = "hello";
    lines = {text};
    size = 24;
}

TextElm::TextElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : GraphicElm(xa, ya, xb, yb, f) {
    size = parseIntStrict(st.nextToken());
    text = st.nextToken();
    if ((flags & FLAG_ESCAPE) == 0) {
        // old-style dump before escape/unescape
        while (st.hasMoreTokens())
            text += " " + st.nextToken();
        size_t p;
        while ((p = text.find("%2B")) != std::string::npos || (p = text.find("%2b")) != std::string::npos)
            text.replace(p, 3, "+");
    } else {
        // new-style dump
        text = CustomLogicModel::unescape(text);
    }
    split();
}

// split on the two-character sequence \n
void TextElm::split() {
    lines.clear();
    std::string s = text;
    for (;;) {
        size_t i = s.find("\\n");
        if (i == std::string::npos)
            break;
        lines.push_back(s.substr(0, i));
        s = s.substr(i + 2);
    }
    lines.push_back(s);
}

std::string TextElm::dump() {
    flags |= FLAG_ESCAPE;
    return CircuitElm::dump() + " " + std::to_string(size) + " " + CustomLogicModel::escape(text);
}

void TextElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "si", size);
    CircuitXMLSerializer::dumpAttr(elem, "te", text);
    if (color)
        CircuitXMLSerializer::dumpAttr(elem, "co", *color);
}

void TextElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    size = xml.parseIntAttr("si", size);
    text = xml.parseStringAttr("te", text).value_or(text);
    color = xml.parseStringAttr("co", color);
    split();
}

void TextElm::drag(int xx, int yy) {
    x = xx;
    y = yy;
    x2 = xx + 16;
    y2 = yy;
}

void TextElm::draw(Graphics &g) {
    g.save();
    g.setColor(needsHighlight() ? selectColor : (color ? Color(*color) : lightGrayColor));
    Font f("SansSerif", 0, size);
    g.setFont(f);
    int cury = y;
    setBbox(x, y, x, y);
    for (const std::string &line : lines) {
        std::string s = Locale::LS(line);
        double sw = std::trunc(g.measureWidth(s));
        g.drawString(s, x, cury);
        if ((flags & FLAG_BAR) != 0) {
            double by = cury - g.currentFontSize;
            g.drawLine(x, by, x + sw - 1, by);
        }
        adjustBbox(x, cury - g.currentFontSize, x + sw, cury + 3);
        cury += (int) (g.currentFontSize + 3);
    }
    x2 = (int) (boundingBox.x + boundingBox.width);
    y2 = (int) (boundingBox.y + boundingBox.height);
    g.restore();
}

static std::string replaceAll(std::string s, const std::string &from, const std::string &to) {
    size_t p = 0;
    while ((p = s.find(from, p)) != std::string::npos) {
        s.replace(p, from.size(), to);
        p += to.size();
    }
    return s;
}

std::optional<EditInfo> TextElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Text", 0, -1, -1);
        ei.textArea = TextArea{replaceAll(text, "\\n", "\n")};
        return ei;
    }
    if (n == 1)
        return EditInfo("Size", size, 5, 100);
    if (n == 2) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Draw Bar On Top", (flags & FLAG_BAR) != 0);
        return ei;
    }
    if (n == 3)
        return EditInfo("Color", color ? *color : lightGrayColor.getHexValue()).setIsColor();
    return std::nullopt;
}

void TextElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        text = replaceAll(ei.textArea->value, "\n", "\\n");
        split();
    }
    if (n == 1)
        size = (int) std::trunc(ei.value);
    if (n == 2) {
        if (ei.checkbox->getState())
            flags |= FLAG_BAR;
        else
            flags &= ~FLAG_BAR;
    }
    if (n == 3) {
        std::string c = ei.textf->value;
        if (c == lightGrayColor.getHexValue())
            color.reset();
        else
            color = c;
    }
}
