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

import com.google.gwt.user.client.ui.MenuBar;
import com.google.gwt.user.client.Command;
import com.google.gwt.user.client.ui.MenuItem;
import com.google.gwt.safehtml.shared.SafeHtmlUtils;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.user.client.Window.Navigator;
import com.google.gwt.http.client.Request;
import com.google.gwt.http.client.RequestException;
import com.google.gwt.http.client.Response;
import com.google.gwt.http.client.RequestBuilder;
import com.google.gwt.http.client.RequestCallback;
import com.google.gwt.user.client.ui.MenuItem;
import com.google.gwt.core.client.GWT;
import com.google.gwt.user.client.Window;

public class Menus {

    MenuItem aboutItem;
    MenuItem importFromLocalFileItem, importFromTextItem, exportAsUrlItem, exportAsLocalFileItem, exportAsTextItem,
            printItem, recoverItem, saveFileItem;
    MenuItem importFromDropboxItem;
    MenuItem undoItem, redoItem, cutItem, copyItem, pasteItem, selectAllItem, optionsItem, flipXItem, flipYItem, flipXYItem;
    MenuBar optionsMenuBar;
    CheckboxMenuItem dotsCheckItem;
    CheckboxMenuItem voltsCheckItem;
    CheckboxMenuItem powerCheckItem;
    CheckboxMenuItem smallGridCheckItem;
    CheckboxMenuItem crossHairCheckItem;
    CheckboxMenuItem showValuesCheckItem;
    CheckboxMenuItem conductanceCheckItem;
    CheckboxMenuItem euroResistorCheckItem;
    CheckboxMenuItem euroGatesCheckItem;
    CheckboxMenuItem printableCheckItem;
    CheckboxMenuItem conventionCheckItem;
    CheckboxMenuItem noEditCheckItem;
    CheckboxMenuItem mouseWheelEditCheckItem;
    CheckboxMenuItem toolbarCheckItem;
    CheckboxMenuItem mouseModeCheckItem;
    MenuBar elmMenuBar;
    MenuItem elmEditMenuItem;
    MenuItem elmCutMenuItem;
    MenuItem elmCopyMenuItem;
    MenuItem elmDeleteMenuItem;
    MenuItem elmScopeMenuItem;
    MenuItem elmFloatScopeMenuItem;
    MenuItem elmAddScopeMenuItem;
    MenuItem elmSplitMenuItem;
    MenuItem elmSliderMenuItem;
    MenuItem elmFlipXMenuItem, elmFlipYMenuItem, elmFlipXYMenuItem;
    MenuItem elmSwapMenuItem;
    MenuItem stackAllItem;
    MenuItem unstackAllItem;
    MenuItem combineAllItem;
    MenuItem separateAllItem;
    MenuBar mainMenuBar;
    boolean hideMenu = false;
    MenuBar subcircuitMenuBar[];
    MenuItem scopeRemovePlotMenuItem;
    MenuItem scopeSelectYMenuItem;
    boolean isMac;
    String ctrlMetaKey;
    CirSim sim;
    MenuBar menuBar;
    MenuBar fileMenuBar;

    Menus(CirSim sim_) {
	sim = sim_;
    }
    
