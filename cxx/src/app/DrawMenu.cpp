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

// the Draw menu (Menus.composeMainMenu() in the TS version)

#include <QActionGroup>
#include <QKeySequence>
#include <QMenu>
#include <QMenuBar>

#include "CirSim.h"
#include "CommandPaletteRegistry.h"
#include "Toolbar.h"
#include "core/CircuitElm.h"
#include "core/ElementFactory.h"
#include "core/Locale.h"
#include "core/Storage.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

struct MenuItemDef {
    const char *label;
    const char *cls;
};

static const MenuItemDef topItems[] = {
    {"Add Wire", "WireElm"},
    {"Add Routed Wire", "RoutedWireElm"},
    {"Add Resistor", "ResistorElm"},
};

static const MenuItemDef passiveItems[] = {
    {"Add Capacitor", "CapacitorElm"},
    {"Add Capacitor (polarized)", "PolarCapacitorElm"},
    {"Add Inductor", "InductorElm"},
    {"Add Switch", "SwitchElm"},
    {"Add Push Switch", "PushSwitchElm"},
    {"Add SPDT Switch", "Switch2Elm"},
    {"Add DPDT Switch", "DPDTSwitchElm"},
    {"Add Make-Before-Break Switch", "MBBSwitchElm"},
    {"Add Potentiometer", "PotElm"},
    {"Add Transformer", "TransformerElm"},
    {"Add Tapped Transformer", "TappedTransformerElm"},
    {"Add Custom Transformer", "CustomTransformerElm"},
    {"Add Transmission Line", "TransLineElm"},
    {"Add Relay", "RelayElm"},
    {"Add Relay Coil", "RelayCoilElm"},
    {"Add Relay Contact", "RelayContactElm"},
    {"Add Photoresistor", "LDRElm"},
    {"Add Thermistor", "ThermistorNTCElm"},
    {"Add Memristor", "MemristorElm"},
    {"Add Spark Gap", "SparkGapElm"},
    {"Add Fuse", "FuseElm"},
    {"Add Crystal", "CrystalElm"},
    {"Add Cross Switch", "CrossSwitchElm"},
    {"Add Gyrator", "GyratorElm"},
};

static const MenuItemDef inputItems[] = {
    {"Add Ground", "GroundElm"},
    {"Add Voltage Source (2-terminal)", "DCVoltageElm"},
    {"Add Battery", "BatteryElm"},
    {"Add A/C Voltage Source (2-terminal)", "ACVoltageElm"},
    {"Add Voltage Source (1-terminal)", "RailElm"},
    {"Add A/C Voltage Source (1-terminal)", "ACRailElm"},
    {"Add Square Wave Source (1-terminal)", "SquareRailElm"},
    {"Add Clock", "ClockElm"},
    {"Add A/C Sweep", "SweepElm"},
    {"Add Variable Voltage", "VarRailElm"},
    {"Add Antenna", "AntennaElm"},
    {"Add AM Source", "AMElm"},
    {"Add FM Source", "FMElm"},
    {"Add Current Source", "CurrentElm"},
    {"Add Noise Generator", "NoiseElm"},
    {"Add Audio Input", "AudioInputElm"},
    {"Add Data Input", "DataInputElm"},
    {"Add External Voltage (JavaScript)", "ExtVoltageElm"},
};

static const MenuItemDef outputItems[] = {
    {"Add Analog Output", "OutputElm"},
    {"Add LED", "LEDElm"},
    {"Add Lamp", "LampElm"},
    {"Add Text", "TextElm"},
    {"Add Box", "BoxElm"},
    {"Add Line", "LineElm"},
    {"Add Labeled Node", "LabeledNodeElm"},
    {"Add Voltmeter/Scope Probe", "ProbeElm"},
    {"Add Ohmmeter", "OhmMeterElm"},
    {"Add Ammeter", "AmmeterElm"},
    {"Add Wattmeter", "WattmeterTrueElm"},
    {"Add Test Point", "TestPointElm"},
    {"Add Decimal Display", "DecimalDisplayElm"},
    {"Add Instruction Display", "InstructionDisplayElm"},
    {"Add LED Array", "LEDArrayElm"},
    {"Add Data Export", "DataRecorderElm"},
    {"Add Audio Output", "AudioOutputElm"},
    {"Add Stop Trigger", "StopTriggerElm"},
    {"Add DC Motor", "DCMotorElm"},
    {"Add 3-Phase Motor", "ThreePhaseMotorElm"},
    {"Add Wattmeter (old)", "WattmeterElm"},
};

