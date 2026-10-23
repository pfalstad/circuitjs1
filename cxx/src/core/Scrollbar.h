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

#include <algorithm>
#include <cmath>
#include <functional>
#include <string>

#include "JsMath.h"

class CircuitElm;

// A slider in the side panel (Scrollbar in UIManager.ts), minus the drawing: the value
// logic lives here so the simulator sees the same values as the TS version, and the UI
// shows it with a widget of its own (SimApp::addSlider()).  The label above the slider is
// part of it, since every slider has one.
class Scrollbar {
public:
    static constexpr int HORIZONTAL = 1;

    std::string label;
    CircuitElm *attachedElm = nullptr;
    void *widget = nullptr;  // the UI's widget for this slider

    Scrollbar(int orientation, int value, int visible, int min, int max,
              std::function<void()> cmd = nullptr, CircuitElm *elm = nullptr)
        : attachedElm(elm), min(min), max(max - 1), val(value), command(std::move(cmd)) {}

    int getMin() const { return min; }
    int getMax() const { return max; }
    double getStepSize() const { return stepSize; }
    bool isEnabled() const { return enabled; }

    // the user moved the slider (the TS version's mouse handlers)
    void userSetValue(int v) {
        if (!enabled)
            return;
        v = std::max(min, std::min(max, v));
        val = snapToStep(v);
        draw();
        if (command)
            command();
    }

    int snapToStep(double v) const {
        if (stepSize > 0) {
            v = std::round((v - min) / stepSize) * stepSize + min;
            v = std::max((double) min, std::min((double) max, v));
        }
        return (int) jsmath::round(v);
    }

    void setStepSize(double step) { stepSize = step; }

    // tell the UI to update its widget
    void draw();

    // normalizedDelta is the wheel delta from ScrollValuePopup::normalizeWheelDelta()
    void onMouseWheel(double normalizedDelta) {
        if (enabled)
            setValue(val + (int) jsmath::round(normalizedDelta / 3));
    }

    int getValue() const { return val; }
    void setValue(int v) {
        if (v < min)
            v = min;
        else if (v > max)
            v = max;
        val = v;
        draw();
        if (command)
            command();
    }

    void enable() { enabled = true; draw(); }
    void disable() { enabled = false; draw(); }

    void addChangeHandler(std::function<void()> fn) { command = std::move(fn); }

private:
    int min, max, val;
    double stepSize = 0;
    bool enabled = true;
    std::function<void()> command;
};
