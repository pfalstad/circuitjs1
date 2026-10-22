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

#include "GraphicElm.h"

class TextElm : public GraphicElm {
public:
    ELM_CLASS(TextElm)
    std::string text;
    std::vector<std::string> lines;
    int size;
    std::optional<std::string> color;
    static constexpr int FLAG_BAR = 2;
    static constexpr int FLAG_ESCAPE = 4;

    TextElm(int xx, int yy);
    TextElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void split();
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 'x'; }
    void drag(int xx, int yy) override;
    bool canViewInScope() override { return false; }
    void draw(Graphics &g) override;
    std::string getElmType() override { return "text"; }
    void getInfo(std::vector<std::string> &arr) override { arr[0] = text; }
    int getShortcut() override { return 't'; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
