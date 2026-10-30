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

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "Rectangle.h"
#include "ScopeConstants.h"
#include "ScopePlot.h"
#include "ScopeFFT.h"
#include "ScopePlot2d.h"
#include "ScopeTrigger.h"

class CircuitElm;
class CircuitXMLDeserializer;
class Graphics;
class SimApp;
class SimulationManager;
class StringTokenizer;
class XmlElement;
class ScopeOverlays;
class ScopeSerializer;

class Scope {
public:
    int scopePointCount = 128;
    int position;
    // speed is sim timestep units per pixel
    int speed = 64;
    std::optional<std::string> text;
    Rectangle rect;
    bool manualScale = false;
    bool showI = false;
    bool showV = false;
    bool showScale = false;
    bool showMax = true;
    bool showMin = false;
    bool showP2P = false;
    bool showFreq = false;
    ScopePlot2d plot2d;
    ScopeFFT fftPlot;
    std::unique_ptr<ScopeOverlays> overlays;
    std::unique_ptr<ScopeSerializer> serializer;
    bool maxScale = false;

    bool showNegative = false;
    bool showRMS = false;
    bool showAverage = false;
    bool showDutyCycle = false;
    bool showElmInfo = false;
    std::vector<std::unique_ptr<ScopePlot>> plots;
    std::vector<ScopePlot *> visiblePlots;
    SimApp *app;
    SimulationManager *sim;
    // scopeTimeStep to check if sim timestep has changed from previous value when redrawing
    double scopeTimeStep = 0;
    // Max value to scale the display to show - indexed for each value of UNITS - e.g. UNITS_V, UNITS_A etc.
    double scale[ScopeConstants::UNITS_COUNT] = {};
    bool reduceRange[ScopeConstants::UNITS_COUNT] = {};
    double wheelDeltaY = 0;
    int selectedPlot = -1;
    std::string curColor;
    std::string voltColor;
    double gridStepX = 0;
    double gridStepY = 0;
    double maxValue = 0;
    double minValue = 0;
    int manDivisions;  // Number of vertical divisions when in manual mode
    static int lastManDivisions;
    bool drawGridLines = true;
    bool somethingSelected = false;
    bool exporting = false;  // drawing for PNG/SVG export; ignore mouse/menu selection

    ScopeTrigger trigger;

    static double cursorTime;
    static double dragStartTime;
    static int cursorUnits;
    static Scope *cursorScope;
    static Scope *draggingPlotYScope;
    bool draggingPlotY = false;
    // the drag started on the trigger level line, so it moves that instead of the plot
    bool draggingTriggerLevel = false;
    double dragPlotYMouseStart = 0;
    int dragPlotYInitialPosition = 0;

    Scope(SimApp *app_, SimulationManager *sim_);
    ~Scope();

