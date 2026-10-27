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
import { CircuitElm } from "./CircuitElm";
import { ScrollValuePopup } from "./ScrollValuePopup";
import { ElementFactory } from "./ElementFactory";
import { Locale } from "./Locale";

// popup for toggling MOSFET/JFET/transistor type on scroll wheel, similar to
// ScrollValuePopup for R/C/L values.
// Also cycles logic gates through AND/NAND/OR/NOR/XOR/XNOR. Gate type is the
// element's class, not a field, so each step replaces the element with a new
// one of the next class. Invert Inputs and DeMorgan are cleared on each step
// (Invert Inputs changes the gate's function). A scope on the gate is removed,
// same as deleting the gate.
export class TypeScrollPopup {

    private myElm: any;
    private originalElm: any;
    private sim: CirSim;
    private originalPnp: number;
    private currentPnp: number;
    private gateIndex = 0;
    private typeLabel!: HTMLDivElement;
    private deltaY = 0;
    private stepsDone = 0;

    // gate cycle order (wraps). the current gate is found by dump type; the next
    // one is created through ElementFactory by class name.
    private static readonly gateDumpTypes = [150, 151, 152, 153, 154, 431];
    private static readonly gateClasses = ["AndGateElm", "NandGateElm", "OrGateElm",
                                           "NorGateElm", "XorGateElm", "XnorGateElm"];
    // GateElm flags (not imported, to keep elements out of this file)
    private static readonly GATE_FLAG_SMALL = 1<<0;
    private static readonly GATE_FLAG_INVERT_INPUTS = 1<<2;
    private static readonly GATE_FLAG_DEMORGAN = 1<<3;

    private panel: HTMLDivElement;
    private closed = false;

    private readonly onWheel = (e: WheelEvent) => {
        e.preventDefault();
        this.doDeltaY(ScrollValuePopup.normalizeWheelDelta(e));
    };
    private readonly onMouseOut = () => this.close(true);
    private readonly onMouseDown = (e: MouseEvent) => {
        if (e.button === 0 || e.button === 1)
            this.close(true);
        else
            this.close(false);
    };

    constructor(x: number, y: number, dy: number, elm: CircuitElm, sim: CirSim) {
        this.myElm = elm;
        this.originalElm = elm;
        this.sim = sim;
        this.sim.undoManager.pushUndo();

        this.originalPnp = this.myElm.pnp;
        this.currentPnp = this.originalPnp;
        if (this.myElm.isGateElm())
            this.gateIndex = TypeScrollPopup.gateDumpTypes.indexOf(this.myElm.getDumpType());

        this.panel = document.createElement("div");
        this.panel.className = "scrollValuePopup";

        const header = document.createElement("div");
        header.className = "scrollValuePopup-label off2";
        header.textContent = this.getHeaderText();
        this.panel.appendChild(header);

        this.typeLabel = document.createElement("div");
        this.typeLabel.className = "scrollValuePopup-label selected";
        this.panel.appendChild(this.typeLabel);
        this.updateLabel();

        this.panel.addEventListener("wheel", this.onWheel, { passive: false });
        this.panel.addEventListener("mouseout", this.onMouseOut);
        this.panel.addEventListener("mousedown", this.onMouseDown);

        this.doDeltaY(dy);

        // position off-screen first so we can measure it, then place it relative to (x, y)
        // and clamp to stay on-screen, matching the GWT PositionCallback behavior
        this.panel.style.visibility = "hidden";
        document.body.appendChild(this.panel);
        const w = this.panel.offsetWidth;
        const h = this.panel.offsetHeight;
        const left = Math.max(0, x - w / 4);
        const top = Math.max(0, y - h / 2);
        this.panel.style.left = left + "px";
        this.panel.style.top = top + "px";
        this.panel.style.visibility = "";
    }

    private getHeaderText(): string {
        if (this.myElm.isJfetElm())
            return Locale.LS("JFET Type");
        if (this.myElm.isMosfetElm())
            return Locale.LS("MOSFET Type");
        if (this.myElm.isGateElm())
            return Locale.LS("Gate Type");
        return Locale.LS("Transistor Type");
    }

