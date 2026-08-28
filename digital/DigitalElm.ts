/*
    Core periodicity-detection / self-scheduling machinery for digital
    circuit elements, ported from cycle4's sim.py (see
    ~/Projects/pong/cycle4/doc.txt for the full design rationale - every
    method below corresponds to a section there).

    This file knows nothing about gates, flip-flops, or CircuitElm - it
    only requires evaluate() to be a pure function of current_value() on
    an element's inputs. The actual state machine lives in the withDigital()
    mixin so it can be applied two ways:

      - export const DigitalElm = withDigital(class {}) - a standalone base
        class for elements with no other identity (used by GroupPin below,
        and by anything not also a CircuitElm).
      - GateElm/ChipElm extend withDigital(CircuitElm) - merges the state
        machine directly onto the real circuit element classes, so a gate
        or chip *is* its own periodicity-tracking object rather than having
        a separate shadow object mirroring it.

    Multi-output chips (counters, shift registers, ...) should follow the
    Group/GroupPin split at the bottom of this file: GroupPin stays a plain
    standalone DigitalElm (a chip's output pin isn't a CircuitElm in its own
    right), independently tracking its own bit's periodicity, while Group is
    implemented by whatever owns the pins (typically the mixed-in chip
    itself) to compute the whole register's next state.
*/

import { Scheduler, LAST } from "./Scheduler";
import type { Schedulable } from "./Scheduler";

export enum State { Passive, Active, Asleep }

/** The scheduler's time unit is an integer tick, deliberately decoupled
 * from CircuitElm.sim.t (floating-point seconds) - _matchPeriod() and
 * _matchRotation() rely on *exact* equality of time differences, which
 * floating-point arithmetic can't guarantee. This file doesn't define what
 * a tick actually is in real-world terms - that's up to whoever drives the
 * scheduler. Real integration (RailElm's digital clock) defines 1 tick = 1
 * SimulationManager.maxTimeStep, the same already-user-configurable
 * resolution the old per-timestep analog model used - a clock period too
 * fast to resolve at the current maxTimeStep would have aliased under that
 * model too, so this isn't a new constraint. */

/** Minimum positive delay used wherever an event must land strictly after
 * the change that caused it (see doc.txt's "10 ticks later" convention,
 * which this replaces) - e.g. a Passive element reacting to a live input
 * change, or the recheck scheduled right after a demote. Any positive
 * value works; the periodicity-matching algorithm discovers real gaps
 * empirically rather than assuming this specific constant, so it isn't
 * tied to real-world timing the way TICKS_PER_SECOND is. */
const MIN_HOP_TICKS = 1;

export type OutputEvent = [number, boolean | SubRef];

/** Shape shared by a DigitalElm (acting as its own root Cycle) and Cycle
 * itself (a nested, reusable playback pattern referenced by a SubRef). */
export interface CycleLike {
    outputEvents: OutputEvent[];
    // 0 means "not yet established" (mirrors Python's None via truthiness -
    // a real period is always positive).
    cycleTime: number;
    firstOutputEvent: number;
    currentOutputEvent: number;
    cycleParent: CycleLike | null;
    cycleSpanEnd: number | null;
    /** Absolute time this instance's local elapsed=0 corresponds to - set on
     * entry (see _resolveLeaf/_descendTo). Unused for a root (self acting as
     * its own Cycle; see _cycleAnchor, which uses rootPhaseZero instead). */
    activationTime: number | null;
}

/** A reusable, nested playback pattern - the target of a SubRef entry in
 * some element's (or another Cycle's) outputEvents. Produced by _promote()
 * via _splitRepeatingPrefix() when a newly-verified longer period turns out
 * to begin with several exact repeats of an element's own previous
 * (shorter) schedule. */
export class Cycle implements CycleLike {
    firstOutputEvent = 0;
    currentOutputEvent = 0;
    cycleParent: CycleLike | null = null;
    cycleSpanEnd: number | null = null;
    activationTime: number | null = null;
    constructor(public outputEvents: OutputEvent[], public cycleTime: number) {}
}

/** A non-leaf outputEvents entry: instead of a plain boolean, replay
 * `cycle` (wrapping every cycle.cycleTime) for `span` ticks starting here,
 * before returning to whatever comes after this entry. */
export class SubRef {
    constructor(public cycle: Cycle, public span: number) {}
}

/** Marker arg for a scheduled event meaning "an untrusted input changed,
 * demote and go re-derive live" - as opposed to a plain boolean (an Active
 * element's own predicted next output) or null (a generic Passive
 * re-evaluation). Always a demote, never a "confirm and stay trusting" path
 * - see prepare()'s Recheck branch for why: a live re-evaluation matching
 * the schedule's predicted value at this one instant doesn't prove the
 * schedule's NEXT entry still holds, only that this untrusted input's new
 * value happens not to have moved the needle *yet*. Scheduled with zero
 * delay (see inputUpdated()) so the scheduler's delta-cycle batching
 * handles it. */
export class Recheck {
    constructor(public sender: DigitalElmInstance | null) {}
}

type Pending =
    | null
    | { kind: "demote"; pattern: boolean[] }
    | { kind: "active"; val: boolean; pattern: boolean[] }
    | { kind: "passive"; val: boolean; pattern: boolean[] };

function gcd(a: number, b: number): number {
    while (b) [a, b] = [b, a % b];
    return a;
}
function lcm(nums: number[]): number {
    return nums.reduce((a, b) => (a / gcd(a, b)) * b, 1);
}

/** Public shape of anything carrying the digital state machine - both the
 * standalone DigitalElm class and any CircuitElm subclass mixed with
 * withDigital(). Declared separately from the mixin's own implementation
 * class so mixed and standalone elements can freely reference each other
 * (an element's inputs/outputs can be a mix of both) without one needing
 * to import the other's concrete class. */
export interface DigitalElmInstance extends Schedulable, CycleLike {
    inputs: DigitalElmInstance[];
    liveOutputs: DigitalElmInstance[];
    value: boolean;
    initialValue: boolean;
    state: State;
    history: [number, boolean][];
    trustedInputs: Set<DigitalElmInstance>;
    sleepRequested: boolean;
    lastChecked: number;
    currentCycle: CycleLike;
    previousCycle: Cycle | null;
    /** rootPhaseZero previousCycle's own offsets are relative to - needed
     * to compute the phase difference between the abandoned schedule and
     * the current one when compounding (see _splitRepeatingPrefix()). */
    previousRootPhaseZero: number | null;
    rootPhaseZero: number;
    sleepBase: number;
    backfillCycle: CycleLike;
    backfillTime: number;
    readonly scheduler: Scheduler;
    /** When true, logs inputUpdated()/Recheck decisions for this element to
     * the console - a debugging aid toggled per-element via a getEditInfo()
     * checkbox (see e.g. GateElm's "Digital Debug" entry), since browser
     * console access can't reach an arbitrary live object directly and
     * hover-based selection doesn't survive switching to the console. */
    digitalDebug: boolean;

    // DICE-style activation_check bookkeeping (see activationCheck()): a
    // history of changes to the pattern of our inputs' current values,
    // independent of our own State - kept warm through Active/Asleep
    // stretches for the same reason `history` is. Cross-instance because
    // activationCheck() reads/writes this on every input it recurses into,
    // and _cascadeActivate() reads `history`/`lastInputChange` on whatever
    // elements a successful check resolved.
    inputPatternHistory: [number, boolean[]][];
    inputPatternTable: Map<string, number[]>;
    /** Index into inputPatternHistory -> explicit end time, for entries
     * collapsed by _compressInputPatternHistory(). */
    compressedEnd: Map<number, number>;
    /** Per-input-index: abs time that input's value last changed, as
     * observed by us. */
    lastInputChange: number[];
    /** Cross-call search-position memoization (see activationCheck()'s own
     * docstring for why this is correctness-relevant, not just perf):
     * resume index into inputPatternTable[current pattern] - reset only
     * when OUR OWN pattern changes. */
    firstInputTablePos: number;
    /** Bit j: input j's own firstInputTablePos hasn't been re-primed yet
     * this "pattern epoch" - see activationCheck(). */
    firstInputMask: number;
    /** Recursion guard for activationCheck(). */
    checkVisited: boolean;

    addInput(...elements: DigitalElmInstance[]): void;
    resetDigital(): void;
    notifyOutputs(): void;
    inputUpdated(sender?: DigitalElmInstance | null): void;
    wake(): void;
    currentValue(): boolean;
    /** Our value as of `time`, which may be earlier than right now - unlike
     * currentValue(), which only ever answers "as of this instant". Needed
     * by a chip's shared next-state computation (e.g. CounterElm's carry,
     * DFlipFlopElm's D sample): a sibling that's Active and self-driving
     * reacts to a clock edge immediately, while a DIFFERENT input only
     * catches up to that same edge later (e.g. after demoting) - reading
     * its currentValue() at that later point would see it already past the
     * edge, double-applying the edge's effect. */
    valueAt(time: number): boolean;
    /** Did we transition to targetValue at some point in (since, until]?
     * Returns the absolute time of the LATEST matching transition, or null
     * if there wasn't one - not just a bool - so a caller that needs "the
     * state of some OTHER element just before this specific edge" (a
     * chip's shared carry/D-sample computation) has an actual instant to
     * query valueAt() with, rather than only a yes/no. */
    transitionedTo(targetValue: boolean, since: number, until: number): number | null;
    /** Public (despite the leading underscore) because syncedValue() - a
     * free function usable by any Group implementation - has to reach it
     * for a sleeping sibling pin. */
    _leafValueAt(cyc: CycleLike, elapsed: number): boolean;
    _maybeSleep(): void;
    /** Public (despite the leading underscore), like _leafValueAt() above -
     * ScopePlot.fillFromDigitalHistory() needs to force an Asleep element's
     * history to catch up to "now" before reading it directly, the same way
     * transitionedTo() already does internally. */
    _backfillHistory(now: number): void;
    /** Absolute time c's own local elapsed=0 corresponds to - our
     * rootPhaseZero if c is our own root Cycle (self), else c's own
     * activationTime. Called cross-instance by activationCheck() while
     * walking an Active input's own currentCycle chain. */
    _cycleAnchor(c: CycleLike): number;
    /** Port of DICE's Chip::activation_check: has our current input pattern
     * already occurred somewhere in [minTime, maxTime), with the entire
     * upstream chain that produced it (recursively) provably repeating in
     * lockstep? If so, returns the absolute time of that occurrence and
     * records every element (self included) whose own repeat was confirmed
     * along the way into `resolved`, so the caller can promote the whole
     * verified chain at once. Returns maxTime if no repeat is found. */
    activationCheck(minTime: number, maxTime: number, resolved: Map<DigitalElmInstance, number>): number;
    /** Promote using a verified activationTime from activationCheck,
     * reusing our own already-recorded output history for the window it
     * implies. Called cross-instance by _cascadeActivate(). */
    _promoteFromActivation(activationTime: number, activeInputs?: DigitalElmInstance[]): void;
    /** Optional: analytically-known candidate period(s) tryPromote() should
     * try with the same confidence as its own provenInputs LCM candidate,
     * for an element whose true period depends on internal configuration
     * the generic engine can't see from input periods alone (a Group's
     * hook - see Group.extraPromotionCandidates() - surfaces through here
     * via GroupPin's own implementation). Absent (undefined) for anything
     * with no such extra knowledge to offer - the overwhelmingly common
     * case - so tryPromote() only calls it via `?.()`. */
    extraPromotionCandidates?(): number[];
    /** Ticks a Passive element waits after an input change before
     * re-evaluating - see the Digital mixin's own propagationDelayTicks() docstring. */
    propagationDelayTicks(): number;
    evaluate(sender?: DigitalElmInstance | null): boolean;
}

