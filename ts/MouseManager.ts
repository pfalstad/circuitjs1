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
import { SubcircuitModel } from "./SubcircuitModel";
import { CircuitElm } from "./CircuitElm";
import { Point } from "./Point";
import { CircuitNode } from "./CircuitNode";
import { Scope } from "./Scope";
import { Graphics } from "./Graphics";
import { Rectangle } from "./Rectangle";
import { Locale } from "./Locale";
import { ScrollValuePopup } from "./ScrollValuePopup";

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
    static readonly MODE_SELECT_POSTS  = 9;

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
    mouseDownScreenX: number = 0;
    // has the mouse moved more than a few pixels from mouseDownScreenX/Y at any point
    // during this press?  (a drag that returns to its start point is still not a click)
    private movedSinceMouseDown = false;
    mouseDownScreenY: number = 0;
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
    // elements moved by dragSelected during the current drag
    dragMovedElms: Set<CircuitElm> = new Set();

    // ---- Select/Drag Posts mode ----
    // The user boxes a set of posts, then drags them; elements with one end selected
    // stretch, so this can be used to open up (or close up) space in a circuit.
    // Locations ("x,y") of the posts that are selected (for drawing and hit testing).
    postSelLocs: Set<string> = new Set();
    // rigid elements (chips, transistors, text...) that move as a whole
    postSelRigid: Set<CircuitElm> = new Set();
    // what to do to each element when the selection is dragged:
    // -1 = move the whole element, 0/1 = move that end only (stretch)
    private postSelPlan: Map<CircuitElm, number> = new Map();
    // selection seeds from the rubber band(s); shift-drag adds to these
    private postSeedLocs: Set<string> = new Set();
    private postSeedRigid: Set<CircuitElm> = new Set();
    private postSeedBaseLocs: Set<string> = new Set();
    private postSeedBaseRigid: Set<CircuitElm> = new Set();
    // true if the current mouse drag is moving the selected posts (vs. rubber-banding)
    private postDragActive: boolean = false;
    // cached handleFollowers() results, keyed by element, valid while its position is the same
    private followersCache: Map<CircuitElm, { geom: string, f: number[] | null }> = new Map();

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
	let startX = 0, startY = 0; // where a one-finger touch began
	let moved = false;           // has this touch moved past the 10px dead zone yet?

	cv.addEventListener("touchstart", (e: TouchEvent) => {
	    clearTimeout(tmout);
	    e.preventDefault();

	    const touch1 = e.touches[0];
	    const touch2 = e.touches[e.touches.length - 1];
	    lastScale = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
	    const midX = 0.5 * (touch1.clientX + touch2.clientX);
	    const midY = 0.5 * (touch1.clientY + touch2.clientY);

	    if (e.touches.length > 1) {
		// A second finger landing (whether or not the first already dispatched its
		// own mousedown below) means this is a pinch/pan gesture, not a click or
		// double-click: cancel any element placement the first finger may have
		// started -- otherwise it keeps getting resized to follow the pinch
		// midpoint in touchmove and gets committed to the circuit on touchend --
		// and switch to two-finger drag-all instead of dispatching another
		// synthetic mousedown (which would just restart element placement at the
		// new midpoint using whatever mode is currently active).
		if (this.dragElm != null) {
		    this.dragElm.delete();
		    this.dragElm = null;
		}
		lastTap = 0; // a multi-touch gesture is never part of a double-tap sequence
		this.twoFingerTouch(midX, midY - cv.getBoundingClientRect().top);
		return;
	    }

	    startX = touch1.clientX;
	    startY = touch1.clientY;
	    moved = false;
	    let etype = "mousedown";
	    if (e.timeStamp - lastTap < 300) {
		etype = "dblclick";
	    } else {
		tmout = setTimeout(() => { this.longPress(); }, 500);
	    }
	    lastTap = e.timeStamp;

	    const mouseEvent = new MouseEvent(etype, { clientX: midX, clientY: midY });
	    cv.dispatchEvent(mouseEvent);
	}, false);

	cv.addEventListener("touchend", (e: TouchEvent) => {
	    const mouseEvent = new MouseEvent("mouseup", {});
	    (mouseEvent as any).fromTouch = true;
	    e.preventDefault();
	    clearTimeout(tmout);
	    cv.dispatchEvent(mouseEvent);
	}, false);

	cv.addEventListener("touchmove", (e: TouchEvent) => {
	    e.preventDefault();
	    const touch1 = e.touches[0];
	    const touch2 = e.touches[e.touches.length - 1];
	    // a fingertip always wobbles a little: ignore one-finger movement until it passes
	    // 10px, so a held finger neither cancels the long press nor drags what it's on
	    if (e.touches.length === 1 && !moved) {
		if (Math.hypot(touch1.clientX - startX, touch1.clientY - startY) <= 10)
		    return;
		moved = true;
	    }
	    clearTimeout(tmout);
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
	if (this.ui.isReadOnly() || this.sim.modalDialogIsShowing())
	    return;
	this.toolbarDragClass = className;
	CirSim.preloadClass(className);
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
	// still loading (see CirSim.preloadClass())
	if (this.dragElm == null && !CirSim.isClassLoaded(this.toolbarDragClass))
	    return;
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
	let createdElm: CircuitElm | null = null;
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
		createdElm = this.dragElm;
	    }
	    this.dragElm = null;
	}
	this.tempMouseMode = this.mouseMode;
	this.dragging = false;
	this.sim.updateToolbar();
	this.sim.repaint();
	if (createdElm != null)
	    this.editCreatedElm(createdElm);
    }

    // automatically bring up the property editor for a newly-created element,
    // or close the editor for some other element if this one doesn't want it
    private editCreatedElm(elm: CircuitElm): void {
	if (elm.showPropertiesOnCreate() && this.sim.showPropsOnCreate &&
	    !this.ui.isReadOnly())
	    this.sim.commands.doEdit(elm, false);
	else if (CirSim.editDialog != null)
	    CirSim.editDialog.closeDialog();
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
	if (Scope.draggingPlotYScope != null) {
	    const canvas0 = this.ui.cv as HTMLCanvasElement;
	    Scope.draggingPlotYScope.dragPlotY(this.getCanvasY(canvas0, e.clientY));
	    this.sim.repaint();
	    return;
	}
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
	// mouse was pressed in one of the scopes at the bottom (scopeSelected isn't updated
	// while dragging), so don't drag the element it's plotting
	if (this.sim.scopeManager.scopeSelected !== -1) {
	    this.sim.repaint();
	    return;
	}
	const gx = this.inverseTransformX(ex);
	const gy = this.inverseTransformY(ey);
	if (!this.sim.circuitArea.contains(ex, ey)) {
	    this.sim.repaint();
	    return;
	}
	let changed = false;
	if (this.dragElm != null) {
	    this.dragElm.drag(gx, gy);
	    // now that we're actually dragging out a new element, don't leave whatever
	    // was hovered before still looking highlighted underneath it
	    this.setMouseElm(null);
	}
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
	case MouseManager.MODE_SELECT_POSTS:
	    if (this.postDragActive)
		changed = success = this.dragPostSelection(this.snapGrid(gx), this.snapGrid(gy));
	    else
		this.selectPostsArea(gx, gy);
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
		if (ce.isSelected()) {
		    ce.move(dx, dy);
		    this.dragMovedElms.add(ce);
		}
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
	    const me = this.mouseElm!;
	    // remember where the dragged handle was.  conn.elmPost is a post index, not a
	    // handle index (a bus wire has busWidth posts at each end), so match by location.
	    const hx = (this.draggingPost === 0) ? me.x : me.x2;
	    const hy = (this.draggingPost === 0) ? me.y : me.y2;
	    me.movePoint(this.draggingPost, dx, dy);
	    // move connected routed wires' shared posts
	    if (this.sim.sim.routedWireMap != null) {
		const conns = this.sim.sim.routedWireMap.get(me);
		if (conns != null) {
		    for (const conn of conns) {
			const wp = conn.wire.getPost(conn.wirePost);
			if (wp.z === 0 && wp.x === hx && wp.y === hy)
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
    private splitWireAt(px: number, py: number, exclude?: Set<CircuitElm>): boolean {
	let split = false;
	for (let i = this.ui.elmList.length - 1; i >= 0; i--) {
	    const ce = this.ui.elmList[i];
	    if (!ce.isWireElm() || exclude?.has(ce))
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
    private splitLeadsAt(px: number, py: number, exclude?: Set<CircuitElm>): boolean {
	let split = false;
	for (let i = this.ui.elmList.length - 1; i >= 0; i--) {
	    const ce = this.ui.elmList[i];
	    if (ce.isWireElm() || exclude?.has(ce))
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

    // Split any wire or element lead whose interior contains (px, py),
    // skipping elements in exclude.
    private splitAt(px: number, py: number, exclude?: Set<CircuitElm>): boolean {
	const a = this.splitWireAt(px, py, exclude);
	const b = this.splitLeadsAt(px, py, exclude);
	return a || b;
    }

    private selectArea(x: number, y: number, add: boolean): void {
	// an area selection means the user is selecting a group of elements, not editing one
	if (CirSim.editDialog != null)
	    CirSim.editDialog.closeDialog();
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

    private static locKey(x: number, y: number): string { return x + "," + y; }

    // rigid elements can't be stretched; they move as a whole or not at all.  An element
    // can stretch only if it has exactly two posts, which are its two handles.
    // Wires always stretch: all their posts (several, for a bus) are at their two ends.
    private static isRigid(ce: CircuitElm): boolean {
	if (ce.isWireElm())
	    return false;
	if (ce.noDiagonal || ce.getPostCount() !== 2 || ce.getNumHandles() !== 2)
	    return true;
	const p0 = ce.getPost(0);
	const p1 = ce.getPost(1);
	return p0 == null || p1 == null || p0.x !== ce.x || p0.y !== ce.y || p1.x !== ce.x2 || p1.y !== ce.y2;
    }

    private selectPostsArea(x: number, y: number): void {
	const x1 = Math.min(x, this.initDragGridX);
	const x2 = Math.max(x, this.initDragGridX);
	const y1 = Math.min(y, this.initDragGridY);
	const y2 = Math.max(y, this.initDragGridY);
	this.selectedArea = new Rectangle(x1, y1, x2 - x1, y2 - y1);
	const r = this.selectedArea;
	const inside = (px: number, py: number) => px >= x1 && px <= x2 && py >= y1 && py <= y2;
	this.postSeedLocs = new Set(this.postSeedBaseLocs);
	this.postSeedRigid = new Set(this.postSeedBaseRigid);
	for (const ce of this.ui.elmList as CircuitElm[]) {
	    // an element with no posts (text, box...) moves if its center is in the box;
	    // anything else is decided by which of its posts are in the box
	    if (ce.getPostCount() === 0) {
		const bb = ce.boundingBox;
		if (inside(bb.x + bb.width / 2, bb.y + bb.height / 2))
		    this.postSeedRigid.add(ce);
	    }
	    for (let i = 0; i < ce.getPostCount(); i++) {
		const p = ce.getPost(i);
		if (p != null && inside(p.x, p.y))
		    this.postSeedLocs.add(MouseManager.locKey(p.x, p.y));
	    }
	}
	this.computePostSelection();
    }

    private static postKeys(ce: CircuitElm): string[] {
	const keys: string[] = [];
	for (let i = 0; i < ce.getPostCount(); i++) {
	    const p = ce.getPost(i);
	    keys.push(p == null ? "" : MouseManager.locKey(p.x, p.y));
	}
	return keys;
    }

    // For a rigid element with two handles, find out which posts move with which handle,
    // by nudging each handle along the element's axis and seeing which posts follow.
    // Returns, for each post, the handle (0 or 1) it follows, or null if the element
    // can't be stretched (a post follows neither or both handles, or nothing is attached
    // to one of the ends, e.g. a ground).
    private handleFollowers(ce: CircuitElm): number[] | null {
	if (ce.getNumHandles() < 2 || ce.getPostCount() < 2)
	    return null;
	let ax = Math.sign(ce.x2 - ce.x);
	let ay = Math.sign(ce.y2 - ce.y);
	if (ce.noDiagonal) {
	    if (ce.x === ce.x2) ax = 0; else ay = 0;
	}
	if (ax === 0 && ay === 0)
	    return null;
	const n = ce.getPostCount();
	const follows: number[] = new Array(n).fill(-1);
	const g = this.sim.gridSize;
	const ox = ce.x, oy = ce.y, ox2 = ce.x2, oy2 = ce.y2;
	for (let h = 0; h < 2; h++) {
	    // move the handle outward, so the element gets longer (never zero length)
	    const dx = (h === 0 ? -ax : ax) * g;
	    const dy = (h === 0 ? -ay : ay) * g;
	    const before = MouseManager.postKeys(ce);
	    ce.movePoint(h, dx, dy);
	    const after = MouseManager.postKeys(ce);
	    ce.movePoint(h, -dx, -dy);
	    if (ce.x !== ox || ce.y !== oy || ce.x2 !== ox2 || ce.y2 !== oy2) {
		// couldn't put it back exactly (shouldn't happen); restore and give up
		ce.x = ox; ce.y = oy; ce.x2 = ox2; ce.y2 = oy2;
		ce.setPoints();
		return null;
	    }
	    for (let i = 0; i < n; i++) {
		if (after[i] === before[i])
		    continue;
		const [bx, by] = before[i].split(",").map(Number);
		if (follows[i] !== -1 || after[i] !== MouseManager.locKey(bx + dx, by + dy))
		    return null; // follows both handles, or moved some other way
		follows[i] = h;
	    }
	}
	if (follows.includes(-1) || !follows.includes(0) || !follows.includes(1))
	    return null;
	return follows;
    }

    // handleFollowers() moves the element's handles back and forth, which can be slow,
    // so only do it once per element (as long as it stays put)
    private cachedHandleFollowers(ce: CircuitElm): number[] | null {
	const geom = ce.x + "," + ce.y + "," + ce.x2 + "," + ce.y2;
	const c = this.followersCache.get(ce);
	if (c != null && c.geom === geom)
	    return c.f;
	const f = this.handleFollowers(ce);
	this.followersCache.set(ce, { geom, f });
	return f;
    }

    // Expand the seeds into the full selection, keeping everything connected.
    // Each rigid element with any selected posts either stretches (if the selected posts
    // all follow one of its handles, then all the posts that follow that handle get
    // selected) or moves as a whole (and all its posts get selected).  Selecting posts
    // can bring other elements along, so repeat until nothing changes.
    private computePostSelection(): void {
	const elms = this.ui.elmList as CircuitElm[];
	const locs = new Set(this.postSeedLocs);
	// rigid elements: -1 = moves whole, 0/1 = stretches by moving that handle
	const rigidMode = new Map<CircuitElm, number>();
	for (const ce of this.postSeedRigid)
	    if (elms.includes(ce)) rigidMode.set(ce, -1);
	const followers = new Map<CircuitElm, number[] | null>();
	let changed = true;
	while (changed) {
	    changed = false;
	    for (const ce of elms) {
		if (!MouseManager.isRigid(ce) || rigidMode.get(ce) === -1)
		    continue;
		const keys = MouseManager.postKeys(ce);
		const sel: number[] = [];
		keys.forEach((k, i) => { if (locs.has(k)) sel.push(i); });
		if (sel.length === 0)
		    continue;
		if (!followers.has(ce))
		    followers.set(ce, this.cachedHandleFollowers(ce));
		const f = followers.get(ce)!;
		let mode = -1;
		if (f != null && sel.every(i => f[sel[0]] === f[i]))
		    mode = f[sel[0]];
		const old = rigidMode.get(ce);
		if (old !== undefined && old !== mode)
		    mode = -1; // selected posts at both ends now
		if (old === mode)
		    continue;
		rigidMode.set(ce, mode);
		changed = true;
	    }
	    for (const [ce, mode] of rigidMode) {
		const keys = MouseManager.postKeys(ce);
		const f = followers.get(ce);
		keys.forEach((k, i) => {
		    if (k === "" || locs.has(k)) return;
		    if (mode === -1 || (f != null && f[i] === mode)) {
			locs.add(k);
			changed = true;
		    }
		});
	    }
	}
	const plan = new Map<CircuitElm, number>();
	for (const ce of elms) {
	    const mode = rigidMode.get(ce);
	    if (mode !== undefined) {
		plan.set(ce, mode);
	    } else if (!MouseManager.isRigid(ce)) {
		const a = locs.has(MouseManager.locKey(ce.x, ce.y));
		const b = locs.has(MouseManager.locKey(ce.x2, ce.y2));
		if (a && b) plan.set(ce, -1);
		else if (a) plan.set(ce, 0);
		else if (b) plan.set(ce, 1);
	    }
	}
	this.postSelLocs = locs;
	this.postSelRigid = new Set(rigidMode.keys());
	this.postSelPlan = plan;
    }

    clearPostSelection(): void {
	this.postSelLocs = new Set();
	this.postSelRigid = new Set();
	this.postSelPlan = new Map();
	this.postSeedLocs = new Set();
	this.postSeedRigid = new Set();
	this.followersCache = new Map();
    }

    // is (x, y) on a selected post, or on a rigid element that's part of the selection?
    private postSelectionHit(x: number, y: number): boolean {
	for (const k of this.postSelLocs) {
	    const [px, py] = k.split(",").map(Number);
	    if (Graphics.distanceSq(px, py, x, y) <= MouseManager.POSTGRABSQ)
		return true;
	}
	for (const ce of this.postSelRigid)
	    if (ce.boundingBox.contains(x, y))
		return true;
	return false;
    }

    private dragPostSelection(x: number, y: number): boolean {
	let dx = x - this.dragGridX;
	let dy = y - this.dragGridY;
	// a stretched element that can't go diagonal (op-amp, transistor...) can only be
	// stretched along its axis, or its posts would come off their wires
	for (const [ce, n] of this.postSelPlan) {
	    if (n < 0 || !ce.noDiagonal) continue;
	    if (ce.x === ce.x2) dx = 0; else dy = 0;
	}
	if (dx === 0 && dy === 0)
	    return false;
	const elms = this.ui.elmList as CircuitElm[];
	// don't allow a move that would shrink a stretched element to zero length, since
	// movePoint() would refuse to move it and it would come disconnected
	for (const [ce, n] of this.postSelPlan) {
	    if (n < 0) continue;
	    const nx = ce.x + (n === 0 ? dx : 0), ny = ce.y + (n === 0 ? dy : 0);
	    const nx2 = ce.x2 + (n === 1 ? dx : 0), ny2 = ce.y2 + (n === 1 ? dy : 0);
	    if (nx === nx2 && ny === ny2)
		return false;
	}
	for (const [ce, n] of this.postSelPlan) {
	    if (!elms.includes(ce)) continue;
	    if (n < 0)
		ce.move(dx, dy);
	    else
		ce.movePoint(n, dx, dy);
	}
	// keep the selection on the posts that moved
	const shift = (set: Set<string>) => {
	    const out = new Set<string>();
	    for (const k of set) {
		const [px, py] = k.split(",").map(Number);
		out.add(MouseManager.locKey(px + dx, py + dy));
	    }
	    return out;
	};
	this.postSelLocs = shift(this.postSelLocs);
	this.postSeedLocs = shift(this.postSeedLocs);
	this.sim.needAnalyze();
	return true;
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
	this.sim.menus.rotateCCWItem.setEnabled(canFlipXY && canFlipY);
	this.sim.menus.rotateCWItem.setEnabled(canFlipXY && canFlipY);
	this.sim.menus.mirrorXItem.setEnabled(canFlipX);
	this.sim.menus.mirrorYItem.setEnabled(canFlipY);
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
	    const mdx = this.mouseCursorX - this.mouseDownScreenX;
	    const mdy = this.mouseCursorY - this.mouseDownScreenY;
	    if (mdx * mdx + mdy * mdy >= 16)
		this.movedSinceMouseDown = true;
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
	if (!this.sim.modalDialogIsShowing()) {
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
	if (this.ui.isReadOnly() || this.sim.modalDialogIsShowing())
	    return;
	// bringing up the context menu means the user is done with the property editor
	if (CirSim.editDialog != null)
	    CirSim.editDialog.closeDialog();
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
		    this.sim.scopeManager.composeSelectScopeMenu(this.sim.scopeManager.selectScopeMenuBar!);
		    this.sim.menus.elmAddScopeMenuItem.setCommand(null);
		    this.sim.menus.elmAddScopeMenuItem.setSubMenu(this.sim.scopeManager.selectScopeMenuBar);
		    this.sim.menus.elmAddScopeMenuItem.setEnabled(this.mouseElm.canViewInScope());
		}
		this.sim.menus.elmEditMenuItem.setEnabled(this.mouseElm.hasProperties());
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
		this.sim.menus.elmRotateCCWMenuItem.setEnabled(canFlipXY && canFlipY);
		this.sim.menus.elmRotateCWMenuItem.setEnabled(canFlipXY && canFlipY);
		this.sim.menus.elmMirrorXMenuItem.setEnabled(canFlipX);
		this.sim.menus.elmMirrorYMenuItem.setEnabled(canFlipY);
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
	// double-clicking (double-tapping) a scope, docked or floating, opens the scope popup,
	// same as right-click/long press; it shouldn't edit the scope's element
	if (this.sim.scopeManager.scopeSelected !== -1 || (this.mouseElm != null && this.mouseElm.isScopeElm())) {
	    this.doPopupMenu();
	    return;
	}
	if (this.mouseElm == null)
	    return;
	if (this.mouseElm.isSubcircuitElm()) {
	    (this.mouseElm as any).onDoubleClick();
	    return;
	}
	if (!this.mouseElm.isSwitchElm() && this.mouseElm.hasProperties() && this.ui.canEditProperties(this.mouseElm))
	    this.sim.commands.doEdit(this.mouseElm);
    }

    private onMouseOut(e: MouseEvent): void {
	this.mouseCursorX = -1;
	// if the mouse leaves the canvas while dragging (e.g. dragged off the edge of the
	// browser window), we may never get a mouseup event, so end the drag now instead of
	// getting stuck thinking we're still dragging (which for MODE_DRAG_ALL would mean
	// the view keeps panning as the mouse moves, even after the button is released).
	if (this.mouseDragging)
	    this.endDrag();
	// don't leave the last hovered element highlighted after the mouse has left
	this.mousePost = -1;
	this.scopePlotRoles.clear();
	this.setMouseElm(null);
	this.sim.repaint();
    }

    clearMouseElm(): void {
	this.sim.scopeManager.scopeSelected = -1;
	this.setMouseElm(null);
	this.scopePlotRoles.clear();
    }

    private onMouseDown(e: MouseEvent): void {
	e.preventDefault();

	// make sure we have keyboard focus so all shortcuts work. The canvas isn't focusable, and
	// preventDefault() above stops the browser from moving focus here, so when we're in an
	// iframe, focus would otherwise stay in the parent page if that's where it was.
	window.focus();
	(document.activeElement as HTMLElement | null)?.blur?.();

	this.sim.stopElm = null; // if stopped, allow user to select other elements to fix circuit
	const canvas = this.ui.cv as HTMLCanvasElement;
	const ex = this.getCanvasX(canvas, e.clientX);
	const ey = this.getCanvasY(canvas, e.clientY);
	this.menuX = this.menuClientX = ex;
	this.menuY = this.menuClientY = ey;
	this.mouseDownTime = Date.now();
	this.mouseDownScreenX = ex;
	this.mouseDownScreenY = ey;
	this.movedSinceMouseDown = false;

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
	    else if (e.shiftKey && this.mouseMode !== MouseManager.MODE_SELECT_POSTS)
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

	if (!this.sim.modalDialogIsShowing() && (
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
	if (!this.sim.modalDialogIsShowing()) {
	    for (let i = 0; i < this.sim.scopeManager.scopeCount; i++)
		this.sim.scopeManager.scopes[i].mousePressed(ex, ey);
	    if (this.sim.scopeElmArr != null) {
		for (let i = 0; i < this.sim.scopeElmArr.length; i++)
		    this.sim.scopeElmArr[i].elmScope.mousePressed(ex, ey);
	    }
	}

	// alt-drag or middle-mouse-drag a scope's selected plot up/down while in manual scale mode
	if (!this.sim.modalDialogIsShowing() && Scope.cursorScope != null &&
		(e.button === 1 || (e.button === 0 && e.altKey)) &&
		Scope.cursorScope.startDragPlotY(ex, ey))
	    return;

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
	this.dragMovedElms.clear();

	if (this.tempMouseMode === MouseManager.MODE_SELECT_POSTS) {
	    // the circuit may have changed (undo, delete, etc.) since the selection was made
	    if (this.postSelLocs.size > 0)
		this.computePostSelection();
	    this.postDragActive = !this.ui.isReadOnly() && this.postSelectionHit(gx, gy);
	    if (!this.postDragActive) {
		// start a new rubber band; shift adds to the existing selection
		this.postSeedBaseLocs = e.shiftKey ? new Set(this.postSeedLocs) : new Set();
		this.postSeedBaseRigid = e.shiftKey ? new Set(this.postSeedRigid) : new Set();
	    }
	}

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
	// still loading (see CirSim.preloadClass())
	if (!CirSim.isClassLoaded(this.ui.mouseModeStr))
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
	if (MouseManager.lastSubcircuitMenuUpdate !== SubcircuitModel.sequenceNumber)
	    this.sim.composeSubcircuitMenu();
    }

    private onMouseUp(e: MouseEvent): void {
	e.preventDefault();
	// a toolbar drag-and-drop in progress is finished by the document-level handler instead
	if (this.isToolbarDragPending())
	    return;

	// click to clear selection (but not on a right-click, e.g. from a context-menu mouseup)
	if (this.tempMouseMode === MouseManager.MODE_SELECT && this.selectedArea == null && e.button === 0)
	    this.clearSelection();

	// click on empty space (not on the selection) clears the post selection
	if (this.tempMouseMode === MouseManager.MODE_SELECT_POSTS && !this.postDragActive &&
	    this.selectedArea == null && e.button === 0 && !e.shiftKey)
	    this.clearPostSelection();

	// cmd-click = split wire
	if (this.tempMouseMode === MouseManager.MODE_DRAG_POST && this.draggingPost === -1)
	    this.doSplit(this.mouseElm);

	// figure out, before endDrag() clears drag state, whether this mouseup is a plain
	// click (not a drag, not a modified click used for some other gesture) and if so
	// what it landed on, so we can update the (non-modal) property editor accordingly:
	// clicking an element brings up its editor, clicking empty space closes it, and
	// creating a new element (checked after endDrag(), below) brings up its editor too.
	const wasPlainClick = e.button === 0 && !this.didSwitch &&
	    this.tempMouseMode !== MouseManager.MODE_SELECT_POSTS &&
	    !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
	let clickedElm: CircuitElm | null = null;
	let clickedEmpty = false;
	if (wasPlainClick) {
	    // (movement is tracked in onMouseMove rather than by checking this event's
	    // coordinates: on touch devices the synthetic "mouseup" dispatched from touchend
	    // carries no clientX/clientY.  clicking a scope at the bottom is ignored here; it
	    // shouldn't bring up the editor for the scope's element, or close the editor)
	    if (!this.movedSinceMouseDown && this.sim.scopeManager.scopeSelected === -1) {
		// never moved (much) since mousedown, so it's a click, not a drag
		if (this.mouseElm != null && !this.mouseElm.isSwitchElm())
		    clickedElm = this.mouseElm;
		else if (this.mouseElm == null)
		    clickedEmpty = true;
	    }
	}

	const createdElm = this.endDrag();

	if (createdElm != null) {
	    this.editCreatedElm(createdElm);
	} else if (clickedElm != null && !(e as any).fromTouch && this.ui.canEditProperties(clickedElm) &&
		   this.sim.showPropsOnClick) {
	    // (tapping an element on a touch screen doesn't bring up its properties)
	    // (clicking the element whose properties are already showing dismisses them)
	    if (CirSim.editDialog != null && CirSim.editDialog.elm === clickedElm)
		CirSim.editDialog.closeDialog();
	    else if (clickedElm.hasProperties())
		this.sim.commands.doEdit(clickedElm);
	    else if (CirSim.editDialog != null)
		CirSim.editDialog.closeDialog();
	} else if (clickedEmpty && CirSim.editDialog != null) {
	    CirSim.editDialog.closeDialog();
	}
    }

    // common cleanup for ending a drag, whether via mouseup or the mouse leaving the canvas.
    // returns the element that was just created (added to elmList), if any.
    private endDrag(): CircuitElm | null {
	this.mouseDragging = false;
	Scope.dragStartTime = -1;
	Scope.endDragPlotY();

	this.tempMouseMode = this.mouseMode;
	this.selectedArea = null;
	this.dragging = false;
	this.postDragActive = false;
	let circuitChanged = false;
	// auto-split wires when a post is dragged onto a wire's interior
	if (this.draggingPost >= 0 && this.mouseElm != null) {
	    const p = this.mouseElm.getPost(this.draggingPost);
	    if (p != null && this.splitAt(p.x, p.y))
		circuitChanged = true;
	}
	// auto-split wires/leads that moved elements' posts were dropped onto.
	// Moved elements aren't split themselves, since they moved together.
	if (this.dragMovedElms.size > 0) {
	    const posts: Point[] = [];
	    for (const ce of this.dragMovedElms) {
		for (let i = 0; i < ce.getPostCount(); i++) {
		    const p = ce.getPost(i);
		    if (p != null)
			posts.push(p);
		}
	    }
	    for (const p of posts) {
		if (this.splitAt(p.x, p.y, this.dragMovedElms))
		    circuitChanged = true;
	    }
	    this.dragMovedElms.clear();
	}
	if (this.heldSwitchElm != null) {
	    (this.heldSwitchElm as any).mouseUp();
	    this.heldSwitchElm = null;
	    circuitChanged = true;
	}
	let createdElm: CircuitElm | null = null;
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
		createdElm = this.dragElm;
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
	return createdElm;
    }

    private onMouseWheel(e: WheelEvent): void {
	e.preventDefault();

	// once we start zooming, don't allow other uses of mouse wheel for a while
	// so we don't accidentally edit a resistor value while zooming
	const zooming = Date.now() < this.zoomTime + 1000;
	let zoomOnly = zooming;

	if (this.ui.isReadOnly() || !this.sim.menus.mouseWheelEditCheckItem.getState())
	    zoomOnly = true;

	if (!zoomOnly)
	    this.scrollValues(e.clientX, e.clientY, ScrollValuePopup.normalizeWheelDelta(e));

	if (this.mouseElm != null && (this.mouseElm as any).onMouseWheel && !zoomOnly)
	    (this.mouseElm as any).onMouseWheel(e);
	else if (this.sim.scopeManager.scopeSelected !== -1)
	    this.sim.scopeManager.scopes[this.sim.scopeManager.scopeSelected].onMouseWheel(e);
	else if (this.mouseElm != null && this.mouseElm.isScopeElm() && !zooming)
	    // undocked scope: adjust its time scale, like a docked scope
	    (this.mouseElm as any).elmScope.onMouseWheel(e);
	else if (!this.sim.modalDialogIsShowing()) {
	    const canvas = this.ui.cv as HTMLCanvasElement;
	    this.mouseCursorX = this.getCanvasX(canvas, e.clientX);
	    this.mouseCursorY = this.getCanvasY(canvas, e.clientY);
	    this.zoomCircuit(-ScrollValuePopup.normalizeWheelDelta(e) * this.wheelSensitivity, false);
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
	if (this.mouseElm != null && !this.sim.modalDialogIsShowing() && this.sim.scopeManager.scopeSelected === -1) {
	    if (this.mouseElm.isResistorElm() || this.mouseElm.isCapacitorElm() || this.mouseElm.isInductorElm()) {
		CirSim.scrollValuePopup = new ScrollValuePopup(x, y, deltay, this.mouseElm, this.sim);
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
