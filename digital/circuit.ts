// Port of circuit.h / circuit.cpp, trimmed of everything specific to driving a fixed Pong-style
// game (Settings/Input/Video/Audio special chips, the exit-at-fixed-timestamp guard) - this is a
// general circuit editor's digital fast path, not a game console. `CircuitBuilder`'s
// name/pin-based connection-resolution algorithm is otherwise unchanged: DigitalGraphBuilder.ts
// builds a `CircuitDesc` at runtime from the live element/node graph and hands it to this same
// pipeline, rather than this module needing to know anything about where the entries came from.
//
// Added beyond the dice-ts original: `runWithDeadline()`, a wall-clock-bounded variant of
// `run()` - needed because SimulationManager drives this from a real-time animation loop and
// must bound how long a single call can block the main thread (mirrors
// digital/Scheduler.ts's old `runUntil(maxTime, deadlineMs)`).

import { Chip, ChipLink } from "./chip";
import { customChipStart } from "./chip_desc";
import type { ChipDesc } from "./chip_desc";
import type { CircuitDesc, ChipInstanceEntry } from "./circuit_desc";

const MAX_QUEUE_SIZE = 4096;
const EVENT_QUEUE_SIZE = 128;
const SUBCYCLE_SIZE = 64;

const chipVCC: ChipDesc = { logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: 1, prevOutPin: 0 };
const chipGND: ChipDesc = { logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: 1, prevOutPin: 0 };

// Not Pong-specific (unlike the video/audio special chips this port drops) - the general escape
// hatch circuit_desc.ts's DISABLE_OPTIMIZATION() already exposes for marking a pin "externally
// observed" (a scope probe, a display sink) so makeAllConnections()'s dead-code elimination below
// doesn't prune the chip that drives it just because no other *chip* consumes its output.
function deoptimizeLogic(chip: Chip): void {
    for (const cl of chip.outputLinks) cl.chip.optimizationDisabled = true;
}
const chipDeoptimizer: ChipDesc = customChipStart(deoptimizeLogic).outputPin(1);

// NOTE ON ZERO-DELAY PUSHES. dice-ts clamps every scheduled delay to a minimum of one tick
// here, because under the canonical tie order below a chip whose own propagation delay is 0
// re-queues at the SAME timestamp and starves everything else at that instant forever.
// Deliberately NOT done here: Chip's constructor already floors every synthesized chip's
// `delay[]` to >= 1 tick (see its own comment), which removes that degenerate case at the
// source - the only remaining queuePush(chip, 0) callers are CUSTOM_CHIP sources
// (LogicInputElm, ExtVoltageElm, MonostableElm, SRAMElm) posting a ONE-SHOT self-correction,
// which cannot re-queue in a loop. Clamping them anyway would break drainZeroDelayEvents()
// below, whose whole contract is that such a push lands at exactly the current globalTime.

interface ChipDescPair { chip: Chip; desc: ChipDesc; }
interface Connection { pin: number; cd: ChipDescPair; }

class CircuitBuilder {
    private chipMap = new Map<string, ChipDescPair[]>();
    private connectionListOut: Connection[] = [];
    private connectionListIn: Connection[] = [];

    constructor(private circuit: Circuit, private chips: Chip[]) { }

    private addToChipMap(name: string, cd: ChipDescPair): void {
        let list = this.chipMap.get(name);
        if (!list) { list = []; this.chipMap.set(name, list); }
        list.push(cd);
    }

    createSpecialChips(): void {
        const vcc = new Chip(1, 64, this.circuit, chipVCC);
        vcc.isConstantSource = true;
        vcc.chipIndex = this.chips.length;
        this.chips.push(vcc);
        this.addToChipMap("_VCC", { chip: vcc, desc: chipVCC });

        const gnd = new Chip(1, 64, this.circuit, chipGND);
        gnd.isConstantSource = true;
        gnd.chipIndex = this.chips.length;
        this.chips.push(gnd);
        this.addToChipMap("_GND", { chip: gnd, desc: chipGND });

        const deopt = new Chip(1, 64, this.circuit, chipDeoptimizer);
        deopt.isDeoptimizer = true;
        deopt.chipIndex = this.chips.length;
        this.chips.push(deopt);
        this.addToChipMap("_DEOPTIMIZER", { chip: deopt, desc: chipDeoptimizer });
    }

