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

#include "SRAMElm.h"

#include <algorithm>

#include "../core/StringTokenizer.h"

#include <cmath>
#include <cstdio>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/XmlDoc.h"

void SRAMElm::postConstruct(StringTokenizer *st) {
    ChipElm::postConstruct(st);
    if (st == nullptr) {
        addressBits = dataBits = 4;
        map.clear();
        setupPins();
        return;
    }
    map.clear();
    addressBits = parseIntStrict(st->nextToken());
    dataBits = parseIntStrict(st->nextToken());
    setupPins();
    try {
        // load contents
        // format: addr val(addr) val(addr+1) val(addr+2) ... -1 addr val val ... -1 ... -2
        while (true) {
            std::string a_str = st->nextToken();
            int a = parseIntStrict(a_str);
            if (a < 0)
                break;
            int v = parseIntStrict(st->nextToken());
            map[a] = v;
            while (true) {
                v = parseIntStrict(st->nextToken());
                if (v < 0)
                    break;
                map[++a] = v;
            }
        }
    } catch (...) {}
    if ((flags & FLAG_RELOAD_ON_RESET) != 0)
        initialMap = map;
}

void SRAMElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ab", addressBits);
    CircuitXMLSerializer::dumpAttr(elem, "db", dataBits);
}

void SRAMElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    ChipElm::dumpXmlState(doc, elem);
    if (!map.empty())
        elem->text += contentsToString();
}

void SRAMElm::undumpXml(CircuitXMLDeserializer &xml) {
    ChipElm::undumpXml(xml);
    addressBits = xml.parseIntAttr("ab", addressBits);
    dataBits = xml.parseIntAttr("db", dataBits);
    map.clear();
    try {
        std::optional<std::string> s = xml.parseContents();
        if (s && !s->empty()) parseContentsString(*s);
    } catch (...) {}
    setupPins();
}

void SRAMElm::reset() {
    ChipElm::reset();
    if ((flags & FLAG_RELOAD_ON_RESET) != 0 && initialMap)
        map = *initialMap;
}

void SRAMElm::setupPins() {
    sizeX = 2;
    int addrY = useBus() ? 1 : addressBits;
    int dataY = useBus() ? 1 : dataBits;
    sizeY = std::max(addrY, dataY) + 1;
    bits = addressBits;
    pins.assign(getPostCount(), Pin());
    pins[0] = Pin(this, 0, SIDE_W, "WE");
    pins[0].lineOver = true;
    pins[1] = Pin(this, 0, SIDE_E, "OE");
    pins[1].lineOver = true;
    addressNodes = 2;
    dataNodes = 2 + addressBits;
    internalNodes = 2 + addressBits + dataBits;
    makeBitPins(addressBits, sizeY - addrY, SIDE_W, addressNodes, "A", false, false, true);
    makeBitPins(dataBits, sizeY - dataY, SIDE_E, dataNodes, "D", true, false, true);
    allocNodes();
}

std::optional<EditInfo> SRAMElm::getChipEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Address Bits", addressBits, 1, 1).setDimensionless();
    if (n == 1)
        return EditInfo("# of Data Bits", dataBits, 1, 1).setDimensionless();
    if (n == 2) {
        EditInfo ei("Contents", 0);
        ei.textArea = TextArea{contentsOverride ? *contentsOverride : contentsToString()};
        contentsOverride.reset();
        if (fileNameOverride)
            loadedFileName = fileNameOverride;
        fileNameOverride.reset();
        return ei;
    }
    if (n == 3)
        return EditInfo::createCheckbox("Hex Display", hasFlag(FLAG_HEX_DISPLAY));
    if (n == 4) {
        // (TS: a file input)
        EditInfo ei(loadedFileName ? "Loaded: " + *loadedFileName : "", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Load Contents From File") + "..."};
        return ei;
    }
    if (n == 5)
        return EditInfo::createCheckbox("Restore Contents on Reset", (flags & FLAG_RELOAD_ON_RESET) != 0);
    return ChipElm::getChipEditInfo(n);
}

