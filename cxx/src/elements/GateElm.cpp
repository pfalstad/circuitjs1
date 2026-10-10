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

#include "GateElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

double GateElm::lastHighVoltage = 5;
bool GateElm::lastSchmitt = false;

GateElm::GateElm(int xx, int yy) : CircuitElm(xx, yy) {
    noDiagonal = true;
    inputCount = 2;
    allocNodes();
    setupVolts();
    highVoltage = lastHighVoltage;
    if (lastSchmitt)
        flags |= FLAG_SCHMITT;
    setSize(useSmallGrid() ? 1 : 2);
}

GateElm::GateElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    inputCount = parseIntStrict(st.nextToken());
    double lastOutputVoltage = parseFloatStrict(st.nextToken());
    noDiagonal = true;
    highVoltage = 5;
    try {
        highVoltage = parseFloatStrict(st.nextToken());
    } catch (...) {}
    lastOutput = lastOutputVoltage > highVoltage * .5;
    setSize((f & FLAG_SMALL) != 0 ? 1 : 2);
    allocNodes();
    setupVolts();
}

void GateElm::setSize(int s) {
    gsize = s;
    gwidth = 7 * s;
    gwidth2 = 14 * s;
    gheight = 8 * s;
    flags &= ~FLAG_SMALL;
    flags |= (s == 1) ? FLAG_SMALL : 0;
}

void GateElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    if (highVoltage != 5)
        CircuitXMLSerializer::dumpAttr(elem, "hi", highVoltage);
    if (inputCount != 2)
        CircuitXMLSerializer::dumpAttr(elem, "in", inputCount);
    if (propagationDelay != 0)
        CircuitXMLSerializer::dumpAttr(elem, "pd", propagationDelay);
}

void GateElm::dumpXmlState(XmlElement *, XmlElement *elem) {
    if (nodes[inputCount]->v != 0)
        CircuitXMLSerializer::dumpAttr(elem, "o", nodes[inputCount]->v);
}

void GateElm::undumpXml(CircuitXMLDeserializer &xml) {
    // "ix" is present on state-restore calls (from CompositeElm.dumpXmlState/undumpXml).
    // In that case this element already exists with correct flags (set up when the
    // containing model was loaded), and the state element has no "f" attribute, so
    // zeroing flags here would wipe FLAG_SCHMITT/FLAG_INVERT_INPUTS/FLAG_SMALL instead
    // of restoring them.
    bool stateRestore = xml.parseStringAttr("ix", std::nullopt).has_value();
    if (!stateRestore)
        flags = 0;  // SMALL might have gotten set
    CircuitElm::undumpXml(xml);
    highVoltage = xml.parseDoubleAttr("hi", highVoltage);
    inputCount = xml.parseIntAttr("in", inputCount);
    propagationDelay = xml.parseDoubleAttr("pd", propagationDelay);
    double lastOutputVoltage = xml.parseDoubleAttr("o", 0);
    lastOutput = lastOutputVoltage > highVoltage * .5;
    setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
    allocNodes();
    setupVolts();
}

std::string GateElm::getXmlDumpType() {
    std::string s = getClassName();
    size_t p = s.find("GateElm");
    if (p != std::string::npos)
        s.erase(p, 7);
    return s;
}

