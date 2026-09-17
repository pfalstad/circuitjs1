// Port of chip.h / chip.cpp: the per-macro-cell simulation unit, and the "sub-cycle" event
// scheduling optimization (Cycle/SubcycleAllocator) that lets periodic sub-circuits (counters,
// clock dividers, ...) skip re-simulating states they've already visited in a prior period.
// Ported from dice-ts/src/chip.ts, with one addition: an append-only `history` log plus
// `_output` becoming an accessor that records to it, needed for ScopePlot's digital trace
// rendering (dice-ts itself has no equivalent - Pong never needed to plot a trace). See
// `backfillHistory()`'s docstring for the one known gap in that addition.
//
// Numeric representation notes (see also cirque.ts):
//  - Fields that are `int` in C++ (inputs, output, event_mask, prev_output_mask,
//    first_input_mask, active_inputs, and a ChipLink.mask used against a *destination's own*
//    `inputs` field) are plain `number`, using JS's native 32-bit bitwise operators, which
//    have exactly the same truncate-to-32-bits semantics as C++ `int`.
//  - Fields that are `uint64_t` in C++ but are genuinely *time* values (global_time, delay[],
//    pending_event, activation_time, cycle_time, cycle_duration, end_time, sleep_time,
//    last_input_event[], last_output_event, Event.time, HistoryEntry.time) are plain `number`
//    too. A `number` is exact for integers up to 2^53-1, which even at a 1ns TIMESCALE is over
//    a century of continuous simulated runtime -- ample headroom, and native `number`
//    arithmetic is dramatically cheaper than `bigint` (no heap-allocated arbitrary-precision
//    object per op), which matters because these fields sit on the hottest per-event paths.
//  - `lutData` (the SIMPLE_CHIP truth table) is also plain `number`: its cutoff was lowered
//    from <=6 total LUT-input bits to <=5, so it always fits in one 32-bit word addressed with
//    native bitwise ops; a 6-bit LUT now falls through to the BASIC_CHIP path instead, which
//    already used a plain `Uint32Array`, not bigint.
//  - Fan-out is unbounded. `Cycle.activeOutputs` is a LinkMask (a Uint32Array word-array bitset
//    over output-link indices), because a single net can drive arbitrarily many inputs. The C++
//    uses a uint64_t here and is in fact buggy for exactly this reason: `1ull << 157` is
//    undefined behavior. It survives only because _VCC/_GND never dispatch events, so their
//    activeOutputs is never read.
//  - `ChipLink.mask` means two different things depending on which array the link lives in:
//      * in `outputLinks`: a destination-local *input-bit mask*, xored into the destination's
//        `inputs`. Bounded by `inputs` being a 32-bit number; assertLinkBit() enforces that.
//      * in `inputLinks`: the source's *output-link index*, stored as a plain integer (not a
//        bit), or -1 for a constant source. Storing the index rather than `1 << index` is what
//        makes fan-out unbounded on this side for free -- it was only ever a single bit.
//  - The sub-cycle allocation bitmask (SubcycleAllocator) stays `bigint`: SUBCYCLE_SIZE is 64,
//    so it genuinely needs 64 bits, and it is not on the hot path.

import type { Circuit } from "./circuit";
import { Cirque, CirqueNum } from "./cirque";
import type { ChipDesc } from "./chip_desc";
import { MAX_PINS } from "./chip_desc";
import { TIMESCALE, MAX_U64, DEBUG_TRACE } from "./constants";


let __maskWatchCount = 0;
function __globalMaskWatchdog(): void {
    if (++__maskWatchCount > 3000000) throw new Error('mask-scan loop exceeded watchdog limit');
}

// Guards a loop against spinning forever on a malformed netlist. `message` is only evaluated
// (and only needs to be accurate) at the moment the limit is exceeded.
class Watchdog {
    private count = 0;
    constructor(private readonly limit: number) { }
    tick(message: () => string): void {
        if (++this.count > this.limit) throw new Error(message());
    }
}

// Granularity of wakeUp()'s root-only arithmetic period skip: whole periods are skipped only in
// multiples of this. 2 is the empirically derived "even periods only" rule - see wakeUp().
const SKIP_MULT = 2;

export enum ChipType { SIMPLE_CHIP = 0, BASIC_CHIP = 1, CUSTOM_CHIP = 2 }
export enum ChipState { ACTIVE = 0, PASSIVE = 1, ASLEEP = 2 }

// Fan-OUT is unbounded (see LinkMask). What is still bounded is a chip's own input width:
// `Chip.inputs` is a 32-bit number, so a chip cannot have more than 32 input pins (counting
// event pins and the prev-output bit). For LUT chips the real ceiling is far lower anyway --
// the truth table is 2^inputs bits and `inputEventTable` is indexed by `inputs`.
//
// Lifting this means changing `Chip.inputs` itself from a number to a bit-vector, which also
// means rethinking LUT indexing; it is not a matter of widening a mask. Until then this throws
// rather than silently corrupting state (JS bitwise ops truncate to 32 bits, `1 << 32` is `1`).
export const MAX_LINK_BITS = 32;

export function assertLinkBit(bit: number, what: string): void {
    if (bit >= MAX_LINK_BITS)
        throw new Error(
            `FATAL: ${what} needs bit ${bit}, but Chip.inputs is a ${MAX_LINK_BITS}-bit number. ` +
            `Widening this requires changing Chip.inputs to a bit-vector, not just the mask.`);
}

// A bitset over output-link indices, with no upper bound on fan-out. Backed by a Uint32Array;
// the overwhelmingly common case is a single word, and the hot paths special-case that to stay
// as cheap as a plain number. Replaces the previous unbounded `bigint` mask, which allocated an
// arbitrary-precision object on every set/clear/copy on the hottest paths in the engine.
export class LinkMask {
    words: Uint32Array;

    constructor(nbits: number = 32) {
        this.words = new Uint32Array(Math.max(1, (nbits + 31) >>> 5));
    }

    private grow(nwords: number): void {
        const w = new Uint32Array(nwords);
        w.set(this.words);
        this.words = w;
    }

    // Word `w`, or 0 if this mask is narrower than that.
    word(w: number): number { return w < this.words.length ? this.words[w] : 0; }

    setBit(i: number): void {
        const w = i >>> 5;
        if (w >= this.words.length) this.grow(w + 1);
        this.words[w] |= (1 << (i & 31));
    }

    clearBit(i: number): void {
        const w = i >>> 5;
        if (w < this.words.length) this.words[w] &= ~(1 << (i & 31));
    }

    testBit(i: number): boolean {
        const w = i >>> 5;
        return w < this.words.length && (this.words[w] & (1 << (i & 31))) !== 0;
    }

    isZero(): boolean {
        const w = this.words;
        if (w.length === 1) return w[0] === 0; // fast path: nearly every real chip
        for (let k = 0; k < w.length; k++) if (w[k] !== 0) return false;
        return true;
    }

    copyFrom(o: LinkMask): void {
        const a = this.words, b = o.words;
        // Fast path. This runs on every sub-cycle descent, and TypedArray.set() costs far more
        // than a single element assignment.
        if (a.length === 1 && b.length === 1) { a[0] = b[0]; return; }
        if (a.length < b.length) { this.words = new Uint32Array(b.length); this.words.set(b); return; }
        a.set(b);
        for (let k = b.length; k < a.length; k++) a[k] = 0;
    }

    // Set the low `n` bits, clear the rest.
    setLow(n: number): void {
        const need = Math.max(1, (n + 31) >>> 5);
        if (this.words.length < need) this.grow(need);
        const w = this.words;
        for (let k = 0; k < w.length; k++) {
            const lo = k << 5;
            if (lo + 32 <= n) w[k] = -1;
            else if (lo >= n) w[k] = 0;
            else w[k] = (1 << (n - lo)) - 1;
        }
    }
}

export class ChipLink {
    chip: Chip;
    mask: number;
    constructor(chip: Chip, mask: number) { this.chip = chip; this.mask = mask; }
}

export class Event {
    time: number;
    state: number;      // meaningful when type === 0
    subCycle: Cycle | null; // meaningful when type === 1
    type: number;        // 1 = SUBCYCLE_MASK
    constructor(time: number = 0, state: number = 0, type: number = 0, subCycle: Cycle | null = null) {
        this.time = time;
        this.state = state;
        this.subCycle = subCycle;
        this.type = type;
    }
}

export class SubcycleAllocator {
    bits: bigint = 0n;
    size: number;
    private fullMask: bigint;

    constructor(size: number) {
        this.size = size;
        this.fullMask = (1n << BigInt(size)) - 1n;
    }

    full(): boolean { return this.bits === this.fullMask; }

    deallocate(a: SubcycleAllocator): void { this.bits &= ~a.bits; }

    allocate(): number {
        let i = 0;
        let b = this.bits;
        const watchdog = new Watchdog(1000);
        while (b & 1n) { watchdog.tick(() => 'SubcycleAllocator.allocate stuck'); b >>= 1n; i++; }
        this.bits |= (1n << BigInt(i));
        return i;
    }

    orEq(a: SubcycleAllocator): void { this.bits |= a.bits; }
    clear(): void { this.bits = 0n; }
    set(n: number): void { this.bits |= (1n << BigInt(n)); }
}

export class Cycle {
    parentCycle: Cycle | null = null;
    allocatedSubCycles: SubcycleAllocator;

    outputEvents: Cirque<Event>;
    firstOutputEvent: number;
    currentOutputEvent: number;

    activationTime: number = 0;
    cycleTime: number = 0;
    cycleDuration: number = 0;
    endTime: number = 0;
    activeOutputs: LinkMask = new LinkMask();

    constructor(queueSize: number, subcycleSize: number) {
        this.outputEvents = new Cirque<Event>(queueSize, () => new Event());
        this.firstOutputEvent = this.outputEvents.begin();
        this.currentOutputEvent = this.outputEvents.begin();
        this.allocatedSubCycles = new SubcycleAllocator(subcycleSize);
    }

