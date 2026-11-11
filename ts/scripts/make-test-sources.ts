/// <reference types="node" />
// Makes the copies of circuits in ../auto-tests/src/ that create-tests.ts makes tests of in
// place of the circuits themselves: with scopes added, and switch clicks to make while the
// test is recorded.  What to add is in ../auto-tests/src/specs.txt, one circuit per line:
//
//   circuits/nandff.txt  scopes=10+11,12  speed=16  clicks=8@1e-3,9@2.5e-3
//
// The name is the test's: circuits/ for public/circuits, tests/ for ../tests.  scopes= is a
// comma-separated list of scopes, each a +-separated list of the element numbers to plot in
// it (an element's voltage, or V(ce) for a transistor; en:i for its current, en:p its power).  speed= is
// the scopes' speed (time steps per pixel; the circuit's own, if it adds none).
// clicks=en@t,... toggles switch en at time t;
// with no times (clicks=en,en,...) they're spread evenly over the run.  steps=N lets the
// test run for up to N time steps, instead of create-tests.ts's --max-steps (it's written
// into the copy as <!-- max-steps=N -->); steps=fill, for as long as the scopes show.
// noreset makes the test run from the state the circuit was saved with instead of from
// reset (<!-- noreset -->), to check it's loaded back.  probes=en.post,... (en.out for its
// last post, a gate's output) adds an output element on each of those posts (a chip's pin,
// say), after the circuit's own elements; scopes= names them p0, p1, ..., and with no
// scopes=, each gets a scope of its own.
//
//   npx tsx scripts/make-test-sources.ts [names...]        make the copies (all, or these)
//   npx tsx scripts/make-test-sources.ts --list files...   list the elements of circuits

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { appUrl, autoTestsDir, launchBrowser, newPage, startServer, tsRoot } from "./testBrowser";

const args = process.argv.slice(2);
const srcDir = join(autoTestsDir, "src");

// the circuit a test name is of
function circuitFile(name: string): string {
    const [dir, file] = name.split("/");
    return dir === "circuits" ? join(tsRoot, "public/circuits", file) : resolve(tsRoot, "../tests", file);
}

interface Spec { name: string; scopes: string[][]; speed?: number; steps?: number; fill?: boolean; noReset?: boolean; clicks: { en: number, t?: number }[]; probes: string[]; }

function readSpecs(): Spec[] {
    return readFileSync(join(srcDir, "specs.txt"), "utf8").split("\n")
        .map(l => l.replace(/#.*/, "").trim()).filter(l => l).map(l => {
            const [name, ...opts] = l.split(/\s+/);
            const spec: Spec = { name, scopes: [], clicks: [], probes: [] };
            for (const o of opts) {
                const [k, v] = o.split("=");
                if (k === "noreset")
                    spec.noReset = true;
                else if (k === "scopes")
                    spec.scopes = v.split(",").map(s => s.split("+"));
                else if (k === "probes")
                    spec.probes = v.split(",");
                else if (k === "steps" && v === "fill")
                    spec.fill = true;
                else if (k === "steps")
                    spec.steps = parseInt(v);
                else if (k === "speed")
                    spec.speed = parseInt(v);
                else if (k === "clicks")
                    spec.clicks = v.split(",").map(c => { const [en, t] = c.split("@"); return { en: parseInt(en), t: t == null ? undefined : parseFloat(t) }; });
                else
                    throw new Error(`${name}: unknown option ${o}`);
            }
            return spec;
        });
}