static const MenuItemDef activeItems[] = {
    {"Add Diode", "DiodeElm"},
    {"Add Zener Diode", "ZenerElm"},
    {"Add Transistor (bipolar, NPN)", "NTransistorElm"},
    {"Add Transistor (bipolar, PNP)", "PTransistorElm"},
    {"Add MOSFET (N-Channel)", "NMosfetElm"},
    {"Add MOSFET (P-Channel)", "PMosfetElm"},
    {"Add JFET (N-Channel)", "NJfetElm"},
    {"Add JFET (P-Channel)", "PJfetElm"},
    {"Add SCR", "SCRElm"},
    {"Add DIAC", "DiacElm"},
    {"Add TRIAC", "TriacElm"},
    {"Add Darlington Pair (NPN)", "NDarlingtonElm"},
    {"Add Darlington Pair (PNP)", "PDarlingtonElm"},
    {"Add Varactor/Varicap", "VaractorElm"},
    {"Add Tunnel Diode", "TunnelDiodeElm"},
    {"Add Triode", "TriodeElm"},
    {"Add Unijunction Transistor", "UnijunctionElm"},
};

static const MenuItemDef activeBlocItems[] = {
    {"Add Op Amp (ideal, - on top)", "OpAmpElm"},
    {"Add Op Amp (ideal, + on top)", "OpAmpSwapElm"},
    {"Add Op Amp (real)", "OpAmpRealElm"},
    {"Add Analog Switch (SPST)", "AnalogSwitchElm"},
    {"Add Analog Switch (SPDT)", "AnalogSwitch2Elm"},
    {"Add Analog Multiplexer", "AnalogMuxElm"},
    {"Add Tristate Buffer", "TriStateElm"},
    {"Add Schmitt Trigger", "SchmittElm"},
    {"Add Schmitt Trigger (Inverting)", "InvertingSchmittElm"},
    {"Add Delay Buffer", "DelayBufferElm"},
    {"Add CCII+", "CC2Elm"},
    {"Add CCII-", "CC2NegElm"},
    {"Add Comparator (Hi-Z/GND output)", "ComparatorElm"},
    {"Add OTA (LM13700 style)", "OTAElm"},
    {"Add Norton Amp (LM3900)", "NortonAmpElm"},
    {"Add Controlled Voltage Source (2-terminal)", "ControlledVoltageElm"},
    {"Add Controlled Current Source (2-terminal)", "ControlledCurrentElm"},
    {"Add Voltage-Controlled Voltage Source (VCVS)", "VCVSElm"},
    {"Add Voltage-Controlled Current Source (VCCS)", "VCCSElm"},
    {"Add Current-Controlled Voltage Source (CCVS)", "CCVSElm"},
    {"Add Current-Controlled Current Source (CCCS)", "CCCSElm"},
    {"Add Optocoupler", "OptocouplerElm"},
    {"Add Time Delay Relay", "TimeDelayRelayElm"},
    {"Add LM317", "SubcircuitElm:~LM317-v2"},
    {"Add TL431", "SubcircuitElm:~TL431"},
    {"Add Motor Protection Switch", "MotorProtectionSwitchElm"},
    {"Add Subcircuit Instance", "SubcircuitElm"},
};

