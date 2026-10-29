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

    // How close (in pixels) the mouse has to be to the level line to drag it
    static readonly GRAB_DISTANCE = 4;

    // Configuration
    mode: number = ScopeTrigger.TRIGGER_FREERUN;
    edge: number = ScopeTrigger.TRIGGER_EDGE_RISING;
    level: number = 0;
    // index into the scope's plots of the plot to trigger on; if that plot isn't visible, the
    // first visible plot is used instead (see sourcePlot())
    source: number = 0;

    // State machine
    state: number = ScopeTrigger.TRIG_STATE_ARMED;
    // Trigger column and time of the sweep being DISPLAYED. That stays the previous (frozen)
    // sweep until the one being captured (capPtr/capTime) is complete - see check().
    ptr: number = 0;
    capPtr: number = 0;
    capTime: number = 0;
    // Whether the current capture has been completed and frozen yet
    captured: boolean = false;
    // Whether the visible plots hold a frozen snapshot of a complete sweep (see ScopePlot.freeze())
    frozen: boolean = false;
    prevValue: number = 0;
    holdoff: number = 0;
    autoTimeout: number = 0;
    waiting: boolean = false;
    time: number = 0;
    fired: boolean = false;
    lastCheckPtr: number = -1;
    // wall-clock time (ms) the display last switched to a new sweep, to flash the status text
    lastSweepShown: number = -Infinity;

    // How long (ms) the status text flashes when a new sweep is shown
    static readonly FLASH_TIME = 150;

    // The plot the trigger watches, or null if nothing is visible
    sourcePlot(plots: ScopePlot[], visiblePlots: ScopePlot[]): ScopePlot | null {
        const p = plots[this.source];
        if (p !== undefined && visiblePlots.includes(p))
            return p;
        return visiblePlots.length > 0 ? visiblePlots[0] : null;
    }

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
        if (!this.isTriggered() || this.frozen)
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
        if (this.source !== 0)
            CircuitXMLSerializer.dumpAttr(xmlElm, "triggerSource", this.source);
    }

    // Must be called before xml.parseChildElement() to ensure attrs are read from the parent element
    undumpXml(xml: CircuitXMLDeserializer): void {
        this.mode = xml.parseIntAttr("triggerMode", ScopeTrigger.TRIGGER_FREERUN);
        this.edge = xml.parseIntAttr("triggerEdge", ScopeTrigger.TRIGGER_EDGE_RISING);
        this.level = xml.parseDoubleAttr("triggerLevel", 0);
        this.source = xml.parseIntAttr("triggerSource", 0);
    }

    // Reset trigger state; called from Scope.resetGraph().
    reset(scopePointCount: number): void {
        this.state = ScopeTrigger.TRIG_STATE_ARMED;
        this.holdoff = 0;
        this.waiting = false;
        this.fired = false;
        this.lastCheckPtr = -1;
        // the plots' own reset() has already dropped their snapshots
        this.frozen = false;
        this.autoTimeout = 2 * scopePointCount;
    }

    // Trigger edge detection and state machine, called every time the plot ptr advances.
    check(visiblePlots: ScopePlot[], plot: ScopePlot | null, plot2d: boolean, sim: SimulationManager, scopePointCount: number, rectWidth: number): void {
        if (this.mode === ScopeTrigger.TRIGGER_FREERUN || plot === null || plot2d)
            return;

        const currentPtr = plot.ptr;

        // Only check when ptr advances (new sample point)
        if (currentPtr === this.lastCheckPtr)
            return;
        this.lastCheckPtr = currentPtr;

        const val = (plot.liveMax[currentPtr] + plot.liveMin[currentPtr]) * .5;

        let edgeCrossing: boolean;
        if (this.edge === ScopeTrigger.TRIGGER_EDGE_RISING)
            edgeCrossing = this.prevValue < this.level && val >= this.level;
        else
            edgeCrossing = this.prevValue > this.level && val <= this.level;

        switch (this.state) {
        case ScopeTrigger.TRIG_STATE_ARMED:
            if (edgeCrossing) {
                this.startCapture(currentPtr, sim.t);
                this.waiting = false;
            } else {
                this.waiting = true;
                if (this.mode === ScopeTrigger.TRIGGER_AUTO) {
                    this.holdoff++;
                    if (this.holdoff >= this.autoTimeout) {
                        this.state = ScopeTrigger.TRIG_STATE_AUTO_RUN;
                        this.waiting = false;
                        this.thaw(visiblePlots);
                    }
                }
            }
            break;

        case ScopeTrigger.TRIG_STATE_TRIGGERED:
            this.holdoff++;
            // Sweep fully captured: replace the displayed snapshot with it, so it stays on screen
            // until the next one is complete.
            if (this.holdoff >= Math.floor(rectWidth / 2) && !this.captured) {
                for (const p of visiblePlots)
                    p.freeze();
                this.frozen = this.captured = true;
                this.ptr = this.capPtr;
                this.time = this.capTime;
                this.lastSweepShown = performance.now();
            }
            if (this.holdoff >= rectWidth) {
                this.state = ScopeTrigger.TRIG_STATE_ARMED;
                this.holdoff = 0;
            }
            break;

        case ScopeTrigger.TRIG_STATE_AUTO_RUN:
            if (edgeCrossing)
                this.startCapture(currentPtr, sim.t);
            break;
        }

        this.prevValue = val;
    }

    private startCapture(ptr: number, time: number): void {
        this.state = ScopeTrigger.TRIG_STATE_TRIGGERED;
        this.capPtr = ptr;
        this.capTime = time;
        this.captured = false;
        this.holdoff = 0;
        // With nothing frozen (first sweep, or coming out of auto free-run), show this one live
        // as it fills in; otherwise keep showing the last complete sweep until this one is done.
        if (!this.frozen) {
            this.ptr = ptr;
            this.time = time;
            this.lastSweepShown = performance.now();
        }
        this.fired = true;
    }

    private thaw(plots: ScopePlot[]): void {
        for (const p of plots)
            p.thaw();
        this.frozen = false;
    }

    // y of the trigger level line, in pixels from the top of the scope
    levelY(plot: ScopePlot, rect: Rectangle): number {
        const maxy = Math.trunc((rect.height - 1) / 2);
        return maxy - Math.trunc((this.level + plot.plotOffset) * plot.gridMult);
    }

    // Whether y (pixels from the top of the scope) is close enough to the level line to grab it
    nearLevel(plot: ScopePlot | null, rect: Rectangle, y: number): boolean {
        if (!this.isActive() || plot === null || plot.gridMult === 0)
            return false;
        return Math.abs(y - this.levelY(plot, rect)) <= ScopeTrigger.GRAB_DISTANCE;
    }

    // Set the level to the value at y (pixels from the top of the scope), rounded to a power of
    // ten no bigger than one pixel's worth so dragged levels come out as tidy numbers
    setLevelFromY(plot: ScopePlot | null, rect: Rectangle, y: number): void {
        if (plot === null || plot.gridMult === 0)
            return;
        const maxy = Math.trunc((rect.height - 1) / 2);
        const step = Math.pow(10, Math.floor(Math.log10(1 / plot.gridMult)));
        this.level = Math.round(((maxy - y) / plot.gridMult - plot.plotOffset) / step) * step;
    }

    // Draw trigger indicator: dashed level line, edge arrow, and status text.  highlight means the
    // level line is being dragged or the mouse is near enough to grab it.
    drawIndicator(g: Graphics, plot: ScopePlot | null, rect: Rectangle, highlight: boolean): void {
        if (this.mode === ScopeTrigger.TRIGGER_FREERUN || plot === null)
            return;

        const trigY = this.levelY(plot, rect);

        // Draw trigger level line (orange; dashed, or solid with its value when highlighted)
        if (trigY >= 0 && trigY < rect.height) {
            g.setColor("#FF8000");
            if (highlight) {
                g.drawLine(0, trigY - 1, rect.width - 1, trigY - 1);
                g.drawLine(0, trigY, rect.width - 1, trigY);
            } else {
                for (let x = 0; x < rect.width; x += 8) {
                    const x2 = Math.min(x + 4, rect.width - 1);
                    g.drawLine(x, trigY, x2, trigY);
                }
            }

            // Draw edge indicator
            let edgeText = this.edge === ScopeTrigger.TRIGGER_EDGE_RISING ? "T↑" : "T↓";
            if (highlight)
                edgeText += " " + plot.getUnitText(this.level);
            const ew = Math.trunc(g.measureWidth(edgeText));
            g.drawString(edgeText, rect.width - ew - 5, trigY - 3);
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
        // flash the status text when a new sweep is shown, since the display otherwise gives no
        // sign that a sweep identical to the last one has come in
        const sw = Math.trunc(g.measureWidth(statusText));
        g.setColor("#FF8000");
        if (performance.now() - this.lastSweepShown < ScopeTrigger.FLASH_TIME) {
            g.fillRect(rect.width - sw - 7, rect.height - 17, sw + 4, 15);
            g.setColor("#000000");
        }
        g.drawString(statusText, rect.width - sw - 5, rect.height - 5);
    }
}
