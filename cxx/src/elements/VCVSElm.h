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

class VCVSElm : public VCCSElm {
public:
    ELM_CLASS(VCVSElm)
    CHIP_CONSTRUCTORS(VCVSElm, VCCSElm)
    void setupPins() override;
    std::string getChipName() override { return "VCVS"; }
    void stamp() override;
    void doStep() override;
    // our output is a voltage source, so derivatives go into its matrix row
    void stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) override;
    void stampInputDerivativeVS(VoltageSource *ivs, double dx) override;
    void stepFinished() override;
    int getPostCount() override { return inputCount + 2; }
    int getVoltageSourceCount() override { return 1; }
    int getDumpType() override { return 212; }
    bool hasCurrentOutput() override { return false; }
    void setVoltageSource(int j, VoltageSource *vs) override;
    void setCurrent(VoltageSource *vs, double c) override;
};
