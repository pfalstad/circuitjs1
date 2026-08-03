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
import { SimulationManager } from "./SimulationManager";
import { ScopeManager } from "./ScopeManager";
import { Menus } from "./Menus";
import { CircuitElm } from "./CircuitElm";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { WireRouter } from "./WireRouter";
import { Locale } from "./Locale";
import { Scope } from "./Scope";
import { DiodeModel } from "./DiodeModel";
import { TransistorModel } from "./TransistorModel";
import { CustomLogicModel } from "./CustomLogicModel";
import { SubcircuitModel } from "./SubcircuitModel";

/**
 * Handles all circuit loading, parsing, clearing, setup-file fetching,
 * and low-level import logic.
 *
 * CirSim should only call high-level methods on this class.
 */
export class CircuitLoader {

    private readonly app: CirSim;     // was CirSim – the main app/UI object
    private readonly sim: SimulationManager;      // the simulation engine
    private readonly scopes: ScopeManager;        // to clear/add scopes
    private readonly menus: Menus;                // to toggle check items (dots, volts, etc.)

    // Flags (copied from CirSim for clarity – you can keep them here or reference app's constants)
    static readonly RC_RETAIN       = 1;
    static readonly RC_NO_CENTER    = 2;
    static readonly RC_SUBCIRCUITS  = 4;
    static readonly RC_KEEP_TITLE   = 8;

    constructor(app: CirSim, sim: SimulationManager,
                scopes: ScopeManager, menus: Menus) {
        this.app   = app;
        this.sim   = sim;
        this.scopes = scopes;
        this.menus = menus;
    }

    clearCircuit(): void {
	WireRouter.lastRouter = null;
        this.app.mouse.clearMouseElm();
        for (const ce of this.app.elmList) {
            ce.delete();
        }
        this.sim.resetTime();
	this.sim.solverType = SimulationManager.SOLVER_AUTO;
        this.app.elmList.length = 0;
        this.app.hintType = -1;
        this.sim.maxTimeStep = 5e-6;
        this.sim.minTimeStep = 50e-12;
        this.menus.dotsCheckItem.setState(false);
        this.menus.smallGridCheckItem.setState(false);
        this.menus.powerCheckItem.setState(false);
        this.menus.voltsCheckItem.setState(true);
        this.menus.showValuesCheckItem.setState(true);
        this.app.autoDCOnReset = false;
        this.app.setGrid();
        this.app.ui.speedBar.setValue(117);
        this.app.ui.currentBar.setValue(50);
        this.app.ui.powerBar.setValue(50);
        CircuitElm.voltageRange = 5;
        this.scopes.clearScopes();
        this.sim.lastIterTime = 0;
        if (this.app.contextStack.length === 0) {
            // SubcircuitModel.clearLocalModels() — stub
        }
        if (this.app.ui.subcircuitStack.length > 0) {
            this.app.ui.subcircuitStack.length = 0;
            this.app.ui.elmList = this.app.elmList;
            this.app.ui.updateSubcircuitPath();
        }
    }

    readCircuit(text: string, flags: number = 0): void {
        if (text.startsWith("<")) {
	    if ((flags & CircuitLoader.RC_RETAIN) == 0)
		this.clearCircuit();
            const xml = new CircuitXMLDeserializer(this.app);
            xml.readCircuit(text, flags);
            return;
        }
        this.readCircuitText(text, flags);
        if ((flags & CircuitLoader.RC_KEEP_TITLE) == 0) {
            this.app.setCircuitTitle(null);
        }
    }

