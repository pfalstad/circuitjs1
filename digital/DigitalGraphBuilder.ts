/*
    Phase 1 of the dice-ts cutover (see noble-stirring-rabin.md): the dynamic netlist builder
    that replaces CircuitWiring.ts's wireDigitalCircuit()/initDigitalElements(). Where the old
    engine wired DigitalElm instances directly (elm.addInput()), this builds a dice-ts
    CircuitDesc from the live element/node graph and hands it to circuit.ts's Circuit
    constructor - the same CHIP()/CONNECTION()/circuitLayout() shape dice-ts's own hand-written
    circuit_desc.ts source files use, just assembled at runtime instead of by hand.

    Types are duck-typed (any), matching CircuitWiring.ts's own convention: this module doesn't
    need to know which concrete CircuitElm subclass it's looking at, only that it implements
    `digitalSynthesis()` (see DigitalSynthesis below) and/or `digitalTie()` (see
    DigitalTieSource below). Phase 2 gives GateElm/InverterElm/RailElm/LogicInputElm these
    methods; later phases add them to the remaining chip elements.
*/

import { ChipState } from "./chip";
import type { Chip } from "./chip";
import type { ChipDesc } from "./chip_desc";
import { CHIP, CONNECTION, circuitLayout } from "./circuit_desc";
import type { CircuitEntry, CircuitDesc } from "./circuit_desc";
import { Circuit } from "./circuit";

/**
 * What a digital-capable CircuitElm subclass returns from digitalSynthesis(): the ChipDesc[]
 * cell(s) that make up its behavior (a single cell for a gate, a chain of cells wired via
 * internal pins i1..i24 for something like a CounterElm - see chip_desc.ts), plus a map from
 * this element's own post index (a real circuit pin, the numbering CircuitWiring.findDriver()
 * already understands) to the external pin number that post corresponds to within `desc`.
 * Internal-only pins (i1..i24) never appear in pinMap - they're not real circuit posts, so
 * nothing outside this element's own desc[] ever needs to address them by post index.
 *
 * A `null` return (rather than omitting the method) means "not a digital source *right now*"
 * for an instance whose digital-ness depends on runtime state - e.g. a RailElm's waveform, or a
 * LogicInputElm in ternary mode. Such an element is simply left out of the built netlist for
 * this build, same as if it lacked digitalSynthesis() entirely.
 */
export interface DigitalSynthesis {
    desc: ChipDesc[];
    pinMap: Map<number, number>; // postIndex -> external pin number within desc
}

export interface DigitalSynthesizable {
    digitalSynthesis(): DigitalSynthesis | null;
}

export function isDigitalSynthesizable(elm: any): elm is DigitalSynthesizable {
    return elm != null && typeof elm.digitalSynthesis === "function";
}

/**
 * A single-post element whose value is a hardwired constant - a RailElm DC tie, the common
 * "pull this pin to +5V/GND" idiom. Rather than synthesizing a per-instance chip for something
 * that never changes, such an element binds straight to Circuit's own shared `_VCC`/`_GND`
 * sentinel chips (circuit.ts's createSpecialChips()) - dice-ts's own convention for every
 * constant tie in a real circuit_desc.ts source file. Checked before digitalSynthesis() (see
 * synthesizeAll() below); a `null` return falls through to digitalSynthesis() instead (e.g. a
 * RailElm that's a clock rather than a DC tie).
 */
export interface DigitalTieSource {
    digitalTie(): "VCC" | "GND" | null;
}

export function isDigitalTieSource(elm: any): elm is DigitalTieSource {
    return elm != null && typeof elm.digitalTie === "function";
}

interface SynthEntry {
    name: string;
    desc: ChipDesc[];
    pinMap: Map<number, number>;
    isTie: boolean; // true: name is "_VCC"/"_GND", already exists in every Circuit - don't emit a CHIP entry
}

const TIE_OUT_PIN = 1;

// Data-only stand-in matching the shape of circuit.ts's own chipVCC/chipGND descriptors - used
// only so isOutputPin() below recognizes a tie's post as an output. Never passed to `new Chip()`
// (ties don't get their own chip - see DigitalTieSource above), so its null logic/custom is fine.
function tieDesc(): ChipDesc[] {
    return [{ logic: null, custom: null, delay: [0, 0], inPins: [], evPins: [], outPin: TIE_OUT_PIN, prevOutPin: 0 }];
}

/** True if `pin` (an external pin number within `desc`) is some cell's output, per the same
 * convention chip_desc.ts's ChipDesc.outPin already encodes. A pin is exactly one of
 * output/input by construction - it can't be both. */
