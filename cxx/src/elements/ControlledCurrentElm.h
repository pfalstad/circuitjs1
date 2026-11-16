/*
    Copyright (C) Paul Falstad

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

#include "ControlledSourceElm.h"

// Two-terminal controlled current source: the diamond symbol with an arrow inside.
// The output current is the expression, which refers to the rest of the circuit by name
// with v(label) and i(label).
class ControlledCurrentElm : public ControlledSourceElm {
public:
    ELM_CLASS(ControlledCurrentElm)
    bool broken = false;

private:
    Point ashaft1, ashaft2;
    Polygon arrow;

public:
    ControlledCurrentElm(int xx, int yy) : ControlledSourceElm(xx, yy, ".001*v(in)") {}
    ControlledCurrentElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
        : ControlledSourceElm(xa, ya, xb, yb, f, st, ".001*v(in)") {}

protected:
    std::string getDefaultExpr() override { return ".001*v(in)"; }
    double getOutputValue() override { return current; }
    std::string getExprLabel() override { return "Output Current"; }

public:
    // integer dump types are for the obsolete text format; this element is XML only
    int getDumpType() override { return 0; }
    std::string getXmlDumpType() override { return "ci"; }
    std::string getElmType() override { return "Controlled Current Source"; }

    int getVoltageSourceCount() override { return 0; }

    void setPoints() override;
    void stamp() override;
    void doStep() override;
    // our output is a current source from post 1 to post 2
    void stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) override;
    void stampInputDerivativeVS(VoltageSource *ivs, double dx) override;
    // a current source with nowhere for the current to go is a matrix error, so check
    bool validate() override;
    void draw(Graphics &g) override;
    void getInfo(std::vector<std::string> &arr) override;
};