static std::string upperHex(int v) {
    char buf[16];
    std::snprintf(buf, sizeof buf, "%X", (unsigned) v);
    return buf;
}

std::string SRAMElm::contentsToString() {
    bool hex = hasFlag(FLAG_HEX_DISPLAY);
    std::string s;
    int maxI = 1 << addressBits;
    for (int i = 0; i < maxI; i++) {
        auto it = map.find(i);
        if (it == map.end() || it->second == 0)
            continue;
        int val = it->second;
        s += (hex ? upperHex(i) : std::to_string(i)) + ": " + (hex ? toHex(val) : std::to_string(val));
        int ct = 1;
        while (true) {
            it = map.find(++i);
            if (it == map.end() || it->second == 0)
                break;
            val = it->second;
            s += " " + (hex ? toHex(val) : std::to_string(val));
            if (++ct == 8)
                break;
        }
        s += "\n";
    }
    return s;
}

void SRAMElm::fetchLoadFileData() {
    std::string name, arr;
    if (!app->loadTextFile(name, arr))
        return;
    if (arr.size() >= 128000) {
        app->alert(Locale::LS("Cannot load: That file is too large!"));
        return;
    }
    int bytesPerValue = dataBits > 8 ? 2 : 1;
    int hexDigits = bytesPerValue * 2;
    size_t n = arr.size() - (arr.size() % bytesPerValue);
    std::string str = "0x0:";
    for (size_t i = 0; i < n; i += bytesPerValue) {
        int val = 0;
        for (int j = 0; j < bytesPerValue; j++)
            val = (val << 8) | (unsigned char) arr[i + j];
        std::string hex = upperHex(val);
        while ((int) hex.size() < hexDigits)
            hex = "0" + hex;
        str += " 0x" + hex;
    }
    // doLoadCallback(); the dialog is rebuilt later, and getChipEditInfo() clears these
    contentsOverride = str;
    fileNameOverride = name;
    app->resetEditDialog();
}

std::string SRAMElm::toHex(int val) {
    int mask = (1 << dataBits) - 1;
    std::string h = upperHex(val & mask);
    return h.size() < 2 ? "0" + h : h;
}

// split the way JS line.split(/ +/) does
static std::vector<std::string> splitSpaces(const std::string &s) {
    std::vector<std::string> out;
    size_t start = 0;
    while (true) {
        size_t p = s.find(' ', start);
        if (p == std::string::npos) {
            out.push_back(s.substr(start));
            return out;
        }
        out.push_back(s.substr(start, p - start));
        start = s.find_first_not_of(' ', p);
        if (start == std::string::npos) {
            out.push_back("");
            return out;
        }
    }
}

void SRAMElm::parseContentsString(const std::string &s) {
    map.clear();
    size_t lineStart = 0;
    while (lineStart <= s.size()) {
        size_t nl = s.find('\n', lineStart);
        std::string line = s.substr(lineStart, nl == std::string::npos ? std::string::npos : nl - lineStart);
        lineStart = (nl == std::string::npos) ? s.size() + 1 : nl + 1;
        try {
            // args = line.split(/: */)
            size_t colon = line.find(':');
            int addr = parseNumber(line.substr(0, colon));
            if (colon == std::string::npos)
                continue;  // (args[1] is undefined in JS, which throws)
            size_t vstart = line.find_first_not_of(' ', colon + 1);
            if (vstart == std::string::npos)
                vstart = line.size();
            size_t vend = line.find(':', vstart);
            std::vector<std::string> vals = splitSpaces(line.substr(vstart, vend == std::string::npos ? std::string::npos : vend - vstart));
            for (const std::string &v : vals) {
                int val = parseNumber(v);
                map[addr++] = val;
            }
        } catch (...) {}
    }
}

