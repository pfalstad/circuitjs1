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

import { SubcircuitChipElm } from "./SubcircuitChipElm";
import { ChipElm, Pin } from "./ChipElm";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { CirSim } from "./CirSim";

// a pin being laid out (ExtListEntry for subcircuits)
export interface PinLayoutEntry {
    name: string;
    pos: number;
    side: number;
    busWidth: number;
    busZ: number;
}

// what the chip size is stored in (SubcircuitModel for subcircuits)
export interface PinLayoutSize {
    sizeX: number;
    sizeY: number;
}

export interface ChipPinEditorOptions {
    // label to draw in the middle of the chip
    getLabel?: () => string | null;
    // called for each pin after it's created from its entry, e.g. to copy how it's drawn
    decoratePin?: (pin: Pin, i: number) => void;
}

// canvas for laying out the pins of a chip by dragging them around, used by the subcircuit and
// pin layout model editors.  Changes the pos/side of the entries and the size directly.
export class ChipPinEditor {
    // the canvas, in a box that sets its size (see makeFlexible)
    readonly element: HTMLDivElement;
    readonly canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    chip: SubcircuitChipElm;
    private postCount: number = 0;

    // view: screen (CSS pixel) = world * viewScale + viewOffset.  The chip is fitted to the
    // canvas, times zoom (mouse wheel).  viewCenter is the world point at the middle of the
    // canvas, or null to center the chip.
    private viewScale: number = 1;
    private viewOffsetX: number = 0;
    private viewOffsetY: number = 0;
    private zoom: number = 1;
    private viewCenter: { x: number, y: number } | null = null;
    private panning: boolean = false;
    private static readonly VIEW_MARGIN = 40;

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

    constructor(private readonly entries: PinLayoutEntry[], private readonly size: PinLayoutSize,
                private readonly options: ChipPinEditorOptions = {}) {
        this.element = document.createElement("div");
        this.element.style.position = "relative";
        this.element.style.width = "400px";
        this.element.style.height = "400px";
        this.element.style.flexShrink = "0";
        this.canvas = document.createElement("canvas");
        this.canvas.style.position = "absolute";
        this.canvas.style.left = "0";
        this.canvas.style.top = "0";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.display = "block";
        this.element.appendChild(this.canvas);
        this.context = this.canvas.getContext("2d")!;
        this.updateCanvasSize();
        // follow the size of the box (when the dialog is resized)
        new ResizeObserver(() => {
            if (this.updateCanvasSize())
                this.draw();
        }).observe(this.element);

        this.canvas.addEventListener("mousedown",  e => this.onMouseDown(e));
        this.canvas.addEventListener("mouseup",    () => this.onMouseUp());
        this.canvas.addEventListener("mousemove",  e => { if (!this.panning) this.mouseMoved(e.offsetX, e.offsetY); });
        this.canvas.addEventListener("wheel",      e => this.onWheel(e), { passive: false });
        // no autoscroll on middle click (we pan with it)
        this.canvas.addEventListener("auxclick",   e => e.preventDefault());

        this.chip = new SubcircuitChipElm(50, 50);
        this.chip.x2 = 200;
        this.chip.y2 = 50;
        this.createPins();
    }

    // let the box (and canvas) take whatever space the dialog gives it, instead of a fixed
    // size.  The dialog should be a flex column with an explicit size.
    makeFlexible(): void {
        const s = this.element.style;
        s.width = "auto";
        s.height = "auto";
        s.flex = "1 1 0";
        s.minWidth = "100px";
        s.minHeight = "100px";
    }

