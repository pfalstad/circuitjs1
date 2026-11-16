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

#include "LEDElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/DiodeModel.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/StringTokenizer.h"

std::string LEDElm::lastLEDModelName = "default-led";

LEDElm::LEDElm(int xx, int yy) : DiodeElm(xx, yy) {
    modelName = lastLEDModelName;
    setup();
    maxBrightnessCurrent = .01;
    colorR = 1;
    colorG = colorB = 0;
}

LEDElm::LEDElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : DiodeElm(xa, ya, xb, yb, f, st) {
    if ((f & (FLAG_MODEL | FLAG_FWDROP)) == 0) {
        const double fwdrop = 2.1024259;
        model = DiodeModel::getModelWithParameters(fwdrop, 0);
        modelName = model->name;
        setup();
    }
    colorR = parseFloatStrict(st.nextToken());
    colorG = parseFloatStrict(st.nextToken());
    colorB = parseFloatStrict(st.nextToken());
    maxBrightnessCurrent = .01;
    try {
        maxBrightnessCurrent = parseFloatStrict(st.nextToken());
    } catch (...) {}
}

void LEDElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    DiodeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "cr", colorR);
    CircuitXMLSerializer::dumpAttr(elem, "cg", colorG);
    CircuitXMLSerializer::dumpAttr(elem, "cb", colorB);
    CircuitXMLSerializer::dumpAttr(elem, "mbc", maxBrightnessCurrent);
}

void LEDElm::undumpXml(CircuitXMLDeserializer &xml) {
    DiodeElm::undumpXml(xml);
    colorR = xml.parseDoubleAttr("cr", colorR);
    colorG = xml.parseDoubleAttr("cg", colorG);
    colorB = xml.parseDoubleAttr("cb", colorB);
    maxBrightnessCurrent = xml.parseDoubleAttr("mbc", maxBrightnessCurrent);
}

void LEDElm::setPoints() {
    DiodeElm::setPoints();
    const int cr = 12;
    ledLead1 = interpPoint(point1, point2, .5 - cr / dn);
    ledLead2 = interpPoint(point1, point2, .5 + cr / dn);
    ledCenter = interpPoint(point1, point2, .5);
}

void LEDElm::draw(Graphics &g) {
    if (needsHighlight() || isCreating()) {
        DiodeElm::draw(g);
        return;
    }
    setVoltageColor(g, nodes[0]->v);
    drawThickLine(g, point1, ledLead1);
    setVoltageColor(g, nodes[1]->v);
    drawThickLine(g, ledLead2, point2);

    g.setColor(Color::gray);
    const int cr = 12;
    drawThickCircle(g, ledCenter.x, ledCenter.y, cr);
    const int cr2 = cr - 4;
    double w = current / maxBrightnessCurrent;
    if (w > 0)
        w = 255 * (1 + .2 * jsmath::log(w));
    if (w > 255)
        w = 255;
    if (w < 0)
        w = 0;
    Color cc((int) std::trunc(colorR * w), (int) std::trunc(colorG * w), (int) std::trunc(colorB * w));
    g.setColor(cc);
    g.fillOval(ledCenter.x - cr2, ledCenter.y - cr2, cr2 * 2, cr2 * 2);
    setBbox(point1, point2, cr2);
    updateDotCount();
    drawDots(g, point1, ledLead1, curcount);
    drawDots(g, point2, ledLead2, -curcount);
    drawPosts(g);
}

void LEDElm::getInfo(std::vector<std::string> &arr) {
    DiodeElm::getInfo(arr);
    if (model->oldStyle)
        arr[0] = "LED";
    else
        arr[0] = Locale::LS("LED") + " (" + modelName + ")";
}

std::optional<EditInfo> LEDElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Red Value (0-1)", colorR, 0, 1).setDimensionless();
    if (n == 1)
        return EditInfo("Green Value (0-1)", colorG, 0, 1).setDimensionless();
    if (n == 2)
        return EditInfo("Blue Value (0-1)", colorB, 0, 1).setDimensionless();
    if (n == 3)
        return EditInfo("Max Brightness Current (A)", maxBrightnessCurrent, 0, .1);
    return DiodeElm::getEditInfo(n - 4);
}

void LEDElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        colorR = ei.value;
    if (n == 1)
        colorG = ei.value;
    if (n == 2)
        colorB = ei.value;
    if (n == 3)
        maxBrightnessCurrent = ei.value;
    DiodeElm::setEditValue(n - 4, ei);
}