    doDeltaY(dy: number): void {
        // same as ScrollValuePopup (#421): a single wheel event moves at most one step
        // (times the sensitivity), so one notch is one step on any browser; small
        // trackpad deltas still accumulate
        dy /= (window.devicePixelRatio || 1);
        this.deltaY += Math.max(-ScrollValuePopup.scale, Math.min(ScrollValuePopup.scale, dy));
        const steps = Math.round(this.sim.mouse.wheelSensitivity * this.deltaY / ScrollValuePopup.scale);
        while (this.stepsDone < steps) {
            this.stepsDone++;
            this.toggle(1);
        }
        while (this.stepsDone > steps) {
            this.stepsDone--;
            this.toggle(-1);
        }
    }

    private stepGate(dir: number): void {
        const old = this.myElm;
        const n = TypeScrollPopup.gateClasses.length;
        this.gateIndex = (this.gateIndex + dir + n) % n;
        const g = ElementFactory.create(TypeScrollPopup.gateClasses[this.gateIndex], old.x, old.y);
        g.x2 = old.x2;
        g.y2 = old.y2;
        g.flags = old.flags & ~(TypeScrollPopup.GATE_FLAG_INVERT_INPUTS | TypeScrollPopup.GATE_FLAG_DEMORGAN);
        g.inputCount = old.inputCount;
        g.highVoltage = old.highVoltage;
        g.propagationDelay = old.propagationDelay;
        g.setSize((g.flags & TypeScrollPopup.GATE_FLAG_SMALL) !== 0 ? 1 : 2);
        g.allocNodes();
        g.setupVolts();
        g.setPoints();
        this.replaceElm(g);
    }

    // put newElm in myElm's place in the circuit
    private replaceElm(newElm: any): void {
        const i = this.sim.locateElm(this.myElm);
        this.sim.elmList[i] = newElm;
        newElm.setSelected(this.myElm.isSelected());
        this.sim.mouse.setMouseElm(newElm);
        this.myElm = newElm;
        this.sim.scopeManager.deleteUnusedScopeElms();
    }

    private toggle(dir: number): void {
        const e = this.myElm;
        if (e.isGateElm()) {
            this.stepGate(dir);
        } else if (e.isMosfetElm()) {
            e.pnp = -e.pnp;
            e.flags ^= e.FLAG_PNP;
            e.setPoints();
            this.currentPnp = e.pnp;
        } else if (e.isTransistorElm()) {
            e.pnp = -e.pnp;
            e.setPoints();
            this.currentPnp = e.pnp;
        }
        this.sim.needAnalyze();
        this.updateLabel();
    }

    private updateLabel(): void {
        let text: string;
        if (this.myElm.isGateElm()) {
            text = Locale.LS(this.myElm.getGateName());
        } else if (this.myElm.isMosfetElm()) {
            text = this.myElm.isJfetElm()
                ? (this.currentPnp === -1 ? Locale.LS("P-Channel JFET") : Locale.LS("N-Channel JFET"))
                : (this.currentPnp === -1 ? Locale.LS("P-Channel") : Locale.LS("N-Channel"));
        } else {
            text = this.currentPnp === -1 ? "PNP" : "NPN";
        }
        this.typeLabel.textContent = text;
    }

    close(keepChanges: boolean): void {
        if (this.closed)
            return;
        this.closed = true;
        if (!keepChanges) {
            // revert to original state
            if (this.myElm !== this.originalElm) {
                // gate: put the original element back, flags and all
                this.replaceElm(this.originalElm);
                this.sim.needAnalyze();
            } else {
                while (this.currentPnp !== this.originalPnp)
                    this.toggle(1);
            }
        }
        this.panel.remove();
        CirSim.typeScrollPopup = null;
    }

    isShowing(): boolean {
        return !this.closed;
    }
}
