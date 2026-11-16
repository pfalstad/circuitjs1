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

#include "PotElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

PotElm::PotElm(int xx, int yy) : CircuitElm(xx, yy) {
    maxResistance = 1000;
    position = 0.5;
    sliderText = "Resistance";
    flags = FLAG_SHOW_VALUES;
    createSlider();
}

PotElm::PotElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    maxResistance = parseFloatStrict(st.nextToken());
    position = parseFloatStrict(st.nextToken());
    std::string text = st.nextToken();
    while (st.hasMoreTokens())
        text += ' ' + st.nextToken();
    sliderText = text;
    createSlider();
}

PotElm::~PotElm() {
    // deleteElm() normally does this, but the element factory frees samples without it
    if (sliderOwner && slider.use_count() == 1 && app != nullptr)
        app->removeSlider(slider.get());
}

void PotElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ma", maxResistance);
    CircuitXMLSerializer::dumpAttr(elem, "po", position);
    CircuitXMLSerializer::dumpAttr(elem, "sl", sliderText);
    if (link != 0)
        CircuitXMLSerializer::dumpAttr(elem, "li", link);
}

void PotElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    maxResistance = xml.parseDoubleAttr("ma", maxResistance);
    position = xml.parseDoubleAttr("po", position);
    sliderText = xml.parseStringAttr("sl", sliderText).value_or(sliderText);
    setLink(xml.parseIntAttr("li", 0));
    if (slider != nullptr)
        slider->setValue(calcSliderValue());
    if (slider != nullptr && sliderOwner) {
        slider->label = sliderText;
        slider->draw();
    }
}

int PotElm::calcSliderValue() {
    return (int) jsmath::round((position - 0.005) / 0.0099);
}

static PotElm *asPot(CircuitElm *ce) {
    return ce->isPotElm() ? static_cast<PotElm *>(ce) : nullptr;
}

void PotElm::detachSlider() {
    if (!sliderOwner)
        return;
    bool transferred = false;
    if (link != 0) {
        for (CircuitElm *ce : app->elmList) {
            PotElm *pe = asPot(ce);
            if (pe != nullptr && pe != this && pe->link == link && !pe->deleted) {
                pe->sliderOwner = true;
                pe->slider = slider;
                // the change handler belongs to the owner
                slider->addChangeHandler([pe] { pe->sliderChanged(); });
                transferred = true;
                break;
            }
        }
    }
    if (!transferred && slider != nullptr)
        app->removeSlider(slider.get());
    slider.reset();
    sliderOwner = false;
}

void PotElm::setLink(int newLink) {
    if (newLink == link)
        return;
    detachSlider();
    link = newLink;
    createSlider();
}

void PotElm::createSlider() {
    if (link != 0) {
        for (CircuitElm *ce : app->elmList) {
            PotElm *pe = asPot(ce);
            if (pe != nullptr && pe != this && pe->link == link && pe->slider != nullptr) {
                slider = pe->slider;
                sliderOwner = false;
                return;
            }
        }
    }
    int value = calcSliderValue();
    slider = std::make_shared<Scrollbar>(Scrollbar::HORIZONTAL, value, 1, 0, 101);
    slider->label = sliderText;
    slider->addChangeHandler([this] { sliderChanged(); });
    app->addSlider(slider.get());
    sliderOwner = true;
}

void PotElm::sliderChanged() {
    app->analyzeFlag = true;
    setPoints();
    if (link != 0) {
        for (CircuitElm *ce : app->elmList) {
            PotElm *pe = asPot(ce);
            if (pe != nullptr && pe != this && pe->link == link)
                pe->setPoints();
        }
    }
}

void PotElm::deleteElm() {
    deleted = true;
    detachSlider();
    CircuitElm::deleteElm();
}

