import { describe, it, expect } from "vitest";
import { Expr, ExprParser, ExprState } from "./Expr";

function parse(s: string) {
    const p = new ExprParser(s);
    const e = p.parseExpression();
    const refs = p.getNodeRefs();
    return { e, refs, names: refs.map(r => r.name), err: p.gotError() };
}

function evalWith(s: string, nodeValues: number[], values?: number[]) {
    const { e, err } = parse(s);
    expect(err).toBe(null);
    const es = new ExprState(0);
    es.nodeValues = nodeValues;
    if (values) for (let i = 0; i < values.length; i++) es.values[i] = values[i];
    return e.eval(es);
}

describe("ExprParser v(name) / i(name)", () => {
    it("parses a single node reference", () => {
        const { e, names, err } = parse("v(out)");
        expect(err).toBe(null);
        expect(names).toEqual(["out"]);
        expect(e.type).toBe(Expr.E_NODEV);
        expect(e.value).toBe(0);
        expect(e.name).toBe("out");
    });

    it("preserves case in node names", () => {
        expect(parse("v(Vin1)").names).toEqual(["Vin1"]);
    });

    it("allows names the normal tokenizer can't lex", () => {
        expect(parse("v(my node 2)").names).toEqual(["my node 2"]);
        expect(parse('v("a (weird) label")').names).toEqual(["a (weird) label"]);
    });

    it("desugars v(a,b) into a subtraction of two refs", () => {
        const { e, names, err } = parse("v(hi,lo)");
        expect(err).toBe(null);
        expect(names).toEqual(["hi", "lo"]);
        expect(e.type).toBe(Expr.E_SUB);
        expect(evalWith("v(hi,lo)", [7, 2])).toBe(5);
    });

    it("gives repeated references to one label the same slot", () => {
        const { names } = parse("v(a)*v(b)+v(a)");
        expect(names).toEqual(["a", "b"]);
        expect(evalWith("v(a)*v(b)+v(a)", [3, 5])).toBe(18);
    });

    it("combines node refs with pin inputs and functions", () => {
        // a == values[0]
        expect(evalWith("a + 2*v(n)", [4], [1])).toBe(9);
        expect(evalWith("max(v(n), 3)", [10])).toBe(10);
    });

    it("does not confuse a label with the time variable or a pin letter", () => {
        expect(parse("v(t)").names).toEqual(["t"]);
        expect(evalWith("v(t)", [42])).toBe(42);
    });

    it("reports an error for a malformed v()", () => {
        expect(parse("v(").err).not.toBe(null);
        expect(parse("v()").err).not.toBe(null);
        expect(parse("v 3").err).not.toBe(null);
    });

    it("leaves expressions without v() alone", () => {
        const { names, err } = parse(".1*(a-b)");
        expect(err).toBe(null);
        expect(names).toEqual([]);
    });

    it("parses i(name) as a current reference", () => {
        const { e, refs, err } = parse("i(shunt)");
        expect(err).toBe(null);
        expect(refs.length).toBe(1);
        expect(refs[0].name).toBe("shunt");
        expect(refs[0].current).toBe(true);
        expect(e.type).toBe(Expr.E_NODEV);
        expect(evalWith("i(shunt)", [0.25])).toBe(0.25);
    });

    it("still treats a bare i as the 9th input letter", () => {
        // i == values[8]; only "i" immediately followed by "(" is a current reference
        const { refs, err } = parse("i*2");
        expect(err).toBe(null);
        expect(refs).toEqual([]);
        const es = new ExprState(0);
        es.values[8] = 3;
        expect(parse("i*2").e.eval(es)).toBe(6);
    });

    it("keeps v(x) and i(x) in separate slots", () => {
        const { refs, err } = parse("v(x)+i(x)");
        expect(err).toBe(null);
        expect(refs.length).toBe(2);
        expect(refs[0].current).toBe(false);
        expect(refs[1].current).toBe(true);
        expect(evalWith("v(x)+i(x)", [10, 1])).toBe(11);
    });

    it("rejects a two-argument i()", () => {
        expect(parse("i(a,b)").err).not.toBe(null);
    });
});
