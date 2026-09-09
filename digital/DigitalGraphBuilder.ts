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
    const pin = digitalOutputPin(elm, postIndex);
    if (pin == null) return null;
    return digitalChipForPin(elm, pin, chipsByElm);
}

/** The internal pin number (as used in `elm`'s own digitalSynthesis() ChipDesc) that post
 * `postIndex` maps to - what seedInitialDigitalState() below needs a stateful element's own
 * output-post-is-the-state-cell case (e.g. CounterElm, where the post's pin IS its state cell -
 * see digitalSynthesisWholeRegister()) to name via DigitalInitialState, without that element
 * needing to know its own internal pin numbering. */
export function digitalOutputPin(elm: any, postIndex: number): number | null {
    if (!isDigitalSynthesizable(elm)) return null;
    const synth = elm.digitalSynthesis();
    if (synth == null) return null;
    return synth.pinMap.get(postIndex) ?? null;
}

/** The real, already-built Chip whose desc entry's own `outPin` is `pin` - `pin` here is an
 * INTERNAL pin number exactly as used in `elm`'s own digitalSynthesis() ChipDesc, not a post
 * index/pinMap value (digitalOutputChip() above resolves those first, then delegates here). Lets
 * seedInitialDigitalState() below reach a state cell that has no externally-visible post of its
 * own - e.g. JKFlipFlopElm's master cell, which outputs onto an internal-only pin later buffered
 * out to the real Q/notQ posts by separate, memoryless cells (see
 * JKFlipFlopElm.digitalSynthesis()'s own docstring). */
