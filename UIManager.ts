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

import { CirSim } from "./CirSim";
import { Menus } from "./Menus";
import { MouseManager } from "./MouseManager";
import { ScopeManager } from "./ScopeManager";
import { CircuitElm } from "./CircuitElm";
import { Color } from "./Color";
import { Graphics } from "./Graphics";
import { Rectangle } from "./Rectangle";
import { Point } from "./Point";
import { SwitchElm } from "./SwitchElm";
import { Locale } from "./Locale";
import { ExportAsLocalFileDialog } from "./ExportAsLocalFileDialog";

// GWT KeyCodes equivalents
const KEY_BACKSPACE = 8;
const KEY_DELETE    = 46;
const KEY_ENTER     = 13;
const KEY_ESCAPE    = 27;
const KEY_SPACE     = 32;
const KEY_LEFT      = 37;
const KEY_RIGHT     = 39;
const KEY_UP        = 38;
const KEY_DOWN      = 40;
const KEY_A = 65, KEY_C = 67, KEY_D = 68, KEY_N = 78;
const KEY_O = 79, KEY_P = 80, KEY_S = 83, KEY_V = 86;
const KEY_X = 88, KEY_Y = 89, KEY_Z = 90;

// Simple range-input based scrollbar
class Scrollbar {
    static readonly HORIZONTAL = 0;
    element: HTMLInputElement;

    constructor(orientation: number, value: number, step: number, min: number, max: number) {
        this.element = document.createElement('input');
        this.element.type = 'range';
        this.element.min = String(min);
        this.element.max = String(max);
        this.element.step = String(step);
        this.element.value = String(value);
        this.element.style.width = '100%';
    }

    getValue(): number { return Number(this.element.value); }
    setValue(v: number): void { this.element.value = String(v); }
    enable(): void  { this.element.disabled = false; }
    disable(): void { this.element.disabled = true;  }
    addChangeHandler(fn: () => void): void { this.element.addEventListener('input', fn); }
}

// Stubs for classes not yet translated from Java

class Toolbar {
    element: HTMLElement;
    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'toolbar';
    }
    setEuroResistors(b: boolean): void {}
    setModeLabel(s: string): void {}
    highlightButton(s: string): void {}
}

class SubcircuitBar {
    element: HTMLElement;
    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'subcircuitBar';
        this.element.style.display = 'none';
    }
    setSubcircuitPath(s: string | null): void {
        this.element.style.display = s ? 'block' : 'none';
        this.element.textContent = s ?? '';
    }
    updatePosition(x: number, y: number, w: number): void {
        this.element.style.left  = x + 'px';
        this.element.style.top   = y + 'px';
        this.element.style.width = w + 'px';
    }
    setContextInfo(s: string | null): void {}
}

class LoadFile {
    element: HTMLInputElement;
    static isSupported(): boolean { return !!(window.File && window.FileReader); }

    constructor(app: CirSim) {
        this.element = document.createElement('input');
        this.element.type = 'file';
        this.element.setAttribute('name', 'Import');
        this.element.id = 'LoadFileElement';
        this.element.accept = '.txt,.circuitjs';
        this.element.className = 'offScreen';
        this.element.addEventListener('change', () => LoadFile.doLoad(app));
    }

    static doLoad(app: CirSim): void {
        const input = document.getElementById('LoadFileElement') as HTMLInputElement;
        if (!input || !input.files || input.files.length < 1) return;
        const file = input.files[0];
        if (file.size >= 1280000) {
            alert('File too large!');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result as string;
            app.undoManager?.pushUndo();
            app.resetEditingContext();
            app.loader.readCircuit(text);
            app.createNewLoadFile();
            app.setCircuitTitle(file.name);
            ExportAsLocalFileDialog.setLastFileName(file.name);
            app.unsavedChanges = false;
        };
        reader.readAsText(file);
    }
}

class CheckboxMenuItem {
    private _label: string;
    private _shortcut: string;
    private _state: boolean = false;
    private _command: (() => void) | null = null;

    constructor(label: string, shortcut: string = "") {
        this._label = label;
        this._shortcut = shortcut;
    }

    getState(): boolean { return this._state; }
    setState(s: boolean): void { this._state = s; }
    getShortcut(): string { return this._shortcut; }
    setShortcut(s: string): void { this._shortcut = s; }
    setScheduledCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }
    setCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }
    execute(): void { if (this._command) this._command(); }
    getLabel(): string { return this._label; }
}

class MyCommand {
    menu: string;
    className: string;
    constructor(menu: string, className: string) {
        this.menu = menu;
        this.className = className;
    }
    execute(): void {
        CirSim.theApp.commands.menuPerformed(this.menu, this.className);
    }
}

class PerfMonitor {
    startContext(name: string): void {}
    stopContext(): void {}
    static buildString(pm: PerfMonitor): { toString(): string } {
        return { toString: () => "" };
    }
}

// URLSearchParams-based replacement for GWT QueryParameters
class QueryParameters {
    private params: URLSearchParams;
    constructor() {
        this.params = new URLSearchParams(window.location.search);
    }
    getValue(key: string): string | null {
        return this.params.get(key);
    }
    getBooleanValue(key: string, defaultVal: boolean): boolean {
        const v = this.params.get(key);
        if (v === null) return defaultVal;
        return v === 'true' || v === '1';
    }
}

export class UIManager {

    static theUI: UIManager;

    app: CirSim;
    menus: Menus;
    scopeManager: ScopeManager;

    resetButton: HTMLButtonElement;
    runStopButton: HTMLButtonElement;
    dumpMatrixButton: HTMLButtonElement | null = null;
    powerLabel: HTMLElement;
    titleLabel: HTMLElement;
    speedBar: Scrollbar;
    currentBar: Scrollbar;
    powerBar: Scrollbar;
    contextPanel: HTMLElement | null = null;
    mouse: MouseManager;

    mouseModeStr: string = "Select";

    // timing/frame fields
    lastTime: number = 0;
    lastFrameTime: number = 0;
    secTime: number = 0;
    frames: number = 0;
    steps: number = 0;
    framerate: number = 0;
    steprate: number = 0;
    needsRepaint: boolean = false;
    hideInfoBox: boolean = false;
    hideMenu: boolean = false;
    lastCursorStyle: string | null = null;

    toolbar: Toolbar;
    subcircuitBar: SubcircuitBar;

    layoutPanel: HTMLElement;
    verticalPanel: HTMLElement;
    buttonPanel: HTMLElement;
    mainMenuItems: CheckboxMenuItem[] = [];
    mainMenuItemNames: string[] = [];
    sidePanelCheckboxLabel: HTMLElement;

    loadFileInput: LoadFile | null = null;
    iFrame: HTMLIFrameElement | null = null;
    elmList: CircuitElm[];

    // stack of enclosing subcircuits when viewing composite internals
    subcircuitStack: any[] = [];

    cv: HTMLCanvasElement;
    cvcontext: CanvasRenderingContext2D;

    // canvas width/height in px (before device pixel ratio scaling)
    canvasWidth: number = 0;
    canvasHeight: number = 0;

    static readonly MENUBARHEIGHT = 30;
    static readonly TOOLBARHEIGHT = 40;
    static VERTICALPANELWIDTH = 166; // default
    lastResizeTime: number = 0;

    constructor(app: CirSim) {
        this.app = app;
        UIManager.theUI = this;
    }

