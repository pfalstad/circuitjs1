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

#include "MosfetElm.h"

#include "../core/StringTokenizer.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/MosfetModel.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/WireRouter.h"

std::string MosfetElm::lastModelName = "default";

MosfetElm::MosfetElm(int xx, int yy, bool pnpflag) : CircuitElm(xx, yy) {
    pnp = pnpflag ? -1 : 1;
    flags = pnpflag ? FLAG_PNP : 0;
    noDiagonal = true;
    setupDiodes();
}

MosfetElm::MosfetElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &)
    : CircuitElm(xa, ya, xb, yb, f) {
    pnp = ((f & FLAG_PNP) != 0) ? -1 : 1;
    noDiagonal = true;
    setupDiodes();
}

void MosfetElm::postConstruct(StringTokenizer *st) {
    if (st == nullptr) {
        modelName = getLastModelName();
        setup();
        return;
    }
    double vt0 = getDefaultThreshold();
    double beta0 = getBackwardCompatibilityBeta();
    try {
        vt0 = parseFloatStrict(st->nextToken());
        beta0 = parseFloatStrict(st->nextToken());
    } catch (...) {}
    model = legacyModel(vt0, beta0, flags);
    modelName = model->name;
    setup();
    allocNodes();  // make sure volts[] has the right number of elements when hasBodyTerminal() is true
}

// build (or find) a model matching the drawing/behavior bits from a pre-model circuit
// file, where they were packed into the element's own flags instead of into a model.
// Used for both the old plain-text format (StringTokenizer constructor) and old XML saves
// (undumpXml, when there is no "mo" model-name attribute).  Also strips those bits out of
// our own flags field, since they are no longer meaningful there.
MosfetModel *MosfetElm::legacyModel(double vt0, double beta0, int legacyFlags) {
    // JFETs never showed a bulk terminal, so FLAG_HIDE_BULK_LEGACY was never meaningfully
    // set/unset for them; force it false here so legacy JFETs match default-jfet (whose
    // showBulk is also false) instead of spawning a spurious "old-jfet" model.
    bool legacyShowBulk = !isJfet() && (legacyFlags & (FLAG_DIGITAL_LEGACY | FLAG_HIDE_BULK_LEGACY)) == 0;
    bool legacyDigital = (legacyFlags & FLAG_DIGITAL_LEGACY) != 0;
    bool legacyBodyDiode = (legacyFlags & FLAG_BODY_DIODE_LEGACY) != 0;
    bool legacyBodyTerminal = (legacyFlags & FLAG_BODY_TERMINAL_LEGACY) != 0;
    bool legacyShowBodyDiode = (legacyFlags & FLAG_SHOW_BODY_DIODE_LEGACY) != 0;
    flags &= ~(FLAG_DIGITAL_LEGACY | FLAG_HIDE_BULK_LEGACY | FLAG_BODY_DIODE_LEGACY | FLAG_BODY_TERMINAL_LEGACY |
               FLAG_SHOW_BODY_DIODE_LEGACY);
    return MosfetModel::getModelWithParameters(vt0, beta0, isJfet(), legacyShowBulk, legacyBodyDiode,
                                               legacyBodyTerminal, legacyDigital, legacyShowBodyDiode);
}

void MosfetElm::setup() {
    model = MosfetModel::getModelWithNameOrCopy(modelName, model, isJfet());
    modelName = model->name;
    vt = model->threshold;
    beta = model->beta;
    bulkShown = model->showBulk;
    digitalSymbolShown = !bulkShown && model->digitalSymbol;
    bodyDiodeSimulated = bulkShown && model->bodyDiode;
    bodyTerminalShown = bodyDiodeSimulated && model->bodyTerminal;
    bodyDiodeSymbolShown = bodyDiodeSimulated && model->showBodyDiodeSymbol;
    allocNodes();  // post count may have changed (e.g. bodyTerminalShown)
}

bool MosfetElm::hasGateCaps() {
    return model->capGS > 0 || model->capGD > 0;
}

void MosfetElm::updateModels() {
    setup();
    setPoints();
}

// set up body diodes
void MosfetElm::setupDiodes() {
    // diode from node 1 to body terminal
    diodeB1.setupForDefaultModel();
    // diode from node 2 to body terminal
    diodeB2.setupForDefaultModel();
}

