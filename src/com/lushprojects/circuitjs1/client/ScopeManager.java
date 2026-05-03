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

import java.util.Vector;

import com.google.gwt.user.client.DOM;
import com.google.gwt.user.client.Event;
import com.google.gwt.user.client.ui.MenuBar;
import com.google.gwt.user.client.ui.MenuItem;
import com.google.gwt.safehtml.shared.SafeHtmlUtils;
import com.lushprojects.circuitjs1.client.util.Locale;

public class ScopeManager {

    CirSim sim;

    public Scope scopes[];
    public int scopeCount;
    Scope hoverScope;
    public int scopeColCount[];
    public int scopeSelected = -1;
    public int scopeMenuSelected = -1;
    public int menuScope = -1;
    public int menuPlot = -1;
    public double scopeHeightFraction = 0.2;
    public int oldScopeCount = -1;
    public ScopePopupMenu scopePopupMenu;
    public MenuBar selectScopeMenuBar;
    public Vector<MenuItem> selectScopeMenuItems;

    ScopeManager(CirSim sim) {
	this.sim = sim;
	scopes = new Scope[20];
	scopeColCount = new int[20];
	scopeCount = 0;
	init();
    }

    void init() {
	selectScopeMenuBar = new MenuBar(true) {
	    @Override

	    // when mousing over scope menu item, select associated scope
	    public void onBrowserEvent(Event event) {
		int currentItem = -1;
		int i;
		for (i = 0; i != selectScopeMenuItems.size(); i++) {
		    MenuItem item = selectScopeMenuItems.get(i);
		    if (DOM.isOrHasChild(item.getElement(), DOM.eventGetTarget(event))) {
			//MenuItem found here
			currentItem = i;
		    }
		}
		switch (DOM.eventGetType(event)) {
		case Event.ONMOUSEOVER:
		    scopeMenuSelected = currentItem;
		    break;
		case Event.ONMOUSEOUT:
		    scopeMenuSelected = -1;
		    break;
		}
		super.onBrowserEvent(event);
	    }
	};

	scopePopupMenu = new ScopePopupMenu();
    }

    public void composeSelectScopeMenu(MenuBar sb) {
	sb.clearItems();
	selectScopeMenuItems = new Vector<MenuItem>();
	for( int i = 0; i < scopeCount; i++) {
	    String s, l;
	    s = Locale.LS("Scope")+" "+ Integer.toString(i+1);
	    l=scopes[i].getScopeLabelOrText();
	    if (l!="")
		s+=" ("+SafeHtmlUtils.htmlEscape(l)+")";
	    selectScopeMenuItems.add(new MenuItem(s ,new MyCommand("elm", "addToScope"+Integer.toString(i))));
	}
	int c = countScopeElms();
	for (int j = 0; j < c; j++) {
	    String s,l;
	    s = Locale.LS("Undocked Scope")+" "+ Integer.toString(j+1);
	    l = getNthScopeElm(j).elmScope.getScopeLabelOrText();
	    if (l!="")
		s += " ("+SafeHtmlUtils.htmlEscape(l)+")";
	    selectScopeMenuItems.add(new MenuItem(s, new MyCommand("elm", "addToScope"+Integer.toString(scopeCount+j))));
	}
	for (MenuItem mi : selectScopeMenuItems)
	    sb.addItem(mi);
    }

    boolean scopeMenuIsSelected(Scope s) {
	if (scopeMenuSelected < 0)
	    return false;
	if (scopeMenuSelected < scopeCount)
	    return scopes[scopeMenuSelected] == s;
	return getNthScopeElm(scopeMenuSelected-scopeCount).elmScope == s;
    }

    void timeStep() {
	int i;
	for (i = 0; i != scopeCount; i++)
	    scopes[i].timeStep();
	for (i=0; i != sim.scopeElmArr.length; i++)
	    sim.scopeElmArr[i].stepScope();
	if (hoverScope != null)
	    hoverScope.timeStep();
    }

