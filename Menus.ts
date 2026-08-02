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

// GWT conversion (c) 2015 by Iain Sharp

import { CirSim } from "./CirSim";
import { Locale } from "./Locale";

// ---- State classes used by UIManager ----

// A checkbox-style options menu item.  Maintains a boolean state and an
// optional command run whenever the item is toggled.
export class CheckItem {
    private _state: boolean;
    private _command: (() => void) | null = null;
    _li: HTMLLIElement | null = null;  // linked DOM element, set when added to a Menu

    constructor(state: boolean = false) { this._state = state; }

    getState(): boolean { return this._state; }

    setState(s: boolean): void {
        this._state = s;
        if (this._li) {
            const mark = this._li.querySelector('.checkMark') as HTMLElement | null;
            if (mark) mark.style.visibility = s ? 'visible' : 'hidden';
        }
    }

    setCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }
    setScheduledCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }

    // Toggle state then run command (called on click)
    toggle(): void {
        this.setState(!this._state);
        if (this._command) this._command();
    }

    execute(): void { if (this._command) this._command(); }
}

// A regular (non-checkbox) menu item — tracks enabled state and links to its DOM element.
export class MenuItem {
    private _enabled: boolean = true;
    private _command: (() => void) | null = null;
    _li: HTMLLIElement | null = null;

    setEnabled(b: boolean): void {
        this._enabled = b;
        if (this._li) this._li.classList.toggle('menuItemDisabled', !b);
    }

    isEnabled(): boolean { return this._enabled; }

    setScheduledCommand(cmd: { execute(): void }): void { this._command = () => cmd.execute(); }

    // GWT compatibility aliases used by scope popup menus
    setCommand(cmd: { execute(): void } | null): void { this._command = cmd ? () => cmd.execute() : null; }
    setSubMenu(_sub: any): void { /* scope submenu — not used in plain HTML menus */ }

    execute(): void { if (this._enabled && this._command) this._command(); }
}

// ---- Internal menu-building helpers ----

function closeAllMenus(): void {
    document.querySelectorAll('.gwt-MenuItem.open, .topMenuItem.open').forEach(el => el.classList.remove('open'));
}

function anyMenuOpen(): boolean {
    return document.querySelector('.gwt-MenuItem.open, .topMenuItem.open') !== null;
}

// Build "<i class='cirjsicon-X'></i>&nbsp;Label" HTML for icon menu items.
function iconHtml(icon: string, text: string): string {
    const ls = Locale.LS(text);
    return icon ? `<i class="cirjsicon-${icon}"></i>&nbsp;${ls}` : ls;
}

// Build the two-column "icon+text | shortcut" layout used by menuItemWithShortcut.
function shortcutHtml(icon: string, text: string, shortcut: string): string {
    const inner = iconHtml(icon, text);
    return `<div class="menuItemRow"><span>${inner}</span><span class="shortcutHint">${shortcut}</span></div>`;
}

// A vertical dropdown menu (equivalent to GWT MenuBar(true)).
class Menu {
    ul: HTMLUListElement;
    private app: CirSim;

    constructor(app: CirSim) {
        this.app = app;
        this.ul = document.createElement('ul');
        this.ul.className = 'menuDropdown';
    }

    // Add a simple command item, returns the <li> for optional post-setup.
    addCommand(html: string, menuName: string, cmdName: string): HTMLLIElement {
        const li = this.makeLi(html);
        li.addEventListener('click', e => {
            if (li.classList.contains('menuItemDisabled')) return;
            e.stopPropagation();
            closeAllMenus();
            this.app.commands.menuPerformed(menuName, cmdName);
        });
        this.ul.appendChild(li);
        return li;
    }

    // Add a command item and wire it to a MenuItem state object.
    addMenuItem(item: MenuItem, html: string, menuName: string, cmdName: string): void {
        const li = this.addCommand(html, menuName, cmdName);
        item._li = li;
        item.setEnabled(item.isEnabled());
        item.setScheduledCommand({ execute: () => this.app.commands.menuPerformed(menuName, cmdName) });
    }

    // Add a CheckItem (toggles on click, shows checkmark).
    addCheckItem(item: CheckItem, label: string): void {
        const li = this.makeLi('');
        li.innerHTML = `<span class="checkMark">&#10003;</span> ${Locale.LS(label)}`;
        const mark = li.querySelector('.checkMark') as HTMLElement;
        mark.style.visibility = item.getState() ? 'visible' : 'hidden';
        item._li = li;
        li.addEventListener('click', e => {
            e.stopPropagation();
            closeAllMenus();
            item.toggle();
        });
        this.ul.appendChild(li);
    }

