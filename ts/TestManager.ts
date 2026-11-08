// Automated regression tests, ported from the Java TestManager.
//
// A test is a circuit file with a <test len="..."/> tag, the switch toggles to replay
// (<switchevent t="..." en="..."/>) and the scope data to expect (<scopedata ...>).
// Run one with ?test=<file> or a list of them with ?testlist=<file> (one file name per
// line, relative to the list).  Files are found relative to ?testbase=, by default
// auto-tests/ in the dev server and `vite preview` (see vite.config.ts), otherwise
// http://127.0.0.1:5001/auto-tests/ (test-interface/test_server.py).
//
// With ?testui=1, the panel gets Start/Stop/Cancel Test buttons for
// recording a test: Start resets the circuit and starts recording switch toggles, Stop
// downloads the circuit with the test tags added.
//
// ?headless=1 skips the alerts and leaves the results in window.__testResults, setting
// window.__testsDone when the run is finished, and calls window.__onTestResult(result), if
// it's there, after each test (for scripts/run-tests.ts).
//
// While a test is running or being recorded, each frame runs a fixed number of time steps
// instead of however many the clock allows, so the results don't depend on how fast the
// machine is (with an adaptive time step, where the frames end changes the waveform).  A
// test records how many (<test spf="...">); otherwise it's ?teststeps=, 20 by default.
// The random numbers (noise sources, and op-amps and gates settling) come from a generator
// seeded the same way each time, for the same reason.
//
// createTest() makes a test of a circuit with no interaction, for scripts/create-tests.ts.

import { CirSim } from "./CirSim";
import { CircuitElm } from "./CircuitElm";
import { SimulationManager } from "./SimulationManager";
import { SwitchElm } from "./SwitchElm";
import { Locale } from "./Locale";
import { ExportAsLocalFileDialog } from "./ExportAsLocalFileDialog";

interface ScopeDataRef {
    si: number; pi: number; en: number; value: number; units: number; speed: number;
    ts: number;
    values: number[];
}

interface SwitchEvent { t: number; elmNo: number; }

export interface TestResult {
    name: string;
    pass: boolean;
    failures: string[];
    errors: string[];
}

export class TestManager {
    static enabled = false;
    static loadingTestCircuit = false;
    static theManager: TestManager | null = null;

    static readonly TOLERANCE = 1e-3;
    static readonly SCALE_TOLERANCE = 1e-4;

    app: CirSim;
    testRunning = false;
    recording = false;
    savedCircuitDump: string | null = null;
    testLen = -1;
    refData: ScopeDataRef[] = [];
    switchEvents: SwitchEvent[] = [];
    nextEventIdx = 0;
    stepsPerFrame = 20;
    // the test's own steps per frame (<test spf=>), 0 if it doesn't say
    testSpf = 0;
    // createTest(): when to give up recording (Date.now()), and what to call when done
    recordDeadline = 0;
    onRecordDone: (() => void) | null = null;
    headless = false;
    base = import.meta.env.DEV ? new URL("auto-tests/", window.location.href).href
                               : "http://127.0.0.1:5001/auto-tests/";

    // test list mode
    testList: string[] | null = null;
    testListUrl = "";
    testListIdx = 0;
    results: TestResult[] = [];
    currentTestName: string | null = null;
    // console errors and exceptions while the current test ran (drawing code included)
    currentErrors: string[] = [];

    constructor(app: CirSim) {
        this.app = app;
        TestManager.theManager = this;
        const qp = new URLSearchParams(window.location.search);
        this.headless = qp.get("headless") === "1";
        const steps = parseInt(qp.get("teststeps") ?? "");
        if (steps > 0)
            this.stepsPerFrame = steps;
        const base = qp.get("testbase");
        if (base)
            this.base = base.endsWith("/") ? base : base + "/";
        SimulationManager.testHooks = this;
        this.captureErrors();
    }

    // called from CirSim.init(), after the UI is set up
    static init(app: CirSim): void {
        const tm = TestManager.theManager ?? new TestManager(app);
        const qp = new URLSearchParams(window.location.search);
        const testFile = qp.get("test");
        const testListFile = qp.get("testlist");
        if (testFile != null) {
            TestManager.loadingTestCircuit = true;
            tm.testList = [testFile];
            tm.testListUrl = tm.base;
            tm.testListIdx = 0;
            tm.runNextTest();
        } else if (testListFile != null) {
            TestManager.loadingTestCircuit = true;
            tm.loadTestList(testListFile);
        }
    }

