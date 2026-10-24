import { describe, it, expect } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { SimulationManager } from "./SimulationManager";
import { TimeDelayRelayElm } from "./TimeDelayRelayElm";
import { ResistorElm } from "./ResistorElm";
import { GroundElm } from "./GroundElm";
import { RailElm } from "./RailElm";

const off = { getState: () => false };

function makeApp(elmList: any[]): any {
    const app: any = {
        elmList, postDrawList: [], badConnectionList: [],
        showResistanceInVoltageSources: true, dumpMatrix: false, stopMessage: null,
        dcAnalysisFlag: false, simRunning: true, minFrameRate: 10,
        menus: {
            showValuesCheckItem: off, powerCheckItem: off, euroResistorCheckItem: off,
            showOhmCheckItem: off, smallGridCheckItem: off,
        },
        ui: { elmList, steps: 0, lastFrameTime: 0 },
        scopeManager: { canDelayWireProcessing: () => false },
        setStopElm: () => {}, getIterCount: () => 1, isPrintable: () => false,
        onTimeStep: () => {},
        stop: (s: string) => { app.stopMessage = s; },
    };
    return app;
}

function place(e: any, x1: number, y1: number, x2: number, y2: number) {
    e.x = x1; e.y = y1; e.x2 = x2; e.y2 = y2;
    e.setPoints();
    return e;
}

export interface Rig {
    sim: SimulationManager; app: any; elms: any[];
    relay: TimeDelayRelayElm; coil: RailElm; outNode: () => number;
    setCoil: (v: number) => void; step: () => void; run: (until: number) => void;
}

// coil: rail -> Vin, gnd pin -> ground.  contact: 10V rail -> in, out -> 1k -> ground.
export function buildRig(onDelay: number, offDelay: number, dt = 1e-3): Rig {
    const elms: any[] = [];
    const app = makeApp(elms);
    (CircuitElm as any).app = app;
    const relay: any = new TimeDelayRelayElm(0, 0);
    place(relay, 100, 100, 100 + relay.sizeX * relay.cspc2, 100);
    const [vin, gnd, cin, cout] = relay.pins.map((p: any) => p.post);
    const coil: any = place(new RailElm(0, 0), vin.x, vin.y, vin.x - 32, vin.y);
    coil.waveform = 0; coil.maxVoltage = 0;
    const g1 = place(new GroundElm(0, 0), gnd.x, gnd.y, gnd.x + 32, gnd.y);
    const src: any = place(new RailElm(0, 0), cin.x, cin.y, cin.x - 32, cin.y);
    src.waveform = 0; src.maxVoltage = 10;
    const load = place(new ResistorElm(0, 0), cout.x, cout.y, cout.x + 64, cout.y);
    (load as any).resistance = 1000;
    const g2 = place(new GroundElm(0, 0), cout.x + 64, cout.y, cout.x + 96, cout.y);
    elms.push(relay, coil, g1, src, load, g2);
    const sim = new SimulationManager(app as any);
    (CircuitElm as any).sim = sim;
    sim.maxTimeStep = dt; sim.minTimeStep = dt / 1024; sim.adjustTimeStep = false;
    sim.resetTime();
    for (const e of elms) e.reset();
    sim.analyzeCircuit();
    sim.preStampCircuit(false);
    sim.stampCircuit();
    const s: any = sim;

    const step = () => {
        for (const e of elms) e.startIteration();
        let subiter: number;
        for (subiter = 0; subiter < 5000; subiter++) {
            s.converged = true;
            for (const m of sim.matrices!) {
                for (let i = 0; i < m.size; i++) m.rightSide[i] = m.origRightSide[i];
                if (m.nonLinear)
                    for (let i = 0; i < m.size; i++)
                        for (let j = 0; j < m.size; j++) m.matrix[i][j] = m.origMatrix[i][j];
            }
            for (const e of elms) e.doStep();
            if (app.stopMessage) throw new Error(app.stopMessage);
            for (const m of sim.matrices!) {
                if (m.nonLinear) {
                    if (s.converged && subiter > 0) continue;
                    if (!(SimulationManager as any).lu_factor(m.matrix, m.size, m.permute, m))
                        throw new Error("singular");
                }
                (SimulationManager as any).lu_solve(m.matrix, m.size, m.permute, m.rightSide, m);
                s.applySolvedRightSide(m);
            }
            if (!s.circuitNonLinear) break;
            if (s.converged && subiter > 0) break;
        }
        if (subiter === 5000) throw new Error("convergence failed at t=" + sim.t);
        sim.t += sim.timeStep;
        for (const e of elms) e.stepFinished();
    };
    const run = (until: number) => { while (sim.t < until - 1e-12) step(); };
    const setCoil = (v: number) => { coil.maxVoltage = v; sim.stampCircuit(); };
    relay.onDelay = onDelay; relay.offDelay = offDelay;
    return { sim, app, elms, relay, coil, outNode: () => relay.nodes[3].v, setCoil, step, run };
}

