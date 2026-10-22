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

#pragma once

#include <functional>
#include <string>
#include <type_traits>

class CircuitElm;
class StringTokenizer;

// Creates elements by class name (for XML files and the UI) or by dump type (for the old
// text format).  Stands in for ElementFactory, CirSim.register() and CirSim.createCe().
class ElementFactory {
public:
    using Ctor = std::function<CircuitElm *(int, int)>;
    using DumpCtor = std::function<CircuitElm *(int, int, int, int, int, StringTokenizer &)>;

    static void registerClass(const std::string &name, Ctor ctor, DumpCtor dumpCtor);

    template <class T>
    static void registerClass(const std::string &name) {
        DumpCtor dc;
        if constexpr (std::is_constructible_v<T, int, int, int, int, int, StringTokenizer &>)
            dc = [](int xa, int ya, int xb, int yb, int f, StringTokenizer &st) -> CircuitElm * {
                return new T(xa, ya, xb, yb, f, st);
            };
        registerClass(name, [](int x, int y) -> CircuitElm * { return new T(x, y); }, dc);
    }

    // record a class's dump types, using a sample instance (like CirSim.register())
    static void registerDumpType(const std::string &className, CircuitElm *elm);

    // Create element placed at (x1,y1) -- used when user places a new element
    static CircuitElm *create(const std::string &name, int x1, int y1);
    // Create element from saved/loaded dump -- used when loading a circuit file
    static CircuitElm *create(const std::string &name, int x1, int y1, int x2, int y2, int f, StringTokenizer &st);
    static bool hasClass(const std::string &name);

    // create(), plus fallbacks for class names that old files and subcircuits use
    static CircuitElm *constructElement(const std::string &name, int x1, int y1);

    // create an element from an old-format text dump line
    static CircuitElm *createCe(int tint, int x1, int y1, int x2, int y2, int f, StringTokenizer &st);

    // is there a class for this old-format dump type?
    static bool hasDumpType(int tint);

    // class name for an XML tag, or nullptr
    static const std::string *xmlClassName(const std::string &tag);

private:
    static void finishConstruction(CircuitElm *elm, StringTokenizer *st);
};

// register every element class (registerElements.cpp)
void registerElements();
