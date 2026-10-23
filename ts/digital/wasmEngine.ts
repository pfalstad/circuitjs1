// JS side of the WASM digital engine (wasm/engine.cpp). Loads the module once, and wraps one
// built circuit in WasmCircuit, which mirrors the parts of circuit.ts's Circuit the app drives.

import { CELL_FIELDS, NetKind, type FlatNetlist } from "./netlist";
import type { Chip } from "./chip";
import type { CustomLogic } from "./chip_desc";

// Live circuits by their WASM pointer, for routing K_JS cell updates (engine.cpp's
// js_custom_update()) back to the right closure.
const liveCircuits = new Map<number, WasmCircuit>();

// The Emscripten module's exports we use (see engine.cpp's extern "C" block).
interface EngineModule {
    HEAPF64: Float64Array;
    HEAP32: Int32Array;
    HEAPU32: Uint32Array;
    _malloc(n: number): number;
    _free(p: number): void;
    _circuit_new(): number;
    _circuit_add_sram(c: number, addrBits: number, words: number): void;
    _circuit_build(c: number, numCells: number, cells: number, delays: number, luts: number,
                   connects: number, numConnects: number, monoGroups: number): void;
    _circuit_free(c: number): void;
    _circuit_run_with_deadline(c: number, ticks: number, deadlineMs: number): number;
    _circuit_run(c: number, ticks: number): void;
    _circuit_drain_zero_delay(c: number): void;
    _circuit_global_time(c: number): number;
    _circuit_halt_requested(c: number): number;
    _circuit_event_count(c: number): number;
    _circuit_update_count(c: number): number;
    _circuit_num_chips(c: number): number;
    _chip_output(c: number, i: number): number;
    _chip_state(c: number, i: number): number;
    _chip_inputs(c: number, i: number): number;
    _chip_pending_event(c: number, i: number): number;
    _chip_cycle_time(c: number, i: number): number;
    _chip_last_output_event(c: number, i: number): number;
    _chip_current_value(c: number, i: number): number;
    _chip_num_inputs(c: number, i: number): number;
    _chip_type(c: number, i: number): number;
    _chip_opt_disabled(c: number, i: number): number;
    _chip_set_opt_disabled(c: number, i: number, v: number): void;
    _chip_num_output_links(c: number, i: number): number;
    _chip_output_link_dst(c: number, i: number, k: number): number;
    _chip_output_link_mask(c: number, i: number, k: number): number;
    _chip_input_link_src(c: number, i: number, k: number): number;
    _chip_input_link_mask(c: number, i: number, k: number): number;
    _chip_set_source(c: number, i: number, high: number): void;
    _chip_set_inputs(c: number, i: number, v: number): void;
    _chip_set_output(c: number, i: number, v: number): void;
    _chip_set_pending_event(c: number, i: number, v: number): void;
    _chip_delay(c: number, i: number, k: number): number;
    _circuit_queue_push(c: number, i: number, delay: number): number;
    _circuit_request_halt(c: number): void;
    _chip_set_param(c: number, i: number, k: number, v: number): void;
    _chip_set_history_watched(c: number, i: number): void;
    _chip_history_length(c: number, i: number): number;
    _chip_history_data(c: number, i: number): number;
    _chip_backfill_history(c: number, i: number, now: number): number;
    _chip_skip_backfill_to(c: number, i: number, target: number): void;
    _chip_trim_history(c: number, i: number, haveWatchers: number, floor: number): void;
    _circuit_seed(c: number, n: number, chips: number, values: number): void;
    _sram_read(c: number, mem: number, address: number): number;
    _sram_write(c: number, mem: number, address: number, value: number): void;
}

let modulePromise: Promise<EngineModule> | null = null;
let engine: EngineModule | null = null;

/** Loads the WASM module (once). */
export function loadWasmEngine(): Promise<EngineModule> {
    if (!modulePromise) {
        modulePromise = import("./wasm/engine.js").then(async (m: any) => {
            engine = await m.default();
            (engine as any).jsCustomUpdate = (c: number, chip: number, mask: number) =>
                liveCircuits.get(c)!.jsUpdate(chip, mask);
            return engine!;
        });
    }
    return modulePromise;
}

/** The module, if loadWasmEngine() has finished. */
export function wasmEngineLoaded(): boolean {
    return engine !== null;
}

function copyIn(m: EngineModule, data: Float64Array | Int32Array | Uint32Array): number {
    const p = m._malloc(Math.max(8, data.byteLength));
    if (data instanceof Float64Array) m.HEAPF64.set(data, p >> 3);
    else if (data instanceof Int32Array) m.HEAP32.set(data, p >> 2);
    else m.HEAPU32.set(data, p >> 2);
    return p;
}

