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
#include "Diode.h"

class DiodeModel;

class DiodeElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(DiodeElm)
    void dumpXmlModel(XmlElement *doc) override;
    void addRoutingObstacle(WireRouter &wr) override;
    Diode diode;
    static constexpr int FLAG_FWDROP = 1;
    static constexpr int FLAG_MODEL = 2;
    std::string modelName;
    DiodeModel *model = nullptr;
    static std::string lastModelName;
    bool hasResistance = false;
    int diodeEndNode = 1;
    static constexpr int hs = 8;
    std::vector<Point> cathode;
    Polygon poly;

    DiodeElm(int xx, int yy);
    DiodeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    bool nonLinear() override { return true; }
    virtual void setup();
    int getInternalNodeCount() override { return hasResistance ? 1 : 0; }
    void updateModels() override { setup(); }
    int getDumpType() override { return 'd'; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    void reset() override;
    void stamp() override;
    void doStep() override;
    void calculateCurrent() override;
    void newModelCreated(DiodeModel *dm);
    virtual bool isZenerElm() { return false; }
    virtual void setLastModelName(const std::string &n) { lastModelName = n; }
    void stepFinished() override;
    void draw(Graphics &g) override;
    void drawDiode(Graphics &g);
    std::string getElmType() override { return "diode"; }
    void getInfo(std::vector<std::string> &arr) override;
    int getShortcut() override { return 'd'; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    std::vector<DiodeModel *> models;
};