    public void init() {

	MenuBar m;

	String os = Navigator.getPlatform();
	isMac = (os.toLowerCase().contains("mac"));
	ctrlMetaKey = (isMac) ? Locale.LS("Cmd-") : Locale.LS("Ctrl-");

	fileMenuBar = new MenuBar(true);
	if (isElectron())
	    fileMenuBar.addItem(menuItemWithShortcut("window", "New Window...", Locale.LS(ctrlMetaKey + "N"),
		    new MyCommand("file", "newwindow")));
	
	fileMenuBar.addItem(iconMenuItem("doc-new", "New Blank Circuit", new MyCommand("file", "newblankcircuit")));
	importFromLocalFileItem = menuItemWithShortcut("folder", "Open File...", Locale.LS(ctrlMetaKey + "O"),
		new MyCommand("file","importfromlocalfile"));
	importFromLocalFileItem.setEnabled(LoadFile.isSupported());
	fileMenuBar.addItem(importFromLocalFileItem);
	importFromTextItem = iconMenuItem("doc-text", "Import From Text...", new MyCommand("file","importfromtext"));
	fileMenuBar.addItem(importFromTextItem);
	importFromDropboxItem = iconMenuItem("dropbox", "Import From Dropbox...", new MyCommand("file", "importfromdropbox"));
	fileMenuBar.addItem(importFromDropboxItem);
	if (isElectron()) {
	    saveFileItem = fileMenuBar.addItem(menuItemWithShortcut("floppy", "Save", Locale.LS(ctrlMetaKey + "S"),
		    new MyCommand("file", "save")));
	    fileMenuBar.addItem(iconMenuItem("floppy", "Save As...", new MyCommand("file", "saveas")));
	} else {
	    exportAsLocalFileItem = menuItemWithShortcut("floppy", "Save As...", Locale.LS(ctrlMetaKey + "S"),
		    new MyCommand("file","exportaslocalfile"));
	    exportAsLocalFileItem.setEnabled(ExportAsLocalFileDialog.downloadIsSupported());
	    fileMenuBar.addItem(exportAsLocalFileItem);
	}
	exportAsUrlItem = iconMenuItem("export", "Export As Link...", new MyCommand("file","exportasurl"));
	fileMenuBar.addItem(exportAsUrlItem);
	exportAsTextItem = iconMenuItem("export", "Export As Text...", new MyCommand("file","exportastext"));
	fileMenuBar.addItem(exportAsTextItem);
	fileMenuBar.addItem(iconMenuItem("image", "Export As Image...", new MyCommand("file","exportasimage")));
	fileMenuBar.addItem(iconMenuItem("image", "Copy Circuit Image to Clipboard", new MyCommand("file","copypng")));
	fileMenuBar.addItem(iconMenuItem("image", "Export As SVG...", new MyCommand("file","exportassvg")));    	
	fileMenuBar.addItem(iconMenuItem("microchip", "Create Subcircuit...", new MyCommand("file","createsubcircuit")));
	fileMenuBar.addItem(iconMenuItem("magic", "Find DC Operating Point", new MyCommand("file", "dcanalysis")));
	recoverItem = iconMenuItem("back-in-time", "Recover Auto-Save", new MyCommand("file","recover"));
	fileMenuBar.addItem(recoverItem);
	printItem = menuItemWithShortcut("print", "Print...", Locale.LS(ctrlMetaKey + "P"), new MyCommand("file","print"));
	fileMenuBar.addItem(printItem);
	fileMenuBar.addSeparator();
	fileMenuBar.addItem(iconMenuItem("resize-full-alt", "Toggle Full Screen", new MyCommand("view", "fullscreen")));
	fileMenuBar.addSeparator();
	aboutItem = iconMenuItem("info-circled", "About...", (Command)null);
	fileMenuBar.addItem(aboutItem);
	aboutItem.setScheduledCommand(new MyCommand("file","about"));

	menuBar = new MenuBar();
	menuBar.addItem(Locale.LS("File"), fileMenuBar);

	m = new MenuBar(true);
	m.addItem(undoItem = menuItemWithShortcut("ccw", "Undo", Locale.LS(ctrlMetaKey + "Z"), new MyCommand("edit","undo")));
	m.addItem(redoItem = menuItemWithShortcut("cw", "Redo", Locale.LS(ctrlMetaKey + "Y"), new MyCommand("edit","redo")));
	m.addSeparator();
	m.addItem(cutItem = menuItemWithShortcut("scissors", "Cut", Locale.LS(ctrlMetaKey + "X"), new MyCommand("edit","cut")));
	m.addItem(copyItem = menuItemWithShortcut("copy", "Copy", Locale.LS(ctrlMetaKey + "C"), new MyCommand("edit","copy")));
	m.addItem(pasteItem = menuItemWithShortcut("paste", "Paste", Locale.LS(ctrlMetaKey + "V"), new MyCommand("edit","paste")));
	pasteItem.setEnabled(false);

	m.addItem(menuItemWithShortcut("clone", "Duplicate", Locale.LS(ctrlMetaKey + "D"), new MyCommand("edit","duplicate")));

	m.addSeparator();
	m.addItem(selectAllItem = menuItemWithShortcut("select-all", "Select All", Locale.LS(ctrlMetaKey + "A"), new MyCommand("edit","selectAll")));
	m.addSeparator();
	m.addItem(menuItemWithShortcut("search", "Find Component...", "/", new MyCommand("edit", "search")));
	m.addItem(iconMenuItem("target", Locale.weAreInUS(false) ? "Center Circuit" : "Centre Circuit", new MyCommand("edit", "centercircuit")));
	m.addItem(menuItemWithShortcut("zoom-11", "Zoom 100%", "0", new MyCommand("zoom", "zoom100")));
	m.addItem(menuItemWithShortcut("zoom-in", "Zoom In", "+", new MyCommand("zoom", "zoomin")));
	m.addItem(menuItemWithShortcut("zoom-out", "Zoom Out", "-", new MyCommand("zoom", "zoomout")));
	m.addItem(flipXItem = iconMenuItem("flip-x", "Flip X", new MyCommand("edit", "flipx")));
	m.addItem(flipYItem = iconMenuItem("flip-y", "Flip Y", new MyCommand("edit", "flipy")));
	m.addItem(flipXYItem = iconMenuItem("flip-x-y", "Flip XY", new MyCommand("edit", "flipxy")));
	menuBar.addItem(Locale.LS("Edit"),m);

	MenuBar drawMenuBar = new MenuBar(true);
	drawMenuBar.setAutoOpen(true);

	menuBar.addItem(Locale.LS("Draw"), drawMenuBar);

	m = new MenuBar(true);
	m.addItem(stackAllItem = iconMenuItem("lines", "Stack All", new MyCommand("scopes", "stackAll")));
	m.addItem(unstackAllItem = iconMenuItem("columns", "Unstack All", new MyCommand("scopes", "unstackAll")));
	m.addItem(combineAllItem = iconMenuItem("object-group", "Combine All", new MyCommand("scopes", "combineAll")));
	m.addItem(separateAllItem = iconMenuItem("object-ungroup", "Separate All", new MyCommand("scopes", "separateAll")));
	menuBar.addItem(Locale.LS("Scopes"), m);

	optionsMenuBar = m = new MenuBar(true );
	menuBar.addItem(Locale.LS("Options"), optionsMenuBar);
	m.addItem(dotsCheckItem = new CheckboxMenuItem(Locale.LS("Show Current")));
	dotsCheckItem.setState(true);
	m.addItem(voltsCheckItem = new CheckboxMenuItem(Locale.LS("Show Voltage"),
		new Command() { public void execute(){
		    if (voltsCheckItem.getState())
			powerCheckItem.setState(false);
		    sim.setPowerBarEnable();
		}
	}));
	voltsCheckItem.setState(true);
	m.addItem(powerCheckItem = new CheckboxMenuItem(Locale.LS("Show Power"),
		new Command() { public void execute(){
		    if (powerCheckItem.getState())
			voltsCheckItem.setState(false);
		    sim.setPowerBarEnable();
		}
	}));
	m.addItem(showValuesCheckItem = new CheckboxMenuItem(Locale.LS("Show Values")));
	showValuesCheckItem.setState(true);
	//m.add(conductanceCheckItem = getCheckItem(LS("Show Conductance")));
	m.addItem(smallGridCheckItem = new CheckboxMenuItem(Locale.LS("Small Grid"),
		new Command() { public void execute(){
		    sim.setGrid();
		}
	}));
	m.addItem(toolbarCheckItem = new CheckboxMenuItem(Locale.LS("Toolbar"),
		new Command() { public void execute(){
		    sim.setToolbar();
		}
	}));
	m.addItem(mouseModeCheckItem = new CheckboxMenuItem(Locale.LS("Show Mode"),
		new Command() { public void execute(){
			sim.setOptionInStorage("showMouseMode", mouseModeCheckItem.getState());
		}
	}));
	mouseModeCheckItem.setState(sim.getOptionFromStorage("showMouseMode", true));
	m.addItem(crossHairCheckItem = new CheckboxMenuItem(Locale.LS("Show Cursor Cross Hairs"),
		new Command() { public void execute(){
		    sim.setOptionInStorage("crossHair", crossHairCheckItem.getState());
		}
	}));

	m.addItem(euroResistorCheckItem = new CheckboxMenuItem(Locale.LS("European Resistors")));
	m.addItem(euroGatesCheckItem = new CheckboxMenuItem(Locale.LS("IEC Gates")));
	m.addItem(printableCheckItem = new CheckboxMenuItem(Locale.LS("White Background")));

	m.addItem(conventionCheckItem = new CheckboxMenuItem(Locale.LS("Conventional Current Motion")));
	m.addItem(noEditCheckItem = new CheckboxMenuItem(Locale.LS("Disable Editing")));

	m.addItem(mouseWheelEditCheckItem = new CheckboxMenuItem(Locale.LS("Edit Values With Mouse Wheel"),
		new Command() { public void execute(){
		    sim.setOptionInStorage("mouseWheelEdit", mouseWheelEditCheckItem.getState());
		}
	}));

	m.addItem(new CheckboxAlignedMenuItem(Locale.LS("Shortcuts..."), new MyCommand("options", "shortcuts")));
	m.addItem(optionsItem = new CheckboxAlignedMenuItem(Locale.LS("Other Options..."), new MyCommand("options","other")));
	if (isElectron())
	    m.addItem(new CheckboxAlignedMenuItem(Locale.LS("Toggle Dev Tools"), new MyCommand("options","devtools")));

	m = new MenuBar(true);
	m.addItem(new MenuItem(Locale.LS("Convert Wires to Routed Wires"), new MyCommand("tools", "convertWires")));
	m.addItem(new MenuItem(Locale.LS("Subcircuit Manager"), new MyCommand("tools", "subcircuits")));
	if (TestCreator.enabled)
	    m.addItem(new MenuItem(Locale.LS("Create Test"), new MyCommand("tools", "createTest")));
	menuBar.addItem(Locale.LS("Tools"), m);

	mainMenuBar = new MenuBar(true);
	mainMenuBar.setAutoOpen(true);
	composeMainMenu(mainMenuBar, 0);
	composeMainMenu(drawMenuBar, 1);

	elmMenuBar = new MenuBar(true);
	elmMenuBar.setAutoOpen(true);
	elmMenuBar.addItem(elmEditMenuItem = new MenuItem(Locale.LS("Edit..."),new MyCommand("elm","edit")));
	elmMenuBar.addItem(elmScopeMenuItem = new MenuItem(Locale.LS("View in New Scope"), new MyCommand("elm","viewInScope")));
	elmMenuBar.addItem(elmFloatScopeMenuItem  = new MenuItem(Locale.LS("View in New Undocked Scope"), new MyCommand("elm","viewInFloatScope")));
	elmMenuBar.addItem(elmAddScopeMenuItem = new MenuItem(Locale.LS("Add to Existing Scope"), new MyCommand("elm", "addToScope0")));
	elmMenuBar.addItem(elmCutMenuItem = new MenuItem(Locale.LS("Cut"),new MyCommand("elm","cut")));
	elmMenuBar.addItem(elmCopyMenuItem = new MenuItem(Locale.LS("Copy"),new MyCommand("elm","copy")));
	elmMenuBar.addItem(elmDeleteMenuItem = new MenuItem(Locale.LS("Delete"),new MyCommand("elm","delete")));
	elmMenuBar.addItem(                    new MenuItem(Locale.LS("Duplicate"),new MyCommand("elm","duplicate")));
	elmMenuBar.addItem(elmSwapMenuItem = new MenuItem(Locale.LS("Swap Terminals"),new MyCommand("elm","flip")));
	elmMenuBar.addItem(elmFlipXMenuItem =  new MenuItem(Locale.LS("Flip X"),new MyCommand("elm","flipx")));
	elmMenuBar.addItem(elmFlipYMenuItem =  new MenuItem(Locale.LS("Flip Y"),new MyCommand("elm","flipy")));
	elmMenuBar.addItem(elmFlipXYMenuItem =  new MenuItem(Locale.LS("Flip XY"),new MyCommand("elm","flipxy")));
	elmMenuBar.addItem(elmSplitMenuItem = menuItemWithShortcut("", "Split Wire", Locale.LS(ctrlMetaKey + "click"), new MyCommand("elm","split")));
	elmMenuBar.addItem(elmSliderMenuItem = new MenuItem(Locale.LS("Sliders..."),new MyCommand("elm","sliders")));
    }

