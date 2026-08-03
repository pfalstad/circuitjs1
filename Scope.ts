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

import { CircuitElm } from "./CircuitElm";
import { CirSim } from "./CirSim";
import { SimulationManager } from "./SimulationManager";
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { Rectangle } from "./Rectangle";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { ScopePlot } from "./ScopePlot";
import { ScopeDataIterator } from "./ScopeDataIterator";
import { ScopeSerializer } from "./ScopeSerializer";
import { ScopePlot2d } from "./ScopePlot2d";
import { ScopeFFT } from "./ScopeFFT";
import { ScopeOverlays } from "./ScopeOverlays";
import { ScopeTrigger } from "./ScopeTrigger";
import type { ScopePropertiesDialog } from "./ScopePropertiesDialog";
import { Locale } from "./Locale";
import { HookRegistry } from "./HookRegistry";
import {
    VAL_POWER, VAL_POWER_OLD, VAL_VOLTAGE, VAL_CURRENT,
    VAL_IB, VAL_IC, VAL_IE, VAL_VBE, VAL_VBC, VAL_VCE,
    VAL_R, VAL_CHARGE,
    UNITS_V, UNITS_A, UNITS_W, UNITS_OHMS, UNITS_C, UNITS_COUNT,
    V_POSITION_STEPS, MIN_MAN_SCALE, multa,
} from "./ScopeConstants";

// also bit positions 25, 26, 27 should not be used because they might be set by old trigger mode code

export class Scope {
    static readonly VAL_POWER     = VAL_POWER;
    static readonly VAL_POWER_OLD = VAL_POWER_OLD;
    static readonly VAL_VOLTAGE   = VAL_VOLTAGE;
    static readonly VAL_CURRENT   = VAL_CURRENT;
    static readonly VAL_IB        = VAL_IB;
    static readonly VAL_IC        = VAL_IC;
    static readonly VAL_IE        = VAL_IE;
    static readonly VAL_VBE       = VAL_VBE;
    static readonly VAL_VBC       = VAL_VBC;
    static readonly VAL_VCE       = VAL_VCE;
    static readonly VAL_R         = VAL_R;
    static readonly VAL_CHARGE    = VAL_CHARGE;
    static readonly UNITS_V       = UNITS_V;
    static readonly UNITS_A       = UNITS_A;
    static readonly UNITS_W       = UNITS_W;
    static readonly UNITS_OHMS    = UNITS_OHMS;
    static readonly UNITS_C       = UNITS_C;
    static readonly UNITS_COUNT   = UNITS_COUNT;
    static readonly multa: number[] = multa;
    static readonly V_POSITION_STEPS = V_POSITION_STEPS;
    static readonly MIN_MAN_SCALE    = MIN_MAN_SCALE;

    scopePointCount: number = 128;
    position: number;
    // speed is sim timestep units per pixel
    speed: number = 64;
    stackCount: number = 0; // number of scopes in this column
    text: string | null = null;
    rect: Rectangle;
    manualScale: boolean = false;
    showI: boolean = false;
    showV: boolean = false;
    showScale: boolean = false;
    showMax: boolean = true;
    showMin: boolean = false;
    showP2P: boolean = false;
    showFreq: boolean = false;
    plot2d: ScopePlot2d;
    fftPlot: ScopeFFT;
    overlays: ScopeOverlays;
    serializer: ScopeSerializer;
    maxScale: boolean = false;

    showNegative: boolean = false;
    showRMS: boolean = false;
    showAverage: boolean = false;
    showDutyCycle: boolean = false;
    showElmInfo: boolean = false;
    plots: ScopePlot[];
    visiblePlots: ScopePlot[];
    app: CirSim;
    sim: SimulationManager;
    // scopeTimeStep to check if sim timestep has changed from previous value when redrawing
    scopeTimeStep: number = 0;
    scale: number[]; // Max value to scale the display to show - indexed for each value of UNITS - e.g. UNITS_V, UNITS_A etc.
    reduceRange: boolean[];
    wheelDeltaY: number = 0;
    selectedPlot: number = -1;
    properties: ScopePropertiesDialog | null = null;
    curColor: string = "";
    voltColor: string = "";
    gridStepX: number = 0;
    gridStepY: number = 0;
    maxValue: number = 0;
    minValue: number = 0;
    manDivisions: number; // Number of vertical divisions when in manual mode
    static lastManDivisions: number = 8;
    drawGridLines: boolean = true;
    somethingSelected: boolean = false;

    trigger: ScopeTrigger = new ScopeTrigger();

    static cursorTime: number = -1;
    static dragStartTime: number = -1;
    static cursorUnits: number = 0;
    static cursorScope: Scope | null = null;
    static draggingPlotYScope: Scope | null = null;
    draggingPlotY: boolean = false;
    dragPlotYMouseStart: number = 0;
    dragPlotYInitialPosition: number = 0;

    constructor(app_: CirSim, sim_: SimulationManager) {
        this.sim = sim_;
        this.app = app_;
        this.position = -1;
        this.scale = new Array(UNITS_COUNT).fill(0);
        this.reduceRange = new Array(UNITS_COUNT).fill(false);
        this.manDivisions = Scope.lastManDivisions;

        this.rect = new Rectangle(0, 0, 1, 1);
        this.plots = [];
        this.visiblePlots = [];
        this.plot2d = new ScopePlot2d(this);
        this.fftPlot = new ScopeFFT(this);
        this.overlays = new ScopeOverlays(this);
        this.serializer = new ScopeSerializer(this);
        this.initialize();
    }

    showCurrent(b: boolean): void {
        this.showI = b;
        if (b && !this.hasPlotValue(VAL_CURRENT)) {
            const ce = this.getElm();
            if (ce !== null)
                this.plots.push(new ScopePlot(ce, UNITS_A, VAL_CURRENT, this.getManScaleFromMaxScale(UNITS_A, false)));
        }
        this.calcVisiblePlots();
        this.resetGraph();
    }

    showVoltage(b: boolean): void {
        this.showV = b;
        if (b && !this.hasPlotValue(VAL_VOLTAGE)) {
            const ce = this.getElm();
            if (ce !== null)
                this.plots.push(new ScopePlot(ce, UNITS_V, VAL_VOLTAGE, this.getManScaleFromMaxScale(UNITS_V, false)));
        }
        this.calcVisiblePlots();
        this.resetGraph();
    }

    // check if any plot has the given value (unlike showingValue which checks ALL plots)
    hasPlotValue(v: number): boolean {
        for (let i = 0; i !== this.plots.length; i++) {
            if (this.plots[i].value === v)
                return true;
        }
        return false;
    }

    showPlotValue(val: number, b: boolean): void {
        if (b) {
            if (!this.hasPlotValue(val)) {
                const ce = this.getElm();
                if (ce !== null) {
                    const u = ce.getScopeUnits(val);
                    this.plots.push(new ScopePlot(ce, u, val, this.getManScaleFromMaxScale(u, false)));
                }
            }
        } else {
            for (let i = this.plots.length - 1; i >= 0; i--) {
                if (this.plots[i].value === val && this.plots.length > 1)
                    this.plots.splice(i, 1);
            }
        }
        this.calcVisiblePlots();
        this.resetGraph();
    }

