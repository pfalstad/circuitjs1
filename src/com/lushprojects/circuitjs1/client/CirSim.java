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

import com.google.gwt.user.client.Event.NativePreviewEvent;
import com.google.gwt.user.client.Event.NativePreviewHandler;
import com.google.gwt.core.client.GWT;
import com.google.gwt.user.client.Element;
import com.google.gwt.user.client.Timer;
import com.google.gwt.dom.client.Document;
import com.google.gwt.dom.client.MetaElement;
import com.google.gwt.dom.client.NodeList;
import com.google.gwt.user.client.ui.Widget;
import com.lushprojects.circuitjs1.client.util.Locale;

public class CirSim implements NativePreviewHandler {

    Random random;
    public UIManager ui;
    public MouseManager mouse;
    public UndoManager undoManager;
    public ImageExporter imageExporter;
    public CommandManager commands;
    public ScopeManager scopeManager;
    Menus menus;
    CircuitLoader loader;
   
    // Class addingClass;
    static final double pi = 3.14159265358979323846;
    static final int infoWidth = 160;
    int gridSize, gridMask, gridRound;
    boolean analyzeFlag, savedFlag;
    boolean dumpMatrix;
    boolean dcAnalysisFlag;
    boolean autoDCOnReset;
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

    // saved context stack for editing subcircuit models
    Vector<CircuitContext> contextStack = new Vector<CircuitContext>();
    CircuitElm stopElm;
    ScopeElm scopeElmArr[];
    boolean simRunning;
    // public boolean useFrame;
    boolean showResistanceInVoltageSources;
    static EditDialog editDialog, customLogicEditDialog, diodeModelEditDialog, relayModelEditDialog;
    static ScrollValuePopup scrollValuePopup;
    static TypeScrollPopup typeScrollPopup;
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