    // this is called twice, once for the Draw menu, once for the right mouse popup menu
    public void composeMainMenu(MenuBar mainMenuBar, int num) {
	makeClassCheckItems(mainMenuBar, new String[] { "Add Wire", "WireElm", "Add Routed Wire", "RoutedWireElm", "Add Resistor", "ResistorElm" });

    	MenuBar passMenuBar = new MenuBar(true);
	makeClassCheckItems(passMenuBar, new String[] {
		"Add Capacitor", "CapacitorElm",
		"Add Capacitor (polarized)", "PolarCapacitorElm",
		"Add Inductor", "InductorElm",
		"Add Switch", "SwitchElm",
		"Add Push Switch", "PushSwitchElm",
		"Add SPDT Switch", "Switch2Elm",
		"Add DPDT Switch", "DPDTSwitchElm",
		"Add Make-Before-Break Switch", "MBBSwitchElm",
		"Add Potentiometer", "PotElm",
		"Add Transformer", "TransformerElm",
		"Add Tapped Transformer", "TappedTransformerElm",
		"Add Custom Transformer", "CustomTransformerElm",
		"Add Transmission Line", "TransLineElm",
		"Add Relay", "RelayElm",
		"Add Relay Coil", "RelayCoilElm",
		"Add Relay Contact", "RelayContactElm",
		"Add Photoresistor", "LDRElm",
		"Add Thermistor", "ThermistorNTCElm",
		"Add Memristor", "MemristorElm",
		"Add Spark Gap", "SparkGapElm",
		"Add Fuse", "FuseElm",
		"Add Crystal", "CrystalElm",
		"Add Cross Switch", "CrossSwitchElm"
	});
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Passive Components")), passMenuBar);

    	MenuBar inputMenuBar = new MenuBar(true);
	makeClassCheckItems(inputMenuBar, new String[] {
		"Add Ground", "GroundElm",
		"Add Voltage Source (2-terminal)", "DCVoltageElm",
		"Add A/C Voltage Source (2-terminal)", "ACVoltageElm",
		"Add Voltage Source (1-terminal)", "RailElm",
		"Add A/C Voltage Source (1-terminal)", "ACRailElm",
		"Add Square Wave Source (1-terminal)", "SquareRailElm",
		"Add Clock", "ClockElm",
		"Add A/C Sweep", "SweepElm",
		"Add Variable Voltage", "VarRailElm",
		"Add Antenna", "AntennaElm",
		"Add AM Source", "AMElm",
		"Add FM Source", "FMElm",
		"Add Current Source", "CurrentElm",
		"Add Noise Generator", "NoiseElm",
		"Add Audio Input", "AudioInputElm",
		"Add Data Input", "DataInputElm",
		"Add External Voltage (JavaScript)", "ExtVoltageElm"
	});

    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Inputs and Sources")), inputMenuBar);
    	
    	MenuBar outputMenuBar = new MenuBar(true);
	makeClassCheckItems(outputMenuBar, new String[] {
		"Add Analog Output", "OutputElm",
		"Add LED", "LEDElm",
		"Add Lamp", "LampElm",
		"Add Text", "TextElm",
		"Add Box", "BoxElm",
		"Add Line", "LineElm",
		"Add Labeled Node", "LabeledNodeElm",
		"Add Voltmeter/Scope Probe", "ProbeElm",
		"Add Ohmmeter", "OhmMeterElm",
		"Add Ammeter", "AmmeterElm",
		"Add Wattmeter", "WattmeterElm",
		"Add Test Point", "TestPointElm",
		"Add Decimal Display", "DecimalDisplayElm",
		"Add Instruction Display", "InstructionDisplayElm",
		"Add LED Array", "LEDArrayElm",
		"Add Data Export", "DataRecorderElm",
		"Add Audio Output", "AudioOutputElm",
		"Add Stop Trigger", "StopTriggerElm",
		"Add DC Motor", "DCMotorElm",
		"Add 3-Phase Motor", "ThreePhaseMotorElm"
	});
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Outputs and Labels")), outputMenuBar);
    	
    	MenuBar activeMenuBar = new MenuBar(true);
	makeClassCheckItems(activeMenuBar, new String[] {
		"Add Diode", "DiodeElm",
		"Add Zener Diode", "ZenerElm",
		"Add Transistor (bipolar, NPN)", "NTransistorElm",
		"Add Transistor (bipolar, PNP)", "PTransistorElm",
		"Add MOSFET (N-Channel)", "NMosfetElm",
		"Add MOSFET (P-Channel)", "PMosfetElm",
		"Add JFET (N-Channel)", "NJfetElm",
		"Add JFET (P-Channel)", "PJfetElm",
		"Add SCR", "SCRElm",
		"Add DIAC", "DiacElm",
		"Add TRIAC", "TriacElm",
		"Add Darlington Pair (NPN)", "NDarlingtonElm",
		"Add Darlington Pair (PNP)", "PDarlingtonElm",
		"Add Varactor/Varicap", "VaractorElm",
		"Add Tunnel Diode", "TunnelDiodeElm",
		"Add Triode", "TriodeElm",
		"Add Unijunction Transistor", "UnijunctionElm"
	});
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Active Components")), activeMenuBar);

    	MenuBar activeBlocMenuBar = new MenuBar(true);
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Active Building Blocks")), activeBlocMenuBar);
    	
    	MenuBar gateMenuBar = new MenuBar(true);
	makeClassCheckItems(gateMenuBar, new String[] {
		"Add Logic Input", "LogicInputElm",
		"Add Logic Output", "LogicOutputElm",
		"Add Bus Input", "BusLogicInputElm",
		"Add Inverter", "InverterElm",
		"Add NAND Gate", "NandGateElm",
		"Add NOR Gate", "NorGateElm",
		"Add AND Gate", "AndGateElm",
		"Add OR Gate", "OrGateElm",
		"Add XOR Gate", "XorGateElm",
		"Add XNOR Gate", "XnorGateElm"
	});
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Logic Gates, Input and Output")), gateMenuBar);

    	MenuBar chipMenuBar = new MenuBar(true);
	makeClassCheckItems(chipMenuBar, new String[] {
		"Add D Flip-Flop", "DFlipFlopElm",
		"Add JK Flip-Flop", "JKFlipFlopElm",
		"Add T Flip-Flop", "TFlipFlopElm",
		"Add 7 Segment LED", "SevenSegElm",
		"Add 7 Segment Decoder", "SevenSegDecoderElm",
		"Add Multiplexer", "MultiplexerElm",
		"Add Demultiplexer", "DeMultiplexerElm",
		"Add SIPO shift register", "SipoShiftElm",
		"Add PISO shift register", "PisoShiftElm",
		"Add Counter", "CounterElm",
		"Add Counter w/ Load", "Counter2Elm",
		"Add Ring Counter", "DecadeElm",
		"Add Latch", "LatchElm",
		"Add Sequence generator", "SeqGenElm",
		"Add Adder", "FullAdderElm",
		"Add Half Adder", "HalfAdderElm",
		"Add Custom Logic", "UserDefinedLogicElm", // don't change this, it will break people's saved shortcuts
		"Add Static RAM", "SRAMElm",
		"Add ROM", "ROMElm",
		"Add Bus Transceiver", "BusTransceiverElm",
		"Add Bus Splitter", "BusSplitterElm"
	});
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Digital Chips")), chipMenuBar);
    	
    	MenuBar achipMenuBar = new MenuBar(true);
	makeClassCheckItems(achipMenuBar, new String[] {
		"Add 555 Timer", "TimerElm",
		"Add Phase Comparator", "PhaseCompElm",
		"Add DAC", "DACElm",
		"Add ADC", "ADCElm",
		"Add VCO", "VCOElm",
		"Add Monostable", "MonostableElm"
	});
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Analog and Hybrid Chips")), achipMenuBar);
    	
	// do these later so all the other elements are added to the map first
	makeClassCheckItems(activeBlocMenuBar, new String[] {
		"Add Op Amp (ideal, - on top)", "OpAmpElm",
		"Add Op Amp (ideal, + on top)", "OpAmpSwapElm",
		"Add Op Amp (real)", "OpAmpRealElm",
		"Add Analog Switch (SPST)", "AnalogSwitchElm",
		"Add Analog Switch (SPDT)", "AnalogSwitch2Elm",
		"Add Analog Multiplexer", "AnalogMuxElm",
		"Add Tristate Buffer", "TriStateElm",
		"Add Schmitt Trigger", "SchmittElm",
		"Add Schmitt Trigger (Inverting)", "InvertingSchmittElm",
		"Add Delay Buffer", "DelayBufferElm",
		"Add CCII+", "CC2Elm",
		"Add CCII-", "CC2NegElm",
		"Add Comparator (Hi-Z/GND output)", "ComparatorElm",
		"Add OTA (LM13700 style)", "OTAElm",
		"Add Voltage-Controlled Voltage Source (VCVS)", "VCVSElm",
		"Add Voltage-Controlled Current Source (VCCS)", "VCCSElm",
		"Add Current-Controlled Voltage Source (CCVS)", "CCVSElm",
		"Add Current-Controlled Current Source (CCCS)", "CCCSElm",
		"Add Optocoupler", "OptocouplerElm",
		"Add Time Delay Relay", "TimeDelayRelayElm",
		"Add LM317", "CustomCompositeElm:~LM317-v2",
		"Add TL431", "CustomCompositeElm:~TL431",
		"Add Motor Protection Switch", "MotorProtectionSwitchElm",
		"Add Subcircuit Instance", "CustomCompositeElm",
	});

    	if (subcircuitMenuBar == null)
    	    subcircuitMenuBar = new MenuBar[2];
    	subcircuitMenuBar[num] = new MenuBar(true);
    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Subcircuits")), subcircuitMenuBar[num]);
    	
    	MenuBar otherMenuBar = new MenuBar(true);
    	CheckboxMenuItem mi;
    	otherMenuBar.addItem(mi=getClassCheckItem(Locale.LS("Drag All"), "DragAll"));
    	mi.setShortcut(Locale.LS("(Alt-drag)"));
    	otherMenuBar.addItem(mi=getClassCheckItem(Locale.LS("Drag Row"), "DragRow"));
    	mi.setShortcut(Locale.LS("(A-S-drag)"));
    	otherMenuBar.addItem(mi=getClassCheckItem(Locale.LS("Drag Column"), "DragColumn"));
    	mi.setShortcut(isMac ? Locale.LS("(A-Cmd-drag)") : Locale.LS("(A-M-drag)"));
    	otherMenuBar.addItem(getClassCheckItem(Locale.LS("Drag Selected"), "DragSelected"));
    	otherMenuBar.addItem(mi=getClassCheckItem(Locale.LS("Drag Post"), "DragPost"));
    	mi.setShortcut("(" + ctrlMetaKey + "drag)");

    	mainMenuBar.addItem(SafeHtmlUtils.fromTrustedString(CheckboxMenuItem.checkBoxHtml+Locale.LS("&nbsp;</div>Drag")), otherMenuBar);

    	mainMenuBar.addItem(mi=getClassCheckItem(Locale.LS("Select/Drag Sel"), "Select"));
	mi.setShortcut(Locale.LS("(space or Shift-drag)"));
    }
    
