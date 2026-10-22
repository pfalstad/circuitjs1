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

#include "ScopeTrigger.h"

#include <algorithm>
#include <cmath>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "Graphics.h"
#include "ScopePlot.h"
#include "SimulationManager.h"

int ScopeTrigger::displayStartIndex(const ScopePlot &plot, int w, int scopePointCount) const {
    if (mode == TRIGGER_FREERUN || !fired || state == TRIG_STATE_AUTO_RUN)
        return plot.startIndex(w);
    // Trigger point at center of display
    return (int) (ptr + scopePointCount - w / 2.0);
}

int ScopeTrigger::validDataCount(const ScopePlot &plot, int ipa, int w, int scopePointCount) const {
    if (!isTriggered() || frozen)
        return w;
    int count = ((plot.ptr - ipa) & (scopePointCount - 1)) + 1;
    return std::min(count, w);
}

void ScopeTrigger::dumpXml(XmlElement *xmlElm) const {
    if (!isActive())
        return;
    CircuitXMLSerializer::dumpAttr(xmlElm, "triggerMode", mode);
    CircuitXMLSerializer::dumpAttr(xmlElm, "triggerEdge", edge);
    CircuitXMLSerializer::dumpAttr(xmlElm, "triggerLevel", level);
}

void ScopeTrigger::undumpXml(CircuitXMLDeserializer &xml) {
    mode = xml.parseIntAttr("triggerMode", TRIGGER_FREERUN);
    edge = xml.parseIntAttr("triggerEdge", TRIGGER_EDGE_RISING);
    level = xml.parseDoubleAttr("triggerLevel", 0);
}

void ScopeTrigger::reset(int scopePointCount) {
    state = TRIG_STATE_ARMED;
    holdoff = 0;
    waiting = false;
    fired = false;
    lastCheckPtr = -1;
    // the plots' own reset() has already dropped their snapshots
    frozen = false;
    autoTimeout = 2 * scopePointCount;
}

void ScopeTrigger::check(const std::vector<ScopePlot *> &visiblePlots, bool plot2d, SimulationManager *sim,
                         int scopePointCount, int rectWidth) {
    if (mode == TRIGGER_FREERUN || visiblePlots.empty() || plot2d)
        return;

    const ScopePlot &plot = *visiblePlots[0];
    int currentPtr = plot.ptr;

    // Only check when ptr advances (new sample point)
    if (currentPtr == lastCheckPtr)
        return;
    lastCheckPtr = currentPtr;

    double val = (plot.liveMax[currentPtr] + plot.liveMin[currentPtr]) * .5;

    bool edgeCrossing;
    if (edge == TRIGGER_EDGE_RISING)
        edgeCrossing = prevValue < level && val >= level;
    else
        edgeCrossing = prevValue > level && val <= level;

    switch (state) {
    case TRIG_STATE_ARMED:
        if (edgeCrossing) {
            startCapture(currentPtr, sim->t);
            waiting = false;
        } else {
            waiting = true;
            if (mode == TRIGGER_AUTO) {
                holdoff++;
                if (holdoff >= autoTimeout) {
                    state = TRIG_STATE_AUTO_RUN;
                    waiting = false;
                    thaw(visiblePlots);
                }
            }
        }
        break;

    case TRIG_STATE_TRIGGERED:
        holdoff++;
        // Sweep fully captured: replace the displayed snapshot with it, so it stays on screen
        // until the next one is complete.
        if (holdoff >= rectWidth / 2 && !captured) {
            for (ScopePlot *p : visiblePlots)
                p->freeze();
            frozen = captured = true;
            ptr = capPtr;
            time = capTime;
        }
        if (holdoff >= rectWidth) {
            state = TRIG_STATE_ARMED;
            holdoff = 0;
        }
        break;

    case TRIG_STATE_AUTO_RUN:
        if (edgeCrossing)
            startCapture(currentPtr, sim->t);
        break;
    }

    prevValue = val;
}

void ScopeTrigger::startCapture(int ptr_, double time_) {
    state = TRIG_STATE_TRIGGERED;
    capPtr = ptr_;
    capTime = time_;
    captured = false;
    holdoff = 0;
    // With nothing frozen (first sweep, or coming out of auto free-run), show this one live
    // as it fills in; otherwise keep showing the last complete sweep until this one is done.
    if (!frozen) {
        ptr = ptr_;
        time = time_;
    }
    fired = true;
}

void ScopeTrigger::thaw(const std::vector<ScopePlot *> &plots) {
    for (ScopePlot *p : plots)
        p->thaw();
    frozen = false;
}

void ScopeTrigger::drawIndicator(Graphics &g, const std::vector<ScopePlot *> &visiblePlots, const Rectangle &rect) const {
    if (mode == TRIGGER_FREERUN || visiblePlots.empty())
        return;

    const ScopePlot &plot = *visiblePlots[0];
    int maxy = (int) std::trunc((rect.height - 1) / 2);

    // Calculate y position of trigger level line
    int trigY = maxy - (int) std::trunc((level + plot.plotOffset) * plot.gridMult);

    // Draw trigger level line (dashed, orange)
    if (trigY >= 0 && trigY < rect.height) {
        g.setColor("#FF8000");
        for (int x = 0; x < rect.width; x += 8) {
            double x2 = std::min((double) x + 4, rect.width - 1);
            g.drawLine(x, trigY, x2, trigY);
        }

        // Draw edge indicator
        const char *edgeText = edge == TRIGGER_EDGE_RISING ? "T\u2191" : "T\u2193";
        g.drawString(edgeText, rect.width - 25, trigY - 3);
    }

    // Draw trigger status text
    const char *statusText;
    switch (state) {
    case TRIG_STATE_ARMED: statusText = waiting ? "WAIT" : "ARMED"; break;
    case TRIG_STATE_TRIGGERED: statusText = "TRIG"; break;
    case TRIG_STATE_AUTO_RUN: statusText = "AUTO"; break;
    default: statusText = "";
    }
    g.setColor("#FF8000");
    double sw = std::trunc(g.measureWidth(statusText));
    g.drawString(statusText, rect.width - sw - 5, rect.height - 5);
}
