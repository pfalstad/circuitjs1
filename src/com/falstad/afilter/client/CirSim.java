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

package com.falstad.afilter.client;

// GWT conversion (c) 2015 by Iain Sharp



// For information about the theory behind this, see Electronic Circuit & System Simulation Methods by Pillage



import java.util.Vector;
import java.util.Random;
import java.lang.Math;
import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.user.client.ui.Button;
import com.google.gwt.user.client.ui.DockLayoutPanel;
import com.google.gwt.user.client.ui.Label;
import com.google.gwt.user.client.ui.RootLayoutPanel;
import com.google.gwt.user.client.ui.RootPanel;
import com.google.gwt.canvas.dom.client.Context2d;
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
import com.google.gwt.user.client.Event.NativePreviewEvent;
import com.google.gwt.user.client.Event.NativePreviewHandler;
import com.google.gwt.event.dom.client.MouseWheelEvent;
import com.google.gwt.event.dom.client.MouseWheelHandler;
import com.google.gwt.core.client.GWT;
import com.google.gwt.dom.client.Style.Unit;
import com.google.gwt.http.client.Request;
import com.google.gwt.http.client.RequestException;
import com.google.gwt.http.client.Response;
import com.google.gwt.http.client.RequestBuilder;
import com.google.gwt.http.client.RequestCallback;
import com.google.gwt.user.client.ui.MenuBar;
import com.google.gwt.user.client.Command;
import com.google.gwt.user.client.Event;
import com.google.gwt.user.client.Timer;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.VerticalPanel;
import com.google.gwt.event.dom.client.ClickHandler;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.event.dom.client.DoubleClickHandler;
import com.google.gwt.event.dom.client.DoubleClickEvent;
import com.google.gwt.dom.client.CanvasElement;
import com.google.gwt.dom.client.NativeEvent;
import com.google.gwt.user.client.ui.MenuItem;
import com.google.gwt.safehtml.shared.SafeHtmlUtils;
import com.google.gwt.storage.client.Storage;
import com.google.gwt.user.client.ui.PopupPanel;
import static com.google.gwt.event.dom.client.KeyCodes.*;
import com.google.gwt.http.client.URL;
import com.google.gwt.user.client.Window.Location;
import com.google.gwt.user.client.ui.Frame;
import com.google.gwt.user.client.ui.Widget;
import com.google.gwt.user.client.Window.Navigator;


