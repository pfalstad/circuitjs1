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

#include "../core/Font.h"
#include "CompositeElm.h"

class OTAElm : public CompositeElm {
public:
    ELM_CLASS(OTAElm)
    double posVolt = 9.0;
    double negVolt = -9.0;

    OTAElm(int xx, int yy);
    OTAElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void reset() override;
    bool getConnection(int, int) override { return false; }
    void draw(Graphics &g) override;
    void setPoints() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 402; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool canFlipX() override { return false; }
    bool canFlipY() override { return false; }

private:
    Polygon arrowPoly1, arrowPoly2, triangle;
    static constexpr int opheight = 32;
    static constexpr int opwidth = 32;
    static constexpr int circDiam = 19;
    static constexpr int circOverlap = 8;
    std::vector<Point> in1p, in2p, in3p, in4p, textp, bar1, bar2, circCent;
    Point point2bis;
    Font plusFont;
    double curCount0 = 0, curCount1 = 0, curCount2 = 0, curCount3 = 0;
    void initOTA();
};