export function isOutputPin(desc: ChipDesc[], pin: number): boolean {
    return desc.some(d => d.outPin === pin);
}

/** Finds whichever OTHER synthesized element's output post shares `elm`'s node at `postIndex` -
 * the thing actually driving this input. Assumes wire closure has already merged
 * purely-wire-connected posts into one CircuitNode (i.e. this must run after
 * SimulationManager.makeNodeList()/calcWireInfo()), same precondition CircuitWiring.findDriver()
 * has. Only considers other elements that are themselves digital-synthesizable and expose the
 * matching post as an output - anything else sharing the node (a non-digital sink, an unrelated
 * input) is not a driver. */
function findDriver(elm: any, postIndex: number, synthMap: Map<any, SynthEntry>): { entry: SynthEntry; pin: number } | null {
    const node = elm.nodes[postIndex];
    const candidates = (node?.links ?? []).filter((link: any) => {
        if (link.elm === elm && link.num === postIndex) return false;
        const entry = synthMap.get(link.elm);
        if (!entry) return false;
        const pin = entry.pinMap.get(link.num);
        return pin !== undefined && isOutputPin(entry.desc, pin);
    });

    if (candidates.length === 0) return null;
    if (candidates.length > 1)
        console.log("digital wiring: multiple drivers for " + (elm.getClassName?.() ?? elm) + " post " + postIndex);

    const winner = candidates[0];
    const entry = synthMap.get(winner.elm)!;
    return { entry, pin: entry.pinMap.get(winner.num)! };
}

/** Synthesizes every digital-capable element in `elmList`, checking digitalTie() before
 * digitalSynthesis() (see DigitalTieSource above) - either produces a SynthEntry, or the element
 * is simply left out (not digital-capable at all, or not right now). */
function synthesizeAll(elmList: any[]): Map<any, SynthEntry> {
    const synthMap = new Map<any, SynthEntry>();
    let counter = 0;
    for (const elm of elmList) {
        if (isDigitalTieSource(elm)) {
            const tie = elm.digitalTie();
            if (tie != null) {
                synthMap.set(elm, {
                    name: tie === "VCC" ? "_VCC" : "_GND",
                    desc: tieDesc(),
                    pinMap: new Map([[0, TIE_OUT_PIN]]),
                    isTie: true,
                });
                continue;
            }
        }
        if (isDigitalSynthesizable(elm)) {
            const synth = elm.digitalSynthesis();
            if (synth != null)
                synthMap.set(elm, { name: "e" + counter++, desc: synth.desc, pinMap: synth.pinMap, isTie: false });
        }
    }
    return synthMap;
}

/**
 * Assembles a dice-ts CircuitDesc from `synthMap`: one ChipInstanceEntry per non-tie element
 * (under a name unique to this build) plus one ConnectionEntry per input post that has a
 * driver. A missing driver is simply omitted - Circuit's own constructor already grounds any
 * unconnected input pin to GND (see circuit.ts), so there's no need to fabricate a
 * DigitalConst-equivalent here the way the old wireDigitalCircuit() had to.
 */
function layoutFromSynth(synthMap: Map<any, SynthEntry>): CircuitDesc {
    const entries: CircuitEntry[] = [];
    for (const entry of synthMap.values())
        if (!entry.isTie) entries.push(CHIP(entry.name, entry.desc));

    for (const [elm, entry] of synthMap) {
        for (const [postIndex, pin] of entry.pinMap) {
            if (isOutputPin(entry.desc, pin)) continue; // only inputs need a driving connection
            const driver = findDriver(elm, postIndex, synthMap);
            if (driver) entries.push(CONNECTION(driver.entry.name, driver.pin, entry.name, pin));
        }
    }

    return circuitLayout(entries);
}

/**
 * Pure data in, data out (no Circuit/Chip construction) - kept separate from
 * buildDigitalCircuit() below so the connection-resolution algorithm itself is testable without
 * running the engine.
 */
export function buildCircuitDesc(elmList: any[]): CircuitDesc {
    return layoutFromSynth(synthesizeAll(elmList));
}

export interface DigitalGraph {
    circuit: Circuit;
    /** Every digital-capable element's own Chip(s), for whoever built this graph to read
     * output/history from or push a live external change into (e.g. LogicInputElm.toggle() -
     * see its own digitalSynthesis()). A tie source's entry is the shared `_VCC`/`_GND` chip
     * (circuit.chips[0]/[1] - see circuit.ts's createSpecialChips(), never pruned since both are
     * CUSTOM_CHIP), same object for every element tied to that rail. Absent for any element
     * digitalSynthesis()/digitalTie() didn't produce a netlist entry for. */
    chipsByElm: Map<any, Chip[]>;
}