type Constructor<T = object> = abstract new (...args: any[]) => T;

/**
 * Mixes the full periodicity/promotion/sleep state machine onto any base
 * class. See this file's header for the two ways this gets used.
 *
 * The scheduler each instance attaches to comes from the static
 * current/promotionEnabled accessors below (backed by DigitalCore) rather
 * than a constructor argument, since a mixed base class's constructor is
 * already heavily overloaded in practice (CircuitElm subclasses have 2-arg
 * and 6-arg forms across many files) - adding a required argument would
 * mean editing every one of them.
 */
export function withDigital<TBase extends Constructor>(Base: TBase) {
    abstract class Digital extends Base implements DigitalElmInstance {
        /** Set false to keep every element Passive forever (live
         * evaluate() only, no self-scheduling) - the always-correct
         * baseline the verification harness checks the optimized path
         * against. Mirrors verify.py's monkeypatch of try_promote to a
         * no-op. Shared across every withDigital() base (mixed or
         * standalone) via DigitalCore below, not per-mixin-application,
         * so a single test toggle affects the whole circuit. */
        static get promotionEnabled(): boolean { return DigitalCore.promotionEnabled; }
        static set promotionEnabled(v: boolean) { DigitalCore.promotionEnabled = v; }

        /** The scheduler newly-constructed elements attach to. Set this
         * once before building a circuit (real usage: pointed at the live
         * simulation's digital scheduler, mirroring CircuitElm.sim's own
         * static-singleton pattern; tests: a fresh Scheduler per test).
         * Shared across every withDigital() base for the same reason as
         * promotionEnabled above - there is exactly one digital circuit
         * being simulated at a time regardless of how many base classes
         * got mixed. */
        static get current(): Scheduler { return DigitalCore.current; }
        static set current(s: Scheduler) { DigitalCore.current = s; }

        inputs: DigitalElmInstance[] = [];
        liveOutputs: DigitalElmInstance[] = [];
        value = false;
        // The value we held before our very first history entry - captured
        // lazily (see _pushHistory) the moment that first entry is pushed,
        // since by construction it's exactly whatever `.value` was right
        // before that specific assignment. Needed by valueAt(): a query
        // for a time strictly before history[0]'s own timestamp can't be
        // answered by scanning history (nothing there yet covers it), and
        // currentValue() is unsafe for this (it can already reflect a
        // same-tick commit that happened before this query but logically
        // after the time being asked about).
        initialValue = false;
        state = State.Passive;
        history: [number, boolean][] = []; // append-only (abs_time, value) log, used for periodicity detection
        trustedInputs = new Set<DigitalElmInstance>(); // inputs whose future is already accounted for
        sleepRequested = false; // Active + all outputs now trust us; stop after the next tick
        lastChecked = 0; // end of the window already covered by an edge-detection check
        digitalDebug = false;

        // DICE-style activation_check bookkeeping - see the interface
        // docstrings above for what each of these is for.
        inputPatternHistory: [number, boolean[]][] = [];
        inputPatternTable = new Map<string, number[]>();
        compressedEnd = new Map<number, number>();
        lastInputChange: number[] = [];
        firstInputTablePos = 0;
        firstInputMask = 0;
        checkVisited = false;

        // CycleLike fields: self acts as its own root Cycle.
        outputEvents: OutputEvent[] = [];
        cycleTime = 0; // 0 = not yet Active
        firstOutputEvent = 0;
        currentOutputEvent = 0;
        cycleParent: CycleLike | null = null; // always null for the root; only a nested Cycle has a real cycleParent
        cycleSpanEnd: number | null = null; // always null for the root
        activationTime: number | null = null; // unused for the root - see _cycleAnchor()

        currentCycle: CycleLike;
        previousCycle: Cycle | null = null; // our last Active schedule, kept around as compression material
        previousRootPhaseZero: number | null = null;
        rootPhaseZero = 0; // absolute time offset-0 of our current root schedule corresponds to; fixed for that schedule's lifetime

        sleepBase = 0;
        backfillCycle: CycleLike;
        backfillTime = 0;

        // A live getter, not a field captured once at construction: real
        // elements (new ClockElm(x, y), etc.) get constructed the moment
        // they're dragged onto the canvas - before the circuit is ever
        // stamped, which is the only place DigitalCore.current gets
        // assigned. A captured field would freeze in whatever scheduler
        // (possibly none yet) existed at that arbitrary moment, going
        // stale across re-stamps; every construction after this always
        // sees whichever scheduler is actually current.
        get scheduler(): Scheduler {
            return DigitalCore.current;
        }

        constructor(...args: any[]) {
            super(...args);
            this.currentCycle = this;
            this.backfillCycle = this;
        }

        addInput(...elements: DigitalElmInstance[]): void {
            for (const el of elements) {
                this.inputs.push(el);
                this.lastInputChange.push(0);
                el.liveOutputs.push(this);
            }
        }

        /** Resets all digital state back to fresh construction-time
         * defaults. Needed because a real circuit element (GateElm,
         * RailElm) is a long-lived CircuitElm instance that persists
         * across re-stamps - e.g. wiring a new connection to an already-
         * placed gate, or clicking Reset, both trigger a fresh stamp (and
         * a fresh Scheduler) without the element itself being recreated.
         * Re-wiring such an element without first resetting it would
         * accumulate stale inputs/liveOutputs left over from the previous
         * stamp's now-discarded scheduler on top of the new ones, instead
         * of starting clean. */
        resetDigital(): void {
            this.inputs = [];
            this.liveOutputs = [];
            this.value = false;
            this.initialValue = false;
            this.state = State.Passive;
            this.history = [];
            this.trustedInputs = new Set();
            this.sleepRequested = false;
            this.lastChecked = 0;
            this.inputPatternHistory = [];
            this.inputPatternTable = new Map();
            this.compressedEnd = new Map();
            this.lastInputChange = [];
            this.firstInputTablePos = 0;
            this.firstInputMask = 0;
            this.checkVisited = false;
            this.outputEvents = [];
            this.cycleTime = 0;
            this.firstOutputEvent = 0;
            this.currentOutputEvent = 0;
            this.cycleParent = null;
            this.cycleSpanEnd = null;
            this.activationTime = null;
            this.currentCycle = this;
            this.previousCycle = null;
            this.previousRootPhaseZero = null;
            this.rootPhaseZero = 0;
            this.sleepBase = 0;
            this.backfillCycle = this;
            this.backfillTime = 0;
        }

        /** Phase 1 of the scheduler's two-phase dispatch: decide what this
         * event would do, using only state committed before this timestamp's
         * current delta round. See Scheduler.run(). */
        prepare(val: unknown): Pending {
            if (val instanceof Recheck) {
                if (this.state !== State.Active && this.state !== State.Asleep)
                    return null; // already resolved by an earlier delta this same tick
                // Always demote on a genuinely untrusted input change - never
                // try to "confirm" by checking whether a live evaluate()
                // happens to still match the schedule's predicted value
                // right now. That single-instant check is unsound: it can
                // match by coincidence (the schedule's own prediction
                // happens to equal whatever the untrusted input is
                // independently forcing at this exact tick) while saying
                // nothing about whether the schedule's NEXT entry still
                // holds. Trust is only re-earned the normal way, by
                // activationCheck() re-running from scratch once real data
                // accumulates again (see tryPromote()/inputUpdated()).
                if (this.digitalDebug)
                    console.log("[digital] Recheck", (this as any).getClassName?.() ?? this,
                        "state=", State[this.state], "sender=", (val.sender as any)?.getClassName?.() ?? val.sender, "DEMOTE");
                return { kind: "demote", pattern: this._currentPattern() };
            }
            if (val === null) {
                // A generic "go re-check your inputs" wakeup. If we've since
                // re-promoted to Active/Asleep, our own predicted schedule
                // already governs future updates, so this stale wakeup is a no-op.
                if (this.state === State.Active || this.state === State.Asleep)
                    return null;
                const newval = this.evaluate();
                return { kind: "passive", val: newval, pattern: this._currentPattern(newval) };
            }
            const predicted = val as boolean;
            if (this.state === State.Active) {
                if (this.inputs.length > 0 && this.evaluate() !== predicted)
                    // Our own schedule's predicted value disagrees with a full
                    // live re-derivation (can happen even though input_updated()
                    // re-verifies on every untrusted-input change - see wake()'s
                    // docstring for the same "single instant doesn't prove the
                    // schedule" principle). Demote instead of committing a value
                    // now known to be wrong.
                    return { kind: "demote", pattern: this._currentPattern() };
                return { kind: "active", val: predicted, pattern: this._currentPattern(predicted) };
            }
            // Stale Active-scheduled tick: our state changed since this was
            // scheduled (demoted, or re-promoted onto a new schedule) - this
            // leftover event no longer describes anything real. A leftover
            // self-driven tick specifically carries a raw boolean payload
            // (see _advanceAndSchedule()'s schedule() call, `leafValue`);
            // demote's own follow-up recheck (commit()'s "demote" case)
            // schedules itself with no value at all (undefined), not a
            // boolean, so it still falls through to the live re-derivation
            // below. Treating a stale boolean tick as "just do a generic
            // live recheck" instead of dropping it is itself a bug: that
            // fallback calls evaluate() with sender defaulting to null (see
            // GroupPin.evaluate()), which for an element like CounterElm
            // means "check for a clock edge too" - so a stale tick landing
            // in an earlier same-tick batch than the real recheck can
            // consume/misattribute a genuine clock-edge check that the real
            // recheck should have performed, corrupting the value it
            // computes (and that value gets broadcast via notifyOutputs()
            // before a later, correct commit overwrites it locally).
            if (typeof val === "boolean") return null;
            const newval = this.evaluate();
            return { kind: "passive", val: newval, pattern: this._currentPattern(newval) };
        }

        /** Append to history, capturing initialValue (see its own docstring)
         * the first time this is ever called for this element - lazily,
         * since the correct value is exactly whatever `.value` held right
         * before this specific push, which by construction (history only
         * ever gets a new entry on a genuine change, or - for an Active
         * self-driven tick - after real history already exists from an
         * earlier Passive stretch) is the boolean opposite of what's being
         * pushed now. */
        _pushHistory(t: number, v: boolean): void {
            if (this.history.length === 0) this.initialValue = !v;
            this.history.push([t, v]);
        }

        /** Phase 2: apply what prepare() decided. */
        commit(pendingRaw: unknown): void {
            const pending = pendingRaw as Pending;
            if (pending === null) return;
            const now = this.scheduler.currentTime;
            // Record unconditionally, independent of state and of whether
            // this particular pending turns out stale below - mirrors DICE
            // recording input_events on every event delivered to a chip, so
            // a later demotion has continuous pattern history to re-search
            // (see inputPatternHistory's own docstring).
            this._recordInputPattern(pending.pattern, now);
            switch (pending.kind) {
                case "demote":
                    // Guarded: a co-tier event for this same object may have
                    // already demoted us.
                    if (this.state !== State.Passive) {
                        this._demote();
                        this.scheduler.schedule(now + MIN_HOP_TICKS, this);
                    }
                    return;
                case "active": {
                    if (this.state !== State.Active) return; // stale: already demoted this tier
                    this.value = pending.val;
                    // Keep recording into history even while Active - otherwise a
                    // later re-promotion attempt against a longer candidate
                    // period can spuriously match on leftover pre-Active points.
                    this._pushHistory(now, pending.val);
                    this.lastChecked = now;
                    if (this.sleepRequested) this._enterSleep();
                    else this._advanceAndSchedule(this.currentCycle.currentOutputEvent);
                    this.notifyOutputs();
                    return;
                }
                case "passive": {
                    // Advance the edge-detection window regardless of whether the
                    // value changed - a real check happened, covering everything
                    // up to now.
                    this.lastChecked = now;
                    if (this.value !== pending.val) {
                        this.value = pending.val;
                        this._pushHistory(now, pending.val);
                        this.tryPromote();
                        this.notifyOutputs();
                    }
                    return;
                }
            }
        }

        notifyOutputs(): void {
            for (const out of this.liveOutputs)
                if (!out.trustedInputs.has(this)) out.inputUpdated(this);
        }

        commit_after(): Set<Schedulable> | typeof LAST {
            return this.trustedInputs as unknown as Set<Schedulable>;
        }

        /** Given ix = index (within `cyc`, default currentCycle) of the entry
         * matching the value just applied, find and schedule the next one. Thin
         * wrapper around _advance() that supplies "now" and, since live
         * self-driving always accepts the step it computes, immediately commits it. */
        _advanceAndSchedule(ix: number, elapsed?: number, cyc?: CycleLike): void {
            cyc = cyc ?? this.currentCycle;
            elapsed = elapsed ?? cyc.outputEvents[ix][0];
            const { leafValue, resolvedCycle, targetTime, commit } = this._advance(
                ix, elapsed, cyc, this.scheduler.currentTime);
            commit();
            this.currentCycle = resolvedCycle;
            this.scheduler.schedule(targetTime, this, leafValue);
        }

        /** Core step shared by live self-driving and history backfill: given
         * ix = index within cyc of the entry currently in effect, find the next
         * entry - descending into a SubRef, or ascending to cyc.cycleParent if that
         * would exceed cyc's allotted span - and return everything needed to
         * take (or peek at) that step. Deliberately side-effect free; callers
         * that want to commit call the returned `commit` closure themselves.
         * See doc.txt section 5 for why purity matters here (a discarded
         * speculative peek must not corrupt cyc's real playback position). */
        _advance(ix: number, elapsed: number, cyc: CycleLike, now: number):
            { leafValue: boolean; resolvedCycle: CycleLike; resolvedIdx: number; targetTime: number; commit: () => void } {
            let nxtOffset: number, nxtEntry: boolean | SubRef, nxtIdx: number;
            if (ix + 1 < cyc.outputEvents.length) {
                [nxtOffset, nxtEntry] = cyc.outputEvents[ix + 1];
                nxtIdx = ix + 1;
            } else {
                [nxtOffset, nxtEntry] = cyc.outputEvents[cyc.firstOutputEvent];
                nxtIdx = cyc.firstOutputEvent;
                nxtOffset += cyc.cycleTime;
            }
            const delay = nxtOffset - elapsed;
            const targetTime = now + delay;
            if (cyc.cycleSpanEnd !== null && targetTime >= cyc.cycleSpanEnd) {
                // cyc's allotted span ends before its own next entry would occur -
                // ascend and let the cycleParent decide what comes next instead. The
                // cycleParent-level step we're about to recompute always has
                // delay === entry.span exactly (by construction), so for the
                // result to equal cycleSpanEnd, the "now" fed into it must be the
                // original activation time (cycleSpanEnd - entry.span), not the
                // current real tick and not cycleSpanEnd itself - see doc.txt
                // section 5 for why the other two options overshoot.
                const cycleParent = cyc.cycleParent!;
                const pix = cycleParent.currentOutputEvent;
                const entry = cycleParent.outputEvents[pix][1] as SubRef;
                return this._advance(pix, cycleParent.outputEvents[pix][0], cycleParent, cyc.cycleSpanEnd - entry.span);
            }
            const { leafValue, resolvedCycle, resolvedIdx, commit } =
                this._resolveLeaf(cyc, nxtIdx, nxtEntry, targetTime);
            return { leafValue, resolvedCycle, resolvedIdx, targetTime, commit };
        }

        /** entry is either a plain boolean (already a leaf) or a SubRef, at
         * index fromIdx within fromCycle. Descend as many levels as needed to
         * find the actual leaf value that would be applied at targetTime -
         * using targetTime (this event hasn't fired yet) as the activation
         * reference. Does not mutate anything itself; returns a `commit`
         * closure that performs every mutation needed to actually move into
         * this position. */
        _resolveLeaf(fromCycle: CycleLike, fromIdx: number, entry: boolean | SubRef, targetTime: number):
            { leafValue: boolean; resolvedCycle: CycleLike; resolvedIdx: number; commit: () => void } {
            if (!(entry instanceof SubRef)) {
                return {
                    leafValue: entry, resolvedCycle: fromCycle, resolvedIdx: fromIdx,
                    commit: () => { fromCycle.currentOutputEvent = fromIdx; },
                };
            }
            const sub = entry.cycle;
            const firstIdx = sub.firstOutputEvent;
            const firstEntry = sub.outputEvents[firstIdx][1];
            const inner = this._resolveLeaf(sub, firstIdx, firstEntry, targetTime);
            return {
                leafValue: inner.leafValue, resolvedCycle: inner.resolvedCycle, resolvedIdx: inner.resolvedIdx,
                commit: () => {
                    fromCycle.currentOutputEvent = fromIdx;
                    sub.cycleParent = fromCycle;
                    sub.cycleSpanEnd = targetTime + entry.span;
                    sub.activationTime = targetTime;
                    inner.commit();
                },
            };
        }

        /** How many ticks after an input change a Passive element should wait
         * before re-evaluating (doc.txt section 1's "schedules itself to
         * re-evaluate N ticks later" convention, modeling propagation
         * delay). MIN_HOP_TICKS by default; GateElm overrides this to honor
         * its own configured propagationDelay (floored at MIN_HOP_TICKS),
         * and GroupPin below delegates to its owning Group so a multi-pin
         * chip (CounterElm, DFlipFlopElm, JKFlipFlopElm, ...) can do the
         * same. Deliberately NOT consulted on the Active/Asleep path below
         * (same-tick Recheck) - see doc.txt section 8b: that's a distinct,
         * intentional mechanism (confirming an already-promoted schedule
         * against a live re-derivation via commit_after()'s same-batch
         * ordering guarantee), not the same thing as an ordinary Passive
         * element reacting to a change for the first time. */
        propagationDelayTicks(): number {
            return MIN_HOP_TICKS;
        }

        inputUpdated(sender: DigitalElmInstance | null = null): void {
            if (this.digitalDebug)
                console.log("[digital] inputUpdated", (this as any).getClassName?.() ?? this,
                    "state=", State[this.state], "sender=", (sender as any)?.getClassName?.() ?? sender);
            if (this.state === State.Active || this.state === State.Asleep) {
                // Scheduled (not evaluated inline) so it goes through the
                // scheduler's normal two-phase batching for this same
                // timestamp - see doc.txt section 8b.
                this.scheduler.schedule(this.scheduler.currentTime, this, new Recheck(sender));
                return;
            }
            // DICE parity (chip.cpp's update_inputs()): update our own
            // pattern first, then re-check it against EXISTING history
            // before falling through to recording it as a new occurrence.
            // A transient pattern that already matches some proven
            // precedent is resolved immediately via _cascadeActivate() (the
            // same proven-structure reuse tryPromote() does), so it never
            // becomes a spurious "single coincidental occurrence" a later,
            // unrelated cascade might wrongly trust. Gated on
            // promotionEnabled for the same reason tryPromote() is - this
            // is a second, independent path that can promote an element
            // (via _cascadeActivate), and the "always-correct baseline"
            // verification harness relies on promotionEnabled=false
            // meaning EVERY element stays Passive forever, not just that
            // tryPromote() itself is disabled.
            if (DigitalCore.promotionEnabled && this.inputPatternHistory.length > 0) {
                const pattern = this._currentPattern();
                const lastPattern = this.inputPatternHistory[this.inputPatternHistory.length - 1][1];
                if (patternKey(pattern) !== patternKey(lastPattern)) {
                    // This pattern hasn't been recorded yet, so
                    // firstInputTablePos is still tracking wherever the
                    // PREVIOUS (different) pattern's search left off - not a
                    // valid resume point into THIS pattern's own occurrence
                    // list.
                    this.firstInputTablePos = 0;
                    this.firstInputMask = this.inputs.length ? (1 << this.inputs.length) - 1 : 0;
                    const resolved = new Map<DigitalElmInstance, number>();
                    const now = this.scheduler.currentTime;
                    const at = this.activationCheck(this.inputPatternHistory[0][0], now, resolved);
                    if (at < now) {
                        cascadeActivate(resolved);
                        if (this.state !== State.Passive) {
                            // _cascadeActivate() actually promoted us (the
                            // common case) - our own predicted schedule now
                            // governs future updates, so the fallback
                            // schedule below would be a stale no-op. But
                            // promotion isn't guaranteed just because
                            // activationCheck matched (e.g. our own history
                            // window for the verified span can be empty) -
                            // in that case we still need the normal
                            // fallback schedule, or we'd be permanently
                            // orphaned with nothing ever scheduling us
                            // again.
                            return;
                        }
                    } else {
                        this._recordInputPattern(pattern, now);
                    }
                }
            }
            this.scheduler.schedule(this.scheduler.currentTime + this.propagationDelayTicks(), this);
        }

        /** Common teardown for leaving Active/Asleep because our prediction
         * turned out wrong: go re-derive our value live from here on. */
        _demote(): void {
            if (this.state === State.Asleep) {
                // We stopped recording history (and correcting .value) while
                // asleep; catch both up before clearing our schedule. Using
                // currentValue() (the abandoned schedule's own prediction)
                // rather than a fresh evaluate() is correct here: the baked
                // schedule was still trusted right up until this demote, so
                // replaying it via backfill is exactly what should have
                // been happening in the background all along.
                this._backfillHistory(this.scheduler.currentTime);
                this.value = this.currentValue();
            }
            // Whatever our state was, the schedule we're abandoning (baked
            // or self-driven) accounted for our behavior up through right
            // now - so our edge-detection window is fully covered up to
            // this instant too. Without this, an element leaving Active
            // keeps whatever lastChecked its last real self-driven commit
            // left behind (often set once, at promotion time, and never
            // touched again while ticking off its own baked schedule) -
            // potentially tens of thousands of ticks stale. The next live
            // (Passive) re-evaluation then computes transitionedTo() over
            // that whole stale span instead of just the time since now,
            // so ANY edge anywhere in that huge window - not just the one
            // that should actually govern this check - counts as "yes, an
            // edge happened," and edge-triggered logic (e.g. a D flip-
            // flop) latches its data input's CURRENT value instead of the
            // value as of the one real relevant edge. A real bug found
            // live: a demote triggered by an unrelated cascade - even though the
            // demoted element's own prediction was still completely
            // correct - corrupted its very next live value this way,
            // which then propagated through several more levels of the
            // circuit before surfacing as a visibly wrong NOR output.
            // transitionedTo()'s window is exclusive of `since`, so
            // advancing lastChecked to exactly `now` would exclude a real
            // edge landing on this exact tick (the same tick as the
            // demote) from every future check, permanently - a real bug
            // found live. Back off by one tick instead: a (now-1, now]
            // window can contain at most one transition (ticks are
            // integers), so this can't under-count multiple edges the way
            // calling this.evaluate() here did when tried (it collapses
            // "at least one edge occurred" into a single toggle, which
            // silently under-counts if lastChecked was stale by more than
            // one edge's worth of time - exactly the case this whole fix
            // exists for). This also still closes the original wide-
            // stale-window bug (see the flip-flop example above): stale
            // by one tick behaves nothing like stale by tens of thousands.
            this.lastChecked = this.scheduler.currentTime - 1;
            // We're demoting after a stretch [rootPhaseZero, now) we were
            // genuinely Active/Asleep for, which means that ENTIRE stretch
            // is proven periodic/self-consistent. But commit()
            // unconditionally records the input pattern the whole time
            // regardless of State, so inputPatternHistory kept accumulating
            // fine-grained entries throughout - meaning the occurrence
            // recorded for our pattern at rootPhaseZero only appears to
            // span up to the next incidental blip a few ticks later, not
            // the whole proven stretch. Collapse it into one wide
            // occurrence so a later re-verification attempt can find it
            // directly - without this, cycleTime can never grow across
            // repeated promote/demote cycles.
            this._compressInputPatternHistory(this.rootPhaseZero);
            this.state = State.Passive;
            // Keep the schedule we're abandoning as compression material for a
            // future promotion (see doc.txt section 5).
            if (this.outputEvents.length > 0 && this.cycleTime) {
                this.previousCycle = new Cycle(this.outputEvents, this.cycleTime);
                this.previousRootPhaseZero = this.rootPhaseZero;
            }
            this.outputEvents = [];
            this.sleepRequested = false;
            this.currentCycle = this; // abandon any nested playback position
            const oldTrusted = this.trustedInputs;
            this.trustedInputs = new Set();
            // Any input we used to trust may now need to run again.
            for (const inp of oldTrusted) inp.wake();
            // Any output that was trusting us locked in a prediction based on
            // our now-broken periodicity - and as long as it keeps trusting
            // us, notifyOutputs() will keep silently skipping it, so it
            // would never hear about anything we do again even if we get
            // stuck Passive forever, permanently unable to re-promote (a
            // real bug found live: an output kept replaying a stale
            // schedule indefinitely after the input it trusted demoted and
            // never successfully re-promoted). Break that silence
            // immediately by revoking the trust itself, then let the
            // ordinary live-notification path (not a forced demote) decide
            // whether the output's existing prediction is actually still
            // right. Deliberately NOT an unconditional demote-and-rederive
            // here: for elements in a genuine
            // mutual feedback loop (like this circuit's own nand/dff
            // pairing), forcing a full redemote on literally every single
            // demote let members of the cycle keep re-triggering each
            // other's forced redemotion indefinitely, never converging - a
            // real regression found while fixing the original bug above. A
            // plain notification is enough: once trust is revoked,
            // notifyOutputs() stops skipping this output, so any REAL future
            // divergence still gets caught by the normal Recheck value-
            // mismatch path (see prepare()'s Recheck branch) the moment it
            // actually happens, without forcing every trusting output to
            // redo its own promotion from scratch on every demote regardless
            // of whether its existing prediction is still fine.
            for (const out of this.liveOutputs) {
                if (!out.trustedInputs.has(this)) continue;
                const trusted = new Set(out.trustedInputs);
                trusted.delete(this);
                out.trustedInputs = trusted;
                out.inputUpdated(this);
            }
        }

        /** Index into cyc.outputEvents of the entry in effect `elapsed` ticks
         * into cyc's own period. Defaults to the last (wrap-around) entry. */
        _indexAt(cyc: CycleLike, elapsed: number): number {
            let idx = cyc.outputEvents.length - 1;
            for (let i = 0; i < cyc.outputEvents.length; i++) {
                const [offset] = cyc.outputEvents[i];
                if (offset <= elapsed) idx = i;
                else break;
            }
            return idx;
        }

        /** The actual leaf value in effect `elapsed` ticks into cyc's current
         * period, recursing through nested SubRefs. Pure. Public because
         * syncedValue() (a free function, needed by any Group implementation)
         * has to reach it for a sleeping sibling pin. */
        _leafValueAt(cyc: CycleLike, elapsed: number): boolean {
            const [offset, entry] = cyc.outputEvents[this._indexAt(cyc, elapsed)];
            if (!(entry instanceof SubRef)) return entry;
            const intoSpan = elapsed - offset;
            return this._leafValueAt(entry.cycle, ((intoSpan % entry.cycle.cycleTime) + entry.cycle.cycleTime) % entry.cycle.cycleTime);
        }

        /** Like _leafValueAt, but also sets up cycleParent/cycleSpanEnd/currentOutputEvent
         * on every Cycle descended through, so a subsequent _advance() call can
         * continue traversal from exactly this point. refTime is the absolute
         * time elapsed=0 of cyc's current period corresponds to. Only used to
         * seed the backfill cursor when an element falls asleep. */
        _descendTo(cyc: CycleLike, elapsed: number, refTime: number):
            { cycle: CycleLike; idx: number; elapsed: number; refTime: number } {
            const idx = this._indexAt(cyc, elapsed);
            const [offset, entry] = cyc.outputEvents[idx];
            cyc.currentOutputEvent = idx;
            if (!(entry instanceof SubRef)) return { cycle: cyc, idx, elapsed, refTime };
            const sub = entry.cycle;
            sub.cycleParent = cyc;
            sub.cycleSpanEnd = refTime + offset + entry.span;
            const intoSpan = elapsed - offset;
            const localElapsed = ((intoSpan % sub.cycleTime) + sub.cycleTime) % sub.cycleTime;
            const subRefTime = refTime + offset + (intoSpan - localElapsed);
            sub.activationTime = subRefTime;
            return this._descendTo(sub, localElapsed, subRefTime);
        }

        /** How many ticks into our OWN root period "now" corresponds to. Uses
         * rootPhaseZero (fixed once at promotion time) rather than walking
         * currentCycle's possibly-nested position - see doc.txt section 6 for
         * why the latter silently drops repeat counts. */
        _rootElapsed(): number {
            return ((this.scheduler.currentTime - this.rootPhaseZero) % this.cycleTime + this.cycleTime) % this.cycleTime;
        }

        /** Read our value as of right now. Prefer this over .value directly for
         * anything outside the trust/wake graph, since .value is only lazily
         * corrected at wake() time and can be stale while Asleep. */
        currentValue(): boolean {
            if (this.state !== State.Asleep) return this.value;
            const elapsed = ((this.scheduler.currentTime - this.sleepBase) % this.cycleTime + this.cycleTime) % this.cycleTime;
            return this._leafValueAt(this, elapsed);
        }

        /** Our value as of `time`, which may be earlier than right now -
         * unlike currentValue(), which only ever answers "as of this
         * instant". Valid for Active/Asleep: rootPhaseZero is fixed for our
         * current schedule's whole lifetime, so replaying via
         * _leafValueAt works for ANY `time` within that schedule's span,
         * independent of where our live self-driving currently happens to
         * be positioned. If `time` predates our current schedule (we're
         * currently Passive, or we've since demoted and possibly
         * re-promoted), fall back to history: it's gapless everywhere
         * except an Asleep stretch, and a demote doesn't itself append
         * anything, so the last recorded change at or before `time` is the
         * exact answer. Only falls back to currentValue() if `time`
         * predates our very first recorded change. */
        valueAt(time: number): boolean {
            if (this.state !== State.Passive && time >= this.rootPhaseZero) {
                const elapsed = ((time - this.rootPhaseZero) % this.cycleTime + this.cycleTime) % this.cycleTime;
                return this._leafValueAt(this, elapsed);
            }
            const hist = this.history;
            for (let i = hist.length - 1; i >= 0; i--) {
                if (hist[i][0] <= time) return hist[i][1];
            }
            // `time` predates our very first recorded change. In principle
            // initialValue (captured when that first entry was pushed -
            // see _pushHistory) should be the exact answer here rather than
            // currentValue() (which can already reflect a change committed
            // THIS SAME TICK by an earlier-tier same-batch sibling, one
            // that hasn't happened yet as of `time` - a confirmed real bug
            // in a carry computation, traced directly to this fallback).
            // BUT: using initialValue here traded that bug for a different,
            // not-yet-understood regression elsewhere (two previously-
            // passing baseline-comparison tests started diverging late
            // into long runs once this changed) - reverted to currentValue()
            // until that's root-caused; _pushHistory/initialValue are left
            // in place (harmless, and correctly maintained) for whoever
            // picks this back up. See the "purely downstream" and "3-input
            // NOR" regression tests in DigitalElm.test.ts.
            return this.currentValue();
        }

        /** Did we transition to targetValue at some point in (since, until]?
         * This is the primitive edge detection actually needs - not "what was
         * my value an instant before now," but "did the relevant edge occur
         * anywhere in the window since the caller last checked." Returns the
         * absolute time of the LATEST matching transition (so a caller can
         * sample some OTHER element's valueAt() pinned to that exact edge -
         * see valueAt()'s own docstring for why "current" isn't safe once an
         * element only catches up to a stale edge late), or null if there
         * wasn't one.
         *
         * Scans backward from the end of history, not history.some()'s
         * forward-from-index-0 order: the (since, until] window is almost
         * always just the most recent entry or two (edge detection is
         * typically checked right after the edge it's looking for), but
         * history is append-only and never trimmed (see the "active" commit
         * case's own comment on why it keeps growing forever even while
         * Active) - a forward scan has to walk the ENTIRE history array
         * before reaching a match near the end. That's O(history length)
         * per call, and since history length itself grows with every real
         * tick this element or its watchers process, a hot edge-detection
         * path (CounterElm/DFlipFlopElm/JKFlipFlopElm's own evaluate()) that
         * never gets a chance to let its watched input sleep - e.g. because
         * something ELSE downstream never trusts it - turns into O(n) work
         * on an ever-growing n, i.e. calls keep getting slower over the
         * lifetime of the simulation even though each one is only looking at
         * a tiny recent window. Walking backward instead stops as soon as it
         * passes `since` (history is sorted ascending by tick, so nothing
         * earlier could match either), making this O(entries actually in
         * the window) - typically O(1) - regardless of how much history has
         * piled up. A real perf bug found live via a SevenSegDecoderElm
         * whose output never fully settled into being trusted, keeping an
         * upstream counter/clock's history growing forever while this scan
         * kept re-walking all of it. */
        transitionedTo(targetValue: boolean, since: number, until: number): number | null {
            if (this.state === State.Asleep) this._backfillHistory(until);
            const hist = this.history;
            for (let i = hist.length - 1; i >= 0; i--) {
                const [t, v] = hist[i];
                if (t <= since) break; // ascending order - no earlier entry can be in (since, until] either
                if (t <= until && v === targetValue) return t;
            }
            return null;
        }

        /** We stopped recording into history while asleep. Replay every
         * transition our confirmed schedule says actually happened between
         * falling asleep and now, appending it to history. Resumable: picks up
         * from wherever it last left off. Walks the schedule one real
         * transition at a time via _advance(), never materializing a full flat
         * expansion. */
        _backfillHistory(now: number): void {
            for (;;) {
                const cyc = this.backfillCycle;
                const ix = cyc.currentOutputEvent;
                const elapsed = cyc.outputEvents[ix][0];
                const { leafValue, resolvedCycle, targetTime, commit } = this._advance(ix, elapsed, cyc, this.backfillTime);
                if (targetTime > now) break;
                commit();
                this._pushHistory(targetTime, leafValue);
                this.backfillCycle = resolvedCycle;
                this.backfillTime = targetTime;
            }
            if (this.backfillTime > this.lastChecked) this.lastChecked = this.backfillTime;
        }

        /** Called on an input we used to (partly) rely on trusting, when that
         * trust just broke - NOT necessarily because our own schedule was
         * ever shown to be wrong; the consumer that dropped us may simply
         * have demoted for reasons entirely local to itself (e.g. one of
         * its OTHER inputs mispredicted). Resume Active self-driving in
         * place from our existing schedule if a live evaluate() still
         * agrees with it right now - the same single-instant confirmation
         * the rest of the trust model already relies on to keep trusting an
         * established schedule (see Recheck's confirm path and the "active"
         * commit branch) - rather than unconditionally discarding a still-
         * good schedule and relearning periodicity from scratch. Only fully
         * demotes when that check actually fails.
         *
         * A single instant matching doesn't *prove* the rest of the
         * schedule is still valid (see doc.txt section 4) - but neither
         * does any other point where this same check is used to keep
         * trusting an existing schedule, so this isn't a weaker guarantee
         * than the rest of the system already accepts; if the schedule
         * really has gone stale, the normal Recheck/notifyOutputs path
         * catches it on the next real divergence, same as it always does
         * for a self-driving Active element. Was previously an unconditional
         * _demote(): a real bug found live, where a downstream element's own
         * (unrelated) mispredictions kept forcibly relearning an upstream
         * element's periodicity from scratch before it could ever
         * accumulate enough clean history to re-detect its own true
         * (shorter, more precise) period, so it settled on a cruder LCM-
         * based candidate instead - see the cross-coupled-NAND-latch
         * regression test below for how a purely downstream, non-feedback
         * consumer could corrupt an upstream element's own promoted period
         * this way. ClockElm previously needed its own wake() override to
         * avoid this same trap (safe in its case because it has no inputs,
         * so its schedule can never actually be wrong) - that override is
         * now redundant, since the `this.inputs.length === 0` case below
         * covers it identically. */
        wake(): void {
            if (this.sleepRequested) {
                // Never actually stopped ticking yet; just cancel the request.
                this.sleepRequested = false;
                return;
            }
            if (this.state !== State.Asleep) return;
            this._backfillHistory(this.scheduler.currentTime);
            this.value = this.currentValue();
            if (this.inputs.length === 0 || this.evaluate() === this.value) {
                const elapsed = this._rootElapsed();
                this.currentCycle = this;
                const idx = this._indexAt(this, elapsed);
                this.state = State.Active;
                this._advanceAndSchedule(idx, elapsed, this);
                return;
            }
            this._demote();
            this.scheduler.schedule(this.scheduler.currentTime + MIN_HOP_TICKS, this);
        }

        /** Called from the "active" commit branch once a previously-requested
         * sleep can actually take effect. Stops self-scheduling until wake(). */
        _enterSleep(): void {
            const elapsed = this._rootElapsed();
            this.sleepBase = this.scheduler.currentTime - elapsed;
            this.currentCycle = this; // done with live self-driving; abandon any nested position
            const d = this._descendTo(this, elapsed, this.sleepBase);
            this.backfillCycle = d.cycle;
            this.backfillTime = d.refTime + d.elapsed;
            this.sleepRequested = false;
            this.state = State.Asleep;
        }

        /** Called on an input right after one of its outputs starts trusting
         * it. If every output now trusts it, nobody needs its live value
         * anymore, so it can stop ticking once its in-flight event fires.
         * Deliberately no special case for zero outputs: vacuously true, so an
         * element nobody downstream reads is the easiest case to sleep, not an
         * excluded one. */
        // Public (despite the leading underscore), like wake() and
        // _leafValueAt() - called on OTHER instances' inputs from
        // _promote(), not just internally.
        _maybeSleep(): void {
            if (this.state !== State.Active || this.sleepRequested) return;
            if (this.liveOutputs.every(out => out.trustedInputs.has(this)))
                this.sleepRequested = true;
        }

        /** Absolute time c's own local elapsed=0 corresponds to - our
         * rootPhaseZero if c is our own root Cycle (self), else c's own
         * activationTime (set on entry - see _resolveLeaf/_descendTo). */
        _cycleAnchor(c: CycleLike): number {
            return c === (this as CycleLike) ? this.rootPhaseZero : (c.activationTime as number);
        }

        /** Tuple of (our own value, our inputs' current values) - the
         * DICE-style "input pattern" activationCheck() searches for repeats
         * of. Our own value has to be part of the pattern: an edge-
         * triggered element's future depends not just on its external
         * inputs but on its own previous state too. `ownValue` lets a
         * caller in prepare() supply the value THIS SAME event is about to
         * commit, rather than the stale pre-commit currentValue(). */
        _currentPattern(ownValue?: boolean): boolean[] {
            const own = ownValue === undefined ? this.currentValue() : ownValue;
            return [own, ...this.inputs.map(i => i.currentValue())];
        }

        /** Append `pattern` to inputPatternHistory (and index it into
         * inputPatternTable) if it differs from the last recorded pattern,
         * and update lastInputChange[j] for whichever input(s) actually
         * flipped. Called unconditionally from commit(), independent of our
         * own State, so a later demotion has continuous pattern history to
         * re-search. */
        _recordInputPattern(pattern: boolean[], now: number): void {
            const hist = this.inputPatternHistory;
            const prev = hist.length > 0 ? hist[hist.length - 1][1] : null;
            if (prev !== null && patternKey(prev) === patternKey(pattern)) return;
            if (prev !== null) {
                for (let j = 0; j < pattern.length - 1; j++)
                    if (prev[j + 1] !== pattern[j + 1]) this.lastInputChange[j] = now;
            } else {
                for (let j = 0; j < pattern.length - 1; j++) this.lastInputChange[j] = now;
            }
            const idx = hist.length;
            hist.push([now, pattern]);
            const key = patternKey(pattern);
            const list = this.inputPatternTable.get(key);
            if (list) list.push(idx); else this.inputPatternTable.set(key, [idx]);
            // A genuine pattern change starts a fresh "pattern epoch" - our
            // own occurrence search resumes from scratch, and every one of
            // our inputs becomes eligible to have ITS OWN search position
            // re-primed again the next time we recurse into it.
            this.firstInputTablePos = 0;
            this.firstInputMask = this.inputs.length ? (1 << this.inputs.length) - 1 : 0;
        }

        /** DICE parity (chip.cpp's deactivate_outputs(), called just before
         * a demote): we're demoting after a stretch [activationTime, now)
         * we were genuinely Active/Asleep for, which means that ENTIRE
         * stretch is proven periodic/self-consistent (we were self-driving
         * off a verified schedule, not live-evaluating). But commit()
         * unconditionally calls _recordInputPattern() the whole time
         * regardless of State, so inputPatternHistory kept accumulating
         * fine-grained entries throughout - meaning the occurrence recorded
         * for our pattern AT activationTime only appears to span up to the
         * next incidental blip a few ticks later, not the whole proven
         * stretch. Collapse every entry recorded during the stretch into
         * the one already in effect at activationTime, with its end pinned
         * to `now` - so a later re-verification attempt can find ONE wide
         * occurrence covering the whole previous activation, instead of
         * only ever rediscovering the same tiny window it started from.
         * Without this, cycleTime can never grow across repeated
         * promote/demote cycles. */
        _compressInputPatternHistory(activationTime: number | null): void {
            const hist = this.inputPatternHistory;
            if (hist.length === 0 || activationTime === null) return;
            let i = hist.length - 1;
            while (i >= 0 && hist[i][0] > activationTime) i -= 1;
            if (i < 0 || i === hist.length - 1) return; // nothing recorded since activationTime
            const now = this.scheduler.currentTime;
            for (let k = hist.length - 1; k > i; k--) {
                const pat = hist[k][1];
                const key = patternKey(pat);
                const lst = this.inputPatternTable.get(key);
                if (lst && lst[lst.length - 1] === k) {
                    lst.pop();
                    if (lst.length === 0) this.inputPatternTable.delete(key);
                }
                this.compressedEnd.delete(k);
                hist.pop();
            }
            this.compressedEnd.set(i, now);
        }

        /** DICE parity (chip.cpp's Chip::activation_check): has our current
         * input pattern already occurred somewhere in [minTime, maxTime),
         * with the entire upstream chain that produced it (recursively)
         * provably repeating in lockstep? If so, returns the absolute time
         * of that occurrence and records every element (self included)
         * whose own repeat was confirmed along the way into `resolved`, so
         * the caller can promote the whole verified chain at once (see
         * _cascadeActivate/tryPromote). Returns maxTime if no repeat is
         * found.
         *
         * Carries cross-call search-position memoization
         * (firstInputTablePos/firstInputMask): our own occurrence search
         * resumes from wherever it last left off instead of always
         * restarting at index 0, and each input we recurse into only has
         * ITS OWN search position reset once per "pattern epoch", not once
         * per call - without this, a chip whose own pattern changes slowly
         * (wide, sparse occurrences) checked repeatedly by a fast-changing
         * one (narrow candidate windows) can have every individual call
         * correctly fail to find an overlap while still never actually
         * walking forward far enough, across all those calls put together,
         * to reach the occurrence that would. */
        activationCheck(minTime: number, maxTime: number, resolved: Map<DigitalElmInstance, number>): number {
            this.checkVisited = true;
            try {
                const globalTime = this.scheduler.currentTime;
                const pattern = this._currentPattern();
                const occurrences = this.inputPatternTable.get(patternKey(pattern)) ?? [];
                let pos = this.firstInputTablePos;
                while (pos < occurrences.length) {
                    const idx = occurrences[pos];
                    const startTime = this.inputPatternHistory[idx][0];
                    const compressed = this.compressedEnd.get(idx);
                    let endTime: number;
                    if (compressed !== undefined) endTime = compressed;
                    else if (idx + 1 < this.inputPatternHistory.length) endTime = this.inputPatternHistory[idx + 1][0];
                    else endTime = globalTime;
                    const lo0 = Math.max(minTime, startTime);
                    const hi0 = Math.min(maxTime, endTime);
                    if (lo0 >= maxTime) {
                        // This occurrence isn't advanced past (pos left
                        // as-is), since it may still be relevant to a later
                        // call with a wider maxTime.
                        maxTime = lo0;
                        break;
                    }
                    if (lo0 >= hi0) {
                        pos += 1;
                        continue;
                    }
                    let lo = lo0, hi = hi0;
                    let activationTime = lo;
                    let ok = true;
                    for (let j = 0; j < this.inputs.length; j++) {
                        const inp = this.inputs[j];
                        if (this.lastInputChange[j] <= lo) continue;
                        if (inp.state === State.Active) {
                            let c: CycleLike = inp.currentCycle;
                            let found = false;
                            let actMin: number | null = null;
                            for (;;) {
                                const anchor = inp._cycleAnchor(c);
                                const m = Math.max(lo, anchor);
                                if (actMin === null || m < actMin) actMin = m;
                                if (m < hi) {
                                    const at = m + (((globalTime - m) % c.cycleTime) + c.cycleTime) % c.cycleTime;
                                    if (at < actMin) actMin = at;
                                    if (at < hi) {
                                        lo = at; hi = at + 1; activationTime = at; found = true;
                                        break;
                                    }
                                }
                                if (c === (inp as CycleLike) || c.cycleParent === null) break;
                                c = c.cycleParent;
                            }
                            // Unconditional, even on failure - this is what
                            // lets a later occurrence attempt (in this call,
                            // or a future call via firstInputTablePos
                            // memoization) pick up from how far this failed
                            // attempt actually got, instead of restarting
                            // from the original minTime every single time.
                            minTime = Math.min(actMin as number, this.lastInputChange[j]);
                            if (!found) { ok = false; break; }
                        } else if (inp.state === State.Passive && !inp.checkVisited) {
                            if ((this.firstInputMask >> j) & 1) {
                                inp.firstInputTablePos = 0;
                                inp.firstInputMask = inp.inputs.length ? (1 << inp.inputs.length) - 1 : 0;
                                this.firstInputMask &= ~(1 << j);
                            }
                            const at = inp.activationCheck(lo, hi, resolved);
                            minTime = Math.min(at, this.lastInputChange[j]);
                            if (at >= hi) { ok = false; break; }
                            lo = at; hi = at + 1; activationTime = at;
                        }
                        // Passive+already-visited, or Asleep: fine as-is.
                    }
                    if (!ok) { pos += 1; continue; }
                    resolved.set(this, activationTime);
                    // Left at `pos` itself (not advanced past it): a repeat
                    // search starting from here re-tries this same
                    // occurrence first.
                    this.firstInputTablePos = pos;
                    return activationTime;
                }
                this.firstInputTablePos = pos;
                return maxTime;
            } finally {
                this.checkVisited = false;
            }
        }

        /** Leftmost index i such that history[i][0] > t. history is
         * append-only in increasing time order, so this is a valid binary
         * search target - used instead of a linear scan since history can
         * be very large for an element that's been stably periodic for a
         * long time. */
        _historyUpperBound(t: number): number {
            const h = this.history;
            let lo = 0, hi = h.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (h[mid][0] <= t) lo = mid + 1; else hi = mid;
            }
            return lo;
        }

        /** Promote using a verified activationTime from activationCheck,
         * reusing our own already-recorded output history for the window it
         * implies - valid because the entire causal chain feeding us was
         * just proven to repeat over that span, so the same evaluate()
         * over it already produced the correct output sequence. */
        _promoteFromActivation(activationTime: number, activeInputs: DigitalElmInstance[] = []): void {
            const now = this.scheduler.currentTime;
            const period = now - activationTime;
            const i0 = this._historyUpperBound(activationTime);
            const i1 = this._historyUpperBound(now);
            const window = this.history.slice(i0, i1);
            if (window.length === 0) return;
            // A pattern-level match (from inputPatternHistory, which can
            // include transient mid-propagation-delay checkpoints) doesn't
            // always imply real output-level periodicity - verify the
            // boundary directly against history before trusting it.
            const boundaryValue = i0 > 0 ? this.history[i0 - 1][1] : this.currentValue();
            if (boundaryValue !== this.value) return;
            this._promote(period, window, activeInputs);
        }

        /** Check whether our recorded history is now periodic and, if so,
         * switch to Active so we can predict future output without depending
         * on live input evaluation. Primary path is activationCheck() - a
         * real proof of periodicity against upstream elements' own already-
         * verified cycles - falling back to a simpler LCM/empirical guess
         * only to bootstrap a first period before any pattern history
         * exists yet. */
        tryPromote(): void {
            if (!DigitalCore.promotionEnabled) return;
            if (this.state !== State.Passive || this.inputs.length === 0) return;

            if (this.inputPatternHistory.length > 0) {
                const resolved = new Map<DigitalElmInstance, number>();
                const now = this.scheduler.currentTime;
                const at = this.activationCheck(this.inputPatternHistory[0][0], now, resolved);
                if (at < now) {
                    cascadeActivate(resolved);
                    return;
                }
            }

            const candidates: number[] = [];
            const activeInputs = this.inputs.filter(i => i.state === State.Active && i.cycleTime > 0);
            if (activeInputs.length === this.inputs.length)
                candidates.push(lcm(activeInputs.map(i => i.cycleTime)));
            for (const p of (this as DigitalElmInstance).extraPromotionCandidates?.() ?? [])
                if (!candidates.includes(p)) candidates.push(p);
            for (const p of this._empiricalCandidates())
                if (!candidates.includes(p)) candidates.push(p);

            if (this.digitalDebug)
                console.log("[digital] tryPromote", (this as any).getClassName?.() ?? this, "candidates=", candidates);

            // Prefer the SMALLEST candidate that verifies - the true,
            // minimal period, not an artificially inflated exact multiple
            // of it (which is also, trivially, "a period" by _matchPeriod's
            // two-window check, but produces a flat schedule with no
            // relationship to the compact SubRef proof structure genuine
            // compounding builds). Filter out any candidate that's an exact
            // multiple of a smaller one already in the list.
            const filtered = candidates.filter(p => !candidates.some(q => q < p && p % q === 0));
            filtered.sort((a, b) => a - b);

            for (const p of filtered) {
                const window = this._matchPeriod(p);
                if (window !== null) {
                    this._promote(p, window, activeInputs);
                    return;
                }
            }
        }

        /** Guess candidate periods from gaps to earlier same-valued events. */
        _empiricalCandidates(): number[] {
            if (this.history.length < 2) return [];
            const [now, val] = this.history[this.history.length - 1];
            const candidates: number[] = [];
            for (let i = this.history.length - 2; i >= 0; i--) {
                const [t, v] = this.history[i];
                if (v === val) {
                    const p = now - t;
                    if (p > 0) candidates.push(p);
                    if (candidates.length >= 4) break;
                }
            }
            return candidates;
        }

        /** If our history's last `windows` windows of length `period` all
         * match exactly (same value sequence, each offset from the most
         * recent window by an exact multiple of `period`), return the most
         * recent window. `windows` defaults to 2, the minimum needed to
         * call anything "periodic" at all. */
        _matchPeriod(period: number, windows: number = 2): [number, boolean][] | null {
            if (!period || period <= 0 || windows < 2) return null;
            const now = this.scheduler.currentTime;
            const hist = this.history;
            if (hist.length === 0 || hist[0][0] > now - windows * period)
                return null; // not enough history yet to prove `windows` full periods
            // Backward scan, not history.filter() (which always walks the
            // WHOLE array): the windows we want are right at the end of
            // this ever-growing, append-only log - see transitionedTo()'s
            // docstring for the same reasoning and the real perf bug this
            // mirrors (tryPromote() calls this on every value change, so an
            // O(history length) scan here compounds the same way).
            const buckets: [number, boolean][][] = Array.from({ length: windows }, (): [number, boolean][] => []);
            // Same-tick "double commit" entries (multiple delta-round
            // batches settling within one simulated instant - see
            // digital/DigitalElm.ts's own docstring on that being a
            // harmless, expected artifact) collapse to just the final,
            // settled value at that tick: keeping every intermediate flip
            // would bake them into outputEvents as multiple scheduled
            // events sharing one timestamp, which a self-driven replay
            // later can't actually reproduce faithfully - a real bug found
            // live. Each such baked pair requires evaluate() to be checked
            // twice at the identical tick, but the SECOND check's own
            // edge-detection watermark (e.g. CounterElm/DFlipFlopElm's
            // lastClockChecked) has already been advanced by the first, so
            // it correctly reports "no new edge" instead of reproducing the
            // second, transient value the original live recording happened
            // to see - a genuine mismatch against the baked schedule,
            // causing a demote immediately after every promotion, forever.
            // Scanning backward (latest first), the first entry seen at any
            // given timestamp is already the final one, so any earlier
            // (chronologically) duplicate at that same timestamp is simply
            // skipped.
            let lastKeptTime: number | null = null;
            for (let i = hist.length - 1; i >= 0; i--) {
                const [t, v] = hist[i];
                if (t === lastKeptTime) continue;
                const age = now - t;
                const w = Math.floor(age / period);
                if (w >= windows) break;
                buckets[w].push([t, v]);
                lastKeptTime = t;
            }
            for (const b of buckets) b.reverse();
            const mostRecent = buckets[0];
            if (mostRecent.length === 0) return null;
            for (let w = 1; w < windows; w++) {
                if (buckets[w].length !== mostRecent.length) return null;
                for (let i = 0; i < mostRecent.length; i++) {
                    const [t1, v1] = buckets[w][i], [t2, v2] = mostRecent[i];
                    if (v1 !== v2 || t2 - t1 !== w * period) return null;
                }
            }
            return mostRecent;
        }

        /** Verify that flat `events` (offsets relative to w0, the very
         * first entry of the whole new window), starting at index i,
         * matches `cycle` played back cyclically from rotation index
         * startIdx, for exactly `wantTicks` of relative time, landing
         * exactly on a cycle.outputEvents boundary. `timeBase` is where
         * this span starts, in the same relative-offset space as `events`.
         * Recursing into a nested SubRef entry costs O(len(that sub-
         * cycle's own outputEvents)), never O(how many ticks or reps it
         * spans) - trusts the SubRef's own span (already verified as an
         * exact whole number of its nested cycle's reps when IT was built)
         * rather than re-walking every leaf inside it. This is what lets
         * compression compound across repeated re-promotions instead of
         * being blocked the moment previousCycle itself contains a nested
         * SubRef. Returns the number of `events` entries consumed if the
         * match holds for the full span, else null. */
        _matchFlatSpan(
            events: OutputEvent[], i: number, w0: number, timeBase: number,
            cycle: CycleLike, startIdx: number, wantTicks: number,
        ): number | null {
            const n = cycle.outputEvents.length;
            let idx = startIdx;
            const base = cycle.outputEvents[startIdx][0];
            let wrap = 0;
            let consumedTicks = 0;
            let consumedEvents = 0;
            while (consumedTicks < wantTicks) {
                const [offset, val] = cycle.outputEvents[idx];
                const rel = wrap + offset - base;
                let nxtRaw: number;
                if (idx + 1 < n) nxtRaw = cycle.outputEvents[idx + 1][0];
                else nxtRaw = cycle.cycleTime + cycle.outputEvents[0][0];
                const duration = nxtRaw - offset;
                if (val instanceof SubRef) {
                    if (consumedTicks + val.span > wantTicks) return null;
                    const got = this._matchFlatSpan(events, i + consumedEvents, w0, timeBase + rel, val.cycle, 0, val.span);
                    if (got === null) return null;
                    consumedEvents += got;
                    consumedTicks += val.span;
                } else {
                    if (i + consumedEvents >= events.length) return null;
                    const [wOffset, wVal] = events[i + consumedEvents];
                    if (wVal !== val || (wOffset - w0) !== (timeBase + rel)) return null;
                    consumedEvents += 1;
                    consumedTicks += duration;
                }
                idx += 1;
                if (idx === n) { idx = 0; wrap += cycle.cycleTime; }
            }
            if (consumedTicks !== wantTicks) return null;
            return consumedEvents;
        }

        /** How many full periods of `cycle` (possibly previousCycle itself,
         * possibly nested - reached via _matchFlatSpan's own SubRef
         * recursion), walked cyclically starting at index `start`, exactly
         * match the beginning of `events`. */
        _matchRotation(events: OutputEvent[], cycle: CycleLike, start: number): { reps: number; tail: OutputEvent[] } {
            const w0 = events[0][0];
            let reps = 0, i = 0;
            for (;;) {
                const consumed = this._matchFlatSpan(events, i, w0, reps * cycle.cycleTime, cycle, start, cycle.cycleTime);
                if (consumed === null) break;
                reps += 1;
                i += consumed;
            }
            return { reps, tail: events.slice(i) };
        }

        /** A new, small Cycle holding cycle.outputEvents walked cyclically
         * starting at index `start`, with offsets renormalized so the first
         * entry sits at offset 0. Nested SubRef entries are carried over
         * as-is (same cycle reference, only their own top-level offset
         * renormalized) - their own internal structure doesn't need to be
         * re-flattened here. */
        _rotatedCycle(cycle: CycleLike, start: number): Cycle {
            const n = cycle.outputEvents.length;
            const base = cycle.outputEvents[start][0];
            const rotated: OutputEvent[] = [];
            let idx = start, wrap = 0;
            for (let i = 0; i < n; i++) {
                const [offset, val] = cycle.outputEvents[idx];
                rotated.push([wrap + offset - base, val]);
                idx++;
                if (idx === n) { idx = 0; wrap += cycle.cycleTime; }
            }
            return new Cycle(rotated, cycle.cycleTime);
        }

        /** (distance, rotated): the next genuine transition in `cycle`
         * strictly after local offset `after` (0 <= after < cycle.cycleTime),
         * at any nesting depth - descending into a SubRef only as far as
         * its own recorded span actually reaches (a SubRef's span is
         * generally NOT an exact multiple of its nested cycle's own
         * cycleTime - it's cut off wherever the window that produced it
         * happened to end - so "the next transition" is sometimes the
         * SubRef's own end, not something inside it). `distance` is in
         * (0, cycle.cycleTime]. `rotated` is a new Cycle (same cycleTime as
         * `cycle`) with that transition at its own offset 0 - reusing
         * existing nested Cycle objects wherever possible rather than
         * re-flattening them, so compression compounds across repeated
         * re-promotions instead of collapsing back to a size that blocks
         * any further match (a confirmed real bug: once a previousCycle
         * held only a single top-level SubRef entry, a purely-flat search
         * over top-level entries alone had nothing left to find,
         * permanently blocking further growth). */
        _nextTransition(cycle: CycleLike, after: number): { distance: number; rotated: Cycle } {
            const idx = this._indexAt(cycle, after);
            const [offset, entry] = cycle.outputEvents[idx];
            if (entry instanceof SubRef) {
                const spanEnd = offset + entry.span;
                if (after < spanEnd) {
                    const nestedAfter = ((after - offset) % entry.cycle.cycleTime + entry.cycle.cycleTime) % entry.cycle.cycleTime;
                    const { distance: nd, rotated: nestedRotated } = this._nextTransition(entry.cycle, nestedAfter);
                    if (nd <= spanEnd - after) {
                        const target = after + nd;
                        const remaining = spanEnd - target;
                        const lead = target - offset;
                        const n = cycle.outputEvents.length;
                        const rotated: OutputEvent[] = [[0, new SubRef(nestedRotated, remaining)]];
                        let i = idx + 1, wrap = 0;
                        for (;;) {
                            if (i === n) { i = 0; wrap += cycle.cycleTime; }
                            if (i === idx) break;
                            const [o, e] = cycle.outputEvents[i];
                            rotated.push([wrap + o - target, e]);
                            i += 1;
                        }
                        if (lead > 0) rotated.push([wrap + offset - target, new SubRef(entry.cycle, lead)]);
                        return { distance: nd, rotated: new Cycle(rotated, cycle.cycleTime) };
                    }
                    // else: this SubRef's own span ends before its nested
                    // cycle would naturally transition again (a partial
                    // final rep) - fall through to "next top-level entry",
                    // same as a plain leaf.
                }
            }
            const n = cycle.outputEvents.length;
            const nextIdx = (idx + 1) % n;
            let nextOffset = cycle.outputEvents[nextIdx][0];
            if (nextIdx <= idx) nextOffset += cycle.cycleTime;
            return { distance: nextOffset - after, rotated: this._rotatedCycle(cycle, nextIdx) };
        }

        /** If `events` (one full new period, offsets already 0-based) begins
         * with some whole number of exact repeats of previousCycle's own
         * pattern - at ANY phase rotation of it, not just literally
         * starting at the old cycle's own offset-0 entry. The old cycle's
         * phase-zero is wherever an unrelated, earlier real event happened
         * to land; there's no reason to expect it lines up with this new
         * window's own start. The rotation to try is fully determined (via
         * _nextTransition) by the actual absolute-time offset between the
         * two phase-zeros - there's exactly one candidate alignment, not
         * one to search for among many. previousCycle may itself already
         * contain nested SubRef entries (from an earlier compression) -
         * _matchRotation recurses through those via _matchFlatSpan rather
         * than requiring a flat comparison, so compression compounds
         * across repeated re-promotions instead of only ever firing once
         * per element. Returns (reps, tail, sub): sub is the
         * already-rotated Cycle that was actually verified (a throwaway
         * placeholder if nothing compressed) - the old cycle's own
         * phase-zero is almost never where the match actually starts, so
         * embedding old.outputEvents unrotated as the SubRef's target
         * would silently replay the wrong values. Returns (0, events,
         * <unused>) if there's nothing to compress against, or the implied
         * rotation doesn't produce a repeat. */
        _splitRepeatingPrefix(events: OutputEvent[]): { reps: number; tail: OutputEvent[]; sub: Cycle | null } {
            const old = this.previousCycle;
            if (old === null || old.outputEvents.length === 0) return { reps: 0, tail: events, sub: null };
            if (events.length === 0) return { reps: 0, tail: events, sub: null };
            const oldPeriod = old.cycleTime;
            if (this.previousRootPhaseZero === null || !oldPeriod) return { reps: 0, tail: events, sub: null };

            const phaseDiff = ((this.rootPhaseZero - this.previousRootPhaseZero) % oldPeriod + oldPeriod) % oldPeriod;
            const { rotated: sub } = this._nextTransition(old, phaseDiff);
            const { reps, tail } = this._matchRotation(events, sub, 0);
            if (reps === 0) return { reps: 0, tail: events, sub: null };
            return { reps, tail, sub };
        }

        _promote(period: number, window: [number, boolean][], provenInputs: DigitalElmInstance[]): void {
            const now = this.scheduler.currentTime;
            const base = now - period;
            this.rootPhaseZero = base;
            const events: OutputEvent[] = window.map(([t, v]) => [t - base, v]);
            const { reps, tail, sub } = this._splitRepeatingPrefix(events);
            if (reps >= 2 && sub !== null) {
                // tail can be genuinely empty - the window is an EXACT whole
                // number of reps, nothing left over - and that's not a
                // reason to skip compressing: the SubRef's span then just
                // reaches to this period's own end. Skipping compression in
                // this case would leave outputEvents as the full flat
                // `events` list, which a later re-promotion's shorter
                // window could then never compound onto (previousCycle's
                // own entry count - n_old - would stay too large).
                const w0 = events[0][0];
                const span = (tail.length > 0 ? tail[0][0] : period) - w0;
                this.outputEvents = [[w0, new SubRef(sub, span)], ...tail];
            } else {
                this.outputEvents = events;
            }
            this.cycleTime = period;
            this.state = State.Active;
            this.firstOutputEvent = 0;
            this.currentCycle = this; // fresh promotion: start clean at the root
            this.trustedInputs = new Set(provenInputs);
            // rootPhaseZero is `now - period` by construction (above), so
            // we are always exactly one full period past it - i.e.
            // elapsed=0, always, whether `now` is the instant our own last
            // recorded value change happened (the direct tryPromote()
            // caller) or not (a force-activated elem cascaded in from
            // someone else's activationCheck - see cascadeActivate()):
            // elapsed doesn't depend on which. ix=-1 (mirroring
            // _indexAt's own "before the first offset wraps to the last
            // entry" convention) + explicit elapsed=0 correctly finds the
            // next real transition (index 0) at delay outputEvents[0][0]
            // regardless. Passing outputEvents.length-1 with elapsed
            // defaulting to that entry's own offset instead is only
            // correct when "now" and "elem's last change" coincide; for a
            // cascaded, not-this-tick elem it silently computes the wrong
            // delay to the next transition - concretely, a confirmed real
            // bug once _promoteFromActivation() started calling this for
            // elements that didn't just change value on this exact tick.
            this._advanceAndSchedule(-1, 0);
            // These inputs may have just become fully unwatched.
            for (const inp of provenInputs) inp._maybeSleep();
            // One of our own outputs may already have been trusting us from an
            // earlier promotion of its own - give it a fresh chance to notice.
            this._maybeSleep();
        }

        /** Override in derived classes to compute the element's value.
         * `sender` (optional) is the specific input whose change triggered this
         * call - undefined/null means a normal live re-evaluation. Subclasses
         * doing edge detection use this to scope which input's edge they
         * actually need to re-derive. */
        abstract evaluate(sender?: DigitalElmInstance | null): boolean;
    }
    return Digital;
}

