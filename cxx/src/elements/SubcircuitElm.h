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

#include "../core/SubcircuitModel.h"
#include "CompositeElm.h"
#include "SubcircuitChipElm.h"

class SubcircuitElm : public CompositeElm {
public:
    ELM_CLASS(SubcircuitElm)
    std::string modelName;
    std::unique_ptr<SubcircuitChipElm> chip;
    int postCount = 0;
    int inputCount = 0;
    int outputCount = 0;
    SubcircuitModelRef model;
    double highVoltage = 0;
    static std::string lastModelName;
    static constexpr int FLAG_SMALL = 2;

    SubcircuitElm(int xx, int yy);
    SubcircuitElm(int xx, int yy, const std::string &name);
    SubcircuitElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);

    void dumpXmlModel(XmlElement *doc) override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    void addRoutingObstacle(WireRouter &router) override;
    void setPoints() override;
    void updateModels() override { model = nullptr; updateModelsFrom(nullptr); }
    void updateModelsFrom(StringTokenizer *st);
    void propagateHighVoltage();
    void setHighVoltage(double hv) override { highVoltage = hv; }
    int getPostCount() override { return postCount; }
    int getPostWidth(int n) override { return chip ? chip->getPostWidth(n) : 1; }
    void flipX(int center2, int count) override;
    void flipY(int center2, int count) override;
    bool isFlippedX() const { return (flags & ChipElm::FLAG_FLIP_X) != 0; }
    bool isFlippedY() const { return (flags & ChipElm::FLAG_FLIP_Y) != 0; }
    void flipXY(int xmy, int count) override;
    // build a display list with all elements including ones skipped by loadCompositeXml
    std::vector<CircuitElm *> buildDisplayElmList();
    bool canViewComponents();
    // show our components if we can (returns false if the caller should edit us instead)
    bool onDoubleClick();
    bool isSubcircuitElm() override { return true; }
    // don't bring up the properties when placing a subcircuit
    bool showPropertiesOnCreate() override { return false; }
    int getDumpType() override { return 410; }
    std::string getXmlDumpType() override { return "cc"; }
    std::string getElmType() override { return "subcircuit"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    int getNumHandles() override { return 0; }

private:
    std::vector<SubcircuitModelRef> models;
    // the wires, labels etc. that buildDisplayElmList() made (they aren't in compElmList)
    std::vector<std::unique_ptr<CircuitElm>> displayElms;
};