    showCharge(b: boolean): void { this.showPlotValue(VAL_CHARGE, b); }
    showPower(b: boolean): void  { this.showPlotValue(VAL_POWER, b); }

    showMaxF(b: boolean): void { this.showMax = b; }
    showScaleF(b: boolean): void { this.showScale = b; }
    showMinF(b: boolean): void { this.showMin = b; }
    showP2PF(b: boolean): void { this.showP2P = b; }
    showFreqF(b: boolean): void { this.showFreq = b; }

    setManualScale(value: boolean, roundup: boolean): void {
        if (value !== this.manualScale)
            this.plot2d.clearView();
        this.manualScale = value;
        for (const p of this.plots) {
            if (!p.manScaleSet) {
                p.manScale = this.getManScaleFromMaxScale(p.units, roundup);
                p.manVPosition = 0;
                p.manScaleSet = true;
            }
        }
    }

    resetGraph(full: boolean = false): void { this.resetGraphFull(full); }

    resetGraphFull(full: boolean): void {
        this.scopePointCount = 1;
        while (this.scopePointCount <= this.rect.width)
            this.scopePointCount *= 2;
        // Double buffer for trigger mode to prevent overwriting displayed data
        if (this.trigger.isActive())
            this.scopePointCount *= 2;
        if (this.plots === null)
            this.plots = [];
        this.showNegative = false;
        let i;
        for (i = 0; i !== this.plots.length; i++)
            this.plots[i].reset(this.scopePointCount, this.speed, full);
        this.calcVisiblePlots();
        this.scopeTimeStep = this.sim.maxTimeStep;
        this.plot2d.allocImage();
        this.trigger.reset(this.scopePointCount);
        this.plot2d.lastTrailSimTime = -1;
    }

    setManualScaleValue(plotId: number, d: number): void {
        if (plotId >= this.visiblePlots.length)
            return; // Shouldn't happen, but just in case...
        this.plot2d.clearView();
        this.visiblePlots[plotId].manScale = d;
        this.visiblePlots[plotId].manScaleSet = true;
    }

    getScaleValue(): number {
        if (this.visiblePlots.length === 0)
            return 0;
        const p = this.visiblePlots[0];
        return this.scale[p.units];
    }

    getScaleUnitsText(): string {
        if (this.visiblePlots.length === 0)
            return "V";
        const p = this.visiblePlots[0];
        return Scope.getScaleUnitsTextStatic(p.units);
    }

    static getScaleUnitsTextStatic(units: number): string {
        switch (units) {
        case UNITS_A: return "A";
        case UNITS_OHMS: return Locale.ohmString;
        case UNITS_W: return "W";
        case UNITS_C: return "C";
        default: return "V";
        }
    }

    setManDivisions(d: number): void {
        this.manDivisions = Scope.lastManDivisions = d;
    }

    active(): boolean { return this.plots.length > 0 && this.plots[0].elm !== null; }

    isTriggered(): boolean { return this.trigger.isTriggered(); }

    displayStartIndex(plot: ScopePlot, w: number): number {
        return this.trigger.displayStartIndex(plot, w, this.scopePointCount);
    }

    validDataCount(plot: ScopePlot, ipa: number, w: number): number {
        return this.trigger.validDataCount(plot, ipa, w, this.scopePointCount);
    }

    checkTrigger(): void { this.trigger.check(this.visiblePlots, this.plot2d.enabled, this.sim, this.scopePointCount, this.rect.width); }

    setTriggerMode(mode: number): void {
        this.trigger.mode = mode;
        this.resetGraph();
    }

    drawTriggerIndicator(g: Graphics): void { this.trigger.drawIndicator(g, this.visiblePlots, this.rect); }

    initialize(): void {
        this.resetGraph();
        this.scale[UNITS_W] = this.scale[UNITS_OHMS] = this.scale[UNITS_V] = this.scale[UNITS_C] = 5;
        this.scale[UNITS_A] = 0.1;
        this.plot2d.scaleX = 5;
        this.plot2d.scaleY = 0.1;
        this.plot2d.enabled = false;
        this.speed = 64;
        this.showMax = true;
        this.showV = this.showI = false;
        this.showScale = this.showFreq = this.manualScale = this.showMin = this.showP2P = this.showElmInfo = false;
        this.fftPlot.enabled = false;
        if (!this.serializer.loadDefaults()) {
            // set showV and showI appropriately depending on what plots are present
            let i;
            for (i = 0; i !== this.plots.length; i++) {
                const plot = this.plots[i];
                if (plot.units === UNITS_V)
                    this.showV = true;
                if (plot.units === UNITS_A)
                    this.showI = true;
            }
        }
    }

    calcVisiblePlots(): void {
        this.visiblePlots = [];
        let i;
        let vc = 0, ac = 0, oc = 0;
        if (!this.plot2d.enabled) {
            for (i = 0; i !== this.plots.length; i++) {
                const plot = this.plots[i];
                if (plot.value === VAL_VOLTAGE) {
                    if (this.showV) {
                        this.visiblePlots.push(plot);
                        plot.assignColor(vc++);
                    }
                } else if (plot.value === VAL_CURRENT) {
                    if (this.showI) {
                        this.visiblePlots.push(plot);
                        plot.assignColor(ac++);
                    }
                } else {
                    this.visiblePlots.push(plot);
                    plot.assignColor(oc++);
                }
            }
        } else { // In 2D mode show all plots so scales can be adjusted for any
            for (i = 0; i < this.plots.length; i++)
                this.visiblePlots.push(this.plots[i]);
        }
    }

    setRect(r: Rectangle): void {
        const w = this.rect.width;
        const h = this.rect.height;
        this.rect = r;
        if (this.rect.width !== w || (this.plot2d.plotXY && this.rect.height !== h))
            this.resetGraph();
    }

    getWidth(): number { return this.rect.width; }

    rightEdge(): number { return this.rect.x + this.rect.width; }

    setElm(ce: CircuitElm | null): void {
        this.plots = [];
        if (ce !== null && ce.isTransistorElm())
            this.setValue(VAL_VCE, ce);
        else
            this.setValue(0, ce);
        this.initialize();
    }

    addElm(ce: CircuitElm): void {
        if (ce.isTransistorElm())
            this.addValue(VAL_VCE, ce);
        else
            this.addValue(0, ce);
    }

    setValueNum(val: number): void {
        if (this.plots.length > 2 || this.plots.length === 0)
            return;
        const ce = this.plots[0].elm;
        if (this.plots.length === 2 && this.plots[1].elm !== ce)
            return;
        this.plot2d.enabled = this.plot2d.plotXY = false;
        this.setValue(val, ce);
    }

