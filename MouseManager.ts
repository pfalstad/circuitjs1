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
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Rectangle } from "./Rectangle";
import { Locale } from "./Locale";

// mode constants
export class MouseManager {
    static readonly MODE_ADD_ELM       = 0;
    static readonly MODE_DRAG_ALL      = 1;
    static readonly MODE_DRAG_ROW      = 2;
    static readonly MODE_DRAG_COLUMN   = 3;
    static readonly MODE_DRAG_SELECTED = 4;
    static readonly MODE_DRAG_POST     = 5;
    static readonly MODE_SELECT        = 6;
    static readonly MODE_DRAG_SPLITTER = 7;
    static readonly MODE_DRAG_REROUTE  = 8;

    static readonly POSTGRABSQ     = 25;
    static readonly MINPOSTGRABSIZE = 256;

    static lastSubcircuitMenuUpdate: number = 0;

    sim: CirSim;
    ui: any; // UIManager — not statically imported to avoid circular TDZ

    // fields
    mouseWasOverSplitter: boolean = false;
    mouseMode: number = MouseManager.MODE_SELECT;
    tempMouseMode: number = MouseManager.MODE_SELECT;
    dragGridX: number = 0;
    dragGridY: number = 0;
    dragScreenX: number = 0;
    dragScreenY: number = 0;
    initDragGridX: number = 0;
    initDragGridY: number = 0;
    mouseDownTime: number = 0;
    zoomTime: number = 0;
    mouseCursorX: number = -1;
    mouseCursorY: number = -1;
    selectedArea: Rectangle | null = null;
    dragging: boolean = false;
    wheelSensitivity: number = 1;
    dragElm: CircuitElm | null = null;
    menuElm: CircuitElm | null = null;
    private mouseElm: CircuitElm | null = null;
    didSwitch: boolean = false;
    mousePost: number = -1;
    highlightedNode: CircuitNode | null = null;
    netHighlightKeyHeld: boolean = false;
    scopePlotRoles: Map<CircuitElm, string> = new Map();
    draggingPost: number = -1;
    heldSwitchElm: CircuitElm | null = null; // SwitchElm
    private mouseDragging: boolean = false;
    menuClientX: number = 0;
    menuClientY: number = 0;
    menuX: number = 0;
    menuY: number = 0;
    // elements grabbed at mouse-down for DragRow/DragColumn
    dragRowColElms: CircuitElm[] = [];
    dragRowColPosts: number[] = [];

    // ---- Toolbar drag-and-drop ----
    // A press-and-drag on a toolbar icon drops a new element where the mouse is released,
    // instead of just switching the mouse mode the way a plain click does.
    private static readonly TOOLBAR_DRAG_THRESHOLD = 6;
    private toolbarDragClass: string | null = null;
    private toolbarDragStartX: number = 0;
    private toolbarDragStartY: number = 0;
    private toolbarDragActive: boolean = false;
    private toolbarDragVertical: boolean = false;
    private toolbarDragAnchorX: number = 0;
    private toolbarDragAnchorY: number = 0;

    constructor(sim: CirSim, ui: any) {
	this.sim = sim;
	this.ui = ui;
    }

    register(canvas: HTMLCanvasElement): void {
	canvas.addEventListener("mousedown",     (e: MouseEvent) => this.onMouseDown(e));
	canvas.addEventListener("mousemove",     (e: MouseEvent) => this.onMouseMove(e));
	canvas.addEventListener("mouseout",      (e: MouseEvent) => this.onMouseOut(e));
	canvas.addEventListener("mouseup",       (e: MouseEvent) => this.onMouseUp(e));
	canvas.addEventListener("click",         (e: MouseEvent) => this.onClick(e));
	canvas.addEventListener("dblclick",      (e: MouseEvent) => this.onDoubleClick(e));
	canvas.addEventListener("contextmenu",   (e: MouseEvent) => this.onContextMenu(e));
	canvas.addEventListener("wheel",         (e: WheelEvent) => this.onMouseWheel(e), { passive: false });
	this.doTouchHandlers(canvas);

	// A press-and-drag gesture started on a toolbar icon may end up anywhere on the
	// page (not just over the canvas), so it needs to be tracked at the document level.
	document.addEventListener("mousemove", (e: MouseEvent) => {
	    if (this.isToolbarDragPending()) {
		e.preventDefault();
		this.toolbarDragMove(e.clientX, e.clientY, e.shiftKey);
	    }
	});
	document.addEventListener("mouseup", (e: MouseEvent) => {
	    if (this.isToolbarDragPending())
		this.toolbarDragEnd(e.clientX, e.clientY);
	});
    }

    private getCanvasX(canvas: HTMLCanvasElement, clientX: number): number {
	return clientX - canvas.getBoundingClientRect().left;
    }

    private getCanvasY(canvas: HTMLCanvasElement, clientY: number): number {
	return clientY - canvas.getBoundingClientRect().top;
    }

    // install touch handlers
    private doTouchHandlers(cv: HTMLCanvasElement): void {
	let lastTap = 0;
	let tmout: any = null;
	let lastScale = 1;

	cv.addEventListener("touchstart", (e: TouchEvent) => {
	    const touch1 = e.touches[0];
	    const touch2 = e.touches[e.touches.length - 1];
	    lastScale = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);

	    let etype = "mousedown";
	    clearTimeout(tmout);
	    e.preventDefault();

	    if (e.timeStamp - lastTap < 300) {
		etype = "dblclick";
	    } else {
		tmout = setTimeout(() => { this.longPress(); }, 500);
	    }
	    lastTap = e.timeStamp;

	    const midX = 0.5 * (touch1.clientX + touch2.clientX);
	    const midY = 0.5 * (touch1.clientY + touch2.clientY);
	    const mouseEvent = new MouseEvent(etype, { clientX: midX, clientY: midY });
	    cv.dispatchEvent(mouseEvent);
	    if (e.touches.length > 1)
		this.twoFingerTouch(midX, midY - cv.getBoundingClientRect().top);
	}, false);

	cv.addEventListener("touchend", (e: TouchEvent) => {
	    const mouseEvent = new MouseEvent("mouseup", {});
	    e.preventDefault();
	    clearTimeout(tmout);
	    cv.dispatchEvent(mouseEvent);
	}, false);