    // Add a CheckboxMenuItem from UIManager.getClassCheckItem (element-placement mode).
    // The item has getLabel(), getShortcut(), execute(), and a _li property.
    addCheckboxItem(item: any): void {
        const li = this.makeLi('');
        const label = item.getLabel ? item.getLabel() : String(item);
        const sc = item.getShortcut ? item.getShortcut() : '';
        li.innerHTML = `<span class="checkMark">&#10003;</span> <span class="itemLabel">${Locale.LS(label)}</span>` +
            (sc ? `<span class="shortcutHint">${sc}</span>` : '');
        (li.querySelector('.checkMark') as HTMLElement).style.visibility = 'hidden';
        item._li = li;
        li.addEventListener('click', e => {
            e.stopPropagation();
            closeAllMenus();
            item.execute();
        });
        this.ul.appendChild(li);
    }

    // Add a submenu entry (hover opens the child menu).
    addSubmenu(html: string, sub: Menu): HTMLLIElement {
        const li = this.makeLi(html + '<span class="submenuArrow">&#9658;</span>');
        li.classList.add('hasSubmenu');
        li.appendChild(sub.ul);
        this.ul.appendChild(li);
        return li;
    }

    addSeparator(): void {
        const sep = document.createElement('li');
        sep.className = 'menuSeparator';
        this.ul.appendChild(sep);
    }

    // Clear all items — used when rebuilding the dynamic Subcircuits submenu.
    clearItems(): void { this.ul.innerHTML = ''; }

    private makeLi(html: string): HTMLLIElement {
        const li = document.createElement('li');
        li.className = 'menuItem';
        li.innerHTML = html;
        return li;
    }
}

// Prefix HTML for submenu headings — mirrors CheckboxMenuItem.checkBoxHtml in the Java.
// A hidden checkmark placeholder keeps heading text aligned with regular items.
const subheadHtml = '<span class="checkMark" style="visibility:hidden">&#10003;</span>&nbsp;';

// ---- Main Menus class ----

export class Menus {

    aboutItem                = new MenuItem();
    importFromLocalFileItem  = new MenuItem();
    importFromTextItem       = new MenuItem();
    exportAsUrlItem          = new MenuItem();
    exportAsLocalFileItem    = new MenuItem();
    exportAsTextItem         = new MenuItem();
    printItem                = new MenuItem();
    recoverItem              = new MenuItem();
    saveFileItem             = new MenuItem();
    importFromDropboxItem    = new MenuItem();
    undoItem                 = new MenuItem();
    redoItem                 = new MenuItem();
    cutItem                  = new MenuItem();
    copyItem                 = new MenuItem();
    pasteItem                = new MenuItem();
    selectAllItem            = new MenuItem();
    optionsItem              = new MenuItem();
    rotateItem                = new MenuItem();
    mirrorItem                = new MenuItem();
    stackAllItem             = new MenuItem();
    unstackAllItem           = new MenuItem();
    combineAllItem           = new MenuItem();
    separateAllItem          = new MenuItem();
    elmEditMenuItem          = new MenuItem();
    elmCutMenuItem           = new MenuItem();
    elmCopyMenuItem          = new MenuItem();
    elmDeleteMenuItem        = new MenuItem();
    elmScopeMenuItem         = new MenuItem();
    elmFloatScopeMenuItem    = new MenuItem();
    elmAddScopeMenuItem      = new MenuItem();
    elmSplitMenuItem         = new MenuItem();
    elmSliderMenuItem        = new MenuItem();
    elmRotateMenuItem        = new MenuItem();
    elmMirrorMenuItem        = new MenuItem();
    elmSwapMenuItem          = new MenuItem();
    scopeRemovePlotMenuItem  = new MenuItem();
    scopeSelectYMenuItem     = new MenuItem();

    dotsCheckItem            = new CheckItem(true);
    voltsCheckItem           = new CheckItem(true);
    powerCheckItem           = new CheckItem();
    smallGridCheckItem       = new CheckItem();
    crossHairCheckItem       = new CheckItem();
    showValuesCheckItem      = new CheckItem(true);
    conductanceCheckItem     = new CheckItem();
    euroResistorCheckItem    = new CheckItem();
    euroGatesCheckItem       = new CheckItem();
    printableCheckItem       = new CheckItem();
    conventionCheckItem      = new CheckItem(true);
    noEditCheckItem          = new CheckItem();
    mouseWheelEditCheckItem  = new CheckItem(true);
    toolbarCheckItem         = new CheckItem(true);

    menuBar: HTMLElement = document.createElement('nav');
    // right-click context popup — same Draw menu content, built separately
    mainMenuBar: HTMLElement = document.createElement('ul');
    elmMenuBar: HTMLElement = document.createElement('ul');
    subcircuitMenuBar: Menu[] | null = null;

    hideMenu: boolean = false;
    isMac: boolean = false;
    ctrlMetaKey: string = "Ctrl-";

    private app: CirSim;

    constructor(app?: CirSim) {
        this.app = app as CirSim;
    }