    nextOutputEventDelay(): number {
        if (this.currentOutputEvent === this.firstOutputEvent) {
            return this.outputEvents.get(this.firstOutputEvent).time + this.cycleTime - this.outputEvents.back().time;
        } else {
            const prev = this.outputEvents.dec(this.currentOutputEvent);
            return this.outputEvents.get(this.currentOutputEvent).time - this.outputEvents.get(prev).time;
        }
    }

    // NOTE: mutates `this` and, when descending into a sub-cycle, the sub-cycle too.
    nextOutputCycle(time: number): Cycle {
        const ev = this.outputEvents.get(this.currentOutputEvent);

        if (ev.type) {
            const cycle = ev.subCycle!;

            this.currentOutputEvent = this.outputEvents.inc(this.currentOutputEvent);
            if (this.currentOutputEvent === this.outputEvents.end()) this.currentOutputEvent = this.firstOutputEvent;

            cycle.endTime = time + cycle.cycleDuration;
            if (cycle.endTime > this.endTime) cycle.endTime = this.endTime;
            cycle.activationTime = time;
            cycle.activeOutputs.copyFrom(this.activeOutputs); // value copy: Cycles must not share a mask
            cycle.currentOutputEvent = cycle.firstOutputEvent;

            return cycle.nextOutputCycle(time);
        }

        this.currentOutputEvent = this.outputEvents.inc(this.currentOutputEvent);
        if (this.currentOutputEvent === this.outputEvents.end()) this.currentOutputEvent = this.firstOutputEvent;

        return this;
    }
}

export interface HistoryEntry { time: number; value: number; }

// Implemented by anything that reads a Chip's `history` after the fact (ScopePlot, ScopePlot2d)
// so the chip can bound how much of it to keep - see Chip.trimHistory()'s own comment. Returns
// the earliest `history[i].time` this watcher might still need to look at on its NEXT call -
// everything strictly before that is provably dead weight for this watcher. -1 means "haven't
// established a real floor yet" (e.g. just attached/reset and about to do a from-scratch seed
// pass over whatever's currently available) - trimHistory() treats that as "don't discard
// anything on this watcher's account" since -1 sorts below every real (>= 0) history time.
export interface HistoryWatcher { historyFloor(): number; }

// A backfill replay position, mirroring a (possibly nested) Cycle.currentCycle chain but held
// entirely separately so backfillHistory()/currentValue() can advance it without touching any
// real Cycle's live currentOutputEvent/activationTime/endTime (see backfillPos's own field
// comment on Chip for why that separation matters). `level` is the Cycle whose
// outputEvents/firstOutputEvent/cycleTime `idx` indexes (a Chip for the outermost frame, a plain
// Cycle for any `sub` frame) - stored directly rather than re-derived from the parent frame's own
// idx, because that idx moves on past whatever placeholder led here (see the "descend" step
// below), so it can no longer be relied on to name the child once this frame is revisited later.
// `entryTime` is the absolute time this frame's level was entered (needed, mirroring
// climbToValidCycle()'s own `globalTime - currentCycle.activationTime` term, to figure out how
// much of a level's own span has already been consumed when climbing back out of it) - meaningless
// for the outermost frame (never climbed out of - its exitBound is MAX_U64) so left as 0 there.
// `exitBound` is the absolute time at which control must return to the enclosing frame - MAX_U64
// for the outermost frame, otherwise `entryTime` plus `level`'s own cycleDuration, capped by the
// enclosing frame's own exitBound (mirroring nextOutputCycle()'s own endTime capping, computed
// fresh here rather than trusting the real (transient, only valid mid-live-traversal) Cycle
// object's own .endTime field). `sub` is the next frame in - null once `idx` refers to a plain
// (non-SUBCYCLE_MASK) event.
interface BackfillPos { level: Cycle; idx: number; entryTime: number; exitBound: number; sub: BackfillPos | null }

// Rebuilds a BackfillPos chain from a flat top-to-bottom array of frames (the inverse of walking
// `.sub` pointers) - used by advanceBackfillPos() after mutating one frame in place.
function rebuildBackfillPos(frames: BackfillPos[]): BackfillPos {
    let pos: BackfillPos | null = null;
    for (let i = frames.length - 1; i >= 0; i--) pos = { level: frames[i].level, idx: frames[i].idx, entryTime: frames[i].entryTime, exitBound: frames[i].exitBound, sub: pos };
    return pos!;
}

// Captures `chip`'s current (possibly nested) currentCycle chain as a BackfillPos, for seeding
// the resumable backfill cursor at the exact moment this chip falls ASLEEP. Reads each level's
// real (but, once this chip is dormant, frozen-in-place) currentOutputEvent/endTime - safe
// precisely because nothing mutates them again until this chip genuinely wakes, at which point
// backfillHistory()/currentValue() stop being called at all (see currentValue()'s ASLEEP guard).
//
// Deliberately does NOT try to resolve a SUBCYCLE_MASK (type===1) entry the innermost
// currentOutputEvent might itself be resting on (the case updateOutput()'s ASLEEP-wake path's own
// `while (c.outputEvents.front().type) c = ...` peek exists for) - "resting on" that entry means
// its OWN crossing hasn't happened yet, at some absTime yet to be computed from ITS OWN .time via
// the same delay formula every other position uses; there is no "entryAbsTime" to eagerly resolve
// it against here. advanceBackfillPos() below resolves this (and any position it advances onto)
// uniformly, at the moment it actually knows what absTime that crossing happens at.
function captureBackfillPos(chip: Chip): BackfillPos {
    const frames: BackfillPos[] = [];
    for (let c: Cycle = chip.currentCycle; ; c = c.parentCycle!) {
        frames.push({ level: c, idx: c.currentOutputEvent, entryTime: c.activationTime, exitBound: c.endTime, sub: null });
        if (c === (chip as unknown as Cycle)) break;
    }
    frames.reverse(); // frames[0] = chip (outermost) ... frames[last] = currentCycle (innermost)
    return rebuildBackfillPos(frames);
}

// Pushes the frame(s) for "freshly entering `cycle` at `absTime`" onto `frames`, mirroring
// nextOutputCycle()'s own entry semantics exactly: a newly-entered cycle's bookmark is
// IMMEDIATELY advanced one step past its own firstOutputEvent (real production code does this
// too - see nextOutputCycle()'s flat branch, run against a freshly-set `cycle.currentOutputEvent
// = cycle.firstOutputEvent` right before it), and if firstOutputEvent's own entry is itself
// another placeholder, that descent recurses (matching nextOutputCycle()'s own recursive call)
// before the one-step advance happens at whatever level actually turns out to be real. Every
// level touched here starts its `exitBound` from the SAME `absTime` (the whole nested chain is
// being entered simultaneously), each capped by the enclosing level's own bound.
function pushEnteredCycle(frames: BackfillPos[], cycle: Cycle, absTime: number, exitBound: number): void {
    let level = cycle;
    let bound = exitBound;
    for (; ;) {
        const oe = level.outputEvents;
        const ev = oe.get(level.firstOutputEvent);
        let after = oe.inc(level.firstOutputEvent);
        if (after === oe.end()) after = level.firstOutputEvent;
        frames.push({ level, idx: after, entryTime: absTime, exitBound: bound, sub: null });
        if (!ev.type) return;
        const sub = ev.subCycle!;
        const rawExit = absTime + sub.cycleDuration;
        bound = rawExit < bound ? rawExit : bound;
        level = sub;
    }
}

// The raw per-level delay formula (nextOutputEventDelay()'s own, evaluated against a given
// (level, idx) pair instead of that Cycle's live currentOutputEvent) - shared by the normal
// per-step computation and the climb adjustment below, which both need it.
function rawDelay(level: Cycle, idx: number): number {
    const oe = level.outputEvents;
    return idx === level.firstOutputEvent
        ? oe.get(level.firstOutputEvent).time + level.cycleTime - oe.back().time
        : oe.get(idx).time - oe.get(oe.dec(idx)).time;
}

