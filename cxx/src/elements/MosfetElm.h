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

#include "Diode.h"

class MosfetModel;

class MosfetElm : public CircuitElm {
public:
    void addRoutingObstacle(WireRouter &wr) override;
    ELM_CLASS(MosfetElm)
    int pnp;
    static constexpr int FLAG_PNP = 1;
    static constexpr int FLAG_SHOWVT = 2;
    static constexpr int FLAG_FLIP = 8;
    // these bits are no longer set on new elements (the settings they controlled now live on
    // MosfetModel), but the values are still needed to decode old circuit files that have them
    // packed into the element's own flags.
    static constexpr int FLAG_DIGITAL_LEGACY = 4;
    static constexpr int FLAG_HIDE_BULK_LEGACY = 16;
    static constexpr int FLAG_BODY_DIODE_LEGACY = 32;
    static constexpr int FLAG_BODY_TERMINAL_LEGACY = 64;
    static constexpr int FLAG_SHOW_BODY_DIODE_LEGACY = 128;
    int bodyTerminal = 0;

    double vt = 0;
    // beta = 1/(RdsON*(Vgs-Vt))
    double beta = 0;
    // junction capacitance state (backward euler companion model)
    double capVoltGS = 0, capVoltGD = 0;
    double capCurGS = 0, capCurGD = 0;
    double geqGS = 0, geqGD = 0;
    double ceqGS = 0, ceqGD = 0;
    Diode diodeB1{sim};
    Diode diodeB2{sim};
    double diodeCurrent1 = 0;
    double diodeCurrent2 = 0;
    double bodyCurrent = 0;
    double curcount_body1 = 0, curcount_body2 = 0, curcount_gate = 0, curcount_source = 0, curcount_drain = 0;
    std::string modelName;
    MosfetModel *model = nullptr;
    static std::string lastModelName;

    // cached copies of the model's drawing/behavior settings, refreshed in setup()
    bool bulkShown = false;
    bool digitalSymbolShown = false;
    bool bodyDiodeSimulated = false;
    bool bodyTerminalShown = false;
    bool bodyDiodeSymbolShown = false;

    static constexpr int hs = 16;

    // points for source and drain (swapped on PNP)
    std::vector<Point> src, drn;
    // points for gate, body, and circle on PNP digital
    std::vector<Point> gate, body;
    Point pcircle;
    int pcircler = 0;
    Polygon arrowPoly, bodyDiodePoly, bodyDiodePoly2;
    std::vector<Point> bodyDiodeCathode, bodyDiodeCathode2, bodyDiodeLeads;

    double lastv0 = 0, lastv1 = 0, lastv2 = 0;
    double ids = 0;
    int mode = 0;
    double gm = 0;
    std::vector<MosfetModel *> models;

    MosfetElm(int xx, int yy, bool pnpflag = false);
    MosfetElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    // the model setup calls overrides (JfetElm's defaults), so it happens here
    void postConstruct(StringTokenizer *st) override;

    // is this a JFET (vs. a MOSFET)?  Both share MosfetModel; this only affects
    // which default model is used and which UI options are shown.
    virtual bool isJfet() { return false; }
    virtual std::string getLastModelName() { return lastModelName; }
    virtual void setLastModelName(const std::string &n) { lastModelName = n; }
    MosfetModel *legacyModel(double vt0, double beta0, int legacyFlags);
    void setup();
    bool hasGateCaps();
    void updateModels() override;
    void setupDiodes();
    // fallback vt/beta for old files with no configurable beta.  JfetElm overrides these.
    virtual double getDefaultThreshold() { return 1.5; }
    // default for elements in old files with no configurable beta.  JfetElm overrides this.
    // Not sure where this value came from, but the ZVP3306A has a beta of about .027.  Power MOSFETs have much higher betas (like 80 or more)
    virtual double getBackwardCompatibilityBeta() { return .02; }
    bool nonLinear() override { return true; }
    // TODO: onMouseWheel (TypeScrollPopup)
    bool drawDigital() { return digitalSymbolShown; }
    virtual bool showBulk() { return bulkShown; }
    bool hasBodyTerminal() { return bodyTerminalShown; }
    bool doBodyDiode() { return bodyDiodeSimulated; }
    bool showBodyDiode() { return bodyDiodeSymbolShown; }
    void reset() override;
    int getDumpType() override { return 'f'; }
    bool isMosfetElm() override { return true; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    // post 0 = gate, 1 = source for NPN, 2 = drain for NPN, 3 = body (if present)
    // for PNP, 1 is drain, 2 is source
    Point getPost(int n) override;
    double getCurrent() override { return ids; }
    double getPower() override;
    int getPostCount() override { return hasBodyTerminal() ? 4 : 3; }
    void setPoints() override;
    void startIteration() override;
    void stamp() override;
    bool nonConvergence(double last, double now);
    void stepFinished() override;
    void doStep() override { calculate(false); }
    // this is called in doStep to stamp the matrix, and also called in stepFinished() to calculate the current
    void calculate(bool finished);
    void getFetInfo(std::vector<std::string> &arr, const std::string &n);
    std::string getElmType() override { return "MOSFET"; }
    void getInfo(std::vector<std::string> &arr) override { getFetInfo(arr, "MOSFET"); }
    std::string getScopeText(int v) override;
    bool canViewInScope() override { return true; }
    double getVoltageDiff() override { return nodes[2]->v - nodes[1]->v; }
    bool getConnection(int n1, int n2) override;
    bool getMatrixConnection(int, int) override { return true; }
    // does this element support D/S swapping?
    virtual bool hasSwapDS() { return true; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void newModelCreated(MosfetModel *mm);
    void setEditValue(int n, EditInfo &ei) override;
    double getCurrentIntoNode(int n) override;
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
};

class NMosfetElm : public MosfetElm {
public:
    ELM_CLASS(NMosfetElm)
    NMosfetElm(int xx, int yy) : MosfetElm(xx, yy, false) {}
    std::string getDumpClassName() const override { return "MosfetElm"; }
    int getShortcut() override { return 'N'; }
};

class PMosfetElm : public MosfetElm {
public:
    ELM_CLASS(PMosfetElm)
    PMosfetElm(int xx, int yy) : MosfetElm(xx, yy, true) {}
    std::string getDumpClassName() const override { return "MosfetElm"; }
    int getShortcut() override { return 'P'; }
};
