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
     * A chip's `output` field always starts at 0 (a hardcoded Chip default - see
     * phasedClockLogic()'s own docstring), and only the very FIRST scheduled toggle's delay can be
     * freely chosen without corrupting every later period's duty cycle
     * (Cycle.nextOutputEventDelay()'s cyclic formula in chip.ts derives every SUBSEQUENT delay
     * from the stored outputEvents/cycleTime alone, never from how long the engine actually waited
     * for the first one) - so a phase offset landing in the rail's HIGH portion at t=0 can only be
     * represented as "reads low until that first real rise, then correct forever after," not as
     * truly high from t=0. (An earlier version used an inverted internal signal plus a
     * combinational NOT to get that initial instant exactly right - reverted: every real
     * chip-to-chip link carries a mandatory >=1-tick propagation floor (see the Chip constructor's
     * own comment on why same-tick races are disallowed), so that extra cell would measurably
     * shift this rail's edges by a tick versus a direct one - a worse tradeoff, for anything
     * downstream expecting exact edge timing, than a startup-only polarity glitch.)
     */
    /** Tick-domain layout shared by digitalSynthesis() (t=0 case, below) and retimePhase() (live
     * re-phase relative to "now" - see that method's own docstring): high/low/period durations in
     * ticks, plus how many ticks into the cycle the given `phaseShift` (radians, same convention
     * as VoltageElm's analog phase field) falls before the next rise. Split out so both call
     * sites derive the exact same grid from the same dutyCycle/frequency instead of duplicating
     * this arithmetic.
     *
     * `nowSeconds` (default 0, matching digitalSynthesis()'s build-time call) is the elapsed
     * simulator time this layout is being evaluated AT, folded into the phase angle the exact way
     * VoltageElm.getVoltage() folds elapsed time into its own analog waveform: `w = 2*pi*frequency*
     * nowSeconds + phaseShift` (compare getVoltage()'s `w = 2*pi*(t-freqTimeZero)*frequency +
     * phaseShift`). This matters for more than build time: `phaseShift` describes where the
     * EDGES should sit relative to a continuously-running reference clock, NOT "the instantaneous
     * state at the exact moment retimePhase() happens to be called" - those are only the same
     * thing at a period boundary. retimePhase() passing `nowSeconds=0` (i.e. the old
     * `wm = phaseShift mod 2pi` with no time term) would answer "is 23 degrees low or high"
     * unconditionally and force THAT verdict onto whatever real instant the call landed on - if
     * the rail had genuinely risen a moment earlier (say it's actually 183 degrees into its
     * CURRENT cycle, not the reference's own 23 degrees), that forces a real, already-in-progress
     * pulse to fall immediately, truncating it to a sliver - confirmed via a real setExtClock()
     * call landing 25.8 degrees into an actual pulse, forced low instead of correctly reading
     * high. Folding elapsed time in makes `wm` track the rail's actual real-time position
     * (mod 2pi) with `phaseShift` acting as a fixed offset on top of it - exactly how a phase
     * argument works for a live, continuously-running oscillator - while still reducing to
     * today's formula, and today's steady-state edge positions, whenever `nowSeconds` is 0 or an
     * exact multiple of the period. */
    private static phaseLayout(period: number, dutyCycle: number, phaseShift: number, nowSeconds: number = 0):
            { highTicks: bigint, lowTicks: bigint, periodTicks: bigint, initialDelay: bigint,
              highAtReference: boolean, edgeDelay: bigint } {
        const twoPi = 2 * Math.PI;
        const highTicks = Math.max(1, Math.round(period * dutyCycle / TIMESCALE));
        const lowTicks = Math.max(1, Math.round(period * (1 - dutyCycle) / TIMESCALE));
        const periodTicks = lowTicks + highTicks;

        // This rail's own phase layout (deliberately LOW-phase-first - see digitalSynthesis()'s
        // docstring, NOT VoltageElm's HIGH-phase-first analog convention): [0, lowAngle) is low,
        // [lowAngle, 2pi) is high, and the rise happens at lowAngle. `w` (see this method's own
        // docstring) is the CURRENT angle on that circle, not just the caller's raw phaseShift.
        const w = (twoPi * nowSeconds / period) + phaseShift;
        const wm = ((w % twoPi) + twoPi) % twoPi;
        const lowAngle = twoPi * (1 - dutyCycle);
        const highAtReference = wm >= lowAngle;

        // Ticks from the reference instant until the first real rise: if phase places us in the
        // low portion, that's just the remaining low time (at phaseShift=0 this is exactly
        // `lowTicks`, matching the engine's old fixed behavior); if it places us in the high
        // portion (which a from-scratch priming can't represent starting AT the reference instant
        // - see digitalSynthesis()'s docstring), wait out the remainder of that high portion AND
        // the following nominal low portion instead, so every edge after this first one lands
        // exactly on the intended phase/duty grid.
        const initialDelay = !highAtReference
            ? BigInt(Math.max(1, Math.round((lowAngle - wm) / twoPi * periodTicks)))
            : BigInt(Math.max(1, Math.round((twoPi - wm) / twoPi * periodTicks) + lowTicks));

        // Ticks from `nowSeconds` to the NEXT real edge in whichever direction is actually due (a
        // fall if `highAtReference`, a rise otherwise) - unlike `initialDelay` above, doesn't pad
        // out an extra low portion to fake "starting low": only retimePhase() uses this, and
        // unlike digitalSynthesis()'s brand-new Chip it's free to set `chip.output` to either
        // value directly, so there's no need to misrepresent the current instant as low just to
        // make the delay-to-next-toggle representable. Since `wm` already folds `nowSeconds` in,
        // this is directly "ticks from now" - retimePhase() no longer needs its own separate
        // modulo re-anchoring against `now` the way it did when `wm` was `nowSeconds`-independent. */
        const edgeDelay = !highAtReference
            ? BigInt(Math.max(1, Math.round((lowAngle - wm) / twoPi * periodTicks)))
            : BigInt(Math.max(1, Math.round((twoPi - wm) / twoPi * periodTicks)));

        return { highTicks: BigInt(highTicks), lowTicks: BigInt(lowTicks), periodTicks: BigInt(periodTicks),
                 initialDelay, highAtReference, edgeDelay };
    }

    digitalSynthesis(): DigitalSynthesis | null {
        if (!this.isDigitalClock()) return null;
        const dutyCycle = this.dutyCycle ?? 0.5;
        const phaseShift = this.phaseShift ?? 0;
        const period = 1 / this.frequency; // seconds
        const { highTicks, lowTicks, initialDelay } = RailElm.phaseLayout(period, dutyCycle, phaseShift);

        const desc: ChipDesc[] = [
            customChipStart(phasedClockLogic(initialDelay))
                .outputDelayS(RailElm.ticksToSeconds(lowTicks), RailElm.ticksToSeconds(highTicks)).outputPin(1),
        ];
        return { desc, pinMap: new Map([[0, 1]]) };
    }

    // convert ticks with rounding
    private static ticksToSeconds(ticks: bigint): number {
        return (Number(ticks) + 0.5) * TIMESCALE;
    }

    /** Live phase (and, optionally, duty cycle) nudge for an already-running digital clock rail,
     * without a full circuit re-analyze - used by JSInterface.setExtClock(). `edgeDelay` is
     * computed with `now` (elapsed simulator time) folded into phaseLayout()'s phase angle - see
     * that method's own docstring - so it already comes back as ticks-from-`now` directly; no
     * separate re-anchoring against `now` is needed here the way an earlier version required.
     * `chip.output` is set to the CORRECT instantaneous value for the new phase/duty
     * cycle (`highAtReference`) rather than unconditionally forced low: unlike
     * digitalSynthesis()'s brand-new Chip (whose `output` field is hardcoded to start at 0 - see
     * that method's own docstring), a live chip's `output` is freely settable, so there's no need
     * to misrepresent "currently high" as "currently low, about to rise" here. This matters for
     * more than accuracy at the instant of the call: if `retimePhase()` is invoked again (e.g. a
     * slider being dragged) before the still-pending edge from a PRIOR call ever fires, forcing
     * `output = 0` every single time meant the rail could get stuck reading low indefinitely - a
     * fresh "wait out the whole low portion" restarting on every call faster than that wait ever
     * elapses. Using the real instantaneous value plus the correspondingly short delay to the
     * actual next edge (a fall if currently high, a rise otherwise) means rapid retiming always
     * shows the phase/duty cycle's true instantaneous state, not one artificially biased low.
     * `dutyCycle` (0-1 fraction, same convention as VoltageElm's own field) is left unchanged when
     * omitted.
     *
     * `chip.delay` (the [low, high] tick durations phasedClockLogic() bakes into every period
     * AFTER the first - see that function's own docstring) has to be overwritten here too, not
     * just `initialDelay`: it's set once at chip-construction time from the rail's ORIGINAL duty
     * cycle and phasedClockLogic() never re-derives it, so without this a live duty-cycle change
     * would only nudge where the next edge falls (indistinguishable from a phase change) before
     * every period after that reverted back to the original duty cycle.
     *
     * Directly-connected chips also need to be forced to re-sync, not just re-primed here, and
     * how depends on whether OUR OWN output actually changed value just now:
     *
     * - If it DID change, that's exactly equivalent to a genuine toggle - so it's propagated the
     *   exact same way chip.ts's own updateOutput() propagates a real one: calling
     *   `link.chip.updateInputs(mask)` on each output link. updateInputs() alone is a complete,
     *   self-contained "handle this input change, no matter what state the chip was in" op - it
     *   wakes an ASLEEP chip (and, having just woken, demotes itself back to PASSIVE via its own
     *   internal deactivateOutputs() call, re-arming this rail's activeOutputs interest bit for
     *   next time in the process), THEN toggles `inputs`, recomputes the LUT-based output, and
     *   propagates further downstream - all of it. A prior version of this method called
     *   Chip.deactivateOutputs() directly on each link instead, on the theory that it was the
     *   general "resync a stale consumer" primitive - but deactivateOutputs() only ever resyncs
     *   `inputs`/promotion bookkeeping, it never recomputes a plain combinational consumer's own
     *   `output` from those inputs (that's updateInputs()'s/initialize()'s job) - so an inverter
     *   directly fed by this rail never actually updated while dragging a slider that changes the
     *   rail's value every call, only catching up once dragging stopped and a real scheduled edge
     *   eventually fired on its own.
     * - If it did NOT change value, there's no toggle to propagate, but a currently-ASLEEP
     *   consumer still needs waking + re-syncing so it picks up the NEW schedule for whatever
     *   real edge comes next (the ASLEEP/promotion optimization lets a downstream consumer with no
     *   further interested consumers of ITS OWN stop being pushed live updates and instead lazily
     *   self-derive its value from a `currentCycle`/`cycleTime` snapshot of the pattern it learned
     *   BEFORE this call, which still bakes in the OLD phase/duty cycle) - `Chip.deactivateOutputs()`
     *   is exactly that: wakes it, re-derives its `inputs` from the rail's current `chip.output`,
     *   and re-arms this rail's own activeOutputs interest bit for that link, all without needing
     *   an actual value change to justify it. Simply calling Chip.wakeUp() instead would correctly
     *   replay up through "now" (nothing about the past changed) but then keep extrapolating with
     *   that same stale period forever after - silently reverting to the old duty cycle exactly
     *   like the chip.delay bug above, just one hop downstream instead of on this chip.
     *
     * Both paths recurse to further-downstream chips left stale the same way on their own, so one
     * call per direct link here is enough to fix the whole fan-out either way.
     *
     * `chip` itself also needs bringing up to date BEFORE any of the above, if it's currently
     * ASLEEP under its OLD schedule (a free-running clock with no live consumer - e.g. nothing's
     * downstream yet, or everything downstream also fell asleep - legitimately stops recording
     * real transitions and just remembers a `currentCycle`/`cycleTime` snapshot to replay lazily;
     * see Chip.currentValue()'s own comment). Skipping this would compare the NEW instantaneous
     * value (`highAtReference`) against a stale `chip.output` the setter below hasn't touched
     * since it fell asleep, and would silently drop every transition that should have been
     * recorded into `history` between then and `now` - both symptoms a `historyWatched` consumer
     * (a JS watchSignal(), a Scope) would see as a big, wrongly-uniform gap in its trace.
     * Chip.backfillHistory() is the correct, non-destructive way to catch it up: it walks the
     * OLD schedule forward and records every transition up through `now`, without touching
     * `chip.output` itself - the `chip.output = ...` line below still does that (via the normal
     * setter, so it compares against the now-accurate `_output` and records one further
     * transition only if the new phase/duty cycle actually changes the state). */
    retimePhase(chip: Chip, phaseShift: number, dutyCycle?: number): void {
        this.phaseShift = phaseShift;
        if (dutyCycle !== undefined) this.dutyCycle = dutyCycle;
        if (!this.isDigitalClock()) return;
        const effectiveDutyCycle = this.dutyCycle ?? 0.5;
        const period = 1 / this.frequency;
        const now = chip.circuit.globalTime;
        if (chip.state === ChipState.ASLEEP) chip.backfillHistory(now);
        // Elapsed simulator time this call is happening at, folded into phaseLayout()'s phase
        // angle so `edgeDelay` below answers "what does THIS rail, continuously running with
        // `phaseShift`, actually look like right now" instead of "what would phaseShift alone
        // mean if evaluated as though `now` were tick 0" - see phaseLayout()'s own docstring.
        const nowSeconds = Number(now) * TIMESCALE;
        const { highTicks, lowTicks, highAtReference, edgeDelay } =
            RailElm.phaseLayout(period, effectiveDutyCycle, phaseShift, nowSeconds);
        const oldOutput = chip.output;
        const delay = edgeDelay; // already ticks-from-`now` - see phaseLayout()'s own docstring
        chip.delay = [lowTicks, highTicks];
        chip.output = highAtReference ? 1 : 0;
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
