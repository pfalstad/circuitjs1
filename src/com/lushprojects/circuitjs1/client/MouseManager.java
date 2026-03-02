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

package com.lushprojects.circuitjs1.client;

import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.event.dom.client.MouseDownEvent;
import com.google.gwt.event.dom.client.MouseDownHandler;
import com.google.gwt.event.dom.client.MouseEvent;
import com.google.gwt.event.dom.client.MouseMoveEvent;
import com.google.gwt.event.dom.client.MouseMoveHandler;
import com.google.gwt.event.dom.client.MouseUpHandler;
import com.google.gwt.event.dom.client.MouseUpEvent;
import com.google.gwt.event.dom.client.MouseOutEvent;
import com.google.gwt.event.dom.client.MouseOutHandler;
import com.google.gwt.event.dom.client.ContextMenuEvent;
import com.google.gwt.event.dom.client.ContextMenuHandler;
import com.google.gwt.event.dom.client.MouseWheelEvent;
import com.google.gwt.event.dom.client.MouseWheelHandler;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.DoubleClickHandler;
import com.google.gwt.event.dom.client.DoubleClickEvent;
import com.google.gwt.dom.client.CanvasElement;
import com.google.gwt.dom.client.NativeEvent;
import com.google.gwt.user.client.ui.PopupPanel;
import com.lushprojects.circuitjs1.client.util.Locale;

