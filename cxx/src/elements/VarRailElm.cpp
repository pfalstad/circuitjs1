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

#include "VarRailElm.h"

#include <cmath>
#include <regex>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/SimApp.h"
#include "../core/StringTokenizer.h"

VarRailElm::VarRailElm(int xx, int yy) : RailElm(xx, yy, WF_VAR) {
    sliderText = "Voltage";
    frequency = maxVoltage;
    createSlider();
}

VarRailElm::VarRailElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : RailElm(xa, ya, xb, yb, f, st) {
    std::string text = st.nextToken();
    while (st.hasMoreTokens())
        text += ' ' + st.nextToken();
    sliderText = std::regex_replace(text, std::regex("%2[bB]"), "+");
    createSlider();
}

VarRailElm::~VarRailElm() {
    if (slider && app != nullptr)
        app->removeSlider(slider.get());
}

void VarRailElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    RailElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "st", sliderText);
}

void VarRailElm::undumpXml(CircuitXMLDeserializer &xml) {
    RailElm::undumpXml(xml);
    sliderText = xml.parseStringAttr("st", sliderText).value_or(sliderText);
    if (slider != nullptr)
        slider->label = sliderText;
    int value = (int) std::trunc((frequency - bias) * 100 / (maxVoltage - bias));
    if (slider != nullptr)
        slider->setValue(value);
}

std::string VarRailElm::dump() {
    // encode '+' for the old text format tokenizer
    return RailElm::dump() + " " + std::regex_replace(sliderText, std::regex("\\+"), "%2B");
}

void VarRailElm::createSlider() {
    waveform = WF_VAR;
    double denom = maxVoltage - bias;
    int value = denom != 0 ? (int) std::trunc((frequency - bias) * 100 / denom) : 0;

    slider = std::make_unique<Scrollbar>(Scrollbar::HORIZONTAL, value, 1, 0, 101);
    slider->label = sliderText;
    app->addSlider(slider.get());
}

double VarRailElm::getVoltage() {
    frequency = slider->getValue() * (maxVoltage - bias) / 100 + bias;
    return frequency;
}

void VarRailElm::deleteElm() {
    if (slider != nullptr)
        app->removeSlider(slider.get());
    RailElm::deleteElm();
}

std::optional<EditInfo> VarRailElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Min Voltage", bias, -20, 20).setUnitStep();
    if (n == 1)
        return EditInfo("Max Voltage", maxVoltage, -20, 20).setUnitStep();
    if (n == 2) {
        EditInfo ei("Slider Text", 0, -1, -1);
        ei.text = sliderText;
        return ei;
    }
    return std::nullopt;
}

void VarRailElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        bias = ei.value;
    if (n == 1)
        maxVoltage = ei.value;
    if (n == 2) {
        sliderText = ei.textf->value;
        if (slider != nullptr) {
            slider->label = sliderText;
            slider->draw();
        }
    }
}

void VarRailElm::setMouseElm(bool v) {
    RailElm::setMouseElm(v);
    if (slider != nullptr)
        slider->draw();
}