async function main(): Promise<number> {
    const list = args.includes("--list");
    const names = args.filter(a => !a.startsWith("--"));
    const server = await startServer(false);
    const browser = await launchBrowser(false);
    const page = await newPage(browser);
    await page.goto(appUrl(server.base, { testui: "1" }));
    await page.waitForFunction(() => (window as any).TestManager?.theManager?.app?.loader != null);
    const load = (text: string) => page.evaluate(async text => {
        const app = (window as any).TestManager.theManager.app;
        await app.loader.readCircuit(text);
        app.setSimRunning(false);
    }, text);

    if (list) {
        for (const file of names) {
            await load(readFileSync(file, "utf8"));
            const elms: string[] = await page.evaluate(() => {
                const app = (window as any).TestManager.theManager.app;
                return [`dt ${app.sim.maxTimeStep}`, ...(app.elmList as any[]).map((ce, i) => {
                    if (ce.getClassName() === "WireElm")
                        return "";
                    const info: string[] = [];
                    try { ce.getInfo(info); } catch {}
                    let extra = info.filter(s => s).slice(0, 2).join("; ");
                    if (ce.pins)
                        extra += "; pins " + (ce.pins as any[]).map((p, j) => `${j}=${p.text}`).join(" ");
                    return `${i} ${ce.getClassName()} (${ce.x},${ce.y})-(${ce.x2},${ce.y2}) ${extra}`;
                })].filter((s: string) => s);
            });
            console.log(`== ${basename(file)}\n` + elms.join("\n"));
        }
    } else {
        const specs = readSpecs().filter(s => names.length === 0 || names.includes(s.name));
        for (const spec of specs) {
            await load(readFileSync(circuitFile(spec.name), "utf8"));
            const r = await page.evaluate(async spec => {
                const { Scope } = await import("/Scope.ts" as any);
                const { OutputElm } = await import("/OutputElm.ts" as any);
                const app = (window as any).TestManager.theManager.app;
                const sm = app.scopeManager;
                const probes: number[] = [];
                for (const pr of spec.probes) {
                    const [en, post] = pr.split(".");
                    const ce = app.getElm(parseInt(en));
                    const p = ce?.getPost(post === "out" ? ce.getPostCount() - 1 : parseInt(post));
                    if (p == null)
                        return { error: `no post ${pr}` };
                    const o = new OutputElm(p.x, p.y);
                    o.x2 = p.x + 16;
                    o.setPoints();
                    probes.push(app.elmList.length);
                    app.elmList.push(o);
                }
                app.needAnalyze();
                const scopes = spec.scopes.length > 0 ? spec.scopes : probes.map((_, i) => ["p" + i]);
                for (const elms of scopes) {
                    const i = sm.scopeCount++;
                    const sc = sm.scopes[i] = new Scope(app, app.sim);
                    sc.position = i;
                    sc.plots = [];
                    for (const e of elms) {
                        const [en, what] = e.split(":");
                        const ce = app.getElm(en.startsWith("p") ? probes[parseInt(en.substring(1))] : parseInt(en));
                        if (ce == null)
                            return { error: `no element ${en}` };
                        // as the UI allows (a chip's pins can be probed instead)
                        if (!ce.canViewInScope())
                            return { error: `element ${en} (${ce.getClassName()}) can't be viewed in a scope` };
                        // VAL_CURRENT, or VAL_IC for a transistor
                        if (what === "i")
                            sc.addValue(ce.isTransistorElm() ? 2 : 3, ce);
                        // VAL_POWER
                        else if (what === "p")
                            sc.addValue(7, ce);
                        else
                            sc.addElm(ce);
                    }
                    sc.initialize();
                    if (spec.speed)
                        sc.speed = spec.speed;
                    else if (i > 0)
                        sc.speed = sm.scopes[i - 1].speed;
                }
                // with no scopes of its own, speed= is the circuit's scopes'
                if (scopes.length === 0 && spec.speed)
                    for (let i = 0; i < sm.scopeCount; i++)
                        sm.scopes[i].speed = spec.speed;
                for (const c of spec.clicks)
                    if (!(app.getElm(c.en)?.toggle))
                        return { error: `element ${c.en} is not a switch` };
                sm.setupScopes();
                // the run is as long as the scopes show (create-tests.ts runs it in a window
                // the same size), once they've been drawn and know their width
                // (no named functions in here: tsx wraps them in a helper the page doesn't have)
                for (let f = 0; f < 2; f++)
                    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
                let len = Infinity;
                for (let i = 0; i < sm.scopeCount; i++)
                    for (const p of sm.scopes[i].plots)
                        len = Math.min(len, p.scopePointCount * p.scopePlotSpeed * app.sim.maxTimeStep);
                if (!isFinite(len))
                    return { error: "no scopes" };
                const times = spec.clicks.map((c, i) => c.t ?? Number(((i + 1) * len / (spec.clicks.length + 1)).toPrecision(4)));
                return { dump: app.dumpCircuit() as string, times, fillSteps: Math.ceil(len / app.sim.maxTimeStep) };
            }, spec);
            if (r.error) {
                console.log(`${spec.name}: ${r.error}`);
                continue;
            }
            let dump = r.dump!;
            const steps = spec.fill ? r.fillSteps : spec.steps;
            const tags = (steps ? `  <!-- max-steps=${steps} -->\n` : "") + (spec.noReset ? "  <!-- noreset -->\n" : "") + spec.clicks.map((c, i) => `  <switchevent t="${r.times![i]}" en="${c.en}"/>\n`).join("");
            const idx = dump.lastIndexOf("</cir>");
            dump = dump.substring(0, idx) + tags + dump.substring(idx);
            const out = join(srcDir, spec.name);
            mkdirSync(dirname(out), { recursive: true });
            writeFileSync(out, dump);
            console.log(`made ${spec.name}`);
        }
    }
    await browser.close();
    await server.close();
    return 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(2); });
