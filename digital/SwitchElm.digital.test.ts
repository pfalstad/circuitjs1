import { describe, it, expect } from "vitest";
import { CircuitElm } from "../CircuitElm";
import { SimulationManager } from "../SimulationManager";
import { RailElm } from "../RailElm";
import { WireElm } from "../WireElm";
import { VoltageElm } from "../VoltageElm";
import { SwitchElm } from "../SwitchElm";
import { Switch2Elm } from "../Switch2Elm";
import { chipStart } from "./chip_desc";
import type { ChipDesc } from "./chip_desc";
import { buildDigitalCircuit, syncDigitalToNodesNew } from "./DigitalGraphBuilder";

/** Minimal fake digital source/sink, shaped like DigitalGraphBuilder.test.ts's own fakeElm(). */
function fakeElm(desc: ChipDesc[], pinMap: [number, number][]) {
    return {
        digitalSynthesis: () => ({ desc, pinMap: new Map(pinMap) }),
        nodes: [] as any[],
    };
}

function highDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[1] = 1; }).outputPin(1)];
}

function bufDesc(): ChipDesc[] {
    return [chipStart((pin) => { pin[2] = pin[1]; }).inputPins(1).outputPin(2)];
}

/** Mirrors SimulationManager.makeNodeList()/calculateWireClosureForList(): merges the posts of
 * every isRemovableWire() element with whatever it's connected to via getConnectedPost(), then
 * gives every element's post a shared node object with a `links` array (what
 * DigitalGraphBuilder.findDriver() reads). Real coordinates aren't needed - posts are identified
 * by object identity via getPost()/getConnectedPost(), same as SimulationManager does by Point
 * value equality. */
function wireUp(elms: { elm: any; postToPoint: Map<number, any> }[]) {
    // build pointKey -> owners list (elm, postIndex) so we can find who else sits at a given point
    const owners = new Map<any, { elm: any; num: number }[]>();
    for (const { elm, postToPoint } of elms) {
        for (const [num, pt] of postToPoint) {
            if (!owners.has(pt)) owners.set(pt, []);
            owners.get(pt)!.push({ elm, num });
        }
    }

    // union-find over point identities, following isRemovableWire() elements' connected pairs
    const parent = new Map<any, any>();
    const find = (p: any): any => { while (parent.get(p) && parent.get(p) !== p) p = parent.get(p); return p; };
    const union = (a: any, b: any) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    for (const pt of owners.keys()) parent.set(pt, pt);

    for (const { elm, postToPoint } of elms) {
        if (!elm.isRemovableWire || !elm.isRemovableWire()) continue;
        const p0 = postToPoint.get(0);
        const p1 = elm.getConnectedPost(0);
        if (p0 != null && p1 != null && owners.has(p1)) union(p0, p1);
    }

    const nodeByRoot = new Map<any, { links: { num: number; elm: any }[] }>();
    for (const [pt, ownerList] of owners) {
        const root = find(pt);
        if (!nodeByRoot.has(root)) nodeByRoot.set(root, { links: [] });
        const node = nodeByRoot.get(root)!;
        for (const o of ownerList) node.links.push(o);
    }
    for (const [pt, ownerList] of owners) {
        const node = nodeByRoot.get(find(pt))!;
        for (const { elm, num } of ownerList) elm.nodes[num] = node;
    }
}

describe("SwitchElm digital connectivity", () => {
    function setup(position: number) {
        const sw = new SwitchElm(0, 0);
        sw.x2 = 20; sw.y2 = 0;
        sw.setPoints();
        sw.position = position;

        const src = fakeElm(highDesc(), [[0, 1]]);
        const sink = fakeElm(bufDesc(), [[0, 1], [1, 2]]);

        wireUp([
            { elm: src, postToPoint: new Map([[0, sw.point1]]) },
            { elm: sw, postToPoint: new Map([[0, sw.point1], [1, sw.point2]]) },
            { elm: sink, postToPoint: new Map([[0, sw.point2]]) },
        ]);

        const { circuit, chipsByElm } = buildDigitalCircuit([src, sw, sink]);
        circuit.run(1n);
        return chipsByElm.get(sink)![0];
    }

    it("acts like a wire when closed (position 0)", () => {
        expect(setup(0).output).toBe(1);
    });

    it("doesn't conduct when open (position 1)", () => {
        expect(setup(1).output).toBe(0);
    });
});