    addValue(val: number, ce: CircuitElm | null): void {
        if (val === 0) {
            this.plots.push(new ScopePlot(ce, UNITS_V, VAL_VOLTAGE, this.getManScaleFromMaxScale(UNITS_V, false)));

            // create plot for current if applicable
            if (ce !== null &&
                    this.app.menus.dotsCheckItem.getState() &&
                    !ce.isOutputElm() &&
                    !ce.isLogicOutputElm() &&
                    !ce.isAudioOutputElm() &&
                    !ce.isTestPointElm() &&
                    !ce.isProbeElm())
                this.plots.push(new ScopePlot(ce, UNITS_A, VAL_CURRENT, this.getManScaleFromMaxScale(UNITS_A, false)));
        } else {
            if (ce === null) return;
            const u = ce.getScopeUnits(val);
            this.plots.push(new ScopePlot(ce, u, val, this.getManScaleFromMaxScale(u, false)));
            if (u === UNITS_V)
                this.showV = true;
            if (u === UNITS_A)
                this.showI = true;
        }
        this.calcVisiblePlots();
        this.resetGraph();
    }

    setValue(val: number, ce?: CircuitElm | null): void {
        if (ce !== undefined) {
            this.plots = [];
            this.addValue(val, ce);
        } else {
            this.setValueNum(val);
        }
    }

    setValues(val: number, ival: number, ce: CircuitElm | null, yelm: CircuitElm | null): void {
        if (ival > 0) {
            this.plots = [];
            if (ce === null) return;
            this.plots.push(new ScopePlot(ce, ce.getScopeUnits(val),  val,  this.getManScaleFromMaxScale(ce.getScopeUnits(val), false)));
            this.plots.push(new ScopePlot(ce, ce.getScopeUnits(ival), ival, this.getManScaleFromMaxScale(ce.getScopeUnits(ival), false)));
            return;
        }
        if (yelm !== null) {
            this.plots = [];
            if (ce === null) return;
            this.plots.push(new ScopePlot(ce,   ce.getScopeUnits(val),  0, this.getManScaleFromMaxScale(ce.getScopeUnits(val), false)));
            this.plots.push(new ScopePlot(yelm, ce.getScopeUnits(ival), 0, this.getManScaleFromMaxScale(ce.getScopeUnits(val), false)));
            return;
        }
        this.setValueNum(val);
    }

    setText(s: string): void {
        this.text = s;
    }

    getText(): string | null {
        return this.text;
    }

    showingValue(v: number): boolean {
        let i;
        for (i = 0; i !== this.plots.length; i++) {
            const sp = this.plots[i];
            if (sp.value !== v)
                return false;
        }
        return true;
    }

    // returns true if we have a plot of voltage and nothing else (except current or charge).
    // The default case is a plot of voltage and current, so we're basically checking if that case is true.
    // Charge is also allowed since it coexists additively with voltage and current.
    showingVoltageAndMaybeCurrent(): boolean {
        let i;
        let gotv = false;
        for (i = 0; i !== this.plots.length; i++) {
            const sp = this.plots[i];
            if (sp.value === VAL_VOLTAGE)
                gotv = true;
            else if (sp.value !== VAL_CURRENT && sp.value !== VAL_CHARGE)
                return false;
        }
        return gotv;
    }

    combine(s: Scope): void {
        /*
        // if voltage and current are shown, remove current
        if (plots.size() == 2 && plots.get(0).elm == plots.get(1).elm)
            plots.remove(1);
        if (s.plots.size() == 2 && s.plots.get(0).elm == s.plots.get(1).elm)
            plots.add(s.plots.get(0));
        else
        */
        this.plots = this.visiblePlots;
        this.plots.push(...s.visiblePlots);
        s.plots.length = 0;
        this.calcVisiblePlots();
    }

    // separate this scope's plots into separate scopes and return them in arr[pos], arr[pos+1], etc.  return new length of array.
    separate(arr: Scope[], pos: number): number {
        let i;
        let lastPlot: ScopePlot | null = null;
        for (i = 0; i !== this.visiblePlots.length; i++) {
            if (pos >= arr.length)
                return pos;
            const s = new Scope(this.app, this.sim);
            const sp = this.visiblePlots[i];
            if (lastPlot !== null && lastPlot.elm === sp.elm && lastPlot.value === VAL_VOLTAGE && sp.value === VAL_CURRENT)
                continue;
            s.setValue(sp.value, sp.elm);
            s.position = pos;
            arr[pos++] = s;
            lastPlot = sp;
            s.serializer.setFlags(this.serializer.getFlags());
            s.setSpeed(this.speed);
        }
        return pos;
    }

    removePlot(plot: number): void {
        if (plot < this.visiblePlots.length) {
            const p = this.visiblePlots[plot];
            const idx = this.plots.indexOf(p);
            if (idx >= 0)
                this.plots.splice(idx, 1);
            this.calcVisiblePlots();
        }
    }

    // called for each timestep
    timeStep(): void {
        let i;
        for (i = 0; i !== this.plots.length; i++)
            this.plots[i].timeStep();

        this.checkTrigger();

        // For 2d plots we draw here rather than in the drawing routine
        if (this.plot2d.enabled)
            this.plot2d.timeStep();
    }

    /*
    void adjustScale(double x) {
        scale[UNITS_V] *= x;
        scale[UNITS_A] *= x;
        scale[UNITS_OHMS] *= x;
        scale[UNITS_W] *= x;
        scaleX *= x;
        scaleY *= x;
    }
    */

    setMaxScale(s: boolean): void {
        // This procedure is added to set maxscale to an explicit value instead of just having a toggle
        // We call the toggle procedure first because it has useful side-effects and then set the value explicitly.
        this.maxScaleToggle();
        this.maxScale = s;
    }

    maxScaleToggle(): void {
        if (this.plot2d.enabled) {
            this.plot2d.maxScale();
            return;
        }
        // toggle max scale.  This isn't on by default because, for the examples, we sometimes want two plots
        // matched to the same scale so we can show one is larger.  Also, for some fast-moving scopes
        // (like for AM detector), the amplitude varies over time but you can't see that if the scale is
        // constantly adjusting.  It's also nice to set the default scale to hide noise and to avoid
        // having the scale moving around a lot when a circuit starts up.
        this.maxScale = !this.maxScale;
        this.showNegative = false;
    }

    drawSettingsWheel(g: Graphics): void {
        const outR = 8;
        const inR = 5;
        const inR45 = 4;
        const outR45 = 6;
        if (this.showSettingsWheel()) {
            g.context.save();
            if (this.cursorInSettingsWheel())
                g.setColor(CircuitElm.selectColor);
            else
                g.setColor(Color.dark_gray);
            g.context.translate(this.rect.x + 18, this.rect.y + this.rect.height - 18);
            CircuitElm.drawThickCircle(g, 0, 0, inR);
            CircuitElm.drawThickLine(g, -outR, 0, -inR, 0);
            CircuitElm.drawThickLine(g, outR, 0, inR, 0);
            CircuitElm.drawThickLine(g, 0, -outR, 0, -inR);
            CircuitElm.drawThickLine(g, 0, outR, 0, inR);
            CircuitElm.drawThickLine(g, -outR45, -outR45, -inR45, -inR45);
            CircuitElm.drawThickLine(g, outR45, -outR45, inR45, -inR45);
            CircuitElm.drawThickLine(g, -outR45, outR45, -inR45, inR45);
            CircuitElm.drawThickLine(g, outR45, outR45, inR45, inR45);
            g.context.restore();
        }
    }