void PotElm::setPoints() {
    CircuitElm::setPoints();
    int offset = 0;
    int myLen = 0;
    if ((std::abs(dx) > std::abs(dy)) != hasFlag(FLAG_FLIP)) {
        myLen = 2 * app->gridSize * sign(dx) * (int) std::ceil(std::abs(dx) / (2. * app->gridSize));
        point2.x = point1.x + myLen;
        offset = (dx < 0) ? dy : -dy;
        point2.y = point1.y;
    } else {
        myLen = 2 * app->gridSize * sign(dy) * (int) std::ceil(std::abs(dy) / (2. * app->gridSize));
        if (dy != 0) {
            point2.y = point1.y + myLen;
            offset = (dy > 0) ? dx : -dx;
            point2.x = point1.x;
        }
    }
    if (offset == 0)
        offset = hasFlag(FLAG_FLIP_OFFSET) ? -app->gridSize : app->gridSize;
    dn = distance(point1, point2);
    int bodyLen = 32;
    calcLeads(bodyLen);
    position = slider->getValue() * 0.0099 + 0.005;
    double soff = (position - 0.5) * bodyLen;
    post3 = interpPoint(point1, point2, 0.5, offset);
    corner2 = interpPoint(point1, point2, soff / dn + 0.5, offset);
    arrowPoint = interpPoint(point1, point2, soff / dn + 0.5, 8 * sign(offset));
    midpoint = interpPoint(point1, point2, soff / dn + 0.5);
    arrow1 = Point();
    arrow2 = Point();
    double clen = std::abs(offset) - 8;
    interpPoint2(corner2, arrowPoint, arrow1, arrow2, (clen - 8) / clen, 8);
    ps3 = Point();
    ps4 = Point();
}

void PotElm::draw(Graphics &g) {
    int segments = 16;
    double hs = showEuroResistors() ? 6 : 8;
    double v1 = nodes[0]->v;
    double v2 = nodes[1]->v;
    double v3 = nodes[2]->v;
    setBbox(point1, point2, hs);
    adjustBbox(post3, post3);
    draw2Leads(g);
    setPowerColor(g, true);
    double segf = 1.0 / segments;
    int divide = (int) jsmath::round(segments * position);
    if (!showEuroResistors()) {
        int ox = 0;
        for (int i = 0; i != segments; i++) {
            int nx = 0;
            switch (i & 3) {
            case 0: nx = 1; break;
            case 2: nx = -1; break;
            default: nx = 0; break;
            }
            double v = i < divide ? v1 + (v3 - v1) * i / divide : v3 + (v2 - v3) * (i - divide) / (segments - divide);
            setVoltageColor(g, v);
            interpPoint(lead1, lead2, ps1, i * segf, hs * ox);
            interpPoint(lead1, lead2, ps2, (i + 1) * segf, hs * nx);
            drawThickLine(g, ps1, ps2);
            ox = nx;
        }
    } else {
        setVoltageColor(g, v1);
        interpPoint2(lead1, lead2, ps1, ps2, 0, hs);
        drawThickLine(g, ps1, ps2);
        for (int i = 0; i != segments; i++) {
            double v = i < divide ? v1 + (v3 - v1) * i / divide : v3 + (v2 - v3) * (i - divide) / (segments - divide);
            setVoltageColor(g, v);
            interpPoint2(lead1, lead2, ps1, ps2, i * segf, hs);
            interpPoint2(lead1, lead2, ps3, ps4, (i + 1) * segf, hs);
            drawThickLine(g, ps1, ps3);
            drawThickLine(g, ps2, ps4);
        }
        interpPoint2(lead1, lead2, ps1, ps2, 1, hs);
        drawThickLine(g, ps1, ps2);
    }
    setVoltageColor(g, v3);
    drawThickLine(g, post3, corner2);
    drawThickLine(g, corner2, arrowPoint);
    drawThickLine(g, arrow1, arrowPoint);
    drawThickLine(g, arrow2, arrowPoint);
    curcount1 = updateDotCount(current1, curcount1);
    curcount2 = updateDotCount(current2, curcount2);
    curcount3 = updateDotCount(current3, curcount3);
    if (!isCreating()) {
        drawDots(g, point1, midpoint, curcount1);
        drawDots(g, point2, midpoint, curcount2);
        drawDots(g, post3, corner2, curcount3);
        drawDots(g, corner2, midpoint, addCurCount(curcount3, distance(post3, corner2)));
    }
    drawPosts(g);

    if (showValues() && resistance1 > 0 && (flags & FLAG_SHOW_VALUES) != 0) {
        bool reverseY = (post3.x < lead1.x && lead1.x == lead2.x);
        bool reverseX = (post3.y < lead1.y && lead1.x != lead2.x);
        bool rev = (lead1.x == lead2.x && lead1.y < lead2.y) || (lead1.y == lead2.y && lead1.x > lead2.x);
        std::string s1 = getShortUnitText(rev ? resistance2 : resistance1, showOhmSymbol() ? Locale::ohmString : "");
        std::string s2 = getShortUnitText(rev ? resistance1 : resistance2, showOhmSymbol() ? Locale::ohmString : "");
        g.save();
        g.setFont(valueFont);
        g.setColor(whiteColor);
        double ya = g.currentFontSize / 2;
        double w = g.measureWidth(s1);
        if (lead1.x == lead2.x)
            g.drawString(s1, !reverseY ? arrowPoint.x + 2 : arrowPoint.x - 2 - w, std::max(arrow1.y, arrow2.y) + 5 + ya);
        else
            g.drawString(s1, std::min(arrow1.x, arrow2.x) - 2 - w, !reverseX ? arrowPoint.y + 4 + ya : arrowPoint.y - 4);
        w = g.measureWidth(s2);
        if (lead1.x == lead2.x)
            g.drawString(s2, !reverseY ? arrowPoint.x + 2 : arrowPoint.x - 2 - w, std::min(arrow1.y, arrow2.y) - 3);
        else
            g.drawString(s2, std::max(arrow1.x, arrow2.x) + 2, !reverseX ? arrowPoint.y + 4 + ya : arrowPoint.y - 4);
        g.restore();
    }
}

