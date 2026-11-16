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

#include "DCMotorElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

DCMotorElm::DCMotorElm(int xx, int yy) : CircuitElm(xx, yy), ind(sim), indInertia(sim) {
    inductance = 0.5;
    resistance = 1;
    angle = pi / 2;
    K = 0.15;
    b = 0.05;
    J = 0.02;
    Kb = 0.15;
    gearRatio = 1;
    tau = 0;
    ind.setup(inductance, 0, Inductor::FLAG_BACK_EULER);
    indInertia.setup(J, 0, Inductor::FLAG_BACK_EULER);
}

DCMotorElm::DCMotorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f), ind(sim), indInertia(sim) {
    angle = pi / 2;
    inductance = parseFloatStrict(st.nextToken());
    resistance = parseFloatStrict(st.nextToken());
    K = parseFloatStrict(st.nextToken());
    Kb = parseFloatStrict(st.nextToken());
    J = parseFloatStrict(st.nextToken());
    b = parseFloatStrict(st.nextToken());
    gearRatio = parseFloatStrict(st.nextToken());
    tau = parseFloatStrict(st.nextToken());
    ind.setup(inductance, 0, Inductor::FLAG_BACK_EULER);
    indInertia.setup(J, 0, Inductor::FLAG_BACK_EULER);
}

void DCMotorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "in", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "rs", resistance);
    CircuitXMLSerializer::dumpAttr(elem, "k", K);
    CircuitXMLSerializer::dumpAttr(elem, "kb", Kb);
    CircuitXMLSerializer::dumpAttr(elem, "j", J);
    CircuitXMLSerializer::dumpAttr(elem, "b", b);
    CircuitXMLSerializer::dumpAttr(elem, "gr", gearRatio);
    CircuitXMLSerializer::dumpAttr(elem, "ta", tau);
}

void DCMotorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    inductance = xml.parseDoubleAttr("in", inductance);
    resistance = xml.parseDoubleAttr("rs", resistance);
    K = xml.parseDoubleAttr("k", K);
    Kb = xml.parseDoubleAttr("kb", Kb);
    J = xml.parseDoubleAttr("j", J);
    b = xml.parseDoubleAttr("b", b);
    gearRatio = xml.parseDoubleAttr("gr", gearRatio);
    tau = xml.parseDoubleAttr("ta", tau);
    ind = Inductor(sim);
    indInertia = Inductor(sim);
    ind.setup(inductance, 0, Inductor::FLAG_BACK_EULER);
    indInertia.setup(J, 0, Inductor::FLAG_BACK_EULER);
}

void DCMotorElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(36);
    motorCenter = interpPoint(point1, point2, 0.5);
    allocNodes();
}

void DCMotorElm::setVoltageSource(int n, VoltageSource *v) {
    voltSources[n] = v;
    if (n == 0)
        v->setNodes(nodes[3], nodes[1]);
    else
        v->setNodes(nodes[4], CircuitNode::ground);
}

void DCMotorElm::reset() {
    CircuitElm::reset();
    ind.reset();
    indInertia.reset();
    coilCurrent = 0;
    inertiaCurrent = 0;
}

void DCMotorElm::stamp() {
    ind.stamp(nodes[0], nodes[2]);
    sim->stampResistor(nodes[2], nodes[3], resistance);
    sim->stampVoltageSource(nodes[3], nodes[1], voltSources[0]);
    indInertia.stamp(nodes[4], nodes[5]);
    sim->stampResistor(nodes[5], CircuitNode::ground, b);
    sim->stampVoltageSource(nodes[4], CircuitNode::ground, voltSources[1]);
}

void DCMotorElm::startIteration() {
    ind.startIteration(nodes[0]->v - nodes[2]->v);
    indInertia.startIteration(nodes[4]->v - nodes[5]->v);
    angle = angle + speed * sim->timeStep;
}