    private menuBarRow: HTMLTableRowElement = document.createElement('tr');

    init(): void {
        const os = navigator.platform;
        this.isMac = os.toLowerCase().includes("mac");
        this.ctrlMetaKey = this.isMac ? Locale.LS("Cmd-") : Locale.LS("Ctrl-");

        // Wrapper: sized by UIManager (height + flexShrink), holds the abs-positioned bar
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        this.menuBar = wrapper;

        // Inner bar matches the Java gwt-MenuBar structure
        const bar = document.createElement('div');
        bar.setAttribute('tabindex', '0');
        bar.setAttribute('role', 'menubar');
        bar.className = 'gwt-MenuBar gwt-MenuBar-horizontal';
        bar.style.cssText = 'outline: 0; position: absolute; inset: 0;';

        const table = document.createElement('table');
        table.addEventListener('click', () => closeAllMenus());
        const tbody = document.createElement('tbody');
        this.menuBarRow = document.createElement('tr');
        tbody.appendChild(this.menuBarRow);
        table.appendChild(tbody);
        bar.appendChild(table);

        // Hidden focus-trap input (matches Java)
        const focusTrap = document.createElement('input');
        focusTrap.type = 'text';
        focusTrap.tabIndex = -1;
        focusTrap.setAttribute('aria-hidden', 'true');
        focusTrap.style.cssText = 'opacity:0;height:1px;width:1px;z-index:-1;overflow:hidden;position:absolute;';
        bar.appendChild(focusTrap);

        wrapper.appendChild(bar);

        const ck = this.ctrlMetaKey;

        // ---- File menu ----
        const fileMenu = new Menu(this.app);
        if (this.isElectron())
            fileMenu.addCommand(shortcutHtml("window", "New Window...", Locale.LS(ck + "N")), "file", "newwindow");

        fileMenu.addCommand(iconHtml("doc-new", "New Blank Circuit"), "file", "newblankcircuit");

        fileMenu.addMenuItem(this.importFromLocalFileItem,
            shortcutHtml("folder", "Open File...", Locale.LS(ck + "O")), "file", "importfromlocalfile");
        this.importFromLocalFileItem.setEnabled(typeof FileReader !== 'undefined');

        fileMenu.addMenuItem(this.importFromTextItem,
            iconHtml("doc-text", "Import From Text..."), "file", "importfromtext");
        fileMenu.addMenuItem(this.importFromDropboxItem,
            iconHtml("dropbox", "Import From Dropbox..."), "file", "importfromdropbox");

        if (this.isElectron()) {
            fileMenu.addMenuItem(this.saveFileItem,
                shortcutHtml("floppy", "Save", Locale.LS(ck + "S")), "file", "save");
            fileMenu.addCommand(iconHtml("floppy", "Save As..."), "file", "saveas");
        } else {
            fileMenu.addMenuItem(this.exportAsLocalFileItem,
                shortcutHtml("floppy", "Save As...", Locale.LS(ck + "S")), "file", "exportaslocalfile");
            this.exportAsLocalFileItem.setEnabled("download" in document.createElement("a"));
        }

        fileMenu.addMenuItem(this.exportAsUrlItem,
            iconHtml("export", "Export As Link..."), "file", "exportasurl");
        fileMenu.addMenuItem(this.exportAsTextItem,
            iconHtml("export", "Export As Text..."), "file", "exportastext");
        fileMenu.addCommand(iconHtml("image", "Export As Image..."),                    "file", "exportasimage");
        fileMenu.addCommand(iconHtml("image", "Copy Circuit Image to Clipboard"),       "file", "copypng");
        fileMenu.addCommand(iconHtml("image", "Export As SVG..."),                      "file", "exportassvg");
        fileMenu.addCommand(iconHtml("microchip", "Create Subcircuit..."),              "file", "createsubcircuit");
        fileMenu.addCommand(iconHtml("magic", "Find DC Operating Point"),               "file", "dcanalysis");
        fileMenu.addMenuItem(this.recoverItem,
            iconHtml("back-in-time", "Recover Auto-Save"), "file", "recover");
        fileMenu.addMenuItem(this.printItem,
            shortcutHtml("print", "Print...", Locale.LS(ck + "P")), "file", "print");
        fileMenu.addSeparator();
        fileMenu.addCommand(iconHtml("resize-full-alt", "Toggle Full Screen"), "view", "fullscreen");
        fileMenu.addSeparator();
        fileMenu.addMenuItem(this.aboutItem, iconHtml("info-circled", "About..."), "file", "about");

        // ---- Edit menu ----
        const editMenu = new Menu(this.app);
        editMenu.addMenuItem(this.undoItem,      shortcutHtml("ccw",        "Undo",       Locale.LS(ck + "Z")), "edit", "undo");
        editMenu.addMenuItem(this.redoItem,      shortcutHtml("cw",         "Redo",       Locale.LS(ck + "Y")), "edit", "redo");
        editMenu.addSeparator();
        editMenu.addMenuItem(this.cutItem,       shortcutHtml("scissors",   "Cut",        Locale.LS(ck + "X")), "edit", "cut");
        editMenu.addMenuItem(this.copyItem,      shortcutHtml("copy",       "Copy",       Locale.LS(ck + "C")), "edit", "copy");
        editMenu.addMenuItem(this.pasteItem,     shortcutHtml("paste",      "Paste",      Locale.LS(ck + "V")), "edit", "paste");
        editMenu.addCommand( shortcutHtml("clone",      "Duplicate",   Locale.LS(ck + "D")), "edit", "duplicate");
        editMenu.addSeparator();
        editMenu.addMenuItem(this.selectAllItem, shortcutHtml("select-all", "Select All", Locale.LS(ck + "A")), "edit", "selectAll");
        editMenu.addSeparator();
        editMenu.addCommand(shortcutHtml("search", "Find Component...", "/"),                 "edit", "search");
        editMenu.addCommand(iconHtml("target", Locale.weAreInUS(false) ? "Center Circuit" : "Centre Circuit"), "edit", "centercircuit");
        editMenu.addCommand(shortcutHtml("zoom-11",  "Zoom 100%", "0"), "zoom", "zoom100");
        editMenu.addCommand(shortcutHtml("zoom-in",  "Zoom In",   "+"), "zoom", "zoomin");
        editMenu.addCommand(shortcutHtml("zoom-out", "Zoom Out",  "-"), "zoom", "zoomout");
        editMenu.addMenuItem(this.rotateItem, iconHtml("cw",     "Rotate"), "edit", "rotate");
        editMenu.addMenuItem(this.mirrorItem, iconHtml("flip-x", "Mirror"), "edit", "mirror");

        // ---- Draw menu + right-click popup (same content, built twice) ----
        const drawMenu = new Menu(this.app);
        const popupMenu = new Menu(this.app);
        this.subcircuitMenuBar = [new Menu(this.app), new Menu(this.app)];
        this.composeMainMenu(popupMenu, 0);
        this.composeMainMenu(drawMenu,  1);
        this.mainMenuBar = popupMenu.ul;

        // ---- Scopes menu ----
        const scopesMenu = new Menu(this.app);
        scopesMenu.addMenuItem(this.stackAllItem,    iconHtml("lines",          "Stack All"),    "scopes", "stackAll");
        scopesMenu.addMenuItem(this.unstackAllItem,  iconHtml("columns",        "Unstack All"),  "scopes", "unstackAll");
        scopesMenu.addMenuItem(this.combineAllItem,  iconHtml("object-group",   "Combine All"),  "scopes", "combineAll");
        scopesMenu.addMenuItem(this.separateAllItem, iconHtml("object-ungroup", "Separate All"), "scopes", "separateAll");

        // ---- Options menu ----
        const optMenu = new Menu(this.app);
        optMenu.addCheckItem(this.dotsCheckItem, "Show Current");
        optMenu.addCheckItem(this.voltsCheckItem, "Show Voltage");
        this.voltsCheckItem.setCommand({ execute: () => {
            if (this.voltsCheckItem.getState()) this.powerCheckItem.setState(false);
            this.app.setPowerBarEnable();
        }});
        optMenu.addCheckItem(this.powerCheckItem, "Show Power");
        this.powerCheckItem.setCommand({ execute: () => {
            if (this.powerCheckItem.getState()) this.voltsCheckItem.setState(false);
            this.app.setPowerBarEnable();
        }});
        optMenu.addCheckItem(this.showValuesCheckItem, "Show Values");
        //optMenu.addCheckItem(this.conductanceCheckItem, "Show Conductance");
        optMenu.addCheckItem(this.smallGridCheckItem, "Small Grid");
        this.smallGridCheckItem.setCommand({ execute: () => this.app.setGrid() });
        optMenu.addCheckItem(this.toolbarCheckItem, "Toolbar");
        this.toolbarCheckItem.setCommand({ execute: () => this.app.ui?.setToolbar() });
        optMenu.addCheckItem(this.crossHairCheckItem, "Show Cursor Cross Hairs");
        this.crossHairCheckItem.setCommand({ execute: () =>
            this.app.ui?.setOptionInStorage("crossHair", this.crossHairCheckItem.getState()) });
        optMenu.addCheckItem(this.euroResistorCheckItem, "European Resistors");
        optMenu.addCheckItem(this.euroGatesCheckItem, "IEC Gates");
        optMenu.addCheckItem(this.printableCheckItem, "White Background");
        optMenu.addCheckItem(this.conventionCheckItem, "Conventional Current Motion");
        optMenu.addCheckItem(this.noEditCheckItem, "Disable Editing");
        optMenu.addCheckItem(this.mouseWheelEditCheckItem, "Edit Values With Mouse Wheel");
        this.mouseWheelEditCheckItem.setCommand({ execute: () =>
            this.app.ui?.setOptionInStorage("mouseWheelEdit", this.mouseWheelEditCheckItem.getState()) });
        optMenu.addCommand(Locale.LS("Shortcuts..."),    "options", "shortcuts");
        optMenu.addMenuItem(this.optionsItem, Locale.LS("Other Options..."), "options", "other");
        if (this.isElectron())
            optMenu.addCommand(Locale.LS("Toggle Dev Tools"), "options", "devtools");

        // ---- Tools menu ----
        const toolsMenu = new Menu(this.app);
        toolsMenu.addCommand(Locale.LS("Convert Wires to Routed Wires"), "tools", "convertWires");
        toolsMenu.addCommand(Locale.LS("Subcircuit Manager"),            "tools", "subcircuits");
        // if (TestCreator.enabled) toolsMenu.addCommand(Locale.LS("Create Test"), "tools", "createTest");

        // ---- Assemble horizontal bar ----
        this.addTopItem(this.menuBarRow, Locale.LS("File"),    fileMenu);
        this.addTopItem(this.menuBarRow, Locale.LS("Edit"),    editMenu);
        this.addTopItem(this.menuBarRow, Locale.LS("Draw"),    drawMenu);
        this.addTopItem(this.menuBarRow, Locale.LS("Scopes"),  scopesMenu);
        this.addTopItem(this.menuBarRow, Locale.LS("Options"), optMenu);
        this.addTopItem(this.menuBarRow, Locale.LS("Tools"),   toolsMenu);

        // ---- Element right-click context menu ----
        this.buildElmMenuBar();

        // Close any open dropdown when clicking outside the menu bar
        document.addEventListener('click', () => closeAllMenus());
    }

