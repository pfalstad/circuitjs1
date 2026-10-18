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

#include <array>

#include "../core/CircuitElm.h"
#include "Inductor.h"

class RelayModel;

// 0 = switch
// 1 = switch end 1
// 2 = switch end 2
// ...
// 3n   = coil
// 3n+1 = coil
// 3n+2 = end of coil resistor
class RelayElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(RelayElm)
    void dumpXmlModel(XmlElement *doc) override;
    static constexpr int FLAG_SWAP_COIL = 1;
    static constexpr int FLAG_SHOW_BOX = 2;
    static constexpr int FLAG_BOTH_SIDES_COIL = 4;
    static constexpr int FLAG_FLIP = 8;
    static constexpr int FLAG_PULLDOWN = 16;

    bool needsPulldown();
    int coilStyleFromFlags(int f);

    std::string modelName;
    RelayModel *model = nullptr;
    static std::string lastModelName;

    // convenience accessors so the rest of the code doesn't change
    double inductance();
    double r_on();
    double r_off();
    double onCurrent();
    double offCurrent();
    double coilR();
    double switchingTime();
    int poleCount();

    Inductor ind;
    std::vector<Point> coilPosts, coilLeads;
    std::vector<std::array<Point, 3>> swposts, swpoles;
    std::vector<Point> ptSwitch, lines;
    std::vector<Point> outline = std::vector<Point>(4);
    double coilCurrent = 0;
    std::vector<double> switchCurrent;
    double coilCurCount = 0;
    std::vector<double> switchCurCount;

    // fractional position, between 0 and 1 inclusive
    double d_position = 0;

    // integer position, can be 0 (off), 1 (on), 2 (in between)
    int i_position = 0;

    int openhs = 0;
    int dflip = 0;
    bool onState = false;
    static constexpr int nSwitch0 = 0;
    static constexpr int nSwitch1 = 1;
    static constexpr int nSwitch2 = 2;
    int nCoil1 = 0, nCoil2 = 0, nCoil3 = 0;
    double currentOffset1 = 0, currentOffset2 = 0;
    std::vector<RelayModel *> models;

    RelayElm(int xx, int yy);
    RelayElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void postUndump();
    void setup();
    void updateModels() override;
    void newModelCreated(RelayModel *rm);
    void setupPoles();
    int getDumpType() override { return 178; }
    std::string getXmlDumpType() override { return "rl"; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    void setPoints() override;
    Point getPost(int n) override;
    int getPostCount() override { return 2 + poleCount() * 3; }
    int getInternalNodeCount() override { return 1; }
    void reset() override;
    void stamp() override;
    void startIteration() override;
    void startIterationOld();
    // we need this to be able to change the matrix for each step
    bool nonLinear() override { return true; }
    void doStep() override;
    void calculateCurrent() override;
    std::string getElmType() override { return "relay"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    bool getConnection(int n1, int n2) override;
    bool hasGroundConnection(int n) override;
    int getShortcut() override { return 'R'; }
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
};