public class CirSim implements MouseDownHandler, MouseMoveHandler, MouseUpHandler,
ClickHandler, DoubleClickHandler, ContextMenuHandler, NativePreviewHandler,
MouseOutHandler, MouseWheelHandler {
//  implements ComponentListener, ActionListener, AdjustmentListener,
 // MouseMotionListener, MouseListener, ItemListener, KeyListener {
// implements ComponentListener {
    
  //  Thread engine = null;

//    Dimension winSize;
//    Image dbimage;
    
    Random random;
    

    
    public static final int sourceRadius = 7;
    public static final double freqMult = 3.14159265*2*4;
    
    
    
//    public String getAppletInfo() {
//	return "Circuit by Paul Falstad";
//    }

//    static Container main;
    // IES - remove interaction
//    Label titleLabel;
    Button resetButton;
//    Button dumpMatrixButton;
    MenuItem aboutItem;
    MenuItem importFromLocalFileItem, importFromTextItem,
    	exportAsUrlItem, exportAsLocalFileItem, exportAsTextItem;
    MenuItem undoItem, redoItem,
	cutItem, copyItem, pasteItem, selectAllItem, optionsItem;
    MenuBar optionsMenuBar;
    Checkbox stoppedCheck;
    CheckboxMenuItem dotsCheckItem;
    CheckboxMenuItem voltsCheckItem;
    CheckboxMenuItem powerCheckItem;
    CheckboxMenuItem smallGridCheckItem;
    CheckboxMenuItem showValuesCheckItem;
    CheckboxMenuItem admittanceCheckItem;
    CheckboxMenuItem euroResistorCheckItem;
    CheckboxMenuItem printableCheckItem;
    CheckboxMenuItem conventionCheckItem;
    CheckboxMenuItem linearCheckItem;
    CheckboxMenuItem polesCheckItem;
    CheckboxMenuItem phaseCheckItem;
    CheckboxMenuItem currentSpeedCheckItem;
    private Label powerLabel, scrollXLabel, speedLabel, currentLabel;
    private Scrollbar speedBar;
    private Scrollbar currentBar;
    private Scrollbar powerBar;
    private Scrollbar scrollXBar;
    private Scrollbar zoomBar;
    private Scrollbar scaleBar;
    MenuBar elmMenuBar;
    MenuItem elmEditMenuItem;
    MenuItem elmCutMenuItem;
    MenuItem elmCopyMenuItem;
    MenuItem elmDeleteMenuItem;
    MenuItem elmScopeMenuItem;
    MenuBar scopeMenuBar;
    MenuBar transScopeMenuBar;
    MenuBar mainMenuBar;
    CheckboxMenuItem scopeVMenuItem;
    CheckboxMenuItem scopeIMenuItem;
    CheckboxMenuItem scopeScaleMenuItem;
    CheckboxMenuItem scopeMaxMenuItem;
    CheckboxMenuItem scopeMinMenuItem;
    CheckboxMenuItem scopeFreqMenuItem;
    CheckboxMenuItem scopeFFTMenuItem;
    CheckboxMenuItem scopePowerMenuItem;
    CheckboxMenuItem scopeIbMenuItem;
    CheckboxMenuItem scopeIcMenuItem;
    CheckboxMenuItem scopeIeMenuItem;
    CheckboxMenuItem scopeVbeMenuItem;
    CheckboxMenuItem scopeVbcMenuItem;
    CheckboxMenuItem scopeVceMenuItem;
    CheckboxMenuItem scopeVIMenuItem;
    CheckboxMenuItem scopeXYMenuItem;
    CheckboxMenuItem scopeResistMenuItem;
    CheckboxMenuItem scopeVceIcMenuItem;
    MenuItem scopeSelectYMenuItem;

//    Class addingClass;
    PopupPanel contextPanel = null;
    int mouseMode = MODE_SELECT;
    int tempMouseMode = MODE_SELECT;
    String mouseModeStr = "Select";
    static final double pi = 3.14159265358979323846;
    static final double log10 = 2.30258509299404568401;
    static final int MODE_ADD_ELM = 0;
    static final int MODE_DRAG_ALL = 1;
    static final int MODE_DRAG_ROW = 2;
    static final int MODE_DRAG_COLUMN = 3;
    static final int MODE_DRAG_SELECTED = 4;
    static final int MODE_DRAG_POST = 5;
    static final int MODE_SELECT = 6;
    static final int infoWidth = 120;
    long myframes =1;
    long mytime=0;
    long myruntime=0;
    long mydrawtime=0;
    int dragX, dragY, initDragX, initDragY;
    int selectedSource;
    Rectangle selectedArea;
    int gridSize, gridMask, gridRound;
    boolean dragging;
    boolean analyzeFlag;
    boolean dumpMatrix;
 //   boolean useBufferedImage;
    boolean isMac;
    String ctrlMetaKey;
    double t;
    int pause = 10;
    int scopeSelected = -1;
    int menuScope = -1;
    int hintType = -1, hintItem1, hintItem2;
    String stopMessage;
    double timeStep;
    double frequency, omega;
    double minFrequency = 10, maxFrequency = 25000;
    double freqLogRange, minLogFrequency;
    double selectedFreq, animateFreq;
    static final int HINT_LC = 1;
    static final int HINT_RC = 2;
    static final int HINT_3DB_C = 3;
    static final int HINT_TWINT = 4;
    static final int HINT_3DB_L = 5;
    Vector<CircuitElm> elmList;
//    Vector setupList;
    CircuitElm dragElm, menuElm, stopElm;
    private CircuitElm mouseElm=null;
    boolean didSwitch = false;
    int mousePost = -1;
    CircuitElm plotXElm, plotYElm;
    int draggingPost;
    SwitchElm heldSwitchElm;
    Complex circuitMatrix[][], circuitRightSide[],
	origRightSide[], origMatrix[][];
    Complex phaseShift;
    RowInfo circuitRowInfo[];
    int circuitPermute[];
    boolean circuitNonLinear;
    int voltageSourceCount;
    int circuitMatrixSize, circuitMatrixFullSize;
    boolean circuitNeedsMap;
 //   public boolean useFrame;
    int scopeCount;
    Scope scopes[];
   int scopeColCount[];
    static EditDialog editDialog, customLogicEditDialog;
    static ExportAsUrlDialog exportAsUrlDialog;
    static ExportAsTextDialog exportAsTextDialog;
    static ExportAsLocalFileDialog exportAsLocalFileDialog;
    static ImportFromTextDialog importFromTextDialog;
    static ScrollValuePopup scrollValuePopup;
    static AboutBox aboutBox;
//    Class dumpTypes[], shortcuts[];
    String shortcuts[];
    static String muString = "u";
    static String ohmString = "ohm";
    String clipboard;
    Rectangle circuitArea, responseArea, circuitBbox, polesArea;
    int circuitBottom;
    Vector<String> undoStack, redoStack;
    double response[], phaseResponse[], idealResponse[];
    double responseAdjust;
    int responseZero;
    Customizer customizer;

	DockLayoutPanel layoutPanel;
	MenuBar menuBar;
	MenuBar fileMenuBar;
	VerticalPanel verticalPanel;
	private boolean mouseDragging;
	
	Vector<CheckboxMenuItem> mainMenuItems = new Vector<CheckboxMenuItem>();
	Vector<String> mainMenuItemNames = new Vector<String>();

	LoadFile loadFileInput;
	Frame iFrame;
	
    Canvas cv;
    Context2d cvcontext;
    Canvas backcv;
    Context2d backcontext;
    static final int MENUBARHEIGHT=30;
    static int VERTICALPANELWIDTH=166; // default
    static final int POSTGRABSQ=16;
    final Timer timer = new Timer() {
	      public void run() {
	        updateCircuit();
	      }
	    };
	 final int FASTTIMER=16;
    
	int getrand(int x) {
		int q = random.nextInt();
		if (q < 0)
			q = -q;
		return q % x;
	}
	
	
    public void setCanvasSize(){
    	int width, height;
    	width=(int)RootLayoutPanel.get().getOffsetWidth();
    	height=(int)RootLayoutPanel.get().getOffsetHeight();
    	height=height-MENUBARHEIGHT;
    	width=width-VERTICALPANELWIDTH;
		if (cv != null) {
			cv.setWidth(width + "PX");
			cv.setHeight(height + "PX");
			cv.setCoordinateSpaceWidth(width);
			cv.setCoordinateSpaceHeight(height);
		}
		if (backcv != null) {
			backcv.setWidth(width + "PX");
			backcv.setHeight(height + "PX");
			backcv.setCoordinateSpaceWidth(width);
			backcv.setCoordinateSpaceHeight(height);
		}
		int h = height / 3;
		/*if (h < 128 && winSize.height > 300)
		  h = 128;*/
		int w = width;
		polesArea = null;
		if (polesCheckItem.getState()) {
		    w /= 3;
		    polesArea = new Rectangle(width-w, 0, w, height-h);
		}
		circuitArea = new Rectangle(0, 0, w, height-h);
		responseArea = new Rectangle(0, height-h, width*3/4, h);
		
		centerCircuit();
    }
    
//    Circuit applet;

    CirSim() {
//	super("Circuit Simulator v1.6d");
//	applet = a;
//	useFrame = false;
	theSim = this;
    }

    String startCircuit = null;
    String startLabel = null;
    String startCircuitText = null;
//    String baseURL = "http://www.falstad.com/circuit/";
    
    public void init() {

//	String euroResistor = null;
//	String useFrameStr = null;
	boolean printable = false;
	boolean convention = true;
	boolean euro = false;
	MenuBar m;

	CircuitElm.initClass(this);

	QueryParameters qp = new QueryParameters();
			
	try {
		//baseURL = applet.getDocumentBase().getFile();
		// look for circuit embedded in URL
//		String doc = applet.getDocumentBase().toString();
		String cct=qp.getValue("cct");
		if (cct!=null)
			startCircuitText = cct.replace("%24", "$");
//		int in = doc.indexOf('#');
//		if (in > 0) {
//			String x = null;
//			try {
//				x = doc.substring(in+1);
//				x = URLDecoder.decode(x);
//				startCircuitText = x;
//			} catch (Exception e) {
//				GWT.log.println("can't decode " + x);
//				e.printStackTrace();
//			}
//		}
//		in = doc.lastIndexOf('/');
//		if (in > 0)
//			baseURL = doc.substring(0, in+1);
//
//		String param = applet.getParameter("PAUSE");
//		if (param != null)
//			pause = Integer.parseInt(param);
		startCircuit = qp.getValue("startCircuit");
		startLabel   = qp.getValue("startLabel");
		euro = qp.getBooleanValue("euroResistors", false);
//		useFrameStr  = qp.getValue("useFrame");
//		String x = applet.getParameter("whiteBackground");
//		if (x != null && x.equalsIgnoreCase("true"))
//			printable = true;
		printable = qp.getBooleanValue("whiteBackground", false);
//		x = applet.getParameter("conventionalCurrent");
//		if (x != null && x.equalsIgnoreCase("true"))
//			convention = false;
		convention = qp.getBooleanValue("conventionalCurrent", true);
	} catch (Exception e) { }
	
//	boolean euro = (euroResistor != null && euroResistor.equalsIgnoreCase("true"));
//	useFrame = (useFrameStr == null || !useFrameStr.equalsIgnoreCase("false"));
//	if (useFrame)
//	    main = this;
//	else
//	    main = applet;
	
	String os = Navigator.getPlatform();
	isMac = (os.toLowerCase().contains("mac"));
	ctrlMetaKey = (isMac) ? "Cmd" : "Ctrl";
//	String jv = System.getProperty("java.class.version");
//	double jvf = new Double(jv).doubleValue();
//	if (jvf >= 48) {
//	    muString = "\u03bc";
//	    ohmString = "\u03a9";
//	    useBufferedImage = true;
//	}
	
//	dumpTypes = new Class[300];
	shortcuts = new String[127];

	// these characters are reserved
	// IES - removal of scopes
/*	dumpTypes[(int)'o'] = Scope.class;
	dumpTypes[(int)'h'] = Scope.class;
	dumpTypes[(int)'$'] = Scope.class;
	dumpTypes[(int)'%'] = Scope.class;
	dumpTypes[(int)'?'] = Scope.class;
	dumpTypes[(int)'B'] = Scope.class;*/

//	main.setLayout(new CircuitLayout());
	layoutPanel = new DockLayoutPanel(Unit.PX);
	
	  fileMenuBar = new MenuBar(true);
	  importFromLocalFileItem = new MenuItem("Import From Local File", new MyCommand("file","importfromlocalfile"));
	  importFromLocalFileItem.setEnabled(LoadFile.isSupported());
	  fileMenuBar.addItem(importFromLocalFileItem);
	  importFromTextItem = new MenuItem("Import From Text", new MyCommand("file","importfromtext"));
	  fileMenuBar.addItem(importFromTextItem);
	  exportAsUrlItem = new MenuItem("Export as Link", new MyCommand("file","exportasurl"));
	  fileMenuBar.addItem(exportAsUrlItem);
	  exportAsLocalFileItem = new MenuItem("Export as Local File", new MyCommand("file","exportaslocalfile"));
	  exportAsLocalFileItem.setEnabled(ExportAsLocalFileDialog.downloadIsSupported());
	  fileMenuBar.addItem(exportAsLocalFileItem);
	  exportAsTextItem = new MenuItem("Export as Text", new MyCommand("file","exportastext"));
	  fileMenuBar.addItem(exportAsTextItem);
	  fileMenuBar.addSeparator();
	  aboutItem=new MenuItem("About",(Command)null);
	  fileMenuBar.addItem(aboutItem);
	  aboutItem.setScheduledCommand(new MyCommand("file","about"));
	  
//	  fileMenuBar.addItem("Exit", cmd);
	  
	  menuBar = new MenuBar();
	  menuBar.addItem("File", fileMenuBar);
	  verticalPanel=new VerticalPanel();
	  

	  

	
// IES - remove interaction
	/*
	mainMenu = new PopupMenu();
	MenuBar mb = null;
	if (useFrame)
	    mb = new MenuBar();
	Menu m = new Menu("File");
	if (useFrame)
	    mb.add(m);
	else
	    mainMenu.add(m);
	    */
	// IES - remove import expoert
/*	m.add(importItem = getMenuItem("Import"));
	m.add(exportItem = getMenuItem("Export"));
	m.add(exportLinkItem = getMenuItem("Export Link"));
	m.addSeparator();*/
	// IES - remove interaction
		
	//m.add(exitItem   = getMenuItem("Exit"));

	m = new MenuBar(true);
	final String edithtml="<div style=\"display:inline-block;width:80px;\">";
	String sn=edithtml+"Undo</div>Ctrl-Z";
	m.addItem(undoItem = new MenuItem(SafeHtmlUtils.fromTrustedString(sn), new MyCommand("edit","undo")));
	// undoItem.setShortcut(new MenuShortcut(KeyEvent.VK_Z));
	sn=edithtml+"Redo</div>Ctrl-Y";
	m.addItem(redoItem = new MenuItem(SafeHtmlUtils.fromTrustedString(sn), new MyCommand("edit","redo")));
	//redoItem.setShortcut(new MenuShortcut(KeyEvent.VK_Z, true));
	m.addSeparator();
//	m.addItem(cutItem = new MenuItem("Cut", new MyCommand("edit","cut")));
	sn=edithtml+"Cut</div>Ctrl-X";
	m.addItem(cutItem = new MenuItem(SafeHtmlUtils.fromTrustedString(sn), new MyCommand("edit","cut")));
	//cutItem.setShortcut(new MenuShortcut(KeyEvent.VK_X));
	sn=edithtml+"Copy</div>Ctrl-C";
	m.addItem(copyItem = new MenuItem(SafeHtmlUtils.fromTrustedString(sn), new MyCommand("edit","copy")));
	sn=edithtml+"Paste</div>Ctrl-V";
	m.addItem(pasteItem = new MenuItem(SafeHtmlUtils.fromTrustedString(sn), new MyCommand("edit","paste")));
	//pasteItem.setShortcut(new MenuShortcut(KeyEvent.VK_V));
	pasteItem.setEnabled(false);
	m.addSeparator();
	sn=edithtml+"Select All</div>Ctrl-A";
	m.addItem(selectAllItem = new MenuItem(SafeHtmlUtils.fromTrustedString(sn), new MyCommand("edit","selectAll")));
	//selectAllItem.setShortcut(new MenuShortcut(KeyEvent.VK_A));
	m.addItem(new MenuItem("Center Circuit", new MyCommand("edit", "centercircuit")));
	menuBar.addItem("Edit",m);

	MenuBar drawMenuBar = new MenuBar(true);
	drawMenuBar.setAutoOpen(true);

	menuBar.addItem("Draw", drawMenuBar);
	
	m = new MenuBar(true);
	m.addItem(new MenuItem("Stack All", new MyCommand("scopes", "stackAll")));
	m.addItem(new MenuItem("Unstack All",new MyCommand("scopes", "unstackAll")));
//	menuBar.addItem("Scopes", m);
		
	optionsMenuBar = m = new MenuBar(true );
	menuBar.addItem("Options", optionsMenuBar);
	m.addItem(dotsCheckItem = new CheckboxMenuItem("Show Current"));
	dotsCheckItem.setState(true);
	m.addItem(voltsCheckItem = new CheckboxMenuItem("Show Voltage",
			new Command() { public void execute(){
			    setVPACheck(voltsCheckItem);
			}
			}));
	voltsCheckItem.setState(true);
	m.addItem(powerCheckItem = new CheckboxMenuItem("Show Power",
			new Command() { public void execute(){
			    setVPACheck(powerCheckItem);
			}
	}));
	m.addItem(showValuesCheckItem = new CheckboxMenuItem("Show Values"));
	showValuesCheckItem.setState(true);
	//m.add(conductanceCheckItem = getCheckItem("Show Conductance"));
	m.addItem(admittanceCheckItem = new CheckboxMenuItem("Show Admittance",
		new Command() { public void execute() {
		    setVPACheck(admittanceCheckItem);
		}
	}));
	m.addItem(smallGridCheckItem = new CheckboxMenuItem("Small Grid",
			new Command() { public void execute(){
				setGrid();
			}
	}));
	m.addItem(euroResistorCheckItem = new CheckboxMenuItem("European Resistors"));
	euroResistorCheckItem.setState(euro);
	m.addItem(printableCheckItem = new CheckboxMenuItem("White Background",
			new Command() { public void execute(){
				int i;
				for (i=0;i<scopeCount;i++)
					scopes[i].setRect(scopes[i].rect);
			}
	}));
	printableCheckItem.setState(printable);
	m.addItem(conventionCheckItem = new CheckboxMenuItem("Conventional Current Motion"));
	conventionCheckItem.setState(convention);
	m.addItem(linearCheckItem = new CheckboxMenuItem("Linear Scale",
		new Command() { public void execute() {
		    analyzeFlag = true;
		}
	}));
	// XXX these should be radio buttons
	m.addItem(polesCheckItem = new CheckboxMenuItem("Show Poles & Zeroes",
		new Command() { public void execute() {
		    setCanvasSize();
		}
	}));
	m.addItem(phaseCheckItem = new CheckboxMenuItem("Show Phase"));
	m.addItem(currentSpeedCheckItem = new CheckboxMenuItem("Show Current Speed Bar",
		new Command() { public void execute() {
			showHideCurrentSpeedBar();
		}
	}));
	m.addItem(optionsItem = new CheckboxAlignedMenuItem("Other Options...",
			new MyCommand("options","other")));
	/*
	
	Menu circuitsMenu = new Menu("Circuits");
	if (useFrame)
	    mb.add(circuitsMenu);
	else
	    mainMenu.add(circuitsMenu);
	    */
	mainMenuBar = new MenuBar(true);
	mainMenuBar.setAutoOpen(true);
	composeMainMenu(mainMenuBar);
	composeMainMenu(drawMenuBar);

	  
    	int width=(int)RootLayoutPanel.get().getOffsetWidth();
    	VERTICALPANELWIDTH = width/5;
    	if (VERTICALPANELWIDTH > 166)
    	    VERTICALPANELWIDTH = 166;
    	if (VERTICALPANELWIDTH < 128)
    	    VERTICALPANELWIDTH = 128;

	  layoutPanel.addNorth(menuBar, MENUBARHEIGHT);
	  layoutPanel.addEast(verticalPanel, VERTICALPANELWIDTH);
	  RootLayoutPanel.get().add(layoutPanel);
	
	cv =Canvas.createIfSupported();
	  if (cv==null) {
		  RootPanel.get().add(new Label("Not working. You need a browser that supports the CANVAS element."));
		  return;
	  }
	  
	  
	  
	    cvcontext=cv.getContext2d();
	 backcv=Canvas.createIfSupported();
	    backcontext=backcv.getContext2d();
	    setCanvasSize();
		layoutPanel.add(cv);
		 verticalPanel.add(resetButton = new Button("Reset"));
		 resetButton.addClickHandler(new ClickHandler() {
			    public void onClick(ClickEvent event) {
			      reset();
			    }
			  });
//	dumpMatrixButton = new Button("Dump Matrix");
//	main.add(dumpMatrixButton);// IES for debugging
	stoppedCheck = new Checkbox("Stopped");
	verticalPanel.add(stoppedCheck);
	
	if (LoadFile.isSupported())
		verticalPanel.add(loadFileInput = new LoadFile(this));
	
	Label l;
//	verticalPanel.add(speedLabel = new Label("Simulation Speed"));
//	speedLabel.addStyleName("topSpace");

	// was max of 140
//	verticalPanel.add(
		speedBar = new Scrollbar(Scrollbar.HORIZONTAL, 3, 1, -320, 260);
//		);

//	verticalPanel.add(
		currentLabel = new Label("Current Speed");
//		);
	currentLabel.addStyleName("topSpace");
	currentBar = new Scrollbar(Scrollbar.HORIZONTAL, 50, 1, 1, 70);
//	verticalPanel.add(currentBar);
	
	verticalPanel.add(l = new Label("Spectrum Width"));
	l.addStyleName("topSpace");
	zoomBar = new Scrollbar(Scrollbar.HORIZONTAL,
		20, 1, 1, 100, new Command() {
	    public void execute() {
		setupResponse();
	    }
	}, null);
	verticalPanel.add(zoomBar);
	
        verticalPanel.add(l = new Label("Response dB Scale"));
	l.addStyleName("topSpace");
        verticalPanel.add(scaleBar = new Scrollbar(Scrollbar.HORIZONTAL, 500, 1, 1, 999,
                        new Command() {
                public void execute() {  } },null));


	verticalPanel.add(powerLabel = new Label ("Power Brightness"));
	powerLabel.addStyleName("topSpace");
	verticalPanel.add(powerBar = new Scrollbar(Scrollbar.HORIZONTAL,
		    50, 1, 1, 100));
	setPowerBarEnable();
	
	verticalPanel.add(scrollXLabel = new Label("Horiz Scroll"));
	scrollXLabel.addStyleName("topSpace");
	verticalPanel.add(scrollXBar = new Scrollbar(Scrollbar.HORIZONTAL,
	                                          50, 1, 1, 100, new Command() {
	    public void execute() { scrollChanged(); }}, null));

	verticalPanel.add(iFrame = new Frame("iframe.html"));
	iFrame.setWidth(VERTICALPANELWIDTH+"px");
	iFrame.setHeight("100 px");
	iFrame.getElement().setAttribute("scrolling", "no");
	

//	main.add(new Label("www.falstad.com"));
/*
	if (useFrame)
	    main.add(new Label(""));
	Font f = new Font("SansSerif", 0, 10);
	Label l;
	l = new Label("Current Circuit:");
	l.setFont(f);
	titleLabel = new Label("Label");
	titleLabel.setFont(f);
	if (useFrame) {
	    main.add(l);
	    main.add(titleLabel);
	}
	*/

	setGrid();
	elmList = new Vector<CircuitElm>();
//	setupList = new Vector();
	undoStack = new Vector<String>();
	redoStack = new Vector<String>();

	response = new double[1024];

	scopes = new Scope[20];
	scopeColCount = new int[20];
	scopeCount = 0;
	
	random = new Random();
//	cv.setBackground(Color.black);
//	cv.setForeground(Color.lightGray);
	
	elmMenuBar = new MenuBar(true);
	elmMenuBar.addItem(elmEditMenuItem = new MenuItem("Edit",new MyCommand("elm","edit")));
//	elmMenuBar.addItem(
		elmScopeMenuItem = new MenuItem("View in Scope", new MyCommand("elm","viewInScope"));
//		);
	elmMenuBar.addItem(elmCutMenuItem = new MenuItem("Cut",new MyCommand("elm","cut")));
	elmMenuBar.addItem(elmCopyMenuItem = new MenuItem("Copy",new MyCommand("elm","copy")));
	elmMenuBar.addItem(elmDeleteMenuItem = new MenuItem("Delete",new MyCommand("elm","delete")));
//	main.add(elmMenu);
	
	scopeMenuBar = buildScopeMenu(false);
	transScopeMenuBar = buildScopeMenu(true);
	setupResponse();

	// IES - remove interaction
//	getSetupList(circuitsMenu, false);
//	if (useFrame)
//	    setMenuBar(mb);
	
	if (startCircuitText != null) {
	    getSetupList(false);
	    readSetup(startCircuitText, false);
	} else {
	    readSetup(null, 0, false, false);
	    if (stopMessage == null && startCircuit != null) {
		getSetupList(false);
		readSetupFile(startCircuit, startLabel, true);
	    }
	    else
		getSetupList(true);
	}
		

	
	
// IES - hardcode circuit
//	if (startCircuitText != null)
//	    readSetup(startCircuitText);
//	else if (stopMessage == null && startCircuit != null)
//	    readSetupFile(startCircuit, startLabel);
//	else
//	    readSetup(null, 0, false);


	
//	if (useFrame) {
//	    Dimension screen = getToolkit().getScreenSize();
//	    resize(860, 640);
//	    handleResize();
//	    Dimension x = getSize();
//	    setLocation((screen.width  - x.width)/2,
//			(screen.height - x.height)/2);
//	    show();
//	} else  {
	  //  if (!powerCheckItem.getState()) {
	//	main.remove(powerBar);
	//	main.remove(powerLabel);
	//	main.validate();
	 //   }
	//    hide();
	//    handleResize();
//	    applet.validate();
//	}
	//requestFocus();

//	addWindowListener(new WindowAdapter()
//		{
//			public void windowClosing(WindowEvent we)
//			{
//				destroyFrame();
//			}
//		}
//	);
		enableUndoRedo();
		enablePaste();
		setiFrameHeight();
		cv.addMouseDownHandler(this);
		cv.addMouseMoveHandler(this);
		cv.addMouseUpHandler(this);
		cv.addClickHandler(this);
		cv.addDoubleClickHandler(this);
		doTouchHandlers(cv.getCanvasElement());
		cv.addDomHandler(this, ContextMenuEvent.getType());	
		menuBar.addDomHandler(new ClickHandler() {
		    public void onClick(ClickEvent event) {
		        doMainMenuChecks();
		      }
		    }, ClickEvent.getType());	
		Event.addNativePreviewHandler(this);
		cv.addMouseWheelHandler(this);
	    // setup timer

	    timer.scheduleRepeating(FASTTIMER);
	  

    }

    // install touch handlers
    // don't feel like rewriting this in java.  Anyway, java doesn't let us create mouse
    // events and dispatch them.
    native void doTouchHandlers(CanvasElement cv) /*-{
	// Set up touch events for mobile, etc
	var lastTap;
	var tmout;
	var sim = this;
	cv.addEventListener("touchstart", function (e) {
        	mousePos = getTouchPos(cv, e);
  		var touch = e.touches[0];
  		var etype = "mousedown";
  		clearTimeout(tmout);
  		if (e.timeStamp-lastTap < 300) {
     		    etype = "dblclick";
  		} else {
  		    tmout = setTimeout(function() {
  		        sim.@com.falstad.afilter.client.CirSim::longPress()();
  		    }, 1000);
  		}
  		lastTap = e.timeStamp;
  		
  		var mouseEvent = new MouseEvent(etype, {
    			clientX: touch.clientX,
    			clientY: touch.clientY
  		});
  		e.preventDefault();
  		cv.dispatchEvent(mouseEvent);
	}, false);
	cv.addEventListener("touchend", function (e) {
  		var mouseEvent = new MouseEvent("mouseup", {});
  		e.preventDefault();
  		clearTimeout(tmout);
  		cv.dispatchEvent(mouseEvent);
	}, false);
	cv.addEventListener("touchmove", function (e) {
  		var touch = e.touches[0];
  		var mouseEvent = new MouseEvent("mousemove", {
    			clientX: touch.clientX,
    			clientY: touch.clientY
  		});
  		e.preventDefault();
  		clearTimeout(tmout);
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
    
    boolean shown = false;
    
    public void composeMainMenu(MenuBar mainMenuBar) {
    	mainMenuBar.addItem(getClassCheckItem("Add Wire", "WireElm"));
    	mainMenuBar.addItem(getClassCheckItem("Add Resistor", "ResistorElm"));

    	MenuBar passMenuBar = new MenuBar(true);
    	passMenuBar.addItem(getClassCheckItem("Add Capacitor", "CapacitorElm"));
    	passMenuBar.addItem(getClassCheckItem("Add Inductor", "InductorElm"));
    	passMenuBar.addItem(getClassCheckItem("Add Switch", "SwitchElm"));
    	passMenuBar.addItem(getClassCheckItem("Add DPDT Switch", "Switch2Elm"));
    	passMenuBar.addItem(getClassCheckItem("Add Potentiometer", "PotElm"));
    	passMenuBar.addItem(getClassCheckItem("Add Transmission Line", "TransLineElm"));
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+"&nbsp;</div>Passive Components"), passMenuBar);

    	MenuBar inputMenuBar = new MenuBar(true);
    	inputMenuBar.addItem(getClassCheckItem("Add Ground", "GroundElm"));
    	inputMenuBar.addItem(getClassCheckItem("Add Input", "SweepElm"));
    	inputMenuBar.addItem(getClassCheckItem("Add Output", "OutputElm"));

    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+"&nbsp;</div>Inputs/Outputs"), inputMenuBar);
    	
    	MenuBar outputMenuBar = new MenuBar(true);
    	outputMenuBar.addItem(getClassCheckItem("Add Text", "TextElm"));
    	outputMenuBar.addItem(getClassCheckItem("Add Box", "BoxElm"));
    	outputMenuBar.addItem(getClassCheckItem("Add Scope Probe", "ProbeElm"));
    	outputMenuBar.addItem(getClassCheckItem("Add Labeled Node", "LabeledNodeElm"));
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+"&nbsp;</div>Labels"), outputMenuBar);
    	
    	MenuBar activeBlocMenuBar = new MenuBar(true);
    	activeBlocMenuBar.addItem(getClassCheckItem("Add Op Amp (- on top)", "OpAmpElm"));
    	activeBlocMenuBar.addItem(getClassCheckItem("Add Op Amp (+ on top)", "OpAmpSwapElm"));
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+"&nbsp;</div>Active Building Blocks"), activeBlocMenuBar);
    	
    	MenuBar otherMenuBar = new MenuBar(true);
    	CheckboxMenuItem mi;
    	otherMenuBar.addItem(mi=getClassCheckItem("Drag All", "DragAll"));
    	mi.addShortcut("(Alt-drag)");
    	otherMenuBar.addItem(mi=getClassCheckItem("Drag Row", "DragRow"));
    	mi.addShortcut("(S-right)");
    	otherMenuBar.addItem(getClassCheckItem("Drag Column", "DragColumn"));
    	otherMenuBar.addItem(getClassCheckItem("Drag Selected", "DragSelected"));
    	otherMenuBar.addItem(mi=getClassCheckItem("Drag Post", "DragPost"));
    	mi.addShortcut("(" + ctrlMetaKey + "-drag)");

    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+"&nbsp;</div>Drag"), otherMenuBar);

    	mainMenuBar.addItem(mi=getClassCheckItem("Select", "Select"));
    	mi.addShortcut( "(space or Shift-drag)");
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
  //  	int ih=RootLayoutPanel.get().getOffsetHeight()-(iFrame.getAbsoluteTop()-RootLayoutPanel.get().getAbsoluteTop());
    	int ih=RootLayoutPanel.get().getOffsetHeight()-MENUBARHEIGHT-cumheight;
//    	GWT.log("Root OH="+RootLayoutPanel.get().getOffsetHeight());
//    	GWT.log("iF top="+iFrame.getAbsoluteTop() );
//    	GWT.log("RP top="+RootLayoutPanel.get().getAbsoluteTop());
//    	GWT.log("ih="+ih);
//    	GWT.log("if left="+iFrame.getAbsoluteLeft());
    	if (ih<0)
    		ih=0;
    	iFrame.setHeight(ih+"px");
    }
    
//    public void triggerShow() {
//	if (!shown)
//	    show();
//	shown = true;
//    }

//    public void requestFocus()
//    {
//	super.requestFocus();
//	cv.requestFocus();
//    }
    MenuBar buildScopeMenu(boolean t) {
    	MenuBar m = new MenuBar(true);
    	m.addItem(new CheckboxAlignedMenuItem("Remove",new MyCommand("scopepop", "remove")));
    	m.addItem(new CheckboxAlignedMenuItem("Speed 2x", new MyCommand("scopepop", "speed2")));
    	m.addItem(new CheckboxAlignedMenuItem("Speed 1/2x", new MyCommand("scopepop", "speed1/2")));
    	m.addItem(new CheckboxAlignedMenuItem("Scale 2x", new MyCommand("scopepop", "scale")));
    	m.addItem(new CheckboxAlignedMenuItem("Max Scale", new MyCommand("scopepop", "maxscale")));
    	m.addItem(new CheckboxAlignedMenuItem("Stack", new MyCommand("scopepop", "stack")));
    	m.addItem(new CheckboxAlignedMenuItem("Unstack", new MyCommand("scopepop", "unstack")));
    	m.addItem(new CheckboxAlignedMenuItem("Reset", new MyCommand("scopepop", "reset")));
    	if (t) {
    		m.addItem(scopeIbMenuItem = new CheckboxMenuItem("Show Ib", new MyCommand("scopepop", "showib")));
    		m.addItem(scopeIcMenuItem = new CheckboxMenuItem("Show Ic", new MyCommand("scopepop", "showic")));
    		m.addItem(scopeIeMenuItem = new CheckboxMenuItem("Show Ie", new MyCommand("scopepop", "showie")));
    		m.addItem(scopeVbeMenuItem = new CheckboxMenuItem("Show Vbe", new MyCommand("scopepop", "showvbe")));
    		m.addItem(scopeVbcMenuItem = new CheckboxMenuItem("Show Vbc", new MyCommand("scopepop", "showvbc")));
    		m.addItem(scopeVceMenuItem = new CheckboxMenuItem("Show Vce", new MyCommand("scopepop", "showvce")));
    		m.addItem(scopeVceIcMenuItem = new CheckboxMenuItem("Show Vce vs Ic", new MyCommand("scopepop", "showvcevsic")));
    	} else {
    		m.addItem(scopeVMenuItem = new CheckboxMenuItem("Show Voltage", new MyCommand("scopepop", "showvoltage")));
    		m.addItem(scopeIMenuItem = new CheckboxMenuItem("Show Current", new MyCommand("scopepop", "showcurrent")));
    		m.addItem(scopePowerMenuItem = new CheckboxMenuItem("Show Power Consumed", new MyCommand("scopepop", "showpower")));
    		m.addItem(scopeScaleMenuItem = new CheckboxMenuItem("Show Scale", new MyCommand("scopepop", "showscale")));
    		m.addItem(scopeMaxMenuItem = new CheckboxMenuItem("Show Peak Value", new MyCommand("scopepop", "showpeak")));
    		m.addItem(scopeMinMenuItem = new CheckboxMenuItem("Show Negative Peak Value", new MyCommand("scopepop", "shownegpeak")));
    		m.addItem(scopeFreqMenuItem = new CheckboxMenuItem("Show Frequency", new MyCommand("scopepop", "showfreq")));
    		m.addItem(scopeFFTMenuItem = new CheckboxMenuItem("Show Spectrum", new MyCommand("scopepop", "showfft")));
    		m.addItem(scopeVIMenuItem = new CheckboxMenuItem("Show V vs I", new MyCommand("scopepop", "showvvsi")));
    		m.addItem(scopeXYMenuItem = new CheckboxMenuItem("Plot X/Y", new MyCommand("scopepop", "plotxy")));
    		m.addItem(scopeSelectYMenuItem = new CheckboxAlignedMenuItem("Select Y", new MyCommand("scopepop", "selecty")));
    		m.addItem(scopeResistMenuItem = new CheckboxMenuItem("Show Resistance", new MyCommand("scopepop", "showresistance")));
    	}
    	return m;
    }
    
 // IES - remove interaction
 	/*
    MenuItem getMenuItem(String s) {
	MenuItem mi = new MenuItem(s);
	mi.addActionListener(this);
	return mi;
    }

    MenuItem getMenuItem(String s, String ac) {
	MenuItem mi = new MenuItem(s);
	mi.setActionCommand(ac);
	mi.addActionListener(this);
	return mi;
    }

    CheckboxMenuItem getCheckItem(String s) {
	CheckboxMenuItem mi = new CheckboxMenuItem(s);
	mi.addItemListener(this);
	mi.setActionCommand("");
	return mi;
    }
    */

    CheckboxMenuItem getClassCheckItem(String s, String t) {
    	// try {
    	//   Class c = Class.forName(t);
    	String shortcut="";
    	CircuitElm elm = constructElement(t, 0, 0);
    	CheckboxMenuItem mi;
    	//  register(c, elm);
    	if ( elm!=null ) {
    		if (elm.needsShortcut() ) {
    			shortcut += (char)elm.getShortcut();
    			shortcuts[elm.getShortcut()]=t;
    		}
    		elm.delete();
    	}
//    	else
//    		GWT.log("Coudn't create class: "+t);
    	//	} catch (Exception ee) {
    	//	    ee.printStackTrace();
    	//	}
    	if (shortcut=="")
    		mi= new CheckboxMenuItem(s);
    	else
    		mi = new CheckboxMenuItem(s, shortcut);
    	mi.setScheduledCommand(new MyCommand("main", t) );
    	mainMenuItems.add(mi);
    	mainMenuItemNames.add(t);
    	return mi;
    }
    
//    CheckboxMenuItem getCheckItem(String s, String t) {
//	CheckboxMenuItem mi = new CheckboxMenuItem(s);
//	mi.addItemListener(this);
//	mi.setActionCommand(t);
//	return mi;
//    }



    
//	void register(Class c, CircuitElm elm) {
//		int t = elm.getDumpType();
//		if (t == 0) {
//			System.out.println("no dump type: " + c);
//			return;
//		}
//
//		int s = elm.getShortcut();
//		if (elm.needsShortcut() && s == 0) {
//			if (s == 0) {
//				System.err.println("no shortcut " + c + " for " + c);
//				return;
//			} else if (s <= ' ' || s >= 127) {
//				System.err.println("invalid shortcut " + c + " for " + c);
//				return;
//			}
//		}
//
//		Class dclass = elm.getDumpClass();
//
//		if (dumpTypes[t] != null && dumpTypes[t] != dclass) {
//			System.out.println("dump type conflict: " + c + " " + dumpTypes[t]);
//			return;
//		}
//		dumpTypes[t] = dclass;
//
//		Class sclass = elm.getClass();
//
//		if (elm.needsShortcut() && shortcuts[s] != null
//				&& shortcuts[s] != sclass) {
//			System.err.println("shortcut conflict: " + c
//					+ " (previously assigned to " + shortcuts[s] + ")");
//		} else {
//			shortcuts[s] = sclass;
//		}
//	}
    
    void centerCircuit() {
//    void handleResize() {
//        winSize = cv.getSize();
//	if (winSize.width == 0)
//	    return;
//	dbimage = main.createImage(winSize.width, winSize.height);
  //  	int h = winSize.height / 5;
    	/*if (h < 128 && winSize.height > 300)
	  h = 128;*/
   // 	circuitArea = new Rectangle(0, 0, winSize.width, winSize.height-h);
	computeBbox();
	if (circuitBbox == null)
	    return;
	    
        int minx = circuitBbox.x;
        int miny = circuitBbox.y;
        int maxx = minx + circuitBbox.width;
        int maxy = miny + circuitBbox.height;
        console("whole bbox " + circuitBbox);

    	// center circuit; we don't use snapGrid() because that rounds
    	int dx = gridMask & ((circuitArea.width -(maxx-minx))/2-minx);
    	int dy = gridMask & ((circuitArea.height-(maxy-miny))/2-miny);
    	if (dx+minx < 0)
    		dx = gridMask & (-minx);
    	if (dy+miny < 0)
    		dy = gridMask & (-miny);
    	moveAll(dx, dy);
        console("moved bbox " + circuitBbox);
    	
    	// after moving elements, need this to avoid singular matrix probs
    	needAnalyze();
    	circuitBottom = 0;
    }

    void computeBbox() {
    	int i;
//    	int minx = 1000, maxx = 0, miny = 1000, maxy = 0;
    	if (elmList == null)
    	    return;
    	Rectangle r = null;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		if (i == 0)
    		    r = ce.getBoundingBox();
    		else
    		    r = r.union(ce.getBoundingBox());
    		/*
    		// centered text causes problems when trying to center the circuit,
    		// so we special-case it here
    		if (!ce.isCenteredText()) {
    			minx = min(ce.x, min(ce.x2, minx));
    			maxx = max(ce.x, max(ce.x2, maxx));
    		}
    		miny = min(ce.y, min(ce.y2, miny));
    		maxy = max(ce.y, max(ce.y2, maxy));
    		*/
    	}
        int margin = 20;
    	r.grow(margin);
        circuitBbox = r;
        boolean fits = (circuitBbox.width < circuitArea.width);
        if (fits)
            scrollXBar.setValues(0, circuitArea.width, 0, circuitArea.width);
        else
            scrollXBar.setValues(0/*-circuitBbox.x*/, circuitArea.width,
                                 0, circuitBbox.width);
//        boolean wasVisible = scrollXBar.isVisible();
        console("bbox " + fits + " " + circuitArea.width + " " + circuitBbox.x + " " + circuitBbox.width);
        // we leave the scrollbar visible all the time because it might appear/disappear while we're playing
        // with another scrollbar and move something else under the mouse
//        scrollXBar.setVisible(!fits);
//        scrollXLabel.setVisible(!fits);
        scrollXBar.setEnabled(!fits);
    }
    