    // this is called twice, once for the Draw menu, once for the right mouse popup menu
    composeMainMenu(menu: Menu, num: number): void {
        this.makeClassCheckItems(menu, [
            "Add Wire",         "WireElm",
            "Add Routed Wire",  "RoutedWireElm",
            "Add Resistor",     "ResistorElm",
        ]);

        const passMenu = new Menu(this.app);
        this.makeClassCheckItems(passMenu, [
            "Add Capacitor",                "CapacitorElm",
            "Add Capacitor (polarized)",    "PolarCapacitorElm",
            "Add Inductor",                 "InductorElm",
            "Add Switch",                   "SwitchElm",
            "Add Push Switch",              "PushSwitchElm",
            "Add SPDT Switch",              "Switch2Elm",
            "Add DPDT Switch",              "DPDTSwitchElm",
            "Add Make-Before-Break Switch", "MBBSwitchElm",
            "Add Potentiometer",            "PotElm",
            "Add Transformer",              "TransformerElm",
            "Add Tapped Transformer",       "TappedTransformerElm",
            "Add Custom Transformer",       "CustomTransformerElm",
            "Add Transmission Line",        "TransLineElm",
            "Add Relay",                    "RelayElm",
            "Add Relay Coil",               "RelayCoilElm",
            "Add Relay Contact",            "RelayContactElm",
            "Add Photoresistor",            "LDRElm",
            "Add Thermistor",               "ThermistorNTCElm",
            "Add Memristor",               "MemristorElm",
            "Add Spark Gap",               "SparkGapElm",
            "Add Fuse",                    "FuseElm",
            "Add Crystal",                 "CrystalElm",
            "Add Cross Switch",            "CrossSwitchElm",
            "Add Gyrator",                 "GyratorElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Passive Components"), passMenu);

        const inputMenu = new Menu(this.app);
        this.makeClassCheckItems(inputMenu, [
            "Add Ground",                           "GroundElm",
            "Add Voltage Source (2-terminal)",      "DCVoltageElm",
            "Add A/C Voltage Source (2-terminal)",  "ACVoltageElm",
            "Add Voltage Source (1-terminal)",      "RailElm",
            "Add A/C Voltage Source (1-terminal)",  "ACRailElm",
            "Add Square Wave Source (1-terminal)",  "SquareRailElm",
            "Add Clock",                            "ClockElm",
            "Add A/C Sweep",                        "SweepElm",
            "Add Variable Voltage",                 "VarRailElm",
            "Add Antenna",                          "AntennaElm",
            "Add AM Source",                        "AMElm",
            "Add FM Source",                        "FMElm",
            "Add Current Source",                   "CurrentElm",
            "Add Noise Generator",                  "NoiseElm",
            "Add Audio Input",                      "AudioInputElm",
            "Add Data Input",                       "DataInputElm",
            "Add External Voltage (JavaScript)",    "ExtVoltageElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Inputs and Sources"), inputMenu);

        const outputMenu = new Menu(this.app);
        this.makeClassCheckItems(outputMenu, [
            "Add Analog Output",              "OutputElm",
            "Add LED",                        "LEDElm",
            "Add Lamp",                       "LampElm",
            "Add Text",                       "TextElm",
            "Add Box",                        "BoxElm",
            "Add Line",                       "LineElm",
            "Add Labeled Node",               "LabeledNodeElm",
            "Add Voltmeter/Scope Probe",      "ProbeElm",
            "Add Ohmmeter",                   "OhmMeterElm",
            "Add Ammeter",                    "AmmeterElm",
            "Add Wattmeter",                  "WattmeterElm",
            "Add Test Point",                 "TestPointElm",
            "Add Decimal Display",            "DecimalDisplayElm",
            "Add Instruction Display",        "InstructionDisplayElm",
            "Add LED Array",                  "LEDArrayElm",
            "Add Data Export",                "DataRecorderElm",
            "Add Audio Output",               "AudioOutputElm",
            "Add Stop Trigger",               "StopTriggerElm",
            "Add DC Motor",                   "DCMotorElm",
            "Add 3-Phase Motor",              "ThreePhaseMotorElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Outputs and Labels"), outputMenu);

        // need these registered before unijunction element setup
        this.app.register("CCVSElm", this.app.constructElement("CCVSElm", 0, 0));
        this.app.register("VCCSElm", this.app.constructElement("VCCSElm", 0, 0));

        const activeMenu = new Menu(this.app);
        this.makeClassCheckItems(activeMenu, [
            "Add Diode",                          "DiodeElm",
            "Add Zener Diode",                    "ZenerElm",
            "Add Transistor (bipolar, NPN)",      "NTransistorElm",
            "Add Transistor (bipolar, PNP)",      "PTransistorElm",
            "Add MOSFET (N-Channel)",             "NMosfetElm",
            "Add MOSFET (P-Channel)",             "PMosfetElm",
            "Add JFET (N-Channel)",               "NJfetElm",
            "Add JFET (P-Channel)",               "PJfetElm",
            "Add SCR",                            "SCRElm",
            "Add DIAC",                           "DiacElm",
            "Add TRIAC",                          "TriacElm",
            "Add Darlington Pair (NPN)",          "NDarlingtonElm",
            "Add Darlington Pair (PNP)",          "PDarlingtonElm",
            "Add Varactor/Varicap",               "VaractorElm",
            "Add Tunnel Diode",                   "TunnelDiodeElm",
            "Add Triode",                         "TriodeElm",
            "Add Unijunction Transistor",         "UnijunctionElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Active Components"), activeMenu);

        // do these later so all the other elements are added to the map first
        const activeBlocMenu = new Menu(this.app);
        this.makeClassCheckItems(activeBlocMenu, [
            "Add Op Amp (ideal, - on top)",                   "OpAmpElm",
            "Add Op Amp (ideal, + on top)",                   "OpAmpSwapElm",
            "Add Op Amp (real)",                              "OpAmpRealElm",
            "Add Analog Switch (SPST)",                       "AnalogSwitchElm",
            "Add Analog Switch (SPDT)",                       "AnalogSwitch2Elm",
            "Add Analog Multiplexer",                         "AnalogMuxElm",
            "Add Tristate Buffer",                            "TriStateElm",
            "Add Schmitt Trigger",                            "SchmittElm",
            "Add Schmitt Trigger (Inverting)",                "InvertingSchmittElm",
            "Add Delay Buffer",                               "DelayBufferElm",
            "Add CCII+",                                      "CC2Elm",
            "Add CCII-",                                      "CC2NegElm",
            "Add Comparator (Hi-Z/GND output)",               "ComparatorElm",
            "Add OTA (LM13700 style)",                        "OTAElm",
            "Add Norton Amp (LM3900)",                        "NortonAmpElm",
            "Add Voltage-Controlled Voltage Source (VCVS)",  "VCVSElm",
            "Add Voltage-Controlled Current Source (VCCS)",  "VCCSElm",
            "Add Current-Controlled Voltage Source (CCVS)",  "CCVSElm",
            "Add Current-Controlled Current Source (CCCS)",  "CCCSElm",
            "Add Optocoupler",                                "OptocouplerElm",
            "Add Time Delay Relay",                           "TimeDelayRelayElm",
            "Add LM317",                                      "CustomCompositeElm:~LM317-v2",
            "Add TL431",                                      "CustomCompositeElm:~TL431",
            "Add Motor Protection Switch",                    "MotorProtectionSwitchElm",
            "Add Subcircuit Instance",                        "CustomCompositeElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Active Building Blocks"), activeBlocMenu);

        const gateMenu = new Menu(this.app);
        this.makeClassCheckItems(gateMenu, [
            "Add Logic Input",  "LogicInputElm",
            "Add Logic Output", "LogicOutputElm",
            "Add Bus Input",    "BusLogicInputElm",
            "Add Inverter",     "InverterElm",
            "Add NAND Gate",    "NandGateElm",
            "Add NOR Gate",     "NorGateElm",
            "Add AND Gate",     "AndGateElm",
            "Add OR Gate",      "OrGateElm",
            "Add XOR Gate",     "XorGateElm",
            "Add XNOR Gate",    "XnorGateElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Logic Gates, Input and Output"), gateMenu);

        const chipMenu = new Menu(this.app);
        this.makeClassCheckItems(chipMenu, [
            "Add D Flip-Flop",          "DFlipFlopElm",
            "Add JK Flip-Flop",         "JKFlipFlopElm",
            "Add T Flip-Flop",          "TFlipFlopElm",
            "Add 7 Segment LED",        "SevenSegElm",
            "Add 7 Segment Decoder",    "SevenSegDecoderElm",
            "Add Multiplexer",          "MultiplexerElm",
            "Add Demultiplexer",        "DeMultiplexerElm",
            "Add SIPO shift register",  "SipoShiftElm",
            "Add PISO shift register",  "PisoShiftElm",
            "Add Counter",              "CounterElm",
            "Add Counter w/ Load",      "Counter2Elm",
            "Add Ring Counter",         "DecadeElm",
            "Add Latch/Register",       "LatchElm",
            "Add Sequence generator",   "SeqGenElm",
            "Add Adder",                "FullAdderElm",
            "Add Half Adder",           "HalfAdderElm",
            "Add Custom Logic",         "UserDefinedLogicElm",  // don't change this, it will break people's saved shortcuts
            "Add Static RAM",           "SRAMElm",
            "Add ROM",                  "ROMElm",
            "Add Bus Transceiver",      "BusTransceiverElm",
            "Add Bus Splitter",         "BusSplitterElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Digital Chips"), chipMenu);

        const achipMenu = new Menu(this.app);
        this.makeClassCheckItems(achipMenu, [
            "Add 555 Timer",        "TimerElm",
            "Add Phase Comparator", "PhaseCompElm",
            "Add DAC",              "DACElm",
            "Add ADC",              "ADCElm",
            "Add VCO",              "VCOElm",
            "Add Monostable",       "MonostableElm",
        ]);
        menu.addSubmenu(subheadHtml + Locale.LS("Analog and Hybrid Chips"), achipMenu);

        menu.addSubmenu(subheadHtml + Locale.LS("Subcircuits"), this.subcircuitMenuBar![num]);

        const otherMenu = new Menu(this.app);
        let mi: any;
        mi = this.getClassCheckItem(Locale.LS("Drag All"),    "DragAll");    mi.setShortcut(Locale.LS("(Alt-drag)"));      otherMenu.addCheckboxItem(mi);
        mi = this.getClassCheckItem(Locale.LS("Drag Row"),    "DragRow");    mi.setShortcut(Locale.LS("(A-S-drag)"));      otherMenu.addCheckboxItem(mi);
        mi = this.getClassCheckItem(Locale.LS("Drag Column"), "DragColumn"); mi.setShortcut(this.isMac ? Locale.LS("(A-Cmd-drag)") : Locale.LS("(A-M-drag)")); otherMenu.addCheckboxItem(mi);
        mi = this.getClassCheckItem(Locale.LS("Drag Selected"), "DragSelected"); otherMenu.addCheckboxItem(mi);
        mi = this.getClassCheckItem(Locale.LS("Drag Post"),   "DragPost");   mi.setShortcut("(" + this.ctrlMetaKey + "drag)"); otherMenu.addCheckboxItem(mi);
        menu.addSubmenu(subheadHtml + Locale.LS("Drag"), otherMenu);

        mi = this.getClassCheckItem(Locale.LS("Select/Drag Sel"), "Select");
        mi.setShortcut(Locale.LS("(space or Shift-drag)"));
        menu.addCheckboxItem(mi);
    }

