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

#include "SwitchElm.h"

class DPDTSwitchElm : public SwitchElm {
public:
    ELM_CLASS(DPDTSwitchElm)
    int poleCount;

    DPDTSwitchElm(int xx, int yy, bool mm = false);
    DPDTSwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 429; }
    std::string getXmlDumpType() override { return "dpdt"; }
    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    std::vector<Point> poleLeads, throwLeads, polePosts, throwPosts, linePoints;
    std::vector<VoltageSource *> voltageSources;
    std::vector<double> currents;
    std::vector<double> curcounts;

    // voltageSources/currents/curcounts are normally (re)allocated in setPoints(), but elements
    // inside a CompositeElm/subcircuit never get setPoints() called, so allocate lazily here too.
    void ensureArrays();
    void setPoints() override;
    void draw(Graphics &g) override;
    double getCurrentIntoNode(int n) override;
    void setCurrent(VoltageSource *vs, double c) override;
    Rectangle getSwitchRect() override;
    Point getPost(int n) override;
    int getPostCount() override { return 3 * poleCount; }
    void calculateCurrent() override;
    void setVoltageSource(int j, VoltageSource *vs) override;
    void stamp() override;
    int getVoltageSourceCount() override { return resistance > 0 ? 0 : poleCount; }
    bool getConnection(int n1, int n2) override;
    bool isWireEquivalent() override { return resistance == 0; }
    // optimizing out this element is too complicated to be worth it (see #646)
    bool isRemovableWire() override { return false; }
    std::string getElmType() override { return "switch (DPDT)"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    int getShortcut() override { return 0; }
    void flip();
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int c2, int count) override;
    bool validate() override;
};