    void showCurrent(bool b);
    void showVoltage(bool b);
    // check if any plot has the given value (unlike showingValue which checks ALL plots)
    bool hasPlotValue(int v) const;
    void showPlotValue(int val, bool b);
    // Transistor values (Ib/Ic/Ie, Vbe/Vbc/Vce).  In an X/Y or V-vs-I plot they act as two
    // radio groups, one current and one voltage: picking one replaces the other in the same
    // plot slot, so the X/Y axis assignment is kept.  Time plots can still show any mix.
    void showTransistorValue(int val, bool state);
    void showCharge(bool b) { showPlotValue(ScopeConstants::VAL_CHARGE, b); }
    void showPower(bool b) { showPlotValue(ScopeConstants::VAL_POWER, b); }
    void showMaxF(bool b) { showMax = b; }
    void showScaleF(bool b) { showScale = b; }
    void showMinF(bool b) { showMin = b; }
    void showP2PF(bool b) { showP2P = b; }
    void showFreqF(bool b) { showFreq = b; }
    void setManualScale(bool value, bool roundup);
    void resetGraph(bool full = false) { resetGraphFull(full); }
    void resetGraphFull(bool full);
    void setManualScaleValue(int plotId, double d);
    double getScaleValue() const;
    std::string getScaleUnitsText() const;
    static std::string getScaleUnitsTextStatic(int units);
    void setManDivisions(int d) { manDivisions = lastManDivisions = d; }
    bool active() const { return !plots.empty() && plots[0]->elm != nullptr; }
    bool isTriggered() const { return trigger.isTriggered(); }
    int displayStartIndex(const ScopePlot &plot, int w) const { return trigger.displayStartIndex(plot, w, scopePointCount); }
    int validDataCount(const ScopePlot &plot, int ipa, int w) const { return trigger.validDataCount(plot, ipa, w, scopePointCount); }
    void checkTrigger();
    void setTriggerMode(int mode);
    ScopePlot *triggerSourcePlot() const { return trigger.sourcePlot(plots, visiblePlots); }
    void drawTriggerIndicator(Graphics &g, bool forExport);
    bool cursorNearTriggerLevel() const;
    void initialize();
    void calcVisiblePlots();
    void setRect(const Rectangle &r);
    double getWidth() const { return rect.width; }
    double rightEdge() const { return rect.x + rect.width; }
    void setElm(CircuitElm *ce);
    void addElm(CircuitElm *ce);
    void setValueNum(int val);
    void addValue(int val, CircuitElm *ce);
    void setValue(int val, CircuitElm *ce);
    void setValue(int val) { setValueNum(val); }
    void setValues(int val, int ival, CircuitElm *ce, CircuitElm *yelm);
    void setText(const std::string &s) { text = s; }
    const std::optional<std::string> &getText() const { return text; }
    bool showingValue(int v) const;
    // returns true if we have a plot of voltage and nothing else (except current or charge).
    bool showingVoltageAndMaybeCurrent() const;
    void combine(Scope &s);
    // separate this scope's plots into separate scopes and return them in arr[pos], arr[pos+1], etc.  return new length of array.
    int separate(std::vector<std::unique_ptr<Scope>> &arr, int pos);
    void removePlot(int plot);
    // called for each timestep
    void timeStep();
    void setMaxScale(bool s);
    void maxScaleToggle();
    void drawSettingsWheel(Graphics &g);
    bool showSettingsWheel() const { return rect.height > 100 && rect.width > 100; }
    bool cursorInSettingsWheel() const;
    // does another scope have something selected?
    void checkForSelectionElsewhere();
    void draw(Graphics &g) { drawImpl(g, false); }
    // the visible plots' data as CSV, or "" if there are none (TS: exportCSV(), minus the download)
    std::string getCSV() const;
    // draws this scope at (0,0) of g, sized to its own rect, with a solid (or transparent)
    // background and no mouse-driven UI chrome -- shared by the PNG and SVG exports
    void drawForExport(Graphics &g, bool transparent);
    // calculate maximum and minimum values for all plots of given units
    void calcMaxAndMin(int units);
    // adjust scale of a plot
    void calcPlotScale(ScopePlot &plot);
    double calcGridStepX() const;
    double getGridMaxFromManScale(const ScopePlot &plot) const;
    // Compute grid display parameters for a plot. Sets plot.plotOffset, plot.gridMult,
    // and gridStepY as side-effects; returns gridMid for use by callers.
    double calcGridParams(ScopePlot &plot, bool allPlotsSameUnits);
    void drawHVGridLines(Graphics &g, ScopePlot &plot, double gridMid, bool allPlotsSameUnits, bool allSelected);
    void drawPlot(Graphics &g, ScopePlot &plot, bool allPlotsSameUnits, bool selected, bool allSelected);
    static void clearCursorInfo() { cursorScope = nullptr; cursorTime = -1; }
    double mouseXToTime(double mouseX) const;
    void selectScope(double mouseX, double mouseY);
    void mousePressed(double mouseX, double mouseY);
    // find selected plot
    void checkForSelection(double mouseX, double mouseY);
    int timeToX(double t) const;
    // draw a dot on the selected plot at pixel x; return the plot value there, or NaN if out of range
    double drawPlotDot(Graphics &g, ScopePlot &plot, int x);
    void drawCursor(Graphics &g);
    void drawCursorInfo(Graphics &g, const std::vector<std::string> *info, int ct, double x, bool drawY);
    bool canShowRMS() const;
    void drawInfoText(Graphics &g, const std::string &text);
    std::optional<std::string> getScopeText();
    std::string getScopeLabelOrText(bool forInfo = false);
    void setSpeed(int sp);
    void saveAsDefault();
    void speedUp();
    void slowDown();
    void setPlotPosition(int plot, int v) { visiblePlots[plot]->manVPosition = v; }
    // start dragging the trigger level line if the mouse is on it, otherwise the currently
    // selected plot up/down (manual scale mode only)
    bool startDragPlotY(double mouseX, double mouseY);
    void dragPlotY(double mouseY);
    static void endDragPlotY();
    // get scope element, returning null if there's more than one
    CircuitElm *getSingleElm() const;
    bool canMenu() const { return !plots.empty() && plots[0]->elm != nullptr; }
    bool canShowResistance() const;
    bool isShowingVceAndIc() const;
    void dumpXml(XmlElement *root);
    void undumpXml(CircuitXMLDeserializer &xml);
    void undump(StringTokenizer &st);
    void handleMenu(const std::string &mi, bool state);
    void selectY();
    // wheel delta normalized like ScrollValuePopup.normalizeWheelDelta()
    void onMouseWheel(double normalizedDelta, double wheelSensitivity);
    CircuitElm *getElm() const;
    bool showingElm(const CircuitElm *e) const;
    bool viewingWire() const;
    // Populate roles with all elements involved in this scope's display
    // Populate roles map with all elements involved in this scope's display.
    // In XY mode each element is labelled by its axis role; in normal mode all
    // visible plot elements get an empty label (highlighted but unlabelled).
    void addScopePlotRoles(std::unordered_map<CircuitElm *, std::string> &roles) const;
    void addPlotRole(std::unordered_map<CircuitElm *, std::string> &roles, int idx, const std::string &role) const;
    static void addElmRole(std::unordered_map<CircuitElm *, std::string> &roles, CircuitElm *elm, const std::string &role);
    bool needToRemove();
    // drop plots of an element that's being deleted
    void elementDeleted(const CircuitElm *ce);
    bool isManualScale() const { return manualScale; }
    double getManScaleFromMaxScale(int units, bool roundUp) const;
    static double nextHighestScale(double d);

private:
    void drawImpl(Graphics &g, bool forExport);
    // keep the plots in newOrder (taking ownership from wherever they are) and drop the rest
    void setPlotsTo(const std::vector<ScopePlot *> &newOrder, std::vector<std::unique_ptr<ScopePlot>> *other);
};