// The one real implementation of "replay this chip's learned periodic schedule forward from
// (pos, absTime, value) to `now`" - shared by backfillHistory() (which must enumerate and record
// every individual toggle, for ScopePlot) and currentValue() (which only wants the final value,
// and never writes the result back - see currentValue()'s own docstring for why that matters).
// Entirely local/non-mutating with respect to every real Cycle object it reads (outputEvents,
// cycleTime, firstOutputEvent, cycleDuration) - never touches currentOutputEvent/activationTime/
// endTime, so it's safe to call while a chip is genuinely ASLEEP regardless of how many times
// it's called or in what order relative to any other read.
//
// The value toggles on EVERY transition, unconditionally - exactly like updateOutput()'s ACTIVE
// branch's own unconditional `this.output ^= 1`, called once per transition regardless of how
// many levels nextOutputCycle() ends up touching underneath it. Descending into (or popping out
// of) a nested sub-cycle is pure bookkeeping about which Cycle the FOLLOWING delay computation
// should reference - orthogonal to the toggle itself (the KNOWN GAP this whole function
// replaces). `record`, when given, is called with every (absTime, value) the walk passes through
// (enumerate mode, for ScopePlot); when omitted, whole repeats of a level's own period are
// skipped via arithmetic instead of being stepped one at a time (fast mode, for currentValue()).
function advanceBackfillPos(
    startPos: BackfillPos,
    startAbsTime: number,
    startValue: number,
    now: number,
    record: ((absTime: number, value: number) => void) | null,
): { pos: BackfillPos; absTime: number; value: number; complete: boolean } {
    let pos = startPos;
    let absTime = startAbsTime;
    let value = startValue;

    // Unlike every other Watchdog in this file (which guards against a genuine no-progress
    // infinite loop and throwing is the right response - there's no sane partial result),
    // this walk always makes real forward progress each iteration (`absTime` only ever
    // advances or stays put for one committed crossing before moving on) - it can just need
    // an enormous number of individual real toggles to reach `now` (e.g. a chip asleep a long
    // time with a short learned period, or - see chip.ts's header + dicebug.txt - a
    // self-resetting counter whose promoted schedule has picked up more real transitions per
    // period than it should, a separate still-open bug). Bailing out with whatever partial
    // progress was made, instead of throwing, keeps that a performance ceiling instead of a
    // crash: `pos`/`absTime`/`value` are exactly as valid a resumable cursor here as they are
    // at the normal `candidate > now` return below, so the next call (backfillHistory() is
    // driven once per Scope.draw()) just picks up and makes more progress, same as any other
    // partial call - see chip.backfillHistory.test.ts's "small, irregularly-spaced calls" test.
    // `complete` tells the two returns apart: false here (this bail is NOT proof `value` holds
    // all the way to `now` - there's real, unwalked backlog beyond `absTime`), true at the normal
    // `candidate > now` return below (there genuinely is no transition before `now` left to find,
    // so `value` is known-good all the way to `now`, not just up to the last recorded `absTime` -
    // see backfillHistory()'s own docstring on why callers must tell these apart).
    const maxIterations = 1_000_000;

    for (let iterations = 0; ; iterations++) {
        if (iterations >= maxIterations) {
            console.warn(`advanceBackfillPos: exceeded ${maxIterations} iterations without reaching now=${now} (at absTime=${absTime}) - deferring the rest to a later call`);
            return { pos, absTime, value, complete: false };
        }

        // Resolve the innermost frame - walk `.sub` down, collecting every frame along the way
        // (top-to-bottom) so a frame can be popped or replaced in place below.
        const frames: BackfillPos[] = [pos];
        for (let p = pos; p.sub !== null; p = p.sub) frames.push(p.sub);
        const inner = frames[frames.length - 1];
        const level = inner.level;
        const oe = level.outputEvents;

        // Fast mode: skip whole periods of `level` via arithmetic when nothing needs recording -
        // same trick wakeUp() itself relies on for its root whole-period skip:
        // walking exactly `level.cycleTime` ticks from anywhere always lands back on the same idx
        // with the same value, by definition of what "this level repeats with period cycleTime"
        // means - true regardless of what's inside the period (nested sub-cycles included), so
        // unlike an approach that tries to count toggles-per-period, this needs no per-level
        // "is it a clean/flat template" check at all. Only `absTime` moves; `idx`/`value` don't.
        if (record === null && level.cycleTime > 0) {
            const bound = inner.exitBound < now ? inner.exitBound : now;
            const elapsed = bound - absTime;
            if (elapsed > level.cycleTime) {
                // "- 1" keeps at least one period's worth of normal stepping below, so the usual
                // tie-breaking at `now`/exitBound never needs to be reproduced here.
                const periods = Math.trunc((elapsed - 1) / level.cycleTime);
                if (periods > 0) {
                    absTime += periods * level.cycleTime;
                    continue;
                }
            }
        }

        let delay = rawDelay(level, inner.idx);

        // Climb: mirrors updateOutput()'s own ACTIVE-branch climb loop exactly - `absTime` stays
        // FIXED throughout (matching that loop's fixed `globalTime`), and each climb step
        // recomputes `delay` relative to the next parent up, subtracting however much of the
        // level being abandoned had already been consumed (`absTime - abandoned.entryTime`,
        // matching `globalTime - currentCycle.activationTime`) - only when the parent's own raw
        // delay is bigger than that (same conditional the real loop uses). This is NOT the same
        // as jumping `absTime` to the exit boundary and recomputing fresh from there; the
        // adjustment keeps the ORIGINAL `absTime` and folds the abandoned level's remaining span
        // into one combined `delay`.
        // Climbing is only ever tentative until we know the crossing actually happens THIS call -
        // popping a level discards its own `entryTime`, which is exactly what a LATER call would
        // need to redo this same climb-and-adjust math correctly if this call returns without
        // committing. So compute `climbIdx`/`delay` against the frame array without truncating it
        // yet; only slice it down (below) once `candidate <= now` confirms we're committing.
        //
        // Climbing itself must NOT be gated on `now` (it once was, via `exitBound <= now` here -
        // a real bug: for a small/incremental `now`, as backfillHistory() is always driven with
        // one real ScopePlot draw at a time - see its own docstring - `now` can sit well short of
        // a nested level's exitBound even once `absTime + delay` has already crossed it. Skipping
        // the climb then leaves `delay` at the abandoned (inner) level's own un-climbed value,
        // which can be SMALLER than the correctly-climbed delay - producing a `candidate` that
        // wrongly satisfies `candidate <= now` and gets committed as a bogus transition, over and
        // over, replaying the inner level's own short period forever instead of ever handing
        // control back to the parent. currentValue() never surfaces this: it's always called with
        // `now` = the current globalTime, virtually always far past any nearby exitBound, so the
        // gate was ~always satisfied there regardless - the bug was invisible from that caller.
        // Whether a crossing has passed a level's boundary is exactly `absTime + delay >=
        // frames[climbIdx].exitBound` on its own; `now` only ever decides whether the resulting
        // `candidate` gets committed (below), never whether the climb math itself runs.
        let climbIdx = frames.length - 1;
        while (absTime + delay >= frames[climbIdx].exitBound && climbIdx > 0) {
            const abandoned = frames[climbIdx];
            climbIdx--;
            const parent = frames[climbIdx];
            const parentDelay = rawDelay(parent.level, parent.idx);
            const consumed = absTime - abandoned.entryTime;
            if (parentDelay > consumed) delay = parentDelay - consumed;
        }

        const candidate = absTime + delay;

        // `now` matches the original (proven) flat formula's own convention: a transition
        // landing exactly ON `now` still counts as having happened (only `candidate > now`
        // withholds it - see chip.backfillHistory.test.ts's own asserted traces). Not committing
        // the climb here means returning `pos` completely unchanged - the abandoned level(s)'
        // frames, `entryTime` included, are still there for next time.
        if (candidate > now) return { pos, absTime, value, complete: true };

        // Committing now: truncate away whatever got climbed past above.
        frames.length = climbIdx + 1;
        const climbed = frames[climbIdx];
        const climbedLevel = climbed.level;
        const climbedOe = climbedLevel.outputEvents;

        // The crossing always toggles the value, whether the position names a real entry or a
        // placeholder - see this function's own docstring.
        value ^= 1;
        absTime = candidate;
        if (record) record(absTime, value);

        const justCrossed = climbedOe.get(climbed.idx);
        let nextIdx = climbedOe.inc(climbed.idx);
        if (nextIdx === climbedOe.end()) nextIdx = climbedLevel.firstOutputEvent;
        frames[frames.length - 1] = { level: climbedLevel, idx: nextIdx, entryTime: climbed.entryTime, exitBound: climbed.exitBound, sub: null };

        // If the position we just crossed (not `nextIdx` - `climbed.idx` itself) was a
        // placeholder, descend into it now, anchored at the absTime we just landed on.
        if (justCrossed.type) {
            const subCycle = justCrossed.subCycle!;
            const rawExit = absTime + subCycle.cycleDuration;
            const subExit = rawExit < climbed.exitBound ? rawExit : climbed.exitBound;
            pushEnteredCycle(frames, subCycle, absTime, subExit);
        }

        pos = rebuildBackfillPos(frames);
    }
}

export class Chip extends Cycle {
    circuit: Circuit;

    inputs = 0;
    private _output = 0;
    // Append-only (time, value) log of every real change to `output` - used by scope-plot
    // rendering (ScopePlot.fillFromDigitalHistory()/ScopePlot2d.fillDigitalRaster()), which
    // needs to reconstruct a trace after the fact rather than sampling every tick (sampling
    // every tick would force live evaluation and defeat the whole point of ASLEEP/promotion).
    // Not part of the original DICE port - see this file's header comment.
    history: HistoryEntry[] = [];

    get output(): number { return this._output; }
    set output(v: number) {
        // Only bother recording when something's actually reading `history` - see
        // `historyWatched`'s own comment. Gated the same way backfillHistory()'s push already
        // was (catchUpHistoryBeforeWake() only ever calls it once historyWatched is true) - this
        // just closes the other writer, the common live-transition path, which used to record
        // unconditionally for every chip whether or not anything was ever watching it.
        if (this.historyWatched && v !== this._output) this.history.push({ time: this.circuit.globalTime, value: v });
        this._output = v;
    }

    eventMask = ~0;
    prevOutputMask = 0;

    delay: [number, number] = [0, 0];
    pendingEvent = 0;

    outputLinks: ChipLink[] = [];
    inputLinks: ChipLink[] = [];

    type: ChipType = ChipType.CUSTOM_CHIP;

    lutData = 0;               // SIMPLE_CHIP
    lut: Uint32Array | null = null; // BASIC_CHIP
    customUpdate: ((chip: Chip, mask: number) => void) | null = null; // CUSTOM_CHIP

    customData: unknown;
    optimizationDisabled = false;
    isDeoptimizer = false; // true only for the special "_DEOPTIMIZER" chip

    // True only for the special "_VCC" / "_GND" chips. They fan out to every chip with a power
    // pin, but they are constant sources: they never schedule an event, so their own
    // activeOutputs is never read to dispatch anything. Links from these chips get input-link
    // index -1, which makes the activeOutputs set/clear in deactivateOutputs()/activateInputs()
    // a harmless no-op.
    isConstantSource = false;

    // Number of Uint32 words needed to cover this chip's output links; 1 for all but the very
    // widest nets. Kept in sync as connect() grows outputLinks.
    maskWords = 1;

    // Position in Circuit.chips. A FIXED property, unlike insertion sequence, so it can order
    // same-timestamp events in a way that is invariant to how the queue was reached - see
    // Circuit.queuePush()'s own tie-break comment.
    chipIndex = 0;

    // Reusable snapshot of currentCycle.activeOutputs. Safe to share per-chip because neither of
    // its two uses calls into another chip between taking the snapshot and consuming it.
    private actOutSnap = new LinkMask();

    state: ChipState = ChipState.PASSIVE;

    inputEvents: Cirque<Event>;
    inputEventEndTime: CirqueNum;
    inputEventTable: CirqueNum[] = [];
    firstInputTablePos = 0;

    firstInputEvent = 0;
    firstInputMask = 0;
    activeInputs = 0;

    sleepTime = 0;