/** Backing store for the "one static per concept, shared across every
 * withDigital() application" fields (promotionEnabled, current). A plain
 * mixin would give GateElm and ChipElm each their OWN static, which is
 * wrong - there is exactly one digital circuit/scheduler in play at a time
 * regardless of how many base classes got mixed with DigitalElm. */
class DigitalCore {
    static promotionEnabled = true;
    static current: Scheduler;
}

/** Standalone base class for digital elements with no other identity (used
 * by GroupPin below). Real circuit elements instead do
 * `class GateElm extends withDigital(CircuitElm) { ... }` directly. */
export const DigitalElm = withDigital(class {});
export type DigitalElm = InstanceType<typeof DigitalElm>;

/** Hashable key for a pattern tuple (see _currentPattern()), used to index
 * inputPatternTable - a plain array can't be a Map key by value, so encode
 * each boolean as a `0`/`1` character. */
function patternKey(pattern: boolean[]): string {
    let s = "";
    for (const b of pattern) s += b ? "1" : "0";
    return s;
}

/** Force-activate every element a successful activationCheck chain
 * verification touched, not just the element that called it - mirroring
 * chip.cpp's activate_inputs(), which unconditionally activates any still-
 * Passive driver whose input changed since our activationTime, rather than
 * waiting for that driver to independently rediscover its own periodicity
 * later. Without this, a driver that gets torn down every time it notifies
 * an untrusted output can never stay Active long enough for the output's own
 * activationCheck to verify it, so nothing ever settles - the output keeps
 * re-deriving the same schedule from scratch forever. Shared by tryPromote()
 * (self's own periodic-history check) and inputUpdated() (DICE's
 * update_inputs()-triggered immediate re-verification) - same cascade
 * either way. */
