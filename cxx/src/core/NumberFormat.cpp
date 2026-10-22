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

#include "NumberFormat.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>

#include "JsNumber.h"

std::string jsToFixed(double v, int digits) {
    if (std::isnan(v))
        return "NaN";
    if (std::abs(v) >= 1e21)
        return jsNumberToString(v);
    char buf[512];
    std::snprintf(buf, sizeof(buf), "%.*f", digits, v);
    std::string s = buf;
    // JS never prints "-0.00"
    if (s[0] == '-' && s.find_first_not_of("-0.") == std::string::npos)
        s.erase(0, 1);
    return s;
}

std::string jsToPrecision(double v, int p) {
    if (!std::isfinite(v))
        return jsNumberToString(v);
    if (v == 0)
        return p > 1 ? "0." + std::string(p - 1, '0') : "0";
    char buf[512];
    std::snprintf(buf, sizeof(buf), "%.*e", p - 1, v);
    std::string s = buf;
    size_t epos = s.find('e');
    int e = std::atoi(s.c_str() + epos + 1);
    if (e < -6 || e >= p) {
        // exponential: d.ddde+x, without leading zeros in the exponent
        std::string mant = s.substr(0, epos);
        return mant + "e" + (e < 0 ? "-" : "+") + std::to_string(std::abs(e));
    }
    std::snprintf(buf, sizeof(buf), "%.*f", p - 1 - e, v);
    return buf;
}

std::string NumberFormat::format(double v) const {
    // Scientific notation pattern (e.g. "#.##E000")
    if (pattern.find('E') != std::string::npos) {
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.2E", v);
        // pad the exponent to 3 digits, dropping a "+" sign
        std::string s = buf;
        size_t e = s.find('E');
        std::string mant = s.substr(0, e);
        std::string ex = s.substr(e + 1);
        bool neg = !ex.empty() && ex[0] == '-';
        if (!ex.empty() && (ex[0] == '-' || ex[0] == '+'))
            ex.erase(0, 1);
        while (ex.size() < 3)
            ex = "0" + ex;
        return mant + "E" + (neg ? "-" : "") + ex;
    }
    size_t dotIdx = pattern.find('.');
    if (dotIdx == std::string::npos)
        return jsNumberToString(std::floor(v + 0.5));
    std::string decPart = pattern.substr(dotIdx + 1);
    int digits = (int) decPart.size();
    bool isFixed = decPart.find('0') != std::string::npos;
    if (isFixed)
        return jsToFixed(v, digits);
    // Optional digits (#) -- trim trailing zeros
    return jsNumberToString(jsParseFloat(jsToFixed(v, digits)));
}
