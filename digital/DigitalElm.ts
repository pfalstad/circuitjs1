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
    constructor(public outputEvents: OutputEvent[], public cycleTime: number) {}
}

/** A non-leaf outputEvents entry: instead of a plain boolean, replay
 * `cycle` (wrapping every cycle.cycleTime) for `span` ticks starting here,
 * before returning to whatever comes after this entry. */
export class SubRef {
    constructor(public cycle: Cycle, public span: number) {}
}

/** Marker arg for a scheduled event meaning "an untrusted input changed,
 * re-derive and confirm-or-demote" - as opposed to a plain boolean (an
 * Active element's own predicted next output) or null (a generic Passive
 * re-evaluation). Scheduled with zero delay (see inputUpdated()) so the
 * scheduler's delta-cycle batching handles it. */
export class Recheck {
    /** alwaysDemote: skip the usual "does live evaluate() still match my
     * current prediction" confirmation and demote unconditionally. Used by
     * forceReconsider() (see DigitalElmInstance) when a formerly-Passive
     * input has just proven its own periodicity for the first time: a
     * consumer that already promoted without this input in its
     * trustedInputs (because the input was still Passive when the consumer
     * looked) may have built its schedule from an incomplete empirical
     * match that only looked periodic because this input's own real
     * variation simply hadn't been observed yet within that window - a
     * plain value-confirming Recheck wouldn't catch that until the
     * specific instant the values happen to actually diverge, which can be
     * arbitrarily far in the future (see doc.txt's "known limitations" on
     * the two-window match not being a proof). */
    constructor(public sender: DigitalElmInstance | null, public alwaysDemote = false) {}
}

