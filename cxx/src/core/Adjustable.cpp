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

#include "Adjustable.h"

#include <algorithm>
#include <cmath>

#include "CircuitElm.h"
#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "JsMath.h"
#include "JsNumber.h"
#include "SimApp.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

Adjustable::Adjustable(CircuitElm *ce, int item) {
    elm = ce;
    editItem = item;
    if (ce == nullptr)
        return;
    std::optional<EditInfo> ei = ce->getEditInfo(item);
    if (ei && ei->maxVal > 0) {
        minValue = ei->minVal;
        maxValue = ei->maxVal;
    }
}

Adjustable::Adjustable(StringTokenizer &st, SimApp *sim) {
    int e = parseIntStrict(st.nextToken());
    if (e == -1)
        return;
    try {
        std::string ei = st.nextToken();

        // forgot to dump a "flags" field in the initial code, so we have to do this to support backward compatibility
        if (ei.rfind("F", 0) == 0) {
            flags = parseIntStrict(ei.substr(1));
            ei = st.nextToken();
        }

        editItem = parseIntStrict(ei);
        minValue = parseFloatStrict(st.nextToken());
        maxValue = parseFloatStrict(st.nextToken());
        if ((flags & FLAG_SHARED) != 0) {
            int ano = parseIntStrict(st.nextToken());
            sharedSlider = (ano >= 0 && ano < (int) sim->adjustables.size()) ? sim->adjustables[ano] : nullptr;
        }
        sliderText = CustomLogicModel::unescape(st.nextToken());
    } catch (...) {}
    logarithmic = (flags & FLAG_LOG) != 0;
    try {
        sliderStep = parseFloatStrict(st.nextToken());
    } catch (...) {}
    elm = sim->getElm(e);
}

Adjustable::~Adjustable() {
    if (slider && CircuitElm::app)
        CircuitElm::app->removeSlider(slider.get());
}

bool Adjustable::createSlider(SimApp *sim) {
    if (elm == nullptr)
        return false;
    std::optional<EditInfo> ei = elm->getEditInfo(editItem);
    if (!ei)
        return false;
    if (sharedSlider != nullptr)
        return true;
    if (sliderText.empty())
        return false;
    double value = ei->value;
    createSliderWithValue(sim, value);
    return true;
}

void Adjustable::createSliderWithValue(SimApp *sim, double value) {
    int intValue = (int) valueToSliderPosition(value);
    slider = std::make_unique<Scrollbar>(Scrollbar::HORIZONTAL, intValue, 1, 0, 100);
    slider->label = sliderText;
    if (sliderStep > 0 && maxValue != minValue)
        slider->setStepSize(sliderStep * 100 / (maxValue - minValue));
    slider->addChangeHandler([this] { execute(); });
    sim->addSlider(slider.get());
}

void Adjustable::setSliderValue(double value) {
    if (sharedSlider != nullptr) {
        sharedSlider->setSliderValue(value);
        return;
    }
    if (slider == nullptr)
        return;
    int intValue = (int) valueToSliderPosition(value);
    settingValue = true;  // don't recursively set value again in execute()
    slider->setValue(intValue);
    settingValue = false;
}

void Adjustable::execute() {
    if (settingValue)
        return;
    SimApp *sim = CircuitElm::app;
    for (Adjustable *adj : sim->adjustables)
        if (adj == this || adj->sharedSlider == this)
            adj->executeSlider();
}

void Adjustable::executeSlider() {
    CircuitElm::app->analyzeFlag = true;
    if (elm == nullptr)
        return;
    std::optional<EditInfo> ei = elm->getEditInfo(editItem);
    if (!ei)
        return;
    ei->value = getSliderValue();
    ei->continuous = true;
    elm->setEditValue(editItem, *ei);
    CircuitElm::app->repaint();
}

double Adjustable::getSliderValue() {
    double val = sharedSlider == nullptr ? (slider ? slider->getValue() : 0)
                                         : (sharedSlider->slider ? sharedSlider->slider->getValue() : 0);
    double result = sliderPositionToValue(val);
    double step = sharedSlider != nullptr ? sharedSlider->sliderStep : sliderStep;
    if (step > 0)
        result = minValue + jsmath::round((result - minValue) / step) * step;
    return result;
}