    void drawHoverScope(Graphics g, int canvasWidth, int canvasHeight) {
	CircuitElm mouseElm = sim.mouse.getMouseElm();
	if (mouseElm == null || mouseElm.isWireEquivalent()) {
	    hoverScope = null;
	    return;
	}
	if (hoverScope == null || hoverScope.getElm() != mouseElm) {
	    hoverScope = null;
	    if (!mouseElm.canViewInScope())
		return;
	    for (int i = 0; i < scopeCount; i++)
		if (scopes[i].showingElm(mouseElm))
		    return;
	    for (int i = 0; i < sim.scopeElmArr.length; i++)
		if (sim.scopeElmArr[i].elmScope.showingElm(mouseElm))
		    return;
	    hoverScope = new Scope(sim, sim.sim);
	    hoverScope.setElm(mouseElm);
	    hoverScope.showMax = true;
	    hoverScope.showRMS = true;
	    if (scopeCount > 0)
		hoverScope.speed = scopes[scopeCount-1].speed;
	}
	int w = CirSim.infoWidth*2;
	int h0 = (int)(canvasHeight * scopeHeightFraction);
	int h = h0;
	int y = canvasHeight - h0 - h;
	if (y < 0)
	    return;
	if (canvasWidth < w)
	    return;
	Rectangle scopeRect = new Rectangle(canvasWidth - w, y, w, h);
	Rectangle bb = mouseElm.getBoundingBox();
	int ex1 = sim.mouse.transformX(bb.x);
	int ey1 = sim.mouse.transformY(bb.y);
	int ex2 = sim.mouse.transformX(bb.x + bb.width);
	int ey2 = sim.mouse.transformY(bb.y + bb.height);
	Rectangle elmRect = new Rectangle(Math.min(ex1, ex2), Math.min(ey1, ey2),
		Math.abs(ex2 - ex1) + 1, Math.abs(ey2 - ey1) + 1);
	if (scopeRect.intersects(elmRect))
	    return;
	hoverScope.setRect(scopeRect);
	g.setColor(sim.menus.printableCheckItem.getState() ? Color.white : Color.black);
	g.fillRect(canvasWidth - w, y, w, h);
	hoverScope.draw(g);
    }

    void setupScopes() {
    	int i;

    	// check scopes to make sure the elements still exist, and remove
    	// unused scopes/columns
    	int pos = -1;
    	for (i = 0; i < scopeCount; i++) {
    	    	if (scopes[i].needToRemove()) {
    			int j;
    			for (j = i; j != scopeCount; j++)
    				scopes[j] = scopes[j+1];
    			scopeCount--;
    			i--;
    			continue;
    		}
    		if (scopes[i].position > pos+1)
    			scopes[i].position = pos+1;
    		pos = scopes[i].position;
    	}
    	while (scopeCount > 0 && scopes[scopeCount-1].getElm() == null)
    		scopeCount--;
    	UIManager ui = sim.ui;
    	int h = ui.canvasHeight - sim.circuitArea.height;
    	pos = 0;
    	for (i = 0; i != scopeCount; i++)
    		scopeColCount[i] = 0;
    	for (i = 0; i != scopeCount; i++) {
    		pos = max(scopes[i].position, pos);
    		scopeColCount[scopes[i].position]++;
    	}
    	int colct = pos+1;
    	int iw = CirSim.infoWidth;
    	if (colct <= 2)
    		iw = iw*3/2;
    	int w = (ui.canvasWidth-iw) / colct;
    	int marg = 10;
    	if (w < marg*2)
    		w = marg*2;
    	pos = -1;
    	int colh = 0;
    	int row = 0;
    	int speed = 0;
    	for (i = 0; i != scopeCount; i++) {
    		Scope s = scopes[i];
    		if (s.position > pos) {
    			pos = s.position;
    			colh = h / scopeColCount[pos];
    			row = 0;
    			speed = s.speed;
    		}
    		s.stackCount = scopeColCount[pos];
    		if (s.speed != speed) {
    			s.speed = speed;
    			s.resetGraph();
    		}
    		Rectangle r = new Rectangle(pos*w, ui.canvasHeight-h+colh*row, w-marg, colh);
    		row++;
    		if (!r.equals(s.rect))
    			s.setRect(r);
    	}
    	if (oldScopeCount != scopeCount) {
    	    ui.setCircuitArea();
    	    oldScopeCount = scopeCount;
    	}
    }