static const MenuItemDef gateItems[] = {
    {"Add Logic Input", "LogicInputElm"},
    {"Add Logic Output", "LogicOutputElm"},
    {"Add Bus Input", "BusLogicInputElm"},
    {"Add Inverter", "InverterElm"},
    {"Add NAND Gate", "NandGateElm"},
    {"Add NOR Gate", "NorGateElm"},
    {"Add AND Gate", "AndGateElm"},
    {"Add OR Gate", "OrGateElm"},
    {"Add XOR Gate", "XorGateElm"},
    {"Add XNOR Gate", "XnorGateElm"},
};

static const MenuItemDef chipItems[] = {
    {"Add D Flip-Flop", "DFlipFlopElm"},
    {"Add JK Flip-Flop", "JKFlipFlopElm"},
    {"Add T Flip-Flop", "TFlipFlopElm"},
    {"Add 7 Segment LED", "SevenSegElm"},
    {"Add 7 Segment Decoder", "SevenSegDecoderElm"},
    {"Add Multiplexer", "MultiplexerElm"},
    {"Add Demultiplexer", "DeMultiplexerElm"},
    {"Add SIPO shift register", "SipoShiftElm"},
    {"Add PISO shift register", "PisoShiftElm"},
    {"Add Counter", "CounterElm"},
    {"Add Counter w/ Load", "Counter2Elm"},
    {"Add Ring Counter", "DecadeElm"},
    {"Add Latch/Register", "LatchElm"},
    {"Add Sequence generator", "SeqGenElm"},
    {"Add Adder", "FullAdderElm"},
    {"Add Half Adder", "HalfAdderElm"},
    {"Add Custom Logic", "UserDefinedLogicElm"},  // don't change this, it will break people's saved shortcuts
    {"Add Static RAM", "SRAMElm"},
    {"Add ROM", "ROMElm"},
    {"Add Bus Transceiver", "BusTransceiverElm"},
    {"Add Bus Splitter", "BusSplitterElm"},
};

static const MenuItemDef analogChipItems[] = {
    {"Add 555 Timer", "TimerElm"},
    {"Add Phase Comparator", "PhaseCompElm"},
    {"Add DAC", "DACElm"},
    {"Add ADC", "ADCElm"},
    {"Add VCO", "VCOElm"},
    {"Add Monostable", "MonostableElm"},
};

// the key sequence for a TS-style shortcut character ('r', 'L', ...)
static QKeySequence shortcutKey(int c) {
    if (c >= 'A' && c <= 'Z')
        return QKeySequence(Qt::SHIFT | Qt::Key(c));
    if (c >= 'a' && c <= 'z')
        return QKeySequence(Qt::Key(c - 'a' + 'A'));
    return QKeySequence(QString(QChar(c)));
}

// a checkable item that puts the canvas in the given mode ("ResistorElm", "Select", "DragAll", ...)
QAction *CirSim::getClassCheckItem(QMenu *menu, const QString &label, const QString &cls, const QString &hint) {
    // the hint goes in the menu text only (text after a tab would become a bogus macOS key
    // equivalent); the mode label and tooltips use the plain label, like the web version
    QAction *a = menu->addAction(hint.isEmpty() ? label : label + " " + hint);
    a->setCheckable(true);
    a->setData(cls);
    modeActions->addAction(a);
    classToLabelMap[cls] = label;
    if (cls.contains("Elm")) {
        CircuitElm *elm = ElementFactory::constructElement(cls.toStdString(), 0, 0);
        if (elm == nullptr) {
            // not ported yet
            a->setEnabled(false);
        } else {
            if (elm->needsShortcut()) {
                int sc = elm->getShortcut();
                // a real menu shortcut, so macOS shows it; Qt offers the key to a focused
                // text field first, so it won't interfere with typing in dialogs
                a->setShortcut(shortcutKey(sc));
            }
            elm->deleteElm();
            delete elm;
        }
    }
    connect(a, &QAction::triggered, this, [this, cls] { setMouseMode(cls); });
    return a;
}

