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
//    `inputs` field) become plain `number`, using JS's native 32-bit bitwise operators, which
//    have exactly the same truncate-to-32-bits semantics as C++ `int`.
//  - Fields that are `uint64_t` (global_time, delay[], pending_event, activation_time,
//    cycle_time, cycle_duration, end_time, sleep_time, last_input_event[], last_output_event,
//    Event.time, a ChipLink.mask used as a *source's own* output-link-index bit, active_outputs,
//    lut_data, and the sub-cycle allocation bitmask) become `bigint`.
//  - `ChipLink.mask` is `uint64_t` in the C++ struct but is used in two different ways depending
//    on whether the link lives in `output_links` (small: a destination-local input-bit mask) or
//    `input_links` (can be up to bit 63: a source-local output-link-index bit). We store it
//    uniformly as bigint and convert with Number()/BigInt() at each call site as appropriate.

import type { Circuit } from "./circuit";
import { Cirque } from "./cirque";
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

export enum ChipType { SIMPLE_CHIP = 0, BASIC_CHIP = 1, CUSTOM_CHIP = 2 }
export enum ChipState { ACTIVE = 0, PASSIVE = 1, ASLEEP = 2 }

export class ChipLink {
    chip: Chip;
    mask: bigint;
    constructor(chip: Chip, mask: bigint) { this.chip = chip; this.mask = mask; }
}

