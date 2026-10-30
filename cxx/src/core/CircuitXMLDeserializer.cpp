/*
    Copyright (C) Paul Falstad

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

#include "CircuitXMLDeserializer.h"

#include "Adjustable.h"
#include "SubcircuitModel.h"

#include <cmath>
#include <iostream>

#include "CircuitElm.h"
#include "DiodeModel.h"
#include "TransistorModel.h"
#include "ElementFactory.h"
#include "Scope.h"
#include "ScopeManager.h"
#include "SimulationManager.h"
#include "CustomLogicModel.h"
#include "MosfetModel.h"
#include "PinLayoutModel.h"
#include "RelayModel.h"
#include "JsNumber.h"
#include "SimApp.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

void CircuitXMLDeserializer::readElements(const XmlElement *root, bool subcircuitsOnly) {
    for (auto &child : root->children) {
        const XmlElement *elem = child.get();
        if (subcircuitsOnly && elem->tagName != "ccm")
            continue;
        currentXmlElement = elem;
        if (elem->tagName == "dm") {
            DiodeModel::undumpModelXml(*this);
            continue;
        }
        if (elem->tagName == "tm") {
            TransistorModel::undumpModelXml(*this);
            continue;
        }
        if (elem->tagName == "rlm") {
            RelayModel::undumpModelXml(*this);
            continue;
        }
        if (elem->tagName == "mm") {
            MosfetModel::undumpModelXml(*this);
            continue;
        }
        if (elem->tagName == "clm") {
            CustomLogicModel::undumpModelXml(*this);
            continue;
        }
        if (elem->tagName == "plm") {
            PinLayoutModel::undumpModelXml(*this);
            continue;
        }
        if (elem->tagName == "o") {
            // scopes refer to elements by index, so they come after the elements in the file
            if (app->scopeManager != nullptr) {
                auto sc = std::make_unique<Scope>(app, SimulationManager::theSim);
                sc->undumpXml(*this);
                app->scopeManager->addScope(std::move(sc));
            }
            continue;
        }
        if (elem->tagName == "h") {
            app->hintType = parseIntAttr("t", -1);
            app->hintItem1 = parseIntAttr("i1", 0);
            app->hintItem2 = parseIntAttr("i2", 0);
            continue;
        }
        if (elem->tagName == "adj") {
            currentXmlElement = elem;
            Adjustable::undumpXml(*this, app);
            continue;
        }
        if (elem->tagName == "ccm") {
            currentXmlElement = elem;
            SubcircuitModel::undumpModelXml(*this);
            continue;
        }
        if (elem->getAttribute("x") == nullptr)
            continue;
        const std::string *className = ElementFactory::xmlClassName(elem->tagName);
        if (className == nullptr) {
            std::cerr << "unrecognized xml element: " << elem->tagName << "\n";
            continue;
        }
        CircuitElm *elm = ElementFactory::constructElement(*className, 0, 0);
        if (elm == nullptr) {
            std::cerr << "can't construct " << *className << "\n";
            continue;
        }
        currentXmlElement = elem;
        currentElm = elm;
        elm->undumpXml(*this);
        elm->setPositionFromXml(elem);
        app->elmList.push_back(elm);
    }
}

double CircuitXMLDeserializer::parseDoubleAttr(const std::string &attr, double def) {
    const std::string *v = currentXmlElement->getAttribute(attr);
    if (v == nullptr)
        return def;
    double n = jsParseFloat(*v);
    if (std::isnan(n)) {
        std::cerr << "invalid value for attribute " << attr << ": \"" << *v << "\"\n";
        return def;
    }
    return n;
}

int CircuitXMLDeserializer::parseIntAttr(const std::string &attr, int def) {
    const std::string *v = currentXmlElement->getAttribute(attr);
    if (v == nullptr)
        return def;
    double n = jsParseInt(*v);
    if (std::isnan(n)) {
        std::cerr << "invalid value for attribute " << attr << ": \"" << *v << "\"\n";
        return def;
    }
    return (int) n;
}

bool CircuitXMLDeserializer::parseBooleanAttr(const std::string &attr, bool def) {
    const std::string *v = currentXmlElement->getAttribute(attr);
    if (v == nullptr)
        return def;
    return *v == "true";
}

static void replaceAll(std::string &s, const std::string &from, const std::string &to) {
    size_t p = 0;
    while ((p = s.find(from, p)) != std::string::npos) {
        s.replace(p, from.size(), to);
        p += to.size();
    }
}

std::optional<std::string> CircuitXMLDeserializer::parseStringAttr(const std::string &attr,
                                                                   const std::optional<std::string> &def) {
    const std::string *v = currentXmlElement->getAttribute(attr);
    if (v == nullptr)
        return def;
    // undo the escaping done by CircuitXMLSerializer::dumpAttr()
    std::string s = *v;
    replaceAll(s, "&quot;", "\"");
    replaceAll(s, "&apos;", "'");
    replaceAll(s, "&lt;", "<");
    replaceAll(s, "&gt;", ">");
    replaceAll(s, "&amp;", "&");
    return s;
}

std::optional<std::string> CircuitXMLDeserializer::parseContents() {
    if (currentXmlElement->text.empty())
        return std::nullopt;
    return currentXmlElement->text;
}

std::vector<double> CircuitXMLDeserializer::parseDoubleArray(const std::optional<std::string> &text) {
    std::vector<double> out;
    if (!text)
        return out;
    StringTokenizer st(*text, ",");
    while (st.hasMoreTokens())
        out.push_back(jsParseFloat(st.nextToken()));
    return out;
}

std::vector<const XmlElement *> CircuitXMLDeserializer::getChildElements() {
    std::vector<const XmlElement *> out;
    for (auto &c : currentXmlElement->children)
        out.push_back(c.get());
    return out;
}