    async loadCircuitFromUrl(url: string, title: string | null): Promise<void> {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const text = await response.text();
                this.readCircuit(text, CircuitLoader.RC_KEEP_TITLE);
                this.app.allowSave(false);
                this.app.unsavedChanges = false;
            } else {
                window.alert(Locale.LS("Can't load circuit!"));
                console.log("Bad file server response:" + response.statusText);
            }
        } catch (e) {
            window.alert(Locale.LS("Can't load circuit!"));
            console.log("File Error Response", e);
        }

        if (title != null) {
            this.app.setCircuitTitle(title);
        }
        this.app.unsavedChanges = false;
    }

    private readCircuitText(text: string, flags: number): void {
        if ((flags & CircuitLoader.RC_RETAIN) == 0) {
            this.clearCircuit();
        }
        const subs = (flags & CircuitLoader.RC_SUBCIRCUITS) != 0;

        const lines = text.split(/\r?\n|\r/);
        for (const line of lines) {
            if (line.length === 0) continue;
            const st = new StringTokenizer(line, " +\t\n\r\f");
            while (st.hasMoreTokens()) {
                const type = st.nextToken();
                let tint = type.charCodeAt(0);
                try {
                    if (subs && tint !== '.'.charCodeAt(0)) continue;

                    if (tint === 'o'.charCodeAt(0)) {
                        const sc = new Scope(this.app, this.sim);
                        sc.undump(st);
                        this.scopes.addScope(sc);
                        break;
                    }
                    if (tint === 'h'.charCodeAt(0)) {
                        this.readHint(st);
                        break;
                    }
                    if (tint === '$'.charCodeAt(0)) {
                        this.readOptions(st, flags);
                        break;
                    }
                    if (tint === '!'.charCodeAt(0)) {
                        CustomLogicModel.undumpModel(st);
                        break;
                    }
                    if (tint === '%'.charCodeAt(0) || tint === '?'.charCodeAt(0) || tint === 'B'.charCodeAt(0)) {
                        // ignore afilter-specific stuff
                        break;
                    }

                    if (tint >= '0'.charCodeAt(0) && tint <= '9'.charCodeAt(0))
                        tint = parseInt(type);

                    if (tint === 34) {
                        DiodeModel.undumpModel(st);
                        break;
                    }
                    if (tint === 32) {
                        TransistorModel.undumpModel(st);
                        break;
                    }
                    if (tint === 38) {
                        const adj = new (window as any).Adjustable(st, this.app);
                        if (adj.elm != null)
                            this.app.adjustables.push(adj);
                        break;
                    }
                    if (tint === '.'.charCodeAt(0)) {
                        SubcircuitModel.undumpModel(st);
                        break;
                    }

                    const x1 = parseInt(st.nextToken());
                    const y1 = parseInt(st.nextToken());
                    const x2 = parseInt(st.nextToken());
                    const y2 = parseInt(st.nextToken());
                    const f  = parseInt(st.nextToken());

                    const newce = CirSim.createCe(tint, x1, y1, x2, y2, f, st);
                    if (newce == null) {
                        CirSim.console("unrecognized dump type: " + type);
                        break;
                    }
                    newce.setPoints();
                    this.app.elmList.push(newce);
                } catch (ee) {
                    CirSim.console("exception while undumping " + ee);
		    debugger;
                    this.app.consoleExceptionOccurred = true;
                    break;
                }
                break;
            }
        }

	this.finishReadCircuit(flags);
    }

    finishReadCircuit(flags: number): void {
        this.app.setPowerBarEnable();
        this.app.enableItems();

        if ((flags & CircuitLoader.RC_RETAIN) == 0) {
            for (let i = 0; i < this.app.adjustables.length; i++) {
                if (!this.app.adjustables[i].createSlider(this.app))
                    this.app.adjustables.splice(i--, 1);
            }
        }

        this.app.needAnalyze();
        if ((flags & CircuitLoader.RC_NO_CENTER) == 0)
            this.app.centerCircuit();

        if ((flags & CircuitLoader.RC_SUBCIRCUITS) != 0)
            this.app.updateModels();

        // AudioInputElm.clearCache();
        // DataInputElm.clearCache();
    }

    private readHint(st: StringTokenizer): void {
        this.app.hintType  = parseInt(st.nextToken());
        this.app.hintItem1 = parseInt(st.nextToken());
        this.app.hintItem2 = parseInt(st.nextToken());
    }

    private readOptions(st: StringTokenizer, importFlags: number): void {
        const flags = parseInt(st.nextToken());
        if ((importFlags & CircuitLoader.RC_RETAIN) != 0) {
            if ((flags & 2) != 0)
                this.menus.smallGridCheckItem.setState(true);
            return;
        }

        this.readCircuitFlags(flags);
        this.sim.maxTimeStep = this.sim.timeStep = parseFloat(st.nextToken());
        const sp = parseFloat(st.nextToken());
        const sp2 = Math.trunc(Math.log(10 * sp) * 24 + 61.5);
        this.app.ui.speedBar.setValue(sp2);
        this.app.ui.currentBar.setValue(parseInt(st.nextToken()));
        CircuitElm.voltageRange = parseFloat(st.nextToken());
        try {
            this.app.ui.powerBar.setValue(parseInt(st.nextToken()));
            this.sim.minTimeStep = parseFloat(st.nextToken());
        } catch (ignored) {}
        this.app.setGrid();
    }

    readCircuitFlags(flags: number): void {
        this.menus.dotsCheckItem.setState((flags & 1) != 0);
        this.menus.smallGridCheckItem.setState((flags & 2) != 0);
        this.menus.voltsCheckItem.setState((flags & 4) == 0);
        this.menus.powerCheckItem.setState((flags & 8) == 8);
        this.menus.showValuesCheckItem.setState((flags & 16) == 0);
        this.sim.adjustTimeStep = (flags & 64) != 0;
        this.app.autoDCOnReset = (flags & 128) != 0;
    }

    async loadFileFromURL(url: string): Promise<void> {
	try {
	    const response = await fetch(url);
	    if (response.ok) {
		const text = await response.text();
		this.readCircuit(text, CircuitLoader.RC_KEEP_TITLE);
		this.app.allowSave(false);
		this.app.unsavedChanges = false;
	    } else {
		window.alert(Locale.LS("Can't load circuit!"));
		console.log("Bad file server response:" + response.statusText);
	    }
	} catch (e) {
	    console.log("failed file reading", e);
	}
    }

}
