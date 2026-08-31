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

import { VoltageElm } from "./VoltageElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { FindPathInfo } from "./FindPathInfo";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";
import { WireRouter } from "./WireRouter";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import { customChipStart } from "./digital/chip_desc";
import type { ChipDesc } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";
import { clockLogic } from "./digital/clockChip";
import { TIMESCALE } from "./digital/constants";

export class RailElm extends VoltageElm {
    // Two RailElm waveforms are digital sources: a square-wave clock rail (ClockElm; see
    // isDigitalClock()) becomes a real periodic source, and a DC rail (a +5V/VCC or 0V/GND tie -
    // extremely common in real digital circuits) becomes a constant source (see digitalTie()).
    // Other waveforms (variable/sine/etc., analog sources) aren't part of the digital-only
    // version - isDigitalSource() below reflects that.
    isDigitalClock(): boolean {
        return this.waveform === VoltageElm.WF_SQUARE && (this.flags & this.FLAG_CLOCK) !== 0;
    }

    isDigitalConstant(): boolean {
        return this.waveform === VoltageElm.WF_DC;
    }

    isDigitalSource(): boolean {
        return this.isDigitalClock() || this.isDigitalConstant();
    }

    /** The analog voltage syncDigitalToNodes() should write back for a
     * given boolean state - duck-typed alongside LogicInputElm's own
     * version (any isRailSourceLike() element needs one), rather than that
     * function special-casing RailElm's own bias/maxVoltage/getVoltage()
     * fields directly. */
    getDigitalVoltage(v: boolean): number {
        if (this.isDigitalClock())
            // bias +/- maxVoltage, not getVoltage(): getVoltage() is
            // time-dependent (reads CircuitElm.sim.t) for a square/AC
            // waveform, which this path doesn't keep advancing.
            return v ? this.bias + this.maxVoltage : this.bias - this.maxVoltage;
        // DC rail: getVoltage() is safe here (see initDigitalSource()'s
        // comment) - just reflects its fixed configured voltage.
        return v ? this.getVoltage() : 0;
    }

    /** Phase 2 (see noble-stirring-rabin.md): a DC tie binds straight to Circuit's shared
     * _VCC/_GND sentinel chips (see DigitalGraphBuilder.ts's DigitalTieSource) instead of
     * synthesizing its own chip - checked before digitalSynthesis() below, so a DC rail never
     * reaches it. getVoltage() is safe to call here for the same reason
     * initDigitalSource()'s DC branch already relies on: it's not time-dependent for WF_DC. */
    digitalTie(): "VCC" | "GND" | null {
        if (!this.isDigitalConstant()) return null;
        return this.getVoltage() > 0 ? "VCC" : "GND";
    }

    /** Phase 2 (see noble-stirring-rabin.md): a clock rail becomes a per-instance CUSTOM_CHIP
     * built around clockChip.ts's clockLogic() - a direct port of dice-ts's own chips/clock.ts,
     * replacing the old initDigitalSource()'s hand-rolled Cycle/outputEvents setup. delay (real
     * seconds) is TIMESCALE-converted to ticks by Chip's own constructor - unlike a gate's
     * propagationDelay, though, a clock's half-period must never round down to 0 ticks (that
     * degenerates to a zero-length cycle - an infinite loop, since the chip never advances
     * globalTime). The old initDigitalSource() guarded this the same way
     * (`Math.max(1, Math.round(...))`); reproduced here in real-seconds terms so Chip's own
     * seconds->ticks conversion still owns the actual rounding. */
    digitalSynthesis(): DigitalSynthesis | null {
        if (!this.isDigitalClock()) return null;
        const halfPeriodTicks = Math.max(1, Math.round(1 / (2 * this.frequency * TIMESCALE)));
        const halfPeriod = halfPeriodTicks * TIMESCALE; // seconds - an exact multiple, so Chip's own trunc() below recovers halfPeriodTicks exactly
        const desc: ChipDesc[] = [customChipStart(clockLogic).outputDelayS(halfPeriod, halfPeriod).outputPin(1)];
        return { desc, pinMap: new Map([[0, 1]]) };
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        if (this.isDigitalSource())
            appendInfoLine(arr, "opt: " + digitalStateTextForOutput(this, 0));
    }

    constructor(xx: number, yy: number);
    constructor(xx: number, yy: number, wf: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xbOrWf?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (yb === undefined) {
            super(xa, ya, xbOrWf ?? VoltageElm.WF_DC);
        } else {
            super(xa, ya, xbOrWf!, yb, f!, st!);
        }
    }

