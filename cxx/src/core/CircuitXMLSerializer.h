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

#pragma once

#include <string>

class SimApp;
class SimulationManager;
class XmlElement;

class CircuitXMLSerializer {
public:
    CircuitXMLSerializer(SimApp *app, SimulationManager *sim) : app(app), sim(sim) {}

    // the whole circuit as XML text, in the same layout the TS version writes
    std::string dumpCircuit();

    static std::string prettyPrint(const XmlElement *root);

    // false leaves out the simulation state (voltages, currents) and the scopes, whose
    // settings drift as they run (auto scale, plot speed), for checking whether the
    // circuit itself has changed since it was saved
    bool saveState = true;

    // throws if the attribute is already set, to catch two fields using the same name
    static void checkAttr(XmlElement *elem, const std::string &name);

    static void dumpAttr(XmlElement *elem, const std::string &name, const std::string &value);
    static void dumpAttr(XmlElement *elem, const std::string &name, const char *value) {
        dumpAttr(elem, name, std::string(value));
    }
    static void dumpAttr(XmlElement *elem, const std::string &name, double value);
    static void dumpAttr(XmlElement *elem, const std::string &name, int value) {
        dumpAttr(elem, name, (double) value);
    }
    static void dumpAttr(XmlElement *elem, const std::string &name, bool value);

private:
    static void prettyPrintNode(const XmlElement *node, int indent, std::string &sb);

    SimApp *app;
    SimulationManager *sim;
};