    showSettingsWheel(): boolean {
        return this.rect.height > 100 && this.rect.width > 100;
    }

    cursorInSettingsWheel(): boolean {
        return this.showSettingsWheel() &&
                this.app.mouse.mouseCursorX >= this.rect.x &&
                this.app.mouse.mouseCursorX <= this.rect.x + 36 &&
                this.app.mouse.mouseCursorY >= this.rect.y + this.rect.height - 36 &&
                this.app.mouse.mouseCursorY <= this.rect.y + this.rect.height;
    }

    // does another scope have something selected?
    checkForSelectionElsewhere(): void {
        // if mouse is here, then selection is already set by checkForSelection()
        if (Scope.cursorScope === this)
            return;
        // don't hijack the plot being dragged
        if (this.draggingPlotY)
            return;

        if (Scope.cursorScope === null || this.visiblePlots.length === 0) {
            this.selectedPlot = -1;
            return;
        }

        // find a plot with same units as selected plot
        let i;
        for (i = 0; i !== this.visiblePlots.length; i++) {
            const p = this.visiblePlots[i];
            if (p.units === Scope.cursorUnits) {
                this.selectedPlot = i;
                return;
            }
        }

        // default if we can't find anything with matching units
        this.selectedPlot = 0;
    }

    draw(g: Graphics): void {
        if (this.plots.length === 0)
            return;

        // reset if timestep changed
        if (this.scopeTimeStep !== this.sim.maxTimeStep) {
            this.scopeTimeStep = this.sim.maxTimeStep;
            this.resetGraph();
        }

        if (this.plot2d.enabled) {
            this.plot2d.draw(g);
            return;
        }

        this.drawSettingsWheel(g);
        g.context.save();
        g.setColor(Color.red);
        g.context.translate(this.rect.x, this.rect.y);
        g.clipRect(0, 0, this.rect.width, this.rect.height);

        if (this.fftPlot.enabled) {
            this.fftPlot.drawVerticalGridLines(g);
            this.fftPlot.draw(g);
        }

        let i;
        for (i = 0; i !== UNITS_COUNT; i++) {
            this.reduceRange[i] = false;
            if (this.maxScale && !this.manualScale)
                this.scale[i] = 1e-4;
        }

        let si;
        this.somethingSelected = false;  // is one of our plots selected?

        for (si = 0; si !== this.visiblePlots.length; si++) {
            const plot = this.visiblePlots[si];
            this.calcPlotScale(plot);
            if (this.app.scopeManager.scopeSelected === -1 && plot.elm !== null && plot.elm.isMouseElm())
                this.somethingSelected = true;
            this.reduceRange[plot.units] = true;
        }

        const sel = this.app.scopeManager.scopeMenuIsSelected(this);

        const somethingSelectedHere = this.somethingSelected;

        this.checkForSelectionElsewhere();
        if (this.selectedPlot >= 0)
            this.somethingSelected = true;

        if (somethingSelectedHere || sel) {
            g.context.save();
            g.context.globalAlpha = 0.15;
            g.setColor(CircuitElm.selectColor);
            g.fillRect(0, 0, this.rect.width, this.rect.height);
            g.context.restore();
        }
        if (this.getSingleElm() !== null)
            this.somethingSelected = false;

        this.drawGridLines = true;
        let allPlotsSameUnits = true;
        for (i = 1; i < this.visiblePlots.length; i++) {
            if (this.visiblePlots[i].units !== this.visiblePlots[0].units)
                allPlotsSameUnits = false; // Don't draw horizontal grid lines unless all plots are in same units
        }

        if ((allPlotsSameUnits || this.showMax || this.showMin || this.showP2P) && this.visiblePlots.length > 0)
            this.calcMaxAndMin(this.visiblePlots[0].units);

        // draw volt plots on top (last), then current plots underneath, then everything else
        for (i = 0; i !== this.visiblePlots.length; i++) {
            if (this.visiblePlots[i].units > UNITS_A && i !== this.selectedPlot)
                this.drawPlot(g, this.visiblePlots[i], allPlotsSameUnits, false, sel);
        }
        for (i = 0; i !== this.visiblePlots.length; i++) {
            if (this.visiblePlots[i].units === UNITS_A && i !== this.selectedPlot)
                this.drawPlot(g, this.visiblePlots[i], allPlotsSameUnits, false, sel);
        }
        for (i = 0; i !== this.visiblePlots.length; i++) {
            if (this.visiblePlots[i].units === UNITS_V && i !== this.selectedPlot)
                this.drawPlot(g, this.visiblePlots[i], allPlotsSameUnits, false, sel);
        }
        // draw selection on top.  only works if selection chosen from scope
        if (this.selectedPlot >= 0 && this.selectedPlot < this.visiblePlots.length)
            this.drawPlot(g, this.visiblePlots[this.selectedPlot], allPlotsSameUnits, true, sel);

        this.drawTriggerIndicator(g);
        this.overlays.draw(g);

        g.restore();

        this.drawCursor(g);

        if (this.plots[0].ptr > 5 && !this.manualScale) {
            for (i = 0; i !== UNITS_COUNT; i++)
                if (this.scale[i] > 1e-4 && this.reduceRange[i])
                    this.scale[i] /= 2;
        }

        if (this.properties !== null && this.properties.isShowing())
            this.properties.refreshDraw();
    }

    // calculate maximum and minimum values for all plots of given units
    calcMaxAndMin(units: number): void {
        this.maxValue = -1e8;
        this.minValue = 1e8;
        for (const plot of this.visiblePlots) {
            if (plot.units !== units)
                continue;
            const ipa = this.displayStartIndex(plot, this.rect.width);
            const validCount = this.validDataCount(plot, ipa, this.rect.width);
            const sdi = new ScopeDataIterator(this.scopePointCount, ipa, validCount, plot);
            for (const i of sdi) {
                if (sdi.getMax() > this.maxValue)
                    this.maxValue = sdi.getMax();
                if (sdi.getMin() < this.minValue)
                    this.minValue = sdi.getMin();
            }
        }
    }

    // adjust scale of a plot
    calcPlotScale(plot: ScopePlot): void {
        if (this.manualScale)
            return;
        let max = 0;
        let gridMax = this.scale[plot.units];
        const ipa = this.displayStartIndex(plot, this.rect.width);
        const validCount = this.validDataCount(plot, ipa, this.rect.width);
        const sdi = new ScopeDataIterator(this.scopePointCount, ipa, validCount, plot);
        for (const i of sdi) {
            if (sdi.getMax() > max)
                max = sdi.getMax();
            if (sdi.getMin() < -max)
                max = -sdi.getMin();
        }
        // scale fixed at maximum?
        if (this.maxScale)
            gridMax = Math.max(max, gridMax);
        else
            // adjust in powers of two
            while (max > gridMax)
                gridMax *= 2;
        this.scale[plot.units] = gridMax;
    }

