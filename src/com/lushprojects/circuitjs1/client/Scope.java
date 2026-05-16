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

import com.google.gwt.event.dom.client.MouseWheelEvent;
import com.google.gwt.xml.client.Document;
import com.google.gwt.xml.client.Element;
import com.lushprojects.circuitjs1.client.util.Locale;

import java.util.Vector;


class Scope {
    // also bit positions 25, 26, 27 should not be used because they might be set by old trigger mode code

    static final int VAL_POWER = 7;
    static final int VAL_POWER_OLD = 1;
    static final int VAL_VOLTAGE = 0;
    static final int VAL_CURRENT = 3;
    static final int VAL_IB = 1;
    static final int VAL_IC = 2;
    static final int VAL_IE = 3;
    static final int VAL_VBE = 4;
    static final int VAL_VBC = 5;
    static final int VAL_VCE = 6;
    static final int VAL_R = 2;
    static final int VAL_CHARGE = 8;
    static final int UNITS_V = 0;
    static final int UNITS_A = 1;
    static final int UNITS_W = 2;
    static final int UNITS_OHMS = 3;
    static final int UNITS_C = 4;
    static final int UNITS_COUNT = 5;
    static final double multa[] = {2.0, 2.5, 2.0};
    static final int V_POSITION_STEPS=200;
    static final double MIN_MAN_SCALE = 1e-9;
    int scopePointCount = 128;
    int position;
    // speed is sim timestep units per pixel
    int speed;
    int stackCount; // number of scopes in this column
    String text;
    Rectangle rect;
    boolean manualScale;
    boolean showI, showV, showScale, showMax, showMin, showP2P, showFreq;
    ScopePlot2d plot2d;
    ScopeFFT fftPlot;
    ScopeOverlays overlays;
    ScopeSerializer serializer;
    boolean maxScale;

    boolean showNegative, showRMS, showAverage, showDutyCycle, showElmInfo;
    Vector<ScopePlot> plots, visiblePlots;
    CirSim app;
    SimulationManager sim;
    // scopeTimeStep to check if sim timestep has changed from previous value when redrawing
    double scopeTimeStep;
    double scale[]; // Max value to scale the display to show - indexed for each value of UNITS - e.g. UNITS_V, UNITS_A etc.
    boolean reduceRange[];
    double wheelDeltaY;
    int selectedPlot;
    ScopePropertiesDialog properties;
    String curColor, voltColor;
    double gridStepX, gridStepY;
    double maxValue, minValue;
    int manDivisions; // Number of vertical divisions when in manual mode
    static int lastManDivisions = 8;
    boolean drawGridLines;
    boolean somethingSelected;

    ScopeTrigger trigger = new ScopeTrigger();

    static double cursorTime;
    static double dragStartTime = -1;
    static int cursorUnits;
    static Scope cursorScope;
    
    Scope(CirSim app_, SimulationManager sim_) {
    	sim = sim_;
    	app = app_;
    	position = -1;
    	scale = new double[UNITS_COUNT];
    	reduceRange = new boolean[UNITS_COUNT];
	manDivisions = lastManDivisions;

    	rect = new Rectangle(0, 0, 1, 1);
	plot2d = new ScopePlot2d(this);
	fftPlot = new ScopeFFT(this);
	overlays = new ScopeOverlays(this);
	serializer = new ScopeSerializer(this);
    	initialize();
    }
    
    void showCurrent(boolean b) {
	showI = b;
	if (b && !hasPlotValue(VAL_CURRENT)) {
	    CircuitElm ce = getElm();
	    if (ce != null)
		plots.add(new ScopePlot(ce, UNITS_A, VAL_CURRENT, getManScaleFromMaxScale(UNITS_A, false)));
	}
	calcVisiblePlots();
	resetGraph();
    }
    void showVoltage(boolean b) {
	showV = b;
	if (b && !hasPlotValue(VAL_VOLTAGE)) {
	    CircuitElm ce = getElm();
	    if (ce != null)
		plots.add(new ScopePlot(ce, UNITS_V, VAL_VOLTAGE, getManScaleFromMaxScale(UNITS_V, false)));
	}
	calcVisiblePlots();
	resetGraph();
    }

    // check if any plot has the given value (unlike showingValue which checks ALL plots)
    boolean hasPlotValue(int v) {
	for (int i = 0; i != plots.size(); i++) {
	    if (plots.get(i).value == v)
		return true;
	}
	return false;
    }

void showPlotValue(int val, boolean b) {
	if (b) {
	    if (!hasPlotValue(val)) {
		CircuitElm ce = getElm();
		if (ce != null) {
		    int u = ce.getScopeUnits(val);
		    plots.add(new ScopePlot(ce, u, val, getManScaleFromMaxScale(u, false)));
		}
	    }
	} else {
	    for (int i = plots.size() - 1; i >= 0; i--) {
		if (plots.get(i).value == val && plots.size() > 1)
		    plots.remove(i);
	    }
	}
	calcVisiblePlots();
	resetGraph();
    }

    void showCharge(boolean b) { showPlotValue(VAL_CHARGE, b); }
    void showPower(boolean b)  { showPlotValue(VAL_POWER,  b); }

    void showMax    (boolean b) { showMax = b; }
    void showScale    (boolean b) { showScale = b; }
    void showMin    (boolean b) { showMin = b; }
    void showP2P    (boolean b) { showP2P = b; }
    void showFreq   (boolean b) { showFreq = b; }
    void setManualScale(boolean value, boolean roundup) { 
	if (value!=manualScale)
	    plot2d.clearView();
	manualScale = value; 
	for (ScopePlot p : plots) {
	    if (!p.manScaleSet) {
		p.manScale=getManScaleFromMaxScale(p.units, roundup);
		p.manVPosition=0;
		p.manScaleSet = true;
	    }
	}
    }
    
    void resetGraph() { resetGraph(false); }
    
    void resetGraph(boolean full) {
    	scopePointCount = 1;
    	while (scopePointCount <= rect.width)
    		scopePointCount *= 2;
    	// Double buffer for trigger mode to prevent overwriting displayed data
    	if (trigger.isActive())
    	    scopePointCount *= 2;
    	if (plots == null)
    	    plots = new Vector<ScopePlot>();
    	showNegative = false;
    	int i;
    	for (i = 0; i != plots.size(); i++)
    	    plots.get(i).reset(scopePointCount, speed, full);
	calcVisiblePlots();
    	scopeTimeStep = sim.maxTimeStep;
    	plot2d.allocImage();
    	trigger.reset(scopePointCount);
    }
    
