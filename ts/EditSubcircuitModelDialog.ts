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
import { SubcircuitModel } from "./SubcircuitModel";
import { ChipElm } from "./ChipElm";
import { ChipPinEditor } from "./ChipPinEditor";
import { Locale } from "./Locale";
import { CirSim } from "./CirSim";
import { SimulationManager } from "./SimulationManager";
import { SubcircuitElm } from "./SubcircuitElm";

export class EditSubcircuitModelDialog extends Dialog {
    model: SubcircuitModel = null!;
    popContext: boolean = false;
    editor: ChipPinEditor | null = null;

    private modelNameInput: HTMLInputElement | null = null;
    private scopeSelect: HTMLSelectElement | null = null;
    private labelCheck: HTMLInputElement | null = null;

    static readonly SCOPE_THIS_CIRCUIT = 0;
    static readonly SCOPE_THIS_SESSION = 1;
    static readonly SCOPE_SAVE_ACROSS_SESSIONS = 2;

    constructor() {
        super();
        this.closeOnEnter = true;
    }

    setModel(m: SubcircuitModel): void { this.model = m; }

    createModel(): boolean {
        const nodeSet = new Set<number>();
        this.model = (SimulationManager.theSim as any).getCircuitAsComposite();
        if (!this.model) return false;
        if (this.model.extList.length === 0) {
            window.alert(Locale.LS("Device has no external inputs/outputs!"));
            this.model.remove();
            return false;
        }
        this.model.extList.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

        const postCount = this.model.extList.length;
        const sideCounts = [0, 0, 0, 0];
        for (let i = 0; i < postCount; i++) {
            const pin = this.model.extList[i];
            if (pin.busZ === 0) sideCounts[pin.side]++;
            if (nodeSet.has(pin.node)) {
                window.alert(Locale.LS("Can't have two input/output nodes connected!"));
                return false;
            }
            nodeSet.add(pin.node);
        }

        const xOffsetLeft  = sideCounts[ChipElm.SIDE_W] > 0 ? 1 : 0;
        const xOffsetRight = sideCounts[ChipElm.SIDE_E] > 0 ? 1 : 0;
        for (let i = 0; i < postCount; i++) {
            const pin = this.model.extList[i];
            if (pin.side === ChipElm.SIDE_N || pin.side === ChipElm.SIDE_S)
                pin.pos += xOffsetLeft;
        }

        const minHeight = (sideCounts[ChipElm.SIDE_N] > 0 && sideCounts[ChipElm.SIDE_S] > 0) ? 2 : 1;
        const pinsNS = Math.max(sideCounts[ChipElm.SIDE_N], sideCounts[ChipElm.SIDE_S]);
        const pinsWE = Math.max(sideCounts[ChipElm.SIDE_W], sideCounts[ChipElm.SIDE_E]);
        this.model.sizeX = Math.max(2, pinsNS + xOffsetLeft + xOffsetRight);
        this.model.sizeY = Math.max(minHeight, pinsWE);
        return true;
    }

    createDialog(): void {
        this.dialogEl.innerHTML = "";

        const title = document.createElement("div");
        title.textContent = Locale.LS("Edit Subcircuit Pin Layout");
        title.style.fontWeight = "bold";
        title.style.marginBottom = "8px";
        this.dialogEl.appendChild(title);

        this.dialogEl.appendChild(
            Object.assign(document.createElement("div"), { textContent: Locale.LS("Drag the pins to the desired position") })
        );

        this.editor = new ChipPinEditor(this.model.extList, this.model, {
            getLabel: () => this.labelCheck?.checked
                ? (this.modelNameInput ? this.modelNameInput.value : this.model.name)
                : null,
        });
        this.dialogEl.appendChild(this.editor.canvas);

        if (this.model.name === null || this.model.name === "") {
            this.dialogEl.appendChild(Object.assign(document.createElement("label"), { textContent: Locale.LS("Model Name") }));
            this.modelNameInput = document.createElement("input");
            this.modelNameInput.type = "text";
            this.modelNameInput.style.display = "block";
            this.modelNameInput.addEventListener("input", () => this.drawChip());
            this.dialogEl.appendChild(this.modelNameInput);
        }

        this.dialogEl.appendChild(this.editor.createSizeControls());

        // Label checkbox
        const labelLabel = document.createElement("label");
        this.labelCheck = document.createElement("input");
        this.labelCheck.type = "checkbox";
        this.labelCheck.checked = this.model.showLabel();
        this.labelCheck.addEventListener("change", () => {
            this.model.setShowLabel(this.labelCheck!.checked);
            this.drawChip();
        });
        labelLabel.appendChild(this.labelCheck);
        labelLabel.appendChild(document.createTextNode(" " + Locale.LS("Show Label")));
        this.dialogEl.appendChild(labelLabel);

        // Scope selector
        const scopeRow = document.createElement("div");
        scopeRow.style.margin = "8px 0";
        scopeRow.appendChild(Object.assign(document.createElement("span"), { textContent: Locale.LS("Scope:") + " " }));
        this.scopeSelect = document.createElement("select");
        const scopes = [Locale.LS("This Circuit"), Locale.LS("This Session"), Locale.LS("Save Across Sessions")];
        scopes.forEach(s => this.scopeSelect!.appendChild(Object.assign(document.createElement("option"), { textContent: s })));
        if (this.model.isSaved())
            this.scopeSelect.value = scopes[EditSubcircuitModelDialog.SCOPE_SAVE_ACROSS_SESSIONS];
        else if (this.model.name && SubcircuitModel.registry.hasGlobal(this.model.name))
            this.scopeSelect.selectedIndex = EditSubcircuitModelDialog.SCOPE_THIS_SESSION;
        else
            this.scopeSelect.selectedIndex = EditSubcircuitModelDialog.SCOPE_THIS_CIRCUIT;
        scopeRow.appendChild(this.scopeSelect);
        this.dialogEl.appendChild(scopeRow);

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "8px";
        const okBtn = document.createElement("button");
        okBtn.textContent = Locale.LS("OK");
        okBtn.addEventListener("click", () => this.enterPressed());
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = Locale.LS("Cancel");
        cancelBtn.addEventListener("click", () => this.closeDialog());
        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);
        this.dialogEl.appendChild(btnRow);

