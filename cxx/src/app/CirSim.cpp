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
#include <QApplication>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QHBoxLayout>
#include <QVBoxLayout>
#include <QKeyEvent>
#include <QMenuBar>
#include <QCloseEvent>
#include <QMessageBox>
#include <QPushButton>
#include <QStandardPaths>
#include <QRegularExpression>
#include <QDir>
#include <QPainter>
#include <QTextStream>
#include <chrono>
#include <cmath>

#include "QtGraphics.h"
#include "Sidebar.h"
#include "Toolbar.h"
#include "EditDialog.h"
#include "core/CircuitElm.h"
#include "core/ElementFactory.h"
#include "core/JsMath.h"
#include "core/Locale.h"
#include "core/Scope.h"
#include "core/CircuitXMLSerializer.h"
#include "core/CustomLogicModel.h"
#include "core/MosfetModel.h"
#include "core/DiodeModel.h"
#include "core/TransistorModel.h"

CircuitCanvas::CircuitCanvas(CirSim *a) : QWidget(a), app(a) {
    setAttribute(Qt::WA_OpaquePaintEvent);
    setMouseTracking(true);
    setFocusPolicy(Qt::StrongFocus);
}

void CircuitCanvas::keyPressEvent(QKeyEvent *e) { app->handleKey(e); }

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

CirSim::CirSim() {
    sim = std::make_unique<SimulationManager>(this);
    scopeManagerOwner = std::make_unique<ScopeManager>(this);
    scopeManager = scopeManagerOwner.get();
    loader = std::make_unique<CircuitLoader>(this, sim.get());
    undoManager = std::make_unique<UndoManager>(this);
    CircuitElm::initClass(this, sim.get());
    registerElements();
    setColors();

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
    left->addWidget(toolbar);
    left->addWidget(canvas, 1);
    layout->addLayout(left, 1);
    layout->addWidget(sidebar);
    setCentralWidget(central);
    updateToolbar();
    undoManager->enableUndoRedo();
    resize(1400, 860);

    // the TS version redraws on a 16ms timer while the simulation runs
    connect(&timer, &QTimer::timeout, canvas, [this] { canvas->update(); });
    timer.start(16);
}

CirSim::~CirSim() {
    timer.stop();
    deleteAllElms();
}

