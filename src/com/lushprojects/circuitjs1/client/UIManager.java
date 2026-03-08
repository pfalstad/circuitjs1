package com.lushprojects.circuitjs1.client;

import java.util.HashMap;
import java.util.Vector;
import java.lang.Math;

import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.canvas.dom.client.Context2d;
import com.google.gwt.canvas.dom.client.Context2d.LineCap;
import com.google.gwt.user.client.Command;
import com.google.gwt.user.client.DOM;
import com.google.gwt.user.client.Element;
import com.google.gwt.user.client.Event;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.Event.NativePreviewEvent;
import com.google.gwt.dom.client.NativeEvent;
import com.google.gwt.user.client.Window.ClosingEvent;
import com.google.gwt.core.client.GWT;
import com.google.gwt.core.client.Scheduler;
import com.google.gwt.dom.client.Document;
import com.google.gwt.dom.client.Style.Unit;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.logical.shared.ResizeEvent;
import com.google.gwt.event.logical.shared.ResizeHandler;
import com.google.gwt.http.client.URL;
import com.google.gwt.storage.client.Storage;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.CellPanel;
import com.google.gwt.user.client.ui.DockLayoutPanel;
import com.google.gwt.user.client.ui.Frame;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.user.client.ui.MenuBar;
import com.google.gwt.user.client.ui.PopupPanel;
import com.google.gwt.user.client.ui.RootLayoutPanel;
import com.google.gwt.user.client.ui.RootPanel;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.google.gwt.user.client.ui.Widget;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.lushprojects.circuitjs1.client.util.PerfMonitor;
import static com.google.gwt.event.dom.client.KeyCodes.*;

public class UIManager {

    static UIManager theUI;

    CirSim app;
    Menus menus;
    ScopeManager scopeManager;

    Button resetButton;
    Button runStopButton;
    Button dumpMatrixButton;
    Label powerLabel;
    Label titleLabel;
    Scrollbar speedBar;
    Scrollbar currentBar;
    Scrollbar powerBar;
    PopupPanel contextPanel = null;
    MouseManager mouse;

    String mouseModeStr = "Select";

    // timing/frame fields
    long lastTime = 0, lastFrameTime, secTime = 0;
    int frames = 0;
    int steps = 0;
    int framerate = 0, steprate = 0;
    boolean needsRepaint;
    boolean hideInfoBox;
    boolean hideMenu;
    String lastCursorStyle;

    Toolbar toolbar;
    SubcircuitBar subcircuitBar;

    DockLayoutPanel layoutPanel;
    VerticalPanel verticalPanel;
    CellPanel buttonPanel;
    Vector<CheckboxMenuItem> mainMenuItems = new Vector<CheckboxMenuItem>();
    Vector<String> mainMenuItemNames = new Vector<String>();
    Element sidePanelCheckboxLabel;

    LoadFile loadFileInput;
    Frame iFrame;
    Vector<CircuitElm> elmList;

    // stack of enclosing subcircuits when viewing composite internals
    Vector<CustomCompositeElm> subcircuitStack = new Vector<CustomCompositeElm>();
    
    Canvas cv;
    Context2d cvcontext;

    // canvas width/height in px (before device pixel ratio scaling)
    int canvasWidth, canvasHeight;

    static final int MENUBARHEIGHT = 30;
    static final int TOOLBARHEIGHT = 40;
    static int VERTICALPANELWIDTH = 166; // default

    UIManager(CirSim app) {
	this.app = app;
	theUI = this;
    }

