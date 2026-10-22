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

#include "TransistorElm.h"

#include <cmath>

#include "../core/JsMath.h"
#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/JsNumber.h"
#include "../core/ScopeConstants.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/TransistorModel.h"
#include "../core/XmlDoc.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/WireRouter.h"

std::string TransistorElm::lastModelName = "default";
int TransistorElm::globalFlags = 0;

TransistorElm::TransistorElm(int xx, int yy, bool pnpflag) : CircuitElm(xx, yy) {
    pnp = pnpflag ? -1 : 1;
    beta = 100;
    modelName = lastModelName;
    setup();
}

TransistorElm::TransistorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    pnp = parseIntStrict(st.nextToken());
    beta = 100;
    try {
        // the on-disk format stores these two tokens in the order
        // (volts[0]-volts[1]), (volts[0]-volts[2]) -- i.e. vbc then vbe --
        // even though Java's own field names call them lastvbe/lastvbc;
        // we store them here under their true electrical meaning instead
        lastvbc = parseFloatStrict(st.nextToken());
        lastvbe = parseFloatStrict(st.nextToken());
        justLoaded = true;
        beta = parseFloatStrict(st.nextToken());
        modelName = CustomLogicModel::unescape(st.nextToken());
    } catch (...) {
        modelName = "default";
    }
    globalFlags = f & FLAGS_GLOBAL;
    setup();
}

void TransistorElm::setup() {
    model = TransistorModel::getModelWithNameOrCopy(modelName, model);
    modelName = model->name;  // in case we couldn't find that model
    vcrit = vt * jsmath::log(vt / (std::sqrt(2) * model->satCur));
    noDiagonal = true;
}

void TransistorElm::reset() {
    lastvbc = lastvbe = curcount_c = curcount_e = curcount_b = 0;
    capVoltBE = capVoltBC = capCurBE = capCurBC = 0;
    geqBE = geqBC = ceqBE = ceqBC = 0;
    badIters = 0;
    localSubIters = 0;
}

void TransistorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "pn", pnp);
    CircuitXMLSerializer::dumpAttr(elem, "be", beta);
    CircuitXMLSerializer::dumpAttr(elem, "mo", modelName);
}

void TransistorElm::dumpXmlState(XmlElement *, XmlElement *elem) {
    // "vBE"/"vBC" (mixed case) are correctly-named, not cross-wired like Java's
    // lowercase "vbe"/"vbc" (see undumpXml, which still accepts the old names)
    CircuitXMLSerializer::dumpAttr(elem, "vBE", nodes[0]->v - nodes[2]->v);
    CircuitXMLSerializer::dumpAttr(elem, "vBC", nodes[0]->v - nodes[1]->v);
}

void TransistorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    pnp = xml.parseIntAttr("pn", pnp);
    beta = xml.parseDoubleAttr("be", beta);
    modelName = xml.parseStringAttr("mo", modelName).value_or(modelName);
    if (xml.currentXmlElement->hasAttribute("vBE") || xml.currentXmlElement->hasAttribute("vBC")) {
        lastvbe = xml.parseDoubleAttr("vBE", 0);
        lastvbc = xml.parseDoubleAttr("vBC", 0);
    } else {
        // legacy Java-compatible attributes: "vbe"/"vbc" are cross-wired relative
        // to their true electrical meaning, so swap them back here
        lastvbc = xml.parseDoubleAttr("vbe", 0);
        lastvbe = xml.parseDoubleAttr("vbc", 0);
    }
    justLoaded = true;
    globalFlags = flags & FLAGS_GLOBAL;
    setup();
}

double TransistorElm::getPower() {
    return (nodes[0]->v - nodes[2]->v) * ib + (nodes[1]->v - nodes[2]->v) * ic;
}

