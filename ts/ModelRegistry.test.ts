import { describe, it, expect } from "vitest";
import { ModelRegistry } from "./ModelRegistry";

class M {
    dumped = false;
    constructor(public name: string) {}
}

describe("ModelRegistry", () => {
    it("adds built-ins on first use, once", () => {
        let calls = 0;
        const reg: ModelRegistry<M> = new ModelRegistry<M>(() => { calls++; reg.setGlobal(new M("default")); });
        expect(calls).toBe(0);
        expect(reg.get("default")?.name).toBe("default");
        expect(reg.has("default")).toBe(true);
        expect(calls).toBe(1);
        reg.reset();
        expect(reg.has("default")).toBe(true);
        expect(calls).toBe(2);
    });

    it("lets local models shadow global ones", () => {
        const reg = new ModelRegistry<M>();
        const g = new M("a"), l = new M("a");
        reg.setGlobal(g);
        reg.setLocal(l);
        expect(reg.get("a")).toBe(l);
        expect(reg.models()).toEqual([l]);
        expect(reg.isLocal(l)).toBe(true);
        expect(reg.isGlobal(g)).toBe(true);
        reg.clearLocal();
        expect(reg.get("a")).toBe(g);
    });

    it("renames within the same tier", () => {
        const reg = new ModelRegistry<M>();
        const l = new M("a");
        reg.setLocal(l);
        reg.rename(l, "b");
        expect(reg.hasLocal("b")).toBe(true);
        expect(reg.has("a")).toBe(false);
        expect(l.name).toBe("b");
    });

    it("adds a renamed model that wasn't registered to the local tier", () => {
        const reg = new ModelRegistry<M>();
        const m = new M("");
        reg.rename(m, "");
        expect(reg.models()).toEqual([]);
        reg.rename(m, "a");
        expect(reg.isLocal(m)).toBe(true);
    });

    it("loads into a new local model, shadowing a global one", () => {
        const reg = new ModelRegistry<M>();
        const g = new M("a");
        reg.setGlobal(g);
        const l = reg.getForLoad("a", () => new M(""));
        expect(l).not.toBe(g);
        expect(reg.isLocal(l)).toBe(true);
        expect(reg.getForLoad("a", () => new M(""))).toBe(l);
        expect(reg.get("a")).toBe(l);
    });

    it("moves models between tiers", () => {
        const reg = new ModelRegistry<M>();
        const g = new M("a"), l = new M("a");
        reg.setGlobal(g);
        reg.setLocal(l);
        reg.makeGlobal(l);
        expect(reg.isGlobal(l)).toBe(true);
        expect(reg.hasLocal("a")).toBe(false);
        reg.makeLocal(l);
        expect(reg.isLocal(l)).toBe(true);
        expect(reg.hasGlobal("a")).toBe(false);
    });

    it("writes unused local models, except embedded ones", () => {
        const written: string[] = [];
        const reg = new ModelRegistry<M>(null, null, (m) => { written.push(m.name); });
        const used = new M("used"), unused = new M("unused"), emb = new M("emb");
        reg.setGlobal(new M("global"));
        reg.setLocal(used);
        reg.setLocal(unused);
        reg.setLocal(emb);
        reg.markEmbedded(emb);
        used.dumped = true;
        reg.dumpUnusedLocal({} as Document);
        expect(written).toEqual(["unused"]);
        expect(unused.dumped).toBe(true);
        // loading the embedded model from the circuit itself makes it the circuit's
        reg.clearDumpedFlags();
        written.length = 0;
        reg.getForLoad("emb", () => new M(""));
        reg.dumpUnusedLocal({} as Document);
        expect(written).toEqual(["used", "unused", "emb"]);
    });

    it("picks unique names", () => {
        const reg = new ModelRegistry<M>();
        expect(reg.uniqueName("x")).toBe("x");
        reg.setGlobal(new M("x"));
        reg.setLocal(new M("x-2"));
        expect(reg.uniqueName("x")).toBe("x-3");
    });

    it("collects models added locally", () => {
        const reg = new ModelRegistry<M>();
        const old = new M("old");
        reg.setLocal(old);
        const added = reg.collectLocal(() => reg.setLocal(new M("new")));
        expect(added.map(m => m.name)).toEqual(["new"]);
        expect(reg.get("old")).toBe(old);
        expect(reg.has("new")).toBe(false);
    });

    it("clears dumped flags in both tiers and bumps the sequence number on changes", () => {
        const reg = new ModelRegistry<M>();
        const a = new M("a"), b = new M("b");
        const seq = reg.sequenceNumber;
        reg.setGlobal(a);
        reg.setLocal(b);
        expect(reg.sequenceNumber).toBeGreaterThan(seq);
        a.dumped = b.dumped = true;
        reg.clearDumpedFlags();
        expect(a.dumped || b.dumped).toBe(false);
    });
});