void GateElm::setPoints() {
    CircuitElm::setPoints();
    inputStates.assign(inputCount, false);
    if (dn > 150 && isCreating())
        setSize(2);
    int hs = gheight;
    ww = gwidth2;
    if (ww > dn / 2)
        ww = (int) std::trunc(dn / 2);
    if (isInverting() && ww + 8 > dn / 2)
        ww = (int) std::trunc(dn / 2 - 8);
    calcLeads(ww * 2);
    inPosts = newPointArray(inputCount);
    inGates = newPointArray(inputCount);
    int i0 = -(inputCount / 2);
    if (hasFlag(FLAG_INVERT_INPUTS) || hasFlag(FLAG_DEMORGAN))
        icircles = newPointArray(inputCount);
    else
        icircles.clear();
    // moved up from after the loop below -- backCurveX() (OR-shaped bodies
    // only) needs the current hs2, not last time's value
    hs2 = gwidth * (inputCount / 2 + 1);
    bool andShaped = drawAsAndGate();
    for (int i = 0; i != inputCount; i++, i0++) {
        if (i0 == 0 && (inputCount & 1) == 0)
            i0++;
        double adj = getLeadAdjustment(i);
        interpPoint(point1, point2, inPosts[i], 0, hs * i0);
        // bx = true x-offset (from lead1) of the body's back surface at this
        // input's height: always 0 for AND (flat back), or the concave back
        // curve's real position for OR (see backCurveX).  A lead with no bubble
        // reaches exactly bx; a bubble sits back from bx using the same clearance
        // the original AND bubble used (-4 bubble-center, -8 wire-end).
        double bx = andShaped ? 0 : backCurveX(hs * i0, hs2, ww * 2.);
        double inGateOff = !icircles.empty() ? bx - 8 : bx;
        interpPoint(lead1, lead2, inGates[i], inGateOff / (ww * 2.) + adj, hs * i0);
        if (!icircles.empty())
            interpPoint(lead1, lead2, icircles[i], (bx - 4) / (ww * 2.), hs * i0);
    }
    setBbox(point1, point2, hs2);
    if (hasSchmittInputs())
        schmittPoly = getSchmittPolygon(gsize, .47);
    if (useEuroGates()) {
        createEuroGatePolygon();
        linePoints.clear();
    } else {
        // 0 - top left, 1 - start of top curve, 2 - control point for top curve
        // 3 - right, 4 - control point for bottom curve, 5 - start of bottom curve, 6 - bottom right, 7 - control point for left curve
        std::vector<Point> triPoints = newPointArray(11);
        if (drawAsAndGate()) {
            interpPoint2(lead1, lead2, triPoints[0], triPoints[6], 0, hs2);
            interpPoint2(lead1, lead2, triPoints[1], triPoints[5], .5, hs2);
            interpPoint2(lead1, lead2, triPoints[2], triPoints[4], 1, hs2);
            interpPoint(lead1, lead2, triPoints[3], 1);
        } else {
            // Fractions tuned to fit the true MIL-STD-806B circular-arc geometry as
            // closely as a single-control-point bezier can.
            interpPoint2(lead1, lead2, triPoints[0], triPoints[6], 0, hs2);
            interpPoint2(lead1, lead2, triPoints[1], triPoints[5], .134, hs2);
            triPoints[3] = lead2;
            interpPoint2(lead1, lead2, triPoints[2], triPoints[4], .664, hs2 * .8372);
            interpPoint(lead1, lead2, triPoints[7], orBackCtrlFrac);  // was .105 (originally .15)
        }
        if (isXorGateElm()) {
            double ww2 = (ww == 0) ? dn * 2 : ww * 2;
            interpPoint2(lead1, lead2, triPoints[8], triPoints[9], -.05 - 8 / ww2, hs2);
            interpPoint(lead1, lead2, triPoints[10], .1 - 8 / ww2);
        }
        gatePoly = createPolygon(triPoints);
    }
    if (isInverting() != hasFlag(FLAG_DEMORGAN)) {
        pcircle = interpPoint(point1, point2, .5 + (ww + 4) / dn);
        lead2 = interpPoint(point1, point2, .5 + (ww + 8) / dn);
    } else {
        pcircle.reset();
    }
}

// Real (signed) cube root. Math.pow of a negative base to a non-integer
// exponent is NaN, so we do the sign handling ourselves.
double GateElm::cbrt(double x) {
    return (x < 0) ? -jsmath::pow(-x, 1. / 3.) : jsmath::pow(x, 1. / 3.);
}

// True x-offset (from lead1, same units as ww/len) of the OR gate's
// concave back curve at a given height "target" (same units as hs2).
// That curve is a bezierCurveTo with a repeated control point --
// P0=(0,-hs2), P1=P2=(orBackCtrlFrac*len,0), P3=(0,+hs2) -- which reduces
// to x(t) = 3t(1-t)*orBackCtrlFrac*len, y(t) = hs2*(t^3-(1-t)^3).
// Solving y(t)=target for t is a depressed cubic in s=2t-1
// (s^3+3s-4k=0, k=target/hs2), solved here in closed form (Cardano).
double GateElm::backCurveX(double target, double hs2_, double len) {
    double k = target / hs2_;
    double disc = std::sqrt(4 * k * k + 1);
    double s = cbrt(2 * k + disc) + cbrt(2 * k - disc);
    double t = (s + 1) / 2;
    return 3 * t * (1 - t) * orBackCtrlFrac * len;
}