    init(): void {
        let printable = false;
        let convention = true;
        let euroRes = false;
        let usRes = false;
        let running = true;
        let hideSidebar = false;
        let noEditing = false;
        let mouseWheelEdit = false;

        this.hideMenu = false;

        const qp = new QueryParameters();
        let positiveColor: string | null = null;
        let negativeColor: string | null = null;
        let neutralColor: string | null = null;
        let selectColor: string | null = null;
        let currentColor: string | null = null;
        let mouseModeReq: string | null = null;
        let euroGates = false;

        this.elmList = this.app.elmList;

        try {
            euroRes       = qp.getBooleanValue("euroResistors", false);
            euroGates     = qp.getBooleanValue("IECGates", this.getOptionFromStorage("euroGates", Locale.weAreInGermany()));
            usRes         = qp.getBooleanValue("usResistors", false);
            running       = qp.getBooleanValue("running", true);
            hideSidebar   = qp.getBooleanValue("hideSidebar", false);
            this.hideMenu = qp.getBooleanValue("hideMenu", false);
            printable     = qp.getBooleanValue("whiteBackground", this.getOptionFromStorage("whiteBackground", false));
            convention    = qp.getBooleanValue("conventionalCurrent",
                               this.getOptionFromStorage("conventionalCurrent", true));
            noEditing     = !qp.getBooleanValue("editable", true);
            mouseWheelEdit = qp.getBooleanValue("mouseWheelEdit", this.getOptionFromStorage("mouseWheelEdit", true));
            positiveColor = qp.getValue("positiveColor");
            negativeColor = qp.getValue("negativeColor");
            neutralColor  = qp.getValue("neutralColor");
            selectColor   = qp.getValue("selectColor");
            currentColor  = qp.getValue("currentColor");
            mouseModeReq  = qp.getValue("mouseMode");
            this.hideInfoBox = qp.getBooleanValue("hideInfoBox", false);
        } catch (e) {
            CirSim.console("Exception: " + e);
        }

        let euroSetting = false;
        if (euroRes)
            euroSetting = true;
        else if (usRes)
            euroSetting = false;
        else
            euroSetting = this.getOptionFromStorage("euroResistors", !Locale.weAreInUS(true));

        // build main layout container
        this.layoutPanel = document.createElement('div');
        this.layoutPanel.className = 'layoutPanel';
        this.layoutPanel.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;';

        this.app.ui = this;
        this.app.menus = this.menus = new Menus(this.app);
        this.menus.init();
        (CirSim as any).dumpTypeMap  = (CirSim as any).dumpTypeMap  || new Map();
        (CirSim as any).xmlDumpTypeMap = (CirSim as any).xmlDumpTypeMap || new Map();
        (CirSim as any).dumpTypeMap.set(403, "ScopeElm");
        (CirSim as any).xmlDumpTypeMap.set("Scope", "ScopeElm");

        this.menus.recoverItem.setEnabled(this.app.recovery != null);

        const width = window.innerWidth;
        UIManager.VERTICALPANELWIDTH = Math.floor(width / 5);
        if (UIManager.VERTICALPANELWIDTH > 166) UIManager.VERTICALPANELWIDTH = 166;
        if (UIManager.VERTICALPANELWIDTH < 128) UIManager.VERTICALPANELWIDTH = 128;

        this.verticalPanel = document.createElement('div');
        this.verticalPanel.className = 'verticalPanel';
        this.verticalPanel.id = 'painel';
        this.verticalPanel.style.cssText =
            `width:${UIManager.VERTICALPANELWIDTH}px;overflow-y:auto;flex-shrink:0;`;

        // mobile hamburger-style checkbox toggles for sidebar and top panel
        const sidePanelCheckbox = document.createElement('input');
        sidePanelCheckbox.type = 'checkbox';
        sidePanelCheckbox.id = 'trigger';
        sidePanelCheckbox.className = 'trigger';
        this.sidePanelCheckboxLabel = document.createElement('label');
        this.sidePanelCheckboxLabel.className = 'triggerLabel';
        this.sidePanelCheckboxLabel.setAttribute('for', 'trigger');

        const topPanelCheckbox = document.createElement('input');
        topPanelCheckbox.type = 'checkbox';
        topPanelCheckbox.id = 'toptrigger';
        topPanelCheckbox.className = 'toptrigger';
        const topPanelCheckboxLabel = document.createElement('label');
        topPanelCheckboxLabel.className = 'toptriggerlabel';
        topPanelCheckboxLabel.setAttribute('for', 'toptrigger');

        // make buttons side by side if there's room
        this.buttonPanel = (UIManager.VERTICALPANELWIDTH === 166)
            ? Object.assign(document.createElement('div'), { style: { display: 'flex', flexDirection: 'row' } })
            : Object.assign(document.createElement('div'), { style: { display: 'flex', flexDirection: 'column' } });

        this.menus.pasteItem.setEnabled(false);

        this.menus.dotsCheckItem.setState(true);
        this.menus.voltsCheckItem.setState(true);
        this.menus.showValuesCheckItem.setState(true);
        this.menus.toolbarCheckItem.setState(
            !this.hideMenu && !noEditing && !hideSidebar &&
            (this.app as any).startCircuit == null &&
            (this.app as any).startCircuitText == null &&
            (this.app as any).startCircuitLink == null);
        this.menus.crossHairCheckItem.setState(this.getOptionFromStorage("crossHair", false));
        this.menus.euroResistorCheckItem.setState(euroSetting);
        this.menus.euroResistorCheckItem.setCommand({
            execute: () => {
                this.setOptionInStorage("euroResistors", this.menus.euroResistorCheckItem.getState());
                this.toolbar.setEuroResistors(this.menus.euroResistorCheckItem.getState());
            }
        });
        this.menus.euroGatesCheckItem.setCommand({
            execute: () => {
                this.setOptionInStorage("euroGates", this.menus.euroGatesCheckItem.getState());
                for (const ce of this.elmList)
                    ce.setPoints();
            }
        });
        this.menus.euroGatesCheckItem.setState(euroGates);
        this.menus.printableCheckItem.setCommand({
            execute: () => {
                for (let i = 0; i < this.scopeManager.scopeCount; i++)
                    this.scopeManager.scopes[i].setRect(this.scopeManager.scopes[i].rect);
                this.setOptionInStorage("whiteBackground", this.menus.printableCheckItem.getState());
            }
        });
        this.menus.printableCheckItem.setState(printable);

        this.menus.conventionCheckItem.setCommand({
            execute: () => {
                this.setOptionInStorage("conventionalCurrent", this.menus.conventionCheckItem.getState());
                const cc = CircuitElm.currentColor.getHexValue();
                // change the current color if it hasn't changed from the default
                if (cc === "#ffff00" || cc === "#00ffff")
                    CircuitElm.currentColor = this.menus.conventionCheckItem.getState() ? Color.yellow : Color.cyan;
            }
        });
        this.menus.conventionCheckItem.setState(convention);
        this.menus.noEditCheckItem.setState(noEditing);
        this.menus.mouseWheelEditCheckItem.setState(mouseWheelEdit);

        this.loadShortcuts();

        // add checkbox toggles to layout
        this.layoutPanel.appendChild(topPanelCheckbox);
        this.layoutPanel.appendChild(topPanelCheckboxLabel);

        this.toolbar = new Toolbar();
        this.toolbar.setEuroResistors(euroSetting);
        const menuBar = this.menus.menuBar;
        if (!this.hideMenu) {
            menuBar.style.height = UIManager.MENUBARHEIGHT + 'px';
            menuBar.style.flexShrink = '0';
            this.layoutPanel.appendChild(menuBar);
        }

        this.toolbar.element.style.height = UIManager.TOOLBARHEIGHT + 'px';
        this.toolbar.element.style.flexShrink = '0';
        this.layoutPanel.appendChild(this.toolbar.element);

        // content row: canvas on the left (flex:1), sidebar on the right (fixed width)
        const contentRow = document.createElement('div');
        contentRow.className = 'contentRow';
        contentRow.style.cssText = 'flex:1;display:flex;flex-direction:row;overflow:hidden;min-height:0;';
        this.layoutPanel.appendChild(contentRow);

        // main canvas area wrapper
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'canvasWrapper';
        canvasWrapper.style.cssText = 'flex:1;position:relative;overflow:hidden;';
        contentRow.appendChild(canvasWrapper);

        if (hideSidebar) {
            UIManager.VERTICALPANELWIDTH = 0;
        } else {
            this.layoutPanel.appendChild(sidePanelCheckbox);
            this.layoutPanel.appendChild(this.sidePanelCheckboxLabel);
            contentRow.appendChild(this.verticalPanel);
        }

        document.body.appendChild(this.layoutPanel);

        this.cv = document.createElement('canvas');
        this.cv.style.cssText = 'display:block;';
        canvasWrapper.appendChild(this.cv);

        window.addEventListener('resize', () => {
            // canvas hasn't been laid out yet, so we can't recenter here
            this.lastResizeTime = Date.now();
            this.repaint();
        });

        this.cvcontext = this.cv.getContext('2d')!;
        this.app.scopeManager = this.scopeManager = new ScopeManager(this.app);

        this.subcircuitBar = new SubcircuitBar();
        document.body.appendChild(this.subcircuitBar.element);

        this.setToolbar(); // calls setCanvasSize()
        this.verticalPanel.appendChild(this.buttonPanel);

        this.resetButton = document.createElement('button');
        this.resetButton.textContent = Locale.LS("Reset");
        this.resetButton.className = 'topButton';
        this.resetButton.addEventListener('click', () => this.resetAction());
        this.buttonPanel.appendChild(this.resetButton);

        this.runStopButton = document.createElement('button');
        this.runStopButton.innerHTML = '<strong>RUN</strong>&nbsp;/&nbsp;Stop';
        this.runStopButton.className = 'topButton';
        this.runStopButton.addEventListener('click', () => this.setSimRunning(!this.simIsRunning()));
        this.buttonPanel.appendChild(this.runStopButton);

        /*
        dumpMatrixButton = new Button("Dump Matrix");
        dumpMatrixButton.addClickHandler(new ClickHandler() {
            public void onClick(ClickEvent event) { dumpMatrix = true; }});
        verticalPanel.add(dumpMatrixButton);// IES for debugging
        */

        if (LoadFile.isSupported()) {
            this.loadFileInput = new LoadFile(this.app);
            this.verticalPanel.appendChild(this.loadFileInput.element);
        }

        let l: HTMLElement;
        l = document.createElement('div');
        l.textContent = Locale.LS("Simulation Speed");
        l.className = 'topSpace';
        this.verticalPanel.appendChild(l);

        // was max of 140
        this.speedBar = new Scrollbar(Scrollbar.HORIZONTAL, 3, 1, 0, 260);
        this.verticalPanel.appendChild(this.speedBar.element);

        l = document.createElement('div');
        l.textContent = Locale.LS("Current Speed");
        l.className = 'topSpace';
        this.verticalPanel.appendChild(l);
        this.currentBar = new Scrollbar(Scrollbar.HORIZONTAL, 50, 1, 1, 100);
        this.verticalPanel.appendChild(this.currentBar.element);

        this.powerLabel = document.createElement('div');
        this.powerLabel.textContent = Locale.LS("Power Brightness");
        this.powerLabel.className = 'topSpace';
        this.verticalPanel.appendChild(this.powerLabel);
        this.powerBar = new Scrollbar(Scrollbar.HORIZONTAL, 50, 1, 1, 100);
        this.verticalPanel.appendChild(this.powerBar.element);
        this.setPowerBarEnable();

        /*
        // for debugging
        Button exportImportButton = new Button("Export/Import");
        exportImportButton.addClickHandler(new ClickHandler() {
            public void onClick(ClickEvent event) {
                String dump = app.dumpCircuit();
                app.importCircuitFromText(dump, false);
            }
        });
        verticalPanel.add(exportImportButton);
        */

        if ((window as any).TestManager && (window as any).TestManager.enabled) {
            const tm = new (window as any).TestManager(this.app);
            tm.createUI(this.verticalPanel);
        }

        l = document.createElement('div');
        l.textContent = Locale.LS("Current Circuit:");
        l.className = 'topSpace';
        this.verticalPanel.appendChild(l);

        this.titleLabel = document.createElement('div');
        this.titleLabel.textContent = "Label";
        this.verticalPanel.appendChild(this.titleLabel);

        this.iFrame = document.createElement('iframe');
        this.iFrame.src = 'iframe.html';
        this.iFrame.style.width = UIManager.VERTICALPANELWIDTH + 'px';
        this.iFrame.style.height = '100px';
        this.iFrame.scrolling = 'no';
        this.verticalPanel.appendChild(this.iFrame);

        this.setGrid();

        this.app.mouse = this.mouse = new MouseManager(this.app, this);
        this.mouse.register(this.cv);
        this.mouse.enableDisableMenuItems();
        this.setiFrameHeight();

        menuBar.addEventListener('click', () => this.mouse.doMainMenuChecks());

        this.registerKeyHandlers();

        window.addEventListener('beforeunload', (event) => {
            // there is a bug in electron that makes it impossible to close the app if this warning is given
            if (this.app.unsavedChanges && !(CirSim as any).isElectron())
                event.returnValue = Locale.LS("Are you sure?  There are unsaved changes.");
        });

        this.setColors(positiveColor, negativeColor, neutralColor, selectColor, currentColor);
        if (!running)
            this.setSimRunning(false);
    }

