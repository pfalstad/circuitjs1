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

#include <chrono>
#include <memory>
#include <cmath>
#include <optional>
#include <random>
#include <string>
#include <unordered_set>
#include <vector>

#include "Color.h"
#include "JsMath.h"
#include "Point.h"
#include "Rectangle.h"

class Adjustable;
class CircuitElm;
class CircuitNode;
class Scrollbar;
class ScopeManager;

// The part of CirSim that the simulator and elements depend on.  The headless tools use
// this directly; the Qt app subclasses it and overrides the hooks.
class SimApp {
public:
    virtual ~SimApp();

    // the circuit; elements are owned by this list
    std::vector<CircuitElm *> elmList;

    // the list being displayed/edited (differs from elmList when viewing subcircuit internals)
    std::vector<CircuitElm *> *uiElmList = &elmList;

    std::vector<Point> postDrawList;
    std::vector<Point> badConnectionList;
    std::vector<CircuitElm *> scopeElmArr;

    bool showResistanceInVoltageSources = true;
    bool dumpMatrix = false;
    bool dcAnalysisFlag = false;
    bool simRunning = true;
    bool analyzeFlag = false;
    std::optional<std::string> stopMessage;
    CircuitElm *stopElm = nullptr;
    double minFrameRate = 20;
    long steps = 0;
    double lastFrameTime = 0;
    int gridSize = 16;
    bool autoDCOnReset = false;
    bool developerMode = false;
    // the hint shown in the info box for some example circuits
    int hintType = -1, hintItem1 = 0, hintItem2 = 0;

    // slider positions (the UI owns the actual widgets)
    int speedBarValue = 117;
    int currentBarValue = 50;
    int powerBarValue = 50;

    // values with sliders
    std::vector<Adjustable *> adjustables;
    std::vector<Adjustable *> retiredAdjustables;  // deleted, but maybe still shared
    Adjustable *findAdjustable(CircuitElm *elm, int item);
    // delete sliders for an element
    void deleteSliders(CircuitElm *elm);

    // show/hide/refresh a slider in the side panel (TS: addWidgetToVerticalPanel() etc.)
    // side panel buttons (the audio output's Play button)
    virtual void addButton(struct PanelButton *) {}
    virtual void removeButton(struct PanelButton *) {}
    virtual void updateButton(struct PanelButton *) {}
    // play 16-bit mono samples (TS: an <audio> element playing a WAV blob)
    virtual void playAudio(const std::vector<short> &, int) {}
    // let the user save a file (the audio output's last played WAV)
    virtual void saveFile(const std::vector<unsigned char> &, const std::string &) {}
    // ask the user for an audio file and decode its first channel; false if there's none
    // (the headless tools can't).  name is the file name without its extension.
    virtual bool loadAudioFile(std::string &, std::vector<float> &, int &) { return false; }
    // ask the user for a text file and read it; false if there's none (the headless tools
    // can't).  name is the file name with its extension.
    virtual bool loadTextFile(std::string &, std::string &) { return false; }
    virtual void addSlider(Scrollbar *) {}
    virtual void removeSlider(Scrollbar *) {}
    virtual void updateSlider(Scrollbar *) {}
    virtual void repaint() {}

    // circuit-to-screen transform, like canvas setTransform(a,b,c,d,e,f); set by the UI
    double transform[6] = {1, 0, 0, 1, 0, 0};
    // circuit coordinates to screen (MouseManager.transformX/Y in the TS version)
    int transformX(double x) const { return (int) std::floor(x * transform[0] + transform[4]); }
    int transformY(double y) const { return (int) std::floor(y * transform[3] + transform[5]); }

    // the scopes (null in the headless tools)
    ScopeManager *scopeManager = nullptr;

    // drawing area, set by the UI each frame.  circuitArea is the part above the scopes.
    Rectangle circuitArea;
    int canvasWidth = 0, canvasHeight = 0;
    static constexpr int infoWidth = 160;
    // the circuit area changed size (e.g. scopes were added)
    virtual void setCircuitArea() {}

    // mouse/UI state that elements look at while drawing (MouseManager in the TS version)
    double mouseCursorX = -1, mouseCursorY = -1;
    static constexpr int MODE_ADD_ELM = 0;
    static constexpr int MODE_DRAG_ALL = 1;
    static constexpr int MODE_DRAG_ROW = 2;
    static constexpr int MODE_DRAG_COLUMN = 3;
    static constexpr int MODE_DRAG_SELECTED = 4;
    static constexpr int MODE_DRAG_POST = 5;
    static constexpr int MODE_SELECT = 6;
    static constexpr int MODE_DRAG_SPLITTER = 7;
    static constexpr int MODE_DRAG_REROUTE = 8;
    int mouseMode = MODE_SELECT;
    CircuitElm *dragElm = nullptr;
    CircuitNode *highlightedNode = nullptr;
    std::unordered_set<CircuitElm *> scopePlotRoles;