void MosfetElm::reset() {
    lastv1 = lastv2 = curcount = 0;
    curcount_body1 = curcount_body2 = curcount_gate = curcount_source = curcount_drain = 0;
    capVoltGS = capVoltGD = capCurGS = capCurGD = 0;
    geqGS = geqGD = ceqGS = ceqGD = 0;
    diodeB1.reset();
    diodeB2.reset();
}

void MosfetElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mo", modelName);
}

void MosfetElm::undumpXml(CircuitXMLDeserializer &xml) {
    flags = 0;
    CircuitElm::undumpXml(xml);
    std::optional<std::string> mo = xml.parseStringAttr("mo", std::nullopt);
    if (!mo) {
        // pre-model circuit file: vt/be were dumped directly on the element, and the
        // drawing/behavior options were packed into our own flags
        double vt0 = xml.parseDoubleAttr("vt", getDefaultThreshold());
        double beta0 = xml.parseDoubleAttr("be", getBackwardCompatibilityBeta());
        model = legacyModel(vt0, beta0, flags);
        modelName = model->name;
    } else
        modelName = *mo;
    setup();
    pnp = ((flags & FLAG_PNP) != 0) ? -1 : 1;
}

void MosfetElm::draw(Graphics &g) {
    setBbox(point1, point2, hs);

    // draw source/drain terminals
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, src[0], src[1]);
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, drn[0], drn[1]);

    // draw line connecting source and drain
    int segments = 6;
    setPowerColor(g, true);
    bool power = showPower();
    double segf = 1. / segments;
    bool enhancement = vt > 0 && showBulk();
    Point p1, p2;
    for (int i = 0; i != segments; i++) {
        if ((i == 1 || i == 4) && enhancement) continue;
        double v = nodes[1]->v + (nodes[2]->v - nodes[1]->v) * i / segments;
        if (!power)
            setVoltageColor(g, v);
        interpPoint(src[1], drn[1], p1, i * segf);
        interpPoint(src[1], drn[1], p2, (i + 1) * segf);
        drawThickLine(g, p1, p2);
    }

    // draw little extensions of that line
    if (!power)
        setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, src[1], src[2]);
    if (!power)
        setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, drn[1], drn[2]);

    // draw bulk connection
    if (showBulk()) {
        setVoltageColor(g, nodes[bodyTerminal]->v);
        if (!hasBodyTerminal())
            drawThickLine(g, pnp == -1 ? drn[0] : src[0], body[0]);
        drawThickLine(g, body[0], body[1]);
    }

    // draw body diode symbol(s)
    if (showBodyDiode()) {
        if (!hasBodyTerminal()) {
            // single offset diode with L-shaped leads
            setVoltageColor(g, nodes[1]->v);
            g.fillPolygon(bodyDiodePoly);
            drawThickLine(g, src[0], bodyDiodeLeads[0]);
            drawThickLine(g, bodyDiodeLeads[0], bodyDiodeLeads[1]);
            setVoltageColor(g, nodes[2]->v);
            drawThickLine(g, bodyDiodeCathode[0], bodyDiodeCathode[1]);
            drawThickLine(g, bodyDiodeLeads[2], bodyDiodeLeads[3]);
            drawThickLine(g, drn[0], bodyDiodeLeads[3]);
            adjustBbox(bodyDiodeLeads[0], bodyDiodeLeads[3]);
        } else {
            // two inline diodes: src/body and body/drn
            int anode1 = (pnp == 1) ? bodyTerminal : 1;
            int cathode1 = (pnp == 1) ? 1 : bodyTerminal;
            setVoltageColor(g, nodes[anode1]->v);
            g.fillPolygon(bodyDiodePoly);
            setVoltageColor(g, nodes[cathode1]->v);
            g.drawLine(bodyDiodeCathode[0], bodyDiodeCathode[1]);
            int anode2 = (pnp == 1) ? bodyTerminal : 2;
            int cathode2 = (pnp == 1) ? 2 : bodyTerminal;
            setVoltageColor(g, nodes[anode2]->v);
            g.fillPolygon(bodyDiodePoly2);
            setVoltageColor(g, nodes[cathode2]->v);
            g.drawLine(bodyDiodeCathode2[0], bodyDiodeCathode2[1]);
        }
    }

    // draw arrow
    if (!drawDigital()) {
        setVoltageColor(g, nodes[bodyTerminal]->v);
        g.fillPolygon(arrowPoly);
    }
    if (power)
        g.setColor(Color::gray);

    // draw gate
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, gate[1]);
    drawThickLine(g, gate[0], gate[2]);
    if (drawDigital() && pnp == -1)
        drawThickCircle(g, pcircle.x, pcircle.y, pcircler);

    if ((flags & FLAG_SHOWVT) != 0) {
        std::string s = jsNumberToString(vt * pnp);
        g.setColor(whiteColor);
        g.setFont(unitsFont);
        drawCenteredText(g, s, x2 + 2, y2, false);
    }
    curcount_source = updateDotCount(-(ids + capCurGS), curcount_source);
    curcount_drain = updateDotCount(-ids + capCurGD, curcount_drain);
    drawDots(g, src[0], src[1], curcount_source);
    drawDots(g, src[1], drn[1], curcount_source);
    drawDots(g, drn[1], drn[0], curcount_drain);

    if (model->capGS > 0 || model->capGD > 0) {
        curcount_gate = updateDotCount(capCurGS + capCurGD, curcount_gate);
        drawDots(g, point1, gate[1], curcount_gate);
    }

    if (showBulk()) {
        curcount_body1 = updateDotCount(diodeCurrent1, curcount_body1);
        curcount_body2 = updateDotCount(diodeCurrent2, curcount_body2);
        if (showBodyDiode() && !hasBodyTerminal()) {
            double cur = -curcount_body1 + curcount_body2;
            drawDots(g, src[0], bodyDiodeLeads[0], cur);
            drawDots(g, bodyDiodeLeads[0], bodyDiodeLeads[3], cur);
            drawDots(g, bodyDiodeLeads[3], drn[0], cur);
        } else {
            drawDots(g, src[0], body[0], -curcount_body1);
            drawDots(g, body[0], drn[0], curcount_body2);
        }
    }

    // label pins when highlighted
    if (needsHighlight() || isCreating()) {
        g.setColor(whiteColor);
        g.setFont(unitsFont);

        // make fiddly adjustments to pin label locations depending on orientation
        int dsx = sign(dx);
        int dsyn = dy == 0 ? 0 : 1;

        g.drawString("G", gate[1].x - (dx < 0 ? -2 : 12), gate[1].y + ((dy > 0) ? -5 : 12));
        int extra = showBodyDiode() && !hasBodyTerminal() && dy == 0 ? 16 * dsign : 0;
        g.drawString(pnp == -1 ? "D" : "S", src[0].x - 3 + 9 * (dsx - dsyn * pnp) + extra, src[0].y + 4);
        g.drawString(pnp == -1 ? "S" : "D", drn[0].x - 3 + 9 * (dsx - dsyn * pnp) + extra, drn[0].y + 4);
        if (hasBodyTerminal())
            g.drawString("B", body[0].x - 3 + 9 * (dsx - dsyn * pnp), body[0].y + 4);
    }

    drawPosts(g);
}

