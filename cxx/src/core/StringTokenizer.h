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

#include <stdexcept>
#include <string>

// java.util.StringTokenizer, used to read the old text file format
class StringTokenizer {
    size_t pos = 0;
    std::string str;
    std::string delim;
    bool retDelims;

    bool isDelim(char c) const { return delim.find(c) != std::string::npos; }

public:
    explicit StringTokenizer(const std::string &s, const std::string &d = " \t\n\r\f", bool returnDelims = false)
        : str(s), delim(d), retDelims(returnDelims) {}

    bool hasMoreTokens() {
        if (!retDelims) {
            while (pos < str.size() && isDelim(str[pos]))
                pos++;
        }
        return pos < str.size();
    }

    std::string nextToken() {
        if (pos < str.size() && isDelim(str[pos])) {
            if (retDelims)
                return str.substr(pos++, 1);
            while (++pos < str.size() && isDelim(str[pos]))
                ;
        }
        if (pos < str.size()) {
            size_t start = pos;
            while (++pos < str.size() && !isDelim(str[pos]))
                ;
            return str.substr(start, pos - start);
        }
        throw std::out_of_range("NoSuchElementException");
    }

    std::string nextToken(const std::string &d) {
        delim = d;
        return nextToken();
    }
};