    private captureErrors(): void {
        const origError = console.error.bind(console);
        console.error = (...args: any[]) => {
            if (this.testRunning)
                this.currentErrors.push(args.map(String).join(" "));
            origError(...args);
        };
        window.addEventListener("error", e => {
            if (this.testRunning)
                this.currentErrors.push(String(e.message ?? e));
        });
        window.addEventListener("unhandledrejection", e => {
            if (this.testRunning)
                this.currentErrors.push(String(e.reason));
        });
    }

    private async fetchText(url: string): Promise<string> {
        const resp = await fetch(url);
        if (!resp.ok)
            throw new Error(`${url}: ${resp.status} ${resp.statusText}`);
        return resp.text();
    }

    async loadTestList(filename: string): Promise<void> {
        const url = new URL(filename, this.base).href;
        try {
            const text = await this.fetchText(url);
            this.testList = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
            this.testListUrl = url;
            this.testListIdx = 0;
            this.results = [];
            this.runNextTest();
        } catch (e) {
            this.report("Could not load test list: " + e);
            this.finish();
        }
    }

    async loadTestCircuit(name: string): Promise<void> {
        const url = new URL(name, this.testListUrl || this.base).href;
        let text: string;
        try {
            text = await this.fetchText(url);
        } catch (e) {
            this.addResult({ name, pass: false, failures: ["could not load: " + e], errors: [] });
            return;
        }
        this.testLen = -1;
        this.testSpf = 0;
        this.refData = [];
        this.switchEvents = [];
        this.currentErrors = [];
        try {
            await this.app.loader.readCircuit(text);
        } catch (e) {
            this.addResult({ name, pass: false, failures: ["exception loading: " + e], errors: [] });
            return;
        }
        if (this.testLen < 0) {
            this.addResult({ name, pass: false, failures: ["no <test> tag"], errors: [] });
            return;
        }
        this.startTest();
    }

    runNextTest(): void {
        if (this.testList == null || this.testListIdx >= this.testList.length) {
            this.finish();
            return;
        }
        this.currentTestName = this.testList[this.testListIdx++];
        this.loadTestCircuit(this.currentTestName);
    }

    // the same random numbers each time a test runs
    seedRandom(): void {
        let a = 12345;
        const next = () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        this.app.random = {
            nextInt: () => Math.floor(next() * 2147483647),
            nextDouble: next,
        };
    }

    startTest(): void {
        this.recording = false;
        this.nextEventIdx = 0;
        this.seedRandom();
        this.app.resetAction();
        this.app.setSimRunning(true);
        this.testRunning = true;
    }

    private async addResult(r: TestResult): Promise<void> {
        this.results.push(r);
        const w = window as any;
        (w.__testResults ??= []).push(r);
        CirSim.console((r.pass ? "PASS: " : "FAIL: ") + r.name +
                       [...r.failures, ...r.errors].map(s => "\n    " + s).join(""));
        // the headless runner's callback (it takes a screenshot of failures)
        try {
            await w.__onTestResult?.(r);
        } catch (e) {}
        this.runNextTest();
    }

    private finish(): void {
        (window as any).__testsDone = true;
        const passed = this.results.filter(r => r.pass).length;
        const failed = this.results.length - passed;
        if (this.results.length === 1) {
            const r = this.results[0];
            this.report(r.pass ? "Test PASSED" : "Test FAILED:\n" + [...r.failures, ...r.errors].join("\n"));
            return;
        }
        let msg = `Tests: ${this.results.length}, Passed: ${passed}, Failed: ${failed}`;
        const fails = this.results.filter(r => !r.pass);
        if (fails.length > 0)
            msg += "\n\nFailures:\n" + fails.map(r => r.name + "\n  " + [...r.failures, ...r.errors].join("\n  ")).join("\n");
        this.report(msg);
    }

    private report(msg: string): void {
        CirSim.console(msg);
        if (!this.headless)
            window.alert(msg);
    }

