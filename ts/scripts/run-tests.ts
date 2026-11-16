/// <reference types="node" />
// Runs the regression tests (../auto-tests, see TestManager.ts) in the real app, drawing
// included, in headless Chrome:
//
//   npx tsx scripts/run-tests.ts [options] [test files...]
//
// Test files are relative to ../auto-tests.  With none, it runs those listed in
// ../auto-tests/tests.txt.  Options:
//   --list=FILE    run the tests in this list instead (relative to ../auto-tests, like
//                  gen/tests.txt, which create-tests.ts makes)
//   --dist         test the built app (dist/, via `vite preview`) instead of the dev server
//   --headed       show the browser window
//   --steps=N      time steps per frame for tests that don't say (TestManager's
//                  ?teststeps=), 200 by default, to run faster than the UI's 20.  Only
//                  circuits with an adaptive time step can come out differently
//   --out=DIR      where to save screenshots of failed tests (the system's temp directory)
//
// Exits with status 1 if any test fails.

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative, resolve } from "path";
import { autoTestsDir, launchBrowser, newPage, runTestList, startServer, type TestResult } from "./testBrowser";

const args = process.argv.slice(2);
const opt = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name: string) => args.includes(`--${name}`);
const tests = args.filter(a => !a.startsWith("--"));
const outDir = opt("out") ?? join(tmpdir(), "circuitjs-tests");

// a test file named on the command line, relative to ../auto-tests
function testPath(t: string): string {
    const rel = relative(autoTestsDir, resolve(t));
    return rel.startsWith("..") ? t.replace(/^(\.\.\/)?auto-tests\//, "") : rel;
}

async function main(): Promise<number> {
    const server = await startServer(flag("dist"));

    // a list of the tests asked for, served alongside the others
    let list = opt("list") ?? "tests.txt";
    if (tests.length > 0) {
        list = "__run-tests-list.txt";
        writeFileSync(join(autoTestsDir, list), tests.map(testPath).join("\n") + "\n");
    }

    const browser = await launchBrowser(flag("headed"));
    const page = await newPage(browser);
    mkdirSync(outDir, { recursive: true });
    const results: TestResult[] = [];
    const start = Date.now();
    await runTestList(page, server.base, list, opt("steps") ?? "200", async r => {
        results.push(r);
        console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}` + [...r.failures, ...r.errors].map(s => "\n    " + s).join(""));
        if (!r.pass) {
            const file = join(outDir, r.name.replace(/\W+/g, "_") + ".png");
            await page.screenshot({ path: file });
            console.log("    screenshot: " + file);
        }
    });

    await browser.close();
    if (tests.length > 0)
        rmSync(join(autoTestsDir, list), { force: true });
    await server.close();
    const failed = results.filter(r => !r.pass).length;
    console.log(`\n${results.length} tests, ${results.length - failed} passed, ${failed} failed ` +
                `(${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return failed > 0 || results.length === 0 ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(2); });