        this.show();
    }

    enterPressed(): void {
        if (this.modelNameInput) {
            const name = this.modelNameInput.value;
            if (name.length === 0) {
                window.alert(Locale.LS("Please enter a model name."));
                return;
            }
            SubcircuitElm.lastModelName = name;
        this.model.setName(name);
        }
        const scope = this.scopeSelect!.selectedIndex;
        SubcircuitModel.registry.remove(this.model.name);
        this.model.setSaved(false);
        if (scope === EditSubcircuitModelDialog.SCOPE_THIS_CIRCUIT) {
            SubcircuitModel.registry.setLocal(this.model);
        } else if (scope === EditSubcircuitModelDialog.SCOPE_THIS_SESSION) {
            SubcircuitModel.registry.setGlobal(this.model);
        } else {
            this.model.setSaved(true);
        }
        CirSim.theApp.updateModels();
        CirSim.theApp.needAnalyze();
        if (!this.popContext && CirSim.theApp.contextStack.length > 0) {
            CirSim.theApp.contextStack[CirSim.theApp.contextStack.length - 1].changedModels.push(this.model);
        }
        if (this.popContext) {
            const app = CirSim.theApp;
            const savedModel = this.model;
            const changedModels: SubcircuitModel[] = app.popContextAndGetChangedModels();
            changedModels.push(savedModel);
            for (const m of changedModels) {
                SubcircuitModel.replaceModel(m);
                app.refreshModels(m.name);
            }
            if (app.contextStack.length > 0)
                app.contextStack[app.contextStack.length - 1].changedModels.push(...changedModels);
        }
        this.closeDialog();
    }

    closeDialog(): void {
        // a newly created model that was never named (cancelled) is discarded
        if (this.model && this.model.name === "")
            this.model.remove();
        super.closeDialog();
    }

    show(): void {
        super.show();
        this.drawChip();
    }

    drawChip(): void {
        this.editor?.draw();
    }


    // Preserve pin positions/sides from existingModel in newModel, matching by name.
    static preservePinLayout(newModel: SubcircuitModel, existingModel: SubcircuitModel): void {
        const n = newModel.extList.length;
        const matched = new Array(n).fill(false);
        let anyPreserved = false;
        const placed: number[][] = [];

        // Pass 1: copy pos/side from existing model for matched busZ==0 pins
        for (let i = 0; i < n; i++) {
            const ent = newModel.extList[i];
            if (ent.busZ !== 0) continue;
            for (const old of existingModel.extList) {
                if (old.busZ === 0 && old.name === ent.name) {
                    ent.pos = old.pos;
                    ent.side = old.side;
                    matched[i] = true;
                    anyPreserved = true;
                    break;
                }
            }
            if (matched[i]) placed.push([ent.pos, ent.side]);
        }
        if (!anyPreserved) return;

        newModel.sizeX = existingModel.sizeX;
        newModel.sizeY = existingModel.sizeY;

        // Pass 2: place unmatched busZ==0 pins in free slots
        for (let i = 0; i < n; i++) {
            if (matched[i]) continue;
            const ent = newModel.extList[i];
            if (ent.busZ !== 0) continue;
            const side = ent.side;
            const ns = (side === ChipElm.SIDE_N || side === ChipElm.SIDE_S);
            let foundPos = -1;
            for (let expansion = 0; expansion <= n && foundPos < 0; expansion++) {
                const curSizeX = newModel.sizeX + (ns ? expansion : 0);
                const curSizeY = newModel.sizeY + (ns ? 0 : expansion);
                const maxPos = ns ? curSizeX : curSizeY;
                for (let p = 0; p < maxPos; p++) {
                    if (!EditSubcircuitModelDialog.pinIsOccupied(p, side, placed, curSizeX, curSizeY)) {
                        foundPos = p;
                        newModel.sizeX = curSizeX;
                        newModel.sizeY = curSizeY;
                        break;
                    }
                }
            }
            ent.pos = foundPos >= 0 ? foundPos : 0;
            placed.push([ent.pos, side]);
        }

        // Pass 3: propagate pos/side from busZ==0 anchor to bus sub-entries
        for (const ent of newModel.extList) {
            if (ent.busZ === 0) continue;
            for (const anchor of newModel.extList) {
                if (anchor.busZ === 0 && anchor.name === ent.name) {
                    ent.pos = anchor.pos; ent.side = anchor.side; break;
                }
            }
        }
    }

    private static pinToGrid(pos: number, side: number, sizeX: number, sizeY: number): number {
        if (side === ChipElm.SIDE_N) return pos;
        if (side === ChipElm.SIDE_S) return pos + sizeX * (sizeY - 1);
        if (side === ChipElm.SIDE_W) return pos * sizeX;
        if (side === ChipElm.SIDE_E) return pos * sizeX + sizeX - 1;
        return -1;
    }

    private static pinIsOccupied(pos: number, side: number, placed: number[][], sizeX: number, sizeY: number): boolean {
        const g = EditSubcircuitModelDialog.pinToGrid(pos, side, sizeX, sizeY);
        if (g < 0) return true;
        for (const p of placed) {
            if (EditSubcircuitModelDialog.pinToGrid(p[0], p[1], sizeX, sizeY) === g) return true;
        }
        return false;
    }
}