    makeClassCheckItems(menu: Menu, items: string[]): void {
        for (let i = 0; i < items.length; i += 2)
            menu.addCheckboxItem(this.getClassCheckItem(Locale.LS(items[i]), items[i + 1]));
    }

    getClassCheckItem(s: string, t: string): any {
        return this.app.ui.getClassCheckItem(s, t);
    }

    isElectron(): boolean { return (CirSim as any).isElectron?.() ?? false; }

    // Load the built-in circuits list from the server and build the Circuits menu.
    // Uses fetch() instead of GWT's RequestBuilder.
    getSetupList(openDefault: boolean): void {
        const url = 'setuplist.txt';
        fetch(url)
            .then(r => {
                if (!r.ok) {
                    if (!this.hideMenu) alert(Locale.LS("Can't load circuit list!"));
                    return null;
                }
                return r.text();
            })
            .then(text => { if (text) this.processSetupList(text, openDefault); })
            .catch(() => { if (!this.hideMenu) alert(Locale.LS("Can't load circuit list!")); });
    }

    processSetupList(text: string, openDefault: boolean): void {
        const lines = text.split(/\r?\n/);
        const stack: Menu[] = [];
        let currentMenu = new Menu(this.app);
        this.addTopItem(this.menuBarRow, Locale.LS("Circuits"), currentMenu);
        stack.push(currentMenu);

        for (const line of lines) {
            if (!line || line[0] === '#') continue;
            if (line[0] === '+') {
                const sub = new Menu(this.app);
                currentMenu.addSubmenu(Locale.LS(line.substring(1)), sub);
                currentMenu = sub;
                stack.push(currentMenu);
            } else if (line[0] === '-') {
                stack.pop();
                currentMenu = stack[stack.length - 1];
            } else {
                const sp = line.indexOf(' ');
                if (sp > 0) {
                    const first = line[0] === '>';
                    const file  = line.substring(first ? 1 : 0, sp);
                    const title = Locale.LS(line.substring(sp + 1));
                    currentMenu.addCommand(title, "circuits", "setup " + file + " " + title);

                    const app = this.app as any;
                    if (file === app.startCircuit && app.startLabel == null) {
                        app.startLabel = title;
                        this.app.setCircuitTitle(title);
                    }
                    if (first && app.startCircuit == null) {
                        app.startCircuit = file;
                        app.startLabel   = title;
                        if (openDefault && this.app.stopMessage == null)
                            this.readSetupFile(app.startCircuit, app.startLabel);
                    }
                }
            }
        }
    }

