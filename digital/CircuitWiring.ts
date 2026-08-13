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

import { DigitalConst } from "./DigitalElm";
import type { DigitalElmInstance } from "./DigitalElm";

function isGateLike(elm: any): boolean {
    return elm != null && typeof elm.addInput === "function" && typeof elm.inputCount === "number";
}

function isChipLike(elm: any): boolean {
    return elm != null && Array.isArray(elm.digitalPins) && Array.isArray(elm.pins);
}

/** True if post `postIndex` of `elm` is a digital OUTPUT (drives its node)
 * rather than an input (reads its node). */
function isDigitalOutputPost(elm: any, postIndex: number): boolean {
    if (isChipLike(elm)) return elm.pins[postIndex]?.output === true;
    if (isGateLike(elm)) return postIndex === elm.inputCount;
    return false;
}

/** The DigitalElmInstance that post `postIndex` of `elm` (already confirmed
 * to be a digital output post) actually represents: itself for a
 * single-output gate, or the corresponding GroupPin for a multi-output
 * chip. digitalPins[k] is the k-th output pin in post-index order, by
 * construction - see each chip's initDigitalPins() and its `inputs` layout
 * comment (both were deliberately built to match pins[] post order with
 * outputs filtered out/in respectively, exactly so this doesn't need any
 * per-chip-type mapping). */
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
 * calcWireInfo()), so WireElm itself never needs special-casing here. */
function findDriver(elm: any, postIndex: number): DigitalElmInstance | null {
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
            elm.inputs = inputs;
        }
    }
}