function cascadeActivate(resolved: Map<DigitalElmInstance, number>): void {
    for (const [elem, elemAt] of resolved) {
        if (elem.state === State.Passive && elem.history.length > 0) {
            // Trust every input that changed since elem's own verified
            // activation point - not just the ones verified via the
            // Active cycle-chain branch: one verified via the Passive-
            // recursive branch instead (now itself force-activated here
            // too, possibly later in this same loop) is just as
            // trustworthy.
            const trusted = elem.inputs.filter((inp, j) => elem.lastInputChange[j] > elemAt);
            elem._promoteFromActivation(elemAt, trusted);
        }
    }
}

/** element's value as of just before `now`'s current batch of commits -
 * what a same-timestamp sibling needs when reading another element as part
 * of its own prepare(). See doc.txt section 8 for why Asleep is the one
 * case needing a 1-tick-earlier read. */
export function syncedValue(element: DigitalElmInstance, now: number): boolean {
    if (element.state === State.Asleep) {
        const elapsed = ((now - 1 - element.sleepBase) % element.cycleTime + element.cycleTime) % element.cycleTime;
        return element._leafValueAt(element, elapsed);
    }
    return element.currentValue();
}

/** One output bit of a multi-output Group (e.g. one bit of an N-bit
 * counter chip). Inherits all of DigitalElm's periodicity machinery
 * unchanged; computing its raw new value is delegated to the shared Group,
 * since that needs to see the whole register's state (e.g. for carry
 * propagation), which a single bit can't do on its own. Safe under the
 * scheduler's two-phase batching (see syncedValue) regardless of how many
 * sibling pins share an exact timestamp. */
