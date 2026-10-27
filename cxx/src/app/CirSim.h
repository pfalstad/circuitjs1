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

#include <QApplication>
#include <QMainWindow>
#include <QImage>
#include <QKeySequence>
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
class EditOptions;

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
    void keyReleaseEvent(QKeyEvent *e) override;
    bool event(QEvent *e) override;
    void contextMenuEvent(QContextMenuEvent *e) override;
    void wheelEvent(QWheelEvent *e) override;
    void leaveEvent(QEvent *e) override;
    void resizeEvent(QResizeEvent *e) override;

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
    // a top-level menu title: the translation of s if there is one, else the English
    // title with its mnemonic
    static QString menuTitle(const char *s, const QString &withMnemonic);
    // the --lang command-line option, which overrides the saved language (?lang= in the web version)
    static inline QString langOverride;
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
    // the dump without the sidebar slider settings (simulation speed, current speed, power
    // brightness), so moving a slider doesn't count as a change to the circuit
    static std::string withoutSliders(const std::string &dump);
    void pushUndo() { undoManager->pushUndo(); }
    void enableUndoRedo(bool undo, bool redo);
    bool save();
    bool saveAs();
    bool writeFile(const QString &path);
    bool maybeSave();  // ask about unsaved changes; false if the user cancels
    bool isModified();
    void newBlankCircuit();
    void closeEvent(QCloseEvent *e) override;
    void resizeEvent(QResizeEvent *e) override;
    void needAnalyze();
    void repaint() override;
    bool sliderItemEnabled(CircuitElm *elm);
    void doSliders(CircuitElm *ce);
    void showScopeProperties(Scope *s);
    void addSlider(Scrollbar *sb) override;
    void addButton(PanelButton *b) override;
    void removeButton(PanelButton *b) override;
    void updateButton(PanelButton *b) override;
    void playAudio(const std::vector<short> &samples, int sampleRate) override;
    void saveFile(const std::vector<unsigned char> &bytes, const std::string &suggestedName) override;
    bool loadAudioFile(std::string &name, std::vector<float> &data, int &sampleRate) override;
    bool loadTextFile(std::string &name, std::string &contents) override;
    bool modalDialogIsShowing() const override {
        return QApplication::activeModalWidget() != nullptr || QApplication::activePopupWidget() != nullptr;
    }
    void removeSlider(Scrollbar *sb) override;
    void updateSlider(Scrollbar *sb) override;
    void setSimRunning(bool s) override;

    // one frame: analyze if needed, run the simulation, draw everything
    void updateCircuit(QPainter &painter);

    QWidget *canvasWidget() const { return (QWidget *) canvas; }

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
    // show the resize cursor while over the scope splitter, else the mouse mode's cursor
    void setSplitterCursor(bool over);
    // the hint text for the info box (hintType/hintItem1/hintItem2), or empty if invalid
    std::string getHint();
    // the Draw menu items that can have shortcuts (mainMenuItems in the TS version)
    std::vector<QAction *> mainMenuItems;
    // user-assigned key for Start/Stop Simulation, in addition to Ctrl-.
    QKeySequence runStopShortcut;
    QAction *runStopAction = nullptr;
    void setRunStopShortcut(const QKeySequence &k);
    // the tool (or command) assigned to key k, or null if there is none
    QAction *findToolShortcut(const QKeySequence &k);
    // key for the command palette (Edit > Find Component/Command...); "/" by default
    QKeySequence paletteShortcut;
    QAction *searchItem = nullptr;
    void setPaletteShortcut(const QKeySequence &k);
    void openCommandPalette();
    // shortcuts saved in storage from Options > Shortcuts...
    void saveShortcuts();
    void loadShortcuts();
    QMap<QString, QString> classToLabelMap;
    void handleKey(QKeyEvent *e);
    void handleKeyRelease(QKeyEvent *e);
    // the key as a switch keyShortcut string ("" if it can't be one), and whether any switch uses it
    static QString switchKeyStr(QKeyEvent *e);
    bool isSwitchKey(QKeyEvent *e);
    // delete selected elements (and the one under the mouse)
    void doDelete();
    // Edit menu commands (CommandManager.ts).  menuElm is the element to act on if it
    // isn't selected (the context menu's element, or the one under the mouse for keys).
    void doCut(CircuitElm *menuElm);
    void doCopy(CircuitElm *menuElm);
    void doPaste(const std::string *dump = nullptr);  // nullptr: paste the clipboard
    void doDuplicate(CircuitElm *menuElm);
    void doSelectAll();
    void mirrorX(CircuitElm *menuElm);
    void mirrorY(CircuitElm *menuElm);
    void rotateCCW(CircuitElm *menuElm);
    void rotateCW(CircuitElm *menuElm);
    // the element under the mouse, for commands from shortcut keys
    CircuitElm *keyMenuElm();
    void enableDisableMenuItems();
    void enablePaste();
    void addScopePopupItems(QMenu &menu, Scope *s, ScopeElm *se);
    // the right-click menu
    void doPopupMenu(const QPoint &globalPos);

    // the property editor
    EditDialog *editDialog = nullptr;
    EditDialog *modelEditDialog = nullptr;  // the custom logic chip's Edit Model dialog
    void doEditModel(Editable *e) override;
    void doEdit(Editable *e);
    void positionEditDialogNear(CircuitElm *elm);
    void closeEditDialog() override;
    void editDialogClosed(EditDialog *d);
    void resetEditDialog() override;
    void elementDeleted(CircuitElm *ce) override;
    bool confirm(const std::string &question) override;
    void alert(const std::string &message) override;
    bool showPropsOnCreate = false;
    bool showPropsOnClick = true;
    bool toolbarVisible = true;
    // Options > Other Options...
    std::unique_ptr<EditOptions> editOptions;

    // circuit colors, from saved settings or the defaults
    void setColors();
    void setWheelSensitivity();
    bool getOptionFromStorage(const std::string &key, bool val);
    void setOptionInStorage(const std::string &key, bool val);
    // Options menu settings saved from earlier sessions
    void loadOptions();

    // editing is disabled by Options > Disable Editing, or while viewing a subcircuit's components
    bool isReadOnly() const { return options.noEdit || !subcircuitStack.empty(); }
    // tell the user why an editing command didn't work
    void alertReadOnly();

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

    // File menu commands (CommandManager.ts, ImageExporter.ts)
    void newWindow();
    void toggleFullScreen();
    void doImportFromText();
    void importCircuitFromText(const std::string &text, bool subcircuitsOnly);
    void doExportAsText();
    void doExportAsUrl();
    void doExportAsImage();
    void doImageToClipboard();
    void doExportAsSVG();
    // scope context menu: Export CSV... and Export Image... (Scope.exportCSV/exportImage, ScopeExportImageDialog)
    void exportScopeCSV(Scope *s);
    void exportScopeImage(Scope *s);
    bool writeScopeImage(Scope *s, const QString &path, bool svg, bool transparent);
    void doPrint();
    void doDCAnalysis();
    void doAbout();
    // auto-save: the circuit as of the last change, and the one saved by the last session
    std::optional<std::string> recovery;
    void writeRecoveryToStorage();
    void readRecovery();
    void doRecover();
    qint64 lastResizeTime = 0;  // when the window was last resized

