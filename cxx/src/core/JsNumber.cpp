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

#include "JsNumber.h"

#include <charconv>
#include <cmath>
#include <cstdlib>
#include <limits>
#include <stdexcept>

static bool isJsSpace(char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v';
}

double jsParseFloat(const std::string &s) {
    size_t i = 0, n = s.size();
    while (i < n && isJsSpace(s[i]))
        i++;
    size_t start = i;
    if (i < n && (s[i] == '+' || s[i] == '-'))
        i++;
    if (s.compare(i, 8, "Infinity") == 0) {
        bool neg = s[start] == '-';
        return neg ? -std::numeric_limits<double>::infinity() : std::numeric_limits<double>::infinity();
    }
    size_t digits = 0;
    while (i < n && isdigit((unsigned char) s[i])) { i++; digits++; }
    if (i < n && s[i] == '.') {
        i++;
        while (i < n && isdigit((unsigned char) s[i])) { i++; digits++; }
    }
    if (digits == 0)
        return std::numeric_limits<double>::quiet_NaN();
    // exponent only counts if it has digits
    if (i < n && (s[i] == 'e' || s[i] == 'E')) {
        size_t j = i + 1;
        if (j < n && (s[j] == '+' || s[j] == '-'))
            j++;
        if (j < n && isdigit((unsigned char) s[j])) {
            while (j < n && isdigit((unsigned char) s[j]))
                j++;
            i = j;
        }
    }
    std::string num = s.substr(start, i - start);
    return std::strtod(num.c_str(), nullptr);
}

double jsParseInt(const std::string &s, int radix) {
    size_t i = 0, n = s.size();
    while (i < n && isJsSpace(s[i]))
        i++;
    bool neg = false;
    if (i < n && (s[i] == '+' || s[i] == '-'))
        neg = s[i++] == '-';
    if (radix == 0 || radix == 16) {
        if (i + 1 < n && s[i] == '0' && (s[i+1] == 'x' || s[i+1] == 'X')) {
            radix = 16;
            i += 2;
        }
    }
    if (radix == 0)
        radix = 10;
    double val = 0;
    size_t digits = 0;
    for (; i < n; i++, digits++) {
        char c = s[i];
        int d;
        if (c >= '0' && c <= '9') d = c - '0';
        else if (c >= 'a' && c <= 'z') d = c - 'a' + 10;
        else if (c >= 'A' && c <= 'Z') d = c - 'A' + 10;
        else break;
        if (d >= radix)
            break;
        val = val * radix + d;
    }
    if (digits == 0)
        return std::numeric_limits<double>::quiet_NaN();
    return neg ? -val : val;
}

std::string jsNumberToString(double d) {
    if (std::isnan(d))
        return "NaN";
    if (d == 0)
        return "0";
    if (std::isinf(d))
        return d < 0 ? "-Infinity" : "Infinity";
    std::string sign;
    if (d < 0) {
        sign = "-";
        d = -d;
    }

    // shortest round-trip digits, in the form d.ddde[+-]xx
    char buf[64];
    auto res = std::to_chars(buf, buf + sizeof(buf), d, std::chars_format::scientific);
    std::string sci(buf, res.ptr);
    size_t epos = sci.find('e');
    std::string mant = sci.substr(0, epos);
    int exp10 = std::atoi(sci.c_str() + epos + 1);
    std::string digits;
    for (char c : mant)
        if (c != '.')
            digits += c;
    int k = (int) digits.size();
    int n = exp10 + 1;  // value = 0.digits * 10^n

    std::string out;
    if (k <= n && n <= 21) {
        out = digits + std::string(n - k, '0');
    } else if (0 < n && n <= 21) {
        out = digits.substr(0, n) + "." + digits.substr(n);
    } else if (-6 < n && n <= 0) {
        out = "0." + std::string(-n, '0') + digits;
    } else {
        int e = n - 1;
        std::string es = (e < 0 ? "-" : "+") + std::to_string(std::abs(e));
        if (k == 1)
            out = digits + "e" + es;
        else
            out = digits.substr(0, 1) + "." + digits.substr(1) + "e" + es;
    }
    return sign + out;
}

int parseIntStrict(const std::string &s, int radix) {
    double n = jsParseInt(s, radix);
    if (std::isnan(n))
        throw std::runtime_error("invalid integer: \"" + s + "\"");
    return (int) n;
}

double parseFloatStrict(const std::string &s) {
    double n = jsParseFloat(s);
    if (std::isnan(n))
        throw std::runtime_error("invalid float: \"" + s + "\"");
    return n;
}
