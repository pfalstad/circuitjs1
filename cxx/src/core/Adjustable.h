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
#include <optional>
#include <string>

#include "Scrollbar.h"

class CircuitElm;
class CircuitXMLDeserializer;
class SimApp;
class StringTokenizer;
class XmlElement;

// values with sliders
class Adjustable {
public:
    CircuitElm *elm = nullptr;
    double minValue = 1;
    double maxValue = 1000;
    double sliderStep = 0;  // step increment; 0 = continuous (no stepping)
    int flags = 0;
    std::string sliderText;
    bool logarithmic = false;

    // null if this Adjustable has its own slider, non-null if it's sharing another one.
    Adjustable *sharedSlider = nullptr;

    static constexpr int FLAG_SHARED = 1;
    static constexpr int FLAG_LOG = 2;

    // index of value in getEditInfo() list that this slider controls
    int editItem = 0;

    // the slider and its label (TS: label and slider)
    std::unique_ptr<Scrollbar> slider;
    bool settingValue = false;

    Adjustable(CircuitElm *ce, int item);
    // undump
    Adjustable(StringTokenizer &st, SimApp *sim);
    ~Adjustable();

    bool createSlider(SimApp *sim);
    void createSliderWithValue(SimApp *sim, double value);
    void setSliderValue(double value);
    void execute();
    void executeSlider();
    double getSliderValue();
    // convert a value to a slider position (0-100)
    double valueToSliderPosition(double value);
    // convert a slider position (0-100) to a value
    double sliderPositionToValue(double pos);
    void deleteSlider(SimApp *sim);
    void setMouseElm(CircuitElm *e);
    bool sliderBeingShared();
    std::string dump();
    // get the unlocalized name of the edit item this adjustable controls
    std::string getEditItemName();
    // find the edit item index by name, falling back to the given index
    static int findEditItemByName(CircuitElm *elm, const std::optional<std::string> &name, int fallbackIndex);
    void dumpXml(XmlElement *root, SimApp *app);
    static void undumpXml(CircuitXMLDeserializer &xml, SimApp *app);
    // reorder adjustables so that items with sliders come first in the list, followed by items that reference them.
    // this simplifies the UI code, and also makes it much easier to dump/undump the adjustables list, since we will
    // always be undumping the adjustables with sliders first, then the adjustables that reference them.
    static void reorderAdjustables(SimApp *app);
};
