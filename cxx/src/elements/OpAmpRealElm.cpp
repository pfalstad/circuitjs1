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

#include "OpAmpRealElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/StringTokenizer.h"
#include "CapacitorElm.h"
#include "ResistorElm.h"
#include "TransistorElm.h"

static const char *model741String =
    "NTransistorElm 3 8 9\rNTransistorElm 2 8 10\rPTransistorElm 11 12 9\rPTransistorElm 11 13 10\rNTransistorElm 1"
    "4 12 1\rNTransistorElm 14 13 5\rNTransistorElm 12 7 14\rPTransistorElm 8 8 7\rPTransistorElm 8 11 7\rNTransist"
    "orElm 17 11 16\rNTransistorElm 17 17 4\rPTransistorElm 18 18 7\rPTransistorElm 18 20 7\rNTransistorElm 20 7 25"
    "\rNTransistorElm 13 22 24\rNTransistorElm 21 20 22\rNTransistorElm 25 20 6\rNTransistorElm 24 22 23\rPTransist"
    "orElm 22 4 15\rNTransistorElm 23 13 4\rCapacitorElm 13 20\rResistorElm 15 6\rResistorElm 6 25\rResistorElm 4 1"
    "\rResistorElm 4 14\rResistorElm 4 5\rResistorElm 4 16\rResistorElm 4 24\rResistorElm 4 23\rResistorElm 17 18\r"
    "ResistorElm 22 21\rResistorElm 21 20\r";

static const char *lm324ModelString =
    "TransistorElm 1 2 3\rCurrentElm 4 3\rTransistorElm 2 2 5\rTransistorElm 2 6 5\rCapacitorElm 6 7\rCurrentElm 4 "
    "8\rCurrentElm 4 7\rTransistorElm 8 4 9\rTransistorElm 7 4 10\rTransistorElm 10 4 11\rTransistorElm 11 7 12\rRe"
    "sistorElm 11 12\rTransistorElm 7 5 12\rCurrentElm 12 5\rTransistorElm 6 5 8\rResistorElm 9 5\rTransistorElm 9 "
    "7 5\rTransistorElm 13 6 3";

static const char *lm324ModelDump =
    "0 -1 -0 0 10000/0 0.000006/0 1 0 0 100/0 1 0 0 100/0 1e-11 0/0 0.000004/0 0.0001/0 1 0 0 100/0 1 0 0 100/0 1 0"
    " 0 100/0 1 0 0 100/0 25/0 1 0 0 100/0 0.00005/0 -1 0 0 100/0 10000/0 1 0 0 100/0 -1 0 0 10000";

static const char *lm324v2ModelString =
    "ResistorElm 4 6\rCurrentElm 4 7\rResistorElm 4 29\rResistorElm 8 30\rResistorElm 9 31\rTransistorElm 30 29 31 "
    "\rResistorElm 4 32\rResistorElm 2 33\rResistorElm 10 34\rTransistorElm 33 32 34 \rResistorElm 9 35\rResistorEl"
    "m 9 36\rResistorElm 11 37\rTransistorElm 36 35 37 \rResistorElm 10 38\rResistorElm 10 39\rResistorElm 11 40\rT"
    "ransistorElm 39 38 40 \rResistorElm 12 41\rTransistorElm 13 41 4 \rResistorElm 13 42\rTransistorElm 13 42 4 \r"
    "ResistorElm 4 43\rTransistorElm 12 43 14 \rResistorElm 3 44\rTransistorElm 14 44 6 \rResistorElm 15 45\rTransi"
    "storElm 6 45 4 \rResistorElm 3 46\rTransistorElm 15 46 16 \rResistorElm 3 47\rTransistorElm 16 47 17 \rResisto"
    "rElm 17 16\rResistorElm 5 17\rResistorElm 4 48\rTransistorElm 15 48 5 \rResistorElm 15 49\rTransistorElm 17 49"
    " 5 \rCurrentElm 18 3\rCurrentElm 19 3\rCurrentElm 20 3\rResistorElm 11 50\rTransistorElm 18 50 3 \rResistorElm"
    " 14 51\rTransistorElm 19 51 3 \rResistorElm 5 52\rTransistorElm 7 52 4 \rResistorElm 15 53\rTransistorElm 20 5"
    "3 3 \rCapacitorElm 21 22\rResistorElm 12 21\rResistorElm 12 15\rVCVSElm 3 0 23 8\rVoltageElm 23 1\rCurrentElm "
    "3 4\rResistorElm 4 3\rResistorElm 12 54\rTransistorElm 9 54 11 \rResistorElm 13 55\rTransistorElm 10 55 11 \rC"
    "apacitorElm 12 13\rCapacitorElm 6 15\rCapacitorElm 3 24\rResistorElm 11 24\rCapacitorElm 1 2\rCapacitorElm 2 0"
    "\rCapacitorElm 1 0\rVCVSElm 15 0 22 0\rCapacitorElm 5 0\rResistorElm 25 56\rTransistorElm 25 56 0 \rVCCSElm 27"
    " 0 4 3\rCurrentElm 0 25\rVoltageElm 25 26\rResistorElm 0 26\rVCVSElm 28 26 27 0\rResistorElm 0 27\rVoltageElm "
    "28 0\rResistorElm 0 28";