void DCMotorElm::doStep() {
    sim->updateVoltageSource(nodes[4], CircuitNode::ground, voltSources[1], coilCurrent * K);
    sim->updateVoltageSource(nodes[3], nodes[1], voltSources[0], inertiaCurrent * Kb);
    ind.doStep(nodes[0]->v - nodes[2]->v);
    indInertia.doStep(nodes[4]->v - nodes[5]->v);
}

void DCMotorElm::calculateCurrent() {
    coilCurrent = ind.calculateCurrent(nodes[0]->v - nodes[2]->v);
    inertiaCurrent = indInertia.calculateCurrent(nodes[4]->v - nodes[5]->v);
    speed = inertiaCurrent;
}

void DCMotorElm::draw(Graphics &g) {
    const int cr = 18;
    setBbox(point1, point2, cr);
    draw2Leads(g);
    doDots(g);
    setPowerColor(g, true);
    g.setColor(Color(165, 165, 165));
    g.fillOval(motorCenter.x - cr, motorCenter.y - cr, cr * 2, cr * 2);
    g.setColor(Color(10, 10, 10));
    double angleAux = jsmath::round(angle * 300.0) / 300.0;
    g.fillOval(motorCenter.x - std::trunc(cr / 2.2), motorCenter.y - std::trunc(cr / 2.2),
        std::trunc(2 * cr / 2.2), std::trunc(2 * cr / 2.2));
    for (int k = 0; k < 3; k++) {
        double a = angleAux * gearRatio + k * pi / 3;
        interpPointFix(lead1, lead2, ps1, 0.5 + 0.28 * jsmath::cos(a), 0.28 * jsmath::sin(a));
        interpPointFix(lead1, lead2, ps2, 0.5 - 0.28 * jsmath::cos(a), -0.28 * jsmath::sin(a));
        drawThickerLine(g, ps1, ps2);
    }
    drawPosts(g);
}

void DCMotorElm::drawThickerLine(Graphics &g, const Point &pa, const Point &pb) {
    g.setLineWidth(6.0);
    g.drawLine(pa.x, pa.y, pb.x, pb.y);
    g.setLineWidth(1.0);
}

void DCMotorElm::interpPointFix(const Point &a, const Point &b, Point &c, double f, double gg) {
    int gx = b.y - a.y;
    int gy = a.x - b.x;
    c.x = (int) jsmath::round(a.x * (1 - f) + b.x * f + gg * gx);
    c.y = (int) jsmath::round(a.y * (1 - f) + b.y * f + gg * gy);
}

void DCMotorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "DC Motor";
    getBasicInfo(arr);
    arr[3] = Locale::LS("speed") + " = " + getUnitText(60 * std::abs(speed) / (2 * pi), Locale::LS("RPM"));
    arr[4] = "L = " + getUnitText(inductance, "H");
    arr[5] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[6] = "P = " + getUnitText(getPower(), "W");
}

std::optional<EditInfo> DCMotorElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Armature inductance (H)", inductance, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Armature Resistance (ohms)", resistance, 0, 0).setPositive();
    if (n == 2)
        return EditInfo("Torque constant (Nm/A)", K, 0, 0).setPositive();
    if (n == 3)
        return EditInfo("Moment of inertia (Kg.m^2)", J, 0, 0).setPositive();
    if (n == 4)
        return EditInfo("Friction coefficient (Nms/rad)", b, 0, 0).setPositive();
    if (n == 5)
        return EditInfo("Gear Ratio", gearRatio, 0, 0).setPositive();
    return std::nullopt;
}

void DCMotorElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0) {
        inductance = ei.value;
        ind.setup(inductance, current, Inductor::FLAG_BACK_EULER);
    }
    if (n == 1 && ei.value > 0)
        resistance = ei.value;
    if (n == 2 && ei.value > 0) {
        K = ei.value;
        Kb = K;
    }
    if (n == 3 && ei.value > 0) {
        J = ei.value;
        indInertia.setup(J, inertiaCurrent, Inductor::FLAG_BACK_EULER);
    }
    if (n == 4 && ei.value > 0)
        b = ei.value;
    if (n == 5 && ei.value > 0)
        gearRatio = ei.value;
}
