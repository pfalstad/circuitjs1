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

#include "CirSim.h"

#include <QAction>
#include <QDateTime>
#include <QApplication>
#include <QCursor>
#include <QScreen>
#include <QStyle>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QHBoxLayout>
#include <QVBoxLayout>
#include <QKeyEvent>
#include <QLocale>
#include <QMenuBar>
#include <QCloseEvent>
#include <QMessageBox>
#include <QPushButton>
#include <QStandardPaths>
#include <QRegularExpression>
#include <QDir>
#include <QPainter>
#include <QTextStream>
#include <QUrl>
#include <chrono>
#include <regex>
#include <functional>
#include <cmath>

#include "PerfMonitor.h"
#include "QtGraphics.h"
#include "Sidebar.h"
#include "ShortcutsDialog.h"
#include "Toolbar.h"
#include "ConsoleDialog.h"
#include "EditDialog.h"
#include "EditOptions.h"
#include "EditSubcircuitModelDialog.h"
#include "QtStorage.h"
#include "SubcircuitBar.h"
#include "SubcircuitDialog.h"
#include "core/CircuitElm.h"
#include "core/ElementFactory.h"
#include "core/JsMath.h"
#include "core/JsNumber.h"
#include "core/Locale.h"
#include "core/Scope.h"
#include "core/CircuitXMLSerializer.h"
#include "core/CustomLogicModel.h"
#include "core/MosfetModel.h"
#include "core/RelayModel.h"
#include "core/SubcircuitModel.h"
#include "AudioPlayer.h"
#include "CommandPalette.h"
#include "CommandPaletteRegistry.h"
#include "core/PanelButton.h"
#include "elements/CapacitorElm.h"
#include "elements/InductorElm.h"
#include "elements/ResistorElm.h"
#include "elements/RoutedWireElm.h"
#include "elements/ScopeElm.h"
#include "elements/SubcircuitElm.h"
#include "elements/SwitchElm.h"
#include "core/DiodeModel.h"
#include "core/TransistorModel.h"
#include "core/WireConverter.h"

CircuitCanvas::CircuitCanvas(CirSim *a) : QWidget(a), app(a) {
    setAttribute(Qt::WA_OpaquePaintEvent);
    setMouseTracking(true);
    setFocusPolicy(Qt::StrongFocus);
}

void CircuitCanvas::keyPressEvent(QKeyEvent *e) { app->handleKey(e); }
void CircuitCanvas::keyReleaseEvent(QKeyEvent *e) { app->handleKeyRelease(e); }

bool CircuitCanvas::event(QEvent *e) {
    // a switch's keyboard shortcut wins over a menu shortcut for the same key (element
    // shortcuts are single letters), as in the web version
    if (e->type() == QEvent::ShortcutOverride && app->isSwitchKey(static_cast<QKeyEvent *>(e))) {
        e->accept();
        return true;
    }
    return QWidget::event(e);
}

void CircuitCanvas::contextMenuEvent(QContextMenuEvent *e) {
    // make sure the menu is for what's under the pointer right now
    QMouseEvent move(QEvent::MouseMove, e->pos(), e->globalPos(), Qt::NoButton, Qt::NoButton, e->modifiers());
    app->mouse.onMouseMove(&move);
    app->doPopupMenu(e->globalPos());
}

void CircuitCanvas::paintEvent(QPaintEvent *) {
    QPainter painter(this);
    app->updateCircuit(painter);
}

void CircuitCanvas::mousePressEvent(QMouseEvent *e) {
    setFocus();
    app->mouse.onMouseDown(e);
}
void CircuitCanvas::mouseMoveEvent(QMouseEvent *e) { app->mouse.onMouseMove(e); }
void CircuitCanvas::mouseReleaseEvent(QMouseEvent *e) { app->mouse.onMouseUp(e); }
void CircuitCanvas::mouseDoubleClickEvent(QMouseEvent *e) { app->mouse.onDoubleClick(e); }
void CircuitCanvas::wheelEvent(QWheelEvent *e) { app->mouse.onMouseWheel(e); }
void CircuitCanvas::leaveEvent(QEvent *) { app->mouse.onMouseOut(); }

void CircuitCanvas::resizeEvent(QResizeEvent *e) {
    QWidget::resizeEvent(e);
    // recenter if the window was resized in the last second, as in the web version
    // (but not when the canvas resizes because a panel was toggled)
    if (QDateTime::currentMSecsSinceEpoch() - app->lastResizeTime < 1000)
        app->centerCircuit();
}

void CirSim::resizeEvent(QResizeEvent *e) {
    lastResizeTime = QDateTime::currentMSecsSinceEpoch();
    QMainWindow::resizeEvent(e);
    // the layout may already have resized the canvas before we got here
    centerCircuit();
}

CirSim::CirSim() {
    sim = std::make_unique<SimulationManager>(this);
    scopeManagerOwner = std::make_unique<ScopeManager>(this);
    scopeManager = scopeManagerOwner.get();
    loader = std::make_unique<CircuitLoader>(this, sim.get());
    undoManager = std::make_unique<UndoManager>(this);
    // saved settings and subcircuit models, kept across sessions
    storage = std::make_unique<QtStorage>();
    Storage::localStorage = storage.get();
    loadLocale();
    readRecovery();
    CircuitElm::initClass(this, sim.get());
    registerElements();
    loadOptions();
    setColors();
    setWheelSensitivity();

    // toolbar above the canvas, left of the sidebar (like the web version)
    QWidget *central = new QWidget(this);
    QHBoxLayout *layout = new QHBoxLayout(central);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);
    QVBoxLayout *left = new QVBoxLayout();
    left->setContentsMargins(0, 0, 0, 0);
    left->setSpacing(0);
    canvas = new CircuitCanvas(this);
    sidebar = new Sidebar(this);
    createMenus();  // before the toolbar: the Draw menu supplies its tooltips
    toolbar = new Toolbar(this);
    subcircuitBar = new SubcircuitBar(this);
    left->addWidget(toolbar);
    left->addWidget(subcircuitBar);
    left->addWidget(canvas, 1);
    layout->addLayout(left, 1);
    layout->addWidget(sidebar);
    setCentralWidget(central);
    updateToolbar();
    undoManager->enableUndoRedo();
    // center on the screen under the mouse, shrinking to fit small screens
    QScreen *screen = QGuiApplication::screenAt(QCursor::pos());
    if (!screen)
        screen = QGuiApplication::primaryScreen();
    QRect avail = screen->availableGeometry();
    QSize size(std::min(1400, avail.width()), std::min(860, avail.height()));
    setGeometry(QStyle::alignedRect(Qt::LeftToRight, Qt::AlignCenter, size, avail));

    try {
        SubcircuitModel::loadModelsFromStorage();
    } catch (std::exception &e) {
        SimulationManager::console(std::string("Exception: ") + e.what());
    }

    // the TS version redraws on a 16ms timer while the simulation runs
    connect(&timer, &QTimer::timeout, canvas, [this] { canvas->update(); });
    timer.start(16);
}

CirSim::~CirSim() {
    timer.stop();
    cutItem = nullptr;  // stop enableDisableMenuItems() looking at deleted elements
    resetSubcircuitView();
    deleteAllElms();
    Storage::localStorage = nullptr;
}

