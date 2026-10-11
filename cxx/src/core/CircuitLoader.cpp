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

#include "JsMath.h"
#include "CircuitLoader.h"

#include "Adjustable.h"
#include "SubcircuitModel.h"
#include "Locale.h"
#include <regex>
#include "WireRouter.h"
#include "CustomLogicModel.h"

#include <cmath>
#include <iostream>

#include "CircuitElm.h"
#include "CircuitXMLDeserializer.h"
#include "DiodeModel.h"
#include "TransistorModel.h"
#include "ElementFactory.h"
#include "Scope.h"
#include "ScopeManager.h"
#include "JsNumber.h"
#include "SimApp.h"
#include "SimulationManager.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

void CircuitLoader::clearCircuit() {
    WireRouter::lastRouter = nullptr;
    app->deleteAllElms();
    sim->resetTime();
    sim->solverType = SimulationManager::SOLVER_AUTO;
    sim->maxTimeStep = 5e-6;
    sim->minTimeStep = 50e-12;
    app->options.dots = false;
    app->options.smallGrid = false;
    app->options.power = false;
    app->options.volts = true;
    app->options.showValues = true;
    app->autoDCOnReset = false;
    app->setGrid();
    app->speedBarValue = 117;
    app->currentBarValue = 50;
    app->powerBarValue = 50;
    CircuitElm::voltageRange = 5;
    sim->lastIterTime = 0;
    if (app->scopeManager != nullptr)
        app->scopeManager->clearScopes();
    app->hintType = -1;
    // (TS: only when not editing a subcircuit's model)
    SubcircuitModel::clearLocalModels();
    // TODO: subcircuit stack
}

// subcircuit library files (saved from the Subcircuit Manager) are XML circuit files
// containing only subcircuit models
bool CircuitLoader::isSubcircuitLibrary(const std::string &text) {
    static const std::regex lib("^<cir\\b[^>]*\\bsublib=\"1\"");
    return std::regex_search(text, lib);
}

// load subcircuit models from a library file, making them global.  Leaves the current circuit alone.
void CircuitLoader::readSubcircuitLibrary(const std::string &text) {
    std::unique_ptr<XmlElement> root = parseXml(text);
    CircuitXMLDeserializer xml(app);
    std::vector<SubcircuitModelRef> models = SubcircuitModel::loadLibrary(xml, root.get());
    // make any existing instances pick up the new definitions
    app->updateModels();
    if (models.empty())
        app->alert(Locale::LS("No subcircuits found in file"));
}

void CircuitLoader::readCircuit(const std::string &text, int flags) {
    if (isSubcircuitLibrary(text)) {
        readSubcircuitLibrary(text);
        return;
    }
    if (!text.empty() && text[0] == '<') {
        if ((flags & RC_RETAIN) == 0)
            clearCircuit();
        readCircuitXml(text, flags);
        return;
    }
    readCircuitText(text, flags);
}

void CircuitLoader::readCircuitXml(const std::string &text, int readFlags) {
    std::unique_ptr<XmlElement> root = parseXml(text);
    CircuitXMLDeserializer xml(app);
    xml.currentXmlElement = root.get();

    if ((readFlags & RC_RETAIN) == 0) {
        int flags = xml.parseIntAttr("f", 0);
        readCircuitFlags(flags);
        sim->maxTimeStep = sim->timeStep = xml.parseDoubleAttr("ts", sim->maxTimeStep);
        double sp = xml.parseDoubleAttr("ic", app->getIterCount());
        app->speedBarValue = (int) std::trunc(jsmath::log(10 * sp) * 24 + 61.5);
        app->currentBarValue = xml.parseIntAttr("cb", app->currentBarValue);
        CircuitElm::voltageRange = xml.parseDoubleAttr("vr", CircuitElm::voltageRange);
        app->powerBarValue = xml.parseIntAttr("pb", app->powerBarValue);
        sim->minTimeStep = xml.parseDoubleAttr("mts", sim->minTimeStep);
        sim->solverType = xml.parseIntAttr("st", sim->solverType);
        app->setGrid();
    }

    xml.readElements(root.get());
    finishReadCircuit(readFlags);
}

// the parts of finishReadCircuit() that aren't UI (the app centers the circuit, etc.)
void CircuitLoader::finishReadCircuit(int flags) {
    if ((flags & RC_RETAIN) == 0) {
        for (size_t i = 0; i < app->adjustables.size(); i++) {
            if (!app->adjustables[i]->createSlider(app)) {
                app->retiredAdjustables.push_back(app->adjustables[i]);  // others may share it
                app->adjustables.erase(app->adjustables.begin() + i--);
            }
        }
    }
}