    // make the canvas's pixel size match its displayed size; true if it changed
    private updateCanvasSize(): boolean {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(this.element.clientWidth * dpr));
        const h = Math.max(1, Math.round(this.element.clientHeight * dpr));
        if (w === this.canvas.width && h === this.canvas.height)
            return false;
        this.canvas.width = w;
        this.canvas.height = h;
        return true;
    }

    // canvas size in CSS pixels
    private get viewWidth(): number  { return this.canvas.width  / (window.devicePixelRatio || 1); }
    private get viewHeight(): number { return this.canvas.height / (window.devicePixelRatio || 1); }

    private fitScale(): number {
        const bb = this.chip.boundingBox;
        const m = ChipPinEditor.VIEW_MARGIN * 2;
        return Math.min(this.viewWidth / (bb.width + m), this.viewHeight / (bb.height + m));
    }

    private updateView(): void {
        const bb = this.chip.boundingBox;
        this.viewScale = this.fitScale() * this.zoom;
        const cx = this.viewCenter?.x ?? bb.x + bb.width / 2;
        const cy = this.viewCenter?.y ?? bb.y + bb.height / 2;
        this.viewOffsetX = this.viewWidth  / 2 - cx * this.viewScale;
        this.viewOffsetY = this.viewHeight / 2 - cy * this.viewScale;
    }

    private toWorldX(x: number): number { return (x - this.viewOffsetX) / this.viewScale; }
    private toWorldY(y: number): number { return (y - this.viewOffsetY) / this.viewScale; }
    private toScreenX(x: number): number { return x * this.viewScale + this.viewOffsetX; }
    private toScreenY(y: number): number { return y * this.viewScale + this.viewOffsetY; }

    // zoom in/out, keeping the point under the mouse where it is
    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        e.stopPropagation();
        if (!this.chip.boundingBox) return;
        this.updateView();
        const wx = this.toWorldX(e.offsetX), wy = this.toWorldY(e.offsetY);
        let dy = e.deltaY;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
        else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= 400;
        this.zoom = Math.max(0.25, Math.min(10, this.zoom * Math.exp(-dy * 0.002)));
        if (Math.abs(this.zoom - 1) < 0.04) {
            // back to the fitted view
            this.zoom = 1;
            this.viewCenter = null;
        } else {
            const k = this.fitScale() * this.zoom;
            this.viewCenter = {
                x: wx - (e.offsetX - this.viewWidth  / 2) / k,
                y: wy - (e.offsetY - this.viewHeight / 2) / k,
            };
        }
        this.draw();
    }

    // pan the view by alt-dragging or middle-dragging.  Follows the mouse outside the canvas.
    private startPan(e: MouseEvent): void {
        e.preventDefault();
        this.updateView();
        const startX = e.clientX, startY = e.clientY;
        const cx = this.toWorldX(this.viewWidth / 2), cy = this.toWorldY(this.viewHeight / 2);
        const k = this.viewScale;
        this.canvas.style.cursor = "grabbing";
        this.panning = true;
        const move = (ev: MouseEvent) => {
            this.viewCenter = { x: cx - (ev.clientX - startX) / k, y: cy - (ev.clientY - startY) / k };
            this.draw();
        };
        const up = () => {
            window.removeEventListener("mousemove", move, true);
            window.removeEventListener("mouseup", up, true);
            this.canvas.style.cursor = "";
            this.panning = false;
        };
        window.addEventListener("mousemove", move, true);
        window.addEventListener("mouseup", up, true);
    }

    // Width/Height buttons
    createSizeControls(): HTMLElement {
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
        return hp;
    }

    createPins(): void {
        this.postCount = this.entries.length;
        this.chip.allocPins(this.postCount);
        this.chip.sizeX = this.size.sizeX;
        this.chip.sizeY = this.size.sizeY;
        this.chip.allocNodes();
        for (let i = 0; i < this.postCount; i++) {
            const pin = this.entries[i];
            this.chip.setPin(i, pin.pos, pin.side, pin.name);
            this.chip.pins[i].busWidth = pin.busWidth;
            this.chip.pins[i].busZ = pin.busZ;
            this.options.decoratePin?.(this.chip.pins[i], i);
            if (this.selectedPins.has(i)) this.chip.pins[i].selected = true;
        }
        this.chip.setPoints();
    }

    draw(): void {
        if (!this.chip.boundingBox) return;
        const g = new Graphics(this.context);
        this.updateView();
        this.context.fillStyle = CirSim.theApp.getBackgroundColor().getHexValue();
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        const dpr = window.devicePixelRatio || 1;
        const k = this.viewScale * dpr;
        this.context.setTransform(k, 0, 0, k, this.viewOffsetX * dpr, this.viewOffsetY * dpr);
        this.chip.setLabel(this.options.getLabel?.() ?? null);
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
                    const pe = this.entries[i];
                    if (pe.side === ChipElm.SIDE_E || pe.side === ChipElm.SIDE_W) pe.pos -= 1;
                }
            }
        }
        if (this.chip.sizeX + dx < 1 || this.chip.sizeY + dy < 1) return;
        this.size.sizeX += dx;
        this.size.sizeY += dy;
        this.createPins();
        this.draw();
    }

    // sort the selected pins (or, with none selected, the pins on each side) by name, ignoring a
    // leading "/", without moving any pin to another side.  The pins trade positions; the other
    // pins of a bus move with it.
    sortPins(): void {
        const indices = this.selectedPins.size > 0 ? [...this.selectedPins] :
            this.entries.map((_, i) => i);
        const bySide = new Map<number, number[]>();
        for (const i of indices) {
            const e = this.entries[i];
            if (e.busZ > 0) continue;
            let list = bySide.get(e.side);
            if (!list) bySide.set(e.side, list = []);
            list.push(i);
        }
        const key = (i: number) => this.entries[i].name.replace(/^\//, "");
        for (const [side, list] of bySide) {
            const slots = list.map(i => this.entries[i].pos).sort((a, b) => a - b);
            list.sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: "base" }));
            const newPos = new Map<number, number>();
            list.forEach((i, k) => newPos.set(this.entries[i].pos, slots[k]));
            for (const e of this.entries) {
                const np = e.side === side ? newPos.get(e.pos) : undefined;
                if (np !== undefined) e.pos = np;
            }
        }
        this.createPins();
        this.draw();
    }

    private findNearestPin(x: number, y: number): number {
        let bestDist = 20;
        let best = -1;
        for (let i = 0; i < this.postCount; i++) {
            const p = this.chip.pins[i];
            if (p.busZ > 0) continue;
            const dx = this.toWorldX(x) - p.textloc.x;
            const dy = this.toWorldY(y) - p.textloc.y;
            const dist = Math.hypot(dx, dy);
            if (dist < bestDist) { bestDist = dist; best = i; }
        }
        return best;
    }

    private updatePinHighlight(): void {
        for (let i = 0; i < this.postCount; i++)
            this.chip.pins[i].selected = this.selectedPins.has(i);
    }

    private drawRubberBand(): void {
        const x1 = Math.min(this.rubberBandX1, this.rubberBandX2);
        const y1 = Math.min(this.rubberBandY1, this.rubberBandY2);
        const w  = Math.abs(this.rubberBandX2 - this.rubberBandX1);
        const h  = Math.abs(this.rubberBandY2 - this.rubberBandY1);
        this.context.save();
        const dpr = window.devicePixelRatio || 1;
        this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.context.fillStyle = "rgba(68,136,255,0.15)";
        this.context.fillRect(x1, y1, w, h);
        this.context.strokeStyle = "#4488ff";
        this.context.lineWidth = 1;
        this.context.strokeRect(x1, y1, w, h);
        this.context.restore();
    }

    private onMouseUp(): void {
        if (this.rubberBand) {
            const x1 = Math.min(this.rubberBandX1, this.rubberBandX2);
            const x2 = Math.max(this.rubberBandX1, this.rubberBandX2);
            const y1 = Math.min(this.rubberBandY1, this.rubberBandY2);
            const y2 = Math.max(this.rubberBandY1, this.rubberBandY2);
            const firstSel = this.selectedPins.size > 0 ? this.entries[this.selectedPins.values().next().value!].side : -1;
            let selSide = firstSel;
            for (let i = 0; i < this.postCount; i++) {
                if (this.chip.pins[i].busZ > 0) continue;
                const px = this.toScreenX(this.chip.pins[i].textloc.x) | 0;
                const py = this.toScreenY(this.chip.pins[i].textloc.y) | 0;
                if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
                    if (selSide === -1) selSide = this.entries[i].side;
                    if (this.entries[i].side === selSide) this.selectedPins.add(i);
                }
            }
            this.rubberBand = false;
            this.updatePinHighlight();
            this.draw();
        }
        this.dragging = false;
    }

    private mouseMoved(x: number, y: number): void {
        if (this.rubberBand) {
            this.rubberBandX2 = x;
            this.rubberBandY2 = y;
            const x1 = Math.min(this.rubberBandX1, this.rubberBandX2);
            const x2 = Math.max(this.rubberBandX1, this.rubberBandX2);
            const y1 = Math.min(this.rubberBandY1, this.rubberBandY2);
            const y2 = Math.max(this.rubberBandY1, this.rubberBandY2);
            let selSide2 = this.selectedPins.size > 0 ? this.entries[this.selectedPins.values().next().value!].side : -1;
            if (selSide2 === -1) {
                for (let i = 0; i < this.postCount; i++) {
                    if (this.chip.pins[i].busZ > 0) continue;
                    const px = this.toScreenX(this.chip.pins[i].textloc.x) | 0;
                    const py = this.toScreenY(this.chip.pins[i].textloc.y) | 0;
                    if (px >= x1 && px <= x2 && py >= y1 && py <= y2) { selSide2 = this.entries[i].side; break; }
                }
            }
            for (let i = 0; i < this.postCount; i++) {
                this.chip.pins[i].selected = this.selectedPins.has(i);
                if (this.chip.pins[i].busZ > 0) continue;
                const px = this.toScreenX(this.chip.pins[i].textloc.x) | 0;
                const py = this.toScreenY(this.chip.pins[i].textloc.y) | 0;
                if (px >= x1 && px <= x2 && py >= y1 && py <= y2 && this.entries[i].side === selSide2)
                    this.chip.pins[i].selected = true;
            }
            this.draw();
            this.drawRubberBand();
            return;
        }
        if (this.dragging) {
            if (this.selectedPin < 0) return;
            const pos: number[] = [0, 0];
            if (!this.chip.getPinPos(this.toWorldX(x) | 0, this.toWorldY(y) | 0, this.dragCurrentSide, pos)) return;
            this.dragCurrentSide = pos[1];

            // Reset to drag-start snapshot so each call is idempotent
            for (let i = 0; i < this.postCount; i++) {
                this.entries[i].pos  = this.dragStartPosArr[i];
                this.entries[i].side = this.dragStartSideArr[i];
            }
            const newSide = pos[1];
            const maxNewPos = (newSide === ChipElm.SIDE_N || newSide === ChipElm.SIDE_S)
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

            // move a pin, along with the other pins of its bus
            const updateBusGroup = (pj: PinLayoutEntry, newPos: number, newSideVal?: number) => {
                pj.pos = newPos;
                if (newSideVal !== undefined) pj.side = newSideVal;
                if (pj.busWidth <= 1) return;
                for (let j = 0; j < this.postCount; j++) {
                    const pjj = this.entries[j];
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
                    if (newPos !== origPos) updateBusGroup(this.entries[i], newPos);
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
                    updateBusGroup(this.entries[displaced[k]], slots[k]);
            }
            // Move selected pins to their new positions
            for (const idx of this.selectedPins) {
                if (this.dragStartSideArr[idx] !== this.dragStartSide) continue;
                const newPos = anchor + this.dragStartPosArr[idx] - this.dragStartPos;
                updateBusGroup(this.entries[idx], newPos, effectiveSide);
            }
            this.createPins();
            this.draw();
        } else {
            // hover: highlight nearest pin without disturbing selectedPins
            const hoveredPin = this.findNearestPin(x, y);
            for (let i = 0; i < this.postCount; i++)
                this.chip.pins[i].selected = this.selectedPins.has(i) || i === hoveredPin;
            this.draw();
        }
    }

    private onMouseDown(event: MouseEvent): void {
        if (event.button === 1 || (event.button === 0 && event.altKey)) {
            this.startPan(event);
            return;
        }
        if (event.button !== 0) return;
        const x = event.offsetX, y = event.offsetY;
        const hoveredPin = this.findNearestPin(x, y);

        if (hoveredPin < 0) {
            if (!event.shiftKey) this.selectedPins.clear();
            this.rubberBand = true;
            this.rubberBandX1 = this.rubberBandX2 = x;
            this.rubberBandY1 = this.rubberBandY2 = y;
            this.updatePinHighlight();
            this.draw();
            return;
        }

        this.rubberBand = false;
        if (event.shiftKey) {
            if (this.selectedPins.has(hoveredPin)) {
                this.selectedPins.delete(hoveredPin);
            } else {
                const hSide = this.entries[hoveredPin].side;
                let ok = this.selectedPins.size === 0;
                if (!ok) ok = (this.entries[this.selectedPins.values().next().value!].side === hSide);
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
            const pe = this.entries[i];
            this.dragStartPosArr[i]  = pe.pos;
            this.dragStartSideArr[i] = pe.side;
        }
        const sp = this.entries[this.selectedPin];
        this.dragStartPos  = sp.pos;
        this.dragStartSide = this.dragCurrentSide = sp.side;

        this.updatePinHighlight();
        this.dragging = true;
        this.draw();
    }
}