    readSetupFile(str: string, title: string | null): void {
        console.log(str);
        (this.app as any).resetEditingContext?.();
        // don't avoid caching here, it's unnecessary and makes offline PWA's not work
        const url = 'circuits/' + str;
        (this.app as any).loader?.loadFileFromURL(url);
        if (title != null)
            this.app.setCircuitTitle(title);
        this.app.unsavedChanges = false;
    }

    // ---- Private helpers ----

    // Add a top-level item to the horizontal menu bar (clicking toggles the dropdown).
    private addTopItem(row: HTMLTableRowElement, label: string, menu: Menu): HTMLElement {
        const td = document.createElement('td');
        td.className = 'gwt-MenuItem';
        td.setAttribute('role', 'menuitem');
        td.setAttribute('aria-haspopup', 'true');
        td.textContent = label;

        td.addEventListener('click', e => {
            e.stopPropagation();
            const wasOpen = td.classList.contains('open');
            closeAllMenus();
            if (!wasOpen) td.classList.add('open');
        });

        td.addEventListener('mouseover', e => {
            if (anyMenuOpen()) {
                closeAllMenus();
                td.classList.add('open');
            }
        });

        td.appendChild(menu.ul);
        row.appendChild(td);
        return td;
    }

    // Build the element right-click context menu.
    private buildElmMenuBar(): void {
        const ul = document.createElement('ul');
        ul.className = 'menuDropdown elmContextMenu';
        this.elmMenuBar = ul;

        const m = new Menu(this.app);
        m.ul = ul;

        m.addMenuItem(this.elmEditMenuItem,       Locale.LS("Edit..."),                  "elm", "edit");
        m.addMenuItem(this.elmScopeMenuItem,      Locale.LS("View in New Scope"),        "elm", "viewInScope");
        m.addMenuItem(this.elmFloatScopeMenuItem, Locale.LS("View in New Undocked Scope"), "elm", "viewInFloatScope");
        m.addMenuItem(this.elmAddScopeMenuItem,   Locale.LS("Add to Existing Scope"),    "elm", "addToScope0");
        m.addMenuItem(this.elmCutMenuItem,        Locale.LS("Cut"),                      "elm", "cut");
        m.addMenuItem(this.elmCopyMenuItem,       Locale.LS("Copy"),                     "elm", "copy");
        m.addMenuItem(this.elmDeleteMenuItem,     Locale.LS("Delete"),                   "elm", "delete");
        m.addCommand(                             Locale.LS("Duplicate"),                "elm", "duplicate");
        m.addMenuItem(this.elmSwapMenuItem,       Locale.LS("Swap Terminals"),           "elm", "flip");
        m.addMenuItem(this.elmRotateMenuItem,     Locale.LS("Rotate"),                   "elm", "rotate");
        m.addMenuItem(this.elmMirrorMenuItem,     Locale.LS("Mirror"),                   "elm", "mirror");
        m.addMenuItem(this.elmSplitMenuItem,      shortcutHtml("", "Split Wire Manually", Locale.LS(this.ctrlMetaKey + "click")), "elm", "split");
        m.addMenuItem(this.elmSliderMenuItem,     Locale.LS("Sliders..."),               "elm", "sliders");
    }
}