void TransistorElm::setPoints() {
    // these flags apply to all transistors
    flags &= ~FLAGS_GLOBAL;
    flags |= globalFlags;
    CircuitElm::setPoints();
    int hs = 16;
    if ((flags & FLAG_FLIP) != 0)
        dsign = -dsign;
    int hs2 = hs * dsign * pnp;
    // calc collector, emitter posts
    coll = newPointArray(2);
    emit = newPointArray(2);
    interpPoint2(point1, point2, coll[0], emit[0], 1, hs2);
    // calc rectangle edges
    rect = newPointArray(4);
    interpPoint2(point1, point2, rect[0], rect[1], 1 - 16 / dn, hs);
    interpPoint2(point1, point2, rect[2], rect[3], 1 - 13 / dn, hs);
    // calc points where collector/emitter leads contact rectangle
    interpPoint2(point1, point2, coll[1], emit[1], 1 - 13 / dn, 6 * dsign * pnp);
    // calc point where base lead contacts rectangle
    base = interpPoint(point1, point2, 1 - 16 / dn);
    // rectangle
    rectPoly = createPolygon(rect[0], rect[2], rect[3], rect[1]);
    // arrow
    if (pnp == 1)  // npn
        arrowPoly = calcArrow(emit[1], emit[0], 8, 4);
    else           // pnp
        arrowPoly = calcArrow(emit[0], emit[1], 8, 4);
    circleCenter = interpPoint(base, point2, 0.5);
}

double TransistorElm::limitStep(double vnew, double vold) {
    double arg;
    if (vnew > vcrit && std::abs(vnew - vold) > (vt + vt)) {
        if (vold > 0) {
            arg = 1 + (vnew - vold) / vt;
            if (arg > 0)
                vnew = vold + vt * jsmath::log(arg);
            else
                vnew = vcrit;
        } else {
            vnew = vt * jsmath::log(vnew / vt);
        }
        sim->converged = false;
    }
    return vnew;
}

// Calculate voltage-dependent junction depletion capacitance.
// This is the SPICE standard formula: the PN junction's depletion
// layer acts as a parallel-plate capacitor whose plate spacing
// changes with applied voltage.
//   vj  = voltage across the junction (positive = forward bias)
//   cj0 = zero-bias capacitance (the value when no voltage is applied)
//   vj0 = built-in junction potential (typically 0.6-0.8V for silicon)
//   mj  = grading coefficient (0.33 for linearly graded, 0.5 for abrupt)
double TransistorElm::calcJunctionCap(double vj, double cj0, double vj0, double mj) {
    if (cj0 <= 0)
        return 0;
    const double fc = 0.5;
    if (vj < fc * vj0) {
        // Normal depletion region: C increases as reverse bias decreases
        return cj0 / jsmath::pow(1 - vj / vj0, mj);
    } else {
        // Forward bias beyond fc*Vj: linear extrapolation to avoid
        // the singularity at V=Vj where capacitance would go to infinity
        return cj0 / jsmath::pow(1 - fc, 1 + mj) * (1 - fc * (1 + mj) + mj * vj / vj0);
    }
}

void TransistorElm::startIteration() {
    // Compute junction capacitance companion model for this time step.
    // Uses trapezoidal integration (same as CapacitorElm).
    // Total cap = depletion cap (CJE/CJC) + diffusion cap (TF*gm / TR*gm).
    bool hasBEcap = model->junctionCapBE > 0 || model->transitTimeF > 0;
    bool hasBCcap = model->junctionCapBC > 0 || model->transitTimeR > 0;
    if (hasBEcap && sim->timeStep > 0) {
        double vjBE = pnp * capVoltBE;  // physical junction voltage
        double cje = calcJunctionCap(vjBE, model->junctionCapBE, model->junctionPotBE, model->junctionExpBE);
        // Add diffusion capacitance only in forward bias (like SPICE)
        if (model->transitTimeF > 0 && vjBE > 0) {
            double vtn = vt * model->emissionCoeffF;
            cje += model->transitTimeF * model->satCur * jsmath::exp(vjBE / vtn) / vtn;
        }
        geqBE = 2 * cje / sim->timeStep;
        if (geqBE < 1e-20) { geqBE = ceqBE = capCurBE = 0; }
        else ceqBE = -geqBE * capVoltBE - capCurBE;
    }
    if (hasBCcap && sim->timeStep > 0) {
        double vjBC = pnp * capVoltBC;  // physical junction voltage
        double cjc = calcJunctionCap(vjBC, model->junctionCapBC, model->junctionPotBC, model->junctionExpBC);
        // Add diffusion capacitance only in forward bias (like SPICE)
        if (model->transitTimeR > 0 && vjBC > 0)
            cjc += model->transitTimeR * model->satCur * jsmath::exp(vjBC / (vt * model->emissionCoeffR)) / (vt * model->emissionCoeffR);
        geqBC = 2 * cjc / sim->timeStep;
        if (geqBC < 1e-20) { geqBC = ceqBC = capCurBC = 0; }
        else ceqBC = -geqBC * capVoltBC - capCurBC;
    }
}