    void setManualScaleValue(int plotId, double d) {
	if (plotId >= visiblePlots.size() )
	    return; // Shouldn't happen, but just in case...
	plot2d.clearView();
	visiblePlots.get(plotId).manScale=d;
	visiblePlots.get(plotId).manScaleSet=true;
    }
    
    double getScaleValue() {
	if (visiblePlots.size() == 0)
	    return 0;
	ScopePlot p = visiblePlots.get(0);
	return scale[p.units];
    }
    
    String getScaleUnitsText() {
	if (visiblePlots.size() == 0)
	    return "V";
	ScopePlot p = visiblePlots.get(0);
	return getScaleUnitsText(p.units);
    }
    
    static String getScaleUnitsText(int units) {
	switch (units) {
	case UNITS_A: return "A";
	case UNITS_OHMS: return Locale.ohmString;
	case UNITS_W: return "W";
	case UNITS_C: return "C";
	default: return "V";
	}
    }
    
    void setManDivisions(int d) {
	manDivisions = lastManDivisions = d;
    }

    boolean active() { return plots.size() > 0 && plots.get(0).elm != null; }

    boolean isTriggered() { return trigger.isTriggered(); }

    int displayStartIndex(ScopePlot plot, int w) {
	return trigger.displayStartIndex(plot, w, scopePointCount);
    }

    int validDataCount(ScopePlot plot, int ipa, int w) {
	return trigger.validDataCount(plot, ipa, w, scopePointCount);
    }

    void checkTrigger() { trigger.check(visiblePlots, plot2d.enabled, sim, scopePointCount, rect.width); }

    void setTriggerMode(int mode) {
	trigger.mode = mode;
	resetGraph();
    }

    void drawTriggerIndicator(Graphics g) { trigger.drawIndicator(g, visiblePlots, rect); }

    void initialize() {
    	resetGraph();
    	scale[UNITS_W] = scale[UNITS_OHMS] = scale[UNITS_V] = scale[UNITS_C] = 5;
    	scale[UNITS_A] = .1;
    	plot2d.scaleX = 5;
    	plot2d.scaleY = .1;
    	plot2d.enabled = false;
    	speed = 64;
    	showMax = true;
    	showV = showI = false;
    	showScale = showFreq = manualScale = showMin = showP2P = showElmInfo = false;
    	fftPlot.enabled = false;
    	if (!serializer.loadDefaults()) {
    	    // set showV and showI appropriately depending on what plots are present
    	    int i;
    	    for (i = 0; i != plots.size(); i++) {
    		ScopePlot plot = plots.get(i);
    		if (plot.units == UNITS_V)
    		    showV = true;
    		if (plot.units == UNITS_A)
    		    showI = true;
    	    }
    	}
    }
    
    void calcVisiblePlots() {
	visiblePlots = new Vector<ScopePlot>();
	int i;
	int vc = 0, ac = 0, oc = 0;
	if (!plot2d.enabled) {
        	for (i = 0; i != plots.size(); i++) {
        	    ScopePlot plot = plots.get(i);
        	    if (plot.value == VAL_VOLTAGE) {
        		if (showV) {
        		    visiblePlots.add(plot);
        		    plot.assignColor(vc++);
        		}
        	    } else if (plot.value == VAL_CURRENT) {
        		if (showI) {
        		    visiblePlots.add(plot);
        		    plot.assignColor(ac++);
        		}
        	    } else {
        		visiblePlots.add(plot);
        		plot.assignColor(oc++);
        	    }
        	}
	} else { // In 2D mode show all plots so scales can be adjusted for any
	    for (i = 0; i < plots.size(); i++)
		visiblePlots.add(plots.get(i));
	}
    }
    
    void setRect(Rectangle r) {
	int w = this.rect.width;
	int h = this.rect.height;
	this.rect = r;
	if (this.rect.width != w || (plot2d.plotXY && this.rect.height != h))
	    resetGraph();
    }
    
    int getWidth() { return rect.width; }
    
    int rightEdge() { return rect.x+rect.width; }
	
    void setElm(CircuitElm ce) {
	plots = new Vector<ScopePlot>();
    	if (ce instanceof TransistorElm)
    	    setValue(VAL_VCE, ce);
    	else
    	    setValue(0, ce);
    	initialize();
    }
    
    void addElm(CircuitElm ce) {
    	if (ce instanceof TransistorElm)
    	    addValue(VAL_VCE, ce);
    	else
    	    addValue(0, ce);
    }

    void setValue(int val) {
	if (plots.size() > 2 || plots.size() == 0)
	    return;
	CircuitElm ce = plots.firstElement().elm;
	if (plots.size() == 2 && plots.get(1).elm != ce)
	    return;
	plot2d.enabled = plot2d.plotXY = false;
	setValue(val, ce);
    }
    
    void addValue(int val, CircuitElm ce) {
	if (val == 0) {
	    plots.add(new ScopePlot(ce, UNITS_V, VAL_VOLTAGE, getManScaleFromMaxScale(UNITS_V, false)));
	    
	    // create plot for current if applicable
	    if (ce != null &&
		    app.menus.dotsCheckItem.getState() &&
		    !(ce instanceof OutputElm ||
		    ce instanceof LogicOutputElm ||
		    ce instanceof AudioOutputElm ||
		    ce instanceof TestPointElm ||
		    ce instanceof ProbeElm))
		plots.add(new ScopePlot(ce, UNITS_A, VAL_CURRENT, getManScaleFromMaxScale(UNITS_A, false)));
	} else {
	    int u = ce.getScopeUnits(val);
	    plots.add(new ScopePlot(ce, u, val, getManScaleFromMaxScale(u, false)));
	    if (u == UNITS_V)
		showV = true;
	    if (u == UNITS_A)
		showI = true;
	}
	calcVisiblePlots();
	resetGraph();
    }
    
    void setValue(int val, CircuitElm ce) {
	plots = new Vector<ScopePlot>();
	addValue(val, ce);
//    	initialize();
    }

