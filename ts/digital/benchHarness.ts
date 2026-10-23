// Differential test and benchmark for the WASM engine: runs one netlist (exported from the app
// with CircuitJS1.exportDigitalNetlist() - see netlist.ts) on both the TypeScript engine and the
// WASM engine, in identical frame-sized steps, and checks they agree. Shared by the Node CLI
// (scripts/bench-wasm.ts) and the browser page (bench-wasm.html), so a number measured on any
// machine comes from the same code.
//
// `breakout` drives fullgame.txt's ExtVoltage inputs the way ../breakout/fullgame.html does
// (attract mode, start a 1-player game, serve), so the run reaches mid-game with bricks up.
// With `sync`, every chip's currentValue() is read each frame, as the app's display sync does.
// Both engines must agree on every chip's state at every checkpoint and on event counts.

import { Circuit } from "./circuit";
import { setTimescale } from "./constants";
import { deserializeCircuitDesc, flattenNetlist, type SerialDesc, type FlatNetlist } from "./netlist";
import { loadWasmEngine, WasmCircuit } from "./wasmEngine";
import { pushSourceValue } from "./nativeKinds";

export interface BenchOptions {
    seconds: number;
    fps: number;
    checkEvery: number;   // frames between state comparisons
    sync: boolean;
    breakout: boolean;
    engine: "both" | "ts" | "wasm";
}

export const DEFAULT_BENCH_OPTIONS: BenchOptions = {
    seconds: 12, fps: 60, checkEvery: 60, sync: true, breakout: false, engine: "both",
};

// Common interface over the two engines, for the driver loop.
interface Engine {
    run(ticks: number): void;
    setSource(chip: number, high: boolean): void;
    syncAll(): void;
    snapshot(): Float64Array;
    eventCount(): number;
    updateCount(): number;
    globalTime(): number;
}

const FIELDS = 7;
const FIELD_NAMES = ["output", "state", "inputs", "pendingEvent", "cycleTime", "lastOutputEvent", "currentValue"];

function tsEngine(sd: SerialDesc): Engine {
    const { desc } = deserializeCircuitDesc(sd);
    const circuit = new Circuit(desc);
    const chips = circuit.chips;
    for (const c of sd.chips) if (c.optimizationDisabled)
        for (const chip of chips) if (chip.debugName === c.name) chip.optimizationDisabled = true;
    circuit.drainZeroDelayEvents();
    return {
        run: (t) => { circuit.runWithDeadline(t); },
        setSource: (i, h) => pushSourceValue(chips[i], h),
        syncAll: () => { for (const chip of chips) chip.currentValue(); },
        snapshot: () => {
            const s = new Float64Array(chips.length * FIELDS);
            chips.forEach((c, i) => {
                const o = i * FIELDS;
                s[o] = c.output; s[o + 1] = c.state; s[o + 2] = c.inputs; s[o + 3] = c.pendingEvent;
                s[o + 4] = c.cycleTime; s[o + 5] = c.lastOutputEvent; s[o + 6] = c.currentValue();
            });
            return s;
        },
        eventCount: () => circuit.eventCount,
        updateCount: () => circuit.updateCount,
        globalTime: () => circuit.globalTime,
    };
}

function wasmEngine(flat: FlatNetlist): Engine {
    const w = new WasmCircuit(flat);
    w.drainZeroDelayEvents();
    const n = w.numChips;
    return {
        run: (t) => { w.runWithDeadline(t); },
        setSource: (i, h) => w.setSource(i, h),
        syncAll: () => { for (let i = 0; i < n; i++) w.currentValue(i); },
        snapshot: () => {
            const s = new Float64Array(n * FIELDS);
            for (let i = 0; i < n; i++) {
                const o = i * FIELDS;
                s[o] = w.output(i); s[o + 1] = w.state(i); s[o + 2] = w.inputs(i); s[o + 3] = w.pendingEvent(i);
                s[o + 4] = w.cycleTime(i); s[o + 5] = w.lastOutputEvent(i); s[o + 6] = w.currentValue(i);
            }
            return s;
        },
        eventCount: () => w.eventCount,
        updateCount: () => w.updateCount,
        globalTime: () => w.globalTime,
    };
}

// The inputs fullgame.html drives, as a function of simulated time; called once per frame
// (fullgame.html does it from onupdate, once per app frame). Returns [chip, high] changes.
function breakoutInputs(sd: SerialDesc, flat: FlatNetlist): (t: number) => [number, boolean][] {
    const sourceChip = (name: string): number => {
        const c = sd.chips.find(c => c.label === `ExtVoltageElm:${name}`);
        if (!c) throw new Error(`no ExtVoltageElm named ${name}`);
        return flat.chipCells.get(c.name)![0];
    };
    const SFL = sourceChip("SFL"), SERVE = sourceChip("SERVE"), START = sourceChip("START GAME"),
          ATTRACT = sourceChip("ATTRACT"), START1 = sourceChip("STARTGAME1"), PLGM = sourceChip("/2 PLGM");
    let attractOn = true, started = false, startOff: number | null = null;
    let served = false, serveOff: number | null = null, first = true;
    return (t) => {
        const out: [number, boolean][] = [];
        if (first) { out.push([ATTRACT, true]); first = false; }
        if (!started && t >= 0.5) {
            started = true;
            out.push([PLGM, true], [START, true], [START1, true]);
            startOff = t + 0.1;
        }
        if (startOff !== null && t >= startOff) {
            out.push([START, false], [START1, false], [ATTRACT, false]);
            attractOn = false; startOff = null;
        }
        if (!served && t >= 1.0) { served = true; out.push([SERVE, true]); serveOff = t + 0.01; }
        if (serveOff !== null && t >= serveOff) { out.push([SERVE, false]); serveOff = null; }
        const halfPeriod = 1 / 4 / 2;
        out.push([SFL, attractOn ? false : Math.floor(t / halfPeriod) % 2 === 0]);
        return out;
    };
}