    // we need to calculate wire currents for every iteration if someone is viewing a wire in the
    // scope.  Otherwise we can do it only once per frame.
    boolean canDelayWireProcessing() {
	int i;
	for (i = 0; i != scopeCount; i++)
	    if (scopes[i].viewingWire())
		return false;
	for (CircuitElm ce : sim.elmList)
	    if (ce instanceof ScopeElm && ((ScopeElm)ce).elmScope.viewingWire())
		return false;
	return true;
    }

    int countScopeElms() {
	int c = 0;
	for (int i = 0; i != sim.elmList.size(); i++) {
	    if ( sim.elmList.get(i) instanceof ScopeElm)
		c++;
	}
	return c;
    }

    ScopeElm getNthScopeElm(int n) {
	for (int i = 0; i != sim.elmList.size(); i++) {
	    if ( sim.elmList.get(i) instanceof ScopeElm) {
		n--;
		if (n<0)
		    return (ScopeElm) sim.elmList.get(i);
	    }
	}
	return (ScopeElm) null;
    }

    boolean canStackScope(int s) {
	if (scopeCount < 2)
	    return false;
	if (s==0)
	    s=1;
    	if (scopes[s].position == scopes[s-1].position)
    	    return false;
	return true;
    }

    boolean canCombineScope(int s) {
	return scopeCount >=2;
    }

    boolean canUnstackScope(int s) {
	if (scopeCount < 2)
	    return false;
	if (s==0)
	    s=1;
    	if (scopes[s].position != scopes[s-1].position) {
        	if ( s + 1 < scopeCount && scopes[s+1].position == scopes[s].position) // Allow you to unstack by selecting the top scope in the stack
        	    return true;
        	else
        	    return false;
    	}
	return true;
    }

    void stackScope(int s) {
	if (! canStackScope(s) )
	    return;
    	if (s == 0) {
    		s = 1;
    	}
    	scopes[s].position = scopes[s-1].position;
    	for (s++; s < scopeCount; s++)
    		scopes[s].position--;
    }

    void unstackScope(int s) {
	if (! canUnstackScope(s) )
	    return;
    	if (s == 0) {
    		s = 1;
    	}
    	if (scopes[s].position != scopes[s-1].position) // Allow you to unstack by selecting the top scope in the stack
    	    s++;
    	for (; s < scopeCount; s++)
    		scopes[s].position++;
    }

    void combineScope(int s) {
	if (! canCombineScope(s))
	    return;
    	if (s == 0) {
    		s = 1;
    	}
    	scopes[s-1].combine(scopes[s]);
    	scopes[s].setElm(null);
    }

    void stackAll() {
    	int i;
    	for (i = 0; i != scopeCount; i++) {
    		scopes[i].position = 0;
    		scopes[i].showMax = scopes[i].showMin = false;
    	}
    }

    void unstackAll() {
    	int i;
    	for (i = 0; i != scopeCount; i++) {
    		scopes[i].position = i;
    		scopes[i].showMax = true;
    	}
    }

    void combineAll() {
    	int i;
    	for (i = scopeCount-2; i >= 0; i--) {
    	    scopes[i].combine(scopes[i+1]);
    	    scopes[i+1].setElm(null);
    	}
    }

    void separateAll() {
    	int i;
	Scope newscopes[] = new Scope[20];
	int ct = 0;
    	for (i = 0; i < scopeCount; i++)
    	    ct = scopes[i].separate(newscopes, ct);
	scopes = newscopes;
	scopeCount = ct;
    }

    void deleteUnusedScopeElms() {
	// Remove any scopeElms for elements that no longer exist
	for (int i = sim.elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = sim.elmList.get(i);
    		if (ce instanceof ScopeElm && (((ScopeElm) ce).elmScope.needToRemove() )) {
    			ce.delete();
    			sim.elmList.removeElementAt(i);

    			// need to rebuild scopeElmArr
    			sim.needAnalyze();
    		}
    	}
    }

    void addScope(Scope sc) {
	if (sc.position < 0)
	    sc.position = scopeCount;
	scopes[scopeCount++] = sc;
    }

    void clearScopes() {
	scopeCount = 0;
    }

    void resetGraphs() {
	for (int i = 0; i != scopeCount; i++)
	    scopes[i].resetGraph(true);
    }

    static int max(int a, int b) { return (a > b) ? a : b; }
}
