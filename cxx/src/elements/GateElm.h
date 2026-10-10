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

class GateElm : public CircuitElm {
public:
    static constexpr int FLAG_SMALL = 1 << 0;
    static constexpr int FLAG_SCHMITT = 1 << 1;
    static constexpr int FLAG_INVERT_INPUTS = 1 << 2;
    static constexpr int FLAG_DEMORGAN = 1 << 3;
    int inputCount = 2;
    bool lastOutput = false;
    bool justLoaded = false;
    double highVoltage;
    double propagationDelay = 0;  // seconds; 0 = instant (default)
    double delayEndTime = 0;      // time at which pending output change takes effect
    static double lastHighVoltage;
    static bool lastSchmitt;

    int gsize = 0, gwidth = 0, gwidth2 = 0, gheight = 0, hs2 = 0;
    int ww = 0;
    std::vector<Point> inPosts;
    std::vector<Point> inGates;
    std::vector<Point> icircles;  // empty if none
    std::vector<Point> linePoints;  // empty if none
    std::optional<Point> pcircle;
    Polygon gatePoly;
    Polygon schmittPoly;
    std::vector<bool> inputStates;
    int oscillationCount = 0;
    double lastTime = 0;

    GateElm(int xx, int yy);
    GateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDragLength() override { return 96; }
    virtual bool isInverting() { return false; }
    virtual bool isXorGateElm() { return false; }
    void setSize(int s);
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    std::string getXmlDumpType() override;
    void setPoints() override;
    void setupVolts() { justLoaded = true; }
    int getPostCount() override { return inputCount + 1; }
    Point getPost(int n) override;
    int getVoltageSourceCount() override { return 1; }
    virtual std::string getGateName() = 0;
    virtual std::optional<std::string> getGateText() { return std::nullopt; }
    // false = drawn as OR, true = drawn as AND
    virtual bool drawAsAndGate() = 0;
    virtual double getLeadAdjustment(int) { return 0; }
    static constexpr double orBackCtrlFrac = .195;
    static double cbrt(double x);
    static double backCurveX(double target, double hs2, double len);
    void createEuroGatePolygon();
    static bool useEuroGates();
    void drawGatePolygon(Graphics &g);
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
    virtual bool calcFunction() = 0;
    void setHighVoltage(double hv) override { highVoltage = hv; }
    void stamp() override;
    bool hasSchmittInputs() const { return (flags & FLAG_SCHMITT) != 0; }
    bool getInput(int x);
    void doStep() override;
    bool validate() override { return validateRailNode(inputCount); }
    bool getConnection(int, int) override { return false; }
    bool hasGroundConnection(int n1) override { return n1 == inputCount; }
    double getCurrentIntoNode(int n) override { return n == inputCount ? current : 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};

class AndGateElm : public GateElm {
public:
    ELM_CLASS(AndGateElm)
    AndGateElm(int xx, int yy) : GateElm(xx, yy) {}
    AndGateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : GateElm(xa, ya, xb, yb, f, st) {}
    std::string getGateName() override { return hasFlag(FLAG_INVERT_INPUTS) ? "NOR gate" : "AND gate"; }
    bool calcFunction() override;
    int getDumpType() override { return 150; }
    bool drawAsAndGate() override { return !hasFlag(FLAG_DEMORGAN); }
    std::optional<std::string> getGateText() override { return std::string("&"); }
    int getShortcut() override { return '2'; }
};

class NandGateElm : public AndGateElm {
public:
    ELM_CLASS(NandGateElm)
    NandGateElm(int xx, int yy) : AndGateElm(xx, yy) {}
    NandGateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : AndGateElm(xa, ya, xb, yb, f, st) {}
    bool isInverting() override { return true; }
    std::string getGateName() override { return hasFlag(FLAG_INVERT_INPUTS) ? "OR gate" : "NAND gate"; }
    int getDumpType() override { return 151; }
    bool drawAsAndGate() override { return !hasFlag(FLAG_DEMORGAN); }
    int getShortcut() override { return '@'; }
};

class OrGateElm : public GateElm {
public:
    ELM_CLASS(OrGateElm)
    OrGateElm(int xx, int yy) : GateElm(xx, yy) {}
    OrGateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : GateElm(xa, ya, xb, yb, f, st) {}
    std::string getGateName() override { return hasFlag(FLAG_INVERT_INPUTS) ? "NAND gate" : "OR gate"; }
    bool calcFunction() override;
    int getDumpType() override { return 152; }
    bool drawAsAndGate() override { return hasFlag(FLAG_DEMORGAN); }
    std::optional<std::string> getGateText() override { return std::string("\u22651"); }
    int getShortcut() override { return '3'; }
};

class NorGateElm : public OrGateElm {
public:
    ELM_CLASS(NorGateElm)
    NorGateElm(int xx, int yy) : OrGateElm(xx, yy) {}
    NorGateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : OrGateElm(xa, ya, xb, yb, f, st) {}
    std::string getGateName() override { return hasFlag(FLAG_INVERT_INPUTS) ? "AND gate" : "NOR gate"; }
    bool isInverting() override { return true; }
    int getDumpType() override { return 153; }
    bool drawAsAndGate() override { return hasFlag(FLAG_DEMORGAN); }
    int getShortcut() override { return '#'; }
};

class XorGateElm : public OrGateElm {
public:
    ELM_CLASS(XorGateElm)
    XorGateElm(int xx, int yy) : OrGateElm(xx, yy) {}
    XorGateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : OrGateElm(xa, ya, xb, yb, f, st) {}
    std::string getGateName() override { return "XOR gate"; }
    bool isXorGateElm() override { return true; }
    bool calcFunction() override;
    int getDumpType() override { return 154; }
    bool drawAsAndGate() override { return false; }
    std::optional<std::string> getGateText() override { return std::string("=1"); }
    int getShortcut() override { return '4'; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};

class XnorGateElm : public XorGateElm {
public:
    ELM_CLASS(XnorGateElm)
    XnorGateElm(int xx, int yy) : XorGateElm(xx, yy) {}
    XnorGateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : XorGateElm(xa, ya, xb, yb, f, st) {}
    std::string getGateName() override { return "XNOR gate"; }
    bool isInverting() override { return true; }
    int getDumpType() override { return 431; }
    bool drawAsAndGate() override { return false; }
    int getShortcut() override { return '$'; }
};
