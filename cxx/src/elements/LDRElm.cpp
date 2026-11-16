/*
    Bill Collis - June 2015

    This file is part of CircuitJS1 (GNU GPL v2).
*/

#include "LDRElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

LDRElm::LDRElm(int xx, int yy) : CircuitElm(xx, yy) {
    position = 0.34;
    sliderText = Locale::LS("Light Brightness");
    lux = luxFromSliderPos();
    resistance = calcResistance(lux);
    createSlider();
}

LDRElm::LDRElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : CircuitElm(xa, ya, xb, yb, f) {
    position = parseFloatStrict(st.nextToken());
    sliderText = CustomLogicModel::unescape(st.nextToken());
    lux = luxFromSliderPos();
    resistance = calcResistance(lux);
    createSlider();
}

LDRElm::~LDRElm() {
    // deleteElm() normally does this, but the element factory frees samples without it
    if (slider && app != nullptr)
        app->removeSlider(slider.get());
}

void LDRElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ps", position);
    CircuitXMLSerializer::dumpAttr(elem, "st", sliderText);
}

void LDRElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    position = xml.parseDoubleAttr("ps", position);
    sliderText = xml.parseStringAttr("st", sliderText).value_or(sliderText);
    lux = luxFromSliderPos();
    resistance = calcResistance(lux);
    if (slider) {
        slider->setValue((int) std::trunc(position * 100));
        slider->label = sliderText;
        slider->draw();
    } else {
        createSlider();
    }
}

void LDRElm::createSlider() {
    slider = std::make_unique<Scrollbar>(Scrollbar::HORIZONTAL, (int) std::trunc(position * 100), 1, 0, 101);
    slider->label = sliderText;
    slider->addChangeHandler([this] {
        app->analyzeFlag = true;
        setPoints();
    });
    app->addSlider(slider.get());
}

void LDRElm::deleteElm() {
    if (slider)
        app->removeSlider(slider.get());
    slider.reset();
    CircuitElm::deleteElm();
}

void LDRElm::setMouseElm(bool v) {
    CircuitElm::setMouseElm(v);
    if (slider)
        slider->draw();
}

void LDRElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(32);
    if (slider) {
        position = slider->getValue() * 0.0099 + 0.0001;
        lux = luxFromSliderPos();
        resistance = calcResistance(lux);
    }
}

void LDRElm::draw(Graphics &g) {
    const int hs = 6;
    setBbox(point1, point2, hs);
    draw2Leads(g);
    setPowerColor(g, true);
    double len = distance(lead1, lead2);
    g.saveState();
    g.setLineWidth(3.0);
    g.transform(
        (lead2.x - lead1.x) / len, (lead2.y - lead1.y) / len,
        -(lead2.y - lead1.y) / len, (lead2.x - lead1.x) / len,
        lead1.x, lead1.y);
    g.setStrokeGradient(0, 0, len, 0, getVoltageColor(g, nodes[0]->v), getVoltageColor(g, nodes[1]->v));
    if (!showEuroResistors()) {
        g.beginPath();
        g.moveTo(0, 0);
        for (int i = 0; i < 4; i++) {
            g.lineTo((1 + 4 * i) * len / 16, hs);
            g.lineTo((3 + 4 * i) * len / 16, -hs);
        }
        g.lineTo(len, 0);
        g.stroke();
    } else {
        g.strokeRect(0, -hs, len, 2.0 * hs);
    }
    // LDR arrows
    g.beginPath();
    g.moveTo(-8, 26);
    g.lineTo(8, 12);
    g.moveTo(2, 12);
    g.lineTo(8, 12);
    g.lineTo(8, 18);
    g.moveTo(12, 26);
    g.lineTo(26, 12);
    g.moveTo(20, 12);
    g.lineTo(26, 12);
    g.lineTo(26, 18);
    g.stroke();
    g.restoreState();
    if (showValues()) {
        lux = luxFromSliderPos();
        resistance = calcResistance(lux);
        drawValues(g, getShortUnitText(resistance, "") + "Ω", hs);
    }
    doDots(g);
    drawPosts(g);
}

void LDRElm::calculateCurrent() {
    current = (nodes[0]->v - nodes[1]->v) / resistance;
}

void LDRElm::stamp() {
    lux = luxFromSliderPos();
    resistance = calcResistance(lux);
    sim->stampResistor(nodes[0], nodes[1], resistance);
}

void LDRElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "photoresistor";
    arr[1] = "I = " + getCurrentDText(current);
    arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
    arr[3] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[4] = "P = " + getUnitText(getPower(), "W");
}

std::optional<EditInfo> LDRElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Slider Text", 0, -1, -1);
        ei.text = sliderText;
        return ei;
    }
    return std::nullopt;
}

void LDRElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        sliderText = ei.textf->value;
        if (slider) {
            slider->label = sliderText;
            slider->draw();
        }
    }
    lux = luxFromSliderPos();
    resistance = calcResistance(lux);
}

double LDRElm::calcResistance(double lux) {
    return jsmath::round((maxLux - lux + 1) * 10);
}
