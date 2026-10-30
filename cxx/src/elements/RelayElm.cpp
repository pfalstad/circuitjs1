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

#include "RelayElm.h"

#include <cmath>
#include <iostream>

#include "../core/CircuitNode.h"
#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/RelayModel.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

std::string RelayElm::lastModelName = "default";

bool RelayElm::needsPulldown() { return model != nullptr && model->pulldown; }

int RelayElm::coilStyleFromFlags(int f) {
    if ((f & FLAG_SWAP_COIL) != 0)
        return 2;
    if ((f & FLAG_BOTH_SIDES_COIL) != 0)
        return 0;
    return 1;
}

double RelayElm::inductance() { return model->inductance; }
double RelayElm::r_on() { return model->r_on; }
double RelayElm::r_off() { return model->r_off; }
double RelayElm::onCurrent() { return model->onCurrent; }
double RelayElm::offCurrent() { return model->offCurrent; }
double RelayElm::coilR() { return model->coilR; }
double RelayElm::switchingTime() { return model->switchingTime; }
int RelayElm::poleCount() { return model == nullptr ? 1 : model->poleCount; }

RelayElm::RelayElm(int xx, int yy) : CircuitElm(xx, yy), ind(sim) {
    modelName = lastModelName;
    model = RelayModel::getModelWithName(modelName);
    ind.setup(inductance(), 0, Inductor::FLAG_BACK_EULER);
    noDiagonal = true;
    coilCurrent = coilCurCount = 0;
    setupPoles();
}

RelayElm::RelayElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), ind(sim) {
    // old text-format constructor: build a model from the per-element parameters for backward compat
    int poleCount = parseIntStrict(st.nextToken());
    double inductance = parseFloatStrict(st.nextToken());
    coilCurrent = parseFloatStrict(st.nextToken());
    double r_on = parseFloatStrict(st.nextToken());
    double r_off = parseFloatStrict(st.nextToken());
    double onCurrent = parseFloatStrict(st.nextToken());
    double coilR = parseFloatStrict(st.nextToken());
    double offCurrent = onCurrent;
    double switchingTime = 0;
    try {
        offCurrent = parseFloatStrict(st.nextToken());
        switchingTime = parseFloatStrict(st.nextToken());
        d_position = i_position = parseIntStrict(st.nextToken());
    } catch (...) {}
    model = RelayModel::getModelWithParameters(inductance, r_on, r_off, onCurrent, offCurrent, coilR, switchingTime,
                                               coilStyleFromFlags(f), (f & FLAG_SHOW_BOX) != 0,
                                               (f & FLAG_PULLDOWN) != 0, poleCount);
    modelName = model->name;
    postUndump();
}

void RelayElm::postUndump() {
    if (i_position == 1)
        onState = true;
    if (i_position == 2)
        d_position = .5;
    noDiagonal = true;
    ind = Inductor(sim);
    ind.setup(inductance(), coilCurrent, Inductor::FLAG_BACK_EULER);
    setupPoles();
    allocNodes();
}

void RelayElm::setup() {
    model = RelayModel::getModelWithNameOrCopy(modelName, model);
    modelName = model->name;
    ind.setup(inductance(), coilCurrent, Inductor::FLAG_BACK_EULER);
}

void RelayElm::updateModels() {
    setup();
    setPoints();
}

void RelayElm::newModelCreated(RelayModel *rm) {
    model = rm;
    modelName = model->name;
    lastModelName = modelName;
    ind.setup(inductance(), coilCurrent, Inductor::FLAG_BACK_EULER);
    setPoints();
}

void RelayElm::setupPoles() {
    nCoil1 = 3 * poleCount();
    nCoil2 = nCoil1 + 1;
    nCoil3 = nCoil1 + 2;
    if ((int) switchCurrent.size() != poleCount()) {
        switchCurrent.assign(poleCount(), 0.0);
        switchCurCount.assign(poleCount(), 0.0);
    }
}

void RelayElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mo", modelName);
}

void RelayElm::dumpXmlState(XmlElement *, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "i", coilCurrent);
    CircuitXMLSerializer::dumpAttr(elem, "ip", i_position);
}

void RelayElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    std::optional<std::string> mo = xml.parseStringAttr("mo", std::nullopt);
    if (mo) {
        // new format: model name present; poleCount comes from the model
        modelName = *mo;
        model = RelayModel::getModelWithNameOrCopy(modelName, model);
        modelName = model->name;
    } else if (!xml.parseStringAttr("ix", std::nullopt)) {
        // old format: read per-element params and create a model from them.
        // "ix" is present on state-restore calls (CompositeElm.dumpXmlState); skip model
        // creation then so the model set by the definition load is not overwritten.
        int poleCount = xml.parseIntAttr("po", 1);
        RelayModel defaults;
        double inductance = xml.parseDoubleAttr("in", defaults.inductance);
        double r_on = xml.parseDoubleAttr("ron", defaults.r_on);
        double r_off = xml.parseDoubleAttr("roff", defaults.r_off);
        double onCurrent = xml.parseDoubleAttr("on", defaults.onCurrent);
        double coilR = xml.parseDoubleAttr("coR", defaults.coilR);
        double offCurrent = xml.parseDoubleAttr("of", defaults.offCurrent);
        double switchingTime = xml.parseDoubleAttr("sw", defaults.switchingTime);
        int coilStyle = coilStyleFromFlags(flags);
        bool showBox = (flags & FLAG_SHOW_BOX) != 0;
        bool pulldown = (flags & FLAG_PULLDOWN) != 0;
        model = RelayModel::getModelWithParameters(inductance, r_on, r_off, onCurrent, offCurrent, coilR,
                                                   switchingTime, coilStyle, showBox, pulldown, poleCount);
        modelName = model->name;
    }
    coilCurrent = xml.parseDoubleAttr("i", coilCurrent);
    d_position = i_position = xml.parseIntAttr("ip", i_position);
    postUndump();
}

void RelayElm::draw(Graphics &g) {
    for (int i = 0; i != 2; i++) {
        setVoltageColor(g, nodes[nCoil1 + i]->v);
        drawThickLine(g, coilLeads[i], coilPosts[i]);
    }
    int x = (model->coilStyle == 2) ? 1 : 0;
    setPowerColor(g, coilCurrent * (nodes[nCoil1]->v - nodes[nCoil2]->v));
    drawCoil(g, dflip * 6, coilLeads[x], coilLeads[1 - x], nodes[nCoil1 + x]->v, nodes[nCoil2 - x]->v);

    // draw rectangle
    if (model->showBox) {
        g.setColor(needsHighlight() ? selectColor : lightGrayColor);
        drawThickLine(g, outline[0], outline[1]);
        drawThickLine(g, outline[1], outline[2]);
        drawThickLine(g, outline[2], outline[3]);
        drawThickLine(g, outline[3], outline[0]);
    }

    // draw lines
    g.setColor(Color::darkGray);
    for (int i = 0; i != poleCount(); i++) {
        if (i == 0) {
            int off = (model->coilStyle == 0) ? 4 : 0;
            interpPoint(point1, point2, lines[i * 2], .5, openhs * 2 + 5 * dflip - i * openhs * 3 + off);
        } else
            interpPoint(point1, point2, lines[i * 2], .5,
                        std::trunc(openhs * (-i * 3 + 3 - .5 + d_position)) + 5 * dflip);
        interpPoint(point1, point2, lines[i * 2 + 1], .5, std::trunc(openhs * (-i * 3 - .5 + d_position)) - 5 * dflip);
        g.setLineDash(4, 4);
        g.drawLine(lines[i * 2].x, lines[i * 2].y, lines[i * 2 + 1].x, lines[i * 2 + 1].y);
        g.setLineDash(0, 0);
    }

    for (int p = 0; p != poleCount(); p++) {
        int po = p * 3;
        for (int i = 0; i != 3; i++) {
            // draw lead
            setVoltageColor(g, nodes[nSwitch0 + po + i]->v);
            drawThickLine(g, swposts[p][i], swpoles[p][i]);
        }

        interpPoint(swpoles[p][1], swpoles[p][2], ptSwitch[p], d_position);
        g.setColor(Color::lightGray);
        drawThickLine(g, swpoles[p][0], ptSwitch[p]);
        switchCurCount[p] = updateDotCount(switchCurrent[p], switchCurCount[p]);
        drawDots(g, swposts[p][0], swpoles[p][0], switchCurCount[p]);

        if (i_position != 2)
            drawDots(g, swpoles[p][i_position + 1], swposts[p][i_position + 1], switchCurCount[p]);
    }

    coilCurCount = updateDotCount(coilCurrent, coilCurCount);

    if (coilCurCount != 0) {
        drawDots(g, coilPosts[0], coilLeads[0], coilCurCount);
        drawDots(g, coilLeads[0], coilLeads[1], addCurCount(coilCurCount, currentOffset1));
        drawDots(g, coilLeads[1], coilPosts[1], addCurCount(coilCurCount, currentOffset2));
    }

    drawPosts(g);
    setBbox(outline[0], outline[2], 0);
    adjustBbox(coilPosts[0], coilPosts[1]);
    adjustBbox(swposts[0][0], swposts[0][1]);
}