Point MosfetElm::getPost(int n) {
    return (n == 0) ? point1 : (n == 1) ? src[0] : (n == 2) ? drn[0] : body[0];
}

double MosfetElm::getPower() {
    return ids * (nodes[2]->v - nodes[1]->v) - diodeCurrent1 * (nodes[1]->v - nodes[bodyTerminal]->v) -
           diodeCurrent2 * (nodes[2]->v - nodes[bodyTerminal]->v);
}

void MosfetElm::setPoints() {
    CircuitElm::setPoints();

    // find the coordinates of the various points we need to draw
    // the MOSFET.
    int hs2 = hs * dsign;
    if ((flags & FLAG_FLIP) != 0)
        hs2 = -hs2;
    src = newPointArray(3);
    drn = newPointArray(3);
    interpPoint2(point1, point2, src[0], drn[0], 1, -hs2);
    interpPoint2(point1, point2, src[1], drn[1], 1 - 22 / dn, -hs2);
    interpPoint2(point1, point2, src[2], drn[2], 1 - 22 / dn, -hs2 * 4 / 3.0);

    gate = newPointArray(3);
    interpPoint2(point1, point2, gate[0], gate[2], 1 - 28 / dn, hs2 / 2.0);  // was 1-20/dn
    interpPoint(gate[0], gate[2], gate[1], .5);

    if (showBulk()) {
        body = newPointArray(2);
        interpPoint(src[0], drn[0], body[0], .5);
        interpPoint(src[1], drn[1], body[1], .5);
    }

    if (!drawDigital()) {
        if (pnp == 1) {
            if (!showBulk())
                arrowPoly = calcArrow(src[1], src[0], 10, 4);
            else
                arrowPoly = calcArrow(body[0], body[1], 12, 5);
        } else {
            if (!showBulk())
                arrowPoly = calcArrow(drn[0], drn[1], 12, 5);
            else
                arrowPoly = calcArrow(body[1], body[0], 12, 5);
        }
    } else if (pnp == -1) {
        interpPoint(point1, point2, gate[1], 1 - 36 / dn);
        int dist = (dsign < 0) ? 32 : 31;
        pcircle = interpPoint(point1, point2, 1 - dist / dn);
        pcircler = 3;
    }

    if (showBodyDiode()) {
        std::vector<Point> pa = newPointArray(2);
        if (!hasBodyTerminal()) {
            // single diode offset from body line, with L-shaped leads
            int diodeHs = 6;
            bodyDiodeCathode = newPointArray(2);
            bodyDiodeLeads = newPointArray(4);
            Point dp1 = interpPoint(src[0], drn[0], .5 - (diodeHs / 2.) / hs, -hs2);
            Point dp2 = interpPoint(src[0], drn[0], .5 + (diodeHs / 2.) / hs, -hs2);
            interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
            interpPoint2(dp1, dp2, bodyDiodeCathode[0], bodyDiodeCathode[1], 1, diodeHs);
            bodyDiodePoly = createPolygon(pa[0], pa[1], dp2);
            bodyDiodeLeads[0] = interpPoint(src[0], drn[0], 0, -hs2);
            bodyDiodeLeads[1] = dp1;
            bodyDiodeLeads[2] = dp2;
            bodyDiodeLeads[3] = interpPoint(src[0], drn[0], 1, -hs2);
        } else {
            // two inline diodes: src[0]/body[0] and body[0]/drn[0], no offset
            // NPN: anode=body, cathode=src/drn;  PNP: anode=src/drn, cathode=body
            int diodeHs = 3;
            bodyDiodeCathode = newPointArray(2);
            bodyDiodeCathode2 = newPointArray(2);
            const Point &a1 = (pnp == 1) ? body[0] : src[0];
            const Point &b1 = (pnp == 1) ? src[0] : body[0];
            Point dp1 = interpPoint(a1, b1, .3);
            Point dp2 = interpPoint(a1, b1, .7);
            interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
            interpPoint2(dp1, dp2, bodyDiodeCathode[0], bodyDiodeCathode[1], 1, diodeHs);
            bodyDiodePoly = createPolygon(pa[0], pa[1], dp2);
            pa = newPointArray(2);
            const Point &a2 = (pnp == 1) ? body[0] : drn[0];
            const Point &b2 = (pnp == 1) ? drn[0] : body[0];
            dp1 = interpPoint(a2, b2, .3);
            dp2 = interpPoint(a2, b2, .7);
            interpPoint2(dp1, dp2, pa[0], pa[1], 0, diodeHs);
            interpPoint2(dp1, dp2, bodyDiodeCathode2[0], bodyDiodeCathode2[1], 1, diodeHs);
            bodyDiodePoly2 = createPolygon(pa[0], pa[1], dp2);
        }
    }
}