void TransistorElm::stamp() {
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
    sim->stampNonLinear(nodes[2]);
}

void TransistorElm::doStep() {
    double vbc = justLoaded ? pnp * lastvbc : pnp * (nodes[0]->v - nodes[1]->v);  // typically negative
    double vbe = justLoaded ? pnp * lastvbe : pnp * (nodes[0]->v - nodes[2]->v);  // typically positive
    justLoaded = false;
    bool notConverged = std::abs(vbc - lastvbc) > .01 || std::abs(vbe - lastvbe) > .01;
    if (notConverged)
        sim->converged = false;
    // track per-transistor convergence difficulty
    if (notConverged)
        localSubIters++;
    else
        localSubIters = 0;
    // To prevent a possible singular matrix, put a tiny conductance in parallel
    // with each P-N junction.
    gmin = 1e-12;
    if (localSubIters > 100 && badIters < 5) {
        // if THIS transistor has trouble converging, put a conductance in
        // parallel with all P-N junctions.  Use per-transistor iteration
        // count to avoid contaminating unrelated transistors elsewhere
        // in the circuit.
        gmin = jsmath::exp(-9 * jsmath::log(10) * (1 - localSubIters / 300.));
        if (gmin > .1)
            gmin = .1;
    }
    vbc = limitStep(vbc, lastvbc);
    vbe = limitStep(vbe, lastvbe);
    lastvbc = vbc;
    lastvbe = vbe;

    /*
     *   dc model paramters (from Spice 3f5, bjtload.c)
     */
    double csat = model->satCur;
    double oik = model->invRollOffF;
    double c2 = model->BEleakCur;
    double vte = model->leakBEemissionCoeff * vt;
    double oikr = model->invRollOffR;
    double c4 = model->BCleakCur;
    double vtc = model->leakBCemissionCoeff * vt;
    double vtn = vt * model->emissionCoeffF;
    double evbe, cbe, gbe, cben, gben, evben, evbc, cbc, gbc, cbcn, gbcn, evbcn;
    double qb, dqbdve, dqbdvc, q2, sqarg, arg;
    if (vbe > -5 * vtn) {
        evbe = jsmath::exp(vbe / vtn);
        cbe = csat * (evbe - 1) + gmin * vbe;
        gbe = csat * evbe / vtn + gmin;
        if (c2 == 0) {
            cben = 0;
            gben = 0;
        } else {
            evben = jsmath::exp(vbe / vte);
            cben = c2 * (evben - 1);
            gben = c2 * evben / vte;
        }
    } else {
        gbe = -csat / vbe + gmin;
        cbe = gbe * vbe;
        gben = -c2 / vbe;
        cben = gben * vbe;
    }
    vtn = vt * model->emissionCoeffR;
    if (vbc > -5 * vtn) {
        evbc = jsmath::exp(vbc / vtn);
        cbc = csat * (evbc - 1) + gmin * vbc;
        gbc = csat * evbc / vtn + gmin;
        if (c4 == 0) {
            cbcn = 0;
            gbcn = 0;
        } else {
            evbcn = jsmath::exp(vbc / vtc);
            cbcn = c4 * (evbcn - 1);
            gbcn = c4 * evbcn / vtc;
        }
    } else {
        gbc = -csat / vbc + gmin;
        cbc = gbc * vbc;
        gbcn = -c4 / vbc;
        cbcn = gbcn * vbc;
    }
    /*
     *   determine base charge terms
     */
    double q1 = 1 / (1 - model->invEarlyVoltF * vbc - model->invEarlyVoltR * vbe);
    if (oik == 0 && oikr == 0) {
        qb = q1;
        dqbdve = q1 * qb * model->invEarlyVoltR;
        dqbdvc = q1 * qb * model->invEarlyVoltF;
    } else {
        q2 = oik * cbe + oikr * cbc;
        arg = std::max(0.0, 1 + 4 * q2);
        sqarg = 1;
        if (arg != 0) sqarg = std::sqrt(arg);
        qb = q1 * (1 + sqarg) / 2;
        dqbdve = q1 * (qb * model->invEarlyVoltR + oik * gbe / sqarg);
        dqbdvc = q1 * (qb * model->invEarlyVoltF + oikr * gbc / sqarg);
    }
    double cc = 0;
    double cex = cbe;
    double gex = gbe;
    /*
     *   determine dc incremental conductances
     */
    cc = cc + (cex - cbc) / qb - cbc / model->betaR - cbcn;
    double cb = cbe / beta + cben + cbc / model->betaR + cbcn;
    // get currents
    ic = pnp * cc;
    ib = pnp * cb;
    ie = pnp * (-cc - cb);
    double gpi = gbe / beta + gben;
    double gmu = gbc / model->betaR + gbcn;
    double go = (gbc + (cex - cbc) * dqbdvc / qb) / qb;
    double gm = (gex - (cex - cbc) * dqbdve / qb) / qb - go;
    double ceqbe = pnp * (cc + cb - vbe * (gm + go + gpi) + vbc * go);
    double ceqbc = pnp * (-cc + vbe * (gm + go) - vbc * (gmu + go));
    if (!std::isfinite(ib) || std::isnan(ic))
        sim->stop("infinite transistor current", this);
    // stamp matrix.
    // Node 0 is the base, node 1 the collector, node 2 the emitter.
    sim->stampMatrix(nodes[1], nodes[1], gmu + go);
    sim->stampMatrix(nodes[1], nodes[0], -gmu + gm);
    sim->stampMatrix(nodes[1], nodes[2], -gm - go);
    sim->stampMatrix(nodes[0], nodes[0], gpi + gmu);
    sim->stampMatrix(nodes[0], nodes[2], -gpi);
    sim->stampMatrix(nodes[0], nodes[1], -gmu);
    sim->stampMatrix(nodes[2], nodes[0], -gpi - gm);
    sim->stampMatrix(nodes[2], nodes[1], -go);
    sim->stampMatrix(nodes[2], nodes[2], gpi + gm + go);
    /*
     *  load current excitation vector (right side)
     */
    sim->stampRightSide(nodes[0], -ceqbe - ceqbc);
    sim->stampRightSide(nodes[1], ceqbc);
    sim->stampRightSide(nodes[2], ceqbe);
    // Junction capacitance companion model stamps.
    // Each junction cap is modeled as a conductance (Geq) in parallel
    // with a current source (Ceq), using trapezoidal integration.
    if (geqBE > 0) {
        // BE junction cap: conductance between base (node 0) and emitter (node 2)
        sim->stampMatrix(nodes[0], nodes[0], geqBE);
        sim->stampMatrix(nodes[2], nodes[2], geqBE);
        sim->stampMatrix(nodes[0], nodes[2], -geqBE);
        sim->stampMatrix(nodes[2], nodes[0], -geqBE);
        // Current source (positive = base to emitter)
        sim->stampRightSide(nodes[0], -ceqBE);
        sim->stampRightSide(nodes[2], ceqBE);
    }
    if (geqBC > 0) {
        // BC junction cap: conductance between base (node 0) and collector (node 1)
        sim->stampMatrix(nodes[0], nodes[0], geqBC);
        sim->stampMatrix(nodes[1], nodes[1], geqBC);
        sim->stampMatrix(nodes[0], nodes[1], -geqBC);
        sim->stampMatrix(nodes[1], nodes[0], -geqBC);
        // Current source (positive = base to collector)
        sim->stampRightSide(nodes[0], -ceqBC);
        sim->stampRightSide(nodes[1], ceqBC);
    }
}

