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

import { Dialog } from "./Dialog";
import { CirSim } from "./CirSim";
import { UIManager } from "./UIManager";
import { CircuitElm } from "./CircuitElm";
import { VoltageElm } from "./VoltageElm";
import type { Editable } from "./Editable";
import { EditInfo } from "./EditInfo";
import { Locale } from "./Locale";
import { parseFloatStrict } from "./NumberParse";

const ROOT2 = 1.41421356237309504880;

// NumberFormat.getFormat("####.##########") — no thousands separators, up to 10 decimal places
function noCommaFormat(v: number): string {
    // strip trailing zeros after decimal point
    let s = v.toPrecision(10).replace(/\.?0+$/, "");
    // toPrecision can produce scientific notation for very large/small values; fall back to toString
    if (s.includes("e") || s.includes("E"))
        s = String(v);
    return s;
}

export class EditDialog extends Dialog {
    elm: Editable;
    cframe: CirSim;
    einfos: (EditInfo | null)[];
    einfocount: number = 0;

    private mainPanel: HTMLDivElement;
    private errorLabel: HTMLDivElement;
    private colsRow: HTMLDivElement;       // holds the column panels
    private activeCol: HTMLDivElement;     // current column being filled
    private activeColCount: number = 0;
    private firstInput: HTMLInputElement | HTMLTextAreaElement | null = null;
    protected applyButton: HTMLButtonElement;

