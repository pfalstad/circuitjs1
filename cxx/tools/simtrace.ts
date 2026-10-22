// Reference trace generator: runs a circuit through the TypeScript simulator headless
// and prints node voltages and element currents after every timestep.  The C++ core
// has a matching tool (simtrace) and tools/compare.py diffs the two.
//
// usage: npx tsx tools/simtrace.ts circuit.txt [steps]
//        npx tsx tools/simtrace.ts --dump circuit.txt   (print the circuit as saved XML)

import fs from "node:fs";
import { CircuitElm } from "../../ts/CircuitElm";
import { CircuitNode } from "../../ts/CircuitNode";
import { SimulationManager } from "../../ts/SimulationManager";
import { CirSim } from "../../ts/CirSim";
import { ElementFactory } from "../../ts/ElementFactory";
import { CircuitXMLDeserializer } from "../../ts/CircuitXMLDeserializer";
import { CircuitXMLSerializer } from "../../ts/CircuitXMLSerializer";
import { Scope } from "../../ts/Scope";
import { DiodeModel } from "../../ts/DiodeModel";
import { TransistorModel } from "../../ts/TransistorModel";
import { MosfetModel } from "../../ts/MosfetModel";
import { RelayModel } from "../../ts/RelayModel";
import { CustomLogicModel } from "../../ts/CustomLogicModel";
import { Color } from "../../ts/Color";
import { CircuitLoader } from "../../ts/CircuitLoader";
import { HookRegistry } from "../../ts/HookRegistry";
import { registerElements } from "../../ts/registerElements";
import { DOMParser, XMLSerializer, DOMImplementation } from "@xmldom/xmldom";

// ---- DOM: real XML parsing via xmldom, inert stubs for UI widgets ----

(globalThis as any).DOMParser = DOMParser;
(globalThis as any).XMLSerializer = XMLSerializer;
(globalThis as any).Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };

// ---- fake app: just enough of CirSim for the simulator ----

const off = { getState: () => false, setState: () => {} };
const on = { getState: () => true, setState: () => {} };

// anything else the elements reach for (widgets, sliders, ...) gets an inert stub
function withStubs(o: any): any {
    return new Proxy(o, { get: (t, p) => (p in t) ? t[p] : inert() });
}

// a check item / scrollbar whose state sticks (for the circuit flags that get saved)
function check(state: boolean): any {
    return { state, getState() { return this.state; }, setState(b: boolean) { this.state = b; } };
}
function bar(value: number): any {
    return { value, getValue() { return this.value; }, setValue(v: number) { this.value = v; } };
}

function makeApp(): any {
    const elmList: any[] = [];
    const app: any = {
        elmList, postDrawList: [], badConnectionList: [], adjustables: [],
        showResistanceInVoltageSources: true, dumpMatrix: false, stopMessage: null,
        dcAnalysisFlag: false, simRunning: true, minFrameRate: 10, analyzeFlag: false,
        menus: {
            showValuesCheckItem: check(true), powerCheckItem: check(false), euroResistorCheckItem: off, euroGatesCheckItem: off,
            showOhmCheckItem: off, smallGridCheckItem: check(false), voltsCheckItem: check(true),
            dotsCheckItem: check(false),
        },
        ui: withStubs({ elmList, steps: 0, lastFrameTime: 0, subcircuitStack: [],
                        currentBar: bar(50), powerBar: bar(50), speedBar: bar(117) }),
        hintType: -1, hintItem1: 0, hintItem2: 0, autoDCOnReset: false,
        getElm: (n: number) => n >= 0 && n < elmList.length ? elmList[n] : null,
        locateElm: (e: any) => elmList.indexOf(e),
        mouse: withStubs({ scopePlotRoles: new Set(), highlightedNode: null, dragElm: null,
                           transformX: (x: number) => x, transformY: (y: number) => y }),
        scopeManager: withStubs({ canDelayWireProcessing: () => false, scopeCount: 0, scopes: [],
                                  scopeSelected: -1, scopeMenuIsSelected: () => false,
                                  addScope(sc: any) {
                                      if (sc.position < 0) sc.position = this.scopeCount;
                                      this.scopes[this.scopeCount++] = sc;
                                  } }),
        contextStack: [], adjustables: [],
        random: { nextInt: () => 0, nextDouble: () => 0.5 },
        setStopElm: (_ce: any, msg: string | null) => { app.stopMessage = msg; },
        setSimRunning: (b: boolean) => { app.simRunning = b; },
        simIsRunning: () => app.simRunning,
        getIterCount: () => 1, isPrintable: () => false,
        onTimeStep: () => {}, deleteSliders: () => {},
        // as in UIManager.setGrid()/CirSim.snapGrid()
        gridSize: 16,
        setGrid() { app.gridSize = app.menus.smallGridCheckItem.getState() ? 8 : 16; },
        snapGrid: (x: number) => (x + app.gridSize / 2 - 1) & ~(app.gridSize - 1),
        register: CirSim.prototype.register,
    };
    return withStubs(app);
}

