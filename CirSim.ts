/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

// GWT conversion (c) 2015 by Iain Sharp

// For information about the theory behind this, see Electronic Circuit & System Simulation Methods by Pillage
// or https://github.com/sharpie7/circuitjs1/blob/master/INTERNALS.md

import { Menus } from "./Menus";
import { MouseManager } from "./MouseManager";
import { ElementFactory } from "./ElementFactory";
import { StringTokenizer } from "./StringTokenizer";
import { Rectangle } from "./Rectangle";
import { Locale } from "./Locale";
import { CircuitXMLSerializer as CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CustomLogicModel } from "./CustomLogicModel";
import { DiodeModel } from "./DiodeModel";
import { CircuitElm } from "./CircuitElm";
import { ScopeManager } from "./ScopeManager";
import { ExportAsLocalFileDialog } from "./ExportAsLocalFileDialog";
import { HookRegistry } from "./HookRegistry";

// GWT Timer equivalent — drives the simulation/render loop via setInterval
class CirSimTimer {
    private app: CirSim;
    private intervalId: ReturnType<typeof setInterval> | null = null;

    constructor(app: CirSim) {
        this.app = app;
    }

    scheduleRepeating(ms: number): void {
        if (this.intervalId != null)
            clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.app.ui?.updateCircuit(), ms);
    }

    cancel(): void {
        if (this.intervalId != null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

export class CirSim {
    static readonly pi: number = 3.14159265358979323846;
    static readonly infoWidth: number = 160;

    static readonly HINT_LC: number = 1;
    static readonly HINT_RC: number = 2;
    static readonly HINT_3DB_C: number = 3;
    static readonly HINT_TWINT: number = 4;
    static readonly HINT_3DB_L: number = 5;

    static theApp: CirSim;

    elmList: any[] = [];  // CircuitElm[]
    postDrawList: any[] = [];  // Point[]
    badConnectionList: any[] = [];  // Point[]
    adjustables: any[] = [];  // Adjustable[]

    // saved context stack for editing subcircuit models
    contextStack: CircuitContext[] = [];

    menus: Menus;
    mouse: MouseManager;
    ui: any = null;          // UIManager — set during UIManager.init()
    sim: any = null;         // SimulationManager
    undoManager: any = null; // UndoManager
    imageExporter: any = null;
    commands: any = null;    // CommandManager
    scopeManager: ScopeManager = null;
    loader: any = null;      // CircuitLoader
    jsInterface: any = { callAnalyzeHook(): void {}, callUpdateHook(): void {}, callTimeStepHook(): void {}, setupJSInterface(): void {} }; // JSInterface stub

    analyzeFlag: boolean = false;
    savedFlag: boolean = false;
    simRunning: boolean = true;  // read directly by UIManager/SimulationManager
    dumpMatrix: boolean = false;
    dcAnalysisFlag: boolean = false;
    autoDCOnReset: boolean = false;
    unsavedChanges: boolean = false;
    shown: boolean = false;
    developerMode: boolean = false;
    showResistanceInVoltageSources: boolean = false;

    hintType: number = -1;
    hintItem1: number = 0;
    hintItem2: number = 0;

    stopMessage: string | null = null;
    stopElm: any = null;
    scopeElmArr: any[] | null = null;

    minFrameRate: number = 20;
    recovery: string | null = null;

    startCircuit: string | null = null;
    startLabel: string | null = null;
    startCircuitText: string | null = null;
    startCircuitLink: string | null = null;

    // circuit layout
    transform: number[] = [0, 0, 0, 0, 0, 0]; // [scaleX, 0, 0, scaleY, transX, transY]
    circuitArea: Rectangle = new Rectangle(0, 0, 800, 600);
    gridSize: number = 16;
    gridMask: number = ~15;
    gridRound: number = 7;

    shortcuts: (string | null)[] = new Array(127).fill(null);
    classToLabelMap: Map<string, string> = new Map();

    random: { nextInt(): number; nextDouble(): number } = {
        nextInt:    () => Math.floor(Math.random() * 2147483647),
        nextDouble: () => Math.random(),
    };

    // simulation timer
    readonly FASTTIMER: number = 16; // ms between frames (~60fps)
    readonly timer: CirSimTimer = new CirSimTimer(this);

    // dialog stubs — set when dialogs open
    static editDialog: any = null;
    static customLogicEditDialog: any = null;
    static diodeModelEditDialog: any = null;
    static relayModelEditDialog: any = null;
    static scrollValuePopup: any = null;
    static typeScrollPopup: any = null;
    static dialogShowing: any = null;
    static aboutBox: any = null;

    static readonly baseTitle: string = "Circuit Simulator";

    // maps integer dump type code → class name (built by register())
    static dumpTypeMap: Map<number, string> = new Map();
    // maps XML dump type string → class name
    static xmlDumpTypeMap: Map<string, string> = new Map();


    constructor() {
        CirSim.theApp = this;
        this.menus = new Menus();
        this.mouse = new MouseManager(this, null);
    }

    async init(): Promise<void> {
        // set viewport meta for CSS media queries
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width';
        document.head.appendChild(meta);

        let running = true;

        const { SimulationManager } = await import('./SimulationManager');
        this.sim = new SimulationManager(this);

        CircuitElm.initClass(this, this.sim);

        const { UIManager } = await import('./UIManager');
        this.ui = new UIManager(this);
        // undoManager = new UndoManager(this);  // not yet ported
        // undoManager.readRecovery();
        // imageExporter = new ImageExporter(this);  // not yet ported
        const { CommandManager } = await import('./CommandManager');
        this.commands = new CommandManager(this);

        const qp = new QueryParameters();
        let positiveColor: string | null = null;
        let negativeColor: string | null = null;
        let neutralColor: string | null = null;
        let selectColor: string | null = null;
        let currentColor: string | null = null;
        let mouseModeReq: string | null = null;

        try {
            let cct = qp.getValue("cct");
            if (cct != null)
                this.startCircuitText = cct.replace(/%24/g, "$");
            if (this.startCircuitText == null)
                this.startCircuitText = CirSim.getElectronStartCircuitText();
            const ctz = qp.getValue("ctz");
            if (ctz != null)
                this.startCircuitText = this.decompress(ctz);
            this.startCircuit = qp.getValue("startCircuit");
            this.startLabel   = qp.getValue("startLabel");
            this.startCircuitLink = qp.getValue("startCircuitLink");
            running = qp.getBooleanValue("running", true);
            positiveColor = qp.getValue("positiveColor");
            negativeColor = qp.getValue("negativeColor");
            neutralColor  = qp.getValue("neutralColor");
            selectColor   = qp.getValue("selectColor");
            currentColor  = qp.getValue("currentColor");
            mouseModeReq  = qp.getValue("mouseMode");
        } catch (e) {}

        this.transform = [0, 0, 0, 0, 0, 0];
        this.shortcuts = new Array(127).fill(null);
        this.elmList = [];

        const { registerElements } = await import('./registerElements');
        registerElements();

        this.ui.init();

        this.adjustables = [];

        this.ui.setColors(positiveColor, negativeColor, neutralColor, selectColor, currentColor);
        this.ui.setWheelSensitivity();

        try {
            HookRegistry.loadCustomCompositeModelsFromStorage?.();
        } catch (e) {
            CirSim.console("Exception: " + e);
        }

        const { CircuitLoader } = await import('./CircuitLoader');
        this.loader = new CircuitLoader(this, this.sim, this.scopeManager, this.menus);
        (window as any).TestManager?.init(this);

        if ((window as any).TestManager?.loadingTestCircuit) {
            this.startCircuitText = this.startCircuit = null;
        } else if (this.startCircuitText != null) {
            this.menus.getSetupList(false);
            this.loader.readCircuit(this.startCircuitText);
            const electronFileName = CirSim.getElectronStartCircuitFileName();
            if (electronFileName != null)
                this.setCircuitTitle(electronFileName);
            this.unsavedChanges = false;
        } else {
            if (this.stopMessage == null && this.startCircuitLink != null) {
                this.loader.readCircuit("");
                this.menus.getSetupList(false);
                (window as any).ImportFromDropboxDialog?.setSim(this);
                (window as any).ImportFromDropboxDialog?.doImportDropboxLink(this.startCircuitLink, false);
            } else {
                this.loader.readCircuit("");
                if (this.stopMessage == null && this.startCircuit != null) {
                    this.menus.getSetupList(false);
                    this.menus.readSetupFile(this.startCircuit, this.startLabel);
                } else
                    this.menus.getSetupList(true);
            }
        }

        if (mouseModeReq != null)
            this.commands?.menuPerformed("main", mouseModeReq);

        this.undoManager?.enableUndoRedo();
        this.commands?.enablePaste();
        const JSInterfaceClass = (window as any).JSInterface;
        if (JSInterfaceClass) {
            this.jsInterface = new JSInterfaceClass(this);
            this.jsInterface.setupJSInterface();
        }

        this.setSimRunning(running);
    }

    isPrintable(): boolean { return this.menus.printableCheckItem.getState(); }

    // delegation methods for UIManager
    setOptionInStorage(key: string, val: boolean): void { this.ui.setOptionInStorage(key, val); }
    getOptionFromStorage(key: string, val: boolean): boolean { return this.ui.getOptionFromStorage(key, val); }
    saveShortcuts(): void { this.ui.saveShortcuts(); }

    composeSubcircuitMenu(): void { this.ui.composeSubcircuitMenu(); }

    setiFrameHeight(): void { this.ui.setiFrameHeight(); }

    centerCircuit(): void { this.ui.centerCircuit(); }

    getCircuitBounds(): Rectangle { return this.ui.getCircuitBounds(); }

    setSimRunning(s: boolean): void { this.ui.setSimRunning(s); }

    simIsRunning(): boolean { return this.ui.simIsRunning(); }

    repaint(): void { this.ui.repaint(); }

    updateCircuit(): void { this.ui.updateCircuit(); }

    setStopElm(ce: any, msg: string | null): void {
        this.stopElm = ce;
        this.stopMessage = msg;
    }

    drawBottomArea(g: any): void { this.ui.drawBottomArea(g); }

    getBackgroundColor(): any { return this.ui.getBackgroundColor(); }

    onTimeStep(): void {
        this.scopeManager.timeStep();
        this.jsInterface.callTimeStepHook();
    }

    needAnalyze(): void {
        this.analyzeFlag = true;
        this.repaint();
        this.mouse.enableDisableMenuItems();
    }

    getElm(n: number): any {
        if (n >= this.elmList.length)
            return null;
        return this.elmList[n];
    }

    getIterCount(): number {
        // IES - remove interaction
        if (this.ui.speedBar.getValue() == 0)
            return 0;

        return .1 * Math.exp((this.ui.speedBar.getValue() - 61) / 24.);
    }

    getHint(): string | null {
        const c1 = this.getElm(this.hintItem1);
        const c2 = this.getElm(this.hintItem2);
        if (c1 == null || c2 == null)
            return null;
        if (this.hintType == CirSim.HINT_LC) {
            if (!c1.isInductorElm())
                return null;
            if (!c2.isCapacitorElm())
                return null;
            return Locale.LS("res.f = ") + c1.constructor.getUnitText(1 / (2 * CirSim.pi * Math.sqrt(c1.inductance * c2.capacitance)), "Hz");
        }
        if (this.hintType == CirSim.HINT_RC) {
            if (!c1.isResistorElm())
                return null;
            if (!c2.isCapacitorElm())
                return null;
            return "RC = " + c1.constructor.getUnitText(c1.resistance * c2.capacitance, "s");
        }
        if (this.hintType == CirSim.HINT_3DB_C) {
            if (!c1.isResistorElm())
                return null;
            if (!c2.isCapacitorElm())
                return null;
            return Locale.LS("f.3db = ") +
                c1.constructor.getUnitText(1 / (2 * CirSim.pi * c1.resistance * c2.capacitance), "Hz");
        }
        if (this.hintType == CirSim.HINT_3DB_L) {
            if (!c1.isResistorElm())
                return null;
            if (!c2.isInductorElm())
                return null;
            return Locale.LS("f.3db = ") +
                c1.constructor.getUnitText(c1.resistance / (2 * CirSim.pi * c2.inductance), "Hz");
        }
        if (this.hintType == CirSim.HINT_TWINT) {
            if (!c1.isResistorElm())
                return null;
            if (!c2.isCapacitorElm())
                return null;
            return Locale.LS("fc = ") +
                c1.constructor.getUnitText(1 / (2 * CirSim.pi * c1.resistance * c2.capacitance), "Hz");
        }
        return null;
    }

    findAdjustable(elm: any, item: number): any {
        for (let i = 0; i !== this.adjustables.length; i++) {
            const a = this.adjustables[i];
            if (a.elm == elm && a.editItem == item)
                return a;
        }
        return null;
    }

    static console(text: string): void { console.log(text); }

    static debugger(): void { debugger; }

    min(a: number, b: number): number { return (a < b) ? a : b; }
    max(a: number, b: number): number { return (a > b) ? a : b; }

    resetAction(): void { this.ui.resetAction(); }

    static isElectron(): boolean {
        return (window as any).openFile != undefined;
    }

    static getElectronStartCircuitText(): string | null {
        return (window as any).startCircuitText ?? null;
    }

    static getElectronStartCircuitFileName(): string | null {
        return (window as any).startCircuitFileName ?? null;
    }

    allowSave(b: boolean): void { this.ui.allowSave(b); }

    importCircuitFromText(circuitText: string | null, subcircuitsOnly: boolean): void {
        const RC_SUBCIRCUITS = 2, RC_RETAIN = 4;
        const flags = subcircuitsOnly ? (RC_SUBCIRCUITS | RC_RETAIN) : 0;
        if (!subcircuitsOnly)
            this.resetEditingContext();
        if (circuitText != null) {
            this.loader.readCircuit(circuitText, flags);
            ExportAsLocalFileDialog.setLastFileName(null);
            this.allowSave(false);
        }
    }

    dumpOptions(): string {
        let f = (this.menus.dotsCheckItem.getState()) ? 1 : 0;
        f |= (this.menus.smallGridCheckItem.getState()) ? 2 : 0;
        f |= (this.menus.voltsCheckItem.getState()) ? 0 : 4;
        f |= (this.menus.powerCheckItem.getState()) ? 8 : 0;
        f |= (this.menus.showValuesCheckItem.getState()) ? 0 : 16;
        // 32 = linear scale in afilter
        f |= this.sim.adjustTimeStep ? 64 : 0;
        f |= this.autoDCOnReset ? 128 : 0;
        const dump = "$ " + f + " " +
            this.sim.maxTimeStep + " " + this.getIterCount() + " " +
            this.ui.currentBar.getValue() + " " + CircuitElm.voltageRange + " " +
            this.ui.powerBar.getValue() + " " + this.sim.minTimeStep + "\n";
        return dump;
    }

    dumpCircuit(): string {
        CustomLogicModel.clearDumpedFlags();
        HookRegistry.clearCustomCompositeModelDumpedFlags?.();
        DiodeModel.clearDumpedFlags();
        (window as any).TransistorModel?.clearDumpedFlags();
        (window as any).RelayModel?.clearDumpedFlags();

        const xml = new CircuitXMLSerializer(this);
        return xml.dumpCircuit();
    }

    setCircuitTitle(s: string | null): void { this.ui.setCircuitTitle(s); }

    clearCircuit(): void { this.loader.clearCircuit(); }
    readCircuit(s: string): void { this.loader.readCircuit(s); }

    pushContext(modelName: string): void {
        const ctx = new CircuitContext();
        ctx.circuitDump = this.dumpCircuit();
        ctx.undoStack = this.undoManager.undoStack;
        ctx.redoStack = this.undoManager.redoStack;
        ctx.transform = this.transform.slice();
        ctx.modelName = modelName;
        this.contextStack.push(ctx);
        this.undoManager.undoStack = [];
        this.undoManager.redoStack = [];
        this.undoManager.enableUndoRedo();
        this.ui.updateContextButtons();
    }

    popContext(): void {
        this.popContextAndGetChangedModels();
    }

    // pop context and return the list of models changed at deeper levels
    popContextAndGetChangedModels(): any[] {
        if (this.contextStack.length === 0)
            return [];
        const ctx = this.contextStack.splice(this.contextStack.length - 1, 1)[0];
        const RC_NO_CENTER = 8;
        this.loader.readCircuit(ctx.circuitDump, RC_NO_CENTER);
        this.transform = ctx.transform;
        this.undoManager.undoStack = ctx.undoStack;
        this.undoManager.redoStack = ctx.redoStack;
        this.undoManager.enableUndoRedo();
        this.ui.updateContextButtons();
        return ctx.changedModels;
    }

    resetEditingContext(): void {
        this.contextStack = [];
        this.ui.updateContextButtons();
    }

    isEditingContext(): boolean {
        return this.contextStack.length > 0;
    }

    getEditingModelName(): string | null {
        if (this.contextStack.length === 0)
            return null;
        return this.contextStack[this.contextStack.length - 1].modelName;
    }

    // delete sliders for an element
    deleteSliders(elm: any): void {
        if (this.adjustables == null)
            return;
        for (let i = this.adjustables.length - 1; i >= 0; i--) {
            const adj = this.adjustables[i];
            if (adj.elm == elm) {
                adj.deleteSlider(this);
                this.adjustables.splice(i, 1);
            }
        }
    }

    snapGrid(x: number): number {
        return (x + this.gridRound) & this.gridMask;
    }

    locateElm(elm: any): number {
        for (let i = 0; i !== this.elmList.length; i++)
            if (elm === this.elmList[i])
                return i;
        return -1;
    }

    setPowerBarEnable(): void { this.ui.setPowerBarEnable(); }

    enableItems(): void { this.ui.enableItems(); }

    setGrid(): void { this.ui.setGrid(); }

    setToolbar(): void { this.ui.setToolbar(); }

    setMouseMode(mode: number): void { this.ui.setMouseMode(mode); }

    setCursorStyle(s: string): void { this.ui.setCursorStyle(s); }

    dialogIsShowing(): boolean { return this.ui.dialogIsShowing(); }

    updateToolbar(): void { this.ui.updateToolbar(); }

    getLabelTextForClass(cls: string): string { return this.ui.getLabelTextForClass(cls); }

    createNewLoadFile(): void { this.ui.createNewLoadFile(); }

    addWidgetToVerticalPanel(w: any): void { this.ui.addWidgetToVerticalPanel(w); }

    removeWidgetFromVerticalPanel(w: any): void { this.ui.removeWidgetFromVerticalPanel(w); }

    register(origClassName: string, elm: any): void {
        let className = origClassName;
        if (CirSim.dumpTypeMap == null) {
            CirSim.dumpTypeMap = new Map<number, string>();
            CirSim.xmlDumpTypeMap = new Map<string, string>();
        }
        if (elm == null)
            return;
        const t: number = elm.getDumpType();
        // use the class name from getDumpClass if available
        if (elm.getDumpClass) {
            const cs = elm.getDumpClass();
            if (cs && cs.name) {
                className = cs.name;
                const dot = className.lastIndexOf('.');
                if (dot >= 0) className = className.substring(dot + 1);
            }
        }
        if (t > 0) {
            const s = CirSim.dumpTypeMap.get(t);
            if (s != null) {
                if (s !== className)
                    CirSim.console("dump type conflict for " + className + " " + t);
            } else {
                CirSim.dumpTypeMap.set(t, className);
            }
        }

        const xt: string = elm.getXmlDumpType ? elm.getXmlDumpType() : className;
        const s2 = CirSim.xmlDumpTypeMap.get(xt);
        if (s2 != null) {
            if (s2 !== className)
                CirSim.console("xml dump type conflict for " + className + " " + xt);
        } else {
            CirSim.xmlDumpTypeMap.set(xt, className);
        }
    }

    static createCe(tint: number, x1: number, y1: number, x2: number, y2: number, f: number, st: StringTokenizer): any {
        // for old files
        if (tint === 'n'.charCodeAt(0))
            return ElementFactory.create("NoiseElm", x1, y1, x2, y2, f, st);

        const name = CirSim.dumpTypeMap.get(tint);
        if (name == null)
            return null;
        return ElementFactory.create(name, x1, y1, x2, y2, f, st);
    }

    static constructElement(n: string, x1: number, y1?: number): any {
        const elm = ElementFactory.create(n, x1, y1 ?? 0);
        if (elm != null)
            return elm;

        if (n == "VoltageElm")
            return ElementFactory.create("DCVoltageElm", x1, y1 ?? 0);
        if (n == "TransistorElm")
            return ElementFactory.create("NTransistorElm", x1, y1 ?? 0);
        if (n == "MosfetElm")
            return ElementFactory.create("NMosfetElm", x1, y1 ?? 0);
        if (n == "JfetElm")
            return ElementFactory.create("NJfetElm", x1, y1 ?? 0);
        if (n == "DarlingtonElm")
            return ElementFactory.create("NDarlingtonElm", x1, y1 ?? 0);

        // if you take out RingCounterElm, it will break subcircuits
        // if you take out DecadeElm, it will break the menus and people's saved shortcuts
        if (n == "DecadeElm" || n == "RingCounterElm")
            return ElementFactory.create("RingCounterElm", x1, y1 ?? 0);

        // if you take out UserDefinedLogicElm, it will break people's saved shortcuts
        if (n == "UserDefinedLogicElm" || n == "CustomLogicElm")
            return ElementFactory.create("CustomLogicElm", x1, y1 ?? 0);

        // handle CustomCompositeElm:modelname
        if (n.startsWith("CustomCompositeElm:")) {
            const ix = n.indexOf(':') + 1;
            const modelName = n.substring(ix);
            // CustomCompositeElm needs the model name — pass via a stub StringTokenizer
            const st = { nextToken: () => modelName, hasMoreTokens: () => false } as any;
            return ElementFactory.create("CustomCompositeElm", x1, y1 ?? 0, x1, y1 ?? 0, 0, st);
        }
        return null;
    }

    updateModels(): void {
        for (const ce of this.elmList)
            ce.updateModels();
    }

    // force all CustomCompositeElm with a given model name to re-fetch their model
    refreshModels(modelName: string): void {
        for (const ce of this.elmList) {
            if (ce.isCustomCompositeElm && ce.isCustomCompositeElm()) {
                if (ce.modelName === modelName) {
                    ce.model = null;
                    ce.updateModels();
                }
            }
        }
        this.needAnalyze();
    }

    isSelection(): boolean { return this.ui.isSelection(); }

    isMobile(el: HTMLElement): boolean {
        if (!el) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none';
    }

    decompress(dump: string): string {
        return (window as any).LZString.decompressFromEncodedURIComponent(dump);
    }

    // instance wrappers for Java compatibility
    constructElement(name: string, x: number, y: number): any { return CirSim.constructElement(name, x, y); }
    console(s: string): void { CirSim.console(s); }

    getrand(x: number): number {
        let q = this.random.nextInt();
        if (q < 0) q = -q;
        return q % x;
    }
}

// Simple URL query parameter helper (replaces GWT QueryParameters)
class QueryParameters {
    private params: URLSearchParams;
    constructor() { this.params = new URLSearchParams(window.location.search); }
    getValue(key: string): string | null { return this.params.get(key); }
    getBooleanValue(key: string, def: boolean): boolean {
        const v = this.params.get(key);
        if (v == null) return def;
        return v !== "false" && v !== "0";
    }
}

export class CircuitContext {
    circuitDump: string = "";
    undoStack: any[] = [];
    redoStack: any[] = [];
    transform: number[] = [];
    modelName: string = "";
    changedModels: any[] = [];
}