void CircuitLoader::readCircuitText(const std::string &text, int flags) {
    if ((flags & RC_RETAIN) == 0)
        clearCircuit();
    bool subs = (flags & RC_SUBCIRCUITS) != 0;

    size_t p = 0;
    while (p <= text.size()) {
        size_t e = text.find_first_of("\r\n", p);
        if (e == std::string::npos)
            e = text.size();
        std::string line = text.substr(p, e - p);
        // treat \r\n as one line break
        p = (e < text.size() && text[e] == '\r' && e + 1 < text.size() && text[e+1] == '\n') ? e + 2 : e + 1;
        if (line.empty())
            continue;
        StringTokenizer st(line, " +\t\n\r\f");
        if (!st.hasMoreTokens())
            continue;
        std::string type = st.nextToken();
        int tint = (unsigned char) type[0];
        try {
            if (subs && tint != '.')
                continue;
            if (tint == 'o') {
                if (app->scopeManager != nullptr) {
                    auto sc = std::make_unique<Scope>(app, sim);
                    sc->undump(st);
                    app->scopeManager->addScope(std::move(sc));
                }
                continue;
            }
            if (tint == 'h') {
                app->hintType = parseIntStrict(st.nextToken());
                app->hintItem1 = parseIntStrict(st.nextToken());
                app->hintItem2 = parseIntStrict(st.nextToken());
                continue;
            }
            if (tint == '!') {
                CustomLogicModel::undumpModel(st);
                continue;
            }
            if (tint == '.') {
                SubcircuitModel::undumpModel(st);
                continue;
            }
            if (tint == '$') {
                readOptions(st, flags);
                continue;
            }
            if (tint == '%' || tint == '?' || tint == 'B') {
                // ignore afilter-specific stuff
                continue;
            }
            if (tint >= '0' && tint <= '9')
                tint = parseIntStrict(type);
            if (tint == 34) {
                DiodeModel::undumpModel(st);
                continue;
            }
            if (tint == 32) {
                TransistorModel::undumpModel(st);
                continue;
            }
            if (tint == 38) {
                Adjustable *adj = new Adjustable(st, app);
                if (adj->elm != nullptr)
                    app->adjustables.push_back(adj);
                else
                    delete adj;
                continue;
            }

            int x1 = parseIntStrict(st.nextToken());
            int y1 = parseIntStrict(st.nextToken());
            int x2 = parseIntStrict(st.nextToken());
            int y2 = parseIntStrict(st.nextToken());
            int f = parseIntStrict(st.nextToken());

            CircuitElm *newce = ElementFactory::createCe(tint, x1, y1, x2, y2, f, st);
            if (newce == nullptr) {
                SimulationManager::console("unrecognized dump type: " + type);
                continue;
            }
            newce->setPoints();
            app->elmList.push_back(newce);
        } catch (std::exception &ee) {
            SimulationManager::console(std::string("exception while undumping ") + ee.what());
        }
    }
    finishReadCircuit(flags);
}

void CircuitLoader::readOptions(StringTokenizer &st, int importFlags) {
    int flags = parseIntStrict(st.nextToken());
    if ((importFlags & RC_RETAIN) != 0) {
        if ((flags & 2) != 0)
            app->options.smallGrid = true;
        return;
    }

    readCircuitFlags(flags);
    sim->maxTimeStep = sim->timeStep = parseFloatStrict(st.nextToken());
    double sp = parseFloatStrict(st.nextToken());
    app->speedBarValue = (int) std::trunc(jsmath::log(10 * sp) * 24 + 61.5);
    app->currentBarValue = parseIntStrict(st.nextToken());
    CircuitElm::voltageRange = parseFloatStrict(st.nextToken());
    try {
        app->powerBarValue = parseIntStrict(st.nextToken());
        sim->minTimeStep = parseFloatStrict(st.nextToken());
    } catch (...) {}
    app->setGrid();
}

void CircuitLoader::readCircuitFlags(int flags) {
    app->options.dots = (flags & 1) != 0;
    app->options.smallGrid = (flags & 2) != 0;
    app->options.volts = (flags & 4) == 0;
    app->options.power = (flags & 8) == 8;
    app->options.showValues = (flags & 16) == 0;
    sim->adjustTimeStep = (flags & 64) != 0;
    app->autoDCOnReset = (flags & 128) != 0;
}

std::vector<std::string> CircuitLoader::findUnsupported(const std::string &text) {
    std::vector<std::string> out;
    auto add = [&](const std::string &t) {
        for (const std::string &o : out)
            if (o == t)
                return;
        out.push_back(t);
    };
    if (!text.empty() && text[0] == '<') {
        std::unique_ptr<XmlElement> root;
        try {
            root = parseXml(text);
        } catch (std::exception &) {
            out.push_back("(bad xml)");
            return out;
        }
        for (auto &c : root->children) {
            if (c->getAttribute("x") == nullptr)
                continue;
            const std::string *cls = ElementFactory::xmlClassName(c->tagName);
            if (cls == nullptr || !ElementFactory::hasClass(*cls))
                add(c->tagName);
        }
        return out;
    }
    size_t p = 0;
    while (p < text.size()) {
        size_t e = text.find_first_of("\r\n", p);
        if (e == std::string::npos)
            e = text.size();
        std::string line = text.substr(p, e - p);
        p = e + 1;
        StringTokenizer st(line, " +\t\n\r\f");
        if (!st.hasMoreTokens())
            continue;
        std::string type = st.nextToken();
        int tint = (unsigned char) type[0];
        if (std::string("oh!.$%?B").find((char) tint) != std::string::npos)
            continue;
        if (tint >= '0' && tint <= '9') {
            double n = jsParseInt(type);
            if (std::isnan(n))
                continue;
            tint = (int) n;
            if (tint == 34 || tint == 32 || tint == 38)
                continue;
        }
        if (tint == 'n' && ElementFactory::hasClass("NoiseElm"))
            continue;
        if (!ElementFactory::hasDumpType(tint))
            add(type);
    }
    return out;
}
