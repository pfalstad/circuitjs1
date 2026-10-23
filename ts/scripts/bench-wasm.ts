/// <reference types="node" />
// Node front end for digital/benchHarness.ts (see there for what it checks).
//
//   npx tsx scripts/bench-wasm.ts <netlist.json> [--seconds 12] [--fps 60] [--no-sync]
//                                 [--breakout] [--check-every 60] [--engine both|ts|wasm]
//
// Get a netlist from the running app (dev console): copy(CircuitJS1.exportDigitalNetlist())

import fs from "node:fs";
import { runBench, DEFAULT_BENCH_OPTIONS, type BenchOptions } from "../digital/benchHarness";

const args = process.argv.slice(2);
const opt = (name: string, def: number) => {
    const i = args.indexOf("--" + name);
    return i >= 0 ? Number(args[i + 1]) : def;
};
const flag = (name: string) => args.includes("--" + name);
const file = args.find((a: string, i: number) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--no-sync", "--breakout"].includes(args[i - 1])));
if (!file) { console.error("usage: bench-wasm.ts <netlist.json> [options]"); process.exit(1); }

const d = DEFAULT_BENCH_OPTIONS;
const engineIdx = args.indexOf("--engine");
const o: BenchOptions = {
    seconds: opt("seconds", d.seconds),
    fps: opt("fps", d.fps),
    checkEvery: opt("check-every", d.checkEvery),
    sync: !flag("no-sync"),
    breakout: flag("breakout"),
    engine: (engineIdx >= 0 ? args[engineIdx + 1] : d.engine) as BenchOptions["engine"],
};

console.log(file);
const ok = await runBench(JSON.parse(fs.readFileSync(file, "utf8")), o, (s) => console.log(s));
process.exit(ok ? 0 : 1);