double TransistorElm::getScopeValue(int x) {
    using namespace ScopeConstants;
    switch (x) {
    case VAL_IB: return ib;
    case VAL_IC: return ic;
    case VAL_IE: return ie;
    case VAL_VBE: return nodes[0]->v - nodes[2]->v;
    case VAL_VBC: return nodes[0]->v - nodes[1]->v;
    case VAL_VCE: return nodes[1]->v - nodes[2]->v;
    case VAL_POWER: return getPower();
    }
    return 0;
}

int TransistorElm::getScopeUnits(int x) {
    using namespace ScopeConstants;
    switch (x) {
    case VAL_IB: case VAL_IC:
    case VAL_IE: return UNITS_A;
    case VAL_POWER: return UNITS_W;
    default: return UNITS_V;
    }
}

void TransistorElm::newModelCreated(TransistorModel *tm) {
    model = tm;
    modelName = model->name;
    setup();
}

void TransistorElm::stepFinished() {
    // stop for huge currents that make simulator act weird
    if (std::abs(ic) > 1e12 || std::abs(ib) > 1e12)
        sim->stop("max current exceeded", this);
    // if this transistor needed gmin ramping, it was a bad iteration.
    // If we have 5 of those in a row, give up on gmin for this transistor.
    if (localSubIters > 100)
        badIters++;
    else
        badIters = 0;
    // Save junction cap state for next time step's companion model.
    // capVoltXX = node voltage difference across junction (circuit reference, not pnp-adjusted).
    // capCurXX  = actual capacitor current at end of this time step.
    if (geqBE > 0) {
        capVoltBE = nodes[0]->v - nodes[2]->v;
        capCurBE = geqBE * capVoltBE + ceqBE;
    }
    if (geqBC > 0) {
        capVoltBC = nodes[0]->v - nodes[1]->v;
        capCurBC = geqBC * capVoltBC + ceqBC;
    }
    // Add junction cap currents to terminal currents for display.
    // BE cap current flows base to emitter; BC cap current flows base to collector.
    if (geqBE > 0) {
        double icapBE = geqBE * (nodes[0]->v - nodes[2]->v) + ceqBE;
        ib += icapBE;
        ie -= icapBE;
    }
    if (geqBC > 0) {
        double icapBC = geqBC * (nodes[0]->v - nodes[1]->v) + ceqBC;
        ib += icapBC;
        ic -= icapBC;
    }
    localSubIters = 0;
}