    static devicePixelRatio(): number {
        return window.devicePixelRatio || 1;
    }

    // ---- Canvas/Layout ----

    checkCanvasSize(): void {
        if (this.cv.width !== Math.round(this.canvasWidth * UIManager.devicePixelRatio()))
            this.setCanvasSize();
    }

    setCanvasSize(): void {
        let width  = window.innerWidth;
        let height = window.innerHeight;
        height -= (this.hideMenu ? 0 : UIManager.MENUBARHEIGHT);

        if (!this.app.isMobile(this.sidePanelCheckboxLabel))
            width -= UIManager.VERTICALPANELWIDTH;
        if (this.menus.toolbarCheckItem.getState())
            height -= UIManager.TOOLBARHEIGHT;

        width  = Math.max(width,  0);
        height = Math.max(height, 0);

        if (this.cv) {
            this.cv.style.width  = width  + 'px';
            this.cv.style.height = height + 'px';
            this.canvasWidth  = width;
            this.canvasHeight = height;
            const scale = UIManager.devicePixelRatio();
            this.cv.width  = Math.round(width  * scale);
            this.cv.height = Math.round(height * scale);
        }

        this.setCircuitArea();

        if (this.subcircuitBar) {
            const barTop = (this.hideMenu ? 0 : UIManager.MENUBARHEIGHT) +
                (this.menus.toolbarCheckItem.getState() ? UIManager.TOOLBARHEIGHT : 0);
            this.subcircuitBar.updatePosition(0, barTop, width);
        }

        // center circuit if we have no transform, or if a resize happened in the last second
        if (this.app.transform[0] === 0 || (Date.now() - this.lastResizeTime < 1000))
            this.centerCircuit();
    }

    setCircuitArea(): void {
        const height = this.canvasHeight;
        const width  = this.canvasWidth;
        let h: number;
        if (this.app.scopeManager == null || this.app.scopeManager.scopeCount === 0)
            h = 0;
        else
            h = Math.round(height * this.app.scopeManager.scopeHeightFraction);
        this.app.circuitArea = new Rectangle(0, 0, width, height - h);
    }

