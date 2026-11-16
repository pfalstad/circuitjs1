// stop() throws SimStoppedError to abandon the analysis or time step; check that a stop from
// each place it can happen is caught cleanly (message shown, element highlighted, no
// exception reported) and that the circuit runs again after a reset.

import { test, expect } from "./fixtures";

// source, resistor, diode: nonlinear, so runCircuit does subiterations
const base = `$ 1 0.000005 10.2 50 5 50 5e-11
v 100 300 100 100 0 0 40 5 0 0 0.5
r 100 100 300 100 0 1000
d 300 100 300 300 2 default
w 300 300 100 300 0
g 100 300 100 350 0 0
`;

// [site, element class to patch, method, call number on which to stop]
const injected: [string, string, string, number][] = [
    ["validate (preStampCircuit)", "ResistorElm", "validate", 1],
    ["stamp (stampCircuit)", "ResistorElm", "stamp", 1],
    ["startIteration", "DiodeElm", "startIteration", 5],
    ["doStep (first subiteration)", "DiodeElm", "doStep", 1],
    ["doStep (later subiteration)", "DiodeElm", "doStep", 7],
    ["stepFinished", "DiodeElm", "stepFinished", 5],
    ["stamp (restamp during run)", "ResistorElm", "stamp", 2],
    ["onTimeStep", "app", "onTimeStep", 5],
];

async function watch(page: any) {
    const logs: string[] = [];
    page.on("console", (m: any) => logs.push(m.text()));
    page.on("pageerror", (e: any) => logs.push("PAGEERROR: " + e.message));
    return logs;
}

async function state(page: any) {
    return page.evaluate(() => {
        const a = (window as any).__app;
        return { stop: a.stopMessage, running: a.simRunning, exc: a.consoleExceptionOccurred,
                 stopElm: a.stopElm?.getClassName?.() ?? null, t: a.sim.t };
    });
}

const bad = (logs: string[]) => logs.filter(l => /xception|PAGEERROR|Uncaught/.test(l));

test.describe("injected stops", () => {
    test.use({ circuit: base } as any);
    for (const [site, cls, method, n] of injected) {
        test(site, async ({ sim, page }) => {
            const logs = await watch(page);
            await page.evaluate(([cls, method, n, site]) => {
                const a = (window as any).__app;
                const target = cls === "app" ? a : a.elmList.find((e: any) => e.getClassName() === cls);
                const orig = target[method];
                let calls = 0;
                let restamp: any = null;
                if (site.includes("restamp")) {
                    // restamp in the middle of the run, as when the time step changes
                    const d = a.elmList.find((e: any) => e.getClassName() === "DiodeElm");
                    const sf = d.stepFinished;
                    let k = 0;
                    d.stepFinished = function () { sf.apply(this); if (++k === 3) a.sim.stampCircuit(); };
                    restamp = () => { d.stepFinished = sf; };
                }
                (window as any).__unpatch = () => { target[method] = orig; restamp?.(); };
                target[method] = function (...args: any[]) {
                    if (++calls === n)
                        a.sim.stop("injected in " + site, cls === "app" ? null : this);
                    return orig.apply(this, args);
                };
                a.needAnalyze();
                a.setSimRunning(true);
            }, [cls, method, n, site] as const);
            await page.waitForTimeout(700);
            const st = await state(page);
            console.log(site.padEnd(30), JSON.stringify(st), bad(logs));
            expect(st.stop).toBe("injected in " + site);
            expect(st.running).toBe(false);
            expect(st.exc).toBe(false);
            expect(st.stopElm).toBe(cls === "app" ? null : cls);
            expect(bad(logs)).toEqual([]);

            // reset and run again
            await page.evaluate(() => {
                const a = (window as any).__app;
                (window as any).__unpatch();
                a.ui.resetAction();
            });
            // the next frame analyzes the circuit, which clears the stop message
            await page.waitForTimeout(300);
            await page.evaluate(() => (window as any).__app.setSimRunning(true));
            await page.waitForTimeout(700);
            const st2 = await state(page);
            expect(st2.stop).toBe(null);
            expect(st2.running).toBe(true);
            expect(st2.t).toBeGreaterThan(0);
            expect(bad(logs)).toEqual([]);
        });
    }
});