double RelayElm::getCurrentIntoNode(int n) {
    if (n < 3 * poleCount()) {
        int p = n / 3;
        int k = n % 3;
        if (k == 0)
            return -switchCurrent[p];
        if (k == 1 + i_position)
            return switchCurrent[p];
        return 0;
    }
    if (n == 3 * poleCount())
        return -coilCurrent;
    return coilCurrent;
}

void RelayElm::setPoints() {
    CircuitElm::setPoints();
    setupPoles();
    allocNodes();
    dflip = hasFlag(FLAG_FLIP) ? -dsign : dsign;
    openhs = -dflip * 16;

    // switch
    calcLeads(32);
    swposts.assign(poleCount(), {});
    swpoles.assign(poleCount(), {});
    for (int i = 0; i != poleCount(); i++) {
        interpPoint(lead1, lead2, swpoles[i][0], 0, -openhs * 3 * i);
        interpPoint(lead1, lead2, swpoles[i][1], 1, -openhs * 3 * i - openhs);
        interpPoint(lead1, lead2, swpoles[i][2], 1, -openhs * 3 * i + openhs);
        interpPoint(point1, point2, swposts[i][0], 0, -openhs * 3 * i);
        interpPoint(point1, point2, swposts[i][1], 1, -openhs * 3 * i - openhs);
        interpPoint(point1, point2, swposts[i][2], 1, -openhs * 3 * i + openhs);
    }

    // coil
    coilPosts = newPointArray(2);
    coilLeads = newPointArray(2);
    ptSwitch = newPointArray(poleCount());

    int x = (model->coilStyle == 2) ? 1 : 0;
    int boxSize;
    if (model->coilStyle != 0) {
        interpPoint(point1, point2, coilPosts[0], x, openhs * 2);
        interpPoint(point1, point2, coilPosts[1], x, openhs * 3);
        interpPoint(point1, point2, coilLeads[0], .5, openhs * 2);
        interpPoint(point1, point2, coilLeads[1], .5, openhs * 3);
        boxSize = 56;
    } else {
        interpPoint(point1, point2, coilPosts[0], 0, openhs * 2);
        interpPoint(point1, point2, coilPosts[1], 1, openhs * 2);
        interpPoint(point1, point2, coilLeads[0], .5 - 16 / dn, openhs * 2);
        interpPoint(point1, point2, coilLeads[1], .5 + 16 / dn, openhs * 2);
        boxSize = 40;
    }

    // lines
    lines = newPointArray(poleCount() * 2);

    // outline
    double boxWScale = std::min(0.4, 25.0 / dn);
    interpPoint(point1, point2, outline[0], 0.5 - boxWScale, -boxSize * dflip);
    interpPoint(point1, point2, outline[1], 0.5 + boxWScale, -boxSize * dflip);
    interpPoint(point1, point2, outline[2], 0.5 + boxWScale, -(openhs * 3 * poleCount()) - (24.0 * dflip));
    interpPoint(point1, point2, outline[3], 0.5 - boxWScale, -(openhs * 3 * poleCount()) - (24.0 * dflip));

    currentOffset1 = distance(coilPosts[0], coilLeads[0]);
    currentOffset2 = currentOffset1 + distance(coilLeads[0], coilLeads[1]);
}