export interface Group {
    inputs: DigitalElmInstance[];
    evaluate(pin: GroupPin, sender: DigitalElmInstance | null): boolean[];
    /** Optional hook: analytically-known candidate periods tryPromote()
     * should try with the same confidence as its own provenInputs-derived
     * LCM candidate (2-window match), not the extra scrutiny given to a
     * purely empirical guess - see DigitalElmInstance.extraPromotionCandidates()'s
     * docstring for why this exists and CounterElm's implementation for a
     * concrete example (a nonzero modulus's true period isn't derivable
     * from any input's own cycleTime at all, since the modulus is internal
     * configuration invisible to the generic engine). */
    extraPromotionCandidates?(pin: GroupPin): number[];
    /** Optional hook: ticks a pin should wait after an input change before
     * re-evaluating - see the Digital mixin's own propagationDelayTicks() docstring.
     * Absent means "no chip-specific delay", so GroupPin falls back to the
     * base MIN_HOP_TICKS default, same as any other digital element. */
    propagationDelayTicks?(pin: GroupPin): number;
    /** Optional hook: sibling pins (of the same Group) this pin's own next
     * value depends on beyond the shared clk/reset/etc. inputs - e.g. a
     * counter bit's own next value also depends on the carry from every
     * lower-weight bit (CounterElm.evaluate() reads this.digitalPins
     * directly for that, bypassing pin.inputs entirely). Absent means "no
     * extra dependencies" (the common case - e.g. DFlipFlopElm's Q/notQ
     * pair, each computed purely from D/clk/reset independent of the
     * other). This exists purely for activationCheck()'s benefit, not
     * evaluate(): a pin's own recorded input pattern (ownValue + every
     * pin.inputs' value) has to be a genuinely SUFFICIENT statistic for
     * predicting the pin's future, or activationCheck can find spurious
     * "repeats" of just the shared clk/reset that don't actually
     * correspond to a real repeat of this pin's value once its true next
     * value also depends on sibling state activationCheck can't otherwise
     * see - see CounterElm's implementation for the concrete case. */
    extraPeriodicityInputs?(pin: GroupPin): DigitalElmInstance[];
}

export class GroupPin extends DigitalElm {
    constructor(public group: Group, public index: number) {
        super();
    }

    extraPromotionCandidates(): number[] {
        return this.group.extraPromotionCandidates?.(this) ?? [];
    }

    propagationDelayTicks(): number {
        return this.group.propagationDelayTicks?.(this) ?? MIN_HOP_TICKS;
    }

    evaluate(sender: DigitalElmInstance | null = null): boolean {
        return this.group.evaluate(this, sender)[this.index];
    }
}

/** An input permanently fixed at `v`, with no inputs of its own (so it
 * stays Passive forever - tryPromote() is a no-op with zero inputs). Used
 * by circuit wiring for a digital input post with nothing actually driving
 * its node, mirroring how the analog solver's connectUnconnectedNodes()
 * already grounds a floating node rather than erroring. */
export class DigitalConst extends DigitalElm {
    constructor(v: boolean) {
        super();
        this.value = v;
    }
    evaluate(): boolean { return this.value; }
}
