/*
    Bill Collis - June 2015

    This file is part of CircuitJS1 (GNU GPL v2).
*/

#include "ThermistorNTCElm.h"

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

ThermistorNTCElm::ThermistorNTCElm(int xx, int yy) : CircuitElm(xx, yy) {
    position = 0.34;
    sliderText = "Temperature";
    rneg40 = calcResistance(minTempr);
    b25100 = calcB25100();
    temperature = temprFromSliderPos();
    resistance = calcResistance(temperature);
    createSlider();
}

ThermistorNTCElm::ThermistorNTCElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    r25 = parseFloatStrict(st.nextToken());
    r50 = parseFloatStrict(st.nextToken());
    minTempr = parseFloatStrict(st.nextToken());
    maxTempr = parseFloatStrict(st.nextToken());
    position = parseFloatStrict(st.nextToken());
    sliderText = CustomLogicModel::unescape(st.nextToken());
    rneg40 = calcResistance(minTempr);
    b25100 = calcB25100();
    temperature = temprFromSliderPos();
    resistance = calcResistance(temperature);
    createSlider();
}

ThermistorNTCElm::~ThermistorNTCElm() {
    // deleteElm() normally does this, but the element factory frees samples without it
    if (slider && app != nullptr)
        app->removeSlider(slider.get());
}

void ThermistorNTCElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "r25", r25);
    CircuitXMLSerializer::dumpAttr(elem, "r50", r50);
    CircuitXMLSerializer::dumpAttr(elem, "mnt", minTempr);
    CircuitXMLSerializer::dumpAttr(elem, "mxt", maxTempr);
    CircuitXMLSerializer::dumpAttr(elem, "ps", position);
    CircuitXMLSerializer::dumpAttr(elem, "st", sliderText);
}

void ThermistorNTCElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    r25 = xml.parseDoubleAttr("r25", r25);
    r50 = xml.parseDoubleAttr("r50", r50);
    minTempr = xml.parseDoubleAttr("mnt", minTempr);
    maxTempr = xml.parseDoubleAttr("mxt", maxTempr);
    position = xml.parseDoubleAttr("ps", position);
    sliderText = xml.parseStringAttr("st", sliderText).value_or(sliderText);
    rneg40 = calcResistance(minTempr);
    b25100 = calcB25100();
    temperature = temprFromSliderPos();
    resistance = calcResistance(temperature);
    if (slider) {
        slider->setValue((int) std::trunc(position * 100));
        slider->label = sliderText;
        slider->draw();
    } else {
        createSlider();
    }
}

void ThermistorNTCElm::createSlider() {
    slider = std::make_unique<Scrollbar>(Scrollbar::HORIZONTAL, (int) std::trunc(position * 100), 1, 0, 101);
    slider->label = sliderText;
    slider->addChangeHandler([this] {
        app->analyzeFlag = true;
        setPoints();
    });
    app->addSlider(slider.get());
}

void ThermistorNTCElm::deleteElm() {
    if (slider)
        app->removeSlider(slider.get());
    slider.reset();
    CircuitElm::deleteElm();
}

void ThermistorNTCElm::setMouseElm(bool v) {
    CircuitElm::setMouseElm(v);
    if (slider)
        slider->draw();
}

void ThermistorNTCElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(32);
    if (slider) {
        position = slider->getValue() * 0.0099 + 0.005;
        temperature = temprFromSliderPos();
        resistance = calcResistance(temperature);
    }
}

void ThermistorNTCElm::draw(Graphics &g) {
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
    // NTC symbol: diagonal line
    g.beginPath();
    g.moveTo(0 - hs, hs * 2);
    g.lineTo(hs, hs * 2);
    g.lineTo(len, -hs * 2);
    g.stroke();
    g.restoreState();
    if (showValues()) {
        temperature = temprFromSliderPos();
        resistance = calcResistance(temperature);
        drawValues(g, jsNumberToString(temperature) + "°C=" + getShortUnitText(resistance, "") + "Ω", hs);
    }
    doDots(g);
    drawPosts(g);
}

void ThermistorNTCElm::calculateCurrent() {
    current = (nodes[0]->v - nodes[1]->v) / resistance;
}

void ThermistorNTCElm::stamp() {
    temperature = temprFromSliderPos();
    resistance = calcResistance(temperature);
    sim->stampResistor(nodes[0], nodes[1], resistance);
}

void ThermistorNTCElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "thermistor";
    arr[1] = "I = " + getCurrentDText(current);
    arr[2] = "Vd = " + getVoltageDText(getVoltageDiff());
    arr[3] = "R = " + getUnitText(resistance, Locale::ohmString);
    arr[4] = "P = " + getUnitText(getPower(), "W");
    arr[5] = "T = " + getUnitText(temperature, "°C");
}

std::optional<EditInfo> ThermistorNTCElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("R at 25°C", r25, r50 + 100, 100000);
    if (n == 1)
        return EditInfo("R at 50°C", r50, 100, r25 - 100);
    if (n == 2)
        return EditInfo("Slider min temp (°C)", minTempr, -40, maxTempr);
    if (n == 3)
        return EditInfo("Slider max temp (°C)", maxTempr, minTempr, 150);
    if (n == 4) {
        EditInfo ei("Slider Text", 0, -1, -1);
        ei.text = sliderText;
        return ei;
    }
    return std::nullopt;
}

void ThermistorNTCElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        r25 = ei.value;
    if (n == 1)
        r50 = ei.value;
    if (n == 2)
        minTempr = ei.value;
    if (n == 3)
        maxTempr = ei.value;
    if (n == 4) {
        sliderText = ei.textf->value;
        if (slider) {
            slider->label = sliderText;
            slider->draw();
        }
    }
    rneg40 = calcResistance(minTempr);
    b25100 = calcB25100();
    temperature = temprFromSliderPos();
    resistance = calcResistance(temperature);
}

double ThermistorNTCElm::calcResistance(double tempr) {
    return jsmath::round(r25 * jsmath::exp(b25100 * ((1 / (tempr + t0)) - (1 / t25))));
}

double ThermistorNTCElm::temprFromSliderPos() {
    return jsmath::round(position * (maxTempr - minTempr) + minTempr);
}

double ThermistorNTCElm::calcB25100() {
    return (jsmath::log(r25) - jsmath::log(r50)) / ((1 / (t0 + 25)) - (1 / (t0 + 50)));
}
