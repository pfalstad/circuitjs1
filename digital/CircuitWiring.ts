/*
    Bridges the framework-free digital/ engine (DigitalElm, Scheduler) to
    the real circuit graph (CircuitElm/CircuitNode). Unlike DigitalElm.ts,
    coupling to the app's own types here is expected - this module's whole
    job is to translate between the two.

    Types are duck-typed (any) rather than importing CircuitElm/GateElm/
    ChipElm directly, matching this codebase's own existing convention for
    the same reason (see CircuitNodeLink.elm, SimulationManager.elmList):
    it avoids pulling the entire CircuitElm dependency graph into this
    otherwise-small module, and keeps this file agnostic to which concrete
    element classes happen to implement DigitalElmInstance/Group.
*/

import { DigitalConst, State } from "./DigitalElm";
import type { DigitalElmInstance } from "./DigitalElm";

export function isGateLike(elm: any): boolean {
    return elm != null && typeof elm.addInput === "function" && typeof elm.inputCount === "number";
}

/** Single DigitalElmInstance's optimization status, for display in an
 * element's getInfo() popup (e.g. "Active, period=2000 ticks"). Asleep is
 * the strongest optimization (no live scheduling at all - see doc.txt
 * section 6); Active means self-scheduling from a promoted period; Passive
 * means still evaluating live off its inputs, not yet optimized. */
export function digitalStateText(elm: DigitalElmInstance | null | undefined): string {
    if (elm == null) return "not wired";
    // A zero-input Passive element (a DC-tied constant, DigitalConst) never
    // promotes - tryPromote() bails immediately for it - but that's not
    // "not yet optimized": it's already as simple as it gets and will never
    // need re-evaluation at all, unlike a real Passive element still
    // proving periodicity.
    if (elm.state === State.Passive && elm.inputs.length === 0) return "Constant";
    switch (elm.state) {
        case State.Passive: return "Passive (not yet optimized)";
        case State.Active: return "Active, " + elm.cycleTime + " ticks";
        case State.Asleep: return "Asleep, " + elm.cycleTime + " ticks";
        default: return "?";
    }
}

/** Summarizes optimization status across several pins (a multi-output
 * chip's digitalPins), e.g. "Active x3, Passive x1". */
export function digitalStateSummary(pins: DigitalElmInstance[]): string {
    if (pins.length === 0) return "not wired";
    // Grouped by (state, period) - not just state - since different bits of
    // the same counter each track their own independent period (bit k's
    // is typically ~2x bit k-1's), and that period is exactly the number
    // this feature exists to surface (see digitalStateText()).
    const counts = new Map<string, number>();
    for (const p of pins) {
        const label = p.state === State.Passive ? State[p.state] : `${State[p.state]} ${p.cycleTime}t`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, n]) => n > 1 ? `${label} x${n}` : label).join(", ");
}

/** Appends a line to a getInfo() array, which is a fixed-size array
 * pre-filled with null (new Array(10).fill(null)) rather than a plain
 * growable list - writing to arr[arr.length] would land past the end
 * instead of into the first actually-empty slot. No-ops if every slot is
 * already filled. */
export function appendInfoLine(arr: (string | null)[], line: string): void {
    const i = arr.indexOf(null);
    if (i !== -1) arr[i] = line;
}

export function isChipLike(elm: any): boolean {
    return elm != null && Array.isArray(elm.digitalPins) && Array.isArray(elm.pins);
}

/** A RailElm digital source - either a square-wave clock rail or a DC
 * (+5V/VCC, 0V/GND) tie (RailElm.isDigitalSource()) - the only other kind
 * of digital source besides gates/chips, per this version's scope (see
 * RailElm.ts's header comment: no other RailElm waveform is handled). */
export function isRailSourceLike(elm: any): boolean {
    return elm != null && typeof elm.isDigitalSource === "function" && elm.isDigitalSource();
}

/** If `elm` is a single-output digital element (a gate/inverter/delay
 * buffer, or a digital RailElm source), returns it as its own
 * DigitalElmInstance - these classes all mix withDigital(CircuitElm)
 * directly onto themselves, so the CircuitElm IS the DigitalElmInstance,
 * unlike a multi-output chip (where each output is a separate GroupPin, not
 * the chip element itself - not handled here; a chip pin isn't a
 * CircuitElm a scope plot could reference). Used by ScopePlot to source a
 * 1-d digital scope trace from the element's own change-list history
 * (DigitalElmInstance.history) instead of per-timestep voltage sampling -
 * see ScopePlot.fillFromDigitalHistory()'s docstring for why that matters
 * under the digital fast-path optimization. */
