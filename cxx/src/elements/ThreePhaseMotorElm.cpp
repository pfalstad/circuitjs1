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

#include "ThreePhaseMotorElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

ThreePhaseMotorElm::ThreePhaseMotorElm(int xx, int yy) : CircuitElm(xx, yy) {
    Rs = 0.435;
    Rr = 0.816;
    Ls = 0.0294;
    Lr = 0.0297;
    Lm = 0.0287;
    J = 1;
    b = 0.05;
    coilCurrents.assign(coilCount, 0);
    coilCurSourceValues.assign(coilCount, 0);
}

ThreePhaseMotorElm::ThreePhaseMotorElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    Rs = parseFloatStrict(st.nextToken());
    Rr = parseFloatStrict(st.nextToken());
    Ls = parseFloatStrict(st.nextToken());
    Lr = parseFloatStrict(st.nextToken());
    Lm = parseFloatStrict(st.nextToken());
    b = parseFloatStrict(st.nextToken());
    try {
        J = parseFloatStrict(st.nextToken());
    } catch (...) {
        J = 1;
    }
    coilCurrents.assign(coilCount, 0);
    coilCurSourceValues.assign(coilCount, 0);
}

void ThreePhaseMotorElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "rs", Rs);
    CircuitXMLSerializer::dumpAttr(elem, "rr", Rr);
    CircuitXMLSerializer::dumpAttr(elem, "ls", Ls);
    CircuitXMLSerializer::dumpAttr(elem, "lr", Lr);
    CircuitXMLSerializer::dumpAttr(elem, "lm", Lm);
    CircuitXMLSerializer::dumpAttr(elem, "b", b);
    CircuitXMLSerializer::dumpAttr(elem, "j", J);
}

void ThreePhaseMotorElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    Rs = xml.parseDoubleAttr("rs", Rs);
    Rr = xml.parseDoubleAttr("rr", Rr);
    Ls = xml.parseDoubleAttr("ls", Ls);
    Lr = xml.parseDoubleAttr("lr", Lr);
    Lm = xml.parseDoubleAttr("lm", Lm);
    b = xml.parseDoubleAttr("b", b);
    J = xml.parseDoubleAttr("j", J);
}

void ThreePhaseMotorElm::setPoints() {
    CircuitElm::setPoints();
    posts = newPointArray(6);
    leads = newPointArray(6);
    int q = (std::abs(dy) > std::abs(dx)) ? -1 : 1;
    for (int i = 0; i != 3; i++) {
        interpPoint(point1, point2, posts[i * 2], 0, -q * 32 * (i - 1));
        interpPoint(point1, point2, leads[i * 2], 0.45, -q * 32 * (i - 1));
        interpPoint(point1, point2, posts[i * 2 + 1], 1, q * 32 * (i - 1));
        interpPoint(point1, point2, leads[i * 2 + 1], 0.55, q * 32 * (i - 1));
    }
    motorCenter = interpPoint(point1, point2, 0.5);
    allocNodes();
}

void ThreePhaseMotorElm::reset() {
    CircuitElm::reset();
    filteredSpeed = speed = 0;
    coilCurSourceValues.assign(coilCount, 0);
    coilCurrents.assign(coilCount, 0);
}

