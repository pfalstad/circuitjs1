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
import type { ChipDesc } from "./chip_desc";
import type { CircuitDesc, ChipInstanceEntry } from "./circuit_desc";

const MAX_QUEUE_SIZE = 4096;
const EVENT_QUEUE_SIZE = 128;
const SUBCYCLE_SIZE = 64;

const chipVCC: ChipDesc = { logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: 1, prevOutPin: 0 };
const chipGND: ChipDesc = { logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: 1, prevOutPin: 0 };

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

    makeAllConnections(): void {
        let removed: boolean;
        do {
            removed = false;
            for (let idx = 0; idx < this.chips.length; idx++) {
                const chip = this.chips[idx];
                const found = this.connectionListOut.some(c => c.cd.chip === chip);
                if (!found) {
                    console.log(`Removing unused chip ${this.getOutputInfo(chip)}`);
                    removed = true;

                    for (let i = 0; i < this.connectionListIn.length; i++) {
                        if (this.connectionListIn[i].cd.chip === chip) {
                            this.connectionListIn.splice(i, 1);
                            this.connectionListOut.splice(i, 1);
                            i--;
                        }
                    }

                    this.chips.splice(idx, 1);
                    idx--;
                }
            }
        } while (removed);

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

    getInputInfo(chip: Chip, num: number): string {
        for (const [name, list] of this.chipMap)
            for (const cd of list)
                if (cd.chip === chip) return `${name}.${cd.desc.inPins[num]}`;
        return "unknown";
    }
}

export class Circuit {
    chips: Chip[] = [];
    globalTime = 0n;

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
        // connectUnconnectedNodes() already uses for a floating node.
        for (let i = 2; i < this.chips.length; i++) {
            for (let j = 0; j < this.chips[i].inputLinks.length; j++) {
                if (!this.chips[i].inputLinks[j]) {
                    const name = builder.getInputInfo(this.chips[i], j);
                    console.log(`WARNING: Unconnected input pin: ${name}, connecting to GND`);

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

    run(runTimeIn: bigint): void {
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
        }
    }

    /**
     * Like run(), but bounded by wall-clock time as well as `runTimeIn` ticks - needed because
     * SimulationManager drives this from a real-time animation loop and per-tick cost is not
     * uniform under the promotion/sleep optimization (a big demote/re-promote cascade can land
     * in any single tick). `deadlineMs` is an absolute Date.now()-comparable timestamp, not a
     * duration. Returns the number of ticks actually advanced, which may be less than
     * `runTimeIn` if the deadline was hit - the caller should advance whatever it derives from
     * wall-clock time by the ACTUAL ticks processed, not by how many were requested. Guarantees
     * real forward progress every call (never bails before at least one event/timestamp has been
     * processed) even if the deadline has already passed by the time this is called - mirrors
     * digital/Scheduler.ts's old runWhile()'s same guarantee.
     */
    runWithDeadline(runTimeIn: bigint, deadlineMs?: number): bigint {
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
        }

        return this.globalTime - startTime;
    }
}