void MosfetElm::startIteration() {
    if (sim->timeStep <= 0)
        return;
    if (model->capGS > 0) {
        geqGS = model->capGS / sim->timeStep;
        ceqGS = -geqGS * capVoltGS;
    }
    if (model->capGD > 0) {
        geqGD = model->capGD / sim->timeStep;
        ceqGD = -geqGD * capVoltGD;
    }
}

void MosfetElm::stamp() {
    sim->stampNonLinear(nodes[1]);
    sim->stampNonLinear(nodes[2]);
    if (hasGateCaps())
        sim->stampNonLinear(nodes[0]);

    if (hasBodyTerminal())
        bodyTerminal = 3;
    else
        bodyTerminal = (pnp == -1) ? 2 : 1;

    if (doBodyDiode()) {
        if (pnp == -1) {
            // pnp: diodes conduct when S or D are higher than body
            diodeB1.stamp(nodes[1], nodes[bodyTerminal]);
            diodeB2.stamp(nodes[2], nodes[bodyTerminal]);
        } else {
            // npn: diodes conduct when body is higher than S or D
            diodeB1.stamp(nodes[bodyTerminal], nodes[1]);
            diodeB2.stamp(nodes[bodyTerminal], nodes[2]);
        }
    }
}

bool MosfetElm::nonConvergence(double last, double now) {
    double diff = std::abs(last - now);

    // high beta MOSFETs are more sensitive to small differences, so we are more strict about convergence testing
    if (beta > 1)
        diff *= 100;

    // difference of less than 10mV is fine
    if (diff < .01)
        return false;
    // larger differences are fine if value is large
    if (sim->subIterations > 10 && diff < std::abs(now) * .001)
        return false;
    // if we are having trouble converging, get more lenient
    if (sim->subIterations > 100 && diff < .01 + (sim->subIterations - 100) * .0001)
        return false;
    return true;
}

