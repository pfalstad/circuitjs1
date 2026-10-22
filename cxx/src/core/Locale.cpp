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

#include "Locale.h"

#include <cctype>

#include "SimulationManager.h"

namespace Locale {

std::unordered_map<std::string, std::string> localizationMap;

std::string LS(const std::string &s) {
    if (s.empty())
        return s;

    auto sm = localizationMap.find(s);
    if (sm != localizationMap.end())
        return sm->second;

    // use trailing ~ to differentiate strings that are the same in English but need
    // different translations.
    // remove these if there's no translation.
    size_t ix = s.find('~');
    if (ix != s.size() - 1)
        return s;

    std::string s1 = s.substr(0, ix);
    auto sm2 = localizationMap.find(s1);
    if (sm2 != localizationMap.end())
        return sm2->second;

    return s1;
}

static void appendUtf8(std::string &out, unsigned cp) {
    if (cp < 0x80) {
        out += (char) cp;
    } else if (cp < 0x800) {
        out += (char) (0xC0 | (cp >> 6));
        out += (char) (0x80 | (cp & 0x3F));
    } else {
        out += (char) (0xE0 | (cp >> 12));
        out += (char) (0x80 | ((cp >> 6) & 0x3F));
        out += (char) (0x80 | (cp & 0x3F));
    }
}

std::string convertUnicodeEscapes(const std::string &input) {
    if (input.find("\\u") == std::string::npos)
        return input;
    std::string result;
    size_t length = input.size();
    size_t i = 0;

    while (i < length) {
        if (i + 5 < length && input[i] == '\\' && input[i + 1] == 'u') {
            // Found a Unicode escape sequence
            std::string hexCode = input.substr(i + 2, 4);
            bool ok = true;
            unsigned codePoint = 0;
            for (char c : hexCode) {
                int d = std::isxdigit((unsigned char) c) ? (std::isdigit((unsigned char) c) ? c - '0' : (std::tolower((unsigned char) c) - 'a' + 10)) : -1;
                if (d < 0) {
                    ok = false;
                    break;
                }
                codePoint = codePoint * 16 + d;
            }
            if (ok) {
                // Convert hex code to a Unicode character
                appendUtf8(result, codePoint);
            } else {
                // If the hex code is invalid, append as is
                result += "\\u" + hexCode;
            }
            i += 6;  // Skip past the escape sequence
        } else {
            // Normal character, just append it
            result += input[i];
            i++;
        }
    }
    return result;
}

std::unordered_map<std::string, std::string> processLocale(const std::string &data) {
    std::unordered_map<std::string, std::string> map;
    size_t pos = 0;
    while (pos <= data.size()) {
        size_t nl = data.find('\n', pos);
        if (nl == std::string::npos)
            nl = data.size();
        std::string line = data.substr(pos, nl - pos);
        pos = nl + 1;
        if (!line.empty() && line.back() == '\r')
            line.pop_back();
        if (line.empty())
            continue;
        if (line[0] != '"') {
            SimulationManager::console("ignoring line in string catalog: " + line);
            continue;
        }
        line = convertUnicodeEscapes(line);
        size_t q2 = line.find('"', 1);
        if (q2 == std::string::npos || q2 + 2 >= line.size()
            || line[q2 + 1] != '='
            || line[q2 + 2] != '"'
            || line.back() != '"'
            || line.size() < q2 + 4) {
            SimulationManager::console("ignoring line in string catalog: " + line);
            continue;
        }
        std::string str1 = line.substr(1, q2 - 1);
        std::string str2 = line.substr(q2 + 3, line.size() - 1 - (q2 + 3));
        map[str1] = str2;
    }
    return map;
}

}