describe("Switch2Elm digital connectivity", () => {
    function setup(position: number) {
        const sw = new Switch2Elm(0, 0);
        sw.x2 = 20; sw.y2 = 0;
        sw.setPoints();
        sw.position = position;

        const src0 = fakeElm(highDesc(), [[0, 1]]);
        const sink0 = fakeElm(bufDesc(), [[0, 1], [1, 2]]);
        const sink1 = fakeElm(bufDesc(), [[0, 1], [1, 2]]);

        wireUp([
            { elm: src0, postToPoint: new Map([[0, sw.point1]]) },
            { elm: sw, postToPoint: new Map([[0, sw.point1], [1, sw.swposts[0]], [2, sw.swposts[1]]]) },
            { elm: sink0, postToPoint: new Map([[0, sw.swposts[0]]]) },
            { elm: sink1, postToPoint: new Map([[0, sw.swposts[1]]]) },
        ]);

        const { circuit, chipsByElm } = buildDigitalCircuit([src0, sw, sink0, sink1]);
        circuit.run(1n);
        return { thrown: chipsByElm.get(sink0)![0], other: chipsByElm.get(sink1)![0] };
    }

    it("connects the common terminal to the thrown side only", () => {
        const { thrown, other } = setup(0);
        expect(thrown.output).toBe(1);
        expect(other.output).toBe(0);
    });

    it("switches connectivity to the other throw", () => {
        const { thrown, other } = setup(1);
        expect(other.output).toBe(1);
        expect(thrown.output).toBe(0);
    });
});

// Regression test for a real bug: buildDigitalCircuit()/wireUp() above operate on the wire-closure
// merge in isolation, so they can't see SimulationManager.preStampCircuit()'s own validate() pass -
// which used to force Switch2Elm.resistance to .001 the moment its two now-merged nodes looked
// like a "voltage source loop" to FindPathInfo (see Switch2Elm.stamp()'s old unconditional
// stampVoltageSource() call for resistance === 0). Once that kicked in, isWireEquivalent() went
// false and the switch stopped conducting digitally no matter its position. This exercises the
// real SimulationManager pipeline end to end to catch that class of interaction again.
describe("Switch2Elm through the real SimulationManager pipeline", () => {
    function buildAndSync(position: number) {
        const fakeApp: any = { elmList: [], ui: { elmList: [] }, scopeElmArr: [], onTimeStep() {}, deleteSliders() {} };
        const sim = new SimulationManager(fakeApp);
        sim.maxTimeStep = 1e-6;
        CircuitElm.initClass(fakeApp, sim);

        const rail = new RailElm(0, 0);
        rail.x2 = 0; rail.y2 = 0;
        rail.waveform = VoltageElm.WF_DC;
        rail.maxVoltage = 5;
        rail.bias = 0;
        rail.setPoints();

        const w1 = new WireElm(0, 0);
        w1.x2 = 32; w1.y2 = 0;
        w1.setPoints();

        const sw = new Switch2Elm(32, 0);
        sw.x2 = 64; sw.y2 = 0;
        sw.setPoints();
        sw.position = position;

        const w2 = new WireElm(sw.swposts[0].x, sw.swposts[0].y);
        w2.x2 = sw.swposts[0].x + 32; w2.y2 = sw.swposts[0].y;
        w2.setPoints();

        const w3 = new WireElm(sw.swposts[1].x, sw.swposts[1].y);
        w3.x2 = sw.swposts[1].x + 32; w3.y2 = sw.swposts[1].y;
        w3.setPoints();

        fakeApp.elmList = [rail, w1, sw, w2, w3];
        fakeApp.ui.elmList = fakeApp.elmList;

        sim.preStampAndStampCircuit();
        sim.digitalGraph!.circuit.run(1n);
        syncDigitalToNodesNew(sim.elmArr, sim.digitalGraph!);

        return { thrown: sw.nodes[1 + position].v, other: sw.nodes[position === 0 ? 2 : 1].v };
    }

    it("brings the thrown terminal high and leaves the other low", () => {
        const { thrown, other } = buildAndSync(0);
        expect(thrown).toBeCloseTo(5);
        expect(other).toBeCloseTo(0);
    });

    it("follows the switch to the other throw", () => {
        const { thrown, other } = buildAndSync(1);
        expect(thrown).toBeCloseTo(5);
        expect(other).toBeCloseTo(0);
    });
});