export class WasmCircuit {
    private m: EngineModule;
    private c: number;
    readonly numChips: number;

    // Closure per K_JS cell, by chip index, and the proxy each is handed.
    private jsCells = new Map<number, CustomLogic>();
    private proxies = new Map<number, WasmChipProxy>();

    /** Builds `net`. Its seeds are not applied here: the app drains zero-delay events first,
     * then seeds, so call drainZeroDelayEvents() and then seed(net.seeds). `jsCells` holds the
     * closures for the netlist's "js" cells. loadWasmEngine() must have finished. */
    constructor(net: FlatNetlist, jsCells?: CustomLogic[]) {
        if (!engine) throw new Error("WASM digital engine not loaded");
        const m = this.m = engine;
        this.c = m._circuit_new();

        for (const s of net.srams) {
            const p = copyIn(m, Int32Array.from(s.words));
            m._circuit_add_sram(this.c, s.addrBits, p);
            m._free(p);
        }

        if (net.cells.length !== net.numCells * CELL_FIELDS) throw new Error("bad netlist");
        for (let i = 0; i < net.numCells; i++) {
            if (net.cells[i * CELL_FIELDS] !== NetKind.JS) continue;
            const fn = jsCells?.[net.cells[i * CELL_FIELDS + 8]];
            if (!fn) throw new Error(`netlist cell ${i} (${net.names[i]}) needs a JS closure`);
            this.jsCells.set(i, fn);
        }
        liveCircuits.set(this.c, this);
        const pc = copyIn(m, net.cells);
        const pd = copyIn(m, net.delays);
        const pl = copyIn(m, net.luts);
        const pk = copyIn(m, net.connects);
        m._circuit_build(this.c, net.numCells, pc, pd, pl, pk, net.connects.length / 4, net.monoGroups);
        m._free(pc); m._free(pd); m._free(pl); m._free(pk);
        this.numChips = m._circuit_num_chips(this.c);
    }

    dispose(): void {
        if (this.c) { liveCircuits.delete(this.c); this.m._circuit_free(this.c); this.c = 0; }
    }

    /** @internal Called from engine.cpp for a K_JS cell. */
    jsUpdate(chip: number, mask: number): void {
        this.jsCells.get(chip)!(this.proxy(chip) as unknown as Chip, mask);
    }

    /** A stand-in Chip for chip `i`, with the fields custom-cell closures use. */
    proxy(i: number): WasmChipProxy {
        let p = this.proxies.get(i);
        if (!p) { p = new WasmChipProxy(this, i); this.proxies.set(i, p); }
        return p;
    }

    /** seedChipValues() (DigitalGraphBuilder.ts) on chip indices; null entries are skipped. */
    seed(entries: { chip: number | null; value: number }[]): void {
        const n = entries.length;
        if (n === 0) return;
        const pc = copyIn(this.m, Int32Array.from(entries, e => e.chip ?? -1));
        const pv = copyIn(this.m, Int32Array.from(entries, e => e.value));
        this.m._circuit_seed(this.c, n, pc, pv);
        this.m._free(pc); this.m._free(pv);
    }

    queuePush(i: number, delay: number): number { return this.m._circuit_queue_push(this.c, i, delay); }
    requestHalt(): void { this.m._circuit_request_halt(this.c); }
    setInputs(i: number, v: number): void { this.m._chip_set_inputs(this.c, i, v); }
    setOutput(i: number, v: number): void { this.m._chip_set_output(this.c, i, v); }
    setPendingEvent(i: number, v: number): void { this.m._chip_set_pending_event(this.c, i, v); }
    delay(i: number, k: number): number { return this.m._chip_delay(this.c, i, k); }
    /** Sets kind parameter `k` (see netlist.ts's CELL_FIELDS), e.g. a monostable's period. */
    setParam(i: number, k: number, v: number): void { this.m._chip_set_param(this.c, i, k, v); }