/** Full netlist build for a freshly-stamped circuit: synthesize + wire every digital-capable
 * element and construct the dice-ts Circuit that runs them. Must run after the node list and
 * wire closure are built (SimulationManager.makeNodeList()/calcWireInfo()), mirroring
 * CircuitWiring.wireDigitalCircuit()'s own precondition. */
export function buildDigitalCircuit(elmList: any[]): DigitalGraph {
    const synthMap = synthesizeAll(elmList);
    const circuit = new Circuit(layoutFromSynth(synthMap));

    // circuit.chips[0]/[1] are the shared _VCC/_GND sentinels (see circuit.ts) - they have no
    // debugName of their own (only createChip()-built instances do), so ties are special-cased
    // rather than looked up by name below.
    const byName = new Map<string, Chip[]>();
    for (const chip of circuit.chips) {
        if (!chip.debugName) continue;
        const list = byName.get(chip.debugName);
        if (list) list.push(chip); else byName.set(chip.debugName, [chip]);
    }

    const chipsByElm = new Map<any, Chip[]>();
    for (const [elm, entry] of synthMap) {
        if (entry.isTie) chipsByElm.set(elm, [entry.name === "_VCC" ? circuit.chips[0] : circuit.chips[1]]);
        else chipsByElm.set(elm, byName.get(entry.name) ?? []); // empty: pruned as dead code (see circuit.ts)
    }

    return { circuit, chipsByElm };
}

// --- Phase 5 (see noble-stirring-rabin.md): sync/scope-source helpers against the built
// DigitalGraph, replacing digital/CircuitWiring.ts's isGateLike()/isChipLike()/
// isRailSourceLike()/syncDigitalToNodes()/digitalScopeSource()/digitalStateText()/
// digitalStateSummary(). Those all duck-typed on the OLD engine's DigitalElmInstance/GroupPin
// shape (an element's inputCount/digitalPins/pins array); here every digital-capable element -
// gate, chip, tie, or CUSTOM_CHIP source - resolves the exact same way, through its own
// digitalSynthesis()/digitalTie() plus chipsByElm, so none of that per-shape special-casing is
// needed anymore.

/** Every real post of `elm` that's a digital OUTPUT, in ascending post-index order - which by
 * construction (every digitalSynthesis() implementation maps postIndex -> pin i+1 uniformly, one
 * pin per real post - see e.g. DFlipFlopElm.digitalSynthesis()) is exactly the same order
 * elm.pins[] itself lists them in, without needing to consult elm.pins at all. A DC/GND tie is a
 * single output at post 0 (mirrors TIE_OUT_PIN's own convention above). Empty for anything not
 * digital-capable right now (see DigitalSynthesis's own "null return" docstring). */
export function digitalOutputPosts(elm: any): number[] {
    if (isDigitalTieSource(elm) && elm.digitalTie() != null) return [0];
    if (!isDigitalSynthesizable(elm)) return [];
    const synth = elm.digitalSynthesis();
    if (synth == null) return [];
    const { pinMap, desc } = synth;
    return [...pinMap.entries()]
        .filter(([, pin]) => isOutputPin(desc, pin))
        .sort((a, b) => a[0] - b[0])
        .map(([post]) => post);
}

/** The real, already-built Chip that post `postIndex` of `elm` corresponds to (must be one of
 * `elm`'s own OUTPUT posts - an input post has no chip of its own to resolve to, same as the old
 * engine's isDigitalOutputPost() gate). Same resolution the `chipAt()` test helper in
 * DigitalSynthesisPhase3.test.ts uses ad hoc, promoted to a real export here: `desc`/`pinMap`
 * tell us which cell (index into chipsByElm.get(elm)) owns that pin, since createChip() builds
 * one real Chip per desc[] entry in array order (see circuit.ts's CircuitBuilder.createChip()) -
 * the same order chipsByElm's own build loop above preserves. */
export function digitalOutputChip(elm: any, postIndex: number, chipsByElm: Map<any, Chip[]>): Chip | null {
    if (isDigitalTieSource(elm) && elm.digitalTie() != null)
        return postIndex === 0 ? (chipsByElm.get(elm)?.[0] ?? null) : null;
    if (!isDigitalSynthesizable(elm)) return null;
    const synth = elm.digitalSynthesis();
    if (synth == null) return null;
    const pin = synth.pinMap.get(postIndex);
    if (pin === undefined) return null;
    const idx = synth.desc.findIndex(d => d.outPin === pin);
    if (idx < 0) return null;
    return chipsByElm.get(elm)?.[idx] ?? null;
}

