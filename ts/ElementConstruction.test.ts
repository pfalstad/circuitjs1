import { describe, it, expect, beforeAll } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { VoltageSource } from "./VoltageSource";
import { VCCSElm } from "./VCCSElm";
import { VCVSElm } from "./VCVSElm";
import { CCCSElm } from "./CCCSElm";
import { CCVSElm } from "./CCVSElm";
import { ControlledSourceElm } from "./ControlledSourceElm";
import { ControlledVoltageElm } from "./ControlledVoltageElm";
import { ControlledCurrentElm } from "./ControlledCurrentElm";

// registerElements() constructs one of every element at startup.  ChipElm's constructor
// calls setupPins()/allocNodes() before subclass field initializers have run, so anything
// those reach has to tolerate a half-built object -- a trap this hierarchy has fallen into
// more than once.  Constructing each class is enough to catch it.
describe("controlled source construction", () => {
    // ChipElm's constructor asks the app for the grid size; that's all the UI these
    // elements touch while being built
    beforeAll(() => {
        const off = { getState: () => false };
        (CircuitElm as any).app = (CircuitElm as any).app ?? {
            menus: {
                showValuesCheckItem: off, powerCheckItem: off,
                euroResistorCheckItem: off, showOhmCheckItem: off,
                smallGridCheckItem: off,
            },
        };
    });

    const classes = [
        ["VCCSElm", VCCSElm], ["VCVSElm", VCVSElm],
        ["CCCSElm", CCCSElm], ["CCVSElm", CCVSElm],
        ["ControlledVoltageElm", ControlledVoltageElm],
        ["ControlledCurrentElm", ControlledCurrentElm],
    ] as const;

    for (const [name, cls] of classes) {
        it("constructs " + name + " with a usable engine", () => {
            const e: any = new (cls as any)(0, 0);
            expect(e.engine).toBeTruthy();
            expect(e.engine.expr).toBeTruthy();
            // nodes[] must be big enough for the posts plus two nodes per v()/i() reference
            expect(e.nodes.length).toBe(
                e.getPostCount() + e.getInternalNodeCount() + e.getRefNodeCount());
            expect(e.engine.lastInputs.length).toBe(e.engine.getInputCount());
            expect(e.engine.state.nodeValues.length).toBe(e.engine.getRefCount());
        });
    }

    // a voltage source that never hears about its nodes can't work out which matrix it
    // belongs to, and analysis fails with "null matrix!"
    for (const [name, cls] of classes) {
        it("tells its voltage sources what nodes they span: " + name, () => {
            const e: any = new (cls as any)(0, 0);
            for (let i = 0; i !== e.getVoltageSourceCount(); i++) {
                // give the element real nodes first, so setNodes has something to report
                for (let p = 0; p !== e.getNodeCount(); p++) {
                    const cn = new CircuitNode();
                    cn.index = p + 1;
                    e.setNode(p, cn);
                }
                const vs = new VoltageSource();
                vs.elm = e;
                e.setVoltageSource(i, vs);
                expect(vs.n1, name + " voltage source " + i + " has no n1").not.toBeNull();
                expect(vs.n2, name + " voltage source " + i + " has no n2").not.toBeNull();
            }
        });
    }
});

// A reference node is observed, not connected: no current flows into it.  Anything that
// sums the links on a node (CompositeElm.getCurrentIntoNode) would otherwise count the
// source's whole current against a node it merely reads.
describe("current into a reference node", () => {
    for (const [name, cls] of [
        ["ControlledCurrentElm", ControlledCurrentElm],
        ["ControlledVoltageElm", ControlledVoltageElm],
        ["VCCSElm", VCCSElm],
    ] as const) {
        it("reports zero current into the reference nodes of " + name, () => {
            const e: any = new (cls as any)(0, 0);
            e.setExpr("v(a)+i(b)");
            e.current = 1.25;
            expect(e.getRefNodeCount()).toBeGreaterThan(0);
            for (let j = 0; j !== e.getRefNodeCount(); j++)
                expect(e.getCurrentIntoNode(e.getRefNodeBase() + j),
                    name + " ref node " + j).toBe(0);
        });
    }

    it("still reports the source current into its own posts", () => {
        const e: any = new ControlledCurrentElm(0, 0);
        e.setExpr("v(a)");
        e.current = 1.25;
        expect(e.getCurrentIntoNode(0)).toBeCloseTo(-1.25, 12);
        expect(e.getCurrentIntoNode(1)).toBeCloseTo(1.25, 12);
    });
});

// The diamond is a fixed size, so anything drawn inside it has to be positioned relative
// to the diamond rather than to the element, or it escapes when the element is stretched.
describe("ControlledVoltageElm diamond layout", () => {
    // is p inside the rhombus with centre c, tip t (half-diagonal along the axis) and
    // half-width b?  |along|/A + |across|/B <= 1
    function insideDiamond(p: {x: number, y: number}, c: {x: number, y: number},
                           t: {x: number, y: number}, b: number): boolean {
        const ax = t.x - c.x, ay = t.y - c.y;
        const A = Math.hypot(ax, ay);
        const ux = ax / A, uy = ay / A;
        const dx = p.x - c.x, dy = p.y - c.y;
        const along  = Math.abs(dx * ux + dy * uy);
        const across = Math.abs(-dx * uy + dy * ux);
        return along / A + across / b <= 1;
    }

    for (const len of [48, 64, 128, 256]) {
        it("keeps + and - inside the diamond at length " + len, () => {
            const e: any = new ControlledVoltageElm(0, 0);
            e.x = 0; e.y = 0; e.x2 = len; e.y2 = 0;
            e.setPoints();

            const c = e.center;
            const half = ControlledSourceElm.diamondSize;
            // where draw() puts the two signs
            const pm = e.interpPoint(e.lead1, e.lead2, 0.25);
            const pp = e.interpPoint(e.lead1, e.lead2, 0.75);
            // allow for the glyph's own extent at the 12px font used in draw()
            const pad = 4;
            for (const p of [pm, pp]) {
                for (const [ox, oy] of [[-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad]]) {
                    expect(insideDiamond({x: p.x + ox, y: p.y + oy}, c, e.lead2, half),
                        "corner of glyph at " + p.x + "," + p.y + " escapes the diamond").toBe(true);
                }
            }
        });
    }
});