    void makeClassCheckItems(MenuBar mb, String items[]) {
	int i;
	for (i = 0; i < items.length; i += 2)
	    mb.addItem(getClassCheckItem(Locale.LS(items[i]), items[i+1]));
    }

    MenuItem menuItemWithShortcut(String icon, String text, String shortcut, MyCommand cmd) {
        final String edithtml="<div style=\"white-space:nowrap\"><div style=\"display:inline-block;width:100%;\"><i class=\"cirjsicon-";
        String nbsp = "&nbsp;";
        if (icon=="") nbsp="";
        String sn=edithtml + icon + "\"></i>" + nbsp + Locale.LS(text) + "</div>" + shortcut + "</div>";
        return new MenuItem(SafeHtmlUtils.fromTrustedString(sn), cmd);
    }
    
    MenuItem iconMenuItem(String icon, String text, Command cmd) {
        String icoStr = "<i class=\"cirjsicon-" + icon + "\"></i>&nbsp;" + Locale.LS(text); //<i class="cirjsicon-"></i>&nbsp;
        return new MenuItem(SafeHtmlUtils.fromTrustedString(icoStr), cmd);
    }

    CheckboxMenuItem getClassCheckItem(String s, String t) { return sim.ui.getClassCheckItem(s, t); }
    
    boolean isElectron() { return CirSim.isElectron(); }

