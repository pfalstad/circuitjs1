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

#include "../core/CircuitElm.h"

class DataRecorderElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(DataRecorderElm)
    int dataCount;
    int dataPtr = 0;
    long lastTimeStepCount = 0;
    std::vector<double> data;
    bool dataFull = false;

    DataRecorderElm(int xx, int yy);
    DataRecorderElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 210; }
    int getPostCount() override { return 1; }
    void reset() override;
    void setPoints() override;
    void draw(Graphics &g) override;
    double getVoltageDiff() override { return nodes[0]->v; }
    void getInfo(std::vector<std::string> &arr) override;
    void stepFinished() override;
    void setDataCount(int ct);
    // the recorded data, as the file the edit dialog saves
    std::string getDataString();
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
};
