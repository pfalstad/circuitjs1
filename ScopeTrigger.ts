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

import { Graphics } from "./Graphics";
import { Rectangle } from "./Rectangle";
import { ScopePlot } from "./ScopePlot";
import { SimulationManager } from "./SimulationManager";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";

export class ScopeTrigger {
    // Trigger mode constants
    static readonly TRIGGER_FREERUN = 0;
    static readonly TRIGGER_NORMAL  = 1;
    static readonly TRIGGER_AUTO    = 2;

    // Trigger edge constants
    static readonly TRIGGER_EDGE_RISING  = 0;
    static readonly TRIGGER_EDGE_FALLING = 1;

    // Trigger state machine states
    static readonly TRIG_STATE_ARMED     = 0;
    static readonly TRIG_STATE_TRIGGERED = 1;
    static readonly TRIG_STATE_AUTO_RUN  = 2;

    // Configuration
    mode: number = ScopeTrigger.TRIGGER_FREERUN;
    edge: number = ScopeTrigger.TRIGGER_EDGE_RISING;
    level: number = 0;

    // State machine
    state: number = ScopeTrigger.TRIG_STATE_ARMED;
    ptr: number = 0;
    prevValue: number = 0;
    holdoff: number = 0;
    autoTimeout: number = 0;
    waiting: boolean = false;
    time: number = 0;
    fired: boolean = false;
    lastCheckPtr: number = -1;

    isActive(): boolean {
        return this.mode !== ScopeTrigger.TRIGGER_FREERUN;
    }

    isTriggered(): boolean {
        return this.isActive() && this.fired && this.state !== ScopeTrigger.TRIG_STATE_AUTO_RUN;
    }

    // Returns the start index for display, accounting for trigger mode.
    displayStartIndex(plot: ScopePlot, w: number, scopePointCount: number): number {
        if (this.mode === ScopeTrigger.TRIGGER_FREERUN || !this.fired || this.state === ScopeTrigger.TRIG_STATE_AUTO_RUN)
            return plot.startIndex(w);
        // Trigger point at center of display
        return this.ptr + scopePointCount - w / 2;
    }

    // Returns the number of valid data points to display, clamped to width w.
    // In triggered mode, data beyond plot.ptr is stale (old circular buffer
    // contents) and must not be drawn or used for measurements.
    validDataCount(plot: ScopePlot, ipa: number, w: number, scopePointCount: number): number {
        if (!this.isTriggered())
            return w;
        const count = ((plot.ptr - ipa) & (scopePointCount - 1)) + 1;
        return Math.min(count, w);
    }

    dumpXml(xmlElm: Element): void {
        if (!this.isActive())
            return;
        CircuitXMLSerializer.dumpAttr(xmlElm, "triggerMode", this.mode);
        CircuitXMLSerializer.dumpAttr(xmlElm, "triggerEdge", this.edge);
        CircuitXMLSerializer.dumpAttr(xmlElm, "triggerLevel", this.level);
    }

    // Must be called before xml.parseChildElement() to ensure attrs are read from the parent element
    undumpXml(xml: CircuitXMLDeserializer): void {
        this.mode = xml.parseIntAttr("triggerMode", ScopeTrigger.TRIGGER_FREERUN);
        this.edge = xml.parseIntAttr("triggerEdge", ScopeTrigger.TRIGGER_EDGE_RISING);
        this.level = xml.parseDoubleAttr("triggerLevel", 0);
    }

    // Reset trigger state; called from Scope.resetGraph().
    reset(scopePointCount: number): void {
        this.state = ScopeTrigger.TRIG_STATE_ARMED;
        this.holdoff = 0;
        this.waiting = false;
        this.fired = false;
        this.lastCheckPtr = -1;
        this.autoTimeout = 2 * scopePointCount;
    }

