// Differential test and benchmark for the WASM engine: runs one netlist (exported from the app
// with CircuitJS1.exportDigitalNetlist() - see netlist.ts) on both the TypeScript engine and the
// WASM engine, in identical frame-sized steps, and checks they agree. Shared by the Node CLI
// (scripts/bench-wasm.ts) and the browser page (bench-wasm.html), so a number measured on any
// machine comes from the same code.
//
// The netlist's seeds (seedInitialDigitalState()) are applied after the initial zero-delay
// drain, as SimulationManager does. `toggle` flips the circuit's logic inputs at pseudo-random
// frames (the same ones on both engines). `watch` > 0 attaches a scope-like history watcher to
// every `watch`-th chip after the first second (or quarter of the run, if shorter): skipBackfillTo() on attach, backfillHistory()
// every frame while asleep, trimHistory() every frame - and compares the recorded histories.
//
// `breakout` drives fullgame.txt's ExtVoltage inputs the way ../breakout/fullgame.html does
// (attract mode, start a 1-player game, serve), so the run reaches mid-game with bricks up.
// `pong` does the same for ../pong/pong-full.txt as ../pong/fullgame.html drives it: start a
// game (reset pulse), keep it running, and move both paddles (their monostables' periods).
// With `sync`, every chip's currentValue() is read each frame, as the app's display sync does.
// Both engines must agree on every chip's state at every checkpoint and on event counts.

import { Circuit } from "./circuit";
import { ChipState, type Chip, type HistoryWatcher } from "./chip";
import type { CustomLogic } from "./chip_desc";
import { seedChipValues } from "./DigitalGraphBuilder";
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
    pong: boolean;
    toggle: boolean;
    watch: number;
    engine: "both" | "ts" | "wasm";
}

export const DEFAULT_BENCH_OPTIONS: BenchOptions = {
    seconds: 12, fps: 60, checkEvery: 60, sync: true, breakout: false, pong: false, toggle: false, watch: 0, engine: "both",
};

// An input change a schedule makes: a source cell's level, or a monostable cell's period
// (MonostableElm.setPeriod(), in ticks).
type InputChange = { chip: number; high: boolean } | { chip: number; fallDelay: number };
type Inputs = (t: number) => InputChange[];

// Common interface over the two engines, for the driver loop.
interface Engine {
    run(ticks: number): void;
    setSource(chip: number, high: boolean): void;
    setFallDelay(chip: number, ticks: number): void;
    syncAll(): void;
    snapshot(): Float64Array;
    eventCount(): number;
    updateCount(): number;
    globalTime(): number;
    watch(chip: number): void;
    /** Per frame, for every watched chip: backfill (as a scope draw does) then trim. */
    serviceWatched(): void;
    histories(): string;
}

// A watcher whose floor is the time it last read up to, like ScopePlot's. It logs every
// history entry it reads into a running hash, so the comparison covers the whole trace even
// though trimHistory() keeps discarding what has been read.
class FloorWatcher implements HistoryWatcher {
    floor = -1;
    next = 0;          // index of the first unread entry
    count = 0;
    hash = 2166136261;
    tail: [number, number][] = [];
    historyFloor(): number { return this.floor; }

    read(times: ArrayLike<number>, values: ArrayLike<number>): void {
        for (let k = this.next; k < times.length; k++) {
            this.hash = Math.imul(this.hash ^ (times[k] % 4294967296), 16777619) >>> 0;
            this.hash = Math.imul(this.hash ^ (times[k] / 4294967296), 16777619) >>> 0;
            this.hash = Math.imul(this.hash ^ values[k], 16777619) >>> 0;
            this.count++;
            this.tail.push([times[k], values[k]]);
            if (this.tail.length > 8) this.tail.shift();
        }
    }

    summary(): string { return `${this.count}:${this.hash}:${JSON.stringify(this.tail)}`; }
}

const FIELDS = 7;
const FIELD_NAMES = ["output", "state", "inputs", "pendingEvent", "cycleTime", "lastOutputEvent", "currentValue"];