export function digitalScopeSource(elm: any): DigitalElmInstance | null {
    if (isGateLike(elm) || isRailSourceLike(elm))
        return elm as DigitalElmInstance;
    // A wire-equivalent passthrough (LabeledNodeElm, WireElm, ...) isn't a
    // digital source itself, but "the node's value" is exactly what a
    // scope on it is meant to show - resolve back to whatever digital
    // element actually drives its (single, wire-closure-merged) node, the
    // same way wireDigitalCircuit() resolves a gate's own inputs across
    // however many wire segments sit in between. Bus nodes (busWidth > 1,
    // more than one post) aren't handled - falls back to per-frame analog
    // voltage sampling for those.
    if (elm != null && typeof elm.isWireEquivalent === "function" && elm.isWireEquivalent() &&
        Array.isArray(elm.nodes) && elm.nodes.length === 1)
        return findDriver(elm, 0);
    return null;
}

/** True if post `postIndex` of `elm` is a digital OUTPUT (drives its node)
 * rather than an input (reads its node). */
function isDigitalOutputPost(elm: any, postIndex: number): boolean {
    if (isChipLike(elm)) return elm.pins[postIndex]?.output === true;
    if (isGateLike(elm)) return postIndex === elm.inputCount;
    if (isRailSourceLike(elm)) return postIndex === 0;
    return false;
}

/** The DigitalElmInstance that post `postIndex` of `elm` (already confirmed
 * to be a digital output post) actually represents: itself for a
 * single-output gate or clock rail, or the corresponding GroupPin for a
 * multi-output chip. digitalPins[k] is the k-th output pin in post-index
 * order, by construction - see each chip's initDigitalPins() and its
 * `inputs` layout comment (both were deliberately built to match pins[]
 * post order with outputs filtered out/in respectively, exactly so this
 * doesn't need any per-chip-type mapping). */
function resolveOutput(elm: any, postIndex: number): DigitalElmInstance {
    if (isChipLike(elm)) {
        let k = 0;
        for (let i = 0; i < postIndex; i++)
            if (elm.pins[i].output) k++;
        return elm.digitalPins[k];
    }
    return elm as DigitalElmInstance;
}

/** Finds whichever OTHER element's output post shares `elm`'s node at
 * `postIndex` - the thing actually driving this input. Assumes wire
 * closure has already merged purely-wire-connected posts into one
 * CircuitNode (i.e. this must run after SimulationManager.makeNodeList()/
 * calcWireInfo()), so WireElm itself never needs special-casing here.
 * Exported (beyond wireDigitalCircuit()'s own use below) for
 * digitalScopeSource() to reuse the same resolution for a wire-equivalent
 * passthrough like LabeledNodeElm. */
export function findDriver(elm: any, postIndex: number): DigitalElmInstance | null {
    const node = elm.nodes[postIndex];
    const candidates = node.links.filter((link: any) =>
        !(link.elm === elm && link.num === postIndex) && isDigitalOutputPost(link.elm, link.num));
    if (candidates.length === 0)
        return null;
    if (candidates.length > 1)
        console.log("digital wiring: multiple drivers for " + (elm.getClassName?.() ?? elm) + " post " + postIndex);
    return resolveOutput(candidates[0].elm, candidates[0].num);
}

/** Populates every digital element's DigitalElm-graph inputs (a gate's
 * addInput()-based .inputs, or a Group-chip's positional .inputs array)
 * from the real node/wire graph. Must run after the node list and wire
 * closure are built (SimulationManager.makeNodeList()/calcWireInfo()) and
 * after DigitalElm.current is set (DigitalConst construction needs it).
 *
 * A missing driver is wired to a constant-false DigitalConst rather than
 * left unconnected, to preserve positional alignment in inputCount-sized
 * arrays (skipping a position would silently shift every later input) -
 * mirroring how the analog solver's connectUnconnectedNodes() already
 * grounds a floating node instead of erroring. */
export function wireDigitalCircuit(elmList: any[]): void {
    for (const elm of elmList) {
        if (isGateLike(elm)) {
            for (let i = 0; i < elm.inputCount; i++)
                elm.addInput(findDriver(elm, i) ?? new DigitalConst(false));
        } else if (isChipLike(elm)) {
            const postCount = elm.pins.length;
            const inputs: DigitalElmInstance[] = [];
            for (let i = 0; i < postCount; i++) {
                if (elm.pins[i].output) continue;
                inputs.push(findDriver(elm, i) ?? new DigitalConst(false));
            }
            // elm.inputs itself is a plain assignment (not addInput()) since
            // the chip/Group object isn't a DigitalElm - it has no
            // liveOutputs of its own to register anything on. It's just
            // bookkeeping the group's own evaluate() reads (e.g.
            // CounterElm.evaluate() indexing this.inputs[0] for clk).
            // Each digitalPin genuinely IS a DigitalElm, though, and is what
            // actually needs to be notified when clk/reset/etc. change - so
            // it must go through real addInput() calls, not a copy of the
            // array, to register on each driver's liveOutputs (and to give
            // the pin itself a non-empty .inputs, without which
            // tryPromote() always bails out immediately).
            elm.inputs = inputs;
            for (const pin of elm.digitalPins)
                pin.addInput(...inputs, ...(elm.extraPeriodicityInputs?.(pin) ?? []));
        }
    }
}

