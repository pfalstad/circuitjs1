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

#include "DiodeElm.h"

class LEDElm : public DiodeElm {
public:
    ELM_CLASS(LEDElm)
    double colorR, colorG, colorB;
    double maxBrightnessCurrent;
    static std::string lastLEDModelName;
    Point ledLead1, ledLead2, ledCenter;

    LEDElm(int xx, int yy);
    LEDElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    int getDumpType() override { return 162; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void draw(Graphics &g) override;
    std::string getElmType() override { return "LED"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    int getShortcut() override { return 'l'; }
    void setLastModelName(const std::string &n) override { lastLEDModelName = n; }
};