    // Trigger edge detection and state machine, called every time the plot ptr advances.
    check(visiblePlots: ScopePlot[], plot2d: boolean, sim: SimulationManager, scopePointCount: number, rectWidth: number): void {
        if (this.mode === ScopeTrigger.TRIGGER_FREERUN || visiblePlots.length === 0 || plot2d)
            return;

        const plot = visiblePlots[0];
        const currentPtr = plot.ptr;

        // Only check when ptr advances (new sample point)
        if (currentPtr === this.lastCheckPtr)
            return;
        this.lastCheckPtr = currentPtr;

        const val = (plot.maxValues[currentPtr] + plot.minValues[currentPtr]) * .5;

        let edgeCrossing: boolean;
        if (this.edge === ScopeTrigger.TRIGGER_EDGE_RISING)
            edgeCrossing = this.prevValue < this.level && val >= this.level;
        else
            edgeCrossing = this.prevValue > this.level && val <= this.level;

        switch (this.state) {
        case ScopeTrigger.TRIG_STATE_ARMED:
            if (edgeCrossing) {
                this.state = ScopeTrigger.TRIG_STATE_TRIGGERED;
                this.ptr = currentPtr;
                this.time = sim.t;
                this.holdoff = 0;
                this.waiting = false;
                this.fired = true;
            } else {
                this.waiting = true;
                if (this.mode === ScopeTrigger.TRIGGER_AUTO) {
                    this.holdoff++;
                    if (this.holdoff >= this.autoTimeout) {
                        this.state = ScopeTrigger.TRIG_STATE_AUTO_RUN;
                        this.waiting = false;
                    }
                }
            }
            break;

        case ScopeTrigger.TRIG_STATE_TRIGGERED:
            this.holdoff++;
            if (this.holdoff >= rectWidth) {
                this.state = ScopeTrigger.TRIG_STATE_ARMED;
                this.holdoff = 0;
            }
            break;

        case ScopeTrigger.TRIG_STATE_AUTO_RUN:
            if (edgeCrossing) {
                this.state = ScopeTrigger.TRIG_STATE_TRIGGERED;
                this.ptr = currentPtr;
                this.time = sim.t;
                this.holdoff = 0;
                this.fired = true;
            }
            break;
        }

        this.prevValue = val;
    }

    // Draw trigger indicator: dashed level line, edge arrow, and status text
    drawIndicator(g: Graphics, visiblePlots: ScopePlot[], rect: Rectangle): void {
        if (this.mode === ScopeTrigger.TRIGGER_FREERUN || visiblePlots.length === 0)
            return;

        const plot = visiblePlots[0];
        const maxy = Math.trunc((rect.height - 1) / 2);

        // Calculate y position of trigger level line
        const trigY = maxy - Math.trunc((this.level + plot.plotOffset) * plot.gridMult);

        // Draw trigger level line (dashed, orange)
        if (trigY >= 0 && trigY < rect.height) {
            g.setColor("#FF8000");
            for (let x = 0; x < rect.width; x += 8) {
                const x2 = Math.min(x + 4, rect.width - 1);
                g.drawLine(x, trigY, x2, trigY);
            }

            // Draw edge indicator
            const edgeText = this.edge === ScopeTrigger.TRIGGER_EDGE_RISING ? "T↑" : "T↓";
            g.drawString(edgeText, rect.width - 25, trigY - 3);
        }

        // Draw trigger status text
        let statusText: string;
        switch (this.state) {
        case ScopeTrigger.TRIG_STATE_ARMED:
            statusText = this.waiting ? "WAIT" : "ARMED";
            break;
        case ScopeTrigger.TRIG_STATE_TRIGGERED:
            statusText = "TRIG";
            break;
        case ScopeTrigger.TRIG_STATE_AUTO_RUN:
            statusText = "AUTO";
            break;
        default:
            statusText = "";
        }
        g.setColor("#FF8000");
        const sw = Math.trunc(g.measureWidth(statusText));
        g.drawString(statusText, rect.width - sw - 5, rect.height - 5);
    }
}