/** Full digital setup for a freshly-stamped circuit: wire the graph, let
 * chips build their per-bit GroupPins and clock rails build their Active
 * schedule, then give every still-Passive element (gates, chip pins) one
 * initial evaluation. Without that last step, an element none of whose
 * inputs ever actually change again (e.g. one wired entirely to constants)
 * would sit at its default value=false forever - nothing would ever notify
 * it, since notifyOutputs() only fires on a real change. Must run after
 * DigitalElm.current is already pointed at this circuit's scheduler. */
export function initDigitalElements(elmList: any[]): void {
    // resetDigital() first: a gate/clock is a long-lived CircuitElm
    // instance that persists across re-stamps (editing the circuit,
    // clicking Reset), each of which gets a brand new Scheduler - without
    // this, re-wiring an already-wired gate would accumulate stale
    // inputs/liveOutputs from the previous stamp's now-discarded scheduler
    // on top of the new ones (see DigitalElm.ts's resetDigital()
    // docstring). Chips don't need it directly: initDigitalPins() below
    // always builds fresh GroupPins rather than reusing old ones.
    //
    // initDigitalPins()/initDigitalClock() must run before
    // wireDigitalCircuit(): resolveOutput() reads a chip's digitalPins[k]
    // to identify what a given output post actually is, and digitalPins
    // starts as an empty array until initDigitalPins() runs - wiring first
    // would silently resolve every chip-driven input to undefined instead
    // of a real GroupPin.
    for (const elm of elmList) {
        elm.resetDigital?.();
        elm.initDigitalPins?.();
        elm.initDigitalSource?.();
    }
    wireDigitalCircuit(elmList);
    for (const elm of elmList) {
        if (isGateLike(elm) && elm.state === State.Passive)
            elm.inputUpdated(null);
        if (isChipLike(elm))
            for (const p of elm.digitalPins)
                if (p.state === State.Passive) p.inputUpdated(null);
    }
}

/** Writes every digital element's current boolean value back into the real
 * CircuitNode(s) it drives, as a plain high/low voltage - so all the
 * existing rendering code (setVoltageColor(g, this.nodes[i].v), etc.) keeps
 * working unmodified. Cheap enough to call once per rendered frame; digital
 * events themselves happen far more often than that, driven by the
 * scheduler, not by this. */
export function syncDigitalToNodes(elmList: any[]): void {
    for (const elm of elmList) {
        if (isGateLike(elm)) {
            elm.nodes[elm.inputCount].v = elm.currentValue() ? elm.highVoltage : 0;
        } else if (isChipLike(elm)) {
            let k = 0;
            for (let i = 0; i < elm.pins.length; i++) {
                if (!elm.pins[i].output) continue;
                elm.nodes[i].v = elm.digitalPins[k].currentValue() ? elm.highVoltage : 0;
                k++;
            }
        } else if (isRailSourceLike(elm)) {
            // getDigitalVoltage() is duck-typed, not RailElm-specific -
            // any isDigitalSource()-returning element (RailElm's clock/DC
            // rails, LogicInputElm's user-toggled constant) supplies its
            // own mapping from boolean state to the real analog voltage
            // syncDigitalToNodes() should write back.
            elm.nodes[0].v = elm.getDigitalVoltage(elm.currentValue());
        }
    }
}

/** For ChipElm-derived elements NOT managed by the Group/GroupPin digital
 * path (pure sinks like DecimalDisplayElm, LEDArrayElm, SevenSegElm - no
 * digitalPins of their own), refreshes pins[i].value from nodes[i].v for
 * every non-output pin, mirroring what ChipElm.startIteration() used to do
 * every timestep in the old analog loop. That loop (and startIteration()
 * with it) isn't called at all on this digital path, so anything reading
 * pins[i].value directly - as these display-only elements' own draw()
 * methods do - would otherwise go stale at whatever it was on
 * construction (typically false/0), regardless of what the digital graph
 * actually computed and already wrote into nodes[i].v via
 * syncDigitalToNodes() above. */
export function syncNodesToPassiveChips(elmList: any[]): void {
    for (const elm of elmList) {
        if (isChipLike(elm)) continue; // owns its own GroupPin-driven pins - don't fight our own sync
        if (!Array.isArray(elm.pins) || !Array.isArray(elm.nodes) || typeof elm.getThreshold !== "function")
            continue;
        for (let i = 0; i < elm.pins.length; i++)
            if (!elm.pins[i].output)
                elm.pins[i].value = elm.nodes[i].v > elm.getThreshold();
    }
}