    void init() {
	boolean printable = false;
	boolean convention = true;
	boolean euroRes = false;
	boolean usRes = false;
	boolean running = true;
	boolean hideSidebar = false;
	boolean noEditing = false;
	boolean mouseWheelEdit = false;
	
	hideMenu = false;

	QueryParameters qp = new QueryParameters();
	String positiveColor = null;
	String negativeColor = null;
	String neutralColor = null;
	String selectColor = null;
	String currentColor = null;
	String mouseModeReq = null;
	boolean euroGates = false;

	elmList = app.elmList;

	try {
	    euroRes = qp.getBooleanValue("euroResistors", false);
	    euroGates = qp.getBooleanValue("IECGates", getOptionFromStorage("euroGates", Locale.weAreInGermany()));
	    usRes = qp.getBooleanValue("usResistors",  false);
	    running = qp.getBooleanValue("running", true);
	    hideSidebar = qp.getBooleanValue("hideSidebar", false);
	    hideMenu = qp.getBooleanValue("hideMenu", false);
	    printable = qp.getBooleanValue("whiteBackground", getOptionFromStorage("whiteBackground", false));
	    convention = qp.getBooleanValue("conventionalCurrent",
		       getOptionFromStorage("conventionalCurrent", true));
	    noEditing = !qp.getBooleanValue("editable", true);
	    mouseWheelEdit = qp.getBooleanValue("mouseWheelEdit", getOptionFromStorage("mouseWheelEdit", true));
	    positiveColor = qp.getValue("positiveColor");
	    negativeColor = qp.getValue("negativeColor");
	    neutralColor = qp.getValue("neutralColor");
	    selectColor = qp.getValue("selectColor");
	    currentColor = qp.getValue("currentColor");
	    mouseModeReq = qp.getValue("mouseMode");
	    hideInfoBox = qp.getBooleanValue("hideInfoBox", false);
	} catch (Exception e) { 
	    app.console("Exception: " + e);
	}

	boolean euroSetting = false;
	if (euroRes)
	    euroSetting = true;
	else if (usRes)
	    euroSetting = false;
	else
	    euroSetting = getOptionFromStorage("euroResistors", !Locale.weAreInUS(true));

	layoutPanel = new DockLayoutPanel(Unit.PX);

	app.menus = menus = new Menus(app);
	menus.init();
    	app.dumpTypeMap.put(403, "ScopeElm");
    	app.xmlDumpTypeMap.put("Scope", "ScopeElm");

	menus.recoverItem.setEnabled(app.recovery != null);

	int width=(int)RootLayoutPanel.get().getOffsetWidth();
	VERTICALPANELWIDTH = width/5;
	if (VERTICALPANELWIDTH > 166)
	    VERTICALPANELWIDTH = 166;
	if (VERTICALPANELWIDTH < 128)
	    VERTICALPANELWIDTH = 128;

	verticalPanel=new VerticalPanel();

	verticalPanel.getElement().addClassName("verticalPanel");
	verticalPanel.getElement().setId("painel");
	Element sidePanelCheckbox = DOM.createInputCheck();
	sidePanelCheckboxLabel = DOM.createLabel();
	sidePanelCheckboxLabel.addClassName("triggerLabel");
	sidePanelCheckbox.setId("trigger");
	sidePanelCheckboxLabel.setAttribute("for", "trigger" );
	sidePanelCheckbox.addClassName("trigger");
	Element topPanelCheckbox = DOM.createInputCheck(); 
	Element topPanelCheckboxLabel = DOM.createLabel();
	topPanelCheckbox.setId("toptrigger");
	topPanelCheckbox.addClassName("toptrigger");
	topPanelCheckboxLabel.addClassName("toptriggerlabel");
	topPanelCheckboxLabel.setAttribute("for", "toptrigger");

	// make buttons side by side if there's room
	buttonPanel=(VERTICALPANELWIDTH == 166) ? new HorizontalPanel() : new VerticalPanel();

	menus.pasteItem.setEnabled(false);

	menus.dotsCheckItem.setState(true);
	menus.voltsCheckItem.setState(true);
	menus.showValuesCheckItem.setState(true);
	menus.toolbarCheckItem.setState(!hideMenu && !noEditing && !hideSidebar &&
		app.startCircuit == null && app.startCircuitText == null && app.startCircuitLink == null);
	menus.crossHairCheckItem.setState(getOptionFromStorage("crossHair", false));
	menus.euroResistorCheckItem.setState(euroSetting);
	menus.euroResistorCheckItem.setCommand(
		new Command() { public void execute(){
		    setOptionInStorage("euroResistors", menus.euroResistorCheckItem.getState());
		    toolbar.setEuroResistors(menus.euroResistorCheckItem.getState());
		}
	});
	menus.euroGatesCheckItem.setCommand(
		new Command() { public void execute(){
		    setOptionInStorage("euroGates", menus.euroGatesCheckItem.getState());
		    for (CircuitElm ce : elmList)
			ce.setPoints();
		}
	});
	menus.euroGatesCheckItem.setState(euroGates);
	menus.printableCheckItem.setCommand(
		new Command() { public void execute(){
		    int i;
		    for (i=0;i<scopeManager.scopeCount;i++)
			scopeManager.scopes[i].setRect(scopeManager.scopes[i].rect);
		    setOptionInStorage("whiteBackground", menus.printableCheckItem.getState());
		}
	});
	menus.printableCheckItem.setState(printable);

	menus.conventionCheckItem.setCommand(
		new Command() { public void execute(){
		    setOptionInStorage("conventionalCurrent", menus.conventionCheckItem.getState());
		    String cc = CircuitElm.currentColor.getHexValue();
		    // change the current color if it hasn't changed from the default
		    if (cc.equals("#ffff00") || cc.equals("#00ffff"))
			CircuitElm.currentColor = menus.conventionCheckItem.getState() ? Color.yellow : Color.cyan;
		}
	});
	menus.conventionCheckItem.setState(convention);
	menus.noEditCheckItem.setState(noEditing);
	menus.mouseWheelEditCheckItem.setState(mouseWheelEdit);

	loadShortcuts();

	DOM.appendChild(layoutPanel.getElement(), topPanelCheckbox);
	DOM.appendChild(layoutPanel.getElement(), topPanelCheckboxLabel);	

	toolbar = new Toolbar();
	toolbar.setEuroResistors(euroSetting);
	MenuBar menuBar = menus.menuBar;
	if (!hideMenu)
	    layoutPanel.addNorth(menuBar, MENUBARHEIGHT);

	if (hideSidebar)
	    VERTICALPANELWIDTH = 0;
	else {
		DOM.appendChild(layoutPanel.getElement(), sidePanelCheckbox);
		DOM.appendChild(layoutPanel.getElement(), sidePanelCheckboxLabel);
	    layoutPanel.addEast(verticalPanel, VERTICALPANELWIDTH);
	}
	layoutPanel.addNorth(toolbar, TOOLBARHEIGHT);
	menuBar.getElement().insertFirst(menuBar.getElement().getChild(1));
	menuBar.getElement().getFirstChildElement().setAttribute("onclick", "document.getElementsByClassName('toptrigger')[0].checked = false");
	RootLayoutPanel.get().add(layoutPanel);

	cv =Canvas.createIfSupported();
	if (cv==null) {
	    RootPanel.get().add(new Label("Not working. You need a browser that supports the CANVAS element."));
	    return;
	}

	Window.addResizeHandler(new ResizeHandler() {
	    public void onResize(ResizeEvent event) {
		centerCircuit();
		repaint();
	    }
	});

	cvcontext=cv.getContext2d();
	app.scopeManager = scopeManager = new ScopeManager(app);

	subcircuitBar = new SubcircuitBar();
	RootPanel.get().add(subcircuitBar);

	setToolbar(); // calls setCanvasSize()
	layoutPanel.add(cv);
	verticalPanel.add(buttonPanel);
	buttonPanel.add(resetButton = new Button(Locale.LS("Reset")));
	resetButton.addClickHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) {
		resetAction();
	    }
	});
	resetButton.setStylePrimaryName("topButton");
	buttonPanel.add(runStopButton = new Button(Locale.LSHTML("<Strong>RUN</Strong>&nbsp;/&nbsp;Stop")));
	runStopButton.addClickHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) {
		setSimRunning(!simIsRunning());
	    }
	});

	