    constructor(ce: Editable, f: CirSim) {
        super();
        this.elm = ce;
        this.cframe = f;
        this.einfos = new Array(20).fill(null);

        // Title
        let title = "Edit Component";
        if (ce instanceof CircuitElm) {
            const name = (ce as CircuitElm).getElmType();
            if (name)
                title = "Edit " + name.charAt(0).toUpperCase() + name.slice(1);
        }

        this.dialogEl.innerHTML = "";

        const titleEl = document.createElement("h3");
        titleEl.textContent = Locale.LS(title);
        titleEl.style.margin = "0 0 8px 0";
        this.dialogEl.appendChild(titleEl);

        this.mainPanel = document.createElement("div");
        this.dialogEl.appendChild(this.mainPanel);

        // Error label
        this.errorLabel = document.createElement("div");
        this.errorLabel.style.color = "red";
        this.errorLabel.style.display = "none";
        this.mainPanel.appendChild(this.errorLabel);

        // Columns row (fields inserted before buttons)
        this.colsRow = document.createElement("div");
        this.colsRow.style.display = "flex";
        this.colsRow.style.alignItems = "flex-start";
        this.colsRow.style.gap = "10px";
        this.mainPanel.appendChild(this.colsRow);

        this.activeCol = this.addColumn();

        this.buildDialog();

        // Buttons row
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;justify-content:space-between;margin-top:10px;gap:6px;";
        this.mainPanel.appendChild(btnRow);

        const applyBtn = document.createElement("button");
        applyBtn.textContent = Locale.LS("Apply");
        applyBtn.onclick = () => this.apply();
        btnRow.appendChild(applyBtn);
        this.applyButton = applyBtn;

        const okBtn = document.createElement("button");
        okBtn.textContent = Locale.LS("OK");
        okBtn.onclick = () => { if (this.apply()) this.closeDialog(); };
        btnRow.appendChild(okBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = Locale.LS("Cancel");
        cancelBtn.onclick = () => this.closeDialog();
        btnRow.appendChild(cancelBtn);

        // Focus first text input after the dialog opens
        if (this.firstInput !== null) {
            const inp = this.firstInput;
            requestAnimationFrame(() => { inp.focus(); inp.select(); });
        }
    }

    private addColumn(): HTMLDivElement {
        const col = document.createElement("div");
        col.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:180px;";
        this.colsRow.appendChild(col);
        this.activeColCount = 0;
        return col;
    }

    buildDialog(): void {
        let i = 0;
        for (; ; i++) {
            this.einfos[i] = this.elm.getEditInfo(i);
            if (this.einfos[i] === null) break;
            const ei = this.einfos[i]!;

            // Start new column when current is full or element requests it
            if (this.activeColCount > 15 || ei.newColumn) {
                this.activeCol = this.addColumn();
            }

            const name = Locale.LS(ei.name);
            const label = document.createElement("label");
            if (ei.name.startsWith("<"))
                label.innerHTML = name;
            else
                label.textContent = name;
            if (this.activeColCount > 0)
                label.style.marginTop = "6px";
            this.activeCol.appendChild(label);
            this.activeColCount++;

            const idx = i; // snapshot loop index for closures
            if (ei.choice !== null) {
                const sel = document.createElement("select");
                for (let j = 0; j < ei.choice.items.length; j++) {
                    const opt = document.createElement("option");
                    opt.textContent = ei.choice.items[j];
                    sel.appendChild(opt);
                }
                sel.selectedIndex = ei.choice.selectedIndex;
                ei.choice.element = sel;
                sel.onchange = () => this.itemStateChanged(idx);
                this.activeCol.appendChild(sel);

            } else if (ei.checkbox !== null) {
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.checked = ei.checkbox.state;
                ei.checkbox.element = cb;
                const cbLabel = document.createElement("label");
                cbLabel.style.cssText = "display:flex;align-items:center;gap:4px;";
                cbLabel.appendChild(cb);
                cbLabel.appendChild(document.createTextNode(ei.checkbox.name));
                cb.onchange = () => this.itemStateChanged(idx);
                this.activeCol.appendChild(cbLabel);

            } else if (ei.button !== null) {
                const btn = document.createElement("button");
                btn.textContent = ei.button.label ?? ei.button.textContent ?? String(ei.button);
                btn.onclick = () => this.itemStateChanged(idx);
                this.activeCol.appendChild(btn);

            } else if (ei.textArea !== null) {
                const ta = document.createElement("textarea");
                ta.value = ei.textArea.value ?? "";
                ta.rows = 4;
                ta.cols = 40;
                ei.textArea.element = ta;
                if (this.firstInput === null)
                    this.firstInput = ta;
                this.activeCol.appendChild(ta);
                this.closeOnEnter = false;

            } else if (ei.widget !== null) {
                this.activeCol.appendChild(ei.widget as HTMLElement);

            } else {
                // Plain text input
                const inp = document.createElement("input");
                inp.type = "text";
                inp.style.width = "180px";
                ei.textf = inp;
                if (this.firstInput === null)
                    this.firstInput = inp;
                if (ei.text !== null) {
                    inp.value = ei.text;
                    if (ei.isColor)
                        inp.type = "color";
                    this.activeCol.appendChild(inp);
                } else {
                    inp.value = this.unitString(ei);
                    this.activeCol.appendChild(this.makeValueStepperRow(ei));
                }
            }
        }
        this.einfocount = i;
    }

    // preferred-value series used by stepE12(), repeating every decade (reused from the E12
    // table circuitjs1's ScrollValuePopup uses for its scroll-to-adjust popup)
    static readonly E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

    // A text field with "-"/"+" buttons that step the value, so it can be tweaked without
    // having to type on a mobile keyboard. Component values (R/L/C, etc.) step through the
    // E12 preferred-value series (reusing the same table ScrollValuePopup uses for its
    // scroll-to-adjust popup); dimensionless fields and voltage sources, which don't really
    // have a "preferred value" series, just step by 1. Holding a button down repeats the step.
    private makeValueStepperRow(ei: EditInfo): HTMLDivElement {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:2px;";
        const minus = document.createElement("button");
        minus.type = "button";
        minus.textContent = "−";
        const plus = document.createElement("button");
        plus.type = "button";
        plus.textContent = "+";
        minus.style.width = "2em";
        plus.style.width = "2em";
        // without this, holding the button down on iOS is treated as a long-press on
        // selectable text and pops up the Copy/Look Up/etc. callout instead of repeating
        EditDialog.disableTouchCallout(minus);
        EditDialog.disableTouchCallout(plus);
        this.addRepeatingStepHandler(minus, ei, -1);
        this.addRepeatingStepHandler(plus, ei, 1);
        row.appendChild(minus);
        row.appendChild(ei.textf as HTMLElement);
        row.appendChild(plus);
        return row;
    }

    private static disableTouchCallout(button: HTMLButtonElement): void {
        const style = button.style as any;
        style.webkitTouchCallout = "none";
        style.webkitUserSelect = "none";
        style.userSelect = "none";
        style.touchAction = "manipulation";
    }

    // step once immediately on mouse/touch-down, then keep stepping at a fixed rate for as
    // long as the button is held, like a native stepper control
    private addRepeatingStepHandler(button: HTMLButtonElement, ei: EditInfo, dir: number): void {
        let repeatTimer: ReturnType<typeof setInterval> | null = null;
        let startRepeatTimer: ReturnType<typeof setTimeout> | null = null;
        const stop = () => {
            if (startRepeatTimer !== null) { clearTimeout(startRepeatTimer); startRepeatTimer = null; }
            if (repeatTimer !== null) { clearInterval(repeatTimer); repeatTimer = null; }
        };
        button.addEventListener("mousedown", () => {
            this.stepValue(ei, dir);
            startRepeatTimer = setTimeout(() => {
                repeatTimer = setInterval(() => this.stepValue(ei, dir), 120);
            }, 400);
        });
        button.addEventListener("mouseup", stop);
        button.addEventListener("mouseout", stop);

        // On touch devices, mousedown/mouseup are synthesized from touchstart/touchend, but
        // only *after* touchend has already fired - so a mousedown-based repeat never gets a
        // chance to run while the finger is actually held down. Handle real touch events
        // directly instead, and preventDefault() on touchstart so the browser doesn't also
        // fire the (now redundant, badly-timed) synthetic mouse events afterward.
        button.addEventListener("touchstart", (e: TouchEvent) => {
            e.preventDefault();
            this.stepValue(ei, dir);
            startRepeatTimer = setTimeout(() => {
                repeatTimer = setInterval(() => this.stepValue(ei, dir), 120);
            }, 400);
        }, { passive: false });
        button.addEventListener("touchend", stop);
        button.addEventListener("touchcancel", stop);
    }

    stepValue(ei: EditInfo, dir: number): void {
        let cur: number;
        try {
            cur = this.parseUnitsEi(ei);
        } catch (ex) {
            cur = ei.value;
        }
        const linearStep = ei.dimensionless || ei.unitStep;
        const next = linearStep ? cur + dir : EditDialog.stepE12(cur, dir);
        // just update the displayed text, like typing a new value would; actually committing
        // it to the element happens on Apply/OK like normal, so Cancel still works correctly
        (ei.textf as HTMLInputElement).value = EditDialog.unitStringVal(ei, next);
    }

    // step to the next/previous value (in direction dir) in the E12 preferred-value series,
    // which repeats every decade; preserves sign, and treats 0 as just below the first step
    static stepE12(value: number, dir: number): number {
        const e12 = EditDialog.E12;
        if (value === 0)
            return dir > 0 ? e12[0] : -e12[0];
        const sign = value < 0 ? -1 : 1;
        const av = Math.abs(value);
        let decade = Math.floor(Math.log10(av));
        let idx = 0;
        for (let i = 0; i < e12.length; i++) {
            if (e12[i] * Math.pow(10, decade) <= av * 1.0000001)
                idx = i;
        }
        idx += dir;
        if (idx < 0) {
            idx = e12.length - 1;
            decade--;
        } else if (idx >= e12.length) {
            idx = 0;
            decade++;
        }
        return sign * e12[idx] * Math.pow(10, decade);
    }

    unitString(ei: EditInfo): string {
        if (this.elm instanceof VoltageElm) {
            const ve = this.elm as VoltageElm;
            if (ve.useRmsDisplay(ei.value))
                return EditDialog.unitStringVal(ei, ei.value * ve.getRmsMultiplier()) + "rms";
        }
        return EditDialog.unitStringVal(ei, ei.value);
    }

    static unitStringVal(ei: EditInfo | null, v: number): string {
        const va = Math.abs(v);
        if (ei !== null && ei.dimensionless) return noCommaFormat(v);
        if (!isFinite(va))                   return noCommaFormat(v);
        if (v === 0) return "0";
        if (va < 1e-12) return noCommaFormat(v * 1e15) + "f";
        if (va < 1e-9)  return noCommaFormat(v * 1e12) + "p";
        if (va < 1e-6)  return noCommaFormat(v * 1e9)  + "n";
        if (va < 1e-3)  return noCommaFormat(v * 1e6)  + "u";
        if (va < 1)     return noCommaFormat(v * 1e3)  + "m";
        if (va < 1e3)   return noCommaFormat(v);
        if (va < 1e6)   return noCommaFormat(v * 1e-3) + "k";
        if (va < 1e9)   return noCommaFormat(v * 1e-6) + "M";
        return                  noCommaFormat(v * 1e-9) + "G";
    }

    parseUnitsEi(ei: EditInfo): number {
        let s = (ei.textf as HTMLInputElement).value.trim();
        if (this.elm instanceof VoltageElm && s.endsWith("rms")) {
            s = s.slice(0, -3).trim();
            const rmsMult = (this.elm as VoltageElm).getRmsMultiplier();
            if (rmsMult > 0)
                return EditDialog.parseUnits(s) / rmsMult;
        }
        return EditDialog.parseUnits(s);
    }

    static parseUnits(s: string): number {
        s = s.trim();
        let rmsMult = 1;
        if (s.endsWith("rms")) {
            s = s.slice(0, -3).trim();
            rmsMult = ROOT2;
        }
        // rewrite shorthand e.g. "2k2" → "2.2k"
        s = s.replace(/([0-9]+)([pPnNuUmMkKgG])([0-9]+)/, "$1.$3$2");
        // rewrite "meg" → "M"
        s = s.replace(/[mM][eE][gG]$/, "M");

        // handle scientific notation before checking unit suffixes
        if (/^-?[0-9]*\.?[0-9]+[eE][+-]?[0-9]+$/.test(s))
            return parseFloatStrict(s) * rmsMult;

        const uc = s.charAt(s.length - 1);
        let mult = 1;
        switch (uc) {
            case 'f': case 'F': mult = 1e-15; break;
            case 'p': case 'P': mult = 1e-12; break;
            case 'n': case 'N': mult = 1e-9;  break;
            case 'u': case 'U': mult = 1e-6;  break;
            case 'm':           mult = 1e-3;  break;
            case 'k': case 'K': mult = 1e3;   break;
            case 'M':           mult = 1e6;   break;
            case 'G': case 'g': mult = 1e9;   break;
        }
        if (mult !== 1)
            s = s.slice(0, -1).trim();
        return parseFloatStrict(s) * mult * rmsMult;
    }

    apply(): boolean {
        for (let i = 0; i !== this.einfocount; i++) {
            const ei = this.einfos[i]!;
            ei.error = null;
            if (ei.textf !== null && ei.text === null) {
                try {
                    ei.value = this.parseUnitsEi(ei);
                } catch (ex) { /* ignored */ }
            }
            if (ei.positive && ei.value <= 0)
                ei.setError("must be > 0");
            if (ei.nonNegative && ei.value < 0)
                ei.setError("must be >= 0");
            // choices and buttons are handled via itemStateChanged, not apply
            if (ei.button !== null || ei.choice !== null)
                continue;
            if (ei.error === null)
                this.elm.setEditValue(i, ei);
            if (ei.error !== null) {
                const field = ei.errorFieldName ?? ei.name;
                const msg   = (field && field.length > 0) ? field + ": " + ei.error : ei.error;
                this.errorLabel.textContent = msg;
                this.errorLabel.style.display = "";
                return false;
            }
            // update slider if any
            if (this.elm instanceof CircuitElm) {
                const adj = this.cframe.findAdjustable(this.elm, i);
                if (adj !== null)
                    adj.setSliderValue(ei.value);
            }
        }
        this.errorLabel.style.display = "none";
        this.cframe.needAnalyze();
        return true;
    }

    itemStateChanged(idx: number): void {
        const ei = this.einfos[idx]!;
        let changed = false;
        let applied = false;

        // for buttons and choices, apply pending text-field changes first
        if ((ei.button !== null || ei.choice !== null) && !ei.newDialog) {
            this.apply();
            applied = true;
        }

        this.elm.setEditValue(idx, ei);
        if (ei.newDialog)
            changed = true;
        this.cframe.needAnalyze();

        if (changed) {
            if (!applied) this.apply();
            this.clearDialog();
            this.buildDialog();
        }
    }

    resetDialog(): void {
        this.clearDialog();
        this.buildDialog();
    }

    clearDialog(): void {
        this.colsRow.innerHTML = "";
        this.activeCol = this.addColumn();
        this.firstInput = null;
        this.einfos.fill(null);
        this.einfocount = 0;
    }

    // Non-modal and docked to the side: unlike other dialogs, this one pops up automatically
    // whenever an element is created or clicked on, so it must not block interacting with the
    // rest of the circuit (clicking other elements re-targets this same dialog instead of
    // opening a second one; see CommandManager.doEdit).
    show(topOffset: number = 70): void {
        this.dialogEl.style.position = "fixed";
        this.dialogEl.style.margin = "0";
        this.dialogEl.style.top = topOffset + "px";
        this.dialogEl.style.left = "auto";
        // dock to the left of the element-picker sidebar, not on top of it
        this.dialogEl.style.right = (UIManager.VERTICALPANELWIDTH + 16) + "px";
        this.dialogEl.show();
    }

    closeDialog(): void {
        super.closeDialog();
        if (CirSim.editDialog === this)
            CirSim.editDialog = null;
        if (CirSim.customLogicEditDialog === this)
            CirSim.customLogicEditDialog = null;
    }
}
