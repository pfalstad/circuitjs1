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

#include "CompositeElm.h"

// Iain Sharp, Feb 2017
class DarlingtonElm : public CompositeElm {
public:
    ELM_CLASS(DarlingtonElm)
    int pnp;  // +1 for NPN, -1 for PNP

    DarlingtonElm(int xx, int yy, bool pnpflag = false);
    DarlingtonElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void reset() override;
    int getDumpType() override { return 400; }
    std::string dump() override;
    std::string getXmlDumpType() override { return "dar"; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    std::string getElmType() override { return "darlington pair"; }
    void getInfo(std::vector<std::string> &arr) override;
    void setPoints() override;
    bool canFlipY() override { return false; }

private:
    Polygon rectPoly, arrowPoly;
    std::vector<Point> rect, coll, emit, coll2;
    Point base;
    double curcount_c = 0, curcount_e = 0, curcount_b = 0;
    void setChildPnp();
};

class NDarlingtonElm : public DarlingtonElm {
public:
    ELM_CLASS(NDarlingtonElm)
    NDarlingtonElm(int xx, int yy) : DarlingtonElm(xx, yy, false) {}
    NDarlingtonElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : DarlingtonElm(xa, ya, xb, yb, f, st) {}
    std::string getDumpClassName() const override { return "DarlingtonElm"; }
};

class PDarlingtonElm : public DarlingtonElm {
public:
    ELM_CLASS(PDarlingtonElm)
    PDarlingtonElm(int xx, int yy) : DarlingtonElm(xx, yy, true) {}
    PDarlingtonElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : DarlingtonElm(xa, ya, xb, yb, f, st) {}
    std::string getDumpClassName() const override { return "DarlingtonElm"; }
};
