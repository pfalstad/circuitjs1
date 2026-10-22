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

#include "ElementFactory.h"

#include "../elements/SubcircuitElm.h"

#include <unordered_map>

#include "CircuitElm.h"
#include "SimulationManager.h"

namespace {
struct Entry {
    ElementFactory::Ctor ctor;
    ElementFactory::DumpCtor dumpCtor;
};
std::unordered_map<std::string, Entry> &classMap() {
    static std::unordered_map<std::string, Entry> m;
    return m;
}
std::unordered_map<int, std::string> &dumpTypeMap() {
    static std::unordered_map<int, std::string> m;
    return m;
}
std::unordered_map<std::string, std::string> &xmlDumpTypeMap() {
    static std::unordered_map<std::string, std::string> m;
    return m;
}
}  // namespace

void ElementFactory::registerClass(const std::string &name, Ctor ctor, DumpCtor dumpCtor) {
    classMap()[name] = {std::move(ctor), std::move(dumpCtor)};
}

void ElementFactory::registerDumpType(const std::string &origClassName, CircuitElm *elm) {
    if (elm == nullptr)
        return;
    int t = elm->getDumpType();
    std::string className = elm->getDumpClassName();
    if (t > 0) {
        auto it = dumpTypeMap().find(t);
        if (it != dumpTypeMap().end()) {
            if (it->second != className)
                SimulationManager::console("dump type conflict for " + className + " " + std::to_string(t));
        } else {
            dumpTypeMap()[t] = className;
        }
    }

    std::string xt = elm->getXmlDumpType();
    auto it = xmlDumpTypeMap().find(xt);
    if (it != xmlDumpTypeMap().end()) {
        if (it->second != className)
            SimulationManager::console("xml dump type conflict for " + className + " " + xt);
    } else {
        xmlDumpTypeMap()[xt] = className;
    }
}

// The C++ base constructor can't call the subclass's getNodeCount(), so finish here
void ElementFactory::finishConstruction(CircuitElm *elm, StringTokenizer *st) {
    // the CircuitElm constructor sets flags = getDefaultFlags(), which can't reach a
    // subclass's override in C++; this needs to happen before postConstruct(), since
    // setupPins() and the like look at the flags
    if (st == nullptr)
        elm->flags |= elm->getDefaultFlags();
    elm->postConstruct(st);
}

CircuitElm *ElementFactory::create(const std::string &name, int x1, int y1) {
    auto it = classMap().find(name);
    if (it == classMap().end())
        return nullptr;
    CircuitElm *elm = it->second.ctor(x1, y1);
    finishConstruction(elm, nullptr);
    return elm;
}

CircuitElm *ElementFactory::create(const std::string &name, int x1, int y1, int x2, int y2, int f, StringTokenizer &st) {
    auto it = classMap().find(name);
    if (it == classMap().end() || !it->second.dumpCtor)
        return nullptr;
    CircuitElm *elm = it->second.dumpCtor(x1, y1, x2, y2, f, st);
    finishConstruction(elm, &st);
    return elm;
}

bool ElementFactory::hasClass(const std::string &name) {
    return classMap().count(name) > 0;
}

CircuitElm *ElementFactory::constructElement(const std::string &n, int x1, int y1) {
    CircuitElm *elm = create(n, x1, y1);
    if (elm != nullptr)
        return elm;

    if (n == "VoltageElm")
        return create("DCVoltageElm", x1, y1);
    if (n == "TransistorElm")
        return create("NTransistorElm", x1, y1);
    if (n == "MosfetElm")
        return create("NMosfetElm", x1, y1);
    if (n == "JfetElm")
        return create("NJfetElm", x1, y1);
    if (n == "DarlingtonElm")
        return create("NDarlingtonElm", x1, y1);

    // if you take out RingCounterElm, it will break subcircuits
    // if you take out DecadeElm, it will break the menus and people's saved shortcuts
    if (n == "DecadeElm" || n == "RingCounterElm")
        return create("RingCounterElm", x1, y1);

    // if you take out UserDefinedLogicElm, it will break people's saved shortcuts
    if (n == "UserDefinedLogicElm")
        return create("CustomLogicElm", x1, y1);

    if (n.rfind("SubcircuitElm:", 0) == 0) {
        std::string name = n.substr(n.find(':') + 1);
        CircuitElm *se = new SubcircuitElm(x1, y1, name);
        finishConstruction(se, nullptr);
        return se;
    }
    return nullptr;
}

CircuitElm *ElementFactory::createCe(int tint, int x1, int y1, int x2, int y2, int f, StringTokenizer &st) {
    // for old files
    if (tint == 'n')
        return create("NoiseElm", x1, y1, x2, y2, f, st);

    auto it = dumpTypeMap().find(tint);
    if (it == dumpTypeMap().end())
        return nullptr;
    return create(it->second, x1, y1, x2, y2, f, st);
}

bool ElementFactory::hasDumpType(int tint) {
    auto it = dumpTypeMap().find(tint);
    return it != dumpTypeMap().end() && classMap().count(it->second) > 0;
}

const std::string *ElementFactory::xmlClassName(const std::string &tag) {
    auto it = xmlDumpTypeMap().find(tag);
    return it == xmlDumpTypeMap().end() ? nullptr : &it->second;
}
