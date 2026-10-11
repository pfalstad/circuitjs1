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

#pragma once

#include <QMainWindow>
#include <QMap>
#include <map>
#include <QTimer>
#include <QWidget>
#include <array>
#include <memory>

#include "core/CircuitLoader.h"
#include "core/Rectangle.h"
#include "core/SimApp.h"
#include "core/SimulationManager.h"
#include "MouseManager.h"
#include "core/ScopeManager.h"
#include "core/SubcircuitModel.h"
#include "UndoManager.h"

class CirSim;
class QAction;
struct PanelButton;
class QActionGroup;
class QMenu;
class Scope;
class ScopeElm;
class Graphics;
class Sidebar;
class Toolbar;
class SubcircuitBar;
class QtStorage;
class EditDialog;
class Editable;

// the drawing surface; all the work happens in CirSim::updateCircuit()
class CircuitCanvas : public QWidget {
public:
    explicit CircuitCanvas(CirSim *app);

protected:
    void paintEvent(QPaintEvent *) override;
    void mousePressEvent(QMouseEvent *e) override;
    void mouseMoveEvent(QMouseEvent *e) override;
    void mouseReleaseEvent(QMouseEvent *e) override;
    void mouseDoubleClickEvent(QMouseEvent *e) override;
    void keyPressEvent(QKeyEvent *e) override;
    void contextMenuEvent(QContextMenuEvent *e) override;
    void wheelEvent(QWheelEvent *e) override;
    void leaveEvent(QEvent *e) override;

private:
    CirSim *app;
};

// a saved circuit, for editing a subcircuit model's circuit in its place (CirSim.ts)
struct CircuitContext {
    std::string circuitDump;
    std::vector<UndoItem> undoStack;
    std::vector<UndoItem> redoStack;
    std::array<double, 6> transform{};
    std::string modelName;
    std::vector<SubcircuitModelRef> changedModels;
};

// The main window.  Combines the TS version's CirSim and UIManager (the frame loop,
// drawing, menus).
class CirSim : public QMainWindow, public SimApp {
public:
    CirSim();
    ~CirSim() override;

    std::unique_ptr<SimulationManager> sim;
    std::unique_ptr<CircuitLoader> loader;
    MouseManager mouse{this};
    std::unique_ptr<ScopeManager> scopeManagerOwner;

    // (the circuit-to-screen transform is SimApp::transform)

    bool loadFile(const QString &path);
    // folder holding setuplist.txt and circuits/ (inside the app bundle, or the source tree)
    static QString resourceDir();
    // load one of the example circuits, by file name within circuits/
    void readSetupFile(const QString &file, const QString &title);
    // load the startup circuit from the setup list (the entry marked with '>')
    void loadDefaultCircuit();
    void readCircuit(const std::string &text, int flags = 0) override;
    void readCircuitFromDoc(const XmlElement *doc) override;

    // saving and undo
    std::unique_ptr<UndoManager> undoManager;
    bool unsavedChanges = false;
    QString filePath;  // where Save writes; empty for new circuits and the examples
    std::string dumpCircuit(bool saveState = true);  // false: without state or scopes (see CircuitXMLSerializer)
    void pushUndo() { undoManager->pushUndo(); }
    void enableUndoRedo(bool undo, bool redo);
    bool save();
    bool saveAs();
    bool writeFile(const QString &path);
    bool maybeSave();  // ask about unsaved changes; false if the user cancels
    bool isModified();
    void newBlankCircuit();
    void closeEvent(QCloseEvent *e) override;
    void needAnalyze();
    void repaint() override;
    bool sliderItemEnabled(CircuitElm *elm);
    void doSliders(CircuitElm *ce);
    void addSlider(Scrollbar *sb) override;
    void addButton(PanelButton *b) override;
    void removeButton(PanelButton *b) override;
    void updateButton(PanelButton *b) override;
    void playAudio(const std::vector<short> &samples, int sampleRate) override;
    void saveFile(const std::vector<unsigned char> &bytes, const std::string &suggestedName) override;
    bool loadAudioFile(std::string &name, std::vector<float> &data, int &sampleRate) override;
    bool loadTextFile(std::string &name, std::string &contents) override;
    void removeSlider(Scrollbar *sb) override;
    void updateSlider(Scrollbar *sb) override;
    void setSimRunning(bool s) override;

