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

#include "DataInputElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

int DataInputElm::fileNumCounter = 1;
std::map<int, DataFileEntry> DataInputElm::dataFileMap;

DataInputElm::DataInputElm(int xx, int yy) : RailElm(xx, yy, WF_AC) {
    scaleFactor = 1;
    sampleLength = 1e-3;
}

DataInputElm::DataInputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : RailElm(xa, ya, xb, yb, f, st) {
    waveform = WF_AC;
    sampleLength = parseFloatStrict(st.nextToken());
    scaleFactor = parseFloatStrict(st.nextToken());
    fileNum = parseIntStrict(st.nextToken());
    auto it = dataFileMap.find(fileNum);
    if (it != dataFileMap.end()) {
        fileName = it->second.fileName;
        data = it->second.data;
    }
}

void DataInputElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    RailElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "sl", sampleLength);
    CircuitXMLSerializer::dumpAttr(elem, "sf", scaleFactor);
}

void DataInputElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    if (data) {
        if (fileNum == 0)
            fileNum = fileNumCounter++;
        DataFileEntry ent;
        ent.fileName = fileName.value_or("");
        ent.data = data;
        dataFileMap[fileNum] = ent;
        CircuitXMLSerializer::dumpAttr(elem, "fn", fileNum);
    }
}

void DataInputElm::undumpXml(CircuitXMLDeserializer &xml) {
    RailElm::undumpXml(xml);
    sampleLength = xml.parseDoubleAttr("sl", sampleLength);
    scaleFactor = xml.parseDoubleAttr("sf", scaleFactor);
    fileNum = xml.parseIntAttr("fn", 0);
    auto it = dataFileMap.find(fileNum);
    if (it != dataFileMap.end()) {
        fileName = it->second.fileName;
        data = it->second.data;
    }
}

void DataInputElm::drawRail(Graphics &g) {
    drawRailText(g, fileName ? *fileName : Locale::LS("No file"));
}

std::optional<std::string> DataInputElm::getRailText() {
    return fileName ? *fileName : Locale::LS("No file");
}

double DataInputElm::getVoltage() {
    if (!data || data->empty())
        return 0;
    double ptrd = std::trunc(timeOffset / sampleLength);
    long ptr = ptrd < 0 ? 0 : ptrd >= (double) data->size() ? (long) data->size() : (long) ptrd;
    if (ptr >= (long) data->size()) {
        if (doesRepeat()) {
            ptr = 0;
            timeOffset = 0;
        } else
            ptr = (long) data->size() - 1;
    }
    return (*data)[ptr] * scaleFactor;
}

void DataInputElm::stepFinished() {
    timeOffset += sim->timeStep;
}

std::optional<EditInfo> DataInputElm::getEditInfo(int n) {
    if (n == 0) {
        // (TS: a file input)
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Choose Data File...")};
        return ei;
    }
    if (n == 1)
        return EditInfo("Scale Factor", scaleFactor);
    if (n == 2)
        return EditInfo("Sample Length (s)", sampleLength);
    if (n == 3)
        return EditInfo::createCheckbox("Repeat", doesRepeat());
    return std::nullopt;
}

void DataInputElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        std::string name, contents;
        if (app->loadTextFile(name, contents))
            doLoadCallback(contents, name);
    }
    if (n == 1)
        scaleFactor = ei.value;
    if (n == 2)
        sampleLength = ei.value;
    if (n == 3)
        flags = ei.changeFlag(flags, FLAG_REPEAT);
}

void DataInputElm::doLoadCallback(const std::string &s, const std::string &name) {
    // the name without its extension
    size_t dot = name.rfind('.');
    fileName = (dot == std::string::npos) ? name : name.substr(0, dot);
    data = std::make_shared<std::vector<double>>();
    bool parseError = false;
    size_t start = 0;
    for (int i = 0; start <= s.size(); i++) {
        size_t nl = s.find('\n', start);
        std::string line = s.substr(start, nl == std::string::npos ? std::string::npos : nl - start);
        start = (nl == std::string::npos) ? s.size() + 1 : nl + 1;
        if (!line.empty() && line.back() == '\r')
            line.pop_back();
        // skip blank lines
        if (line.empty())
            continue;
        // skip comments
        if (line[0] == '#')
            continue;
        // (the TS version uses parseFloatStrict(), which throws before the NaN check below)
        double d = jsParseFloat(line);
        if (std::isnan(d)) {
            SimulationManager::console("parse error on line " + std::to_string(i));
            parseError = true;
        } else {
            data->push_back(d);
        }
    }
    if (data->empty() || parseError) {
        std::string msg = parseError ? "Error parsing data file.\n\n" : "No data found in file.\n\n";
        msg += "Expected format:\n"
               "- One numeric voltage value per line\n"
               "- Lines starting with # are treated as comments\n"
               "- Blank lines are ignored\n\n"
               "Example:\n# my data\n1.5\n2.3\n-0.5";
        app->alert(msg);
    }
}

void DataInputElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "data input";
    if (!data) {
        arr[1] = "no file loaded";
        return;
    }
    arr[1] = "V = " + getVoltageText(nodes[0]->v);
    arr[2] = "pos = " + getUnitText(timeOffset, "s");
    arr[3] = "dur = " + getUnitText(data->size() * sampleLength, "s");
}