    createChip(chipDescArray: ChipDesc[], name: string, custom: unknown, queueSize: number, subcycleSize: number): void {
        const created: ChipDescPair[] = [];
        const outputPinMap = new Map<number, ChipDescPair>();

        for (const d of chipDescArray) {
            const chip = new Chip(queueSize, subcycleSize, this.circuit, d, custom);
            chip.debugName = name;
            chip.chipIndex = this.chips.length;
            this.chips.push(chip);

            const cd: ChipDescPair = { chip, desc: d };
            created.push(cd);
            this.addToChipMap(name, cd);

            if (d.outPin) outputPinMap.set(d.outPin, cd);
        }

        for (const cd of created) {
            for (const inPin of cd.desc.inPins) {
                const out = outputPinMap.get(inPin);
                if (out) {
                    this.connectionListOut.push({ pin: inPin, cd: out });
                    this.connectionListIn.push({ pin: inPin, cd });
                }
            }
        }
    }

    createChips(prefix: string, desc: CircuitDesc): void {
        const hintList = new Map<string, { queueSize: number; subcycleSize: number }>();
        for (const hint of desc.hints) {
            hintList.set(hint.chip, hint);
        }

        for (const instance of desc.chips as ChipInstanceEntry[]) {
            let queueSize = EVENT_QUEUE_SIZE;
            let subcycleSize = SUBCYCLE_SIZE;
            const hint = hintList.get(instance.name);
            if (hint) { queueSize = hint.queueSize; subcycleSize = hint.subcycleSize; }

            this.createChip(instance.desc, prefix + instance.name, instance.customData, queueSize, subcycleSize);
        }
    }

    findConnections(prefix: string, desc: CircuitDesc): void {
        for (const c of desc.connections) {
            if (this.findConnection(prefix + c.name1, prefix + c.name2, c)) continue;

            if (prefix.length !== 0) {
                if (this.findConnection(prefix + c.name1, c.name2, c)) continue;
                if (this.findConnection(c.name1, prefix + c.name2, c)) continue;

                if ((prefix === c.name1 || prefix === c.name2) && this.findConnection(c.name1, c.name2, c)) continue;
            }

            console.log(`WARNING: Invalid connection: ${prefix}(${c.name1}.${c.pin1} -> ${c.name2}.${c.pin2})`);
        }
    }

    private findConnection(name1: string, name2: string, connection: { pin1: number; pin2: number }): boolean {
        const range1 = this.chipMap.get(name1) ?? [];
        const range2 = this.chipMap.get(name2) ?? [];

        let connected = false;

        for (const cd1 of range1) {
            if (cd1.desc.outPin === connection.pin1) {
                for (const cd2 of range2) {
                    for (const p of cd2.desc.inPins) {
                        if (p === connection.pin2) {
                            if (this.connectionListIn.some(c => c.pin === connection.pin2 && c.cd === cd2))
                                console.log(`WARNING: Attempted multiple connections to input: ${name2}.${connection.pin2}`);

                            connected = true;
                            this.connectionListOut.push({ pin: connection.pin1, cd: cd1 });
                            this.connectionListIn.push({ pin: connection.pin2, cd: cd2 });
                        }
                    }
                }
                break;
            }
        }

        for (const cd2 of range2) {
            if (cd2.desc.outPin === connection.pin2) {
                for (const cd1 of range1) {
                    for (const p of cd1.desc.inPins) {
                        if (p === connection.pin1) {
                            if (this.connectionListIn.some(c => c.pin === connection.pin1 && c.cd === cd1))
                                console.log(`WARNING: Attempted multiple connections to input: ${name1}.${connection.pin1}`);

                            connected = true;
                            this.connectionListOut.push({ pin: connection.pin2, cd: cd2 });
                            this.connectionListIn.push({ pin: connection.pin1, cd: cd1 });
                        }
                    }
                }
                break;
            }
        }

        return connected;
    }