void MosfetElm::stepFinished() {
    calculate(true);

    // fix current if body is connected to source or drain
    if (bodyTerminal == 1)
        diodeCurrent1 = -diodeCurrent2;
    if (bodyTerminal == 2)
        diodeCurrent2 = -diodeCurrent1;

    // save gate cap state for next time step
    if (model->capGS > 0 && geqGS > 0) {
        capVoltGS = nodes[0]->v - nodes[1]->v;
        capCurGS = geqGS * capVoltGS + ceqGS;
    }
    if (model->capGD > 0 && geqGD > 0) {
        capVoltGD = nodes[0]->v - nodes[2]->v;
        capCurGD = geqGD * capVoltGD + ceqGD;
    }
}

void MosfetElm::calculate(bool finished) {
    double vs[3] = {nodes[0]->v, nodes[1]->v, nodes[2]->v};
    if (!finished) {
        // limit voltage changes to .5V
        if (vs[1] > lastv1 + .5)
            vs[1] = lastv1 + .5;
        if (vs[1] < lastv1 - .5)
            vs[1] = lastv1 - .5;
        if (vs[2] > lastv2 + .5)
            vs[2] = lastv2 + .5;
        if (vs[2] < lastv2 - .5)
            vs[2] = lastv2 - .5;
    }

    int source = 1;
    int drain = 2;

    // if source voltage > drain (for NPN), swap source and drain
    // (opposite for PNP)
    if (pnp * vs[1] > pnp * vs[2]) {
        source = 2;
        drain = 1;
    }
    const int gateIdx = 0;
    double vgs = vs[gateIdx] - vs[source];
    double vds = vs[drain] - vs[source];
    if (!finished && (nonConvergence(lastv1, vs[1]) || nonConvergence(lastv2, vs[2]) || nonConvergence(lastv0, vs[0])))
        sim->converged = false;
    lastv0 = vs[0];
    lastv1 = vs[1];
    lastv2 = vs[2];
    double realvgs = vgs;
    double realvds = vds;
    vgs *= pnp;
    vds *= pnp;
    ids = 0;
    gm = 0;
    double Gds = 0;
    if (vgs < vt) {
        // should be all zero, but that causes a singular matrix,
        // so instead we treat it as a large resistor
        Gds = 1e-8;
        ids = vds * Gds;
        mode = 0;
    } else if (vds < vgs - vt) {
        // linear
        double lambda = model->lambda;
        ids = beta * ((vgs - vt) * vds - vds * vds * .5) * (1 + lambda * vds);
        gm = beta * vds * (1 + lambda * vds);
        Gds = beta * ((vgs - vds - vt) * (1 + lambda * vds) + lambda * ((vgs - vt) * vds - vds * vds * .5));
        mode = 1;
    } else {
        // saturation; Gds = 0 without lambda
        double lambda = model->lambda;
        double vgs_vt = vgs - vt;
        gm = beta * vgs_vt * (1 + lambda * vds);
        Gds = .5 * beta * vgs_vt * vgs_vt * lambda;
        // enforce a minimum Gds to avoid a singular matrix when lambda is 0.  The extra
        // current that minimum conductance carries has to be included in ids too, or the
        // device current jumps discontinuously to zero at vgs == vt (where the off branch
        // above gives vds*1e-8).  That discontinuity creates a bogus second operating point
        // just below vgs == vt, which the solver can settle into (e.g. an NMOS inverter with
        // an off pulldown would sit at vt below the supply instead of floating midway).
        double gdsMin = 0;
        if (Gds < 1e-8) {
            gdsMin = 1e-8 - Gds;
            Gds = 1e-8;
        }
        ids = .5 * beta * vgs_vt * vgs_vt * (1 + lambda * vds) + (vds - vgs_vt) * gdsMin;
        mode = 2;
    }

    if (doBodyDiode()) {
        diodeB1.doStep(pnp * (nodes[bodyTerminal]->v - nodes[1]->v));
        diodeCurrent1 = diodeB1.calculateCurrent(pnp * (nodes[bodyTerminal]->v - nodes[1]->v)) * pnp;
        diodeB2.doStep(pnp * (nodes[bodyTerminal]->v - nodes[2]->v));
        diodeCurrent2 = diodeB2.calculateCurrent(pnp * (nodes[bodyTerminal]->v - nodes[2]->v)) * pnp;
    } else
        diodeCurrent1 = diodeCurrent2 = 0;

    double ids0 = ids;

    // flip ids if we swapped source and drain above
    if ((source == 2 && pnp == 1) || (source == 1 && pnp == -1))
        ids = -ids;

    if (finished)
        return;

    double rs = -pnp * ids0 + Gds * realvds + gm * realvgs;
    sim->stampMatrix(nodes[drain], nodes[drain], Gds);
    sim->stampMatrix(nodes[drain], nodes[source], -Gds - gm);
    sim->stampMatrix(nodes[drain], nodes[gateIdx], gm);

    sim->stampMatrix(nodes[source], nodes[drain], -Gds);
    sim->stampMatrix(nodes[source], nodes[source], Gds + gm);
    sim->stampMatrix(nodes[source], nodes[gateIdx], -gm);

    sim->stampRightSide(nodes[drain], rs);
    sim->stampRightSide(nodes[source], -rs);

    // gate capacitance companion model stamps (backward euler; avoids the
    // oscillatory behavior trapezoidal integration can cause when RC is
    // small relative to the timestep)
    // Cgs between gate (node 0) and node 1
    if (model->capGS > 0 && geqGS > 0) {
        sim->stampMatrix(nodes[0], nodes[0], geqGS);
        sim->stampMatrix(nodes[1], nodes[1], geqGS);
        sim->stampMatrix(nodes[0], nodes[1], -geqGS);
        sim->stampMatrix(nodes[1], nodes[0], -geqGS);
        sim->stampRightSide(nodes[0], -ceqGS);
        sim->stampRightSide(nodes[1], ceqGS);
    }
    // Cgd between gate (node 0) and node 2
    if (model->capGD > 0 && geqGD > 0) {
        sim->stampMatrix(nodes[0], nodes[0], geqGD);
        sim->stampMatrix(nodes[2], nodes[2], geqGD);
        sim->stampMatrix(nodes[0], nodes[2], -geqGD);
        sim->stampMatrix(nodes[2], nodes[0], -geqGD);
        sim->stampRightSide(nodes[0], -ceqGD);
        sim->stampRightSide(nodes[2], ceqGD);
    }
}

