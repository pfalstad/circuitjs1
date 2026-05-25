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
import { CircuitElm } from "./CircuitElm";
import { EditInfo } from "./EditInfo";
import { EditDialog } from "./EditDialog";
import { Adjustable } from "./Adjustable";
import { Checkbox } from "./Checkbox";

export class SliderDialog extends Dialog {
    elm: CircuitElm;
    sim: CirSim;
    einfos: (EditInfo | null)[];
    logCheckboxes: (Checkbox | null)[];
    einfocount: number;

    // main content area (inserted before button panel)
    private contentDiv: HTMLDivElement;
    // button panel at bottom
    private hp: HTMLDivElement;

    constructor(ce: CircuitElm, f: CirSim) {
        super();
        this.sim = f;
        this.elm = ce;
        this.einfos = new Array(10).fill(null);
        this.logCheckboxes = new Array(10).fill(null);
        this.einfocount = 0;

        this.dialogEl.style.minWidth = "300px";

        const title = document.createElement("div");
        title.textContent = "Add Sliders";
        title.style.fontWeight = "bold";
        title.style.marginBottom = "8px";
        this.dialogEl.appendChild(title);

        this.contentDiv = document.createElement("div");
        this.dialogEl.appendChild(this.contentDiv);

        this.hp = document.createElement("div");
        this.hp.classList.add("topSpace");
        this.hp.style.display = "flex";
        this.hp.style.justifyContent = "space-between";
        this.hp.style.marginTop = "8px";

        const applyButton = document.createElement("button");
        applyButton.textContent = "Apply";
        applyButton.addEventListener("click", () => { this.apply(); });

        const okButton = document.createElement("button");
        okButton.textContent = "OK";
        okButton.addEventListener("click", () => { this.apply(); this.closeDialog(); });

        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => { this.closeDialog(); });

        const leftBtns = document.createElement("span");
        leftBtns.appendChild(applyButton);
        leftBtns.appendChild(okButton);
        this.hp.appendChild(leftBtns);
        this.hp.appendChild(cancelButton);
        this.dialogEl.appendChild(this.hp);