//
//    void destroyFrame() {
//	if (applet == null)
//	{
//	    dispose();
//	    System.exit(0);
//	}
//	else
//	{
//	    applet.destroyFrame();
//	}
//    }
//    
//    public boolean handleEvent(Event ev) {
//        if (ev.id == Event.WINDOW_DESTROY) {
//	    destroyFrame();
//            return true;
//        }
//        return super.handleEvent(ev);
//    }
//    
//    public void paint(Graphics g) {
//	cv.repaint();
//    }

    static final int resct = 6;
    long lastTime = 0, lastFrameTime, lastIterTime, secTime = 0;
    int frames = 0;
    int steps = 0;
    int framerate = 0, steprate = 0;
    static CirSim theSim;

    public void updateCircuit() {
    long mystarttime;
    long myrunstarttime;
    long mydrawstarttime;
	CircuitElm realMouseElm;
//	if (winSize == null || winSize.width == 0)
//	    return;
	mystarttime=System.currentTimeMillis();
	if (analyzeFlag) {
	    analyzeCircuit();
	    analyzeFlag = false;
	}
	calcResponse();
	frequency = (animateFreq > 0) ? animateFreq : selectedFreq;
//	if (editDialog != null && editDialog.elm instanceof CircuitElm)
//	    mouseElm = (CircuitElm) (editDialog.elm);
	realMouseElm = mouseElm;
	if (mouseElm == null)
	    mouseElm = stopElm;
	setupScopes();
//        Graphics2D g = null; // hausen: changed to Graphics2D
//	g = (Graphics2D)dbimage.getGraphics();
//	g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
//		RenderingHints.VALUE_ANTIALIAS_ON);
	Graphics g=new Graphics(backcontext);
	CircuitElm.selectColor = Color.cyan;
	if (printableCheckItem.getState()) {
  	    CircuitElm.whiteColor = Color.black;
  	    CircuitElm.lightGrayColor = Color.black;
  	    g.setColor(Color.white);
	} else {
	    CircuitElm.whiteColor = Color.white;
	    CircuitElm.lightGrayColor = Color.lightGray;
	    g.setColor(Color.black);
	}
	g.fillRect(0, 0, g.context.getCanvas().getWidth(), g.context.getCanvas().getHeight());
	myrunstarttime=System.currentTimeMillis();
	if (!stoppedCheck.getState()) {
	    try {
//		runCircuit();
	    } catch (Exception e) {
		console("exception in runCircuit");
		e.printStackTrace();
		analyzeFlag = true;
//		cv.repaint();
		return;
	    }
	 myruntime+=System.currentTimeMillis()-myrunstarttime;
}
	long sysTime = System.currentTimeMillis();
		if (!stoppedCheck.getState()) {
			
			if (lastTime != 0) {
				int inc = (int) (sysTime - lastTime);
				double c = currentBar.getValue();
				c = java.lang.Math.exp(c / 3.5 - 14.2);
				CircuitElm.currentMult = 1.7 * inc * c;
				 if (!conventionCheckItem.getState())
				 CircuitElm.currentMult = -CircuitElm.currentMult;
			}

			lastTime = sysTime;
		} else
			lastTime = 0;
		
		if (sysTime - secTime >= 1000) {
			framerate = frames;
			steprate = steps;
			frames = 0;
			steps = 0;
			secTime = sysTime;
		}
	   CircuitElm.powerMult = Math.exp(powerBar.getValue()/4.762-7);
	
	int i;
//	Font oldfont = g.getFont();
	Font oldfont = CircuitElm.unitsFont;
	g.setFont(oldfont);
	mydrawstarttime=System.currentTimeMillis();
	// set omega for admittance display
	omega = 2*pi*selectedFreq;
	g.setColor(CircuitElm.whiteColor);
	for (i = 0; i != elmList.size(); i++) {
	    if (powerCheckItem.getState())
	    	g.setColor(Color.gray);
	    /*else if (conductanceCheckItem.getState())
	      g.setColor(Color.white);*/
	    else if (admittanceCheckItem.getState())
		g.setColor(CircuitElm.whiteColor);
	    getElm(i).draw(g);
	}
	mydrawtime+=System.currentTimeMillis()-mydrawstarttime;
	if (tempMouseMode == MODE_DRAG_ROW || tempMouseMode == MODE_DRAG_COLUMN ||
			tempMouseMode == MODE_DRAG_POST || tempMouseMode == MODE_DRAG_SELECTED)
		for (i = 0; i != elmList.size(); i++) {

			CircuitElm ce = getElm(i);
//			ce.drawPost(g, ce.x , ce.y );
//			ce.drawPost(g, ce.x2, ce.y2);
			if (ce!=mouseElm || tempMouseMode!=MODE_DRAG_POST) {
				g.setColor(Color.gray);
				g.fillOval(ce.x-3, ce.y-3, 7, 7);
				g.fillOval(ce.x2-3, ce.y2-3, 7, 7);
			} else {
				ce.drawHandles(g, Color.cyan);
			}
		}
	if (tempMouseMode==MODE_SELECT && mouseElm!=null) {
		mouseElm.drawHandles(g, Color.cyan);
	}
	int badnodes = 0;
	// find bad connections, nodes not connected to other elements which
	// intersect other elements' bounding boxes
	// debugged by hausen: nullPointerException
	if ( nodeList != null )
	for (i = 0; i != nodeList.size(); i++) {
	    CircuitNode cn = getCircuitNode(i);
	    if (!cn.internal && cn.links.size() == 1) {
		int bb = 0, j;
		CircuitNodeLink cnl = cn.links.elementAt(0);
		for (j = 0; j != elmList.size(); j++)
		{ // TODO: (hausen) see if this change does not break stuff
		    CircuitElm ce = getElm(j);
		    if ( ce instanceof GraphicElm )
			continue;
		    if (cnl.elm != ce &&
			getElm(j).boundingBox.contains(cn.x, cn.y))
			bb++;
		}
		if (bb > 0) {
		    g.setColor(Color.red);
		    g.fillOval(cn.x-3, cn.y-3, 7, 7);
		    badnodes++;
		}
	    }
	}
	/*if (mouseElm != null) {
	    g.setFont(oldfont);
	    g.drawString("+", mouseElm.x+10, mouseElm.y);
	    }*/
	if (dragElm != null &&
	      (dragElm.x != dragElm.x2 || dragElm.y != dragElm.y2)) {
	    	dragElm.draw(g);
	    	dragElm.drawHandles(g, Color.cyan);
	}
	g.setFont(oldfont);
	int ct = scopeCount;
	if (stopMessage != null)
	    ct = 0;
	/*
	for (i = 0; i != ct; i++)
	    scopes[i].draw(g);
	    */
	g.setColor(CircuitElm.whiteColor);
        double respValue = 0, phaseValue = 0;
        if (responseArea != null) {
            int bottom = responseArea.y + responseArea.height;
            g.setColor(Color.darkGray);
            g.fillRect(responseArea.x, responseArea.y,
                       responseArea.width, responseArea.height);
            double ym = getDbScale();
            for (i = 0; ; i += 2) {
                double q = ym*i;
                if (q > 1)
                    break;
                g.setColor(i == 2*responseZero ? Color.gray : Color.black);
                int y = responseArea.y + (int) (q*responseArea.height);
                g.drawLine(responseArea.x, y, responseArea.width, y);
            }
            double fq = 1;
            double fqstep = 1;
            while (true) {
                if (fq > maxFrequency)
                    break;
                if (fq >= minFrequency) {
                    int x = (int) (frequencyToLinear(fq)*responseArea.width);
                    g.drawLine(x, responseArea.y, x, bottom);
                }
                fq += fqstep;
                if (fq == fqstep * 10)
                    fqstep *= 10;
            }
            g.setColor(Color.red);
            if (idealResponse != null) {
                int ox = -1, oy = -1;
                for (i = 0; i != responseArea.width; i++) {
                    double w = 0;
                    double bw = idealResponse[i*response.length/responseArea.width];
                    double val = -ym*Math.log(bw*bw*responseAdjust)/log10;
                    int x = i+responseArea.x;
                    if (val > 1) {
                        if (ox != -1)
                            g.drawLine(ox, oy, ox, bottom);
                        ox = -1;
                    } else {
                        int y = responseArea.y + (int) (responseArea.height*val);
                        if (ox != -1)
                            g.drawLine(ox, oy, x, y);
                        else if (x > responseArea.x)
                            g.drawLine(x, bottom, x, y);
                        ox = x;
                        oy = y;
                    }
                }
            }
            int ox = -1, oy = -1;
            g.setColor(Color.white);
            for (i = 0; i != responseArea.width; i++) {
                double w = 0;
                double bw = response[i*response.length/responseArea.width];
                double val = -ym*Math.log(bw*bw*responseAdjust)/log10;
                /*if (linRespCheckItem.getState())
                  val = 1-cc.mag;*/
                int x = i+responseArea.x;
                if (val > 1) {
                    if (ox != -1)
                        g.drawLine(ox, oy, ox, bottom);
                    ox = -1;
                } else {
                    int y = responseArea.y + (int) (responseArea.height*val);
                    if (ox != -1)
                        g.drawLine(ox, oy, x, y);
                    else if (x > responseArea.x)
                        g.drawLine(x, bottom, x, y);
                    ox = x;
                    oy = y;
                }
            }
            if (phaseCheckItem.getState()) {
                int phaseHeight = responseArea.height / 2;
                int wh = responseArea.y + responseArea.height;
                int ty = wh-phaseHeight;
                int my = wh-phaseHeight/2;
                g.setColor(Color.darkGray);
                g.fillRect(responseArea.x, ty,
                           responseArea.width, phaseHeight);
                g.setColor(Color.black);
                g.drawLine(responseArea.x, ty,
                           responseArea.width+responseArea.x, ty);
                g.drawLine(responseArea.x, my,
                           responseArea.width+responseArea.x, my);
                g.setColor(Color.white);
                ox = oy = -1;
                for (i = 0; i != responseArea.width; i++) {
                    double w = 0;
                    double val = -(phaseResponse[i*response.length/
                                                 responseArea.width]/(2*pi));
                    /*if (linRespCheckItem.getState())
                      val = 1-cc.mag;*/
                    int x = i+responseArea.x;
                    if (val > 1) {
                        if (ox != -1)
                            g.drawLine(ox, oy, ox, bottom);
                        ox = -1;
                    } else {
                        int y = my + (int) ((phaseHeight-1)*val);
                        if (ox != -1)
                            g.drawLine(ox, oy, x, y);
                        else if (x > responseArea.x)
                            g.drawLine(x, bottom, x, y);
                        ox = x;
                        oy = y;
                    }
                }
            }
            g.setColor(Color.yellow);
            if (selectedFreq > 0) {
                int x = (int)
                    (frequencyToLinear(selectedFreq)*responseArea.width);
                g.drawLine(x, responseArea.y, x, bottom);
                double bw = response[x*response.length/responseArea.width];
                respValue = 10*Math.log(bw*bw)/log10;
                phaseValue = phaseResponse[x*response.length/
                                           responseArea.width];
                omega = 2*pi*selectedFreq;
            }
            if (specStep != 0) {
                g.setColor(Color.black);
                String cs = "Calculating...";
                int wh = responseArea.y + responseArea.height;
                g.fillRect(0, wh-30, (int) (20+g.context.measureText(cs).getWidth()), 30);
                g.setColor(Color.white);
                g.drawString(cs, 10, wh-10);
            }
        }
        if (polesArea != null)
            drawPoles(g);
        g.setColor(Color.white);

	if (stopMessage != null) {
	    g.drawString(stopMessage, 10, circuitArea.height-10);
	} else {
	    if (!stoppedCheck.getState() && animateFreq > 0)
		animateCircuit();
	    if (circuitBottom == 0)
		calcCircuitBottom();
	    String info[] = new String[10];
	    if (mouseElm != null) {
		if (mousePost == -1)
		    mouseElm.getInfo(info);
		else
		    info[0] = "V = " +
			CircuitElm.getUnitText(mouseElm.getPostVoltage(mousePost), "V");
		/* //shownodes
		for (i = 0; i != mouseElm.getPostCount(); i++)
		    info[0] += " " + mouseElm.nodes[i];
		if (mouseElm.getVoltageSourceCount() > 0)
		    info[0] += ";" + (mouseElm.getVoltageSource()+nodeList.size());
		*/
		
	    } else {
	    	// IES Eliminate hack of showFormat
		// CircuitElm.showFormat.setMinimumFractionDigits(2);
		info[0] = "t = " + CircuitElm.getUnitText(t, "s");
		if (animateFreq > 0)
		    info[1] = "f = " +
			    CircuitElm.getUnitText(animateFreq, "Hz");
		// CircuitElm.showFormat.setMinimumFractionDigits(0);
	    }
	    for (i = 0; info[i] != null; i++)
		;
	    if (hintType != -1) {
		String s = getHint();
		if (s == null)
		    hintType = -1;
		else
		    info[i++] = s;
	    }
	    if (selectedFreq != 0) {
		info[i++] = CircuitElm.getUnitText(selectedFreq, "Hz") +
			": " + CircuitElm.showFormat.format(respValue) + " dB";
		if (phaseCheckItem.getState())
		    info[i++] = "Phase: " +
			    CircuitElm.showFormat.format(phaseValue*180/pi)
		    + "\u00b0";
	    }
	    /*if (ct != 0)
		             x = scopes[ct-1].rightEdge() + 20;*/
	    //x = max(0, winSize.width*2/3);
	    if (customizer != null && mouseElm == null)
		customizer.getInfo(info, i);

	  //  x=cv.getCoordinateSpaceWidth()*2/3;
	    
	    if (badnodes > 0)
		info[i++] = badnodes + ((badnodes == 1) ?
					" bad connection" : " bad connections");
	    
	    // find where to show data; below circuit, not too high unless we need it
	   // int ybase = winSize.height-15*i-5;
	    int ybase = cv.getCoordinateSpaceHeight() -15*i-5;
	    ybase = min(ybase, circuitArea.height);
	    ybase = max(ybase, circuitBottom);
	    int x = responseArea.width;
	    for (i = 0; info[i] != null; i++)
		g.drawString(info[i], x,
			     ybase+15*(i+1));
	}
	if (selectedArea != null) {
	    g.setColor(CircuitElm.selectColor);
	    g.drawRect(selectedArea.x, selectedArea.y, selectedArea.width, selectedArea.height);
	}
	 mouseElm = realMouseElm;
	frames++;
	
	g.setColor(Color.white);
//	g.drawString("Framerate: " + CircuitElm.showFormat.format(framerate), 10, 10);
//	g.drawString("Steprate: " + CircuitElm.showFormat.format(steprate),  10, 30);
//	g.drawString("Steprate/iter: " + CircuitElm.showFormat.format(steprate/getIterCount()),  10, 50);
//	g.drawString("iterc: " + CircuitElm.showFormat.format(getIterCount()),  10, 70);
//	g.drawString("Frames: "+ frames,10,90);
//	g.drawString("ms per frame (other): "+ CircuitElm.showFormat.format((mytime-myruntime-mydrawtime)/myframes),10,110);
//	g.drawString("ms per frame (sim): "+ CircuitElm.showFormat.format((myruntime)/myframes),10,130);
//	g.drawString("ms per frame (draw): "+ CircuitElm.showFormat.format((mydrawtime)/myframes),10,150);
	
	cvcontext.drawImage(backcontext.getCanvas(), 0.0, 0.0);
	// IES - remove interaction and delay
//	if (!stoppedCheck.getState() && circuitMatrix != null) {
	    // Limit to 50 fps (thanks to Jurgen Klotzer for this)
	    // long delay = 1000/50 - (System.currentTimeMillis() - lastFrameTime);
	    // realg.drawString("delay: " + delay,  10, 110);
	    // if (delay > 0) {
		//try {
		 //   Thread.sleep(delay);
		//} catch (InterruptedException e) {
		//}
	 //   }
	    
	//    cv.repaint(0);
	//}
	lastFrameTime = lastTime;
	mytime=mytime+System.currentTimeMillis()-mystarttime;
	myframes++;
    }

    double getDbScale() {
        double ym = .069;
        ym *= 500./scaleBar.getValue();
        return ym;
    }    

    void drawPoles(Graphics g) {
        Complex poles[] = null;
        if (customizer != null)
            poles = customizer.getPoles();
        if (poles == null)
            poles = getHintPoles();
        //System.out.println(hintType + " " + customizer + " " + poles);
        if (poles == null) {
            g.setColor(Color.black);
            g.fillRect(polesArea.x, polesArea.y,
                       polesArea.width, polesArea.height);
            return;
        }
        g.setColor(Color.darkGray);
        g.fillRect(polesArea.x, polesArea.y,
                   polesArea.width, polesArea.height);
        int rx = polesArea.x+polesArea.width-10;
        int my = polesArea.y + polesArea.height/2;
        int i;
        double mx = 1;
        if (customizer != null && customizer instanceof FilterCustomizer) {
            double f = ((FilterCustomizer) customizer).getFrequency();
            mx = 2*Math.PI*f;
        }
        for (i = 0; i != poles.length; i++) {
            Complex c = poles[i];
            if (Math.abs(c.re) > mx)
                mx = Math.abs(c.re);
            if (Math.abs(c.im) > mx)
                mx = Math.abs(c.im);
        }
        int m0 = polesArea.height/2-10;
        if (m0 > polesArea.width-10)
            m0 = polesArea.width-10;
        double scale = 1;
        while (scale*mx > m0)
            scale /= 2;
        double grid = 1e-8;
        while (grid*scale*10 < m0)
            grid *= 10;
        g.setColor(Color.black);
        for (i = 0; i != 20; i++) {
            int cx = (int) (rx-grid*i*scale);
            if (cx > polesArea.x)
                g.drawLine(cx, polesArea.y, cx, polesArea.y+polesArea.height);
            int cy = (int) (my-grid*i*scale);
            g.drawLine(polesArea.x, cy, polesArea.x+polesArea.width, cy);
            cy = (int) (my+grid*i*scale);
            if (cy < polesArea.y+polesArea.height)
                g.drawLine(polesArea.x, cy, polesArea.x+polesArea.width, cy);
        }
        if (customizer != null && customizer instanceof FilterCustomizer) {
            double f = ((FilterCustomizer) customizer).getFrequency();
            int or = (int) (2*Math.PI*f*scale);
            g.drawOval(rx-or, my-or, or*2, or*2);
        }
        g.setColor(Color.white);
        g.drawLine(polesArea.x, my,
                   polesArea.x+polesArea.width, my);
        g.drawLine(rx, polesArea.y, rx, polesArea.y+polesArea.height-1);
        int selnum = -1;
        if (customizer instanceof LowActiveFilter ||
                customizer instanceof HighActiveFilter) {
                for (i = 0; i != countElm(BoxElm.class); i++)
                    if (mouseElm == getElm(i, BoxElm.class))
                        selnum = i;
            }
            for (i = 0; i != poles.length; i++) {
                Complex c = poles[i];
                g.setColor((i == selnum || i == poles.length-1-selnum) ?
                           CircuitElm.selectColor : Color.white);
                int cx = (int) (rx+c.re*scale);
                int cy = (int) (my-c.im*scale);
                g.drawLine(cx-2, cy-2, cx+2, cy+2);
                g.drawLine(cx+2, cy-2, cx-2, cy+2);
            }
            Complex zeros[] = customizer.getZeros();
            if (zeros != null) {
                for (i = 0; i != zeros.length; i++) {
                    Complex c = zeros[i];
                    int cx = (int) (rx+c.re*scale);
                    int cy = (int) (my-c.im*scale);
                    g.drawOval(cx-3, cy-3, 7, 7);
                }
            }
            if (selectedFreq > 0) {
                g.setColor(Color.yellow);
                int cy = (int) (my-scale*2*pi*selectedFreq);
                g.drawLine(polesArea.x, cy, rx, cy);
            }
        }
        

    void setupScopes() {
    	int i;

    	// check scopes to make sure the elements still exist, and remove
    	// unused scopes/columns
    	int pos = -1;
    	for (i = 0; i < scopeCount; i++) {
    		if (locateElm(scopes[i].elm) < 0)
    			scopes[i].setElm(null);
    		if (scopes[i].elm == null) {
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
    	while (scopeCount > 0 && scopes[scopeCount-1].elm == null)
    		scopeCount--;
    	int h = cv.getCoordinateSpaceHeight() - circuitArea.height;
    	pos = 0;
    	for (i = 0; i != scopeCount; i++)
    		scopeColCount[i] = 0;
    	for (i = 0; i != scopeCount; i++) {
    		pos = max(scopes[i].position, pos);
    		scopeColCount[scopes[i].position]++;
    	}
    	int colct = pos+1;
    	int iw = infoWidth;
    	if (colct <= 2)
    		iw = iw*3/2;
    	int w = (cv.getCoordinateSpaceWidth()-iw) / colct;
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
    		if (s.speed != speed) {
    			s.speed = speed;
    			s.resetGraph();
    		}
    		Rectangle r = new Rectangle(pos*w, cv.getCoordinateSpaceHeight()-h+colh*row,
    				w-marg, colh);
    		row++;
    		if (!r.equals(s.rect))
    			s.setRect(r);
    	}
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
	    return "res.f = " + CircuitElm.getUnitText(1/(2*pi*Math.sqrt(ie.inductance*
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
	    return "f.3db = " +
		CircuitElm.getUnitText(1/(2*pi*re.resistance*ce.capacitance), "Hz");
	}
	if (hintType == HINT_3DB_L) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof InductorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    InductorElm ie = (InductorElm) c2;
	    return "f.3db = " +
		CircuitElm.getUnitText(re.resistance/(2*pi*ie.inductance), "Hz");
	}
	if (hintType == HINT_TWINT) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return "fc = " +
		CircuitElm.getUnitText(1/(2*pi*re.resistance*ce.capacitance), "Hz");
	}
	return null;
    }

    Complex [] getHintPoles() {
        CircuitElm c1 = getElm(hintItem1);
        CircuitElm c2 = getElm(hintItem2);
        if (c1 == null || c2 == null)
            return null;
        /*
        if (hintType == HINT_LC) {
            if (!(c1 instanceof InductorElm))
                return null;
            if (!(c2 instanceof CapacitorElm))
                return null;
            InductorElm ie = (InductorElm) c1;
            CapacitorElm ce = (CapacitorElm) c2;
            return "res.f = " + CircuitElm.getUnitText(1/(2*pi*Math.sqrt(ie.inductance*
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
        */
        if (hintType == HINT_3DB_C) {
            if (!(c1 instanceof ResistorElm))
                return null;
            if (!(c2 instanceof CapacitorElm))
                return null;
            ResistorElm re = (ResistorElm) c1;
            CapacitorElm ce = (CapacitorElm) c2;
            return new Complex[] { new Complex(-1/(re.resistance*ce.capacitance), 0) };
        }
        if (hintType == HINT_3DB_L) {
            if (!(c1 instanceof ResistorElm))
                return null;
            if (!(c2 instanceof InductorElm))
                return null;
            ResistorElm re = (ResistorElm) c1;
            InductorElm ie = (InductorElm) c2;
            return new Complex[] { new Complex(-re.resistance/ie.inductance, 0) };
        }
        /*
        if (hintType == HINT_TWINT) {
            if (!(c1 instanceof ResistorElm))
                return null;
            if (!(c2 instanceof CapacitorElm))
                return null;
            ResistorElm re = (ResistorElm) c1;
            CapacitorElm ce = (CapacitorElm) c2;
            return "fc = " +
                CircuitElm.getUnitText(1/(2*pi*re.resistance*ce.capacitance), "Hz");
        }
        */
        return null;
    }


//    public void toggleSwitch(int n) {
//	int i;
//	for (i = 0; i != elmList.size(); i++) {
//	    CircuitElm ce = getElm(i);
//	    if (ce instanceof SwitchElm) {
//		n--;
//		if (n == 0) {
//		    ((SwitchElm) ce).toggle();
//		    analyzeFlag = true;
//		    cv.repaint();
//		    return;
//		}
//	    }
//	}
//    }
    
    void editPerformed(Editable elm) {
	if (customizer != null) {
	    if (!customizer.editPerformed(elm))
		releaseCustomizer();
	}
	needAnalyze();
    }

    void needAnalyze() {
	analyzeFlag = true;
	//cv.repaint();
    }
    
    Vector<CircuitNode> nodeList;
    CircuitElm voltageSources[];

    public CircuitNode getCircuitNode(int n) {
	if (n >= nodeList.size())
	    return null;
	return nodeList.elementAt(n);
    }

    public CircuitElm getElm(int n) {
	if (n >= elmList.size())
	    return null;
	return elmList.elementAt(n);
    }
    
    public int countElm(Class c) {
	int i;
	int count = 0;
	for (i = 0; i != elmList.size(); i++) {
	    if (elmList.elementAt(i).getClass() == c)
		count++;
	}
	return count;
    }

    public CircuitElm getElm(int n, Class c) {
	int i;
	for (i = 0; i != elmList.size(); i++) {
	    if (elmList.elementAt(i).getClass() == c && n-- == 0)
		return (CircuitElm) elmList.elementAt(i);
	}
	return null;
    }

    public static native void console(String text)
    /*-{
	    console.log(text);
	}-*/;

    void analyzeCircuit() {
	console("analyzeCircuit " + elmList.size());
	calcCircuitBottom();
	if (elmList.isEmpty())
	    return;
	stopMessage = null;
	stopElm = null;
	int i, j;
	int vscount = 0;
	nodeList = new Vector<CircuitNode>();
	boolean gotGround = false;
	boolean gotRail = false;
	CircuitElm volt = null;

	//System.out.println("ac1");
	// look for voltage or ground element
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (ce instanceof GroundElm) {
		gotGround = true;
		break;
	    }
	    if (ce instanceof RailElm)
	    	gotRail = true;
	    if (volt == null && ce instanceof VoltageElm)
	    	volt = ce;
	}

	// if no ground, and no rails, then the voltage elm's first terminal
	// is ground
	if (!gotGround && volt != null && !gotRail) {
	    CircuitNode cn = new CircuitNode();
	    Point pt = volt.getPost(0);
	    cn.x = (int) pt.x;
	    cn.y = (int) pt.y;
	    nodeList.addElement(cn);
	} else {
	    // otherwise allocate extra node for ground
	    CircuitNode cn = new CircuitNode();
	    cn.x = cn.y = -1;
	    nodeList.addElement(cn);
	}
	//System.out.println("ac2");

	// allocate nodes and voltage sources
	LabeledNodeElm.resetNodeList();
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    int inodes = ce.getInternalNodeCount();
	    int ivs = ce.getVoltageSourceCount();
	    int posts = ce.getPostCount();
	    
	    // allocate a node for each post and match posts to nodes
	    for (j = 0; j != posts; j++) {
		Point pt = ce.getPost(j);
		int k;
		for (k = 0; k != nodeList.size(); k++) {
		    CircuitNode cn = getCircuitNode(k);
		    if (pt.x == cn.x && pt.y == cn.y)
			break;
		}
		if (k == nodeList.size()) {
		    CircuitNode cn = new CircuitNode();
		    cn.x = (int) pt.x;
		    cn.y = (int) pt.y;
		    CircuitNodeLink cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    cn.links.addElement(cnl);
		    ce.setNode(j, nodeList.size());
		    nodeList.addElement(cn);
		} else {
		    CircuitNodeLink cnl = new CircuitNodeLink();
		    cnl.num = j;
		    cnl.elm = ce;
		    getCircuitNode(k).links.addElement(cnl);
		    ce.setNode(j, k);
		    // if it's the ground node, make sure the node voltage is 0,
		    // cause it may not get set later
		    if (k == 0)
			ce.setNodeVoltage(j, 0, 0);
		}
	    }
	    for (j = 0; j != inodes; j++) {
		CircuitNode cn = new CircuitNode();
		cn.x = cn.y = -1;
		cn.internal = true;
		CircuitNodeLink cnl = new CircuitNodeLink();
		cnl.num = j+posts;
		cnl.elm = ce;
		cn.links.addElement(cnl);
		ce.setNode(cnl.num, nodeList.size());
		nodeList.addElement(cn);
	    }
	    vscount += ivs;
	}
	voltageSources = new CircuitElm[vscount];
	vscount = 0;
	circuitNonLinear = false;
	//System.out.println("ac3");

	// set voltage sources
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    int ivs = ce.getVoltageSourceCount();
	    for (j = 0; j != ivs; j++) {
		voltageSources[vscount] = ce;
		ce.setVoltageSource(j, vscount++);
	    }
	}
	voltageSourceCount = vscount;

	int matrixSize = nodeList.size()-1 + vscount;
	circuitMatrix = new Complex[matrixSize][matrixSize];
	circuitRightSide = new Complex[matrixSize];
	origMatrix = new Complex[matrixSize][matrixSize];
	origRightSide = new Complex[matrixSize];
	circuitMatrixSize = circuitMatrixFullSize = matrixSize;
	circuitRowInfo = new RowInfo[matrixSize];
	circuitPermute = new int[matrixSize];
	phaseShift = new Complex();
	int vs = 0;
	for (i = 0; i != matrixSize; i++)
	    circuitRowInfo[i] = new RowInfo();
	for (i = 0; i != matrixSize; i++)
	    circuitRightSide[i] = new Complex();
	for (i = 0; i != matrixSize; i++)
	    for (j = 0; j != matrixSize; j++)
		circuitMatrix[i][j] = new Complex();
	circuitNeedsMap = false;
	needsClosure = true;
	response = new double[responseArea == null ? 1024 : responseArea.width];
	phaseResponse = new double[response.length];
	specStep = 1;
	while (specStep < response.length)
	    specStep *= 2;
	specIndex = specStep/2;
	calcResponse();
	idealResponse = null;
	if (customizer != null)
	    idealResponse = customizer.getIdealResponse(response.length);
    }

    int specIndex, specStep;
    boolean needsClosure = true;
    
    void calcResponse() {
	int i, j, fi;
	int matrixSize = circuitMatrixSize;
	long tm = System.currentTimeMillis() + 50;
	if (specStep == 0)
	    return;
	int steps = 0;
	while (specStep != 0 && System.currentTimeMillis() <= tm) {
	    steps++;
	    fi = specIndex-1;
	    frequency = linearToFrequency(fi/(double) response.length);
	    solveCircuit();
	    
	    for (i = 0; i != elmList.size(); i++) {
		CircuitElm ce = getElm(i);
		if (ce instanceof OutputElm) {
		    int n = ce.getNode(0);
		    response[fi] = circuitRightSide[n-1].mag();
		    phaseResponse[fi] = circuitRightSide[n-1].phase();
		}
	    }

	    // interpolate
	    int prev = specIndex-specStep/2-1;
	    if (prev >= 0) {
		for (i = prev+1; i < fi; i++) {
		    double w = (i-prev)/(fi-(double)prev);
		    response[i] = response[prev]*(1-w) + response[fi]*w;
		    phaseResponse[i] = phaseResponse[prev]*(1-w) +
			phaseResponse[fi]*w;
		}
	    }
	    int next = specIndex+specStep/2-1;
	    if (next < response.length) {
		for (i = fi+1; i < next; i++) {
		    double w = (next-i)/(next-(double)fi);
		    response[i] = response[next]*(1-w) + response[fi]*w;
		    phaseResponse[i] =
			phaseResponse[next]*(1-w) + phaseResponse[fi]*w;
		}
	    }
	    
	    // next step
	    specIndex += specStep;
	    if (specIndex > response.length) {
		specStep /= 2;
		specIndex = specStep/2;
		if (specStep == 1)
		    specStep = 0;
	    }
	}
	double maxResponse = 0;
	for (i = 0; i != response.length; i++)
	    if (response[i] > maxResponse)
		maxResponse = response[i];
	responseAdjust = 1;
	responseZero = 0;
	while (maxResponse*maxResponse*responseAdjust > 1) {
	    responseAdjust /= 100;
	    responseZero++;
	}
//	console("did " + steps + " steps");
//	if (specStep != 0)
//	    cv.repaint();
    }

    void solveCircuit() {
	int i, j;
	int matrixSize = circuitMatrixSize;
	for (i = 0; i != matrixSize; i++)
	    for (j = 0; j != matrixSize; j++)
		circuitMatrix[i][j].set(0, 0);
	for (i = 0; i != matrixSize; i++)
	    circuitRightSide[i].set(0, 0);
	omega = 2*pi*frequency;
	

	// stamp linear circuit elements
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    ce.stamp();
	}
	//System.out.println("ac4");

	if (needsClosure) {
	// determine nodes that are unconnected
	boolean closure[] = new boolean[nodeList.size()];
	boolean changed = true;
	boolean neededClosure = false;
	closure[0] = true;
	while (changed) {
	    changed = false;
	    for (i = 0; i != elmList.size(); i++) {
		CircuitElm ce = getElm(i);
		// loop through all ce's nodes to see if they are connected
		// to other nodes not in closure
		for (j = 0; j < ce.getConnectionNodeCount(); j++) {
		    if (!closure[ce.getConnectionNode(j)]) {
			if (ce.hasGroundConnection(j))
			    closure[ce.getConnectionNode(j)] = changed = true;
			continue;
		    }
		    int k;
		    for (k = 0; k != ce.getConnectionNodeCount(); k++) {
			if (j == k)
			    continue;
			int kn = ce.getConnectionNode(k);
			if (ce.getConnection(j, k) && !closure[kn]) {
			    closure[kn] = true;
			    changed = true;
			}
		    }
		}
	    }
	    if (changed)
		continue;

	    // connect unconnected nodes
	    for (i = 0; i != nodeList.size(); i++)
		if (!closure[i] && !getCircuitNode(i).internal) {
		    console("node " + i + " unconnected");
		    stampResistor(0, i, 1e8);
		    neededClosure = true;
		    closure[i] = true;
		    changed = true;
		    break;
		}
	}
	needsClosure = neededClosure;
	}
	
	circuitMatrixSize = matrixSize;
	if (false) {
	    for (j = 0; j != circuitMatrixSize; j++) {
		String s = "";
		for (i = 0; i != circuitMatrixSize; i++)
		    s += circuitMatrix[j][i].asString() + ",";
		s += "  " + circuitRightSide[j].asString();
		console(s);
	    }
	    console("");
	}
	if (!lu_factor(circuitMatrix, circuitMatrixSize, circuitPermute)) {
	    stop("Singular matrix!", null);
	    return;
	}
	
	lu_solve(circuitMatrix, circuitMatrixSize, circuitPermute,
		 circuitRightSide);
    }

    void animateCircuit() {
	frequency = animateFreq;
	solveCircuit();
	double steprate = 160*getIterCount();
	long tm = System.currentTimeMillis();
	double tadd = (tm-lastIterTime)*steprate*timeStep/1000;
	if (lastIterTime == 0)
	    tadd = 0;
	t += tadd;
	double phase = frequency*2*pi*t;
	phaseShift.set(1, 0);
	phaseShift.rotate(phase);
	int i, j, k;
	for (j = 0; j != circuitMatrixFullSize; j++) {
	    circuitRightSide[j].rotate(phase);
	    double vr = circuitRightSide[j].re * CircuitElm.voltageRange;
	    double vi = circuitRightSide[j].im * CircuitElm.voltageRange;
	    if (j < nodeList.size()-1) {
		CircuitNode cn = getCircuitNode(j+1);
		for (k = 0; k != cn.links.size(); k++) {
		    CircuitNodeLink cnl = (CircuitNodeLink)
			cn.links.elementAt(k);
		    cnl.elm.setNodeVoltage(cnl.num, vr, vi);
		}
	    } else {
		int ji = j-(nodeList.size()-1);
		//System.out.println("setting vsrc " + ji + " to " + res);
		voltageSources[ji].setCurrent(ji, vr, vi);
	    }
	}
	lastIterTime = tm;
    }
    
    Complex [][] build_matrix(int sz) {
	int i,j;
	Complex m[][] = new Complex[sz][sz];
	for (i = 0; i != sz; i++)
	    for (j = 0; j != sz; j++)
		m[i][j] = new Complex();
	return m;
    }

    Complex [] build_vector(int sz) {
	int i;
	Complex m[] = new Complex[sz];
	for (i = 0; i != sz; i++)
	    m[i] = new Complex();
	return m;
    }

    void calcCircuitBottom() {
	int i;
	circuitBottom = 0;
	for (i = 0; i != elmList.size(); i++) {
	    Rectangle rect = getElm(i).boundingBox;
	    int bottom = rect.height + rect.y;
	    if (bottom > circuitBottom)
		circuitBottom = bottom;
	}
    }
    
    class FindPathInfo {
	static final int INDUCT  = 1;
	static final int VOLTAGE = 2;
	static final int SHORT   = 3;
	static final int CAP_V   = 4;
	boolean used[];
	int dest;
	CircuitElm firstElm;
	int type;
	FindPathInfo(int t, CircuitElm e, int d) {
	    dest = d;
	    type = t;
	    firstElm = e;
	    used = new boolean[nodeList.size()];
	}
	boolean findPath(int n1) { return findPath(n1, -1); }
	boolean findPath(int n1, int depth) {
	    if (n1 == dest)
		return true;
	    if (depth-- == 0)
		return false;
	    if (used[n1]) {
		//System.out.println("used " + n1);
		return false;
	    }
	    used[n1] = true;
	    int i;
	    for (i = 0; i != elmList.size(); i++) {
		CircuitElm ce = getElm(i);
		if (ce == firstElm)
		    continue;
		if (type == INDUCT) {
		    // inductors need a path free of current sources
		    if (ce instanceof CurrentElm)
			continue;
		}
		if (type == VOLTAGE) {
		    // when checking for voltage loops, we only care about voltage sources/wires
		    if (!(ce.isWire() || ce instanceof VoltageElm))
			continue;
		}
		// when checking for shorts, just check wires
		if (type == SHORT && !ce.isWire())
		    continue;
		if (type == CAP_V) {
		    // checking for capacitor/voltage source loops
		    if (!(ce.isWire() || ce instanceof CapacitorElm || ce instanceof VoltageElm))
			continue;
		}
		if (n1 == 0) {
		    // look for posts which have a ground connection;
		    // our path can go through ground
		    int j;
		    for (j = 0; j != ce.getConnectionNodeCount(); j++)
			if (ce.hasGroundConnection(j) &&
			    findPath(ce.getConnectionNode(j), depth)) {
			    used[n1] = false;
			    return true;
			}
		}
		int j;
		for (j = 0; j != ce.getConnectionNodeCount(); j++) {
		    //System.out.println(ce + " " + ce.getNode(j));
		    if (ce.getConnectionNode(j) == n1)
			break;
		}
		if (j == ce.getConnectionNodeCount())
		    continue;
		if (ce.hasGroundConnection(j) && findPath(0, depth)) {
		    //System.out.println(ce + " has ground");
		    used[n1] = false;
		    return true;
		}
		if (type == INDUCT && ce instanceof InductorElm) {
		    // inductors can use paths with other inductors of matching current
		    double c = ce.getCurrent();
		    if (j == 0)
			c = -c;
		    //System.out.println("matching " + c + " to " + firstElm.getCurrent());
		    //System.out.println(ce + " " + firstElm);
		    if (Math.abs(c-firstElm.getCurrent()) > 1e-10)
			continue;
		}
		int k;
		for (k = 0; k != ce.getConnectionNodeCount(); k++) {
		    if (j == k)
			continue;
//		    console(ce + " " + ce.getNode(j) + "-" + ce.getNode(k));
		    if (ce.getConnection(j, k) && findPath(ce.getConnectionNode(k), depth)) {
			//System.out.println("got findpath " + n1);
			used[n1] = false;
			return true;
		    }
		    //System.out.println("back on findpath " + n1);
		}
	    }
	    used[n1] = false;
	    //System.out.println(n1 + " failed");
	    return false;
	}
    }

    void stop(String s, CircuitElm ce) {
	stopMessage = s;
	circuitMatrix = null;
	stopElm = ce;
	stoppedCheck.setState(true);
	analyzeFlag = false;
//	cv.repaint();
    }
    
    // stamp independent voltage source #vs, from n1 to n2, amount v
    void stampVoltageSource(int n1, int n2, int vs, double v) {
	int vn = nodeList.size()+vs;
	stampMatrix(vn, n1, -1);
	stampMatrix(vn, n2, 1);
	stampRightSide(vn, v);
	stampMatrix(n1, vn, 1);
	stampMatrix(n2, vn, -1);
    }

    // control voltage source vs with voltage from n1 to n2 (must
    // also call stampVoltageSource())
    void stampVCVS(int n1, int n2, Complex coef, int vs) {
	int vn = nodeList.size()+vs;
	stampMatrix(vn, n1, coef);
	coef.mult(-1);
	stampMatrix(vn, n2, coef);
	coef.mult(-1);
    }

    // use this if the amount of voltage is going to be updated in doStep()
    void stampVoltageSource(int n1, int n2, int vs) {
	int vn = nodeList.size()+vs;
	stampMatrix(vn, n1, -1);
	stampMatrix(vn, n2, 1);
	stampRightSide(vn);
	stampMatrix(n1, vn, 1);
	stampMatrix(n2, vn, -1);
    }
    
    void updateVoltageSource(int n1, int n2, int vs, double v) {
	int vn = nodeList.size()+vs;
	stampRightSide(vn, v);
    }
    
    void stampResistor(int n1, int n2, double r) {
	double r0 = 1/r;
	if (Double.isNaN(r0) || Double.isInfinite(r0)) {
	    System.out.print("bad resistance " + r + " " + r0 + "\n");
	    int a = 0;
	    a /= a;
	}
	stampMatrix(n1, n1, r0);
	stampMatrix(n2, n2, r0);
	stampMatrix(n1, n2, -r0);
	stampMatrix(n2, n1, -r0);
    }

    void stampReactance(int n1, int n2, double x) {
	double x0 = 1/x;
	if (Double.isNaN(x0) || Double.isInfinite(x0)) {
	    System.out.print("bad reactance " + x + " " + x0 + "\n");
	    int a = 0;
	    a /= a;
	}
	stampMatrix(n1, n1, 0, x0);
	stampMatrix(n2, n2, 0, x0);
	stampMatrix(n1, n2, 0, -x0);
	stampMatrix(n2, n1, 0, -x0);
    }
    
    void stampConductance(int n1, int n2, double r0) {
	stampMatrix(n1, n1, r0);
	stampMatrix(n2, n2, r0);
	stampMatrix(n1, n2, -r0);
	stampMatrix(n2, n1, -r0);
    }

    // current from cn1 to cn2 is equal to voltage from vn1 to 2, divided by g
    void stampVCCurrentSource(int cn1, int cn2, int vn1, int vn2, double g) {
	stampMatrix(cn1, vn1, g);
	stampMatrix(cn2, vn2, g);
	stampMatrix(cn1, vn2, -g);
	stampMatrix(cn2, vn1, -g);
    }

    void stampCurrentSource(int n1, int n2, double i) {
	stampRightSide(n1, -i);
	stampRightSide(n2, i);
    }

    // stamp a current source from n1 to n2 depending on current through vs
    void stampCCCS(int n1, int n2, int vs, double gain) {
	int vn = nodeList.size()+vs;
	stampMatrix(n1, vn, gain);
	stampMatrix(n2, vn, -gain);
    }

    void stampMatrix(int i, int j, double x) {
	stampMatrix(i, j, x, 0);
    }
    
    void stampMatrix(int i, int j, Complex x) {
	stampMatrix(i, j, x.re, x.im);
    }
    
    // stamp value x in row i, column j, meaning that a voltage change
    // of dv in node j will increase the current into node i by x dv.
    // (Unless i or j is a voltage source node.)
    void stampMatrix(int i, int j, double re, double im) {
	if (i > 0 && j > 0) {
	    if (circuitNeedsMap) {
		i = circuitRowInfo[i-1].mapRow;
		RowInfo ri = circuitRowInfo[j-1];
		if (ri.type == RowInfo.ROW_CONST) {
		    //System.out.println("Stamping constant " + i + " " + j + " " + x);
		    if (im != 0)
			System.out.println("STAMPING COMPLEX CONSTANT!");
		    circuitRightSide[i].add(-re*ri.value, 0);
		    return;
		}
		j = ri.mapCol;
		//System.out.println("stamping " + i + " " + j + " " + x);
	    } else {
		i--;
		j--;
	    }
	    circuitMatrix[i][j].add(re, im);
	}
    }

    // stamp value x on the right side of row i, representing an
    // independent current source flowing into node i
    void stampRightSide(int i, double x) {
	if (i > 0) {
	    if (circuitNeedsMap) {
		i = circuitRowInfo[i-1].mapRow;
		//System.out.println("stamping " + i + " " + x);
	    } else
		i--;
	    circuitRightSide[i].add(x, 0);
	}
    }

    // indicate that the value on the right side of row i changes in doStep()
    void stampRightSide(int i) {
	//System.out.println("rschanges true " + (i-1));
	if (i > 0)
	    circuitRowInfo[i-1].rsChanges = true;
    }
    
    // indicate that the values on the left side of row i change in doStep()
    void stampNonLinear(int i) {
	if (i > 0)
	    circuitRowInfo[i-1].lsChanges = true;
    }


    double getIterCount() {
    	// IES - remove interaction
	if (speedBar.getValue() == 0)
	   return 0;

	 return .1*Math.exp((speedBar.getValue()-61)/24.);

    }
    

    int min(int a, int b) { return (a < b) ? a : b; }
    int max(int a, int b) { return (a > b) ? a : b; }

    
    
    void editFuncPoint(int x, int y) {
	// XXX
//	cv.repaint(pause);
    }