    void setValues(int val, int ival, CircuitElm ce, CircuitElm yelm) {
	if (ival > 0) {
	    plots = new Vector<ScopePlot>();
	    plots.add(new ScopePlot(ce, ce.getScopeUnits( val),  val, getManScaleFromMaxScale(ce.getScopeUnits( val), false)));
	    plots.add(new ScopePlot(ce, ce.getScopeUnits(ival), ival, getManScaleFromMaxScale(ce.getScopeUnits(ival), false)));
	    return;
	}
	if (yelm != null) {
	    plots = new Vector<ScopePlot>();
	    plots.add(new ScopePlot(ce,   ce.getScopeUnits( val), 0, getManScaleFromMaxScale(ce.getScopeUnits( val), false)));
	    plots.add(new ScopePlot(yelm, ce.getScopeUnits(ival), 0, getManScaleFromMaxScale(ce.getScopeUnits( val), false)));
	    return;
	}
	setValue(val);
    }
    
    void setText(String s) {
	text = s;
    }
    
    String getText() {
	return text;
    }
    
    boolean showingValue(int v) {
	int i;
	for (i = 0; i != plots.size(); i++) {
	    ScopePlot sp = plots.get(i);
	    if (sp.value != v)
		return false;
	}
	return true;
    }

    // returns true if we have a plot of voltage and nothing else (except current or charge).
    // The default case is a plot of voltage and current, so we're basically checking if that case is true.
    // Charge is also allowed since it coexists additively with voltage and current.
    boolean showingVoltageAndMaybeCurrent() {
	int i;
	boolean gotv = false;
	for (i = 0; i != plots.size(); i++) {
	    ScopePlot sp = plots.get(i);
	    if (sp.value == VAL_VOLTAGE)
		gotv = true;
	    else if (sp.value != VAL_CURRENT && sp.value != VAL_CHARGE)
		return false;
	}
	return gotv;
    }
    

    void combine(Scope s) {
	/*
	// if voltage and current are shown, remove current
	if (plots.size() == 2 && plots.get(0).elm == plots.get(1).elm)
	    plots.remove(1);
	if (s.plots.size() == 2 && s.plots.get(0).elm == s.plots.get(1).elm)
	    plots.add(s.plots.get(0));
	else
	*/
	plots = visiblePlots;
	plots.addAll(s.visiblePlots);
	s.plots.removeAllElements();
	calcVisiblePlots();
    }

    // separate this scope's plots into separate scopes and return them in arr[pos], arr[pos+1], etc.  return new length of array.
    int separate(Scope arr[], int pos) {
	int i;
	ScopePlot lastPlot = null;
	for (i = 0; i != visiblePlots.size(); i++) {
	    if (pos >= arr.length)
		return pos;
	    Scope s = new Scope(app, sim);
	    ScopePlot sp = visiblePlots.get(i);
	    if (lastPlot != null && lastPlot.elm == sp.elm && lastPlot.value == VAL_VOLTAGE && sp.value == VAL_CURRENT)
		continue;
	    s.setValue(sp.value, sp.elm);
	    s.position = pos;
	    arr[pos++] = s;
	    lastPlot = sp;
	    s.serializer.setFlags(serializer.getFlags());
	    s.setSpeed(speed);
	}
	return pos;
    }

    void removePlot(int plot) {
	if (plot < visiblePlots.size()) {
	    ScopePlot p = visiblePlots.get(plot);
	    plots.remove(p);
	    calcVisiblePlots();
	}
    }
    
    // called for each timestep
    void timeStep() {
	int i;
	for (i = 0; i != plots.size(); i++)
	    plots.get(i).timeStep();

	checkTrigger();

	// For 2d plots we draw here rather than in the drawing routine
	if (plot2d.enabled)
	    plot2d.timeStep();
    }

    /*
    void adjustScale(double x) {
	scale[UNITS_V] *= x;
	scale[UNITS_A] *= x;
	scale[UNITS_OHMS] *= x;
	scale[UNITS_W] *= x;
	scaleX *= x;
	scaleY *= x;
    }
    */
    
    void setMaxScale(boolean s) {
	// This procedure is added to set maxscale to an explicit value instead of just having a toggle
	// We call the toggle procedure first because it has useful side-effects and then set the value explicitly.
	maxScale();
	maxScale = s;
    }
    
    void maxScale() {
	if (plot2d.enabled) {
	    plot2d.maxScale();
	    return;
	}
	// toggle max scale.  This isn't on by default because, for the examples, we sometimes want two plots
	// matched to the same scale so we can show one is larger.  Also, for some fast-moving scopes
	// (like for AM detector), the amplitude varies over time but you can't see that if the scale is
	// constantly adjusting.  It's also nice to set the default scale to hide noise and to avoid
	// having the scale moving around a lot when a circuit starts up.
	maxScale = !maxScale;
	showNegative = false;
    }

    void drawSettingsWheel(Graphics g) {
	final int outR = 8;
	final int inR= 5;
	final int inR45 = 4;
	final int outR45 = 6;
	if (showSettingsWheel()) {
	    g.context.save();
	    if (cursorInSettingsWheel())
		g.setColor(CircuitElm.selectColor);
	    else
		g.setColor(Color.dark_gray);
	    g.context.translate(rect.x+18, rect.y+rect.height-18);
	    CircuitElm.drawThickCircle(g,0, 0, inR);
	    CircuitElm.drawThickLine(g, -outR, 0, -inR, 0);
	    CircuitElm.drawThickLine(g, outR, 0, inR, 0);
	    CircuitElm.drawThickLine(g, 0, -outR, 0, -inR);
	    CircuitElm.drawThickLine(g, 0, outR, 0, inR);
	    CircuitElm.drawThickLine(g, -outR45, -outR45,-inR45,-inR45);
	    CircuitElm.drawThickLine(g, outR45, -outR45,inR45,-inR45);
	    CircuitElm.drawThickLine(g, -outR45, outR45,-inR45,inR45);
	    CircuitElm.drawThickLine(g, outR45, outR45,inR45,inR45);
	g.context.restore();
	}
    }

  
    
    boolean showSettingsWheel() {
	return rect.height > 100 && rect.width > 100;
    }
    
    boolean cursorInSettingsWheel() {
	return showSettingsWheel() &&
		app.mouse.mouseCursorX >= rect.x &&
		app.mouse.mouseCursorX <= rect.x + 36 &&
		app.mouse.mouseCursorY >= rect.y + rect.height - 36 && 
		app.mouse.mouseCursorY <= rect.y + rect.height;
    }
    
