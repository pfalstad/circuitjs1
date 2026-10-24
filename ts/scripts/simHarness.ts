/// <reference types="node" />
// What the comparison tools (spice-compare, kicad-compare) share: loading a circuit file
// headlessly, as the app would, and running the simulator on it

import { vi } from "vitest";
import { CircuitElm } from "../CircuitElm";
import { CirSim } from "../CirSim";
import { SimulationManager } from "../SimulationManager";
import { StringTokenizer } from "../StringTokenizer";
import { CustomLogicModel } from "../CustomLogicModel";
import { DiodeModel } from "../DiodeModel";
import { TransistorModel } from "../TransistorModel";
import { SubcircuitModel } from "../SubcircuitModel";
import { MosfetModel } from "../MosfetModel";
import { RelayModel } from "../RelayModel";
import { CircuitXMLDeserializer } from "../CircuitXMLDeserializer";
import { installMiniDom, miniImplementation } from "./minidom";
import { registerElements } from "../registerElements";
import { ElementFactory } from "../ElementFactory";

// stands in for anything (the DOM, UI widgets) the elements touch while being built
const stub: any = new Proxy(function () {}, {
    get: (_t, k) => k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : stub,
    apply: () => stub, construct: () => stub, set: () => true,
});

// just enough of the app for the simulator to run
export function makeApp(): any {
    const off = { getState: () => false };
    const elmList: any[] = [];
    const app: any = {
        elmList, postDrawList: [], badConnectionList: [], adjustables: [],
        showResistanceInVoltageSources: true, dumpMatrix: false, stopMessage: null,
        dcAnalysisFlag: false, simRunning: true, minFrameRate: 10,
        menus: new Proxy({}, { get: () => off }),
        ui: { elmList, steps: 0, lastFrameTime: 0 },
        scopeManager: { canDelayWireProcessing: () => false },
        setStopElm: () => {}, getIterCount: () => 1e4, isPrintable: () => false,
        onTimeStep: () => {}, register: (CirSim.prototype as any).register,
        gridSize: 8, snapGrid: (z: number) => Math.round(z / 8) * 8,
        stop: (s: string) => { app.stopMessage = s; },
        addWidgetToVerticalPanel: () => {}, removeWidgetFromVerticalPanel: () => {}, mouse: {},
        deleteSliders: () => {}, getrand: (x: number) => Math.floor(Math.random() * x),
        random: { nextDouble: () => Math.random() }, setSimRunning: () => {},
    };
    // the stub, but with the XML documents that models and XML circuits need
    installMiniDom();
    (globalThis as any).document = new Proxy(stub, {
        get: (t, k) => k === "implementation" ? miniImplementation : t[k],
    });
    (CircuitElm as any).app = app;
    (CirSim as any).theApp = app;
    app.sim = (CircuitElm as any).sim = new SimulationManager(app);
    // registerElements() registers every class, then builds one of each for its dump type,
    // which some can't do without a browser.  so build them here, leaving out those that fail
    try { registerElements(); } catch {}
    for (const [name, ctor] of (ElementFactory as any).classMap as Map<string, any>)
        try { app.register(name, new ctor(0, 0)); } catch {}
    return app;
}

// the circuit's elements and time step, from an XML circuit file.  this is the app's
// CircuitXMLDeserializer.readElements(), without what needs a browser: scopes, in the scope
// area or in the circuit, and the UI's settings
function loadXmlCircuit(text: string, app: any): number {
    const root = new DOMParser().parseFromString(text, "text/xml").documentElement;
    const xml = new CircuitXMLDeserializer(app);
    xml.parseChildElement(root);
    const timeStep = xml.parseDoubleAttr("ts", 5e-6);
    const models: Record<string, (x: CircuitXMLDeserializer) => unknown> = {
        dm: x => DiodeModel.undumpModelXml(x), tm: x => TransistorModel.undumpModelXml(x),
        mm: x => MosfetModel.undumpModelXml(x), rlm: x => RelayModel.undumpModelXml(x),
        clm: x => CustomLogicModel.undumpModelXml(x), ccm: x => SubcircuitModel.undumpModelXml(x),
    };
    for (const elem of [...root.children]) {
        const tag = elem.tagName;
        xml.parseChildElement(elem);
        if (models[tag]) {
            models[tag](xml);
            continue;
        }
        const className = CirSim.xmlDumpTypeMap.get(tag);
        if (elem.getAttribute("x") == null || tag === "Scope")
            continue;
        if (className == null)
            throw new Error("unknown element type " + tag);
        const ce = CirSim.constructElement(className, 0, 0);
        xml.parseChildElement(elem);
        (xml as any).currentElm = ce;
        ce.undumpXml(xml);
        ce.setPositionFromXml(elem);
        app.elmList.push(ce);
    }
    return timeStep;
}

