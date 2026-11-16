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

#include <map>

#include "RailElm.h"

class AudioInputElm : public RailElm {
public:
    ELM_CLASS(AudioInputElm)
    struct AudioFileEntry {
        std::string fileName;
        std::shared_ptr<std::vector<float>> data;
    };

    // the decoded samples (TS: data, null if no file)
    std::shared_ptr<std::vector<float>> data;
    double timeOffset = 0;
    int samplingRate = 0;
    int fileNum = 0;
    std::optional<std::string> fileName;
    double startPosition = 0;

    static int lastSamplingRate;

    // cache to preserve audio data when doing cut/paste, or undo/redo
    static int fileNumCounter;
    static std::map<int, AudioFileEntry> audioFileMap;

    AudioInputElm(int xx, int yy);
    AudioInputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    // add a file number to the dump so we can preserve the audio file data when doing cut and paste, or undo/redo.
    // we don't save the entire file in the dump because it would be huge.
    void genFileNumber();
    void lookupFileNumber();
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override { timeOffset = startPosition; }
    void drawRail(Graphics &g) override;
    std::optional<std::string> getRailText() override;
    void setSamplingRate(int sr) { samplingRate = sr; }
    double getVoltage() override;
    void stepFinished() override;
    int getDumpType() override { return 411; }
    std::string getXmlDumpType() override { return "ain"; }
    int getShortcut() override { return 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void gotAudioData(std::shared_ptr<std::vector<float>> d);
    void getInfo(std::vector<std::string> &arr) override;
    static void clearCache() { audioFileMap.clear(); }
};
