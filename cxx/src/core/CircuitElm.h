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

#include <cmath>
#include <optional>
#include <string>
#include <vector>

#include "CircuitNode.h"
#include "EditInfo.h"
#include "Color.h"
#include "Font.h"
#include "NumberFormat.h"
#include "Point.h"
#include "Polygon.h"
#include "Rectangle.h"
#include "VoltageSource.h"

class Graphics;
class SimApp;
class SimulationManager;
class StringTokenizer;
class XmlElement;
class CircuitXMLDeserializer;
struct WireSegment;
class WireRouter;

// every concrete element class puts this in its body; it stands in for constructor.name
#define ELM_CLASS(name) \
    std::string getClassName() const override { return #name; }

// circuit element class
class CircuitElm : public Editable {
public:
    static double voltageRange;
    static constexpr int colorScaleCount = 201;  // odd so ground = gray
    static std::vector<Color> colorScale;
    static double currentMult;
    static double powerMult;

    // scratch points for convenience
    static Point ps1, ps2;

    static Color whiteColor, lightGrayColor, selectColor, positiveColor, negativeColor,
        neutralColor, currentColor;
    static Font unitsFont, valueFont;
    static int valueFontSize;
    static NumberFormat showFormat, shortFormat, fixedFormat;
    static int decimalDigits, shortDecimalDigits;
    static constexpr double pi = 3.14159265358979323846;
    static SimApp *app;
    static SimulationManager *sim;
    static CircuitElm *mouseElmRef;

    static constexpr int SCALE_AUTO = 0;
    static constexpr int SCALE_1 = 1;
    static constexpr int SCALE_M = 2;
    static constexpr int SCALE_MU = 3;

    // initial point where user created element.  For simple two-terminal elements, this is the first node/post.
    int x, y;
    // point to which user dragged out element.  For simple two-terminal elements, this is the second node/post
    int x2, y2;

    int flags;
    VoltageSource *voltSource = nullptr;
    std::vector<NodeRef> nodes;

    // length along x and y axes, and sign of difference
    int dx = 0, dy = 0, dsign = 0;

    int lastHandleGrabbed = -1;

    // length of element
    double dn = 0;
    double dpx1 = 0, dpy1 = 0;

    // (x,y) and (x2,y2) as Point objects
    Point point1, point2;

    // lead points (ends of wire stubs for simple two-terminal elements)
    Point lead1, lead2;
    // the TS version's lead1/lead2 start out null; this says calcLeads() has set them
    // (elements that set both leads some other way should set it too)
    bool leadsSet = false;

    double current = 0;
    double curcount = 0;
    Rectangle boundingBox;

    // if subclasses set this to true, element will be horizontal or vertical only
    bool noDiagonal = false;
    bool selected = false;

    // the CompositeElm (subcircuit chip) this element is a child of, if any
    CircuitElm *parent = nullptr;

    // create new element with one post at xx,yy, to be dragged out by user
    CircuitElm(int xx, int yy);
    // create element between xa,ya and xb,yb from undump
    CircuitElm(int xa, int ya, int xb, int yb, int f);
    virtual ~CircuitElm() = default;

    CircuitElm(const CircuitElm &) = delete;
    CircuitElm &operator=(const CircuitElm &) = delete;

    static void initClass(SimApp *app_, SimulationManager *sim_);
    static void setValueFontSize(int size);
    static void setDecimalDigits(int num, bool sf, bool save);
    static void setColorScale();

    virtual std::string getClassName() const = 0;
    virtual int getDumpType() { return 0; }
    virtual std::string getXmlDumpType();
    // class name to register this element's dump type under (DCVoltageElm uses VoltageElm's)
    virtual std::string getDumpClassName() const { return getClassName(); }
    virtual int getDefaultFlags() { return 0; }
    bool hasFlag(int f) const { return (flags & f) != 0; }

    virtual void initBoundingBox();

    // allocate nodes array we need.  The C++ constructors can't dispatch getNodeCount() to
    // the subclass, so ElementFactory calls this again once construction is finished.
    virtual void allocNodes();

    // Called by ElementFactory once the object is fully constructed, with the dump's
    // remaining tokens (st is null for a new element).  It stands in for the parts of TS
    // constructors that call subclass overrides (ChipElm calls setupPins(), for example),
    // which a C++ base constructor can't do.  The default just calls allocNodes().
    virtual void postConstruct(StringTokenizer *st) { allocNodes(); }

    // handle reset button
    virtual void reset() { curcount = 0; }

    // override this in elements that use highVoltage (gates, chips, inverters, etc.)
    virtual void setHighVoltage(double) {}

    // set current for voltage source vn to c.  vn will be the same value as in a previous call to setVoltageSource(n, vn)
    virtual void setCurrent(VoltageSource *vs, double c) { current = c; }

    // set current for wire-like elements (called from calcWireCurrents, one call per bit for bus wires)
    virtual void setWireCurrent(int bit, double c) { current = c; }

    // get current for one- or two-terminal elements
    virtual double getCurrent() { return current; }

    virtual void setParentList(std::vector<CircuitElm *> &) {}
    // add this element as an obstacle to the wire router grid
    virtual void addRoutingObstacle(WireRouter &router);
    void addRoutingObstacleWithLeads(WireRouter &router, double width);
    virtual std::vector<CircuitElm *> *getChildElmList() { return nullptr; }

    // called before makeNodeList to allow elements to set up internal node counts, etc.
    virtual void preStamp() {}

    // stamp matrix values for linear elements.
    // for non-linear elements, use this to stamp values that don't change each iteration, and call stampRightSide() or stampNonLinear() as needed
    virtual void stamp() {}

    // stamp matrix values for non-linear elements
    virtual void doStep() {}

    virtual void deleteElm();

    virtual void startIteration() {}

    // get voltage of x'th node
    virtual double getPostVoltage(int n) { return nodes[n]->v; }

    // calculate current in response to node voltages changing
    virtual void calculateCurrent() {}

    // calculate post locations and other convenience values used for drawing.  Called when element is moved
    virtual void setPoints();

    // calculate lead points for an element of length len.  Handy for simple two-terminal elements.
    void calcLeads(int len);

    // adjust leads so that the point exactly between them is a grid point (so we can place a terminal there)
    // Returns which post (0 or 1) has a lead stub containing (px, py), or -1 if neither.
    int getLeadPost(int px, int py);
    void adjustLeadsToGrid(bool flipX, bool flipY);

    // calculate point fraction f between a and b, linearly interpolated
    Point interpPoint(const Point &a, const Point &b, double f);
    void interpPoint(const Point &a, const Point &b, Point &c, double f);
    // point fraction f along the line between a and b and offset perpendicular by g
    void interpPoint(const Point &a, const Point &b, Point &c, double f, double g);
    Point interpPoint(const Point &a, const Point &b, double f, double g);
    // two points fraction f along the line between a and b and offset perpendicular by +/-g
    void interpPoint2(const Point &a, const Point &b, Point &c, Point &d, double f, double g);

    std::vector<Point> newPointArray(int n) { return std::vector<Point>(n); }

    int snapGrid(int z);

    // draw second point to xx, yy
    virtual void drag(int xx, int yy);
    virtual int getDragLength() { return 64; }
    virtual bool getDragVertical(bool requestedVertical) { return requestedVertical; }
    virtual void dragPlace(int xa, int ya, bool vertical);
    void swapDragEndpoints();

    virtual void move(int dx, int dy);
    virtual bool creationFailed() { return x == x2 && y == y2; }
    virtual void setPosition(int x_, int y_, int x2_, int y2_);
    void setPositionFromXml(const XmlElement *elem);
    bool allowMove(int dx, int dy);
    virtual void movePoint(int n, int dx, int dy);
    virtual void flipX(int center2, int count);
    virtual void flipY(int center2, int count);
    virtual void flipXY(int xmy, int count);

    virtual int getNumHandles() { return getPostCount(); }

    // ---- drawing ----
    static constexpr int CURRENT_TOO_FAST = 100;
    virtual void draw(Graphics &g) {}
    void draw2Leads(Graphics &g);
    // draw current dots from point a to b
    void drawDots(Graphics &g, const Point &pa, const Point &pb, double pos);
    double addCurCount(double c, double a);
    Polygon calcArrow(const Point &a, const Point &b, double al, double aw);
    Polygon createPolygon(const Point &a, const Point &b, const Point &c);
    Polygon createPolygon(const Point &a, const Point &b, const Point &c, const Point &d);
    Polygon createPolygon(const std::vector<Point> &a);
    void drawPosts(Graphics &g);
    void drawScopeTerminalLabels(Graphics &g);
    virtual void drawHandles(Graphics &g, const Color &c);
    int getHandleGrabbedClose(int xtest, int ytest, int deltaSq, int minSize);
    static void drawPost(Graphics &g, const Point &pt);
    void drawCenteredText(Graphics &g, const std::string &s, double x, double y, bool cx);
    // draw component values (number of resistor ohms, etc).  hs = offset
    void drawValues(Graphics &g, const std::string &s, double hs);
    virtual void drawLabeledNode(Graphics &g, std::string str, const Point &pt1, const Point &pt2);
    void drawCoil(Graphics &g, double hs, const Point &p1, const Point &p2, double v1, double v2);
    static void drawThickLine(Graphics &g, double x, double y, double x2, double y2);
    static void drawThickLine(Graphics &g, const Point &pa, const Point &pb, double width = 3);
    static void drawThickPolygon(Graphics &g, const std::vector<int> &xs, const std::vector<int> &ys, int c);
    static void drawThickPolygon(Graphics &g, const Polygon &p);
    static void drawPolygon(Graphics &g, const Polygon &p);
    static void drawThickCircle(Graphics &g, double cx, double cy, double ri);
    Polygon getSchmittPolygon(double gsize, double ctr);
    // update dot positions (curcount) for drawing current (simple case for single current)
    void updateDotCount() { curcount = updateDotCount(current, curcount); }
    // update dot positions (curcount) for drawing current (general case for multiple currents)
    double updateDotCount(double cur, double cc);
    // update and draw current for simple two-terminal element
    void doDots(Graphics &g);
    Color getVoltageColor(Graphics &g, double volts);
    void setVoltageColor(Graphics &g, double volts);
    // yellow argument is unused, can't remember why it was there
    void setPowerColor(Graphics &g, bool yellow);
    void setPowerColor(Graphics &g, double w0);
    void setConductanceColor(Graphics &g, double w0);
    bool needsHighlight();
    bool isOnHighlightedNet();
    bool isCreating();

    // ---- info text ----
    static std::string getVoltageDText(double v) { return getUnitText(std::abs(v), "V"); }
    static std::string getVoltageText(double v) { return getUnitText(v, "V"); }
    static std::string getTimeText(double v);
    static std::string format(double v, bool sf);
    static std::string getUnitText(double v, const std::string &u) { return getUnitTextImpl(v, u, false); }
    static std::string getShortUnitText(double v, const std::string &u) { return getUnitTextImpl(v, u, true); }
    static std::string getCurrentText(double i) { return getUnitText(i, "A"); }
    static std::string getCurrentDText(double i) { return getUnitText(std::abs(i), "A"); }
    static std::string getUnitTextWithScale(double val, const std::string &utext, int scale, bool fixed = false);
    // get component info for display in lower right
    virtual void getInfo(std::vector<std::string> &arr) {}
    // get element type name for edit dialog title.  override if getInfo()[0] includes dynamic state.
    virtual std::string getElmType();
    int getBasicInfo(std::vector<std::string> &arr);
    virtual std::string getScopeText(int v);

    // number of voltage sources this element needs
    virtual int getVoltageSourceCount() { return 0; }

    // number of internal nodes (nodes not visible in UI that are needed for implementation)
    virtual int getInternalNodeCount() { return 0; }

    // number of nodes this element references by name (v(label)/i(meter) in an expression)
    // but is not wired to.  they are appended to nodes[] after the posts and internal nodes,
    // two per reference.  they exist so that calculateClosures() pulls the referenced node
    // into the same matrix.  they carry no current and aren't drawn.
    virtual int getRefNodeCount() { return 0; }

    // resolve the names our expression refers to, filling in our reference nodes
    virtual void resolveExprRefs(std::vector<CircuitElm *> &) {}

    // the name by which an expression can refer to this element, or empty if it has none
    virtual std::optional<std::string> getExprRefName() { return std::nullopt; }

    // index in nodes[] where our reference nodes start, after the posts and internal nodes
    int getRefNodeBase() { return getPostCount() + getInternalNodeCount(); }

    // is node index n one of our reference nodes (rather than a post or internal node)?
    bool isRefNode(int n) { return n >= getRefNodeBase(); }

    virtual int getNodeCount() { return getPostCount() + getInternalNodeCount() + getRefNodeCount(); }

    // notify this element that its pth node is n.
    virtual void setNode(int p, const NodeRef &n);

    // notify this element that its nth voltage source is v
    virtual void setVoltageSource(int n, VoltageSource *v) { voltSource = v; }

    virtual double getVoltageDiff() { return nodes[0]->v - nodes[1]->v; }

    virtual bool nonLinear() { return false; }
    virtual int getPostCount() { return 2; }
    virtual int getPostWidth(int) { return 1; }
    virtual int getBusWidth() { return 1; }

    // generate WireSegment entries for this wire-like element (called during calculateWireClosureForList)
    virtual void getWireSegments(std::vector<std::unique_ptr<WireSegment>> &list);

    // get CircuitNode for nth node
    const NodeRef &getNode(int n) { return nodes[n]; }

    // get position of nth node
    virtual Point getPost(int n) { return (n == 0) ? point1 : point2; }

    // return the post that post n connects through to (for wires, so we can optimize them
    // out in calculateWireClosure()); nullopt if none
    virtual std::optional<Point> getConnectedPost(int n) { return point2; }

    int getNodeAtPoint(const Point &pt);

    // set/adjust bounding box used for selecting elements
    void setBbox(double x1, double y1, double x2, double y2);
    // set bounding box for an element from p1 to p2 with width w
    void setBbox(const Point &p1, const Point &p2, double w);
    // enlarge bbox to contain an additional rectangle
    void adjustBbox(double x1, double y1, double x2, double y2);
    void adjustBbox(const Point &p1, const Point &p2) { adjustBbox(p1.x, p1.y, p2.x, p2.y); }

    // needed for calculating circuit bounds (need to special-case centered text elements)
    virtual bool isCenteredText() { return false; }

    virtual void doAdjust() {}
    virtual void setupAdjust() {}

    virtual double getPower() { return getVoltageDiff() * current; }

    virtual double getScopeValue(int x);
    virtual int getScopeUnits(int x);
    virtual bool canShowValueInScope(int) { return false; }

    // are n1 and n2 connected by this element?  this is used to determine
    // unconnected nodes, and look for loops
    virtual bool getConnection(int n1, int n2) { return true; }

    // are n1 and n2 in the same matrix?  by default same as getConnection(), but
    // can be overridden for elements like MOSFETs where the gate affects drain/source
    // but isn't electrically connected.  n1 and n2 may be internal nodes.
    virtual bool getMatrixConnection(int n1, int n2) { return getConnection(n1, n2); }

    // is n1 connected to ground somehow?
    virtual bool hasGroundConnection(int n1) { return false; }

    // is this a wire or equivalent to a wire?  (used for circuit validation)
    virtual bool isWireEquivalent() { return false; }

    // is this a wire we can remove?
    virtual bool isRemovableWire() { return false; }

    virtual bool isIdealCapacitor() { return false; }
    virtual bool isExtVoltageElm() { return false; }
    virtual bool isVoltageElm() { return false; }
    virtual bool isBatteryElm() { return false; }
    virtual bool isRailElm() { return false; }
    virtual bool isSweepElm() { return false; }
    virtual bool isCurrentElm() { return false; }
    virtual bool isGroundElm() { return false; }
    virtual bool isInductorElm() { return false; }

    virtual bool canViewInScope() { return getPostCount() <= 2; }
    virtual bool canFlipX() { return true; }
    virtual bool canFlipY() { return true; }
    virtual bool canFlipXY() { return canFlipX() || canFlipY(); }

    bool comparePair(int x1, int x2, int y1, int y2) {
        return ((x1 == y1 && x2 == y2) || (x1 == y2 && x2 == y1));
    }

    bool isSelected() { return selected; }
    virtual void setSelected(bool x) { selected = x; }
    virtual void selectRect(const Rectangle &r, bool add);

    static int sign(double x) { return (x < 0) ? -1 : (x == 0) ? 0 : 1; }
    static double distance(const Point &p1, const Point &p2);

    Rectangle &getBoundingBox() { return boundingBox; }
    virtual int getShortcut() { return 0; }
    bool needsShortcut() { return getShortcut() > 0; }
    bool showValues();
    bool showPower();
    bool showEuroResistors();
    bool showOhmSymbol();
    bool useSmallGrid();
    bool doDcAnalysis();

    virtual bool isWireElm() { return false; }
    virtual bool isLabeledNodeElm() { return false; }
    virtual bool isBusSplitterElm() { return false; }
    virtual bool isScopeElm() { return false; }
    virtual bool isGraphicElm() { return false; }
    virtual bool isRoutedWireElm() { return false; }
    virtual bool isSwitchElm() { return false; }
    // whether to automatically bring up the property editor when this element is created
    // (overridden to false for elements whose settings are rarely changed on creation)
    virtual bool showPropertiesOnCreate() { return hasProperties(); }
    // whether this element has any editable properties
    bool hasProperties() { return getEditInfo(0).has_value(); }
    virtual bool isLogicInputElm() { return false; }
    virtual bool isVarRailElm() { return false; }
    virtual bool isPotElm() { return false; }
    virtual bool isResistorElm() { return false; }
    virtual bool isCapacitorElm() { return false; }
    virtual bool isSubcircuitElm() { return false; }
    virtual bool isTransistorElm() { return false; }
    virtual bool isMosfetElm() { return false; }
    virtual bool isJfetElm() { return false; }
    virtual bool isOutputElm() { return false; }
    virtual bool isLogicOutputElm() { return false; }
    virtual bool isAudioOutputElm() { return false; }
    virtual bool isTestPointElm() { return false; }
    virtual bool isProbeElm() { return false; }

    virtual bool validate() { return true; }
    bool validateRailNode(int n);

    virtual void setMouseElm(bool v);
    bool isMouseElm() { return mouseElmRef == this; }
    // the mouse wheel moved over this element (normalizedDelta as from
    // ScrollValuePopup::normalizeWheelDelta()); returns false if the element doesn't use it
    virtual bool onMouseWheel(double normalizedDelta) { return false; }
    virtual void draggingDone() {}

    double lineDistanceSq(double xa, double ya, double xb, double yb, double gx, double gy);
    virtual double getMouseDistance(int gx, int gy);

    virtual void updateModels() {}
    virtual void stepFinished() {}

    // get current flowing into node n out of this element
    virtual double getCurrentIntoNode(int n);

    virtual void flipPosts();

    virtual void dumpXml(XmlElement *doc, XmlElement *elem);
    virtual void undumpXml(CircuitXMLDeserializer &xml);
    virtual void dumpXmlState(XmlElement *, XmlElement *) {}
    // dump the models this element uses (subcircuits dump their children's models first)
    virtual void dumpXmlModel(XmlElement *) {}

    static std::string getUnitTextImpl(double v, const std::string &u, bool sf);

    // Returns true if (px,py) lies strictly inside the axis-aligned segment (ax,ay)-(bx,by).
    static bool pointOnSegmentInterior(int ax, int ay, int bx, int by, int px, int py);
};