    centerCircuit(): void {
        if (this.elmList == null)
            return;

        const bounds = this.getCircuitBounds();
        this.setCircuitArea();

        let scale = 1;
        let cheight = this.app.circuitArea.height;

        if (this.app.scopeManager.scopeCount === 0 && this.app.circuitArea.width < 800) {
            const h = Math.round(cheight * this.app.scopeManager.scopeHeightFraction);
            cheight -= h;
        }

        if (bounds != null)
            scale = Math.min(this.app.circuitArea.width / (bounds.width + 140),
                             cheight / (bounds.height + 100));
        scale = Math.min(scale, 1.5);

        this.app.transform[0] = this.app.transform[3] = scale;
        this.app.transform[1] = this.app.transform[2] = this.app.transform[4] = this.app.transform[5] = 0;
        if (bounds != null) {
            this.app.transform[4] = (this.app.circuitArea.width - bounds.width * scale) / 2 - bounds.x * scale;
            this.app.transform[5] = (cheight - bounds.height * scale) / 2 - bounds.y * scale;
        }
    }

    getCircuitBounds(): Rectangle | null {
        let minx = 30000, maxx = -30000, miny = 30000, maxy = -30000;
        for (const ce of this.elmList) {
            if (!ce.isCenteredText()) {
                minx = UIManager.min(ce.x, UIManager.min(ce.x2, minx));
                maxx = UIManager.max(ce.x, UIManager.max(ce.x2, maxx));
            }
            miny = UIManager.min(ce.y, UIManager.min(ce.y2, miny));
            maxy = UIManager.max(ce.y, UIManager.max(ce.y2, maxy));
            // use boundingBox for elements like chips/subcircuits whose
            // visual extent exceeds their x/y coordinates
            const bb = ce.getBoundingBox();
            if (bb != null) {
                if (!ce.isCenteredText()) {
                    minx = UIManager.min(bb.x, minx);
                    maxx = UIManager.max(bb.x + bb.width, maxx);
                }
                miny = UIManager.min(bb.y, miny);
                maxy = UIManager.max(bb.y + bb.height, maxy);
            }
        }
        if (minx > maxx)
            return null;
        return new Rectangle(minx, miny, maxx - minx, maxy - miny);
    }

    // ---- Repaint ----

    repaint(): void {
        if (!this.needsRepaint) {
            this.needsRepaint = true;
            setTimeout(() => {
                this.updateCircuit();
                this.needsRepaint = false;
            }, this.app.FASTTIMER);
        }
    }

    // ---- Sim Running ----

    setSimRunning(s: boolean): void {
        if (s) {
            if (this.app.stopMessage != null)
                return;
            this.app.simRunning = true;
            this.runStopButton.innerHTML = '<strong>RUN</strong>&nbsp;/&nbsp;Stop';
            this.runStopButton.className = 'topButton';
            this.app.timer.scheduleRepeating(this.app.FASTTIMER);
        } else {
            this.app.simRunning = false;
            this.runStopButton.innerHTML = 'Run&nbsp;/&nbsp;<strong>STOP</strong>';
            this.runStopButton.className = 'topButton-red';
            this.app.timer.cancel();
            this.repaint();
        }
    }

    simIsRunning(): boolean {
        return this.app.simRunning;
    }

    // ---- Drawing/Display ----

    updateCircuit(): void {
        const perfmon = new PerfMonitor();
        perfmon.startContext("updateCircuit()");

        this.checkCanvasSize();

        let didAnalyze = this.app.analyzeFlag;
        if (this.app.analyzeFlag || this.app.dcAnalysisFlag) {
            perfmon.startContext("analyzeCircuit()");
            this.app.sim.analyzeCircuit();
            this.app.analyzeFlag = false;
            perfmon.stopContext();
        }

        if (this.app.sim.needsStamp && this.app.simRunning) {
            perfmon.startContext("stampCircuit()");
            try {
                this.app.sim.preStampAndStampCircuit();
            } catch (e) {
                this.app.sim.stop("Exception in stampCircuit()", null);
                CirSim.console("Exception in stampCircuit: " + e);
            }
            perfmon.stopContext();
        }

        if (this.app.stopElm != null && this.app.stopElm !== this.mouse.getMouseElm())
            this.app.stopElm.setMouseElm(true);

        this.app.scopeManager.setupScopes();

        const g = new Graphics(this.cvcontext);

        if (this.menus.printableCheckItem.getState()) {
            CircuitElm.whiteColor = Color.black;
            CircuitElm.lightGrayColor = Color.black;
            g.setColor(Color.white);
            this.cv.style.backgroundColor = '#fff';
        } else {
            CircuitElm.whiteColor = Color.white;
            CircuitElm.lightGrayColor = Color.lightGray;
            g.setColor(Color.black);
            this.cv.style.backgroundColor = '#000';
        }

        g.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        if (this.app.simRunning) {
            if (this.app.sim.needsStamp)
                CirSim.console("needsStamp while simRunning?");

            perfmon.startContext("runCircuit()");
            try {
                this.app.sim.runCircuit(didAnalyze);
            } catch (e) {
                CirSim.console("exception in runCircuit " + e);
            }
            perfmon.stopContext();
        }

        const sysTime = Date.now();
        if (this.app.simRunning) {
            if (this.lastTime !== 0) {
                const inc = sysTime - this.lastTime;
                let c = this.currentBar.getValue();
                c = Math.exp(c / 3.5 - 14.2);
                CircuitElm.currentMult = 1.7 * inc * c;
                if (!this.menus.conventionCheckItem.getState())
                    CircuitElm.currentMult = -CircuitElm.currentMult;
            }
            this.lastTime = sysTime;
        } else {
            this.lastTime = 0;
        }

        if (sysTime - this.secTime >= 1000) {
            this.framerate = this.frames;
            this.steprate = this.steps;
            this.frames = 0;
            this.steps = 0;
            this.secTime = sysTime;
        }

        CircuitElm.powerMult = Math.exp(this.powerBar.getValue() / 4.762 - 7);

        perfmon.startContext("graphics");

        g.setFont(CircuitElm.unitsFont);

        this.cvcontext.lineCap = 'round';

        if (this.menus.noEditCheckItem.getState())
            g.drawLock(20, 30);

        g.setColor(Color.white);

        const scale = UIManager.devicePixelRatio();
        this.cvcontext.setTransform(
            this.app.transform[0] * scale, 0, 0,
            this.app.transform[3] * scale,
            this.app.transform[4] * scale,
            this.app.transform[5] * scale);

        perfmon.startContext("elm.draw()");
        for (const ce of this.elmList) {
            if (this.menus.powerCheckItem.getState())
                g.setColor(Color.gray);
            ce.draw(g);
        }
        perfmon.stopContext();

        if (this.mouse.mouseMode !== MouseManager.MODE_DRAG_ROW &&
                this.mouse.mouseMode !== MouseManager.MODE_DRAG_COLUMN) {
            for (let i = 0; i !== this.app.postDrawList.length; i++)
                CircuitElm.drawPost(g, this.app.postDrawList[i]);
        }

        if (this.mouse.tempMouseMode === MouseManager.MODE_DRAG_ROW ||
                this.mouse.tempMouseMode === MouseManager.MODE_DRAG_COLUMN ||
                this.mouse.tempMouseMode === MouseManager.MODE_DRAG_POST ||
                this.mouse.tempMouseMode === MouseManager.MODE_DRAG_SELECTED) {
            for (const ce of this.elmList) {
                if (ce !== this.mouse.getMouseElm() || this.mouse.tempMouseMode !== MouseManager.MODE_DRAG_POST) {
                    g.setColor(Color.gray);
                    g.fillOval(ce.x - 3, ce.y - 3, 7, 7);
                    g.fillOval(ce.x2 - 3, ce.y2 - 3, 7, 7);
                } else {
                    ce.drawHandles(g, CircuitElm.selectColor);
                }
            }
        }

        if (this.mouse.tempMouseMode === MouseManager.MODE_SELECT && this.mouse.getMouseElm() != null) {
            this.mouse.getMouseElm().drawHandles(g, CircuitElm.selectColor);
            if (this.mouse.getMouseElm()!.isRoutedWireElm() && this.mouse.mouseCursorX >= 0) {
                const rw = this.mouse.getMouseElm() as any;
                const gx = this.mouse.inverseTransformX(this.mouse.mouseCursorX);
                const gy = this.mouse.inverseTransformY(this.mouse.mouseCursorY);
                const sp: Point | null = rw.getSnapPointOnWire(gx, gy);
                if (sp != null) {
                    g.setColor(CircuitElm.selectColor);
                    g.fillOval(sp.x - 4, sp.y - 4, 9, 9);
                }
            }
        }

        if (this.mouse.dragElm != null &&
                (this.mouse.dragElm.x !== this.mouse.dragElm.x2 ||
                 this.mouse.dragElm.y !== this.mouse.dragElm.y2)) {
            this.mouse.dragElm.draw(g);
            this.mouse.dragElm.drawHandles(g, CircuitElm.selectColor);
        }

        for (let i = 0; i !== this.app.badConnectionList.length; i++) {
            const cn: Point = this.app.badConnectionList[i];
            g.setColor(Color.red);
            g.fillOval(cn.x - 3, cn.y - 3, 7, 7);
        }

        if (this.mouse.selectedArea != null) {
            g.setColor(CircuitElm.selectColor);
            g.drawRect(this.mouse.selectedArea.x, this.mouse.selectedArea.y,
                       this.mouse.selectedArea.width, this.mouse.selectedArea.height);
        }

        if (this.menus.crossHairCheckItem.getState() && this.mouse.mouseCursorX >= 0
                && this.mouse.mouseCursorX <= this.app.circuitArea.width
                && this.mouse.mouseCursorY <= this.app.circuitArea.height) {
            g.setColor(Color.gray);
            const x = this.app.snapGrid(this.mouse.inverseTransformX(this.mouse.mouseCursorX));
            const y = this.app.snapGrid(this.mouse.inverseTransformY(this.mouse.mouseCursorY));
            g.drawLine(x, this.mouse.inverseTransformY(0), x, this.mouse.inverseTransformY(this.app.circuitArea.height));
            g.drawLine(this.mouse.inverseTransformX(0), y, this.mouse.inverseTransformX(this.app.circuitArea.width), y);
        }

        /*if (WireRouter.lastRouter != null)
            WireRouter.lastRouter.drawGrid(g.context, true);*/

        this.cvcontext.setTransform(scale, 0, 0, scale, 0, 0);

        perfmon.startContext("drawBottomArea()");
        this.drawBottomArea(g);
        perfmon.stopContext();

        g.setColor(Color.white);

        perfmon.stopContext(); // graphics

        if (this.app.stopElm != null && this.app.stopElm !== this.mouse.getMouseElm())
            this.app.stopElm.setMouseElm(false);

        this.frames++;

        if (this.app.dcAnalysisFlag) {
            this.app.dcAnalysisFlag = false;
            this.app.analyzeFlag = true;
        }

        this.lastFrameTime = this.lastTime;

        perfmon.stopContext(); // updateCircuit

        if ((this.app as any).developerMode) {
            let height = 15;
            const increment = 15;
            g.drawString("Framerate: " + CircuitElm.showFormat.format(this.framerate), 10, height);
            g.drawString("Steprate: " + CircuitElm.showFormat.format(this.steprate), 10, height += increment);
            g.drawString("Steprate/iter: " + CircuitElm.showFormat.format(this.steprate / this.app.getIterCount()), 10, height += increment);
            g.drawString("iterc: " + CircuitElm.showFormat.format(this.app.getIterCount()), 10, height += increment);
            g.drawString("Frames: " + this.frames, 10, height += increment);

            height += (increment * 2);

            const perfmonResult = PerfMonitor.buildString(perfmon).toString();
            const splits = perfmonResult.split("\n");
            for (let x = 0; x < splits.length; x++)
                g.drawString(splits[x], 10, height + (increment * x));
        }

        try {
            this.app.jsInterface.callUpdateHook();
        } catch (e) {}
    }