/** The Chip for `elm`'s `outputIndex`-th output post (0 = its first output post in ascending
 * post-index order, per digitalOutputPosts() above) - what a getInfo() panel iterating "the k-th
 * output pin" (the old engine's `digitalPins[k]` convention - see e.g.
 * CounterElm.getInfo()/DFlipFlopElm.getInfo()) needs instead. For a single-output element (a
 * gate, a rail, a delay buffer, ...) outputIndex is always 0. */
export function digitalOutputChipAt(elm: any, outputIndex: number, chipsByElm: Map<any, Chip[]>): Chip | null {
    const post = digitalOutputPosts(elm)[outputIndex];
    return post === undefined ? null : digitalOutputChip(elm, post, chipsByElm);
}

/** Finds whichever OTHER element's real output post shares `elm`'s node at `postIndex` - the
 * thing actually driving this input. Same precondition/role as the old engine's own
 * findDriver()/CircuitWiring.findDriver(), but resolves post-build (against chipsByElm, via each
 * candidate's own digitalOutputPosts()) rather than against the transient synthMap findDriver()
 * above only has during buildDigitalCircuit() itself - needed by digitalScopeSourceNew() below to
 * resolve a wire-equivalent passthrough (LabeledNodeElm, ...) added or re-resolved after the
 * graph was already built (see ScopePlot.refreshDigitalSource()'s own docstring for why that
 * matters - a scope can exist before wiring does). */
export function findDigitalDriver(elm: any, postIndex: number): { elm: any; postIndex: number } | null {
    const node = elm.nodes?.[postIndex];
    const candidates = (node?.links ?? []).filter((link: any) =>
        !(link.elm === elm && link.num === postIndex) && digitalOutputPosts(link.elm).includes(link.num));
    if (candidates.length === 0) return null;
    if (candidates.length > 1)
        console.log("digital wiring: multiple drivers for " + (elm.getClassName?.() ?? elm) + " post " + postIndex);
    return { elm: candidates[0].elm, postIndex: candidates[0].num };
}

/** Writes every digital-capable element's current Chip output(s) back into the real
 * CircuitNode(s) it drives, as a plain high/low voltage - replaces
 * CircuitWiring.syncDigitalToNodes()'s isGateLike/isChipLike/isRailSourceLike three-way split
 * with one loop over digitalOutputPosts(), since that already enumerates exactly the posts the
 * old code's three branches handled separately (a gate/chip's single/multiple `highVoltage`
 * posts, a rail/logic-input's `getDigitalVoltage()` post) - the two are told apart here by
 * whichever method the element actually exposes, same duck-typed convention this file already
 * uses throughout. */
export function syncDigitalToNodesNew(elmList: any[], chipsByElm: Map<any, Chip[]>): void {
    for (const elm of elmList) {
        for (const post of digitalOutputPosts(elm)) {
            const chip = digitalOutputChip(elm, post, chipsByElm);
            if (chip == null) continue;
            // currentValue(), not the raw output field: a chip with no live consumer (e.g. a
            // clock feeding nothing, or any dangling output) falls ASLEEP after its first
            // transition and then never wakes on its own - `output` would stay frozen at that
            // one transition forever even though the wire's voltage still needs to visibly keep
            // changing every frame. See Chip.currentValue()'s own docstring.
            const high = chip.currentValue() === 1;
            if (typeof elm.getDigitalVoltage === "function")
                elm.nodes[post].v = elm.getDigitalVoltage(high);
            else
                elm.nodes[post].v = high ? elm.highVoltage : 0;
        }
    }
}

/** Appends a line to a getInfo() array, which is a fixed-size array pre-filled with null (new
 * Array(10).fill(null)) rather than a plain growable list - writing to arr[arr.length] would
 * land past the end instead of into the first actually-empty slot. No-ops if every slot is
 * already filled. */
export function appendInfoLine(arr: (string | null)[], line: string): void {
    const i = arr.indexOf(null);
    if (i !== -1) arr[i] = line;
}

/** For ChipElm-derived elements NOT digital-synthesizable themselves (pure sinks like
 * DecimalDisplayElm, LEDArrayElm, SevenSegElm - no digitalSynthesis() of their own), refreshes
 * pins[i].value from nodes[i].v for every non-output pin, mirroring what ChipElm.startIteration()
 * used to do every timestep in the old analog loop. That loop isn't called at all on this digital
 * path, so anything reading pins[i].value directly - as these display-only elements' own draw()
 * methods do - would otherwise go stale at whatever it was on construction (typically false/0),
 * regardless of what the digital graph actually computed and already wrote into nodes[i].v via
 * syncDigitalToNodesNew() above. Skips digital-synthesizable elements (CounterElm, ...): those
 * render via nodes[i].v directly (ChipElm.drawChip()'s generic per-pin coloring), so their own
 * pins[i].value is never read for anything real - not worth refreshing here too. */