//    public void componentHidden(ComponentEvent e){}
//    public void componentMoved(ComponentEvent e){}
//    public void componentShown(ComponentEvent e) {
//	//cv.repaint();
//    }

//    public void componentResized(ComponentEvent e) {
////	handleResize();
//	//cv.repaint(100);
//    }
    
    public void reset(){
    	int i;
    	for (i = 0; i != elmList.size(); i++)
    		getElm(i).reset();
    	for (i = 0; i != scopeCount; i++)
    		scopes[i].resetGraph();
    	// TODO: Will need to do IE bug fix here?
//    	analyzeFlag = true;
    	t=0;
    	stoppedCheck.setState(false);
    }
    
    // IES - remove interaction
    public void menuPerformed(String menu, String item) {
    	if (item=="about")
    		aboutBox = new AboutBox(circuitjs1.versionString); 
    	if (item=="importfromlocalfile") {
    		pushUndo();
    		loadFileInput.click();
    	}
    	if (item=="importfromtext") {
    		importFromTextDialog = new ImportFromTextDialog(this);
    	}
    	if (item=="exportasurl") {
    		doExportAsUrl();
    	}
    	if (item=="exportaslocalfile")
    		doExportAsLocalFile();
    	if (item=="exportastext")
    		doExportAsText();
    	if ((menu=="elm" || menu=="scopepop") && contextPanel!=null)
    		contextPanel.hide();
    	if (menu=="options" && item=="other")
    		doEdit(new EditOptions(this));
    	//   public void actionPerformed(ActionEvent e) {
    	//	String ac = e.getActionCommand();
    	//	if (e.getSource() == resetButton) {
    	//	    int i;
    	//	    
    	//	    // on IE, drawImage() stops working inexplicably every once in
    	//	    // a while.  Recreating it fixes the problem, so we do that here.
    	//	    dbimage = main.createImage(winSize.width, winSize.height);
    	//	    
    	//	    for (i = 0; i != elmList.size(); i++)
    	//		getElm(i).reset();
    	//	    // IES - removal of scopes
    	//	   // for (i = 0; i != scopeCount; i++)
    	//		// scopes[i].resetGraph();
    	//	    analyzeFlag = true;
    	//	    t = 0;
    	//	    stoppedCheck.setState(false);
    	//	    cv.repaint();
    	//	}
    	//	if (e.getSource() == dumpMatrixButton)
    	//	    dumpMatrix = true;
    	// IES - remove import export
    	//	if (e.getSource() == exportItem)
    	//	    doExport(false);
    	//	if (e.getSource() == optionsItem)
    	//	    doEdit(new EditOptions(this));
    	//	if (e.getSource() == importItem)
    	//	    doImport();
    	//	if (e.getSource() == exportLinkItem)
    	//	    doExport(true);
    	if (item=="undo")
    		doUndo();
    	if (item=="redo")
    		doRedo();
    	if (item == "cut") {
    		if (menu!="elm")
    			menuElm = null;
    		doCut();
    	}
    	if (item == "copy") {
    		if (menu!="elm")
    			menuElm = null;
    		doCopy();
    	}
    	if (item=="paste")
    		doPaste();
    	if (item=="selectAll")
    		doSelectAll();
    	//	if (e.getSource() == exitItem) {
    	//	    destroyFrame();
    	//	    return;
    	//	}
    	
    	if (item=="centercircuit") {
    		pushUndo();
    		centerCircuit();
    	}
    	if (item=="stackAll")
    		stackAll();
    	if (item=="unstackAll")
    		unstackAll();
    	if (menu=="elm" && item=="edit")
    		doEdit(menuElm);
    	if (item=="delete") {
    		if (menu=="elm")
    			menuElm = null;
    		doDelete();
    	}

    	if (item=="viewInScope" && menuElm != null) {
    		int i;
    		for (i = 0; i != scopeCount; i++)
    			if (scopes[i].elm == null)
    				break;
    		if (i == scopeCount) {
    			if (scopeCount == scopes.length)
    				return;
    			scopeCount++;
    			scopes[i] = new Scope(this);
    			scopes[i].position = i;
    			//handleResize();
    		}
    		scopes[i].setElm(menuElm);
    	}
    	if (menu=="scopepop") {
    		pushUndo();
    		if (item=="remove")
    			scopes[menuScope].setElm(null);
    		if (item=="speed2")
    			scopes[menuScope].speedUp();
    		if (item=="speed1/2")
    			scopes[menuScope].slowDown();
    		if (item=="scale")
    			scopes[menuScope].adjustScale(.5);
    		if (item=="maxscale")
    			scopes[menuScope].adjustScale(1e-50);
    		if (item=="stack")
    			stackScope(menuScope);
    		if (item=="unstack")
    			unstackScope(menuScope);
    		if (item=="selecty")
    			scopes[menuScope].selectY();
    		if (item=="reset")
    			scopes[menuScope].resetGraph();
    		if (item.indexOf("show")==0 || item=="plotxy" || item=="showfft")
    			scopes[menuScope].handleMenu(item);
    		//cv.repaint();
    	}
    	if (menu=="circuits" && item.indexOf("setup ") ==0) {
    		pushUndo();
    		readSetupFile(item.substring(6),"", true);
    	}
    		
    	//	if (ac.indexOf("setup ") == 0) {
    	//	    pushUndo();
    	//	    readSetupFile(ac.substring(6),
    	//			  ((MenuItem) e.getSource()).getLabel());
    	//	}

    	// IES: Moved from itemStateChanged()
    	if (menu=="main") {
    		if (contextPanel!=null)
    			contextPanel.hide();
    		//	MenuItem mmi = (MenuItem) mi;
    		//		int prevMouseMode = mouseMode;
    		setMouseMode(MODE_ADD_ELM);
    		String s = item;
    		if (s.length() > 0)
    			mouseModeStr = s;
    		if (s.compareTo("DragAll") == 0)
    			setMouseMode(MODE_DRAG_ALL);
    		else if (s.compareTo("DragRow") == 0)
    			setMouseMode(MODE_DRAG_ROW);
    		else if (s.compareTo("DragColumn") == 0)
    			setMouseMode(MODE_DRAG_COLUMN);
    		else if (s.compareTo("DragSelected") == 0)
    			setMouseMode(MODE_DRAG_SELECTED);
    		else if (s.compareTo("DragPost") == 0)
    			setMouseMode(MODE_DRAG_POST);
    		else if (s.compareTo("Select") == 0)
    			setMouseMode(MODE_SELECT);
    		//		else if (s.length() > 0) {
    		//			try {
    		//				addingClass = Class.forName(s);
    		//			} catch (Exception ee) {
    		//				ee.printStackTrace();
    		//			}
    		//		}
    		//		else
    		//			setMouseMode(prevMouseMode);
    		tempMouseMode = mouseMode;
    	}
    }
    

    void stackScope(int s) {
    	if (s == 0) {
    		if (scopeCount < 2)
    			return;
    		s = 1;
    	}
    	if (scopes[s].position == scopes[s-1].position)
    		return;
    	scopes[s].position = scopes[s-1].position;
    	for (s++; s < scopeCount; s++)
    		scopes[s].position--;
    }

    void unstackScope(int s) {
    	if (s == 0) {
    		if (scopeCount < 2)
    			return;
    		s = 1;
    	}
    	if (scopes[s].position != scopes[s-1].position)
    		return;
    	for (; s < scopeCount; s++)
    		scopes[s].position++;
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
   

    void doEdit(Editable eable) {
    	clearSelection();
    	pushUndo();
    	if (editDialog != null) {
    //		requestFocus();
    		editDialog.setVisible(false);
    		editDialog = null;
    	}
    	editDialog = new EditDialog(eable, this);
    	editDialog.show();
    }
    
// IES - remove import export
    /*
    void doImport() {
	if (impDialog == null)
	    impDialog = ImportExportDialogFactory.Create(this,
		ImportExportDialog.Action.IMPORT);
//	    impDialog = new ImportExportClipboardDialog(this,
//		ImportExportDialog.Action.IMPORT);
	pushUndo();
	impDialog.execute();
    }
    */

    void doExportAsUrl()
    {
    	String start[] = Location.getHref().split("\\?");
    	String dump = dumpCircuit();
    	dump=dump.replace(' ', '+');
	    dump = start[0] + "?cct=" + URL.encode(dump);
//	if (expDialog == null) {
//	    expDialog = ImportExportDialogFactory.Create(this,
//		 ImportExportDialog.Action.EXPORT);
////	    expDialog = new ImportExportClipboardDialog(this,
////		 ImportExportDialog.Action.EXPORT);
//	}
//        expDialog.setDump(dump);
//	expDialog.execute();
	    exportAsUrlDialog = new ExportAsUrlDialog(dump);
	    exportAsUrlDialog.show();
    }
    
    
    void doExportAsText()
    {
    	String dump = dumpCircuit();
	    exportAsTextDialog = new ExportAsTextDialog(this, dump);
	    exportAsTextDialog.show();
    }
    
    
    void doExportAsLocalFile() {
    	String dump = dumpCircuit();
    	exportAsLocalFileDialog = new ExportAsLocalFileDialog(dump);
    	exportAsLocalFileDialog.show();
    }
    
    String dumpCircuit() {
	int i;
	CustomLogicModel.clearDumpedFlags();
	int f = (dotsCheckItem.getState()) ? 1 : 0;
	f |= (smallGridCheckItem.getState()) ? 2 : 0;
//	f |= (voltsCheckItem.getState()) ? 0 : 4;
	f |= (powerCheckItem.getState()) ? 8 : 0;
	f |= (showValuesCheckItem.getState()) ? 0 : 16;
	// 32 = linear scale in afilter
	String dump = "$ " + f + " " +
	    timeStep + " " + 5 + " " +
	    currentBar.getValue() + " " + CircuitElm.voltageRange + " " +
	    powerBar.getValue() + "\n";
	f = 0;
	f |= (linearCheckItem.getState()) ? 1 : 0;
	f |= (polesCheckItem.getState()) ? 2 : 0;
	f |= (phaseCheckItem.getState()) ? 4 : 0;
	dump += "% " + f + " " + maxFrequency + "\n";
		
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (ce instanceof CustomLogicElm) {
		String m = ((CustomLogicElm)ce).dumpModel();
		if (!m.isEmpty())
		    dump += m + "\n";
	    }
	    dump += ce.dump() + "\n";
	}
	for (i = 0; i != scopeCount; i++) {
	    String d = scopes[i].dump();
	    if (d != null)
		dump += d + "\n";
	}
	if (hintType != -1)
	    dump += "h " + hintType + " " + hintItem1 + " " +
		hintItem2 + "\n";
	return dump;
    }

    void setupResponse() {
	// default = 25000, range = 1000 .. 20Ghz
	double log1 = Math.log(1000/minFrequency);
	double log2 = Math.log(2e10/minFrequency);
	maxFrequency = minFrequency *
	    Math.exp(log1+(log2-log1)*zoomBar.getValue()/100.);
	freqLogRange = Math.log(maxFrequency/minFrequency);
	minLogFrequency = Math.log(minFrequency);
	analyzeFlag = true;
    }

    void scrollChanged() {
        int newminx = -scrollXBar.getValue();
        int oldminx = circuitBbox.x;
        int dx = snapGrid(newminx-oldminx);
        console("moveall " + dx + " " + scrollXBar.getValue() + " " + circuitBbox.x);
        moveAll(dx, 0);
    }
    
