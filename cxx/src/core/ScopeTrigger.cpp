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
#include <chrono>
#include <cmath>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "Graphics.h"
#include "ScopePlot.h"
#include "JsMath.h"
#include "SimulationManager.h"

double ScopeTrigger::now() {
    using namespace std::chrono;
    return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

ScopePlot *ScopeTrigger::sourcePlot(const std::vector<std::unique_ptr<ScopePlot>> &plots,
                                    const std::vector<ScopePlot *> &visiblePlots) const {
    if (source >= 0 && source < (int) plots.size()) {
        ScopePlot *p = plots[source].get();
        if (std::find(visiblePlots.begin(), visiblePlots.end(), p) != visiblePlots.end())
            return p;
    }
    return visiblePlots.empty() ? nullptr : visiblePlots[0];
}

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
    if (source != 0)
        CircuitXMLSerializer::dumpAttr(xmlElm, "triggerSource", source);
}

void ScopeTrigger::undumpXml(CircuitXMLDeserializer &xml) {
    mode = xml.parseIntAttr("triggerMode", TRIGGER_FREERUN);
    edge = xml.parseIntAttr("triggerEdge", TRIGGER_EDGE_RISING);
    level = xml.parseDoubleAttr("triggerLevel", 0);
    source = xml.parseIntAttr("triggerSource", 0);
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

void ScopeTrigger::check(const std::vector<ScopePlot *> &visiblePlots, const ScopePlot *plotp, bool plot2d,
                         SimulationManager *sim, int scopePointCount, int rectWidth) {
    if (mode == TRIGGER_FREERUN || plotp == nullptr || plot2d)
        return;

    const ScopePlot &plot = *plotp;
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
            startCapture(visiblePlots, currentPtr, sim->t);
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
        // Sweep fully captured: snapshot it, so it stays on screen until the next trigger
        // (or, for fast sweeps, until the next one is complete).
        if (holdoff >= rectWidth / 2 && !captured) {
            // if it was being shown live, the display isn't changing, so no flash
            if (frozen)
                lastSweepShown = now();
            for (ScopePlot *p : visiblePlots)
                p->freeze();
            frozen = captured = true;
            ptr = capPtr;
            time = capTime;
            snapshotDrawn = false;
        }
        if (holdoff >= rectWidth) {
            state = TRIG_STATE_ARMED;
            holdoff = 0;
        }
        break;

    case TRIG_STATE_AUTO_RUN:
        if (edgeCrossing)
            startCapture(visiblePlots, currentPtr, sim->t);
        break;
    }

    prevValue = val;
}

void ScopeTrigger::startCapture(const std::vector<ScopePlot *> &plots, int ptr_, double time_) {
    state = TRIG_STATE_TRIGGERED;
    capPtr = ptr_;
    capTime = time_;
    captured = false;
    holdoff = 0;
    // Show the new sweep right away, filling in live, unless the last complete one hasn't
    // even been drawn yet; then keep it until this one is done.
    if (frozen && snapshotDrawn)
        thaw(plots);
    if (!frozen) {
        ptr = ptr_;
        time = time_;
        lastSweepShown = now();
    }
    fired = true;
}

void ScopeTrigger::thaw(const std::vector<ScopePlot *> &plots) {
    for (ScopePlot *p : plots)
        p->thaw();
    frozen = false;
}

int ScopeTrigger::levelY(const ScopePlot &plot, const Rectangle &rect) const {
    int maxy = (int) std::trunc((rect.height - 1) / 2);
    return maxy - (int) std::trunc((level + plot.plotOffset) * plot.gridMult);
}

bool ScopeTrigger::nearLevel(const ScopePlot *plot, const Rectangle &rect, double y) const {
    if (!isActive() || plot == nullptr || plot->gridMult == 0)
        return false;
    return std::abs(y - levelY(*plot, rect)) <= GRAB_DISTANCE;
}

void ScopeTrigger::setLevelFromY(const ScopePlot *plot, const Rectangle &rect, double y) {
    if (plot == nullptr || plot->gridMult == 0)
        return;
    int maxy = (int) std::trunc((rect.height - 1) / 2);
    double step = jsmath::pow(10, std::floor(jsmath::log10(1 / plot->gridMult)));
    level = jsmath::round(((maxy - y) / plot->gridMult - plot->plotOffset) / step) * step;
}

void ScopeTrigger::drawIndicator(Graphics &g, const ScopePlot *plotp, const Rectangle &rect, bool highlight) const {
    if (mode == TRIGGER_FREERUN || plotp == nullptr)
        return;

    const ScopePlot &plot = *plotp;
    int trigY = levelY(plot, rect);

    // Draw trigger level line (orange; dashed, or solid with its value when highlighted)
    if (trigY >= 0 && trigY < rect.height) {
        g.setColor("#FF8000");
        if (highlight) {
            g.drawLine(0, trigY - 1, rect.width - 1, trigY - 1);
            g.drawLine(0, trigY, rect.width - 1, trigY);
        } else {
            for (int x = 0; x < rect.width; x += 8) {
                double x2 = std::min((double) x + 4, rect.width - 1);
                g.drawLine(x, trigY, x2, trigY);
            }
        }

        // Draw edge indicator
        std::string edgeText = edge == TRIGGER_EDGE_RISING ? "T\u2191" : "T\u2193";
        if (highlight)
            edgeText += " " + plot.getUnitText(level);
        double ew = std::trunc(g.measureWidth(edgeText));
        g.drawString(edgeText, rect.width - ew - 5, trigY - 3);
    }

    // Draw trigger status text
    const char *statusText;
    switch (state) {
    case TRIG_STATE_ARMED: statusText = waiting ? "WAIT" : "ARMED"; break;
    case TRIG_STATE_TRIGGERED: statusText = "TRIG"; break;
    case TRIG_STATE_AUTO_RUN: statusText = "AUTO"; break;
    default: statusText = "";
    }
    // flash the status text when a new sweep is shown, since the display otherwise gives no
    // sign that a sweep identical to the last one has come in
    double sw = std::trunc(g.measureWidth(statusText));
    g.setColor("#FF8000");
    if (now() - lastSweepShown < FLASH_TIME) {
        g.fillRect(rect.width - sw - 7, rect.height - 17, sw + 4, 15);
        g.setColor("#000000");
    }
    g.drawString(statusText, rect.width - sw - 5, rect.height - 5);
}