export class Event {
    time: bigint;
    state: number;      // meaningful when type === 0
    subCycle: Cycle | null; // meaningful when type === 1
    type: number;        // 1 = SUBCYCLE_MASK
    constructor(time: bigint = 0n, state: number = 0, type: number = 0, subCycle: Cycle | null = null) {
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

    activationTime: bigint = 0n;
    cycleTime: bigint = 0n;
    cycleDuration: bigint = 0n;
    endTime: bigint = 0n;
    activeOutputs: bigint = 0n;

    constructor(queueSize: number, subcycleSize: number) {
        this.outputEvents = new Cirque<Event>(queueSize, () => new Event());
        this.firstOutputEvent = this.outputEvents.begin();
        this.currentOutputEvent = this.outputEvents.begin();
        this.allocatedSubCycles = new SubcycleAllocator(subcycleSize);
    }

    nextOutputEventDelay(): bigint {
        if (this.currentOutputEvent === this.firstOutputEvent) {
            return this.outputEvents.get(this.firstOutputEvent).time + this.cycleTime - this.outputEvents.back().time;
        } else {
            const prev = this.outputEvents.dec(this.currentOutputEvent);
            return this.outputEvents.get(this.currentOutputEvent).time - this.outputEvents.get(prev).time;
        }
    }

    // NOTE: mutates `this` and, when descending into a sub-cycle, the sub-cycle too.
    nextOutputCycle(time: bigint): Cycle {
        const ev = this.outputEvents.get(this.currentOutputEvent);

        if (ev.type) {
            const cycle = ev.subCycle!;

            this.currentOutputEvent = this.outputEvents.inc(this.currentOutputEvent);
            if (this.currentOutputEvent === this.outputEvents.end()) this.currentOutputEvent = this.firstOutputEvent;

            cycle.endTime = time + cycle.cycleDuration;
            if (cycle.endTime > this.endTime) cycle.endTime = this.endTime;
            cycle.activationTime = time;
            cycle.activeOutputs = this.activeOutputs;
            cycle.currentOutputEvent = cycle.firstOutputEvent;

            return cycle.nextOutputCycle(time);
        }

        this.currentOutputEvent = this.outputEvents.inc(this.currentOutputEvent);
        if (this.currentOutputEvent === this.outputEvents.end()) this.currentOutputEvent = this.firstOutputEvent;

        return this;
    }
}

export interface HistoryEntry { time: bigint; value: number; }

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
// for the outermost frame (never climbed out of - its exitBound is MAX_U64) so left as 0n there.
// `exitBound` is the absolute time at which control must return to the enclosing frame - MAX_U64
// for the outermost frame, otherwise `entryTime` plus `level`'s own cycleDuration, capped by the
// enclosing frame's own exitBound (mirroring nextOutputCycle()'s own endTime capping, computed
// fresh here rather than trusting the real (transient, only valid mid-live-traversal) Cycle
// object's own .endTime field). `sub` is the next frame in - null once `idx` refers to a plain
// (non-SUBCYCLE_MASK) event.
interface BackfillPos { level: Cycle; idx: number; entryTime: bigint; exitBound: bigint; sub: BackfillPos | null }

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
function pushEnteredCycle(frames: BackfillPos[], cycle: Cycle, absTime: bigint, exitBound: bigint): void {
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
function rawDelay(level: Cycle, idx: number): bigint {
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
    startAbsTime: bigint,
    startValue: number,
    now: bigint,
    record: ((absTime: bigint, value: number) => void) | null,
): { pos: BackfillPos; absTime: bigint; value: number } {
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
    const maxIterations = 1_000_000;

    for (let iterations = 0; ; iterations++) {
        if (iterations >= maxIterations) {
            console.warn(`advanceBackfillPos: exceeded ${maxIterations} iterations without reaching now=${now} (at absTime=${absTime}) - deferring the rest to a later call`);
            return { pos, absTime, value };
        }

        // Resolve the innermost frame - walk `.sub` down, collecting every frame along the way
        // (top-to-bottom) so a frame can be popped or replaced in place below.
        const frames: BackfillPos[] = [pos];
        for (let p = pos; p.sub !== null; p = p.sub) frames.push(p.sub);
        const inner = frames[frames.length - 1];
        const level = inner.level;
        const oe = level.outputEvents;

        // Fast mode: skip whole periods of `level` via arithmetic when nothing needs recording -
        // same trick wakeUp() itself relies on (`time = (globalTime - sleepTime) % cycleTime`):
        // walking exactly `level.cycleTime` ticks from anywhere always lands back on the same idx
        // with the same value, by definition of what "this level repeats with period cycleTime"
        // means - true regardless of what's inside the period (nested sub-cycles included), so
        // unlike an approach that tries to count toggles-per-period, this needs no per-level
        // "is it a clean/flat template" check at all. Only `absTime` moves; `idx`/`value` don't.
        if (record === null && level.cycleTime > 0n) {
            const bound = inner.exitBound < now ? inner.exitBound : now;
            const elapsed = bound - absTime;
            if (elapsed > level.cycleTime) {
                // "- 1n" keeps at least one period's worth of normal stepping below, so the usual
                // tie-breaking at `now`/exitBound never needs to be reproduced here.
                const periods = (elapsed - 1n) / level.cycleTime;
                if (periods > 0n) {
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
        let climbIdx = frames.length - 1;
        while (frames[climbIdx].exitBound <= now && absTime + delay >= frames[climbIdx].exitBound && climbIdx > 0) {
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
        if (candidate > now) return { pos, absTime, value };

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
        if (v !== this._output) this.history.push({ time: this.circuit.globalTime, value: v });
        this._output = v;
    }

    eventMask = ~0;
    prevOutputMask = 0;

    delay: [bigint, bigint] = [0n, 0n];
    pendingEvent = 0n;

    outputLinks: ChipLink[] = [];
    inputLinks: ChipLink[] = [];

    type: ChipType = ChipType.CUSTOM_CHIP;

    lutData = 0n;               // SIMPLE_CHIP
    lut: Uint32Array | null = null; // BASIC_CHIP
    customUpdate: ((chip: Chip, mask: number) => void) | null = null; // CUSTOM_CHIP

    customData: unknown;
    optimizationDisabled = false;
    isDeoptimizer = false; // true only for the special "_DEOPTIMIZER" chip

    state: ChipState = ChipState.PASSIVE;

    inputEvents: Cirque<Event>;
    inputEventEndTime: Cirque<bigint>;
    inputEventTable: Cirque<number>[] = [];
    firstInputTablePos = 0;

    firstInputEvent = 0;
    firstInputMask = 0;
    activeInputs = 0;

    sleepTime = 0n;

    // Resumable cursor for backfillHistory() below - seeded at the exact position/time this
    // chip fell ASLEEP (see updateOutput()'s ASLEEP-entry branch), then advanced forward by
    // backfillHistory() itself as it's called. Deliberately separate from currentOutputEvent/
    // currentCycle (which wakeUp() needs untouched at their sleep-time values to replay from
    // scratch) - see backfillHistory()'s own docstring for why sharing those would corrupt live
    // replay. `backfillPos` mirrors currentCycle's own (possibly nested) position - see
    // BackfillPos's own docstring.
    private backfillPos: BackfillPos = { level: this, idx: 0, entryTime: 0n, exitBound: MAX_U64, sub: null };
    private backfillAbsTime = 0n;
    private backfillValue = 0;

    debugName = "";

    subCycles: (Cycle | null)[];
    currentCycle: Cycle;

    activationCycles: (Cycle | null)[] = [];

    lastInputEvent: bigint[] = [];
    lastOutputEvent = 0n;

    visited = false;

    analogOutput = 0.0;

    constructor(queueSize: number, subcycleSize: number, circuit: Circuit, desc: ChipDesc, custom: unknown = null) {
        super(queueSize, subcycleSize);

        this.circuit = circuit;
        this.customData = custom;
        this.currentCycle = this;
        this.inputEvents = new Cirque<Event>(queueSize, () => new Event());
        this.inputEventEndTime = new Cirque<bigint>(queueSize, () => 0n);
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
            BigInt(Math.max(1, Math.trunc(desc.delay[0] / TIMESCALE))),
            BigInt(Math.max(1, Math.trunc(desc.delay[1] / TIMESCALE))),
        ];

        this.inputLinks = new Array(numInputPins);
        this.activationCycles = new Array(numInputPins).fill(null);
        this.lastInputEvent = new Array(numInputPins).fill(0n);

        if (desc.custom) {
            this.type = ChipType.CUSTOM_CHIP;
            this.customUpdate = desc.custom;
            return;
        }

        let lutSize = numInputPins;
        for (let k = 0; k < desc.evPins.length; k++) this.eventMask &= ~(1 << lutSize++);
        if (desc.prevOutPin) { this.prevOutputMask = (1 << lutSize); lutSize++; }

        if (lutSize <= 6) {
            this.type = ChipType.SIMPLE_CHIP;
            this.lutData = 0n;
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
                if (pin[desc.outPin]) this.lutData |= (1n << BigInt(i));
            } else {
                if (pin[desc.outPin]) this.lut![i >> 5] |= (1 << (i & 0x1f));
            }
        }
    }

    initialize(): void {
        let newOut = this.output;

        this.inputs &= this.eventMask;

        switch (this.type) {
            case ChipType.SIMPLE_CHIP: newOut = Number((this.lutData >> BigInt(this.inputs)) & 1n); break;
            case ChipType.BASIC_CHIP: newOut = (this.lut![this.inputs >> 5] >> (this.inputs & 0x1f)) & 1; break;
            case ChipType.CUSTOM_CHIP: this.customUpdate!(this, 0); return;
        }

        if (newOut !== this.output) {
            this.output = newOut;

            if (this.output) this.inputs |= this.prevOutputMask;
            else this.inputs &= ~this.prevOutputMask;

            for (const link of this.outputLinks) link.chip.inputs ^= Number(link.mask);
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

                if (x !== this.outputLinks.length) {
                    this.outputLinks[x].mask |= BigInt(1 << i);
                } else {
                    this.outputLinks.push(new ChipLink(chip, BigInt(1 << i)));
                    this.activeOutputs |= (1n << BigInt(x));
                }

                for (let j = 0; j < desc.evPins.length; j++)
                    if (desc.evPins[j] === pin)
                        this.outputLinks[x].mask |= BigInt(1 << (chip.inputLinks.length + j));

                if (this.type !== ChipType.CUSTOM_CHIP || !this.isDeoptimizer)
                    chip.inputLinks[i] = new ChipLink(this, 1n << BigInt(x));

                return;
            }
        }
    }

    // Repeatedly climbs from `this.currentCycle` to its parent while `delay` (measured from
    // `globalTime - time`) would carry us past the current cycle's endTime, adjusting `delay`
    // to land within the parent instead. `time` is the offset already consumed within the
    // current cycle; pass 0n when there is none. `watchdog`/`message` are optional since not
    // every call site guards this climb.
    private climbToValidCycle(globalTime: bigint, time: bigint, delay: bigint, watchdog?: Watchdog, message?: () => string): bigint {
        while (globalTime - time + delay >= this.currentCycle.endTime) {
            watchdog?.tick(message!);
            const parent = this.currentCycle.parentCycle!;
            if (parent.nextOutputEventDelay() + time > (globalTime - this.currentCycle.activationTime))
                delay = parent.nextOutputEventDelay() - (globalTime - this.currentCycle.activationTime) + time;
            this.currentCycle = parent;
        }
        return delay;
    }

    // Deactivates every output link chip whose bit is set in `mask` (a bitmask of indices into
    // outputLinks, MSB-first via nextBit64).
    private deactivateOutputsInMask(mask: bigint): void {
        while (mask !== 0n) {
            __globalMaskWatchdog();
            const i = Chip.nextBit64(mask);
            this.outputLinks[i].chip.deactivateOutputs();
            mask &= ~(1n << BigInt(i));
        }
    }

    getNextOutput(time: bigint): number {
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
        this.state = ChipState.ACTIVE;

        const globalTime = this.circuit.globalTime;
        let time = (globalTime - this.sleepTime) % this.cycleTime;
        let delay = this.currentCycle.nextOutputEventDelay();
        this.lastOutputEvent = globalTime - time;

        if (this.currentCycle !== (this as Cycle)) {
            const sleepCycles = (globalTime - this.sleepTime) / this.cycleTime;
            this.currentCycle.endTime += this.cycleTime * sleepCycles;
            this.currentCycle.activationTime += this.cycleTime * sleepCycles;
        }

        const actOut = this.currentCycle.activeOutputs;

        delay = this.climbToValidCycle(globalTime, time, delay);

        const wakeWatchdog = new Watchdog(100000);
        while (time > delay) {
            wakeWatchdog.tick(() => `wakeUp stuck: chip=${this.debugName} time=${time} delay=${delay}`);
            time -= delay;

            this.output ^= 1;
            this.inputs ^= this.prevOutputMask;

            this.currentCycle = this.currentCycle.nextOutputCycle(globalTime - time);
            delay = this.currentCycle.nextOutputEventDelay();

            delay = this.climbToValidCycle(globalTime, time, delay);
        }

        this.lastOutputEvent = globalTime;
        this.pendingEvent = this.circuit.queuePush(this, delay - time);
        this.currentCycle = this.currentCycle.nextOutputCycle(globalTime - time + delay);

        this.deactivateOutputsInMask((~actOut) & this.currentCycle.activeOutputs);
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
        if (this.type === ChipType.SIMPLE_CHIP) newOut = Number((this.lutData >> BigInt(this.inputs)) & 1n);
        else newOut = (this.lut![this.inputs >> 5] >> (this.inputs & 0x1f)) & 1;

        if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' input changed, new output: ${newOut}`);

        if (newOut !== this.output && this.pendingEvent === 0n) {
            this.pendingEvent = this.circuit.queuePush(this, this.delay[this.output]);
            this.inputs ^= this.prevOutputMask;

            if (this.outputEvents.full()) {
                if (this.outputEvents.front().type)
                    this.allocatedSubCycles.deallocate(this.outputEvents.front().subCycle!.allocatedSubCycles);
            }

            this.outputEvents.push_back(new Event(globalTime + this.delay[this.output], newOut));
        } else if (this.pendingEvent !== 0n && newOut === this.output) {
            this.pendingEvent = 0n;
            this.inputs ^= this.prevOutputMask;

            if (!this.outputEvents.empty()) this.outputEvents.pop_back();
        }

        this.inputs &= this.eventMask;

        while (this.inputEventTable.length <= this.inputs)
            this.inputEventTable.push(new Cirque<number>(this.outputEvents.getQueueSize(), () => 0));

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
        if (chip.type === ChipType.SIMPLE_CHIP) newOut = Number((chip.lutData >> BigInt(chip.inputs)) & 1n);
        else newOut = (chip.lut![chip.inputs >> 5] >> (chip.inputs & 0x1f)) & 1;

        if (DEBUG_TRACE) console.log(`[t:${chip.circuit.globalTime}] chip '${chip.debugName}' input changed, new output: ${newOut}`);

        if (newOut !== chip.output && chip.pendingEvent === 0n) {
            chip.pendingEvent = chip.circuit.queuePush(chip, chip.delay[chip.output]);
            chip.inputs ^= chip.prevOutputMask;
        } else if (chip.pendingEvent !== 0n && newOut === chip.output) {
            chip.pendingEvent = 0n;
            chip.inputs ^= chip.prevOutputMask;
        }

        chip.inputs &= chip.eventMask;
    }

    updateOutput(): void {
        const globalTime = this.circuit.globalTime;

        if (this.state === ChipState.ASLEEP) {
            this.state = ChipState.ACTIVE;

            const actOut = this.currentCycle.activeOutputs;

            const asleepWatchdog = new Watchdog(100000);
            const delay = this.climbToValidCycle(globalTime, 0n, 0n, asleepWatchdog,
                () => `updateOutput(asleep) stuck: chip=${this.debugName}`);

            this.currentCycle = this.currentCycle.nextOutputCycle(globalTime + delay);
            this.pendingEvent = this.circuit.queuePush(this, delay);

            const curEv = this.currentCycle.outputEvents.get(this.currentCycle.currentOutputEvent);
            if (curEv.type) {
                let c = curEv.subCycle!;
                while (c.outputEvents.front().type) c = c.outputEvents.front().subCycle!;
                this.output = c.outputEvents.front().state;
            } else {
                this.output = curEv.state;
            }

            this.lastOutputEvent = globalTime;

            if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' output changed to ${this.output}`);

            this.deactivateOutputsInMask((~actOut) & this.currentCycle.activeOutputs);

            return;
        }

        this.lastOutputEvent = globalTime;

        for (let mask = ~0n; this.currentCycle.activeOutputs & mask;) {
            const i = Chip.nextBit64(this.currentCycle.activeOutputs & mask);
            const link = this.outputLinks[i];
            link.chip.updateInputs(Number(link.mask));
            mask &= ~(1n << BigInt(i));
        }

        this.output ^= 1;
        this.pendingEvent = 0n;

        if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' output changed to ${this.output}`);

        if (this.state === ChipState.ACTIVE) {
            if (this.currentCycle.activeOutputs === 0n) {
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

                // If currentCycle isn't the root cycle, schedule an event to wake up.
                // This must run whenever currentCycle !== this (root), regardless of
                // activeOutputs / currentCycle.parentCycle. The root Cycle has an
                // unbounded endTime, so it's never safe to compute a delay from it, but
                // any non-root currentCycle always has a real, finite endTime, and this
                // chip's own future output events (self-clocking) depend on this timer
                // firing to advance currentCycle -- not on activeOutputs, which only
                // tracks whether *downstream consumers* still need updates. Skipping
                // this when currentCycle.parentCycle === this && activeOutputs === 0n
                // (the previous condition) left chips with no self-wake timer AND no
                // live upstream delivery path (already pruned by activateInputs()), so
                // they went to sleep forever with no way to ever be woken again.
                if (this.currentCycle !== (this as Cycle))
                    this.pendingEvent = this.circuit.queuePush(this, this.currentCycle.endTime - globalTime);

                return;
            }

            let delay = this.currentCycle.nextOutputEventDelay();

            const activeWatchdog = new Watchdog(100000);
            while (globalTime + delay >= this.currentCycle.endTime) {
                activeWatchdog.tick(() => `updateOutput(active) stuck: chip=${this.debugName}`);
                const parent = this.currentCycle.parentCycle!;
                if (parent.nextOutputEventDelay() > (globalTime - this.currentCycle.activationTime))
                    delay = parent.nextOutputEventDelay() - (globalTime - this.currentCycle.activationTime);

                this.deactivateOutputsInMask((~this.currentCycle.activeOutputs) & parent.activeOutputs);

                if (this.state !== ChipState.ACTIVE) return;

                this.currentCycle = parent;
            }

            this.currentCycle = this.currentCycle.nextOutputCycle(globalTime + delay);
            this.pendingEvent = this.circuit.queuePush(this, delay);
        }
    }

    activationCheck(minTimeParam: bigint, maxTimeParam: bigint): bigint {
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

            let startTime: bigint, endTime: bigint;

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
                        max = min + 1n;
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
                    else { min = this.activationTime; max = min + 1n; }
                }
            }

            if (!result) continue;

            if (globalTime - this.activationTime < this.delay[0] + this.delay[1]) continue;

            if (this.getNextOutput(this.activationTime) === this.output) continue;

            if (this.pendingEvent !== 0n &&
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
                    c!.activeOutputs &= ~this.inputLinks[i].mask;
                }

                if (chip.state === ChipState.PASSIVE) chip.activateInputs();
            }
        }

