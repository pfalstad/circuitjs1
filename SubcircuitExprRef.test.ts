import { describe, it, expect, beforeAll } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { CompositeElm } from "./CompositeElm";
import { CirSim } from "./CirSim";
import { ElementFactory } from "./ElementFactory";
import { ResistorElm } from "./ResistorElm";
import { ControlledCurrentElm } from "./ControlledCurrentElm";

const off = { getState: () => false };

beforeAll(() => {
    (CircuitElm as any).app = (CircuitElm as any).app ?? {
        menus: {
            showValuesCheckItem: off, powerCheckItem: off, euroResistorCheckItem: off,
            showOhmCheckItem: off, smallGridCheckItem: off,
        },
    };
    // registerElements() needs the whole app, so register just what this test loads
    ElementFactory.registerClass("ResistorElm", ResistorElm as any);
    ElementFactory.registerClass("ControlledCurrentElm", ControlledCurrentElm as any);
    (CirSim as any).xmlDumpTypeMap = new Map<string, string>([
        ["r", "ResistorElm"],
        ["ci", "ControlledCurrentElm"],
    ]);
});

// Build the <elms> children a subcircuit model is made of.  Each entry is
// [xml tag, nn (post node numbers), rn (reference node numbers) or null, extra attrs].
// The loader only ever reads tagName and getAttribute(), so a stub stands in for an
// Element and the test needs no DOM.
function elmEntries(spec: [string, string, string | null, Record<string, string>?][]): Element[] {
    return spec.map(([tag, nn, rn, attrs]) => {
        const map: Record<string, string> = { nn, ...(attrs ?? {}) };
        if (rn != null) map.rn = rn;
        return {
            tagName: tag,
            getAttribute: (k: string) => (k in map ? map[k] : null),
        } as unknown as Element;
    });
}

describe("expression references inside a subcircuit", () => {
    // model: a resistor between internal nodes 1 and 2, and a controlled current source
    // on nodes 1..2 whose expression refers to node 3 by number (was v(vmid) when built)
    function buildModel(): CompositeElm {
        const c: any = new (CompositeElm as any)(0, 0);
        c.loadCompositeXml(
            elmEntries([
                ["r", "1 2", null, { r: "1000" }],
                ["ci", "1 2", "3 0", { ex: "v(vmid)" }],
                ["r", "3 2", null, { r: "2000" }],
            ]),
            [1, 2]);
        return c;
    }

    it("carries reference node numbers through the model", () => {
        const c: any = buildModel();
        expect(c.compRefNodeInfo).toEqual(["", "3 0", ""]);
    });

    // do what the simulator does after analysis: hand the composite one CircuitNode per
    // entry in its compNodeList, which it propagates down to the children
    function assignNodes(c: any, firstIndex: number) {
        for (const ce of c.compElmList) ce.preStamp();
        c.buildCompNodeList();
        for (let p = 0; p !== c.numNodes; p++) {
            const cn = new CircuitNode();
            cn.index = firstIndex + p;
            c.setNode(p, cn);
        }
    }

    it("binds the reference to the instance's own internal node", () => {
        const c: any = buildModel();
        assignNodes(c, 10);

        const ccs: any = c.compElmList[1];
        const other: any = c.compElmList[2];   // the resistor on internal node 3
        const base = ccs.getRefNodeBase();

        // positive reference node is the same CircuitNode object as internal node 3
        expect(ccs.nodes[base]).toBe(other.nodes[0]);
        // negative reference node is ground (number 0)
        expect(ccs.nodes[base + 1]).toBe(CircuitNode.ground);
    });

    it("gives two instances of one model separate reference nodes", () => {
        const a: any = buildModel();
        const b: any = buildModel();
        assignNodes(a, 10);
        assignNodes(b, 50);
        const base = a.compElmList[1].getRefNodeBase();
        // sanity: the references actually resolved to something, not left at ground
        expect(a.compElmList[1].nodes[base]).not.toBe(CircuitNode.ground);
        // each instance refers to its own node 3, not to the other's
        expect(a.compElmList[1].nodes[base]).not.toBe(b.compElmList[1].nodes[base]);
        expect(a.compElmList[1].nodes[base]).toBe(a.compElmList[2].nodes[0]);
        expect(b.compElmList[1].nodes[base]).toBe(b.compElmList[2].nodes[0]);
    });

    // CompositeElm sums every link on a node to get its current, and our reference links
    // are in that list -- a node the source only reads must not collect its current
    it("does not count the source's current into a node it only refers to", () => {
        const c: any = buildModel();
        assignNodes(c, 10);
        const ccs: any = c.compElmList[1];
        const res3: any = c.compElmList[2];   // the resistor on internal node 3
        ccs.current = 3;
        res3.current = 0.5;
        // both children ended up on the same node, so index 2 really is the one the
        // source refers to and the resistor sits on
        expect(ccs.nodes[ccs.getRefNodeBase()]).toBe(res3.nodes[0]);
        // the composite's current for that node is the resistor's alone
        expect(c.getCurrentIntoNode(2)).toBeCloseTo(res3.getCurrentIntoNode(0), 12);
        expect(c.getCurrentIntoNode(2)).not.toBeCloseTo(
            res3.getCurrentIntoNode(0) + ccs.current, 12);
    });

    it("leaves references at ground for a model with no rn attribute", () => {
        const c: any = new (CompositeElm as any)(0, 0);
        c.loadCompositeXml(
            elmEntries([
                ["r", "1 2", null, { r: "1000" }],
                ["ci", "1 2", null, { ex: "v(vmid)" }],
            ]),
            [1, 2]);
        assignNodes(c, 10);
        const ccs: any = c.compElmList[1];
        const base = ccs.getRefNodeBase();
        expect(ccs.nodes[base]).toBe(CircuitNode.ground);
        expect(ccs.nodes[base + 1]).toBe(CircuitNode.ground);
    });
});
