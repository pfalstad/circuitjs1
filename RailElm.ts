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
import { phasedClockLogic } from "./digital/clockChip";
import { TIMESCALE } from "./digital/constants";
import { ChipState } from "./digital/chip";
import type { Chip } from "./digital/chip";

export class RailElm extends VoltageElm {
    // Two RailElm waveforms are digital sources: a square-wave rail (any WF_SQUARE RailElm, not
    // just one FLAG_CLOCK-labeled like ClockElm - FLAG_CLOCK only ever controlled the "CLK" label
    // drawn in drawRail() below, so a plain square-wave source used as a rail is just as valid a
    // digital driver) becomes a real periodic source, and a DC rail (a +5V/VCC or 0V/GND tie -
    // extremely common in real digital circuits) becomes a constant source (see digitalTie()).
    // Other waveforms (variable/sine/etc., analog sources) aren't part of the digital-only
    // version - isDigitalSource() below reflects that.
    isDigitalClock(): boolean {
        return this.waveform === VoltageElm.WF_SQUARE;
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

    /** Phase 2 (see noble-stirring-rabin.md), extended for duty cycle and phase offset: a clock
     * rail becomes a per-instance CUSTOM_CHIP built around clockChip.ts's phasedClockLogic() - a
     * parameterized variant of the verbatim-ported dice-ts clockLogic(), replacing the old
     * initDigitalSource()'s hand-rolled Cycle/outputEvents setup. Durations (real seconds) are
     * TIMESCALE-converted to ticks here (not left to Chip's own constructor flooring, unlike a
     * gate's propagationDelay) because low/high each need their OWN independent >=1-tick floor:
     * either duration rounding down to 0 ticks degenerates that phase into a zero-length cycle -
     * an infinite loop, since the chip never advances globalTime. The old initDigitalSource()
     * guarded the (then always-equal) half-periods the same way; done per-phase here so an
     * extreme duty cycle (e.g. 99%) can't let the SHORT phase round away to nothing while the
     * long phase still has headroom.
     *
     * `phaseShift`=0 reproduces the engine's long-standing digital-clock convention exactly
     * (unaffected by `dutyCycle`): the rail starts in its LOW phase and its first edge is a rise
     * at the low-duration mark - this is a deliberate CHOICE of reference point, not a derivation
     * from VoltageElm's own analog square-wave formula (whose phase=0 instead reads HIGH at t=0 -
     * see getVoltage()'s WF_SQUARE case), made specifically so every existing circuit and test
     * built against the old always-phase-0 clock keeps behaving identically; increasing
     * `phaseShift` (radians, same units VoltageElm's own edit field already uses) ADVANCES that
     * first rise - makes it happen SOONER, wrapping every 2*pi - matching VoltageElm's own
     * sin/square(w*t + phaseShift) convention (getVoltage()'s `w`), where a larger phaseShift
     * reaches any given point of the waveform at an earlier `t` (y(t) = f(w*t+phase) is f(w*t)
     * shifted left by phase/w). Not "delayed" despite the intuitive reading of "phase shift".
     *
     * Only the very FIRST scheduled toggle's delay can be freely chosen without corrupting every
     * later period's duty cycle (Cycle.nextOutputEventDelay()'s cyclic formula in chip.ts derives
     * every SUBSEQUENT delay from the stored outputEvents/cycleTime alone, never from how long the
     * engine actually waited for the first one) - so a phase offset landing in the rail's HIGH
     * portion is represented by BIRTHING the chip high (ChipDesc.initOutput) with that first
     * toggle being the fall, rather than by faking a low start. The chip used to always start at
     * 0, which made "high right now" unrepresentable and cost a falling edge every time a rail was
     * primed mid-cycle - harmless at t=0 (where the convention above puts us in the low portion
     * anyway), but not on the mid-run re-priming any circuit edit performs. (An earlier version
     * instead used an inverted internal signal plus a combinational NOT - reverted: every real
     * chip-to-chip link carries a mandatory >=1-tick propagation floor (see the Chip constructor's
     * own comment on why same-tick races are disallowed), so that extra cell would measurably
     * shift this rail's edges by a tick versus a direct one. Being born at the right value costs
     * nothing and shifts nothing.)
     */
    /** Tick-domain layout shared by digitalSynthesis() (priming a brand-new chip) and
     * retimePhase() (live): high/low/period durations in ticks, plus which side of the cycle the
     * reference instant `nowTicks` falls on and how many ticks until the next edge. `nowTicks`
     * (absolute simulator ticks - i.e. Circuit.globalTime + SimulationManager.digitalTickEpoch,
     * default 0) folds elapsed time into the phase angle exactly like VoltageElm.getVoltage()'s
     * own `w` - without it, a live retimePhase() call would judge high/low from `phaseShift`
     * alone and could truncate an already-in-progress pulse, and a mid-run digitalSynthesis()
     * would restart the rail's cycle wherever the rebuild happened to land. */
    private static phaseLayout(period: number, dutyCycle: number, phaseShift: number, nowTicks: number = 0):
            { highTicks: number, lowTicks: number, periodTicks: number,
              startsHigh: boolean, edgeDelay: number } {
        const twoPi = 2 * Math.PI;
        const highTicks = Math.max(1, Math.round(period * dutyCycle / TIMESCALE));
        const lowTicks = Math.max(1, Math.round(period * (1 - dutyCycle) / TIMESCALE));
        const periodTicks = lowTicks + highTicks;

        // This rail's own phase layout (deliberately LOW-phase-first - see digitalSynthesis()'s
        // docstring, NOT VoltageElm's HIGH-phase-first analog convention): [0, lowAngle) is low,
        // [lowAngle, 2pi) is high, and the rise happens at lowAngle. `w` (see this method's own
        // docstring) is the CURRENT angle on that circle, not just the caller's raw phaseShift.
        //
        // Elapsed time is folded in on the TICK grid (nowTicks/periodTicks), NOT as
        // nowSeconds/period: periodTicks is the whole-tick period this chip actually toggles on,
        // and it differs from the nominal `period` by up to half a tick per cycle. That rounding
        // is irrelevant over one cycle but accumulates - over the millions of cycles `nowTicks`
        // can span, a seconds-based angle ends up somewhere completely unrelated to where this
        // rail's edges really are. Reduced mod periodTicks before dividing, so precision doesn't
        // depend on how long the simulation has been running.
        const w = (twoPi * ((nowTicks % periodTicks) / periodTicks)) + phaseShift;
        const wm = ((w % twoPi) + twoPi) % twoPi;
        // From the TICK grid (lowTicks/periodTicks), not the nominal 1-dutyCycle: those two
        // differ by up to half a tick once low/high are rounded independently, and the rise this
        // returns has to land on the grid the chip really toggles on - otherwise the first rise
        // after a mid-run rebuild can come out a tick off from where the rail's existing edges
        // are, varying with the rebuild instant. It also makes the phaseShift=0 case exactly
        // `lowTicks`, as this method's docstring has always claimed.
        const lowAngle = twoPi * (lowTicks / periodTicks);
        // The epsilon is pure float-noise tolerance, orders of magnitude below one tick's worth
        // of angle (2pi/periodTicks): a reference instant landing exactly ON the rise (wm ===
        // lowAngle, e.g. a rebuild on a clock edge) must take the high branch. Falling to the low
        // branch instead computes a zero delay, which the >=1-tick clamp below then turns into a
        // rise one tick late - the one case that otherwise breaks this method's "same absolute
        // grid regardless of reference instant" guarantee.
        const highAtReference = wm >= lowAngle - 1e-9;

        // Ticks from the reference instant to the NEXT real edge in whichever direction is due:
        // a fall if we're in the high portion, a rise otherwise. Both callers prime a chip that
        // is ALREADY at `highAtReference`'s level (digitalSynthesis() via ChipDesc.initOutput,
        // retimePhase() by writing chip.output), so this is the whole answer - there's no need to
        // misrepresent the instant as low and pad out an extra low portion to reach a rise.
        //
        // Neither delay is clamped up to 1 tick, which would put this edge - and, since the cycle
        // self-perpetuates from it, every edge after it - permanently a tick off the grid the
        // rail was already running on. A delay rounding to 0 means the reference instant is
        // sitting within half a tick of the edge itself, so take the edge as already done and go
        // to the one after it: from the high portion that means starting low with a rise due in
        // `lowTicks`, and from the low portion a rise a whole period later. Both stay on grid.
        const rawDelay = !highAtReference
            ? Math.round((lowAngle - wm) / twoPi * periodTicks)
            : Math.round((twoPi - wm) / twoPi * periodTicks);
        const atEdge = rawDelay < 1;
        const startsHigh = atEdge ? false : highAtReference;
        const edgeDelay = !atEdge ? rawDelay : (highAtReference ? lowTicks : periodTicks);

        return { highTicks: highTicks, lowTicks: lowTicks, periodTicks: periodTicks,
                 startsHigh, edgeDelay };
    }

    digitalSynthesis(): DigitalSynthesis | null {
        if (!this.isDigitalClock()) return null;
        const dutyCycle = this.dutyCycle ?? 0.5;
        const phaseShift = this.phaseShift ?? 0;
        const period = 1 / this.frequency; // seconds
        // The graph being built starts its own clock at globalTime 0, but the simulation itself
        // may be far past t=0: ANY circuit edit rebuilds the graph mid-run (see
        // SimulationManager.digitalTickEpoch). Priming from `phaseShift` alone, as though this
        // instant were t=0, restarts the rail's cycle at whatever point of its period the edit
        // happened to land on - shifting every downstream edge, and with it anything clocked off
        // this rail (a video timing chain's whole picture), by up to a period per edit. Those
        // shifts are individually small and strictly cumulative: edit enough times and the
        // picture walks away. Anchoring on absolute ticks instead puts the first edge back on the
        // same grid the rail was already running on, so a rebuild is invisible downstream.
        const startTick = CircuitElm.sim?.digitalTickEpoch ?? 0;
        const { highTicks, lowTicks, startsHigh, edgeDelay } =
            RailElm.phaseLayout(period, dutyCycle, phaseShift, startTick);

        // Born at the level this rail is REALLY at right now (ChipDesc.initOutput), with the
        // first toggle being whichever edge is genuinely next. Starting low regardless - the old
        // behavior, since a Chip's output used to always begin at 0 - silently swallows the fall
        // that was still to come whenever a rebuild lands in the high portion of the cycle: the
        // level is simply never high, so nothing downstream ever sees it end. Rising-edge logic
        // doesn't notice, but every falling-edge consumer (a ripple counter, a JK flip-flop)
        // loses exactly one count per edit - which is a picture that walks a little further every
        // time the circuit is touched, and never walks back.
        const desc: ChipDesc[] = [
            customChipStart(phasedClockLogic(edgeDelay))
                .initialOutput(startsHigh ? 1 : 0)
                .outputDelayS(RailElm.ticksToSeconds(lowTicks), RailElm.ticksToSeconds(highTicks)).outputPin(1),
        ];
        return { desc, pinMap: new Map([[0, 1]]) };
    }

    // convert ticks with rounding
    private static ticksToSeconds(ticks: number): number {
        return (Number(ticks) + 0.5) * TIMESCALE;
    }

    /** Live phase/duty-cycle nudge for a running clock rail, without a full circuit re-analyze
     * (used by JSInterface.setExtClock()). Sets `chip.output`/`chip.delay` from phaseLayout()
     * (which accounts for real elapsed time, so a call mid-pulse doesn't truncate it) and
     * re-primes the next edge. Downstream links get `updateInputs()` if the value changed (a real
     * toggle) or `deactivateOutputs()` if not (wakes + re-arms for later); an ASLEEP `chip` is
     * backfilled first so `history` doesn't gap. */
    retimePhase(chip: Chip, phaseShift: number, dutyCycle?: number): void {
        this.phaseShift = phaseShift;
        if (dutyCycle !== undefined) this.dutyCycle = dutyCycle;
        if (!this.isDigitalClock()) return;
        const effectiveDutyCycle = this.dutyCycle ?? 0.5;
        const period = 1 / this.frequency;
        const now = chip.circuit.globalTime;
        if (chip.state === ChipState.ASLEEP) chip.backfillHistory(now);
        // Absolute tick this call is happening at, folded into phaseLayout()'s phase angle so
        // `edgeDelay` below answers "what does THIS rail, continuously running with `phaseShift`,
        // actually look like right now" instead of "what would phaseShift alone mean if evaluated
        // as though `now` were tick 0" - see phaseLayout()'s own docstring. Absolute (epoch
        // included), matching digitalSynthesis(), so the rail stays on one continuous phase grid
        // whether it was last primed by a rebuild or by a live retime.
        const nowTicks = Number(now) + (CircuitElm.sim?.digitalTickEpoch ?? 0);
        const { highTicks, lowTicks, startsHigh, edgeDelay } =
            RailElm.phaseLayout(period, effectiveDutyCycle, phaseShift, nowTicks);
        const oldOutput = chip.output;
        const delay = edgeDelay; // already ticks-from-`now` - see phaseLayout()'s own docstring
        chip.delay = [lowTicks, highTicks];
        chip.output = startsHigh ? 1 : 0;
        const valueChanged = chip.output !== oldOutput;
        chip.customUpdate = phasedClockLogic(delay);
        chip.initialize();
        for (const link of chip.outputLinks) {
            if (valueChanged) link.chip.updateInputs(Number(link.mask));
            else link.chip.deactivateOutputs();
        }
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        if (this.isDigitalSource() && CircuitElm.app.developerMode)
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