    calcGridStepX(): number {
        let multptr = 0;
        let gsx = 1e-15;

        const ts = this.sim.maxTimeStep * this.speed;
        while (gsx < ts * 20) {
            gsx *= multa[(multptr++) % 3];
        }
        return gsx;
    }

    getGridMaxFromManScale(plot: ScopePlot): number {
        return ((this.manDivisions) / 2 + 0.05) * plot.manScale;
    }

    // Compute grid display parameters for a plot. Sets plot.plotOffset, plot.gridMult,
    // and this.gridStepY as side-effects; returns gridMid for use by callers.
    calcGridParams(plot: ScopePlot, allPlotsSameUnits: boolean): number {
        const maxy = (this.rect.height - 1) / 2;
        let gridMid: number, positionOffset: number, gridMax: number;
        if (!this.isManualScale()) {
            gridMax = this.scale[plot.units];
            gridMid = 0;
            positionOffset = 0;
            if (allPlotsSameUnits) {
                // if we don't have overlapping scopes of different units, we can move zero around.
                // Put it at the bottom if the scope is never negative.
                let mx = gridMax;
                let mn = 0;
                if (this.maxScale) {
                    // scale is maxed out, so fix boundaries of scope at maximum and minimum.
                    mx = this.maxValue;
                    mn = this.minValue;
                } else if (this.showNegative || this.minValue < (mx + mn) * 0.5 - (mx - mn) * 0.55) {
                    mn = -gridMax;
                    this.showNegative = true;
                }
                gridMid = (mx + mn) * 0.5;
                gridMax = (mx - mn) * 0.55;  // leave space at top and bottom
            }
            this.gridStepY = 1e-8;
            let multptr = 0;
            while (this.gridStepY < 20 * gridMax / maxy)
                this.gridStepY *= multa[(multptr++) % 3];
        } else {
            gridMid = 0;
            gridMax = this.getGridMaxFromManScale(plot);
            positionOffset = gridMax * 2.0 * (plot.manVPosition) / (V_POSITION_STEPS);
            this.gridStepY = plot.manScale;
        }
        plot.plotOffset = -gridMid + positionOffset;
        plot.gridMult = maxy / gridMax;
        return gridMid;
    }

    drawHVGridLines(g: Graphics, plot: ScopePlot, gridMid: number, allPlotsSameUnits: boolean, allSelected: boolean): void {
        const maxy = (this.rect.height - 1) / 2;
        let minorDiv = "#404040";
        let majorDiv = "#A0A0A0";
        if (this.app.isPrintable()) {
            minorDiv = "#D0D0D0";
            majorDiv = "#808080";
            this.curColor = "#A0A000";
        }
        if (allSelected)
            majorDiv = CircuitElm.selectColor.getHexValue();
        const highlightCenter = !this.isManualScale();

        // horizontal gridlines; only show non-center lines if units are unambiguous
        const showHGridLines = (this.gridStepY !== 0) && (this.isManualScale() || allPlotsSameUnits);
        for (let ll = -100; ll <= 100; ll++) {
            if (ll !== 0 && !showHGridLines)
                continue;
            const yl = maxy - (ll * this.gridStepY - gridMid) * plot.gridMult;
            if (yl < 0 || yl >= this.rect.height - 1)
                continue;
            g.setColor(ll === 0 && highlightCenter ? majorDiv : minorDiv);
            g.drawLine(0, yl, this.rect.width - 1, yl);
        }

        // vertical (time) gridlines
        const ts = this.sim.maxTimeStep * this.speed;
        const tRight = this.isTriggered() ? this.trigger.time + ts * this.rect.width / 2 : this.sim.t;
        const tstart = tRight - ts * this.rect.width;
        const tx = tRight - (tRight % this.gridStepX);
        for (let ll = 0; ; ll++) {
            const tl = tx - this.gridStepX * ll;
            const gx = Math.trunc((tl - tstart) / ts);
            if (gx < 0)
                break;
            if (gx >= this.rect.width || tl < 0)
                continue;
            g.setColor(((tl + this.gridStepX / 4) % (this.gridStepX * 10)) < this.gridStepX ? majorDiv : minorDiv);
            g.drawLine(gx, 0, gx, this.rect.height - 1);
        }
    }

    drawPlot(g: Graphics, plot: ScopePlot, allPlotsSameUnits: boolean, selected: boolean, allSelected: boolean): void {
        if (plot.elm === null)
            return;
        const maxy = (this.rect.height - 1) / 2;

        let color = (this.somethingSelected) ? "#A0A0A0" : plot.color;
        if (allSelected || (this.app.scopeManager.scopeSelected === -1 && this.getSingleElm() === null && plot.elm.isMouseElm()))
            color = CircuitElm.selectColor.getHexValue();
        else if (selected)
            color = plot.color;

        const ipa = this.displayStartIndex(plot, this.rect.width);
        const maxV = plot.maxValues;
        const minV = plot.minValues;

        const gridMid = this.calcGridParams(plot, allPlotsSameUnits);
        const minRangeLo = -10 - Math.trunc(gridMid * plot.gridMult);
        let minRangeHi = 10 - Math.trunc(gridMid * plot.gridMult);
        let curMinRangeLo = minRangeLo;

        this.gridStepX = this.calcGridStepX();
        if (this.drawGridLines)
            this.drawHVGridLines(g, plot, gridMid, allPlotsSameUnits, allSelected);
        this.drawGridLines = false;

        g.setColor(color);
        if (this.isManualScale()) {
            const y0 = maxy - Math.trunc(plot.gridMult * plot.plotOffset);
            g.drawLine(0, y0, 8, y0);
            g.drawString("0", 0, y0 - 2);
        }

        // In triggered mode, only draw up to the current write pointer.
        // Data beyond that is stale (old circular buffer contents).
        const drawWidth = this.validDataCount(plot, ipa, this.rect.width);
        let ox = -1, oy = -1;
        let i;
        for (i = 0; i !== drawWidth; i++) {
            const ip = (i + ipa) & (this.scopePointCount - 1);
            const minvy = Math.round(plot.gridMult * (minV[ip] + plot.plotOffset));
            const maxvy = Math.round(plot.gridMult * (maxV[ip] + plot.plotOffset));
            if (minvy <= maxy) {
                if (minvy < curMinRangeLo || maxvy > minRangeHi) {
                    // value outside min range; no need to rescale later
                    this.reduceRange[plot.units] = false;
                    curMinRangeLo = -1000;
                    minRangeHi = 1000;
                }
                if (ox !== -1) {
                    if (minvy === oy && maxvy === oy)
                        continue;
                    g.drawLine(ox, maxy - oy, i, maxy - oy);
                    ox = oy = -1;
                }
                if (minvy === maxvy) {
                    ox = i;
                    oy = minvy;
                    continue;
                }
                g.drawLine(i, maxy - minvy, i, maxy - maxvy);
            }
        }
        if (ox !== -1)
            g.drawLine(ox, maxy - oy, i - 1, maxy - oy);
    }

