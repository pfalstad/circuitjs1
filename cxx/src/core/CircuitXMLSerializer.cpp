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

#include "CircuitXMLSerializer.h"

#include "Adjustable.h"

#include <stdexcept>

#include "CircuitElm.h"
#include "CustomLogicModel.h"
#include "MosfetModel.h"
#include "RelayModel.h"
#include "DiodeModel.h"
#include "JsNumber.h"
#include "Scope.h"
#include "ScopeManager.h"
#include "SimApp.h"
#include "SimulationManager.h"
#include "TransistorModel.h"
#include "XmlDoc.h"

void CircuitXMLSerializer::checkAttr(XmlElement *elem, const std::string &name) {
    if (elem->hasAttribute(name))
        throw std::runtime_error("naming conflict: " + name);
}

void CircuitXMLSerializer::dumpAttr(XmlElement *elem, const std::string &name, const std::string &value) {
    checkAttr(elem, name);
    // the TS version escapes strings here, before the serializer escapes them again;
    // parseStringAttr() undoes the extra layer, so keep doing it for compatibility
    std::string out;
    for (char c : value) {
        switch (c) {
        case '&': out += "&amp;"; break;
        case '"': out += "&quot;"; break;
        case '\'': out += "&apos;"; break;
        case '<': out += "&lt;"; break;
        default: out += c;
        }
    }
    elem->setAttribute(name, out);
}

void CircuitXMLSerializer::dumpAttr(XmlElement *elem, const std::string &name, double value) {
    checkAttr(elem, name);
    elem->setAttribute(name, jsNumberToString(value));
}

void CircuitXMLSerializer::dumpAttr(XmlElement *elem, const std::string &name, bool value) {
    checkAttr(elem, name);
    elem->setAttribute(name, value ? "true" : "false");
}

void CircuitXMLSerializer::prettyPrintNode(const XmlElement *node, int indent, std::string &sb) {
    std::string indentStr(indent * 2, ' ');

    // Print opening tag
    sb += indentStr + "<" + node->tagName;

    // Add attributes
    for (auto &a : node->attrs)
        sb += " " + a.first + "=\"" + escapeXml(a.second) + "\"";

    // trimmed text content
    std::string text = node->text;
    size_t b = text.find_first_not_of(" \t\r\n");
    text = (b == std::string::npos) ? "" : text.substr(b, text.find_last_not_of(" \t\r\n") - b + 1);

    if (node->children.empty() && node->text.empty()) {
        // Self-closing tag if no children
        sb += "/>\n";
        return;
    }
    sb += ">";
    // (the DOM version interleaves text and elements; circuit files never mix them)
    if (!text.empty())
        sb += escapeXml(text);
    bool hasElementChildren = false;
    for (auto &child : node->children) {
        if (!hasElementChildren)
            sb += "\n";
        hasElementChildren = true;
        prettyPrintNode(child.get(), indent + 1, sb);
    }
    // Closing tag -- indent if we had element children
    if (hasElementChildren)
        sb += indentStr;
    sb += "</" + node->tagName + ">\n";
}

std::string CircuitXMLSerializer::prettyPrint(const XmlElement *root) {
    std::string sb;
    prettyPrintNode(root, 0, sb);
    return sb;
}

std::string CircuitXMLSerializer::dumpCircuit() {
    // TODO: subcircuit models
    CustomLogicModel::clearDumpedFlags();
    RelayModel::clearDumpedFlags();
    MosfetModel::clearDumpedFlags();
    DiodeModel::clearDumpedFlags();
    TransistorModel::clearDumpedFlags();

    XmlElement root("cir");
    const SimApp::Options &o = app->options;
    int f = o.dots ? 1 : 0;
    f |= o.smallGrid ? 2 : 0;
    f |= o.volts ? 0 : 4;
    f |= o.power ? 8 : 0;
    f |= o.showValues ? 0 : 16;
    // 32 = linear scale in afilter
    f |= sim->adjustTimeStep ? 64 : 0;
    f |= app->autoDCOnReset ? 128 : 0;
    dumpAttr(&root, "f", f);
    dumpAttr(&root, "ts", sim->maxTimeStep);
    dumpAttr(&root, "ic", app->getIterCount());
    dumpAttr(&root, "cb", app->currentBarValue);
    dumpAttr(&root, "pb", app->powerBarValue);
    dumpAttr(&root, "vr", CircuitElm::voltageRange);
    dumpAttr(&root, "mts", sim->minTimeStep);
    if (sim->solverType != 0)
        dumpAttr(&root, "st", sim->solverType);

    for (CircuitElm *ce : app->elmList) {
        // dumpXml() may add a model to the root first, so append the element afterwards
        auto elem = std::make_unique<XmlElement>(ce->getXmlDumpType());
        ce->dumpXml(&root, elem.get());
        if (saveState)
            ce->dumpXmlState(&root, elem.get());
        root.appendChild(std::move(elem));
    }
    // TODO: unused local subcircuit models
    if (app->scopeManager != nullptr && saveState) {
        ScopeManager *sm = app->scopeManager;
        for (int i = 0; i != sm->scopeCount; i++)
            sm->scopes[i]->dumpXml(&root);
    }
    for (Adjustable *adj : app->adjustables)
        adj->dumpXml(&root, app);
    if (app->hintType != -1) {
        XmlElement *h = root.createChild("h");
        dumpAttr(h, "t", app->hintType);
        dumpAttr(h, "i1", app->hintItem1);
        dumpAttr(h, "i2", app->hintItem2);
    }
    return prettyPrint(&root);
}