void TransistorElm::flipX(int c2, int count) {
    if (x == x2)
        flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void TransistorElm::flipY(int c2, int count) {
    if (y == y2)
        flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}

void TransistorElm::flipXY(int xmy, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipXY(xmy, count);
}

void TransistorElm::setFlipped(bool flip) {
    if (((flags & FLAG_FLIP) != 0) != flip)
        flags ^= FLAG_FLIP;
}

double TransistorElm::getCurrentIntoNode(int n) {
    if (n == 0) return -ib;
    if (n == 1) return -ic;
    return -ie;
}

void TransistorElm::draw(Graphics &g) {
    // pick up global flags changes
    if ((flags & FLAGS_GLOBAL) != globalFlags)
        setPoints();

    setBbox(point1, point2, 16);
    if (hasCircle()) {
        g.setColor(Color::gray);
        drawThickCircle(g, circleCenter.x, circleCenter.y, 20);
    }
    setPowerColor(g, true);
    // draw collector
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, coll[0], coll[1]);
    // draw emitter
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, emit[0], emit[1]);
    // draw arrow
    g.fillPolygon(arrowPoly);
    // draw base
    setVoltageColor(g, nodes[0]->v);
    if (showPower())
        g.setColor(Color::gray);
    drawThickLine(g, point1, base);
    // draw dots
    curcount_b = updateDotCount(-ib, curcount_b);
    drawDots(g, base, point1, curcount_b);
    curcount_c = updateDotCount(-ic, curcount_c);
    drawDots(g, coll[1], coll[0], curcount_c);
    curcount_e = updateDotCount(-ie, curcount_e);
    drawDots(g, emit[1], emit[0], curcount_e);
    // draw base rectangle
    setVoltageColor(g, nodes[0]->v);
    setPowerColor(g, true);
    g.fillPolygon(rectPoly);

    if (needsHighlight() || isCreating()) {
        g.setColor(whiteColor);
        if (dy == 0) {
            g.drawString("B", base.x - (dx < 0 ? -2 : 10), base.y - 4);
            g.drawString("C", coll[0].x - (dx < 0 ? 13 : -6), coll[0].y + 4);
            g.drawString("E", emit[0].x - (dx < 0 ? 13 : -6), emit[0].y + 4);
        } else if (dx == 0) {
            g.drawString("B", base.x + 3, base.y - (dy < 0 ? -11 : 3));
            g.drawString("C", coll[0].x - 4, coll[0].y - (dy < 0 ? 7 : -14));
            g.drawString("E", emit[0].x - 4, emit[0].y - (dy < 0 ? 7 : -14));
        }
    }
    drawPosts(g);
}

