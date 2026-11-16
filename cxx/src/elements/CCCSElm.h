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

#include "VCCSElm.h"

class VoltageElm;

class CCCSElm : public VCCSElm {
public:
    ELM_CLASS(CCCSElm)
    static constexpr int FLAG_SPICE = 2;
    std::vector<VoltageElm *> voltageSources;
    int inputPairCount = 0;
    std::vector<double> lastCurrents;

    CHIP_CONSTRUCTORS(CCCSElm, VCCSElm)
    void postConstruct(StringTokenizer *st) override;
    void setupPins() override;
    std::string getChipName() override { return "CCCS"; }
    void stamp() override;
    void doStep() override;
    // our output is a current source from O- to O+ (v0 is not negated as it is in VCCSElm)
    void stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) override;
    void stampInputDerivativeVS(VoltageSource *ivs, double dx) override;
    void stepFinished() override;
    int getPostCount() override { return inputCount + 2; }
    int getVoltageSourceCount() override { return isSpiceStyle() ? 0 : inputPairCount; }
    int getDumpType() override { return 215; }
    bool getConnection(int n1, int n2) override { return n1 / 2 == n2 / 2; }
    bool hasCurrentOutput() override { return true; }
    bool isSpiceStyle() { return (flags & FLAG_SPICE) != 0; }
    void setCurrent(VoltageSource *vs, double c) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    void setParentList(std::vector<CircuitElm *> &elmList) override;
    void setVoltageSource(int j, VoltageSource *vs) override;
    void getInfo(std::vector<std::string> &arr) override;

protected:
    // our pin inputs are currents, handled by their own loop below, so the generic
    // expression-input machinery only covers the v()/i() references
    int getPinExprInputCount() override { return 0; }

private:
    void setCurrentExprValue(int n, double cur);
};