// the circuit's elements and time step, from a circuit file
export function loadCircuit(text: string, app: any): number {
    if (text.trimStart().startsWith("<"))
        return loadXmlCircuit(text, app);
    let timeStep = 5e-6;
    for (const line of text.split(/\r?\n/)) {
        if (!line)
            continue;
        const st = new StringTokenizer(line, " +\t\n\r\f");
        const type = st.nextToken();
        if (type === "$") {
            st.nextToken();
            timeStep = parseFloat(st.nextToken());
            continue;
        }
        if (type === "!") {
            CustomLogicModel.undumpModel(st);
            continue;
        }
        // diode, transistor and subcircuit models, as the app reads them
        if (type === "34") {
            DiodeModel.undumpModel(st);
            continue;
        }
        if (type === "32") {
            TransistorModel.undumpModel(st);
            continue;
        }
        if (type === ".") {
            SubcircuitModel.undumpModel(st);
            continue;
        }
        // scopes (in the scope area and in the circuit, which can't be built without a
        // browser and aren't exported), hints, sliders and filter settings
        if ("o h % ? B & 38 403".split(" ").includes(type) || !(/^\d+$/.test(type) || type.length === 1))
            continue;
        const tint = /^\d+$/.test(type) ? parseInt(type) : type.charCodeAt(0);
        const [x1, y1, x2, y2, f] = [0, 0, 0, 0, 0].map(() => parseInt(st.nextToken()));
        const ce = CirSim.createCe(tint, x1, y1, x2, y2, f, st);
        if (!ce)
            throw new Error("unknown element type " + type);
        ce.setPoints();
        app.elmList.push(ce);
    }
    return timeStep;
}

// ngspice's voltage on a net at time t, between its time points
export function interpolate(data: number[][], j: number, t: number): number {
    let lo = 0, hi = data.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (data[mid][0] < t)
            lo = mid;
        else
            hi = mid;
    }
    const a = data[lo], b = data[hi];
    const f = b[0] === a[0] ? 0 : Math.min(Math.max((t - a[0]) / (b[0] - a[0]), 0), 1);
    return a[2 * j + 1] + f * (b[2 * j + 1] - a[2 * j + 1]);
}


// get the simulator ready to run the loaded circuit, from reset unless RESET=0 (from the
// state the file was saved in)
export function startSimulator(app: any, timeStep: number): void {
    const sim = app.sim;
    sim.maxTimeStep = sim.timeStep = timeStep;
    if (process.env.RESET !== "0")
        for (const ce of app.elmList)
            ce.reset();
    sim.analyzeCircuit();
    sim.preStampAndStampCircuit();
    if (app.stopMessage)
        throw new Error(app.stopMessage);
}

// run the simulator until stop, with what read() gives after the first time step past each
// of the sample times.  needs fake timers
export function runSimulator(app: any, stop: number, samples: number, read: () => number[]): number[][] {
    const sim = app.sim;
    const rows: number[][] = [];
    app.onTimeStep = () => {
        while (rows.length < samples && sim.t >= (rows.length + 0.5) * stop / samples - 1e-12)
            rows.push([sim.t, ...read()]);
    };
    // runCircuit() runs for as long as the clock says it should, so move it on
    let now = 1e6;
    vi.setSystemTime(now);
    sim.lastIterTime = 0;
    sim.runCircuit(true);
    for (let stuck = 0; rows.length < samples; ) {
        const t = sim.t;
        vi.setSystemTime(++now);
        app.ui.lastFrameTime = now;
        sim.runCircuit(false);
        if (app.stopMessage)
            throw new Error(app.stopMessage);
        stuck = sim.t > t ? 0 : stuck + 1;
        if (stuck === 1000)
            throw new Error(`the simulator stopped at t=${sim.t} (timeStep ${sim.timeStep})`);
    }
    return rows;
}

// ngspice's wrdata output: a time and a value for each vector, on each line
export function readWrdata(text: string): number[][] {
    return text.split("\n").filter(l => l.trim()).map(l => l.trim().split(/\s+/).map(Number));
}

// the nets whose voltages differ: SPICE more than half a volt off at a sample's time, and
// half a time step either side of it (the simulator only places an edge to the nearest step)
export function differences(nets: string[], who: (n: string) => string, rows: number[][], data: number[][],
                            timeStep: number): string[] {
    const report: string[] = [];
    nets.forEach((n, j) => {
        const bad = rows.filter(r => [-1, 0, 1].every(d => Math.abs(r[j + 1] - interpolate(data, j, r[0] + d * timeStep / 2)) > .5));
        if (bad.length === 0)
            return;
        const [t, v] = [bad[0][0], bad[0][j + 1]];
        report.push(`${n} [${who(n)}]: ${bad.length} of ${rows.length} samples, first at t=${t.toPrecision(4)}: ` +
                    `simulator ${v.toPrecision(3)}V, SPICE ${interpolate(data, j, t).toPrecision(3)}V`);
    });
    return report;
}