std::string TransistorElm::getScopeText(int x) {
    using namespace ScopeConstants;
    std::string t;
    switch (x) {
    case VAL_IB: t = "Ib"; break;
    case VAL_IC: t = "Ic"; break;
    case VAL_IE: t = "Ie"; break;
    case VAL_VBE: t = "Vbe"; break;
    case VAL_VBC: t = "Vbc"; break;
    case VAL_VCE: t = "Vce"; break;
    case VAL_POWER: t = "P"; break;
    }
    return Locale::LS("transistor") + ", " + t;
}

void TransistorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS("transistor") + (pnp == -1 ? " (PNP)" : " (NPN)");
    arr[1] = model->name + ", \u03B2=" + showFormat.format(beta);
    double vbc = nodes[0]->v - nodes[1]->v;
    double vbe = nodes[0]->v - nodes[2]->v;
    double vce = nodes[1]->v - nodes[2]->v;
    if (vbc * pnp > .2)
        arr[2] = vbe * pnp > .2 ? "saturation" : "reverse active";
    else
        arr[2] = vbe * pnp > .2 ? "fwd active" : "cutoff";
    arr[2] = Locale::LS(arr[2]);
    arr[3] = "Ic = " + getCurrentText(ic);
    arr[4] = "Ib = " + getCurrentText(ib);
    arr[5] = "Vbe = " + getVoltageText(vbe);
    arr[6] = "Vbc = " + getVoltageText(vbc);
    arr[7] = "Vce = " + getVoltageText(vce);
    arr[8] = "P = " + getUnitText(getPower(), "W");
}

std::optional<EditInfo> TransistorElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Beta/hFE", beta, 10, 1000).setDimensionless();
    if (n == 1) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Swap E/C", (flags & FLAG_FLIP) != 0);
        return ei;
    }
    if (n == 2)
        return EditInfo::createCheckbox("Draw Circle", hasCircle());
    if (n == 3) {
        EditInfo ei("Model", 0, -1, -1);
        models = TransistorModel::getModelList();
        ei.choice = Choice();
        for (size_t i = 0; i != models.size(); i++) {
            TransistorModel *dm = models[i];
            ei.choice->add(dm->getDescription());
            if (dm == model)
                ei.choice->select((int) i);
        }
        return ei;
    }
    if (n == 4) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Create New Model")};
        return ei;
    }
    if (n == 5) {
        if (model->readOnly)
            return std::nullopt;
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Edit Model")};
        return ei;
    }
    return std::nullopt;
}

void TransistorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        beta = ei.value;
        setup();
    }
    if (n == 1) {
        if (ei.checkbox->getState())
            flags |= FLAG_FLIP;
        else
            flags &= ~FLAG_FLIP;
        setPoints();
    }
    if (n == 2) {
        globalFlags = ei.changeFlag(globalFlags, FLAG_CIRCLE);
        return;
    }
    if (n == 3) {
        model = models[ei.choice->getSelectedIndex()];
        modelName = model->name;
        setup();
        ei.newDialog = true;
        return;
    }
    if (n == 4) {
        // the TS version names and registers the copy when its dialog is applied
        TransistorModel *newModel = new TransistorModel(*model);
        newModel->pickName();
        newModelCreated(newModel);
        ei.newDialog = true;
        app->doEditModel(newModel);
        return;
    }
    if (n == 5) {
        if (model->readOnly) {
            // probably never reached
            app->alert(Locale::LS("This model cannot be modified.  Change the model name to allow customization."));
            return;
        }
        app->doEditModel(model);
        return;
    }
}

void TransistorElm::addRoutingObstacle(WireRouter &wr) {
    wr.addObstacle(std::vector<Point>{rect[0], rect[1], rect[2], rect[3], coll[0], emit[0]});
    wr.addWire(point1.x, point1.y, base.x, base.y);
}

void TransistorElm::dumpXmlModel(XmlElement *doc) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
}
