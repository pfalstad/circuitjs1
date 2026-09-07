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
 * `chip.delay[chip.output]` - the only thing a phase offset can shift without corrupting the
 * free-running period from the second toggle onward, since Cycle.nextOutputEventDelay()'s cyclic
 * formula (see chip.ts) derives every SUBSEQUENT delay from the stored outputEvents/cycleTime
 * alone, never from how long the engine actually waited to fire the first one - it reads that
 * seeded pair back as "the interval ending at the upcoming first toggle has length
 * outputEvents[1].time - outputEvents[0].time", then keeps alternating delay[0]/delay[1] from
 * there purely by outputEvents-index parity, with no further reference to chip.output. So that
 * seeded interval MUST equal chip.delay[chip.output] - the duration of whichever state the chip
 * is ACTUALLY starting from - or the two independently-advancing sequences (chip.output's real
 * toggles vs. the index-parity-driven delay pattern) fall out of sync on the very first toggle
 * and apply the wrong duration to every state from then on (confirmed via RailElm.retimePhase()
 * setting a 180 degree phase shift plus a duty cycle above 50%: with this hardcoded to
 * chip.delay[0], the engine measurably produced the INVERTED duty cycle forever after, not just a
 * one-off transient). digitalSynthesis()'s own cold-start caller never needs anything but
 * chip.delay[0] here, since a Chip's `output` field always starts at its hardcoded default of 0
 * (see this function's return value being invoked before anything else can change `output`) -
 * this only diverges from that default when a caller (RailElm.retimePhase(), to represent
 * "currently high" without the propagation-delay cost of an inverted signal + NOT gate) sets
 * `chip.output` itself before invoking the returned closure. */
export function phasedClockLogic(initialDelayTicks: bigint): (chip: Chip) => void {
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