    // Resumable cursor for backfillHistory() below - seeded at the exact position/time this
    // chip fell ASLEEP (see updateOutput()'s ASLEEP-entry branch), then advanced forward by
    // backfillHistory() itself as it's called. Deliberately separate from currentOutputEvent/
    // currentCycle (which wakeUp() needs untouched at their sleep-time values to replay from
    // scratch) - see backfillHistory()'s own docstring for why sharing those would corrupt live
    // replay. `backfillPos` mirrors currentCycle's own (possibly nested) position - see
    // BackfillPos's own docstring.
    private backfillPos: BackfillPos = { level: this, idx: 0, entryTime: 0, exitBound: MAX_U64, sub: null };
    private backfillAbsTime = 0;
    private backfillValue = 0;

    // Set once (never cleared) by ScopePlot.setDigitalChip() the first time some Scope resolves
    // its digitalChip to this Chip - see catchUpHistoryBeforeWake()'s own comment for why this
    // exists: waking a NEVER-watched chip can safely skip the granular backfill walk (nothing
    // will ever read the gap it leaves), but a chip a Scope has shown interest in must not be
    // allowed to grow one, even across a sleep episode nobody happened to poll mid-flight. Never
    // reset back to false - a Scope can detach and reattach (or a second Scope attach later), and
    // re-arming this cheaply on every attach isn't worth the bookkeeping when leaving it set is
    // already correct (just occasionally-unnecessary) for a chip nothing is watching any more.
    historyWatched = false;

    // Registered/unregistered by ScopePlot/ScopePlot2d (addHistoryWatcher()/removeHistoryWatcher())
    // as they attach to/detach from this chip - used only to compute trimHistory()'s safe floor.
    // Held as WeakRefs, not the watchers themselves: Scope.ts (and ScopeSerializer.ts) drop
    // ScopePlots from a good many scattered call sites (removing one trace, switching modes,
    // loading a saved circuit, ...), and an explicit removeHistoryWatcher() call is made from
    // the ones that are easy to reach (setDigitalChip() switching to a different chip while
    // still alive, in particular, which MUST be explicit - the watcher isn't garbage, so nothing
    // else would ever stop it counting against its old chip's floor). For anywhere a plot is
    // simply dropped and left to be garbage-collected, a WeakRef here means a stale entry prunes
    // itself out of the next trimHistory() sweep on its own, instead of permanently pinning that
    // chip's history to whatever floor the abandoned watcher last reported.
    private historyWatchers: Set<WeakRef<HistoryWatcher>> = new Set();

    addHistoryWatcher(w: HistoryWatcher): void {
        this.historyWatchers.add(new WeakRef(w));
        this.historyWatched = true;
        this.circuit.historyWatchedChips.add(this);
    }

    removeHistoryWatcher(w: HistoryWatcher): void {
        for (const ref of this.historyWatchers) {
            if (ref.deref() === w) { this.historyWatchers.delete(ref); break; }
        }
    }