    // does another scope have something selected?
    void checkForSelectionElsewhere() {
	// if mouse is here, then selection is already set by checkForSelection()
	if (cursorScope == this)
	    return;
	
	if (cursorScope == null || visiblePlots.size() == 0) {
	    selectedPlot = -1;
	    return;
	}
	
	// find a plot with same units as selected plot
	int i;
	for (i = 0; i != visiblePlots.size(); i++) {
	    ScopePlot p = visiblePlots.get(i);
	    if (p.units == cursorUnits) {
		selectedPlot = i;
		return;
	    }
	}
	
	// default if we can't find anything with matching units
	selectedPlot = 0;
    }
    
    void draw(Graphics g) {
	if (plots.size() == 0)
	    return;
    	
    	// reset if timestep changed
    	if (scopeTimeStep != sim.maxTimeStep) {
    	    scopeTimeStep = sim.maxTimeStep;
    	    resetGraph();
    	}
    	
    	
    	if (plot2d.enabled) {
    		plot2d.draw(g);
    		return;
    	}

    	drawSettingsWheel(g);
    	g.context.save();
    	g.setColor(Color.red);
    	g.context.translate(rect.x, rect.y);    	
    	g.clipRect(0, 0, rect.width, rect.height);

        if (fftPlot.enabled) {
            fftPlot.drawVerticalGridLines(g);
            fftPlot.draw(g);
        }

    	int i;
    	for (i = 0; i != UNITS_COUNT; i++) {
    	    reduceRange[i] = false;
    	    if (maxScale && !manualScale)
    		scale[i] = 1e-4;
    	}
    	
    	int si;
    	somethingSelected = false;  // is one of our plots selected?
    	
    	for (si = 0; si != visiblePlots.size(); si++) {
    	    ScopePlot plot = visiblePlots.get(si);
    	    calcPlotScale(plot);
    	    if (app.scopeManager.scopeSelected == -1 && plot.elm !=null && plot.elm.isMouseElm())
    		somethingSelected = true;
    	    reduceRange[plot.units] = true;
    	}
    	
    	boolean sel = app.scopeManager.scopeMenuIsSelected(this);
    	
	boolean somethingSelectedHere = somethingSelected;

    	checkForSelectionElsewhere();
    	if (selectedPlot >= 0)
    	    somethingSelected = true;

    	if (somethingSelectedHere || sel) {
    	    g.context.save();
    	    g.context.setGlobalAlpha(0.15);
    	    g.setColor(CircuitElm.selectColor);
    	    g.fillRect(0, 0, rect.width, rect.height);
    	    g.context.restore();
    	}
	if (getSingleElm() != null)
	    somethingSelected = false;

    	drawGridLines = true;
    	boolean allPlotsSameUnits = true;
    	for (i = 1; i < visiblePlots.size(); i++) {
    	    if (visiblePlots.get(i).units != visiblePlots.get(0).units)
    		allPlotsSameUnits = false; // Don't draw horizontal grid lines unless all plots are in same units
    	}
    	
    	if ((allPlotsSameUnits || showMax || showMin || showP2P) && visiblePlots.size() > 0)
    	    calcMaxAndMin(visiblePlots.firstElement().units);
    	
    	// draw volt plots on top (last), then current plots underneath, then everything else
    	for (i = 0; i != visiblePlots.size(); i++) {
    	    if (visiblePlots.get(i).units > UNITS_A && i != selectedPlot)
    		drawPlot(g, visiblePlots.get(i), allPlotsSameUnits, false, sel);
    	}
    	for (i = 0; i != visiblePlots.size(); i++) {
    	    if (visiblePlots.get(i).units == UNITS_A && i != selectedPlot)
    		drawPlot(g, visiblePlots.get(i), allPlotsSameUnits, false, sel);
    	}
    	for (i = 0; i != visiblePlots.size(); i++) {
    	    if (visiblePlots.get(i).units == UNITS_V && i != selectedPlot)
    		drawPlot(g, visiblePlots.get(i), allPlotsSameUnits, false, sel);
    	}
    	// draw selection on top.  only works if selection chosen from scope
    	if (selectedPlot >= 0 && selectedPlot < visiblePlots.size())
    	    drawPlot(g, visiblePlots.get(selectedPlot), allPlotsSameUnits, true, sel);

    	drawTriggerIndicator(g);
        overlays.draw(g);
    	
    	g.restore();
    	
    	drawCursor(g);
    	
    	if (plots.get(0).ptr > 5 && !manualScale) {
    	    for (i = 0; i != UNITS_COUNT; i++)
    		if (scale[i] > 1e-4 && reduceRange[i])
    		    scale[i] /= 2;
    	}
    	
    	if ( (properties != null ) && properties.isShowing() )
    	    properties.refreshDraw();

    }

    
    // calculate maximum and minimum values for all plots of given units
    void calcMaxAndMin(int units) {
	maxValue = -1e8;
	minValue = 1e8;
	for (ScopePlot plot : visiblePlots) {
	    if (plot.units != units)
		continue;
	    ScopeDataIterator sdi = new ScopeDataIterator(this, plot);
	    for (int i : sdi) {
		if (sdi.getMax() > maxValue)
		    maxValue = sdi.getMax();
		if (sdi.getMin() < minValue)
		    minValue = sdi.getMin();
	    }
	}
    }
    
    // adjust scale of a plot
    void calcPlotScale(ScopePlot plot) {
	if (manualScale)
	    return;
	double max = 0;
	double gridMax = scale[plot.units];
	ScopeDataIterator sdi = new ScopeDataIterator(this, plot);
	for (int i : sdi) {
	    if (sdi.getMax() > max)
		max = sdi.getMax();
	    if (sdi.getMin() < -max)
		max = -sdi.getMin();
	}
	// scale fixed at maximum?
	if (maxScale)
	    gridMax = Math.max(max, gridMax);
	else
	    // adjust in powers of two
	    while (max > gridMax)
		gridMax *= 2;
	scale[plot.units] = gridMax;
    }
    
    double calcGridStepX() {
	int multptr=0;
    	double gsx = 1e-15;

    	double ts = sim.maxTimeStep*speed;
    	while (gsx < ts*20) {
    	    gsx *=multa[(multptr++)%3];
    	}
    	return gsx;
    }


    double getGridMaxFromManScale(ScopePlot plot) {
	return ((double)(manDivisions)/2+0.05)*plot.manScale;
    }
    
