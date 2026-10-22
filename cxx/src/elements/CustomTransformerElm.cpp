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

#include "CustomTransformerElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "Inductor.h"

CustomTransformerElm::CustomTransformerElm(int xx, int yy) : CircuitElm(xx, yy) {
    inductance = 4;
    width = 32;
    noDiagonal = true;
    couplingCoef = 0.999;
    description = "1,1:1";
    parseDescription(description);
}

CustomTransformerElm::CustomTransformerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    width = 32;
    inductance = parseFloatStrict(st.nextToken());
    couplingCoef = parseFloatStrict(st.nextToken());
    description = CustomLogicModel::unescape(st.nextToken());
    coilCount = parseIntStrict(st.nextToken());
    coilCurrents.assign(coilCount, 0);
    for (int i = 0; i != coilCount; i++)
        coilCurrents[i] = parseFloatStrict(st.nextToken());
    noDiagonal = true;
    parseDescription(description);
}

void CustomTransformerElm::drag(int xx, int yy) {
    xx = snapGrid(xx);
    yy = snapGrid(yy);
    if (xx == x)
        yy = y;
    x2 = xx;
    y2 = yy;
    setPoints();
}

void CustomTransformerElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "in", inductance);
    CircuitXMLSerializer::dumpAttr(elem, "cc", couplingCoef);
    CircuitXMLSerializer::dumpAttr(elem, "ds", description);
    CircuitXMLSerializer::dumpAttr(elem, "nc", coilCount);
}

void CustomTransformerElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    std::string s;
    for (int i = 0; i != coilCount; i++) {
        if (i > 0)
            s += " ";
        s += jsNumberToString(coilCurrents[i]);
    }
    CircuitXMLSerializer::dumpAttr(elem, "ci", s);
}

void CustomTransformerElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    inductance = xml.parseDoubleAttr("in", inductance);
    couplingCoef = xml.parseDoubleAttr("cc", couplingCoef);
    description = xml.parseStringAttr("ds", description).value_or(description);
    coilCount = xml.parseIntAttr("nc", coilCount);
    coilCurrents.assign(coilCount, 0);
    std::optional<std::string> ci = xml.parseStringAttr("ci", std::nullopt);
    if (ci) {
        StringTokenizer st(*ci, " ");
        for (int i = 0; i != coilCount && st.hasMoreTokens(); i++)
            coilCurrents[i] = parseFloatStrict(st.nextToken());
    }
    parseDescription(description);
}

bool CustomTransformerElm::parseDescription(const std::string &desc, EditInfo *ei) {
    // a number indicates a coil (number = turns ratio to base inductance coil)
    // (negative number = reverse polarity)
    // : separates primary and secondary
    // , separates two coils
    // + separates two connected coils (tapped)
    std::vector<std::string> tokens = tokenizeDesc(desc);

    // count coils/nodes
    coilCount = nodeCount = 0;
    for (const std::string &s : tokens) {
        if (s == "+")
            nodeCount--;
        if (s == "," || s == "+" || s == ":")
            continue;
        nodeCount += 2;
        coilCount++;
    }

    if (coilCount == 0) {
        if (ei)
            ei->setError("no coils defined");
        return false;
    }

    coilNodes.assign(coilCount, 0);
    coilInductances.assign(coilCount, 0);
    // save coil currents if possible (needed for undumping)
    if ((int) coilCurrents.size() != coilCount)
        coilCurrents.assign(coilCount, 0);
    coilCurCounts.assign(coilCount, 0);
    coilCurSourceValues.assign(coilCount, 0);
    coilPolarities.assign(coilCount, 0);
    nodePoints = newPointArray(nodeCount);
    nodeTaps = newPointArray(nodeCount);
    nodeCurrents.assign(nodeCount, 0);
    nodeCurCounts.assign(nodeCount, 0);

    // start over
    int nodeNum = 0;
    int coilNum = 0;
    primaryCoils = 0;
    bool secondary = false;
    needDots = false;
    size_t ti = 0;
    while (true) {
        const std::string &tok = tokens[ti++];
        double n = 0;
        // (the TS version uses parseFloatStrict(), which throws before its NaN check)
        double parsed = jsParseFloat(tok);
        if (std::isnan(parsed)) {
            if (ei)
                ei->setError("expected number, got '" + tok + "'");
            return false;
        }
        n = parsed;
        if (n == 0) {
            if (ei)
                ei->setError("turns ratio cannot be zero");
            return false;
        }
        // create new coil
        coilNodes[coilNum] = nodeNum;
        coilInductances[coilNum] = n * n * inductance;
        coilPolarities[coilNum] = 1;
        if (n < 0) {
            coilPolarities[coilNum] = -1;
            needDots = true;
        }
        nodeNum += 2;
        coilNum++;
        if (!secondary)
            primaryCoils = coilNum;
        if (ti >= tokens.size())
            break;
        const std::string &sep = tokens[ti++];
        if (sep == ",")
            continue;
        if (sep == "+") {
            nodeNum--;
            continue;
        }
        if (sep == ":") {
            // switch to secondary
            if (secondary) {
                if (ei)
                    ei->setError("only one ':' separator allowed");
                return false;
            }
            secondary = true;
            continue;
        }
        if (ei)
            ei->setError("unexpected '" + sep + "'");
        return false;
    }
    allocNodes();
    setPoints();
    xformMatrix.clear();
    return true;
}