    native boolean isMobile(Element element) /*-{
	if (!element)
	    return false;
	var style = getComputedStyle(element);
	return style.display != 'none';
    }-*/;

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

	
	boolean running = true;

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
	    running = qp.getBooleanValue("running", true);
	    positiveColor = qp.getValue("positiveColor");
	    negativeColor = qp.getValue("negativeColor");
	    neutralColor = qp.getValue("neutralColor");
	    selectColor = qp.getValue("selectColor");
	    currentColor = qp.getValue("currentColor");
	    mouseModeReq = qp.getValue("mouseMode");

	} catch (Exception e) { }

	transform = new double[6];

	shortcuts = new String[127];
	elmList = new Vector<CircuitElm>();

	ui.init();
	
	adjustables = new Vector<Adjustable>();

	random = new Random();

	ui.setColors(positiveColor, negativeColor, neutralColor, selectColor, currentColor);
	ui.setWheelSensitivity();

	try {
	    CustomCompositeModel.loadModelsFromStorage();
	} catch (Exception e) {
            console("Exception: " + e);
	}

	loader = new CircuitLoader(this, sim, scopeManager, menus);
	TestManager.init(this);

	if (TestManager.loadingTestCircuit) {
	    startCircuitText = startCircuit = null;
	} else if (startCircuitText != null) {
	    menus.getSetupList(false);
	    loader.readCircuit(startCircuitText);
	    String electronFileName = getElectronStartCircuitFileName();
	    if (electronFileName != null)
		setCircuitTitle(electronFileName);
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
    
    void centerCircuit() { ui.centerCircuit(); }

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
	if (ui.speedBar.getValue() == 0)
	   return 0;

	 return .1*Math.exp((ui.speedBar.getValue()-61)/24.);

    }
    
    String getHint() {
	CircuitElm c1 = getElm(hintItem1);
	CircuitElm c2 = getElm(hintItem2);
	if (c1 == null || c2 == null)
	    return null;
	if (hintType == CirSim.HINT_LC) {
	    if (!(c1 instanceof InductorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    InductorElm ie = (InductorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("res.f = ") + CircuitElm.getUnitText(1/(2*CirSim.pi*Math.sqrt(ie.inductance*
						    ce.capacitance)), "Hz");
	}
	if (hintType == CirSim.HINT_RC) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return "RC = " + CircuitElm.getUnitText(re.resistance*ce.capacitance,
					 "s");
	}
	if (hintType == CirSim.HINT_3DB_C) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("f.3db = ") +
		CircuitElm.getUnitText(1/(2*CirSim.pi*re.resistance*ce.capacitance), "Hz");
	}
	if (hintType == CirSim.HINT_3DB_L) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof InductorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    InductorElm ie = (InductorElm) c2;
	    return Locale.LS("f.3db = ") +
		CircuitElm.getUnitText(re.resistance/(2*CirSim.pi*ie.inductance), "Hz");
	}
	if (hintType == CirSim.HINT_TWINT) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("fc = ") +
		CircuitElm.getUnitText(1/(2*CirSim.pi*re.resistance*ce.capacitance), "Hz");
	}
	return null;
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

    static native String getElectronStartCircuitFileName() /*-{
    	return $wnd.startCircuitFileName;
    }-*/;


    void allowSave(boolean b) { ui.allowSave(b); }
    
    public void importCircuitFromText(String circuitText, boolean subcircuitsOnly) {
		int flags = subcircuitsOnly ? (CircuitLoader.RC_SUBCIRCUITS | CircuitLoader.RC_RETAIN) : 0;
		if (!subcircuitsOnly)
		    resetEditingContext();
		if (circuitText != null) {
			loader.readCircuit(circuitText, flags);
			ExportAsLocalFileDialog.setLastFileName(null);
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
	f |= autoDCOnReset ? 128 : 0;
	String dump = "$ " + f + " " +
	    sim.maxTimeStep + " " + getIterCount() + " " +
	    ui.currentBar.getValue() + " " + CircuitElm.voltageRange + " " +
	    ui.powerBar.getValue() + " " + sim.minTimeStep + "\n";
	return dump;
    }
    
    String dumpCircuit() {
	CustomLogicModel.clearDumpedFlags();
	CustomCompositeModel.clearDumpedFlags();
	DiodeModel.clearDumpedFlags();
	TransistorModel.clearDumpedFlags();
	RelayModel.clearDumpedFlags();
	
	//String dump = dumpOptions();
	XMLSerializer xml = new XMLSerializer(this);
	String dump = xml.dumpCircuit();
	return dump;
    }

    static final String baseTitle = "Circuit Simulator";

    void setCircuitTitle(String s) { ui.setCircuitTitle(s); }
    
    void clearCircuit() { loader.clearCircuit(); }
    void readCircuit(String s) { loader.readCircuit(s); }

    void pushContext(String modelName) {
	CircuitContext ctx = new CircuitContext();
	ctx.circuitDump = dumpCircuit();
	ctx.undoStack = undoManager.undoStack;
	ctx.redoStack = undoManager.redoStack;
	ctx.transform = new double[transform.length];
	for (int i = 0; i < transform.length; i++)
	    ctx.transform[i] = transform[i];
	ctx.modelName = modelName;
	contextStack.add(ctx);
	undoManager.undoStack = new Vector<UndoManager.UndoItem>();
	undoManager.redoStack = new Vector<UndoManager.UndoItem>();
	undoManager.enableUndoRedo();
	ui.updateContextButtons();
    }

    void popContext() {
	popContextAndGetChangedModels();
    }

    // pop context and return the list of models changed at deeper levels
    Vector<CustomCompositeModel> popContextAndGetChangedModels() {
	if (contextStack.isEmpty())
	    return new Vector<CustomCompositeModel>();
	CircuitContext ctx = contextStack.remove(contextStack.size() - 1);
	loader.readCircuit(ctx.circuitDump, CircuitLoader.RC_NO_CENTER);
	transform = ctx.transform;
	undoManager.undoStack = ctx.undoStack;
	undoManager.redoStack = ctx.redoStack;
	undoManager.enableUndoRedo();
	ui.updateContextButtons();
	return ctx.changedModels;
    }

    void resetEditingContext() {
	contextStack.clear();
	ui.updateContextButtons();
    }

    boolean isEditingContext() {
	return !contextStack.isEmpty();
    }

    String getEditingModelName() {
	if (contextStack.isEmpty())
	    return null;
	return contextStack.lastElement().modelName;
    }

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
	/*if (t == 0) {
	    console("got dump type 0 for " + className);
	    return;
	}*/
	Class cs = elm.getDumpClass();
	className = cs.getName();
	className = className.substring(className.lastIndexOf('.')+1);
	if (t > 0) {
	    String s = dumpTypeMap.get(t);
	    if (s != null) {
		if (!s.equals(className))
		    console("dump type conflict for " + className + " " + t);
	    } else {
		dumpTypeMap.put(t, className);
	    }
	}

	String xt = elm.getXmlDumpType();
	String s = xmlDumpTypeMap.get(xt);
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

    // force all CustomCompositeElm with a given model name to re-fetch their model
    public void refreshModels(String modelName) {
	for (CircuitElm ce : elmList) {
	    if (ce instanceof CustomCompositeElm) {
		CustomCompositeElm cce = (CustomCompositeElm) ce;
		if (cce.modelName.equals(modelName)) {
		    cce.model = null;
		    cce.updateModels();
		}
	    }
	}
	needAnalyze();
    }

	boolean isSelection() { return ui.isSelection(); }

}

class CircuitContext {
    String circuitDump;
    Vector<UndoManager.UndoItem> undoStack;
    Vector<UndoManager.UndoItem> redoStack;
    double[] transform;
    String modelName;
    Vector<CustomCompositeModel> changedModels = new Vector<CustomCompositeModel>();
}