// real circuits that make the simulator stop
const natural: [string, string, string, string | null][] = [
    ["diode max current (stepFinished)", "max current exceeded", "DiodeElm", `$ 1 0.000005 10.2 50 5 50 5e-11
34 hello 1 1.7143528192810002e-7 0 2.0000000000000084 0 1
v 100 300 100 100 0 0 40 5 0 0 0.5
d 100 100 300 100 2 hello
w 300 100 300 300 0
w 300 300 100 300 0
g 100 300 100 350 0 0
`],
    ["path to ground (validate)", "Path to ground with no resistance!", "InverterElm", `$ 1 0.000005 10.2 50 5 50 5e-11
I 100 100 200 100 0 0.5 5
w 200 100 200 200 0
g 200 200 200 250 0 0
`],
    ["polar cap reverse voltage (stepFinished)", "capacitor exceeded max reverse voltage", "PolarCapacitorElm", `<cir f="1" ts="0.000005" ic="10.2" cb="50" pb="50" vr="5" mts="5e-11">
  <R x="100 100 60 100" f="0" wf="0" maxv="20"/>
  <r x="100 100 300 100" f="0" r="10"/>
  <pc x="300 300 300 100" f="0" c="0.00001" iv="0" sr="0" mv="1" vd="0"/>
  <g x="300 300 300 340" f="0"/>
</cir>`],
];

for (const [name, msg, cls, cct] of natural) {
    test.describe(name, () => {
        test.use({ circuit: cct } as any);
        test(name, async ({ sim, page }) => {
            const logs = await watch(page);
            await page.evaluate(() => (window as any).__app.setSimRunning(true));
            await page.waitForTimeout(1000);
            const st = await state(page);
            const elms = await page.evaluate(() => (window as any).__app.elmList.map((e: any) => e.getClassName()));
            console.log(name.padEnd(30), JSON.stringify(st), elms.join(","), bad(logs));
            expect(st.stop).toBe(msg);
            expect(st.running).toBe(false);
            expect(st.exc).toBe(false);
            expect(st.stopElm).toBe(cls);
            expect(bad(logs)).toEqual([]);
        });
    });
}

test.describe("create subcircuit from a circuit that stops", () => {
    test.use({ circuit: `$ 1 0.000005 10.2 50 5 50 5e-11
I 100 100 200 100 0 0.5 5
w 200 100 200 200 0
g 200 200 200 250 0 0
207 100 100 50 100 4 in
` } as any);
    test("create subcircuit", async ({ sim, page }) => {
        const logs = await watch(page);
        page.on("dialog", (d: any) => { logs.push("DIALOG: " + d.message()); d.dismiss(); });
        await sim.menu("File", "Create Subcircuit...");
        await page.waitForTimeout(500);
        const st = await state(page);
        console.log("create subcircuit", JSON.stringify(st), logs.filter(l => /xception|PAGEERROR|DIALOG/.test(l)));
        expect(st.exc).toBe(false);
        expect(bad(logs)).toEqual([]);
    });
});

test.describe("net highlight on a circuit that stops", () => {
    test.use({ circuit: `$ 1 0.000005 10.2 50 5 50 5e-11
I 100 100 200 100 0 0.5 5
w 200 100 200 200 0
g 200 200 200 250 0 0
` } as any);
    test("net highlight", async ({ sim, page }) => {
        const logs = await watch(page);
        const r = await page.evaluate(() => {
            const a = (window as any).__app;
            const w = a.elmList.find((e: any) => e.getClassName() === "WireElm");
            a.mouse.mouseElm = w;
            a.mouse.netHighlightKeyHeld = true;
            a.sim.needsStamp = true;
            try { a.mouse.updateNetHighlight(); return "ok"; } catch (e) { return "threw " + e; }
        });
        const st = await state(page);
        console.log("net highlight", r, JSON.stringify(st));
        expect(r).toBe("ok");
        expect(st.stop).toBe("Path to ground with no resistance!");
        expect(bad(logs)).toEqual([]);
    });
});