    isRailElm(): boolean { return true; }
    // unlike other VoltageElm subclasses, RailElm can be placed either horizontally or
    // vertically via toolbar drag-and-drop, so this undoes VoltageElm's forced-vertical override
    getDragVertical(requestedVertical: boolean): boolean {
        return requestedVertical;
    }
    readonly FLAG_CLOCK = 1;
    getDumpType(): number { return 'R'.charCodeAt(0); }
    getPostCount(): number { return 1; }

    setPoints(): void {
        super.setPoints();
        this.lead1 = this.interpPoint(this.point1, this.point2, 1-this.circleSize/this.dn);
    }

    getRailText(): string | null {
        return null;
    }

    draw(g: Graphics): void {
        const rt = this.getRailText();
        let w = rt == null ? this.circleSize : g.context.measureText(rt).width/2;
        if (w > this.dn*.8)
            w = this.dn*.8;
        this.lead1 = this.interpPoint(this.point1, this.point2, 1-w/this.dn);
        this.setBbox(this.point1, this.point2, this.circleSize);
        this.setVoltageColor(g, this.nodes[0].v);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawRail(g);
        this.drawPosts(g);
        this.curcount = this.updateDotCountImpl(-this.current, this.curcount);
        if (!this.isCreating())
            this.drawDots(g, this.point1, this.lead1!, this.curcount);
    }

    drawRail(g: Graphics): void {
        if (this.waveform == VoltageElm.WF_SQUARE && (this.flags & this.FLAG_CLOCK) != 0)
            this.drawRailText(g, "CLK");
        else if (this.waveform == VoltageElm.WF_DC || this.waveform == VoltageElm.WF_VAR) {
            g.setColor(this.needsHighlight() ? RailElm.selectColor : RailElm.whiteColor);
            this.setPowerColor(g, false);
            const v = this.getVoltage();
            let s: string;
            if (Math.abs(v) < 1)
                s = CircuitElm.showFormat.format(v)+" V";
            else
                s = CircuitElm.getShortUnitText(v, "V");
            if (this.getVoltage() > 0)
                s = "+" + s;
            this.drawLabeledNode(g, s, this.point1, this.lead1!);
        } else {
            this.drawWaveform(g, this.point2);
        }
    }

    drawRailText(g: Graphics, s: string): void {
        g.setColor(this.needsHighlight() ? RailElm.selectColor : RailElm.whiteColor);
        this.setPowerColor(g, false);
        this.drawLabeledNode(g, s, this.point1, this.lead1!);
    }

    getVoltageDiff(): number { return this.nodes[0].v; }
    setVoltageSource(n: number, v: any): void {
        super.setVoltageSource(n, v);
        if (this.internalResistance > 0)
            v.setNodes(CircuitNode.ground, this.nodes[1]);
        else
            v.setNodes(CircuitNode.ground, this.nodes[0]);
    }
    stamp(): void {
        const vsNode = this.internalResistance > 0 ? this.nodes[1] : this.nodes[0];
        if (this.waveform == VoltageElm.WF_DC)
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, vsNode, this.voltSource, this.getVoltage());
        else
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, vsNode, this.voltSource);
        if (this.internalResistance > 0)
            CircuitElm.sim.stampResistor(this.nodes[1], this.nodes[0], this.internalResistance);
    }
    doStep(): void {
        const vsNode = this.internalResistance > 0 ? this.nodes[1] : this.nodes[0];
        if (this.waveform != VoltageElm.WF_DC)
            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, vsNode, this.voltSource, this.getVoltage());
    }
    hasGroundConnection(n1: number): boolean { return true; }
    addRoutingObstacle(router: WireRouter): void {
        router.addWire(this.point1.x, this.point1.y, this.point2.x, this.point2.y);
        router.addObstacle(this.point2.x - this.circleSize, this.point2.y - this.circleSize,
                           this.point2.x + this.circleSize, this.point2.y + this.circleSize);
    }

    getShortcut(): number { return 'V'.charCodeAt(0); }
    validateRailNode(n: number): boolean {
        const fpi = new FindPathInfo(FindPathInfo.VOLTAGE, this, this.getNode(n), CircuitElm.sim);
        if (fpi.findPath(CircuitNode.ground)) {
            //CircuitElm.sim.stop("Path to ground with no resistance!", this);
            this.internalResistance = .001;
            return false;
        }
        return true;
    }
    validate(): boolean { return this.internalResistance > 0 || this.validateRailNode(0); }

//    void drawHandles(Graphics g, Color c) {
//    	g.setColor(c);
//		g.fillRect(x-3, y-3, 7, 7);
//    }
}