Point RelayElm::getPost(int n) {
    if (n < 3 * poleCount()) {
        int p = n / 3;
        if (p >= (int) swposts.size()) {
            // model's poleCount grew after our geometry/nodes were built (can happen
            // when a relay's model is referenced before its "rlm" definition is
            // parsed, e.g. a model only otherwise defined inside a subcircuit); rebuild
            // now rather than crash. See RelayModel.getModelWithNameOrCopy.
            std::cerr << "relay " << modelName << ": poleCount grew after layout, rebuilding\n";
            setPoints();
        }
        return swposts[p][n % 3];
    }
    return coilPosts[n - 3 * poleCount()];
}

void RelayElm::reset() {
    CircuitElm::reset();
    ind.reset();
    coilCurrent = coilCurCount = 0;
    for (int i = 0; i != poleCount(); i++)
        switchCurrent[i] = switchCurCount[i] = 0;
    d_position = i_position = 0;

    // preserve onState because if we don't, Relay Flip-Flop gets left in a weird state on reset.
    // onState = false;
}

void RelayElm::stamp() {
    // inductor from coil post 1 to internal node
    ind.stamp(nodes[nCoil1], nodes[nCoil3]);
    // resistor from internal node to coil post 2
    sim->stampResistor(nodes[nCoil3], nodes[nCoil2], coilR());

    for (int i = 0; i != poleCount() * 3; i++)
        sim->stampNonLinear(nodes[nSwitch0 + i]);

    // stamp pulldown resistors from switch contacts to ground using r_off,
    // matching the analog switch approach
    if (needsPulldown()) {
        for (int i = 0; i < poleCount(); i++) {
            sim->stampResistor(nodes[nSwitch1 + i * 3], CircuitNode::ground, r_off());
            sim->stampResistor(nodes[nSwitch2 + i * 3], CircuitNode::ground, r_off());
        }
    }
}

void RelayElm::startIteration() {
    // using old model?
    if (switchingTime() == 0) {
        startIterationOld();
        return;
    }
    ind.startIteration(nodes[nCoil1]->v - nodes[nCoil3]->v);
    double absCurrent = std::abs(coilCurrent);

    if (onState) {
        // on or turning on.  check if we need to turn off
        if (absCurrent < offCurrent()) {
            // turning off, set switch to intermediate position
            onState = false;
            i_position = 2;
        } else {
            d_position += sim->timeStep / switchingTime();
            if (d_position >= 1)
                d_position = i_position = 1;
        }
    } else {
        // off or turning off.  check if we need to turn on
        if (absCurrent > onCurrent()) {
            // turning on, set switch to intermediate position
            onState = true;
            i_position = 2;
        } else {
            d_position -= sim->timeStep / switchingTime();
            if (d_position <= 0)
                d_position = i_position = 0;
        }
    }
}

void RelayElm::startIterationOld() {
    ind.startIteration(nodes[nCoil1]->v - nodes[nCoil3]->v);

    // magic value to balance operate speed with reset speed not at all realistically
    const double magic = 1.3;
    double pmult = std::sqrt(magic + 1);
    double c = onCurrent();
    double p = coilCurrent * pmult / c;
    d_position = std::abs(p * p) - 1.3;
    if (d_position < 0)
        d_position = 0;
    if (d_position > 1)
        d_position = 1;
    if (d_position < .1)
        i_position = 0;
    else if (d_position > .9)
        i_position = 1;
    else
        i_position = 2;
}