    drawBottomArea(g: Graphics): void {
        let leftX = 0;
        let h = 0;
        if (this.app.stopMessage == null && this.app.scopeManager.scopeCount === 0) {
            leftX = UIManager.max(this.canvasWidth - CirSim.infoWidth, 0);
            const h0 = Math.round(this.canvasHeight * this.app.scopeManager.scopeHeightFraction);
            h = (this.mouse.getMouseElm() == null) ? 70 : h0;
            if (this.hideInfoBox)
                h = 0;
        }
        if (this.app.stopMessage != null && this.app.circuitArea.height > this.canvasHeight - 30)
            h = 30;
        g.setColor(this.menus.printableCheckItem.getState() ? "#eee" : "#111");
        g.fillRect(leftX, this.app.circuitArea.height - h,
                   this.app.circuitArea.width, this.canvasHeight - this.app.circuitArea.height + h);
        g.setFont(CircuitElm.unitsFont);
        let ct = this.app.scopeManager.scopeCount;
        if (this.app.stopMessage != null)
            ct = 0;
        (this.app.scopeManager as any).Scope?.clearCursorInfo?.();
        for (let i = 0; i !== ct; i++)
            this.app.scopeManager.scopes[i].selectScope(this.mouse.mouseCursorX, this.mouse.mouseCursorY);
        if (this.app.scopeElmArr != null)
            for (let i = 0; i !== this.app.scopeElmArr.length; i++)
                this.app.scopeElmArr[i].selectScope(this.mouse.mouseCursorX, this.mouse.mouseCursorY);
        for (let i = 0; i !== ct; i++)
            this.app.scopeManager.scopes[i].draw(g);
        if (this.mouse.mouseWasOverSplitter) {
            g.setColor(CircuitElm.selectColor);
            g.setLineWidth(4.0);
            g.drawLine(0, this.app.circuitArea.height - 2, this.app.circuitArea.width, this.app.circuitArea.height - 2);
            g.setLineWidth(1.0);
        }
        this.app.scopeManager.drawHoverScope(g, this.canvasWidth, this.canvasHeight);
        g.setColor(CircuitElm.whiteColor);

        if (this.app.stopMessage != null) {
            g.drawString(this.app.stopMessage, 10, this.canvasHeight - 10);
        } else if (!this.hideInfoBox) {
            const info: (string | null)[] = new Array(10).fill(null);
            if (this.mouse.getMouseElm() != null) {
                if (this.mouse.mousePost === -1) {
                    this.mouse.getMouseElm().getInfo(info);
                    info[0] = Locale.LS(info[0]!);
                    if (info[1] != null)
                        info[1] = Locale.LS(info[1]);

                    if ((this.app as any).developerMode) {
                        // show node numbers for debugging
                        let ni: number;
                        for (ni = 0; info[ni] != null && ni < info.length - 1; ni++)
                            ;
                        try {
                            let nodeStr = "nodes:";
                            for (let nn = 0; nn < this.mouse.getMouseElm().getNodeCount(); nn++)
                                nodeStr += " " + this.mouse.getMouseElm().getNode(nn).index;
                            info[ni] = nodeStr;
                        } catch (e) {}
                    }
                } else {
                    info[0] = "V = " +
                        CircuitElm.getUnitText(this.mouse.getMouseElm().getPostVoltage(this.mouse.mousePost), "V");
                }
            } else {
                info[0] = "t = " + CircuitElm.getTimeText(this.app.sim.t);
                const timerate = 160 * this.app.getIterCount() * this.app.sim.timeStep;
                if (timerate >= 0.1)
                    info[0] += " (" + CircuitElm.showFormat.format(timerate) + "x)";
                info[1] = Locale.LS("time step = ") + CircuitElm.getTimeText(this.app.sim.timeStep);
            }
            if (this.app.hintType !== -1) {
                let i: number;
                for (i = 0; info[i] != null; i++)
                    ;
                const s = this.app.getHint();
                if (s == null)
                    this.app.hintType = -1;
                else
                    info[i] = s;
            }
            let x = leftX + 5;
            if (ct !== 0)
                x = this.app.scopeManager.scopes[ct - 1].rightEdge() + 20;

            let i: number;
            for (i = 0; info[i] != null; i++)
                ;
            const badnodes = this.app.badConnectionList.length;
            if (badnodes > 0)
                info[i++] = badnodes + (badnodes === 1 ?
                    Locale.LS(" bad connection") : Locale.LS(" bad connections"));
            if (this.app.savedFlag)
                info[i++] = "(saved)";

            const ybase = this.app.circuitArea.height - h;
            for (i = 0; info[i] != null; i++)
                g.drawString(info[i]!, x, ybase + 15 * (i + 1));
        }
    }