    // Drops every `history` entry no currently-registered (and still-live) watcher can possibly
    // still need - see HistoryWatcher's own comment for what "still need" means. With zero live
    // watchers left (the common eventual end state for a chip that used to be watched - see
    // `historyWatched`'s own comment on why that flag itself stays true forever) this clears
    // `history` outright: nothing is reading it, so there's nothing worth keeping. Called once
    // per simulation frame for every chip `historyWatched` has ever been set on (see
    // SimulationManager.runCircuit()) - cheap to call on a chip with nothing to trim (the common
    // case), so no separate bookkeeping tracks whether it's actually needed this particular call.
    trimHistory(): void {
        let floor: number | null = null;
        for (const ref of this.historyWatchers) {
            const w = ref.deref();
            if (w === undefined) { this.historyWatchers.delete(ref); continue; }
            const f = w.historyFloor();
            if (floor === null || f < floor) floor = f;
        }
        if (floor === null) {
            if (this.history.length !== 0) this.history.length = 0;
            return;
        }
        if (this.history.length === 0 || this.history[0].time >= floor) return;
        // Binary search: first index with time >= floor, then drop everything before it.
        let lo = 0, hi = this.history.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.history[mid].time < floor) lo = mid + 1; else hi = mid;
        }
        if (lo > 0) this.history.splice(0, lo);
    }

    debugName = "";

    subCycles: (Cycle | null)[];
    currentCycle: Cycle;

    activationCycles: (Cycle | null)[] = [];

    lastInputEvent: number[] = [];
    lastOutputEvent = 0;

    visited = false;

    analogOutput = 0.0;

    constructor(queueSize: number, subcycleSize: number, circuit: Circuit, desc: ChipDesc, custom: unknown = null) {
        super(queueSize, subcycleSize);

        this.circuit = circuit;
        this.customData = custom;
        this.currentCycle = this;
        this.inputEvents = new Cirque<Event>(queueSize, () => new Event());
        this.inputEventEndTime = new CirqueNum(queueSize);
        this.subCycles = new Array(subcycleSize).fill(null);

        if (desc.logic === null && desc.custom === null) {
            this.type = ChipType.CUSTOM_CHIP;
            return;
        }

        const numInputPins = desc.inPins.length;

        // Every chip's output delay is floored to at least 1 tick, even when the element
        // specifies (or defaults to) 0s propagation delay. A true 0-tick delay means an
        // output can change on the very same simulated instant as one of its own inputs
        // (or as another chip driven by that same input event), and the engine has no
        // rule for ordering same-instant events consistently with real hardware - two
        // chips racing on the same tick will settle in whatever order they happen to be
        // queued, not the order real (nonzero-delay) hardware would settle in. That's
        // enough to permanently starve a downstream chip when a feedback loop's reset
        // path and its gated signal land on the same tick every cycle (confirmed via
        // ~/Downloads/po-hoz-2.txt: a same-tick race between a NAND-gated reset and the
        // counter bit it was supposed to gate stalled that counter forever, identically
        // in the fully-unoptimized reference path - not a promotion/cycle-detection bug).
        // Forcing a minimum 1-tick delay everywhere breaks same-instant ties without
        // requiring pd= support in the UI.
        this.delay = [
            Math.max(1, Math.trunc(desc.delay[0] / TIMESCALE)),
            Math.max(1, Math.trunc(desc.delay[1] / TIMESCALE)),
        ];

        this.inputLinks = new Array(numInputPins);
        this.activationCycles = new Array(numInputPins).fill(null);
        this.lastInputEvent = new Array(numInputPins).fill(0);

        if (desc.custom) {
            this.type = ChipType.CUSTOM_CHIP;
            this.customUpdate = desc.custom;
            return;
        }

        let lutSize = numInputPins;
        for (let k = 0; k < desc.evPins.length; k++) this.eventMask &= ~(1 << lutSize++);
        if (desc.prevOutPin) { this.prevOutputMask = (1 << lutSize); lutSize++; }

        // <=5, not <=6: lutData is a plain 32-bit `number` now, so the whole table must fit in
        // one word. A 6-bit LUT falls through to the BASIC_CHIP path, which already used a
        // Uint32Array.
        if (lutSize <= 5) {
            this.type = ChipType.SIMPLE_CHIP;
            this.lutData = 0;
        } else {
            this.type = ChipType.BASIC_CHIP;
            this.lut = new Uint32Array(1 << (lutSize - 5));
        }

        const pin = new Int32Array(MAX_PINS + 1);
        const prevPin = new Int32Array(MAX_PINS + 1);
        const eventPin = new Int32Array(MAX_PINS + 1);

        for (let i = 0; i < (1 << lutSize); i++) {
            pin.fill(0); prevPin.fill(0); eventPin.fill(0);
            let x = i;
            for (let j = 0; j < numInputPins; j++) { pin[desc.inPins[j]] = x & 1; x >>= 1; }
            for (let j = 0; j < desc.evPins.length; j++) { eventPin[desc.evPins[j]] = x & 1; x >>= 1; }
            if (desc.prevOutPin) prevPin[desc.prevOutPin] = x & 1;

            desc.logic!(pin, prevPin, eventPin, custom);

            if (this.type === ChipType.SIMPLE_CHIP) {
                if (pin[desc.outPin]) this.lutData |= (1 << i);
            } else {
                if (pin[desc.outPin]) this.lut![i >> 5] |= (1 << (i & 0x1f));
            }
        }
    }

    initialize(): void {
        let newOut = this.output;

        this.inputs &= this.eventMask;

        switch (this.type) {
            case ChipType.SIMPLE_CHIP: newOut = (this.lutData >>> this.inputs) & 1; break;
            case ChipType.BASIC_CHIP: newOut = (this.lut![this.inputs >> 5] >> (this.inputs & 0x1f)) & 1; break;
            case ChipType.CUSTOM_CHIP: this.customUpdate!(this, 0); return;
        }

        if (newOut !== this.output) {
            this.output = newOut;

            if (this.output) this.inputs |= this.prevOutputMask;
            else this.inputs &= ~this.prevOutputMask;

            for (const link of this.outputLinks) link.chip.inputs ^= link.mask;
            for (const link of this.outputLinks) {
                if (link.chip === (this as Chip)) continue;
                link.chip.initialize();
            }
        }
    }

    connect(chip: Chip, desc: ChipDesc, pin: number): void {
        for (let i = 0; i < desc.inPins.length; i++) {
            if (desc.inPins[i] === pin) {
                let x = 0;
                for (; x < this.outputLinks.length; x++) if (this.outputLinks[x].chip === chip) break;

                assertLinkBit(i, `chip '${chip.debugName}' input pin index`);

                if (x !== this.outputLinks.length) {
                    this.outputLinks[x].mask |= 1 << i;
                } else {
                    this.outputLinks.push(new ChipLink(chip, 1 << i));
                    if (!this.isConstantSource) this.activeOutputs.setBit(x);
                    this.maskWords = this.activeOutputs.words.length;
                }

                for (let j = 0; j < desc.evPins.length; j++)
                    if (desc.evPins[j] === pin) {
                        assertLinkBit(chip.inputLinks.length + j, `chip '${chip.debugName}' event pin bit`);
                        this.outputLinks[x].mask |= 1 << (chip.inputLinks.length + j);
                    }

                if (this.type !== ChipType.CUSTOM_CHIP || !this.isDeoptimizer)
                    // inputLinks store the source's output-link INDEX, not a bit (-1 = constant source).
                    chip.inputLinks[i] = new ChipLink(this, this.isConstantSource ? -1 : x);

                return;
            }
        }
    }

    // Repeatedly climbs from `this.currentCycle` to its parent while `delay` (measured from
    // `globalTime - time`) would carry us past the current cycle's endTime, adjusting `delay`
    // to land within the parent instead. `time` is the offset already consumed within the
    // current cycle; pass 0 when there is none. `watchdog`/`message` are optional since not
    // every call site guards this climb.
    private climbToValidCycle(globalTime: number, time: number, delay: number, watchdog?: Watchdog, message?: () => string): number {
        while (globalTime - time + delay >= this.currentCycle.endTime) {
            watchdog?.tick(message!);
            const parent = this.currentCycle.parentCycle!;
            if (parent.nextOutputEventDelay() + time > (globalTime - this.currentCycle.activationTime))
                delay = parent.nextOutputEventDelay() - (globalTime - this.currentCycle.activationTime) + time;
            this.currentCycle = parent;
        }
        return delay;
    }

    // Finishes backfillHistory()'s own granular walk up through `now`, right as this chip wakes
    // (always via wakeUp(), which updateOutput()'s ASLEEP case now delegates to) - BEFORE that
    // replay goes on to (re)compute `this.output`/`currentCycle` via its own, separate, cheaper
    // method (the root whole-period skip - see wakeUp()'s own comment on why it can't just always
    // walk every toggle itself: it'd trade away the whole point of the promotion optimization for
    // a chip nobody's watching).
    //
    // The actual bug this fixes: `this.output`'s setter (see its own comment) appends to `history`
    // on every real change - including the ones wakeUp()'s/updateOutput()'s own replay makes while
    // fast-forwarding through a sleep. If backfillHistory() had ALSO already walked (part of) that
    // same span - because a scope polled it mid-sleep - both walks independently push entries for
    // the same transitions into the same append-only array: not "disagreeing" so much as each
    // being written TWICE, once by backfillHistory()'s explicit push and once more via the
    // replay's setter-triggered push, since the two use separate cursors (backfillPos vs.
    // currentCycle) that don't know about each other. That's what produced the fictional streaks -
    // not a wrong value, a duplicated/overlapping one. Calling this first, and then having the
    // replay bypass the setter for any span it just finished (see historyIsSynced() below),
    // guarantees `history` gets each real transition from exactly one of the two writers, never
    // both.
    //
    // A no-op when NEITHER of two things is true: (a) something already polled backfillHistory()
    // during this particular sleep episode (`backfillAbsTime > sleepTime` - cheap to keep taking
    // advantage of when it happens to be true, since the walk from there to `now` is normally
    // short), or (b) `historyWatched` is true - i.e. some Scope has EVER resolved its digitalChip
    // to this Chip (see that field's own comment). (b) is the one that matters: skipping the
    // granular walk and falling back to wakeUp()'s own cheaper period-skipping replay is only
    // actually safe for a chip nothing is watching.
    //
    // It is NOT safe merely because nobody happened to poll backfillHistory() during THIS
    // PARTICULAR sleep episode (the guard used to check ONLY (a), unconditionally treating
    // "unpolled this episode" as "safe to skip" - the real bug behind the reported
    // white-streaks/missing-detail corruption, confirmed via chip.wakeUpHistoryTruncation.test.ts).
    // The replay does NOT populate `history` for the whole elapsed sleep. It used to collapse
    // the walk to at most one (possibly partial) period with `time = (globalTime - sleepTime) %
    // cycleTime`; that modulo is gone (it ignored enclosing-cycle boundaries - see wakeUp()), but
    // the same gap remains in weaker form, because wakeUp() still fast-forwards whole periods
    // arithmetically at the root rather than stepping through each one. Either way it is by
    // design - the whole point of the promotion optimization is that `this.output`'s FINAL value
    // doesn't need every intermediate toggle replayed to be correct. Whole periods skipped that
    // way are simply never visited, so their setter-triggered writes never happen - not
    // "deferred", genuinely dropped (worse the longer the sleep, i.e. worse the faster the sim
    // runs or the longer between Scope draws - matching the reported symptom). The transitions
    // the replay DOES compute and write can also, less often, land on a time/value the granular
    // walk itself would
    // compute and write can also, less often, land on a time/value the granular walk itself would
    // NOT have produced for that instant (see chip.wakeUpHistoryTruncation.test.ts's own header
    // comment) - `this.output` still converges back to correct once a subsequent real input event
    // forces a fresh, fully-informed re-promotion, but whatever got written into `history` in the
    // meantime doesn't un-write itself. A Scope calling backfillHistory() once per draw() only
    // closes the gap (and avoids that occasional bad write) if a draw() happens to land WHILE this
    // chip is still ASLEEP; a fast-running sim can easily complete an entire (real, event-driven)
    // sleep->wake cycle between two draws, and unlike the live simulation - which only needs
    // `this.output`'s eventual value, so this is invisible to it - a Scope's `history`-
    // reconstructed trace needs every one of those transitions right, and once one is dropped or
    // misrecorded it's permanent: a solid gap or a wrong-colored pixel (the reported "white
    // streak"/missing block, or an occasional stray one). Also gating this
    // on `historyWatched` keeps the fast, gap-tolerant period-skipping path for the (common) case of a
    // chip nothing is scoping - unwatched chips have no `history` reader to ever notice a gap -
    // while any chip a Scope cares about pays the granular-walk cost on every wake, whether or
    // not that specific episode happened to get polled first.
    // Returns true when `history` is now known-complete through `now` - i.e. whether the caller's
    // own replay (about to walk the very same span again purely for `this.output`/`currentCycle`
    // bookkeeping) must write `this._output` directly, bypassing the history-appending setter, to
    // avoid duplicating entries backfillHistory() already recorded. Deliberately checks
    // backfillHistory()'s RETURN VALUE, not `this.backfillAbsTime` directly: a call can legitimately
    // prove "nothing changes before `now`" (and so report itself complete through `now`) without
    // ever moving `backfillAbsTime` up to `now` itself - it only advances that cursor to wherever
    // the last real transition actually was (see backfillHistory()'s own docstring on `complete`).
    // Comparing the field instead of the return value looks plausible but is always false in
    // exactly the common case this exists to catch, silently defeating the whole bypass.
    //
    // Returns false both when nobody was watching (no catch-up was attempted, so nothing to
    // duplicate - the replay's own setter writes are the only record) and in the rare case a
    // catch-up call's iteration budget ran out before reaching `now` (see backfillHistory()'s own
    // docstring) - the still-missing tail must still be recorded somehow, so it's safer to let the
    // replay's normal setter writes cover it (re-covering the already-backfilled prefix too, in
    // that rare case, rather than silently dropping the tail).
    private catchUpHistoryBeforeWake(): boolean {
        if (!this.historyWatched && this.backfillAbsTime <= this.sleepTime) return false;
        const now = this.circuit.globalTime;
        return this.backfillHistory(now) >= now;
    }

    // Deactivates every output link that is set in `a` but not in `b`. The difference is
    // computed up front (matching the old single-mask semantics) because deactivateOutputs() can
    // re-enter and mutate these masks. The single-word path allocates nothing; wider chips take
    // a fresh scratch array rather than a shared one, so recursion stays safe.
    private deactivateDiff(a: LinkMask, b: LinkMask): void {
        if (this.maskWords <= 1) {
            let m = a.words[0] & ~b.words[0];
            while (m !== 0) {
                __globalMaskWatchdog();
                const i = Chip.nextBit(m);
                this.outputLinks[i].chip.deactivateOutputs();
                m &= ~(1 << i);
            }
            return;
        }

        const nw = this.maskWords;
        const diff = new Uint32Array(nw);
        for (let w = 0; w < nw; w++) diff[w] = a.word(w) & ~b.word(w);
        for (let w = 0; w < nw; w++) {
            let m = diff[w];
            const base = w << 5;
            while (m !== 0) {
                __globalMaskWatchdog();
                const i = Chip.nextBit(m);
                this.outputLinks[base + i].chip.deactivateOutputs();
                m &= ~(1 << i);
            }
        }
    }

    getNextOutput(time: number): number {
        this.currentOutputEvent = this.outputEvents.begin();
        let c: Cycle = this;

        if (this.outputEvents.empty()) return this.output ^ 1;

        while (c.currentOutputEvent !== c.outputEvents.end() && c.outputEvents.get(c.currentOutputEvent).time < time) {
            const e = c.outputEvents.get(c.currentOutputEvent);

            if (e.type === 1 && e.time + c.cycleDuration > time) {
                c = e.subCycle!;
                c.currentOutputEvent = c.outputEvents.begin();
            } else {
                c.currentOutputEvent = c.outputEvents.inc(c.currentOutputEvent);
            }
        }

        if (c.currentOutputEvent === c.outputEvents.end()) return this.output ^ 1;

        while (c.outputEvents.get(c.currentOutputEvent).type === 1) {
            c = c.outputEvents.get(c.currentOutputEvent).subCycle!;
            c.currentOutputEvent = c.outputEvents.begin();
        }

        return c.outputEvents.get(c.currentOutputEvent).state;
    }

    wakeUp(): void {
        // requires state still ASLEEP - see its own docstring
        const historySynced = this.catchUpHistoryBeforeWake();
        const globalTime = this.circuit.globalTime;
        this.state = ChipState.ACTIVE;

        // The replay walks the WHOLE sleep span. It must not be collapsed with `% cycleTime`:
        // that single unbounded modulo ignores enclosing-cycle boundaries, which is what made
        // sleeps longer than one cycle wrong - and the climb below makes such sleeps routine.
        // Because the walk visits every period itself, the cycle needs no compensating
        // endTime/activationTime shift either.
        let time = globalTime - this.sleepTime;
        let delay = this.currentCycle.nextOutputEventDelay();
        this.lastOutputEvent = globalTime - time;

        this.actOutSnap.copyFrom(this.currentCycle.activeOutputs);

        delay = this.climbToValidCycle(globalTime, time, delay);

        const wakeWatchdog = new Watchdog(100000000);
        while (time > delay) {
            wakeWatchdog.tick(() => `wakeUp stuck: chip=${this.debugName} time=${time} delay=${delay}`);

            // Fast-forward whole periods AT THE ROOT. Advancing exactly cycleTime from anywhere
            // returns to the same cursor with the same output -- that is what "this chip repeats
            // with period cycleTime" means -- so whole periods can be skipped arithmetically
            // instead of walked event by event. Restricted to the root because only there is
            // there no enclosing cycle whose endTime the skip could cross; the single unbounded
            // modulo wakeUp() used to apply everywhere is exactly the version that ignores those
            // boundaries, which is why it was wrong. `time - delay >= cycleTime` keeps at least
            // one event's worth of normal stepping, so the loop's own termination is untouched.
            //
            // Skipped in EVEN numbers only (SKIP_MULT): a period is not guaranteed to hold an
            // even number of output toggles - for at least one chip cycleTime is really a HALF
            // period - so skipping a single period can flip the output. Skipping in pairs cannot.
            //
            // NOTE this loop is only ever entered when nothing was watching the trace; a watched
            // chip has already had `history` walked toggle-by-toggle by catchUpHistoryBeforeWake()
            // above, and `historySynced` then keeps this replay from double-recording it.
            if (this.currentCycle === (this as Cycle) && this.cycleTime > 0
                && time - delay >= this.cycleTime) {
                let periods = Math.trunc((time - delay) / this.cycleTime);
                periods -= periods % SKIP_MULT;
                if (periods > 0) time -= periods * this.cycleTime;
            }
            time -= delay;

            if (historySynced) this._output ^= 1; else this.output ^= 1;
            this.inputs ^= this.prevOutputMask;

            this.currentCycle = this.currentCycle.nextOutputCycle(globalTime - time);
            delay = this.currentCycle.nextOutputEventDelay();

            delay = this.climbToValidCycle(globalTime, time, delay);
        }

        this.lastOutputEvent = globalTime;
        this.pendingEvent = this.circuit.queuePush(this, delay - time);
        this.currentCycle = this.currentCycle.nextOutputCycle(globalTime - time + delay);

        this.deactivateDiff(this.currentCycle.activeOutputs, this.actOutSnap);
    }

    updateInputs(mask: number): void {
        const globalTime = this.circuit.globalTime;

        if (this.type === ChipType.CUSTOM_CHIP) {
            this.customUpdate!(this, mask);
            return;
        } else if (this.optimizationDisabled) {
            Chip.updateInputsSimple(this, mask);
            return;
        }

        if (this.state === ChipState.ASLEEP) this.wakeUp();

        this.lastInputEvent[Chip.nextBit(mask)] = globalTime;

        if (this.state === ChipState.ACTIVE) {
            this.deactivateOutputs();
            this.inputEventTable[this.inputEvents.back().state].pop_back();
            this.inputEvents.pop_back();
        }

        const inputChip = this.inputLinks[Chip.nextBit(mask)].chip;

        if (!inputChip.inputEvents.empty()) {
            let time = inputChip.inputEvents.front().time;
            while (this.inputEvents.size() > 1 && this.inputEvents.get(this.inputEvents.inc(this.inputEvents.begin())).time < time) {
                this.inputEventTable[this.inputEvents.front().state].pop_front();
                this.inputEvents.pop_front();
            }

            time = this.inputEvents.front().time;
            while (!this.outputEvents.empty() && this.outputEvents.front().time < time) {
                if (this.outputEvents.front().type)
                    this.allocatedSubCycles.deallocate(this.outputEvents.front().subCycle!.allocatedSubCycles);
                this.outputEvents.pop_front();
            }
        }

        this.inputs ^= mask;

        let newOut: number;
        if (this.type === ChipType.SIMPLE_CHIP) newOut = (this.lutData >>> this.inputs) & 1;
        else newOut = (this.lut![this.inputs >> 5] >> (this.inputs & 0x1f)) & 1;

        if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' input changed, new output: ${newOut}`);

        if (newOut !== this.output && this.pendingEvent === 0) {
            this.pendingEvent = this.circuit.queuePush(this, this.delay[this.output]);
            this.inputs ^= this.prevOutputMask;

            if (this.outputEvents.full()) {
                if (this.outputEvents.front().type)
                    this.allocatedSubCycles.deallocate(this.outputEvents.front().subCycle!.allocatedSubCycles);
            }

            this.outputEvents.push_back(new Event(globalTime + this.delay[this.output], newOut));
        } else if (this.pendingEvent !== 0 && newOut === this.output) {
            this.pendingEvent = 0;
            this.inputs ^= this.prevOutputMask;

            if (!this.outputEvents.empty()) this.outputEvents.pop_back();
        }

        this.inputs &= this.eventMask;

        while (this.inputEventTable.length <= this.inputs)
            this.inputEventTable.push(new CirqueNum(this.outputEvents.getQueueSize()));

        this.firstInputTablePos = this.inputEventTable[this.inputs].begin();
        this.firstInputMask = this.activeInputs = (1 << this.inputLinks.length) - 1;

        if (!this.inputEvents.empty() && this.activationCheck(this.inputEvents.front().time, globalTime) < globalTime) {
            this.activateInputs();
            return;
        }

        if (!this.inputEvents.empty() && this.inputEvents.back().time === globalTime) {
            this.inputEventTable[this.inputEvents.back().state].pop_back();
            this.inputEvents.pop_back();
        } else if (this.inputEvents.full()) {
            this.inputEventTable[this.inputEvents.front().state].pop_front();
        }

        this.inputEventTable[this.inputs].push_back(this.inputEvents.end());
        this.inputEvents.push_back(new Event(globalTime, this.inputs));
    }

    static updateInputsSimple(chip: Chip, mask: number): void {
        chip.inputs ^= mask;

        let newOut: number;
        if (chip.type === ChipType.SIMPLE_CHIP) newOut = (chip.lutData >>> chip.inputs) & 1;
        else newOut = (chip.lut![chip.inputs >> 5] >> (chip.inputs & 0x1f)) & 1;

        if (DEBUG_TRACE) console.log(`[t:${chip.circuit.globalTime}] chip '${chip.debugName}' input changed, new output: ${newOut}`);

        if (newOut !== chip.output && chip.pendingEvent === 0) {
            chip.pendingEvent = chip.circuit.queuePush(chip, chip.delay[chip.output]);
            chip.inputs ^= chip.prevOutputMask;
        } else if (chip.pendingEvent !== 0 && newOut === chip.output) {
            chip.pendingEvent = 0;
            chip.inputs ^= chip.prevOutputMask;
        }

        chip.inputs &= chip.eventMask;
    }

    updateOutput(): void {
        const globalTime = this.circuit.globalTime;

        // A sleeping chip always wakes through the full wakeUp(): unlike the inline fast path
        // this replaces, it can recover from a sleep spanning more than one cycle, which the
        // climb-on-sleep below makes routine. wakeUp() does its own catchUpHistoryBeforeWake().
        if (this.state === ChipState.ASLEEP) { this.wakeUp(); return; }

        this.lastOutputEvent = globalTime;

        // Walk the active output links. activeOutputs (and currentCycle itself) can be mutated
        // by updateInputs(), so both are re-read every step; `unvisited` ensures each index is
        // visited at most once. Per-word so fan-out is unbounded -- for a single word this is
        // exactly the old scalar loop plus one array load.
        if (this.maskWords === 1) {
            let unvisited = ~0;
            for (;;) {
                const bits = this.currentCycle.activeOutputs.words[0] & unvisited;
                if (bits === 0) break;
                const b = Chip.nextBit(bits);
                const link = this.outputLinks[b];
                link.chip.updateInputs(link.mask);
                unvisited &= ~(1 << b);
            }
        } else {
            for (let w = 0; w < this.maskWords; w++) {
                let unvisited = ~0;
                for (;;) {
                    const bits = this.currentCycle.activeOutputs.word(w) & unvisited;
                    if (bits === 0) break;
                    const b = Chip.nextBit(bits);
                    const link = this.outputLinks[(w << 5) + b];
                    link.chip.updateInputs(link.mask);
                    unvisited &= ~(1 << b);
                }
            }
        }

        this.output ^= 1;
        this.pendingEvent = 0;

        if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' output changed to ${this.output}`);

        if (this.state === ChipState.ACTIVE) {
            if (this.currentCycle.activeOutputs.isZero()) {
                this.state = ChipState.ASLEEP;
                this.sleepTime = globalTime;

                // Seed the backfill cursor at exactly this position - currentOutputEvent (at
                // every nesting level from currentCycle up to `this`) still indexes the entry
                // just applied (this.output above), and wakeUp() itself starts its own replay
                // from this same (currentCycle chain, sleepTime) state, so this is the correct
                // starting point for backfillHistory()'s independent forward walk too.
                this.backfillPos = captureBackfillPos(this);
                this.backfillAbsTime = globalTime;
                this.backfillValue = this.output;

                if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' asleep`);

                // CLIMB-ON-SLEEP. Climb to the highest enclosing cycle that ALSO has no active
                // outputs, and take the wake timer from ITS endTime. Its endTime is later, so
                // the timer is further out; if the climb reaches the root there is no timer at
                // all and the chip sleeps until something genuinely needs it. This is the
                // commented-out "TODO: make this work?" loop at chip.cpp:790 in the C++
                // original, which was never carried into the original port. It needs no
                // arbitrary cycle count and no chip selection: the cycle structure itself says
                // how long nobody is listening. Measured -59%/-71% updateOutput() calls on
                // dice-ts's breakout/pong, bit-identical to the pre-climb engine.
                //
                // It requires the canonical tie-break in circuit.ts to be hash-neutral: without
                // it, not pushing/popping these events reshapes the heap, which flips the pop
                // order of equal-time events, which is load-bearing (see queuePush()).
                //
                // Climbing must NOT move currentCycle - doing so leaves the destination cursor
                // stale and wakeUp()'s replay restarts from the wrong position. It is used only
                // to COMPUTE a later wake time.
                //
                // The root case subsumes the old "schedule whenever currentCycle !== root"
                // rule: a chip whose currentCycle is already the root gets no timer (the root's
                // endTime is unbounded, so no delay can be computed from it), and one that is
                // not gets a timer from whatever idle ancestor the climb stops at - which is at
                // worst currentCycle itself, i.e. exactly the old behavior. Chips therefore
                // still keep a self-wake timer wherever they used to have one; only the
                // genuinely-nobody-is-listening case loses it, and that case is woken on demand
                // by deactivateOutputs()/updateInputs() instead.
                let wakeFrom: Cycle = this.currentCycle;
                while (wakeFrom.parentCycle !== null && wakeFrom.parentCycle.activeOutputs.isZero())
                    wakeFrom = wakeFrom.parentCycle;

                if (wakeFrom !== (this as Cycle))
                    this.pendingEvent = this.circuit.queuePush(this, wakeFrom.endTime - globalTime);
                else
                    this.pendingEvent = 0; // climbed to root: no timer, wake only on demand

                return;
            }

            let delay = this.currentCycle.nextOutputEventDelay();

            const activeWatchdog = new Watchdog(100000);
            while (globalTime + delay >= this.currentCycle.endTime) {
                activeWatchdog.tick(() => `updateOutput(active) stuck: chip=${this.debugName}`);
                const parent = this.currentCycle.parentCycle!;
                if (parent.nextOutputEventDelay() > (globalTime - this.currentCycle.activationTime))
                    delay = parent.nextOutputEventDelay() - (globalTime - this.currentCycle.activationTime);

                this.deactivateDiff(parent.activeOutputs, this.currentCycle.activeOutputs);

                if (this.state !== ChipState.ACTIVE) return;

                this.currentCycle = parent;
            }

            this.currentCycle = this.currentCycle.nextOutputCycle(globalTime + delay);
            this.pendingEvent = this.circuit.queuePush(this, delay);
        }
    }

    activationCheck(minTimeParam: number, maxTimeParam: number): number {
        this.visited = true;

        const globalTime = this.circuit.globalTime;

        let minTime = minTimeParam;
        let maxTime = maxTimeParam;

        const inputEventList = this.inputEventTable[this.inputs];

        const watchdog = new Watchdog(1000000);
        for (let x = this.firstInputTablePos; x !== inputEventList.end();
            x = inputEventList.inc(x), this.firstInputTablePos = inputEventList.inc(this.firstInputTablePos)) {

            watchdog.tick(() => `activationCheck stuck: chip=${this.debugName} inputs=${this.inputs} x=${x} end=${inputEventList.end()} size=${inputEventList.size()} firstInputTablePos=${this.firstInputTablePos}`);

            const i = inputEventList.get(x); // raw index into this.inputEvents

            let startTime: number, endTime: number;

            if (this.inputEvents.get(i).type) {
                startTime = this.inputEvents.get(i).time;
                endTime = this.inputEventEndTime.get(i);
            } else {
                startTime = this.inputEvents.get(i).time;
                const next = this.inputEvents.inc(i);
                endTime = (next !== this.inputEvents.end()) ? this.inputEvents.get(next).time : globalTime;
            }

            let min = minTimeParam > startTime ? minTimeParam : startTime;
            let max = maxTime < endTime ? maxTime : endTime;

            if (min >= maxTime) { maxTime = min; break; }
            if (min >= max) continue;

            let result = true;

            this.activationTime = min;

            for (let j = 0; (this.activeInputs >> j) !== 0; j++) {
                j += Chip.nextBit(this.activeInputs >> j);
                const chip = this.inputLinks[j].chip;
                this.activationCycles[j] = chip;

                if (this.lastInputEvent[j] <= min) {
                    this.activeInputs &= ~(1 << j);
                } else if (chip.state === ChipState.ACTIVE) {
                    result = false;
                    const minSave = min;
                    let actMin = MAX_U64;

                    const chainWatchdog = new Watchdog(100000);
                    for (let c: Cycle | null = chip.currentCycle; c !== null; c = c.parentCycle) {
                        chainWatchdog.tick(() => `activationCheck cycle-chain stuck: chip=${chip.debugName}`);
                        min = minSave;

                        if (c.activationTime > min) min = c.activationTime;
                        if (min < actMin) actMin = min;

                        if (min >= max) continue;

                        this.activationTime = min + ((globalTime - min) % c.cycleTime);
                        if (this.activationTime < actMin) actMin = this.activationTime;

                        if (this.activationTime >= max) continue;

                        min = this.activationTime;
                        max = min + 1;
                        result = true;
                        this.activationCycles[j] = c;
                        break;
                    }

                    minTime = actMin > this.lastInputEvent[j] ? this.lastInputEvent[j] : actMin;

                    if (!result) break;
                } else if (chip.state === ChipState.PASSIVE && (chip.type === ChipType.CUSTOM_CHIP || chip.optimizationDisabled)) {
                    minTime = this.lastInputEvent[j];
                    result = false;
                    break;
                } else if (chip.state === ChipState.PASSIVE && !chip.visited) {
                    if ((this.firstInputMask >> j) & 1) {
                        chip.firstInputTablePos = chip.inputEventTable[chip.inputs].begin();
                        chip.firstInputMask = chip.activeInputs = (1 << chip.inputLinks.length) - 1;
                        this.firstInputMask &= ~(1 << j);
                    }

                    this.activationTime = chip.activationCheck(min, max);
                    minTime = this.activationTime > this.lastInputEvent[j] ? this.lastInputEvent[j] : this.activationTime;

                    if (this.activationTime >= max) { result = false; break; }
                    else { min = this.activationTime; max = min + 1; }
                }
            }

            if (!result) continue;

            if (globalTime - this.activationTime < this.delay[0] + this.delay[1]) continue;

            if (this.getNextOutput(this.activationTime) === this.output) continue;

            if (this.pendingEvent !== 0 &&
                this.pendingEvent !== this.currentCycle.outputEvents.get(this.currentCycle.currentOutputEvent).time + globalTime - this.activationTime)
                continue;

            this.firstInputEvent = i;
            this.visited = false;
            return this.activationTime;
        }

        this.visited = false;
        return maxTime;
    }

    activateInputs(): void {
        this.state = ChipState.ACTIVE;

        if (DEBUG_TRACE) console.log(`[t:${this.circuit.globalTime}] chip '${this.debugName}' activated`);

        this.currentCycle = this;

        this.cycleTime = this.circuit.globalTime - this.activationTime;
        this.endTime = MAX_U64;

        for (let i = 0; i < this.inputLinks.length; i++) {
            if (this.lastInputEvent[i] > this.activationTime) {
                const chip = this.inputLinks[i].chip;
                const stopAt = this.activationCycles[i]!.parentCycle;

                for (let c: Cycle | null = chip.currentCycle; c !== stopAt; c = c!.parentCycle) {
                    if (this.inputLinks[i].mask >= 0) c!.activeOutputs.clearBit(this.inputLinks[i].mask);
                }

                if (chip.state === ChipState.PASSIVE) chip.activateInputs();
            }
        }

        this.firstOutputEvent = this.currentOutputEvent;

        if (this.firstOutputEvent !== this.outputEvents.end()) {
            if (this.pendingEvent !== 0) {
                this.outputEvents.pop_back();
            } else {
                this.pendingEvent = this.circuit.queuePush(this, this.outputEvents.get(this.currentOutputEvent).time - this.activationTime);
            }

            this.currentCycle = this.nextOutputCycle(this.cycleTime + this.outputEvents.get(this.currentOutputEvent).time);
        }
    }

    deactivateOutputs(): void {
        if (this.state === ChipState.ASLEEP) this.wakeUp();

        const globalTime = this.circuit.globalTime;

        if ((this.pendingEvent >= globalTime) && ((this.pendingEvent - globalTime) <= this.delay[this.output])) {
            if ((this.pendingEvent - globalTime) === this.delay[this.output]) {
                let isInput = false;

                for (let i = 0; i < this.inputLinks.length; i++) {
                    if (this.inputLinks[i].chip.pendingEvent === globalTime) { isInput = true; break; }
                }

                if (isInput) {
                    this.pendingEvent = 0;
                    this.inputs = this.output ? this.prevOutputMask : 0;
                } else {
                    this.inputs = this.output ? 0 : this.prevOutputMask;
                }
            } else {
                this.inputs = this.output ? 0 : this.prevOutputMask;
            }
        } else {
            this.pendingEvent = 0;
            this.inputs = this.output ? this.prevOutputMask : 0;
        }

        this.state = ChipState.PASSIVE;

        if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' deactivated`);

        for (let i = 0; i < this.inputLinks.length; i++)
            for (let c: Cycle | null = this.inputLinks[i].chip.currentCycle; c; c = c.parentCycle)
                if (this.inputLinks[i].mask >= 0) c.activeOutputs.setBit(this.inputLinks[i].mask);

        for (let i = 0; i < this.inputLinks.length; i++) {
            if (this.inputLinks[i].chip.state === ChipState.ASLEEP) this.inputLinks[i].chip.wakeUp();
            this.inputs |= this.inputLinks[i].chip.output << i;
        }
        this.inputs &= this.eventMask;

        if (this.type === ChipType.CUSTOM_CHIP || this.optimizationDisabled || this.inputEvents.empty()) {
            for (let i = 0; i < this.outputLinks.length; i++)
                if (!this.currentCycle.activeOutputs.testBit(i) && this.outputLinks[i].chip.state !== ChipState.PASSIVE)
                    this.outputLinks[i].chip.deactivateOutputs();
            return;
        }

        if (!this.inputEvents.get(this.firstInputEvent).type) {
            this.inputEvents.get(this.firstInputEvent).type = 1;
            this.inputEventEndTime.set(this.firstInputEvent, this.inputEvents.get(this.inputEvents.inc(this.firstInputEvent)).time);
        }

        for (let i = this.inputEvents.dec(this.inputEvents.end()); i !== this.firstInputEvent; i = this.inputEvents.dec(i)) {
            this.inputEventTable[this.inputEvents.back().state].pop_back();
            this.inputEvents.pop_back();
        }

        while (this.inputEventTable.length <= this.inputs)
            this.inputEventTable.push(new CirqueNum(this.outputEvents.getQueueSize()));

        this.inputEventTable[this.inputs].push_back(this.inputEvents.end());
        this.inputEvents.push_back(new Event(globalTime, this.inputs));

        const fullWatchdog = new Watchdog(100000);
        while (this.allocatedSubCycles.full()) {
            fullWatchdog.tick(() => `deactivateOutputs full() loop stuck: chip=${this.debugName}`);
            if (this.outputEvents.begin() === this.firstOutputEvent) {
                this.inputEvents.clear();
                this.outputEvents.clear();
                this.firstOutputEvent = this.outputEvents.begin();
                for (let i = 0; i < this.inputEventTable.length; i++) this.inputEventTable[i].clear();
                this.allocatedSubCycles.clear();
                this.cycleTime = 0;
                break;
            }

            if (this.outputEvents.front().type)
                this.allocatedSubCycles.deallocate(this.outputEvents.front().subCycle!.allocatedSubCycles);

            this.outputEvents.pop_front();

            const eventDelay = this.delay[1] < this.delay[0] ? this.delay[1] : this.delay[0];

            while (!this.inputEvents.empty() && this.inputEvents.front().time + eventDelay <= this.outputEvents.front().time) {
                this.inputEventTable[this.inputEvents.front().state].pop_front();
                this.inputEvents.pop_front();
            }
        }

        if (this.firstOutputEvent !== this.outputEvents.end()) {
            const cycleNum = this.allocatedSubCycles.allocate();

            if (this.subCycles[cycleNum] === null)
                this.subCycles[cycleNum] = new Cycle(this.outputEvents.getQueueSize(), this.allocatedSubCycles.size);

            const cycle = this.subCycles[cycleNum]!;

            cycle.outputEvents.clear();
            cycle.allocatedSubCycles.clear();
            cycle.allocatedSubCycles.set(cycleNum);
            cycle.parentCycle = this;

            for (let i = this.firstOutputEvent; i !== this.outputEvents.end(); i = this.outputEvents.inc(i)) {
                const e = this.outputEvents.get(i);
                if (e.type) {
                    cycle.allocatedSubCycles.orEq(e.subCycle!.allocatedSubCycles);
                    e.subCycle!.parentCycle = cycle;
                }
                cycle.outputEvents.push_back(new Event(e.time, e.state, e.type, e.subCycle));
            }
            cycle.firstOutputEvent = cycle.outputEvents.begin();

            cycle.cycleTime = this.cycleTime;
            cycle.activationTime = cycle.outputEvents.front().time;
            cycle.cycleDuration = globalTime - cycle.activationTime + 1;

            const firstEv = this.outputEvents.get(this.firstOutputEvent);
            firstEv.type = 1;
            firstEv.subCycle = cycle;
            this.outputEvents.erase_back(this.firstOutputEvent);
        }

        for (let i = 0; i < this.outputLinks.length; i++)
            if (!this.currentCycle.activeOutputs.testBit(i) && this.outputLinks[i].chip.state !== ChipState.PASSIVE)
                this.outputLinks[i].chip.deactivateOutputs();

        this.currentCycle = this;
        this.activeOutputs.setLow(this.outputLinks.length);

        if (this.pendingEvent !== 0 && this.pendingEvent !== globalTime) {
            this.outputEvents.push_back(new Event(this.pendingEvent, this.output ^ 1));
        } else if (this.pendingEvent !== 0) {
            this.updateOutput();
        }

        for (let i = 0; i < this.lastInputEvent.length; i++)
            if (this.lastInputEvent[i] >= this.activationTime)
                this.lastInputEvent[i] = this.inputLinks[i].chip.lastOutputEvent;
    }

    analogInput(n: number): number {
        return this.inputLinks[n].chip.analogOutput;
    }

    // Force `history` to include every real transition up through `now`, for a chip currently
    // ASLEEP (a chip that's ACTIVE or PASSIVE already records every transition live - see the
    // `output` setter above). While asleep, wakeUp()'s replay skips whole periods arithmetically
    // at the root rather than stepping through every intermediate transition nobody downstream
    // needed - so `history` genuinely has gaps here that must be
    // reconstructed by walking the same Cycle/outputEvents structure wakeUp() replays.
    //
    // Deliberately does NOT reuse wakeUp()'s own loop, which mutates `this.currentCycle`/
    // `this.output`/etc as it goes - calling that here just to answer a scope-plot query would
    // corrupt live replay state (wakeUp() itself always restarts from (currentCycle,
    // currentOutputEvent, sleepTime) as they stood at the moment this chip fell ASLEEP - see
    // updateOutput()'s ASLEEP-entry branch). Instead this walks the same outputEvents structure
    // (including descending into any nested sub-cycle, same as wakeUp()'s own traversal) via
    // advanceBackfillPos()'s side-effect-free cursor (backfillPos/backfillAbsTime/backfillValue -
    // seeded at that same ASLEEP-entry point).
    //
    // Returns the absTime `history` is now known-complete up through - `now` itself whenever the
    // walk genuinely reaches it (either a transition lands exactly there, or - just as validly -
    // the walk proves there's no transition before `now` left to find, so `history`'s last real
    // entry already holds all the way to `now`), but something EARLIER than `now` if a single
    // call's iteration budget ran out first (see advanceBackfillPos()'s own maxIterations
    // comment): a chip with a long backlog and a short learned period (e.g. one that just went
    // ASLEEP a long real-time-equivalent ago, or a sim running fast enough that `now` jumps far
    // ahead between calls) can need more individual toggles than one call is willing to walk, and
    // returns having made only partial progress - same as it does whenever the caller itself only
    // asks for partial progress (see chip.backfillHistory.test.ts's resumable-calls tests). A
    // caller that assumes `history` is complete up to `now` just because this was called (rather
    // than clamping to this return value) will treat the un-backfilled gap as if it were a single
    // instant holding whatever value `history` last happened to record - see ScopePlot2d's own
    // fillDigitalRaster()/ScopePlot's fillFromDigitalHistory() for what that clamp looks like.
    backfillHistory(now: number): number {
        if (this.state !== ChipState.ASLEEP) return now;
        if (this.outputEvents.empty()) return now;
        if (this.backfillAbsTime >= now) return now;

        const result = advanceBackfillPos(this.backfillPos, this.backfillAbsTime, this.backfillValue, now,
            (t, v) => this.history.push({ time: t, value: v }));

        this.backfillPos = result.pos;
        this.backfillAbsTime = result.absTime;
        this.backfillValue = result.value;
        return result.complete ? now : this.backfillAbsTime;
    }

    // Advances the backfill cursor to `target` WITHOUT recording anything into `history` - for
    // a fresh consumer (a newly-attached Scope) that only cares about the trace from here on,
    // not everything that happened while nobody was watching. Uses the exact same side-effect-
    // free advanceBackfillPos() walk backfillHistory() does, just with `record` omitted (so it's
    // just as cheap over a huge gap as currentValue()'s own fast path - see advanceBackfillPos()'s
    // own docstring on skipping whole periods via arithmetic). `backfillPos`/`backfillAbsTime`/
    // `backfillValue` are shared per-Chip state, not per-Scope, so this only ever discards
    // history NOTHING has read yet: if another Scope is already watching this same chip, its own
    // draws have kept the cursor near "now" already, making this a no-op (guarded below exactly
    // like backfillHistory() itself) - it can only ever fast-forward past a backlog nobody has
    // consumed, never past something an existing consumer still needs.
    skipBackfillTo(target: number): void {
        if (this.state !== ChipState.ASLEEP) return;
        if (this.outputEvents.empty()) return;
        if (this.backfillAbsTime >= target) return;

        const result = advanceBackfillPos(this.backfillPos, this.backfillAbsTime, this.backfillValue, target, null);
        this.backfillPos = result.pos;
        this.backfillAbsTime = result.absTime;
        this.backfillValue = result.value;
    }

    // The chip's own logical output as of right now - unlike the raw `output` field/setter
    // above, which only tracks reality live while ACTIVE/PASSIVE. A chip with no live consumer
    // (activeOutputs === 0 - e.g. a free-running clock feeding nothing, or any element's output
    // post nothing else happens to be wired to) legitimately goes ASLEEP after its very first
    // transition and then never wakes on its own (see updateOutput()'s ASLEEP-entry branch) -
    // `output` stays frozen at that one transition's value forever, even though the chip's true
    // value keeps changing on its own schedule. That's the correct, efficient behavior for the
    // periodicity engine itself (nothing downstream ever needs the intermediate values), but a
    // live circuit editor's own rendering - every wire's voltage color, not just a Scope's trace -
    // needs "the value right now" regardless of whether any other CHIP is watching. Computes the
    // answer via the same advanceBackfillPos() replay backfillHistory() uses (so it correctly
    // descends into a nested sub-cycle instead of freezing there), but WITHOUT recording (no
    // `history` growth for a call that doesn't need a trace) and WITHOUT writing the result back
    // to backfillPos/backfillAbsTime/backfillValue: this is called every render frame, for every
    // ASLEEP chip on screen, so it must stay cheap regardless of how long the chip has been
    // dormant - reading the shared cursor as a fixed anchor and computing forward from it locally
    // (skipping whole periods via arithmetic rather than stepping through every intermediate
    // toggle - see advanceBackfillPos()'s own docstring) gets that. Leaving the shared cursor
    // untouched also means nothing is lost: whenever something actually does need the trace (a
    // Scope), backfillHistory() will walk and record every toggle from wherever that cursor still
    // is, exactly as if currentValue() had never been called in between.
    currentValue(): number {
        if (this.state !== ChipState.ASLEEP) return this.output;
        if (this.outputEvents.empty() || this.backfillAbsTime >= this.circuit.globalTime) return this.backfillValue;

        return advanceBackfillPos(this.backfillPos, this.backfillAbsTime, this.backfillValue, this.circuit.globalTime, null).value;
    }

    static nextBit(x: number): number {
        x = x | 0;
        if (x === 0) return 0;
        return 31 - Math.clz32(x & -x);
    }
}