interface RunResult { runMs: number; syncMs: number; checkpoints: Float64Array[]; events: number; updates: number; endTime: number }

async function drive(e: Engine, o: BenchOptions, inputs: ((t: number) => [number, boolean][]) | null,
        ticksPerFrame: number): Promise<RunResult> {
    const frames = Math.round(o.seconds * o.fps);
    const checkpoints: Float64Array[] = [];
    let runMs = 0, syncMs = 0;
    for (let f = 0; f < frames; f++) {
        if (inputs) for (const [chip, high] of inputs(f / o.fps)) e.setSource(chip, high);
        const t0 = performance.now();
        e.run(ticksPerFrame);
        const t1 = performance.now();
        if (o.sync) e.syncAll();
        const t2 = performance.now();
        runMs += t1 - t0; syncMs += t2 - t1;
        if ((f + 1) % o.checkEvery === 0) checkpoints.push(e.snapshot());
        // Let a browser page repaint its log now and then; costs nothing measurable.
        if (f % 60 === 59) await new Promise(r => setTimeout(r, 0));
    }
    return { runMs, syncMs, checkpoints, events: e.eventCount(), updates: e.updateCount(), endTime: e.globalTime() };
}

function checkStructure(sd: SerialDesc, flat: FlatNetlist, log: (s: string) => void): boolean {
    const { desc } = deserializeCircuitDesc(sd);
    const c = new Circuit(desc);
    const w = new WasmCircuit(flat);
    let ok = c.chips.length === w.numChips;
    if (!ok) log(`chip count differs: ts ${c.chips.length}, wasm ${w.numChips}`);
    for (let i = 0; ok && i < c.chips.length; i++) {
        const chip = c.chips[i];
        const ol = chip.outputLinks.map(l => [l.chip.chipIndex, l.mask]);
        const il = [...chip.inputLinks].map(l => [l.chip.chipIndex, l.mask]);
        if (JSON.stringify(ol) !== JSON.stringify(w.outputLinks(i)) || JSON.stringify(il) !== JSON.stringify(w.inputLinks(i))) {
            log(`links differ at chip ${i} (${chip.debugName})`);
            ok = false;
        }
    }
    w.dispose();
    return ok;
}

function compare(a: RunResult, b: RunResult, o: BenchOptions, flat: FlatNetlist, log: (s: string) => void): boolean {
    let ok = true;
    for (let k = 0; ok && k < a.checkpoints.length; k++) {
        const x = a.checkpoints[k], y = b.checkpoints[k];
        for (let i = 0; i < x.length; i++) {
            if (!Object.is(x[i], y[i])) {
                const chip = Math.floor(i / FIELDS);
                log(`MISMATCH at checkpoint ${k} (t=${((k + 1) * o.checkEvery / o.fps).toFixed(3)}s): chip ${chip} ` +
                    `(${flat.names[chip]}) ${FIELD_NAMES[i % FIELDS]}: ts ${x[i]}, wasm ${y[i]}`);
                ok = false;
                break;
            }
        }
    }
    if (a.events !== b.events || a.updates !== b.updates) {
        log(`event counts differ: ts ${a.events}/${a.updates}, wasm ${b.events}/${b.updates}`);
        ok = false;
    }
    if (a.endTime !== b.endTime) { log(`end time differs: ts ${a.endTime}, wasm ${b.endTime}`); ok = false; }
    return ok;
}

/** Runs the benchmark, logging as it goes. Resolves to false if the engines disagree. */
export async function runBench(sd: SerialDesc, o: BenchOptions, log: (s: string) => void): Promise<boolean> {
    setTimescale(sd.timescale);
    const flat = flattenNetlist(sd);
    const ticksPerFrame = Math.round(1 / o.fps / sd.timescale);
    if (o.engine !== "ts") await loadWasmEngine();
    log(`${flat.numCells} chips, ${o.seconds}s at ${o.fps} fps (${ticksPerFrame} ticks/frame)` +
        `${o.breakout ? ", breakout inputs" : ""}${o.sync ? ", display sync" : ""}`);

    if (o.engine === "both") {
        if (!checkStructure(sd, flat, log)) return false;
        log("structure: identical");
    }

    const report = (name: string, r: RunResult) => {
        const perSec = (ms: number) => (ms / o.seconds).toFixed(0);
        log(`${name.padEnd(5)} run ${perSec(r.runMs)} ms/sim-s, sync ${perSec(r.syncMs)} ms/sim-s, ` +
            `${(o.seconds * 1000 / (r.runMs + r.syncMs)).toFixed(2)}x real time; ${r.events} events, ${r.updates} updates`);
    };
    const inputs = () => o.breakout ? breakoutInputs(sd, flat) : null;

    let ts: RunResult | null = null, wasm: RunResult | null = null;
    if (o.engine !== "wasm") { ts = await drive(tsEngine(sd), o, inputs(), ticksPerFrame); report("ts", ts); }
    if (o.engine !== "ts") { wasm = await drive(wasmEngine(flat), o, inputs(), ticksPerFrame); report("wasm", wasm); }
    if (ts && wasm) {
        const ok = compare(ts, wasm, o, flat, log);
        log(ok ? `state: identical at ${ts.checkpoints.length} checkpoints` : "state: DIFFERS");
        log(`speedup: run ${(ts.runMs / wasm.runMs).toFixed(2)}x, ` +
            `run+sync ${((ts.runMs + ts.syncMs) / (wasm.runMs + wasm.syncMs)).toFixed(2)}x`);
        return ok;
    }
    return true;
}