void RelayElm::doStep() {
    double voltdiff = nodes[nCoil1]->v - nodes[nCoil3]->v;
    ind.doStep(voltdiff);
    for (int p = 0; p != poleCount() * 3; p += 3) {
        if (i_position == 0) {
            sim->stampResistor(nodes[nSwitch0 + p], nodes[nSwitch1 + p], r_on());
            if (!needsPulldown())
                sim->stampResistor(nodes[nSwitch0 + p], nodes[nSwitch2 + p], r_off());
        } else if (i_position == 1) {
            sim->stampResistor(nodes[nSwitch0 + p], nodes[nSwitch2 + p], r_on());
            if (!needsPulldown())
                sim->stampResistor(nodes[nSwitch0 + p], nodes[nSwitch1 + p], r_off());
        } else {
            // intermediate position: both contacts open, need r_off
            // to avoid floating pole node
            sim->stampResistor(nodes[nSwitch0 + p], nodes[nSwitch1 + p], r_off());
            sim->stampResistor(nodes[nSwitch0 + p], nodes[nSwitch2 + p], r_off());
        }
    }
}

void RelayElm::calculateCurrent() {
    double voltdiff = nodes[nCoil1]->v - nodes[nCoil3]->v;
    coilCurrent = ind.calculateCurrent(voltdiff);

    // actually this isn't correct, since there is a small amount
    // of current through the switch when off
    for (int p = 0; p != poleCount(); p++) {
        if (i_position == 2)
            switchCurrent[p] = 0;
        else
            switchCurrent[p] = (nodes[nSwitch0 + p * 3]->v - nodes[nSwitch1 + p * 3 + i_position]->v) / r_on();
    }
}

void RelayElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS("relay");
    arr[0] += " (" + (switchingTime() == 0 ? std::string("old model") : modelName) + ")";
    arr[1] = (i_position == 0) ? Locale::LS("off") : Locale::LS("on");
    size_t ln = 2;
    for (int i = 0; i != poleCount(); i++) {
        if (ln >= arr.size())
            arr.resize(ln + 1);
        arr[ln++] = "I" + std::to_string(i + 1) + " = " + getCurrentDText(switchCurrent[i]);
    }
    if (ln + 2 > arr.size())
        arr.resize(ln + 2);
    arr[ln++] = Locale::LS("coil I") + " = " + getCurrentDText(coilCurrent);
    arr[ln++] = Locale::LS("coil Vd") + " = " + getVoltageDText(nodes[nCoil1]->v - nodes[nCoil2]->v);
}

std::optional<EditInfo> RelayElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Model", 0, -1, -1);
        models = RelayModel::getModelList();
        ei.choice = Choice();
        for (size_t i = 0; i != models.size(); i++) {
            RelayModel *rm = models[i];
            ei.choice->add(rm->getDescription());
            if (rm == model)
                ei.choice->select((int) i);
        }
        return ei;
    }
    if (n == 1) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Create New Model")};
        return ei;
    }
    if (n == 2) {
        if (model->readOnly)
            return std::nullopt;
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Edit Model")};
        return ei;
    }
    return std::nullopt;
}

void RelayElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        model = models[ei.choice->getSelectedIndex()];
        modelName = model->name;
        lastModelName = modelName;
        ind.setup(inductance(), coilCurrent, Inductor::FLAG_BACK_EULER);
        setPoints();
        ei.newDialog = true;
        return;
    }
    if (n == 1) {
        // the TS version names and registers the copy when its dialog is applied
        RelayModel *newModel = new RelayModel(*model);
        newModel->pickName();
        newModelCreated(newModel);
        ei.newDialog = true;
        app->doEditModel(newModel);
        return;
    }
    if (n == 2) {
        if (!model->readOnly)
            app->doEditModel(model);
        return;
    }
}

bool RelayElm::getConnection(int n1, int n2) {
    if (n1 / 3 != n2 / 3)
        return false;

    // nodes in the same group (both coil or both same switch) are potentially connected
    return true;
}

bool RelayElm::hasGroundConnection(int n) {
    // switch contact nodes have ground connection via pulldown
    return needsPulldown() && n < nCoil1;
}

void RelayElm::flipX(int c2, int count) {
    if (dx == 0)
        flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void RelayElm::flipY(int c2, int count) {
    if (dy == 0)
        flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}

void RelayElm::flipXY(int xmy, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipXY(xmy, count);
}

void RelayElm::dumpXmlModel(XmlElement *doc) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
}

RegistryModel *RelayElm::getModel() {
    return model;
}