std::vector<std::string> CustomTransformerElm::tokenizeDesc(const std::string &desc) {
    std::vector<std::string> result;
    std::string cur;
    for (char ch : desc) {
        if (ch == ',' || ch == ':' || ch == '+') {
            if (!cur.empty()) {
                result.push_back(cur);
                cur.clear();
            }
            result.push_back(std::string(1, ch));
        } else {
            cur += ch;
        }
    }
    if (!cur.empty())
        result.push_back(cur);
    return result;
}

bool CustomTransformerElm::isTrapezoidal() { return (flags & Inductor::FLAG_BACK_EULER) == 0; }

void CustomTransformerElm::draw(Graphics &g) {
    // draw taps
    for (int i = 0; i != getPostCount(); i++) {
        setVoltageColor(g, nodes[i]->v);
        drawThickLine(g, nodePoints[i], nodeTaps[i]);
    }

    // draw coils
    for (int i = 0; i != coilCount; i++) {
        int n = coilNodes[i];
        setVoltageColor(g, nodes[n]->v);
        setPowerColor(g, coilCurrents[i] * (nodes[n]->v - nodes[n + 1]->v));
        drawCoil(g, (i >= primaryCoils ? -6 * flip : 6 * flip),
            nodeTaps[n], nodeTaps[n + 1], nodes[n]->v, nodes[n + 1]->v);
        if (!dots.empty()) {
            g.setColor(needsHighlight() ? selectColor : lightGrayColor);
            g.fillOval(dots[i].x - 2, dots[i].y - 2, 5, 5);
        }
    }
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);

    // draw core
    for (int i = 0; i != 2; i++) {
        drawThickLine(g, ptCore[i], ptCore[i + 2]);
    }

    // draw coil currents
    for (int i = 0; i != coilCount; i++) {
        coilCurCounts[i] = updateDotCount(coilCurrents[i], coilCurCounts[i]);
        int ni = coilNodes[i];
        drawDots(g, nodeTaps[ni], nodeTaps[ni + 1], coilCurCounts[i]);
    }

    // draw tap currents
    for (int i = 0; i != nodeCount; i++) {
        nodeCurCounts[i] = updateDotCount(nodeCurrents[i], nodeCurCounts[i]);
        drawDots(g, nodePoints[i], nodeTaps[i], nodeCurCounts[i]);
    }

    drawPosts(g);
    setBbox(nodePoints[0], nodePoints[nodeCount - 1], 0);
    adjustBbox(ptCore[0], ptCore[3]);
}

