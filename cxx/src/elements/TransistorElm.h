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

#include "../core/CircuitElm.h"

class TransistorModel;

class TransistorElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    void dumpXmlModel(XmlElement *doc) override;
    void addRoutingObstacle(WireRouter &wr) override;
    ELM_CLASS(TransistorElm)
    // node 0 = base
    // node 1 = collector
    // node 2 = emitter
    int pnp;
    double beta;
    double gmin = 0;
    std::string modelName;
    TransistorModel *model = nullptr;
    static std::string lastModelName;  // never changes??
    static constexpr int FLAG_FLIP = 1;
    static constexpr int FLAG_CIRCLE = 2;
    static constexpr int FLAGS_GLOBAL = FLAG_CIRCLE;
    static int globalFlags;
    int badIters = 0;
    int localSubIters = 0;

    double ic = 0, ie = 0, ib = 0;
    double curcount_c = 0, curcount_e = 0, curcount_b = 0;
    // Junction capacitance state (trapezoidal companion model)
    double capVoltBE = 0;  // junction voltages from end of previous time step
    double capVoltBC = 0;
    double capCurBE = 0;   // junction cap currents from end of previous time step
    double capCurBC = 0;
    double geqBE = 0;      // companion conductances (computed in startIteration)
    double geqBC = 0;
    double ceqBE = 0;      // companion current sources (computed in startIteration)
    double ceqBC = 0;

    std::vector<Point> rect, coll, emit;
    Point base;
    Polygon rectPoly, arrowPoly;
    Point circleCenter;

    static constexpr double leakage = 1e-13;
    // Electron thermal voltage at SPICE's default temperature of 27 C (300.15 K):
    static constexpr double vt = 0.025865;
    double vcrit = 0;
    double lastvbc = 0;
    double lastvbe = 0;
    bool justLoaded = false;

    TransistorElm(int xx, int yy, bool pnpflag = false);
    TransistorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void setup();
    bool nonLinear() override { return true; }
    void reset() override;
    int getDumpType() override { return 't'; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void updateModels() override { setup(); }
    bool hasCircle() const { return (globalFlags & FLAG_CIRCLE) != 0; }
    Point getPost(int n) override {
        if (coll.empty())  // before setPoints()
            return point1;
        return (n == 0) ? point1 : (n == 1) ? coll[0] : emit[0];
    }
    int getPostCount() override { return 3; }
    double getPower() override;
    void setPoints() override;
    double limitStep(double vnew, double vold);
    static double calcJunctionCap(double vj, double cj0, double vj0, double mj);
    void startIteration() override;
    void stamp() override;
    void doStep() override;
    bool isTransistorElm() override { return true; }
    double getScopeValue(int x) override;
    int getScopeUnits(int x) override;
    void newModelCreated(TransistorModel *tm);
    void setBeta(double b) { beta = b; setup(); }
    void stepFinished() override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
    void setFlipped(bool flip);
    bool canViewInScope() override { return true; }
    double getCurrentIntoNode(int n) override;
    void draw(Graphics &g) override;
    std::string getScopeText(int x) override;
    std::string getElmType() override { return "transistor"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    std::vector<TransistorModel *> models;
};

class NTransistorElm : public TransistorElm {
public:
    ELM_CLASS(NTransistorElm)
    NTransistorElm(int xx, int yy) : TransistorElm(xx, yy, false) {}
    std::string getDumpClassName() const override { return "TransistorElm"; }
    int getShortcut() override { return 'n'; }
};

class PTransistorElm : public TransistorElm {
public:
    ELM_CLASS(PTransistorElm)
    PTransistorElm(int xx, int yy) : TransistorElm(xx, yy, true) {}
    std::string getDumpClassName() const override { return "TransistorElm"; }
    int getShortcut() override { return 'p'; }
};
