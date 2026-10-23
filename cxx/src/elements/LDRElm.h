/*
    Bill Collis - June 2015

    This file is part of CircuitJS1 (GNU GPL v2).
*/

#pragma once

#include <memory>

#include "../core/CircuitElm.h"
#include "../core/Scrollbar.h"

class LDRElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(LDRElm)
    double position;
    double resistance = 0;
    double minLux = 0.1;
    double maxLux = 10000;
    double lux = 0;
    std::unique_ptr<Scrollbar> slider;
    std::string sliderText;

    LDRElm(int xx, int yy);
    LDRElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    ~LDRElm() override;

    int getPostCount() override { return 2; }
    int getDumpType() override { return 374; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void createSlider();
    void deleteElm() override;
    void setPoints() override;
    void draw(Graphics &g) override;
    void calculateCurrent() override;
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
    double calcResistance(double lux);
    double luxFromSliderPos() { return maxLux * position + minLux; }
};