void ThreePhaseMotorElm::stamp() {
    const NodeRef &n001 = nodes[n001_ind];
    const NodeRef &n002 = nodes[n002_ind];
    const NodeRef &n003 = nodes[n003_ind];
    const NodeRef &n004 = nodes[n004_ind];
    const NodeRef &n005 = nodes[n005_ind];
    const NodeRef &n006 = nodes[n006_ind];
    const NodeRef &n007 = nodes[n007_ind];

    sim->stampResistor(nodes[0], n001, Rs);
    sim->stampResistor(nodes[2], n003, Rs);
    sim->stampResistor(nodes[4], n005, Rs);
    sim->stampResistor(n004, CircuitNode::ground, 1.5 * Rr);
    sim->stampResistor(n007, CircuitNode::ground, 1.5 * Rr);

    double Lr2 = Lr * 1.5;
    double coilInductances[coilCount] = {Ls, Ls, Ls, Lr2, Lr2};
    xformMatrix.assign(coilCount, std::vector<double>(coilCount, 0));
    for (int i = 0; i != coilCount; i++)
        xformMatrix[i][i] = coilInductances[i];
    double k0 = Lm / std::sqrt(Ls * Lr2);
    double cc[coilCount][coilCount] = {};
    cc[0][3] = cc[3][0] = k0;
    cc[1][3] = cc[3][1] = -k0 / 2;
    cc[1][4] = cc[4][1] = k0 * std::sqrt(3) / 2;
    cc[2][3] = cc[3][2] = -k0 / 2;
    cc[2][4] = cc[4][2] = -k0 * std::sqrt(3) / 2;
    for (int i = 0; i != coilCount; i++)
        for (int j = 0; j != i; j++)
            xformMatrix[i][j] = xformMatrix[j][i] = cc[i][j] * std::sqrt(coilInductances[i] * coilInductances[j]);

    SimulationManager::invertMatrix(xformMatrix, coilCount);
    double ts = sim->timeStep;
    for (int i = 0; i != coilCount; i++)
        for (int j = 0; j != coilCount; j++) {
            xformMatrix[i][j] *= ts;
            int ni1 = coilNodes[i * 2], nj1 = coilNodes[j * 2];
            int ni2 = coilNodes[i * 2 + 1], nj2 = coilNodes[j * 2 + 1];
            if (i == j)
                sim->stampConductance(nodes[ni1], nodes[ni2], xformMatrix[i][i]);
            else
                sim->stampVCCurrentSource(nodes[ni1], nodes[ni2], nodes[nj1], nodes[nj2], xformMatrix[i][j]);
        }
    // (the TS version marks the right side of each coil node as changing here; that's a no-op)

    sim->stampVoltageSource(n002, CircuitNode::ground, voltSources[0]);
    sim->stampVoltageSource(n006, CircuitNode::ground, voltSources[1]);
    nodeCurrents.assign(getNodeCount(), 0);
}

void ThreePhaseMotorElm::setVoltageSource(int n, VoltageSource *v) {
    voltSources[n] = v;
    if (n == 0)
        v->setNodes(nodes[n002_ind], CircuitNode::ground);
    else
        v->setNodes(nodes[n006_ind], CircuitNode::ground);
}

void ThreePhaseMotorElm::startIteration() {
    for (int i = 0; i != coilCount; i++)
        coilCurSourceValues[i] = coilCurrents[i];
    double torque = Zp * std::sqrt(3) / 2 * Lm *
        ((coilCurrents[1] - coilCurrents[2]) * coilCurrents[3] -
         std::sqrt(3) * coilCurrents[0] * coilCurrents[4]);
    speed += sim->timeStep * (torque - b * speed) / J;
    angle = angle + speed * sim->timeStep;
    vs1value = -Zp * speed * (Lm * std::sqrt(3) / 2 * (coilCurrents[1] - coilCurrents[2]) + 1.5 * Lr * coilCurrents[4]);
    vs2value = Zp * speed * (1.5 * Lm * coilCurrents[0] + 1.5 * Lr * coilCurrents[3]);
}

void ThreePhaseMotorElm::doStep() {
    for (int i = 0; i != coilCount; i++) {
        int n1 = coilNodes[i * 2], n2 = coilNodes[i * 2 + 1];
        sim->stampCurrentSource(nodes[n1], nodes[n2], coilCurSourceValues[i]);
    }
    sim->updateVoltageSource(nodes[n002_ind], CircuitNode::ground, voltSources[0], -vs1value);
    sim->updateVoltageSource(nodes[n006_ind], CircuitNode::ground, voltSources[1], -vs2value);
}

void ThreePhaseMotorElm::calculateCurrent() {
    std::fill(nodeCurrents.begin(), nodeCurrents.end(), 0);
    for (int i = 0; i != coilCount; i++) {
        double val = coilCurSourceValues[i];
        if (!xformMatrix.empty()) {
            for (int j = 0; j != coilCount; j++) {
                int n1 = coilNodes[j * 2], n2 = coilNodes[j * 2 + 1];
                val += (nodes[n1]->v - nodes[n2]->v) * xformMatrix[i][j];
            }
        }
        coilCurrents[i] = val;
        // (nodeCurrents isn't read anywhere; before the first stamp() it's empty)
        int ni = coilNodes[i];
        if (ni + 1 < (int) nodeCurrents.size()) {
            nodeCurrents[ni] += val;
            nodeCurrents[ni + 1] -= val;
        }
    }
}

