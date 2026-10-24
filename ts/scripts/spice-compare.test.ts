/// <reference types="node" />
// Compares a circuit's SPICE export against the simulator.  It loads a circuit file, runs
// the simulator on it headlessly, exports it and runs the netlist in ngspice, and reports
// each net whose voltage differs between the two:
//
//   CIRCUIT=../tests/custom.txt npx vitest run spice-compare
//
// CIRCUIT is the circuit file, text or XML.  STOP is how long to simulate (4000 time steps by default), RESET=0
// starts from the state the file was saved in instead of from reset, and OUT is where to
// write the netlist and both sets of voltages (the system's temporary directory by default).
// it needs ngspice, and skips itself without CIRCUIT.

import { it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { basename, join } from "path";
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
import { exportSpiceNetlist } from "../SpiceExporter";

const FILE = process.env.CIRCUIT ?? "";
const OUT = process.env.OUT ?? join(tmpdir(), "spice-compare-" + basename(FILE).replace(/\.\w+$/, ""));
const SAMPLES = 200;

// stands in for anything (the DOM, UI widgets) the elements touch while being built
const stub: any = new Proxy(function () {}, {
    get: (_t, k) => k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : stub,
    apply: () => stub, construct: () => stub, set: () => true,
});

// just enough of the app for the simulator to run
function makeApp(): any {
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
        snapGrid: (z: number) => Math.round(z / 8) * 8,
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
function loadCircuit(text: string, app: any): number {
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
function interpolate(data: number[][], j: number, t: number): number {
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

it.skipIf(!FILE)("matches the simulator", () => {
    vi.useFakeTimers();
    const app = makeApp(), sim = app.sim;
    const timeStep = loadCircuit(readFileSync(FILE, "utf8"), app);
    const STOP = process.env.STOP ? parseFloat(process.env.STOP) : 4000 * timeStep;
    sim.maxTimeStep = sim.timeStep = timeStep;
    if (process.env.RESET !== "0")
        for (const ce of app.elmList)
            ce.reset();
    sim.analyzeCircuit();
    sim.preStampAndStampCircuit();
    if (app.stopMessage)
        throw new Error(app.stopMessage);

    const res = exportSpiceNetlist(app.elmList, { timeStep, stopTime: STOP });
    // each net, with a post on it to read the simulator's voltage from, and what's on it
    const probes = new Map<string, [any, number]>(), who = new Map<string, string[]>();
    for (const [ce, nets] of res.postNets)
        nets.forEach((n, j) => {
            const e = ce as any;
            if (n !== "0" && !probes.has(n) && e.nodes?.[j])
                probes.set(n, [e, j]);
            const pin = e.pins?.[j] ? ":" + (e.pins[j].text || "clk") : ":" + j;
            who.set(n, [...(who.get(n) ?? []), `${ce.getClassName().replace(/Elm$/, "")}@${e.x},${e.y}${pin}`]);
        });
    // (a net only a left-out part is on isn't in the netlist)
    const used = new Set(res.text.split("\n").filter(l => /^[A-Z]/.test(l)).flatMap(l => l.split(/[\s(),]+/)));
    const nets = [...probes.keys()].filter(n => used.has(n));

    // the simulator's voltages, after the first time step past each sample time
    const rows: number[][] = [];
    app.onTimeStep = () => {
        while (rows.length < SAMPLES && sim.t >= (rows.length + 0.5) * STOP / SAMPLES - 1e-12)
            rows.push([sim.t, ...nets.map(n => { const [e, j] = probes.get(n)!; return e.nodes[j].v; })]);
    };
    // runCircuit() runs for as long as the clock says it should, so move it on
    let now = 1e6;
    vi.setSystemTime(now);
    sim.lastIterTime = 0;
    sim.runCircuit(true);
    for (let stuck = 0; rows.length < SAMPLES; ) {
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
    vi.useRealTimers();

    // (without the .print line, whose table would only fill ngspice's output)
    const cir = res.text.replace(/^\.print .*\n(\+ .*\n)*/m, "").replace(/\n\.end\n$/,
        `\n.control\nrun\nwrdata ${OUT}.spice ${nets.map(n => `v(${n})`).join(" ")}\n.endc\n.end\n`);
    writeFileSync(OUT + ".cir", cir);
    writeFileSync(OUT + ".sim", rows.map(r => r.join(" ")).join("\n") + "\n");
    execFileSync("ngspice", ["-b", OUT + ".cir"], { stdio: ["ignore", "pipe", "pipe"] });
    // wrdata writes a time and a voltage for each net
    const data = readFileSync(OUT + ".spice", "utf8").split("\n").filter(l => l.trim())
        .map(l => l.trim().split(/\s+/).map(Number));

    // a net differs at a sample if SPICE is more than half a volt off at its time, and half a
    // time step either side of it (the simulator only places an edge to the nearest step)
    const report: string[] = [];
    nets.forEach((n, j) => {
        const bad = rows.filter(r => [-1, 0, 1].every(d => Math.abs(r[j + 1] - interpolate(data, j, r[0] + d * timeStep / 2)) > .5));
        if (bad.length === 0)
            return;
        const [t, v] = [bad[0][0], bad[0][j + 1]];
        report.push(`${n} [${who.get(n)!.join(" ")}]: ${bad.length} of ${SAMPLES} samples, first at t=${t.toPrecision(4)}: ` +
                    `simulator ${v.toPrecision(3)}V, SPICE ${interpolate(data, j, t).toPrecision(3)}V`);
    });
    const summary = `${FILE}: ${nets.length} nets, ${report.length} differ` +
                    (res.warnings.length ? `; left out of the export: ${[...new Set(res.warnings)].join(", ")}` : "") +
                    `\nnetlist and voltages in ${OUT}.*`;
    expect(report, summary + "\n" + report.join("\n")).toEqual([]);
});
