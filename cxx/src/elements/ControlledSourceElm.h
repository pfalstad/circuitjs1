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
#include "../core/ExprEngine.h"

// Base for the two-terminal controlled sources drawn with the usual diamond symbol.
//
// Unlike VCCSElm and friends these have no input pins: everything the expression depends
// on comes in by name, as v(label) for the voltage of a labeled node or across a named
// voltmeter, and i(label) for the current through a named ammeter.  That keeps the symbol
// to two terminals, which is how dependent sources are normally drawn.
class ControlledSourceElm : public CircuitElm, public ExprStampTarget {
public:
    static constexpr int diamondSize = 18;

    ExprEngine engine{this, this};

    const Expr *expr() const { return engine.expr.get(); }
    const std::string &exprString() const { return engine.exprString; }

    Point center;

private:
    Point side1, side2;

public:
    // a base constructor can't call the subclass's getDefaultExpr(), so subclasses pass it in
    ControlledSourceElm(int xx, int yy, const std::string &defaultExpr);
    ControlledSourceElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st, const std::string &defaultExpr);

protected:
    virtual std::string getDefaultExpr() = 0;

    // the label shown in the edit dialog and in getInfo()
    virtual std::string getExprLabel() = 0;

public:
    int getPostCount() override { return 2; }
    bool nonLinear() override { return true; }

    int getRefNodeCount() override { return engine.getRefNodeCount(); }

    void resolveExprRefs(std::vector<CircuitElm *> &elmList) override { engine.resolveRefs(elmList); }
    void setParentList(std::vector<CircuitElm *> &elmList) override;

    // these two sources have no input pins, so every expression input is a reference
    void setExpr(const std::string &exprStr);
    void parseExpr(EditInfo *ei = nullptr);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;

    // the diamond's long diagonal runs along the element; the leads meet its two tips
    void setPoints() override;

protected:
    void drawDiamond(Graphics &g);

    // same widening schedule VCCSElm uses, so a hard-to-converge expression still settles
    double getConvergeLimit();

    // our output as actually solved, which lastoutput reports and dvdt()/didt() need
    // rolled over once per timestep
    virtual double getOutputValue() = 0;

public:
    void stepFinished() override { engine.stepFinished(getOutputValue()); }
    void reset() override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void getInfo(std::vector<std::string> &arr) override;

    double getVoltageDiff() override { return nodes[1]->v - nodes[0]->v; }
    double getPower() override { return -getVoltageDiff() * current; }
};
