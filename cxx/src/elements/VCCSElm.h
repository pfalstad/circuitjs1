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

#include "ChipElm.h"

#include "../core/ExprEngine.h"

class VCCSElm : public ChipElm, public ExprStampTarget {
public:
    ELM_CLASS(VCCSElm)
    double gain = 0;
    int inputCount = 0;
    bool broken = false;

    // the expression, its v()/i() references and the numeric Jacobian all live here
    ExprEngine engine{this, this};

    const Expr *expr() const { return engine.expr.get(); }
    ExprState &exprState() { return engine.state; }
    const std::string &exprString() const { return engine.exprString; }
    void setExprString(const std::string &s) { engine.exprString = s; }

    CHIP_CONSTRUCTORS(VCCSElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setupPins() override;
    int getRefNodeCount() override { return engine.getRefNodeCount(); }
    void resolveExprRefs(std::vector<CircuitElm *> &elmList) override { engine.resolveRefs(elmList); }
    void setParentList(std::vector<CircuitElm *> &elmList) override;
    std::string getChipName() override { return "VCCS~"; }
    bool nonLinear() override { return true; }
    bool isDigitalChip() override { return false; }
    void stamp() override;
    virtual bool hasCurrentOutput() { return true; }
    const NodeRef &getOutputNode(int n) { return nodes[n + inputCount]; }
    void doStep() override;
    // our output is a current source from C+ to C-
    void stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) override;
    void stampInputDerivativeVS(VoltageSource *vs, double dx) override;
    void stepFinished() override;
    int getPostCount() override { return inputCount + 2; }
    int getVoltageSourceCount() override { return 0; }
    int getDumpType() override { return 213; }
    bool getConnection(int n1, int n2) override { return comparePair(inputCount, inputCount + 1, n1, n2); }
    bool getMatrixConnection(int, int) override { return true; }
    bool hasGroundConnection(int) override { return false; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    void setExpr(const std::string &exprStr);
    void parseExpr(EditInfo *ei = nullptr);
    void getInfo(std::vector<std::string> &arr) override;
    void reset() override;
    bool validate() override;

protected:
    // (re)size the engine arrays for our current pin input count.  called from
    // setupPins() and parseExpr(), since either can change the input count.
    void allocExprArrays() { engine.alloc(getPinExprInputCount()); }
    // number of expression inputs driven by pin voltages.  0 for the current-controlled
    // subclasses, whose pin inputs are currents they load into the state themselves.
    virtual int getPinExprInputCount() { return inputCount; }
    double sign(double a, double b) { return a > 0 ? b : -b; }
    double getConvergeLimit();
    // report any v()/i() reference we could not resolve
    void addRefNodeInfo(std::vector<std::string> &arr, int i) { engine.addUnresolvedInfo(arr, i); }
};