    // one frame: analyze if needed, run the simulation, draw everything
    void updateCircuit(QPainter &painter);

    // render frames, save the canvas to an image, and quit (for testing)
    void scheduleScreenshot(const QString &path, int frameCount);

    void centerCircuit();
    void openFile();
    void resetAction();
    void setCircuitTitle(const QString &title);
    void setPowerBarEnable();

    // current mouse mode as a class name ("ResistorElm") or mode ("Select", "DragAll", ...)
    QString mouseModeStr = "Select";
    void setMouseMode(const QString &s);
    void updateToolbar();
    // element shortcut keys -> class name
    std::map<int, QString> shortcuts;
    QMap<QString, QString> classToLabelMap;
    void handleKey(QKeyEvent *e);
    // delete selected elements (and the one under the mouse)
    void doDelete();
    void addScopePopupItems(QMenu &menu, Scope *s, ScopeElm *se);
    // the right-click menu
    void doPopupMenu(const QPoint &globalPos);

    // the property editor
    EditDialog *editDialog = nullptr;
    EditDialog *modelEditDialog = nullptr;  // the custom logic chip's Edit Model dialog
    void doEditModel(Editable *e) override;
    void doEdit(Editable *e);
    void closeEditDialog() override;
    void editDialogClosed(EditDialog *d);
    void resetEditDialog() override;
    void elementDeleted(CircuitElm *ce) override;
    bool confirm(const std::string &question) override;
    void alert(const std::string &message) override;
    bool showPropsOnClick = true;

    // editing is disabled while viewing a subcircuit's components
    bool isReadOnly() const { return !subcircuitStack.empty(); }

    // viewing a subcircuit's components (UIManager.ts).  The stack holds the SubcircuitElms
    // we went into; uiElmList points at subcircuitElmList while it's not empty.
    std::vector<CircuitElm *> subcircuitStack;
    std::vector<CircuitElm *> subcircuitElmList;
    void pushSubcircuit(CircuitElm *cce, const std::vector<CircuitElm *> &allElms) override;
    void popSubcircuit();
    void resetSubcircuitView() override;
    void updateSubcircuitPath();
    void updateContextButtons();

    // saved context stack for editing subcircuit models
    std::vector<CircuitContext> contextStack;
    void pushContext(const std::string &modelName) override;
    void popContext() { popContextAndGetChangedModels(); }
    // pop context and return the list of models changed at deeper levels
    std::vector<SubcircuitModelRef> popContextAndGetChangedModels();
    void resetEditingContext();
    bool isEditingContext() override { return !contextStack.empty(); }
    std::optional<std::string> getEditingModelName();
    // force all SubcircuitElm with a given model name to re-fetch their model
    void refreshModels(const std::string &modelName);
    void editSubcircuitPinLayout(const SubcircuitModelRef &model) override;
    void doCreateSubcircuit();
    void composeSubcircuitMenu();

private:
    void createMenus();
    void createCircuitsMenu();
    void createDrawMenu();
    // the part of readCircuit() after the loader is done
    void circuitLoaded(int flags);
    QAction *getClassCheckItem(QMenu *menu, const QString &label, const QString &cls, const QString &hint = QString());
    void setCircuitArea() override;
    void drawBottomArea(Graphics &g);
    void setColors();

    CircuitCanvas *canvas;
    Sidebar *sidebar = nullptr;
    std::unique_ptr<class AudioPlayer> audioPlayer;
    Toolbar *toolbar = nullptr;
    SubcircuitBar *subcircuitBar = nullptr;
    std::unique_ptr<QtStorage> storage;
    QMenu *subcircuitMenu = nullptr;
    int lastSubcircuitMenuUpdate = -1;
    QTimer timer;
    QAction *runStopAction = nullptr;
    QAction *undoItem = nullptr;
    QAction *redoItem = nullptr;
    std::string savedDump;      // the circuit (without state) as of the last load or save
    bool savedDumpPending = false;  // take savedDump after the next frame, once scopes are set up
    QActionGroup *modeActions = nullptr;
    QMenu *drawMenu = nullptr;
    double lastTime = 0;
    double secTime = 0;
    int frames = 0;
    long lastSteps = 0;
    int framerate = 0;
    long steprate = 0;
    bool needCenter = false;
    QString startCircuit, startLabel;
    QString screenshotPath;
    int screenshotFrames = -1;
};
