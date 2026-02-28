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

// GWT conversion (c) 2015 by Iain Sharp

// For information about the theory behind this, see Electronic Circuit & System Simulation Methods by Pillage
// or https://github.com/sharpie7/circuitjs1/blob/master/INTERNALS.md

import java.util.Vector;
import java.util.HashMap;
import java.util.Random;
import java.lang.Math;

import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.CellPanel;
import com.google.gwt.user.client.ui.DockLayoutPanel;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.user.client.ui.RootLayoutPanel;
import com.google.gwt.user.client.ui.RootPanel;
import com.google.gwt.canvas.dom.client.Context2d;
import com.google.gwt.canvas.dom.client.Context2d.LineCap;
import com.google.gwt.user.client.Event.NativePreviewEvent;
import com.google.gwt.user.client.Event.NativePreviewHandler;
import com.google.gwt.core.client.GWT;
import com.google.gwt.core.client.Scheduler;
import com.google.gwt.dom.client.Style.Unit;
import com.google.gwt.http.client.Request;
import com.google.gwt.http.client.RequestException;
import com.google.gwt.http.client.Response;
import com.google.gwt.http.client.URL;
import com.google.gwt.http.client.RequestBuilder;
import com.google.gwt.http.client.RequestCallback;
import com.google.gwt.user.client.ui.MenuBar;
import com.google.gwt.user.client.Command;
import com.google.gwt.user.client.DOM;
import com.google.gwt.user.client.Element;
import com.google.gwt.user.client.Event;
import com.google.gwt.user.client.Timer;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.google.gwt.user.client.ui.HorizontalPanel;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.dom.client.Document;
import com.google.gwt.dom.client.MetaElement;
import com.google.gwt.dom.client.NodeList;
import com.google.gwt.user.client.ui.MenuItem;
import com.google.gwt.storage.client.Storage;
import com.google.gwt.user.client.ui.PopupPanel;
import static com.google.gwt.event.dom.client.KeyCodes.*;
import com.google.gwt.user.client.ui.Frame;
import com.google.gwt.user.client.ui.Widget;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.lushprojects.circuitjs1.client.util.PerfMonitor;
import com.google.gwt.user.client.Window.ClosingEvent;
import com.google.gwt.event.logical.shared.ResizeEvent;
import com.google.gwt.event.logical.shared.ResizeHandler;

public class CirSim implements NativePreviewHandler {

    Random random;
    public UIManager ui;
    public MouseManager mouse;
    public UndoManager undoManager;
    public ImageExporter imageExporter;
    public CommandManager commands;
    Button resetButton;
    Button runStopButton;
    Button dumpMatrixButton;
    Label powerLabel;
    Label titleLabel;
    Scrollbar speedBar;
    Scrollbar currentBar;
    Scrollbar powerBar;
    boolean hideMenu = false;
    public ScopeManager scopeManager;
    Element sidePanelCheckboxLabel;
    Menus menus;
    CircuitLoader loader;
   
    // Class addingClass;
    PopupPanel contextPanel = null;
    String mouseModeStr = "Select";
    static final double pi = 3.14159265358979323846;
    static final int infoWidth = 160;
    int gridSize, gridMask, gridRound;
    boolean analyzeFlag, savedFlag;
    boolean dumpMatrix;
    boolean dcAnalysisFlag;
    // boolean useBufferedImage;
    int pause = 10;
    int hintType = -1, hintItem1, hintItem2;
    String stopMessage;

    double minFrameRate = 20;
    boolean developerMode;
    static final int HINT_LC = 1;
    static final int HINT_RC = 2;
    static final int HINT_3DB_C = 3;
    static final int HINT_TWINT = 4;
    static final int HINT_3DB_L = 5;
    Vector<CircuitElm> elmList;
    Vector<Point> postDrawList = new Vector<Point>();
    Vector<Point> badConnectionList = new Vector<Point>();
    Vector<Adjustable> adjustables;
    CircuitElm stopElm;
    ScopeElm scopeElmArr[];
    boolean simRunning;
    // public boolean useFrame;
    boolean showResistanceInVoltageSources;
    boolean hideInfoBox;
    static EditDialog editDialog, customLogicEditDialog, diodeModelEditDialog;
    static ScrollValuePopup scrollValuePopup;
    static Dialog dialogShowing;
    static AboutBox aboutBox;
    // Class dumpTypes[], shortcuts[];
    static ElementFactory factory;
    String shortcuts[];
    String recovery;
    Rectangle circuitArea;
    double transform[];
    boolean unsavedChanges;
    HashMap<String, String> classToLabelMap;
    static HashMap<Integer, String> dumpTypeMap;
    static HashMap<String, String> xmlDumpTypeMap;
    Toolbar toolbar;

