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

export class JSInterface {
    app: any;

    constructor(app: any) {
        this.app = app;
    }

    setExtVoltage(name: string, v: number): void {
        for (let i = 0; i !== this.app.elmList.length; i++) {
            const ce = this.app.getElm(i);
            if (ce.isExtVoltageElm()) {
                if (ce.getName() === name)
                    ce.setVoltage(v);
            }
        }
    }

    getJSElements(): object[] {
        const arr: object[] = [];
        for (let i = 0; i !== this.app.elmList.length; i++) {
            const ce = this.app.getElm(i);
            ce.addJSMethods();
            arr.push(ce.getJavaScriptObject());
        }
        return arr;
    }

    // go back up one level when viewing inside a subcircuit.  returns false if at the top level
    exitSubcircuit(): boolean {
        const ui = this.app.ui;
        if (ui.subcircuitStack.length === 0)
            return false;
        CirSim.editDialog?.closeDialog();
        ui.popSubcircuit();
        return true;
    }

    // model names of the subcircuits being viewed, outermost first ([] at the top level)
    getSubcircuitPath(): string[] {
        return this.app.ui.subcircuitStack.map((cce: any) => cce.modelName);
    }

    getLabeledNodeVoltage(name: string): number { return this.app.sim.getLabeledNodeVoltage(name); }

    // Delegate methods for JS API access
    setSimRunning(run: boolean): void { this.app.setSimRunning(run); }
    simIsRunning(): boolean { return this.app.simIsRunning(); }
    doExportAsSVGFromAPI(): void { this.app.imageExporter.doExportAsSVGFromAPI(); }
    dumpCircuit(): string { return this.app.dumpCircuit(); }
    importCircuitFromText(t: string, s: boolean): Promise<void> { return this.app.importCircuitFromText(t, s); }
    getTime(): number { return this.app.sim.t; }
    getTimeStep(): number { return this.app.sim.timeStep; }
    setTimeStep(ts: number): void { this.app.sim.timeStep = ts; }
    getMaxTimeStep(): number { return this.app.sim.maxTimeStep; }
    setMaxTimeStep(ts: number): void { this.app.sim.maxTimeStep = this.app.sim.timeStep = ts; }

    setupJSInterface(): void {
        const that = this;
        (window as any).CircuitJS1 = {
            setSimRunning:  (run: boolean) => that.setSimRunning(run),
            getTime:        () => that.getTime(),
            getTimeStep:    () => that.getTimeStep(),
            setTimeStep:    (ts: number) => that.setTimeStep(ts), // don't use this, see #843
            getMaxTimeStep: () => that.getMaxTimeStep(),
            setMaxTimeStep: (ts: number) => that.setMaxTimeStep(ts),
            isRunning:      () => that.simIsRunning(),
            getNodeVoltage: (n: string) => that.getLabeledNodeVoltage(n),
            setExtVoltage:  (n: string, v: number) => that.setExtVoltage(n, v),
            getElements:    () => that.getJSElements(),
            exitSubcircuit: () => that.exitSubcircuit(),
            getSubcircuitPath: () => that.getSubcircuitPath(),
            getCircuitAsSVG: () => that.doExportAsSVGFromAPI(),
            exportCircuit:  () => that.dumpCircuit(),
            importCircuit:  (circuit: string, subcircuitsOnly: boolean) => that.importCircuitFromText(circuit, subcircuitsOnly),
        };
        const hook = (window as any).oncircuitjsloaded;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    callUpdateHook(): void {
        const hook = (window as any).CircuitJS1?.onupdate;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    callAnalyzeHook(): void {
        const hook = (window as any).CircuitJS1?.onanalyze;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    callTimeStepHook(): void {
        const hook = (window as any).CircuitJS1?.ontimestep;
        if (hook)
            hook((window as any).CircuitJS1);
    }

    // called when the user toggles a switch (click, release of a momentary switch, or
    // keyboard shortcut).  not called for changes made through the JS interface.
    callSwitchHook(elm: any): void {
        const hook = (window as any).CircuitJS1?.onswitch;
        if (!hook)
            return;
        elm.addJSMethods();
        hook((window as any).CircuitJS1, elm.getJavaScriptObject());
    }

    callSVGRenderedHook(svgData: string): void {
        const hook = (window as any).CircuitJS1?.onsvgrendered;
        if (hook)
            hook((window as any).CircuitJS1, svgData);
    }
}