    // The original C++ prunes any non-CUSTOM_CHIP whose output feeds no other chip's input
    // ("Removing unused chip ...") - correct for Pong, where the ONLY thing that can ever need a
    // chip's value is another chip wired to consume it. That assumption doesn't hold in a live
    // circuit editor: every element's output is drawn on screen every frame
    // (DigitalGraphBuilder.syncDigitalToNodesNew()) regardless of whether anything downstream
    // consumes it, and the user can wire a Scope onto any pin at any time - neither is a chip
    // connection this pass could ever see. Pruning such a chip doesn't just leave it stale, it
    // disconnects it from its own drivers and skips initialize() entirely, so it never computes
    // anything at all (a bare clock feeding nothing, or a gate whose output isn't wired
    // downstream yet, would sit frozen at its construction-time default forever). Dropped
    // entirely rather than special-cased with a synthetic "always observed" consumer: a
    // CUSTOM_CHIP consumer would work for elimination but permanently starves the driving chip's
    // own sleep optimization too (updateInputs()'s CUSTOM_CHIP branch never calls
    // activateInputs()/deactivateDiff() to release its interest - see chip.ts) - keeping
    // every real chip un-pruned costs nothing per se (a chip nothing needs still correctly falls
    // ASLEEP on its own after its first transition, same as before; Chip.currentValue() computes
    // its true current value from there without waking it).
    makeAllConnections(): void {
        for (let i = 0; i < this.connectionListOut.length; i++) {
            const cOut = this.connectionListOut[i].cd.chip;
            const cIn = this.connectionListIn[i].cd.chip;
            const desc = this.connectionListIn[i].cd.desc;
            const pin = this.connectionListIn[i].pin;

            cOut.connect(cIn, desc, pin);

            if (cOut.outputLinks.length > 64) {
                const name = this.getOutputInfo(cOut);
                if (name !== "_VCC.1" && name !== "_GND.1")
                    console.log(`ERROR: Maximum output connection limit reached, chip:${name}, cout:${cOut.outputLinks.length}`);
            }
        }
    }

    getOutputInfo(chip: Chip): string {
        for (const [name, list] of this.chipMap)
            for (const cd of list)
                if (cd.chip === chip) return `${name}.${cd.desc.outPin}`;
        return "unknown";
    }
}

export class Circuit {
    chips: Chip[] = [];
    globalTime = 0;

    // Every chip Chip.addHistoryWatcher() has ever been called on (i.e. every chip
    // `historyWatched` has ever been set true for) - see Chip.trimHistory()'s own comment.
    // SimulationManager.runCircuit() sweeps exactly this set once per frame, rather than every
    // chip in the circuit, since only a chip that's ever had a watcher can possibly have
    // anything in `history` worth trimming. Membership is permanent, mirroring
    // `historyWatched`'s own stays-true-forever design - trimHistory() itself is what shrinks an
    // abandoned entry's chip back to nothing once its last live watcher is gone.
    historyWatchedChips: Set<Chip> = new Set();

    haltRequested = false;

    // for stop trigger
    requestHalt(): void { this.haltRequested = true; }

    // The event heap, as parallel arrays rather than an array of {time, chip} objects. Both
    // sift loops compare only times, so keeping times in a contiguous Float64Array makes the hot
    // walk a flat numeric scan instead of a pointer chase per level, and pushing no longer
    // allocates an object per event. Index 0 is unused; the heap occupies [1 .. queueSize].
    private queueSize = 0;
    private queueTime = new Float64Array(MAX_QUEUE_SIZE + 1);
    private queueChip: (Chip | null)[] = new Array(MAX_QUEUE_SIZE + 1).fill(null);
    // Parallel to queueChip, holding each entry's chip.chipIndex (the tie-break key). Kept in a
    // typed array rather than dereferenced out of queueChip: the sift loops are hot enough that
    // pointer-chasing into the boxed Chip array for a tie-break costs several times what the
    // comparison itself does.
    private queueIdx = new Int32Array(MAX_QUEUE_SIZE + 1);