void CirSim::createMenus() {
    createFileMenu();

    QMenu *edit = menuBar()->addMenu(menuTitle("Edit", tr("&Edit")));
    auto LSq = [](const char *str) { return QString::fromStdString(Locale::LS(str)); };
    // an Edit menu item; editing commands are disabled while viewing a subcircuit
    auto addEditItem = [&](const char *name, QKeySequence key, std::function<void()> fn, bool editing = true) {
        QAction *a = edit->addAction(LSq(name));
        if (!key.isEmpty())
            a->setShortcut(key);
        connect(a, &QAction::triggered, this, [this, fn, editing] {
            if (editing && isReadOnly()) {
                alertReadOnly();
                return;
            }
            fn();
        });
        return a;
    };
    undoItem = addEditItem("Undo", QKeySequence::Undo, [this] { undoManager->doUndo(); });
    redoItem = addEditItem("Redo", QKeySequence(Qt::CTRL | Qt::Key_Y), [this] { undoManager->doRedo(); });
    redoItem->setShortcuts({QKeySequence(Qt::CTRL | Qt::Key_Y), QKeySequence::Redo});
    edit->addSeparator();
    cutItem = addEditItem("Cut", QKeySequence::Cut, [this] { doCut(keyMenuElm()); });
    copyItem = addEditItem("Copy", QKeySequence::Copy, [this] { doCopy(keyMenuElm()); });
    pasteItem = addEditItem("Paste", QKeySequence::Paste, [this] { doPaste(); });
    addEditItem("Duplicate", QKeySequence(Qt::CTRL | Qt::Key_D), [this] { doDuplicate(keyMenuElm()); });
    edit->addSeparator();
    addEditItem("Select All", QKeySequence::SelectAll, [this] { doSelectAll(); }, false);
    edit->addSeparator();
    searchItem = addEditItem("Find Component/Command...", QKeySequence(), [this] { openCommandPalette(); }, false);
    setPaletteShortcut(QKeySequence("/"));
    addEditItem(QLocale::system().territory() == QLocale::UnitedStates ? "Center Circuit" : "Centre Circuit", QKeySequence(), [this] {
        pushUndo();
        centerCircuit();
    });
    addEditItem("Zoom 100%", QKeySequence(Qt::Key_0), [this] { mouse.setCircuitScale(1, true); repaint(); }, false);
    QAction *zoomIn = addEditItem("Zoom In", QKeySequence(Qt::Key_Plus), [this] { mouse.zoomCircuit(20, true); repaint(); }, false);
    zoomIn->setShortcuts({QKeySequence(Qt::Key_Plus), QKeySequence(Qt::Key_Equal)});
    addEditItem("Zoom Out", QKeySequence(Qt::Key_Minus), [this] { mouse.zoomCircuit(-20, true); repaint(); }, false);
    mirrorXItem = addEditItem("Mirror X", QKeySequence(), [this] { mirrorX(keyMenuElm()); });
    mirrorYItem = addEditItem("Mirror Y", QKeySequence(), [this] { mirrorY(keyMenuElm()); });
    rotateCCWItem = addEditItem("Rotate CCW", QKeySequence(), [this] { rotateCCW(keyMenuElm()); });
    rotateCWItem = addEditItem("Rotate CW", QKeySequence(), [this] { rotateCW(keyMenuElm()); });
    connect(edit, &QMenu::aboutToShow, this, [this] {
        enablePaste();
        enableDisableMenuItems();
    });
    enablePaste();

    createDrawMenu();

    QMenu *scopesMenu = menuBar()->addMenu(menuTitle("Scopes", tr("S&copes")));
    auto addScopesItem = [&](const char *name, void (ScopeManager::*fn)()) {
        QAction *a = scopesMenu->addAction(QString::fromStdString(Locale::LS(name)));
        connect(a, &QAction::triggered, this, [this, fn] {
            if (isReadOnly()) {
                alertReadOnly();
                return;
            }
            pushUndo();
            (scopeManager->*fn)();
            scopeManager->deleteUnusedScopeElms();
            needAnalyze();
        });
        return a;
    };
    QAction *stackAllItem = addScopesItem("Stack All", &ScopeManager::stackAll);
    QAction *unstackAllItem = addScopesItem("Unstack All", &ScopeManager::unstackAll);
    QAction *combineAllItem = addScopesItem("Combine All", &ScopeManager::combineAll);
    QAction *separateAllItem = addScopesItem("Separate All", &ScopeManager::separateAll);
    connect(scopesMenu, &QMenu::aboutToShow, this, [this, stackAllItem, unstackAllItem, combineAllItem, separateAllItem] {
        ScopeManager *sm = scopeManager;
        int n = sm->scopeCount;
        stackAllItem->setEnabled(n > 1 && sm->scopes[n - 1]->position > 0);
        unstackAllItem->setEnabled(n > 1 && sm->scopes[n - 1]->position != n - 1);
        combineAllItem->setEnabled(n > 1);
        separateAllItem->setEnabled(n > 0);
    });

    QMenu *simMenu = menuBar()->addMenu(menuTitle("Simulation", tr("&Simulation")));
    runStopAction = simMenu->addAction(menuTitle("Run", tr("&Run")));
    runStopAction->setCheckable(true);
    runStopAction->setChecked(true);
    runStopAction->setShortcut(QKeySequence(Qt::CTRL | Qt::Key_Period));
    connect(runStopAction, &QAction::toggled, this, [this](bool on) { setSimRunning(on); });
    QAction *reset = simMenu->addAction(menuTitle("Reset", tr("Re&set")));
    reset->setShortcut(QKeySequence(Qt::CTRL | Qt::Key_R));
    connect(reset, &QAction::triggered, this, [this] { resetAction(); });

    QMenu *opts = menuBar()->addMenu(menuTitle("Options", tr("&Options")));
    // a checkbox item for flag.  The loader changes some flags, so the check marks are
    // refreshed each time the menu opens.  storageKey saves the setting across sessions.
    std::vector<std::pair<QAction *, bool *>> optToggles;
    auto addToggle = [&](const char *name, bool &flag, const char *storageKey = nullptr,
                         std::function<void()> fn = nullptr) {
        QAction *a = opts->addAction(LSq(name));
        a->setCheckable(true);
        a->setChecked(flag);
        std::string key = storageKey ? storageKey : "";
        connect(a, &QAction::triggered, this, [this, &flag, key, fn](bool on) {
            flag = on;
            if (!key.empty())
                setOptionInStorage(key, on);
            if (fn)
                fn();
            canvas->update();
        });
        optToggles.push_back({a, &flag});
        return a;
    };
    addToggle("Show Current", options.dots);
    addToggle("Show Voltage", options.volts, nullptr, [this] {
        if (options.volts)
            options.power = false;
        setPowerBarEnable();
    });
    addToggle("Show Power", options.power, nullptr, [this] {
        if (options.power)
            options.volts = false;
        setPowerBarEnable();
    });
    addToggle("Show Values", options.showValues);
    addToggle("Small Grid", options.smallGrid, nullptr, [this] { setGrid(); });
    addToggle("Toolbar", toolbarVisible, nullptr, [this] { toolbar->setVisible(toolbarVisible); });
    addToggle("Show Cursor Cross Hairs", options.crossHair, "crossHair");
    addToggle("European Resistors", options.euroResistor, "euroResistors",
              [this] { toolbar->setEuroResistors(options.euroResistor); });
    addToggle("Show Ω Unit", options.showOhm, "showOhm");
    addToggle("IEC Gates", options.euroGates, "euroGates", [this] {
        for (CircuitElm *ce : elmList)
            ce->setPoints();
    });
    addToggle("White Background", options.printable, "whiteBackground", [this] {
        for (int i = 0; i < scopeManager->scopeCount; i++)
            scopeManager->scopes[i]->setRect(scopeManager->scopes[i]->rect);
    });
    addToggle("Conventional Current Motion", options.conventionalCurrent, "conventionalCurrent", [this] {
        // change the current color if it hasn't changed from the default
        std::string cc = CircuitElm::currentColor.getHexValue();
        if (cc == "#ffff00" || cc == "#00ffff")
            CircuitElm::currentColor = options.conventionalCurrent ? Color::yellow : Color::cyan;
    });
    addToggle("Disable Editing", options.noEdit);
    addToggle("Edit Values With Mouse Wheel", options.mouseWheelEdit, "mouseWheelEdit");
    connect(opts, &QMenu::aboutToShow, this, [optToggles] {
        for (auto &[a, flag] : optToggles)
            a->setChecked(*flag);
    });
    QAction *shortcutsItem = opts->addAction(LSq("Shortcuts..."));
    connect(shortcutsItem, &QAction::triggered, this, [this] { (new ShortcutsDialog(this))->show(); });
    QAction *otherOpts = opts->addAction(QString::fromStdString(Locale::LS("Other Options...")));
    connect(otherOpts, &QAction::triggered, this, [this] {
        if (!editOptions)
            editOptions = std::make_unique<EditOptions>(this, sim.get());
        doEdit(editOptions.get());
    });

    QMenu *tools = menuBar()->addMenu(menuTitle("Tools", tr("&Tools")));
    QAction *convertWires = tools->addAction(LSq("Convert Wires to Routed Wires"));
    connect(convertWires, &QAction::triggered, this, [this] {
        if (isReadOnly()) {
            alertReadOnly();
            return;
        }
        pushUndo();
        // the converted wires are deleted, so don't leave dangling pointers to them
        mouse.setMouseElm(nullptr);
        WireConverter::convertWires(*this);
        needAnalyze();
        writeRecoveryToStorage();
    });
    QAction *subMgr = tools->addAction(QString::fromStdString(Locale::LS("Subcircuit Manager")));
    connect(subMgr, &QAction::triggered, this, [this] { (new SubcircuitDialog(this))->show(); });
    QAction *consoleItem = tools->addAction(QString::fromStdString(Locale::LS("Console")));
    connect(consoleItem, &QAction::triggered, this, [] {
        if (ConsoleDialog::instance())
            ConsoleDialog::instance()->showConsole();
    });

    createCircuitsMenu();
    loadShortcuts();
    CommandPaletteRegistry::buildStatic(this);
}

