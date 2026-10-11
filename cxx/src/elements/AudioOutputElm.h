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

#include <memory>

#include "../core/CircuitElm.h"
#include "../core/PanelButton.h"

class AudioOutputElm : public CircuitElm {
public:
    ELM_CLASS(AudioOutputElm)
    int dataCount = 0;
    int dataPtr = 0;
    std::vector<double> data;
    bool dataFull = false;
    std::unique_ptr<PanelButton> button;
    int samplingRate = 0;
    int labelNum = 0;
    double duration = 0;
    double sampleStep = 0;
    double dataStart = 0;
    static int lastSamplingRate;
    static bool okToChangeTimeStep;

    int dataSampleCount = 0;
    double nextDataSample = 0;
    double dataSample = 0;

    // the last played audio, as a WAV file (TS: document.audioBlob)
    static std::vector<unsigned char> lastWav;

    AudioOutputElm(int xx, int yy);
    AudioOutputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    ~AudioOutputElm() override;

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draggingDone() override { setTimeStep(); }
    // get next unused labelNum value
    int getNextLabelNum();
    int getDumpType() override { return 211; }
    std::string getXmlDumpType() override { return "aout"; }
    bool isAudioOutputElm() override { return true; }
    int getPostCount() override { return 1; }
    void reset() override;
    void setPoints() override;
    void draw(Graphics &g) override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void getInfo(std::vector<std::string> &arr) override;
    void stepFinished() override;
    void setDataCount();
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void setTimeStep();
    void createButton();
    void setButtonLabel();
    void deleteElm() override;
    // build a WAV file from PCM int16 samples
    static std::vector<unsigned char> makeWav(const std::vector<short> &samples, int sampleRate);
    static void playAudio(const std::vector<double> &samples, int sampleRate);
    void play();
};
