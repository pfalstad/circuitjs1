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

class CapacitorElm;

class OpAmpRealElm : public CompositeElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(OpAmpRealElm)
    static constexpr int MODEL_741 = 0;
    static constexpr int MODEL_324 = 1;
    static constexpr int MODEL_324v2 = 2;

    int modelType;
    static constexpr int opheight = 16;
    static constexpr int opwidth = 32;
    std::vector<double> curCounts;
    double slewRate;
    double currentLimit;
    double capValue = 0;
    static constexpr double defaultCurrentLimit = 0.0231;
    static constexpr int FLAG_SWAP = 2;

    OpAmpRealElm(int xx, int yy);
    OpAmpRealElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void reset() override;
    CapacitorElm *getCapacitor();
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    bool getConnection(int, int) override { return true; }
    void draw(Graphics &g) override;
    void setPoints() override;
    int getDumpType() override { return 409; }
    std::string getElmType() override { return "op-amp"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool canFlipX() override { return dy == 0; }
    bool canFlipY() override { return dx == 0; }

private:
    std::vector<Point> in1p, in2p, textp, rail1p, rail2p;
    Polygon triangle;
    Font plusFont;
    void initModel();
    void init741();
    void init324();
    void init324v2();
};
