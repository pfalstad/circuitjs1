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

#include "AudioInputElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "AudioOutputElm.h"

int AudioInputElm::lastSamplingRate = 0;
int AudioInputElm::fileNumCounter = 1;
std::map<int, AudioInputElm::AudioFileEntry> AudioInputElm::audioFileMap;

AudioInputElm::AudioInputElm(int xx, int yy) : RailElm(xx, yy, WF_AC) {
    maxVoltage = 5;
}

AudioInputElm::AudioInputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : RailElm(xa, ya, xb, yb, f, st) {
    waveform = WF_AC;
    maxVoltage = parseFloatStrict(st.nextToken());
    startPosition = parseFloatStrict(st.nextToken());
    fileNum = parseIntStrict(st.nextToken());
    lookupFileNumber();
    samplingRate = lastSamplingRate;
}

void AudioInputElm::genFileNumber() {
    if (data != nullptr) {
        if (fileNum == 0)
            fileNum = fileNumCounter++;
        audioFileMap[fileNum] = AudioFileEntry{fileName.value_or(""), data};
    }
}

void AudioInputElm::lookupFileNumber() {
    auto it = audioFileMap.find(fileNum);
    if (it != audioFileMap.end()) {
        fileName = it->second.fileName;
        data = it->second.data;
    }
}

void AudioInputElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    RailElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "ma", maxVoltage);
    CircuitXMLSerializer::dumpAttr(elem, "st", startPosition);
    genFileNumber();
    CircuitXMLSerializer::dumpAttr(elem, "fi", fileNum);
}

void AudioInputElm::undumpXml(CircuitXMLDeserializer &xml) {
    RailElm::undumpXml(xml);
    maxVoltage = xml.parseDoubleAttr("ma", maxVoltage);
    startPosition = xml.parseDoubleAttr("st", startPosition);
    fileNum = xml.parseIntAttr("fi", fileNum);
    lookupFileNumber();
    samplingRate = lastSamplingRate;
}

void AudioInputElm::drawRail(Graphics &g) {
    drawRailText(g, !fileName ? Locale::LS("No file") : *fileName);
}

std::optional<std::string> AudioInputElm::getRailText() {
    return !fileName ? Locale::LS("No file") : *fileName;
}

double AudioInputElm::getVoltage() {
    if (data == nullptr)
        return 0;
    if (timeOffset < startPosition)
        timeOffset = startPosition;
    double dptr = timeOffset * samplingRate;
    double iptrd = std::trunc(dptr);
    double frac = dptr - iptrd;
    if (iptrd >= (double) data->size())
        return 0;
    size_t iptr = (size_t) iptrd;
    double value1 = (*data)[iptr];
    double value2 = (iptr + 1 < data->size()) ? (*data)[iptr + 1] : 0;
    return (value1 * (1 - frac) + value2 * frac) * maxVoltage;
}

void AudioInputElm::stepFinished() {
    timeOffset += sim->timeStep;
}

std::optional<EditInfo> AudioInputElm::getEditInfo(int n) {
    if (n == 0) {
        // (TS: a file input)
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Choose Audio File...")};
        return ei;
    }
    if (n == 1)
        return EditInfo("Max Voltage", maxVoltage).setUnitStep();
    if (n == 2)
        return EditInfo("Start Position (s)", startPosition);
    return std::nullopt;
}

void AudioInputElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        std::string name;
        std::vector<float> samples;
        int rate = 0;
        if (app->loadAudioFile(name, samples, rate)) {
            fileName = name;
            setSamplingRate(rate);
            gotAudioData(std::make_shared<std::vector<float>>(std::move(samples)));
        }
    }
    if (n == 1)
        maxVoltage = ei.value;
    if (n == 2)
        startPosition = ei.value;
}

void AudioInputElm::gotAudioData(std::shared_ptr<std::vector<float>> d) {
    data = std::move(d);
    lastSamplingRate = samplingRate;
    AudioOutputElm::lastSamplingRate = samplingRate;
}

void AudioInputElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "audio input";
    if (data == nullptr) {
        arr[1] = "no file loaded";
        return;
    }
    arr[1] = "V = " + getVoltageText(nodes[0]->v);
    arr[2] = "pos = " + getUnitText(timeOffset, "s");
    double dur = (double) data->size() / samplingRate;
    arr[3] = "dur = " + getUnitText(dur, "s");
}