void GateElm::createEuroGatePolygon() {
    std::vector<Point> pts = newPointArray(4);
    interpPoint2(lead1, lead2, pts[0], pts[1], 0, hs2);
    interpPoint2(lead1, lead2, pts[3], pts[2], 1, hs2);
    gatePoly = createPolygon(pts);
}

bool GateElm::useEuroGates() { return app->options.euroGates; }

Point GateElm::getPost(int n) {
    if (n == inputCount)
        return point2;
    if (n >= (int) inPosts.size())  // before setPoints()
        return point1;
    return inPosts[n];
}

void GateElm::stamp() {
    sim->stampVoltageSource(CircuitNode::ground, nodes[inputCount], voltSource);
}

bool GateElm::getInput(int x) {
    bool high = !hasFlag(FLAG_INVERT_INPUTS);
    if (!hasSchmittInputs())
        return (nodes[x]->v > highVoltage * .5) ? high : !high;
    // inputStates is normally allocated in setPoints(), but elements inside a
    // CompositeElm/subcircuit never get setPoints() called, so allocate lazily here too.
    if ((int) inputStates.size() != inputCount)
        inputStates.assign(inputCount, false);
    bool res = nodes[x]->v > highVoltage * (inputStates[x] ? .35 : .55);
    inputStates[x] = res;
    return res ? high : !high;
}

void GateElm::doStep() {
    if (justLoaded) {
        justLoaded = false;
        sim->updateVoltageSource(CircuitNode::ground, nodes[inputCount], voltSource,
                                 lastOutput ? highVoltage : 0);
        return;
    }
    bool f = calcFunction();
    if (isInverting())
        f = !f;
    if (propagationDelay == 0 && lastTime != sim->t) {
        // detect oscillation (using same strategy as Atanua)
        if (lastOutput == !f) {
            if (oscillationCount++ > 50) {
                // output is oscillating too much, randomly leave output the same
                oscillationCount = 0;
                if (app->getrand(10) > 5)
                    f = lastOutput;
            }
        } else
            oscillationCount = 0;
        lastTime = sim->t;
    }
    // apply propagation delay if configured
    if (propagationDelay > 0) {
        if (f != lastOutput) {
            // desired output differs from current output
            if (delayEndTime == 0)
                // start the delay timer on first detection of change
                delayEndTime = sim->t + propagationDelay;
            else if (sim->t >= delayEndTime) {
                // delay has elapsed, apply the change
                lastOutput = f;
                delayEndTime = 0;
            }
        } else {
            // output matches desired; cancel any pending delay
            delayEndTime = 0;
        }
    } else {
        lastOutput = f;
    }
    double res = lastOutput ? highVoltage : 0;
    sim->updateVoltageSource(CircuitNode::ground, nodes[inputCount], voltSource, res);
}

bool AndGateElm::calcFunction() {
    bool f = true;
    for (int i = 0; i != inputCount; i++)
        f = f && getInput(i);
    return f;
}

bool OrGateElm::calcFunction() {
    bool f = false;
    for (int i = 0; i != inputCount; i++)
        f = f || getInput(i);
    return f;
}

bool XorGateElm::calcFunction() {
    bool f = false;
    for (int i = 0; i != inputCount; i++)
        f = f != getInput(i);
    return f;
}

void GateElm::drawGatePolygon(Graphics &g) {
    const Polygon &p = gatePoly;
    const std::vector<int> &xp = p.xpoints, &yp = p.ypoints;
    g.setLineWidth(3.0);
    g.beginPath();
    if (drawAsAndGate()) {
        g.moveTo(xp[0], yp[0]);
        g.lineTo(xp[1], yp[1]);
        g.bezierCurveTo(xp[1], yp[1], xp[2], yp[2], xp[3], yp[3]);
        g.bezierCurveTo(xp[3], yp[3], xp[4], yp[4], xp[5], yp[5]);
        g.lineTo(xp[6], yp[6]);
    } else {
        g.moveTo(xp[0], yp[0]);
        g.lineTo(xp[1], yp[1]);
        g.bezierCurveTo(xp[2], yp[2], xp[2], yp[2], xp[3], yp[3]);
        g.bezierCurveTo(xp[4], yp[4], xp[4], yp[4], xp[5], yp[5]);
        g.lineTo(xp[6], yp[6]);
        g.bezierCurveTo(xp[7], yp[7], xp[7], yp[7], xp[0], yp[0]);
    }
    g.closePath();

    if (isXorGateElm()) {
        g.moveTo(xp[8], yp[8]);
        g.bezierCurveTo(xp[10], yp[10], xp[10], yp[10], xp[9], yp[9]);
    }

    g.stroke();
    g.setLineWidth(1.0);
}