void MosfetElm::getFetInfo(std::vector<std::string> &arr, const std::string &n) {
    arr.clear();
    arr.push_back(Locale::LS(((pnp == -1) ? "p-" : "n-") + n) + " (" + modelName + ")");
    arr.push_back("Vt=" + getVoltageText(pnp * vt) + ", β=" + jsNumberToString(beta));
    arr.push_back(((pnp == 1) ? "Ids = " : "Isd = ") + getCurrentText(ids));
    arr.push_back("Vgs = " + getVoltageText(nodes[0]->v - nodes[pnp == -1 ? 2 : 1]->v));
    arr.push_back(((pnp == 1) ? "Vds = " : "Vsd = ") + getVoltageText(nodes[2]->v - nodes[1]->v));
    arr.push_back(Locale::LS((mode == 0) ? "off" : (mode == 1) ? "linear" : "saturation"));
    arr.push_back("gm = " + getUnitText(gm, "A/V"));
    arr.push_back("P = " + getUnitText(getPower(), "W"));
    if (showBulk())
        arr.push_back("Ib = " + getUnitText(bodyTerminal == 1   ? -diodeCurrent1
                                            : bodyTerminal == 2 ? diodeCurrent2
                                                                : -pnp * (diodeCurrent1 + diodeCurrent2),
                                            "A"));
    if (model->capGS > 0)
        arr.push_back("Cgs = " + getUnitText(model->capGS, "F"));
    if (model->capGD > 0)
        arr.push_back("Cgd = " + getUnitText(model->capGD, "F"));
}

