import { describe, it, expect } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { SimulationManager } from "./SimulationManager";
import { ControlledCurrentElm } from "./ControlledCurrentElm";
import { LabeledNodeElm } from "./LabeledNodeElm";
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

// analyze, stamp, and run one sub-iteration the way runCircuit does
function analyzeAndStep(elms: any[]) {
    const app = makeApp(elms);
    (CircuitElm as any).app = app;
    const sim = new SimulationManager(app as any);
    (CircuitElm as any).sim = sim;
    sim.analyzeCircuit();
    sim.preStampCircuit(false);
    sim.stampCircuit();
    for (const m of sim.matrices!) {
        for (let i = 0; i < m.size; i++) m.rightSide[i] = m.origRightSide[i];
        if (m.nonLinear)
            for (let i = 0; i < m.size; i++)
                for (let j = 0; j < m.size; j++) m.matrix[i][j] = m.origMatrix[i][j];
    }
    (sim as any).converged = true;
    for (const e of elms) e.doStep();
    // snapshot before factoring: lu_factor overwrites the matrix in place
    const stamped = sim.matrices!.map(m => m.matrix.map((row: number[]) => row.slice()));
    let factored = true;
    for (const m of sim.matrices!)
        if (!(SimulationManager as any).lu_factor(m.matrix, m.size, m.permute, m)) factored = false;
    return { sim, app, factored, stamped };
}

// a +5V rail carrying the label "vcc", in its own corner of the circuit
function railWithLabel(v: number): any[] {
    const rail: any = place(new RailElm(0, 0), 0, 0, 0, -32);
    rail.waveform = 0;
    rail.maxVoltage = v;
    const label: any = place(new LabeledNodeElm(0, 0), 0, 0, 32, 0);
    label.text = "vcc";
    return [rail, label];
}

// a controlled current source driving a resistor, optionally with its own ground
function ccsLoop(exprStr: string, grounded: boolean): any[] {
    const ccs: any = place(new ControlledCurrentElm(0, 0), 100, 0, 100, 64);
    ccs.setExpr(exprStr);
    const out: any[] = [ccs, place(new ResistorElm(0, 0), 100, 0, 100, 64)];
    if (grounded)
        out.push(place(new GroundElm(0, 0), 100, 64, 100, 96));
    return out;
}

describe("controlled current source referring to a labeled node", () => {
    it("pulls the referenced node into its own matrix", () => {
        const elms = [...railWithLabel(5), ...ccsLoop("v(vcc)", true)];
        const { sim } = analyzeAndStep(elms);
        // one matrix: referring to vcc merged the rail's closure with the source's
        expect(sim.matrices!.length).toBe(1);
    });

    it("leaves the referenced node in a separate matrix when nothing refers to it", () => {
        const elms = [...railWithLabel(5), ...ccsLoop("3", true)];
        const { sim } = analyzeAndStep(elms);
        expect(sim.matrices!.length).toBe(2);
    });

    it("stamps the derivative in the referenced node's column", () => {
        const elms = [...railWithLabel(5), ...ccsLoop("2*v(vcc)", true)];
        const { sim, stamped } = analyzeAndStep(elms);
        const ccs: any = elms[2];
        expect(sim.matrices!.length).toBe(1);
        const outRow = ccs.nodes[0].row - 1;   // the source's ungrounded terminal
        const refCol = ccs.nodes[2].row - 1;   // the node v(vcc) resolved to
        expect(ccs.nodes[2].index).not.toBe(0);
        // d(output current)/d(v(vcc)) is 2
        expect(stamped[0][outRow][refCol]).toBeCloseTo(2, 9);
    });

    // referring to a node by name is not a galvanic connection.  if the ground-connectivity
    // pass walks the reference, an ungrounded island looks grounded, never gets its 1e8
    // resistor to ground, and the matrix comes out singular ("didn't avoid zero").
    it("does not treat a reference as a path to ground", () => {
        const elms = [...railWithLabel(5), ...ccsLoop("v(vcc)", false)];
        const { sim, factored } = analyzeAndStep(elms);
        const ccs: any = elms[2];
        expect((sim as any).unconnectedNodes).toContain(ccs.nodes[0].index);
        expect(factored, "matrix should not be singular").toBe(true);
    });

    it("still solves when the reference resolves to ground", () => {
        const rail: any = place(new RailElm(0, 0), 0, 0, 0, -32);
        rail.waveform = 0;
        rail.maxVoltage = 0;
        const label: any = place(new LabeledNodeElm(0, 0), 200, 0, 232, 0);
        label.text = "vcc";
        const elms = [place(new GroundElm(0, 0), 200, 0, 200, 32), label, ...ccsLoop("v(vcc)", true)];
        const { factored } = analyzeAndStep(elms);
        expect(factored).toBe(true);
    });
});