type Pending =
    | null
    | { kind: "confirm"; sender: DigitalElmInstance | null }
    | { kind: "demote" }
    | { kind: "active"; val: boolean }
    | { kind: "passive"; val: boolean };

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
    state: State;
    history: [number, boolean][];
    trustedInputs: Set<DigitalElmInstance>;
    sleepRequested: boolean;
    lastChecked: number;
    currentCycle: CycleLike;
    previousCycle: Cycle | null;
    rootPhaseZero: number;
    /** The tick rootPhaseZero was last set at - see the implementation
     * field's own docstring. Read cross-instance by tryPromote() (on
     * provenInputs), so it's part of the public interface unlike most other
     * internal bookkeeping fields here. */
    phaseStableSince: number;
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

    addInput(...elements: DigitalElmInstance[]): void;
    resetDigital(): void;
    notifyOutputs(): void;
    inputUpdated(sender?: DigitalElmInstance | null): void;
    /** Forces this element to unconditionally reconsider its own promotion
     * (a real demote-and-rederive, not just a value confirmation), even if
     * its currently-predicted value still happens to match live reality
     * right now. Called on liveOutputs that already promoted without
     * `fromInput` in their trustedInputs, when fromInput itself has just
     * newly proven its own periodicity - see Recheck's alwaysDemote
     * docstring for why a plain value-check isn't enough here. No-op if
     * this element is still Passive (it'll naturally reconsider via the
     * normal live-notification path once fromInput starts varying). */
    forceReconsider(fromInput: DigitalElmInstance): void;
    wake(): void;
    currentValue(): boolean;
    transitionedTo(targetValue: boolean, since: number, until: number): boolean;
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
    /** Optional: analytically-known candidate period(s) tryPromote() should
     * try with the same confidence as its own provenInputs LCM candidate,
     * for an element whose true period depends on internal configuration
     * the generic engine can't see from input periods alone (a Group's
     * hook - see Group.extraPromotionCandidates() - surfaces through here
     * via GroupPin's own implementation). Absent (undefined) for anything
     * with no such extra knowledge to offer - the overwhelmingly common
     * case - so tryPromote() only calls it via `?.()`. */
    extraPromotionCandidates?(): number[];
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
        state = State.Passive;
        history: [number, boolean][] = []; // append-only (abs_time, value) log, used for periodicity detection
        trustedInputs = new Set<DigitalElmInstance>(); // inputs whose future is already accounted for
        sleepRequested = false; // Active + all outputs now trust us; stop after the next tick
        lastChecked = 0; // end of the window already covered by an edge-detection check
        digitalDebug = false;
        // The cycleTime we last cascaded a liveOutputs forceReconsider()
        // for (0 = never promoted). Gates that cascade in _promote() to
        // fire only when our OWN period actually changes from what
        // liveOutputs may have already built their own schedules on top
        // of - not on every re-promotion (repeating it even when the
        // period comes out the same, e.g. a routine re-confirmation after
        // a demote, caused a real performance regression - see that
        // cascade's comment). Persists across a later demote (a demote
        // doesn't itself invalidate what liveOutputs already saw); only a
        // genuine period change needs to re-cascade.
        lastCascadedCycleTime = 0;
        // The tick our CURRENT rootPhaseZero was set at (0 = never
        // promoted). Set only by _promote() - wake()'s "resume same
        // schedule" path deliberately does NOT touch this, since it keeps
        // the existing rootPhaseZero unchanged. Lets tryPromote() tell
        // "this input has a correct cycleTime" apart from "this input's
        // absolute PHASE has actually settled" - see tryPromote()'s own use
        // of it for why that distinction matters: an input can flicker
        // through several different phase anchors (each with the same,
        // already-correct period) while it's still settling, and a
        // downstream consumer bootstrapping off history collected before
        // the input's LAST re-anchor can lock in a schedule matching a
        // phase the input has already abandoned.
        phaseStableSince = 0;

        // CycleLike fields: self acts as its own root Cycle.
        outputEvents: OutputEvent[] = [];
        cycleTime = 0; // 0 = not yet Active
        firstOutputEvent = 0;
        currentOutputEvent = 0;
        cycleParent: CycleLike | null = null; // always null for the root; only a nested Cycle has a real cycleParent
        cycleSpanEnd: number | null = null; // always null for the root

        currentCycle: CycleLike;
        previousCycle: Cycle | null = null; // our last Active schedule, kept around as compression material
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
            this.state = State.Passive;
            this.history = [];
            this.trustedInputs = new Set();
            this.sleepRequested = false;
            this.lastChecked = 0;
            this.outputEvents = [];
            this.cycleTime = 0;
            this.firstOutputEvent = 0;
            this.currentOutputEvent = 0;
            this.cycleParent = null;
            this.cycleSpanEnd = null;
            this.currentCycle = this;
            this.previousCycle = null;
            this.rootPhaseZero = 0;
            this.sleepBase = 0;
            this.backfillCycle = this;
            this.backfillTime = 0;
            this.lastCascadedCycleTime = 0;
            this.phaseStableSince = 0;
        }

        /** Phase 1 of the scheduler's two-phase dispatch: decide what this
         * event would do, using only state committed before this timestamp's
         * current delta round. See Scheduler.run(). */
        prepare(val: unknown): Pending {
            if (val instanceof Recheck) {
                if (this.state !== State.Active && this.state !== State.Asleep)
                    return null; // already resolved by an earlier delta this same tick
                if (val.alwaysDemote) {
                    if (this.digitalDebug)
                        console.log("[digital] Recheck (forced)", (this as any).getClassName?.() ?? this,
                            "state=", State[this.state], "sender=", (val.sender as any)?.getClassName?.() ?? val.sender, "DEMOTE");
                    return { kind: "demote" };
                }
                const liveVal = this.evaluate(val.sender);
                const predictedVal = this.currentValue();
                if (this.digitalDebug)
                    console.log("[digital] Recheck", (this as any).getClassName?.() ?? this,
                        "state=", State[this.state], "sender=", (val.sender as any)?.getClassName?.() ?? val.sender,
                        "live=", liveVal, "predicted=", predictedVal, liveVal === predictedVal ? "CONFIRM" : "DEMOTE",
                        "inputs=", this.inputs.map(i => ({ elm: (i as any).getClassName?.() ?? i, val: i.currentValue() })));
                if (liveVal === predictedVal)
                    return { kind: "confirm", sender: val.sender };
                return { kind: "demote" };
            }
            if (val === null) {
                // A generic "go re-check your inputs" wakeup. If we've since
                // re-promoted to Active/Asleep, our own predicted schedule
                // already governs future updates, so this stale wakeup is a no-op.
                if (this.state === State.Active || this.state === State.Asleep)
                    return null;
                return { kind: "passive", val: this.evaluate() };
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
                    return { kind: "demote" };
                return { kind: "active", val: predicted };
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
            return { kind: "passive", val: this.evaluate() };
        }

        /** Phase 2: apply what prepare() decided. */
        commit(pendingRaw: unknown): void {
            const pending = pendingRaw as Pending;
            if (pending === null) return;
            const now = this.scheduler.currentTime;
            switch (pending.kind) {
                case "confirm": {
                    // A co-tier event for this same object may have already
                    // committed a demote by the time we get here; only advance
                    // the window on a genuine surviving confirmation.
                    if (this.state !== State.Active && this.state !== State.Asleep) return;
                    this.lastChecked = now;
                    // Opportunistic retroactive trust upgrade: the sender
                    // that triggered this Recheck was untrusted (that's the
                    // only reason a Recheck fires at all - see
                    // notifyOutputs()), but if it's since become Active/
                    // Asleep with a period that evenly divides ours, its
                    // future periodicity is already implicitly covered by
                    // our own verified schedule - the same reasoning
                    // tryPromote()'s LCM-trusted candidate already relies
                    // on, just discovered late instead of at our own
                    // promotion time. Needed because trustedInputs is
                    // otherwise permanently frozen at promotion: an input
                    // still Passive at that moment can never be trusted
                    // later even after it proves itself, which would
                    // otherwise (a) block it from ever sleeping (it can
                    // never satisfy "all my outputs trust me" for this
                    // output) and (b) keep it live-notifying this element
                    // forever, on every single tick, even though this
                    // element's periodicity was already proven - silently
                    // undermining the optimization for the whole downstream
                    // chain. Safe to add: if the sender's promise later
                    // turns out wrong, _demote() already force-notifies
                    // every output with `sender` in its trustedInputs
                    // regardless of when that entry was added.
                    const sender = pending.sender;
                    if (sender && !this.trustedInputs.has(sender) && this.inputs.includes(sender) &&
                        (sender.state === State.Active || sender.state === State.Asleep) &&
                        sender.cycleTime > 0 && this.cycleTime % sender.cycleTime === 0) {
                        this.trustedInputs = new Set(this.trustedInputs).add(sender);
                        sender._maybeSleep();
                        this._maybeSleep();
                    }
                    return;
                }
                case "demote":
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
                    this.history.push([now, pending.val]);
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
                        this.history.push([now, pending.val]);
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
                    inner.commit();
                },
            };
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
            this.scheduler.schedule(this.scheduler.currentTime + MIN_HOP_TICKS, this);
        }

        forceReconsider(fromInput: DigitalElmInstance): void {
            if (this.state === State.Passive) return;
            this.scheduler.schedule(this.scheduler.currentTime, this, new Recheck(fromInput, true));
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
            // live: a demote triggered by an unrelated cascade (see
            // _promote()'s forceReconsider comment) - even though the
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
            this.state = State.Passive;
            // Keep the schedule we're abandoning as compression material for a
            // future promotion (see doc.txt section 5).
            if (this.outputEvents.length > 0 && this.cycleTime)
                this.previousCycle = new Cycle(this.outputEvents, this.cycleTime);
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
            // right. Deliberately NOT forceReconsider() here (an
            // unconditional demote-and-rederive): for elements in a genuine
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

        /** Did we transition to targetValue at some point in (since, until]?
         * This is the primitive edge detection actually needs - not "what was
         * my value an instant before now," but "did the relevant edge occur
         * anywhere in the window since the caller last checked."
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
        transitionedTo(targetValue: boolean, since: number, until: number): boolean {
            if (this.state === State.Asleep) this._backfillHistory(until);
            const hist = this.history;
            for (let i = hist.length - 1; i >= 0; i--) {
                const [t, v] = hist[i];
                if (t <= since) break; // ascending order - no earlier entry can be in (since, until] either
                if (t <= until && v === targetValue) return true;
            }
            return false;
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
                this.history.push([targetTime, leafValue]);
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

        /** Check whether our recorded history is now periodic and, if so,
         * switch to Active so we can predict future output without depending
         * on live input evaluation. */
        tryPromote(): void {
            if (!DigitalCore.promotionEnabled) return;
            if (this.state !== State.Passive || this.inputs.length === 0) return;

            const candidates: number[] = [];
            // Active OR Asleep both count as "proven periodicity" here -
            // Asleep is an even stronger guarantee than Active (it also
            // satisfied every one of ITS OWN outputs' trust), not a weaker
            // one. Excluding Asleep inputs was a real bug: once every input
            // to a slow-changing element has gone to sleep (the common case
            // for anything downstream of an already-optimized subcircuit),
            // this would find zero "active" inputs, skip the trustworthy
            // LCM candidate entirely, and fall back to the empirical
            // heuristic alone - risking a promotion to a shorter, spuriously-
            // matching period that doesn't capture the element's true
            // behavior (see doc.txt's "known limitations" on _matchPeriod
            // only ever proving two windows, not the whole schedule).
            // A genuine constant (Passive, with zero inputs of its own - a
            // DC-tied rail, DigitalConst, etc.) also counts as proven, even
            // though its cycleTime stays 0 forever: it's not "hasn't proven
            // a period yet", it has no period to prove at all, being
            // eternally unchanging. Without this, any element with a
            // constant input (extremely common - tie-offs, unused
            // reset/set pins) could NEVER reach provenInputs.length ===
            // inputs.length no matter how long every other input runs, so
            // the trustworthy LCM candidate would never be available at
            // all - leaving it permanently dependent on the empirical
            // heuristic alone, which can cycle through repeated wrong
            // guesses indefinitely for circuits where that heuristic is
            // unreliable (a real bug found live: components never settled
            // even after dozens of full cycles).
            const provenInputs = this.inputs.filter(i =>
                ((i.state === State.Active || i.state === State.Asleep) && i.cycleTime) ||
                (i.state === State.Passive && i.inputs.length === 0));

            if (this.digitalDebug)
                console.log("[digital] tryPromote", (this as any).getClassName?.() ?? this,
                    "inputs=", this.inputs.map(i => ({ elm: (i as any).getClassName?.() ?? i, state: State[i.state], cycleTime: i.cycleTime })),
                    "provenInputs.length=", provenInputs.length, "/", this.inputs.length,
                    "historyLength=", this.history.length);

            // Candidates trusted at the same level as a provenInputs LCM
            // match (2-window _matchPeriod, no extra scrutiny) - as opposed
            // to a pure guess from _empiricalCandidates() below, which gets
            // the stricter 3-window check (see the loop below for why).
            const trustedCandidates = new Set<number>();
            if (provenInputs.length === this.inputs.length) {
                const periodic = provenInputs.filter(i => i.cycleTime > 0);
                const lcmCandidate = periodic.length > 0 ? lcm(periodic.map(i => i.cycleTime)) : 1;
                candidates.push(lcmCandidate);
                trustedCandidates.add(lcmCandidate);
            }
            for (const p of (this as DigitalElmInstance).extraPromotionCandidates?.() ?? []) {
                if (!candidates.includes(p)) candidates.push(p);
                trustedCandidates.add(p);
            }
            for (const p of this._empiricalCandidates())
                if (!candidates.includes(p)) candidates.push(p);

            if (this.digitalDebug)
                console.log("[digital] tryPromote", (this as any).getClassName?.() ?? this, "candidates=", candidates);

            // Inputs the empirical heuristic below has to fly blind on: not
            // proven periodic/constant, so _matchPeriod()'s window match is
            // only as good as whatever evidence our own history happens to
            // contain about them.
            const unprovenInputs = this.inputs.filter(i => !provenInputs.includes(i));

            // The latest point any proven input's own absolute phase was
            // last (re-)anchored. A trusted candidate's own window has to
            // lie entirely after this - see its use below for why. Inputs
            // that are themselves part of a feedback loop with us are
            // excluded, for the exact same reason _blindFor() exempts them
            // from its own unproven-input safety net (see this method's own
            // docstring): a genuine cycle can only ever bootstrap off
            // members' still-co-evolving state, so requiring OUR window to
            // postdate a cyclic input's last phase change would deadlock -
            // neither side can ever settle "first" for the other to wait on.
            const phaseGatingInputs = provenInputs.filter(i => !dependsOnTransitively(i, this));
            const inputsPhaseStableSince = phaseGatingInputs.length > 0
                ? Math.max(...phaseGatingInputs.map(i => i.phaseStableSince)) : 0;

            let maxUnresolvedTrusted = 0;
            for (const p of candidates) {
                // A trustedCandidates member - mathematically implied by
                // fully-proven inputs' own periods (LCM), or analytically
                // known from an element's own configuration
                // (extraPromotionCandidates() - see e.g. CounterElm's
                // modulus) - only needs the standard 2-window check: it's
                // already vouched for from OUTSIDE the empirical evidence,
                // so _matchPeriod(p) here is purely confirming our own
                // output actually settled into that exact period.
                //
                // Every OTHER candidate is a pure guess from our own
                // recent history (_empiricalCandidates() - gaps between
                // same-valued points), with NOTHING vouching for it beyond
                // "two windows happened to match." That's fragile for any
                // element whose true output isn't a simple alternating
                // square wave: something like a modulus (non-power-of-2)
                // counter bit has an IRREGULAR multi-transition pattern
                // within its real period, which raises the odds that a much
                // SHORTER, wrong period coincidentally matches for exactly
                // two windows early on - especially since the _blindFor()
                // safety net is vacuous here (there ARE no unprovenInputs to
                // check when all inputs are already proven). A real bug
                // found live: exactly this, on a CounterElm bit with
                // modulus=13 - its LCM candidate (from the clock's own
                // period, 20) correctly failed to match (the bit's true
                // period, 260, isn't 20), but an empirical guess of 40 (a
                // coincidental gap between two of its own history points,
                // early in the irregular per-cycle pattern) matched for two
                // windows and got promoted - locking in a badly wrong
                // period forever, with the accumulated error compounding
                // every recurrence (each reported "edge" landing 20 ticks
                // further from the true baseline than the last). Fixed at
                // the root by teaching CounterElm to offer modulus*clockPeriod
                // as its own extraPromotionCandidates() (an analytically
                // exact period, not a guess); requiring a third matching
                // window for remaining pure-guess candidates is a second,
                // independent layer of defense for elements with no such
                // hook - doesn't fully eliminate the risk (still a
                // heuristic, not a proof - see doc.txt), but raises the bar
                // enough that a genuinely short-period element still
                // promotes almost immediately while a coincidental match
                // against a much-longer true period becomes far less likely
                // to survive three independent windows agreeing by chance.
                const trusted = trustedCandidates.has(p);
                const windows = trusted ? 2 : 3;
                if (trusted && !this._hasEnoughHistoryFor(p, windows)) {
                    // A trusted (LCM/analytic) candidate we don't have
                    // enough history to verify YET isn't evidence it's
                    // wrong - it's evidence we don't know yet. Falling
                    // through to a lower-trust guess here would defeat the
                    // whole point of preferring the trusted candidate in
                    // the first place: an empirical guess can satisfy its
                    // own (shorter) history requirement well before the
                    // trusted candidate's (longer) one is met, so without
                    // this check the guess would win the race every time
                    // regardless of how much better-founded the trusted
                    // candidate is - exactly what CounterElm's
                    // extraPromotionCandidates() (modulus*clockPeriod) is
                    // for: it's usually a longer period than any
                    // coincidental short-window empirical guess, so it
                    // would otherwise never get a fair chance to be
                    // verified before a wrong guess locked in first. Better
                    // to stay Passive a while longer than promote on a
                    // worse candidate we know a better one exists for.
                    if (this.digitalDebug)
                        console.log("[digital] tryPromote candidate", p, "windows=", windows, "trusted but not enough history yet - waiting");
                    return;
                }
                if (trusted && (this.scheduler.currentTime - windows * p) < inputsPhaseStableSince) {
                    // Having enough RAW history isn't the same as having
                    // enough history since our inputs' absolute phase last
                    // settled. An input can show a correct cycleTime while
                    // still cycling through several different phase anchors
                    // (each internally consistent, same period, different
                    // absolute offset) before finally settling - Active
                    // alone doesn't mean phase-stable, only Asleep's
                    // stronger "every output already trusts me" guarantee
                    // comes close, and even that isn't required here. A real
                    // bug found live: a D flip-flop sampling a NAND fed by a
                    // free-running counter promoted using a window that
                    // reached back to before the NAND's LAST re-anchor - the
                    // window happened to satisfy _matchPeriod (two
                    // repetitions of an intermediate, not-yet-final phase
                    // the NAND had briefly settled into), so it looked fully
                    // proven, but the schedule it baked in didn't match the
                    // NAND's true final phase. The flip-flop then failed its
                    // own very next self-driven-tick verification, demoted,
                    // woke the (by-then Asleep) NAND back up, and repeated
                    // forever - never actually settling, matching a real
                    // user report of a downstream signal "shifting" and
                    // never reaching a stable state. Same "wait, don't
                    // guess" principle as the not-enough-history case above.
                    if (this.digitalDebug)
                        console.log("[digital] tryPromote candidate", p, "windows=", windows, "trusted but window reaches back before an input's last phase re-anchor (", inputsPhaseStableSince, ") - waiting");
                    return;
                }
                // A trusted candidate WITH enough history that still doesn't
                // match isn't necessarily evidence it's wrong - our own
                // history can genuinely still carry noise from before our
                // inputs (like a NAND feeding a D flip-flop's D input) had
                // themselves finished settling: tryPromote() only ever runs
                // on a real value change, so once a trusted input goes from
                // Passive/glitchy to genuinely periodic, our own history up
                // to that point can easily fail to line up with the input's
                // NOW-true period, even though our future behavior
                // eventually will (we're a deterministic function of an
                // input that's now proven periodic). But a trusted candidate
                // can ALSO be a genuine, PERMANENT dead end rather than just
                // "not proven yet" - e.g. a toggle flip-flop's clock-derived
                // LCM candidate is exactly half its own true period (it only
                // flips once per clock cycle, needing two flips - one full
                // clock-derived period each - to repeat), so it will NEVER
                // match no matter how long we wait, and the CORRECT period
                // is only ever discoverable empirically (as a low multiple
                // of the trusted-but-wrong one). So: only block a SHORTER
                // empirical guess (maxUnresolvedTrusted tracks the largest
                // trusted candidate still unresolved) - that's the
                // "coincidentally matches on incomplete evidence" case this
                // exists to guard against (a real bug found live: a D flip-
                // flop sampling a slow, only-just-settled NAND kept
                // promoting onto a much shorter wrong period, immediately
                // failing its own next Recheck, waking its now-Asleep input
                // back up, and repeating forever - never actually settling,
                // each cycle re-anchoring rootPhaseZero to a new "now" and
                // shifting its reported phase further with every retry). An
                // empirical guess LONGER than every unresolved trusted
                // candidate can't be that same trap (it's not a hasty short
                // match against incomplete evidence, it's independent
                // evidence of a longer, still-plausible true period) and is
                // exactly how the toggle-flip-flop case above is meant to
                // recover, same as it always has.
                const window = this._matchPeriod(p, windows);
                if (!trusted && p <= maxUnresolvedTrusted) {
                    if (this.digitalDebug)
                        console.log("[digital] tryPromote candidate", p, "windows=", windows, "skipping empirical guess no longer than an unresolved trusted candidate (", maxUnresolvedTrusted, ") - waiting on it instead");
                    return;
                }
                // An empirical (non-LCM-trusted) candidate is only as
                // trustworthy as its evidence about EVERY input - see
                // _blindFor()'s docstring for what "trustworthy" means here.
                const blind = window !== null && unprovenInputs.some(i => this._blindFor(i, p));
                if (this.digitalDebug)
                    console.log("[digital] tryPromote candidate", p, "windows=", windows, "matched=", window !== null, "blind=", blind);
                if (window !== null && !blind) {
                    this._promote(p, window, provenInputs);
                    return;
                }
                if (trusted) maxUnresolvedTrusted = Math.max(maxUnresolvedTrusted, p);
            }
        }

        /** True if `input` (one of tryPromote()'s unprovenInputs) doesn't
         * give us enough confidence to promote on candidate period `p` -
         * i.e. its own history isn't ALSO internally consistent with this
         * exact period (same count of recorded transitions in the last two
         * windows of length p, at matching offsets and values - i.e. it
         * would pass its OWN _matchPeriod-style check at this period).
         * Requiring merely "showed up at least once" isn't enough: a single
         * isolated transition can land inside the window without proving
         * anything about periodicity, and - worse - might not even have
         * been the thing our own two-window match actually depended on, if
         * another input was already masking it (e.g. an already-true OR
         * input hiding a separate input's transition). A real bug found
         * live: an element promoted (and later went Asleep, permanently
         * losing all further self-checking - see wake()'s docstring) based
         * on a match that only superficially "saw" a slow input vary once,
         * and showed a genuinely wrong live value for as long as that
         * input's true (much longer) period didn't happen to matter yet.
         * Requiring EVERY input to be fully proven first (not just
         * self-consistent within the window) was tried and rejected: it
         * deadlocks any genuine feedback loop, where members can only ever
         * bootstrap via exactly this kind of empirical evidence about each
         * other. Requiring each unproven input's own history to
         * independently pass the same two-window test preserves that
         * bootstrapping (loop members vary repeatedly and consistently, so
         * they satisfy this too) while refusing a candidate that's only
         * really supported by inputs we have genuine confidence in.
         *
         * Tried and reverted: treating "no activity in either window, but
         * also none for a good many periods before that" as safe (on the
         * theory that a real future change would still reach this element
         * through the normal untrusted-input path regardless). The
         * always-correct baseline comparison test caught a genuine value
         * divergence from that relaxation - some other mechanism this
         * docstring doesn't yet fully account for depends on silence in
         * exactly these two windows meaning "not proven," not just "current
         * value assumed correct." Left as a flat reject until that's
         * actually understood, rather than re-attempted. */
        _blindFor(input: DigitalElmInstance, p: number): boolean {
            // A Passive input that ISN'T part of a feedback loop with us
            // (its value doesn't, even transitively, depend on ours) has no
            // need to bootstrap via a shallow self-consistency check - it
            // will settle on its own, on its own schedule, with nothing we
            // do affecting it. Trusting its still-incomplete history here
            // instead of just waiting is a real bug found live: a D flip-
            // flop registering a slow combinational function (e.g. a NAND
            // reading several bits of a free-running counter) can look
            // perfectly periodic-so-far for many windows using only the
            // fast-changing low-order bits, long before the slow high-order
            // bits that actually determine its TRUE (much longer) period
            // have ever toggled even once - a pure-DAG version of the same
            // "coincidental short match" failure mode extraPromotionCandidates()/
            // _hasEnoughHistoryFor() were built to guard against for trusted
            // candidates, just with no analytical candidate available to
            // rescue it here. The existing self-consistency check below
            // stays exactly as-is for a GENUINE feedback loop (input
            // depends on us too, even transitively) - see this method's own
            // header comment (above this check) for why that bootstrap
            // can't simply be removed for the cyclic case.
            if (input.state === State.Passive && !dependsOnTransitively(input, this))
                return true;
            const now = this.scheduler.currentTime;
            const hist = input.history;
            const win1: [number, boolean][] = [];
            const win2: [number, boolean][] = [];
            for (let i = hist.length - 1; i >= 0; i--) {
                const [t, v] = hist[i];
                if (t <= now - 2 * p) break;
                (t <= now - p ? win1 : win2).push([t, v]);
            }
            win1.reverse();
            win2.reverse();
            if (win1.length === 0 && win2.length === 0) return true;
            if (win1.length !== win2.length) return true;
            return win1.some(([t1, v1], j) => { const [t2, v2] = win2[j]; return v1 !== v2 || t2 - t1 !== p; });
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

        /** Do we have at least `windows` full periods of `period`-length
         * history yet? Same guard _matchPeriod() itself opens with, split
         * out so tryPromote() can tell "not enough evidence yet" apart from
         * "tested and failed" for a trusted candidate - see its own call
         * site for why that distinction matters. */
        _hasEnoughHistoryFor(period: number, windows: number): boolean {
            const hist = this.history;
            return hist.length > 0 && hist[0][0] <= this.scheduler.currentTime - windows * period;
        }

        /** If our history's last `windows` windows of length `period` all
         * match exactly (same value sequence, each offset from the most
         * recent window by an exact multiple of `period`), return the most
         * recent window. `windows` defaults to 2 (the minimum needed to
         * call anything "periodic" at all); tryPromote() asks for more on
         * candidates it has less independent reason to trust - see its own
         * call site for why 2 windows alone isn't always enough. */
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

        /** If `events` (one full new period, offsets already 0-based) begins
         * with some whole number of exact repeats of previousCycle's own
         * pattern - at any phase rotation of it - replace that stretch with a
         * SubRef. Returns {reps, tail, start}: start is which rotation of the
         * old pattern was actually verified (0 if nothing compressed). Only
         * attempted when previousCycle is itself flat (no SubRef entries) - see
         * doc.txt section 10 for why this doesn't compound across re-promotions. */
        _splitRepeatingPrefix(events: OutputEvent[]): { reps: number; tail: OutputEvent[]; start: number } {
            const old = this.previousCycle;
            if (old === null || old.outputEvents.length === 0) return { reps: 0, tail: events, start: 0 };
            if (old.outputEvents.some(([, v]) => v instanceof SubRef)) return { reps: 0, tail: events, start: 0 };
            const oldEvents = old.outputEvents;
            const nOld = oldEvents.length;
            if (events.length === 0 || nOld === 0 || events.length < nOld) return { reps: 0, tail: events, start: 0 };

            let best = { reps: 0, tail: events, start: 0 };
            for (let start = 0; start < nOld; start++) {
                const { reps, tail } = this._matchRotation(events, oldEvents, old.cycleTime, start);
                if (reps > best.reps) best = { reps, tail, start };
            }
            return best;
        }

        /** A new, small Cycle holding old.outputEvents walked cyclically
         * starting at index `start`, with offsets renormalized so the first
         * entry sits at offset 0. */
        _rotatedCycle(old: Cycle, start: number): Cycle {
            const n = old.outputEvents.length;
            const base = old.outputEvents[start][0];
            const rotated: OutputEvent[] = [];
            let idx = start, wrap = 0;
            for (let i = 0; i < n; i++) {
                const [offset, val] = old.outputEvents[idx];
                rotated.push([wrap + offset - base, val]);
                idx++;
                if (idx === n) { idx = 0; wrap += old.cycleTime; }
            }
            return new Cycle(rotated, old.cycleTime);
        }

        /** How many full reps of oldEvents, walked cyclically starting at index
         * `start` (wrapping its offset by oldPeriod each wrap), exactly match
         * the beginning of `events`. */
        _matchRotation(events: OutputEvent[], oldEvents: OutputEvent[], oldPeriod: number, start: number):
            { reps: number; tail: OutputEvent[] } {
            const nOld = oldEvents.length;
            const w0 = events[0][0];
            const base = oldEvents[start][0];
            let idx = start, wrap = 0, reps = 0, i = 0;
            while (i + nOld <= events.length) {
                let ok = true;
                let probeIdx = idx, probeWrap = wrap;
                for (let j = 0; j < nOld; j++) {
                    const [wOffset, wVal] = events[i + j];
                    const [oOffset, oVal] = oldEvents[probeIdx];
                    if (wVal !== oVal || wOffset - w0 !== probeWrap + oOffset - base) { ok = false; break; }
                    probeIdx++;
                    if (probeIdx === nOld) { probeIdx = 0; probeWrap += oldPeriod; }
                }
                if (!ok) break;
                reps++;
                i += nOld;
                idx = probeIdx; wrap = probeWrap;
            }
            return { reps, tail: events.slice(i) };
        }

        _promote(period: number, window: [number, boolean][], provenInputs: DigitalElmInstance[]): void {
            const now = this.scheduler.currentTime;
            const base = now - period;
            // Only a genuine phase change (not just re-anchoring the same
            // period/phase to a new "now" after a routine demote-and-
            // reconfirm - e.g. a purely-local downstream consumer's own
            // instability, unrelated to whether OUR schedule was ever
            // actually wrong) resets phaseStableSince. Bumping it on every
            // _promote() call regardless would starve any downstream
            // consumer that requires its own window to postdate it: a
            // frequently-reconfirming-but-never-actually-changing input
            // would look perpetually "just re-anchored," never satisfying
            // that requirement no matter how long a consumer waited.
            const samePhase = this.cycleTime === period &&
                (((base - this.rootPhaseZero) % period) + period) % period === 0;
            if (!samePhase) this.phaseStableSince = now;
            this.rootPhaseZero = base;
            const events: OutputEvent[] = window.map(([t, v]) => [t - base, v]);
            const { reps, tail, start } = this._splitRepeatingPrefix(events);
            if (reps >= 2 && tail.length > 0) {
                const sub = this._rotatedCycle(this.previousCycle!, start);
                const w0 = events[0][0];
                const span = tail[0][0] - w0;
                this.outputEvents = [[w0, new SubRef(sub, span)], ...tail];
            } else {
                this.outputEvents = events;
            }
            this.cycleTime = period;
            this.state = State.Active;
            this.firstOutputEvent = 0;
            this.currentCycle = this; // fresh promotion: start clean at the root
            this.trustedInputs = new Set(provenInputs);
            this._advanceAndSchedule(this.outputEvents.length - 1);
            // These inputs may have just become fully unwatched.
            for (const inp of provenInputs) inp._maybeSleep();
            // One of our own outputs may already have been trusting us from an
            // earlier promotion of its own - give it a fresh chance to notice.
            this._maybeSleep();
            // Any of our own liveOutputs that already promoted WITHOUT us in
            // their trustedInputs may have built their own schedule from an
            // incomplete or now-stale empirical match (see Recheck's
            // alwaysDemote docstring for why a plain value-confirming
            // notification isn't enough to catch this) - either because we
            // were still Passive when they looked (the original case this
            // cascade covered), or because they promoted using OUR earlier,
            // now-superseded period: a downstream element whose own history
            // happened to be recorded while we were still mid-flux (re-
            // deriving our own period across several promotions) can bake a
            // transient artifact from that flux into its schedule, match it
            // against itself as if periodic, and never notice it no longer
            // reflects our real (now-settled) behavior - a real bug found
            // live (see the cross-coupled-NAND-latch and downstream-NOR
            // regression tests). Only cascade when our period actually
            // changed from what we last cascaded, not on every re-
            // promotion: a routine re-confirmation that lands on the exact
            // same period is not new information for any output, and
            // cascading on every re-promotion regardless (including same-
            // period ones) was a real performance regression - normal re-
            // promotion churn is common (during startup especially), and
            // each cascade could itself trigger more re-promotions with
            // their own cascades, snowballing through the whole graph. An
            // output that already trusts us is separately covered by
            // _demote()'s own force-notify cascade if we're ever wrong
            // later; an output that doesn't trust us is already getting
            // normal live notifications on every tick regardless (see
            // notifyOutputs()) - but as this bug showed, "live notification"
            // alone isn't enough to catch a stale *schedule*, only a stale
            // *live value*.
            if (this.cycleTime !== this.lastCascadedCycleTime) {
                this.lastCascadedCycleTime = this.cycleTime;
                for (const out of this.liveOutputs)
                    if (!out.trustedInputs.has(this)) out.forceReconsider(this);
            }
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

/** Does `node`'s value depend, directly or transitively through its own
 * `inputs`, on `target`? Used by _blindFor() to tell a genuine feedback loop
 * (target reachable from one of its own inputs) apart from a plain DAG edge
 * (an upstream input that will settle on its own, with nothing target does
 * affecting it) - see _blindFor()'s own docstring for why that distinction
 * matters. Bounded by `visited`: circuits can and do contain real cycles
 * (that's the whole reason this function exists), so a naive unmarked
 * recursion would infinite-loop on one instead of correctly reporting it. */
function dependsOnTransitively(
    node: DigitalElmInstance, target: DigitalElmInstance, visited: Set<DigitalElmInstance> = new Set(),
): boolean {
    if (node === target) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    return node.inputs.some(i => dependsOnTransitively(i, target, visited));
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
    /** Optional hook: for an input at this index (e.g. a shared reset
     * line), a pin must always demote on change rather than trying the
     * usual "does live evaluate() still match" confirmation shortcut - see
     * GroupPin.prepare()'s docstring for why. */
    alwaysDemoteOn?(sender: DigitalElmInstance): boolean;
    /** Optional hook: analytically-known candidate periods tryPromote()
     * should try with the same confidence as its own provenInputs-derived
     * LCM candidate (2-window match), not the extra scrutiny given to a
     * purely empirical guess - see DigitalElmInstance.extraPromotionCandidates()'s
     * docstring for why this exists and CounterElm's implementation for a
     * concrete example (a nonzero modulus's true period isn't derivable
     * from any input's own cycleTime at all, since the modulus is internal
     * configuration invisible to the generic engine). */
    extraPromotionCandidates?(pin: GroupPin): number[];
}

export class GroupPin extends DigitalElm {
    constructor(public group: Group, public index: number) {
        super();
    }

    extraPromotionCandidates(): number[] {
        return this.group.extraPromotionCandidates?.(this) ?? [];
    }

    prepare(val: unknown): Pending {
        if (val instanceof Recheck && val.sender && this.group.alwaysDemoteOn?.(val.sender) &&
            (this.state === State.Active || this.state === State.Asleep)) {
            // A shared control line (e.g. reset) just changed. Not safe to
            // confirm via "does evaluate() still match my current value
            // right now": bits sharing one physical clock/reset aren't
            // independent - a reset can restart the whole register's carry
            // chain from a different relative phase, and this bit's own
            // value can coincidentally already equal the reset-forced value
            // by luck of its current phase, letting the reset slip past
            // undetected while a sibling bit correctly resets, permanently
            // desyncing the two. Always demote here rather than trust a match.
            return { kind: "demote" };
        }
        return super.prepare(val);
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