std::string MosfetElm::getScopeText(int) {
    return Locale::LS(std::string((pnp == -1) ? "p-" : "n-") + "MOSFET");
}

bool MosfetElm::getConnection(int n1, int n2) {
    if (hasGateCaps())
        return true;
    return !(n1 == 0 || n2 == 0);
}

std::optional<EditInfo> MosfetElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Model", 0, -1, -1);
        models = MosfetModel::getModelList(isJfet());
        ei.choice.emplace();
        for (size_t i = 0; i != models.size(); i++) {
            MosfetModel *mm = models[i];
            ei.choice->add(mm->getDescription());
            if (mm == model)
                ei.choice->select((int) i);
        }
        return ei;
    }
    int idx = 1;
    if (hasSwapDS()) {
        if (n == idx++)
            return EditInfo::createCheckbox("Swap D/S", (flags & FLAG_FLIP) != 0);
    }
    if (n == idx) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Create New Model")};
        return ei;
    }
    if (n == idx + 1) {
        if (model->readOnly)
            return std::nullopt;
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Edit Model")};
        return ei;
    }
    return std::nullopt;
}

void MosfetElm::newModelCreated(MosfetModel *mm) {
    model = mm;
    modelName = model->name;
    setup();
}

void MosfetElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        model = models[ei.choice->getSelectedIndex()];
        modelName = model->name;
        setLastModelName(modelName);
        setup();
        ei.newDialog = true;
    } else {
        int idx = 1;
        if (hasSwapDS() && n == idx++) {
            flags = (ei.checkbox->getState()) ? (flags | FLAG_FLIP) : (flags & ~FLAG_FLIP);
        } else if (n == idx) {
            // the TS version names and registers the copy when its dialog is applied
            MosfetModel *newModel = new MosfetModel(*model);
            newModel->pickName();
            newModelCreated(newModel);
            ei.newDialog = true;
            app->doEditModel(newModel);
            return;
        } else if (n == idx + 1) {
            if (model->readOnly) {
                app->alert(Locale::LS("This model cannot be modified.  Change the model name to allow customization."));
                return;
            }
            app->doEditModel(model);
            return;
        }
    }

    // lots of different cases where the body terminal might have gotten removed/added so just do this all the time
    allocNodes();
    setPoints();
}

double MosfetElm::getCurrentIntoNode(int n) {
    if (n == 0) {
        // gate current from cap currents (cap current flows out of gate)
        double gateCur = 0;
        if (model->capGS > 0 && geqGS > 0)
            gateCur -= geqGS * (nodes[0]->v - nodes[1]->v) + ceqGS;
        if (model->capGD > 0 && geqGD > 0)
            gateCur -= geqGD * (nodes[0]->v - nodes[2]->v) + ceqGD;
        return gateCur;
    }
    if (n == 3)
        return -diodeCurrent1 - diodeCurrent2;
    if (n == 1) {
        double capCur = (model->capGS > 0 && geqGS > 0) ? geqGS * (nodes[0]->v - nodes[1]->v) + ceqGS : 0;
        return ids + diodeCurrent1 + capCur;
    }
    double capCur = (model->capGD > 0 && geqGD > 0) ? geqGD * (nodes[0]->v - nodes[2]->v) + ceqGD : 0;
    return -ids + diodeCurrent2 + capCur;
}

void MosfetElm::flipX(int c2, int count) {
    if (x == x2)
        flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void MosfetElm::flipY(int c2, int count) {
    if (y == y2)
        flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}

void MosfetElm::flipXY(int xmy, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipXY(xmy, count);
}

void MosfetElm::addRoutingObstacle(WireRouter &wr) {
    wr.addObstacle(std::vector<Point>{gate[0], gate[2], src[0], drn[0], src[2], drn[2]});
    wr.addWire(point1.x, point1.y, gate[1].x, gate[1].y);
}

void MosfetElm::dumpXmlModel(XmlElement *doc) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
}

RegistryModel *MosfetElm::getModel() {
    return model;
}