        this.firstOutputEvent = this.currentOutputEvent;

        if (this.firstOutputEvent !== this.outputEvents.end()) {
            if (this.pendingEvent !== 0n) {
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
                    this.pendingEvent = 0n;
                    this.inputs = this.output ? this.prevOutputMask : 0;
                } else {
                    this.inputs = this.output ? 0 : this.prevOutputMask;
                }
            } else {
                this.inputs = this.output ? 0 : this.prevOutputMask;
            }
        } else {
            this.pendingEvent = 0n;
            this.inputs = this.output ? this.prevOutputMask : 0;
        }

        this.state = ChipState.PASSIVE;

        if (DEBUG_TRACE) console.log(`[t:${globalTime}] chip '${this.debugName}' deactivated`);

        for (let i = 0; i < this.inputLinks.length; i++)
            for (let c: Cycle | null = this.inputLinks[i].chip.currentCycle; c; c = c.parentCycle)
                c.activeOutputs |= this.inputLinks[i].mask;

        for (let i = 0; i < this.inputLinks.length; i++) {
            if (this.inputLinks[i].chip.state === ChipState.ASLEEP) this.inputLinks[i].chip.wakeUp();
            this.inputs |= this.inputLinks[i].chip.output << i;
        }
        this.inputs &= this.eventMask;

        if (this.type === ChipType.CUSTOM_CHIP || this.optimizationDisabled || this.inputEvents.empty()) {
            for (let i = 0; i < this.outputLinks.length; i++)
                if ((this.currentCycle.activeOutputs & (1n << BigInt(i))) === 0n && this.outputLinks[i].chip.state !== ChipState.PASSIVE)
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
            this.inputEventTable.push(new Cirque<number>(this.outputEvents.getQueueSize(), () => 0));

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
                this.cycleTime = 0n;
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
            cycle.cycleDuration = globalTime - cycle.activationTime + 1n;

            const firstEv = this.outputEvents.get(this.firstOutputEvent);
            firstEv.type = 1;
            firstEv.subCycle = cycle;
            this.outputEvents.erase_back(this.firstOutputEvent);
        }

        for (let i = 0; i < this.outputLinks.length; i++)
            if ((this.currentCycle.activeOutputs & (1n << BigInt(i))) === 0n && this.outputLinks[i].chip.state !== ChipState.PASSIVE)
                this.outputLinks[i].chip.deactivateOutputs();

        this.currentCycle = this;
        this.activeOutputs = (1n << BigInt(this.outputLinks.length)) - 1n;

        if (this.pendingEvent !== 0n && this.pendingEvent !== globalTime) {
            this.outputEvents.push_back(new Event(this.pendingEvent, this.output ^ 1));
        } else if (this.pendingEvent !== 0n) {
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
    // `output` setter above). While asleep, updateOutput()'s ASLEEP branch jumps straight to
    // whatever state is in effect at the next real wake time, skipping any intermediate
    // transitions nobody downstream needed - so `history` genuinely has gaps here that must be
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
    backfillHistory(now: bigint): void {
        if (this.state !== ChipState.ASLEEP) return;
        if (this.outputEvents.empty()) return;
        if (this.backfillAbsTime >= now) return;

        const result = advanceBackfillPos(this.backfillPos, this.backfillAbsTime, this.backfillValue, now,
            (t, v) => this.history.push({ time: t, value: v }));

        this.backfillPos = result.pos;
        this.backfillAbsTime = result.absTime;
        this.backfillValue = result.value;
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
    skipBackfillTo(target: bigint): void {
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
    // (activeOutputs === 0n - e.g. a free-running clock feeding nothing, or any element's output
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

    static nextBit64(x: bigint): number {
        if (x === 0n) return 0;
        let i = 0;
        while ((x & 1n) === 0n) { x >>= 1n; i++; }
        return i;
    }
}