    // called from SwitchElm.toggle() (via CircuitElm.recordToggle())
    recordSwitchToggle(se: CircuitElm): void {
        if (!this.recording)
            return;
        const elmNo = this.app.locateElm(se);
        if (elmNo >= 0)
            this.switchEvents.push({ t: this.app.sim.t, elmNo });
    }

    // called from CircuitXMLDeserializer for <test>, <switchevent> and <scopedata>
    saveTestTag(len: number, spf: number = 0): void {
        this.testLen = len;
        this.testSpf = spf;
        this.refData = [];
        this.switchEvents = [];
    }

    saveSwitchEvent(t: number, elmNo: number): void {
        this.switchEvents.push({ t, elmNo });
    }

    saveScopeDataTag(si: number, pi: number, en: number, v: number, u: number, sp: number,
                     ts: number, values: number[]): void {
        this.refData.push({ si, pi, en, value: v, units: u, speed: sp, ts, values });
    }

    // --- hooks called from SimulationManager.runCircuit() ---

    // time steps per frame while testing or recording, 0 otherwise
    fixedStepsPerFrame(): number {
        return this.testRunning ? (this.testSpf || this.stepsPerFrame) : 0;
    }

    // how close to an event's time counts as having reached it
    private get eps(): number { return this.app.sim.maxTimeStep * 1e-6; }

    // shorten the time step to land exactly on the next switch event or the end of the test
    clampTimeStep(t: number, timeStep: number): number {
        if (!this.testRunning)
            return timeStep;
        const eps = this.eps;
        if (!this.recording && this.nextEventIdx < this.switchEvents.length) {
            const evTime = this.switchEvents[this.nextEventIdx].t;
            if (evTime > t + eps && evTime < t + timeStep - eps)
                return evTime - t;
        }
        if (this.testLen >= 0 && this.testLen > t + eps && this.testLen < t + timeStep - eps)
            return this.testLen - t;
        return timeStep;
    }

    // called after each time step; returns true to end the frame
    checkTime(): boolean {
        if (!this.testRunning)
            return false;
        if (this.recording) {
            // createTest() stops at the length it chose, or when it's taking too long
            const done = this.testLen >= 0 && this.app.sim.t >= this.testLen - this.eps;
            if (done || (this.recordDeadline > 0 && Date.now() > this.recordDeadline)) {
                this.testRunning = this.recording = false;
                this.app.setSimRunning(false);
                const f = this.onRecordDone;
                this.onRecordDone = null;
                // let the frame finish drawing first, as compareAndReport() does
                setTimeout(() => f?.(), 0);
                return true;
            }
            return false;
        }
        const t = this.app.sim.t + this.eps;

        let fired = false, analyze = false;
        while (this.nextEventIdx < this.switchEvents.length) {
            const ev = this.switchEvents[this.nextEventIdx];
            if (ev.t > t)
                break;
            const ce = this.app.getElm(ev.elmNo);
            if (ce instanceof SwitchElm) {
                ce.toggle();
                // as the mouse and keyboard handlers do
                if (!ce.isLogicInputElm())
                    analyze = true;
                fired = true;
            } else
                this.currentErrors.push(`switch event at t=${ev.t}: element ${ev.elmNo} is not a switch`);
            this.nextEventIdx++;
        }
        if (fired) {
            if (analyze)
                this.app.needAnalyze();
            return true;
        }

        if (this.testLen >= 0 && this.app.sim.t >= this.testLen - this.eps) {
            this.testRunning = false;
            this.app.setSimRunning(false);
            // let the frame finish drawing before moving on, so errors drawing it are counted
            setTimeout(() => this.compareAndReport(), 0);
            return true;
        }
        return false;
    }

    // the sample times, oldest first, that dumpScopeData() writes for a plot.  This keeps the
    // Java version's order so its test files still work: the values are the plot's buffer from
    // (ptr - n) to (ptr - 1), where n is the number of samples (one per pixel, those at t >= 0).
    // The first can be the current, partly filled sample instead, so compareAndReport() skips it.
    private plotSampleCount(plot: any): number {
        const spc = plot.scopePointCount;
        const ts = this.app.sim.maxTimeStep * plot.scopePlotSpeed;
        const tStart = this.app.sim.t - ts * spc;
        let n = 0;
        for (let i = 0; i < spc; i++)
            if (tStart + ts * i >= 0)
                n++;
        return n;
    }

