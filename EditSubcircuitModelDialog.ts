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
import { SubcircuitChipElm } from "./SubcircuitChipElm";
import { SubcircuitModel } from "./SubcircuitModel";
import { ExtListEntry } from "./ExtListEntry";
import { ChipElm, Pin } from "./ChipElm";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { CirSim } from "./CirSim";
import { SimulationManager } from "./SimulationManager";
import { SubcircuitElm } from "./SubcircuitElm";

export class EditSubcircuitModelDialog extends Dialog {
    model: SubcircuitModel = null!;
    chip: SubcircuitChipElm = null!;
    postCount: number = 0;
    context: CanvasRenderingContext2D = null!;
    scale: number = 1;
    popContext: boolean = false;

    private modelNameInput: HTMLInputElement | null = null;
    private scopeSelect: HTMLSelectElement | null = null;
    private labelCheck: HTMLInputElement | null = null;
    private canvas: HTMLCanvasElement | null = null;

    private dragging: boolean = false;
    private rubberBand: boolean = false;
    private rubberBandX1: number = 0;
    private rubberBandY1: number = 0;
    private rubberBandX2: number = 0;
    private rubberBandY2: number = 0;
    private selectedPins: Set<number> = new Set();
    private dragStartPosArr: number[] = [];
    private dragStartSideArr: number[] = [];
    private dragStartPos: number = 0;
    private dragStartSide: number = 0;
    private dragCurrentSide: number = 0;
    private selectedPin: number = -1;

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

        this.canvas = document.createElement("canvas");
        this.canvas.width = 400;
        this.canvas.height = 400;
        this.canvas.style.width = "400px";
        this.canvas.style.height = "400px";
        this.canvas.style.display = "block";
        this.dialogEl.appendChild(this.canvas);
        this.context = this.canvas.getContext("2d")!;

        // mouse/touch events
        this.canvas.addEventListener("mousedown",  e => this.onMouseDown(e));
        this.canvas.addEventListener("mouseup",    e => this.onMouseUp(e));
        this.canvas.addEventListener("mousemove",  e => this.onMouseMove(e));
        this.canvas.addEventListener("mouseout",   () => {});
        this.canvas.addEventListener("mouseover",  () => {});

        this.chip = new SubcircuitChipElm(50, 50);
        this.chip.x2 = 200;
        this.chip.y2 = 50;
        this.selectedPin = -1;
        this.createPinsFromModel();

        if (this.model.name === null || this.model.name === "") {
            this.dialogEl.appendChild(Object.assign(document.createElement("label"), { textContent: Locale.LS("Model Name") }));
            this.modelNameInput = document.createElement("input");
            this.modelNameInput.type = "text";
            this.modelNameInput.style.display = "block";
            this.modelNameInput.addEventListener("input", () => this.drawChip());
            this.dialogEl.appendChild(this.modelNameInput);
        }

        // Width/Height controls
        const hp = document.createElement("div");
        hp.style.display = "flex";
        hp.style.alignItems = "center";
        hp.style.gap = "4px";
        hp.style.margin = "8px 0";
        const addBtn = (label: string, dx: number, dy: number) => {
            const b = document.createElement("button");
            b.textContent = label;
            b.addEventListener("click", () => this.adjustChipSize(dx, dy));
            hp.appendChild(b);
        };
        hp.appendChild(Object.assign(document.createElement("span"), { textContent: Locale.LS("Width") + " " }));
        addBtn("+", 1, 0); addBtn("-", -1, 0);
        hp.appendChild(Object.assign(document.createElement("span"), { textContent: "  " + Locale.LS("Height") + " " }));
        addBtn("+", 0, 1); addBtn("-", 0, -1);
        this.dialogEl.appendChild(hp);

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
        else if (this.model.name && SubcircuitModel.globalModelMap.has(this.model.name))
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

