// General-purpose free-running square-wave clock generator cell. Ported verbatim from dice-ts's
// chips/clock.ts (its own clockLogic() - not the frequency-specific chipClock14_318Mhz etc.
// catalog entries around it, which are Pong-hardware-specific). Not Pong-specific itself: this
// is just a periodic waveform primed once, at initialize() time, via the same Active-cycle
// machinery every promoted digital chip already uses (chip.ts's Cycle/outputEvents), then
// self-perpetuating with no further calls into this function - see chip.ts's updateOutput()'s
// ACTIVE branch. RailElm.digitalSynthesis() uses this for a digital clock rail, in place of the
// old RailElm.initDigitalSource()'s hand-rolled Cycle/outputEvents setup (see point 6 of
// noble-stirring-rabin.md).
import { Chip, ChipState, Event } from "./chip";
import { MAX_U64 } from "./constants";

export function clockLogic(chip: Chip): void {
    chip.state = ChipState.ACTIVE;
    chip.activationTime = chip.circuit.globalTime;

    chip.outputEvents.clear();
    chip.outputEvents.push_back(new Event(chip.circuit.globalTime));
    chip.outputEvents.push_back(new Event(chip.circuit.globalTime + chip.delay[0]));
    chip.cycleTime = chip.delay[0] + chip.delay[1];
    chip.firstOutputEvent = chip.outputEvents.begin();
    chip.currentOutputEvent = chip.outputEvents.begin();
    chip.endTime = MAX_U64;

    chip.pendingEvent = chip.circuit.queuePush(chip, chip.delay[0]);
}

/** Phase-offset variant of clockLogic() above, for RailElm.digitalSynthesis()'s duty-cycle/phase
 * support: identical Active-cycle/outputEvents setup (still built from the chip's own nominal
 * chip.delay[0]/chip.delay[1] pair, so every period AFTER the first is exactly the configured
 * duty cycle), except the very first scheduled toggle uses `initialDelayTicks` instead of
 * `chip.delay[0]` - the only thing a phase offset can shift without corrupting the free-running
 * period from the second toggle onward, since Cycle.nextOutputEventDelay()'s cyclic formula
 * (see chip.ts) derives every SUBSEQUENT delay from the stored outputEvents/cycleTime alone,
 * never from how long the engine actually waited to fire the first one. A chip's forced initial
 * `output = 0` (Chip's own field default) means this can only ever represent "starts low, waiting
 * `initialDelayTicks` before the first rise" - RailElm.digitalSynthesis() gets a "starts high"
 * phase by synthesizing this as an inverted internal signal instead (delay[0]/delay[1] swapped)
 * and feeding it through a combinational NOT, rather than teaching this function a second,
 * structurally different case. */
export function phasedClockLogic(initialDelayTicks: bigint): (chip: Chip) => void {
    return (chip: Chip): void => {
        chip.state = ChipState.ACTIVE;
        chip.activationTime = chip.circuit.globalTime;

        chip.outputEvents.clear();
        chip.outputEvents.push_back(new Event(chip.circuit.globalTime));
        chip.outputEvents.push_back(new Event(chip.circuit.globalTime + chip.delay[0]));
        chip.cycleTime = chip.delay[0] + chip.delay[1];
        chip.firstOutputEvent = chip.outputEvents.begin();
        chip.currentOutputEvent = chip.outputEvents.begin();
        chip.endTime = MAX_U64;

        chip.pendingEvent = chip.circuit.queuePush(chip, initialDelayTicks);
    };
}
