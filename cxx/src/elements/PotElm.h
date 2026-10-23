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
#include "../core/Scrollbar.h"

class PotElm : public CircuitElm {
public:
    ELM_CLASS(PotElm)
    static constexpr int FLAG_SHOW_VALUES = 1;
    static constexpr int FLAG_FLIP = 2;
    static constexpr int FLAG_FLIP_OFFSET = 4;

    double position = 0.5;
    double maxResistance = 1000;
    double resistance1 = 0;
    double resistance2 = 0;
    double current1 = 0;
    double current2 = 0;
    double current3 = 0;
    double curcount1 = 0;
    double curcount2 = 0;
    double curcount3 = 0;
    // the slider, with its label.  Linked pots share one; the owner shows it.
    std::shared_ptr<Scrollbar> slider;
    std::string sliderText = "Resistance";
    int link = 0;
    bool sliderOwner = false;
    bool deleted = false;

    Point post3, corner2, arrowPoint, midpoint, arrow1, arrow2, ps3, ps4;

    PotElm(int xx, int yy);
    PotElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    ~PotElm() override;

    int getPostCount() override { return 3; }
    int getDumpType() override { return 174; }
    std::string getXmlDumpType() override { return "pt"; }
    bool isPotElm() override { return true; }
    Point getPost(int n) override { return (n == 0) ? point1 : (n == 1) ? point2 : post3; }

    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    int calcSliderValue();
    // detach from slider, transferring ownership to another linked pot if possible
    void detachSlider();
    void setLink(int newLink);
    void createSlider();
    // what moving the slider does (TS: the slider's change handler)
    void sliderChanged();
    void deleteElm() override;
    void setPoints() override;
    void draw(Graphics &g) override;
    void reset() override;
    void calculateCurrent() override;
    double getCurrentIntoNode(int n) override;
    void stamp() override;
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    void setMouseElm(bool v) override;
    bool onMouseWheel(double normalizedDelta) override {
        if (slider)
            slider->onMouseWheel(normalizedDelta);
        return true;
    }
    void flipX(int c2, int count) override;
    void flipY(int c2, int count) override;
    void flipXY(int xmy, int count) override;
};