void PotElm::reset() {
    curcount1 = curcount2 = curcount3 = 0;
    CircuitElm::reset();
}

void PotElm::calculateCurrent() {
    if (resistance1 == 0)
        return;
    current1 = (nodes[0]->v - nodes[2]->v) / resistance1;
    current2 = (nodes[1]->v - nodes[2]->v) / resistance2;
    current3 = -current1 - current2;
}

double PotElm::getCurrentIntoNode(int n) {
    if (n == 0)
        return -current1;
    if (n == 1)
        return -current2;
    return -current3;
}

void PotElm::stamp() {
    resistance1 = maxResistance * position;
    resistance2 = maxResistance * (1 - position);
    sim->stampResistor(nodes[0], nodes[2], resistance1);
    sim->stampResistor(nodes[2], nodes[1], resistance2);
}

void PotElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "potentiometer";
    arr[1] = "Vd = " + getVoltageDText(getVoltageDiff());
    arr[2] = "R1 = " + getUnitText(resistance1, Locale::ohmString);
    arr[3] = "R2 = " + getUnitText(resistance2, Locale::ohmString);
    arr[4] = "I1 = " + getCurrentDText(current1);
    arr[5] = "I2 = " + getCurrentDText(current2);
}

std::optional<EditInfo> PotElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Resistance (ohms)", maxResistance, 0, 0);
    if (n == 1) {
        EditInfo ei("Slider Text", 0, -1, -1);
        ei.text = sliderText;
        return ei;
    }
    if (n == 2)
        return EditInfo::createCheckbox("Show Values", (flags & FLAG_SHOW_VALUES) != 0);
    if (n == 3)
        return EditInfo("Group Number (for linking)", link, -1, -1);
    return std::nullopt;
}

void PotElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        maxResistance = ei.value;
    if (n == 1) {
        sliderText = ei.textf->value;
        if (slider != nullptr) {
            slider->label = sliderText;
            slider->draw();
        }
    }
    if (n == 2)
        flags = ei.changeFlag(flags, FLAG_SHOW_VALUES);
    if (n == 3) {
        setLink((int) jsmath::round(ei.value));
        if (slider != nullptr)
            slider->setValue(calcSliderValue());
    }
}

void PotElm::setMouseElm(bool v) {
    CircuitElm::setMouseElm(v);
    if (slider != nullptr)
        slider->draw();
}

void PotElm::flipX(int c2, int count) {
    flags ^= FLAG_FLIP_OFFSET;
    CircuitElm::flipX(c2, count);
}

void PotElm::flipY(int c2, int count) {
    flags ^= FLAG_FLIP_OFFSET;
    CircuitElm::flipY(c2, count);
}

void PotElm::flipXY(int xmy, int count) {
    if (std::abs(dx) == std::abs(dy))
        flags ^= FLAG_FLIP;
    flags ^= FLAG_FLIP_OFFSET;
    CircuitElm::flipXY(xmy, count);
}