static const char *lm324v2ModelDump =
    "0 40000/0 5e-7/0 380/0 1700/0 5/0 -1 0 0 306 xlm324v2-qpi/0 380/0 1700/0 5/0 -1 0 0 300 xlm324v2-qpa/0 380/0 1"
    "700/0 5/0 -1 0 0 306 xlm324v2-qpi/0 380/0 1700/0 5/0 -1 0 0 306 xlm324v2-qpi/0 25/0 1 0 0 100 xlm324v2-qnq/0 2"
    "5/0 1 0 0 100 xlm324v2-qnq/0 300/0 -1 0 0 100 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm3"
    "24v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/0 25/0 1 0 0 100 xlm324v2-qnq/0 40000/0 18/0 300/0 -1 0 0 100 xlm324v2-"
    "qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 1.2e-7/0 6e-8/0 0.000001/0 300/0 -1 0 0 100 xlm324v2-qpq/0 300/0 -1 0 0 10"
    "0 xlm324v2-qpq/0 25/0 1 0 0 100 xlm324v2-qnq/0 300/0 -1 0 0 100 xlm324v2-qpq/2 4.8e-12 0 0/0 3/0 3000000000/0 "
    "2 -0.00001*(a-b)/0 0 0 -0.00156/0 0.000005/0 450000/0 300/0 -1 0 0 100 xlm324v2-qpq/0 300/0 -1 0 0 100 xlm324v"
    "2-qpq/2 8e-12 0 0/2 1e-12 0 0/2 1e-13 0 0/0 300000/2 2.3e-13 0 0/2 7.9e-13 0 0/2 7.9e-13 0 0/0 2 2*(a-b)/2 5e-"
    "14 0 0/0 25/0 1 0 0 100 xlm324v2-qnq/0 2 0.0003*(a-b)/0 0.001/0 0 0 -0.25/0 1000000/0 2 1*(a-b)/0 1000000/0 0 "
    "0 -0.55/0 1000000";
static const std::vector<int> model741ExternalNodes = {2, 3, 6, 7, 4};
static const std::vector<int> lm324ExternalNodes = {1, 13, 12, 4, 5};
static const std::vector<int> lm324v2ExternalNodes = {2, 1, 5, 3, 4};
static const double model741resistances[] = {50, 25, 1e3, 50e3, 1e3, 5e3, 50e3, 50, 39e3, 7500, 4500};

OpAmpRealElm::OpAmpRealElm(int xx, int yy) : CompositeElm(xx, yy) {
    noDiagonal = true;
    slewRate = 0.6;
    currentLimit = defaultCurrentLimit;
    modelType = MODEL_741;
    initModel();
}

OpAmpRealElm::OpAmpRealElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CompositeElm(xa, ya, xb, yb, f) {
    noDiagonal = true;
    slewRate = parseFloatStrict(st.nextToken());
    capValue = parseFloatStrict(st.nextToken());
    currentLimit = defaultCurrentLimit;
    modelType = MODEL_741;
    try {
        currentLimit = parseFloatStrict(st.nextToken());
        modelType = parseIntStrict(st.nextToken());
    } catch (...) {}
    initModel();
}