// ---- load ----

function loadCircuit(app: any, sim: SimulationManager, text: string, loadScopes: boolean): void {
    if (!text.startsWith("<")) {
        // old text format: the real loader works with the stub app
        if (!loadScopes)
            app.scopeManager.addScope = () => {};
        new CircuitLoader(app, sim, app.scopeManager, app.menus).readCircuit(text, CircuitLoader.RC_NO_CENTER);
        return;
    }
    const root = new DOMParser().parseFromString(text, "text/xml").documentElement as any;
    const ra = (a: string, d: number) => root.hasAttribute(a) ? parseFloat(root.getAttribute(a)) : d;
    const flags = ra("f", 0);
    const m = app.menus;
    m.dotsCheckItem.setState((flags & 1) != 0);
    m.smallGridCheckItem.setState((flags & 2) != 0);
    m.voltsCheckItem.setState((flags & 4) == 0);
    m.powerCheckItem.setState((flags & 8) == 8);
    m.showValuesCheckItem.setState((flags & 16) == 0);
    app.setGrid();
    app.autoDCOnReset = (flags & 128) != 0;
    app.ui.currentBar.setValue(ra("cb", 50));
    app.ui.powerBar.setValue(ra("pb", 50));
    sim.adjustTimeStep = (flags & 64) !== 0;
    sim.maxTimeStep = sim.timeStep = ra("ts", 5e-6);
    sim.minTimeStep = ra("mts", 50e-12);
    sim.solverType = ra("st", 0);
    CircuitElm.voltageRange = ra("vr", 5);

    // the real deserializer does the per-element work; we skip scopes, sliders, tests, etc.
    const xml = new CircuitXMLDeserializer(app);
    for (let i = 0; i < root.childNodes.length; i++) {
        const elem = root.childNodes[i];
        if (elem.nodeType !== 1)
            continue;
        xml.currentXmlElement = elem;
        if (elem.tagName === "dm") { DiodeModel.undumpModelXml(xml); continue; }
        if (elem.tagName === "tm") { TransistorModel.undumpModelXml(xml); continue; }
        if (elem.tagName === "mm") { MosfetModel.undumpModelXml(xml); continue; }
        if (elem.tagName === "rlm") { RelayModel.undumpModelXml(xml); continue; }
        if (elem.tagName === "clm") { CustomLogicModel.undumpModelXml(xml); continue; }
        if (elem.tagName === "ccm") { HookRegistry.undumpSubcircuitModel?.(xml); continue; }
        if (elem.tagName === "o") {
            if (loadScopes) {
                const sc = new Scope(app, sim);
                sc.undumpXml(xml);
                if (sc.position < 0) sc.position = app.scopeManager.scopeCount;
                app.scopeManager.scopes[app.scopeManager.scopeCount++] = sc;
            }
            continue;
        }
        if (elem.tagName === "adj") { Adjustable.undumpXml(xml, app); continue; }
        if (elem.tagName === "h") {
            app.hintType = xml.parseIntAttr("t", -1);
            app.hintItem1 = xml.parseIntAttr("i1", 0);
            app.hintItem2 = xml.parseIntAttr("i2", 0);
            continue;
        }
        if (elem.getAttribute("x") == null)
            continue;
        const className = CirSim.xmlDumpTypeMap.get(elem.tagName);
        if (className == null) {
            console.error("unrecognized xml element: " + elem.tagName);
            continue;
        }
        const elm = ElementFactory.create(className, 0, 0);
        xml.currentElm = elm;
        elm.undumpXml(xml);
        elm.setPositionFromXml(elem);
        app.elmList.push(elm);
    }
    // as in CircuitLoader.finishReadCircuit()
    for (let i = 0; i < app.adjustables.length; i++)
        if (!app.adjustables[i].createSlider(app))
            app.adjustables.splice(i--, 1);
}