//    public void adjustmentValueChanged(AdjustmentEvent e) {
	//System.out.print(((Scrollbar) e.getSource()).getValue() + "\n");
  //  }

    // IES - remove interaction
//    ByteArrayOutputStream readUrlData(URL url) throws java.io.IOException {
//	Object o = url.getContent();
//	FilterInputStream fis = (FilterInputStream) o;
//	ByteArrayOutputStream ba = new ByteArrayOutputStream(fis.available());
//	int blen = 1024;
//	byte b[] = new byte[blen];
//	while (true) {
//	    int len = fis.read(b);
//	    if (len <= 0)
//		break;
//	    ba.write(b, 0, len);
//	}
//	return ba;
//    }

    // IES - remove interaction
    
//    URL getCodeBase() {
//	try {
//	    if (applet != null)
//		return applet.getCodeBase();
//	    File f = new File(".");
//	    return new URL("file:" + f.getCanonicalPath() + "/");
//	} catch (Exception e) {
//	    e.printStackTrace();
//	    return null;
//	}
//    }
    
 
    void getSetupList(final boolean openDefault) {

    	String url;
    	url = GWT.getModuleBaseURL()+"setuplist.txt"+"?v="+random.nextInt(); 
		RequestBuilder requestBuilder = new RequestBuilder(RequestBuilder.GET, url);
		try {
			requestBuilder.sendRequest(null, new RequestCallback() {
				public void onError(Request request, Throwable exception) {
					GWT.log("File Error Response", exception);
				}

				public void onResponseReceived(Request request, Response response) {
					// processing goes here
					if (response.getStatusCode()==Response.SC_OK) {
					String text = response.getText();
					processSetupList(text.getBytes(), text.length(), openDefault);
					// end or processing
					}
					else 
						GWT.log("Bad file server response:"+response.getStatusText() );
				}
			});
		} catch (RequestException e) {
			GWT.log("failed file reading", e);
		}
    }
		
    void processSetupList(byte b[], int len, final boolean openDefault) {
    	MenuBar currentMenuBar;
    	MenuBar stack[] = new MenuBar[6];
    	int stackptr = 0;
    	currentMenuBar=new MenuBar(true);
    	currentMenuBar.setAutoOpen(true);
    	menuBar.addItem("Circuits",currentMenuBar);
    	stack[stackptr++] = currentMenuBar;
    	int p;
    	for (p = 0; p < len; ) {
    		int l;
    		for (l = 0; l != len-p; l++)
    			if (b[l+p] == '\n') {
    				l++;
    				break;
    			}
    		String line = new String(b, p, l-1);
    		if (line.charAt(0) == '#')
    			;
    		else if (line.charAt(0) == '+') {
    		//	MenuBar n = new Menu(line.substring(1));
    			MenuBar n = new MenuBar(true);
    			n.setAutoOpen(true);
    			currentMenuBar.addItem(line.substring(1),n);
    			currentMenuBar = stack[stackptr++] = n;
    		} else if (line.charAt(0) == '-') {
    			currentMenuBar = stack[--stackptr-1];
    		} else {
    			int i = line.indexOf(' ');
    			if (i > 0) {
    				String title = line.substring(i+1);
    				boolean first = false;
    				if (line.charAt(0) == '>')
    					first = true;
    				String file = line.substring(first ? 1 : 0, i);
 //   				menu.add(getMenuItem(title, "setup " + file));
    				currentMenuBar.addItem(new MenuItem(title, new MyCommand("circuits", "setup "+file)));
    				if (first && startCircuit == null) {
    					startCircuit = file;
    					startLabel = title;
    					if (openDefault && stopMessage == null)
    						readSetupFile(startCircuit, startLabel, true);
    				}
    			}
    		}
    		p += l;
    	}
}

    
    
    

    void readSetup(String text, boolean center) {
	readSetup(text, false, center);
    }
    
    void readSetup(String text, boolean retain, boolean center) {
	readSetup(text.getBytes(), text.length(), retain, center);
	// IES - remove interaction
	// titleLabel.setText("untitled");
    }


	void readSetupFile(String str, String title, boolean center) {
		t = 0;
		System.out.println(str);
//		try {
		// TODO: Maybe think about some better approach to cache management!
			String url=GWT.getModuleBaseURL()+"circuits/"+str+"?v="+random.nextInt(); 
			loadFileFromURL(url, center);
	//		URL url = new URL(getCodeBase() + "circuits/" + str);
//			ByteArrayOutputStream ba = readUrlData(url);
//			readSetup(ba.toByteArray(), ba.size(), false);
//		} catch (Exception e1) {
//			try {
//				URL url = getClass().getClassLoader().getResource(
//						"circuits/" + str);
//				ByteArrayOutputStream ba = readUrlData(url);
//				readSetup(ba.toByteArray(), ba.size(), false);
//			} catch (Exception e) {
//				e.printStackTrace();
//				stop("Unable to read " + str + "!", null);
//			}
	//	}
		// IES - remove interaction
		// titleLabel.setText(title);
	}
	
	void loadFileFromURL(String url, final boolean center) {
		RequestBuilder requestBuilder = new RequestBuilder(RequestBuilder.GET, url);
		try {
			requestBuilder.sendRequest(null, new RequestCallback() {
				public void onError(Request request, Throwable exception) {
					GWT.log("File Error Response", exception);
				}

				public void onResponseReceived(Request request, Response response) {
					if (response.getStatusCode()==Response.SC_OK) {
					String text = response.getText();
					readSetup(text.getBytes(), text.length(), false, center);
					}
					else 
						GWT.log("Bad file server response:"+response.getStatusText() );
				}
			});
		} catch (RequestException e) {
			GWT.log("failed file reading", e);
		}
		
	}

    void readSetup(byte b[], int len, boolean retain, boolean center) {
	int i;
	if (!retain) {
	    clearMouseElm();
	    for (i = 0; i != elmList.size(); i++) {
		CircuitElm ce = getElm(i);
		ce.delete();
	    }
	    elmList.removeAllElements();
	    releaseCustomizer();
	    hintType = -1;
	    timeStep = 5e-6;
	    dotsCheckItem.setState(true);
	    smallGridCheckItem.setState(false);
	    powerCheckItem.setState(false);
	    voltsCheckItem.setState(true);
	    showValuesCheckItem.setState(true);
	    setGrid();
	    speedBar.setValue(117); // 57
	    currentBar.setValue(50);
	    powerBar.setValue(50);
	    zoomBar.setValue(20);
	    linearCheckItem.setState(false);;
	    CircuitElm.voltageRange = 5;
	    scopeCount = 0;
	    lastIterTime = 0;
	}
	//cv.repaint();
	int p;
	for (p = 0; p < len; ) {
	    int l;
	    int linelen = len-p; // IES - changed to allow the last line to not end with a delim.
	    for (l = 0; l != len-p; l++)
		if (b[l+p] == '\n' || b[l+p] == '\r') {
		    linelen = l++;
		    if (l+p < b.length && b[l+p] == '\n')
			l++;
		    break;
		}
	    String line = new String(b, p, linelen);
            try {
                undump(line);
//            } catch (java.lang.reflect.InvocationTargetException ee) {
//                ee.getTargetException().printStackTrace();
            } catch (Exception ee) {
                ee.printStackTrace();
            }
	    p += l;
	    
	}
	if (customizer != null)
	    customizer.create();
	animateFreq = 0;
	setVPACheck(admittanceCheckItem);
	setPowerBarEnable();
	enableItems();
	setupResponse();
//	if (!retain)
	//    handleResize(); // for scopes
	needAnalyze();
	if (center)
		centerCircuit();
    }

    CircuitElm undump(String line) throws Exception
    {
	    StringTokenizer st = new StringTokenizer(line, " +\t\n\r\f");
	    if (!st.hasMoreTokens())
		return null;
	    
		String type = st.nextToken();
		int tint = type.charAt(0);
		
		    if (tint == 'o') {
			Scope sc = new Scope(this);
			sc.position = scopeCount;
			sc.undump(st);
			scopes[scopeCount++] = sc;
		            return null;
		    }
		    if (tint == 'h') {
			readHint(st);
		            return null;
		    }
		    if (tint == '?') {
			readCustomizer(st);
		            return null;
		    }
		    if (tint == '%') {
			readFreqOptions(st);
		            return null;
		    }
		    if (tint == '$') {
			readOptions(st);
		            return null;
		    }
		    if (tint == '!') {
			new CustomLogicModel(st);
		            return null;
		    }
		    if (tint >= '0' && tint <= '9')
			tint = new Integer(type).intValue();
		    int x1 = new Integer(st.nextToken()).intValue();
		    int y1 = new Integer(st.nextToken()).intValue();
		    int x2 = new Integer(st.nextToken()).intValue();
		    int y2 = new Integer(st.nextToken()).intValue();
		    int f  = new Integer(st.nextToken()).intValue();
		    // The following lines are functionally replaced by the call to
		    // createCe below
//		    Class cls = dumpTypes[tint];
//		    if (cls == null) {
//			System.out.println("unrecognized dump type: " + type);
//			break;
//		    }
//		    // find element class
//		    Class carr[] = new Class[6];
//		    //carr[0] = getClass();
//		    carr[0] = carr[1] = carr[2] = carr[3] = carr[4] =
//			int.class;
//		    carr[5] = StringTokenizer.class;
//		    Constructor cstr = null;
//		    cstr = cls.getConstructor(carr);
//		
//		    // invoke constructor with starting coordinates
//		    Object oarr[] = new Object[6];
//		    //oarr[0] = this;
//		    oarr[0] = new Integer(x1);
//		    oarr[1] = new Integer(y1);
//		    oarr[2] = new Integer(x2);
//		    oarr[3] = new Integer(y2);
//		    oarr[4] = new Integer(f );
//		    oarr[5] = st;
//		    ce = (CircuitElm) cstr.newInstance(oarr);
		    CircuitElm newce = createCe(tint, x1, y1, x2, y2, f, st);
		    if (newce==null) {
				System.out.println("unrecognized dump type: " + type);
				return null;
			    }
		    newce.setPoints();
		    elmList.addElement(newce);
		    return newce;
    }
    
    void readHint(StringTokenizer st) {
	hintType  = new Integer(st.nextToken()).intValue();
	hintItem1 = new Integer(st.nextToken()).intValue();
	hintItem2 = new Integer(st.nextToken()).intValue();
    }

    void readCustomizer(StringTokenizer st) {
 	int flags = new Integer(st.nextToken()).intValue();
 	String s = st.nextToken();
 	if (s == "FilterCustomizer")
 	    customizer = new FilterCustomizer(flags, st);
 	else if (s == "ScaleFilter")
 	    customizer = new ScaleFilter(flags, st);
 	else if (s == "BandPassActiveFilter")
 	    customizer = new BandPassActiveFilter(flags, st);
 	else if (s == "ButterFilter")
 	    customizer = new ButterFilter(flags, st);
 	else if (s == "HighActiveFilter")
 	    customizer = new HighActiveFilter(flags, st);
 	else if (s == "LowActiveFilter")
 	    customizer = new LowActiveFilter(flags, st);
 	else if (s == "RLCFilter")
 	    customizer = new RLCFilter(flags, st);
 	else if (s == "PassiveFilter")
 	    customizer = new PassiveFilter(flags, st);
 	else
 	    console("unknown customizer " + s);
    }
    
    void releaseCustomizer() {
 	if (customizer != null) {
 	    customizer.delete();
 	    customizer = null;
 	}
    }

    void readOptions(StringTokenizer st) {
	int flags = new Integer(st.nextToken()).intValue();
	// IES - remove inteaction
	dotsCheckItem.setState((flags & 1) != 0);
	smallGridCheckItem.setState((flags & 2) != 0);
	voltsCheckItem.setState((flags & 4) == 0);
	powerCheckItem.setState((flags & 8) == 8);
	showValuesCheckItem.setState((flags & 16) == 0);
	timeStep = new Double (st.nextToken()).doubleValue();
	double sp = new Double(st.nextToken()).doubleValue();
	int sp2 = (int) (Math.log(10*sp)*24+61.5);
	//int sp2 = (int) (Math.log(sp)*24+1.5);
	speedBar.setValue(sp2);
	currentBar.setValue(new Integer(st.nextToken()).intValue());
	CircuitElm.voltageRange = new Double (st.nextToken()).doubleValue();

	try {
	    powerBar.setValue(new Integer(st.nextToken()).intValue());
	} catch (Exception e) {
	}
	setGrid();
    }
    
    void readFreqOptions(StringTokenizer st) {
	int flags = new Integer(st.nextToken()).intValue();
	linearCheckItem.setState((flags & 1) != 0);
	//polesCheckItem.setState((flags & 2) != 0);
	phaseCheckItem.setState((flags & 4) != 0);
	double mf = new Double(st.nextToken()).doubleValue();
	double log1 = Math.log(1000/minFrequency);
	double log2 = Math.log(2e10/minFrequency);
	int mfi = (int) ((Math.log(mf/minFrequency)-log1)*100/(log2-log1));
	zoomBar.setValue(mfi);
    }

    int snapGrid(int x) {
	return (x+gridRound) & gridMask;
    }

	boolean doSwitch(int x, int y) {
		if (mouseElm == null || !(mouseElm instanceof SwitchElm))
			return false;
		SwitchElm se = (SwitchElm) mouseElm;
		se.toggle();
		if (se.momentary)
			heldSwitchElm = se;
		needAnalyze();
		return true;
	}

    int locateElm(CircuitElm elm) {
	int i;
	for (i = 0; i != elmList.size(); i++)
	    if (elm == elmList.elementAt(i))
		return i;
	return -1;
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
    	if (!circuitArea.contains(e.getX(), e.getY()))
    		return;
    	if (dragElm != null)
    		dragElm.drag(e.getX(), e.getY());
    	boolean success = true;
    	switch (tempMouseMode) {
    	case MODE_DRAG_ALL:
    		dragAll(snapGrid(e.getX()), snapGrid(e.getY()));
    		break;
    	case MODE_DRAG_ROW:
    		dragRow(snapGrid(e.getX()), snapGrid(e.getY()));
    		break;
    	case MODE_DRAG_COLUMN:
    		dragColumn(snapGrid(e.getX()), snapGrid(e.getY()));
    		break;
    	case MODE_DRAG_POST:
    		if (mouseElm != null)
    			dragPost(snapGrid(e.getX()), snapGrid(e.getY()));
    		break;
    	case MODE_SELECT:
    		if (mouseElm == null)
    			selectArea(e.getX(), e.getY());
    		else {
    			tempMouseMode = MODE_DRAG_SELECTED;
    			success = dragSelected(e.getX(), e.getY());
    		}
    		break;
    	case MODE_DRAG_SELECTED:
    		success = dragSelected(e.getX(), e.getY());
    		break;
    	}
    	dragging = true;
    	if (success) {
    		if (tempMouseMode == MODE_DRAG_SELECTED && mouseElm instanceof GraphicElm ) {
    			dragX = e.getX(); dragY = e.getY();
    		} else {
    			dragX = snapGrid(e.getX()); dragY = snapGrid(e.getY());
    		}
    	}
    	//	cv.repaint(pause);
    }

    void dragAll(int x, int y) {
	int dx = x-dragX;
	int dy = y-dragY;
	moveAll(dx, dy);
    }

    void moveAll(int dx, int dy) {
	if (dx == 0 && dy == 0)
	    return;
	int i;
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    ce.move(dx, dy);
	}
	removeZeroLengthElements();
	circuitBbox.translate(dx, dy);
    }

    void makeRoom(int x, int dx) {
	int i;
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (ce.x > x || ce.x2 > x)
		ce.move(dx, 0);
	}
    }

    BoxElm cloneBox(BoxElm be, int dx) {
	int i;
	int size = elmList.size();
	BoxElm newbox = (BoxElm) clone(be);
	newbox.move(dx, 0);
	for (i = 0; i != size; i++) {
	    CircuitElm ce = getElm(i);
	    if (ce == be || ce == newbox)
		continue;
	    if (ce.x == be.x && ce.x2 == be.x)
		continue;
	    if ((ce.x  >= be.x && ce.x  <= be.x2) &&
		(ce.x2 >= be.x && ce.x2 <= be.x2)) {
		CircuitElm cn = clone(ce);
		cn.move(dx, 0);
	    }
	}
	return newbox;
    }

    void deleteBox(CircuitElm be) {
	int i;
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    if (ce.x == be.x && ce.x2 == be.x)
		continue;
	    if ((ce.x  >= be.x && ce.x  <= be.x2) &&
		(ce.x2 >= be.x && ce.x2 <= be.x2)) {
		//System.out.println("deleting " + ce);
		ce.delete();
		elmList.removeElementAt(i--);
	    }
	}
    }
    
    CircuitElm clone(CircuitElm ce) {
	String s = ce.dump();
	try {
	    return undump(s);
	} catch (Exception e) {
	    e.printStackTrace();
	    return null;
	}
    }

    void dragRow(int x, int y) {
    	int dy = y-dragY;
    	if (dy == 0)
    		return;
    	int i;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		if (ce.y  == dragY)
    			ce.movePoint(0, 0, dy);
    		if (ce.y2 == dragY)
    			ce.movePoint(1, 0, dy);
    	}
    	removeZeroLengthElements();
    }

    void dragColumn(int x, int y) {
    	int dx = x-dragX;
    	if (dx == 0)
    		return;
    	int i;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		if (ce.x  == dragX)
    			ce.movePoint(0, dx, 0);
    		if (ce.x2 == dragX)
    			ce.movePoint(1, dx, 0);
    	}
    	removeZeroLengthElements();
    }

    boolean dragSelected(int x, int y) {
    	boolean me = false;
    	if (mouseElm != null && !mouseElm.isSelected())
    		mouseElm.setSelected(me = true);

    	// snap grid, unless we're only dragging text elements
    	int i;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		if ( ce.isSelected() && !(ce instanceof GraphicElm) )
    			break;
    	}
    	if (i != elmList.size()) {
    		x = snapGrid(x);
    		y = snapGrid(y);
    	}

    	int dx = x-dragX;
    	int dy = y-dragY;
    	if (dx == 0 && dy == 0) {
    		// don't leave mouseElm selected if we selected it above
    		if (me)
    			mouseElm.setSelected(false);
    		return false;
    	}
    	boolean allowed = true;

    	// check if moves are allowed
    	for (i = 0; allowed && i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		if (ce.isSelected() && !ce.allowMove(dx, dy))
    			allowed = false;
    	}

    	if (allowed) {
    		for (i = 0; i != elmList.size(); i++) {
    			CircuitElm ce = getElm(i);
    			if (ce.isSelected())
    				ce.move(dx, dy);
    		}
    		needAnalyze();
    	}

    	// don't leave mouseElm selected if we selected it above
    	if (me)
    		mouseElm.setSelected(false);

    	return allowed;
    }

    void dragPost(int x, int y) {
    	if (draggingPost == -1) {
    		draggingPost =
    				(distanceSq(mouseElm.x , mouseElm.y , x, y) >
    				distanceSq(mouseElm.x2, mouseElm.y2, x, y)) ? 1 : 0;
    	}
    	int dx = x-dragX;
    	int dy = y-dragY;
    	if (dx == 0 && dy == 0)
    		return;
    	mouseElm.movePoint(draggingPost, dx, dy);
    	needAnalyze();
    }

    void selectArea(int x, int y) {
    	int x1 = min(x, initDragX);
    	int x2 = max(x, initDragX);
    	int y1 = min(y, initDragY);
    	int y2 = max(y, initDragY);
    	selectedArea = new Rectangle(x1, y1, x2-x1, y2-y1);
    	int i;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		ce.selectRect(selectedArea);
    	}
    }

