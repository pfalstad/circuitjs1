// JS interface: finding subcircuits, looking inside them, and switching the view in and out

import { test, expect } from "./fixtures";
import { readFileSync } from "fs";

test.use({ circuit: readFileSync("public/circuits/adder4-sc.txt", "utf8") });

test("look inside and view subcircuits from the JS interface", async ({ sim }) => {
    const r = await sim.page.evaluate(() => {
        const api = (window as any).CircuitJS1;
        const out: any = {};
        const subs = api.getElements().filter((e: any) => e.getType() === "SubcircuitElm");
        out.names = subs.map((e: any) => e.getModelName());
        // find one that has a nested subcircuit inside
        const outer = subs.find((e: any) => e.getChildren().some((c: any) => c.getType() === "SubcircuitElm"));
        out.outerName = outer?.getModelName();
        const inner = outer?.getChildren().find((c: any) => c.getType() === "SubcircuitElm");
        out.innerName = inner?.getModelName();
        out.childTypes = [...new Set(outer?.getChildren().map((c: any) => c.getType()))];
        out.childV = typeof inner?.getChildren()[0].getVoltage(0);
        out.path0 = api.getSubcircuitPath();
        out.innerFirst = inner?.enterSubcircuit();      // not in view yet: refused
        out.enterOuter = outer?.enterSubcircuit();
        out.path1 = api.getSubcircuitPath();
        out.enterInner = inner?.enterSubcircuit();
        out.path2 = api.getSubcircuitPath();
        out.exit1 = api.exitSubcircuit();
        out.path3 = api.getSubcircuitPath();
        out.exit2 = api.exitSubcircuit();
        out.exit3 = api.exitSubcircuit();
        out.path4 = api.getSubcircuitPath();
        return out;
    });
    expect(r.names.length).toBeGreaterThan(0);
    expect(r.outerName).toBeTruthy();
    expect(r.childV).toBe("number");
    expect(r.path0).toEqual([]);
    expect(r.innerFirst).toBe(false);
    expect(r.enterOuter).toBe(true);
    expect(r.path1).toEqual([r.outerName]);
    expect(r.enterInner).toBe(true);
    expect(r.path2).toEqual([r.outerName, r.innerName]);
    expect(r.exit1).toBe(true);
    expect(r.path3).toEqual([r.outerName]);
    expect(r.exit2).toBe(true);
    expect(r.exit3).toBe(false);
    expect(r.path4).toEqual([]);
});