void ThreePhaseMotorElm::draw(Graphics &g) {
    setBbox(point1, point2, cr);
    for (int i = 0; i != 6; i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, posts[i], leads[i]);
    }
    for (int i = 0; i != 3; i++) {
        curcounts[i] = updateDotCount(coilCurrents[i], curcounts[i]);
        drawDots(g, posts[i * 2], leads[i * 2], curcounts[i]);
        drawDots(g, leads[i * 2 + 1], posts[i * 2 + 1], curcounts[i]);
    }
    setPowerColor(g, true);
    g.setColor(Color(165, 165, 165));
    g.fillOval(motorCenter.x - cr, motorCenter.y - cr, cr * 2, cr * 2);
    g.setColor(Color(10, 10, 10));
    double angleAux = jsmath::round(angle * 300.0) / 300.0;
    g.fillOval(motorCenter.x - std::trunc(cr / 2.2), motorCenter.y - std::trunc(cr / 2.2),
        std::trunc(2 * cr / 2.2), std::trunc(2 * cr / 2.2));
    double q = 0.28 * 1.7 * 36 / dn * 37 / 27;
    for (int k = 0; k < 3; k++) {
        double a = angleAux + k * pi / 3;
        interpPointFix(point1, point2, ps1, 0.5 + q * jsmath::cos(a), q * jsmath::sin(a));
        interpPointFix(point1, point2, ps2, 0.5 - q * jsmath::cos(a), -q * jsmath::sin(a));
        drawThickerLine(g, ps1, ps2);
    }
    drawPosts(g);
    g.setColor(needsHighlight() ? selectColor : whiteColor);
    g.save();
    const char *uvw = "UVW";
    if (std::abs(dy) > std::abs(dx)) {
        for (int i = 0; i != 3; i++) {
            const int d1 = 5;
            g.drawString(std::string(1, uvw[i]) + "1", posts[i * 2].x + d1, posts[i * 2].y + 8);
            g.drawString(std::string(1, uvw[i]) + "2", posts[i * 2 + 1].x + d1, posts[i * 2 + 1].y - 2);
        }
    } else {
        g.setTextAlign(Graphics::ALIGN_CENTER);
        for (int i = 0; i != 3; i++) {
            const int d1 = 11, d2 = 7;
            g.drawString(std::string(1, uvw[i]) + "1", posts[i * 2].x + d1, posts[i * 2].y - d2);
            g.drawString(std::string(1, uvw[i]) + "2", posts[i * 2 + 1].x - d1, posts[i * 2 + 1].y - d2);
        }
    }
    g.restore();
    filteredSpeed = filteredSpeed * 0.98 + speed * 0.02;
}

void ThreePhaseMotorElm::drawThickerLine(Graphics &g, const Point &pa, const Point &pb) {
    g.setLineWidth(6.0);
    g.drawLine(pa.x, pa.y, pb.x, pb.y);
    g.setLineWidth(1.0);
}

void ThreePhaseMotorElm::interpPointFix(const Point &a, const Point &b, Point &c, double f, double gg) {
    int gx = b.y - a.y, gy = a.x - b.x;
    c.x = (int) jsmath::round(a.x * (1 - f) + b.x * f + gg * gx);
    c.y = (int) jsmath::round(a.y * (1 - f) + b.y * f + gg * gy);
}

void ThreePhaseMotorElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "3-Phase Motor";
    getBasicInfo(arr);
    arr[3] = Locale::LS("speed") + " = " + getUnitText(60 * std::abs(filteredSpeed) / (2 * pi), Locale::LS("RPM"));
}

double ThreePhaseMotorElm::getCurrentIntoNode(int n) {
    return n % 2 == 1 ? coilCurrents[n / 2] : -coilCurrents[n / 2];
}

std::optional<EditInfo> ThreePhaseMotorElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Stator Inductance (H)", Ls, 0, 0);
    if (n == 1)
        return EditInfo("Rotor Inductance (H)", Lr, 0, 0);
    if (n == 2)
        return EditInfo("Coupling Coefficient", Lm / std::sqrt(Ls * Lr), 0, 0).setDimensionless();
    if (n == 3)
        return EditInfo("Stator Resistance (ohms)", Rs, 0, 0);
    if (n == 4)
        return EditInfo("Rotor Resistance (ohms)", Rr, 0, 0);
    if (n == 5)
        return EditInfo("Friction coefficient (Nms/rad)", b, 0, 0);
    if (n == 6)
        return EditInfo("Moment of inertia (Kg.m^2)", J, 0, 0);
    return std::nullopt;
}

void ThreePhaseMotorElm::setEditValue(int n, EditInfo &ei) {
    if (ei.value > 0 && n == 0)
        Ls = ei.value;
    if (ei.value > 0 && n == 1)
        Lr = ei.value;
    if (ei.value > 0 && ei.value < 1 && n == 2)
        Lm = ei.value * std::sqrt(Ls * Lr);
    if (ei.value > 0 && n == 3)
        Rs = ei.value;
    if (ei.value > 0 && n == 4)
        Rr = ei.value;
    if (n == 5)
        b = ei.value;
    if (ei.value > 0 && n == 6)
        J = ei.value;
}