//    void setSelectedElm(CircuitElm cs) {
//    	int i;
//    	for (i = 0; i != elmList.size(); i++) {
//    		CircuitElm ce = getElm(i);
//    		ce.setSelected(ce == cs);
//    	}
//    	mouseElm = cs;
//    }
    
    void setMouseElm(CircuitElm ce) {
    	if (ce!=mouseElm) {
    		if (mouseElm!=null)
    			mouseElm.setMouseElm(false);
    		if (ce!=null)
    			ce.setMouseElm(true);
    		mouseElm=ce;
    	}
    }

    void removeZeroLengthElements() {
    	int i;
    	boolean changed = false;
    	for (i = elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = getElm(i);
    		if (ce.x == ce.x2 && ce.y == ce.y2) {
    			elmList.removeElementAt(i);
    			ce.delete();
    			changed = true;
    		}
    	}
    	if (changed)
    	    needAnalyze();
    }

    public void onMouseMove(MouseMoveEvent e) {
    	e.preventDefault();
    	if (mouseDragging) {
    		mouseDragged(e);
    		return;
    	}
    	mouseSelect(e);
    }
    
    // need to break this out into a separate routine to handle selection,
    // since we don't get mouse move events on mobile
    public void mouseSelect(MouseEvent<?> e) {
    	//	The following is in the original, but seems not to work/be needed for GWT
    	//    	if (e.getNativeButton()==NativeEvent.BUTTON_LEFT)
    	//	    return;
    	CircuitElm newMouseElm=null;
    	int x = e.getX();
    	int y = e.getY();
    	dragX = snapGrid(x); dragY = snapGrid(y);
    	draggingPost = -1;
    	int i;
    	//	CircuitElm origMouse = mouseElm;

    	mousePost = -1;
    	plotXElm = plotYElm = null;
    	selectedFreq = 0;
    	if (mouseElm!=null && ( distanceSq(x, y, mouseElm.x, mouseElm.y) <= POSTGRABSQ ||
    			distanceSq(x, y, mouseElm.x2, mouseElm.y2) <= POSTGRABSQ)) {
    		newMouseElm=mouseElm;
    	} else {
    		int bestDist = 100000;
    		int bestArea = 100000;
    		for (i = 0; i != elmList.size(); i++) {
    			CircuitElm ce = getElm(i);
    			if (ce.boundingBox.contains(x, y)) {
    				int j;
    				int area = ce.boundingBox.width * ce.boundingBox.height;
    				int jn = ce.getPostCount();
    				if (jn > 2)
    					jn = 2;
    				for (j = 0; j != jn; j++) {
    					Point pt = ce.getPost(j);
    					int dist = distanceSq(x, y, pt.x, pt.y);

    					// if multiple elements have overlapping bounding boxes,
    					// we prefer selecting elements that have posts close
    					// to the mouse pointer and that have a small bounding
    					// box area.
    					if (dist <= bestDist && area <= bestArea) {
    						bestDist = dist;
    						bestArea = area;
    						newMouseElm = ce;
    					}
    				}
    				if (ce.getPostCount() == 0 && area <= bestArea) {
    				    bestArea = area;
    				    newMouseElm = ce;
    				}
    			}
    		} // for
    	}
    	scopeSelected = -1;
    	if (newMouseElm == null) {
    	    if (responseArea.contains(x, y))
    		selectedFreq = linearToFrequency(x/(double) responseArea.width);
    		//	    // the mouse pointer was not in any of the bounding boxes, but we
    		//	    // might still be close to a post
    		for (i = 0; i != elmList.size(); i++) {
    			CircuitElm ce = getElm(i);
    			if (mouseMode==MODE_DRAG_POST ) {
    				if (distanceSq(ce.x, ce.y, x, y) < 26) {
    					newMouseElm = ce;
    					break;
    				}
    				if (distanceSq(ce.x2, ce.y2, x, y) < 26) {
    					newMouseElm = ce;
    					break;
    				}
    			}
    			int j;
    			int jn = ce.getPostCount();
    			for (j = 0; j != jn; j++) {
    				Point pt = ce.getPost(j);
    				//   int dist = distanceSq(x, y, pt.x, pt.y);
    				if (distanceSq(pt.x, pt.y, x, y) < 26) {
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
    			if (distanceSq(pt.x, pt.y, x, y) < 26)
    				mousePost = i;
    		}
    	}
    	//	if (mouseElm != origMouse)
    	//	    cv.repaint();
    	setMouseElm(newMouseElm);
    }

    int distanceSq(int x1, int y1, int x2, int y2) {
	x2 -= x1;
	y2 -= y1;
	return x2*x2+y2*y2;
    }

    public void onContextMenu(ContextMenuEvent e) {
    	e.preventDefault();
    	menuX = e.getNativeEvent().getClientX();
    	menuY = e.getNativeEvent().getClientY();
    	doPopupMenu();
    }
    
    void doPopupMenu() {
    	menuElm = mouseElm;
    	menuScope=-1;
    	int x, y;
    	if (scopeSelected!=-1) {
    		MenuBar m=scopes[scopeSelected].getMenu();
    		menuScope=scopeSelected;
    		if (m!=null) {
    			contextPanel=new PopupPanel(true);
    			contextPanel.add(m);
    			y=Math.max(0, Math.min(menuY,cv.getCoordinateSpaceHeight()-400));
    			contextPanel.setPopupPosition(menuX, y);
    			contextPanel.show();
    		}
    	} else if (mouseElm != null) {
    		elmScopeMenuItem.setEnabled(mouseElm.canViewInScope());
    		elmEditMenuItem .setEnabled(mouseElm.getEditInfo(0) != null);
    		contextPanel=new PopupPanel(true);
    		contextPanel.add(elmMenuBar);
    		contextPanel.setPopupPosition(menuX, menuY);
    		contextPanel.show();
    	} else {
    		doMainMenuChecks();
    		contextPanel=new PopupPanel(true);
    		contextPanel.add(mainMenuBar);
    		x=Math.max(0, Math.min(menuX, cv.getCoordinateSpaceWidth()-400));
    		y=Math.max(0, Math.min(menuY,cv.getCoordinateSpaceHeight()-450));
    		contextPanel.setPopupPosition(x,y);
    		contextPanel.show();
    	}
    }
    
    void longPress() {
	doPopupMenu();
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
 //   	if (!didSwitch && mouseElm != null)
    	if (mouseElm != null && !(mouseElm instanceof SwitchElm))
    		doEdit(mouseElm);
    }
    
//    public void mouseEntered(MouseEvent e) {
//    }
    
    public void onMouseOut(MouseOutEvent e) {
	clearMouseElm();
    }

    void clearMouseElm() {
    	scopeSelected = -1;
    	mouseElm = plotXElm = plotYElm = null;
    }
    
    int menuX, menuY;
    
    public void onMouseDown(MouseDownEvent e) {
//    public void mousePressed(MouseEvent e) {
    	e.preventDefault();
    	menuX = e.getX();
    	menuY = e.getY();
    	
    	// maybe someone did copy in another window?  should really do this when
    	// window receives focus
    	enablePaste();
    	
    	// IES - hack to only handle left button events in the web version.
    	if (e.getNativeButton() != NativeEvent.BUTTON_LEFT)
    		return;
    	
    	// set mouseElm in case we are on mobile
    	mouseSelect(e);
    	
    	mouseDragging=true;
	didSwitch = false;
//
//	System.out.println(e.getModifiers());
//	int ex = e.getModifiersEx();
//	// IES - remove interaction
////	if ((ex & (MouseEvent.META_DOWN_MASK|
////		   MouseEvent.SHIFT_DOWN_MASK)) == 0 && e.isPopupTrigger()) {
////	    doPopupMenu(e);
////	    return;
////	}
	if (e.getNativeButton() == NativeEvent.BUTTON_LEFT) {
//	    // left mouse
	    tempMouseMode = mouseMode;
//	    if ((ex & MouseEvent.ALT_DOWN_MASK) != 0 &&
//		(ex & MouseEvent.META_DOWN_MASK) != 0)
	    if (e.isAltKeyDown() && e.isMetaKeyDown())
		tempMouseMode = MODE_DRAG_COLUMN;
//	    else if ((ex & MouseEvent.ALT_DOWN_MASK) != 0 &&
//		     (ex & MouseEvent.SHIFT_DOWN_MASK) != 0)
	    else if (e.isAltKeyDown() && e.isShiftKeyDown())
		tempMouseMode = MODE_DRAG_ROW;
//	    else if ((ex & MouseEvent.SHIFT_DOWN_MASK) != 0)
	    else if (e.isShiftKeyDown())
		tempMouseMode = MODE_SELECT;
//	    else if ((ex & MouseEvent.ALT_DOWN_MASK) != 0)
	    else if (e.isAltKeyDown())
		tempMouseMode = MODE_DRAG_ALL;
	    else if (e.isControlKeyDown() || e.isMetaKeyDown())
		tempMouseMode = MODE_DRAG_POST;
	}
//	} else if ((e.getModifiers() & MouseEvent.BUTTON3_MASK) != 0) {
//	    // right mouse
//	    if ((ex & MouseEvent.SHIFT_DOWN_MASK) != 0)
//		tempMouseMode = MODE_DRAG_ROW;
//	    else if ((ex & (MouseEvent.CTRL_DOWN_MASK|
//			    MouseEvent.META_DOWN_MASK)) != 0)
//		tempMouseMode = MODE_DRAG_COLUMN;
//	    else
//		return;
//	}
//

	if (doSwitch(e.getX(), e.getY()))
	{
            didSwitch = true;
	    return;
	}

	// IES - Grab resize handles in select mode if they are far enough apart and you are on top of them
	if (tempMouseMode == MODE_SELECT && mouseElm!=null && 
			distanceSq(mouseElm.x, mouseElm.y, mouseElm.x2, mouseElm.y2) >=256 &&
			( distanceSq(e.getX(), e.getY(), mouseElm.x, mouseElm.y) <= POSTGRABSQ ||
			  distanceSq(e.getX(), e.getY(), mouseElm.x2, mouseElm.y2) <= POSTGRABSQ) &&
			  !anySelectedButMouse() )
		tempMouseMode = MODE_DRAG_POST;
	
	if (tempMouseMode != MODE_SELECT && tempMouseMode != MODE_DRAG_SELECTED)
	    clearSelection();

	if (animateFreq > 0 && selectedFreq == 0) {
	    reset();
	    setVPACheck(admittanceCheckItem);
	}
	if (selectedFreq > 0 && animateFreq == 0)
	    setVPACheck(voltsCheckItem);
	animateFreq = selectedFreq;
	t = 0;
	setAnimateSpeed();

	pushUndo();
	initDragX = e.getX();
	initDragY = e.getY();
	dragging = true;
	if (tempMouseMode !=MODE_ADD_ELM)
		return;
//	if (tempMouseMode != MODE_ADD_ELM || addingClass == null)
//	    return;
//	
	int x0 = snapGrid(e.getX());
	int y0 = snapGrid(e.getY());
	if (!circuitArea.contains(x0, y0))
	    return;

	dragElm = constructElement(mouseModeStr, x0, y0);
    }

    void setVPACheck(CheckboxMenuItem mi) {
        voltsCheckItem.setState(mi == voltsCheckItem);
        powerCheckItem.setState(mi == powerCheckItem);
        admittanceCheckItem.setState(mi == admittanceCheckItem);
        setPowerBarEnable();
    }
    
    void setAnimateSpeed() {
        speedBar.setValue(speedBar.getMinimum());
        while (true) {
            double steprate = 160*getIterCount();
            double x = steprate*timeStep*animateFreq*2;
            if (x > 1)
                break;
            int next = speedBar.getValue()+32;
            if (next > speedBar.getMaximum())
                break;
            speedBar.setValue(next);
        }
    }

    void showHideCurrentSpeedBar() {
	if (currentSpeedCheckItem.getState()) {
	    verticalPanel.insert(currentLabel, 5);
	    verticalPanel.insert(currentBar, 6);
	} else {
	    verticalPanel.remove(currentLabel);
	    verticalPanel.remove(currentBar);
	}
    }
    
    // IES - remove interaction
    
//    CircuitElm constructElement(Class c, int x0, int y0) {
//	// find element class
//	Class carr[] = new Class[2];
//	//carr[0] = getClass();
//	carr[0] = carr[1] = int.class;
//	Constructor cstr = null;
//	try {
//	    cstr = c.getConstructor(carr);
//	} catch (NoSuchMethodException ee) {
//	    System.out.println("caught NoSuchMethodException " + c);
//	    return null;
//	} catch (Exception ee) {
//	    ee.printStackTrace();
//	    return null;
//	}
//
//	// invoke constructor with starting coordinates
//	Object oarr[] = new Object[2];
//	oarr[0] = new Integer(x0);
//	oarr[1] = new Integer(y0);
//	try {
//	    return (CircuitElm) cstr.newInstance(oarr);
//	} catch (Exception ee) { ee.printStackTrace(); }
//	return null;
//    }

    
     // hausen: add doEditMenu
//     void doEditMenu(DoubleClickEvent e) {
//		if( mouseElm != null )
//			doEdit(mouseElm);
//	}

//    void doPopupMenu(MouseEvent e) {
//	menuElm = mouseElm;
//	// IES - removal of scopes
////	menuScope = -1;
////	if (scopeSelected != -1) {
////	    PopupMenu m = scopes[scopeSelected].getMenu();
////	    menuScope = scopeSelected;
////	    if (m != null)
////		m.show(e.getComponent(), e.getX(), e.getY());
//	// } else if (mouseElm != null) {
//	    if (mouseElm != null) {
//	    elmEditMenuItem .setEnabled(mouseElm.getEditInfo(0) != null);
//	    // IES removal of scopes
//	//    elmScopeMenuItem.setEnabled(mouseElm.canViewInScope());
//	    elmMenu.show(e.getComponent(), e.getX(), e.getY());
//	} else {
//	    doMainMenuChecks(mainMenu);
//	    mainMenu.show(e.getComponent(), e.getX(), e.getY());
//	}
//    }
//
    void doMainMenuChecks() {
    	int c = mainMenuItems.size();
    	int i;
    	for (i=0; i<c ; i++)
    		mainMenuItems.get(i).setState(mainMenuItemNames.get(i)==mouseModeStr);
    }
    
 
    
//    void doMainMenuChecks(Menu m) {
//	int i;
//	if (m == optionsMenu)
//	    return;
//	for (i = 0; i != m.getItemCount(); i++) {
//	    MenuItem mc = m.getItem(i);
//	    if (mc instanceof Menu)
//		doMainMenuChecks((Menu) mc);
//	    if (mc instanceof CheckboxMenuItem) {
//		CheckboxMenuItem cmi = (CheckboxMenuItem) mc;
//		cmi.setState(
//		      mouseModeStr.compareTo(cmi.getActionCommand()) == 0);
//	    }
//	}
//    }
//    
//    public void mouseReleased(MouseEvent e) {
    public void onMouseUp(MouseUpEvent e) {
    	e.preventDefault();
    	mouseDragging=false;
    	//	int ex = e.getModifiersEx();
    	////	if ((ex & (MouseEvent.SHIFT_DOWN_MASK|MouseEvent.CTRL_DOWN_MASK|
    	////		   MouseEvent.META_DOWN_MASK)) == 0 && e.isPopupTrigger()) {
    	////	    doPopupMenu(e);
    	////	    return;
    	////	}
    	
    	// click to clear selection
    	if (tempMouseMode == MODE_SELECT && selectedArea == null)
    	    clearSelection();
    	
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
    		if (dragElm.x == dragElm.x2 && dragElm.y == dragElm.y2) {
    			dragElm.delete();
    			if (mouseMode == MODE_SELECT || mouseMode == MODE_DRAG_SELECTED)
    				clearSelection();
    		}
    		else {
    			elmList.addElement(dragElm);
    			releaseCustomizer();
    			circuitChanged = true;
    		}
    		dragElm = null;
    	}
    	if (circuitChanged)
    		needAnalyze();
    	if (dragElm != null)
    		dragElm.delete();
    	dragElm = null;
    	//	cv.repaint();
    }
    
    public void onMouseWheel(MouseWheelEvent e) {
    	e.preventDefault();
    	scrollValues(e.getNativeEvent().getClientX(), e.getNativeEvent().getClientY(), e.getDeltaY());
    	if (mouseElm instanceof MouseWheelHandler)
    		((MouseWheelHandler) mouseElm).onMouseWheel(e);
    }
    
    void setPowerBarEnable() {
    	if (powerCheckItem.getState()) {
    		powerLabel.setStyleName("disabled", false);
    		powerBar.enable();
    	} else {
    		powerLabel.setStyleName("disabled", true);
    		powerBar.disable();
    	}
    	powerBar.setVisible(powerCheckItem.getState());
    	powerLabel.setVisible(powerCheckItem.getState());
    }

    void scrollValues(int x, int y, int deltay) {
    	if (mouseElm!=null && !dialogIsShowing())
    		if (mouseElm instanceof ResistorElm || mouseElm instanceof CapacitorElm ||  mouseElm instanceof InductorElm) {
    			scrollValuePopup = new ScrollValuePopup(x, y, deltay, mouseElm, this);
    		}
    }
    
    void enableItems() {
//	if (powerCheckItem.getState()) {
//	    powerBar.enable();
//	    powerLabel.enable();
//	} else {
//	    powerBar.disable();
//	    powerLabel.disable();
//	}
//	enableUndoRedo();
    }
    
 //   public void itemStateChanged(ItemEvent e) {
//	cv.repaint(pause);
//	Object mi = e.getItemSelectable();
//	if (mi == stoppedCheck)
//	    return;
//	if (mi == smallGridCheckItem)
//	    setGrid();
//	if (mi == powerCheckItem) {
//	    if (powerCheckItem.getState())
//		voltsCheckItem.setState(false);
//	    else
//		voltsCheckItem.setState(true);
//	}
//	if (mi == voltsCheckItem && voltsCheckItem.getState())
//	    powerCheckItem.setState(false);
//	enableItems();
//	// IES - removal of scopes
////	if (menuScope != -1) {
////	    Scope sc = scopes[menuScope];
////	    sc.handleMenu(e, mi);
////	}
//	if (mi instanceof CheckboxMenuItem) {
//	    MenuItem mmi = (MenuItem) mi;
//	    int prevMouseMode = mouseMode;
//	    setMouseMode(MODE_ADD_ELM);
//	    String s = mmi.getActionCommand();
//	    if (s.length() > 0)
//		mouseModeStr = s;
//	    if (s.compareTo("DragAll") == 0)
//		setMouseMode(MODE_DRAG_ALL);
//	    else if (s.compareTo("DragRow") == 0)
//		setMouseMode(MODE_DRAG_ROW);
//	    else if (s.compareTo("DragColumn") == 0)
//		setMouseMode(MODE_DRAG_COLUMN);
//	    else if (s.compareTo("DragSelected") == 0)
//		setMouseMode(MODE_DRAG_SELECTED);
//	    else if (s.compareTo("DragPost") == 0)
//		setMouseMode(MODE_DRAG_POST);
//	    else if (s.compareTo("Select") == 0)
//		setMouseMode(MODE_SELECT);
//	    else if (s.length() > 0) {
//		try {
//		    addingClass = Class.forName(s);
//		} catch (Exception ee) {
//		    ee.printStackTrace();
//		}
//	    }
//	    else
//	    	setMouseMode(prevMouseMode);
//	    tempMouseMode = mouseMode;
//	}
 //  }

    void setGrid() {
	gridSize = (smallGridCheckItem.getState()) ? 8 : 16;
	gridMask = ~(gridSize-1);
	gridRound = gridSize/2-1;
    }

    void pushUndo() {
    	redoStack.removeAllElements();
    	String s = dumpCircuit();
    	if (undoStack.size() > 0 &&
    			s.compareTo(undoStack.lastElement()) == 0)
    		return;
    	undoStack.add(s);
    	enableUndoRedo();
    }

    void doUndo() {
    	if (undoStack.size() == 0)
    		return;
    	redoStack.add(dumpCircuit());
    	String s = undoStack.remove(undoStack.size()-1);
    	readSetup(s, false);
    	enableUndoRedo();
    }

    void doRedo() {
    	if (redoStack.size() == 0)
    		return;
    	undoStack.add(dumpCircuit());
    	String s = redoStack.remove(redoStack.size()-1);
    	readSetup(s, false);
    	enableUndoRedo();
    }

    void enableUndoRedo() {
    	redoItem.setEnabled(redoStack.size() > 0);
    	undoItem.setEnabled(undoStack.size() > 0);
    }

    void setMouseMode(int mode)
    {
    	mouseMode = mode;
    	if ( mode == MODE_ADD_ELM ) {
    		cv.addStyleName("cursorCross");
    		cv.removeStyleName("cursorPointer");
    	} else {
    		cv.addStyleName("cursorPointer");
    		cv.removeStyleName("cursorCross");
    	}
    }

    void setMenuSelection() {
    	if (menuElm != null) {
    		if (menuElm.selected)
    			return;
    		clearSelection();
    		menuElm.setSelected(true);
    	}
    }

    void doCut() {
    	int i;
    	pushUndo();
    	setMenuSelection();
    	clipboard = "";
    	for (i = elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = getElm(i);
    		if (ce.isSelected()) {
    			clipboard += ce.dump() + "\n";
    			ce.delete();
    			elmList.removeElementAt(i);
    		}
    	}
    	writeClipboardToStorage();
    	enablePaste();
    	releaseCustomizer();
    	needAnalyze();
    }

    void writeClipboardToStorage() {
    	Storage stor = Storage.getLocalStorageIfSupported();
    	if (stor == null)
    		return;
    	stor.setItem("circuitClipboard", clipboard);
    }
    
    void readClipboardFromStorage() {
    	Storage stor = Storage.getLocalStorageIfSupported();
    	if (stor == null)
    		return;
    	clipboard = stor.getItem("circuitClipboard");
    }
    
    void doDelete() {
    	int i;
    	pushUndo();
    	setMenuSelection();
    	boolean hasDeleted = false;

    	for (i = elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = getElm(i);
    		if (ce.isSelected()) {
    			ce.delete();
    			elmList.removeElementAt(i);
    			hasDeleted = true;
    		}
    	}

    	if ( !hasDeleted )
    	{
    		for (i = elmList.size()-1; i >= 0; i--) {
    			CircuitElm ce = getElm(i);
    			if (ce == mouseElm) {
    				ce.delete();
    				elmList.removeElementAt(i);
    				hasDeleted = true;
    				setMouseElm(null);
    				break;
    			}
    		}
    	}

    	if ( hasDeleted )
    		needAnalyze();
    	releaseCustomizer();
    }

    void doCopy() {
    	int i;
    	clipboard = "";
    	setMenuSelection();
    	for (i = elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = getElm(i);
    		if (ce.isSelected())
    			clipboard += ce.dump() + "\n";
    	}
    	writeClipboardToStorage();
    	enablePaste();
    }

    void enablePaste() {
    	if (clipboard == null || clipboard.length() == 0)
    		readClipboardFromStorage();
    	pasteItem.setEnabled(clipboard != null && clipboard.length() > 0);
    }

    void doPaste() {
    	pushUndo();
    	clearSelection();
    	int i;
    	Rectangle oldbb = null;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		Rectangle bb = ce.getBoundingBox();
    		if (oldbb != null)
    			oldbb = oldbb.union(bb);
    		else
    			oldbb = bb;
    	}
    	int oldsz = elmList.size();
    	readClipboardFromStorage();
    	readSetup(clipboard, true, false);

    	// select new items
    	Rectangle newbb = null;
    	for (i = oldsz; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		ce.setSelected(true);
    		Rectangle bb = ce.getBoundingBox();
    		if (newbb != null)
    			newbb = newbb.union(bb);
    		else
    			newbb = bb;
    	}
    	if (oldbb != null && newbb != null && oldbb.intersects(newbb)) {
    		// find a place for new items
    		int dx = 0, dy = 0;
    		int spacew = circuitArea.width - oldbb.width - newbb.width;
    		int spaceh = circuitArea.height - oldbb.height - newbb.height;
    		if (spacew > spaceh)
    			dx = snapGrid(oldbb.x + oldbb.width  - newbb.x + gridSize);
    		else
    			dy = snapGrid(oldbb.y + oldbb.height - newbb.y + gridSize);
    		for (i = oldsz; i != elmList.size(); i++) {
    			CircuitElm ce = getElm(i);
    			ce.move(dx, dy);
    		}
    		// center circuit
    		centerCircuit();
    	}
    	needAnalyze();
    }

    void clearSelection() {
	int i;
	for (i = 0; i != elmList.size(); i++) {
	    CircuitElm ce = getElm(i);
	    ce.setSelected(false);
	}
    }
    
    void doSelectAll() {
    	int i;
    	for (i = 0; i != elmList.size(); i++) {
    		CircuitElm ce = getElm(i);
    		ce.setSelected(true);
    	}
    }
    
    boolean anySelectedButMouse() {
    	for (int i=0; i != elmList.size(); i++)
    		if (getElm(i)!= mouseElm && getElm(i).selected)
    			return true;
    	return false;
    }