    // Compute grid display parameters for a plot. Sets plot.plotOffset, plot.gridMult,
    // and this.gridStepY as side-effects; returns gridMid for use by callers.
    double calcGridParams(ScopePlot plot, boolean allPlotsSameUnits) {
	int maxy = (rect.height-1)/2;
	double gridMid, positionOffset, gridMax;
	if (!isManualScale()) {
	    gridMax = scale[plot.units];
	    gridMid = 0;
	    positionOffset = 0;
	    if (allPlotsSameUnits) {
		// if we don't have overlapping scopes of different units, we can move zero around.
		// Put it at the bottom if the scope is never negative.
		double mx = gridMax;
		double mn = 0;
		if (maxScale) {
		    // scale is maxed out, so fix boundaries of scope at maximum and minimum.
		    mx = maxValue;
		    mn = minValue;
		} else if (showNegative || minValue < (mx+mn)*.5 - (mx-mn)*.55) {
		    mn = -gridMax;
		    showNegative = true;
		}
		gridMid = (mx+mn)*.5;
		gridMax = (mx-mn)*.55;  // leave space at top and bottom
	    }
	    gridStepY = 1e-8;
	    int multptr = 0;
	    while (gridStepY < 20*gridMax/maxy)
		gridStepY *= multa[(multptr++)%3];
	} else {
	    gridMid = 0;
	    gridMax = getGridMaxFromManScale(plot);
	    positionOffset = gridMax*2.0*(double)(plot.manVPosition)/(double)(V_POSITION_STEPS);
	    gridStepY = plot.manScale;
	}
	plot.plotOffset = -gridMid + positionOffset;
	plot.gridMult = maxy / gridMax;
	return gridMid;
    }

    void drawHVGridLines(Graphics g, ScopePlot plot, double gridMid, boolean allPlotsSameUnits, boolean allSelected) {
	int maxy = (rect.height-1)/2;
	String minorDiv = "#404040";
	String majorDiv = "#A0A0A0";
	if (app.isPrintable()) {
	    minorDiv = "#D0D0D0";
	    majorDiv = "#808080";
	    curColor = "#A0A000";
	}
	if (allSelected)
	    majorDiv = CircuitElm.selectColor.getHexValue();
	boolean highlightCenter = !isManualScale();

	// horizontal gridlines; only show non-center lines if units are unambiguous
	boolean showHGridLines = (gridStepY != 0) && (isManualScale() || allPlotsSameUnits);
	for (int ll = -100; ll <= 100; ll++) {
	    if (ll != 0 && !showHGridLines)
		continue;
	    int yl = maxy-(int)((ll*gridStepY-gridMid)*plot.gridMult);
	    if (yl < 0 || yl >= rect.height-1)
		continue;
	    g.setColor(ll == 0 && highlightCenter ? majorDiv : minorDiv);
	    g.drawLine(0, yl, rect.width-1, yl);
	}

	// vertical (time) gridlines
	double ts = sim.maxTimeStep*speed;
	double tRight = isTriggered() ? trigger.time + ts*rect.width/2 : sim.t;
	double tstart = tRight - ts*rect.width;
	double tx = tRight - (tRight % gridStepX);
	for (int ll = 0; ; ll++) {
	    double tl = tx - gridStepX*ll;
	    int gx = (int)((tl-tstart)/ts);
	    if (gx < 0)
		break;
	    if (gx >= rect.width || tl < 0)
		continue;
	    g.setColor(((tl+gridStepX/4) % (gridStepX*10)) < gridStepX ? majorDiv : minorDiv);
	    g.drawLine(gx, 0, gx, rect.height-1);
	}
    }

    void drawPlot(Graphics g, ScopePlot plot, boolean allPlotsSameUnits, boolean selected, boolean allSelected) {
	if (plot.elm == null)
	    return;
	final int maxy = (rect.height-1)/2;

	String color = (somethingSelected) ? "#A0A0A0" : plot.color;
	if (allSelected || (app.scopeManager.scopeSelected == -1 && getSingleElm() == null && plot.elm.isMouseElm()))
	    color = CircuitElm.selectColor.getHexValue();
	else if (selected)
	    color = plot.color;

	int ipa = displayStartIndex(plot, rect.width);
	double maxV[] = plot.maxValues;
	double minV[] = plot.minValues;

	double gridMid = calcGridParams(plot, allPlotsSameUnits);
	int minRangeLo = -10-(int)(gridMid*plot.gridMult);
	int minRangeHi =  10-(int)(gridMid*plot.gridMult);

	gridStepX = calcGridStepX();
	if (drawGridLines)
	    drawHVGridLines(g, plot, gridMid, allPlotsSameUnits, allSelected);
	drawGridLines = false;

	g.setColor(color);
	if (isManualScale()) {
	    int y0 = maxy-(int)(plot.gridMult*plot.plotOffset);
	    g.drawLine(0, y0, 8, y0);
	    g.drawString("0", 0, y0-2);
	}

	// In triggered mode, only draw up to the current write pointer.
	// Data beyond that is stale (old circular buffer contents).
	int drawWidth = validDataCount(plot, ipa, rect.width);
	int ox = -1, oy = -1;
	int i;
	for (i = 0; i != drawWidth; i++) {
	    int ip = (i+ipa) & (scopePointCount-1);
	    int minvy = (int)Math.round(plot.gridMult*(minV[ip]+plot.plotOffset));
	    int maxvy = (int)Math.round(plot.gridMult*(maxV[ip]+plot.plotOffset));
	    if (minvy <= maxy) {
		if (minvy < minRangeLo || maxvy > minRangeHi) {
		    // value outside min range; no need to rescale later
		    reduceRange[plot.units] = false;
		    minRangeLo = -1000;
		    minRangeHi = 1000;
		}
		if (ox != -1) {
		    if (minvy == oy && maxvy == oy)
			continue;
		    g.drawLine(ox, maxy-oy, i, maxy-oy);
		    ox = oy = -1;
		}
		if (minvy == maxvy) {
		    ox = i;
		    oy = minvy;
		    continue;
		}
		g.drawLine(i, maxy-minvy, i, maxy-maxvy);
	    }
	}
	if (ox != -1)
	    g.drawLine(ox, maxy-oy, i-1, maxy-oy);
    }

    static void clearCursorInfo() {
	cursorScope = null;
	cursorTime = -1;
    }
    