void CustomTransformerElm::setPoints() {
    CircuitElm::setPoints();
    point2.y = point1.y;
    flip = hasFlag(FLAG_FLIP) ? -1 : 1;
    int primaryNodes = (primaryCoils == coilCount) ? nodeCount : coilNodes[primaryCoils];
    dn = std::abs(point1.x - point2.x);
    double ce = 0.5 - 12 / dn;
    double cd = 0.5 - 2 / dn;
    int maxWidth = 0;
    for (int step = 0; step != 2; step++) {
        int c = 0;
        int offset = 0;
        for (int i = 0; i != nodeCount; i++) {
            if (i == primaryNodes)
                offset = 0;
            if (step == 1) {
                if (i == primaryNodes - 1 || i == nodeCount - 1)
                    offset = maxWidth;
                interpPoint(point1, point2, nodePoints[i], i < primaryNodes ? 0 : 1, -offset * flip);
                interpPoint(point1, point2, nodeTaps[i], i < primaryNodes ? ce : 1 - ce, -offset * flip);
            }
            maxWidth = std::max(maxWidth, offset);
            int nn = c < coilCount ? coilNodes[c] : -1;
            if (nn == i) {
                // this is first node of a coil, make room
                c++;
                offset += width;
            } else {
                // this is last node of a coil, make small gap
                offset += 16;
            }
        }
    }
    ptCore = newPointArray(4);
    for (int i = 0; i != 4; i += 2) {
        int h = (i == 2) ? -maxWidth * flip : 0;
        interpPoint(point1, point2, ptCore[i], cd, h);
        interpPoint(point1, point2, ptCore[i + 1], 1 - cd, h);
    }

    if (needDots) {
        dots.assign(coilCount, Point());
        double dotp = std::abs(7.0 / width);
        for (int i = 0; i != coilCount; i++) {
            int n = coilNodes[i];
            dots[i] = interpPoint(nodeTaps[n], nodeTaps[n + 1],
                coilPolarities[i] > 0 ? dotp : 1 - dotp,
                i < primaryCoils ? -7 : 7);
        }
    } else {
        dots.clear();
    }
}

void CustomTransformerElm::reset() {
    for (int i = 0; i != coilCount; i++)
        coilCurrents[i] = coilCurSourceValues[i] = coilCurCounts[i] = 0;
    for (int i = 0; i != nodeCount; i++)
        nodes[i]->v = nodeCurrents[i] = nodeCurCounts[i] = 0;
}

void CustomTransformerElm::stamp() {
    // equations for transformer:
    //   v1 = L1  di1/dt + M12  di2/dt + M13 di3/dt + ...
    //   v2 = M21 di1/dt + L2 di2/dt   + M23 di3/dt + ...
    //   v3 = ... (one row for each coil)
    // we invert that to get:
    //   di1/dt = a1 v1 + a2 v2 + ...
    //   di2/dt = a3 v1 + a4 v2 + ...
    // integrate di1/dt using trapezoidal approx and we get:
    //   i1(t2) = i1(t1) + dt/2 (i1(t1) + i1(t2))
    //          = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1) + ... +
    //                     a1 dt/2 v1(t2) + a2 dt/2 v2(t2) + ...
    // the norton equivalent of this for i1 is:
    //  a. current source, I = i1(t1) + a1 dt/2 v1(t1) + a2 dt/2 v2(t1) + ...
    //  b. resistor, G = a1 dt/2
    //  c. current source controlled by voltage v2, G = a2 dt/2
    // and for i2:
    //  a. current source, I = i2(t1) + a3 dt/2 v1(t1) + a4 dt/2 v2(t1) + ...
    //  b. resistor, G = a3 dt/2
    //  c. current source controlled by voltage v2, G = a4 dt/2
    //
    // For backward euler, the current source value is just i1(t1) and we use
    // dt instead of dt/2 for the resistor and VCCS.
    xformMatrix.assign(coilCount, std::vector<double>(coilCount, 0));
    // fill diagonal
    for (int i = 0; i != coilCount; i++)
        xformMatrix[i][i] = coilInductances[i];
    // fill off-diagonal
    for (int i = 0; i != coilCount; i++)
        for (int j = 0; j != i; j++)
            xformMatrix[i][j] = xformMatrix[j][i] =
                couplingCoef * std::sqrt(coilInductances[i] * coilInductances[j]) *
                coilPolarities[i] * coilPolarities[j];

    SimulationManager::invertMatrix(xformMatrix, coilCount);

    double ts = isTrapezoidal() ? sim->timeStep / 2 : sim->timeStep;
    for (int i = 0; i != coilCount; i++)
        for (int j = 0; j != coilCount; j++) {
            // multiply in dt/2 (or dt for backward euler)
            xformMatrix[i][j] *= ts;
            int ni = coilNodes[i];
            int nj = coilNodes[j];
            if (i == j)
                sim->stampConductance(nodes[ni], nodes[ni + 1], xformMatrix[i][i]);
            else
                sim->stampVCCurrentSource(nodes[ni], nodes[ni + 1], nodes[nj], nodes[nj + 1], xformMatrix[i][j]);
        }
    // (the TS version marks the right side of each node as changing here; that's a no-op)
}