//    public void keyPressed(KeyEvent e) {}
//    public void keyReleased(KeyEvent e) {}
    
    boolean dialogIsShowing() {
    	if (editDialog!=null && editDialog.isShowing())
    		return true;
    	if (customLogicEditDialog!=null && customLogicEditDialog.isShowing())
		return true;
    	if (exportAsUrlDialog != null && exportAsUrlDialog.isShowing())
    		return true;
    	if (exportAsTextDialog != null && exportAsTextDialog.isShowing())
    		return true;
       	if (exportAsLocalFileDialog != null && exportAsLocalFileDialog.isShowing())
       		return true;
    	if (contextPanel!=null && contextPanel.isShowing())
    		return true;
    	if (scrollValuePopup != null && scrollValuePopup.isShowing())
    		return true;
    	if (aboutBox !=null && aboutBox.isShowing())
    		return true;
    	if (importFromTextDialog !=null && importFromTextDialog.isShowing())
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
    		if (editDialog!=null && editDialog.isShowing() &&
    				(t & Event.ONKEYDOWN)!=0) {
    			if (code==KEY_ESCAPE)
    				editDialog.closeDialog();
    			if (code==KEY_ENTER) {
    				editDialog.apply();
    				editDialog.closeDialog();
    			}  			
    		}
    		return;
    	}
    	if ((t & Event.ONKEYDOWN)!=0) {
    		
    		if (code==KEY_BACKSPACE || code==KEY_DELETE) {
    			doDelete();
    			e.cancel();
    		}
    		if (code==KEY_ESCAPE){
    			setMouseMode(MODE_SELECT);
    			mouseModeStr = "Select";
    			tempMouseMode = mouseMode;
    			e.cancel();
    		}
    		if (e.getNativeEvent().getCtrlKey() || e.getNativeEvent().getMetaKey()) {
    			if (code==KEY_C) {
    				menuPerformed("key", "copy");
    				e.cancel();
    			}
    			if (code==KEY_X) {
    				menuPerformed("key", "cut");
    				e.cancel();
    			}
    			if (code==KEY_V) {
    				menuPerformed("key", "paste");
    				e.cancel();
    			}
    			if (code==KEY_Z) {
    				menuPerformed("key", "undo");
    				e.cancel();
    			}
    			if (code==KEY_Y) {
    				menuPerformed("key", "redo");
    				e.cancel();
    			}
    			if (code==KEY_A) {
    				menuPerformed("key", "selectAll");
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
    			setMouseMode(MODE_ADD_ELM);
    			mouseModeStr=c;
    			tempMouseMode = mouseMode;
    		}
    		if (cc==32) {
			    setMouseMode(MODE_SELECT);
			    mouseModeStr = "Select";
			    tempMouseMode = mouseMode;
			    e.cancel();    			
    		}
    	}
    }
    
