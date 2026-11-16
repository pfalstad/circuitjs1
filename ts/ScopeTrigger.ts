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
import type { EngineChip } from "./digital/engine";

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
    // How long (ms) the status text flashes when a new sweep is shown
    static readonly FLASH_TIME = 150;

    // Configuration
    mode: number = ScopeTrigger.TRIGGER_FREERUN;
    edge: number = ScopeTrigger.TRIGGER_EDGE_RISING;
    level: number = 0;
    // index into the scope's plots of the plot to trigger on; if that plot isn't visible, the
    // first visible plot is used instead (see sourcePlot())
    source: number = 0;

    // State machine
    state: number = ScopeTrigger.TRIG_STATE_ARMED;
    waiting: boolean = false;
    // The sweep being displayed: its trigger column in the frozen snapshot (see
    // ScopePlot.freezeFromHistory()) and the sim time at the start of that column.
    ptr: number = 0;
    time: number = 0;
    // Whether a sweep has been captured and is being displayed
    fired: boolean = false;
    // Edge being captured while TRIGGERED, in the chip's own ticks
    capTick: number = 0;
    // Edges at or before this tick have already been dealt with
    scanTick: number = 0;
    // Tick of the last capture (or of arming), for the auto-mode timeout
    lastTrigTick: number = 0;
    lastCheckTick: number = -1;
    // Chip being scanned; ticks restart whenever the digital graph is rebuilt, so a new chip
    // means starting over.
    chip: EngineChip | null = null;
    autoTimeout: number = 0;
    // wall-clock time (ms) the display last switched to a new sweep, to flash the status text
    lastSweepShown: number = -Infinity;

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
        return this.isActive() && this.fired;
    }

    // Returns the start index for display, accounting for trigger mode.
    displayStartIndex(plot: ScopePlot, w: number, scopePointCount: number): number {
        if (!this.isTriggered())
            return plot.startIndex(w);
        // Trigger point at center of display
        return this.ptr + scopePointCount - w / 2;
    }

    // Returns the number of valid data points to display, clamped to width w. A triggered sweep
    // is only ever shown once it's been fully captured, so this is always the full width.
    validDataCount(plot: ScopePlot, ipa: number, w: number, scopePointCount: number): number {
        return w;
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

    // Reset trigger state; called from Scope.resetGraph(), after the plots' own reset() has
    // dropped their snapshots.
    reset(scopePointCount: number): void {
        this.state = ScopeTrigger.TRIG_STATE_ARMED;
        this.waiting = false;
        this.fired = false;
        this.chip = null;
        this.lastCheckTick = -1;
        this.autoTimeout = 2 * scopePointCount;
    }

    // Trigger edge detection and state machine, called from Scope.draw() after the plots have
    // been brought up to date from their chips' history (see ScopePlot.fillFromDigitalHistory()).
    //
    // Edges are found in the first plot's chip `history` rather than in the column buffer: a
    // frame can cover more ticks than the whole buffer holds (fillFromDigitalHistory() then
    // cold-starts it), so columns can be skipped entirely, but history never is. Likewise the
    // displayed sweep is built from history (ScopePlot.freezeFromHistory()) once the sim has run
    // half a screen past the edge, rather than copied from a buffer that may never have held it.
    //
    // `plot` is the trigger source (see sourcePlot()); every visible plot is captured.
    check(visiblePlots: ScopePlot[], plot: ScopePlot | null, plot2d: boolean, sim: SimulationManager, scopePointCount: number, rectWidth: number): void {
        if (this.mode === ScopeTrigger.TRIGGER_FREERUN || plot === null || plot2d)
            return;

        const chip = plot.digitalChip;
        const now = plot.digitalFillTick;
        const sp = plot.scopePlotSpeed;
        if (chip === null || now < 0 || sp <= 0 || now === this.lastCheckTick)
            return;
        this.lastCheckTick = now;
        if (chip !== this.chip) {
            this.chip = chip;
            this.scanTick = this.lastTrigTick = now;
            if (this.state === ScopeTrigger.TRIG_STATE_TRIGGERED)
                this.state = ScopeTrigger.TRIG_STATE_ARMED;
        }

        // Columns sit on the same absolute grid fillFromDigitalHistory() uses.
        const epoch = (sim as any).digitalTickEpoch ?? 0;
        const colStart = (t: number) => Math.floor((t + epoch) / sp) * sp - epoch;
        const half = Math.ceil(rectWidth / 2);
        // A snapshot covers half + 1 columns either side of the trigger column, a little more
        // than the display needs, so odd widths round safely.
        const capStart = (t: number) => colStart(t) - (half + 1) * sp;
        const capEnd = (t: number) => colStart(t) + (half + 2) * sp;
        const hist = chip.history;
        const want = this.edge === ScopeTrigger.TRIGGER_EDGE_RISING ? 1 : 0;

        const capture = (edge: number) => {
            const P = scopePointCount / 2;
            for (const p of visiblePlots)
                p.freezeFromHistory(capStart(edge), P - half - 1, 2 * half + 3);
            this.ptr = P;
            this.time = sim.t - (chip.circuit.globalTime - colStart(edge)) * sim.maxTimeStep;
            this.fired = true;
            this.lastSweepShown = performance.now();
            this.lastTrigTick = edge;
            // Edges still on screen don't trigger another sweep.
            this.scanTick = Math.max(this.scanTick, colStart(edge) + half * sp);
            this.state = ScopeTrigger.TRIG_STATE_ARMED;
        };
        // index of the first history entry after tick t
        const after = (t: number) => {
            let lo = 0, hi = hist.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (hist[mid].time <= t) lo = mid + 1; else hi = mid;
            }
            return lo;
        };

        if (this.state === ScopeTrigger.TRIG_STATE_TRIGGERED) {
            if (capEnd(this.capTick) > now) {
                this.setFloor(visiblePlots, capStart(this.capTick));
                return;
            }
            capture(this.capTick);
        }

        // The latest edge since scanTick whose sweep is already complete (if a frame covered
        // several, showing the most recent one is what a real scope would end up doing). history
        // only records toggles, so a matching edge is at most one entry back.
        const first = after(this.scanTick);
        let lo = first, hi = after(now);
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (capEnd(hist[mid].time) <= now) lo = mid + 1; else hi = mid;
        }
        let i = lo - 1;
        if (i >= first && hist[i].value !== want)
            i--;
        if (i >= first)
            capture(hist[i].time);

        // Then the next edge, whose sweep is still coming in.
        let j = after(this.scanTick);
        if (j < hist.length && hist[j].value !== want)
            j++;
        if (j < hist.length && hist[j].time <= now) {
            this.state = ScopeTrigger.TRIG_STATE_TRIGGERED;
            this.capTick = hist[j].time;
            this.waiting = false;
            this.setFloor(visiblePlots, capStart(this.capTick));
            return;
        }
        this.scanTick = Math.max(this.scanTick, now);

        if (this.state === ScopeTrigger.TRIG_STATE_ARMED) {
            this.waiting = true;
            if (this.mode === ScopeTrigger.TRIGGER_AUTO && now - this.lastTrigTick >= this.autoTimeout * sp) {
                this.state = ScopeTrigger.TRIG_STATE_AUTO_RUN;
                this.waiting = false;
                this.fired = false;
                for (const p of visiblePlots)
                    p.thaw();
            }
        }
        // A future edge's sweep starts half a screen before it.
        this.setFloor(visiblePlots, capStart(now));
    }

    // Keeps the history a pending capture will need from being trimmed.
    private setFloor(plots: ScopePlot[], tick: number): void {
        for (const p of plots)
            p.triggerFloor = Math.max(0, tick);
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
