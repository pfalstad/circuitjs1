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
#include "Diode.h"

class LEDArrayElm : public ChipElm {
public:
    ELM_CLASS(LEDArrayElm)
    std::vector<Diode> diodes;
    std::vector<double> currents;
    std::vector<double> brightness;
    double lastDrawTime = 0;
    double decayMultiplier = 1;
    // time constant for exponential brightness decay (30ms persistence of vision)
    static constexpr double brightnessTau = 0.03;

    CHIP_CONSTRUCTORS(LEDArrayElm, ChipElm)
    void postConstruct(StringTokenizer *st) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    std::string getChipName() override { return "LED array"; }
    void setupPins() override;
    void reset() override;
    void stamp() override;
    void doStep() override;
    bool nonLinear() override { return true; }
    bool isDigitalChip() override { return false; }
    void draw(Graphics &g) override;
    void calculateCurrent() override;
    void stepFinished() override;
    int getPostCount() override { return sizeX + sizeY; }
    int getVoltageSourceCount() override { return 0; }
    bool getMatrixConnection(int, int) override { return true; }
    int getDumpType() override { return 405; }
    std::optional<EditInfo> getChipEditInfo(int n) override;
    void setChipEditValue(int n, EditInfo &ei) override;
    void getInfo(std::vector<std::string> &arr) override;

private:
    void setLEDColor(Graphics &g, int p);
};