//    public void keyTyped(KeyEvent e) {
//	if (e.getKeyChar() == 127)
//	{
//	    doDelete();
//	    return;
//	}
//	if (e.getKeyChar() > ' ' && e.getKeyChar() < 127) {
//	    Class c = shortcuts[e.getKeyChar()];
//	    if (c == null)
//		return;
//	    CircuitElm elm = null;
//	    elm = constructElement(c, 0, 0);
//	    if (elm == null)
//		return;
//	    setMouseMode(MODE_ADD_ELM);
//	    mouseModeStr = c.getName();
//	    addingClass = c;
//	}
//	if (e.getKeyChar() == ' ' || e.getKeyChar() == KeyEvent.VK_ESCAPE) {
//	    setMouseMode(MODE_SELECT);
//	    mouseModeStr = "Select";
//	}
//	tempMouseMode = mouseMode;
//   }

    double linearToFrequency(double x) {
        if (linearCheckItem.getState())
            return x*(maxFrequency-minFrequency) + minFrequency;
        return minFrequency * Math.exp(freqLogRange*x);
    }
    
    double frequencyToLinear(double x) {
        if (linearCheckItem.getState())
            return (x-minFrequency)/(maxFrequency-minFrequency);
        return (Math.log(x) - minLogFrequency)/freqLogRange;
    }
    
    // factors a matrix into upper and lower triangular matrices by
    // gaussian elimination.  On entry, a[0..n-1][0..n-1] is the
    // matrix to be factored.  ipvt[] returns an integer vector of pivot
    // indices, used in the lu_solve() routine.
    boolean lu_factor(Complex a[][], int n, int ipvt[]) {
        double scaleFactors[];
        int i,j,k;

        scaleFactors = new double[n];
        
        // divide each row by its largest element, keeping track of the
        // scaling factors
        for (i = 0; i != n; i++) { 
            double largest = 0;
            for (j = 0; j != n; j++) {
                double x = a[i][j].magSquared();
                if (x > largest)
                    largest = x;
            }
            // if all zeros, it's a singular matrix
            if (largest == 0)
                return false;
            scaleFactors[i] = 1.0/largest;
        }

        Complex q = new Complex();
        Complex q1 = new Complex();
        
        // use Crout's method; loop through the columns
        for (j = 0; j != n; j++) {
            
            // calculate upper triangular elements for this column
            for (i = 0; i != j; i++) {
                q.set(a[i][j]);
                for (k = 0; k != i; k++) {
                    q1.set(a[i][k]);
                    q1.mult(a[k][j]);
                    q.subtract(q1);
                }
                a[i][j].set(q);
            }
            // calculate lower triangular elements for this column
            double largest = 0;
            int largestRow = -1;
            for (i = j; i != n; i++) {
                q.set(a[i][j]);
                for (k = 0; k != j; k++) {
                    q1.set(a[i][k]);
                    q1.mult(a[k][j]);
                    q.subtract(q1);
                }
                a[i][j].set(q);
                if (q.magSquared() >= largest) {
                    largest = q.magSquared();
                    largestRow = i;
                }
            }
            
            // pivoting
            if (j != largestRow) {
                Complex x;
                for (k = 0; k != n; k++) {
                    x = a[largestRow][k];
                    a[largestRow][k] = a[j][k];
                    a[j][k] = x;
                }
                scaleFactors[largestRow] = scaleFactors[j];
            }

            // keep track of row interchanges
            ipvt[j] = largestRow;

            // avoid zeros
            if (a[j][j].magSquared() == 0.0) {
                System.out.println("avoided zero");
                a[j][j].set(1e-18);
            }

            if (j != n-1) {
                q1.set(a[j][j]);
                q1.recip();
                for (i = j+1; i != n; i++)
                    a[i][j].mult(q1);
            }
        }
        return true;
    }


    // Solves the set of n linear equations using a LU factorization
    // previously performed by lu_factor.  On input, b[0..n-1] is the right
    // hand side of the equations, and on output, contains the solution.
    void lu_solve(Complex a[][], int n, int ipvt[], Complex b[]) {
        int i;

        // find first nonzero b element
        for (i = 0; i != n; i++) {
            int row = ipvt[i];

            Complex swap = b[row];
            b[row] = b[i];
            b[i] = swap;
            if (swap.magSquared() != 0)
                break;
        }
        
        int bi = i++;
        Complex q = new Complex();
        Complex q1 = new Complex();
        for (; i < n; i++) {
            int row = ipvt[i];
            int j;
            q.set(b[row]);
            
            b[row].set(b[i]);
            // forward substitution using the lower triangular matrix
            for (j = bi; j < i; j++) {
                q1.set(a[i][j]);
                q1.mult(b[j]);
                q.subtract(q1);
            }
            b[i].set(q);
        }
        for (i = n-1; i >= 0; i--) {
            q.set(b[i]);
            // back-substitution using the upper triangular matrix
            int j;
            for (j = i+1; j != n; j++) {
                q1.set(a[i][j]);
                q1.mult(b[j]);
                q.subtract(q1);
            }
            q.divide(a[i][i]);
            b[i].set(q);
        }
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
    	if (iFrame!=null) {
    		int i=verticalPanel.getWidgetIndex(iFrame);
    		verticalPanel.insert(w, i);
    		setiFrameHeight();
    	}
    	else
    		verticalPanel.add(w);
    }
    
    void removeWidgetFromVerticalPanel(Widget w){
    	verticalPanel.remove(w);
    	if (iFrame!=null)
    		setiFrameHeight();
    }

    public void addLabeledSlider(Label lb, Scrollbar sb) {
    	addWidgetToVerticalPanel(lb);
    	lb.addStyleName("topSpace");
    	addWidgetToVerticalPanel(sb);
    }
	    
    public static CircuitElm createCe(int tint, int x1, int y1, int x2, int y2, int f, StringTokenizer st) {
    	if (tint=='g')
    		return (CircuitElm) new GroundElm(x1, y1, x2, y2, f, st);
    	if (tint=='r')
    		return (CircuitElm) new ResistorElm(x1, y1, x2, y2, f, st);
    	if (tint=='R')
    		return (CircuitElm) new RailElm(x1, y1, x2, y2, f, st);
    	if (tint=='s')
    		return (CircuitElm) new SwitchElm(x1, y1, x2, y2, f, st);
    	if (tint=='S')
    		return (CircuitElm) new Switch2Elm(x1, y1, x2, y2, f, st);
    	if (tint=='w')
    		return (CircuitElm) new WireElm(x1, y1, x2, y2, f, st);
    	if (tint=='c')
    		return (CircuitElm) new CapacitorElm(x1, y1, x2, y2, f, st);   	
    	if (tint=='l')
    		return (CircuitElm) new InductorElm(x1, y1, x2, y2, f, st);
    	if (tint=='v')
    		return (CircuitElm) new VoltageElm(x1, y1, x2, y2, f, st);
    	if (tint==172)
    		return (CircuitElm) new VarRailElm(x1, y1, x2, y2, f, st);
    	if (tint==174)
    		return (CircuitElm) new PotElm(x1, y1, x2, y2, f, st);
    	if (tint=='O')
    		return (CircuitElm) new OutputElm(x1, y1, x2, y2, f, st);
    	if (tint=='i')
    		return (CircuitElm) new CurrentElm(x1, y1, x2, y2, f, st);
    	if (tint=='p')
    		return (CircuitElm) new ProbeElm(x1, y1, x2, y2, f, st);
    	if (tint==170)
    		return (CircuitElm) new SweepElm(x1, y1, x2, y2, f, st);
    	if (tint=='A')
    		return (CircuitElm) new AntennaElm(x1, y1, x2, y2, f, st);
    	if (tint=='L')
    		return (CircuitElm) new LogicInputElm(x1, y1, x2, y2, f, st);
    	if (tint=='M')
    		return (CircuitElm) new LogicOutputElm(x1, y1, x2, y2, f, st);
    	if (tint=='T')
    		return (CircuitElm) new TransformerElm(x1, y1, x2, y2, f, st);
    	if (tint==169)
    		return (CircuitElm) new TappedTransformerElm(x1, y1, x2, y2, f, st);
    	if (tint==171)
    		return (CircuitElm) new TransLineElm(x1, y1, x2, y2, f, st);
    	if (tint==178)
    		return (CircuitElm) new RelayElm(x1, y1, x2, y2, f, st);
    	if (tint==200)
    		return (CircuitElm) new AMElm(x1, y1, x2, y2, f, st);
    	if (tint==201)
    		return (CircuitElm) new FMElm(x1, y1, x2, y2, f, st);
    	if (tint==181)
    		return (CircuitElm) new LampElm(x1, y1, x2, y2, f, st);
    	if (tint=='a')
    		return (CircuitElm) new OpAmpElm(x1, y1, x2, y2, f, st);
    	if (tint==159)
    		return (CircuitElm) new AnalogSwitchElm(x1, y1, x2, y2, f, st);
    	if (tint==160)
    		return (CircuitElm) new AnalogSwitch2Elm(x1, y1, x2, y2, f, st);
    	if (tint==180)
    		return (CircuitElm) new TriStateElm(x1, y1, x2, y2, f, st);
    	if (tint==182)
    		return (CircuitElm) new SchmittElm(x1, y1, x2, y2, f, st);
    	if (tint==183)
    		return (CircuitElm) new InvertingSchmittElm(x1, y1, x2, y2, f, st);
    	if (tint==203)
    		return (CircuitElm) new DiacElm(x1, y1, x2, y2, f, st);
    	if (tint=='I')
    		return (CircuitElm) new InverterElm(x1, y1, x2, y2, f, st);
    	if (tint==151)
    		return (CircuitElm) new NandGateElm(x1, y1, x2, y2, f, st);
    	if (tint==153)
    		return (CircuitElm) new NorGateElm(x1, y1, x2, y2, f, st);
    	if (tint==150)
    		return (CircuitElm) new AndGateElm(x1, y1, x2, y2, f, st);
    	if (tint==152)
    		return (CircuitElm) new OrGateElm(x1, y1, x2, y2, f, st);
    	if (tint==154)
    		return (CircuitElm) new XorGateElm(x1, y1, x2, y2, f, st);
    	if (tint==155)
    		return (CircuitElm) new DFlipFlopElm(x1, y1, x2, y2, f, st);
    	if (tint==156)
    		return (CircuitElm) new JKFlipFlopElm(x1, y1, x2, y2, f, st);
    	if (tint==157)
    		return (CircuitElm) new SevenSegElm(x1, y1, x2, y2, f, st);
    	if (tint==184)
    		return (CircuitElm) new MultiplexerElm(x1, y1, x2, y2, f, st);
    	if (tint==185)
    		return (CircuitElm) new DeMultiplexerElm(x1, y1, x2, y2, f, st);
    	if (tint==189)
    		return (CircuitElm) new SipoShiftElm(x1, y1, x2, y2, f, st);
    	if (tint==186)
    		return (CircuitElm) new PisoShiftElm(x1, y1, x2, y2, f, st);
    	if (tint==161)
    		return (CircuitElm) new PhaseCompElm(x1, y1, x2, y2, f, st);
    	if (tint==164)
    		return (CircuitElm) new CounterElm(x1, y1, x2, y2, f, st);
    	if (tint==163)
    		return (CircuitElm) new DecadeElm(x1, y1, x2, y2, f, st);
    	if (tint==165)
    		return (CircuitElm) new TimerElm(x1, y1, x2, y2, f, st);
    	if (tint==166)
    		return (CircuitElm) new DACElm(x1, y1, x2, y2, f, st);
    	if (tint==167)
    		return (CircuitElm) new ADCElm(x1, y1, x2, y2, f, st);
    	if (tint==168)
    		return (CircuitElm) new LatchElm(x1, y1, x2, y2, f, st);
    	if (tint==188)
    		return (CircuitElm) new SeqGenElm(x1, y1, x2, y2, f, st);
    	if (tint==158)
    		return (CircuitElm) new VCOElm(x1, y1, x2, y2, f, st);
    	if (tint=='B')
    		return (CircuitElm) new BoxElm(x1, y1, x2, y2, f, st);
    	if (tint=='x')
    		return (CircuitElm) new TextElm(x1, y1, x2, y2, f, st);
    	if (tint==193)
    		return (CircuitElm) new TFlipFlopElm(x1, y1, x2, y2, f, st);
    	if (tint==197)
    		return (CircuitElm) new SevenSegDecoderElm(x1, y1, x2, y2, f, st);
    	if (tint==196)
    		return (CircuitElm) new FullAdderElm(x1, y1, x2, y2, f, st);
    	if (tint==195)
    		return (CircuitElm) new HalfAdderElm(x1, y1, x2, y2, f, st);
    	if (tint==194)
    		return (CircuitElm) new MonostableElm(x1, y1, x2, y2, f, st);
    	if (tint==207)
    		return (CircuitElm) new LabeledNodeElm(x1, y1, x2, y2, f, st);
    	if (tint==208)
    	    return (CircuitElm) new CustomLogicElm(x1, y1, x2, y2, f, st);
    	return
    			null;
    }

    public static CircuitElm constructElement(String n, int x1, int y1){
    	if (n=="GroundElm")
    		return (CircuitElm) new GroundElm(x1, y1);
    	if (n=="ResistorElm")
    		return (CircuitElm) new ResistorElm(x1, y1);
    	if (n=="RailElm")
    		return (CircuitElm) new RailElm(x1, y1);
    	if (n=="SwitchElm")
    		return (CircuitElm) new SwitchElm(x1, y1);
    	if (n=="Switch2Elm")
    		return (CircuitElm) new Switch2Elm(x1, y1);
    	if (n=="WireElm")
    		return (CircuitElm) new WireElm(x1, y1);
    	if (n=="CapacitorElm")
    		return (CircuitElm) new CapacitorElm(x1, y1);   	
    	if (n=="InductorElm")
    		return (CircuitElm) new InductorElm(x1, y1);
    	if (n=="DCVoltageElm")
    		return (CircuitElm) new DCVoltageElm(x1, y1);
    	if (n=="VarRailElm")
    		return (CircuitElm) new VarRailElm(x1, y1);
    	if (n=="PotElm")
    		return (CircuitElm) new PotElm(x1, y1);
    	if (n=="OutputElm")
    		return (CircuitElm) new OutputElm(x1, y1);
    	if (n=="CurrentElm")
    		return (CircuitElm) new CurrentElm(x1, y1);
    	if (n=="ProbeElm")
    		return (CircuitElm) new ProbeElm(x1, y1);
    	if (n=="ACVoltageElm")
    		return (CircuitElm) new ACVoltageElm(x1, y1);
    	if (n=="ACRailElm")
    		return (CircuitElm) new ACRailElm(x1, y1);
    	if (n=="SquareRailElm")
    		return (CircuitElm) new SquareRailElm(x1, y1);
    	if (n=="SweepElm")
    		return (CircuitElm) new SweepElm(x1, y1);
    	if (n=="AntennaElm")
    		return (CircuitElm) new AntennaElm(x1, y1);
    	if (n=="LogicInputElm")
    		return (CircuitElm) new LogicInputElm(x1, y1);
    	if (n=="LogicOutputElm")
    		return (CircuitElm) new LogicOutputElm(x1, y1);
    	if (n=="TransformerElm")
    		return (CircuitElm) new TransformerElm(x1, y1);
    	if (n=="TappedTransformerElm")
    		return (CircuitElm) new TappedTransformerElm(x1, y1);
    	if (n=="TransLineElm")
    		return (CircuitElm) new TransLineElm(x1, y1);
    	if (n=="RelayElm")
    		return (CircuitElm) new RelayElm(x1, y1);
    	if (n=="SparkGapElm")
    		return (CircuitElm) new SparkGapElm(x1, y1);
    	if (n=="ClockElm")
    		return (CircuitElm) new ClockElm(x1, y1);
    	if (n=="AMElm")
    		return (CircuitElm) new AMElm(x1, y1);
    	if (n=="FMElm")
    		return (CircuitElm) new FMElm(x1, y1);
    	if (n=="LampElm")
    		return (CircuitElm) new LampElm(x1, y1);
    	if (n=="PushSwitchElm")
    		return (CircuitElm) new PushSwitchElm(x1, y1);
    	if (n=="OpAmpElm")
    		return (CircuitElm) new OpAmpElm(x1, y1);
    	if (n=="OpAmpSwapElm")
    		return (CircuitElm) new OpAmpSwapElm(x1, y1);
    	if (n=="AnalogSwitchElm")
    		return (CircuitElm) new AnalogSwitchElm(x1, y1);
    	if (n=="AnalogSwitch2Elm")
    		return (CircuitElm) new AnalogSwitch2Elm(x1, y1);
    	if (n=="TriStateElm")
    		return (CircuitElm) new TriStateElm(x1, y1);
    	if (n=="DiacElm")
    		return (CircuitElm) new DiacElm(x1, y1);
    	if (n=="InverterElm")
    		return (CircuitElm) new InverterElm(x1, y1);
    	if (n=="NandGateElm")
    		return (CircuitElm) new NandGateElm(x1, y1);
    	if (n=="NorGateElm")
    		return (CircuitElm) new NorGateElm(x1, y1);
    	if (n=="AndGateElm")
    		return (CircuitElm) new AndGateElm(x1, y1);
    	if (n=="OrGateElm")
    		return (CircuitElm) new OrGateElm(x1, y1);
    	if (n=="XorGateElm")
    		return (CircuitElm) new XorGateElm(x1, y1);
    	if (n=="DFlipFlopElm")
    		return (CircuitElm) new DFlipFlopElm(x1, y1);
    	if (n=="JKFlipFlopElm")
    		return (CircuitElm) new JKFlipFlopElm(x1, y1);
    	if (n=="SevenSegElm")
    		return (CircuitElm) new SevenSegElm(x1, y1);
    	if (n=="MultiplexerElm")
    		return (CircuitElm) new MultiplexerElm(x1, y1);
    	if (n=="DeMultiplexerElm")
    		return (CircuitElm) new DeMultiplexerElm(x1, y1);
    	if (n=="SipoShiftElm")
    		return (CircuitElm) new SipoShiftElm(x1, y1);
    	if (n=="PisoShiftElm")
    		return (CircuitElm) new PisoShiftElm(x1, y1);
    	if (n=="PhaseCompElm")
    		return (CircuitElm) new PhaseCompElm(x1, y1);
    	if (n=="CounterElm")
    		return (CircuitElm) new CounterElm(x1, y1);
    	if (n=="DecadeElm")
    		return (CircuitElm) new DecadeElm(x1, y1);
    	if (n=="TimerElm")
    		return (CircuitElm) new TimerElm(x1, y1);
    	if (n=="DACElm")
    		return (CircuitElm) new DACElm(x1, y1);
    	if (n=="ADCElm")
    		return (CircuitElm) new ADCElm(x1, y1);
    	if (n=="LatchElm")
    		return (CircuitElm) new LatchElm(x1, y1);
    	if (n=="SeqGenElm")
    		return (CircuitElm) new SeqGenElm(x1, y1);
    	if (n=="VCOElm")
    		return (CircuitElm) new VCOElm(x1, y1);
    	if (n=="BoxElm")
    		return (CircuitElm) new BoxElm(x1, y1);
    	if (n=="TextElm")
    		return (CircuitElm) new TextElm(x1, y1);
    	if (n=="TFlipFlopElm")
    		return (CircuitElm) new TFlipFlopElm(x1, y1);
    	if (n=="SevenSegDecoderElm")
    		return (CircuitElm) new SevenSegDecoderElm(x1, y1);
    	if (n=="FullAdderElm")
    		return (CircuitElm) new FullAdderElm(x1, y1);
    	if (n=="HalfAdderElm")
    		return (CircuitElm) new HalfAdderElm(x1, y1);
    	if (n=="MonostableElm")
    		return (CircuitElm) new MonostableElm(x1, y1);
    	if (n=="LabeledNodeElm")
    		return (CircuitElm) new LabeledNodeElm(x1, y1);
    	if (n=="UserDefinedLogicElm")
    	    	return (CircuitElm) new CustomLogicElm(x1, y1);
    	return null;
    }
    
    public void updateModels() {
	int i;
	for (i = 0; i != elmList.size(); i++)
	    elmList.get(i).updateModels();
    }
}