    constructor(desc: CircuitDesc) {
        const builder = new CircuitBuilder(this, this.chips);

        builder.createSpecialChips();

        builder.createChips("", desc);
        for (const sub of desc.subCircuits) builder.createChips(sub.prefix, sub.desc());

        builder.findConnections("", desc);
        for (const sub of desc.subCircuits) builder.findConnections(sub.prefix, sub.desc());

        builder.makeAllConnections();

        // Unconnected input pin -> tie to GND, same fallback the analog solver's own
        // connectUnconnectedNodes() already uses for a floating node. Silent: an unconnected
        // digital input pin is routine (optional pins, in-progress wiring), not worth logging.
        for (let i = 2; i < this.chips.length; i++) {
            for (let j = 0; j < this.chips[i].inputLinks.length; j++) {
                if (!this.chips[i].inputLinks[j]) {
                    this.chips[1].outputLinks.push(new ChipLink(this.chips[i], 1 << j));
                    this.chips[i].inputLinks[j] = new ChipLink(this.chips[1], -1); // -1: constant source, no link bit
                }
            }
        }

        this.chips[0].output = 1;
        for (const link of this.chips[0].outputLinks) link.chip.inputs |= link.mask;

        // Same treatment for any ordinary chip born high (ChipDesc.initOutput - a clock rail
        // primed mid-cycle after a circuit edit, or a cell carried across one). A born value
        // doesn't cascade, so without this every consumer would start out caching 0 for it and
        // only discover the real level at its next transition - by which point a falling-edge
        // consumer has already missed an edge. The chip's OWN prev-output feedback bit needs the
        // same correction (a memory cell reconstructs its value from it - see
        // seedInitialDigitalState(), which does this for the values it seeds): leaving that at 0
        // under a born 1 makes the cell recompute a value it never actually held, which is worse
        // than the stale bit it replaces. initialize() sets both when it transitions a chip
        // itself; these are the ones it will never see transition. chips[0]/chips[1] are VCC/GND,
        // handled above.
        for (let i = 2; i < this.chips.length; i++) {
            const chip = this.chips[i];
            if (!chip.output) continue;
            chip.inputs |= chip.prevOutputMask;
            for (const link of chip.outputLinks) link.chip.inputs |= link.mask;
        }

        for (let i = 2; i < this.chips.length; i++) this.chips[i].initialize();
    }

    // CANONICAL TIE-BREAK. The heap is keyed on time alone, so equal-time events would pop in
    // whatever order the heap's shape happens to give -- a function of the entire push/pop
    // history. That order is not cosmetic: updateInputs() cancels or keeps a pending output
    // event based on the intermediate value after EACH same-instant delivery, so a different
    // order can move a chip's scheduled event by a full gate delay. The chip's FIXED chipIndex
    // is therefore a secondary key, so the order depends only on the circuit, not on how the
    // queue was reached. This is what makes chip.ts's climb-on-sleep optimization behavior-
    // neutral. See the note above on why the accompanying min-delay clamp is not needed here.
    queuePush(chip: Chip, delay: number): number {
        const time = this.globalTime + delay;
        const qt = this.queueTime, qc = this.queueChip, qi = this.queueIdx;
        const ci = chip.chipIndex;

        let i = ++this.queueSize;
        for (let p = i >> 1;
             i > 1 && (qt[p] >= time && (qt[p] > time || qi[p] > ci));
             p = i >> 1) {
            qt[i] = qt[p];
            qc[i] = qc[p];
            qi[i] = qi[p];
            i = p;
        }
        qt[i] = time;
        qc[i] = chip;
        qi[i] = ci;

        return time;
    }

    // NOTE: every caller pops the due entry BEFORE dispatching it, not after. With the canonical
    // tie-break above, an event scheduled with zero delay during a dispatch lands at the CURRENT
    // globalTime, and if its chip sorts ahead of the entry being dispatched it sifts straight to
    // the root - so a pop performed afterwards would discard that brand-new event instead of the
    // one just handled, silently dropping it (this is why dice-ts, which pops afterwards, needs
    // its min-delay clamp to make such a push impossible). Popping first is equivalent for every
    // strictly-future push (a larger time can never displace the root) and correct for the
    // same-instant ones ts-digital relies on - see the note on zero-delay pushes above.
    queuePop(): void {
        const qt = this.queueTime, qc = this.queueChip, qi = this.queueIdx;
        const time = qt[this.queueSize], chip = qc[this.queueSize], ci = qi[this.queueSize];

        let i = 1;
        this.queueSize--;
        const n = this.queueSize + 1;

        // Hot path: when the times differ this must cost exactly what the time-only heap cost, so
        // the tie comparison sits INSIDE the `<=` / `<` tests rather than beside them, and the
        // chipIndex loads happen only on an actual tie.
        while ((i << 1) < n) {
            let child = i << 1;
            const c1 = child + 1;
            if (c1 < n) {
                const a = qt[c1], b = qt[child];
                if (a < b || (a === b && qi[c1] < qi[child])) child++;
            }
            const ct = qt[child];
            if (time <= ct) {
                if (time < ct || ci <= qi[child]) break;
            }
            qt[i] = qt[child];
            qc[i] = qc[child];
            qi[i] = qi[child];
            i = child;
        }

        qt[i] = time;
        qc[i] = chip;
        qi[i] = ci;
    }