    double mouseXToTime(int mouseX) {
	if (isTriggered())
	    return trigger.time + sim.maxTimeStep*speed*(mouseX - rect.x - rect.width/2);
	else
	    return sim.t - sim.maxTimeStep*speed*(rect.x+rect.width-mouseX);
    }

    void selectScope(int mouseX, int mouseY) {
	if (!rect.contains(mouseX, mouseY))
	    return;
	if (plot2d.enabled || visiblePlots.size() == 0)
	    cursorTime = -1;
	else
	    cursorTime = mouseXToTime(mouseX);
    	checkForSelection(mouseX, mouseY);
    	cursorScope = this;
    }

    void mousePressed(int mouseX, int mouseY) {
	if (!rect.contains(mouseX, mouseY))
	    return;
	if (plot2d.enabled || fftPlot.enabled || visiblePlots.size() == 0)
	    return;
	dragStartTime = mouseXToTime(mouseX);
    }
    
    // find selected plot
    void checkForSelection(int mouseX, int mouseY) {
	if (app.dialogIsShowing())
	    return;
	if (!rect.contains(mouseX, mouseY)) {
	    selectedPlot = -1;
	    return;
	}
	if (plots.size() == 0) {
	    selectedPlot = -1;
	    return;
	}
	int ipa = displayStartIndex(plots.get(0), rect.width);
	int ip = (mouseX-rect.x+ipa) & (scopePointCount-1);
    	int maxy = (rect.height-1)/2;
    	int y = maxy;
    	int i;
    	int bestdist = 10000;
    	int best = -1;
    	for (i = 0; i != visiblePlots.size(); i++) {
    	    ScopePlot plot = visiblePlots.get(i);
    	    int maxvy = (int) (plot.gridMult*(plot.maxValues[ip]+plot.plotOffset));
    	    int dist = Math.abs(mouseY-(rect.y+y-maxvy));
    	    if (dist < bestdist) {
    		bestdist = dist;
    		best = i;
    	    }
    	}
    	selectedPlot = best;
    	if (selectedPlot >= 0)
    	    cursorUnits = visiblePlots.get(selectedPlot).units;
    }
    
    int timeToX(double t) {
	if (isTriggered())
	    return (int)(rect.x + rect.width/2 + (t - trigger.time) / (sim.maxTimeStep*speed));
	else
	    return -(int) ((sim.t-t)/(sim.maxTimeStep*speed) - rect.x - rect.width);
    }

    // draw a dot on the selected plot at pixel x; return the plot value there, or NaN if out of range
    double drawPlotDot(Graphics g, ScopePlot plot, int x) {
	if (x < rect.x || x >= rect.x+rect.width)
	    return Double.NaN;
	int ipa = displayStartIndex(plots.get(0), rect.width);
	int ip = (x-rect.x+ipa) & (scopePointCount-1);
	double value = plot.maxValues[ip];
	int vy = (int) (plot.gridMult*(value+plot.plotOffset));
	int dotY = rect.y+(rect.height-1)/2-vy;
	g.setColor(plot.color);
	if (dotY >= rect.y && dotY < rect.y+rect.height)
	    g.fillOval(x-2, dotY-2, 5, 5);
	return value;
    }

    void drawCursor(Graphics g) {
	if (app.dialogIsShowing())
	    return;
	if (cursorScope == null)
	    return;
	String info[] = new String[7];
	int cursorX = -1;
	int ct = 0;
	double cursorValue = Double.NaN;
	ScopePlot plot = visiblePlots.size() > 0 ? visiblePlots.get(selectedPlot >= 0 ? selectedPlot : 0) : null;
	if (cursorTime >= 0) {
	    cursorX = timeToX(cursorTime);
	    if (plot != null) {
		cursorValue = drawPlotDot(g, plot, cursorX);
		if (dragStartTime < 0 && !Double.isNaN(cursorValue))
		    info[ct++] = plot.getUnitText(cursorValue);
	    }
	}

	// show FFT even if there's no plots (in which case cursorTime/cursorX will be invalid)
        if (fftPlot.enabled && cursorScope == this) {
            if (cursorX < 0)
        	cursorX = app.mouse.mouseCursorX;
            ct = fftPlot.addCursorInfo(info, ct, app.mouse.mouseCursorX);
        } else if (cursorX < rect.x)
            return;

	// draw drag-start cursor and delta readout
	if (dragStartTime >= 0 && cursorScope == this && plot != null && !plot2d.enabled && !fftPlot.enabled) {
	    int dragX = timeToX(dragStartTime);
	    if (dragX >= rect.x && dragX < rect.x+rect.width) {
		g.setColor(CircuitElm.lightGrayColor);
		g.drawLine(dragX, rect.y, dragX, rect.y+rect.height);
		double startValue = drawPlotDot(g, plot, dragX);
		double deltaT = cursorTime - dragStartTime;
		info[ct++] = "Δt=" + CircuitElm.getTimeText(Math.abs(deltaT));
		if (!Double.isNaN(cursorValue) && !Double.isNaN(startValue)) {
		    info[ct++] = "Δ=" + plot.getUnitText(cursorValue - startValue);
		    info[ct++] = plot.getUnitText(cursorValue);
		}
	    }
	}

	if (visiblePlots.size() > 0)
	    info[ct++] = CircuitElm.getTimeText(cursorTime);

	if (cursorScope != this) {
	    // don't show cursor info if not enough room, or stacked with selected one
	    // (position == -1 for embedded scopes)
	    if (rect.height < 40 || (position >= 0 && cursorScope.position == position)) {
		drawCursorInfo(g, null, 0, cursorX, false);
		return;
	    }
	}
	drawCursorInfo(g, info, ct, cursorX, false);
    }
    
    void drawCursorInfo(Graphics g, String[] info, int ct, int x, Boolean drawY) {
	int szw = 0, szh = 15*ct;
	int i;
	for (i = 0; i != ct; i++) {
	    int w=(int)g.context.measureText(info[i]).getWidth();
	    if (w > szw)
		szw = w;
	}

	g.setColor(CircuitElm.whiteColor);
	g.drawLine(x, rect.y, x, rect.y+rect.height);
	if (drawY)
	    g.drawLine(rect.x, app.mouse.mouseCursorY, rect.x+rect.width, app.mouse.mouseCursorY);
	g.setColor(app.isPrintable() ? Color.white : Color.black);
	int bx = x;
	if (bx < szw/2)
	    bx = szw/2;
	g.fillRect(bx-szw/2, rect.y-szh, szw, szh);
	g.setColor(CircuitElm.whiteColor);
	for (i = 0; i != ct; i++) {
	    int w=(int)g.context.measureText(info[i]).getWidth();
	    g.drawString(info[i], bx-w/2, rect.y-2-(ct-1-i)*15);
	}
	
    }

