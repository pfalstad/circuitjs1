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

#include "AudioOutputElm.h"

#include <cmath>
#include <ctime>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Font.h"
#include "../core/Graphics.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

int AudioOutputElm::lastSamplingRate = 8000;
bool AudioOutputElm::okToChangeTimeStep = false;
std::vector<unsigned char> AudioOutputElm::lastWav;

static const int samplingRateChoices[] = {8000, 11025, 16000, 22050, 44100, 48000};

AudioOutputElm::AudioOutputElm(int xx, int yy) : CircuitElm(xx, yy) {
    duration = 1;
    samplingRate = lastSamplingRate;
    labelNum = getNextLabelNum();
    setDataCount();
    createButton();
}

AudioOutputElm::AudioOutputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CircuitElm(xa, ya, xb, yb, f) {
    duration = parseFloatStrict(st.nextToken());
    samplingRate = parseIntStrict(st.nextToken());
    labelNum = parseIntStrict(st.nextToken());
    setDataCount();
    createButton();
}

AudioOutputElm::~AudioOutputElm() {
    if (button && app != nullptr)
        app->removeButton(button.get());
}

void AudioOutputElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "du", duration);
    CircuitXMLSerializer::dumpAttr(elem, "sa", samplingRate);
    CircuitXMLSerializer::dumpAttr(elem, "la", labelNum);
}

void AudioOutputElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    duration = xml.parseDoubleAttr("du", duration);
    samplingRate = xml.parseIntAttr("sa", samplingRate);
    labelNum = xml.parseIntAttr("la", labelNum);
    setDataCount();
    setButtonLabel();
}

int AudioOutputElm::getNextLabelNum() {
    int num = 1;
    for (CircuitElm *ce : sim->elmList) {
        AudioOutputElm *ao = dynamic_cast<AudioOutputElm *>(ce);
        if (ao == nullptr)
            continue;
        if (ao->labelNum >= num)
            num = ao->labelNum + 1;
    }
    return num;
}

void AudioOutputElm::reset() {
    dataPtr = 0;
    dataFull = false;
    dataSampleCount = 0;
    nextDataSample = 0;
    dataSample = 0;
}

void AudioOutputElm::setPoints() {
    CircuitElm::setPoints();
    lead1 = Point();
}

void AudioOutputElm::draw(Graphics &g) {
    g.save();
    bool selected = needsHighlight();
    const int fontSize = 14;
    std::string s = labelNum > 1 ? "Audio " + std::to_string(labelNum) : "Audio Out";
    g.setFont(Font("SansSerif", selected ? Font::BOLD : 0, fontSize));
    int textWidth = (int) std::floor(g.measureWidth(s));
    g.setColor(Color::darkGray);
    int pct = dataFull ? textWidth : dataCount == 0 ? 0 : (int) std::floor((double) textWidth * dataPtr / dataCount);
    g.fillRect(x2 - (int) std::floor(textWidth / 2.), y2 - 10, pct, 20);
    g.setColor(selected ? selectColor : whiteColor);
    interpPoint(point1, point2, lead1, 1 - (textWidth / 2. + 8) / dn);
    setBbox(point1, lead1, 0);
    drawCenteredText(g, s, x2, y2, true);
    setVoltageColor(g, nodes[0]->v);
    if (selected)
        g.setColor(selectColor);
    drawThickLine(g, point1, lead1);
    drawPosts(g);
    g.restore();
}

void AudioOutputElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = "audio output";
    arr[1] = "V = " + getVoltageText(nodes[0]->v);
    int ct = dataFull ? dataCount : dataPtr;
    double dur = sampleStep * ct;
    arr[2] = "start = " + getUnitText(dataFull ? sim->t - duration : dataStart, "s");
    arr[3] = "dur = " + getUnitText(dur, "s");
    arr[4] = "samples = " + std::to_string(ct) + (dataFull ? "" : "/" + std::to_string(dataCount));
}

void AudioOutputElm::stepFinished() {
    dataSample += nodes[0]->v;
    dataSampleCount++;
    if (sim->t >= nextDataSample) {
        nextDataSample += sampleStep;
        data[dataPtr++] = dataSample / dataSampleCount;
        dataSampleCount = 0;
        dataSample = 0;
        if (dataPtr >= dataCount) {
            dataPtr = 0;
            dataFull = true;
        }
    }
}

void AudioOutputElm::setDataCount() {
    dataCount = (int) std::floor(samplingRate * duration);
    data.assign(dataCount, 0.0);
    dataStart = sim->t;
    dataPtr = 0;
    dataFull = false;
    sampleStep = 1. / samplingRate;
    nextDataSample = sim->t + sampleStep;
}

std::optional<EditInfo> AudioOutputElm::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Duration (s)", duration, 0, 5).setPositive();
    if (n == 1) {
        EditInfo ei("Sampling Rate", 0, -1, -1);
        ei.choice = Choice();
        for (int i = 0; i != 6; i++) {
            ei.choice->add(std::to_string(samplingRateChoices[i]));
            if (samplingRateChoices[i] == samplingRate)
                ei.choice->select(i);
        }
        return ei;
    }
    if (n == 2) {
        // (TS: a link to download the WAV)
        if (lastWav.empty())
            return std::nullopt;
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Save last played audio...")};
        return ei;
    }
    return std::nullopt;
}

void AudioOutputElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.value > 0) {
        duration = ei.value;
        setDataCount();
    }
    if (n == 1) {
        int nsr = samplingRateChoices[ei.choice->getSelectedIndex()];
        if (nsr != samplingRate) {
            samplingRate = nsr;
            lastSamplingRate = nsr;
            setDataCount();
            setTimeStep();
        }
    }
    if (n == 2 && !lastWav.empty()) {
        std::time_t t = std::time(nullptr);
        char buf[64];
        std::strftime(buf, sizeof(buf), "audio-%Y%m%d-%H%M.circuitjs.wav", std::localtime(&t));
        app->saveFile(lastWav, buf);
    }
}

void AudioOutputElm::setTimeStep() {
    double target = sampleStep / 8;
    if (sim->maxTimeStep != target) {
        if (okToChangeTimeStep || app->confirm(Locale::LS("Adjust timestep for best audio quality and performance?"))) {
            sim->maxTimeStep = target;
            okToChangeTimeStep = true;
        }
    }
}

void AudioOutputElm::createButton() {
    button = std::make_unique<PanelButton>();
    button->onClick = [this] { play(); };
    setButtonLabel();
    app->addButton(button.get());
}

void AudioOutputElm::setButtonLabel() {
    std::string label = "\u25B6 " + Locale::LS("Play Audio");
    if (labelNum > 1)
        label += " " + std::to_string(labelNum);
    if (button) {
        button->label = label;
        app->updateButton(button.get());
    }
}

void AudioOutputElm::deleteElm() {
    if (button)
        app->removeButton(button.get());
    CircuitElm::deleteElm();
}

// Int16Array conversion (ToInt16)
static short jsToInt16(double v) {
    if (!std::isfinite(v))
        return 0;
    double m = std::fmod(std::trunc(v), 65536.0);
    if (m < 0)
        m += 65536;
    return (short) (int) (m >= 32768 ? m - 65536 : m);
}

std::vector<unsigned char> AudioOutputElm::makeWav(const std::vector<short> &samples, int sampleRate) {
    size_t numSamples = samples.size();
    std::vector<unsigned char> buf(44 + numSamples * 2);
    auto writeStr = [&](size_t off, const char *s) {
        for (size_t i = 0; s[i]; i++)
            buf[off + i] = (unsigned char) s[i];
    };
    auto u32 = [&](size_t off, uint32_t v) {
        for (int i = 0; i != 4; i++)
            buf[off + i] = (unsigned char) (v >> (8 * i));
    };
    auto u16 = [&](size_t off, uint16_t v) {
        buf[off] = (unsigned char) v;
        buf[off + 1] = (unsigned char) (v >> 8);
    };
    writeStr(0, "RIFF");
    u32(4, (uint32_t) (36 + numSamples * 2));
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    u32(16, 16);
    u16(20, 1);  // PCM
    u16(22, 1);  // mono
    u32(24, (uint32_t) sampleRate);
    u32(28, (uint32_t) sampleRate * 2);
    u16(32, 2);
    u16(34, 16);
    writeStr(36, "data");
    u32(40, (uint32_t) (numSamples * 2));
    for (size_t i = 0; i < numSamples; i++)
        u16(44 + i * 2, (uint16_t) samples[i]);
    return buf;
}

void AudioOutputElm::playAudio(const std::vector<double> &samples, int sampleRate) {
    std::vector<short> intSamples(samples.size());
    for (size_t i = 0; i != samples.size(); i++)
        intSamples[i] = jsToInt16(samples[i]);
    lastWav = makeWav(intSamples, sampleRate);
    app->playAudio(intSamples, sampleRate);
}

void AudioOutputElm::play() {
    int ct = dataPtr;
    int base = 0;
    if (dataFull) {
        ct = dataCount;
        base = dataPtr;
    }
    if (ct * sampleStep < .05) {
        app->alert(Locale::LS("Audio data is not ready yet.  Increase simulation speed to make data ready sooner."));
        return;
    }

    // rescale data to maximize
    double max = -1e8;
    double min = 1e8;
    for (int i = 0; i != ct; i++) {
        if (data[i] > max) max = data[i];
        if (data[i] < min) min = data[i];
    }

    double adj = -(max + min) / 2;
    double mult = (.25 * 32766) / (max + adj);

    // fade in over 1/20 sec
    int fadeLen = (int) std::floor(samplingRate / 20.);
    int fadeOut = ct - fadeLen;

    double fadeMult = mult / fadeLen;
    std::vector<double> arr;
    arr.reserve(ct);
    for (int i = 0; i != ct; i++) {
        double fade = (i < fadeLen) ? i * fadeMult : (i > fadeOut) ? (ct - i) * fadeMult : mult;
        double s = std::floor((data[(i + base) % dataCount] + adj) * fade);
        arr.push_back(s);
    }
    playAudio(arr, samplingRate);
}
