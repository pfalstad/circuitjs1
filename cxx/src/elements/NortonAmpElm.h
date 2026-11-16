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

/*
model:

  <ccm nm="nortonamp" f="0" sx="2" sy="2" bcs="1">
    <ext nm="in+" nd="3" ps="1" sd="2"/>
    <ext nm="in-" nd="1" ps="0" sd="2"/>
    <ext nm="out" nd="4" ps="0" sd="3"/>
    <d nn="1 0" f="2" mo="default"/>
    <d nn="2 0" f="2" mo="default"/>
    <CCCS nn="3 2 1 0" f="0" ic="2" ex="-a"/>
    <a nn="1 0 4" f="8" ma="12" mi="0" ga="100000"/>
  </ccm>
*/
class NortonAmpElm : public CompositeElm {
public:
    ELM_CLASS(NortonAmpElm)
    int opsize = 0;
    int opheight = 0;
    int opwidth = 0;
    static constexpr int FLAG_SWAP = 1;
    static constexpr int FLAG_SMALL = 2;

    NortonAmpElm(int xx, int yy) : CompositeElm(xx, yy) { init(); }
    NortonAmpElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &) : CompositeElm(xa, ya, xb, yb, f) { init(); }

    std::string getXmlDumpType() override { return "nor"; }
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    void setSize(int s);
    void setPoints() override;
    void reset() override;
    void getInfo(std::vector<std::string> &arr) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
    void addRoutingObstacle(WireRouter &router) override { addRoutingObstacleWithLeads(router, opwidth); }

private:
    std::vector<Point> in1p, in2p, textp;
    Polygon triangle, nortonTriangle;
    Point nortonCenter;
    int nortonRadius = 0;
    Font plusFont;
    double curcount0 = 0, curcount1 = 0;
    void init();
};