const closed = (r: Rig) => r.outNode() > 9;   // 1 ohm vs 1k: ~9.99V closed, ~1mV open

// find first time the contact state equals `want`, stepping until `until`
function firstTime(r: Rig, want: boolean, until: number): number | null {
    while (r.sim.t < until) { r.step(); if (closed(r) === want) return r.sim.t; }
    return null;
}

describe("time delay relay characterization", () => {
    it("on-delay: coil powered at t=0, contact closes after onDelay", () => {
        const r = buildRig(1, 0);
        r.setCoil(24);
        expect(closed(r)).toBe(false);
        const tClose = firstTime(r, true, 5);
        expect(tClose).not.toBeNull();
        expect(tClose!).toBeGreaterThan(0.99);
        expect(tClose!).toBeLessThan(1.01);
    });

    it("on-delay: coil dropped after close, contact opens with offDelay=0", () => {
        const r = buildRig(1, 0);
        r.setCoil(24); r.run(2);
        expect(closed(r)).toBe(true);
        r.setCoil(0);
        const tOpen = firstTime(r, false, 5);
        expect(tOpen!).toBeLessThan(2.01);
    });

    it("on-delay: pulse shorter than onDelay never closes", () => {
        const r = buildRig(1, 0);
        r.setCoil(24); r.run(0.5); r.setCoil(0);
        expect(firstTime(r, true, 5)).toBeNull();
    });

    it("on-delay: retrigger restarts the timer", () => {
        const r = buildRig(1, 0);
        r.setCoil(24); r.run(0.5); r.setCoil(0); r.run(0.6); r.setCoil(24);
        const tClose = firstTime(r, true, 5);
        expect(tClose!).toBeGreaterThan(1.59);
        expect(tClose!).toBeLessThan(1.61);
    });

    it("off-delay: closes immediately, holds offDelay after coil drops", () => {
        const r = buildRig(0, 1);
        r.setCoil(24);
        const tClose = firstTime(r, true, 1);
        expect(tClose!).toBeLessThan(0.01);
        r.run(2); r.setCoil(0);
        const tOpen = firstTime(r, false, 5);
        expect(tOpen!).toBeGreaterThan(2.99);
        expect(tOpen!).toBeLessThan(3.01);
    });

    it("off-delay: re-energizing during hold keeps contact closed", () => {
        const r = buildRig(0, 1);
        r.setCoil(24); r.run(2); r.setCoil(0); r.run(2.5); r.setCoil(24);
        expect(firstTime(r, false, 6)).toBeNull();
    });

    it("both delays: on 1s off 1s", () => {
        const r = buildRig(1, 1);
        r.setCoil(24);
        const tClose = firstTime(r, true, 5);
        r.setCoil(0);
        const tOpen = firstTime(r, false, 10);
        expect(tClose!).toBeCloseTo(1, 2);
        expect(tOpen! - tClose!).toBeCloseTo(1, 2);
    });

    it("coil below 2.5V threshold does nothing", () => {
        const r = buildRig(0.1, 0);
        r.setCoil(2.4);
        expect(firstTime(r, true, 1)).toBeNull();
    });
});
