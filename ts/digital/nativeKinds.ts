// The custom (CUSTOM_CHIP) cell kinds a circuit can contain, defined once so both engines run
// the same thing. Each factory returns a ChipDescBuilder carrying two things:
//  - `custom`: the TypeScript implementation, which the TS engine calls (exactly the closure
//    the owning element used to build inline), and
//  - `native`: plain data naming the kind and its parameters, which netlist.ts flattens so the
//    WASM engine (wasm/engine.cpp) can run its own built-in copy of the same logic without a
//    per-event call back into JS.
// Anything changed here must be changed in engine.cpp's matching kind too; the differential
// harness (scripts/bench-wasm.ts) is what catches a mismatch.

import type { Chip } from "./chip";
import { customChipStart, ChipDescBuilder } from "./chip_desc";
import { MAX_U64 } from "./constants";
import { Event, ChipState } from "./chip";
import type { EngineChip } from "./engine";
import { WasmChip } from "./wasmEngine";

// Contents of one SRAM, shared by its per-bit cells. `read` returns 0 for an address never
// written. The element owns the storage (it also needs it for save/load and its edit dialog).
export interface SramMemory {
    read(address: number): number;
    write(address: number, value: number): void;
    /** Set while a WASM circuit holds the live contents (the WASM engine copies them in at build
     * and works on its own copy): copies them back through write(). The element calls it before
     * reading its storage, and clears it when it replaces the contents itself, so the engine's
     * stale copy isn't written back over them when the circuit is freed. */
    syncFromEngine?: (() => void) | null;
}

// State shared between a monostable's Q and EXP cells. `expireChip` is the EXP cell, recorded
// the first time it runs, so Q can restart its timer when retriggered.
export interface MonostableShared {
    expireChip: Chip | null;
    lastT: boolean;
}

export type NativeKind =
    | { kind: "nop" }
    | { kind: "clock"; initialDelay: number }
    | { kind: "source"; high: () => boolean }
    | { kind: "sram"; mem: SramMemory; addrBits: number; bitMask: number; invert: number }
    | { kind: "monoQ"; shared: MonostableShared; invert: number; fallDelay: () => number; retriggerable: () => boolean }
    | { kind: "monoExp"; shared: MonostableShared; fallDelay: () => number };

/** A cell that does nothing on its own - a sink, or a source driven only from outside. */
export function nopCell(): ChipDescBuilder {
    return customChipStart(() => { }).nativeKind({ kind: "nop" });
}

/** Free-running clock. See clockChip.ts's phasedClockLogic(), which this is. */
export function clockCell(initialDelayTicks: number): ChipDescBuilder {
    return customChipStart(phasedClockUpdate(initialDelayTicks))
        .nativeKind({ kind: "clock", initialDelay: initialDelayTicks });
}

export function phasedClockUpdate(initialDelayTicks: number): (chip: Chip) => void {
    return (chip: Chip): void => {
        chip.state = ChipState.ACTIVE;
        chip.activationTime = chip.circuit.globalTime;

        chip.outputEvents.clear();
        chip.outputEvents.push_back(new Event(chip.circuit.globalTime));
        chip.outputEvents.push_back(new Event(chip.circuit.globalTime + chip.delay[chip.output]));
        chip.cycleTime = chip.delay[0] + chip.delay[1];
        chip.firstOutputEvent = chip.outputEvents.begin();
        chip.currentOutputEvent = chip.outputEvents.begin();
        chip.endTime = MAX_U64;

        chip.pendingEvent = chip.circuit.queuePush(chip, initialDelayTicks);
    };
}

/** Pushes `high` into a source cell's output as a 0-delay self-event, if it differs. Takes
 * either engine's chip. */
export function pushSourceValue(engineChip: EngineChip, high: boolean): void {
    if (engineChip instanceof WasmChip) { engineChip.setSource(high); return; }
    const chip = engineChip as Chip;
    const newOut = high ? 1 : 0;
    if (newOut !== chip.output) chip.pendingEvent = chip.circuit.queuePush(chip, 0);
}

/** A live-pushable source (LogicInputElm, ExtVoltageElm). `high` is read at initialization;
 * later changes are pushed with pushSourceValue() (or the engine's setSource()). */
export function sourceCell(high: () => boolean): ChipDescBuilder {
    return customChipStart((chip) => pushSourceValue(chip, high()))
        .nativeKind({ kind: "source", high });
}

/** One data bit of an SRAM. Inputs: /WE, /OE, address bits MSB first, data in. Not a custom
 * cell: both engines run it as a LUT chip whose table is the read function of `mem`, doing the
 * write themselves while /WE is low (chip.ts's sramWrite()), so that it can be promoted like a
 * gate while it is only being read.
 *
 * 82S16 has no real /OE pin - this element's /OE stands in for its 3-input /CE, which alone
 * gates whether the output drives at all. /WE only selects whether that driven value is the
 * stored bit (read) or the bit being written (write-through) - see SRAMElm.doStep()'s matching
 * logic. */
export function sramBitCell(mem: SramMemory, addrBits: number, bitMask: number, invert: number): ChipDescBuilder {
    return new ChipDescBuilder(null, null).nativeKind({ kind: "sram", mem, addrBits, bitMask, invert });
}

/** A monostable's Q cell. Inputs: T (trigger), EXP (the timer cell's output). */
export function monostableQCell(shared: MonostableShared, invert: number,
        fallDelay: () => number, retriggerable: () => boolean): ChipDescBuilder {
    const update = (chip: Chip, mask: number): void => {
        chip.inputs ^= mask;
        const tHigh = ((chip.inputs & 1) ^ invert) !== 0;
        const expHigh = (chip.inputs & 2) !== 0;
        const risingT = tHigh && !shared.lastT;
        shared.lastT = tHigh;

        if (expHigh && chip.output === 1) {
            chip.pendingEvent = chip.circuit.queuePush(chip, 0); // fall
        } else if (risingT) {
            if (chip.output === 0) {
                chip.pendingEvent = chip.circuit.queuePush(chip, 0); // rise
            } else if (retriggerable() && shared.expireChip) {
                const ec = shared.expireChip;
                ec.pendingEvent = ec.circuit.queuePush(ec, fallDelay()); // restart timer
            }
        }
    };
    return customChipStart(update).nativeKind({ kind: "monoQ", shared, invert, fallDelay, retriggerable });
}

/** A monostable's timer (EXP) cell. Input: Q. */
export function monostableExpCell(shared: MonostableShared, fallDelay: () => number): ChipDescBuilder {
    const update = (chip: Chip, mask: number): void => {
        shared.expireChip = chip;
        chip.inputs ^= mask;
        const qHigh = (chip.inputs & 1) !== 0;
        if (qHigh) {
            chip.pendingEvent = chip.circuit.queuePush(chip, fallDelay()); // arm countdown
        } else if (chip.output === 1) {
            chip.pendingEvent = chip.circuit.queuePush(chip, 0); // reset immediately
        }
    };
    return customChipStart(update).nativeKind({ kind: "monoExp", shared, fallDelay });
}