void CustomTransformerElm::startIteration() {
    for (int i = 0; i != coilCount; i++) {
        double val = coilCurrents[i];
        if (isTrapezoidal() && !xformMatrix.empty()) {
            for (int j = 0; j != coilCount; j++) {
                int n = coilNodes[j];
                double voltdiff = nodes[n]->v - nodes[n + 1]->v;
                val += voltdiff * xformMatrix[i][j];
            }
        }
        coilCurSourceValues[i] = val;
    }
}

void CustomTransformerElm::doStep() {
    for (int i = 0; i != coilCount; i++) {
        int n = coilNodes[i];
        sim->stampCurrentSource(nodes[n], nodes[n + 1], coilCurSourceValues[i]);
    }
}

void CustomTransformerElm::calculateCurrent() {
    for (int i = 0; i != nodeCount; i++)
        nodeCurrents[i] = 0;
    for (int i = 0; i != coilCount; i++) {
        double val = coilCurSourceValues[i];
        if (!xformMatrix.empty()) {
            for (int j = 0; j != coilCount; j++) {
                int n = coilNodes[j];
                double voltdiff = nodes[n]->v - nodes[n + 1]->v;
                val += voltdiff * xformMatrix[i][j];
            }
        }
        coilCurrents[i] = val;
        int ni = coilNodes[i];
        nodeCurrents[ni] += val;
        nodeCurrents[ni + 1] -= val;
    }
}

void CustomTransformerElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "transformer (custom)";
    arr[1] = "L = " + getUnitText(inductance, "H");
    for (int i = 0; i != coilCount; i++) {
        if (2 + i * 2 + 1 >= (int) arr.size())
            break;
        int ni = coilNodes[i];
        arr[2 + i * 2] = "Vd" + std::to_string(i + 1) + " = " + getVoltageText(nodes[ni]->v - nodes[ni + 1]->v);
        arr[3 + i * 2] = "I" + std::to_string(i + 1) + " = " + getCurrentText(coilCurrents[i]);
    }
}

bool CustomTransformerElm::getConnection(int n1, int n2) {
    for (int i = 0; i != coilCount; i++)
        if (comparePair(n1, n2, coilNodes[i], coilNodes[i] + 1))
            return true;
    return false;
}

std::optional<EditInfo> CustomTransformerElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Base Inductance (H)", inductance, 0.01, 5).setPositive();
    if (n == 1) {
        EditInfo ei(EditInfo::makeLink("customtransformer.html", "Description"), 0, -1, -1);
        ei.setErrorFieldName("Description");
        ei.text = description;
        ei.disallowSliders();
        return ei;
    }
    if (n == 2)
        return EditInfo("Coupling Coefficient", couplingCoef, 0, 1).setDimensionless().setPositive();
    if (n == 3) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Trapezoidal Approximation", isTrapezoidal());
        return ei;
    }
    return std::nullopt;
}

void CustomTransformerElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0) {
        inductance = ei.value;
        parseDescription();
    }
    if (n == 1) {
        std::string s = ei.textf->value;
        if (s != description) {
            if (!parseDescription(s, &ei)) {
                parseDescription(description);
            } else {
                description = s;
            }
            setPoints();
        }
    }
    if (n == 2) {
        if (ei.value > 0 && ei.value < 1) {
            couplingCoef = ei.value;
            parseDescription();
        } else {
            ei.setError("must be > 0 and < 1");
        }
    }
    if (n == 3) {
        if (ei.checkbox->getState())
            flags &= ~Inductor::FLAG_BACK_EULER;
        else
            flags |= Inductor::FLAG_BACK_EULER;
        parseDescription();
    }
}

void CustomTransformerElm::flipX(int c2, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipX(c2, count);
}

void CustomTransformerElm::flipY(int c2, int count) {
    flags ^= FLAG_FLIP;
    CircuitElm::flipY(c2, count);
}