int SRAMElm::parseNumber(const std::string &str) {
    if (str.rfind("0x", 0) == 0)
        return parseIntStrict(str.substr(2), 16);
    if (hasFlag(FLAG_HEX_DISPLAY))
        return parseIntStrict(str, 16);
    if (str.rfind("0b", 0) == 0)
        return parseIntStrict(str.substr(2), 2);
    return parseIntStrict(str);
}

void SRAMElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        if (ei.value >= 2 && ei.value <= 16) {
            addressBits = (int) std::floor(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 2 and 16");
    }
    if (n == 1) {
        if (ei.value >= 2 && ei.value <= 16) {
            dataBits = (int) std::floor(ei.value);
            setupPins();
            setPoints();
        } else
            ei.setError("must be between 2 and 16");
    }
    if (n == 2) {
        parseContentsString(ei.textArea->value);
        if ((flags & FLAG_RELOAD_ON_RESET) != 0)
            initialMap = map;
    }
    if (n == 3) {
        int oldFlags = flags;
        flags = ei.changeFlag(flags, FLAG_HEX_DISPLAY);
        if (flags != oldFlags)
            ei.newDialog = true;
    }
    if (n == 4)
        fetchLoadFileData();
    if (n == 5) {
        flags = ei.changeFlag(flags, FLAG_RELOAD_ON_RESET);
        if ((flags & FLAG_RELOAD_ON_RESET) != 0)
            initialMap = map;
        else
            initialMap.reset();
    }
}

void SRAMElm::setVoltageSource(int j, VoltageSource *vs) {
    ChipElm::setVoltageSource(j, vs);
    vs->setNodes(CircuitNode::ground, nodes[internalNodes + j]);
}

bool SRAMElm::getMatrixConnection(int n1, int n2) {
    // each internal node connects to its corresponding data pin
    for (int i = 0; i != dataBits; i++)
        if (comparePair(n1, n2, internalNodes + i, dataNodes + i))
            return true;
    return false;
}

void SRAMElm::stamp() {
    for (int i = 0; i != dataBits; i++) {
        Pin &p = pins[i + dataNodes];
        sim->stampVoltageSource(CircuitNode::ground, nodes[internalNodes + i], p.voltSource);
        sim->stampNonLinear(nodes[internalNodes + i]);
        sim->stampNonLinear(nodes[dataNodes + i]);
    }
}

void SRAMElm::doStep() {
    bool writeEnabled = nodes[0]->v < getThreshold();
    bool outputEnabled = (nodes[1]->v < getThreshold()) && !writeEnabled;
    // get address
    address = 0;
    for (int i = 0; i != addressBits; i++)
        address |= (nodes[addressNodes + i]->v > getThreshold()) ? 1 << (addressBits - 1 - i) : 0;
    auto it = map.find(address);
    int data = (it == map.end()) ? 0 : it->second;
    for (int i = 0; i != dataBits; i++) {
        Pin &p = pins[i + dataNodes];
        sim->updateVoltageSource(CircuitNode::ground, nodes[internalNodes + i], p.voltSource,
                                 (data & (1 << (dataBits - 1 - i))) == 0 ? 0 : highVoltage);
        // if output enabled, stamp a small resistor from internal voltage source to data pin.
        // if output disabled, stamp a large pulldown resistor from data pin to ground.
        if (outputEnabled)
            sim->stampResistor(nodes[internalNodes + i], nodes[dataNodes + i], 1);
        else
            sim->stampResistor(nodes[dataNodes + i], CircuitNode::ground, 1e8);
    }
}

void SRAMElm::stepFinished() {
    int data = 0;
    bool writeEnabled = nodes[0]->v < getThreshold();
    if (!writeEnabled)
        return;
    // store data in RAM
    for (int i = 0; i != dataBits; i++)
        data |= (nodes[dataNodes + i]->v > getThreshold()) ? 1 << (dataBits - 1 - i) : 0;
    map[address] = data;
}