    /** Processes every event still queued for RIGHT NOW (i.e. at the current globalTime),
     * without consuming any tick budget - each such event's own `queue[1].time - globalTime`
     * term (see run() below) is zero, so draining them here costs nothing a normal run() call
     * wouldn't already absorb for free on its very next iteration anyway.
     *
     * Exists so a fresh Circuit's cold-start self-correcting sources - every LogicInputElm (and
     * similar CUSTOM_CHIP sources) schedules a queuePush(chip, 0) from its own customUpdate()
     * during Chip.initialize() (see this class's own constructor, and
     * LogicInputElm.pushDigitalValue()'s docstring) rather than flipping `.output` immediately -
     * can finish settling to their real configured values BEFORE
     * DigitalGraphBuilder.seedInitialDigitalState() applies a saved chip's initial state on top.
     * Seeding runs before a single real tick's worth of simulation time has passed, so without
     * this drain, a downstream chip whose logic reads several such still-cold sources as plain
     * (non-edge) inputs - e.g. Counter74177Elm's CLR/LOAD, both real switches wired "high" - can
     * transiently recompute a stale value if one source (say LOAD) has already corrected to its
     * true value while another (CLR) hasn't yet. That transient disagreement doesn't just resolve
     * itself once every source finishes settling: merely SCHEDULING the resulting delayed
     * correction (Chip.updateInputs()'s `this.inputs ^= this.prevOutputMask`) poisons the chip's
     * internal "previous output" bit to match the wrong pending value immediately, before the
     * event even fires - so once every source truly settles a moment later, a subsequent correct
     * recompute reads that already-poisoned bit for its own "hold" branch and reproduces the same
     * wrong value, never un-poisoning it. The bad pending event still fires on schedule, silently
     * overwriting the just-seeded output. (Root-caused interactively against a real Counter74177Elm
     * import with CLK1/CLK2/LOAD/CLR wired to real LogicInputElms, from the actual chip.state/
     * pendingEvent trace - not hypothesized.) Draining every cold-start self-correction here first
     * means every driver has already reached its true configured value by the time seeding runs,
     * so no such transient recompute - and no poisoned pending event - ever happens. */
    drainZeroDelayEvents(): void {
        while (this.queueSize && this.queueTime[1] === this.globalTime) {
            const chip = this.queueChip[1]!;
            this.queuePop();
            if (this.globalTime === chip.pendingEvent) chip.updateOutput();
        }
    }

    run(runTimeIn: number): void {
        this.haltRequested = false; // see its own comment - a stale request must not wedge a fresh call
        let runTime = runTimeIn;

        while (runTime > 0) {
            if (this.queueSize) {
                runTime -= this.queueTime[1] - this.globalTime;
                this.globalTime = this.queueTime[1];
            } else {
                this.globalTime += runTime;
                return;
            }

            const chip = this.queueChip[1]!;
            this.queuePop();
            if (this.globalTime === chip.pendingEvent) chip.updateOutput();
            if (this.haltRequested) return;
        }
    }

    /**
     * Like run(), but bounded by wall-clock time as well as `runTimeIn` ticks - needed because
     * SimulationManager drives this from a real-time animation loop and per-tick cost is not
     * uniform under the promotion/sleep optimization (a big demote/re-promote cascade can land
     * in any single tick). `deadlineMs` is an absolute Date.now()-comparable timestamp.
     */
    runWithDeadline(runTimeIn: number, deadlineMs?: number): number {
        this.haltRequested = false; // see its own comment - a stale request must not wedge a fresh call
        const startTime = this.globalTime;
        const endTime = this.globalTime + runTimeIn;
        let first = true;

        while (this.globalTime < endTime) {
            if (!first && deadlineMs !== undefined && Date.now() >= deadlineMs) break;
            first = false;

            if (this.queueSize) {
                const nextTime = this.queueTime[1];
                if (nextTime > endTime) { this.globalTime = endTime; break; }
                this.globalTime = nextTime;
            } else {
                this.globalTime = endTime;
                break;
            }

            const chip = this.queueChip[1]!;
            this.queuePop();
            if (this.globalTime === chip.pendingEvent) chip.updateOutput();
            if (this.haltRequested) break;
        }

        return this.globalTime - startTime;
    }
}