void OpAmpRealElm::initModel() {
    flags |= FLAG_ESCAPE;
    switch (modelType) {
    case MODEL_741: init741(); break;
    case MODEL_324: init324(); break;
    case MODEL_324v2: init324v2(); break;
    }
    curCounts.assign(5, 0.0);
    setPoints();
}

void OpAmpRealElm::init741() {
    loadComposite(nullptr, model741String, model741ExternalNodes);
    if (CapacitorElm *cap = getCapacitor()) {
        cap->capacitance = 30e-12 / (slewRate / 0.6);
        cap->voltdiff = capValue;
    }
    for (int i = 0; i != 11; i++)
        static_cast<ResistorElm *>(compElmList[21 + i])->resistance = model741resistances[i];
    double currentMult = currentLimit / defaultCurrentLimit;
    static_cast<ResistorElm *>(compElmList[21])->resistance /= currentMult;
    static_cast<ResistorElm *>(compElmList[22])->resistance /= currentMult;
    static_cast<TransistorElm *>(compElmList[13])->setBeta(currentMult * 100);
    static_cast<TransistorElm *>(compElmList[18])->setBeta(currentMult * 100);
}

void OpAmpRealElm::init324() {
    StringTokenizer st(lm324ModelDump, "/");
    loadComposite(&st, lm324ModelString, lm324ExternalNodes);
    if (CapacitorElm *cap = getCapacitor()) {
        cap->capacitance = 10e-12 / (slewRate / 0.55);
        cap->voltdiff = capValue;
    }
    double currentMult = currentLimit / defaultCurrentLimit;
    static_cast<ResistorElm *>(compElmList[11])->resistance /= currentMult;
    static_cast<TransistorElm *>(compElmList[9])->setBeta(currentMult * 100);
    static_cast<TransistorElm *>(compElmList[10])->setBeta(currentMult * 100);
    static_cast<TransistorElm *>(compElmList[12])->setBeta(currentMult * 100);
    static_cast<TransistorElm *>(compElmList[16])->setBeta(currentMult * 100);
}

void OpAmpRealElm::init324v2() {
    StringTokenizer st(lm324v2ModelDump, "/");
    loadComposite(&st, lm324v2ModelString, lm324v2ExternalNodes);
}

void OpAmpRealElm::reset() {
    CompositeElm::reset();
    curCounts.assign(5, 0.0);
}

CapacitorElm *OpAmpRealElm::getCapacitor() {
    if (modelType == MODEL_324v2)
        return nullptr;
    return static_cast<CapacitorElm *>(compElmList[modelType == MODEL_741 ? 20 : 4]);
}

void OpAmpRealElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CompositeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "slr", slewRate);
    CircuitXMLSerializer::dumpAttr(elem, "cl", currentLimit);
    CircuitXMLSerializer::dumpAttr(elem, "mt", modelType);
}

void OpAmpRealElm::dumpXmlState(XmlElement *, XmlElement *elem) {
    CapacitorElm *cap = getCapacitor();
    CircuitXMLSerializer::dumpAttr(elem, "vd", cap ? cap->voltdiff : 0.0);
}

void OpAmpRealElm::undumpXml(CircuitXMLDeserializer &xml) {
    CompositeElm::undumpXml(xml);
    slewRate = xml.parseDoubleAttr("slr", slewRate);
    currentLimit = xml.parseDoubleAttr("cl", currentLimit);
    modelType = xml.parseIntAttr("mt", modelType);
    double voltdiff = xml.parseDoubleAttr("vd", 0);
    initModel();
    if (CapacitorElm *cap = getCapacitor())
        cap->voltdiff = voltdiff;
}