double Adjustable::valueToSliderPosition(double value) {
    if (logarithmic && minValue > 0) {
        double logMin = jsmath::log(minValue);
        double logMax = jsmath::log(maxValue);
        return std::floor((jsmath::log(value) - logMin) / (logMax - logMin) * 100);
    }
    return std::floor((value - minValue) * 100 / (maxValue - minValue));
}

double Adjustable::sliderPositionToValue(double pos) {
    if (logarithmic && minValue > 0) {
        double logMin = jsmath::log(minValue);
        double logMax = jsmath::log(maxValue);
        return jsmath::exp(logMin + (logMax - logMin) * pos / 100);
    }
    return minValue + (maxValue - minValue) * pos / 100;
}

void Adjustable::deleteSlider(SimApp *sim) {
    if (slider)
        sim->removeSlider(slider.get());
    slider.reset();
}

void Adjustable::setMouseElm(CircuitElm *) {
    if (slider != nullptr)
        slider->draw();
}

bool Adjustable::sliderBeingShared() {
    for (Adjustable *adj : CircuitElm::app->adjustables)
        if (adj->sharedSlider == this)
            return true;
    return false;
}

std::string Adjustable::getEditItemName() {
    if (elm == nullptr)
        return "";
    std::optional<EditInfo> ei = elm->getEditInfo(editItem);
    return ei ? ei->name : "";
}

int Adjustable::findEditItemByName(CircuitElm *elm, const std::optional<std::string> &name, int fallbackIndex) {
    if (elm != nullptr && name && !name->empty()) {
        for (int i = 0;; i++) {
            std::optional<EditInfo> ei = elm->getEditInfo(i);
            if (!ei)
                break;
            if (*name == ei->name)
                return i;
        }
    }
    return fallbackIndex;
}

void Adjustable::dumpXml(XmlElement *root, SimApp *app) {
    XmlElement *ae = root->createChild("adj");
    CircuitXMLSerializer::dumpAttr(ae, "e", app->locateElm(elm));
    CircuitXMLSerializer::dumpAttr(ae, "ei", editItem);
    CircuitXMLSerializer::dumpAttr(ae, "en", getEditItemName());
    CircuitXMLSerializer::dumpAttr(ae, "mn", minValue);
    CircuitXMLSerializer::dumpAttr(ae, "mx", maxValue);
    CircuitXMLSerializer::dumpAttr(ae, "st", sliderText);
    if (sliderStep > 0)
        CircuitXMLSerializer::dumpAttr(ae, "stp", sliderStep);
    if (sharedSlider != nullptr) {
        auto it = std::find(app->adjustables.begin(), app->adjustables.end(), sharedSlider);
        CircuitXMLSerializer::dumpAttr(ae, "ss", it == app->adjustables.end() ? -1 : (int) (it - app->adjustables.begin()));
    }
    if (logarithmic)
        CircuitXMLSerializer::dumpAttr(ae, "log", 1);
}

void Adjustable::undumpXml(CircuitXMLDeserializer &xml, SimApp *app) {
    int e = xml.parseIntAttr("e", -1);
    if (e == -1)
        return;
    int ei = xml.parseIntAttr("ei", 0);
    std::optional<std::string> en = xml.parseStringAttr("en", std::nullopt);
    CircuitElm *elm = app->getElm(e);
    int item = findEditItemByName(elm, en, ei);
    Adjustable *adj = new Adjustable(elm, item);
    adj->minValue = xml.parseDoubleAttr("mn", 1);
    adj->maxValue = xml.parseDoubleAttr("mx", 1000);
    adj->sliderText = xml.parseStringAttr("st", std::string()).value_or("");
    adj->sliderStep = xml.parseDoubleAttr("stp", 0);
    int ss = xml.parseIntAttr("ss", -1);
    if (ss != -1)
        adj->sharedSlider = (ss >= 0 && ss < (int) app->adjustables.size()) ? app->adjustables[ss] : nullptr;
    adj->logarithmic = xml.parseIntAttr("log", 0) != 0;
    app->adjustables.push_back(adj);
}

void Adjustable::reorderAdjustables(SimApp *app) {
    std::vector<Adjustable *> newList;
    for (Adjustable *a : app->adjustables)
        if (a->sharedSlider == nullptr)
            newList.push_back(a);
    for (Adjustable *a : app->adjustables)
        if (a->sharedSlider != nullptr)
            newList.push_back(a);
    app->adjustables = newList;
}

void Scrollbar::draw() {
    if (CircuitElm::app != nullptr)
        CircuitElm::app->updateSlider(this);
}