void CirSim::createDrawMenu() {
    modeActions = new QActionGroup(this);
    modeActions->setExclusive(true);
    QMenu *menu = menuBar()->addMenu(menuTitle("Draw", tr("&Draw")));
    drawMenu = menu;

    auto addItems = [&](QMenu *m, const MenuItemDef *items, size_t n) {
        for (size_t i = 0; i < n; i++)
            mainMenuItems.push_back(getClassCheckItem(m, LS(items[i].label), items[i].cls));
    };
    auto addSub = [&](const char *title, const MenuItemDef *items, size_t n) {
        addItems(menu->addMenu(LS(title)), items, n);
    };
#define N(a) (sizeof(a) / sizeof(a[0]))
    addItems(menu, topItems, N(topItems));
    addSub("Passive Components", passiveItems, N(passiveItems));
    addSub("Inputs and Sources", inputItems, N(inputItems));
    addSub("Outputs and Labels", outputItems, N(outputItems));
    addSub("Active Components", activeItems, N(activeItems));
    addSub("Active Building Blocks", activeBlocItems, N(activeBlocItems));
    addSub("Logic Gates, Input and Output", gateItems, N(gateItems));
    addSub("Digital Chips", chipItems, N(chipItems));
    addSub("Analog and Hybrid Chips", analogChipItems, N(analogChipItems));
#undef N
    subcircuitMenu = menu->addMenu(LS("Subcircuits"));
    composeSubcircuitMenu();
    connect(subcircuitMenu, &QMenu::aboutToShow, this, [this] { composeSubcircuitMenu(); });

    QMenu *dragMenu = menu->addMenu(LS("Drag"));
    getClassCheckItem(dragMenu, LS("Drag All"), "DragAll", LS("(Alt-drag)"));
    getClassCheckItem(dragMenu, LS("Drag Row"), "DragRow", LS("(A-S-drag)"));
    getClassCheckItem(dragMenu, LS("Drag Column"), "DragColumn", LS("(A-Cmd-drag)"));
    getClassCheckItem(dragMenu, LS("Drag Selected"), "DragSelected");
    getClassCheckItem(dragMenu, LS("Drag Post"), "DragPost", LS("(Cmd-drag)"));

    QAction *sel = getClassCheckItem(menu, LS("Select/Drag Sel"), "Select", LS("(space or Shift-drag)"));
    sel->setChecked(true);
}

void CirSim::setRunStopShortcut(const QKeySequence &k) {
    runStopShortcut = k;
    QList<QKeySequence> keys{QKeySequence(Qt::CTRL | Qt::Key_Period)};
    if (!k.isEmpty())
        keys.push_back(k);
    runStopAction->setShortcuts(keys);
}

QAction *CirSim::findToolShortcut(const QKeySequence &k) {
    for (QAction *a : mainMenuItems)
        if (a->shortcut() == k)
            return a->isEnabled() ? a : nullptr;
    if (runStopShortcut == k)
        return runStopAction;
    if (paletteShortcut == k)
        return searchItem;
    return nullptr;
}

// saved as "1;key=class;..." like the TS version, but the keys are Qt key combinations
// (QKeyCombination::toCombined()) rather than browser char codes
static const char *RUNSTOP_SHORTCUT_ACTION = "cmd:key:runstop";
static const char *COMMAND_PALETTE_SHORTCUT_ACTION = "cmd:key:commandpalette";

void CirSim::setPaletteShortcut(const QKeySequence &k) {
    paletteShortcut = k;
    searchItem->setShortcut(k);
}

void CirSim::saveShortcuts() {
    if (Storage::localStorage == nullptr)
        return;
    std::string str = "1";
    for (QAction *a : mainMenuItems)
        if (!a->shortcut().isEmpty())
            str += ";" + std::to_string(a->shortcut()[0].toCombined()) + "=" + a->data().toString().toStdString();
    if (!runStopShortcut.isEmpty())
        str += ";" + std::to_string(runStopShortcut[0].toCombined()) + "=" + RUNSTOP_SHORTCUT_ACTION;
    if (!paletteShortcut.isEmpty())
        str += ";" + std::to_string(paletteShortcut[0].toCombined()) + "=" + COMMAND_PALETTE_SHORTCUT_ACTION;
    Storage::localStorage->setItem("shortcuts", str);
    // the palette searches for the shortcut keys too
    CommandPaletteRegistry::buildStatic(this);
}