function tsEngine(sdIn: SerialDesc, jsCells?: CustomLogic[]): Engine {
    // A copy: setFallDelay() changes the monostable periods its cells read.
    const sd: SerialDesc = structuredClone(sdIn);
    const { desc } = deserializeCircuitDesc(sd, jsCells);
    const circuit = new Circuit(desc);
    const chips = circuit.chips;
    for (const c of sd.chips) if (c.optimizationDisabled)
        for (const chip of chips) if (chip.debugName === c.name) chip.optimizationDisabled = true;
    circuit.drainZeroDelayEvents();
    // createChip() makes an element's cells consecutively, in order.
    const byName = new Map<string, Chip[]>();
    for (const chip of chips) if (chip.debugName) {
        const l = byName.get(chip.debugName);
        if (l) l.push(chip); else byName.set(chip.debugName, [chip]);
    }
    seedChipValues((sd.seeds ?? []).map(([name, cell, value]) => ({ chip: byName.get(name)?.[cell] ?? null, value })));
    const natives = new Map<Chip, { fallDelay?: number }>();
    for (const c of sd.chips) c.cells.forEach((cell, k) => {
        const chip = byName.get(c.name)?.[k];
        if (chip && cell.native) natives.set(chip, cell.native as { fallDelay?: number });
    });
    const watched: { chip: Chip; w: FloorWatcher }[] = [];
    return {
        run: (t) => { circuit.runWithDeadline(t); },
        setSource: (i, h) => pushSourceValue(chips[i], h),
        setFallDelay: (i, t) => { natives.get(chips[i])!.fallDelay = t; },
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
        watch: (i) => {
            const chip = chips[i], w = new FloorWatcher();
            chip.skipBackfillTo(circuit.globalTime);
            chip.addHistoryWatcher(w);
            watched.push({ chip, w });
        },
        serviceWatched: () => {
            const now = circuit.globalTime;
            for (const { chip, w } of watched) {
                w.floor = chip.state === ChipState.ASLEEP ? chip.backfillHistory(now) : now;
                const h = chip.history;
                w.read(h.map(e => e.time), h.map(e => e.value));
                chip.trimHistory();
                w.next = chip.history.length;
            }
        },
        histories: () => JSON.stringify(watched.map(({ w }) => w.summary())),
    };
}

function wasmEngine(flat: FlatNetlist, jsCells?: CustomLogic[]): Engine {
    const w = new WasmCircuit(flat, jsCells);
    w.drainZeroDelayEvents();
    w.seed(flat.seeds);
    const n = w.numChips;
    const watched: { chip: number; w: FloorWatcher }[] = [];
    return {
        run: (t) => { w.runWithDeadline(t); },
        setSource: (i, h) => w.setSource(i, h),
        setFallDelay: (i, t) => w.setParam(i, 2, t), // netlist.ts's monoQ/monoExp layout
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
        watch: (i) => {
            w.skipBackfillTo(i, w.globalTime);
            w.setHistoryWatched(i);
            watched.push({ chip: i, w: new FloorWatcher() });
        },
        serviceWatched: () => {
            const now = w.globalTime;
            for (const x of watched) {
                x.w.floor = w.state(x.chip) === ChipState.ASLEEP ? w.backfillHistory(x.chip, now) : now;
                const h = w.history(x.chip);
                x.w.read(h.times, h.values);
                w.trimHistory(x.chip, x.w.floor);
                x.w.next = w.historyLength(x.chip);
            }
        },
        histories: () => JSON.stringify(watched.map(({ w }) => w.summary())),
    };
}

// Deterministic PRNG (mulberry32), so both engines see the same toggles.
function rng(seed: number): () => number {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Flips a random source cell (a LogicInputElm, an ExtVoltageElm...) on about one frame in ten.
function toggleInputs(sd: SerialDesc, flat: FlatNetlist): Inputs {
    const sources: { chip: number; high: boolean }[] = [];
    for (const c of sd.chips) c.cells.forEach((cell, k) => {
        if (cell.native?.kind === "source")
            sources.push({ chip: flat.chipCells.get(c.name)![k], high: cell.native.high !== 0 });
    });
    const r = rng(12345);
    return () => {
        if (sources.length === 0 || r() > 0.1) return [];
        const s = sources[Math.floor(r() * sources.length)];
        s.high = !s.high;
        return [{ chip: s.chip, high: s.high }];
    };
}

// The inputs fullgame.html drives, as a function of simulated time; called once per frame
// (fullgame.html does it from onupdate, once per app frame). Returns [chip, high] changes.
// The source cell of the ExtVoltageElm named `name`.
function extVoltageChip(sd: SerialDesc, flat: FlatNetlist, name: string): number {
    const c = sd.chips.find(c => c.label === `ExtVoltageElm:${name}`);
    if (!c) throw new Error(`no ExtVoltageElm named ${name}`);
    return flat.chipCells.get(c.name)![0];
}

function breakoutInputs(sd: SerialDesc, flat: FlatNetlist): Inputs {
    const sourceChip = (name: string) => extVoltageChip(sd, flat, name);
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
        return out.map(([chip, high]) => ({ chip, high }));
    };
}

