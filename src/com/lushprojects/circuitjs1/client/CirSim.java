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
    public MouseManager mouse;
    public UndoManager undoManager;
    public ImageExporter imageExporter;
    public CommandManager commands;
    Button resetButton;
    Button runStopButton;
    Button dumpMatrixButton;
    private Label powerLabel;
    private Label titleLabel;
    Scrollbar speedBar;
    Scrollbar currentBar;
    Scrollbar powerBar;
    boolean hideMenu = false;
    public ScopeManager scopeManager;
    Element sidePanelCheckboxLabel;
    Menus menus;
    CircuitLoader loader;
   
    String lastCursorStyle;

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

    void checkCanvasSize() {
        if (cv.getCoordinateSpaceWidth() != (int) (canvasWidth * devicePixelRatio()))
            setCanvasSize();
    }

    native boolean isMobile(Element element) /*-{
	if (!element)
	    return false;
	var style = getComputedStyle(element);
	return style.display != 'none';
    }-*/;
    
    public void setCanvasSize(){
    	int width, height;
    	width=(int)RootLayoutPanel.get().getOffsetWidth();
    	height=(int)RootLayoutPanel.get().getOffsetHeight();
    	height=height-(hideMenu?0:MENUBARHEIGHT);

    	//not needed on mobile since the width of the canvas' container div is set to 100% in ths CSS file
    	if (!isMobile(sidePanelCheckboxLabel))
    	    width=width-VERTICALPANELWIDTH;
	if (menus.toolbarCheckItem.getState())
	    height -= TOOLBARHEIGHT;

    	width = Math.max(width, 0);   // avoid exception when setting negative width
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

	// recenter circuit in case canvas was hidden at startup
    	if (transform[0] == 0)
    	    centreCircuit();
    }
    
    void setCircuitArea() {
    	int height = canvasHeight;
    	int width = canvasWidth;
	int h;
    	if (scopeManager == null || scopeManager.scopeCount == 0)
    	    h = 0;
	else
    	    h = (int) ((double)height * scopeManager.scopeHeightFraction);
    	circuitArea = new Rectangle(0, 0, width, height-h);
    }
    
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
	} catch (Exception e) { }

	boolean euroSetting = false;
	if (euroRes)
	    euroSetting = true;
	else if (usRes)
	    euroSetting = false;
	else
	    euroSetting = getOptionFromStorage("euroResistors", !Locale.weAreInUS(true));

	transform = new double[6];

	shortcuts = new String[127];

	layoutPanel = new DockLayoutPanel(Unit.PX);

	menus = new Menus(this);
	menus.init();

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
		    int i;
		    for (i = 0; i != elmList.size(); i++)
			getElm(i).setPoints();
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
		repaint();
	    }
	});

	cvcontext=cv.getContext2d();
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
	elmList = new Vector<CircuitElm>();
	adjustables = new Vector<Adjustable>();


	scopeManager = new ScopeManager(this);

	random = new Random();
	mouse = new MouseManager(this);

	setColors(positiveColor, negativeColor, neutralColor, selectColor, currentColor);
	setWheelSensitivity();

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
	setiFrameHeight();
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
	
	if (negativeColor != null)
	    CircuitElm.negativeColor = new Color(URL.decodeQueryString(negativeColor));
	if (neutralColor != null)
	    CircuitElm.neutralColor = new Color(URL.decodeQueryString(neutralColor));

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
    
    boolean isPrintable() { return menus.printableCheckItem.getState(); }

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
    
    // save shortcuts to local storage
    void saveShortcuts() {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        String str = "1";
        int i;
        // format: version;code1=ClassName;code2=ClassName;etc
        for (i = 0; i != shortcuts.length; i++) {
            String sh = shortcuts[i];
            if (sh == null)
        		continue;
            str += ";" + i + "=" + sh;
        }
        stor.setItem("shortcuts", str);
    }
    
    // load shortcuts from local storage
    void loadShortcuts() {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        String str = stor.getItem("shortcuts");
        if (str == null)
            return;
        String keys[] = str.split(";");
        
        // clear existing shortcuts
        int i;
        for (i = 0; i != shortcuts.length; i++)
            shortcuts[i] = null;
        
        // clear shortcuts from menu
        for (i = 0; i != mainMenuItems.size(); i++) {
            CheckboxMenuItem item = mainMenuItems.get(i);
            // stop when we get to drag menu items
            if (item.getShortcut().length() > 1)
        		break;
            item.setShortcut("");
        }
        
        // go through keys (skipping version at start)
        for (i = 1; i < keys.length; i++) {
            String arr[] = keys[i].split("=");
            if (arr.length != 2)
        	continue;
            int c = Integer.parseInt(arr[0]);
            String className = arr[1];
            shortcuts[c] = className;
            
            // find menu item and fix it
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
    
    boolean shown = false;
    
    void composeSubcircuitMenu() {
	if (menus.subcircuitMenuBar == null)
	    return;
	int mi;
	
	// there are two menus to update: the one in the Draw menu, and the one in the right mouse menu
	for (mi = 0; mi != 2; mi++) {
	    MenuBar menu = menus.subcircuitMenuBar[mi];
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
    
    public void setiFrameHeight() {
    	if (iFrame==null)
    		return;
    	int i;
    	int cumheight=0;
    	for (i=0; i < verticalPanel.getWidgetIndex(iFrame); i++) {
    		if (verticalPanel.getWidget(i) !=loadFileInput) {
    			cumheight=cumheight+verticalPanel.getWidget(i).getOffsetHeight();
    			if (verticalPanel.getWidget(i).getStyleName().contains("topSpace"))
    					cumheight+=12;
    		}
    	}
    	int ih=RootLayoutPanel.get().getOffsetHeight()-(hideMenu?0:MENUBARHEIGHT)-cumheight;
    	if (ih<0)
    		ih=0;
    	iFrame.setHeight(ih+"px");
    }
    
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
    
    void centreCircuit() {
	if (elmList == null)  // avoid exception if called during initialization
	    return;
	
	Rectangle bounds = getCircuitBounds();
    	setCircuitArea();
	
    	double scale = 1;
    	int cheight = circuitArea.height;
    	
    	// if there's no scope, and the window isn't very wide, then don't use all of the circuit area when
    	// centering, because the info in the corner might not get in the way.  We still want circuitArea to be the full
    	// height though, to allow the user to put stuff there manually.
    	if (scopeManager.scopeCount == 0 && circuitArea.width < 800) {
    	    int h = (int) ((double)cheight * scopeManager.scopeHeightFraction);
    	    cheight -= h;
    	}
    	
    	if (bounds != null)
    	    // add some space on edges because bounds calculation is not perfect
    	    scale = Math.min(circuitArea.width /(double)(bounds.width+140),
    			     cheight/(double)(bounds.height+100));
    	scale = Math.min(scale, 1.5); // Limit scale so we don't create enormous circuits in big windows

    	// calculate transform so circuit fills most of screen
    	transform[0] = transform[3] = scale;
    	transform[1] = transform[2] = transform[4] = transform[5] = 0;
    	if (bounds != null) {
    	    transform[4] = (circuitArea.width -bounds.width *scale)/2 - bounds.x*scale;
    	    transform[5] = (cheight-bounds.height*scale)/2 - bounds.y*scale;
    	}
    }

    // get circuit bounds.  remember this doesn't use setBbox().  That is calculated when we draw
    // the circuit, but this needs to be ready before we first draw it, so we use this crude method
    Rectangle getCircuitBounds() {
    	int i;
    	int minx = 30000, maxx = -30000, miny = 30000, maxy = -30000;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		// centered text causes problems when trying to center the circuit,
    		// so we special-case it here
    		if (!ce.isCenteredText()) {
    			minx = min(ce.x, min(ce.x2, minx));
    			maxx = max(ce.x, max(ce.x2, maxx));
    		}
    		miny = min(ce.y, min(ce.y2, miny));
    		maxy = max(ce.y, max(ce.y2, maxy));
    	}
    	if (minx > maxx)
    	    return null;
    	return new Rectangle(minx, miny, maxx-minx, maxy-miny);
    }

    long lastTime = 0, lastFrameTime, secTime = 0;
    int frames = 0;
    int steps = 0;
    int framerate = 0, steprate = 0;
    static CirSim theApp;
    SimulationManager sim;
    public JSInterface jsInterface;

    public void setSimRunning(boolean s) {
    	if (s) {
    	    	if (stopMessage != null)
    	    	    return;
    		simRunning = true;
    		runStopButton.setHTML(Locale.LSHTML("<strong>RUN</strong>&nbsp;/&nbsp;Stop"));
    		runStopButton.setStylePrimaryName("topButton");
    		timer.scheduleRepeating(FASTTIMER);
    	} else {
    		simRunning = false;
    		runStopButton.setHTML(Locale.LSHTML("Run&nbsp;/&nbsp;<strong>STOP</strong>"));
    		runStopButton.setStylePrimaryName("topButton-red");
    		timer.cancel();
		repaint();
    	}
    }
    
    public boolean simIsRunning() {
    	return simRunning;
    }
    
    boolean needsRepaint;
    
    void repaint() {
	if (!needsRepaint) {
	    needsRepaint = true;
	    Scheduler.get().scheduleFixedDelay(new Scheduler.RepeatingCommand() {
		public boolean execute() {
		      updateCircuit();
		      needsRepaint = false;
		      return false;
		  }
	    }, FASTTIMER);
	}
    }
    
    // *****************************************************************
    //                     UPDATE CIRCUIT
    
    public void updateCircuit() {
        PerfMonitor perfmon = new PerfMonitor();
        perfmon.startContext("updateCircuit()");

        checkCanvasSize();
        
        // Analyze circuit
        boolean didAnalyze = analyzeFlag;
        if (analyzeFlag || dcAnalysisFlag) {
            perfmon.startContext("analyzeCircuit()");
            sim.analyzeCircuit();
            analyzeFlag = false;
            perfmon.stopContext();
        }
        
        // Stamp circuit
        if (sim.needsStamp && simRunning) {
            perfmon.startContext("stampCircuit()");
            try {
                sim.preStampAndStampCircuit();
            } catch (Exception e) {
                sim.stop("Exception in stampCircuit()", null);
		GWT.log("Exception in stampCircuit", e);
            }
            perfmon.stopContext();
        }
        
        if (stopElm != null && stopElm != mouse.getMouseElm())
            stopElm.setMouseElm(true);
        
        scopeManager.setupScopes();

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

        // Clear the frame
        g.fillRect(0, 0, canvasWidth, canvasHeight);

        // Run circuit
        if (simRunning) {
            if (sim.needsStamp)
                console("needsStamp while simRunning?");

            perfmon.startContext("runCircuit()");
            try {                
                sim.runCircuit(didAnalyze);
            } catch (Exception e) {
                debugger();
                console("exception in runCircuit " + e);
                e.printStackTrace();
            }
            perfmon.stopContext();
        }

        long sysTime = System.currentTimeMillis();
        if (simRunning) {
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
        
        // Set the graphics transform to deal with zoom and offset
        double scale = devicePixelRatio();
        cvcontext.setTransform(transform[0] * scale, 0, 0, transform[3] * scale, transform[4] * scale, transform[5] * scale);

        // Draw each element
        perfmon.startContext("elm.draw()");
        for (int i = 0; i != elmList.size(); i++) {
            if (menus.powerCheckItem.getState())
                g.setColor(Color.gray);
            
            getElm(i).draw(g);
        }
        perfmon.stopContext();

        // Draw posts normally
        if (mouse.mouseMode != MouseManager.MODE_DRAG_ROW && mouse.mouseMode != MouseManager.MODE_DRAG_COLUMN) {
            for (int i = 0; i != postDrawList.size(); i++)
                CircuitElm.drawPost(g, postDrawList.get(i));
        }

        // for some mouse modes, what matters is not the posts but the endpoints (which
        // are only the same for 2-terminal elements). We draw those now if needed
        if (mouse.tempMouseMode == MouseManager.MODE_DRAG_ROW ||
            mouse.tempMouseMode == MouseManager.MODE_DRAG_COLUMN ||
            mouse.tempMouseMode == MouseManager.MODE_DRAG_POST ||
            mouse.tempMouseMode == MouseManager.MODE_DRAG_SELECTED) {
            for (int i = 0; i != elmList.size(); i++) {

                CircuitElm ce = getElm(i);
                // ce.drawPost(g, ce.x , ce.y );
                // ce.drawPost(g, ce.x2, ce.y2);
                if (ce != mouse.getMouseElm() || mouse.tempMouseMode != MouseManager.MODE_DRAG_POST) {
                    g.setColor(Color.gray);
                    g.fillOval(ce.x - 3, ce.y - 3, 7, 7);
                    g.fillOval(ce.x2 - 3, ce.y2 - 3, 7, 7);
                } else {
                    ce.drawHandles(g, CircuitElm.selectColor);
                }
            }
        }
        
        // draw handles for elm we're creating
        if (mouse.tempMouseMode == MouseManager.MODE_SELECT && mouse.getMouseElm() != null) {
            mouse.getMouseElm().drawHandles(g, CircuitElm.selectColor);
        }

        // draw handles for elm we're dragging
        if (mouse.dragElm != null && (mouse.dragElm.x != mouse.dragElm.x2 || mouse.dragElm.y != mouse.dragElm.y2)) {
            mouse.dragElm.draw(g);
            mouse.dragElm.drawHandles(g, CircuitElm.selectColor);
        }

        // draw bad connections. do this last so they will not be overdrawn.
        for (int i = 0; i != badConnectionList.size(); i++) {
            Point cn = badConnectionList.get(i);
            g.setColor(Color.red);
            g.fillOval(cn.x - 3, cn.y - 3, 7, 7);
        }

        // draw the selection rect
        if (mouse.selectedArea != null) {
            g.setColor(CircuitElm.selectColor);
            g.drawRect(mouse.selectedArea.x, mouse.selectedArea.y, mouse.selectedArea.width, mouse.selectedArea.height);
        }

        // draw the crosshair cursor
        if (menus.crossHairCheckItem.getState() && mouse.mouseCursorX >= 0
                && mouse.mouseCursorX <= circuitArea.width && mouse.mouseCursorY <= circuitArea.height) {
            g.setColor(Color.gray);
            int x = snapGrid(mouse.inverseTransformX(mouse.mouseCursorX));
            int y = snapGrid(mouse.inverseTransformY(mouse.mouseCursorY));
            g.drawLine(x, mouse.inverseTransformY(0), x, mouse.inverseTransformY(circuitArea.height));
            g.drawLine(mouse.inverseTransformX(0), y, mouse.inverseTransformX(circuitArea.width), y);
        }

        // reset the graphics scale and translation
        cvcontext.setTransform(scale, 0, 0, scale, 0, 0);

        // draw the bottom area i.e. the scope and info section
        perfmon.startContext("drawBottomArea()");
        drawBottomArea(g);
        perfmon.stopContext();

        g.setColor(Color.white);
        
        perfmon.stopContext(); // graphics
        
        if (stopElm != null && stopElm != mouse.getMouseElm())
            stopElm.setMouseElm(false);
        
        frames++;

        // if we did DC analysis, we need to re-analyze the circuit with that flag
        // cleared.
        if (dcAnalysisFlag) {
            dcAnalysisFlag = false;
            analyzeFlag = true;
        }

        lastFrameTime = lastTime;

        perfmon.stopContext(); // updateCircuit
        
        if (developerMode) {
            int height = 15;
            int increment = 15;
            g.drawString("Framerate: " + CircuitElm.showFormat.format(framerate), 10, height);
            g.drawString("Steprate: " + CircuitElm.showFormat.format(steprate), 10, height += increment);
            g.drawString("Steprate/iter: " + CircuitElm.showFormat.format(steprate / getIterCount()), 10, height += increment);
            g.drawString("iterc: " + CircuitElm.showFormat.format(getIterCount()), 10, height += increment);
            g.drawString("Frames: " + frames, 10, height += increment);
            
            height += (increment * 2);
            
            String perfmonResult = PerfMonitor.buildString(perfmon).toString();
            String[] splits = perfmonResult.split("\n");
            for (int x = 0; x < splits.length; x++) {
                g.drawString(splits[x], 10, height + (increment * x));
            }
        }
        
        // This should always be the last 
        // thing called by updateCircuit();
        jsInterface.callUpdateHook();
    }

    void setStopElm(CircuitElm ce, String msg) {
	stopElm = ce;
	stopMessage = msg;
    }
    
    void drawBottomArea(Graphics g) {
	int leftX = 0;
	int h = 0;
	if (stopMessage == null && scopeManager.scopeCount == 0) {
	    leftX = max(canvasWidth-infoWidth, 0);
	    int h0 = (int) (canvasHeight * scopeManager.scopeHeightFraction);
	    h = (mouse.getMouseElm() == null) ? 70 : h0;
	    if (hideInfoBox)
		h = 0;
	}
	if (stopMessage != null && circuitArea.height > canvasHeight-30)
	    h = 30;
	g.setColor(menus.printableCheckItem.getState() ? "#eee" : "#111");
	g.fillRect(leftX, circuitArea.height-h, circuitArea.width, canvasHeight-circuitArea.height+h);
	g.setFont(CircuitElm.unitsFont);
	int ct = scopeManager.scopeCount;
	if (stopMessage != null)
	    ct = 0;
	int i;
	Scope.clearCursorInfo();
	for (i = 0; i != ct; i++)
	    scopeManager.scopes[i].selectScope(mouse.mouseCursorX, mouse.mouseCursorY);
	if (scopeElmArr != null)
	    for (i=0; i != scopeElmArr.length; i++)
		scopeElmArr[i].selectScope(mouse.mouseCursorX, mouse.mouseCursorY);
	for (i = 0; i != ct; i++)
	    scopeManager.scopes[i].draw(g);
	if (mouse.mouseWasOverSplitter) {
		g.setColor(CircuitElm.selectColor);
		g.setLineWidth(4.0);
		g.drawLine(0, circuitArea.height-2, circuitArea.width, circuitArea.height-2);
		g.setLineWidth(1.0);
	}
	g.setColor(CircuitElm.whiteColor);

	if (stopMessage != null) {
	    g.drawString(stopMessage, 10, canvasHeight-10);
	} else if (!hideInfoBox) {
	    // in JS it doesn't matter how big this is, there's no out-of-bounds exception
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
//		/* //shownodes
//		for (i = 0; i != mouseElm.getPostCount(); i++)
//		    info[0] += " " + mouseElm.nodes[i];
//		if (mouseElm.getVoltageSourceCount() > 0)
//		    info[0] += ";" + (mouseElm.getVoltageSource()+nodeList.size());
//		*/
		
	    } else {
	    	info[0] = "t = " + CircuitElm.getTimeText(sim.t);
	    	double timerate = 160*getIterCount()*sim.timeStep;
	    	if (timerate >= .1)
	    	    info[0] += " (" + CircuitElm.showFormat.format(timerate) + "x)";
	    	info[1] = Locale.LS("time step = ") + CircuitElm.getTimeText(sim.timeStep);
	    }
	    if (hintType != -1) {
		for (i = 0; info[i] != null; i++)
		    ;
		String s = getHint();
		if (s == null)
		    hintType = -1;
		else
		    info[i] = s;
	    }
	    int x = leftX + 5;
	    if (ct != 0)
		x = scopeManager.scopes[ct-1].rightEdge() + 20;
	    
	    // count lines of data
	    for (i = 0; info[i] != null; i++)
		;
	    int badnodes = badConnectionList.size();
	    if (badnodes > 0)
		info[i++] = badnodes + ((badnodes == 1) ?
					Locale.LS(" bad connection") : Locale.LS(" bad connections"));
	    if (savedFlag)
		info[i++] = "(saved)";

	    int ybase = circuitArea.height-h;
	    for (i = 0; info[i] != null; i++)
		g.drawString(info[i], x, ybase+15*(i+1));
	}
    }
    
    Color getBackgroundColor() {
	if (menus.printableCheckItem.getState())
	    return Color.white;
	return Color.black;
    }
    
    void onTimeStep() {
	scopeManager.timeStep();
	jsInterface.callTimeStepHook();
    }

    String getHint() {
	CircuitElm c1 = getElm(hintItem1);
	CircuitElm c2 = getElm(hintItem2);
	if (c1 == null || c2 == null)
	    return null;
	if (hintType == HINT_LC) {
	    if (!(c1 instanceof InductorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    InductorElm ie = (InductorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("res.f = ") + CircuitElm.getUnitText(1/(2*pi*Math.sqrt(ie.inductance*
						    ce.capacitance)), "Hz");
	}
	if (hintType == HINT_RC) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return "RC = " + CircuitElm.getUnitText(re.resistance*ce.capacitance,
					 "s");
	}
	if (hintType == HINT_3DB_C) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("f.3db = ") +
		CircuitElm.getUnitText(1/(2*pi*re.resistance*ce.capacitance), "Hz");
	}
	if (hintType == HINT_3DB_L) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof InductorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    InductorElm ie = (InductorElm) c2;
	    return Locale.LS("f.3db = ") +
		CircuitElm.getUnitText(re.resistance/(2*pi*ie.inductance), "Hz");
	}
	if (hintType == HINT_TWINT) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("fc = ") +
		CircuitElm.getUnitText(1/(2*pi*re.resistance*ce.capacitance), "Hz");
	}
	return null;
    }

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
    
    public void resetAction(){
    	int i;
    	analyzeFlag = true;
    	if (sim.t == 0)
    	    setSimRunning(true);
    	sim.resetTime();
    	for (i = 0; i != elmList.size(); i++)
		getElm(i).reset();
	scopeManager.resetGraphs();
    	repaint();
    }

    static native boolean isElectron() /*-{
        return ($wnd.openFile != undefined);
    }-*/;    

    static native String getElectronStartCircuitText() /*-{
    	return $wnd.startCircuitText;
    }-*/;    
    
    void allowSave(boolean b) {
	if (menus.saveFileItem != null)
	    menus.saveFileItem.setEnabled(b);
    }
    
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

    void setCircuitTitle(String s) {
	titleLabel.setText(s);
	if (s != null && s.length() > 0)
	    Document.get().setTitle(s + " - " + baseTitle);
	else
	    Document.get().setTitle(baseTitle);
    }
    
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
    

    void setPowerBarEnable() {
    	if (menus.powerCheckItem.getState()) {
    	    powerLabel.setStyleName("disabled", false);
    	    powerBar.enable();
    	} else {
    	    powerLabel.setStyleName("disabled", true);
    	    powerBar.disable();
    	}
    }

    void enableItems() {
    }
    
    void setGrid() {
	gridSize = (menus.smallGridCheckItem.getState()) ? 8 : 16;
	gridMask = ~(gridSize-1);
	gridRound = gridSize/2-1;
    }

    void setToolbar() {
	layoutPanel.setWidgetHidden(toolbar, !menus.toolbarCheckItem.getState());
	setCanvasSize();
    }


    void setMouseMode(int mode)
    {
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
    
    boolean dialogIsShowing() {
    	if (editDialog!=null && editDialog.isShowing())
    		return true;
        if (customLogicEditDialog!=null && customLogicEditDialog.isShowing())
                return true;
        if (diodeModelEditDialog!=null && diodeModelEditDialog.isShowing())
                return true;
       	if (dialogShowing != null && dialogShowing.isShowing())
       		return true;
    	if (contextPanel!=null && contextPanel.isShowing())
    		return true;
    	if (scrollValuePopup != null && scrollValuePopup.isShowing())
    		return true;
    	if (aboutBox !=null && aboutBox.isShowing())
    		return true;
    	return false;
    }
    
    public void onPreviewNativeEvent(NativePreviewEvent e) {
    	int cc=e.getNativeEvent().getCharCode();
    	int t=e.getTypeInt();
    	int code=e.getNativeEvent().getKeyCode();
    	if (dialogIsShowing()) {
    		if (scrollValuePopup != null && scrollValuePopup.isShowing() &&
    				(t & Event.ONKEYDOWN)!=0) {
    			if (code==KEY_ESCAPE || code==KEY_SPACE)
    				scrollValuePopup.close(false);
    			if (code==KEY_ENTER)
    				scrollValuePopup.close(true);
    		}
    		
    		// process escape/enter for dialogs
    		// multiple edit dialogs could be displayed at once, pick the one in front
    		Dialog dlg = editDialog;
    		if (diodeModelEditDialog != null)
    		    dlg = diodeModelEditDialog;
    		if (customLogicEditDialog != null)
    		    dlg = customLogicEditDialog;
    		if (dialogShowing != null)
    		    dlg = dialogShowing;
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
    		    commands.menuPerformed("key", "zoomout");
    		    e.cancel();
    		}
    		if (cc=='+' || cc == '=') {
    		    commands.menuPerformed("key", "zoomin");
    		    e.cancel();
    		}
		if (cc=='0') {
    		    commands.menuPerformed("key", "zoom100");
    		    e.cancel();
		}
		if (cc=='/' && shortcuts['/'] == null) {
		    commands.menuPerformed("key", "search");
		    e.cancel();
		}
    	}
    	
    	// all other shortcuts are ignored when editing disabled
    	if (menus.noEditCheckItem.getState())
    	    return;

    	if ((t & Event.ONKEYDOWN)!=0) {
    		if (code==KEY_BACKSPACE || code==KEY_DELETE) {
    		    if (scopeManager.scopeSelected != -1) {
    			// Treat DELETE key with scope selected as "remove scope", not delete
    			scopeManager.scopes[scopeManager.scopeSelected].setElm(null);
    			scopeManager.scopeSelected = -1;
    		    } else {
    		    	mouse.menuElm = null;
    		    	undoManager.pushUndo();
    			commands.doDelete(true);
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

    		if (e.getNativeEvent().getCtrlKey() || e.getNativeEvent().getMetaKey()) {
    			if (code==KEY_C) {
    				commands.menuPerformed("key", "copy");
    				e.cancel();
    			}
    			if (code==KEY_X) {
    				commands.menuPerformed("key", "cut");
    				e.cancel();
    			}
    			if (code==KEY_V) {
    				commands.menuPerformed("key", "paste");
    				e.cancel();
    			}
    			if (code==KEY_Z) {
    				commands.menuPerformed("key", "undo");
    				e.cancel();
    			}
    			if (code==KEY_Y) {
    				commands.menuPerformed("key", "redo");
    				e.cancel();
    			}
    			if (code==KEY_D) {
    			    	commands.menuPerformed("key", "duplicate");
    			    	e.cancel();
    			}
    			if (code==KEY_A) {
    				commands.menuPerformed("key", "selectAll");
    				e.cancel();
    			}
    			if (code==KEY_P) {
				commands.menuPerformed("key", "print");
				e.cancel();
			}
    			if (code==KEY_N && isElectron()) {
				commands.menuPerformed("key", "newwindow");
				e.cancel();
			}
    			if (code==KEY_S) {
    			    	String cmd = "exportaslocalfile";
    			    	if (isElectron())
    			    	    cmd = menus.saveFileItem.isEnabled() ? "save" : "saveas";
				commands.menuPerformed("key", cmd);
				e.cancel();
			}
    			if (code==KEY_O) {
				commands.menuPerformed("key", "importfromlocalfile");
				e.cancel();
			}    			
    		}
    	}
    	if ((t&Event.ONKEYPRESS)!=0) {
    		if (cc>32 && cc<127){
    			String c=shortcuts[cc];
    			e.cancel();
    			if (c==null)
    				return;
    			setMouseMode(MouseManager.MODE_ADD_ELM);
    			mouseModeStr=c;
			updateToolbar();
    			mouse.tempMouseMode = mouse.mouseMode;
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
    
    void updateToolbar() {
	if (mouse.dragElm != null)
	    toolbar.setModeLabel(Locale.LS("Drag Mouse"));
	else
	    toolbar.setModeLabel(Locale.LS("Mode: ") + classToLabelMap.get(mouseModeStr));
	toolbar.highlightButton(mouseModeStr);
    }

    String getLabelTextForClass(String cls) {
	return classToLabelMap.get(cls);
    }

    void createNewLoadFile() {
    	// This is a hack to fix what IMHO is a bug in the <INPUT FILE element
    	// reloading the same file doesn't create a change event so importing the same file twice
    	// doesn't work unless you destroy the original input element and replace it with a new one
    	int idx=verticalPanel.getWidgetIndex(loadFileInput);
    	LoadFile newlf=new LoadFile(this);
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
	int i;
	for (i = 0; i != elmList.size(); i++)
	    elmList.get(i).updateModels();
    }

	boolean isSelection() {
	    for (int i = 0; i != elmList.size(); i++)
		if (getElm(i).isSelected())
		    return true;
	    return false;
	}
		
}