    // History - see the same-named Chip methods.
    setHistoryWatched(i: number): void { this.m._chip_set_history_watched(this.c, i); }
    backfillHistory(i: number, now: number): number { return this.m._chip_backfill_history(this.c, i, now); }
    skipBackfillTo(i: number, target: number): void { this.m._chip_skip_backfill_to(this.c, i, target); }
    /** Chip.trimHistory() with the watchers' floor already found; null means no watchers left. */
    trimHistory(i: number, floor: number | null): void {
        this.m._chip_trim_history(this.c, i, floor === null ? 0 : 1, floor ?? 0);
    }
    historyLength(i: number): number { return this.m._chip_history_length(this.c, i); }
    /** Copies chip `i`'s history out as parallel arrays. */
    history(i: number): { times: Float64Array; values: Int32Array } {
        const n = this.historyLength(i);
        const times = new Float64Array(n), values = new Int32Array(n);
        if (n) {
            const p = this.m._chip_history_data(this.c, i);
            const f = this.m.HEAPF64, w = this.m.HEAP32;
            for (let k = 0; k < n; k++) { times[k] = f[(p >> 3) + 2 * k]; values[k] = w[(p >> 2) + 4 * k + 2]; }
        }
        return { times, values };
    }

    get globalTime(): number { return this.m._circuit_global_time(this.c); }
    get haltRequested(): boolean { return this.m._circuit_halt_requested(this.c) !== 0; }
    get eventCount(): number { return this.m._circuit_event_count(this.c); }
    get updateCount(): number { return this.m._circuit_update_count(this.c); }

    /** See Circuit.runWithDeadline(); `deadlineMs` is Date.now()-comparable. */
    runWithDeadline(ticks: number, deadlineMs?: number): number {
        return this.m._circuit_run_with_deadline(this.c, ticks, deadlineMs ?? NaN);
    }
    run(ticks: number): void { this.m._circuit_run(this.c, ticks); }
    drainZeroDelayEvents(): void { this.m._circuit_drain_zero_delay(this.c); }

    output(i: number): number { return this.m._chip_output(this.c, i); }
    state(i: number): number { return this.m._chip_state(this.c, i); }
    inputs(i: number): number { return this.m._chip_inputs(this.c, i); }
    pendingEvent(i: number): number { return this.m._chip_pending_event(this.c, i); }
    cycleTime(i: number): number { return this.m._chip_cycle_time(this.c, i); }
    lastOutputEvent(i: number): number { return this.m._chip_last_output_event(this.c, i); }
    currentValue(i: number): number { return this.m._chip_current_value(this.c, i); }
    numInputs(i: number): number { return this.m._chip_num_inputs(this.c, i); }
    optimizationDisabled(i: number): boolean { return this.m._chip_opt_disabled(this.c, i) !== 0; }
    setOptimizationDisabled(i: number, v: boolean): void { this.m._chip_set_opt_disabled(this.c, i, v ? 1 : 0); }
    setSource(i: number, high: boolean): void { this.m._chip_set_source(this.c, i, high ? 1 : 0); }

    outputLinks(i: number): [number, number][] {
        const n = this.m._chip_num_output_links(this.c, i);
        const r: [number, number][] = [];
        for (let k = 0; k < n; k++) r.push([this.m._chip_output_link_dst(this.c, i, k), this.m._chip_output_link_mask(this.c, i, k)]);
        return r;
    }
    inputLinks(i: number): [number, number][] {
        const n = this.numInputs(i);
        const r: [number, number][] = [];
        for (let k = 0; k < n; k++) r.push([this.m._chip_input_link_src(this.c, i, k), this.m._chip_input_link_mask(this.c, i, k)]);
        return r;
    }

    sramRead(mem: number, address: number): number { return this.m._sram_read(this.c, mem, address); }
    sramWrite(mem: number, address: number, value: number): void { this.m._sram_write(this.c, mem, address, value); }
}

/** What a K_JS cell's closure sees as its Chip: the fields the custom cells in this codebase
 * touch, read and written through to the WASM chip. */
export class WasmChipProxy {
    readonly circuit: { readonly globalTime: number; queuePush(chip: WasmChipProxy, delay: number): number; requestHalt(): void };
    readonly delay: { readonly 0: number; readonly 1: number };

    constructor(private w: WasmCircuit, readonly index: number) {
        this.circuit = {
            get globalTime() { return w.globalTime; },
            queuePush: (chip, delay) => w.queuePush(chip.index, delay),
            requestHalt: () => w.requestHalt(),
        };
        this.delay = { get 0() { return w.delay(index, 0); }, get 1() { return w.delay(index, 1); } };
    }

    get inputs(): number { return this.w.inputs(this.index); }
    set inputs(v: number) { this.w.setInputs(this.index, v); }
    get output(): number { return this.w.output(this.index); }
    set output(v: number) { this.w.setOutput(this.index, v); }
    get pendingEvent(): number { return this.w.pendingEvent(this.index); }
    set pendingEvent(v: number) { this.w.setPendingEvent(this.index, v); }
    get state(): number { return this.w.state(this.index); }
}