void CirSim::loadShortcuts() {
    if (Storage::localStorage == nullptr)
        return;
    std::optional<std::string> str = Storage::localStorage->getItem("shortcuts");
    if (!str)
        return;
    QStringList keys = QString::fromStdString(*str).split(';');
    for (QAction *a : mainMenuItems)
        a->setShortcut(QKeySequence());
    bool paletteSet = false;
    for (int i = 1; i < keys.size(); i++) {
        QStringList arr = keys[i].split('=');
        if (arr.size() != 2)
            continue;
        bool ok;
        int c = arr[0].toInt(&ok);
        if (!ok)
            continue;
        QKeySequence k(QKeyCombination::fromCombined(c));
        if (arr[1] == RUNSTOP_SHORTCUT_ACTION) {
            setRunStopShortcut(k);
            continue;
        }
        if (arr[1] == COMMAND_PALETTE_SHORTCUT_ACTION) {
            setPaletteShortcut(k);
            paletteSet = true;
            continue;
        }
        QString className = arr[1];
        // CustomCompositeElm was renamed SubcircuitElm; keep shortcuts saved by the old version
        if (className == "CustomCompositeElm" || className.startsWith("CustomCompositeElm:"))
            className = "SubcircuitElm" + className.mid(QString("CustomCompositeElm").size());
        for (QAction *a : mainMenuItems)
            if (a->data().toString() == className) {
                a->setShortcut(k);
                break;
            }
    }
    // the palette keeps "/" unless it was given something else, or "/" is taken
    if (!paletteSet) {
        QKeySequence slash("/");
        bool used = runStopShortcut == slash;
        for (QAction *a : mainMenuItems)
            used |= a->shortcut() == slash;
        setPaletteShortcut(used ? QKeySequence() : slash);
    }
}

void CirSim::setMouseMode(const QString &s) {
    mouseModeStr = s;
    if (s == "DragAll")
        mouseMode = MODE_DRAG_ALL;
    else if (s == "DragRow")
        mouseMode = MODE_DRAG_ROW;
    else if (s == "DragColumn")
        mouseMode = MODE_DRAG_COLUMN;
    else if (s == "DragSelected")
        mouseMode = MODE_DRAG_SELECTED;
    else if (s == "DragPost")
        mouseMode = MODE_DRAG_POST;
    else if (s == "Select")
        mouseMode = MODE_SELECT;
    else
        mouseMode = MODE_ADD_ELM;
    mouse.tempMouseMode = mouseMode;
    updateToolbar();
    repaint();
}

void CirSim::setSplitterCursor(bool over) {
    if (!canvas)
        return;
    if (over)
        canvas->setCursor(Qt::SplitVCursor);
    else
        canvas->setCursor(mouseMode == MODE_ADD_ELM ? Qt::CrossCursor : Qt::ArrowCursor);
}

// check the menu item and toolbar button for the current mode, and update the mode label
void CirSim::updateToolbar() {
    for (QAction *a : modeActions->actions())
        if (a->data().toString() == mouseModeStr) {
            a->setChecked(true);
            break;
        }
    setSplitterCursor(mouse.mouseWasOverSplitter);
    if (toolbar) {
        if (dragElm != nullptr)
            toolbar->setModeLabel(QString::fromStdString(Locale::LS("Drag Mouse")));
        else
            toolbar->setModeLabel(QString::fromStdString(Locale::LS("Mode: ")) + classToLabelMap.value(mouseModeStr));
        toolbar->highlightButton(mouseModeStr);
    }
}
