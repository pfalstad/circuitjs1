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

/** Phase-offset variant of clockLogic(): same Active-cycle/outputEvents setup, but the first
 * toggle uses `initialDelayTicks` instead of `chip.delay[chip.output]`, and the seeded interval
 * (`outputEvents[1]-outputEvents[0]`) uses `chip.delay[chip.output]` rather than a hardcoded
 * `delay[0]` - otherwise Cycle.nextOutputEventDelay()'s index-parity alternation desyncs from
 * chip.output's real starting value and applies the wrong duration to every state after. */
export function phasedClockLogic(initialDelayTicks: number): (chip: Chip) => void {
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
