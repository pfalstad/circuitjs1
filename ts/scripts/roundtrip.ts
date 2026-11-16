/// <reference types="node" />
// Checks that circuits run the same when saved (as XML) and loaded again: each is loaded and
// saved, then run from where it was loaded (no reset), and the saved copy is loaded and run
// the same way, in headless Chrome.  It reports circuits that save differently the second
// time, or whose post voltages differ between the two runs (the first time each element
// differs), which means something wasn't saved, or wasn't loaded back the same way.
//
//   npx tsx scripts/roundtrip.ts [options] [circuit files...]
//
// With no circuit files, it checks those marked good in ../test-interface/test_results.db.
// Options:
//   --steps=N        time steps to run each for (5000)
//   --max-seconds=N  time to spend running each at most (20)
//   --spf=N          time steps per frame (200)
//   --headed         show the browser window
//
// Exits with status 1 if any circuit differs.

import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import { appUrl, goodCircuits, launchBrowser, newPage, startServer, tsRoot } from "./testBrowser";

const args = process.argv.slice(2);
const opt = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name: string) => args.includes(`--${name}`);
const steps = parseInt(opt("steps") ?? "5000");
const maxSeconds = parseFloat(opt("max-seconds") ?? "20");
const spf = parseInt(opt("spf") ?? "200");

async function main(): Promise<number> {
    const files = args.filter(a => !a.startsWith("--"));
    const circuits = files.length > 0 ? files : goodCircuits();
    const server = await startServer(false);
    const browser = await launchBrowser(flag("headed"));
    let page = await newPage(browser);
    const open = async () => {
        await page.goto(appUrl(server.base, { testui: "1" }));
        await page.waitForFunction(() => (window as any).TestManager?.theManager?.app?.loader != null);
    };
    await open();

    let differ = 0, skipped = 0;
    const start = Date.now();
    for (const file of circuits) {
        const name = relative(tsRoot, file);
        if (!existsSync(file)) {
            console.log(`SKIP ${name}: no such file`);
            skipped++;
            continue;
        }
        process.stderr.write(`${name}\r\x1b[K`);
        // each run stops after maxSeconds, so anything much longer is stuck
        const timeout = new Promise<null>(res => setTimeout(() => res(null), (2 * maxSeconds + 30) * 1000));
        const r: any = await Promise.race([timeout, page.evaluate(([text, steps, maxSeconds, spf]) =>
            (window as any).TestManager.theManager.roundTrip(text, steps, maxSeconds, spf),
            [readFileSync(file, "utf8"), steps, maxSeconds, spf] as const)]);
        if (r == null) {
            console.log(`HANG ${name}: no result after ${2 * maxSeconds + 30}s`);
            differ++;
            await page.close().catch(() => {});
            page = await newPage(browser);
            await open();
            continue;
        }
        if (r.skip) {
            console.log(`SKIP ${name}: ${r.skip}`);
            skipped++;
        } else if (r.diffs.length > 0 || r.errors.length > 0) {
            console.log(`DIFF ${name}` + [...r.diffs, ...r.errors].map((s: string) => "\n    " + s).join(""));
            differ++;
        }
    }
    await browser.close();
    await server.close();
    console.log(`\n${circuits.length} circuits, ${circuits.length - differ - skipped} the same, ${differ} differ, ` +
                `${skipped} skipped (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return differ > 0 ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(2); });