void CirSim::openCommandPalette() {
    (new CommandPalette(this))->show();
}

QString CirSim::resourceDir() {
    QString appDir = QCoreApplication::applicationDirPath();
    QStringList candidates = {
        appDir + "/../Resources",  // macOS bundle
        appDir + "/resources",     // Windows/Linux, next to the executable
        appDir + "/../../../../ts/public",  // running from cxx/build without installing
        QDir::currentPath() + "/../ts/public",
    };
    for (const QString &c : candidates)
        if (QFileInfo::exists(c + "/setuplist.txt"))
            return QDir(c).absolutePath();
    return QString();
}

QString CirSim::menuTitle(const char *s, const QString &withMnemonic) {
    std::string t = Locale::LS(s);
    return t == s ? withMnemonic : QString::fromStdString(t);
}

// Ported from circuitjs1.java: circuitjs1.loadLocale()
void CirSim::loadLocale() {
    QString lang = langOverride;
    if (lang.isEmpty()) {
        if (auto stored = Storage::localStorage->getItem("language"))
            lang = QString::fromStdString(*stored);
        else {
            QStringList languages = QLocale::system().uiLanguages();
            lang = languages.isEmpty() ? "en-US" : languages[0];
        }
    }

    SimulationManager::console("got language " + lang.toStdString());

    // check for Taiwan Chinese. Otherwise, strip the region code
    if (lang.toLower() == "zh-tw" || lang.toLower() == "zh-cht" || lang.toLower() == "zh-hant-tw")
        lang = "zh-tw";
    else
        lang = lang.section('-', 0, 0).section('_', 0, 0);

    Locale::localizationMap.clear();
    if (lang.startsWith("en")) {
        // no need to load locale file for English
        return;
    }

    QFile f(resourceDir() + "/locale/locale_" + lang + ".txt");
    if (!f.open(QIODevice::ReadOnly)) {
        // default to English (empty map)
        SimulationManager::console("Can't read " + f.fileName().toStdString());
        return;
    }
    std::string data = f.readAll().toStdString();
    // fetch().text() drops a byte order mark
    if (data.rfind("\xEF\xBB\xBF", 0) == 0)
        data.erase(0, 3);
    Locale::localizationMap = Locale::processLocale(data);
}

void CirSim::createCircuitsMenu() {
    QFile f(resourceDir() + "/setuplist.txt");
    if (!f.open(QIODevice::ReadOnly)) {
        SimulationManager::console("Can't load circuit list!");
        return;
    }
    QString text = QString::fromUtf8(f.readAll());
    QMenu *currentMenu = menuBar()->addMenu(menuTitle("Circuits", tr("&Circuits")));
    std::vector<QMenu *> stack{currentMenu};
    QStringList submenuStack{""};  // submenu titles for palette circuit hints

    for (const QString &line : text.split(QRegularExpression("\\r?\\n"))) {
        if (line.isEmpty() || line[0] == '#')
            continue;
        if (line[0] == '+') {
            QString title = QString::fromStdString(Locale::LS(line.mid(1).toStdString()));
            QMenu *sub = currentMenu->addMenu(title);
            currentMenu = sub;
            stack.push_back(currentMenu);
            submenuStack.push_back(title);
        } else if (line[0] == '-') {
            if (stack.size() > 1) {
                stack.pop_back();
                submenuStack.pop_back();
            }
            currentMenu = stack.back();
        } else {
            int sp = line.indexOf(' ');
            if (sp > 0) {
                bool first = line[0] == '>';
                QString file = line.mid(first ? 1 : 0, sp - (first ? 1 : 0));
                QString title = QString::fromStdString(Locale::LS(line.mid(sp + 1).toStdString()));
                QAction *a = currentMenu->addAction(title);
                connect(a, &QAction::triggered, this, [this, file, title] { readSetupFile(file, title); });
                // also searchable from the command palette (query length >= 2)
                CommandPaletteRegistry::registerCircuit(file, title, submenuStack.back(), a);
                if (first && startCircuit.isEmpty()) {
                    startCircuit = file;
                    startLabel = title;
                }
            }
        }
    }
}

void CirSim::readSetupFile(const QString &file, const QString &title) {
    QString path = resourceDir() + "/circuits/" + file;
    if (!maybeSave())
        return;
    pushUndo();
    if (!loadFile(path))
        return;
    filePath.clear();  // don't save over the examples
    setCircuitTitle(title);
    setWindowTitle(title + " - CircuitJS1");
}

void CirSim::loadDefaultCircuit() {
    if (!startCircuit.isEmpty())
        readSetupFile(startCircuit, startLabel);
}

bool CirSim::loadFile(const QString &path) {
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) {
        QMessageBox::warning(this, tr("Can't load circuit"), tr("Can't open %1").arg(path));
        return false;
    }
    QByteArray data = f.readAll();
    std::vector<std::string> missing = CircuitLoader::findUnsupported(data.toStdString());
    if (!missing.empty()) {
        std::string m;
        for (const std::string &t : missing)
            m += (m.empty() ? "" : ", ") + t;
        SimulationManager::console("unknown element types: " + m);
    }
    std::string text = data.toStdString();
    if (CircuitLoader::isSubcircuitLibrary(text)) {
        // library files just add global subcircuits; keep the current circuit and its title
        loader->readCircuit(text);
        return true;
    }
    resetEditingContext();
    readCircuit(text);
    filePath = path;
    unsavedChanges = false;
    savedDumpPending = true;
    setWindowTitle(QFileInfo(path).fileName() + " - CircuitJS1");
    setCircuitTitle(QFileInfo(path).completeBaseName());
    return true;
}

