// JS side of the WASM digital engine (wasm/engine.cpp). Loads the module once, and wraps one
// built circuit in WasmCircuit, which mirrors the parts of circuit.ts's Circuit the app drives.

import { CELL_FIELDS, type FlatNetlist } from "./netlist";

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

    /** Builds `net`. loadWasmEngine() must have finished. */
    constructor(net: FlatNetlist) {
        if (!engine) throw new Error("WASM digital engine not loaded");
        const m = this.m = engine;
        this.c = m._circuit_new();

        for (const s of net.srams) {
            const p = copyIn(m, Int32Array.from(s.words));
            m._circuit_add_sram(this.c, s.addrBits, p);
            m._free(p);
        }

        if (net.cells.length !== net.numCells * CELL_FIELDS) throw new Error("bad netlist");
        const pc = copyIn(m, net.cells);
        const pd = copyIn(m, net.delays);
        const pl = copyIn(m, net.luts);
        const pk = copyIn(m, net.connects);
        m._circuit_build(this.c, net.numCells, pc, pd, pl, pk, net.connects.length / 4, net.monoGroups);
        m._free(pc); m._free(pd); m._free(pl); m._free(pk);
        this.numChips = m._circuit_num_chips(this.c);
    }

    dispose(): void {
        if (this.c) { this.m._circuit_free(this.c); this.c = 0; }
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