export function syncNodesToPassiveChips(elmList: any[]): void {
    for (const elm of elmList) {
        if (isDigitalSynthesizable(elm)) continue;
        if (!Array.isArray(elm.pins) || !Array.isArray(elm.nodes) || typeof elm.getThreshold !== "function")
            continue;
        for (let i = 0; i < elm.pins.length; i++)
            if (!elm.pins[i].output)
                elm.pins[i].value = elm.nodes[i].v > elm.getThreshold();
    }
}

/** Optimization-status text for a single Chip, replacing digitalStateText() - same three
 * State/ChipState cases and "Constant" special case (a zero-input Passive chip - a DC tie or a
 * fixed-logic cell - never promotes and never needs to, unlike a real Passive chip still proving
 * periodicity), just phrased against dice-ts's ChipState/cycleTime instead of the old engine's
 * State/cycleTime. */
export function digitalStateTextNew(chip: Chip | null): string {
    if (chip == null) return "not wired";
    if (chip.state === ChipState.PASSIVE && chip.inputLinks.length === 0) return "Constant";
    switch (chip.state) {
        case ChipState.PASSIVE: return "Passive (not yet optimized)";
        case ChipState.ACTIVE: return `Active, ${chip.cycleTime} ticks`;
        case ChipState.ASLEEP: return `Asleep, ${chip.cycleTime} ticks`;
        default: return "?";
    }
}

// The live DigitalGraph for whichever circuit is currently simulating - mirrors the old engine's
// DigitalCore.current singleton (digital/DigitalElm.ts's `DigitalElm.current`) convention: an
// element's getInfo() panel (CounterElm.getInfo(), DFlipFlopElm.getInfo(), ...) needs to reach
// "the currently-built graph" to resolve its own optimization-status text, but only
// SimulationManager.initDigitalCircuit() actually builds one - threading chipsByElm through
// every such call site individually would mean plumbing it across ~9 unrelated element files.
let currentGraph: DigitalGraph | null = null;

/** Set by SimulationManager.initDigitalCircuit() right after buildDigitalCircuit() - see
 * currentGraph's own docstring above. Pass null when tearing down (no live circuit). */
export function setCurrentDigitalGraph(graph: DigitalGraph | null): void {
    currentGraph = graph;
}

export function getCurrentDigitalGraph(): DigitalGraph | null {
    return currentGraph;
}

/** digitalStateTextNew() against the currently-live graph (see currentGraph above), for an
 * element's own getInfo() to call directly - replaces every `digitalStateText(this)` /
 * `digitalStateText(this.digitalPins[k])` call site across GateElm/InverterElm/RailElm/
 * LogicInputElm/DelayBufferElm/CounterElm/DFlipFlopElm/JKFlipFlopElm/MultiplexerElm/
 * SevenSegDecoderElm with `digitalStateTextForOutput(this, 0)` (single-output elements) or
 * `digitalStateTextForOutput(this, k)` (the k-th output pin of a multi-output chip, same `k` the
 * old digitalPins[k] loop already computed - see digitalOutputChipAt()'s own docstring). */
export function digitalStateTextForOutput(elm: any, outputIndex: number): string {
    if (currentGraph == null) return "not wired";
    return digitalStateTextNew(digitalOutputChipAt(elm, outputIndex, currentGraph.chipsByElm));
}

// Resolves `elm` to the single real Chip that supplies this element's digital output
// voltage, for ScopePlot to source a 1-d trace from history/backfillHistory() instead of
// per-frame analog sampling.
export function digitalScopeSourceNew(elm: any): Chip | null {
    if (elm == null || currentGraph == null) return null;
    const posts = digitalOutputPosts(elm);
    if (posts.length === 1) return digitalOutputChip(elm, posts[0], currentGraph.chipsByElm);
    const isPassthrough = (typeof elm.isWireEquivalent === "function" && elm.isWireEquivalent()) ||
        (typeof elm.isOutputElm === "function" && elm.isOutputElm());
    if (posts.length === 0 && isPassthrough && Array.isArray(elm.nodes) && elm.nodes.length === 1) {
        const driver = findDigitalDriver(elm, 0);
        if (driver) return digitalOutputChip(driver.elm, driver.postIndex, currentGraph.chipsByElm);
    }
    return null;
}