void CirSim::readCircuit(const std::string &text, int flags) {
    closeEditDialog();
    mouse.clearMouseElm();
    loader->readCircuit(text, flags);
    circuitLoaded(flags);
}

void CirSim::readCircuitFromDoc(const XmlElement *doc) {
    closeEditDialog();
    mouse.clearMouseElm();
    loader->readCircuitFromDoc(doc);
    circuitLoaded(0);
}

void CirSim::circuitLoaded(int flags) {
    for (CircuitElm *ce : elmList)
        ce->setPoints();
    stopMessage.reset();
    stopElm = nullptr;
    simRunning = true;
    if (runStopAction)
        runStopAction->setChecked(true);
    needAnalyze();
    if ((flags & CircuitLoader::RC_NO_CENTER) == 0)
        needCenter = true;
    sidebar->sync();
}

void CirSim::setCircuitTitle(const QString &title) {
    sidebar->setCircuitTitle(title);
}

void CirSim::setPowerBarEnable() {
    sidebar->setPowerBarEnable(options.power);
}

void CirSim::openFile() {
    if (!maybeSave())
        return;
    QString path = QFileDialog::getOpenFileName(this, tr("Open Circuit"), QString(),
                                                tr("Circuits (*.txt *.circuitjs);;All Files (*)"));
    if (path.isEmpty())
        return;
    pushUndo();
    loadFile(path);
}

void CirSim::newBlankCircuit() {
    if (!maybeSave())
        return;
    pushUndo();
    resetEditingContext();
    readCircuit("");
    filePath.clear();
    unsavedChanges = false;
    savedDumpPending = true;
    setCircuitTitle(QString());
    setWindowTitle("CircuitJS1");
}

std::string CirSim::dumpCircuit(bool saveState) {
    CustomLogicModel::clearDumpedFlags();
    SubcircuitModel::clearDumpedFlags();
    RelayModel::clearDumpedFlags();
    MosfetModel::clearDumpedFlags();
    DiodeModel::clearDumpedFlags();
    TransistorModel::clearDumpedFlags();
    CircuitXMLSerializer xml(this, sim.get());
    xml.saveState = saveState;
    return xml.dumpCircuit();
}

void CirSim::enableUndoRedo(bool undo, bool redo) {
    undoItem->setEnabled(undo);
    redoItem->setEnabled(redo);
    if (toolbar)
        toolbar->enableUndoRedo(undo, redo);
}

std::string CirSim::withoutSliders(const std::string &dump) {
    size_t end = dump.find('>');
    if (end == std::string::npos)
        return dump;
    static const std::regex sliderAttrs(" (ic|cb|pb)=\"[^\"]*\"");
    return std::regex_replace(dump.substr(0, end), sliderAttrs, "") + dump.substr(end);
}

bool CirSim::isModified() {
    // a click pushes an undo item (and so sets unsavedChanges) even if nothing moves,
    // so check whether the circuit itself is different
    return unsavedChanges && withoutSliders(dumpCircuit(false)) != withoutSliders(savedDump);
}

bool CirSim::writeFile(const QString &path) {
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        QMessageBox::warning(this, tr("Can't save circuit"), tr("Can't write %1").arg(path));
        return false;
    }
    f.write(QByteArray::fromStdString(dumpCircuit()));
    if (!f.flush()) {
        QMessageBox::warning(this, tr("Can't save circuit"), tr("Error writing %1").arg(path));
        return false;
    }
    filePath = path;
    unsavedChanges = false;
    savedDump = dumpCircuit(false);
    savedDumpPending = false;
    setWindowTitle(QFileInfo(path).fileName() + " - CircuitJS1");
    setCircuitTitle(QFileInfo(path).completeBaseName());
    return true;
}

bool CirSim::save() {
    if (isEditingContext()) {
        alert(Locale::LS("You are editing a subcircuit model.  Save it or go back to the circuit first."));
        return false;
    }
    if (filePath.isEmpty())
        return saveAs();
    return writeFile(filePath);
}

bool CirSim::saveAs() {
    if (isEditingContext()) {
        alert(Locale::LS("You are editing a subcircuit model.  Save it or go back to the circuit first."));
        return false;
    }
    QString name = filePath;
    if (name.isEmpty()) {
        QString title = sidebar->circuitTitle();
        name = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation) + "/" +
               (title.isEmpty() ? QString("circuit") : title) + ".txt";
    }
    QString path = QFileDialog::getSaveFileName(this, tr("Save Circuit"), name,
                                                tr("Circuits (*.txt *.circuitjs);;All Files (*)"));
    if (path.isEmpty())
        return false;
    return writeFile(path);
}

bool CirSim::maybeSave() {
    // (Save would write the model's circuit over the file, so don't offer it)
    if (isEditingContext())
        return confirm(Locale::LS("You are editing subcircuit model ") + getEditingModelName().value_or("") +
                       Locale::LS(".  Discard your changes to it and to the circuit?"));
    if (!isModified())
        return true;
    QMessageBox box(this);
    box.setIcon(QMessageBox::Warning);
    box.setText(tr("Do you want to save the changes to this circuit?"));
    box.setInformativeText(tr("Your changes will be lost if you don't save them."));
    box.setStandardButtons(QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel);
    box.setDefaultButton(QMessageBox::Save);
    int r = box.exec();
    if (r == QMessageBox::Save)
        return save();
    return r == QMessageBox::Discard;
}

void CirSim::closeEvent(QCloseEvent *e) {
    if (maybeSave())
        e->accept();
    else
        e->ignore();
}

void CirSim::needAnalyze() {
    analyzeFlag = true;
    canvas->update();
    enableDisableMenuItems();
}

void CirSim::repaint() {
    canvas->update();
}

void CirSim::setSimRunning(bool s) {
    if (s) {
        if (stopMessage)
            return;
        simRunning = true;
        timer.start(16);
    } else {
        simRunning = false;
        timer.stop();
        canvas->update();
    }
    if (runStopAction && runStopAction->isChecked() != simRunning)
        runStopAction->setChecked(simRunning);
    if (sidebar)
        sidebar->setSimRunning(simRunning);
}

void CirSim::resetAction() {
    analyzeFlag = true;
    if (autoDCOnReset)
        dcAnalysisFlag = true;
    if (sim->t == 0)
        setSimRunning(true);
    sim->resetTime();
    for (CircuitElm *ce : elmList)
        ce->reset();
    sim->resetNodes();
    scopeManager->resetGraphs();
    canvas->update();
}