    DockLayoutPanel layoutPanel;
    VerticalPanel verticalPanel;
    CellPanel buttonPanel;
    Vector<CheckboxMenuItem> mainMenuItems = new Vector<CheckboxMenuItem>();
    Vector<String> mainMenuItemNames = new Vector<String>();

    LoadFile loadFileInput;
    Frame iFrame;

    Canvas cv;
    Context2d cvcontext;

    // canvas width/height in px (before device pixel ratio scaling)
    int canvasWidth, canvasHeight;

    static final int MENUBARHEIGHT = 30;
    static final int TOOLBARHEIGHT = 40;
    static int VERTICALPANELWIDTH = 166; // default
    final Timer timer = new Timer() {
        public void run() {
            updateCircuit();
        }
    };
    final int FASTTIMER = 16;

    int getrand(int x) {
        int q = random.nextInt();
        if (q < 0)
            q = -q;
        return q % x;
    }

    static native float devicePixelRatio() /*-{
        return window.devicePixelRatio;
    }-*/;

    void checkCanvasSize() { ui.checkCanvasSize(); }

    native boolean isMobile(Element element) /*-{
	if (!element)
	    return false;
	var style = getComputedStyle(element);
	return style.display != 'none';
    }-*/;

    public void setCanvasSize() { ui.setCanvasSize(); }

    void setCircuitArea() { ui.setCircuitArea(); }
    
    native String decompress(String dump) /*-{
        return $wnd.LZString.decompressFromEncodedURIComponent(dump);
    }-*/;

    CirSim() {
	theApp = this;
	sim = new SimulationManager(this);
    }

    String startCircuit = null;
    String startLabel = null;
    String startCircuitText = null;
    String startCircuitLink = null;
    