    getBackgroundColor(): Color {
        if (this.menus.printableCheckItem.getState())
            return Color.white;
        return Color.black;
    }

    // ---- UI Controls ----

    setPowerBarEnable(): void {
        if (this.menus.powerCheckItem.getState()) {
            this.powerLabel.classList.remove('disabled');
            this.powerBar.enable();
        } else {
            this.powerLabel.classList.add('disabled');
            this.powerBar.disable();
        }
    }

    isReadOnly(): boolean {
        return this.menus.noEditCheckItem.getState() || this.subcircuitStack.length > 0;
    }

    // show an element (menu bar) as a floating context-menu popup at the given client coordinates
    showContextPanel(content: HTMLElement, clientX: number, clientY: number): void {
        // remove any existing context panel
        if (this.contextPanel != null) {
            this.contextPanel.remove();
            this.contextPanel = null;
        }

        content.className = 'elmContextMenu';
        content.style.position = 'fixed';
        content.style.left = clientX + 'px';
        content.style.top  = clientY + 'px';
        document.body.appendChild(content);
        this.contextPanel = content;

        // clamp to viewport
        const w = content.offsetWidth;
        const h = content.offsetHeight;
        const clampedX = Math.max(0, Math.min(clientX, window.innerWidth  - w));
        const clampedY = Math.max(0, Math.min(clientY, window.innerHeight - h));
        if (clampedX !== clientX || clampedY !== clientY) {
            content.style.left = clampedX + 'px';
            content.style.top  = clampedY + 'px';
        }

        // close on outside click
        const close = (evt: MouseEvent) => {
            if (!content.contains(evt.target as Node)) {
                content.remove();
                this.contextPanel = null;
                document.removeEventListener('mousedown', close, true);
            }
        };
        document.addEventListener('mousedown', close, true);
    }

    enableItems(): void {
    }

    setToolbar(): void {
        this.toolbar.element.style.display =
            this.menus.toolbarCheckItem.getState() ? '' : 'none';
        this.setCanvasSize();
    }

    updateToolbar(): void {
        if (this.mouse.dragElm != null)
            this.toolbar.setModeLabel(Locale.LS("Drag Mouse"));
        else
            this.toolbar.setModeLabel(Locale.LS("Mode: ") + (this.app as any).classToLabelMap?.get(this.mouseModeStr));
        this.toolbar.highlightButton(this.mouseModeStr);
    }

    pushSubcircuit(cce: any, allElms: CircuitElm[]): void {
        this.subcircuitStack.push(cce);
        this.elmList = allElms;
        this.updateSubcircuitPath();
        this.app.sim.analyzeCircuit();
        this.centerCircuit();
    }

    popSubcircuit(): void {
        if (this.subcircuitStack.length === 0)
            return;
        this.subcircuitStack.pop();
        if (this.subcircuitStack.length === 0)
            this.elmList = this.app.elmList;
        else {
            // re-enter the current top of stack
            const cce = this.subcircuitStack[this.subcircuitStack.length - 1];
            this.elmList = cce.buildDisplayElmList();
        }
        this.updateSubcircuitPath();
        this.app.sim.analyzeCircuit();
        this.centerCircuit();
    }

    updateSubcircuitPath(): void {
        if (this.subcircuitStack.length === 0) {
            this.subcircuitBar.setSubcircuitPath(null);
        } else {
            let sb = Locale.LS("Viewing: ");
            for (let i = 0; i < this.subcircuitStack.length; i++) {
                if (i > 0) sb += " > ";
                sb += this.subcircuitStack[i].modelName;
            }
            this.subcircuitBar.setSubcircuitPath(sb);
        }
    }

    updateContextButtons(): void {
        this.subcircuitBar.setContextInfo((this.app as any).getEditingModelName());
    }

    setMouseMode(mode: number): void {
        this.mouse.mouseMode = mode;
        if (mode === MouseManager.MODE_ADD_ELM)
            this.setCursorStyle("cursorCross");
        else
            this.setCursorStyle("cursorPointer");
    }

    setCursorStyle(s: string): void {
        if (this.lastCursorStyle != null)
            this.cv.classList.remove(this.lastCursorStyle);
        this.cv.classList.add(s);
        this.lastCursorStyle = s;
    }

    setGrid(): void {
        this.app.gridSize = (this.menus.smallGridCheckItem.getState()) ? 8 : 16;
        this.app.gridMask = ~(this.app.gridSize - 1);
        this.app.gridRound = this.app.gridSize / 2 - 1;
    }

    // ---- Dialogs ----

    dialogIsShowing(): boolean {
        if (CirSim.editDialog != null && CirSim.editDialog.isShowing())
            return true;
        if (CirSim.customLogicEditDialog != null && CirSim.customLogicEditDialog.isShowing())
            return true;
        if (CirSim.diodeModelEditDialog != null && CirSim.diodeModelEditDialog.isShowing())
            return true;
        if (CirSim.dialogShowing != null && CirSim.dialogShowing.isShowing())
            return true;
        if (this.contextPanel != null && (this.contextPanel as any).isShowing?.())
            return true;
        if (CirSim.scrollValuePopup != null && CirSim.scrollValuePopup.isShowing())
            return true;
        if (CirSim.typeScrollPopup != null && CirSim.typeScrollPopup.isShowing())
            return true;
        if (CirSim.aboutBox != null && CirSim.aboutBox.isShowing())
            return true;
        return false;
    }

    // ---- Keyboard ----

    private registerKeyHandlers(): void {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup',   (e) => this.onKeyUp(e));
        document.addEventListener('keypress', (e) => this.onKeyPress(e));
    }

