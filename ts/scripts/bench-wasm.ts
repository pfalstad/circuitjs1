/// <reference types="node" />
// Node front end for digital/benchHarness.ts (see there for what it checks).
//
//   npx tsx scripts/bench-wasm.ts <netlist.json | dir>... [--seconds 12] [--fps 60] [--no-sync]
//         [--breakout] [--toggle] [--watch N] [--check-every 60] [--engine both|ts|wasm] [--quiet]
//
// Given a directory, runs every .json in it. --quiet prints one line per netlist.
// Get a netlist from the running app (dev console): copy(CircuitJS1.exportDigitalNetlist())

import fs from "node:fs";
import path from "node:path";
import { runBench, DEFAULT_BENCH_OPTIONS, type BenchOptions } from "../digital/benchHarness";

const args = process.argv.slice(2);
const VALUED = ["--seconds", "--fps", "--check-every", "--engine", "--watch"];
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
    if (VALUED.includes(args[i])) { i++; continue; }
    if (args[i].startsWith("--")) continue;
    const p = args[i];
    if (fs.statSync(p).isDirectory())
        for (const f of fs.readdirSync(p).sort()) { if (f.endsWith(".json")) files.push(path.join(p, f)); }
    else files.push(p);
}
if (files.length === 0) { console.error("usage: bench-wasm.ts <netlist.json | dir>... [options]"); process.exit(1); }

const opt = (name: string, def: number) => {
    const i = args.indexOf("--" + name);
    return i >= 0 ? Number(args[i + 1]) : def;
};
const flag = (name: string) => args.includes("--" + name);
const d = DEFAULT_BENCH_OPTIONS;
const engineIdx = args.indexOf("--engine");
const o: BenchOptions = {
    seconds: opt("seconds", d.seconds),
    fps: opt("fps", d.fps),
    checkEvery: opt("check-every", d.checkEvery),
    sync: !flag("no-sync"),
    breakout: flag("breakout"),
    toggle: flag("toggle"),
    watch: opt("watch", d.watch),
    engine: (engineIdx >= 0 ? args[engineIdx + 1] : d.engine) as BenchOptions["engine"],
};
const quiet = flag("quiet");

let failed = 0;
for (const file of files) {
    const lines: string[] = [];
    let ok: boolean;
    try {
        ok = await runBench(JSON.parse(fs.readFileSync(file, "utf8")), o, (s) => { lines.push(s); if (!quiet) console.log(s); });
    } catch (e) {
        lines.push(`error: ${(e as Error).stack ?? e}`);
        if (!quiet) console.log(lines.at(-1));
        ok = false;
    }
    if (!ok) failed++;
    if (quiet) console.log(`${ok ? "ok  " : "FAIL"} ${path.basename(file)}: ${ok ? lines.filter(l => /^(state|speedup)/.test(l)).join(" | ") : lines.filter(l => /MISMATCH|differ|error/.test(l)).join(" | ")}`);
    else console.log(`=== ${file}: ${ok ? "ok" : "FAIL"}\n`);
}
if (files.length > 1) console.log(`${files.length - failed}/${files.length} ok`);
process.exit(failed ? 1 : 0);
