/// <reference types="node" />
// What run-tests.ts and create-tests.ts share: serving the app and ../auto-tests, and
// running a list of tests in it in Chrome

import { execFileSync } from "child_process";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, preview } from "vite";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export const tsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const autoTestsDir = resolve(tsRoot, "../auto-tests");

export interface TestResult { name: string; pass: boolean; failures: string[]; errors: string[]; }

export interface Server { base: string; close(): Promise<void>; }

// the dev server, or with dist, `vite preview` of the built app.  Both serve ../auto-tests
// at auto-tests/ (vite.config.ts)
export async function startServer(dist: boolean): Promise<Server> {
    if (dist) {
        const s = await preview({ root: tsRoot, preview: { port: 0, open: false } });
        return { base: s.resolvedUrls!.local[0], close: () => s.close() };
    }
    const s = await createServer({ root: tsRoot, server: { port: 0, open: false }, logLevel: "warn" });
    await s.listen();
    return { base: s.resolvedUrls!.local[0], close: () => s.close() };
}

// the installed Google Chrome, or Playwright's own Chromium if there isn't one
export async function launchBrowser(headed: boolean): Promise<Browser> {
    try {
        return await chromium.launch({ channel: "chrome", headless: !headed });
    } catch {
        return await chromium.launch({ headless: !headed });
    }
}

export async function newPage(browser: Browser): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    // errors outside the tests (while loading the app, say) are worth knowing about too
    page.on("pageerror", e => console.log("page error: " + e.message));
    return page;
}

// the app, with TestManager given these query parameters
export function appUrl(base: string, params: Record<string, string>): string {
    const url = new URL("circuitjs.html", base);
    url.searchParams.set("testbase", new URL("auto-tests/", base).href);
    url.searchParams.set("headless", "1");
    // run this many batches of time steps each frame, so tests aren't held to the frame rate
    url.searchParams.set("testbatches", process.env.TESTBATCHES ?? "10");
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    return url.href;
}

// runs the tests in a list (a file in ../auto-tests), calling onResult after each, while
// the app waits
export async function runTestList(page: Page, base: string, list: string, steps: string,
                                  onResult: (r: TestResult) => Promise<void>): Promise<void> {
    await page.exposeFunction("__onTestResult", onResult);
    await page.goto(appUrl(base, { testlist: list, teststeps: steps }));
    await page.waitForFunction(() => (window as any).__testsDone === true, null, { timeout: 0, polling: 500 });
}

// the circuits marked good in the comparator, whose links look like
// http://host:5001/circuits/x.txt or http://host:5001/tests/x.txt
export function goodCircuits(): string[] {
    const db = resolve(tsRoot, "../test-interface/test_results.db");
    const out = execFileSync("sqlite3", ["-list", "-noheader", db, "select link from results where verdict = 'good' order by link"],
                             { encoding: "utf8" });
    return out.split("\n").filter(l => l).map(link => {
        const m = link.match(/\/(circuits|tests)\/([^/]+)$/);
        if (!m)
            throw new Error("unexpected link " + link);
        return m[1] === "circuits" ? join(tsRoot, "public/circuits", m[2]) : resolve(tsRoot, "../tests", m[2]);
    });
}