    static clearCursorInfo(): void {
        Scope.cursorScope = null;
        Scope.cursorTime = -1;
    }

    mouseXToTime(mouseX: number): number {
        if (this.isTriggered())
            return this.trigger.time + this.sim.maxTimeStep * this.speed * (mouseX - this.rect.x - this.rect.width / 2);
        else
            return this.sim.t - this.sim.maxTimeStep * this.speed * (this.rect.x + this.rect.width - mouseX);
    }

    selectScope(mouseX: number, mouseY: number): void {
        if (!this.rect.contains(mouseX, mouseY))
            return;
        if (this.plot2d.enabled || this.visiblePlots.length === 0)
            Scope.cursorTime = -1;
        else
            Scope.cursorTime = this.mouseXToTime(mouseX);
        this.checkForSelection(mouseX, mouseY);
        Scope.cursorScope = this;
    }

    mousePressed(mouseX: number, mouseY: number): void {
        if (!this.rect.contains(mouseX, mouseY))
            return;
        if (this.plot2d.enabled || this.fftPlot.enabled || this.visiblePlots.length === 0)
            return;
        Scope.dragStartTime = this.mouseXToTime(mouseX);
    }

    // find selected plot
    checkForSelection(mouseX: number, mouseY: number): void {
        if (this.app.dialogIsShowing())
            return;
        if (this.draggingPlotY)
            return;
        if (!this.rect.contains(mouseX, mouseY)) {
            this.selectedPlot = -1;
            return;
        }
        if (this.plots.length === 0) {
            this.selectedPlot = -1;
            return;
        }
        const ipa = this.displayStartIndex(this.plots[0], this.rect.width);
        const ip = (mouseX - this.rect.x + ipa) & (this.scopePointCount - 1);
        const maxy = (this.rect.height - 1) / 2;
        const y = maxy;
        let i;
        let bestdist = 10000;
        let best = -1;
        for (i = 0; i !== this.visiblePlots.length; i++) {
            const plot = this.visiblePlots[i];
            const maxvy = plot.gridMult * (plot.maxValues[ip] + plot.plotOffset);
            const dist = Math.abs(mouseY - (this.rect.y + y - maxvy));
            if (dist < bestdist) {
                bestdist = dist;
                best = i;
            }
        }
        this.selectedPlot = best;
        if (this.selectedPlot >= 0)
            Scope.cursorUnits = this.visiblePlots[this.selectedPlot].units;
    }

    timeToX(t: number): number {
        if (this.isTriggered())
            return Math.trunc(this.rect.x + this.rect.width / 2 + (t - this.trigger.time) / (this.sim.maxTimeStep * this.speed));
        else
            return -Math.trunc((this.sim.t - t) / (this.sim.maxTimeStep * this.speed) - this.rect.x - this.rect.width);
    }

    // draw a dot on the selected plot at pixel x; return the plot value there, or NaN if out of range
    drawPlotDot(g: Graphics, plot: ScopePlot, x: number): number {
        if (x < this.rect.x || x >= this.rect.x + this.rect.width)
            return NaN;
        const ipa = this.displayStartIndex(this.plots[0], this.rect.width);
        const ip = (x - this.rect.x + ipa) & (this.scopePointCount - 1);
        const value = plot.maxValues[ip];
        const vy = plot.gridMult * (value + plot.plotOffset);
        const dotY = this.rect.y + (this.rect.height - 1) / 2 - vy;
        g.setColor(plot.color);
        if (dotY >= this.rect.y && dotY < this.rect.y + this.rect.height)
            g.fillOval(x - 2, dotY - 2, 5, 5);
        return value;
    }

    drawCursor(g: Graphics): void {
        if (this.app.dialogIsShowing())
            return;
        if (Scope.cursorScope === null)
            return;
        const info: (string | null)[] = new Array(7).fill(null);
        let cursorX = -1;
        let ct = 0;
        let cursorValue = NaN;
        const plot = this.visiblePlots.length > 0 ? this.visiblePlots[this.selectedPlot >= 0 ? this.selectedPlot : 0] : null;
        if (Scope.cursorTime >= 0) {
            cursorX = this.timeToX(Scope.cursorTime);
            if (plot !== null) {
                cursorValue = this.drawPlotDot(g, plot, cursorX);
                if (Scope.dragStartTime < 0 && !isNaN(cursorValue))
                    info[ct++] = plot.getUnitText(cursorValue);
            }
        }

        // show FFT even if there's no plots (in which case cursorTime/cursorX will be invalid)
        if (this.fftPlot.enabled && Scope.cursorScope === this) {
            if (cursorX < 0)
                cursorX = this.app.mouse.mouseCursorX;
            ct = this.fftPlot.addCursorInfo(info as string[], ct, this.app.mouse.mouseCursorX);
        } else if (cursorX < this.rect.x)
            return;

        // draw drag-start cursor and delta readout
        if (Scope.dragStartTime >= 0 && Scope.cursorScope === this && plot !== null && !this.plot2d.enabled && !this.fftPlot.enabled) {
            const dragX = this.timeToX(Scope.dragStartTime);
            if (dragX >= this.rect.x && dragX < this.rect.x + this.rect.width) {
                g.setColor(CircuitElm.lightGrayColor);
                g.drawLine(dragX, this.rect.y, dragX, this.rect.y + this.rect.height);
                const startValue = this.drawPlotDot(g, plot, dragX);
                const deltaT = Scope.cursorTime - Scope.dragStartTime;
                info[ct++] = "Δt=" + CircuitElm.getTimeText(Math.abs(deltaT));
                if (!isNaN(cursorValue) && !isNaN(startValue)) {
                    info[ct++] = "Δ=" + plot.getUnitText(cursorValue - startValue);
                    info[ct++] = plot.getUnitText(cursorValue);
                }
            }
        }

        if (this.visiblePlots.length > 0)
            info[ct++] = CircuitElm.getTimeText(Scope.cursorTime);

        if (Scope.cursorScope !== this) {
            // don't show cursor info if not enough room, or stacked with selected one
            // (position == -1 for embedded scopes)
            if (this.rect.height < 40 || (this.position >= 0 && Scope.cursorScope.position === this.position)) {
                this.drawCursorInfo(g, null, 0, cursorX, false);
                return;
            }
        }
        this.drawCursorInfo(g, info as string[], ct, cursorX, false);
    }

