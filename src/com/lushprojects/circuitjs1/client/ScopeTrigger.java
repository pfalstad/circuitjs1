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

package com.lushprojects.circuitjs1.client;

import java.util.Vector;

import com.google.gwt.xml.client.Element;

class ScopeTrigger {
    // Trigger mode constants
    static final int TRIGGER_FREERUN = 0;
    static final int TRIGGER_NORMAL = 1;
    static final int TRIGGER_AUTO = 2;

    // Trigger edge constants
    static final int TRIGGER_EDGE_RISING = 0;
    static final int TRIGGER_EDGE_FALLING = 1;

    // Trigger state machine states
    static final int TRIG_STATE_ARMED = 0;
    static final int TRIG_STATE_TRIGGERED = 1;
    static final int TRIG_STATE_AUTO_RUN = 2;

    // Configuration
    int mode = TRIGGER_FREERUN;
    int edge = TRIGGER_EDGE_RISING;
    double level = 0;

    // State machine
    int state = TRIG_STATE_ARMED;
    int ptr = 0;
    double prevValue = 0;
    int holdoff = 0;
    int autoTimeout = 0;
    boolean waiting = false;
    double time = 0;
    boolean fired = false;
    int lastCheckPtr = -1;

    boolean isActive() {
	return mode != TRIGGER_FREERUN;
    }

    boolean isTriggered() {
	return isActive() && fired && state != TRIG_STATE_AUTO_RUN;
    }

    // Returns the start index for display, accounting for trigger mode.
    int displayStartIndex(ScopePlot plot, int w, int scopePointCount) {
	if (mode == TRIGGER_FREERUN || !fired || state == TRIG_STATE_AUTO_RUN)
	    return plot.startIndex(w);
	// Trigger point at center of display
	return ptr + scopePointCount - w/2;
    }

    // Returns the number of valid data points to display, clamped to width w.
    // In triggered mode, data beyond plot.ptr is stale (old circular buffer
    // contents) and must not be drawn or used for measurements.
    int validDataCount(ScopePlot plot, int ipa, int w, int scopePointCount) {
	if (!isTriggered())
	    return w;
	int count = ((plot.ptr - ipa) & (scopePointCount-1)) + 1;
	return Math.min(count, w);
    }

    void dumpXml(Element xmlElm) {
	if (!isActive())
	    return;
	XMLSerializer.dumpAttr(xmlElm, "triggerMode", mode);
	XMLSerializer.dumpAttr(xmlElm, "triggerEdge", edge);
	XMLSerializer.dumpAttr(xmlElm, "triggerLevel", level);
    }

    // Must be called before xml.parseChildElement() to ensure attrs are read from the parent element
    void undumpXml(XMLDeserializer xml) {
	mode = xml.parseIntAttr("triggerMode", TRIGGER_FREERUN);
	edge = xml.parseIntAttr("triggerEdge", TRIGGER_EDGE_RISING);
	level = xml.parseDoubleAttr("triggerLevel", 0);
    }

    // Reset trigger state; called from Scope.resetGraph().
    void reset(int scopePointCount) {
	state = TRIG_STATE_ARMED;
	holdoff = 0;
	waiting = false;
	fired = false;
	lastCheckPtr = -1;
	autoTimeout = 2 * scopePointCount;
    }

    // Trigger edge detection and state machine, called every time the plot ptr advances.
    void check(Vector<ScopePlot> visiblePlots, boolean plot2d, SimulationManager sim, int scopePointCount, int rectWidth) {
	if (mode == TRIGGER_FREERUN || visiblePlots.size() == 0 || plot2d)
	    return;

	ScopePlot plot = visiblePlots.firstElement();
	int currentPtr = plot.ptr;

	// Only check when ptr advances (new sample point)
	if (currentPtr == lastCheckPtr)
	    return;
	lastCheckPtr = currentPtr;

	double val = (plot.maxValues[currentPtr] + plot.minValues[currentPtr]) * .5;

	boolean edgeCrossing;
	if (edge == TRIGGER_EDGE_RISING)
	    edgeCrossing = prevValue < level && val >= level;
	else
	    edgeCrossing = prevValue > level && val <= level;

	switch (state) {
	case TRIG_STATE_ARMED:
	    if (edgeCrossing) {
		state = TRIG_STATE_TRIGGERED;
		ptr = currentPtr;
		time = sim.t;
		holdoff = 0;
		waiting = false;
		fired = true;
	    } else {
		waiting = true;
		if (mode == TRIGGER_AUTO) {
		    holdoff++;
		    if (holdoff >= autoTimeout) {
			state = TRIG_STATE_AUTO_RUN;
			waiting = false;
		    }
		}
	    }
	    break;

	case TRIG_STATE_TRIGGERED:
	    holdoff++;
	    if (holdoff >= rectWidth) {
		state = TRIG_STATE_ARMED;
		holdoff = 0;
	    }
	    break;

	case TRIG_STATE_AUTO_RUN:
	    if (edgeCrossing) {
		state = TRIG_STATE_TRIGGERED;
		ptr = currentPtr;
		time = sim.t;
		holdoff = 0;
		fired = true;
	    }
	    break;
	}

	prevValue = val;
    }

    // Draw trigger indicator: dashed level line, edge arrow, and status text
    void drawIndicator(Graphics g, Vector<ScopePlot> visiblePlots, Rectangle rect) {
	if (mode == TRIGGER_FREERUN || visiblePlots.size() == 0)
	    return;

	ScopePlot plot = visiblePlots.firstElement();
	int maxy = (rect.height-1)/2;

	// Calculate y position of trigger level line
	int trigY = maxy - (int)((level + plot.plotOffset) * plot.gridMult);

	// Draw trigger level line (dashed, orange)
	if (trigY >= 0 && trigY < rect.height) {
	    g.setColor("#FF8000");
	    for (int x = 0; x < rect.width; x += 8) {
		int x2 = Math.min(x + 4, rect.width - 1);
		g.drawLine(x, trigY, x2, trigY);
	    }

	    // Draw edge indicator
	    String edgeText = edge == TRIGGER_EDGE_RISING ? "T↑" : "T↓";
	    g.drawString(edgeText, rect.width - 25, trigY - 3);
	}

	// Draw trigger status text
	String statusText;
	switch (state) {
	case TRIG_STATE_ARMED:
	    statusText = waiting ? "WAIT" : "ARMED";
	    break;
	case TRIG_STATE_TRIGGERED:
	    statusText = "TRIG";
	    break;
	case TRIG_STATE_AUTO_RUN:
	    statusText = "AUTO";
	    break;
	default:
	    statusText = "";
	}
	g.setColor("#FF8000");
	int sw = (int)g.context.measureText(statusText).getWidth();
	g.drawString(statusText, rect.width - sw - 5, rect.height - 5);
    }
}