private:
    void createMenus();
    void createFileMenu();
    enum { CAC_PRINT, CAC_IMAGE, CAC_SVG };
    Rectangle imageBounds();
    QImage getCircuitAsImage(int type);
    void drawCircuitInPainter(QPainter &painter, int type, const Rectangle &bounds, double w, double h);
    QAction *recoverItem = nullptr;
    // for double-tap Shift, which opens the command palette (see handleKey())
    qint64 lastShiftKeyUpMs = 0;
    bool keyPressedSinceShiftUp = false;
    void loadLocale();
    void createCircuitsMenu();
    void createDrawMenu();
    // the part of readCircuit() after the loader is done
    void circuitLoaded(int flags);
    QAction *getClassCheckItem(QMenu *menu, const QString &label, const QString &cls, const QString &hint = QString());
    void setCircuitArea() override;
    void drawBottomArea(Graphics &g);
    struct FlipInfo {
        int cx, cy, count;
    };
    FlipInfo prepareFlip(CircuitElm *menuElm);
    void setMenuSelection(CircuitElm *menuElm);
    int countSelected();
    std::string copyOfSelectedElms();
    void writeClipboardToStorage();
    void readClipboardFromStorage();
    std::string clipboard;

    CircuitCanvas *canvas;
    Sidebar *sidebar = nullptr;
    std::unique_ptr<class AudioPlayer> audioPlayer;
    Toolbar *toolbar = nullptr;
    SubcircuitBar *subcircuitBar = nullptr;
    std::unique_ptr<QtStorage> storage;
    QMenu *subcircuitMenu = nullptr;
    int lastSubcircuitMenuUpdate = -1;
    QTimer timer;
    QAction *undoItem = nullptr;
    QAction *redoItem = nullptr;
    QAction *cutItem = nullptr;
    QAction *copyItem = nullptr;
    QAction *pasteItem = nullptr;
    QAction *mirrorXItem = nullptr;
    QAction *mirrorYItem = nullptr;
    QAction *rotateCCWItem = nullptr;
    QAction *rotateCWItem = nullptr;
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
