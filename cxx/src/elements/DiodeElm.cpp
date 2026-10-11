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

#include "DiodeElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/DiodeModel.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/Graphics.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/JsMath.h"
#include "../core/WireRouter.h"

std::string DiodeElm::lastModelName = "default";

DiodeElm::DiodeElm(int xx, int yy) : CircuitElm(xx, yy), diode(sim) {
    modelName = lastModelName;
    setup();
}

DiodeElm::DiodeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), diode(sim) {
    const double defaultdrop = .805904783;
    double fwdrop = defaultdrop;
    const double zvoltage = 0;
    if ((f & FLAG_MODEL) != 0) {
        modelName = CustomLogicModel::unescape(st.nextToken());
    } else {
        if ((f & FLAG_FWDROP) > 0) {
            try {
                fwdrop = parseFloatStrict(st.nextToken());
            } catch (...) {}
        }
        model = DiodeModel::getModelWithParameters(fwdrop, zvoltage);
        modelName = model->name;
    }
    setup();
}

void DiodeElm::setup() {
    model = DiodeModel::getModelWithNameOrCopy(modelName, model);
    modelName = model->name;  // in case we couldn't find that model
    diode.setup(model);
    hasResistance = (model->seriesResistance > 0);
    diodeEndNode = hasResistance ? 2 : 1;
    allocNodes();
}

void DiodeElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mo", modelName);
}

void DiodeElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    modelName = xml.parseStringAttr("mo", modelName).value_or(modelName);
    setup();
}

void DiodeElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(16);
    cathode = newPointArray(2);
    std::vector<Point> pa = newPointArray(2);
    interpPoint2(lead1, lead2, pa[0], pa[1], 0, hs);
    interpPoint2(lead1, lead2, cathode[0], cathode[1], 1, hs);
    poly = createPolygon(pa[0], pa[1], lead2);
}

void DiodeElm::reset() {
    diode.reset();
    curcount = 0;
}

void DiodeElm::stamp() {
    if (hasResistance) {
        // create diode from node 0 to internal node
        diode.stamp(nodes[0], nodes[2]);
        // create resistor from internal node to node 1
        sim->stampResistor(nodes[1], nodes[2], model->seriesResistance);
    } else {
        // don't need any internal nodes if no series resistance
        diode.stamp(nodes[0], nodes[1]);
    }
}

void DiodeElm::doStep() {
    diode.doStep(nodes[0]->v - nodes[diodeEndNode]->v);
}

void DiodeElm::calculateCurrent() {
    current = diode.calculateCurrent(nodes[0]->v - nodes[diodeEndNode]->v);
}

void DiodeElm::newModelCreated(DiodeModel *dm) {
    model = dm;
    modelName = model->name;
    setup();
}

void DiodeElm::stepFinished() {
    // stop for huge currents that make simulator act weird
    if (std::abs(current) > 1e12)
        sim->stop("max current exceeded", this);
}

void DiodeElm::draw(Graphics &g) {
    drawDiode(g);
    doDots(g);
    drawPosts(g);
}

void DiodeElm::drawDiode(Graphics &g) {
    setBbox(point1, point2, hs);

    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;

    draw2Leads(g);

    // draw arrow thingy
    setVoltageColor(g, v1);
    setPowerColor(g, true);
    g.fillPolygon(poly);

    // draw thing arrow is pointing to
    setVoltageColor(g, v2);
    setPowerColor(g, true);
    drawThickLine(g, cathode[0], cathode[1]);
}

void DiodeElm::getInfo(std::vector<std::string> &arr) {
    if (model->oldStyle)
        arr[0] = "diode";
    else
        arr[0] = Locale::LS("diode") + " (" + modelName + ")";
    arr[1] = "I = " + getCurrentText(getCurrent());
    arr[2] = "Vd = " + getVoltageText(getVoltageDiff());
    arr[3] = "P = " + getUnitText(getPower(), "W");
    if (model->oldStyle)
        arr[4] = "Vf = " + getVoltageText(model->fwdrop);
}

std::optional<EditInfo> DiodeElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Model", 0, -1, -1);
        models = DiodeModel::getModelList(isZenerElm());
        ei.choice = Choice();
        for (size_t i = 0; i != models.size(); i++) {
            DiodeModel *dm = models[i];
            ei.choice->add(dm->getDescription());
            if (dm == model)
                ei.choice->select((int) i);
        }
        return ei;
    }
    // TODO: Create New Simple/Advanced Model and Edit Model buttons (need the model dialog)
    return std::nullopt;
}

void DiodeElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        model = models[ei.choice->getSelectedIndex()];
        modelName = model->name;
        setup();
        ei.newDialog = true;
    }
}

void DiodeElm::addRoutingObstacle(WireRouter &wr) {
    addRoutingObstacleWithLeads(wr, hs);
}

void DiodeElm::dumpXmlModel(XmlElement *doc) {
    if (!(model->builtIn || model->dumped))
        model->dumpXml(doc);
}
