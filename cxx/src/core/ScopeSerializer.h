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

class CircuitXMLDeserializer;
class Scope;
class StringTokenizer;
class XmlElement;

// reads and writes scopes in both file formats
class ScopeSerializer {
public:
    explicit ScopeSerializer(Scope *s) : scope(s) {}

    static constexpr int FLAG_YELM = 32;
    static constexpr int FLAG_IVALUE = 2048;
    static constexpr int FLAG_PLOTS = 4096;
    static constexpr int FLAG_MAN_SCALE = 16;
    static constexpr int FLAG_PERPLOTFLAGS = 1 << 18;
    static constexpr int FLAG_PERPLOT_MAN_SCALE = 1 << 19;
    static constexpr int FLAG_DIVISIONS = 1 << 21;
    static constexpr int FLAG_TRIGGER = 1 << 24;

    int getFlags() const;
    void setFlags(int flags);
    void dumpXml(XmlElement *root);
    void undumpXml(CircuitXMLDeserializer &xml);
    void undump(StringTokenizer &st);

private:
    static std::string exportAsDecOrHex(int v, int thresh);
    static int importDecOrHex(const std::string &s);

    Scope *scope;
};