void GateElm::draw(Graphics &g) {
    for (int i = 0; i != inputCount; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, inPosts[i], inGates[i]);
    }
    setVoltageColor(g, nodes[inputCount]->v);
    drawThickLine(g, lead2, point2);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    if (useEuroGates()) {
        drawThickPolygon(g, gatePoly);
        Point center = interpPoint(point1, point2, .5);
        drawCenteredText(g, getGateText().value_or(""), center.x, center.y - 6 * gsize, true);
    } else
        drawGatePolygon(g);
    g.setLineWidth(2);
    if (hasSchmittInputs())
        drawPolygon(g, schmittPoly);
    g.setLineWidth(1);
    for (size_t i = 0; i + 1 < linePoints.size(); i++)
        drawThickLine(g, linePoints[i], linePoints[i + 1]);
    if (pcircle && isInverting() != hasFlag(FLAG_DEMORGAN))
        drawThickCircle(g, pcircle->x, pcircle->y, 3);
    for (const Point &c : icircles)
        drawThickCircle(g, c.x, c.y, 3);
    curcount = updateDotCount(current, curcount);
    drawDots(g, lead2, point2, curcount);
    drawPosts(g);
}

void GateElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = getGateName();
    arr[1] = "Vout = " + getVoltageText(nodes[inputCount]->v);
    arr[2] = "Iout = " + getCurrentText(getCurrent());
    if (propagationDelay > 0)
        arr[3] = "delay = " + getUnitText(propagationDelay, "s");
}

std::optional<EditInfo> GateElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Inputs", inputCount, 1, 8).setDimensionless();
    if (n == 1)
        return EditInfo("High Logic Voltage", highVoltage, 1, 10).setUnitStep();
    if (n == 2)
        return EditInfo::createCheckbox("Schmitt Inputs", hasSchmittInputs());
    if (n == 3)
        return EditInfo::createCheckbox("Invert Inputs", hasFlag(FLAG_INVERT_INPUTS));
    if (n == 4)
        return EditInfo("Propagation Delay (s)", propagationDelay, 0, 0);
    if (n == 5)
        return EditInfo::createCheckbox("DeMorgan's Symbol", hasFlag(FLAG_DEMORGAN));
    return std::nullopt;
}

void GateElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 1) {
            inputCount = (int) std::trunc(ei.value);
            allocNodes();
            setupVolts();
            setPoints();
        } else
            ei.setError("must be >= 1");
    }
    if (n == 1)
        highVoltage = lastHighVoltage = ei.value;
    if (n == 2) {
        flags = ei.changeFlag(flags, FLAG_SCHMITT);
        lastSchmitt = hasSchmittInputs();
        setPoints();
    }
    if (n == 3) {
        // Invert Inputs (3) and DeMorgan's Symbol (5) are mutually exclusive
        if (ei.checkbox->getState()) {
            flags |= FLAG_INVERT_INPUTS;
            flags &= ~FLAG_DEMORGAN;
        } else
            flags &= ~FLAG_INVERT_INPUTS;
        setPoints();
        app->resetEditDialog();
    }
    if (n == 4)
        propagationDelay = ei.value;
    if (n == 5) {
        if (ei.checkbox->getState()) {
            flags |= FLAG_DEMORGAN;
            flags &= ~FLAG_INVERT_INPUTS;
        } else
            flags &= ~FLAG_DEMORGAN;
        setPoints();
        app->resetEditDialog();
    }
}

// skip "Invert Inputs" (index 3 in GateElm); shift higher indices down
std::optional<EditInfo> XorGateElm::getEditInfo(int n) {
    if (n >= 3)
        return GateElm::getEditInfo(n + 1);
    return GateElm::getEditInfo(n);
}

void XorGateElm::setEditValue(int n, EditInfo &ei) {
    if (n >= 3)
        GateElm::setEditValue(n + 1, ei);
    else
        GateElm::setEditValue(n, ei);
}