    compareAndReport(): void {
        const failures: string[] = [];
        const sm = this.app.scopeManager;
        if (this.refData.length === 0)
            failures.push("no scope data to compare");
        for (const ref of this.refData) {
            const label = `scope ${ref.si} plot ${ref.pi}`;
            if (ref.si >= sm.scopeCount) {
                failures.push(`${label}: no such scope`);
                continue;
            }
            const scope = sm.scopes[ref.si];
            if (ref.pi >= scope.plots.length) {
                failures.push(`${label}: no such plot`);
                continue;
            }
            const plot: any = scope.plots[ref.pi];
            if (plot.elm == null || plot.liveMax == null) {
                failures.push(`${label}: no data`);
                continue;
            }
            const en = this.app.locateElm(plot.elm);
            if (en !== ref.en || plot.value !== ref.value || plot.scopePlotSpeed !== ref.speed) {
                failures.push(`${label}: shows element ${en} value ${plot.value} speed ${plot.scopePlotSpeed}, ` +
                              `test expects element ${ref.en} value ${ref.value} speed ${ref.speed}`);
                continue;
            }
            const spc = plot.scopePointCount;
            const n = ref.values.length;
            let mismatch = 0, maxDiff = 0, first = "";
            // within TOLERANCE of the value, but near zero (where a waveform crosses it) that's
            // too fine, so at least a small fraction of the plot's peak
            const floor = Math.max(1e-9, TestManager.SCALE_TOLERANCE * Math.max(...ref.values.map(Math.abs)));
            // skip k = 0 (see plotSampleCount()), and samples older than this scope holds
            for (let k = Math.max(1, n - spc + 1); k < n; k++) {
                const age = n - k;
                const actual = plot.liveMax[(plot.ptr - age) & (spc - 1)];
                const expected = ref.values[k];
                const diff = Math.abs(actual - expected);
                const tol = Math.max(TestManager.TOLERANCE * Math.abs(expected), floor);
                if (!(diff <= tol)) {
                    if (mismatch === 0)
                        first = `, first at sample ${k} (t=${(this.app.sim.t - age * ref.ts).toPrecision(4)}): ` +
                                `got ${actual}, expected ${expected}`;
                    mismatch++;
                    if (!(diff <= maxDiff))
                        maxDiff = diff;
                }
            }
            if (mismatch > 0)
                failures.push(`${label}: ${mismatch} of ${n - 1} samples differ, max diff=${maxDiff}${first}`);
        }
        if (this.app.stopMessage != null)
            failures.push("simulation stopped: " + this.app.stopMessage);
        this.addResult({ name: this.currentTestName ?? "test", pass: failures.length === 0 && this.currentErrors.length === 0,
                         failures, errors: this.currentErrors.map(e => "error: " + e) });
    }

    // --- recording ---

    // Makes a test of a circuit (the text of its file), running it from reset with no
    // interaction until its scopes are full, or for maxSteps time steps or maxSeconds,
    // whichever is first.  Returns the test file, or why there isn't one.
    async createTest(text: string, maxSteps: number, maxSeconds: number, spf: number):
            Promise<{ dump?: string, skip?: string, errors: string[], len?: number }> {
        const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
        this.testRunning = this.recording = false;
        this.currentErrors = [];
        this.testLen = -1;
        const errors = () => this.currentErrors.map(e => "error: " + e);
        try {
            await this.app.loader.readCircuit(text);
        } catch (e) {
            return { skip: "exception loading: " + e, errors: [] };
        }
        if (this.testLen >= 0)
            return { skip: "already a test", errors: [] };
        this.switchEvents = [];
        this.refData = [];
        // a couple of frames, so the scopes get set up
        await frame();
        await frame();
        const sm = this.app.scopeManager;
        let fill = 0, plots = 0;
        for (let si = 0; si < sm.scopeCount; si++)
            for (const plot of sm.scopes[si].plots as any[])
                if (plot.elm != null) {
                    plots++;
                    fill = Math.max(fill, plot.scopePointCount * plot.scopePlotSpeed);
                }
        if (plots === 0)
            return { skip: "no scopes", errors: [] };
        // record it as the test will run it: loaded from the saved test file, then reset.
        // Loaded from its own file, it can run differently, since some elements keep state
        // that the file had through a reset (an op-amp's voltage, a gate's output), and
        // don't save it the same way
        this.savedCircuitDump = this.app.dumpCircuit();
        await this.app.loader.readCircuit(this.savedCircuitDump);
        this.seedRandom();
        this.app.resetAction();
        this.testLen = Math.min(fill, maxSteps) * this.app.sim.maxTimeStep;
        this.testSpf = spf;
        this.recordDeadline = Date.now() + maxSeconds * 1000;
        const done = new Promise<void>(r => this.onRecordDone = r);
        this.app.setSimRunning(true);
        this.testRunning = this.recording = true;
        // the simulator can stop on its own (singular matrix, say)
        while (this.recording) {
            if (this.app.stopMessage != null || !this.app.simRunning) {
                this.testRunning = this.recording = false;
                this.onRecordDone = null;
                return { skip: "simulation stopped: " + (this.app.stopMessage ?? "?"), errors: errors() };
            }
            await Promise.race([done, frame()]);
        }
        await done;
        this.recordDeadline = 0;
        const dump = this.testDump();
        this.testLen = -1;
        return { dump, errors: errors(), len: this.app.sim.t };
    }