    drawCursorInfo(g: Graphics, info: string[] | null, ct: number, x: number, drawY: boolean): void {
        let szw = 0, szh = 15 * ct;
        let i;
        if (info !== null) {
            for (i = 0; i !== ct; i++) {
                const w = g.context.measureText(info[i]).width;
                if (w > szw)
                    szw = w;
            }
        }

        g.setColor(CircuitElm.whiteColor);
        g.drawLine(x, this.rect.y, x, this.rect.y + this.rect.height);
        if (drawY)
            g.drawLine(this.rect.x, this.app.mouse.mouseCursorY, this.rect.x + this.rect.width, this.app.mouse.mouseCursorY);
        g.setColor(this.app.isPrintable() ? Color.white : Color.black);
        let bx = x;
        if (bx < szw / 2)
            bx = szw / 2;
        g.fillRect(bx - szw / 2, this.rect.y - szh, szw, szh);
        if (info !== null) {
            g.setColor(CircuitElm.whiteColor);
            for (i = 0; i !== ct; i++) {
                const w = g.context.measureText(info[i]).width;
                g.drawString(info[i], bx - w / 2, this.rect.y - 2 - (ct - 1 - i) * 15);
            }
        }
    }

    canShowRMS(): boolean {
        if (this.visiblePlots.length === 0)
            return false;
        const plot = this.visiblePlots[0];
        return (plot.units === UNITS_V || plot.units === UNITS_A);
    }

    drawInfoText(g: Graphics, text: string): void {
        this.overlays.drawInfoText(g, text);
    }

    getScopeText(): string | null {
        // stacked scopes?  don't show text
        if (this.stackCount !== 1)
            return null;

        // multiple elms?  don't show text (unless one is selected)
        if (this.selectedPlot < 0 && this.getSingleElm() === null)
            return null;

        // no visible plots?
        if (this.visiblePlots.length === 0)
            return null;

        let plot = this.visiblePlots[0];
        if (this.selectedPlot >= 0 && this.visiblePlots.length > this.selectedPlot)
            plot = this.visiblePlots[this.selectedPlot];
        if (plot.elm === null)
            return "";
        else
            return plot.elm.getScopeText(plot.value);
    }

    getScopeLabelOrText(): string;
    getScopeLabelOrText(forInfo: boolean): string;
    getScopeLabelOrText(forInfo?: boolean): string {
        const fi = forInfo === true;
        let t = this.text;
        if (t === null) {
            // if we're drawing the info and showElmInfo is true, return null so we don't print redundant info.
            // But don't do that if we're getting the scope label to generate "Add to Existing Scope" menu.
            if (fi && this.showElmInfo)
                return "";
            t = this.getScopeText();
            if (t === null)
                return "";
            return Locale.LS(t);
        } else
            return t;
    }

    setSpeed(sp: number): void {
        if (sp < 1)
            sp = 1;
        if (sp > 1024)
            sp = 1024;
        this.speed = sp;
        this.resetGraph();
    }

    showProperties(): void {
        this.properties = HookRegistry.createScopePropertiesDialog!(this.app, this);
        CirSim.dialogShowing = this.properties;
    }

    exportCSV(): void {
        if (this.visiblePlots.length === 0)
            return;
        let sb = "time";
        let i;
        for (i = 0; i !== this.visiblePlots.length; i++) {
            const plot = this.visiblePlots[i];
            const name = plot.elm !== null ? plot.elm.getClassName().replace("Elm", "") : "unknown";
            const unit = Scope.getScaleUnitsTextStatic(plot.units);
            sb += ",\"" + name + " " + unit + " min\"";
            sb += ",\"" + name + " " + unit + " max\"";
        }
        sb += "\n";
        // all visible plots share the same scopePointCount and speed
        const plot0 = this.visiblePlots[0];
        const w = this.rect.width;
        const ts = this.sim.maxTimeStep * this.speed;
        const tStart = this.sim.t - ts * w;
        const ipa = plot0.startIndex(w);
        for (i = 0; i !== w; i++) {
            const t = tStart + ts * i;
            if (t < 0)
                continue;
            sb += t;
            let j;
            for (j = 0; j !== this.visiblePlots.length; j++) {
                const plot = this.visiblePlots[j];
                const ip = (i + plot.startIndex(w)) & (plot.scopePointCount - 1);
                sb += "," + plot.minValues[ip];
                sb += "," + plot.maxValues[ip];
            }
            sb += "\n";
        }
        Scope.downloadCSV(sb, "scope-data.csv");
    }