// The inputs ../pong/fullgame.html drives. Its paddles are the two monostables saved with 1s
// and 2s periods (see its didAnalyze()); it sets each to a fraction of a frame. Here both sweep
// up and down at different rates, a game starts at 0.5s (a 10ms SRST pulse with /RUN low), and
// restarts every 10s, standing in for the page's own restart after a game ends.
function pongInputs(sd: SerialDesc, flat: FlatNetlist): Inputs {
    const RUN = extVoltageChip(sd, flat, "/RUN"), SRST = extVoltageChip(sd, flat, "SRST");
    const paddle = (seconds: number): number[] => {
        const ticks = Math.round(seconds / sd.timescale);
        const c = sd.chips.find(c => c.cells.some(cell => cell.native?.kind === "monoQ" && cell.native.fallDelay === ticks));
        if (!c) throw new Error(`no monostable with a ${seconds}s period`);
        const cells = flat.chipCells.get(c.name)!;
        return c.cells.flatMap((cell, k) => cell.native?.kind === "monoQ" || cell.native?.kind === "monoExp" ? [cells[k]] : []);
    };
    const paddles = [paddle(1), paddle(2)];
    const FRAME_SECONDS = 1 / 60.05;
    let nextStart = 0.5, srstOff: number | null = null, lastMove = -1;
    return (t) => {
        const out: InputChange[] = [];
        if (t >= nextStart) {
            out.push({ chip: RUN, high: false }, { chip: SRST, high: true });
            srstOff = t + 0.01; nextStart += 10;
        }
        if (srstOff !== null && t >= srstOff) { out.push({ chip: SRST, high: false }); srstOff = null; }
        if (lastMove < 0 || t - lastMove >= 0.05) {
            lastMove = t;
            paddles.forEach((cells, k) => {
                const pos = 0.53 + 0.42 * Math.sin(t * (1.7 + k * 0.9) + k);
                const ticks = Math.max(1, Math.round(pos * FRAME_SECONDS / sd.timescale));
                for (const chip of cells) out.push({ chip, fallDelay: ticks });
            });
        }
        return out;
    };
}

interface RunResult { runMs: number; syncMs: number; checkpoints: Float64Array[]; histories: string[]; events: number; updates: number; endTime: number }

async function drive(e: Engine, o: BenchOptions, inputs: Inputs | null,
        ticksPerFrame: number, numChips: number): Promise<RunResult> {
    const frames = Math.round(o.seconds * o.fps);
    const checkpoints: Float64Array[] = [];
    const histories: string[] = [];
    const watchFrom = Math.min(o.fps, Math.floor(frames / 4));
    let runMs = 0, syncMs = 0;
    for (let f = 0; f < frames; f++) {
        if (inputs) for (const c of inputs(f / o.fps)) {
            if ("high" in c) e.setSource(c.chip, c.high); else e.setFallDelay(c.chip, c.fallDelay);
        }
        if (o.watch > 0 && f === watchFrom) for (let i = 3; i < numChips; i += o.watch) e.watch(i);
        const t0 = performance.now();
        e.run(ticksPerFrame);
        const t1 = performance.now();
        if (o.sync) e.syncAll();
        const t2 = performance.now();
        runMs += t1 - t0; syncMs += t2 - t1;
        if (o.watch > 0) e.serviceWatched();
        if ((f + 1) % o.checkEvery === 0) {
            checkpoints.push(e.snapshot());
            if (o.watch > 0) histories.push(e.histories());
        }
        // Let a browser page repaint its log now and then; costs nothing measurable.
        if (f % 60 === 59) await new Promise(r => setTimeout(r, 0));
    }
    return { runMs, syncMs, checkpoints, histories, events: e.eventCount(), updates: e.updateCount(), endTime: e.globalTime() };
}

