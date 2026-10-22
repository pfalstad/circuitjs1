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

// Two-terminal controlled voltage source: the diamond symbol with + and - inside.
// The output voltage is the expression, which refers to the rest of the circuit by name
// with v(label) and i(label).
class ControlledVoltageElm : public ControlledSourceElm {
public:
    ELM_CLASS(ControlledVoltageElm)
    ControlledVoltageElm(int xx, int yy) : ControlledSourceElm(xx, yy, "v(in)") {}
    ControlledVoltageElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
        : ControlledSourceElm(xa, ya, xb, yb, f, st, "v(in)") {}

protected:
    std::string getDefaultExpr() override { return "v(in)"; }
    double getOutputValue() override { return getVoltageDiff(); }
    std::string getExprLabel() override { return "Output Voltage"; }

public:
    // integer dump types are for the obsolete text format; this element is XML only
    int getDumpType() override { return 0; }
    std::string getXmlDumpType() override { return "cv"; }
    std::string getElmType() override { return "Controlled Voltage Source"; }

    int getVoltageSourceCount() override { return 1; }

    // tell the voltage source which nodes it sits between, so assignMatrix() can find
    // its matrix.  same order as the stamp below.
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    void doStep() override;
    // our output is a voltage source, so derivatives go into its matrix row
    void stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) override;
    void stampInputDerivativeVS(VoltageSource *ivs, double dx) override;
    void setCurrent(VoltageSource *, double c) override { current = c; }
    void draw(Graphics &g) override;
};
