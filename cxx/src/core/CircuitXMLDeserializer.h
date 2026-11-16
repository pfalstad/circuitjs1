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

#include <optional>
#include <string>
#include <vector>

class CircuitElm;
class SimApp;
class XmlElement;

class CircuitXMLDeserializer {
public:
    SimApp *app;
    const XmlElement *currentXmlElement = nullptr;
    CircuitElm *currentElm = nullptr;

    explicit CircuitXMLDeserializer(SimApp *a) : app(a) {}

    // read the circuit's elements (not scopes, sliders, models yet) into app->elmList
    // subcircuitsOnly: read only the subcircuit model definitions
    void readElements(const XmlElement *root, bool subcircuitsOnly = false);

    double parseDoubleAttr(const std::string &attr, double def);
    int parseIntAttr(const std::string &attr, int def);
    bool parseBooleanAttr(const std::string &attr, bool def);
    std::optional<std::string> parseStringAttr(const std::string &attr, const std::optional<std::string> &def);
    std::optional<std::string> parseContents();
    std::vector<double> parseDoubleArray(const std::optional<std::string> &text);
    std::vector<const XmlElement *> getChildElements();
    void parseChildElement(const XmlElement *e) { currentXmlElement = e; }
};