    boolean canShowRMS() {
	if (visiblePlots.size() == 0)
	    return false;
	ScopePlot plot = visiblePlots.firstElement();
	return (plot.units == Scope.UNITS_V || plot.units == Scope.UNITS_A);
    }
    
    void drawInfoText(Graphics g, String text) {
	overlays.drawInfoText(g, text);
    }

    String getScopeText() {
	// stacked scopes?  don't show text
	if (stackCount != 1)
	    return null;
	
	// multiple elms?  don't show text (unless one is selected)
	if (selectedPlot < 0 && getSingleElm() == null)
	    return null;
	
	// no visible plots?
	if (visiblePlots.size() == 0)
	    return null;
	
	ScopePlot plot = visiblePlots.firstElement();
	if (selectedPlot >= 0 && visiblePlots.size() > selectedPlot)
	    plot = visiblePlots.get(selectedPlot);
	if (plot.elm == null)
		return "";
	else
	    	return plot.elm.getScopeText(plot.value);
    }

    String getScopeLabelOrText() {
	return getScopeLabelOrText(false);
    }

    String getScopeLabelOrText(boolean forInfo) {
    	String t = text;
    	if (t == null) {
    	    // if we're drawing the info and showElmInfo is true, return null so we don't print redundant info.
    	    // But don't do that if we're getting the scope label to generate "Add to Existing Scope" menu.
    	    if (forInfo && showElmInfo)
    		return null;
    	    t = getScopeText();
    	    if (t==null)
    		return "";
    	    return Locale.LS(t);
    	}
    	else
    	    return t;
    }
    
    void setSpeed(int sp) {
	if (sp < 1)
	    sp = 1;
	if (sp > 1024)
	    sp = 1024;
	speed = sp;
	resetGraph();
    }
    
    void properties() {
	properties = new ScopePropertiesDialog(app, this);
	CirSim.dialogShowing = properties;
    }

    void exportCSV() {
	if (visiblePlots.size() == 0)
	    return;
	StringBuilder sb = new StringBuilder();
	sb.append("time");
	int i;
	for (i = 0; i != visiblePlots.size(); i++) {
	    ScopePlot plot = visiblePlots.get(i);
	    String name = plot.elm.getClass().getSimpleName().replace("Elm", "");
	    String unit = getScaleUnitsText(plot.units);
	    sb.append(",\"" + name + " " + unit + " min\"");
	    sb.append(",\"" + name + " " + unit + " max\"");
	}
	sb.append("\n");
	// all visible plots share the same scopePointCount and speed
	ScopePlot plot0 = visiblePlots.get(0);
	int w = rect.width;
	double ts = sim.maxTimeStep * speed;
	double tStart = sim.t - ts * w;
	int ipa = plot0.startIndex(w);
	for (i = 0; i != w; i++) {
	    double t = tStart + ts * i;
	    if (t < 0)
		continue;
	    sb.append(t);
	    int j;
	    for (j = 0; j != visiblePlots.size(); j++) {
		ScopePlot plot = visiblePlots.get(j);
		int ip = (i + plot.startIndex(w)) & (plot.scopePointCount - 1);
		sb.append("," + plot.minValues[ip]);
		sb.append("," + plot.maxValues[ip]);
	    }
	    sb.append("\n");
	}
	downloadCSV(sb.toString(), "scope-data.csv");
    }

    static native void downloadCSV(String data, String filename) /*-{
	var blob = new Blob([data], {type: 'text/csv'});
	var url = URL.createObjectURL(blob);
	var a = $doc.createElement('a');
	a.href = url;
	a.download = filename;
	$doc.body.appendChild(a);
	a.click();
	$doc.body.removeChild(a);
	URL.revokeObjectURL(url);
    }-*/;

    void speedUp() {
	if (speed > 1) {
	    speed /= 2;
	    resetGraph();
	}
    }

    void slowDown() {
	if (speed < 1024)
	    speed *= 2;
    	resetGraph();
    }
    
    void setPlotPosition(int plot, int v) {
	visiblePlots.get(plot).manVPosition = v;
    }
	
    // get scope element, returning null if there's more than one
    CircuitElm getSingleElm() {
	CircuitElm elm = plots.get(0).elm;
	int i;
	for (i = 1; i < plots.size(); i++) {
	    if (plots.get(i).elm != elm)
		return null;
	}
	return elm;
    }
    
    boolean canMenu() {
    	return (plots.get(0).elm != null);
    }
    
    boolean canShowResistance() {
    	CircuitElm elm = getSingleElm();
    	return elm != null && elm.canShowValueInScope(VAL_R);
    }

    boolean isShowingVceAndIc() {
	return plot2d.enabled && plots.size() == 2 && plots.get(0).value == VAL_VCE && plots.get(1).value == VAL_IC;
    }

    void dumpXml(Document doc, Element root) { serializer.dumpXml(doc, root); }
    void undumpXml(XMLDeserializer xml) { serializer.undumpXml(xml); }
    void undump(StringTokenizer st) { serializer.undump(st); }
    void saveAsDefault() { serializer.saveAsDefault(); }
    