    public void init() {

	//sets the meta tag to allow the css media queries to work
	MetaElement meta = Document.get().createMetaElement();
	meta.setName("viewport");
	meta.setContent("width=device-width");
	NodeList<com.google.gwt.dom.client.Element> node = Document.get().getElementsByTagName("head");
	node.getItem(0).appendChild(meta);

	
	boolean printable = false;
	boolean convention = true;
	boolean euroRes = false;
	boolean usRes = false;
	boolean running = true;
	boolean hideSidebar = false;
	boolean noEditing = false;
	boolean mouseWheelEdit = false;

	CircuitElm.initClass(this, sim);
	ui = new UIManager(this);
	undoManager = new UndoManager(this);
	undoManager.readRecovery();
	imageExporter = new ImageExporter(this);
	commands = new CommandManager(this);

	QueryParameters qp = new QueryParameters();
	String positiveColor = null;
	String negativeColor = null;
	String neutralColor = null;
	String selectColor = null;
	String currentColor = null;
	String mouseModeReq = null;
	boolean euroGates = false;

	factory = GWT.create(ElementFactory.class);
	
	try {
	    //baseURL = applet.getDocumentBase().getFile();
	    // look for circuit embedded in URL
	    //		String doc = applet.getDocumentBase().toString();
	    String cct=qp.getValue("cct");
	    if (cct!=null)
		startCircuitText = cct.replace("%24", "$");
	    if (startCircuitText == null)
		startCircuitText = getElectronStartCircuitText();
	    String ctz=qp.getValue("ctz");
	    if (ctz!= null)
		startCircuitText = decompress(ctz);
	    startCircuit = qp.getValue("startCircuit");
	    startLabel   = qp.getValue("startLabel");
	    startCircuitLink = qp.getValue("startCircuitLink");
	    euroRes = qp.getBooleanValue("euroResistors", false);
	    euroGates = qp.getBooleanValue("IECGates", ui.getOptionFromStorage("euroGates", Locale.weAreInGermany()));
	    usRes = qp.getBooleanValue("usResistors",  false);
	    running = qp.getBooleanValue("running", true);
	    hideSidebar = qp.getBooleanValue("hideSidebar", false);
	    hideMenu = qp.getBooleanValue("hideMenu", false);
	    printable = qp.getBooleanValue("whiteBackground", ui.getOptionFromStorage("whiteBackground", false));
	    convention = qp.getBooleanValue("conventionalCurrent",
		    ui.getOptionFromStorage("conventionalCurrent", true));
	    noEditing = !qp.getBooleanValue("editable", true);
	    mouseWheelEdit = qp.getBooleanValue("mouseWheelEdit", ui.getOptionFromStorage("mouseWheelEdit", true));
	    positiveColor = qp.getValue("positiveColor");
	    negativeColor = qp.getValue("negativeColor");
	    neutralColor = qp.getValue("neutralColor");
	    selectColor = qp.getValue("selectColor");
	    currentColor = qp.getValue("currentColor");
	    mouseModeReq = qp.getValue("mouseMode");
	    hideInfoBox = qp.getBooleanValue("hideInfoBox", false);
	} catch (Exception e) { }

	boolean euroSetting = false;
	if (euroRes)
	    euroSetting = true;
	else if (usRes)
	    euroSetting = false;
	else
	    euroSetting = ui.getOptionFromStorage("euroResistors", !Locale.weAreInUS(true));

	transform = new double[6];

	shortcuts = new String[127];

	layoutPanel = new DockLayoutPanel(Unit.PX);

	menus = new Menus(this);
	menus.init();
	ui.menus = menus;
    	dumpTypeMap.put(403, "ScopeElm");
    	xmlDumpTypeMap.put("Scope", "ScopeElm");

	menus.recoverItem.setEnabled(recovery != null);

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
	menus.toolbarCheckItem.setState(!hideMenu && !noEditing && !hideSidebar && startCircuit == null && startCircuitText == null && startCircuitLink == null);
	menus.crossHairCheckItem.setState(ui.getOptionFromStorage("crossHair", false));
	menus.euroResistorCheckItem.setState(euroSetting);
	menus.euroResistorCheckItem.setCommand(
		new Command() { public void execute(){
		    ui.setOptionInStorage("euroResistors", menus.euroResistorCheckItem.getState());
		    toolbar.setEuroResistors(menus.euroResistorCheckItem.getState());
		}
	});
	menus.euroGatesCheckItem.setCommand(
		new Command() { public void execute(){
		    ui.setOptionInStorage("euroGates", menus.euroGatesCheckItem.getState());
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
		    ui.setOptionInStorage("whiteBackground", menus.printableCheckItem.getState());
		}
	});
	menus.printableCheckItem.setState(printable);

	menus.conventionCheckItem.setCommand(
		new Command() { public void execute(){
		    ui.setOptionInStorage("conventionalCurrent", menus.conventionCheckItem.getState());
		    String cc = CircuitElm.currentColor.getHexValue();
		    // change the current color if it hasn't changed from the default
		    if (cc.equals("#ffff00") || cc.equals("#00ffff"))
			CircuitElm.currentColor = menus.conventionCheckItem.getState() ? Color.yellow : Color.cyan;
		}
	});
	menus.conventionCheckItem.setState(convention);
	menus.noEditCheckItem.setState(noEditing);
	menus.mouseWheelEditCheckItem.setState(mouseWheelEdit);

	ui.loadShortcuts();

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
		repaint();
	    }
	});

	cvcontext=cv.getContext2d();
	ui.setToolbar(); // calls setCanvasSize()
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
	    verticalPanel.add(loadFileInput = new LoadFile(this));

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
	ui.setPowerBarEnable();

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

	ui.setGrid();
	elmList = new Vector<CircuitElm>();
	adjustables = new Vector<Adjustable>();


	scopeManager = new ScopeManager(this);

	random = new Random();
	mouse = new MouseManager(this);

	ui.setColors(positiveColor, negativeColor, neutralColor, selectColor, currentColor);
	ui.setWheelSensitivity();

	loader = new CircuitLoader(this, sim, scopeManager, menus);

	if (startCircuitText != null) {
	    menus.getSetupList(false);
	    loader.readCircuit(startCircuitText);
	    unsavedChanges = false;
	} else {
	    if (stopMessage == null && startCircuitLink!=null) {
		loader.readCircuit("");
		menus.getSetupList(false);
		ImportFromDropboxDialog.setSim(this);
		ImportFromDropboxDialog.doImportDropboxLink(startCircuitLink, false);
	    } else {
		loader.readCircuit("");
		if (stopMessage == null && startCircuit != null) {
		    menus.getSetupList(false);
		    menus.readSetupFile(startCircuit, startLabel);
		}
		else
		    menus.getSetupList(true);
	    }
	}

	if (mouseModeReq != null)
	    commands.menuPerformed("main", mouseModeReq);

	undoManager.enableUndoRedo();
	commands.enablePaste();
	mouse.register(cv);
	mouse.enableDisableMenuItems();
	ui.setiFrameHeight();
	menuBar.addDomHandler(new ClickHandler() {
	    public void onClick(ClickEvent event) {
		mouse.doMainMenuChecks();
	    }
	}, ClickEvent.getType());
	Event.addNativePreviewHandler(this);

	Window.addWindowClosingHandler(new Window.ClosingHandler() {
	    public void onWindowClosing(ClosingEvent event) {
		// there is a bug in electron that makes it impossible to close the app if this warning is given
		if (unsavedChanges && !isElectron())
		    event.setMessage(Locale.LS("Are you sure?  There are unsaved changes."));
	    }
	});
	jsInterface = new JSInterface(this);
	jsInterface.setupJSInterface();
	
	setSimRunning(running);
    }

    boolean isPrintable() { return menus.printableCheckItem.getState(); }

    // delegation methods for UIManager
    void setOptionInStorage(String key, boolean val) { ui.setOptionInStorage(key, val); }
    boolean getOptionFromStorage(String key, boolean val) { return ui.getOptionFromStorage(key, val); }
    void saveShortcuts() { ui.saveShortcuts(); }
    
    boolean shown = false;
    
    void composeSubcircuitMenu() { ui.composeSubcircuitMenu(); }

    public void setiFrameHeight() { ui.setiFrameHeight(); }
    
    CheckboxMenuItem getClassCheckItem(String s, String t) {
	if (classToLabelMap == null)
	    classToLabelMap = new HashMap<String, String>();
	classToLabelMap.put(t, s);

    	// try {
    	//   Class c = Class.forName(t);
    	String shortcut="";
    	CircuitElm elm = null;
    	try {
    	    elm = constructElement(t, 0, 0);
    	} catch (Exception e) {}
    	CheckboxMenuItem mi;
    	register(t, elm);
	if (elm == null)
		console("can't create class: " + t);
    	if ( elm!=null ) {
    		if (elm.needsShortcut() ) {
    			shortcut += (char)elm.getShortcut();
    			if (shortcuts[elm.getShortcut()] != null && !shortcuts[elm.getShortcut()].equals(t))
    			    console("already have shortcut for " + (char)elm.getShortcut() + " " + elm);
    			shortcuts[elm.getShortcut()]=t;
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
    
    void centreCircuit() { ui.centreCircuit(); }

    Rectangle getCircuitBounds() { return ui.getCircuitBounds(); }
    static CirSim theApp;
    SimulationManager sim;
    public JSInterface jsInterface;

    public void setSimRunning(boolean s) { ui.setSimRunning(s); }

    public boolean simIsRunning() { return ui.simIsRunning(); }

    void repaint() { ui.repaint(); }
    
    public void updateCircuit() { ui.updateCircuit(); }

    void setStopElm(CircuitElm ce, String msg) {
	stopElm = ce;
	stopMessage = msg;
    }
    
    void drawBottomArea(Graphics g) { ui.drawBottomArea(g); }

    Color getBackgroundColor() { return ui.getBackgroundColor(); }
    
    void onTimeStep() {
	scopeManager.timeStep();
	jsInterface.callTimeStepHook();
    }

    String getHint() { return ui.getHint(); }
    void needAnalyze() {
	analyzeFlag = true;
    	repaint();
	mouse.enableDisableMenuItems();
    }
    
    public CircuitElm getElm(int n) {
	if (n >= elmList.size())
	    return null;
	return elmList.elementAt(n);
    }
    
    double getIterCount() {
    	// IES - remove interaction
	if (speedBar.getValue() == 0)
	   return 0;

	 return .1*Math.exp((speedBar.getValue()-61)/24.);

    }
    
    public Adjustable findAdjustable(CircuitElm elm, int item) {
	int i;
	for (i = 0; i != adjustables.size(); i++) {
	    Adjustable a = adjustables.get(i);
	    if (a.elm == elm && a.editItem == item)
		return a;
	}
	return null;
    }
    
    public static native void console(String text)
    /*-{
	    console.log(text);
	}-*/;

    public static native void debugger() /*-{ debugger; }-*/;
    
    int min(int a, int b) { return (a < b) ? a : b; }
    int max(int a, int b) { return (a > b) ? a : b; }
    
    public void resetAction() { ui.resetAction(); }

    static native boolean isElectron() /*-{
        return ($wnd.openFile != undefined);
    }-*/;    

    static native String getElectronStartCircuitText() /*-{
    	return $wnd.startCircuitText;
    }-*/;    
    
    void allowSave(boolean b) { ui.allowSave(b); }
    
    public void importCircuitFromText(String circuitText, boolean subcircuitsOnly) {
		int flags = subcircuitsOnly ? (CircuitLoader.RC_SUBCIRCUITS | CircuitLoader.RC_RETAIN) : 0;
		if (circuitText != null) {
			loader.readCircuit(circuitText, flags);
			allowSave(false);
		}
    }

    String dumpOptions() {
	int f = (menus.dotsCheckItem.getState()) ? 1 : 0;
	f |= (menus.smallGridCheckItem.getState()) ? 2 : 0;
	f |= (menus.voltsCheckItem.getState()) ? 0 : 4;
	f |= (menus.powerCheckItem.getState()) ? 8 : 0;
	f |= (menus.showValuesCheckItem.getState()) ? 0 : 16;
	// 32 = linear scale in afilter
	f |= sim.adjustTimeStep ? 64 : 0;
	String dump = "$ " + f + " " +
	    sim.maxTimeStep + " " + getIterCount() + " " +
	    currentBar.getValue() + " " + CircuitElm.voltageRange + " " +
	    powerBar.getValue() + " " + sim.minTimeStep + "\n";
	return dump;
    }
    
    String dumpCircuit() {
	int i;
	CustomLogicModel.clearDumpedFlags();
	CustomCompositeModel.clearDumpedFlags();
	DiodeModel.clearDumpedFlags();
	TransistorModel.clearDumpedFlags();
	
	//String dump = dumpOptions();
	XMLSerializer xml = new XMLSerializer(this);
	String dump = xml.dumpCircuit();
	return dump;
    }

    static final String baseTitle = "Circuit Simulator";

    void setCircuitTitle(String s) { ui.setCircuitTitle(s); }
    
    void clearCircuit() { loader.clearCircuit(); }
    void readCircuit(String s) { loader.readCircuit(s); }

    // delete sliders for an element
    void deleteSliders(CircuitElm elm) {
	int i;
	if (adjustables == null)
	    return;
	for (i = adjustables.size()-1; i >= 0; i--) {
	    Adjustable adj = adjustables.get(i);
	    if (adj.elm == elm) {
		adj.deleteSlider(this);
		adjustables.remove(i);
	    }
	}
    }
    
    int snapGrid(int x) {
	return (x+gridRound) & gridMask;
    }

    int locateElm(CircuitElm elm) {
	int i;
	for (i = 0; i != elmList.size(); i++)
	    if (elm == elmList.elementAt(i))
		return i;
	return -1;
    }
    

    void setPowerBarEnable() { ui.setPowerBarEnable(); }

    void enableItems() { ui.enableItems(); }
    
    void setGrid() { ui.setGrid(); }

    void setToolbar() { ui.setToolbar(); }


    void setMouseMode(int mode) { ui.setMouseMode(mode); }
    
    void setCursorStyle(String s) { ui.setCursorStyle(s); }
    
    boolean dialogIsShowing() { return ui.dialogIsShowing(); }
    
    public void onPreviewNativeEvent(NativePreviewEvent e) { ui.onPreviewNativeEvent(e); }
    
    void updateToolbar() { ui.updateToolbar(); }

    String getLabelTextForClass(String cls) { return ui.getLabelTextForClass(cls); }

    void createNewLoadFile() { ui.createNewLoadFile(); }

    void addWidgetToVerticalPanel(Widget w) { ui.addWidgetToVerticalPanel(w); }
    
    void removeWidgetFromVerticalPanel(Widget w){ ui.removeWidgetFromVerticalPanel(w); }
    
    void register(String origClassName, CircuitElm elm) {
	String className = origClassName;
	if (dumpTypeMap == null) {
	    dumpTypeMap = new HashMap<Integer, String>();
	    xmlDumpTypeMap = new HashMap<String, String>();
	}
	if (elm == null)
	    return;
	int t = elm.getDumpType();
	if (t == 0) {
	    console("got dump type 0 for " + className);
	    return;
	}
	String s = dumpTypeMap.get(t);
	Class cs = elm.getDumpClass();
	className = cs.getName();
	className = className.substring(className.lastIndexOf('.')+1);
	if (s != null) {
	    if (!s.equals(className))
		console("dump type conflict for " + className + " " + t);
	} else {
	    dumpTypeMap.put(t, className);
	}

	String xt = elm.getXmlDumpType();
	s = xmlDumpTypeMap.get(xt);
	if (s != null) {
	    if (!s.equals(className))
		console("xml dump type conflict for " + className + " " + xt);
	} else {
	    xmlDumpTypeMap.put(xt, className);
	}
    }

    public static CircuitElm createCe(int tint, int x1, int y1, int x2, int y2, int f, StringTokenizer st) {
	// for old files
	if (tint == 'n') return new NoiseElm(x1, y1, x2, y2, f, st);

	String name = dumpTypeMap.get(tint);
	if (name == null)
	    return null;
	return factory.create(name, x1, y1, x2, y2, f, st);
    }

    public static CircuitElm constructElement(String n, int x1, int y1){
	CircuitElm elm = factory.create(n, x1, y1);
	if (elm != null)
	    return elm;
    	
	if (n == "VoltageElm")
	    return new DCVoltageElm(x1, y1);
	if (n == "TransistorElm")
	    return (CircuitElm) new NTransistorElm(x1, y1);
	if (n == "MosfetElm")
            return (CircuitElm) new NMosfetElm(x1, y1);
	if (n == "JfetElm")
            return (CircuitElm) new NJfetElm(x1, y1);
    	if (n == "DarlingtonElm")
            return (CircuitElm) new NDarlingtonElm(x1, y1);

	// if you take out RingCounterElm, it will break subcircuits
    	// if you take out DecadeElm, it will break the menus and people's saved shortcuts
    	if (n=="DecadeElm" || n=="RingCounterElm")
    		return (CircuitElm) new RingCounterElm(x1, y1);
    	
    	// if you take out UserDefinedLogicElm, it will break people's saved shortcuts
    	if (n=="UserDefinedLogicElm" || n=="CustomLogicElm")
    	    	return (CircuitElm) new CustomLogicElm(x1, y1);
    	
    	// handle CustomCompositeElm:modelname
    	if (n.startsWith("CustomCompositeElm:")) {
    	    int ix = n.indexOf(':')+1;
    	    String name = n.substring(ix);
    	    return (CircuitElm) new CustomCompositeElm(x1, y1, name);
    	}
    	return null;
    }
    
    public void updateModels() {
	for (CircuitElm ce : elmList)
	    ce.updateModels();
    }

	boolean isSelection() { return ui.isSelection(); }
		
}