// a few elements build DOM widgets in their constructors; give them something inert
function inert(): any {
    const f: any = () => inert();
    return new Proxy(f, {
        get: (_t, p) => p === Symbol.toPrimitive ? () => "" : inert(),
        set: () => true,
        apply: () => inert(),
        construct: () => inert(),
    });
}
// XML documents are real (subcircuit models are built in them); HTML widgets are not
(globalThis as any).document = new Proxy({ implementation: new DOMImplementation() } as any,
    { get: (t, p) => (p in t) ? t[p] : inert() });
(globalThis as any).window = globalThis;

// ---- main ----

// simulator chatter goes to stderr; stdout is just the trace
const out = (s: string) => process.stdout.write(s + "\n");
console.log = (...a: any[]) => process.stderr.write(a.join(" ") + "\n");

const dump = process.argv[2] === "--dump";
const argv = dump ? process.argv.slice(1) : process.argv;
const file = argv[2];
const steps = parseInt(argv[3] ?? "1000");

// Adjustable sets window.Adjustable when it loads (CircuitLoader finds it there), so it
// has to be imported after the fake window exists
const { Adjustable } = await import("../../ts/Adjustable");
const { UIManager } = await import("../../ts/UIManager");

const app = makeApp();
// routed wires route around the displayed elements (UIManager.theUI.elmList)
app.ui.getCircuitBounds = UIManager.prototype.getCircuitBounds;
UIManager.theUI = app.ui;
const sim = new SimulationManager(app);
app.sim = sim;
CircuitElm.app = app;
CircuitElm.sim = sim;
CircuitElm.initClass(app, sim);
CirSim.theApp = app;
CircuitElm.positiveColor ??= Color.green;
registerElements();

loadCircuit(app, sim, fs.readFileSync(file, "utf8"), dump);

if (dump) {
    // the same as CirSim.dumpCircuit()
    for (const M of [CustomLogicModel, DiodeModel, TransistorModel, RelayModel, MosfetModel])
        (M as any).clearDumpedFlags();
    HookRegistry.clearSubcircuitModelDumpedFlags?.();
    process.stdout.write(new CircuitXMLSerializer(app).dumpCircuit());
    process.exit(0);
}

// freeze the clock: with no time passing, each runCircuit(true) call does exactly one timestep
Date.now = () => 1e12;
sim.lastIterTime = 1;

// SOLVER=n overrides the circuit's matrix solver (0=auto, 1=dense, 2=sparse)
if (process.env.SOLVER)
    sim.solverType = parseInt(process.env.SOLVER);

sim.analyzeCircuit();
sim.preStampAndStampCircuit();

const fmt = (x: number) => x.toPrecision(17);
const dumpStep = parseInt(process.env.DUMPMATRIX ?? "-1");
// TOGGLE=elm:step,... toggles switches, as clicking them in the app does
const toggles = (process.env.TOGGLE ?? "").split(",").filter(t => t.includes(":")).map(t => t.split(":").map(Number));
for (let s = 0; s < steps; s++) {
    if (s === dumpStep) app.dumpMatrix = true;
    let toggled = false;
    for (const [e, ts] of toggles)
        if (ts === s && app.elmList[e]?.toggle) {
            app.elmList[e].toggle();
            toggled = true;
        }
    if (toggled) {
        // what the app's next frame does after needAnalyze()
        sim.analyzeCircuit();
        if (sim.needsStamp)
            sim.preStampAndStampCircuit();
    }
    try {
        sim.runCircuit(true);
    } catch (e) {
        // stop() nulls out the matrices on purpose, which throws; the app catches it too
        if (app.stopMessage == null)
            throw e;
    }
    if (app.stopMessage != null) {
        out("stop " + app.stopMessage);
        break;
    }
    const vs = sim.nodeList.map(n => fmt(n.v));
    const cs = sim.elmList.map((e: any) => fmt(e.getCurrent()));
    out(fmt(sim.t) + " " + vs.join(" ") + " | " + cs.join(" "));
}

// AUDIOOUT=file: press Play on the first audio output and save the WAV it would play
if (process.env.AUDIOOUT) {
    let wav: ArrayBuffer | null = null;
    (globalThis as any).Blob = class { constructor(parts: any[]) { wav = parts[0]; } };
    (globalThis as any).URL.createObjectURL = () => "blob:";
    const ao = app.elmList.find((e: any) => e.isAudioOutputElm && e.isAudioOutputElm());
    if (ao) ao.play();
    if (wav) fs.writeFileSync(process.env.AUDIOOUT, Buffer.from(wav));
}
