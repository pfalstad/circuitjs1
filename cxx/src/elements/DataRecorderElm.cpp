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

#include "DataRecorderElm.h"

#include <cmath>
#include <ctime>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

DataRecorderElm::DataRecorderElm(int xx, int yy) : CircuitElm(xx, yy) {
    setDataCount(10240);
}

DataRecorderElm::DataRecorderElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    setDataCount(parseIntStrict(st.nextToken()));
}

void DataRecorderElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "dc", dataCount);
}

void DataRecorderElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    setDataCount(xml.parseIntAttr("dc", dataCount));
}

void DataRecorderElm::reset() {
    dataPtr = 0;
    dataFull = false;
    lastTimeStepCount = 0;
}

void DataRecorderElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = interpPoint(point1, point2, 1 - 8 / dn);
}

void DataRecorderElm::draw(Graphics &g) {
    g.save();
    bool sel = needsHighlight();
    g.setFont(Font("SansSerif", sel ? Font::BOLD : 0, 14));
    g.setColor(sel ? selectColor : whiteColor);
    setBbox(point1, lead1, 0);
    std::string s = Locale::LS("export");
    drawLabeledNode(g, s, point1, lead1);
    setVoltageColor(g, nodes[0]->v);
    if (sel)
        g.setColor(selectColor);
    drawThickLine(g, point1, lead1);
    drawPosts(g);
    g.restore();
}

void DataRecorderElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "data export";
    arr[1] = "V = " + getVoltageText(nodes[0]->v);
    arr[2] = std::to_string(dataFull ? dataCount : dataPtr) + "/" + std::to_string(dataCount);
}

void DataRecorderElm::stepFinished() {
    if (lastTimeStepCount == sim->timeStepCount)
        return;
    data[dataPtr++] = nodes[0]->v;
    lastTimeStepCount = sim->timeStepCount;
    if (dataPtr >= dataCount) {
        dataPtr = 0;
        dataFull = true;
    }
}

void DataRecorderElm::setDataCount(int ct) {
    dataCount = ct;
    data.assign(ct, 0);
    dataPtr = 0;
    dataFull = false;
}

std::string DataRecorderElm::getDataString() {
    std::string dataStr = "# time step = " + jsNumberToString(sim->timeStep) + " sec\n";
    if (dataFull) {
        for (int i = 0; i != dataCount; i++)
            dataStr += jsNumberToString(data[(i + dataPtr) % dataCount]) + "\n";
    } else {
        for (int i = 0; i != dataPtr; i++)
            dataStr += jsNumberToString(data[i]) + "\n";
    }
    return dataStr;
}

std::optional<EditInfo> DataRecorderElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("# of Data Points", dataCount, -1, -1).setDimensionless().setPositive();
    if (n == 1) {
        // (TS: a link to download the data)
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Save Data...")};
        return ei;
    }
    return std::nullopt;
}

void DataRecorderElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0)
        setDataCount((int) std::trunc(ei.value));
    if (n == 1) {
        std::string s = getDataString();
        std::time_t t = std::time(nullptr);
        char buf[64];
        std::strftime(buf, sizeof(buf), "data-%Y%m%d-%H%M.circuitjs.txt", std::localtime(&t));
        app->saveFile(std::vector<unsigned char>(s.begin(), s.end()), buf);
    }
}
