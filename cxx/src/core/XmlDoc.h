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

#include <memory>
#include <string>
#include <utility>
#include <vector>

// A minimal XML element tree, standing in for the browser DOM.  Covers what circuit
// files use: elements, attributes, text content, comments and the XML declaration.
class XmlElement {
public:
    std::string tagName;
    std::vector<std::pair<std::string, std::string>> attrs;  // in document order
    std::vector<std::unique_ptr<XmlElement>> children;
    std::string text;  // concatenated character data directly inside this element

    explicit XmlElement(std::string tag) : tagName(std::move(tag)) {}

    // returns nullptr if the attribute is missing (like getAttribute() returning null)
    const std::string *getAttribute(const std::string &name) const;
    bool hasAttribute(const std::string &name) const { return getAttribute(name) != nullptr; }
    void setAttribute(const std::string &name, const std::string &value);
    void removeAttribute(const std::string &name);

    XmlElement *appendChild(std::unique_ptr<XmlElement> child);
    XmlElement *createChild(const std::string &tag);
};

// parse a document; throws std::runtime_error on malformed input
std::unique_ptr<XmlElement> parseXml(const std::string &text);

// escape &, <, >, " for attribute values and text
std::string escapeXml(const std::string &s);