    private onKeyDown(e: KeyboardEvent): void {
        const code = e.keyCode;

        // Handle Shift key for net highlighting (works regardless of dialog state)
        if (code === 16) {
            this.mouse.netHighlightKeyHeld = true;
            this.mouse.updateNetHighlight();
            this.app.repaint();
        }

        if (this.dialogIsShowing()) {
            if (CirSim.scrollValuePopup != null && CirSim.scrollValuePopup.isShowing()) {
                if (code === KEY_ESCAPE || code === KEY_SPACE)
                    CirSim.scrollValuePopup.close(false);
                if (code === KEY_ENTER)
                    CirSim.scrollValuePopup.close(true);
            }
            if (CirSim.typeScrollPopup != null && CirSim.typeScrollPopup.isShowing()) {
                if (code === KEY_ESCAPE || code === KEY_SPACE)
                    CirSim.typeScrollPopup.close(false);
                if (code === KEY_ENTER)
                    CirSim.typeScrollPopup.close(true);
            }

            let dlg = CirSim.editDialog;
            if (CirSim.diodeModelEditDialog != null) dlg = CirSim.diodeModelEditDialog;
            if (CirSim.customLogicEditDialog != null) dlg = CirSim.customLogicEditDialog;
            if (CirSim.dialogShowing != null) dlg = CirSim.dialogShowing;
            if (dlg != null && dlg.isShowing()) {
                if (code === KEY_ESCAPE) dlg.closeDialog();
                if (code === KEY_ENTER)  dlg.enterPressed();
            }
            return;
        }

        if (this.isReadOnly()) {
            this.handleReadonlyKeyDown(e, code);
            return;
        }

        // handle key-up via keydown when checking arrow/delete etc.
        if (code === KEY_BACKSPACE || code === KEY_DELETE) {
            if (this.app.scopeManager.scopeSelected !== -1) {
                this.app.scopeManager.scopes[this.app.scopeManager.scopeSelected].setElm(null);
                this.app.scopeManager.scopeSelected = -1;
            } else {
                this.mouse.menuElm = null;
                this.app.undoManager.pushUndo();
                this.app.commands.doDelete(true);
                e.preventDefault();
            }
        }
        if (code === KEY_ESCAPE) {
            this.setMouseMode(MouseManager.MODE_SELECT);
            this.mouseModeStr = "Select";
            this.updateToolbar();
            this.mouse.tempMouseMode = this.mouse.mouseMode;
            e.preventDefault();
        }

        if (code === KEY_LEFT || code === KEY_RIGHT || code === KEY_UP || code === KEY_DOWN) {
            let dx = 0, dy = 0;
            if (code === KEY_LEFT)  dx = -this.app.gridSize;
            if (code === KEY_RIGHT) dx = this.app.gridSize;
            if (code === KEY_UP)    dy = -this.app.gridSize;
            if (code === KEY_DOWN)  dy = this.app.gridSize;
            let hasSel = false;
            for (let i = 0; i !== this.elmList.length; i++)
                if (this.elmList[i].isSelected()) { hasSel = true; break; }
            if (hasSel) {
                this.app.undoManager.pushUndo();
                for (let i = 0; i !== this.elmList.length; i++) {
                    const ce = this.elmList[i];
                    if (ce.isSelected())
                        ce.move(dx, dy);
                }
                this.app.needAnalyze();
                e.preventDefault();
            }
        }

        if (e.ctrlKey || e.metaKey) {
            if (code === KEY_C) { this.app.commands.menuPerformed("key", "copy");              e.preventDefault(); }
            if (code === KEY_X) { this.app.commands.menuPerformed("key", "cut");               e.preventDefault(); }
            if (code === KEY_V) { this.app.commands.menuPerformed("key", "paste");             e.preventDefault(); }
            if (code === KEY_Z) { this.app.commands.menuPerformed("key", "undo");              e.preventDefault(); }
            if (code === KEY_Y) { this.app.commands.menuPerformed("key", "redo");              e.preventDefault(); }
            if (code === KEY_D) { this.app.commands.menuPerformed("key", "duplicate");         e.preventDefault(); }
            if (code === KEY_A) { this.app.commands.menuPerformed("key", "selectAll");         e.preventDefault(); }
            if (code === KEY_P) { this.app.commands.menuPerformed("key", "print");             e.preventDefault(); }
            if (code === KEY_N && (CirSim as any).isElectron()) {
                this.app.commands.menuPerformed("key", "newwindow");
                e.preventDefault();
            }
            if (code === KEY_S) {
                let cmd = "exportaslocalfile";
                if ((CirSim as any).isElectron())
                    cmd = this.menus.saveFileItem.isEnabled() ? "save" : "saveas";
                this.app.commands.menuPerformed("key", cmd);
                e.preventDefault();
            }
            if (code === KEY_O) { this.app.commands.menuPerformed("key", "importfromlocalfile"); e.preventDefault(); }
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        const code = e.keyCode;

        // Handle Shift key for net highlighting (works regardless of dialog state)
        if (code === 16) {
            this.mouse.netHighlightKeyHeld = false;
            this.mouse.updateNetHighlight();
            this.app.repaint();
        }

        if (this.dialogIsShowing())
            return;

        if (this.isReadOnly())
            return;

        // handle momentary switches with keyboard shortcuts
        const keyStr = String.fromCharCode(code).toLowerCase();
        let released = false;
        for (let i = 0; i !== this.elmList.length; i++) {
            const ce = this.elmList[i];
            if (ce instanceof SwitchElm) {
                const se = ce as SwitchElm;
                if (se.momentary && se.keyShortcut != null && se.keyShortcut === keyStr) {
                    se.mouseUp();
                    released = true;
                }
            }
        }
        if (released) {
            this.mouse.heldSwitchElm = null;
            this.app.needAnalyze();
            this.app.repaint();
        }
    }

    private onKeyPress(e: KeyboardEvent): void {
        const cc = e.charCode;

        if (this.dialogIsShowing())
            return;

        if (cc === 45 /* '-' */) {
            this.app.commands.menuPerformed("key", "zoomout");
            e.preventDefault();
        }
        if (cc === 43 /* '+' */ || cc === 61 /* '=' */) {
            this.app.commands.menuPerformed("key", "zoomin");
            e.preventDefault();
        }
        if (cc === 48 /* '0' */) {
            this.app.commands.menuPerformed("key", "zoom100");
            e.preventDefault();
        }
        if (cc === 47 /* '/' */ && this.app.shortcuts[47] == null) {
            this.app.commands.menuPerformed("key", "search");
            e.preventDefault();
        }

        if (this.isReadOnly())
            return;

        // check if any switches have a keyboard shortcut matching this key
        if (cc > 32 && cc < 127) {
            const keyStr = String.fromCharCode(cc).toLowerCase();
            let toggled = false;
            if (!e.repeat) {
                for (let i = 0; i !== this.elmList.length; i++) {
                    const ce = this.elmList[i];
                    if (ce instanceof SwitchElm) {
                        const se = ce as SwitchElm;
                        if (se.keyShortcut != null && se.keyShortcut === keyStr) {
                            se.toggle();
                            if (!se.isLogicInputElm())
                                this.app.needAnalyze();
                            toggled = true;
                        }
                    }
                }
            }
            e.preventDefault();
            if (toggled) {
                this.app.repaint();
            } else {
                const c = this.app.shortcuts[cc];
                if (c == null)
                    return;
                this.setMouseMode(MouseManager.MODE_ADD_ELM);
                this.mouseModeStr = c;
                this.updateToolbar();
                this.mouse.tempMouseMode = this.mouse.mouseMode;
            }
        }
        if (cc === KEY_SPACE) {
            this.setMouseMode(MouseManager.MODE_SELECT);
            this.mouseModeStr = "Select";
            this.updateToolbar();
            this.mouse.tempMouseMode = this.mouse.mouseMode;
            e.preventDefault();
        }
    }

    private handleReadonlyKeyDown(e: KeyboardEvent, code: number): void {
        // readonly mode — still allow zoom keys via keypress, nothing here for keydown
    }

    // ---- Widget management ----

    createNewLoadFile(): void {
        if (this.loadFileInput == null) return;
        const newlf = new LoadFile(this.app);
        this.verticalPanel.replaceChild(newlf.element, this.loadFileInput.element);
        this.loadFileInput = newlf;
    }

    addWidgetToVerticalPanel(w: HTMLElement): void {
        if (this.verticalPanel == null)
            return;
        if (this.iFrame != null) {
            this.verticalPanel.insertBefore(w, this.iFrame);
            this.setiFrameHeight();
        } else {
            this.verticalPanel.appendChild(w);
        }
    }

    removeWidgetFromVerticalPanel(w: HTMLElement): void {
        if (this.verticalPanel == null)
            return;
        if (w.parentNode === this.verticalPanel)
            this.verticalPanel.removeChild(w);
        if (this.iFrame != null)
            this.setiFrameHeight();
    }

    // ---- Other ----

    setCircuitTitle(s: string | null): void {
        this.titleLabel.textContent = s == null ? null : s.replace(/_/g, "_​");
        if (s != null && s.length > 0)
            document.title = s + " - " + CirSim.baseTitle;
        else
            document.title = CirSim.baseTitle;
    }

    allowSave(b: boolean): void {
        if (this.menus.saveFileItem != null)
            this.menus.saveFileItem.setEnabled(b);
    }

    isSelection(): boolean {
        for (const ce of this.elmList)
            if (ce.isSelected())
                return true;
        return false;
    }

    resetAction(): void {
        this.app.analyzeFlag = true;
        if (this.app.autoDCOnReset)
            this.app.dcAnalysisFlag = true;
        if (this.app.sim.t === 0)
            this.setSimRunning(true);
        this.app.sim.resetTime();
        for (const ce of this.elmList)
            ce.reset();
        this.app.scopeManager.resetGraphs();
        this.repaint();
    }

    composeSubcircuitMenu(): void {
        if (this.menus.subcircuitMenuBar == null)
            return;

        for (let mi = 0; mi !== 2; mi++) {
            const menu = this.menus.subcircuitMenuBar[mi];
            menu.clearItems();
            const list: any[] = (window as any).CustomCompositeModel?.getModelList() ?? [];
            for (let i = 0; i !== list.length; i++) {
                const name: string = list[i].name;
                menu.addCheckboxItem(this.getClassCheckItem(Locale.LS("Add ") + name, "CustomCompositeElm:" + name));
            }
        }
        MouseManager.lastSubcircuitMenuUpdate = (window as any).CustomCompositeModel?.sequenceNumber ?? 0;
    }

    getClassCheckItem(s: string, t: string): CheckboxMenuItem {
        if ((this.app as any).classToLabelMap == null)
            (this.app as any).classToLabelMap = new Map<string, string>();
        (this.app as any).classToLabelMap.set(t, s);

        let shortcut = "";
        let elm: any = null;
        try {
            elm = this.app.constructElement(t, 0, 0);
        } catch (e) {
            this.app.console("exception: " + e);
        }

        this.app.register(t, elm);
        if (elm == null && t.indexOf("Elm") >= 0)
            this.app.console("can't create class: " + t);
        if (elm != null) {
            if (elm.needsShortcut()) {
                shortcut += String.fromCharCode(elm.getShortcut());
                if (this.app.shortcuts[elm.getShortcut()] != null &&
                        this.app.shortcuts[elm.getShortcut()] !== t)
                    this.app.console("already have shortcut for " + String.fromCharCode(elm.getShortcut()) + " " + elm);
                this.app.shortcuts[elm.getShortcut()] = t;
            }
            elm.delete();
        }

        const mi = (shortcut === "")
            ? new CheckboxMenuItem(s)
            : new CheckboxMenuItem(s, shortcut);
        mi.setScheduledCommand(new MyCommand("main", t));
        this.mainMenuItems.push(mi);
        this.mainMenuItemNames.push(t);
        return mi;
    }

    setiFrameHeight(): void {
        if (this.iFrame == null)
            return;
        let cumheight = 0;
        const children = Array.from(this.verticalPanel.children) as HTMLElement[];
        for (const child of children) {
            if (child === this.iFrame) break;
            if (this.loadFileInput && child === this.loadFileInput.element) continue;
            cumheight += child.offsetHeight;
            if (child.className.includes('topSpace'))
                cumheight += 12;
        }
        let ih = window.innerHeight - (this.hideMenu ? 0 : UIManager.MENUBARHEIGHT) - cumheight;
        if (ih < 0) ih = 0;
        this.iFrame.style.height = ih + 'px';
    }

    setColors(positiveColor: string | null, negativeColor: string | null,
              neutralColor: string | null, selectColor: string | null,
              currentColor: string | null): void {
        try {
            if (positiveColor == null)
                positiveColor = localStorage.getItem("positiveColor");
            if (negativeColor == null)
                negativeColor = localStorage.getItem("negativeColor");
            if (neutralColor == null)
                neutralColor = localStorage.getItem("neutralColor");
            if (selectColor == null)
                selectColor = localStorage.getItem("selectColor");
            if (currentColor == null)
                currentColor = localStorage.getItem("currentColor");
        } catch (e) {}

        if (positiveColor != null)
            CircuitElm.positiveColor = new Color(decodeURIComponent(positiveColor));
        else if (this.getOptionFromStorage("alternativeColor", false))
            CircuitElm.positiveColor = Color.blue;
        else
            CircuitElm.positiveColor = Color.green;

        if (negativeColor != null)
            CircuitElm.negativeColor = new Color(decodeURIComponent(negativeColor));
        else
            CircuitElm.negativeColor = Color.red;

        if (neutralColor != null)
            CircuitElm.neutralColor = new Color(decodeURIComponent(neutralColor));
        else
            CircuitElm.neutralColor = Color.gray;

        if (selectColor != null)
            CircuitElm.selectColor = new Color(decodeURIComponent(selectColor));
        else
            CircuitElm.selectColor = Color.cyan;

        if (currentColor != null)
            CircuitElm.currentColor = new Color(decodeURIComponent(currentColor));
        else
            CircuitElm.currentColor = this.menus.conventionCheckItem.getState() ? Color.yellow : Color.cyan;

        CircuitElm.setColorScale();
    }

    setWheelSensitivity(): void {
        this.mouse.wheelSensitivity = 1;
        try {
            const s = localStorage.getItem("wheelSensitivity");
            if (s != null)
                this.mouse.wheelSensitivity = parseFloat(s);
        } catch (e) {}
    }

    getOptionFromStorage(key: string, val: boolean): boolean {
        try {
            const s = localStorage.getItem(key);
            if (s == null) return val;
            return s === "true";
        } catch (e) {
            return val;
        }
    }

    setOptionInStorage(key: string, val: boolean): void {
        try {
            localStorage.setItem(key, val ? "true" : "false");
        } catch (e) {}
    }

    saveShortcuts(): void {
        try {
            let str = "1";
            for (let i = 0; i !== this.app.shortcuts.length; i++) {
                const sh = this.app.shortcuts[i];
                if (sh == null) continue;
                str += ";" + i + "=" + sh;
            }
            localStorage.setItem("shortcuts", str);
        } catch (e) {}
    }

    loadShortcuts(): void {
        try {
            const str = localStorage.getItem("shortcuts");
            if (str == null) return;
            const keys = str.split(";");

            for (let i = 0; i !== this.app.shortcuts.length; i++)
                this.app.shortcuts[i] = null;

            for (let i = 0; i !== this.mainMenuItems.length; i++) {
                const item = this.mainMenuItems[i];
                if (item.getShortcut().length > 1) break;
                item.setShortcut("");
            }

            for (let i = 1; i < keys.length; i++) {
                const arr = keys[i].split("=");
                if (arr.length !== 2) continue;
                const c = parseInt(arr[0]);
                const className = arr[1];
                this.app.shortcuts[c] = className;

                for (let j = 0; j !== this.mainMenuItems.length; j++) {
                    if (this.mainMenuItemNames[j] === className) {
                        this.mainMenuItems[j].setShortcut(String.fromCharCode(c));
                        break;
                    }
                }
            }
        } catch (e) {}
    }

    getLabelTextForClass(cls: string): string | undefined {
        return (this.app as any).classToLabelMap?.get(cls);
    }

    static min(a: number, b: number): number { return (a < b) ? a : b; }
    static max(a: number, b: number): number { return (a > b) ? a : b; }
}