void CirSim::setColors() {
    std::optional<std::string> positiveColor, negativeColor, neutralColor, selectColor, currentColor;
    if (Storage *stor = Storage::localStorage) {
        positiveColor = stor->getItem("positiveColor");
        negativeColor = stor->getItem("negativeColor");
        neutralColor = stor->getItem("neutralColor");
        selectColor = stor->getItem("selectColor");
        currentColor = stor->getItem("currentColor");
    }
    auto decode = [](const std::string &s) {
        return Color(QUrl::fromPercentEncoding(QByteArray::fromStdString(s)).toStdString());
    };

    if (positiveColor)
        CircuitElm::positiveColor = decode(*positiveColor);
    else if (getOptionFromStorage("alternativeColor", false))
        CircuitElm::positiveColor = Color::blue;
    else
        CircuitElm::positiveColor = Color::green;

    if (negativeColor)
        CircuitElm::negativeColor = decode(*negativeColor);
    else
        CircuitElm::negativeColor = Color::red;

    if (neutralColor)
        CircuitElm::neutralColor = decode(*neutralColor);
    else
        CircuitElm::neutralColor = Color::gray;

    if (selectColor)
        CircuitElm::selectColor = decode(*selectColor);
    else
        CircuitElm::selectColor = Color::cyan;

    if (currentColor)
        CircuitElm::currentColor = decode(*currentColor);
    else
        CircuitElm::currentColor = options.conventionalCurrent ? Color::yellow : Color::cyan;

    CircuitElm::setColorScale();
}

void CirSim::setWheelSensitivity() {
    mouse.wheelSensitivity = 1;
    if (Storage::localStorage == nullptr)
        return;
    std::optional<std::string> s = Storage::localStorage->getItem("wheelSensitivity");
    if (!s)
        return;
    try {
        mouse.wheelSensitivity = parseFloatStrict(*s);
    } catch (std::exception &) {
    }
}

void CirSim::setOptionInStorage(const std::string &key, bool val) {
    if (Storage::localStorage)
        Storage::localStorage->setItem(key, val ? "true" : "false");
}

void CirSim::loadOptions() {
    QString lang = QLocale::system().name();  // like "en_US"
    bool inUSorCanada = lang.endsWith("_US") || lang.endsWith("_CA");
    options.euroResistor = getOptionFromStorage("euroResistors", !inUSorCanada);
    options.euroGates = getOptionFromStorage("euroGates", lang.startsWith("de"));
    options.showOhm = getOptionFromStorage("showOhm", false);
    options.printable = getOptionFromStorage("whiteBackground", false);
    options.conventionalCurrent = getOptionFromStorage("conventionalCurrent", true);
    options.mouseWheelEdit = getOptionFromStorage("mouseWheelEdit", true);
    options.crossHair = getOptionFromStorage("crossHair", false);
    showPropsOnCreate = getOptionFromStorage("showPropsOnCreate", false);
    showPropsOnClick = getOptionFromStorage("showPropsOnClick", true);
}

void CirSim::alertReadOnly() {
    alert(Locale::LS(options.noEdit ? "Editing is disabled." : "Editing is disabled while viewing a subcircuit."));
}

bool CirSim::getOptionFromStorage(const std::string &key, bool val) {
    if (Storage::localStorage == nullptr)
        return val;
    std::optional<std::string> s = Storage::localStorage->getItem(key);
    if (!s)
        return val;
    return *s == "true";
}

void CirSim::setCircuitArea() {
    canvasWidth = canvas->width();
    canvasHeight = canvas->height();
    double h;
    if (scopeManager->scopeCount == 0)
        h = 0;
    else
        h = std::round(canvasHeight * scopeManager->scopeHeightFraction);
    circuitArea = Rectangle(0, 0, canvasWidth, canvasHeight - h);
}

void CirSim::centerCircuit() {
    std::optional<Rectangle> bounds = getCircuitBounds();
    setCircuitArea();

    double scale = 1;
    double cheight = circuitArea.height;

    if (scopeManager->scopeCount == 0 && circuitArea.width < 800)
        cheight -= std::round(cheight * scopeManager->scopeHeightFraction);

    if (bounds)
        scale = std::min(circuitArea.width / (bounds->width + 140), cheight / (bounds->height + 100));
    scale = std::min(scale, 1.5);

    transform[0] = transform[3] = scale;
    transform[1] = transform[2] = transform[4] = transform[5] = 0;
    if (bounds) {
        transform[4] = (circuitArea.width - bounds->width * scale) / 2 - bounds->x * scale;
        transform[5] = (cheight - bounds->height * scale) / 2 - bounds->y * scale;
    }
}

