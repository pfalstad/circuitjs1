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

#include <optional>
#include <string>
#include <unordered_map>

// Simplified from util/Locale.java.  The app loads the string catalog (see
// CirSim::loadLocale()); the headless tools leave the map empty, so LS() returns English.
namespace Locale {
inline const std::string ohmString = "Ω";
inline const std::string muString = "μ";

extern std::unordered_map<std::string, std::string> localizationMap;

std::string LS(const std::string &s);

// Ported from circuitjs1.java: circuitjs1.convertUnicodeEscapes()
std::string convertUnicodeEscapes(const std::string &input);

// Ported from circuitjs1.java: circuitjs1.processLocale()
std::unordered_map<std::string, std::string> processLocale(const std::string &data);

// Look up a catalog entry without the LS() fallback: returns nothing when the
// key is absent, so callers can tell "not translated" from "translated to
// the same text". Used for non-UI entries such as "search:<ElmClass>".
std::optional<std::string> lookup(const std::string &s);
}