    void getSetupList(final boolean openDefault) {

    	String url;
    	url = GWT.getModuleBaseURL()+"setuplist.txt"; // +"?v="+random.nextInt();
	RequestBuilder requestBuilder = new RequestBuilder(RequestBuilder.GET, url);
	try {
	    requestBuilder.sendRequest(null, new RequestCallback() {
		public void onError(Request request, Throwable exception) {
		    if (!hideMenu)
			Window.alert(Locale.LS("Can't load circuit list!"));
		    GWT.log("File Error Response", exception);
		}

		public void onResponseReceived(Request request, Response response) {
		    // processing goes here
		    if (response.getStatusCode()==Response.SC_OK) {
		    String text = response.getText();
		    processSetupList(text.getBytes(), openDefault);
		    // end or processing
		    }
		    else { 
			Window.alert(Locale.LS("Can't load circuit list!"));
			GWT.log("Bad file server response:"+response.getStatusText() );
		    }
		}
	    });
	} catch (RequestException e) {
	    GWT.log("failed file reading", e);
	}
    }
		
    void processSetupList(byte b[], final boolean openDefault) {
	int len = b.length;
    	MenuBar currentMenuBar;
    	MenuBar stack[] = new MenuBar[6];
    	int stackptr = 0;
    	currentMenuBar=new MenuBar(true);
    	currentMenuBar.setAutoOpen(true);
    	menuBar.addItem(Locale.LS("Circuits"), currentMenuBar);
    	stack[stackptr++] = currentMenuBar;
    	int p;
    	for (p = 0; p < len; ) {
	    int l;
	    for (l = 0; l != len-p; l++)
		if (b[l+p] == '\n' || b[l+p] == '\r') {
			l++;
			break;
		}
	    String line = new String(b, p, l-1);
	    if (line.isEmpty() || line.charAt(0) == '#')
		    ;
	    else if (line.charAt(0) == '+') {
	    //	MenuBar n = new Menu(line.substring(1));
		MenuBar n = new MenuBar(true);
		n.setAutoOpen(true);
		currentMenuBar.addItem(Locale.LS(line.substring(1)),n);
		currentMenuBar = stack[stackptr++] = n;
	    } else if (line.charAt(0) == '-') {
		    currentMenuBar = stack[--stackptr-1];
	    } else {
		int i = line.indexOf(' ');
		if (i > 0) {
		    String title = Locale.LS(line.substring(i+1));
		    boolean first = false;
		    if (line.charAt(0) == '>')
			    first = true;
		    String file = line.substring(first ? 1 : 0, i);
		    currentMenuBar.addItem(new MenuItem(title,
			    new MyCommand("circuits", "setup "+file+" " + title)));
		    String startCircuit = sim.startCircuit;
		    String startLabel = sim.startLabel;
		    if (file.equals(startCircuit) && startLabel == null) {
			startLabel = title;
			sim.setCircuitTitle(title);
		    }
		    if (first && startCircuit == null) {
			startCircuit = file;
			startLabel = title;
			if (openDefault && sim.stopMessage == null)
			    readSetupFile(startCircuit, startLabel);
		    }
		}
	    }
	    p += l;
    	}
    }

    void readSetupFile(String str, String title) {
	System.out.println(str);
	sim.resetEditingContext();
	// don't avoid caching here, it's unnecessary and makes offline PWA's not work
	String url=GWT.getModuleBaseURL()+"circuits/"+str; // +"?v="+random.nextInt();
	sim.loader.loadFileFromURL(url);
	if (title != null)
	    sim.setCircuitTitle(title);
	sim.unsavedChanges = false;
	ExportAsLocalFileDialog.setLastFileName(str.equals("blank.txt") ? null : str);
    }
}