    static downloadCSV(data: string, filename: string): void {
        const blob = new Blob([data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    speedUp(): void {
        if (this.speed > 1) {
            this.speed /= 2;
            this.resetGraph();
        }
    }

    slowDown(): void {
        if (this.speed < 1024)
            this.speed *= 2;
        this.resetGraph();
    }

    setPlotPosition(plot: number, v: number): void {
        this.visiblePlots[plot].manVPosition = v;
    }

    // start dragging the currently selected plot up/down (manual scale mode only)
    startDragPlotY(mouseX: number, mouseY: number): boolean {
        if (!this.rect.contains(mouseX, mouseY))
            return false;
        if (!this.isManualScale() || this.selectedPlot < 0 || this.selectedPlot >= this.visiblePlots.length)
            return false;
        this.draggingPlotY = true;
        this.dragPlotYMouseStart = mouseY;
        this.dragPlotYInitialPosition = this.visiblePlots[this.selectedPlot].manVPosition;
        Scope.draggingPlotYScope = this;
        return true;
    }

    dragPlotY(mouseY: number): void {
        if (this.selectedPlot < 0 || this.selectedPlot >= this.visiblePlots.length)
            return;
        const maxy = Math.max(1, (this.rect.height - 1) / 2);
        const dy = mouseY - this.dragPlotYMouseStart;
        let newPos = this.dragPlotYInitialPosition - Math.round(dy * V_POSITION_STEPS / (2.0 * maxy));
        newPos = Math.max(-V_POSITION_STEPS, Math.min(V_POSITION_STEPS, newPos));
        this.visiblePlots[this.selectedPlot].manVPosition = newPos;
    }

    static endDragPlotY(): void {
        if (Scope.draggingPlotYScope != null)
            Scope.draggingPlotYScope.draggingPlotY = false;
        Scope.draggingPlotYScope = null;
    }

    // get scope element, returning null if there's more than one
    getSingleElm(): CircuitElm | null {
        const elm = this.plots[0].elm;
        let i;
        for (i = 1; i < this.plots.length; i++) {
            if (this.plots[i].elm !== elm)
                return null;
        }
        return elm;
    }

    canMenu(): boolean {
        return (this.plots[0].elm !== null);
    }

    canShowResistance(): boolean {
        const elm = this.getSingleElm();
        return elm !== null && elm.canShowValueInScope(VAL_R);
    }

    isShowingVceAndIc(): boolean {
        return this.plot2d.enabled && this.plots.length === 2 && this.plots[0].value === VAL_VCE && this.plots[1].value === VAL_IC;
    }

    dumpXml(doc: Document, root: Element): void { this.serializer.dumpXml(doc, root); }
    undumpXml(xml: CircuitXMLDeserializer): void { this.serializer.undumpXml(xml); }
    undump(st: StringTokenizer): void { this.serializer.undump(st); }
    saveAsDefault(): void { this.serializer.saveAsDefault(); }

    handleMenu(mi: string, state: boolean): void {
        if (mi === "maxscale")
            this.maxScaleToggle();
        if (mi === "showvoltage")
            this.showVoltage(state);
        if (mi === "showcurrent")
            this.showCurrent(state);
        if (mi === "showscale")
            this.showScaleF(state);
        if (mi === "showpeak")
            this.showMaxF(state);
        if (mi === "shownegpeak")
            this.showMinF(state);
        if (mi === "showp2p")
            this.showP2PF(state);
        if (mi === "showfreq")
            this.showFreqF(state);
        if (mi === "showfft")
            this.fftPlot.show(state);
        if (mi === "logspectrum")
            this.fftPlot.logSpectrum = state;
        if (mi === "showrms")
            this.showRMS = state;
        if (mi === "showaverage")
            this.showAverage = state;
        if (mi === "showduty")
            this.showDutyCycle = state;
        if (mi === "showphaseangle")
            this.fftPlot.showPhaseAngle = state;
        if (mi === "showelminfo")
            this.showElmInfo = state;
        if (mi === "showpower")
            this.showPower(state);
        if (mi === "showib")
            this.showPlotValue(VAL_IB, state);
        if (mi === "showic")
            this.showPlotValue(VAL_IC, state);
        if (mi === "showie")
            this.showPlotValue(VAL_IE, state);
        if (mi === "showvbe")
            this.showPlotValue(VAL_VBE, state);
        if (mi === "showvbc")
            this.showPlotValue(VAL_VBC, state);
        if (mi === "showvce")
            this.showPlotValue(VAL_VCE, state);
        if (mi === "showvcevsic") {
            this.plot2d.enabled = true;
            this.plot2d.plotXY = false;
            this.setValues(VAL_VCE, VAL_IC, this.getElm(), null);
            this.resetGraph();
        }

        if (mi === "showvvsi") {
            this.plot2d.enabled = state;
            this.plot2d.plotXY = false;
            this.resetGraph();
        }
        if (mi === "manualscale")
            this.setManualScale(state, true);
        if (mi === "plotxy") {
            this.plot2d.plotXY = this.plot2d.enabled = state;
            if (this.plot2d.enabled) {
                this.plots = this.visiblePlots;
                this.plot2d.plotX = 0;
                this.plot2d.plotY = Math.min(1, this.plots.length - 1);
                this.plot2d.plotBrightness = this.plot2d.plotColorR = this.plot2d.plotColorG = this.plot2d.plotColorB = -1;
            }
            if (this.plot2d.enabled && this.plots.length === 1)
                this.selectY();
            this.resetGraph();
        }
        if (mi === "showresistance")
            this.showPlotValue(VAL_R, state);
        if (mi === "showcharge")
            this.showCharge(state);
    }

//    void select() {
//        sim.setMouseElm(elm);
//        if (plotXY) {
//            sim.plotXElm = elm;
//            sim.plotYElm = yElm;
//        }
//    }

    selectY(): void {
        const yElm = (this.plots.length === 2) ? this.plots[1].elm : null;
        let e = (yElm === null) ? -1 : this.app.locateElm(yElm);
        const firstE = e;
        while (true) {
            for (e++; e < this.app.elmList.length; e++) {
                const ce = this.app.getElm(e);
                if ((ce.isOutputElm() || ce.isProbeElm()) &&
                        ce !== this.plots[0].elm) {
                    const yElm2 = ce;
                    if (this.plots.length === 1)
                        this.plots.push(new ScopePlot(yElm2, UNITS_V));
                    else {
                        this.plots[1].elm = yElm2;
                        this.plots[1].units = UNITS_V;
                    }
                    return;
                }
            }
            if (firstE === -1)
                return;
            e = -1;
        }
        // not reached
    }

    onMouseWheel(e: WheelEvent): void {
        this.wheelDeltaY += e.deltaY * this.app.mouse.wheelSensitivity;
        if (this.wheelDeltaY > 5) {
            this.slowDown();
            this.wheelDeltaY = 0;
        }
        if (this.wheelDeltaY < -5) {
            this.speedUp();
            this.wheelDeltaY = 0;
        }
    }

    getElm(): CircuitElm | null {
        if (this.selectedPlot >= 0 && this.visiblePlots.length > this.selectedPlot)
            return this.visiblePlots[this.selectedPlot].elm;
        return this.visiblePlots.length > 0 ? this.visiblePlots[0].elm : this.plots[0].elm;
    }

    showingElm(e: CircuitElm): boolean {
        for (let i = 0; i !== this.plots.length; i++)
            if (this.plots[i].elm === e)
                return true;
        return false;
    }

    viewingWire(): boolean {
        let i;
        for (i = 0; i !== this.plots.length; i++)
            if (this.plots[i].elm !== null && this.plots[i].elm!.isWireEquivalent())
                return true;
        return false;
    }

    // Populate roles map with all elements involved in this scope's display.
    // In XY mode each element is labelled by its axis role; in normal mode all
    // visible plot elements get an empty label (highlighted but unlabelled).
    addScopePlotRoles(roles: Map<CircuitElm, string>): void {
        if (this.plot2d.plotXY) {
            this.addPlotRole(roles, this.plot2d.plotX,          "X");
            this.addPlotRole(roles, this.plot2d.plotY,          "Y");
            this.addPlotRole(roles, this.plot2d.plotBrightness, "Br");
            this.addPlotRole(roles, this.plot2d.plotColorR,     "R");
            this.addPlotRole(roles, this.plot2d.plotColorG,     "G");
            this.addPlotRole(roles, this.plot2d.plotColorB,     "B");
        } else {
            for (const p of this.visiblePlots)
                if (p.elm !== null)
                    this.addElmRole(roles, p.elm, "");
        }
    }

    private addPlotRole(roles: Map<CircuitElm, string>, idx: number, role: string): void {
        if (idx < 0 || idx >= this.plots.length) return;
        if (this.plots[idx].elm !== null)
            this.addElmRole(roles, this.plots[idx].elm!, role);
    }

    private addElmRole(roles: Map<CircuitElm, string>, elm: CircuitElm, role: string): void {
        if (elm === null) return;
        const existing = roles.get(elm);
        roles.set(elm, existing === undefined ? role : existing + "/" + role);
    }

    needToRemove(): boolean {
        let ret = true;
        let removed = false;
        let i;
        for (i = 0; i !== this.plots.length; i++) {
            const plot = this.plots[i];
            if (this.app.locateElm(plot.elm) < 0) {
                this.plots.splice(i--, 1);
                removed = true;
            } else
                ret = false;
        }
        if (removed)
            this.calcVisiblePlots();
        return ret;
    }

    isManualScale(): boolean {
        return this.manualScale;
    }

    getManScaleFromMaxScale(units: number, roundUp: boolean): number {
        // When the user manually switches to manual scale (and we don't already have a setting) then
        // call with "roundUp=true" to get a "sensible" suggestion for the scale. When importing from
        // a legacy file then call with "roundUp=false" to stay as close as possible to the old presentation
        let s = this.scale[units];
        if (units > UNITS_A)
            s = 0.5 * s;
        if (roundUp)
            return HookRegistry.scopeNextHighestScale!((2 * s) / (this.manDivisions));
        else
            return (2 * s) / (this.manDivisions);
    }
}