public class MouseManager implements MouseDownHandler, MouseMoveHandler, MouseUpHandler,
 ClickHandler, DoubleClickHandler, ContextMenuHandler,
 MouseOutHandler, MouseWheelHandler {

    CirSim sim;
    UIManager ui;

    // mode constants
    public static final int MODE_ADD_ELM = 0;
    public static final int MODE_DRAG_ALL = 1;
    public static final int MODE_DRAG_ROW = 2;
    public static final int MODE_DRAG_COLUMN = 3;
    public static final int MODE_DRAG_SELECTED = 4;
    public static final int MODE_DRAG_POST = 5;
    public static final int MODE_SELECT = 6;
    public static final int MODE_DRAG_SPLITTER = 7;

    public static final int POSTGRABSQ = 25;
    public static final int MINPOSTGRABSIZE = 256;

    // fields
    public boolean mouseWasOverSplitter = false;
    public int mouseMode = MODE_SELECT;
    public int tempMouseMode = MODE_SELECT;
    public int dragGridX, dragGridY, dragScreenX, dragScreenY, initDragGridX, initDragGridY;
    public long mouseDownTime;
    public long zoomTime;
    public int mouseCursorX = -1;
    public int mouseCursorY = -1;
    public Rectangle selectedArea;
    public boolean dragging;
    public double wheelSensitivity = 1;
    public CircuitElm dragElm, menuElm;
    private CircuitElm mouseElm = null;
    public boolean didSwitch = false;
    public int mousePost = -1;
    public CircuitElm plotXElm, plotYElm;
    public int draggingPost;
    public SwitchElm heldSwitchElm;
    private boolean mouseDragging;
    public int menuClientX, menuClientY;
    public int menuX, menuY;

    MouseManager(CirSim sim, UIManager ui) {
	this.sim = sim;
	this.ui = ui;
    }

    void register(Canvas cv) {
	cv.addMouseDownHandler(this);
	cv.addMouseMoveHandler(this);
	cv.addMouseOutHandler(this);
	cv.addMouseUpHandler(this);
	cv.addClickHandler(this);
	cv.addDoubleClickHandler(this);
	doTouchHandlers(this, cv.getCanvasElement());
	cv.addDomHandler(this, ContextMenuEvent.getType());
	cv.addMouseWheelHandler(this);
    }

    // install touch handlers
    // don't feel like rewriting this in java.  Anyway, java doesn't let us create mouse
    // events and dispatch them.
    native static void doTouchHandlers(MouseManager mm, CanvasElement cv) /*-{
	// Set up touch events for mobile, etc
	var lastTap;
	var tmout;
	var lastScale;

	cv.addEventListener("touchstart", function (e) {
        	mousePos = getTouchPos(cv, e);
  		var touch = e.touches[0];

  		var etype = "mousedown";
  		lastScale = 1;
  		clearTimeout(tmout);
  		e.preventDefault();

  		if (e.timeStamp-lastTap < 300) {
     		    etype = "dblclick";
  		} else {
  		    tmout = setTimeout(function() {
  		        mm.@com.lushprojects.circuitjs1.client.MouseManager::longPress()();
  		    }, 500);
  		}
  		lastTap = e.timeStamp;

  		var touch1 = e.touches[0];
  		var touch2 = e.touches[e.touches.length-1];
  		lastScale = Math.hypot(touch1.clientX-touch2.clientX, touch1.clientY-touch2.clientY);
  		var mouseEvent = new MouseEvent(etype, {
    			clientX: .5*(touch1.clientX+touch2.clientX),
    			clientY: .5*(touch1.clientY+touch2.clientY)
  		});
  		cv.dispatchEvent(mouseEvent);
  		if (e.touches.length > 1)
  		    mm.@com.lushprojects.circuitjs1.client.MouseManager::twoFingerTouch(II)(mouseEvent.clientX, mouseEvent.clientY - cv.getBoundingClientRect().y);
	}, false);
	cv.addEventListener("touchend", function (e) {
  		var mouseEvent = new MouseEvent("mouseup", {});
  		e.preventDefault();
  		clearTimeout(tmout);
  		cv.dispatchEvent(mouseEvent);
	}, false);
	cv.addEventListener("touchmove", function (e) {
  		e.preventDefault();
  		clearTimeout(tmout);
  		var touch1 = e.touches[0];
  		var touch2 = e.touches[e.touches.length-1];
	        if (e.touches.length > 1) {
  		    var newScale = Math.hypot(touch1.clientX-touch2.clientX, touch1.clientY-touch2.clientY);
	            mm.@com.lushprojects.circuitjs1.client.MouseManager::zoomCircuit(D)(40*(Math.log(newScale)-Math.log(lastScale)));
	            lastScale = newScale;
	        }
  		var mouseEvent = new MouseEvent("mousemove", {
    			clientX: .5*(touch1.clientX+touch2.clientX),
    			clientY: .5*(touch1.clientY+touch2.clientY)
  		});
  		cv.dispatchEvent(mouseEvent);
	}, false);

	// Get the position of a touch relative to the canvas
	function getTouchPos(canvasDom, touchEvent) {
  		var rect = canvasDom.getBoundingClientRect();
  		return {
    			x: touchEvent.touches[0].clientX - rect.left,
    			y: touchEvent.touches[0].clientY - rect.top
  		};
	}

    }-*/;

    void longPress() {
	doPopupMenu();
    }

    void twoFingerTouch(int x, int y) {
	tempMouseMode = MODE_DRAG_ALL;
	dragScreenX = x;
	dragScreenY = y;
    }

    int snapGrid(int x) {
	return (x+sim.gridRound) & sim.gridMask;
    }

    boolean doSwitch(int x, int y) {
	if (mouseElm == null || !(mouseElm instanceof SwitchElm))
	    return false;
	SwitchElm se = (SwitchElm) mouseElm;
	if (!se.getSwitchRect().contains(x, y))
	    return false;
	se.toggle();
	if (se.momentary)
	    heldSwitchElm = se;
	if (!(se instanceof LogicInputElm))
	    sim.needAnalyze();
	return true;
    }

    public void mouseDragged(MouseMoveEvent e) {
    	// ignore right mouse button with no modifiers (needed on PC)
    	if (e.getNativeButton()==NativeEvent.BUTTON_RIGHT) {
    		if (!(e.isMetaKeyDown() ||
    				e.isShiftKeyDown() ||
    				e.isControlKeyDown() ||
    				e.isAltKeyDown()))
    			return;
    	}

    	if (tempMouseMode==MODE_DRAG_SPLITTER) {
    		dragSplitter(e.getX(), e.getY());
    		return;
    	}
    	int gx = inverseTransformX(e.getX());
    	int gy = inverseTransformY(e.getY());
    	if (!sim.circuitArea.contains(e.getX(), e.getY()))
    	    return;
    	boolean changed = false;
    	if (dragElm != null)
    	    dragElm.drag(gx, gy);
    	boolean success = true;
    	switch (tempMouseMode) {
    	case MODE_DRAG_ALL:
    		dragAll(e.getX(), e.getY());
    		break;
    	case MODE_DRAG_ROW:
    		dragRow(snapGrid(gx), snapGrid(gy));
    		changed = true;
    		break;
    	case MODE_DRAG_COLUMN:
		dragColumn(snapGrid(gx), snapGrid(gy));
    		changed = true;
    		break;
    	case MODE_DRAG_POST:
    		if (mouseElm != null) {
    		    dragPost(snapGrid(gx), snapGrid(gy), e.isShiftKeyDown());
    		    changed = true;
    		}
    		break;
    	case MODE_SELECT:
    		if (mouseElm == null)
    		    selectArea(gx, gy, e.isShiftKeyDown());
    		else if (!ui.isReadOnly()) {
    		    // wait short delay before dragging.  This is to fix problem where switches were accidentally getting
    		    // dragged when tapped on mobile devices
    		    if (System.currentTimeMillis()-mouseDownTime < 150)
    			return;

    		    tempMouseMode = MODE_DRAG_SELECTED;
    		    changed = success = dragSelected(gx, gy);
    		}
    		break;
    	case MODE_DRAG_SELECTED:
    		changed = success = dragSelected(gx, gy);
    		break;

    	}
    	dragging = true;
    	if (success) {
    	    dragScreenX = e.getX();
    	    dragScreenY = e.getY();
    //	    console("setting dragGridx in mousedragged");
    	    dragGridX = inverseTransformX(dragScreenX);
    	    dragGridY = inverseTransformY(dragScreenY);
    	    if (!(tempMouseMode == MODE_DRAG_SELECTED && onlyGraphicsElmsSelected())) {
    		dragGridX = snapGrid(dragGridX);
    		dragGridY = snapGrid(dragGridY);
    	    }
   	}
    	if (changed)
    	    sim.undoManager.writeRecoveryToStorage();
    	sim.repaint();
    }

    void dragSplitter(int x, int y) {
    	double h = (double) ui.canvasHeight;
    	if (h<1)
    		h=1;
    	sim.scopeManager.scopeHeightFraction=1.0-(((double)y)/h);
    	if (sim.scopeManager.scopeHeightFraction<0.1)
    		sim.scopeManager.scopeHeightFraction=0.1;
    	if (sim.scopeManager.scopeHeightFraction>0.9)
    		sim.scopeManager.scopeHeightFraction=0.9;
    	ui.setCircuitArea();
    	sim.repaint();
    }

    void dragAll(int x, int y) {
    	int dx = x-dragScreenX;
    	int dy = y-dragScreenY;
    	if (dx == 0 && dy == 0)
    		return;
    	sim.transform[4] += dx;
    	sim.transform[5] += dy;
    	dragScreenX = x;
    	dragScreenY = y;
    }

    void dragRow(int x, int y) {
    	int dy = y-dragGridY;
    	if (dy == 0)
    		return;
    	for (CircuitElm ce : ui.elmList) {
    		if (ce.y  == dragGridY)
    			ce.movePoint(0, 0, dy);
    		if (ce.y2 == dragGridY)
    			ce.movePoint(1, 0, dy);
    	}
    	removeZeroLengthElements();
    }

    void dragColumn(int x, int y) {
    	int dx = x-dragGridX;
    	if (dx == 0)
    		return;
    	for (CircuitElm ce : ui.elmList) {
    		if (ce.x  == dragGridX)
    			ce.movePoint(0, dx, 0);
    		if (ce.x2 == dragGridX)
    			ce.movePoint(1, dx, 0);
    	}
    	removeZeroLengthElements();
    }

    boolean onlyGraphicsElmsSelected() {
	if (mouseElm!=null && !(mouseElm instanceof GraphicElm))
	    return false;
    	for (CircuitElm ce : ui.elmList) {
    	    if ( ce.isSelected() && !(ce instanceof GraphicElm) )
    		return false;
    	}
    	return true;
    }

    boolean dragSelected(int x, int y) {
    	boolean me = false;
    	int i;
    	if (mouseElm != null && !mouseElm.isSelected())
    	    mouseElm.setSelected(me = true);

    	if (! onlyGraphicsElmsSelected()) {
    //	    console("Snapping x and y");
    	    x = snapGrid(x);
    	    y = snapGrid(y);
    	}

    	int dx = x-dragGridX;
  //  	console("dx="+dx+"dragGridx="+dragGridX);
    	int dy = y-dragGridY;
    	if (dx == 0 && dy == 0) {
    	    // don't leave mouseElm selected if we selected it above
    	    if (me)
    		mouseElm.setSelected(false);
    	    return false;
    	}
    	boolean allowed = true;

    	// check if moves are allowed
    	for (CircuitElm ce : ui.elmList) {
    	    if (ce.isSelected() && !ce.allowMove(dx, dy))
    		allowed = false;
    	    if (!allowed)
    		break;
    	}

    	if (allowed) {
    	    for (CircuitElm ce : ui.elmList) {
    		if (ce.isSelected())
    		    ce.move(dx, dy);
    	    }
    	    sim.needAnalyze();
    	}

    	// don't leave mouseElm selected if we selected it above
    	if (me)
    		mouseElm.setSelected(false);

    	return allowed;
    }

    void dragPost(int x, int y, boolean all) {
    	if (draggingPost == -1) {
    		draggingPost =
    				(Graphics.distanceSq(mouseElm.x , mouseElm.y , x, y) >
    				Graphics.distanceSq(mouseElm.x2, mouseElm.y2, x, y)) ? 1 : 0;
    	}
    	int dx = x-dragGridX;
    	int dy = y-dragGridY;
    	if (dx == 0 && dy == 0)
    		return;

    	if (all) {
    	    // go through all elms
    	    int i;
    	    for (i = 0; i != ui.elmList.size(); i++) {
    		CircuitElm e = ui.elmList.get(i);

    		// which post do we move?
    		int p = 0;
    		if (e.x == dragGridX && e.y == dragGridY)
    		    p = 0;
    		else if (e.x2 == dragGridX && e.y2 == dragGridY)
    		    p = 1;
    		else
    		    continue;
    		e.movePoint(p, dx, dy);
    	    }
    	} else
    	    mouseElm.movePoint(draggingPost, dx, dy);
    	sim.needAnalyze();
    }

    void doFlip() {
	menuElm.flipPosts();
    	sim.needAnalyze();
    }

    void doSplit(CircuitElm ce) {
	int x = snapGrid(inverseTransformX(menuX));
	int y = snapGrid(inverseTransformY(menuY));
	if (ce == null || !(ce instanceof WireElm))
	    return;
	if (ce.x == ce.x2)
	    x = ce.x;
	else
	    y = ce.y;

	// don't create zero-length wire
	if (x == ce.x && y == ce.y || x == ce.x2 && y == ce.y2)
	    return;

	WireElm newWire = new WireElm(x, y);
	newWire.drag(ce.x2, ce.y2);
	ce.drag(x, y);
	ui.elmList.addElement(newWire);
	sim.needAnalyze();
    }

    void selectArea(int x, int y, boolean add) {
    	int x1 = Math.min(x, initDragGridX);
    	int x2 = Math.max(x, initDragGridX);
    	int y1 = Math.min(y, initDragGridY);
    	int y2 = Math.max(y, initDragGridY);
    	selectedArea = new Rectangle(x1, y1, x2-x1, y2-y1);
    	for (CircuitElm ce : ui.elmList) {
    		ce.selectRect(selectedArea, add);
    	}
	enableDisableMenuItems();
    }

    void enableDisableMenuItems() {
	boolean canFlipX = true;
	boolean canFlipY = true;
	boolean canFlipXY = true;
	int selCount = sim.commands.countSelected();
	for (CircuitElm elm : ui.elmList)
	    if (elm.isSelected() || selCount == 0) {
		if (!elm.canFlipX())
		    canFlipX = false;
		if (!elm.canFlipY())
		    canFlipY = false;
		if (!elm.canFlipXY())
		    canFlipXY = false;
	    }
	sim.menus.cutItem.setEnabled(selCount > 0);
	sim.menus.copyItem.setEnabled(selCount > 0);
	sim.menus.flipXItem.setEnabled(canFlipX);
	sim.menus.flipYItem.setEnabled(canFlipY);
	sim.menus.flipXYItem.setEnabled(canFlipXY);
    }

    void setMouseElm(CircuitElm ce) {
    	if (ce!=mouseElm) {
    		if (mouseElm!=null)
    			mouseElm.setMouseElm(false);
    		if (ce!=null)
    			ce.setMouseElm(true);
    		mouseElm=ce;
    		int i;
    		for (i = 0; i < sim.adjustables.size(); i++)
    		    sim.adjustables.get(i).setMouseElm(ce);
    	}
    }

    public CircuitElm getMouseElm() { return mouseElm; }

    void removeZeroLengthElements() {
    	boolean changed = false;
    	for (int i = ui.elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = ui.elmList.get(i);
    		if (ce.x == ce.x2 && ce.y == ce.y2) {
    			ui.elmList.removeElementAt(i);
    			ce.delete();
    			changed = true;
    		}
    	}
    	sim.needAnalyze();
    }

    boolean mouseIsOverSplitter(int x, int y) {
    	boolean isOverSplitter;
    	if (sim.scopeManager.scopeCount == 0)
    	    return false;
    	isOverSplitter =((x>=0) && (x<sim.circuitArea.width) &&
    			(y>=sim.circuitArea.height-5) && (y<sim.circuitArea.height));
    	if (isOverSplitter!=mouseWasOverSplitter){
    		if (isOverSplitter)
    			sim.setCursorStyle("cursorSplitter");
    		else
    			sim.setMouseMode(mouseMode);
    	}
    	mouseWasOverSplitter=isOverSplitter;
    	return isOverSplitter;
    }

    public void onMouseMove(MouseMoveEvent e) {
    	e.preventDefault();
    	mouseCursorX=e.getX();
    	mouseCursorY=e.getY();
    	if (mouseDragging) {
    		mouseDragged(e);
    		return;
    	}
    	mouseSelect(e);
    	sim.scopeManager.scopeMenuSelected = -1;
    }

    // convert screen coordinates to grid coordinates by inverting circuit transform
    int inverseTransformX(double x) {
	return (int) ((x-sim.transform[4])/sim.transform[0]);
    }

    int inverseTransformY(double y) {
	return (int) ((y-sim.transform[5])/sim.transform[3]);
    }

    // convert grid coordinates to screen coordinates
    int transformX(double x) {
	return (int) ((x*sim.transform[0]) + sim.transform[4]);
    }

    int transformY(double y) {
	return (int) ((y*sim.transform[3]) + sim.transform[5]);
    }

    // need to break this out into a separate routine to handle selection,
    // since we don't get mouse move events on mobile
    public void mouseSelect(MouseEvent<?> e) {
    	//	The following is in the original, but seems not to work/be needed for GWT
    	//    	if (e.getNativeButton()==NativeEvent.BUTTON_LEFT)
    	//	    return;
    	CircuitElm newMouseElm=null;
    	mouseCursorX=e.getX();
    	mouseCursorY=e.getY();
    	int sx = e.getX();
    	int sy = e.getY();
    	int gx = inverseTransformX(sx);
    	int gy = inverseTransformY(sy);
   // 	console("Settingd draggridx in mouseEvent");
    	dragGridX = snapGrid(gx);
    	dragGridY = snapGrid(gy);
    	dragScreenX = sx;
    	dragScreenY = sy;
    	draggingPost = -1;
    	int i;
    	//	CircuitElm origMouse = mouseElm;

    	mousePost = -1;
    	plotXElm = plotYElm = null;

    	if (mouseIsOverSplitter(sx, sy)) {
    		setMouseElm(null);
    		return;
    	}

    	if (sim.circuitArea.contains(sx, sy)) {
    	    if (mouseElm!=null && ( mouseElm.getHandleGrabbedClose(gx, gy, POSTGRABSQ, MINPOSTGRABSIZE)>=0)) {
    		newMouseElm=mouseElm;
    	    } else {
    		int bestDist = 100000000;
    		for (CircuitElm ce : ui.elmList) {
		    if (ce.boundingBox.contains(gx, gy)) {
			int dist = ce.getMouseDistance(gx, gy);
			if (dist >= 0 && dist < bestDist) {
			    bestDist = dist;
			    newMouseElm = ce;
			}
		    }
    		} // for
    	    }
    	}
    	sim.scopeManager.scopeSelected = -1;
    	if (newMouseElm == null) {
    	    for (i = 0; i != sim.scopeManager.scopeCount; i++) {
    		Scope s = sim.scopeManager.scopes[i];
    		if (s.rect.contains(sx, sy)) {
    		    newMouseElm=s.getElm();
    		    if (s.plotXY) {
    			plotXElm = s.getXElm();
    			plotYElm = s.getYElm();
    		    }
    		    sim.scopeManager.scopeSelected = i;
    		}
    	    }
    		//	    // the mouse pointer was not in any of the bounding boxes, but we
    		//	    // might still be close to a post
    		for (CircuitElm ce : ui.elmList) {
    			if (mouseMode==MODE_DRAG_POST ) {
    				if (ce.getHandleGrabbedClose(gx, gy, POSTGRABSQ, 0)> 0)
    				{
    					newMouseElm = ce;
    					break;
    				}
    			}
    			int j;
    			int jn = ce.getPostCount();
    			for (j = 0; j != jn; j++) {
    				Point pt = ce.getPost(j);
    				//   int dist = Graphics.distanceSq(x, y, pt.x, pt.y);
    				if (Graphics.distanceSq(pt.x, pt.y, gx, gy) < 26) {
    					newMouseElm = ce;
    					mousePost = j;
    					break;
    				}
    			}
    		}
    	} else {
    		mousePost = -1;
    		// look for post close to the mouse pointer
    		for (i = 0; i != newMouseElm.getPostCount(); i++) {
    			Point pt = newMouseElm.getPost(i);
    			if (Graphics.distanceSq(pt.x, pt.y, gx, gy) < 26)
    				mousePost = i;
    		}
    	}
    	sim.repaint();
    	setMouseElm(newMouseElm);
    }

    public void onContextMenu(ContextMenuEvent e) {
    	e.preventDefault();
    	if (!sim.dialogIsShowing()) {
        	menuClientX = e.getNativeEvent().getClientX();
        	menuClientY = e.getNativeEvent().getClientY();
        	doPopupMenu();
    	}
    }

    @SuppressWarnings("deprecation")
    void doPopupMenu() {
	if (ui.isReadOnly() || sim.dialogIsShowing())
	    return;
    	menuElm = mouseElm;
    	sim.scopeManager.menuScope=-1;
    	sim.scopeManager.menuPlot=-1;
    	int x, y;
    	if (sim.scopeManager.scopeSelected!=-1) {
    	    	if (sim.scopeManager.scopes[sim.scopeManager.scopeSelected].canMenu()) {
    	    	    sim.scopeManager.menuScope=sim.scopeManager.scopeSelected;
    	    	    sim.scopeManager.menuPlot=sim.scopeManager.scopes[sim.scopeManager.scopeSelected].selectedPlot;
    	    	    sim.scopeManager.scopePopupMenu.doScopePopupChecks(false, sim.scopeManager.canStackScope(sim.scopeManager.scopeSelected), sim.scopeManager.canCombineScope(sim.scopeManager.scopeSelected),
    	    		    sim.scopeManager.canUnstackScope(sim.scopeManager.scopeSelected), sim.scopeManager.scopes[sim.scopeManager.scopeSelected]);
    	    	    ui.contextPanel=new PopupPanel(true);
    	    	    ui.contextPanel.add(sim.scopeManager.scopePopupMenu.getMenuBar());
    	    	    y=Math.max(0, Math.min(menuClientY,ui.canvasHeight-160));
    	    	    ui.contextPanel.setPopupPosition(menuClientX, y);
    	    	    ui.contextPanel.show();
    		}
    	} else if (mouseElm != null) {
    	    	if (! (mouseElm instanceof ScopeElm)) {
    	    	    sim.menus.elmScopeMenuItem.setEnabled(mouseElm.canViewInScope());
    	    	    sim.menus.elmFloatScopeMenuItem.setEnabled(mouseElm.canViewInScope());
    	    	    if ((sim.scopeManager.scopeCount + sim.scopeManager.countScopeElms()) <= 1) {
    	    		sim.menus.elmAddScopeMenuItem.setCommand(new MyCommand("elm", "addToScope0"));
    	    		sim.menus.elmAddScopeMenuItem.setSubMenu(null);
    	    	    	sim.menus.elmAddScopeMenuItem.setEnabled(mouseElm.canViewInScope() && (sim.scopeManager.scopeCount + sim.scopeManager.countScopeElms())> 0);
    	    	    }
    	    	    else {
    	    		sim.scopeManager.composeSelectScopeMenu(sim.scopeManager.selectScopeMenuBar);
    	    		sim.menus.elmAddScopeMenuItem.setCommand(null);
    	    		sim.menus.elmAddScopeMenuItem.setSubMenu(sim.scopeManager.selectScopeMenuBar);
    	    	    	sim.menus.elmAddScopeMenuItem.setEnabled(mouseElm.canViewInScope() );
    	    	    }
    	    	    sim.menus.elmEditMenuItem .setEnabled(mouseElm.getEditInfo(0) != null);
    	    	    sim.menus.elmSplitMenuItem.setEnabled(canSplit(mouseElm));
    	    	    sim.menus.elmSliderMenuItem.setEnabled(sliderItemEnabled(mouseElm));
		    sim.menus.elmSplitMenuItem.setEnabled(canSplit(mouseElm));

		    boolean canFlipX = mouseElm.canFlipX();
		    boolean canFlipY = mouseElm.canFlipY();
		    boolean canFlipXY = mouseElm.canFlipXY();
		    for (CircuitElm elm : ui.elmList)
			if (elm.isSelected()) {
			    if (!elm.canFlipX())
				canFlipX = false;
			    if (!elm.canFlipY())
				canFlipY = false;
			    if (!elm.canFlipXY())
				canFlipXY = false;
			}
    	    	    sim.menus.elmFlipXMenuItem.setEnabled(canFlipX);
    	    	    sim.menus.elmFlipYMenuItem.setEnabled(canFlipY);
    	    	    sim.menus.elmFlipXYMenuItem.setEnabled(canFlipXY);
    	    	    ui.contextPanel=new PopupPanel(true);
    	    	    ui.contextPanel.add(sim.menus.elmMenuBar);
    	    	    ui.contextPanel.setPopupPosition(menuClientX, menuClientY);
    	    	    ui.contextPanel.show();
    	    	} else {
    	    	    ScopeElm s = (ScopeElm) mouseElm;
    	    	    if (s.elmScope.canMenu()) {
    	    		sim.scopeManager.menuPlot = s.elmScope.selectedPlot;
    	    		sim.scopeManager.scopePopupMenu.doScopePopupChecks(true, false, false, false, s.elmScope);
    			ui.contextPanel=new PopupPanel(true);
    			ui.contextPanel.add(sim.scopeManager.scopePopupMenu.getMenuBar());
    			ui.contextPanel.setPopupPosition(menuClientX, menuClientY);
    			ui.contextPanel.show();
    	    	    }
    	    	}
    	} else {
    		doMainMenuChecks();
    		ui.contextPanel=new PopupPanel(true);
    		ui.contextPanel.add(sim.menus.mainMenuBar);
    		x=Math.max(0, Math.min(menuClientX, ui.canvasWidth-400));
    		y=Math.max(0, Math.min(menuClientY, ui.canvasHeight-450));
    		ui.contextPanel.setPopupPosition(x,y);
    		ui.contextPanel.show();
    	}
    }

    boolean canSplit(CircuitElm ce) {
	if (!(ce instanceof WireElm))
	    return false;
	WireElm we = (WireElm) ce;
	if (we.x == we.x2 || we.y == we.y2)
	    return true;
	return false;
    }

    // check if the user can create sliders for this element
    boolean sliderItemEnabled(CircuitElm elm) {
	int i;

	// prevent confusion
	if (elm instanceof VarRailElm || elm instanceof PotElm)
	    return false;

	for (i = 0; ; i++) {
	    EditInfo ei = elm.getEditInfo(i);
	    if (ei == null)
		return false;
	    if (ei.canCreateAdjustable())
		return true;
	}
    }

//    public void mouseClicked(MouseEvent e) {
    public void onClick(ClickEvent e) {
    	e.preventDefault();
//    	//IES - remove inteaction
////	if ( e.getClickCount() == 2 && !didSwitch )
////	    doEditMenu(e);
//	if (e.getNativeButton() == NativeEvent.BUTTON_LEFT) {
//	    if (mouseMode == MODE_SELECT || mouseMode == MODE_DRAG_SELECTED)
//		clearSelection();
//	}
    	if ((e.getNativeButton() == NativeEvent.BUTTON_MIDDLE))
    		scrollValues(e.getNativeEvent().getClientX(), e.getNativeEvent().getClientY(), 0);
    }

    public void onDoubleClick(DoubleClickEvent e){
    	e.preventDefault();
    	if (mouseElm == null)
    	    return;
    	if (mouseElm instanceof CustomCompositeElm) {
    	    ((CustomCompositeElm) mouseElm).onDoubleClick();
    	    return;
    	}
    	if (!(mouseElm instanceof SwitchElm) && !ui.isReadOnly())
    	    sim.commands.doEdit(mouseElm);
    }

//    public void mouseEntered(MouseEvent e) {
//    }

    public void onMouseOut(MouseOutEvent e) {
    	mouseCursorX=-1;
    }

    void clearMouseElm() {
    	sim.scopeManager.scopeSelected = -1;
    	setMouseElm(null);
    	plotXElm = plotYElm = null;
    }

    public void onMouseDown(MouseDownEvent e) {
//    public void mousePressed(MouseEvent e) {
    	e.preventDefault();

    	// make sure canvas has focus, not stop button or something else, so all shortcuts work
    	ui.cv.setFocus(true);

	sim.stopElm = null; // if stopped, allow user to select other elements to fix circuit
    	menuX = menuClientX = e.getX();
    	menuY = menuClientY = e.getY();
    	mouseDownTime = System.currentTimeMillis();

    	// maybe someone did copy in another window?  should really do this when
    	// window receives focus
    	sim.commands.enablePaste();

    	if (e.getNativeButton() != NativeEvent.BUTTON_LEFT && e.getNativeButton() != NativeEvent.BUTTON_MIDDLE)
    		return;

    	// set mouseElm in case we are on mobile
    	mouseSelect(e);

    	mouseDragging=true;
    	didSwitch = false;

    	if (mouseWasOverSplitter) {
    		tempMouseMode = MODE_DRAG_SPLITTER;
    		return;
    	}
	if (e.getNativeButton() == NativeEvent.BUTTON_LEFT) {
//	    // left mouse
	    tempMouseMode = mouseMode;
	    if (e.isAltKeyDown() && e.isMetaKeyDown())
		tempMouseMode = MODE_DRAG_COLUMN;
	    else if (e.isAltKeyDown() && e.isShiftKeyDown())
		tempMouseMode = MODE_DRAG_ROW;
	    else if (e.isShiftKeyDown())
		tempMouseMode = MODE_SELECT;
	    else if (e.isAltKeyDown())
		tempMouseMode = MODE_DRAG_ALL;
	    else if (e.isControlKeyDown() || e.isMetaKeyDown())
		tempMouseMode = MODE_DRAG_POST;
	} else
	    tempMouseMode = MODE_DRAG_ALL;


	if (ui.isReadOnly())
	    tempMouseMode = MODE_SELECT;

	if (!(sim.dialogIsShowing()) && ((sim.scopeManager.scopeSelected != -1 && sim.scopeManager.scopes[sim.scopeManager.scopeSelected].cursorInSettingsWheel()) ||
		( sim.scopeManager.scopeSelected == -1 && mouseElm instanceof ScopeElm && ((ScopeElm)mouseElm).elmScope.cursorInSettingsWheel()))){
	    if (ui.isReadOnly())
		return;
	    Scope s;
	    if (sim.scopeManager.scopeSelected != -1)
		s=sim.scopeManager.scopes[sim.scopeManager.scopeSelected];
	    else
		s=((ScopeElm)mouseElm).elmScope;
	    s.properties();
	    clearSelection();
	    mouseDragging=false;
	    return;
	}

	int gx = inverseTransformX(e.getX());
	int gy = inverseTransformY(e.getY());
	if (doSwitch(gx, gy)) {
	    // do this BEFORE we change the mouse mode to MODE_DRAG_POST!  Or else logic inputs
	    // will add dots to the whole circuit when we click on them!
            didSwitch = true;
	    return;
	}

	// IES - Grab resize handles in select mode if they are far enough apart and you are on top of them
	if (tempMouseMode == MODE_SELECT && mouseElm!=null && !ui.isReadOnly() &&
		mouseElm.getHandleGrabbedClose(gx, gy, POSTGRABSQ, MINPOSTGRABSIZE) >=0 &&
		!anySelectedButMouse())
	    tempMouseMode = MODE_DRAG_POST;

	if (tempMouseMode != MODE_SELECT && tempMouseMode != MODE_DRAG_SELECTED)
	    clearSelection();

	sim.undoManager.pushUndo();
	initDragGridX = gx;
	initDragGridY = gy;
	dragging = true;
	if (tempMouseMode !=MODE_ADD_ELM)
		return;
//
	int x0 = snapGrid(gx);
	int y0 = snapGrid(gy);
	if (!sim.circuitArea.contains(e.getX(), e.getY()))
	    return;

	try {
	    dragElm = sim.constructElement(ui.mouseModeStr, x0, y0);
	} catch (Exception ex) {
	    sim.debugger();
	}

	sim.updateToolbar();
    }

    static int lastSubcircuitMenuUpdate;

    // check/uncheck/enable/disable menu items as appropriate when menu bar clicked on, or when
    // right mouse menu accessed.  also displays shortcuts as a side effect
    void doMainMenuChecks() {
    	int c = ui.mainMenuItems.size();
    	int i;
    	for (i=0; i<c ; i++) {
    	    	String s = ui.mainMenuItemNames.get(i);
    		ui.mainMenuItems.get(i).setState(s==ui.mouseModeStr);

	        // Code to disable draw menu items when cct is not editable, but no used in this version as it
	        // puts up a dialog box instead (see menuPerformed).
    		//if (s.length() > 3 && s.substring(s.length()-3)=="Elm")
    		    //mainMenuItems.get(i).setEnabled(!menus.noEditCheckItem.getState());
    	}
    	sim.menus.stackAllItem.setEnabled(sim.scopeManager.scopeCount > 1 && sim.scopeManager.scopes[sim.scopeManager.scopeCount-1].position > 0);
    	sim.menus.unstackAllItem.setEnabled(sim.scopeManager.scopeCount > 1 && sim.scopeManager.scopes[sim.scopeManager.scopeCount-1].position != sim.scopeManager.scopeCount -1);
    	sim.menus.combineAllItem.setEnabled(sim.scopeManager.scopeCount > 1);
    	sim.menus.separateAllItem.setEnabled(sim.scopeManager.scopeCount > 0);

    	// also update the subcircuit menu if necessary
    	if (lastSubcircuitMenuUpdate != CustomCompositeModel.sequenceNumber)
    	    sim.composeSubcircuitMenu();
    }

    public void onMouseUp(MouseUpEvent e) {
    	e.preventDefault();
    	mouseDragging=false;

    	// click to clear selection
    	if (tempMouseMode == MODE_SELECT && selectedArea == null)
    	    clearSelection();

    	// cmd-click = split wire
    	if (tempMouseMode == MODE_DRAG_POST && draggingPost == -1)
    	    doSplit(mouseElm);

    	tempMouseMode = mouseMode;
    	selectedArea = null;
    	dragging = false;
    	boolean circuitChanged = false;
    	if (heldSwitchElm != null) {
    		heldSwitchElm.mouseUp();
    		heldSwitchElm = null;
    		circuitChanged = true;
    	}
    	if (dragElm != null) {
    		// if the element is zero size then don't create it
    		// IES - and disable any previous selection
    	    	if (dragElm.creationFailed()) {
    			dragElm.delete();
    			if (mouseMode == MODE_SELECT || mouseMode == MODE_DRAG_SELECTED)
    				clearSelection();
			ui.toolbar.setModeLabel(Locale.LS("Press and hold mouse to create circuit element"));
			dragElm = null;
    		}
    		else {
    			ui.elmList.addElement(dragElm);
    			dragElm.draggingDone();
    			circuitChanged = true;
    			sim.undoManager.writeRecoveryToStorage();
    			sim.unsavedChanges = true;
			dragElm = null;
			sim.updateToolbar();
    		}
    	}
    	if (circuitChanged) {
    	    sim.needAnalyze();
    	    sim.undoManager.pushUndo();
    	}
    	if (dragElm != null)
    		dragElm.delete();
    	dragElm = null;
    	sim.repaint();
    }

    public void onMouseWheel(MouseWheelEvent e) {
    	e.preventDefault();

    	// once we start zooming, don't allow other uses of mouse wheel for a while
    	// so we don't accidentally edit a resistor value while zooming
    	boolean zoomOnly = System.currentTimeMillis() < zoomTime+1000;

    	if (ui.isReadOnly() || !sim.menus.mouseWheelEditCheckItem.getState())
    	    zoomOnly = true;

    	if (!zoomOnly)
    	    scrollValues(e.getNativeEvent().getClientX(), e.getNativeEvent().getClientY(), e.getDeltaY());

    	if (mouseElm instanceof MouseWheelHandler && !zoomOnly)
    		((MouseWheelHandler) mouseElm).onMouseWheel(e);
    	else if (sim.scopeManager.scopeSelected != -1 && !zoomOnly)
    	    sim.scopeManager.scopes[sim.scopeManager.scopeSelected].onMouseWheel(e);
    	else if (!sim.dialogIsShowing()) {
    	    mouseCursorX=e.getX();
    	    mouseCursorY=e.getY();
    	    zoomCircuit(-e.getDeltaY()*wheelSensitivity, false);
    	    zoomTime = System.currentTimeMillis();
   	}
    	sim.repaint();
    }

    void zoomCircuit(double dy) { zoomCircuit(dy, false); }

    void zoomCircuit(double dy, boolean menu) {
	double newScale;
    	double oldScale = sim.transform[0];
    	double val = dy*.01;
    	newScale = Math.max(oldScale+val, .2);
    	newScale = Math.min(newScale, 2.5);
    	setCircuitScale(newScale, menu);
    }

    void setCircuitScale(double newScale, boolean menu) {
	int constX = !menu ? mouseCursorX : sim.circuitArea.width/2;
	int constY = !menu ? mouseCursorY : sim.circuitArea.height/2;
	int cx = inverseTransformX(constX);
	int cy = inverseTransformY(constY);
	sim.transform[0] = sim.transform[3] = newScale;

	// adjust translation to keep center of screen constant
	// inverse transform = (x-t4)/t0
	sim.transform[4] = constX - cx*newScale;
	sim.transform[5] = constY - cy*newScale;
    }

    void scrollValues(int x, int y, int deltay) {
    	if (mouseElm!=null && !sim.dialogIsShowing() && sim.scopeManager.scopeSelected == -1)
    		if (mouseElm instanceof ResistorElm || mouseElm instanceof CapacitorElm ||  mouseElm instanceof InductorElm) {
    			sim.scrollValuePopup = new ScrollValuePopup(x, y, deltay, mouseElm, sim);
    		}
    }

    void doMainMenuChecksFromMenuBar() {
	doMainMenuChecks();
    }

    void clearSelection() {
	for (CircuitElm ce : ui.elmList) {
	    ce.setSelected(false);
	}
	enableDisableMenuItems();
    }

    void doSelectAll() {
    	for (CircuitElm ce : ui.elmList) {
    		ce.setSelected(true);
    	}
	enableDisableMenuItems();
    }

    boolean anySelectedButMouse() {
    	for (CircuitElm ce : ui.elmList)
    		if (ce != mouseElm && ce.selected)
    			return true;
    	return false;
    }
}
