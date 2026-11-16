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
#include <memory>

#include "RailElm.h"

struct DataFileEntry {
    std::string fileName;
    std::shared_ptr<std::vector<double>> data;
};

class DataInputElm : public RailElm {
public:
    ELM_CLASS(DataInputElm)
    std::shared_ptr<std::vector<double>> data;  // null until a file is loaded
    double sampleLength = 1e-3;
    double scaleFactor = 1;
    double timeOffset = 0;
    int fileNum = 0;
    std::optional<std::string> fileName;
    static constexpr int FLAG_REPEAT = 1 << 8;

    static int fileNumCounter;
    static std::map<int, DataFileEntry> dataFileMap;

    DataInputElm(int xx, int yy);
    DataInputElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override { timeOffset = 0; }
    void drawRail(Graphics &g) override;
    std::optional<std::string> getRailText() override;
    bool doesRepeat() { return (flags & FLAG_REPEAT) != 0; }
    double getVoltage() override;
    void stepFinished() override;
    int getDumpType() override { return 424; }
    int getShortcut() override { return 0; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void doLoadCallback(const std::string &s, const std::string &name);
    void getInfo(std::vector<std::string> &arr) override;
    static void clearCache() { dataFileMap.clear(); }
};