        this.buildDialog();
        this.show();
    }

    buildDialog(): void {
        for (let i = 0; ; i++) {
            this.einfos[i] = this.elm.getEditInfo(i);
            if (this.einfos[i] == null)
                break;
            const ei = this.einfos[i]!;
            if (!ei.canCreateAdjustable())
                continue;
            const adj = this.findAdjustable(i);

            // remove HTML tags from name
            let name = ei.name.replace(/<[^>]*>/g, "");

            const row = document.createElement("div");
            row.style.marginTop = "4px";

            // checkbox to enable/disable slider for this item
            const cbEl = document.createElement("input");
            cbEl.type = "checkbox";
            cbEl.checked = adj != null;
            cbEl.addEventListener("change", () => this.itemStateChanged(i, "checkbox", cbEl));
            const cbLabel = document.createElement("label");
            cbLabel.style.display = "flex";
            cbLabel.style.alignItems = "center";
            cbLabel.style.gap = "4px";
            cbLabel.appendChild(cbEl);
            cbLabel.appendChild(document.createTextNode(name));
            // store checkbox element on EditInfo for apply()
            if (ei.checkbox == null)
                ei.checkbox = new Checkbox(name, adj != null);
            ei.checkbox!.element = cbEl;
            row.appendChild(cbLabel);

            if (adj != null) {
                if (!adj.sliderBeingShared()) {
                    // choice for slider sharing
                    const sel = document.createElement("select");
                    const opt0 = document.createElement("option");
                    opt0.textContent = "New Slider";
                    sel.appendChild(opt0);
                    let ct = 0;
                    for (let j = 0; j !== this.sim.adjustables.length; j++) {
                        const adji: Adjustable = this.sim.adjustables[j];
                        // don't share with an object sharing with someone else
                        if (adji.sharedSlider != null)
                            break;
                        // don't share with ourselves
                        if (adji === adj)
                            continue;
                        const opt = document.createElement("option");
                        opt.textContent = "Share Slider: " + adji.sliderText;
                        sel.appendChild(opt);
                        ct++;
                        if (adji === adj.sharedSlider)
                            sel.selectedIndex = ct;
                    }
                    sel.addEventListener("change", () => this.itemStateChanged(i, "choice", sel));
                    row.appendChild(sel);
                }

                // min/max/step/log/label inputs
                row.appendChild(this.makeLabel("Min Value"));
                const minBox = document.createElement("input");
                minBox.type = "text";
                minBox.value = EditDialog.unitStringVal(ei, adj.minValue);
                minBox.style.width = "100%";
                ei.minBox = minBox;
                row.appendChild(minBox);

                row.appendChild(this.makeLabel("Max Value"));
                const maxBox = document.createElement("input");
                maxBox.type = "text";
                maxBox.value = EditDialog.unitStringVal(ei, adj.maxValue);
                maxBox.style.width = "100%";
                ei.maxBox = maxBox;
                row.appendChild(maxBox);

                row.appendChild(this.makeLabel("Step (0=continuous)"));
                const stepBox = document.createElement("input");
                stepBox.type = "text";
                stepBox.value = EditDialog.unitStringVal(ei, adj.sliderStep);
                stepBox.style.width = "100%";
                ei.stepBox = stepBox;
                row.appendChild(stepBox);

                const logCbEl = document.createElement("input");
                logCbEl.type = "checkbox";
                logCbEl.checked = adj.logarithmic;
                const logCb = new Checkbox("Logarithmic", adj.logarithmic);
                logCb.element = logCbEl;
                this.logCheckboxes[i] = logCb;
                const logLabel = document.createElement("label");
                logLabel.style.display = "flex";
                logLabel.style.alignItems = "center";
                logLabel.style.gap = "4px";
                logLabel.appendChild(logCbEl);
                logLabel.appendChild(document.createTextNode("Logarithmic"));
                row.appendChild(logLabel);

                if (adj.sharedSlider == null) {
                    row.appendChild(this.makeLabel("Label"));
                    const labelBox = document.createElement("input");
                    labelBox.type = "text";
                    labelBox.value = adj.sliderText;
                    labelBox.style.width = "100%";
                    ei.labelBox = labelBox;
                    row.appendChild(labelBox);
                }
            }

            this.contentDiv.appendChild(row);
        }
        this.einfocount = this.einfos.findIndex(e => e == null);
        if (this.einfocount < 0) this.einfocount = this.einfos.length;
    }

    private makeLabel(text: string): HTMLElement {
        const el = document.createElement("div");
        el.textContent = text;
        el.style.marginTop = "4px";
        el.style.fontSize = "0.9em";
        return el;
    }

    findAdjustable(item: number): Adjustable | null {
        return this.sim.findAdjustable(this.elm, item) as Adjustable | null;
    }

    apply(): boolean {
        for (let i = 0; i !== this.einfocount; i++) {
            const adj = this.findAdjustable(i);
            if (adj == null)
                continue;
            const ei = this.einfos[i]!;
            try {
                adj.sliderText = ei.labelBox == null ? "" : ei.labelBox.value;
                if (adj.label != null)
                    adj.label.textContent = adj.sliderText;
                if (ei.minBox) {
                    const d = EditDialog.parseUnits(ei.minBox.value);
                    adj.minValue = d;
                }
                if (ei.maxBox) {
                    const d = EditDialog.parseUnits(ei.maxBox.value);
                    adj.maxValue = d;
                }
                if (ei.stepBox) {
                    const d = EditDialog.parseUnits(ei.stepBox.value);
                    adj.sliderStep = d;
                    if (adj.slider != null && adj.maxValue !== adj.minValue)
                        adj.slider.element.step = String(d * 100 / (adj.maxValue - adj.minValue));
                }
                if (this.logCheckboxes[i] != null)
                    adj.logarithmic = this.logCheckboxes[i]!.getState();
                // guard: logarithmic requires minValue > 0
                if (adj.logarithmic && adj.minValue <= 0)
                    adj.logarithmic = false;
                adj.setSliderValue(ei.value);
            } catch (e) { CirSim.console(String(e)); }
        }
        return true;
    }

    itemStateChanged(i: number, type: "checkbox" | "choice", src: HTMLElement): void {
        const ei = this.einfos[i];
        if (ei == null) return;
        this.apply();
        if (type === "checkbox") {
            const cbEl = src as HTMLInputElement;
            if (cbEl.checked) {
                const adj = new Adjustable(this.elm, i);
                adj.sliderText = ei.name.replace(/ \(.*\)$/, "");
                adj.createSliderWithValue(this.sim, ei.value);
                this.sim.adjustables.push(adj);
            } else {
                const adj = this.findAdjustable(i);
                if (adj) {
                    adj.deleteSlider(this.sim);
                    const idx = this.sim.adjustables.indexOf(adj);
                    if (idx >= 0) this.sim.adjustables.splice(idx, 1);
                }
            }
        } else if (type === "choice") {
            const sel = src as HTMLSelectElement;
            const adj = this.findAdjustable(i);
            if (adj) {
                if (sel.selectedIndex === 0) {
                    // new slider
                    adj.sharedSlider = null;
                    if (!adj.sliderText || adj.sliderText.length === 0)
                        adj.sliderText = ei.name.replace(/ \(.*\)$/, "");
                    adj.createSliderWithValue(this.sim, ei.value);
                } else {
                    let ct = 0;
                    for (let j = 0; j !== this.sim.adjustables.length; j++) {
                        const adji: Adjustable = this.sim.adjustables[j];
                        if (adji.sharedSlider != null)
                            break;
                        if (adji === adj)
                            continue;
                        if (++ct === sel.selectedIndex) {
                            adj.sharedSlider = adji;
                            adj.deleteSlider(this.sim);
                        }
                    }
                }
            }
        }
        Adjustable.reorderAdjustables();
        this.clearDialog();
        this.buildDialog();
    }

    clearDialog(): void {
        while (this.contentDiv.firstChild)
            this.contentDiv.removeChild(this.contentDiv.firstChild);
        for (let j = 0; j < this.logCheckboxes.length; j++)
            this.logCheckboxes[j] = null;
        for (let j = 0; j < this.einfos.length; j++) {
            if (this.einfos[j]) {
                this.einfos[j]!.minBox = null;
                this.einfos[j]!.maxBox = null;
                this.einfos[j]!.labelBox = null;
                this.einfos[j]!.stepBox = null;
                this.einfos[j]!.checkbox = null;
            }
        }
    }
}

// Register on window so CommandManager can access without a circular import
(window as any).SliderDialog = SliderDialog;