void CirSim::createMenus() {
    QMenu *file = menuBar()->addMenu(tr("&File"));
    QAction *open = file->addAction(tr("&Open..."));
    open->setShortcut(QKeySequence::Open);
    connect(open, &QAction::triggered, this, [this] { openFile(); });
    QAction *blank = file->addAction(tr("&New Blank Circuit"));
    blank->setShortcut(QKeySequence::New);
    connect(blank, &QAction::triggered, this, [this] { newBlankCircuit(); });
    file->addSeparator();
    QAction *saveItem = file->addAction(tr("&Save"));
    saveItem->setShortcut(QKeySequence::Save);
    connect(saveItem, &QAction::triggered, this, [this] { save(); });
    QAction *saveAsItem = file->addAction(tr("Save &As..."));
    saveAsItem->setShortcut(QKeySequence::SaveAs);
    connect(saveAsItem, &QAction::triggered, this, [this] { saveAs(); });

    QMenu *edit = menuBar()->addMenu(tr("&Edit"));
    undoItem = edit->addAction(tr("&Undo"));
    undoItem->setShortcut(QKeySequence::Undo);
    connect(undoItem, &QAction::triggered, this, [this] { undoManager->doUndo(); });
    redoItem = edit->addAction(tr("&Redo"));
    redoItem->setShortcuts({QKeySequence::Redo, QKeySequence(Qt::CTRL | Qt::Key_Y)});
    connect(redoItem, &QAction::triggered, this, [this] { undoManager->doRedo(); });

    createDrawMenu();

    QMenu *simMenu = menuBar()->addMenu(tr("&Simulation"));
    runStopAction = simMenu->addAction(tr("&Run"));
    runStopAction->setCheckable(true);
    runStopAction->setChecked(true);
    runStopAction->setShortcut(QKeySequence(Qt::CTRL | Qt::Key_Period));
    connect(runStopAction, &QAction::toggled, this, [this](bool on) { setSimRunning(on); });
    QAction *reset = simMenu->addAction(tr("Re&set"));
    reset->setShortcut(QKeySequence(Qt::CTRL | Qt::Key_R));
    connect(reset, &QAction::triggered, this, [this] { resetAction(); });

    QMenu *opts = menuBar()->addMenu(tr("&Options"));
    auto addToggle = [&](const QString &name, bool &flag) {
        QAction *a = opts->addAction(name);
        a->setCheckable(true);
        a->setChecked(flag);
        connect(a, &QAction::toggled, this, [this, &flag](bool on) {
            flag = on;
            setPowerBarEnable();
            canvas->update();
        });
        return a;
    };
    addToggle(tr("Show &Current"), options.dots);
    addToggle(tr("Show &Voltage"), options.volts);
    addToggle(tr("Show &Power"), options.power);
    addToggle(tr("Show &Values"), options.showValues);
    addToggle(tr("European Resistors"), options.euroResistor);
    addToggle(tr("IEC Gates"), options.euroGates);
    opts->addSeparator();
    addToggle(tr("Show Properties On Click"), showPropsOnClick);

    createCircuitsMenu();
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

void CirSim::createCircuitsMenu() {
    QFile f(resourceDir() + "/setuplist.txt");
    if (!f.open(QIODevice::ReadOnly)) {
        SimulationManager::console("Can't load circuit list!");
        return;
    }
    QString text = QString::fromUtf8(f.readAll());
    QMenu *currentMenu = menuBar()->addMenu(tr("&Circuits"));
    std::vector<QMenu *> stack{currentMenu};
    QString circuitsDir = resourceDir() + "/circuits/";

    for (const QString &line : text.split(QRegularExpression("\\r?\\n"))) {
        if (line.isEmpty() || line[0] == '#')
            continue;
        if (line[0] == '+') {
            QMenu *sub = currentMenu->addMenu(QString::fromStdString(Locale::LS(line.mid(1).toStdString())));
            currentMenu = sub;
            stack.push_back(currentMenu);
        } else if (line[0] == '-') {
            if (stack.size() > 1)
                stack.pop_back();
            currentMenu = stack.back();
        } else {
            int sp = line.indexOf(' ');
            if (sp > 0) {
                bool first = line[0] == '>';
                QString file = line.mid(first ? 1 : 0, sp - (first ? 1 : 0));
                QString title = QString::fromStdString(Locale::LS(line.mid(sp + 1).toStdString()));
                // flag circuits that use elements we haven't ported yet
                // TODO: remove once all elements are ported (temporary, for tracking the port)
                QString label = title;
                QFile cf(circuitsDir + file);
                if (cf.open(QIODevice::ReadOnly) &&
                    !CircuitLoader::findUnsupported(cf.readAll().toStdString()).empty())
                    label += " (partial)";
                QAction *a = currentMenu->addAction(label);
                connect(a, &QAction::triggered, this, [this, file, title] { readSetupFile(file, title); });
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
        SimulationManager::console("not ported yet: " + m);
    }
    readCircuit(data.toStdString());
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
    readCircuit("");
    filePath.clear();
    unsavedChanges = false;
    savedDumpPending = true;
    setCircuitTitle(QString());
    setWindowTitle("CircuitJS1");
}

std::string CirSim::dumpCircuit(bool saveState) {
    // TODO: subcircuit and relay models
    CustomLogicModel::clearDumpedFlags();
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

bool CirSim::isModified() {
    // a click pushes an undo item (and so sets unsavedChanges) even if nothing moves,
    // so check whether the circuit itself is different
    return unsavedChanges && dumpCircuit(false) != savedDump;
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
    if (filePath.isEmpty())
        return saveAs();
    return writeFile(filePath);
}

bool CirSim::saveAs() {
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
    // TODO: color preferences
    CircuitElm::positiveColor = Color::green;
    CircuitElm::negativeColor = Color::red;
    CircuitElm::neutralColor = Color::gray;
    CircuitElm::selectColor = Color::cyan;
    CircuitElm::currentColor = options.conventionalCurrent ? Color::yellow : Color::cyan;
    CircuitElm::setColorScale();
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

std::optional<Rectangle> CirSim::getCircuitBounds() {
    int minx = 30000, maxx = -30000, miny = 30000, maxy = -30000;
    for (CircuitElm *ce : *uiElmList) {
        if (!ce->isCenteredText()) {
            minx = std::min(ce->x, std::min(ce->x2, minx));
            maxx = std::max(ce->x, std::max(ce->x2, maxx));
        }
        miny = std::min(ce->y, std::min(ce->y2, miny));
        maxy = std::max(ce->y, std::max(ce->y2, maxy));
        // use boundingBox for elements like chips/subcircuits whose
        // visual extent exceeds their x/y coordinates
        const Rectangle &bb = ce->getBoundingBox();
        if (!ce->isCenteredText()) {
            minx = std::min((int) bb.x, minx);
            maxx = std::max((int) (bb.x + bb.width), maxx);
        }
        miny = std::min((int) bb.y, miny);
        maxy = std::max((int) (bb.y + bb.height), maxy);
    }
    if (minx > maxx)
        return std::nullopt;
    return Rectangle(minx, miny, maxx - minx, maxy - miny);
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
    setCircuitArea();
    bool didAnalyze = analyzeFlag;
    if (analyzeFlag || dcAnalysisFlag) {
        sim->analyzeCircuit();
        analyzeFlag = false;
    }
    if (needCenter) {
        // needs bounding boxes, which elements compute when drawn; the first frame's
        // centering uses the x/y extents, and we redo it after one draw
        centerCircuit();
    }

    if (sim->needsStamp && simRunning) {
        try {
            sim->preStampAndStampCircuit();
        } catch (std::exception &e) {
            sim->stop("Exception in stampCircuit()", nullptr);
            SimulationManager::console(std::string("Exception in stampCircuit: ") + e.what());
        }
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

    if (simRunning) {
        try {
            sim->runCircuit(didAnalyze);
        } catch (std::exception &e) {
            SimulationManager::console(std::string("exception in runCircuit ") + e.what());
        }
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

    g.setFont(CircuitElm::unitsFont);
    g.setLineCap(Graphics::CAP_ROUND);
    g.setColor(Color::white);

    g.setTransform(transform[0], 0, 0, transform[3], transform[4], transform[5]);

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

    if (tmm == MODE_SELECT && mouse.getMouseElm() != nullptr)
        mouse.getMouseElm()->drawHandles(g, CircuitElm::selectColor);

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

    g.setTransform(1, 0, 0, 1, 0, 0);
    drawBottomArea(g);

    if (stopHighlightElm != nullptr && stopHighlightElm != CircuitElm::mouseElmRef)
        stopHighlightElm->setMouseElm(false);

    frames++;

    if (dcAnalysisFlag) {
        dcAnalysisFlag = false;
        analyzeFlag = true;
    }
    lastFrameTime = lastTime;

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
    for (int i = 0; i != ct; i++)
        scopeManager->scopes[i]->selectScope(mouse.mouseCursorX, mouse.mouseCursorY);
    // TODO: ScopeElm (undocked scopes)
    for (int i = 0; i != ct; i++)
        scopeManager->scopes[i]->draw(g);
    // TODO: the splitter for resizing the scope area
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
    // TODO: hints
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

void CirSim::handleKey(QKeyEvent *e) {
    int key = e->key();
    Qt::KeyboardModifiers mods = e->modifiers() & ~Qt::KeypadModifier;
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
    // TODO: switch key shortcuts (SwitchElm keyShortcut)
    QString text = e->text();
    if (text.size() == 1) {
        int cc = text[0].unicode();
        auto it = shortcuts.find(cc);
        if (it != shortcuts.end()) {
            setMouseMode(it->second);
            return;
        }
        if (cc == ' ') {
            setMouseMode("Select");
            return;
        }
    }
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
    if (hasDeleted)
        needAnalyze();
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
    if (editDialog != nullptr && editDialog->elm == static_cast<Editable *>(ce))
        closeEditDialog();
}

void CirSim::alert(const std::string &message) {
    QMessageBox::information(this, "CircuitJS1", QString::fromStdString(message));
}

bool CirSim::confirm(const std::string &question) {
    return QMessageBox::question(this, "CircuitJS1", QString::fromStdString(question)) == QMessageBox::Yes;
}
