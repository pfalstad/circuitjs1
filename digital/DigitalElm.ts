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
    constructor(public sender: DigitalElmInstance | null) {}
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
    sleepBase: number;
    backfillCycle: CycleLike;
    backfillTime: number;
    readonly scheduler: Scheduler;

    addInput(...elements: DigitalElmInstance[]): void;
    resetDigital(): void;
    notifyOutputs(): void;
    inputUpdated(sender?: DigitalElmInstance | null): void;
    wake(): void;
    currentValue(): boolean;
    transitionedTo(targetValue: boolean, since: number, until: number): boolean;
    /** Public (despite the leading underscore) because syncedValue() - a
     * free function usable by any Group implementation - has to reach it
     * for a sleeping sibling pin. */
    _leafValueAt(cyc: CycleLike, elapsed: number): boolean;
    _maybeSleep(): void;
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
        }

        /** Phase 1 of the scheduler's two-phase dispatch: decide what this
         * event would do, using only state committed before this timestamp's
         * current delta round. See Scheduler.run(). */
        prepare(val: unknown): Pending {
            if (val instanceof Recheck) {
                if (this.state !== State.Active && this.state !== State.Asleep)
                    return null; // already resolved by an earlier delta this same tick
                if (this.evaluate(val.sender) === this.currentValue())
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
            // scheduled - fall back to a live re-derivation.
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
            if (this.state === State.Active || this.state === State.Asleep) {
                // Scheduled (not evaluated inline) so it goes through the
                // scheduler's normal two-phase batching for this same
                // timestamp - see doc.txt section 8b.
                this.scheduler.schedule(this.scheduler.currentTime, this, new Recheck(sender));
                return;
            }
            this.scheduler.schedule(this.scheduler.currentTime + MIN_HOP_TICKS, this);
        }

        /** Common teardown for leaving Active/Asleep because our prediction
         * turned out wrong: go re-derive our value live from here on. */
        _demote(): void {
            if (this.state === State.Asleep) {
                // We stopped recording history (and correcting .value) while
                // asleep; catch both up before clearing our schedule.
                this._backfillHistory(this.scheduler.currentTime);
                this.value = this.currentValue();
            }
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
            // our now-broken periodicity - force a notification even though
            // notifyOutputs() would normally skip a trusting output.
            for (const out of this.liveOutputs)
                if (out.trustedInputs.has(this)) out.inputUpdated(this);
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
         * anywhere in the window since the caller last checked." */
        transitionedTo(targetValue: boolean, since: number, until: number): boolean {
            if (this.state === State.Asleep) this._backfillHistory(until);
            return this.history.some(([t, v]) => v === targetValue && since < t && t <= until);
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
         * trust just broke. Always fully demotes and re-derives live rather
         * than resuming Active prediction - a single instant matching doesn't
         * prove the rest of a schedule is still valid (see doc.txt section 4). */
        wake(): void {
            if (this.sleepRequested) {
                // Never actually stopped ticking yet; just cancel the request.
                this.sleepRequested = false;
                return;
            }
            if (this.state !== State.Asleep) return;
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
            const activeInputs = this.inputs.filter(i => i.state === State.Active && i.cycleTime);
            if (activeInputs.length === this.inputs.length)
                candidates.push(lcm(activeInputs.map(i => i.cycleTime)));
            for (const p of this._empiricalCandidates())
                if (!candidates.includes(p)) candidates.push(p);

            for (const p of candidates) {
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

        /** If our history's last two windows of length `period` match exactly,
         * return the more recent window. */
        _matchPeriod(period: number): [number, boolean][] | null {
            if (!period || period <= 0) return null;
            const now = this.scheduler.currentTime;
            if (this.history.length === 0 || this.history[0][0] > now - 2 * period)
                return null; // not enough history yet to prove two full periods
            const win1 = this.history.filter(([t]) => now - 2 * period < t && t <= now - period);
            const win2 = this.history.filter(([t]) => now - period < t && t <= now);
            if (win1.length === 0 || win2.length === 0 || win1.length !== win2.length) return null;
            for (let i = 0; i < win1.length; i++) {
                const [t1, v1] = win1[i], [t2, v2] = win2[i];
                if (v1 !== v2 || t2 - t1 !== period) return null;
            }
            return win2;
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

        _promote(period: number, window: [number, boolean][], activeInputs: DigitalElmInstance[]): void {
            const now = this.scheduler.currentTime;
            const base = now - period;
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
            this.trustedInputs = new Set(activeInputs);
            this._advanceAndSchedule(this.outputEvents.length - 1);
            // These inputs may have just become fully unwatched.
            for (const inp of activeInputs) inp._maybeSleep();
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
}

export class GroupPin extends DigitalElm {
    constructor(public group: Group, public index: number) {
        super();
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