    void handleMenu(String mi, boolean state) {
	if (mi == "maxscale")
	    	maxScale();
    	if (mi == "showvoltage")
    		showVoltage(state);
    	if (mi == "showcurrent")
    		showCurrent(state);
    	if (mi=="showscale")
    		showScale(state);
    	if (mi == "showpeak")
    		showMax(state);
    	if (mi == "shownegpeak")
    		showMin(state);
    	if (mi == "showp2p")
    		showP2P(state);
    	if (mi == "showfreq")
    		showFreq(state);
    	if (mi == "showfft")
    		fftPlot.show(state);
    	if (mi == "logspectrum")
    	    	fftPlot.logSpectrum = state;
    	if (mi == "showrms")
    	    	showRMS = state;
    	if (mi == "showaverage")
	    	showAverage = state;
    	if (mi == "showduty")
    	    	showDutyCycle = state;
    	if (mi == "showphaseangle")
    	    	fftPlot.showPhaseAngle = state;
    	if (mi == "showelminfo")
	    	showElmInfo = state;
    	if (mi == "showpower")
    		showPower(state);
    	if (mi == "showib")
    		showPlotValue(VAL_IB, state);
    	if (mi == "showic")
    		showPlotValue(VAL_IC, state);
    	if (mi == "showie")
    		showPlotValue(VAL_IE, state);
    	if (mi == "showvbe")
    		showPlotValue(VAL_VBE, state);
    	if (mi == "showvbc")
    		showPlotValue(VAL_VBC, state);
    	if (mi == "showvce")
    		showPlotValue(VAL_VCE, state);
    	if (mi == "showvcevsic") {
    		plot2d.enabled = true;
    		plot2d.plotXY = false;
    		setValues(VAL_VCE, VAL_IC, getElm(), null);
    		resetGraph();
    	}

    	if (mi == "showvvsi") {
    		plot2d.enabled = state;
    		plot2d.plotXY = false;
    		resetGraph();
    	}
    	if (mi == "manualscale")
		setManualScale(state, true);
    	if (mi == "plotxy") {
    		plot2d.plotXY = plot2d.enabled = state;
    		if (plot2d.enabled) {
    		    plots = visiblePlots;
    		    plot2d.plotX = 0;
    		    plot2d.plotY = Math.min(1, plots.size() - 1);
    		    plot2d.plotBrightness = plot2d.plotColorR = plot2d.plotColorG = plot2d.plotColorB = -1;
    		}
    		if (plot2d.enabled && plots.size() == 1)
    		    selectY();
    		resetGraph();
    	}
    	if (mi == "showresistance")
    		showPlotValue(VAL_R, state);
    	if (mi == "showcharge")
    		showCharge(state);
    }

//    void select() {
//    	sim.setMouseElm(elm);
//    	if (plotXY) {
//    		sim.plotXElm = elm;
//    		sim.plotYElm = yElm;
//    	}
//    }

    void selectY() {
	CircuitElm yElm = (plots.size() == 2) ? plots.get(1).elm : null;
    	int e = (yElm == null) ? -1 : app.locateElm(yElm);
    	int firstE = e;
    	while (true) {
    	    for (e++; e < app.elmList.size(); e++) {
    		CircuitElm ce = app.getElm(e);
    		if ((ce instanceof OutputElm || ce instanceof ProbeElm) &&
    			ce != plots.get(0).elm) {
    		    yElm = ce;
    		    if (plots.size() == 1)
    			plots.add(new ScopePlot(yElm, UNITS_V));
    		    else {
    			plots.get(1).elm = yElm;
    			plots.get(1).units = UNITS_V;
    		    }
    		    return;
    		}
    	    }
    	    if (firstE == -1)
    		return;
    	    e = firstE = -1;
    	}
    	// not reached
    }
    
    void onMouseWheel(MouseWheelEvent e) {
        wheelDeltaY += e.getDeltaY()*app.mouse.wheelSensitivity;
        if (wheelDeltaY > 5) {
            slowDown();
            wheelDeltaY = 0;
        }
        if (wheelDeltaY < -5) {
            speedUp();
	    wheelDeltaY = 0;
    	}
    }
    
    CircuitElm getElm() {
	if (selectedPlot >= 0 && visiblePlots.size() > selectedPlot)
	    return visiblePlots.get(selectedPlot).elm;
	return visiblePlots.size() > 0 ? visiblePlots.get(0).elm : plots.get(0).elm;
    }

    boolean showingElm(CircuitElm e) {
	for (int i = 0; i != plots.size(); i++)
	    if (plots.get(i).elm == e)
		return true;
	return false;
    }

    boolean viewingWire() {
	int i;
	for (i = 0; i != plots.size(); i++)
	    if (plots.get(i).elm instanceof WireElm)
		return true;
	return false;
    }
    
    // Populate roles map with all elements involved in this scope's display.
    // In XY mode each element is labelled by its axis role; in normal mode all
    // visible plot elements get an empty label (highlighted but unlabelled).
    void addScopePlotRoles(java.util.HashMap<CircuitElm, String> roles) {
	if (plot2d.plotXY) {
	    addPlotRole(roles, plot2d.plotX,          "X");
	    addPlotRole(roles, plot2d.plotY,          "Y");
	    addPlotRole(roles, plot2d.plotBrightness, "Br");
	    addPlotRole(roles, plot2d.plotColorR,     "R");
	    addPlotRole(roles, plot2d.plotColorG,     "G");
	    addPlotRole(roles, plot2d.plotColorB,     "B");
	} else {
	    for (ScopePlot p : visiblePlots)
		if (p.elm != null)
		    addElmRole(roles, p.elm, "");
	}
    }

    private void addPlotRole(java.util.HashMap<CircuitElm, String> roles, int idx, String role) {
	if (idx < 0 || idx >= plots.size()) return;
	addElmRole(roles, plots.get(idx).elm, role);
    }

    private void addElmRole(java.util.HashMap<CircuitElm, String> roles, CircuitElm elm, String role) {
	if (elm == null) return;
	String existing = roles.get(elm);
	roles.put(elm, existing == null ? role : existing + "/" + role);
    }
    
    boolean needToRemove() {
	boolean ret = true;
	boolean removed = false;
	int i;
	for (i = 0; i != plots.size(); i++) {
	   ScopePlot plot = plots.get(i);
	   if (app.locateElm(plot.elm) < 0) {
	       plots.remove(i--);
	       removed = true;
	   } else
	       ret = false;
	}
	if (removed)
	    calcVisiblePlots();
	return ret;
    }

    public boolean isManualScale() {
	return manualScale;
    }
    
    public double getManScaleFromMaxScale(int units, boolean roundUp) {
	// When the user manually switches to manual scale (and we don't already have a setting) then
	// call with "roundUp=true" to get a "sensible" suggestion for the scale. When importing from
	// a legacy file then call with "roundUp=false" to stay as close as possible to the old presentation
	double s =scale[units];
	if ( units > UNITS_A)
	    s = 0.5*s;
	if (roundUp)
	    return ScopePropertiesDialog.nextHighestScale((2*s)/(double)(manDivisions));
	else 
	    return (2*s)/(double)(manDivisions);
    }
    
}
