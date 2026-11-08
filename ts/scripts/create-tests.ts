/// <reference types="node" />
// Makes regression tests (see TestManager.ts) of circuits, with no interaction: each runs
// from reset in headless Chrome until its scopes are full (or a limit), and what the scopes
// showed is saved with it.  Then each new test is run, to check it passes, and those that
// don't are thrown away.
//
//   npx tsx scripts/create-tests.ts [options] [circuit files...]
//
// With no circuit files, it uses those marked good in ../test-interface/test_results.db
// (the side-by-side comparator).  The tests go in ../auto-tests/gen/: circuits/ for the
// example circuits, tests/ for ../tests, and gen/tests.txt lists them all, for
//
//   npx tsx scripts/run-tests.ts --list=gen/tests.txt
//
// gen/report.txt says which circuits got no test, and why.  Circuits listed in
// gen/exclude.txt (by test name, like circuits/sawtooth.txt, with a # comment saying why)
// never get one.  Options:
//   --force          remake tests that already exist (otherwise they're kept: they're
//                    what later versions are compared against)
//   --max-steps=N    time steps to run each circuit for at most (20000)
//   --max-seconds=N  time to spend running each at most (20)
//   --spf=N          time steps per frame (200)
//   --headed         show the browser window

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { basename, join, relative, resolve } from "path";
import { appUrl, autoTestsDir, goodCircuits, launchBrowser, newPage, runTestList, startServer, tsRoot } from "./testBrowser";

const args = process.argv.slice(2);
const opt = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name: string) => args.includes(`--${name}`);
const maxSteps = parseInt(opt("max-steps") ?? "20000");
const maxSeconds = parseFloat(opt("max-seconds") ?? "20");
const spf = parseInt(opt("spf") ?? "200");
const genDir = join(autoTestsDir, "gen");

// where a circuit's test goes, relative to gen/
function testName(file: string): string {
    const abs = resolve(file);
    if (abs.startsWith(join(tsRoot, "public/circuits") + "/"))
        return "circuits/" + basename(abs);
    if (abs.startsWith(resolve(tsRoot, "../tests") + "/"))
        return "tests/" + basename(abs);
    return basename(abs);
}

function listTests(dir: string, prefix = ""): string[] {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap(d =>
        d.isDirectory() ? listTests(join(dir, d.name), prefix + d.name + "/")
                        : d.name.endsWith(".txt") && prefix ? [prefix + d.name] : []).sort();
}

async function main(): Promise<number> {
    const files = args.filter(a => !a.startsWith("--"));
    const circuits = files.length > 0 ? files : goodCircuits();
    const server = await startServer(false);
    const browser = await launchBrowser(flag("headed"));
    const page = await newPage(browser);
    await page.goto(appUrl(server.base, { testui: "1" }));
    await page.waitForFunction(() => (window as any).TestManager?.theManager?.app?.loader != null);

    const excludeFile = join(genDir, "exclude.txt");
    const exclude = new Set(existsSync(excludeFile) ? readFileSync(excludeFile, "utf8").split("\n")
        .map(l => l.replace(/#.*/, "").trim()).filter(l => l) : []);
    const report: string[] = [];
    const created: string[] = [];
    let dropped = 0;
    for (const file of circuits) {
        const name = testName(file);
        const out = join(genDir, name);
        if ((existsSync(out) && !flag("force")) || exclude.has(name))
            continue;
        if (!existsSync(file)) {
            report.push(`${name}: no such file ${file}`);
            continue;
        }
        const start = Date.now();
        const r = await page.evaluate(([text, maxSteps, maxSeconds, spf]) =>
            (window as any).TestManager.theManager.createTest(text, maxSteps, maxSeconds, spf),
            [readFileSync(file, "utf8"), maxSteps, maxSeconds, spf] as const);
        const secs = ((Date.now() - start) / 1000).toFixed(1);
        if (r.skip || r.errors.length > 0) {
            const why = [r.skip, ...r.errors].filter(s => s).join("; ");
            console.log(`skip ${name}: ${why}`);
            report.push(`${name}: ${why}`);
            continue;
        }
        mkdirSync(join(out, ".."), { recursive: true });
        writeFileSync(out, r.dump);
        created.push(name);
        console.log(`made ${name} (t=${r.len.toPrecision(3)}s, ${secs}s)`);
    }
    await page.close();

    // run the new tests, and throw away those that don't pass: they don't reproduce
    if (created.length > 0) {
        console.log(`\nchecking the ${created.length} new tests`);
        writeFileSync(join(genDir, "__new.txt"), created.join("\n") + "\n");
        const check = await newPage(browser);
        await runTestList(check, server.base, "gen/__new.txt", String(spf), async r => {
            if (r.pass)
                return;
            const why = [...r.failures, ...r.errors].join("; ");
            console.log(`dropped ${r.name}: ${why}`);
            report.push(`${r.name}: doesn't reproduce: ${why}`);
            rmSync(join(genDir, r.name), { force: true });
            dropped++;
        });
        rmSync(join(genDir, "__new.txt"), { force: true });
    }
    await browser.close();
    await server.close();

    const all = listTests(genDir);
    writeFileSync(join(genDir, "tests.txt"), all.join("\n") + "\n");
    // keep what earlier runs said about circuits this run didn't try
    const reportFile = join(genDir, "report.txt");
    const tried = new Set(circuits.map(testName));
    const old = existsSync(reportFile) ? readFileSync(reportFile, "utf8").split("\n")
        .filter(l => l && !tried.has(l.split(":")[0])) : [];
    writeFileSync(reportFile, [...old, ...report].sort().join("\n") + "\n");
    console.log(`\n${created.length - dropped} tests made, ${all.length} in ${relative(process.cwd(), genDir)}/tests.txt; ` +
                `${report.length} circuits without a test (see report.txt)`);
    return 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(2); });