	cv.addEventListener("touchmove", (e: TouchEvent) => {
	    e.preventDefault();
	    clearTimeout(tmout);
	    const touch1 = e.touches[0];
	    const touch2 = e.touches[e.touches.length - 1];
	    if (e.touches.length > 1) {
		const newScale = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
		this.zoomCircuit(40 * (Math.log(newScale) - Math.log(lastScale)));
		lastScale = newScale;
	    }
	    const midX = 0.5 * (touch1.clientX + touch2.clientX);
	    const midY = 0.5 * (touch1.clientY + touch2.clientY);
	    const mouseEvent = new MouseEvent("mousemove", { clientX: midX, clientY: midY });
	    cv.dispatchEvent(mouseEvent);
	}, false);
    }

    private longPress(): void {
	this.doPopupMenu();
    }

    private twoFingerTouch(x: number, y: number): void {
	this.tempMouseMode = MouseManager.MODE_DRAG_ALL;
	this.dragScreenX = x;
	this.dragScreenY = y;
    }

    snapGrid(x: number): number {
	return (x + this.sim.gridRound) & this.sim.gridMask;
    }

    isToolbarDragPending(): boolean {
	return this.toolbarDragClass != null;
    }

    // re-place the element being dragged, e.g. when shift is pressed/released
    // without any mouse movement
    toolbarDragOrientationChanged(vertical: boolean): void {
	if (this.toolbarDragClass == null || this.dragElm == null)
	    return;
	this.toolbarDragVertical = vertical;
	this.dragElm.dragPlace(this.toolbarDragAnchorX, this.toolbarDragAnchorY, this.toolbarDragVertical);
	this.sim.repaint();
    }

    beginToolbarDrag(className: string, clientX: number, clientY: number): void {
	if (this.ui.isReadOnly() || this.sim.dialogIsShowing())
	    return;
	this.toolbarDragClass = className;
	this.toolbarDragStartX = clientX;
	this.toolbarDragStartY = clientY;
	this.toolbarDragActive = false;
	this.toolbarDragVertical = false;
    }

    cancelToolbarDrag(): void {
	if (this.dragElm != null) {
	    this.dragElm.delete();
	    this.dragElm = null;
	}
	this.toolbarDragClass = null;
	this.toolbarDragActive = false;
	this.tempMouseMode = this.mouseMode;
	this.dragging = false;
    }

    toolbarDragMove(clientX: number, clientY: number, vertical: boolean): void {
	if (this.toolbarDragClass == null)
	    return;
	if (!this.toolbarDragActive) {
	    const dx = clientX - this.toolbarDragStartX, dy = clientY - this.toolbarDragStartY;
	    if (dx*dx + dy*dy < MouseManager.TOOLBAR_DRAG_THRESHOLD*MouseManager.TOOLBAR_DRAG_THRESHOLD)
		return;
	    this.toolbarDragActive = true;
	    this.sim.undoManager?.pushUndo();
	}
	const canvas = this.ui.cv as HTMLCanvasElement;
	const cx = this.getCanvasX(canvas, clientX);
	const cy = this.getCanvasY(canvas, clientY);
	if (!this.sim.circuitArea.contains(cx, cy)) {
	    if (this.dragElm != null)
		this.sim.repaint();
	    return;
	}
	this.toolbarDragAnchorX = this.snapGrid(this.inverseTransformX(cx));
	this.toolbarDragAnchorY = this.snapGrid(this.inverseTransformY(cy));
	this.toolbarDragVertical = vertical;
	if (this.dragElm == null) {
	    try {
		this.dragElm = this.sim.constructElement(this.toolbarDragClass, this.toolbarDragAnchorX, this.toolbarDragAnchorY);
	    } catch (ex) {
		CirSim.debugger();
	    }
	    this.tempMouseMode = MouseManager.MODE_ADD_ELM;
	    this.dragging = true;
	}
	// (re)place the element at the anchor point; gives it a fixed default length/
	// orientation since there's no drag-to-size gesture on the circuit area here
	if (this.dragElm != null)
	    this.dragElm.dragPlace(this.toolbarDragAnchorX, this.toolbarDragAnchorY, this.toolbarDragVertical);
	this.sim.repaint();
    }

    toolbarDragEnd(clientX: number, clientY: number): void {
	if (this.toolbarDragClass == null)
	    return;
	const wasActive = this.toolbarDragActive;
	this.toolbarDragClass = null;
	this.toolbarDragActive = false;
	if (!wasActive)
	    return; // no real drag happened; let the normal click switch modes as before
	if (this.dragElm != null) {
	    if (this.dragElm.creationFailed()) {
		this.dragElm.delete();
	    } else {
		this.splitAt(this.dragElm.x, this.dragElm.y);
		this.splitAt(this.dragElm.x2, this.dragElm.y2);
		this.ui.elmList.push(this.dragElm);
		this.dragElm.draggingDone();
		this.sim.undoManager?.writeRecoveryToStorage();
		this.sim.unsavedChanges = true;
		this.sim.needAnalyze();
		this.sim.undoManager?.pushUndo();
	    }
	    this.dragElm = null;
	}
	this.tempMouseMode = this.mouseMode;
	this.dragging = false;
	this.sim.updateToolbar();
	this.sim.repaint();
    }

    private doSwitch(x: number, y: number): boolean {
	if (this.mouseElm == null || !this.mouseElm.isSwitchElm())
	    return false;
	const se = this.mouseElm as any; // SwitchElm
	if (!se.getSwitchRect().contains(x, y))
	    return false;
	se.toggle();
	if (se.momentary)
	    this.heldSwitchElm = se;
	if (!this.mouseElm.isLogicInputElm())
	    this.sim.needAnalyze();
	return true;
    }

    private mouseDragged(e: MouseEvent): void {
	// ignore right mouse button with no modifiers (needed on PC)
	if (e.button === 2) {
	    if (!(e.metaKey || e.shiftKey || e.ctrlKey || e.altKey))
		return;
	}

	const canvas = this.ui.cv as HTMLCanvasElement;
	const ex = this.getCanvasX(canvas, e.clientX);
	const ey = this.getCanvasY(canvas, e.clientY);

	if (this.tempMouseMode === MouseManager.MODE_DRAG_SPLITTER) {
	    this.dragSplitter(ex, ey);
	    return;
	}
	const gx = this.inverseTransformX(ex);
	const gy = this.inverseTransformY(ey);
	if (!this.sim.circuitArea.contains(ex, ey)) {
	    this.sim.repaint();
	    return;
	}
	let changed = false;
	if (this.dragElm != null)
	    this.dragElm.drag(gx, gy);
	let success = true;
	switch (this.tempMouseMode) {
	case MouseManager.MODE_DRAG_ALL:
	    this.dragAll(ex, ey);
	    break;
	case MouseManager.MODE_DRAG_ROW:
	    this.dragRow(this.snapGrid(gx), this.snapGrid(gy));
	    changed = true;
	    break;
	case MouseManager.MODE_DRAG_COLUMN:
	    this.dragColumn(this.snapGrid(gx), this.snapGrid(gy));
	    changed = true;
	    break;
	case MouseManager.MODE_DRAG_POST:
	    if (this.mouseElm != null) {
		this.dragPost(this.snapGrid(gx), this.snapGrid(gy), e.shiftKey);
		changed = true;
	    }
	    break;
	case MouseManager.MODE_SELECT:
	    if (this.mouseElm == null)
		this.selectArea(gx, gy, e.shiftKey);
	    else if (!this.ui.isReadOnly()) {
		// wait short delay before dragging — fixes accidental drags on mobile
		if (Date.now() - this.mouseDownTime < 150)
		    return;

		if (this.mouseElm.isRoutedWireElm()) {
		    this.tempMouseMode = MouseManager.MODE_DRAG_REROUTE;
		    (this.mouseElm as any).rerouteVia(this.snapGrid(gx), this.snapGrid(gy));
		    changed = true;
		} else {
		    this.tempMouseMode = MouseManager.MODE_DRAG_SELECTED;
		    changed = success = this.dragSelected(gx, gy);
		}
	    }
	    break;
	case MouseManager.MODE_DRAG_SELECTED:
	    changed = success = this.dragSelected(gx, gy);
	    break;
	case MouseManager.MODE_DRAG_REROUTE:
	    if (this.mouseElm != null && this.mouseElm.isRoutedWireElm()) {
		(this.mouseElm as any).rerouteVia(this.snapGrid(gx), this.snapGrid(gy));
		changed = true;
	    }
	    break;
	}
	this.dragging = true;
	if (success) {
	    this.dragScreenX = ex;
	    this.dragScreenY = ey;
	    this.dragGridX = this.inverseTransformX(this.dragScreenX);
	    this.dragGridY = this.inverseTransformY(this.dragScreenY);
	    if (!(this.tempMouseMode === MouseManager.MODE_DRAG_SELECTED && this.onlyGraphicsElmsSelected())) {
		this.dragGridX = this.snapGrid(this.dragGridX);
		this.dragGridY = this.snapGrid(this.dragGridY);
	    }
	}
	if (changed)
	    this.sim.undoManager?.writeRecoveryToStorage();
	this.sim.repaint();
    }

    private dragSplitter(x: number, y: number): void {
	let h = this.ui.canvasHeight as number;
	if (h < 1) h = 1;
	this.sim.scopeManager.scopeHeightFraction = 1.0 - (y / h);
	if (this.sim.scopeManager.scopeHeightFraction < 0.1)
	    this.sim.scopeManager.scopeHeightFraction = 0.1;
	if (this.sim.scopeManager.scopeHeightFraction > 0.9)
	    this.sim.scopeManager.scopeHeightFraction = 0.9;
	this.ui.setCircuitArea();
	this.sim.repaint();
    }

    private dragAll(x: number, y: number): void {
	const dx = x - this.dragScreenX;
	const dy = y - this.dragScreenY;
	if (dx === 0 && dy === 0) return;
	this.sim.transform[4] += dx;
	this.sim.transform[5] += dy;
	this.dragScreenX = x;
	this.dragScreenY = y;
    }

    private dragRow(x: number, y: number): void {
	const dy = y - this.dragGridY;
	if (dy === 0) return;
	for (let i = 0; i < this.dragRowColElms.length; i++)
	    this.dragRowColElms[i].movePoint(this.dragRowColPosts[i], 0, dy);
	this.removeZeroLengthElements();
    }

    private dragColumn(x: number, y: number): void {
	const dx = x - this.dragGridX;
	if (dx === 0) return;
	for (let i = 0; i < this.dragRowColElms.length; i++)
	    this.dragRowColElms[i].movePoint(this.dragRowColPosts[i], dx, 0);
	this.removeZeroLengthElements();
    }

    private onlyGraphicsElmsSelected(): boolean {
	if (this.mouseElm != null && !this.mouseElm.isGraphicElm())
	    return false;
	for (const ce of this.ui.elmList) {
	    if (ce.isSelected() && !ce.isGraphicElm())
		return false;
	}
	return true;
    }

    private dragSelected(x: number, y: number): boolean {
	let me = false;
	if (this.mouseElm != null && !this.mouseElm.isSelected())
	    this.mouseElm.setSelected(me = true);

	if (!this.onlyGraphicsElmsSelected()) {
	    x = this.snapGrid(x);
	    y = this.snapGrid(y);
	}

	const dx = x - this.dragGridX;
	const dy = y - this.dragGridY;
	if (dx === 0 && dy === 0) {
	    // don't leave mouseElm selected if we selected it above
	    if (me) this.mouseElm!.setSelected(false);
	    return false;
	}
	let allowed = true;

	// check if moves are allowed
	for (const ce of this.ui.elmList) {
	    if (ce.isSelected() && !ce.allowMove(dx, dy))
		allowed = false;
	    if (!allowed) break;
	}

	if (allowed) {
	    for (const ce of this.ui.elmList) {
		if (ce.isSelected())
		    ce.move(dx, dy);
	    }
	    // move connected routed wires' shared posts
	    if (this.sim.sim.routedWireMap != null) {
		for (const ce of this.ui.elmList) {
		    if (!ce.isSelected()) continue;
		    const conns = this.sim.sim.routedWireMap.get(ce);
		    if (conns == null) continue;
		    for (const conn of conns) {
			if (!conn.wire.isSelected() && conn.wire.getPost(conn.wirePost).z === 0)
			    conn.wire.movePoint(conn.wirePost, dx, dy);
		    }
		}
	    }
	    this.sim.needAnalyze();
	}

	// don't leave mouseElm selected if we selected it above
	if (me) this.mouseElm!.setSelected(false);

	return allowed;
    }

    private dragPost(x: number, y: number, all: boolean): void {
	if (this.draggingPost === -1) {
	    this.draggingPost =
		(Graphics.distanceSq(this.mouseElm!.x, this.mouseElm!.y, x, y) >
		 Graphics.distanceSq(this.mouseElm!.x2, this.mouseElm!.y2, x, y)) ? 1 : 0;
	}
	const dx = x - this.dragGridX;
	const dy = y - this.dragGridY;
	if (dx === 0 && dy === 0) return;

	if (all) {
	    // go through all elms
	    for (let i = 0; i < this.ui.elmList.length; i++) {
		const e: CircuitElm = this.ui.elmList[i];
		let p = 0;
		if (e.x === this.dragGridX && e.y === this.dragGridY)
		    p = 0;
		else if (e.x2 === this.dragGridX && e.y2 === this.dragGridY)
		    p = 1;
		else
		    continue;
		e.movePoint(p, dx, dy);
	    }
	} else {
	    this.mouseElm!.movePoint(this.draggingPost, dx, dy);
	    // move connected routed wires' shared posts
	    if (this.sim.sim.routedWireMap != null) {
		const conns = this.sim.sim.routedWireMap.get(this.mouseElm);
		if (conns != null) {
		    for (const conn of conns) {
			if (conn.elmPost === this.draggingPost && conn.wire.getPost(conn.wirePost).z === 0)
			    conn.wire.movePoint(conn.wirePost, dx, dy);
		    }
		}
	    }
	}
	this.sim.needAnalyze();
    }

    doFlip(): void {
	this.menuElm!.flipPosts();
	this.sim.needAnalyze();
    }

    doSplit(ce: CircuitElm | null): void {
	if (ce == null || !ce.isWireElm())
	    return;
	const px = this.snapGrid(this.inverseTransformX(this.menuX));
	const py = this.snapGrid(this.inverseTransformY(this.menuY));
	if (this.splitWireAt(px, py))
	    this.sim.needAnalyze();
    }

    // Split any WireElm (including RoutedWireElm) whose interior contains (px, py).
    // Returns true if any wire was split.
    private splitWireAt(px: number, py: number): boolean {
	let split = false;
	for (let i = this.ui.elmList.length - 1; i >= 0; i--) {
	    const ce = this.ui.elmList[i];
	    if (!ce.isWireElm())
		continue;
	    const we = ce as any;
	    if (!we.pointOnWireInterior(px, py))
		continue;
	    const newWire = we.split(px, py);
	    if (newWire != null) {
		this.ui.elmList.push(newWire);
		split = true;
	    }
	}
	return split;
    }

    // Split the lead stub of any non-wire element whose lead contains (px, py).
    // Moves the element's post to the split point and inserts a wire for the remainder.
    // Returns true if any lead was split.
    private splitLeadsAt(px: number, py: number): boolean {
	let split = false;
	for (let i = this.ui.elmList.length - 1; i >= 0; i--) {
	    const ce = this.ui.elmList[i];
	    if (ce.isWireElm())
		continue;
	    const post = ce.getLeadPost(px, py);
	    if (post < 0)
		continue;
	    const ox = (post === 0) ? ce.x : ce.x2;
	    const oy = (post === 0) ? ce.y : ce.y2;
	    ce.movePoint(post, px - ox, py - oy);
	    const w = this.sim.constructElement("WireElm", px, py) as any;
	    w.drag(ox, oy);
	    this.ui.elmList.push(w);
	    split = true;
	}
	return split;
    }

    // Split any wire or element lead whose interior contains (px, py).
    private splitAt(px: number, py: number): boolean {
	const a = this.splitWireAt(px, py);
	const b = this.splitLeadsAt(px, py);
	return a || b;
    }

    private selectArea(x: number, y: number, add: boolean): void {
	const x1 = Math.min(x, this.initDragGridX);
	const x2 = Math.max(x, this.initDragGridX);
	const y1 = Math.min(y, this.initDragGridY);
	const y2 = Math.max(y, this.initDragGridY);
	this.selectedArea = new Rectangle(x1, y1, x2 - x1, y2 - y1);
	for (const ce of this.ui.elmList) {
	    ce.selectRect(this.selectedArea, add);
	}
	this.enableDisableMenuItems();
    }

    enableDisableMenuItems(): void {
	let canFlipX = true;
	let canFlipY = true;
	let canFlipXY = true;
	const selCount = this.sim.commands.countSelected();
	for (const elm of this.ui.elmList) {
	    if (elm.isSelected() || selCount === 0) {
		if (!elm.canFlipX()) canFlipX = false;
		if (!elm.canFlipY()) canFlipY = false;
		if (!elm.canFlipXY()) canFlipXY = false;
	    }
	}
	this.sim.menus.cutItem.setEnabled(selCount > 0);
	this.sim.menus.copyItem.setEnabled(selCount > 0);
	this.sim.menus.rotateItem.setEnabled(canFlipXY && canFlipY);
	this.sim.menus.mirrorItem.setEnabled(canFlipX);
    }

    setMouseElm(ce: CircuitElm | null): void {
	if (ce !== this.mouseElm) {
	    if (this.mouseElm != null)
		this.mouseElm.setMouseElm(false);
	    if (ce != null)
		ce.setMouseElm(true);
	    this.mouseElm = ce;
	    for (let i = 0; i < this.sim.adjustables.length; i++)
		this.sim.adjustables[i].setMouseElm(ce);
	}
	// highlight all elements on the same net when Shift+hovering over a wire
	if (ce != null && ce.isRemovableWire() && this.sim.sim.nodeList != null && this.netHighlightKeyHeld) {
	    this.highlightedNode = ce.getNode(0);
	} else {
	    this.highlightedNode = null;
	}
    }

    getMouseElm(): CircuitElm | null { return this.mouseElm; }

    updateNetHighlight(): void {
	const ce = this.mouseElm;
	if (ce != null && ce.isRemovableWire() && this.netHighlightKeyHeld) {
	    // force full analysis if pending so node info is up to date
	    if (this.sim.sim.needsStamp) {
		try {
		    this.sim.sim.preStampAndStampCircuit();
		} catch (e) {
		    this.sim.sim.stop("Exception in stampCircuit()", null);
		}
	    }

	    if (this.sim.sim.nodeList != null)
		this.highlightedNode = ce.getNode(0);
	} else {
	    this.highlightedNode = null;
	}
    }

    private removeZeroLengthElements(): void {
	let changed = false;
	for (let i = this.ui.elmList.length - 1; i >= 0; i--) {
	    const ce: CircuitElm = this.ui.elmList[i];
	    if (ce.x === ce.x2 && ce.y === ce.y2) {
		this.ui.elmList.splice(i, 1);
		ce.delete();
		changed = true;
	    }
	}
	this.sim.needAnalyze();
    }

    private mouseIsOverSplitter(x: number, y: number): boolean {
	if (this.sim.scopeManager.scopeCount === 0)
	    return false;
	const isOverSplitter =
	    x >= 0 && x < this.sim.circuitArea.width &&
	    y >= this.sim.circuitArea.height - 5 && y < this.sim.circuitArea.height;
	if (isOverSplitter !== this.mouseWasOverSplitter) {
	    if (isOverSplitter)
		this.sim.setCursorStyle("cursorSplitter");
	    else
		this.sim.setMouseMode(this.mouseMode);
	}
	this.mouseWasOverSplitter = isOverSplitter;
	return isOverSplitter;
    }

    private onMouseMove(e: MouseEvent): void {
	e.preventDefault();
	// a toolbar drag-and-drop in progress is tracked at the document level instead
	if (this.isToolbarDragPending())
	    return;
	const canvas = this.ui.cv as HTMLCanvasElement;
	this.mouseCursorX = this.getCanvasX(canvas, e.clientX);
	this.mouseCursorY = this.getCanvasY(canvas, e.clientY);
	if (this.mouseDragging) {
	    this.mouseDragged(e);
	    return;
	}
	this.mouseSelect(e);
	this.sim.scopeManager.scopeMenuSelected = -1;
    }

    // convert screen coordinates to grid coordinates by inverting circuit transform
    inverseTransformX(x: number): number {
	return Math.floor((x - this.sim.transform[4]) / this.sim.transform[0]);
    }

    inverseTransformY(y: number): number {
	return Math.floor((y - this.sim.transform[5]) / this.sim.transform[3]);
    }

    // convert grid coordinates to screen coordinates
    transformX(x: number): number {
	return Math.floor(x * this.sim.transform[0] + this.sim.transform[4]);
    }

    transformY(y: number): number {
	return Math.floor(y * this.sim.transform[3] + this.sim.transform[5]);
    }

    // need to break this out into a separate routine to handle selection,
    // since we don't get mouse move events on mobile
    mouseSelect(e: MouseEvent): void {
	let newMouseElm: CircuitElm | null = null;
	const canvas = this.ui.cv as HTMLCanvasElement;
	const sx = this.getCanvasX(canvas, e.clientX);
	const sy = this.getCanvasY(canvas, e.clientY);
	this.mouseCursorX = sx;
	this.mouseCursorY = sy;
	const gx = this.inverseTransformX(sx);
	const gy = this.inverseTransformY(sy);
	this.dragGridX = this.snapGrid(gx);
	this.dragGridY = this.snapGrid(gy);
	this.dragScreenX = sx;
	this.dragScreenY = sy;
	this.draggingPost = -1;

	this.mousePost = -1;
	this.scopePlotRoles.clear();

	if (this.mouseIsOverSplitter(sx, sy)) {
	    this.setMouseElm(null);
	    return;
	}

	if (this.sim.circuitArea.contains(sx, sy)) {
	    if (this.mouseElm != null && this.mouseElm.getHandleGrabbedClose(gx, gy, MouseManager.POSTGRABSQ, MouseManager.MINPOSTGRABSIZE) >= 0) {
		newMouseElm = this.mouseElm;
	    } else {
		let bestDist = 100000000;
		for (const ce of this.ui.elmList) {
		    if (ce.boundingBox.contains(gx, gy)) {
			const dist = ce.getMouseDistance(gx, gy);
			if (dist >= 0 && dist < bestDist) {
			    bestDist = dist;
			    newMouseElm = ce;
			}
		    }
		}
	    }
	}
	this.sim.scopeManager.scopeSelected = -1;
	if (newMouseElm == null) {
	    for (let i = 0; i < this.sim.scopeManager.scopeCount; i++) {
		const s = this.sim.scopeManager.scopes[i];
		if (s.rect.contains(sx, sy)) {
		    newMouseElm = s.getElm();
		    s.addScopePlotRoles(this.scopePlotRoles);
		    this.sim.scopeManager.scopeSelected = i;
		}
	    }
	    // the mouse pointer was not in any of the bounding boxes, but we
	    // might still be close to a post
	    for (const ce of this.ui.elmList) {
		if (this.mouseMode === MouseManager.MODE_DRAG_POST) {
		    if (ce.getHandleGrabbedClose(gx, gy, MouseManager.POSTGRABSQ, 0) > 0) {
			newMouseElm = ce;
			break;
		    }
		}
		const jn = ce.getPostCount();
		for (let j = 0; j < jn; j++) {
		    const pt = ce.getPost(j);
		    if (Graphics.distanceSq(pt.x, pt.y, gx, gy) < 26) {
			newMouseElm = ce;
			this.mousePost = j;
			break;
		    }
		}
	    }
	} else {
	    this.mousePost = -1;
	    // look for post close to the mouse pointer
	    for (let i = 0; i < newMouseElm.getPostCount(); i++) {
		const pt = newMouseElm.getPost(i);
		if (Graphics.distanceSq(pt.x, pt.y, gx, gy) < 26)
		    this.mousePost = i;
	    }
	}
	this.sim.repaint();
	this.netHighlightKeyHeld = e.shiftKey;
	this.setMouseElm(newMouseElm);
    }

    private onContextMenu(e: MouseEvent): void {
	e.preventDefault();
	if (!this.sim.dialogIsShowing()) {
	    this.menuClientX = e.clientX;
	    this.menuClientY = e.clientY;
	    this.doPopupMenu();
	}
    }

    // show a context menu popup, clamping to canvas bounds and repositioning submenus
    private showContextPanel(x: number, y: number): void {
	this.watchSubmenus(true);
	const panel = this.ui.contextPanel as HTMLElement;
	panel.style.left = x + "px";
	panel.style.top  = y + "px";
	panel.style.display = "block";
	const w = panel.offsetWidth;
	const h = panel.offsetHeight;
	const clampedX = Math.max(0, Math.min(x, this.ui.canvasWidth  - w));
	const clampedY = Math.max(0, Math.min(y, this.ui.canvasHeight - h));
	if (clampedX !== x || clampedY !== y) {
	    panel.style.left = clampedX + "px";
	    panel.style.top  = clampedY + "px";
	}
    }

    // watch for submenu popups and reposition them if they extend below the viewport
    private watchSubmenus(watch: boolean): void {
	if (watch) {
	    const vh = window.innerHeight;
	    const clamp = (el: Element) => {
		const rect = el.getBoundingClientRect();
		if (rect.bottom > vh) {
		    const newTop = Math.max(0, vh - rect.height);
		    (el as HTMLElement).style.top = newTop + "px";
		}
	    };
	    (window as any).__circuitSubmenuObserver = new MutationObserver(() => {
		const popups = document.querySelectorAll(".elmContextMenu");
		popups.forEach(clamp);
	    });
	    (window as any).__circuitSubmenuObserver.observe(document.body, {
		childList: true, subtree: true, attributes: true, attributeFilter: ["style"]
	    });
	} else {
	    if ((window as any).__circuitSubmenuObserver) {
		(window as any).__circuitSubmenuObserver.disconnect();
		(window as any).__circuitSubmenuObserver = null;
	    }
	}
    }

    private doPopupMenu(): void {
	if (this.ui.isReadOnly() || this.sim.dialogIsShowing())
	    return;
	this.menuElm = this.mouseElm;
	this.sim.scopeManager.menuScope = -1;
	this.sim.scopeManager.menuPlot  = -1;
	if (this.sim.scopeManager.scopeSelected !== -1) {
	    if (this.sim.scopeManager.scopes[this.sim.scopeManager.scopeSelected].canMenu()) {
		this.sim.scopeManager.menuScope = this.sim.scopeManager.scopeSelected;
		this.sim.scopeManager.menuPlot  = this.sim.scopeManager.scopes[this.sim.scopeManager.scopeSelected].selectedPlot;
		this.sim.scopeManager.scopePopupMenu.doScopePopupChecks(
		    false,
		    this.sim.scopeManager.canStackScope(this.sim.scopeManager.scopeSelected),
		    this.sim.scopeManager.canCombineScope(this.sim.scopeManager.scopeSelected),
		    this.sim.scopeManager.canUnstackScope(this.sim.scopeManager.scopeSelected),
		    this.sim.scopeManager.scopes[this.sim.scopeManager.scopeSelected]);
		this.ui.showContextPanel(this.sim.scopeManager.scopePopupMenu.getMenuBar(), this.menuClientX, this.menuClientY);
	    }
	} else if (this.mouseElm != null) {
	    if (!this.mouseElm.isScopeElm()) {
		this.sim.menus.elmScopeMenuItem.setEnabled(this.mouseElm.canViewInScope());
		this.sim.menus.elmFloatScopeMenuItem.setEnabled(this.mouseElm.canViewInScope());
		if ((this.sim.scopeManager.scopeCount + this.sim.scopeManager.countScopeElms()) <= 1) {
		    this.sim.menus.elmAddScopeMenuItem.setCommand({ execute: () => this.sim.commands.menuPerformed("elm", "addToScope0") });
		    this.sim.menus.elmAddScopeMenuItem.setSubMenu(null);
		    this.sim.menus.elmAddScopeMenuItem.setEnabled(
			this.mouseElm.canViewInScope() && (this.sim.scopeManager.scopeCount + this.sim.scopeManager.countScopeElms()) > 0);
		} else {
		    this.sim.scopeManager.composeSelectScopeMenu(this.sim.scopeManager.selectScopeMenuBar);
		    this.sim.menus.elmAddScopeMenuItem.setCommand(null);
		    this.sim.menus.elmAddScopeMenuItem.setSubMenu(this.sim.scopeManager.selectScopeMenuBar);
		    this.sim.menus.elmAddScopeMenuItem.setEnabled(this.mouseElm.canViewInScope());
		}
		this.sim.menus.elmEditMenuItem.setEnabled(this.mouseElm.getEditInfo(0) != null);
		this.sim.menus.elmSplitMenuItem.setEnabled(this.mouseElm.isWireElm());
		this.sim.menus.elmSliderMenuItem.setEnabled(this.sliderItemEnabled(this.mouseElm));

		let canFlipX  = this.mouseElm.canFlipX();
		let canFlipY  = this.mouseElm.canFlipY();
		let canFlipXY = this.mouseElm.canFlipXY();
		for (const elm of this.ui.elmList) {
		    if (elm.isSelected()) {
			if (!elm.canFlipX())  canFlipX  = false;
			if (!elm.canFlipY())  canFlipY  = false;
			if (!elm.canFlipXY()) canFlipXY = false;
		    }
		}
		this.sim.menus.elmRotateMenuItem.setEnabled(canFlipXY && canFlipY);
		this.sim.menus.elmMirrorMenuItem.setEnabled(canFlipX);
		this.ui.showContextPanel(this.sim.menus.elmMenuBar, this.menuClientX, this.menuClientY);
	    } else {
		const s = this.mouseElm as any; // ScopeElm
		if (s.elmScope.canMenu()) {
		    this.sim.scopeManager.menuPlot = s.elmScope.selectedPlot;
		    this.sim.scopeManager.scopePopupMenu.doScopePopupChecks(true, false, false, false, s.elmScope);
		    this.ui.showContextPanel(this.sim.scopeManager.scopePopupMenu.getMenuBar(), this.menuClientX, this.menuClientY);
		}
	    }
	} else {
	    this.doMainMenuChecks();
	    this.ui.showContextPanel(this.sim.menus.mainMenuBar, this.menuClientX, this.menuClientY);
	}
    }

    // check if the user can create sliders for this element
    private sliderItemEnabled(elm: CircuitElm): boolean {
	// prevent confusion
	if (elm.isVarRailElm() || elm.isPotElm())
	    return false;

	for (let i = 0; ; i++) {
	    const ei = elm.getEditInfo(i);
	    if (ei == null)
		return false;
	    if (ei.canCreateAdjustable())
		return true;
	}
    }

    private onClick(e: MouseEvent): void {
	e.preventDefault();
	if (e.button === 1) // middle button
	    this.scrollValues(e.clientX, e.clientY, 0);
    }

    private onDoubleClick(e: MouseEvent): void {
	e.preventDefault();
	if (this.mouseElm == null)
	    return;
	if (this.mouseElm.isCustomCompositeElm()) {
	    (this.mouseElm as any).onDoubleClick();
	    return;
	}
	if (!this.mouseElm.isSwitchElm() && !this.ui.isReadOnly())
	    this.sim.commands.doEdit(this.mouseElm);
    }

    private onMouseOut(e: MouseEvent): void {
	this.mouseCursorX = -1;
    }

    clearMouseElm(): void {
	this.sim.scopeManager.scopeSelected = -1;
	this.setMouseElm(null);
	this.scopePlotRoles.clear();
    }

    private onMouseDown(e: MouseEvent): void {
	e.preventDefault();

	// make sure canvas has focus so all shortcuts work
	if (this.ui.cv && this.ui.cv.focus) this.ui.cv.focus();

	this.sim.stopElm = null; // if stopped, allow user to select other elements to fix circuit
	const canvas = this.ui.cv as HTMLCanvasElement;
	const ex = this.getCanvasX(canvas, e.clientX);
	const ey = this.getCanvasY(canvas, e.clientY);
	this.menuX = this.menuClientX = ex;
	this.menuY = this.menuClientY = ey;
	this.mouseDownTime = Date.now();

	// maybe someone did copy in another window?  should really do this when
	// window receives focus
	this.sim.commands.enablePaste();

	if (e.button !== 0 && e.button !== 1) // not left or middle
	    return;

	// set mouseElm in case we are on mobile
	this.mouseSelect(e);

	this.mouseDragging = true;
	this.didSwitch = false;

	if (this.mouseWasOverSplitter) {
	    this.tempMouseMode = MouseManager.MODE_DRAG_SPLITTER;
	    return;
	}
	if (e.button === 0) {
	    // left mouse
	    this.tempMouseMode = this.mouseMode;
	    if (e.altKey && e.metaKey)
		this.tempMouseMode = MouseManager.MODE_DRAG_COLUMN;
	    else if (e.altKey && e.shiftKey)
		this.tempMouseMode = MouseManager.MODE_DRAG_ROW;
	    else if (e.shiftKey)
		this.tempMouseMode = MouseManager.MODE_SELECT;
	    else if (e.altKey)
		this.tempMouseMode = MouseManager.MODE_DRAG_ALL;
	    else if (e.ctrlKey || e.metaKey)
		this.tempMouseMode = MouseManager.MODE_DRAG_POST;
	} else {
	    this.tempMouseMode = MouseManager.MODE_DRAG_ALL;
	}

	if (this.ui.isReadOnly() && this.tempMouseMode !== MouseManager.MODE_DRAG_ALL)
	    this.tempMouseMode = MouseManager.MODE_SELECT;

	if (!this.sim.dialogIsShowing() && (
	    (this.sim.scopeManager.scopeSelected !== -1 && this.sim.scopeManager.scopes[this.sim.scopeManager.scopeSelected].cursorInSettingsWheel()) ||
	    (this.sim.scopeManager.scopeSelected === -1 && this.mouseElm != null && this.mouseElm.isScopeElm() && (this.mouseElm as any).elmScope.cursorInSettingsWheel())
	)) {
	    if (this.ui.isReadOnly()) return;
	    const s = this.sim.scopeManager.scopeSelected !== -1
		? this.sim.scopeManager.scopes[this.sim.scopeManager.scopeSelected]
		: (this.mouseElm as any).elmScope;
	    s.showProperties();
	    this.clearSelection();
	    this.mouseDragging = false;
	    return;
	}

	// start drag-to-measure if clicking inside a scope
	if (!this.sim.dialogIsShowing()) {
	    for (let i = 0; i < this.sim.scopeManager.scopeCount; i++)
		this.sim.scopeManager.scopes[i].mousePressed(ex, ey);
	    if (this.sim.scopeElmArr != null) {
		for (let i = 0; i < this.sim.scopeElmArr.length; i++)
		    this.sim.scopeElmArr[i].elmScope.mousePressed(ex, ey);
	    }
	}

	const gx = this.inverseTransformX(ex);
	const gy = this.inverseTransformY(ey);
	if (this.doSwitch(gx, gy)) {
	    // do this BEFORE we change the mouse mode to MODE_DRAG_POST!  Or else logic inputs
	    // will add dots to the whole circuit when we click on them!
	    this.didSwitch = true;
	    return;
	}

	// IES - Grab resize handles in select mode if they are far enough apart and you are on top of them
	if (this.tempMouseMode === MouseManager.MODE_SELECT && this.mouseElm != null && !this.ui.isReadOnly() &&
	    this.mouseElm.getHandleGrabbedClose(gx, gy, MouseManager.POSTGRABSQ, MouseManager.MINPOSTGRABSIZE) >= 0 &&
	    !this.anySelectedButMouse())
	    this.tempMouseMode = MouseManager.MODE_DRAG_POST;

	if (this.tempMouseMode !== MouseManager.MODE_SELECT && this.tempMouseMode !== MouseManager.MODE_DRAG_SELECTED)
	    this.clearSelection();

	this.sim.undoManager?.pushUndo();
	this.initDragGridX = gx;
	this.initDragGridY = gy;
	this.dragging = true;

	// capture elements for DragRow/DragColumn at mouse-down so we don't
	// pick up new elements as we sweep over them
	if (this.tempMouseMode === MouseManager.MODE_DRAG_ROW || this.tempMouseMode === MouseManager.MODE_DRAG_COLUMN) {
	    this.dragRowColElms  = [];
	    this.dragRowColPosts = [];
	    const sgx = this.snapGrid(gx);
	    const sgy = this.snapGrid(gy);
	    for (const ce of this.ui.elmList) {
		if (this.tempMouseMode === MouseManager.MODE_DRAG_ROW) {
		    if (ce.y === sgy) { this.dragRowColElms.push(ce); this.dragRowColPosts.push(0); }
		    if (ce.y2 === sgy) { this.dragRowColElms.push(ce); this.dragRowColPosts.push(1); }
		} else {
		    if (ce.x === sgx) { this.dragRowColElms.push(ce); this.dragRowColPosts.push(0); }
		    if (ce.x2 === sgx) { this.dragRowColElms.push(ce); this.dragRowColPosts.push(1); }
		}
	    }
	}
	if (this.tempMouseMode !== MouseManager.MODE_ADD_ELM)
	    return;

	const x0 = this.snapGrid(gx);
	const y0 = this.snapGrid(gy);
	if (!this.sim.circuitArea.contains(ex, ey))
	    return;

	try {
	    this.dragElm = this.sim.constructElement(this.ui.mouseModeStr, x0, y0);
	} catch (ex) {
	    CirSim.debugger();
	}

	this.sim.updateToolbar();
    }

    // check/uncheck/enable/disable menu items as appropriate when menu bar clicked on, or when
    // right mouse menu accessed.  also displays shortcuts as a side effect
    doMainMenuChecks(): void {
	const c = this.ui.mainMenuItems.length;
	for (let i = 0; i < c; i++) {
	    const s = this.ui.mainMenuItemNames[i];
	    this.ui.mainMenuItems[i].setState(s === this.ui.mouseModeStr);
	}
	this.sim.menus.stackAllItem.setEnabled(this.sim.scopeManager.scopeCount > 1 && this.sim.scopeManager.scopes[this.sim.scopeManager.scopeCount - 1].position > 0);
	this.sim.menus.unstackAllItem.setEnabled(this.sim.scopeManager.scopeCount > 1 && this.sim.scopeManager.scopes[this.sim.scopeManager.scopeCount - 1].position !== this.sim.scopeManager.scopeCount - 1);
	this.sim.menus.combineAllItem.setEnabled(this.sim.scopeManager.scopeCount > 1);
	this.sim.menus.separateAllItem.setEnabled(this.sim.scopeManager.scopeCount > 0);

	// also update the subcircuit menu if necessary
	if (MouseManager.lastSubcircuitMenuUpdate !== (window as any).CustomCompositeModel?.sequenceNumber)
	    this.sim.composeSubcircuitMenu();
    }

    private onMouseUp(e: MouseEvent): void {
	e.preventDefault();
	// a toolbar drag-and-drop in progress is finished by the document-level handler instead
	if (this.isToolbarDragPending())
	    return;
	this.mouseDragging = false;
	if ((window as any).Scope) (window as any).Scope.dragStartTime = -1;

	// click to clear selection
	if (this.tempMouseMode === MouseManager.MODE_SELECT && this.selectedArea == null)
	    this.clearSelection();

	// cmd-click = split wire
	if (this.tempMouseMode === MouseManager.MODE_DRAG_POST && this.draggingPost === -1)
	    this.doSplit(this.mouseElm);

	this.tempMouseMode = this.mouseMode;
	this.selectedArea = null;
	this.dragging = false;
	let circuitChanged = false;
	// auto-split wires when a post is dragged onto a wire's interior
	if (this.draggingPost >= 0 && this.mouseElm != null) {
	    const p = this.mouseElm.getPost(this.draggingPost);
	    if (p != null && this.splitAt(p.x, p.y))
		circuitChanged = true;
	}
	if (this.heldSwitchElm != null) {
	    (this.heldSwitchElm as any).mouseUp();
	    this.heldSwitchElm = null;
	    circuitChanged = true;
	}
	if (this.dragElm != null) {
	    // if the element is zero size then don't create it
	    // IES - and disable any previous selection
	    if (this.dragElm.creationFailed()) {
		this.dragElm.delete();
		if (this.mouseMode === MouseManager.MODE_SELECT || this.mouseMode === MouseManager.MODE_DRAG_SELECTED)
		    this.clearSelection();
		this.ui.toolbar.setModeLabel(Locale.LS("Press and hold mouse to create circuit element"));
		this.dragElm = null;
	    } else {
		// auto-split wires at the new element's endpoints before adding it
		this.splitAt(this.dragElm.x, this.dragElm.y);
		this.splitAt(this.dragElm.x2, this.dragElm.y2);
		this.ui.elmList.push(this.dragElm);
		this.dragElm.draggingDone();
		circuitChanged = true;
		this.sim.undoManager?.writeRecoveryToStorage();
		this.sim.unsavedChanges = true;
		this.dragElm = null;
		this.sim.updateToolbar();
	    }
	}
	if (circuitChanged) {
	    this.sim.needAnalyze();
	    this.sim.undoManager?.pushUndo();
	}
	if (this.dragElm != null)
	    this.dragElm.delete();
	this.dragElm = null;
	this.sim.repaint();
    }

    private onMouseWheel(e: WheelEvent): void {
	e.preventDefault();

	// once we start zooming, don't allow other uses of mouse wheel for a while
	// so we don't accidentally edit a resistor value while zooming
	let zoomOnly = Date.now() < this.zoomTime + 1000;

	if (this.ui.isReadOnly() || !this.sim.menus.mouseWheelEditCheckItem.getState())
	    zoomOnly = true;

	if (!zoomOnly)
	    this.scrollValues(e.clientX, e.clientY, e.deltaY);

	if (this.mouseElm != null && (this.mouseElm as any).onMouseWheel && !zoomOnly)
	    (this.mouseElm as any).onMouseWheel(e);
	else if (this.sim.scopeManager.scopeSelected !== -1)
	    this.sim.scopeManager.scopes[this.sim.scopeManager.scopeSelected].onMouseWheel(e);
	else if (!this.sim.dialogIsShowing()) {
	    const canvas = this.ui.cv as HTMLCanvasElement;
	    this.mouseCursorX = this.getCanvasX(canvas, e.clientX);
	    this.mouseCursorY = this.getCanvasY(canvas, e.clientY);
	    this.zoomCircuit(-e.deltaY * this.wheelSensitivity, false);
	    this.zoomTime = Date.now();
	}
	this.sim.repaint();
    }

    zoomCircuit(dy: number, fromKeyboard: boolean = false): void {
	const oldScale = this.sim.transform[0];
	const val = dy * 0.01;
	let newScale = Math.max(oldScale + val, 0.2);
	newScale = Math.min(newScale, 2.5);
	if (newScale === oldScale) return;
	this.setCircuitScale(newScale, fromKeyboard);
    }

    setCircuitScale(newScale: number, fromKeyboard: boolean = false): void {
	const constX = !fromKeyboard ? this.mouseCursorX : this.sim.circuitArea.width  / 2;
	const constY = !fromKeyboard ? this.mouseCursorY : this.sim.circuitArea.height / 2;
	const cx = this.inverseTransformX(constX);
	const cy = this.inverseTransformY(constY);
	this.sim.transform[0] = this.sim.transform[3] = newScale;

	// adjust translation to keep center of screen constant
	// inverse transform = (x-t4)/t0
	this.sim.transform[4] = constX - cx * newScale;
	this.sim.transform[5] = constY - cy * newScale;
    }

    private scrollValues(x: number, y: number, deltay: number): void {
	if (this.mouseElm != null && !this.sim.dialogIsShowing() && this.sim.scopeManager.scopeSelected === -1) {
	    if (this.mouseElm.isResistorElm() || this.mouseElm.isCapacitorElm() || this.mouseElm.isInductorElm()) {
		(window as any).ScrollValuePopup?.new(x, y, deltay, this.mouseElm, this.sim);
	    }
	}
    }

    doMainMenuChecksFromMenuBar(): void {
	this.doMainMenuChecks();
    }

    clearSelection(): void {
	for (const ce of this.ui.elmList) {
	    ce.setSelected(false);
	}
	this.enableDisableMenuItems();
    }

    doSelectAll(): void {
	for (const ce of this.ui.elmList) {
	    ce.setSelected(true);
	}
	this.enableDisableMenuItems();
    }

    private anySelectedButMouse(): boolean {
	for (const ce of this.ui.elmList) {
	    if (ce !== this.mouseElm && ce.selected)
		return true;
	}
	return false;
    }
}
