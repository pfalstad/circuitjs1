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

#include "CompositeElm.h"

class DiodeElm;
class DiodeModel;
class TransistorElm;

class OptocouplerElm : public CompositeElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(OptocouplerElm)
    int csize = 2;
    int cspc = 0;
    int cspc2 = 0;
    std::vector<int> rectPointsX, rectPointsY;
    std::vector<double> curCounts = std::vector<double>(4, 0.0);
    double ctr = 1.0;  // current transfer ratio (1.0 = 100%)

    OptocouplerElm(int xx, int yy);
    OptocouplerElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXmlModel(XmlElement *doc) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void reset() override;
    bool getConnection(int n1, int n2) override { return n1 / 2 == n2 / 2; }
    void draw(Graphics &g) override;
    void setPoints() override;
    bool isFlippedX() const;
    bool isFlippedY() const;
    bool canFlipXY() override { return false; }
    void flipX(int center2, int count) override;
    void flipY(int center2, int count) override;
    int getDumpType() override { return 407; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void updateModels() override;
    void setEditValue(int n, EditInfo &ei) override;

private:
    DiodeElm *diode = nullptr;
    TransistorElm *transistor = nullptr;
    std::vector<Point> stubs = std::vector<Point>(4);
    std::vector<DiodeModel *> models;
    void initOptocoupler();
    void setPin(int n, int px, int py, int ddx, int ddy, int dax, int day, int sx, int sy);
};
