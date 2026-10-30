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
#include "../core/JsMath.h"

class VoltageElm : public CircuitElm {
public:
    ELM_CLASS(VoltageElm)
    void addRoutingObstacle(WireRouter &wr) override;
    static constexpr int FLAG_COS = 2;
    static constexpr int FLAG_PULSE_DUTY = 4;
    static constexpr int FLAG_CIRCLE_SYMBOL = 8;
    static constexpr int FLAG_SHOW_VOLTAGE = 16;
    static constexpr int FLAG_TIME_SPEC = 32;
    // this is separate because old RailElms may have FLAG_SHOW_VOLTAGE set even though it didn't do anything
    static constexpr int FLAG_SHOW_VOLTAGE_RAIL = 64;

    static constexpr int WF_DC = 0;
    static constexpr int WF_AC = 1;
    static constexpr int WF_SQUARE = 2;
    static constexpr int WF_TRIANGLE = 3;
    static constexpr int WF_SAWTOOTH = 4;
    static constexpr int WF_PULSE = 5;
    static constexpr int WF_NOISE = 6;
    static constexpr int WF_VAR = 7;

    int waveform;
    double frequency;
    double maxVoltage;
    double freqTimeZero;
    double bias;
    double phaseShift;
    double dutyCycle;
    double noiseValue;
    double riseTime;
    double internalResistance = 0;
    static constexpr int circleSize = 17;
    static constexpr double defaultPulseDuty = 1 / (2 * 3.14159265358979323846);

    VoltageElm(int xx, int yy, int wf = WF_DC);
    VoltageElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getInternalNodeCount() override { return internalResistance > 0 ? 1 : 0; }
    int getDumpType() override { return 'v'; }
    bool getDragVertical(bool) override { return true; }
    void dragPlace(int xa, int ya, bool vertical) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    static double positivePhase(double p);
    void reset() override;
    double triangleFunc(double x);
    void setVoltageSource(int n, VoltageSource *v) override;
    void stamp() override;
    void doStep() override;
    void stepFinished() override;
    virtual double getVoltage();
    void setPoints() override;
    double getRmsMultiplier();
    bool isVoltageElm() override { return true; }
    int getVoltageSourceCount() override { return 1; }
    double getPower() override { return -getVoltageDiff() * current; }
    double getVoltageDiff() override { return nodes[1]->v - nodes[0]->v; }
    bool hasTimingOptions() const { return waveform == WF_PULSE || waveform == WF_SQUARE; }
    bool timeSpec() const { return hasFlag(FLAG_TIME_SPEC) && hasTimingOptions(); }
    // continuous changes (sliders) keep the waveform continuous by shifting freqTimeZero;
    // other changes reset it so the waveform is phase-coherent with other sources (as after a reload)
    void setFrequency(double newFreq, bool continuous = false);
    bool validate() override;
    void draw(Graphics &g) override;
    void drawWaveform(Graphics &g, const Point &center);
    static double diffFromInteger(double x) { return std::abs(x - jsmath::round(x)); }
    // check if RMS would be a rounder number to display than peak
    bool useRmsDisplay(double peakValue);
    // return a short voltage string, using RMS if that's a rounder number
    std::string getShortVoltageText();
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    virtual int getFrequencyOffset() { return 5; }
    void setFrequencyFromTimes(double highTime, double lowTime, bool continuous);
};
