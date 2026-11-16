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

#include "../core/Scrollbar.h"
#include "RailElm.h"

class VarRailElm : public RailElm {
public:
    ELM_CLASS(VarRailElm)
    // the slider, with its label (TS: slider and labelEl)
    std::unique_ptr<Scrollbar> slider;
    std::string sliderText = "Voltage";

    VarRailElm(int xx, int yy);
    VarRailElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    ~VarRailElm() override;

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int getDumpType() override { return 172; }
    bool isVarRailElm() override { return true; }
    void createSlider();
    double getVoltage() override;
    void deleteElm() override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    int getShortcut() override { return 0; }
    void setMouseElm(bool v) override;
    bool onMouseWheel(double normalizedDelta) override {
        if (slider)
            slider->onMouseWheel(normalizedDelta);
        return true;
    }
};