    // state of the Options menu checkboxes that elements look at
    struct Options {
        bool showValues = true;
        bool power = false;
        bool euroResistor = false;
        bool showOhm = true;
        bool smallGrid = false;
        bool volts = true;
        bool dots = true;
        bool euroGates = false;
        bool conventionalCurrent = true;
        bool printable = false;
    } options;

    virtual void setStopElm(CircuitElm *ce, const std::optional<std::string> &msg) {
        stopElm = ce;
        stopMessage = msg;
    }
    virtual void setSimRunning(bool s) { simRunning = s; }
    bool simIsRunning() const { return simRunning; }

    // simulation speed, from the speed slider
    virtual double getIterCount() {
        if (speedBarValue == 0)
            return 0;
        return .1 * jsmath::exp((speedBarValue - 61) / 24.);
    }

    // called when the grid size option changes
    void setGrid() { gridSize = options.smallGrid ? 8 : 16; }

    // scopes can ask us to calculate wire currents once per frame instead of every step
    virtual bool canDelayWireProcessing();

    virtual void onTimeStep();
    virtual void callAnalyzeHook() {}
    // an element is being deleted (close any dialog editing it, drop its scope plots, etc.)
    virtual void elementDeleted(CircuitElm *ce);
    // ask the user a yes/no question (window.confirm in the TS version); headless: no
    virtual bool confirm(const std::string &) { return false; }
    // tell the user something (TS: window.alert())
    virtual void alert(const std::string &) {}
    // an element changed its edit fields; rebuild the edit dialog if it's showing
    virtual void resetEditDialog() {}

    // wall clock in milliseconds (like Date.now()); the headless tools freeze this
    virtual double currentTimeMillis() {
        using namespace std::chrono;
        return (double) duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
    }

    virtual double randomDouble() { return dist(rng); }
    virtual int randomInt() { return (int) (randomDouble() * 2147483647); }

    bool isPrintable() const { return options.printable; }
    Color getBackgroundColor() const { return isPrintable() ? Color::white : Color::black; }
    bool modalDialogIsShowing() const { return false; }  // TODO
    CircuitElm *getElm(int n) const { return n >= 0 && n < (int) elmList.size() ? elmList[n] : nullptr; }
    int locateElm(const CircuitElm *elm) const {
        for (size_t i = 0; i != elmList.size(); i++)
            if (elm == elmList[i])
                return (int) i;
        return -1;
    }

    int getrand(int x) {
        int q = randomInt();
        if (q < 0)
            q = -q;
        return q % x;
    }

    int snapGrid(int x) const { return (x + gridSize / 2 - 1) & ~(gridSize - 1); }

    // the extent of the circuit being displayed (TS: UIManager.getCircuitBounds())
    std::optional<Rectangle> getCircuitBounds();

    // free all elements
    void deleteAllElms();
    // tell every element to re-fetch its model (after a model is edited)
    void updateModels();
    // open an edit dialog for a model (the custom logic chip's Edit Model button)
    virtual void doEditModel(class Editable *) {}

    // is anything selected?
    bool isSelection() const;
    virtual void closeEditDialog() {}

    // the subcircuit UI (the Qt app implements these)
    // show a subcircuit's components (UIManager.pushSubcircuit()); allElms is its display list
    virtual void pushSubcircuit(CircuitElm *cce, const std::vector<CircuitElm *> &allElms) {}
    // leave the subcircuit view (UIManager.subcircuitStack is cleared when a circuit is loaded)
    virtual void resetSubcircuitView() {}
    // open the pin layout editor for a model (EditSubcircuitModelDialog)
    virtual void editSubcircuitPinLayout(const std::shared_ptr<class SubcircuitModel> &) {}
    // save the circuit and start editing a model's circuit in its place (CirSim.pushContext())
    virtual void pushContext(const std::string &modelName) {}
    // are we editing a model's circuit?
    virtual bool isEditingContext() { return false; }
    virtual void readCircuit(const std::string &text, int flags = 0) {}
    // replace the circuit with the elements in doc (CircuitXMLDeserializer.readCircuitFromDoc())
    virtual void readCircuitFromDoc(const class XmlElement *doc) {}

private:
    std::mt19937_64 rng{std::random_device{}()};
    std::uniform_real_distribution<double> dist{0.0, 1.0};
};
