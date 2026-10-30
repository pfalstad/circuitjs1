/// <reference types="node" />
// Just enough of the app for elements to be built and simulated under Node, without a
// browser.  Shared by the comparison tools (via simHarness) and generateRegistrations.ts,
// which runs under tsx rather than vitest

import { CircuitElm } from "../CircuitElm";
import { CirSim } from "../CirSim";
import { SimulationManager } from "../SimulationManager";
import { installMiniDom, miniImplementation } from "./minidom";

// stands in for anything (the DOM, UI widgets) the elements touch while being built
export const stub: any = new Proxy(function () {}, {
    get: (_t, k) => k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : stub,
    apply: () => stub, construct: () => stub, set: () => true,
});

// the app, with no elements registered
export function makeHeadlessApp(): any {
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
        registerLazy: (CirSim.prototype as any).registerLazy,
        registerDumpTypes: (CirSim.prototype as any).registerDumpTypes,
        gridSize: 8, snapGrid: (z: number) => Math.round(z / 8) * 8,
        stop: (s: string) => { app.stopMessage = s; },
        addWidgetToVerticalPanel: () => {}, removeWidgetFromVerticalPanel: () => {}, mouse: stub,
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
    return app;
}
