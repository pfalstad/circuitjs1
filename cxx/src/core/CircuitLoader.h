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

#include <string>
#include <vector>

class SimApp;
class SimulationManager;
class StringTokenizer;
class XmlElement;

// reads circuit files (XML or the old text format) into the app's element list
class CircuitLoader {
public:
    static constexpr int RC_RETAIN = 1;
    static constexpr int RC_NO_CENTER = 2;
    static constexpr int RC_SUBCIRCUITS = 4;
    static constexpr int RC_KEEP_TITLE = 8;
    // restoring an earlier state of the same circuit (undo/redo, leaving a subcircuit editor),
    // so keep its local models, including ones no element uses yet
    static constexpr int RC_KEEP_MODELS = 16;

    CircuitLoader(SimApp *app, SimulationManager *sim) : app(app), sim(sim) {}

    void clearCircuit();
    // model library files (saved from the Model Manager) don't replace the circuit
    static bool isModelLibrary(const std::string &text);
    // replace the circuit with the elements in doc (CircuitXMLDeserializer.readCircuitFromDoc())
    void readCircuitFromDoc(const XmlElement *doc);
    void readCircuit(const std::string &text, int flags = 0);
    void readCircuitFlags(int flags);

    // element types in a circuit file that we can't create yet (XML tags or dump types),
    // without loading it.  Empty if the circuit is fully supported.
    static std::vector<std::string> findUnsupported(const std::string &text);

private:
    void finishReadCircuit(int flags);
    void readModelLibrary(const std::string &text);
    void readCircuitXml(const std::string &text, int flags);
    void readCircuitText(const std::string &text, int flags);
    void readOptions(StringTokenizer &st, int importFlags);

    SimApp *app;
    SimulationManager *sim;
};
