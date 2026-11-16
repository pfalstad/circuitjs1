/*
    Bill Collis - June 2015

    This file is part of CircuitJS1 (GNU GPL v2).
*/

#pragma once

#include <memory>

#include "../core/CircuitElm.h"
#include "../core/Scrollbar.h"

class ThermistorNTCElm : public CircuitElm {
public:
    bool showPropertiesOnCreate() override { return false; }
    ELM_CLASS(ThermistorNTCElm)
    double position;
    double resistance = 0;
    double minTempr = -40;
    double maxTempr = 150;
    double temperature = 0;
    double r25 = 10000;
    double r50 = 3605;
    double rneg40 = 0;
    double b25100 = 0;
    static constexpr double t0 = 273.15;
    static constexpr double t25 = 273.15 + 25;
    std::unique_ptr<Scrollbar> slider;
    std::string sliderText;

    ThermistorNTCElm(int xx, int yy);
    ThermistorNTCElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    ~ThermistorNTCElm() override;

    int getPostCount() override { return 2; }
    int getDumpType() override { return 350; }
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
    double calcResistance(double tempr);
    double temprFromSliderPos();
    double calcB25100();
};