void OpAmpRealElm::draw(Graphics &g) {
    setBbox(point1, point2, opheight * 2);
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, in1p[0], in1p[1]);
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, in2p[0], in2p[1]);
    setVoltageColor(g, nodes[2]->v);
    drawThickLine(g, lead2, point2);
    setVoltageColor(g, nodes[3]->v);
    drawThickLine(g, rail1p[0], rail1p[1]);
    setVoltageColor(g, nodes[4]->v);
    drawThickLine(g, rail2p[0], rail2p[1]);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    setPowerColor(g, true);
    drawThickPolygon(g, triangle);
    g.setFont(plusFont);
    drawCenteredText(g, "-", textp[0].x, textp[0].y - 2, true);
    drawCenteredText(g, "+", textp[1].x, textp[1].y, true);
    for (int i = 0; i != 5; i++)
        curCounts[i] = updateDotCount(getCurrentIntoNode(i), curCounts[i]);
    drawDots(g, in1p[1], in1p[0], curCounts[0]);
    drawDots(g, in2p[1], in2p[0], curCounts[1]);
    drawDots(g, lead2, point2, curCounts[2]);
    drawDots(g, rail1p[0], rail1p[1], -curCounts[3]);
    drawDots(g, rail2p[0], rail2p[1], -curCounts[4]);
    drawPosts(g);
}

void OpAmpRealElm::setPoints() {
    CompositeElm::setPoints();
    int ww = opwidth;
    if (ww > dn / 2)
        ww = (int) std::trunc(dn / 2);
    calcLeads(ww * 2);
    int hs = opheight * dsign;
    int hsswap = (flags & FLAG_SWAP) != 0 ? -hs : hs;
    in1p = newPointArray(2);
    in2p = newPointArray(2);
    textp = newPointArray(2);
    rail1p = newPointArray(2);
    rail2p = newPointArray(2);
    interpPoint2(point1, point2, in1p[0], in2p[0], 0, hsswap);
    interpPoint2(lead1, lead2, in1p[1], in2p[1], 0, hsswap);
    interpPoint2(lead1, lead2, textp[0], textp[1], 0.2, hsswap);
    double railPos = 0.5 - std::fmod(dn / 2, app->gridSize) / (ww * 2);
    interpPoint2(lead1, lead2, rail1p[1], rail2p[1], railPos, hs * 2 * (1 - railPos));
    interpPoint2(lead1, lead2, rail1p[0], rail2p[0], railPos, hs * 2);
    std::vector<Point> tris = newPointArray(2);
    interpPoint2(lead1, lead2, tris[0], tris[1], 0, hs * 2);
    triangle = createPolygon(tris[0], tris[1], lead2);
    plusFont = Font("SansSerif", 0, 14);
    setPost(0, in1p[0]);
    setPost(1, in2p[0]);
    setPost(2, point2);
    setPost(3, rail1p[0]);
    setPost(4, rail2p[0]);
}

void OpAmpRealElm::getInfo(std::vector<std::string> &arr) {
    std::string type = modelType == MODEL_741 ? "LM741" : "LM324";
    arr[0] = "op-amp (" + type + ")";
    arr[1] = "V+ = " + getVoltageText(nodes[1]->v);
    arr[2] = "V- = " + getVoltageText(nodes[0]->v);
    arr[3] = "Vout = " + getVoltageText(nodes[2]->v);
    arr[4] = "Iout = " + getCurrentText(getCurrentIntoNode(2));
}

std::optional<EditInfo> OpAmpRealElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei(EditInfo::makeLink("opampreal.html", "Model"), modelType);
        ei.choice = Choice();
        ei.choice->add("LM741");
        if (modelType == MODEL_324) {
            ei.choice->add("LM324, old");
            ei.choice->add("LM324, fixed");
            ei.choice->select(modelType);
        } else {
            ei.choice->add("LM324");
            ei.choice->select(modelType == MODEL_741 ? 0 : 1);
        }
        return ei;
    }
    if (n == 1)
        return EditInfo::createCheckbox("Swap Inputs", (flags & FLAG_SWAP) != 0);
    if (modelType == MODEL_324v2)
        return std::nullopt;
    if (n == 2)
        return EditInfo("Slew Rate (V/usec)", slewRate);
    if (n == 3)
        return EditInfo("Output Current Limit (A)", currentLimit);
    return std::nullopt;
}

void OpAmpRealElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        modelType = ei.choice->getSelectedIndex();
        if (ei.choice->getItemCount() == 2 && modelType == 1)
            modelType = MODEL_324v2;
        capValue = 0;
        initModel();
        ei.newDialog = true;
    }
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_SWAP);
        setPoints();
    }
    if (n == 2) {
        slewRate = ei.value;
        initModel();
    }
    if (n == 3) {
        currentLimit = ei.value;
        initModel();
    }
}