    createPinsFromModel(): void {
        this.postCount = this.model.extList.length;
        this.chip.allocPins(this.postCount);
        this.chip.sizeX = this.model.sizeX;
        this.chip.sizeY = this.model.sizeY;
        this.chip.allocNodes();
        for (let i = 0; i < this.postCount; i++) {
            const pin = this.model.extList[i];
            this.chip.setPin(i, pin.pos, pin.side, pin.name);
            this.chip.pins[i].busWidth = pin.busWidth;
            this.chip.pins[i].busZ = pin.busZ;
            if (this.selectedPins.has(i)) this.chip.pins[i].selected = true;
        }
        this.chip.setPoints();
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
        SubcircuitModel.localModelMap.delete(this.model.name);
        SubcircuitModel.globalModelMap.delete(this.model.name);
        this.model.setSaved(false);
        if (scope === EditSubcircuitModelDialog.SCOPE_THIS_CIRCUIT) {
            SubcircuitModel.localModelMap.set(this.model.name, this.model);
        } else if (scope === EditSubcircuitModelDialog.SCOPE_THIS_SESSION) {
            SubcircuitModel.globalModelMap.set(this.model.name, this.model);
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

    show(): void {
        super.show();
        this.drawChip();
    }

    drawChip(): void {
        if (!this.context || !this.chip.boundingBox) return;
        const g = new Graphics(this.context);
        const scalew = this.canvas!.width  / (this.chip.boundingBox.width  + this.chip.boundingBox.x * 2);
        const scaleh = this.canvas!.height / (this.chip.boundingBox.height + this.chip.boundingBox.y * 2);
        this.scale = 1 / Math.min(scalew, scaleh);
        this.context.fillStyle = CirSim.theApp.getBackgroundColor().getHexValue();
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.fillRect(0, 0, this.canvas!.width, this.canvas!.height);
        this.context.setTransform(1 / this.scale, 0, 0, 1 / this.scale, 0, 0);
        const labelName = this.labelCheck?.checked
            ? (this.modelNameInput ? this.modelNameInput.value : this.model.name)
            : null;
        this.chip.setLabel(labelName);
        this.chip.draw(g);
    }

    adjustChipSize(dx: number, dy: number): void {
        if (dx < 0) {
            for (let i = 0; i < this.postCount; i++) {
                const p = this.chip.pins[i];
                if (p.busZ > 0) continue;
                if ((p.side === ChipElm.SIDE_N || p.side === ChipElm.SIDE_S) && p.pos >= this.chip.sizeX + dx)
                    return;
            }
        }
        if (dy < 0) {
            let needShift = false;
            for (let i = 0; i < this.postCount; i++) {
                const p = this.chip.pins[i];
                if (p.busZ > 0) continue;
                if ((p.side === ChipElm.SIDE_E || p.side === ChipElm.SIDE_W) && p.pos >= this.chip.sizeY + dy) {
                    needShift = true; break;
                }
            }
            if (needShift) {
                for (let i = 0; i < this.postCount; i++) {
                    const p = this.chip.pins[i];
                    if (p.busZ > 0) continue;
                    if ((p.side === ChipElm.SIDE_E || p.side === ChipElm.SIDE_W) && p.pos === 0) return;
                }
                for (let i = 0; i < this.postCount; i++) {
                    const pe = this.model.extList[i];
                    if (pe.side === ChipElm.SIDE_E || pe.side === ChipElm.SIDE_W) pe.pos -= 1;
                }
            }
        }
        if (this.chip.sizeX + dx < 1 || this.chip.sizeY + dy < 1) return;
        this.model.sizeX += dx;
        this.model.sizeY += dy;
        this.createPinsFromModel();
        this.drawChip();
    }

    findNearestPin(x: number, y: number): number {
        let bestDist = 20;
        let best = -1;
        for (let i = 0; i < this.postCount; i++) {
            const p = this.chip.pins[i];
            if (p.busZ > 0) continue;
            const dx = x * this.scale - p.textloc.x;
            const dy = y * this.scale - p.textloc.y;
            const dist = Math.hypot(dx, dy);
            if (dist < bestDist) { bestDist = dist; best = i; }
        }
        return best;
    }

    updatePinHighlight(): void {
        for (let i = 0; i < this.postCount; i++)
            this.chip.pins[i].selected = this.selectedPins.has(i);
    }

    drawRubberBand(): void {
        const x1 = Math.min(this.rubberBandX1, this.rubberBandX2);
        const y1 = Math.min(this.rubberBandY1, this.rubberBandY2);
        const w  = Math.abs(this.rubberBandX2 - this.rubberBandX1);
        const h  = Math.abs(this.rubberBandY2 - this.rubberBandY1);
        this.context.save();
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.fillStyle = "rgba(68,136,255,0.15)";
        this.context.fillRect(x1, y1, w, h);
        this.context.strokeStyle = "#4488ff";
        this.context.lineWidth = 1;
        this.context.strokeRect(x1, y1, w, h);
        this.context.restore();
    }

    onMouseUp(event: MouseEvent): void {
        if (this.rubberBand) {
            const x1 = Math.min(this.rubberBandX1, this.rubberBandX2);
            const x2 = Math.max(this.rubberBandX1, this.rubberBandX2);
            const y1 = Math.min(this.rubberBandY1, this.rubberBandY2);
            const y2 = Math.max(this.rubberBandY1, this.rubberBandY2);
            const firstSel = this.selectedPins.size > 0 ? this.model.extList[this.selectedPins.values().next().value].side : -1;
            let selSide = firstSel;
            for (let i = 0; i < this.postCount; i++) {
                if (this.chip.pins[i].busZ > 0) continue;
                const px = this.chip.pins[i].textloc.x / this.scale | 0;
                const py = this.chip.pins[i].textloc.y / this.scale | 0;
                if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
                    if (selSide === -1) selSide = this.model.extList[i].side;
                    if (this.model.extList[i].side === selSide) this.selectedPins.add(i);
                }
            }
            this.rubberBand = false;
            this.updatePinHighlight();
            this.drawChip();
        }
        this.dragging = false;
    }

    onMouseMove(event: MouseEvent): void {
        this.mouseMoved(event.offsetX, event.offsetY);
    }

    mouseMoved(x: number, y: number): void {
        if (this.rubberBand) {
            this.rubberBandX2 = x;
            this.rubberBandY2 = y;
            const x1 = Math.min(this.rubberBandX1, this.rubberBandX2);
            const x2 = Math.max(this.rubberBandX1, this.rubberBandX2);
            const y1 = Math.min(this.rubberBandY1, this.rubberBandY2);
            const y2 = Math.max(this.rubberBandY1, this.rubberBandY2);
            let selSide2 = this.selectedPins.size > 0 ? this.model.extList[this.selectedPins.values().next().value].side : -1;
            if (selSide2 === -1) {
                for (let i = 0; i < this.postCount; i++) {
                    if (this.chip.pins[i].busZ > 0) continue;
                    const px = this.chip.pins[i].textloc.x / this.scale | 0;
                    const py = this.chip.pins[i].textloc.y / this.scale | 0;
                    if (px >= x1 && px <= x2 && py >= y1 && py <= y2) { selSide2 = this.model.extList[i].side; break; }
                }
            }
            for (let i = 0; i < this.postCount; i++) {
                this.chip.pins[i].selected = this.selectedPins.has(i);
                if (this.chip.pins[i].busZ > 0) continue;
                const px = this.chip.pins[i].textloc.x / this.scale | 0;
                const py = this.chip.pins[i].textloc.y / this.scale | 0;
                if (px >= x1 && px <= x2 && py >= y1 && py <= y2 && this.model.extList[i].side === selSide2)
                    this.chip.pins[i].selected = true;
            }
            this.drawChip();
            this.drawRubberBand();
            return;
        }
        if (this.dragging) {
            if (this.selectedPin < 0) return;
            const pos: number[] = [0, 0];
            if (!this.chip.getPinPos(x * this.scale | 0, y * this.scale | 0, this.dragCurrentSide, pos)) return;
            this.dragCurrentSide = pos[1];

            // Reset to drag-start snapshot so each call is idempotent
            for (let i = 0; i < this.postCount; i++) {
                this.model.extList[i].pos  = this.dragStartPosArr[i];
                this.model.extList[i].side = this.dragStartSideArr[i];
            }
            const newSide = pos[1];
            let maxNewPos = (newSide === ChipElm.SIDE_N || newSide === ChipElm.SIDE_S)
                    ? this.chip.sizeX - 1 : this.chip.sizeY - 1;
            let minOff = Number.MAX_SAFE_INTEGER, maxOff = Number.MIN_SAFE_INTEGER;
            let sameSideCount = 0;
            for (const idx of this.selectedPins) {
                if (this.dragStartSideArr[idx] !== this.dragStartSide) continue;
                sameSideCount++;
                const off = this.dragStartPosArr[idx] - this.dragStartPos;
                if (off < minOff) minOff = off;
                if (off > maxOff) maxOff = off;
            }
            const groupSize = maxOff - minOff + 1;
            let effectiveSide = newSide;
            let effectiveMaxPos = maxNewPos;
            if (groupSize > maxNewPos + 1) {
                effectiveSide = this.dragStartSide;
                effectiveMaxPos = (effectiveSide === ChipElm.SIDE_N || effectiveSide === ChipElm.SIDE_S)
                    ? this.chip.sizeX - 1 : this.chip.sizeY - 1;
            }
            const anchor = Math.max(-minOff, Math.min(effectiveMaxPos - maxOff, pos[0]));
            const delta = anchor - this.dragStartPos;
            const sameSide = (effectiveSide === this.dragStartSide);
            const contiguous = (groupSize === sameSideCount);

            const updateBusGroup = (pj: ExtListEntry, newPos: number, newSideVal?: number) => {
                pj.pos = newPos;
                if (newSideVal !== undefined) pj.side = newSideVal;
                for (let j = 0; j < this.postCount; j++) {
                    const pjj = this.model.extList[j];
                    if (pjj.name === pj.name && pjj.busWidth === pj.busWidth) {
                        pjj.pos = newPos;
                        if (newSideVal !== undefined) pjj.side = newSideVal;
                    }
                }
            };

            if (sameSide && contiguous) {
                for (let i = 0; i < this.postCount; i++) {
                    if (this.selectedPins.has(i) || this.chip.pins[i].busZ > 0) continue;
                    if (this.dragStartSideArr[i] !== this.dragStartSide) continue;
                    const origPos = this.dragStartPosArr[i];
                    let newPos: number;
                    if (delta >= 0)
                        newPos = (origPos >= this.dragStartPos + maxOff + 1 && origPos <= anchor + maxOff) ? origPos - groupSize : origPos;
                    else
                        newPos = (origPos >= anchor + minOff && origPos <= this.dragStartPos + minOff - 1) ? origPos + groupSize : origPos;
                    if (newPos !== origPos) updateBusGroup(this.model.extList[i], newPos);
                }
            } else {
                const groupPos = new Set<number>();
                for (const idx of this.selectedPins) {
                    if (this.dragStartSideArr[idx] !== this.dragStartSide) continue;
                    groupPos.add(anchor + this.dragStartPosArr[idx] - this.dragStartPos);
                }
                const displaced: number[] = [];
                for (let i = 0; i < this.postCount; i++) {
                    if (this.selectedPins.has(i) || this.chip.pins[i].busZ > 0) continue;
                    if (this.dragStartSideArr[i] !== effectiveSide) continue;
                    if (groupPos.has(this.dragStartPosArr[i])) displaced.push(i);
                }
                const taken = new Set<number>();
                for (let i = 0; i < this.postCount; i++) {
                    if (this.selectedPins.has(i) || this.chip.pins[i].busZ > 0) continue;
                    if (this.dragStartSideArr[i] === effectiveSide && !groupPos.has(this.dragStartPosArr[i]))
                        taken.add(this.dragStartPosArr[i]);
                }
                const available: number[] = [];
                for (let slot = 0; slot <= effectiveMaxPos; slot++)
                    if (!groupPos.has(slot) && !taken.has(slot)) available.push(slot);
                displaced.sort((a, b) => this.dragStartPosArr[a] - this.dragStartPosArr[b]);
                const slots: number[] = [];
                if (delta >= 0) {
                    for (let k = available.length - 1; k >= 0 && slots.length < displaced.length; k--)
                        if (available[k] < anchor) slots.push(available[k]);
                    for (let k = 0; k < available.length && slots.length < displaced.length; k++)
                        if (available[k] > anchor + maxOff) slots.push(available[k]);
                } else {
                    for (let k = 0; k < available.length && slots.length < displaced.length; k++)
                        if (available[k] > anchor + maxOff) slots.push(available[k]);
                    for (let k = available.length - 1; k >= 0 && slots.length < displaced.length; k--)
                        if (available[k] < anchor) slots.push(available[k]);
                }
                slots.sort((a, b) => a - b);
                for (let k = 0; k < displaced.length && k < slots.length; k++)
                    updateBusGroup(this.model.extList[displaced[k]], slots[k]);
            }
            // Move selected pins to their new positions
            for (const idx of this.selectedPins) {
                if (this.dragStartSideArr[idx] !== this.dragStartSide) continue;
                const newPos = anchor + this.dragStartPosArr[idx] - this.dragStartPos;
                updateBusGroup(this.model.extList[idx], newPos, effectiveSide);
            }
            this.createPinsFromModel();
            this.drawChip();
        } else {
            // hover: highlight nearest pin without disturbing selectedPins
            const hoveredPin = this.findNearestPin(x, y);
            for (let i = 0; i < this.postCount; i++)
                this.chip.pins[i].selected = this.selectedPins.has(i) || i === hoveredPin;
            this.drawChip();
        }
    }

    onMouseDown(event: MouseEvent): void {
        const x = event.offsetX, y = event.offsetY;
        const hoveredPin = this.findNearestPin(x, y);

        if (hoveredPin < 0) {
            if (!event.shiftKey) this.selectedPins.clear();
            this.rubberBand = true;
            this.rubberBandX1 = this.rubberBandX2 = x;
            this.rubberBandY1 = this.rubberBandY2 = y;
            this.updatePinHighlight();
            this.drawChip();
            return;
        }

        this.rubberBand = false;
        if (event.shiftKey) {
            if (this.selectedPins.has(hoveredPin)) {
                this.selectedPins.delete(hoveredPin);
            } else {
                const hSide = this.model.extList[hoveredPin].side;
                let ok = this.selectedPins.size === 0;
                if (!ok) ok = (this.model.extList[this.selectedPins.values().next().value].side === hSide);
                if (ok) this.selectedPins.add(hoveredPin);
            }
        } else {
            if (!this.selectedPins.has(hoveredPin)) {
                this.selectedPins.clear();
                this.selectedPins.add(hoveredPin);
            }
        }
        this.selectedPin = hoveredPin;

        this.dragStartPosArr  = new Array(this.postCount);
        this.dragStartSideArr = new Array(this.postCount);
        for (let i = 0; i < this.postCount; i++) {
            const pe = this.model.extList[i];
            this.dragStartPosArr[i]  = pe.pos;
            this.dragStartSideArr[i] = pe.side;
        }
        const sp = this.model.extList[this.selectedPin];
        this.dragStartPos  = sp.pos;
        this.dragStartSide = this.dragCurrentSide = sp.side;

        this.updatePinHighlight();
        this.dragging = true;
        this.drawChip();
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

