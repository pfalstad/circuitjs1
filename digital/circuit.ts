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

interface QueueEntry { time: bigint; chip: Chip | null; }

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
        this.chips.push(vcc);
        this.addToChipMap("_VCC", { chip: vcc, desc: chipVCC });

        const gnd = new Chip(1, 64, this.circuit, chipGND);
        this.chips.push(gnd);
        this.addToChipMap("_GND", { chip: gnd, desc: chipGND });

        const deopt = new Chip(1, 64, this.circuit, chipDeoptimizer);
        deopt.isDeoptimizer = true;
        this.chips.push(deopt);
        this.addToChipMap("_DEOPTIMIZER", { chip: deopt, desc: chipDeoptimizer });
    }

    createChip(chipDescArray: ChipDesc[], name: string, custom: unknown, queueSize: number, subcycleSize: number): void {
        const created: ChipDescPair[] = [];
        const outputPinMap = new Map<number, ChipDescPair>();

        for (const d of chipDescArray) {
            const chip = new Chip(queueSize, subcycleSize, this.circuit, d, custom);
            chip.debugName = name;
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
    // activateInputs()/deactivateOutputsInMask() to release its interest - see chip.ts) - keeping
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
    globalTime = 0n;

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

    private queueSize = 0;
    private queue: QueueEntry[] = new Array(MAX_QUEUE_SIZE + 1);

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
                    this.chips[1].outputLinks.push(new ChipLink(this.chips[i], BigInt(1 << j)));
                    this.chips[i].inputLinks[j] = new ChipLink(this.chips[1], 0n);
                }
            }
        }

        this.chips[0].output = 1;
        for (const link of this.chips[0].outputLinks) link.chip.inputs |= Number(link.mask);

        for (let i = 2; i < this.chips.length; i++) this.chips[i].initialize();
    }

    queuePush(chip: Chip, delay: bigint): bigint {
        const qe: QueueEntry = { time: this.globalTime + delay, chip };

        this.queueSize++;
        let i = this.queueSize;
        while (i > 1 && this.queue[i >> 1].time > qe.time) {
            this.queue[i] = this.queue[i >> 1];
            i >>= 1;
        }
        this.queue[i] = qe;

        return qe.time;
    }

    queuePop(): void {
        const qe = this.queue[this.queueSize];

        let i = 1;
        this.queueSize--;

        while ((i << 1) < (this.queueSize + 1)) {
            let child = i << 1;
            if (child + 1 < this.queueSize + 1 && this.queue[child + 1].time < this.queue[child].time) child++;
            if (qe.time <= this.queue[child].time) break;
            this.queue[i] = this.queue[child];
            i = child;
        }

        this.queue[i] = qe;
    }

    /** Processes every event still queued for RIGHT NOW (i.e. at the current globalTime),
     * without consuming any tick budget - each such event's own `queue[1].time - globalTime`
     * term (see run() below) is zero, so draining them here costs nothing a normal run() call
     * wouldn't already absorb for free on its very next iteration anyway.
     *
     * Exists so a fresh Circuit's cold-start self-correcting sources - every LogicInputElm (and
     * similar CUSTOM_CHIP sources) schedules a queuePush(chip, 0n) from its own customUpdate()
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
        while (this.queueSize && this.queue[1].time === this.globalTime) {
            if (this.globalTime === this.queue[1].chip!.pendingEvent) this.queue[1].chip!.updateOutput();
            this.queuePop();
        }
    }

    run(runTimeIn: bigint): void {
        this.haltRequested = false; // see its own comment - a stale request must not wedge a fresh call
        let runTime = runTimeIn;

        while (runTime > 0n) {
            if (this.queueSize) {
                runTime -= this.queue[1].time - this.globalTime;
                this.globalTime = this.queue[1].time;
            } else {
                this.globalTime += runTime;
                return;
            }

            if (this.globalTime === this.queue[1].chip!.pendingEvent) this.queue[1].chip!.updateOutput();
            this.queuePop();
            if (this.haltRequested) return;
        }
    }

    /**
     * Like run(), but bounded by wall-clock time as well as `runTimeIn` ticks - needed because
     * SimulationManager drives this from a real-time animation loop and per-tick cost is not
     * uniform under the promotion/sleep optimization (a big demote/re-promote cascade can land
     * in any single tick). `deadlineMs` is an absolute Date.now()-comparable timestamp.
     */
    runWithDeadline(runTimeIn: bigint, deadlineMs?: number): bigint {
        this.haltRequested = false; // see its own comment - a stale request must not wedge a fresh call
        const startTime = this.globalTime;
        const endTime = this.globalTime + runTimeIn;
        let first = true;

        while (this.globalTime < endTime) {
            if (!first && deadlineMs !== undefined && Date.now() >= deadlineMs) break;
            first = false;

            if (this.queueSize) {
                const nextTime = this.queue[1].time;
                if (nextTime > endTime) { this.globalTime = endTime; break; }
                this.globalTime = nextTime;
            } else {
                this.globalTime = endTime;
                break;
            }

            if (this.globalTime === this.queue[1].chip!.pendingEvent) this.queue[1].chip!.updateOutput();
            this.queuePop();
            if (this.haltRequested) break;
        }

        return this.globalTime - startTime;
    }
}