function checkStructure(sd: SerialDesc, flat: FlatNetlist, log: (s: string) => void,
        jsCells?: { ts: CustomLogic[]; wasm: CustomLogic[] }): boolean {
    // Building runs initialize(), which calls custom closures, so use throwaway no-ops.
    const nops = jsCells ? jsCells.ts.map(() => () => { }) : undefined;
    const { desc } = deserializeCircuitDesc(sd, nops);
    const c = new Circuit(desc);
    const w = new WasmCircuit(flat, nops);
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
    for (let k = 0; ok && k < a.histories.length; k++) {
        if (a.histories[k] !== b.histories[k]) {
            log(`HISTORY MISMATCH at checkpoint ${k} (t=${((k + 1) * o.checkEvery / o.fps).toFixed(3)}s)`);
            const x = JSON.parse(a.histories[k]), y = JSON.parse(b.histories[k]);
            for (let j = 0; j < x.length; j++)
                if (JSON.stringify(x[j]) !== JSON.stringify(y[j])) {
                    log(`  watched chip #${j}: ts ${JSON.stringify(x[j]).slice(0, 200)}`);
                    log(`  ${" ".repeat(String(j).length + 15)}wasm ${JSON.stringify(y[j]).slice(0, 200)}`);
                    break;
                }
            ok = false;
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
function historyEntries(r: RunResult): number {
    const last = r.histories.at(-1);
    return last ? (JSON.parse(last) as string[]).reduce((n, h) => n + Number(h.split(":")[0]), 0) : 0;
}

/** `jsCells`, for an in-memory netlist with "js" cells: a separate set of closures per engine,
 * since a closure's captured state must not be shared between the two runs. */
export async function runBench(sd: SerialDesc, o: BenchOptions, log: (s: string) => void,
        jsCells?: { ts: CustomLogic[]; wasm: CustomLogic[] }): Promise<boolean> {
    setTimescale(sd.timescale);
    const flat = flattenNetlist(sd);
    const ticksPerFrame = Math.round(1 / o.fps / sd.timescale);
    if (o.engine !== "ts") await loadWasmEngine();
    log(`${flat.numCells} chips, ${o.seconds}s at ${o.fps} fps (${ticksPerFrame} ticks/frame)` +
        `${o.breakout ? ", breakout inputs" : ""}${o.pong ? ", pong inputs" : ""}${o.sync ? ", display sync" : ""}`);

    if (o.engine === "both") {
        if (!checkStructure(sd, flat, log, jsCells)) return false;
        log("structure: identical");
    }

    const report = (name: string, r: RunResult) => {
        const perSec = (ms: number) => (ms / o.seconds).toFixed(0);
        log(`${name.padEnd(5)} run ${perSec(r.runMs)} ms/sim-s, sync ${perSec(r.syncMs)} ms/sim-s, ` +
            `${(o.seconds * 1000 / (r.runMs + r.syncMs)).toFixed(2)}x real time; ${r.events} events, ${r.updates} updates`);
    };
    const inputs = () => o.breakout ? breakoutInputs(sd, flat) : o.pong ? pongInputs(sd, flat)
        : o.toggle ? toggleInputs(sd, flat) : null;

    let ts: RunResult | null = null, wasm: RunResult | null = null;
    const n = flat.numCells;
    if (o.engine !== "wasm") { ts = await drive(tsEngine(sd, jsCells?.ts), o, inputs(), ticksPerFrame, n); report("ts", ts); }
    if (o.engine !== "ts") { wasm = await drive(wasmEngine(flat, jsCells?.wasm), o, inputs(), ticksPerFrame, n); report("wasm", wasm); }
    if (ts && wasm) {
        const ok = compare(ts, wasm, o, flat, log);
        log(ok ? `state: identical at ${ts.checkpoints.length} checkpoints` +
            (o.watch > 0 ? `, histories identical (${historyEntries(ts)} entries)` : "") : "state: DIFFERS");
        log(`speedup: run ${(ts.runMs / wasm.runMs).toFixed(2)}x, ` +
            `run+sync ${((ts.runMs + ts.syncMs) / (wasm.runMs + wasm.syncMs)).toFixed(2)}x`);
        return ok;
    }
    return true;
}