function digitalChipForPin(elm: any, pin: number, chipsByElm: Map<any, Chip[]>): Chip | null {
    if (!isDigitalSynthesizable(elm)) return null;
    const synth = elm.digitalSynthesis();
    if (synth == null) return null;
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

/** Implemented by an element whose undumpXml()-restored state needs seeding onto specific digital
 * chip(s) right after the FIRST digital build following a circuit load - e.g. CounterElm
 * restoring its saved running count, or JKFlipFlopElm restoring its saved Q - instead of every
 * such element silently restarting from 0/false. Called once per build by
 * seedInitialDigitalState() below. Each entry names an INTERNAL pin number exactly as used in
 * that element's own digitalSynthesis() ChipDesc - for an element whose externally-visible output
 * post's own chip IS the state cell (e.g. CounterElm - see digitalSynthesisWholeRegister()),
 * that's just digitalOutputPin(elm, post); for one where the post is instead driven by a separate
 * downstream buffer cell with no memory of its own (e.g. JKFlipFlopElm's Q, buffered from its
 * master cell - see its own digitalSynthesis() docstring), it's whichever internal pin the master
 * cell itself outputs onto - and the value to seed that cell to. A `null` return means nothing to
 * seed right now. */
export interface DigitalInitialState {
    digitalInitialState(): { pin: number, value: number }[] | null;
}

export function isDigitalInitialStateSource(elm: any): elm is DigitalInitialState {
    return elm != null && typeof elm.digitalInitialState === "function";
}

/** Applies every element's digitalInitialState() (see above) against the just-built `chipsByElm`
 * - called once from SimulationManager.initDigitalCircuit() right after a build, before the
 * circuit has processed a single real tick.
 *
 * Sets a PASSIVE chip's `output`/`prevOutputPin` feedback bit directly rather than scheduling a
 * same-tick self-toggle event the way LogicInputElm.pushDigitalValue() does for a LIVE external
 * change: a multi-cell element (a CounterElm's own bit-cells, wired to read each OTHER's current
 * value - see digitalSynthesisWholeRegister()) needs every one of its own cells seeded together,
 * atomically, in one pass. Scheduling them as SEPARATE queued events instead (tried first - see
 * git history) lets one seeded cell's own cascade reach a SIBLING cell before that sibling's own
 * queued seed event has fired; since the sibling's cascaded recompute (using its still-cold,
 * not-yet-seeded value) can spuriously match its current (also still-cold) output, Chip.
 * updateInputs()'s own "input changed back to already-matching output -> cancel the pending
 * event" branch fires and silently drops that sibling's seed before it ever takes effect.
 * A direct field write sidesteps this - there is no event to cancel.
 *
 * This is safe here in a way it is NOT for carrying live state across an edit mid-simulation (a
 * harder, unsolved problem - see git history): every chip this ever runs against has never
 * processed a single real event, so there is no pre-existing bookkeeping (inputEventTable/
 * outputEvents/activeInputs/...) for a raw field write to fall out of sync with - it's simply
 * choosing a different cold-start value than all-zero, the same class of thing Circuit's own
 * constructor already does when a source's digitalSynthesis() customUpdate seeds a non-zero
 * value (see e.g. LogicInputElm.pushDigitalValue() called from Chip.initialize()).
 *
 * Every other chip a seeded chip's output is actually WIRED to - via Chip.connect()'s own
 * outputLinks/mask, not just the self-referential prevOutputPin bit above - also needs its
 * `.inputs` bit corrected to match: a multi-cell whole-register element's own sibling cells read
 * each OTHER's current value through real inPins (see digitalSynthesisWholeRegister()), not only
 * their own memory bit, so leaving a sibling's "what does cell W currently show" bit at its cold
 * 0 default - even though cell W itself just got seeded to 1 - corrupts that sibling's very next
 * real recompute (it reconstructs the whole register's value from these bits). This applies to
 * EVERY outputLink a seeded chip has, whether the receiving chip is itself being seeded (a
 * sibling) or is a genuinely external, still-cold consumer - direct field writes don't cascade on
 * their own the way a real event does, so nothing else will ever correct this bit for either
 * kind of receiver. A sibling's own `output` is left exactly as externally specified though -
 * only a genuinely external (non-seeded) receiver gets Chip.initialize() called on it afterward,
 * to derive (and cascade) ITS OWN combinational value from the now-corrected inputs; calling
 * initialize() on a sibling would instead overwrite its externally-specified seed value with
 * whatever combinational logic recomputes from current inputs, which is not the same value in
 * general (a whole-register cell's "value" only equals prevPin[out] verbatim absent a clock
 * edge - see digitalSynthesisWholeRegister()'s own logic - so this is not a redundant no-op). */
export function seedInitialDigitalState(elmList: any[], chipsByElm: Map<any, Chip[]>): void {
    const seeded = new Set<Chip>();

    for (const elm of elmList) {
        if (!isDigitalInitialStateSource(elm)) continue;
        const entries = elm.digitalInitialState();
        if (entries == null) continue;
        // Only the chip a named pin actually resolves to is added to `seeded` - not every chip
        // belonging to `elm`. A CounterElm names every one of its own bit cells (one per output
        // post), so in practice all of them end up seeded, same as before; a JKFlipFlopElm names
        // only its master cell, leaving its qBuf/notQ buffer cells (which hold no state of their
        // own) out of `seeded` - which is what lets the loop below fall them into
        // `freshlySynced` and Chip.initialize() them from the master's now-corrected output,
        // exactly like any other genuinely external, still-cold consumer.
        for (const { pin, value } of entries) {
            const chip = digitalChipForPin(elm, pin, chipsByElm);
            if (!chip || chip.state !== ChipState.PASSIVE) continue;
            seeded.add(chip);
            if (chip.output === value) continue;
            chip.output = value;
            if (value) chip.inputs |= chip.prevOutputMask; else chip.inputs &= ~chip.prevOutputMask;
        }
    }

    const freshlySynced = new Set<Chip>();
    for (const chip of seeded) {
        for (const link of chip.outputLinks) {
            if (chip.output) link.chip.inputs ^= Number(link.mask);
            // `link.mask` covers BOTH the plain value bit AND, when this pin is also declared an
            // eventPin (an edge-sensitive input - e.g. a ripple counter's inter-stage clock, see
            // digitalSynthesisRipple()), the "this pin just transitioned" event bit (see Chip.
            // connect()) - the XOR above sets both indiscriminately. A real transition earns that
            // event bit; a seed correction (nothing actually just happened) must not appear to
            // one, or the receiving chip's own edge detector (posEdge()/negEdge() - see
            // chip_desc.ts) misreads it as a genuine clock edge and fires a phantom count.
            // Chip.initialize()/updateInputs() already strip this via `eventMask` (bits cleared
            // at every event-pin position) before using `.inputs` for anything; freshlySynced
            // chips get that for free below via initialize(), but a SIBLING (still in `seeded`,
            // never initialize()'d - its own externally-specified value must not be
            // recomputed) needs it applied explicitly right here.
            link.chip.inputs &= link.chip.eventMask;
            if (!seeded.has(link.chip)) freshlySynced.add(link.chip);
        }
    }
    for (const chip of freshlySynced) chip.initialize();
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
 * uses throughout.
 *
 * Also refreshes a ChipElm-style element's own `pins[post].value` (guarded by `Array.isArray` -
 * a gate/rail/logic-input has no `pins` array at all) alongside `nodes[post].v`, piggybacking on
 * the same currentValue() this loop already computes for every post every frame - so a
 * DigitalInitialState implementation (CounterElm, the flip-flops, ...), which reads
 * pins[...].value to seed a rebuild triggered by an edit (adding an element, ...), continues the
 * running simulation's actual current state instead of whatever was loaded/reset to at the start
 * of the session. This runs only while the simulation is actually running (see
 * UIManager's simRunning gate on runCircuit()), but that's fine: pins[...].value simply holds
 * whatever it was last synced to while paused, which is exactly the (unchanging, since nothing is
 * ticking) live state at that moment. */
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
            if (Array.isArray(elm.pins)) elm.pins[post].value = high;
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
