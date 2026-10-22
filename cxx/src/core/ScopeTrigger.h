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

#include <vector>

#include "Rectangle.h"

class CircuitXMLDeserializer;
class Graphics;
class ScopePlot;
class SimulationManager;
class XmlElement;

class ScopeTrigger {
public:
    // Trigger mode constants
    static constexpr int TRIGGER_FREERUN = 0;
    static constexpr int TRIGGER_NORMAL = 1;
    static constexpr int TRIGGER_AUTO = 2;

    // Trigger edge constants
    static constexpr int TRIGGER_EDGE_RISING = 0;
    static constexpr int TRIGGER_EDGE_FALLING = 1;

    // Trigger state machine states
    static constexpr int TRIG_STATE_ARMED = 0;
    static constexpr int TRIG_STATE_TRIGGERED = 1;
    static constexpr int TRIG_STATE_AUTO_RUN = 2;

    // Configuration
    int mode = TRIGGER_FREERUN;
    int edge = TRIGGER_EDGE_RISING;
    double level = 0;

    // State machine
    int state = TRIG_STATE_ARMED;
    // Trigger column and time of the sweep being DISPLAYED. That stays the previous (frozen)
    // sweep until the one being captured (capPtr/capTime) is complete - see check().
    int ptr = 0;
    int capPtr = 0;
    double capTime = 0;
    // Whether the current capture has been completed and frozen yet
    bool captured = false;
    // Whether the visible plots hold a frozen snapshot of a complete sweep (see ScopePlot::freeze())
    bool frozen = false;
    double prevValue = 0;
    int holdoff = 0;
    int autoTimeout = 0;
    bool waiting = false;
    double time = 0;
    bool fired = false;
    int lastCheckPtr = -1;

    bool isActive() const { return mode != TRIGGER_FREERUN; }
    bool isTriggered() const { return isActive() && fired && state != TRIG_STATE_AUTO_RUN; }

    // Returns the start index for display, accounting for trigger mode.
    int displayStartIndex(const ScopePlot &plot, int w, int scopePointCount) const;
    // Returns the number of valid data points to display, clamped to width w.
    // In triggered mode, data beyond plot.ptr is stale (old circular buffer
    // contents) and must not be drawn or used for measurements.
    int validDataCount(const ScopePlot &plot, int ipa, int w, int scopePointCount) const;
    void dumpXml(XmlElement *xmlElm) const;
    // Must be called before reading child elements, to read attrs from the parent element
    void undumpXml(CircuitXMLDeserializer &xml);
    // Reset trigger state; called from Scope::resetGraph().
    void reset(int scopePointCount);
    // Trigger edge detection and state machine, called every time the plot ptr advances.
    void check(const std::vector<ScopePlot *> &visiblePlots, bool plot2d, SimulationManager *sim,
               int scopePointCount, int rectWidth);
    // Draw trigger indicator: dashed level line, edge arrow, and status text
    void drawIndicator(Graphics &g, const std::vector<ScopePlot *> &visiblePlots, const Rectangle &rect) const;

private:
    void startCapture(int ptr, double time);
    void thaw(const std::vector<ScopePlot *> &plots);
};