    createUI(vp: HTMLElement): void {
        const panel = document.createElement("div");
        panel.className = "topSpace";
        const add = (text: string, f: () => void) => {
            const b = document.createElement("button");
            b.textContent = Locale.LS(text);
            b.className = "topButton";
            b.addEventListener("click", f);
            panel.appendChild(b);
        };
        add("Start Test", () => {
            this.switchEvents = [];
            this.testLen = -1;
            this.testSpf = 0;
            this.recordDeadline = 0;
            this.seedRandom();
            this.app.resetAction();
            this.savedCircuitDump = this.app.dumpCircuit();
            this.testRunning = true;
            this.recording = true;
        });
        add("Stop Test", () => {
            if (!this.recording)
                return;
            this.testRunning = false;
            this.recording = false;
            this.downloadWithTest();
        });
        add("Cancel Test", () => {
            this.testRunning = false;
            this.recording = false;
        });
        vp.appendChild(panel);
    }

    // the circuit as it was when recording started, with the test tags added
    testDump(): string {
        const len = this.app.sim.t;
        let dump = this.savedCircuitDump ?? this.app.dumpCircuit();
        const insert = `  <test len="${len}" spf="${this.testSpf || this.stepsPerFrame}"/>\n` + this.dumpSwitchEvents() + this.dumpScopeData();
        const idx = dump.lastIndexOf("</cir>");
        dump = idx >= 0 ? dump.substring(0, idx) + insert + dump.substring(idx) : dump + insert;
        return dump;
    }

    downloadWithTest(): void {
        const dump = this.testDump();
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        const fname = (ExportAsLocalFileDialog.lastFileName ?? `circuitjs-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
                       `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([dump], { type: "text/plain" }));
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    dumpSwitchEvents(): string {
        return this.switchEvents.map(ev => `  <switchevent t="${ev.t}" en="${ev.elmNo}"/>\n`).join("");
    }

    dumpScopeData(): string {
        let sb = "";
        const sm = this.app.scopeManager;
        for (let si = 0; si < sm.scopeCount; si++) {
            const scope = sm.scopes[si];
            for (let pi = 0; pi < scope.plots.length; pi++) {
                const plot: any = scope.plots[pi];
                if (plot.elm == null || plot.liveMax == null)
                    continue;
                const en = this.app.locateElm(plot.elm);
                if (en < 0)
                    continue;
                const spc = plot.scopePointCount;
                const ts = this.app.sim.maxTimeStep * plot.scopePlotSpeed;
                const n = this.plotSampleCount(plot);
                const vals: number[] = [];
                for (let k = 0; k < n; k++)
                    vals.push(plot.liveMax[(plot.ptr - n + k) & (spc - 1)]);
                sb += `  <scopedata si="${si}" pi="${pi}" en="${en}" v="${plot.value}" u="${plot.units}" ` +
                      `sp="${plot.scopePlotSpeed}" ts="${ts}">${vals.join(",")}</scopedata>\n`;
            }
        }
        return sb;
    }
}

(window as any).TestManager = TestManager;