/*
	dumpMatrixButton = new Button("Dump Matrix");
	dumpMatrixButton.addClickHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) { dumpMatrix = true; }});
	verticalPanel.add(dumpMatrixButton);// IES for debugging
*/
	

	if (LoadFile.isSupported())
	    verticalPanel.add(loadFileInput = new LoadFile(app));

	Label l;
	verticalPanel.add(l = new Label(Locale.LS("Simulation Speed")));
	l.addStyleName("topSpace");

	// was max of 140
	verticalPanel.add( speedBar = new Scrollbar(Scrollbar.HORIZONTAL, 3, 1, 0, 260));

	verticalPanel.add( l = new Label(Locale.LS("Current Speed")));
	l.addStyleName("topSpace");
	currentBar = new Scrollbar(Scrollbar.HORIZONTAL, 50, 1, 1, 100);
	verticalPanel.add(currentBar);
	verticalPanel.add(powerLabel = new Label (Locale.LS("Power Brightness")));
	powerLabel.addStyleName("topSpace");
	verticalPanel.add(powerBar = new Scrollbar(Scrollbar.HORIZONTAL,
		50, 1, 1, 100));
	setPowerBarEnable();

	//	verticalPanel.add(new Label(""));
	//        Font f = new Font("SansSerif", 0, 10);
	l = new Label(Locale.LS("Current Circuit:"));
	l.addStyleName("topSpace");
	//        l.setFont(f);
	titleLabel = new Label("Label");
	//        titleLabel.setFont(f);
	verticalPanel.add(l);
	verticalPanel.add(titleLabel);

	verticalPanel.add(iFrame = new Frame("iframe.html"));
	iFrame.setWidth(VERTICALPANELWIDTH+"px");
	iFrame.setHeight("100 px");
	iFrame.getElement().setAttribute("scrolling", "no");

	setGrid();
	
	app.mouse = mouse = new MouseManager(app, this);
	mouse.register(cv);
	mouse.enableDisableMenuItems();
	setiFrameHeight();
	menuBar.addDomHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) {
		mouse.doMainMenuChecks();
	    }
	}, ClickEvent.getType());
	Event.addNativePreviewHandler(app);

	Window.addWindowClosingHandler(new Window.ClosingHandler() {
	    public void onWindowClosing(ClosingEvent event) {
		// there is a bug in electron that makes it impossible to close the app if this warning is given
		if (app.unsavedChanges && !app.isElectron())
		    event.setMessage(Locale.LS("Are you sure?  There are unsaved changes."));
	    }
	});

    }
    
    static native float devicePixelRatio() /*-{
	return window.devicePixelRatio;
	}-*/;


    // ---- Canvas/Layout ----

    void checkCanvasSize() {
        if (cv.getCoordinateSpaceWidth() != (int) (canvasWidth * devicePixelRatio()))
            setCanvasSize();
    }

    public void setCanvasSize(){
    	int width, height;
    	width=(int)RootLayoutPanel.get().getOffsetWidth();
    	height=(int)RootLayoutPanel.get().getOffsetHeight();
    	height=height- (hideMenu ? 0 : MENUBARHEIGHT);

    	if (!app.isMobile(sidePanelCheckboxLabel))
    	    width=width - VERTICALPANELWIDTH;
	if (menus.toolbarCheckItem.getState())
	    height -= TOOLBARHEIGHT;

    	width = Math.max(width, 0);
    	height = Math.max(height, 0);

	if (cv != null) {
	    cv.setWidth(width + "PX");
	    cv.setHeight(height + "PX");
	    canvasWidth = width;
	    canvasHeight = height;
	    float scale = devicePixelRatio();
	    cv.setCoordinateSpaceWidth((int)(width*scale));
	    cv.setCoordinateSpaceHeight((int)(height*scale));
	}

    	setCircuitArea();

	if (subcircuitBar != null) {
	    int barTop = (hideMenu ? 0 : MENUBARHEIGHT);
	    if (menus.toolbarCheckItem.getState())
		barTop += TOOLBARHEIGHT;
	    subcircuitBar.updatePosition(0, barTop, width);
	}

	if (app.transform[0] == 0)
	    centerCircuit();
    }

    void setCircuitArea() {
    	int height = canvasHeight;
    	int width = canvasWidth;
	int h;
    	if (app.scopeManager == null || app.scopeManager.scopeCount == 0)
    	    h = 0;
	else
    	    h = (int) ((double)height * app.scopeManager.scopeHeightFraction);
    	app.circuitArea = new Rectangle(0, 0, width, height-h);
    }

    void centerCircuit() {
	if (elmList == null)
	    return;

	Rectangle bounds = getCircuitBounds();
    	setCircuitArea();

    	double scale = 1;
    	int cheight = app.circuitArea.height;

    	if (app.scopeManager.scopeCount == 0 && app.circuitArea.width < 800) {
    	    int h = (int) ((double)cheight * app.scopeManager.scopeHeightFraction);
    	    cheight -= h;
    	}

    	if (bounds != null)
    	    scale = Math.min(app.circuitArea.width /(double)(bounds.width+140),
    			     cheight/(double)(bounds.height+100));
    	scale = Math.min(scale, 1.5);

    	app.transform[0] = app.transform[3] = scale;
    	app.transform[1] = app.transform[2] = app.transform[4] = app.transform[5] = 0;
    	if (bounds != null) {
    	    app.transform[4] = (app.circuitArea.width -bounds.width *scale)/2 - bounds.x*scale;
    	    app.transform[5] = (cheight-bounds.height*scale)/2 - bounds.y*scale;
    	}
    }

    Rectangle getCircuitBounds() {
    	int minx = 30000, maxx = -30000, miny = 30000, maxy = -30000;
    	for (CircuitElm ce : elmList) {
    		if (!ce.isCenteredText()) {
    			minx = min(ce.x, min(ce.x2, minx));
    			maxx = max(ce.x, max(ce.x2, maxx));
    		}
    		miny = min(ce.y, min(ce.y2, miny));
    		maxy = max(ce.y, max(ce.y2, maxy));
    		// use boundingBox for elements like chips/subcircuits whose
    		// visual extent exceeds their x/y coordinates
    		Rectangle bb = ce.getBoundingBox();
    		if (bb != null) {
    		    if (!ce.isCenteredText()) {
    			minx = min(bb.x, minx);
    			maxx = max(bb.x + bb.width, maxx);
    		    }
    		    miny = min(bb.y, miny);
    		    maxy = max(bb.y + bb.height, maxy);
    		}
    	}
    	if (minx > maxx)
    	    return null;
    	return new Rectangle(minx, miny, maxx-minx, maxy-miny);
    }

    // ---- Repaint ----

    void repaint() {
	if (!needsRepaint) {
	    needsRepaint = true;
	    Scheduler.get().scheduleFixedDelay(new Scheduler.RepeatingCommand() {
		public boolean execute() {
		      updateCircuit();
		      needsRepaint = false;
		      return false;
		  }
	    }, app.FASTTIMER);
	}
    }

    // ---- Sim Running ----

    public void setSimRunning(boolean s) {
    	if (s) {
    	    	if (app.stopMessage != null)
    	    	    return;
    		app.simRunning = true;
    		runStopButton.setHTML(Locale.LSHTML("<strong>RUN</strong>&nbsp;/&nbsp;Stop"));
    		runStopButton.setStylePrimaryName("topButton");
    		app.timer.scheduleRepeating(app.FASTTIMER);
    	} else {
    		app.simRunning = false;
    		runStopButton.setHTML(Locale.LSHTML("Run&nbsp;/&nbsp;<strong>STOP</strong>"));
    		runStopButton.setStylePrimaryName("topButton-red");
    		app.timer.cancel();
		repaint();
    	}
    }

    public boolean simIsRunning() {
    	return app.simRunning;
    }

    // ---- Drawing/Display ----

    public void updateCircuit() {
        PerfMonitor perfmon = new PerfMonitor();
        perfmon.startContext("updateCircuit()");

        checkCanvasSize();

        boolean didAnalyze = app.analyzeFlag;
        if (app.analyzeFlag || app.dcAnalysisFlag) {
            perfmon.startContext("analyzeCircuit()");
            app.sim.analyzeCircuit();
            app.analyzeFlag = false;
            perfmon.stopContext();
        }

        if (app.sim.needsStamp && app.simRunning) {
            perfmon.startContext("stampCircuit()");
            try {
                app.sim.preStampAndStampCircuit();
            } catch (Exception e) {
                app.sim.stop("Exception in stampCircuit()", null);
		GWT.log("Exception in stampCircuit", e);
            }
            perfmon.stopContext();
        }

        if (app.stopElm != null && app.stopElm != mouse.getMouseElm())
            app.stopElm.setMouseElm(true);

        app.scopeManager.setupScopes();

        Graphics g = new Graphics(cvcontext);

        if (menus.printableCheckItem.getState()) {
            CircuitElm.whiteColor = Color.black;
            CircuitElm.lightGrayColor = Color.black;
            g.setColor(Color.white);
            cv.getElement().getStyle().setBackgroundColor("#fff");
        } else {
            CircuitElm.whiteColor = Color.white;
            CircuitElm.lightGrayColor = Color.lightGray;
            g.setColor(Color.black);
            cv.getElement().getStyle().setBackgroundColor("#000");
        }

        g.fillRect(0, 0, canvasWidth, canvasHeight);

        if (app.simRunning) {
            if (app.sim.needsStamp)
                CirSim.console("needsStamp while simRunning?");

            perfmon.startContext("runCircuit()");
            try {
                app.sim.runCircuit(didAnalyze);
            } catch (Exception e) {
                CirSim.debugger();
                CirSim.console("exception in runCircuit " + e);
                e.printStackTrace();
            }
            perfmon.stopContext();
        }

        long sysTime = System.currentTimeMillis();
        if (app.simRunning) {
            if (lastTime != 0) {
                int inc = (int) (sysTime - lastTime);
                double c = currentBar.getValue();
                c = java.lang.Math.exp(c / 3.5 - 14.2);
                CircuitElm.currentMult = 1.7 * inc * c;
                if (!menus.conventionCheckItem.getState())
                    CircuitElm.currentMult = -CircuitElm.currentMult;
            }
            lastTime = sysTime;
        } else {
            lastTime = 0;
        }

        if (sysTime - secTime >= 1000) {
            framerate = frames;
            steprate = steps;
            frames = 0;
            steps = 0;
            secTime = sysTime;
        }

        CircuitElm.powerMult = Math.exp(powerBar.getValue() / 4.762 - 7);

        perfmon.startContext("graphics");

        g.setFont(CircuitElm.unitsFont);

        g.context.setLineCap(LineCap.ROUND);

        if (menus.noEditCheckItem.getState())
            g.drawLock(20, 30);

        g.setColor(Color.white);

        double scale = devicePixelRatio();
        cvcontext.setTransform(app.transform[0] * scale, 0, 0, app.transform[3] * scale, app.transform[4] * scale, app.transform[5] * scale);

        perfmon.startContext("elm.draw()");
        for (CircuitElm ce : elmList) {
            if (menus.powerCheckItem.getState())
                g.setColor(Color.gray);

            ce.draw(g);
        }
        perfmon.stopContext();

        if (mouse.mouseMode != MouseManager.MODE_DRAG_ROW && mouse.mouseMode != MouseManager.MODE_DRAG_COLUMN) {
            for (int i = 0; i != app.postDrawList.size(); i++)
                CircuitElm.drawPost(g, app.postDrawList.get(i));
        }

        if (mouse.tempMouseMode == MouseManager.MODE_DRAG_ROW ||
            mouse.tempMouseMode == MouseManager.MODE_DRAG_COLUMN ||
            mouse.tempMouseMode == MouseManager.MODE_DRAG_POST ||
            mouse.tempMouseMode == MouseManager.MODE_DRAG_SELECTED) {
            for (CircuitElm ce : elmList) {
                if (ce != mouse.getMouseElm() || mouse.tempMouseMode != MouseManager.MODE_DRAG_POST) {
                    g.setColor(Color.gray);
                    g.fillOval(ce.x - 3, ce.y - 3, 7, 7);
                    g.fillOval(ce.x2 - 3, ce.y2 - 3, 7, 7);
                } else {
                    ce.drawHandles(g, CircuitElm.selectColor);
                }
            }
        }

        if (mouse.tempMouseMode == MouseManager.MODE_SELECT && mouse.getMouseElm() != null) {
            mouse.getMouseElm().drawHandles(g, CircuitElm.selectColor);
            if (mouse.getMouseElm() instanceof RoutedWireElm && mouse.mouseCursorX >= 0) {
                RoutedWireElm rw = (RoutedWireElm) mouse.getMouseElm();
                int gx = mouse.inverseTransformX(mouse.mouseCursorX);
                int gy = mouse.inverseTransformY(mouse.mouseCursorY);
                Point sp = rw.getSnapPointOnWire(gx, gy);
                if (sp != null) {
                    g.setColor(CircuitElm.selectColor);
                    g.fillOval(sp.x - 4, sp.y - 4, 9, 9);
                }
            }
        }

        if (mouse.dragElm != null && (mouse.dragElm.x != mouse.dragElm.x2 || mouse.dragElm.y != mouse.dragElm.y2)) {
            mouse.dragElm.draw(g);
            mouse.dragElm.drawHandles(g, CircuitElm.selectColor);
        }

        for (int i = 0; i != app.badConnectionList.size(); i++) {
            Point cn = app.badConnectionList.get(i);
            g.setColor(Color.red);
            g.fillOval(cn.x - 3, cn.y - 3, 7, 7);
        }

        if (mouse.selectedArea != null) {
            g.setColor(CircuitElm.selectColor);
            g.drawRect(mouse.selectedArea.x, mouse.selectedArea.y, mouse.selectedArea.width, mouse.selectedArea.height);
        }

        if (menus.crossHairCheckItem.getState() && mouse.mouseCursorX >= 0
                && mouse.mouseCursorX <= app.circuitArea.width && mouse.mouseCursorY <= app.circuitArea.height) {
            g.setColor(Color.gray);
            int x = app.snapGrid(mouse.inverseTransformX(mouse.mouseCursorX));
            int y = app.snapGrid(mouse.inverseTransformY(mouse.mouseCursorY));
            g.drawLine(x, mouse.inverseTransformY(0), x, mouse.inverseTransformY(app.circuitArea.height));
            g.drawLine(mouse.inverseTransformX(0), y, mouse.inverseTransformX(app.circuitArea.width), y);
        }

	/*if (WireRouter.lastRouter != null)
	    WireRouter.lastRouter.drawGrid(g.context, true);*/

        cvcontext.setTransform(scale, 0, 0, scale, 0, 0);

        perfmon.startContext("drawBottomArea()");
        drawBottomArea(g);
        perfmon.stopContext();

        g.setColor(Color.white);

        perfmon.stopContext(); // graphics

        if (app.stopElm != null && app.stopElm != mouse.getMouseElm())
            app.stopElm.setMouseElm(false);

        frames++;

        if (app.dcAnalysisFlag) {
            app.dcAnalysisFlag = false;
            app.analyzeFlag = true;
        }

        lastFrameTime = lastTime;

        perfmon.stopContext(); // updateCircuit

        if (app.developerMode) {
            int height = 15;
            int increment = 15;
            g.drawString("Framerate: " + CircuitElm.showFormat.format(framerate), 10, height);
            g.drawString("Steprate: " + CircuitElm.showFormat.format(steprate), 10, height += increment);
            g.drawString("Steprate/iter: " + CircuitElm.showFormat.format(steprate / app.getIterCount()), 10, height += increment);
            g.drawString("iterc: " + CircuitElm.showFormat.format(app.getIterCount()), 10, height += increment);
            g.drawString("Frames: " + frames, 10, height += increment);

            height += (increment * 2);

            String perfmonResult = PerfMonitor.buildString(perfmon).toString();
            String[] splits = perfmonResult.split("\n");
            for (int x = 0; x < splits.length; x++) {
                g.drawString(splits[x], 10, height + (increment * x));
            }
        }

        app.jsInterface.callUpdateHook();
    }

    void drawBottomArea(Graphics g) {
	int leftX = 0;
	int h = 0;
	if (app.stopMessage == null && app.scopeManager.scopeCount == 0) {
	    leftX = max(canvasWidth-CirSim.infoWidth, 0);
	    int h0 = (int) (canvasHeight * app.scopeManager.scopeHeightFraction);
	    h = (mouse.getMouseElm() == null) ? 70 : h0;
	    if (hideInfoBox)
		h = 0;
	}
	if (app.stopMessage != null && app.circuitArea.height > canvasHeight-30)
	    h = 30;
	g.setColor(menus.printableCheckItem.getState() ? "#eee" : "#111");
	g.fillRect(leftX, app.circuitArea.height-h, app.circuitArea.width, canvasHeight - app.circuitArea.height+h);
	g.setFont(CircuitElm.unitsFont);
	int ct = app.scopeManager.scopeCount;
	if (app.stopMessage != null)
	    ct = 0;
	int i;
	Scope.clearCursorInfo();
	for (i = 0; i != ct; i++)
	    app.scopeManager.scopes[i].selectScope(mouse.mouseCursorX, mouse.mouseCursorY);
	if (app.scopeElmArr != null)
	    for (i=0; i != app.scopeElmArr.length; i++)
		app.scopeElmArr[i].selectScope(mouse.mouseCursorX, mouse.mouseCursorY);
	for (i = 0; i != ct; i++)
	    app.scopeManager.scopes[i].draw(g);
	if (mouse.mouseWasOverSplitter) {
		g.setColor(CircuitElm.selectColor);
		g.setLineWidth(4.0);
		g.drawLine(0, app.circuitArea.height-2, app.circuitArea.width, app.circuitArea.height-2);
		g.setLineWidth(1.0);
	}
	g.setColor(CircuitElm.whiteColor);

	if (app.stopMessage != null) {
	    g.drawString(app.stopMessage, 10, canvasHeight-10);
	} else if (!hideInfoBox) {
	    String info[] = new String[10];
	    if (mouse.getMouseElm() != null) {
		if (mouse.mousePost == -1) {
		    mouse.getMouseElm().getInfo(info);
		    info[0] = Locale.LS(info[0]);
		    if (info[1] != null)
			info[1] = Locale.LS(info[1]);
		} else
		    info[0] = "V = " +
			CircuitElm.getUnitText(mouse.getMouseElm().getPostVoltage(mouse.mousePost), "V");

	    } else {
	    	info[0] = "t = " + CircuitElm.getTimeText(app.sim.t);
	    	double timerate = 160*app.getIterCount()*app.sim.timeStep;
	    	if (timerate >= .1)
	    	    info[0] += " (" + CircuitElm.showFormat.format(timerate) + "x)";
	    	info[1] = Locale.LS("time step = ") + CircuitElm.getTimeText(app.sim.timeStep);
	    }
	    if (app.hintType != -1) {
		for (i = 0; info[i] != null; i++)
		    ;
		String s = app.getHint();
		if (s == null)
		    app.hintType = -1;
		else
		    info[i] = s;
	    }
	    int x = leftX + 5;
	    if (ct != 0)
		x = app.scopeManager.scopes[ct-1].rightEdge() + 20;

	    for (i = 0; info[i] != null; i++)
		;
	    int badnodes = app.badConnectionList.size();
	    if (badnodes > 0)
		info[i++] = badnodes + ((badnodes == 1) ?
					Locale.LS(" bad connection") : Locale.LS(" bad connections"));
	    if (app.savedFlag)
		info[i++] = "(saved)";

	    int ybase = app.circuitArea.height-h;
	    for (i = 0; info[i] != null; i++)
		g.drawString(info[i], x, ybase+15*(i+1));
	}
    }

    Color getBackgroundColor() {
	if (menus.printableCheckItem.getState())
	    return Color.white;
	return Color.black;
    }

    // ---- UI Controls ----

    void setPowerBarEnable() {
    	if (menus.powerCheckItem.getState()) {
    	    powerLabel.setStyleName("disabled", false);
    	    powerBar.enable();
    	} else {
    	    powerLabel.setStyleName("disabled", true);
    	    powerBar.disable();
    	}
    }

    boolean isReadOnly() {
	return menus.noEditCheckItem.getState() || !subcircuitStack.isEmpty();
    }

    void enableItems() {
    }

    void setToolbar() {
	layoutPanel.setWidgetHidden(toolbar, !menus.toolbarCheckItem.getState());
	setCanvasSize();
    }

    void updateToolbar() {
	if (mouse.dragElm != null)
	    toolbar.setModeLabel(Locale.LS("Drag Mouse"));
	else
	    toolbar.setModeLabel(Locale.LS("Mode: ") + app.classToLabelMap.get(mouseModeStr));
	toolbar.highlightButton(mouseModeStr);
    }

    void pushSubcircuit(CustomCompositeElm cce, Vector<CircuitElm> allElms) {
	subcircuitStack.add(cce);
	elmList = allElms;
	updateSubcircuitPath();
	app.sim.analyzeCircuit();
	centerCircuit();
    }

    void popSubcircuit() {
	if (subcircuitStack.isEmpty())
	    return;
	subcircuitStack.remove(subcircuitStack.size() - 1);
	if (subcircuitStack.isEmpty())
	    elmList = app.elmList;
	else {
	    // re-enter the current top of stack
	    CustomCompositeElm cce = subcircuitStack.lastElement();
	    elmList = cce.buildDisplayElmList();
	}
	updateSubcircuitPath();
	app.sim.analyzeCircuit();
	centerCircuit();
    }

    void updateSubcircuitPath() {
	if (subcircuitStack.isEmpty()) {
	    subcircuitBar.setSubcircuitPath(null);
	} else {
	    StringBuilder sb = new StringBuilder(Locale.LS("Viewing: "));
	    for (int i = 0; i < subcircuitStack.size(); i++) {
		if (i > 0) sb.append(" > ");
		sb.append(subcircuitStack.get(i).modelName);
	    }
	    subcircuitBar.setSubcircuitPath(sb.toString());
	}
    }

    void updateContextButtons() {
	subcircuitBar.setContextInfo(app.getEditingModelName());
    }

    void setMouseMode(int mode) {
    	mouse.mouseMode = mode;
    	if ( mode == MouseManager.MODE_ADD_ELM ) {
    		setCursorStyle("cursorCross");
    	} else {
    		setCursorStyle("cursorPointer");
    	}
    }

    void setCursorStyle(String s) {
    	if (lastCursorStyle!=null)
    		cv.removeStyleName(lastCursorStyle);
    	cv.addStyleName(s);
    	lastCursorStyle=s;
    }

    void setGrid() {
	app.gridSize = (menus.smallGridCheckItem.getState()) ? 8 : 16;
	app.gridMask = ~(app.gridSize-1);
	app.gridRound = app.gridSize/2-1;
    }

    // ---- Dialogs ----

    boolean dialogIsShowing() {
    	if (CirSim.editDialog!=null && CirSim.editDialog.isShowing())
    		return true;
        if (CirSim.customLogicEditDialog!=null && CirSim.customLogicEditDialog.isShowing())
                return true;
        if (CirSim.diodeModelEditDialog!=null && CirSim.diodeModelEditDialog.isShowing())
                return true;
       	if (CirSim.dialogShowing != null && CirSim.dialogShowing.isShowing())
       		return true;
    	if (contextPanel!=null && contextPanel.isShowing())
    		return true;
    	if (CirSim.scrollValuePopup != null && CirSim.scrollValuePopup.isShowing())
    		return true;
    	if (CirSim.typeScrollPopup != null && CirSim.typeScrollPopup.isShowing())
    		return true;
    	if (CirSim.aboutBox !=null && CirSim.aboutBox.isShowing())
    		return true;
    	return false;
    }

    // ---- Keyboard ----

    private native boolean isRepeatEvent(NativeEvent evt) /*-{
	return !!evt.repeat;
    }-*/;

    public void onPreviewNativeEvent(NativePreviewEvent e) {
    	int cc=e.getNativeEvent().getCharCode();
    	int t=e.getTypeInt();
    	int code=e.getNativeEvent().getKeyCode();
    	// Handle Shift key for net highlighting (works regardless of dialog state)
    	if (code == 16) {
    	    if ((t & Event.ONKEYDOWN) != 0) {
    	    	mouse.netHighlightKeyHeld = true;
    	    	mouse.updateNetHighlight();
    	    	app.repaint();
    	    }
    	    if ((t & Event.ONKEYUP) != 0) {
    	    	mouse.netHighlightKeyHeld = false;
    	    	mouse.updateNetHighlight();
    	    	app.repaint();
    	    }
    	}

    	if (dialogIsShowing()) {
    		if (CirSim.scrollValuePopup != null && CirSim.scrollValuePopup.isShowing() &&
    				(t & Event.ONKEYDOWN)!=0) {
    			if (code==KEY_ESCAPE || code==KEY_SPACE)
    				CirSim.scrollValuePopup.close(false);
    			if (code==KEY_ENTER)
    				CirSim.scrollValuePopup.close(true);
    		}
    		if (CirSim.typeScrollPopup != null && CirSim.typeScrollPopup.isShowing() &&
    				(t & Event.ONKEYDOWN)!=0) {
    			if (code==KEY_ESCAPE || code==KEY_SPACE)
    				CirSim.typeScrollPopup.close(false);
    			if (code==KEY_ENTER)
    				CirSim.typeScrollPopup.close(true);
    		}

    		Dialog dlg = CirSim.editDialog;
    		if (CirSim.diodeModelEditDialog != null)
    		    dlg = CirSim.diodeModelEditDialog;
    		if (CirSim.customLogicEditDialog != null)
    		    dlg = CirSim.customLogicEditDialog;
    		if (CirSim.dialogShowing != null)
    		    dlg = CirSim.dialogShowing;
    		if (dlg!=null && dlg.isShowing() &&
    				(t & Event.ONKEYDOWN)!=0) {
    			if (code==KEY_ESCAPE)
    			    dlg.closeDialog();
    			if (code==KEY_ENTER)
    			    dlg.enterPressed();
    		}
    		return;
    	}

    	if ((t&Event.ONKEYPRESS)!=0) {
		if (cc=='-') {
    		    app.commands.menuPerformed("key", "zoomout");
    		    e.cancel();
    		}
    		if (cc=='+' || cc == '=') {
    		    app.commands.menuPerformed("key", "zoomin");
    		    e.cancel();
    		}
		if (cc=='0') {
    		    app.commands.menuPerformed("key", "zoom100");
    		    e.cancel();
		}
		if (cc=='/' && app.shortcuts['/'] == null) {
		    app.commands.menuPerformed("key", "search");
		    e.cancel();
		}
    	}

    	if (isReadOnly())
    	    return;

    	// handle key-up for momentary switches with keyboard shortcuts
    	if ((t & Event.ONKEYUP) != 0) {
    	    String keyStr = String.valueOf((char)code).toLowerCase();
    	    boolean released = false;
    	    for (int i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = elmList.get(i);
    		if (ce instanceof SwitchElm) {
    		    SwitchElm se = (SwitchElm) ce;
    		    if (se.momentary && se.keyShortcut != null && se.keyShortcut.equals(keyStr)) {
    			se.mouseUp();
    			released = true;
    		    }
    		}
    	    }
    	    if (released) {
    		mouse.heldSwitchElm = null;
    		app.needAnalyze();
    		app.repaint();
    	    }
    	}

    	if ((t & Event.ONKEYDOWN)!=0) {
    		if (code==KEY_BACKSPACE || code==KEY_DELETE) {
    		    if (app.scopeManager.scopeSelected != -1) {
    			app.scopeManager.scopes[app.scopeManager.scopeSelected].setElm(null);
    			app.scopeManager.scopeSelected = -1;
    		    } else {
    		    	mouse.menuElm = null;
    		    	app.undoManager.pushUndo();
    			app.commands.doDelete(true);
    			e.cancel();
    		    }
    		}
    		if (code==KEY_ESCAPE){
    			setMouseMode(MouseManager.MODE_SELECT);
    			mouseModeStr = "Select";
			updateToolbar();
    			mouse.tempMouseMode = mouse.mouseMode;
    			e.cancel();
    		}

    		if (code==KEY_LEFT || code==KEY_RIGHT || code==KEY_UP || code==KEY_DOWN) {
    		    int dx = 0, dy = 0;
    		    if (code == KEY_LEFT)  dx = -app.gridSize;
    		    if (code == KEY_RIGHT) dx = app.gridSize;
    		    if (code == KEY_UP)    dy = -app.gridSize;
    		    if (code == KEY_DOWN)  dy = app.gridSize;
    		    boolean hasSel = false;
    		    for (int i = 0; i != elmList.size(); i++)
    			if (elmList.get(i).isSelected()) { hasSel = true; break; }
    		    if (hasSel) {
    			app.undoManager.pushUndo();
    			for (int i = 0; i != elmList.size(); i++) {
    			    CircuitElm ce = elmList.get(i);
    			    if (ce.isSelected())
    				ce.move(dx, dy);
    			}
    			app.needAnalyze();
    			e.cancel();
    		    }
    		}

    		if (e.getNativeEvent().getCtrlKey() || e.getNativeEvent().getMetaKey()) {
    			if (code==KEY_C) {
    				app.commands.menuPerformed("key", "copy");
    				e.cancel();
    			}
    			if (code==KEY_X) {
    				app.commands.menuPerformed("key", "cut");
    				e.cancel();
    			}
    			if (code==KEY_V) {
    				app.commands.menuPerformed("key", "paste");
    				e.cancel();
    			}
    			if (code==KEY_Z) {
    				app.commands.menuPerformed("key", "undo");
    				e.cancel();
    			}
    			if (code==KEY_Y) {
    				app.commands.menuPerformed("key", "redo");
    				e.cancel();
    			}
    			if (code==KEY_D) {
    			    	app.commands.menuPerformed("key", "duplicate");
    			    	e.cancel();
    			}
    			if (code==KEY_A) {
    				app.commands.menuPerformed("key", "selectAll");
    				e.cancel();
    			}
    			if (code==KEY_P) {
				app.commands.menuPerformed("key", "print");
				e.cancel();
			}
    			if (code==KEY_N && CirSim.isElectron()) {
				app.commands.menuPerformed("key", "newwindow");
				e.cancel();
			}
    			if (code==KEY_S) {
    			    	String cmd = "exportaslocalfile";
    			    	if (CirSim.isElectron())
    			    	    cmd = menus.saveFileItem.isEnabled() ? "save" : "saveas";
				app.commands.menuPerformed("key", cmd);
				e.cancel();
			}
    			if (code==KEY_O) {
				app.commands.menuPerformed("key", "importfromlocalfile");
				e.cancel();
			}
    		}
    	}
    	if ((t&Event.ONKEYPRESS)!=0) {
    		// check if any switches have a keyboard shortcut matching this key
    		if (cc>32 && cc<127) {
    		    String keyStr = String.valueOf((char)cc).toLowerCase();
    		    boolean toggled = false;
		    if (!isRepeatEvent(e.getNativeEvent())) {
			for (int i = 0; i != elmList.size(); i++) {
			    CircuitElm ce = elmList.get(i);
			    if (ce instanceof SwitchElm) {
				SwitchElm se = (SwitchElm) ce;
				if (se.keyShortcut != null && se.keyShortcut.equals(keyStr)) {
				    se.toggle();
				    if (!(se instanceof LogicInputElm))
					app.needAnalyze();
				    toggled = true;
				}
			    }
			}
		    }
    		    if (toggled) {
    			e.cancel();
    			app.repaint();
    		    } else {
    			String c=app.shortcuts[cc];
    			e.cancel();
    			if (c==null)
    				return;
    			setMouseMode(MouseManager.MODE_ADD_ELM);
    			mouseModeStr=c;
			updateToolbar();
    			mouse.tempMouseMode = mouse.mouseMode;
    		    }
    		}
    		if (cc==32) {
		    setMouseMode(MouseManager.MODE_SELECT);
		    mouseModeStr = "Select";
		    updateToolbar();
		    mouse.tempMouseMode = mouse.mouseMode;
		    e.cancel();
    		}
    	}
    }

    // ---- Widget management ----

    void createNewLoadFile() {
    	int idx=verticalPanel.getWidgetIndex(loadFileInput);
    	LoadFile newlf=new LoadFile(app);
    	verticalPanel.insert(newlf, idx);
    	verticalPanel.remove(idx+1);
    	loadFileInput=newlf;
    }

    void addWidgetToVerticalPanel(Widget w) {
	if (verticalPanel == null)
	    return;
    	if (iFrame!=null) {
    		int i=verticalPanel.getWidgetIndex(iFrame);
    		verticalPanel.insert(w, i);
    		setiFrameHeight();
    	}
    	else
    		verticalPanel.add(w);
    }

    void removeWidgetFromVerticalPanel(Widget w){
	if (verticalPanel == null)
	    return;
    	verticalPanel.remove(w);
    	if (iFrame!=null)
    		setiFrameHeight();
    }

    // ---- Other ----

    void setCircuitTitle(String s) {
	titleLabel.setText(s == null ? s : s.replace("_", "_\u200B"));
	if (s != null && s.length() > 0)
	    Document.get().setTitle(s + " - " + CirSim.baseTitle);
	else
	    Document.get().setTitle(CirSim.baseTitle);
    }

    void allowSave(boolean b) {
	if (menus.saveFileItem != null)
	    menus.saveFileItem.setEnabled(b);
    }

    boolean isSelection() {
	for (CircuitElm ce : elmList)
	    if (ce.isSelected())
		return true;
	return false;
    }

    public void resetAction(){
    	app.analyzeFlag = true;
    	if (app.sim.t == 0)
    	    setSimRunning(true);
    	app.sim.resetTime();
    	for (CircuitElm ce : elmList)
		ce.reset();
	app.scopeManager.resetGraphs();
    	repaint();
    }

    void composeSubcircuitMenu() {
	if (menus.subcircuitMenuBar == null)
	    return;
	int mi;

	for (mi = 0; mi != 2; mi++) {
	    com.google.gwt.user.client.ui.MenuBar menu = menus.subcircuitMenuBar[mi];
	    menu.clearItems();
	    Vector<CustomCompositeModel> list = CustomCompositeModel.getModelList();
	    int i;
	    for (i = 0; i != list.size(); i++) {
		String name = list.get(i).name;
		menu.addItem(getClassCheckItem(Locale.LS("Add ") + name, "CustomCompositeElm:" + name));
	    }
	}
	MouseManager.lastSubcircuitMenuUpdate = CustomCompositeModel.sequenceNumber;
    }

    
    CheckboxMenuItem getClassCheckItem(String s, String t) {
	if (app.classToLabelMap == null)
	    app.classToLabelMap = new HashMap<String, String>();
	app.classToLabelMap.put(t, s);

    	// try {
    	//   Class c = Class.forName(t);
    	String shortcut="";
    	CircuitElm elm = null;
    	try {
    	    elm = app.constructElement(t, 0, 0);
    	} catch (Exception e) {
	    app.console("exception: " + e);
	}
    	CheckboxMenuItem mi;
    	app.register(t, elm);
	if (elm == null)
	    app.console("can't create class: " + t);
    	if ( elm!=null ) {
    		if (elm.needsShortcut() ) {
    			shortcut += (char)elm.getShortcut();
    			if (app.shortcuts[elm.getShortcut()] != null && !app.shortcuts[elm.getShortcut()].equals(t))
    			    app.console("already have shortcut for " + (char)elm.getShortcut() + " " + elm);
    			app.shortcuts[elm.getShortcut()]=t;
    		}
    		elm.delete();
    	}
    	if (shortcut=="")
    		mi= new CheckboxMenuItem(s);
    	else
    		mi = new CheckboxMenuItem(s, shortcut);
    	mi.setScheduledCommand(new MyCommand("main", t) );
    	mainMenuItems.add(mi);
    	mainMenuItemNames.add(t);
    	return mi;
    }

    public void setiFrameHeight() {
    	if (iFrame==null)
    		return;
    	int i;
    	int cumheight=0;
    	for (i=0; i < verticalPanel.getWidgetIndex(iFrame); i++) {
    		if (verticalPanel.getWidget(i) != loadFileInput) {
    			cumheight=cumheight+verticalPanel.getWidget(i).getOffsetHeight();
    			if (verticalPanel.getWidget(i).getStyleName().contains("topSpace"))
    					cumheight+=12;
    		}
    	}
    	int ih=RootLayoutPanel.get().getOffsetHeight()-(hideMenu ? 0 : MENUBARHEIGHT)-cumheight;
    	if (ih<0)
    		ih=0;
    	iFrame.setHeight(ih+"px");
    }

    void setColors(String positiveColor, String negativeColor, String neutralColor, String selectColor, String currentColor) {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor != null) {
            if (positiveColor == null)
        	positiveColor = stor.getItem("positiveColor");
            if (negativeColor == null)
        	negativeColor = stor.getItem("negativeColor");
            if (neutralColor == null)
        	neutralColor = stor.getItem("neutralColor");
            if (selectColor == null)
        	selectColor = stor.getItem("selectColor");
            if (currentColor == null)
        	currentColor = stor.getItem("currentColor");
        }

	if (positiveColor != null)
	    CircuitElm.positiveColor = new Color(URL.decodeQueryString(positiveColor));
	else if (getOptionFromStorage("alternativeColor", false))
	    CircuitElm.positiveColor = Color.blue;
	else
	    CircuitElm.positiveColor = Color.green;

	if (negativeColor != null)
	    CircuitElm.negativeColor = new Color(URL.decodeQueryString(negativeColor));
	else
	    CircuitElm.negativeColor = Color.red;
	if (neutralColor != null)
	    CircuitElm.neutralColor = new Color(URL.decodeQueryString(neutralColor));
	else
	    CircuitElm.neutralColor = Color.gray;

	if (selectColor != null)
	    CircuitElm.selectColor = new Color(URL.decodeQueryString(selectColor));
	else
	    CircuitElm.selectColor = Color.cyan;

	if (currentColor != null)
	    CircuitElm.currentColor = new Color(URL.decodeQueryString(currentColor));
	else
	    CircuitElm.currentColor = menus.conventionCheckItem.getState() ? Color.yellow : Color.cyan;

	CircuitElm.setColorScale();
    }

    void setWheelSensitivity() {
	mouse.wheelSensitivity = 1;
	try {
	    Storage stor = Storage.getLocalStorageIfSupported();
	    mouse.wheelSensitivity = Double.parseDouble(stor.getItem("wheelSensitivity"));
	} catch (Exception e) {}
    }

    boolean getOptionFromStorage(String key, boolean val) {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return val;
        String s = stor.getItem(key);
        if (s == null)
            return val;
        return s == "true";
    }

    void setOptionInStorage(String key, boolean val) {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        stor.setItem(key,  val ? "true" : "false");
    }

    void saveShortcuts() {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        String str = "1";
        int i;
        for (i = 0; i != app.shortcuts.length; i++) {
            String sh = app.shortcuts[i];
            if (sh == null)
        		continue;
            str += ";" + i + "=" + sh;
        }
        stor.setItem("shortcuts", str);
    }

    void loadShortcuts() {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        String str = stor.getItem("shortcuts");
        if (str == null)
            return;
        String keys[] = str.split(";");

        int i;
        for (i = 0; i != app.shortcuts.length; i++)
            app.shortcuts[i] = null;

        for (i = 0; i != mainMenuItems.size(); i++) {
            CheckboxMenuItem item = mainMenuItems.get(i);
            if (item.getShortcut().length() > 1)
        		break;
            item.setShortcut("");
        }

        for (i = 1; i < keys.length; i++) {
            String arr[] = keys[i].split("=");
            if (arr.length != 2)
        	continue;
            int c = Integer.parseInt(arr[0]);
            String className = arr[1];
            app.shortcuts[c] = className;

            int j;
            for (j = 0; j != mainMenuItems.size(); j++) {
        		if (mainMenuItemNames.get(j) == className) {
        		    CheckboxMenuItem item = mainMenuItems.get(j);
        		    item.setShortcut(Character.toString((char)c));
        		    break;
        		}
            }
        }
    }

    String getLabelTextForClass(String cls) {
	return app.classToLabelMap.get(cls);
    }

    static int min(int a, int b) { return (a < b) ? a : b; }
    static int max(int a, int b) { return (a > b) ? a : b; }
}