void CirSim::updateCircuit(QPainter &painter) {
    PerfMonitor perfmon;
    perfmon.startContext("updateCircuit()");

    setCircuitArea();
    bool didAnalyze = analyzeFlag;
    if (analyzeFlag || dcAnalysisFlag) {
        perfmon.startContext("analyzeCircuit()");
        sim->analyzeCircuit();
        analyzeFlag = false;
        perfmon.stopContext();
    }
    if (needCenter) {
        // needs bounding boxes, which elements compute when drawn; the first frame's
        // centering uses the x/y extents, and we redo it after one draw
        centerCircuit();
    }

    if (sim->needsStamp && simRunning) {
        perfmon.startContext("stampCircuit()");
        try {
            sim->preStampAndStampCircuit();
        } catch (std::exception &e) {
            sim->stop("Exception in stampCircuit()", nullptr);
            SimulationManager::console(std::string("Exception in stampCircuit: ") + e.what());
        }
        perfmon.stopContext();
    }

    CircuitElm *stopHighlightElm = stopElm;
    if (stopHighlightElm != nullptr && stopHighlightElm != CircuitElm::mouseElmRef)
        stopHighlightElm->setMouseElm(true);

    scopeManager->setupScopes();

    QtGraphics g(painter);

    if (options.printable) {
        CircuitElm::whiteColor = Color::black;
        CircuitElm::lightGrayColor = Color::black;
        g.setColor(Color::white);
    } else {
        CircuitElm::whiteColor = Color::white;
        CircuitElm::lightGrayColor = Color::lightGray;
        g.setColor(Color::black);
    }
    g.fillRect(0, 0, canvas->width(), canvas->height());

    if (options.noEdit) {
        // draw a lock
        g.save();
        g.setColor(Color(209, 75, 75));
        g.setLineWidth(3);
        g.fillRect(20, 30, 30, 20);
        g.beginPath();
        g.moveTo(25, 30);
        g.lineTo(25, 26);
        g.arc(35, 26, 10, -3.1415, 0);
        g.lineTo(45, 30);
        g.stroke();
        g.restore();
    }

    if (simRunning) {
        perfmon.startContext("runCircuit()");
        try {
            sim->runCircuit(didAnalyze);
        } catch (std::exception &e) {
            SimulationManager::console(std::string("exception in runCircuit ") + e.what());
        }
        perfmon.stopContext();
    }

    double sysTime = currentTimeMillis();
    if (simRunning) {
        if (lastTime != 0) {
            double inc = sysTime - lastTime;
            double c = currentBarValue;
            c = jsmath::exp(c / 3.5 - 14.2);
            CircuitElm::currentMult = 1.7 * inc * c;
            if (!options.conventionalCurrent)
                CircuitElm::currentMult = -CircuitElm::currentMult;
        }
        lastTime = sysTime;
    } else {
        lastTime = 0;
    }

    if (sysTime - secTime >= 1000) {
        framerate = frames;
        steprate = steps - lastSteps;
        lastSteps = steps;
        frames = 0;
        secTime = sysTime;
    }

    CircuitElm::powerMult = jsmath::exp(powerBarValue / 4.762 - 7);

    perfmon.startContext("graphics");

    g.setFont(CircuitElm::unitsFont);
    g.setLineCap(Graphics::CAP_ROUND);
    g.setColor(Color::white);

    g.setTransform(transform[0], 0, 0, transform[3], transform[4], transform[5]);

    perfmon.startContext("elm.draw()");
    for (CircuitElm *ce : *uiElmList) {
        if (options.power)
            g.setColor(Color::gray);
        try {
            ce->draw(g);
        } catch (std::exception &e) {
            SimulationManager::console(std::string("exception in elm.draw() ") + e.what());
        }
    }

    // draw stopHighlightElm on top of everything else so it's always visible
    if (stopHighlightElm != nullptr)
        stopHighlightElm->draw(g);
    perfmon.stopContext();

    if (mouseMode != MODE_DRAG_ROW && mouseMode != MODE_DRAG_COLUMN) {
        for (const Point &p : postDrawList)
            CircuitElm::drawPost(g, p);
    }

    int tmm = mouse.tempMouseMode;
    if (tmm == MODE_DRAG_ROW || tmm == MODE_DRAG_COLUMN || tmm == MODE_DRAG_POST || tmm == MODE_DRAG_SELECTED) {
        for (CircuitElm *ce : *uiElmList) {
            if (ce != mouse.getMouseElm() || tmm != MODE_DRAG_POST) {
                g.setColor(Color::gray);
                g.fillOval(ce->x - 3, ce->y - 3, 7, 7);
                g.fillOval(ce->x2 - 3, ce->y2 - 3, 7, 7);
            } else {
                ce->drawHandles(g, CircuitElm::selectColor);
            }
        }
    }

    if (tmm == MODE_SELECT && mouse.getMouseElm() != nullptr) {
        mouse.getMouseElm()->drawHandles(g, CircuitElm::selectColor);
        if (mouse.getMouseElm()->isRoutedWireElm() && mouse.mouseCursorX >= 0) {
            RoutedWireElm *rw = static_cast<RoutedWireElm *>(mouse.getMouseElm());
            int gx = mouse.inverseTransformX(mouse.mouseCursorX);
            int gy = mouse.inverseTransformY(mouse.mouseCursorY);
            std::optional<Point> sp = rw->getSnapPointOnWire(gx, gy);
            if (sp) {
                g.setColor(CircuitElm::selectColor);
                g.fillOval(sp->x - 4, sp->y - 4, 9, 9);
            }
        }
    }

    if (dragElm != nullptr && (dragElm->x != dragElm->x2 || dragElm->y != dragElm->y2)) {
        dragElm->draw(g);
        dragElm->drawHandles(g, CircuitElm::selectColor);
    }

    for (const Point &cn : badConnectionList) {
        g.setColor(Color::red);
        g.fillOval(cn.x - 3, cn.y - 3, 7, 7);
    }

    if (mouse.selectedArea) {
        g.setColor(CircuitElm::selectColor);
        g.drawRect(mouse.selectedArea->x, mouse.selectedArea->y, mouse.selectedArea->width, mouse.selectedArea->height);
    }

    if (options.crossHair && mouse.mouseCursorX >= 0 && mouse.mouseCursorX <= circuitArea.width &&
        mouse.mouseCursorY <= circuitArea.height) {
        g.setColor(Color::gray);
        int x = snapGrid(mouse.inverseTransformX(mouse.mouseCursorX));
        int y = snapGrid(mouse.inverseTransformY(mouse.mouseCursorY));
        g.drawLine(x, mouse.inverseTransformY(0), x, mouse.inverseTransformY(circuitArea.height));
        g.drawLine(mouse.inverseTransformX(0), y, mouse.inverseTransformX(circuitArea.width), y);
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    perfmon.startContext("drawBottomArea()");
    drawBottomArea(g);
    perfmon.stopContext();

    perfmon.stopContext(); // graphics

    if (stopHighlightElm != nullptr && stopHighlightElm != CircuitElm::mouseElmRef)
        stopHighlightElm->setMouseElm(false);

    frames++;

    if (dcAnalysisFlag) {
        dcAnalysisFlag = false;
        analyzeFlag = true;
    }
    lastFrameTime = lastTime;

    perfmon.stopContext(); // updateCircuit

    if (developerMode) {
        double height = 15;
        const double increment = 15;
        g.setColor(CircuitElm::whiteColor);
        g.drawString("Framerate: " + CircuitElm::showFormat.format(framerate), 10, height);
        g.drawString("Steprate: " + CircuitElm::showFormat.format(steprate), 10, height += increment);
        g.drawString("Steprate/iter: " + CircuitElm::showFormat.format(steprate / getIterCount()), 10, height += increment);
        g.drawString("iterc: " + CircuitElm::showFormat.format(getIterCount()), 10, height += increment);
        g.drawString("Frames: " + std::to_string(frames), 10, height += increment);

        if (mouse.mouseCursorX >= 0) {
            int cx = mouse.inverseTransformX(mouse.mouseCursorX);
            int cy = mouse.inverseTransformY(mouse.mouseCursorY);
            g.drawString("Mouse: (" + std::to_string(cx) + ", " + std::to_string(cy) + ")", 10, height += increment);
        }

        height += (increment * 2);

        std::string perfmonResult = perfmon.buildString();
        size_t start = 0;
        for (int x = 0; start < perfmonResult.size(); x++) {
            size_t nl = perfmonResult.find('\n', start);
            g.drawString(perfmonResult.substr(start, nl - start), 10, height + (increment * x));
            start = nl + 1;
        }
    }

    if (needCenter) {
        needCenter = false;
        centerCircuit();
        canvas->update();
    }

    if (savedDumpPending) {
        savedDumpPending = false;
        savedDump = dumpCircuit(false);
    }

    if (screenshotFrames > 0 && --screenshotFrames == 0) {
        QTimer::singleShot(0, this, [this] {
            grab().save(screenshotPath);
            QApplication::quit();
        });
    }
}

void CirSim::scheduleScreenshot(const QString &path, int frameCount) {
    screenshotPath = path;
    screenshotFrames = frameCount;
}

void CirSim::drawBottomArea(Graphics &g) {
    double leftX = 0;
    double h = 0;
    if (!stopMessage && scopeManager->scopeCount == 0) {
        leftX = std::max(canvasWidth - (double) infoWidth, 0.0);
        double h0 = std::round(canvasHeight * scopeManager->scopeHeightFraction);
        h = (mouse.getMouseElm() == nullptr) ? 70 : h0;
    }
    if (stopMessage && circuitArea.height > canvasHeight - 30)
        h = 30;
    g.setColor(options.printable ? "#eee" : "#111");
    g.fillRect(leftX, circuitArea.height - h, circuitArea.width, canvasHeight - circuitArea.height + h);
    g.setFont(CircuitElm::unitsFont);
    int ct = scopeManager->scopeCount;
    if (stopMessage)
        ct = 0;
    Scope::clearCursorInfo();
    // while dragging the splitter, the mouse sits on the top edge of the scopes;
    // don't treat that as hovering over a plot
    if (mouse.tempMouseMode != SimApp::MODE_DRAG_SPLITTER) {
        for (int i = 0; i != ct; i++)
            scopeManager->scopes[i]->selectScope(mouse.mouseCursorX, mouse.mouseCursorY);
        for (CircuitElm *ce : scopeElmArr)
            static_cast<ScopeElm *>(ce)->selectScope(mouse.mouseCursorX, mouse.mouseCursorY);
    }
    for (int i = 0; i != ct; i++)
        scopeManager->scopes[i]->draw(g);
    if (mouse.mouseWasOverSplitter) {
        g.setColor(CircuitElm::selectColor);
        g.setLineWidth(4.0);
        g.drawLine(0, circuitArea.height - 2, circuitArea.width, circuitArea.height - 2);
        g.setLineWidth(1.0);
    }
    g.setColor(CircuitElm::whiteColor);

    if (stopMessage) {
        g.drawString(*stopMessage, 10, canvasHeight - 10);
        return;
    }
    std::vector<std::string> info(10);
    if (mouse.getMouseElm() != nullptr) {
        if (mouse.mousePost == -1) {
            mouse.getMouseElm()->getInfo(info);
            info[0] = Locale::LS(info[0]);
            if (!info[1].empty())
                info[1] = Locale::LS(info[1]);

            if (developerMode) {
                // show node numbers for debugging
                int ni;
                for (ni = 0; !info[ni].empty() && ni < (int) info.size() - 1; ni++)
                    ;
                std::string nodeStr = "nodes:";
                CircuitElm *me = mouse.getMouseElm();
                for (int nn = 0; nn < me->getNodeCount(); nn++)
                    if (me->getNode(nn))
                        nodeStr += " " + std::to_string(me->getNode(nn)->index);
                info[ni] = nodeStr;
            }
        } else {
            info[0] = "V = " + CircuitElm::getUnitText(mouse.getMouseElm()->getPostVoltage(mouse.mousePost), "V");
        }
    } else {
        info[0] = "t = " + CircuitElm::getTimeText(sim->t);
        // nominal steprate assumes we're running at full speed; if the actual
        // measured steprate falls well short of that, the "Nx" multiplier would be misleading
        double nominalSteprate = 160 * getIterCount();
        double timerate = nominalSteprate * sim->timeStep;
        if (timerate >= 0.1 && steprate >= nominalSteprate * 0.9)
            info[0] += " (" + CircuitElm::showFormat.format(timerate) + "x)";
        info[1] = Locale::LS("time step = ") + CircuitElm::getTimeText(sim->timeStep);
    }
    if (hintType != -1) {
        int i;
        for (i = 0; i < (int) info.size() && !info[i].empty(); i++)
            ;
        std::string s = getHint();
        if (s.empty())
            hintType = -1;
        else if (i < (int) info.size())
            info[i] = s;
    }
    double x = leftX + 5;
    if (ct != 0)
        x = scopeManager->scopes[ct - 1]->rightEdge() + 20;

    int i;
    for (i = 0; i < (int) info.size() && !info[i].empty(); i++)
        ;
    int badnodes = (int) badConnectionList.size();
    if (badnodes > 0 && i < (int) info.size())
        info[i++] = std::to_string(badnodes) + (badnodes == 1 ? Locale::LS(" bad connection") : Locale::LS(" bad connections"));

    double ybase = circuitArea.height - h;
    for (i = 0; i < (int) info.size() && !info[i].empty(); i++)
        g.drawString(info[i], x, ybase + 15 * (i + 1));
}

std::string CirSim::getHint() {
    CircuitElm *c1 = getElm(hintItem1);
    CircuitElm *c2 = getElm(hintItem2);
    if (c1 == nullptr || c2 == nullptr)
        return "";
    if (hintType == HINT_LC) {
        if (!c1->isInductorElm() || !c2->isCapacitorElm())
            return "";
        double l = static_cast<InductorElm *>(c1)->getInductance();
        double c = static_cast<CapacitorElm *>(c2)->getCapacitance();
        return Locale::LS("res.f = ") + CircuitElm::getUnitText(1 / (2 * M_PI * std::sqrt(l * c)), "Hz");
    }
    if (hintType == HINT_RC || hintType == HINT_3DB_C || hintType == HINT_TWINT) {
        if (!c1->isResistorElm() || !c2->isCapacitorElm())
            return "";
        double rc = static_cast<ResistorElm *>(c1)->getResistance() * static_cast<CapacitorElm *>(c2)->getCapacitance();
        if (hintType == HINT_RC)
            return "RC = " + CircuitElm::getUnitText(rc, "s");
        return Locale::LS(hintType == HINT_3DB_C ? "f.3db = " : "fc = ") +
            CircuitElm::getUnitText(1 / (2 * M_PI * rc), "Hz");
    }
    if (hintType == HINT_3DB_L) {
        if (!c1->isResistorElm() || !c2->isInductorElm())
            return "";
        double r = static_cast<ResistorElm *>(c1)->getResistance();
        double l = static_cast<InductorElm *>(c2)->getInductance();
        return Locale::LS("f.3db = ") + CircuitElm::getUnitText(r / (2 * M_PI * l), "Hz");
    }
    return "";
}

void CirSim::handleKey(QKeyEvent *e) {
    int key = e->key();
    Qt::KeyboardModifiers mods = e->modifiers() & ~Qt::KeypadModifier;
    if (key == Qt::Key_Shift) {
        if (!e->isAutoRepeat()) {
            qint64 now = QDateTime::currentMSecsSinceEpoch();
            // Second Shift within 400 ms, with no other key in between, opens the palette.
            if (lastShiftKeyUpMs > 0 && now - lastShiftKeyUpMs < 400 && !keyPressedSinceShiftUp) {
                openCommandPalette();
                lastShiftKeyUpMs = 0;
            }
        }
    } else if (!e->isAutoRepeat()) {
        keyPressedSinceShiftUp = true;
    }
    // "/" opens the palette too, unless it's assigned to something else.  (If it's the
    // palette's own shortcut, the menu item gets it first.)
    if (e->text() == "/" && !(mods & (Qt::ControlModifier | Qt::MetaModifier | Qt::AltModifier))) {
        QKeySequence slash("/");
        bool used = runStopShortcut == slash;
        for (QAction *a : mainMenuItems)
            used |= a->shortcut() == slash;
        if (!used) {
            openCommandPalette();
            return;
        }
    }
    if (isReadOnly())
        return;
    if (key == Qt::Key_Backspace || key == Qt::Key_Delete) {
        pushUndo();
        doDelete();
        return;
    }
    if (key == Qt::Key_Escape) {
        setMouseMode("Select");
        return;
    }
    if (key == Qt::Key_Left || key == Qt::Key_Right || key == Qt::Key_Up || key == Qt::Key_Down) {
        int ddx = 0, ddy = 0;
        if (key == Qt::Key_Left) ddx = -gridSize;
        if (key == Qt::Key_Right) ddx = gridSize;
        if (key == Qt::Key_Up) ddy = -gridSize;
        if (key == Qt::Key_Down) ddy = gridSize;
        bool moved = false;
        for (CircuitElm *ce : *uiElmList)
            if (ce->isSelected()) {
                if (!moved)
                    pushUndo();
                ce->move(ddx, ddy);
                moved = true;
            }
        if (moved)
            needAnalyze();
        return;
    }
    if (mods & (Qt::ControlModifier | Qt::MetaModifier | Qt::AltModifier))
        return;
    // check if any switches have a keyboard shortcut matching this key
    // (space is included so it can be assigned as a shortcut too; it falls back to the
    // temporary-select-mode behavior below if unassigned)
    QString keyStr = switchKeyStr(e);
    if (!keyStr.isEmpty()) {
        bool toggled = false;
        if (!e->isAutoRepeat()) {
            std::string ks = keyStr.toStdString();
            for (CircuitElm *ce : elmList) {
                SwitchElm *se = dynamic_cast<SwitchElm *>(ce);
                if (se != nullptr && se->keyShortcut && *se->keyShortcut == ks) {
                    se->toggle();
                    if (!se->isLogicInputElm())
                        needAnalyze();
                    toggled = true;
                }
            }
        }
        if (toggled || isSwitchKey(e)) {
            repaint();
            return;
        }
    }
    // element shortcuts are menu item shortcuts, so they don't get here
    QString text = e->text();
    if (text.size() == 1) {
        int cc = text[0].unicode();
        if (cc == ' ') {
            setMouseMode("Select");
            return;
        }
    }
}

void CirSim::handleKeyRelease(QKeyEvent *e) {
    if (e->key() == Qt::Key_Shift && !e->isAutoRepeat()) {
        lastShiftKeyUpMs = QDateTime::currentMSecsSinceEpoch();
        keyPressedSinceShiftUp = false;
    }
    if (e->isAutoRepeat() || isReadOnly())
        return;

    // handle momentary switches with keyboard shortcuts
    QString keyStr = switchKeyStr(e);
    if (keyStr.isEmpty())
        return;
    std::string ks = keyStr.toStdString();
    bool released = false;
    for (CircuitElm *ce : elmList) {
        SwitchElm *se = dynamic_cast<SwitchElm *>(ce);
        if (se != nullptr && se->momentary && se->keyShortcut && *se->keyShortcut == ks) {
            se->mouseUp();
            released = true;
        }
    }
    if (released) {
        mouse.heldSwitchElm = nullptr;
        needAnalyze();
        repaint();
    }
}

QString CirSim::switchKeyStr(QKeyEvent *e) {
    if (e->modifiers() & (Qt::ControlModifier | Qt::MetaModifier | Qt::AltModifier))
        return "";
    QString text = e->text();
    if (text.size() == 1 && text[0].unicode() >= 32 && text[0].unicode() < 127)
        return text.toLower();
    // key releases may come without text
    int key = e->key();
    if ((key >= Qt::Key_A && key <= Qt::Key_Z) || (key >= Qt::Key_0 && key <= Qt::Key_9) || key == Qt::Key_Space)
        return QString(QChar(key)).toLower();
    return "";
}

bool CirSim::isSwitchKey(QKeyEvent *e) {
    if (isReadOnly())
        return false;
    QString keyStr = switchKeyStr(e);
    if (keyStr.isEmpty())
        return false;
    std::string ks = keyStr.toStdString();
    for (CircuitElm *ce : elmList) {
        SwitchElm *se = dynamic_cast<SwitchElm *>(ce);
        if (se != nullptr && se->keyShortcut && *se->keyShortcut == ks)
            return true;
    }
    return false;
}

void CirSim::doDelete() {
    bool hasDeleted = false;
    for (int i = (int) elmList.size() - 1; i >= 0; i--) {
        CircuitElm *ce = elmList[i];
        if (ce->isSelected() || ce->isMouseElm()) {
            if (ce->isMouseElm())
                mouse.setMouseElm(nullptr);
            if (stopElm == ce)
                stopElm = nullptr;
            ce->deleteElm();
            elmList.erase(elmList.begin() + i);
            delete ce;
            hasDeleted = true;
        }
    }
    if (hasDeleted) {
        scopeManager->deleteUnusedScopeElms();
        needAnalyze();
        writeRecoveryToStorage();
    }
}

void CirSim::doEdit(Editable *e) {
    mouse.clearSelection();
    pushUndo();
    closeEditDialog();
    editDialog = new EditDialog(e, this);
    editDialog->adjustSize();
    // dock to the left of the sidebar, near the top, like the web version
    QPoint topRight = mapToGlobal(QPoint(width() - Sidebar::WIDTH - 16, 70));
    editDialog->move(topRight.x() - editDialog->width(), topRight.y());
    editDialog->show();
    editDialog->raise();
}

void CirSim::doEditModel(Editable *e) {
    if (modelEditDialog != nullptr)
        modelEditDialog->close();
    modelEditDialog = new EditDialog(e, this);
    modelEditDialog->adjustSize();
    // offset below the main (non-modal) property editor so the two do not overlap
    QPoint pos = editDialog != nullptr ? editDialog->pos() + QPoint(0, 320)
                                       : mapToGlobal(QPoint(width() - Sidebar::WIDTH - 16 - modelEditDialog->width(), 390));
    modelEditDialog->move(pos);
    modelEditDialog->show();
    modelEditDialog->raise();
}

void CirSim::closeEditDialog() {
    if (editDialog != nullptr) {
        EditDialog *d = editDialog;
        editDialog = nullptr;
        d->close();
    }
}

void CirSim::editDialogClosed(EditDialog *d) {
    if (editDialog == d)
        editDialog = nullptr;
    if (modelEditDialog == d)
        modelEditDialog = nullptr;
    canvas->setFocus();
}

void CirSim::resetEditDialog() {
    // called from inside setEditValue(), while the dialog is handling a widget's signal,
    // so rebuild afterwards
    if (editDialog != nullptr) {
        EditDialog *d = editDialog;
        QTimer::singleShot(0, d, [this, d] {
            if (editDialog == d)
                d->resetDialog();
        });
    }
}

void CirSim::elementDeleted(CircuitElm *ce) {
    SimApp::elementDeleted(ce);
    if (mouse.getMouseElm() == ce)
        mouse.setMouseElm(nullptr);
    if (editDialog != nullptr && editDialog->elm == static_cast<Editable *>(ce))
        closeEditDialog();
}

void CirSim::alert(const std::string &message) {
    QMessageBox::information(this, "CircuitJS1", QString::fromStdString(message));
}

bool CirSim::confirm(const std::string &question) {
    return QMessageBox::question(this, "CircuitJS1", QString::fromStdString(question)) == QMessageBox::Yes;
}

void CirSim::addSlider(Scrollbar *sb) {
    if (sidebar != nullptr)
        sidebar->addSlider(sb);
}

void CirSim::removeSlider(Scrollbar *sb) {
    if (sidebar != nullptr)
        sidebar->removeSlider(sb);
}

void CirSim::updateSlider(Scrollbar *sb) {
    if (sidebar != nullptr)
        sidebar->updateSlider(sb);
}

void CirSim::addButton(PanelButton *b) {
    if (sidebar != nullptr)
        sidebar->addButton(b);
}

void CirSim::removeButton(PanelButton *b) {
    if (sidebar != nullptr)
        sidebar->removeButton(b);
}

void CirSim::updateButton(PanelButton *b) {
    if (sidebar != nullptr)
        sidebar->updateButton(b);
}

void CirSim::playAudio(const std::vector<short> &samples, int sampleRate) {
    if (!audioPlayer)
        audioPlayer = std::make_unique<AudioPlayer>();
    if (!audioPlayer->play(samples, sampleRate))
        alert(Locale::LS("Can't play audio"));
}

void CirSim::saveFile(const std::vector<unsigned char> &bytes, const std::string &suggestedName) {
    QString path = QFileDialog::getSaveFileName(this, QString(), QString::fromStdString(suggestedName));
    if (path.isEmpty())
        return;
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly) || f.write((const char *) bytes.data(), (qint64) bytes.size()) != (qint64) bytes.size())
        alert(Locale::LS("Can't save file"));
}

bool CirSim::loadTextFile(std::string &name, std::string &contents) {
    QString path = QFileDialog::getOpenFileName(this);
    if (path.isEmpty())
        return false;
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) {
        alert(Locale::LS("Can't read file"));
        return false;
    }
    contents = f.readAll().toStdString();
    name = QFileInfo(path).fileName().toStdString();
    return true;
}

bool CirSim::loadAudioFile(std::string &name, std::vector<float> &data, int &sampleRate) {
    QString path = QFileDialog::getOpenFileName(this, QString(), QString(),
                                                QString::fromStdString(Locale::LS("Audio files")) + " (*.wav *.mp3 *.flac);;" + QString::fromStdString(Locale::LS("All files")) + " (*)");
    if (path.isEmpty())
        return false;
    if (!AudioPlayer::decodeFile(path.toStdString(), data, sampleRate)) {
        alert(Locale::LS("Can't read audio file"));
        return false;
    }
    // the file name without its extension
    name = QFileInfo(path).completeBaseName().toStdString();
    return true;
}
