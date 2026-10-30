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

#include <QWidget>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "core/SubcircuitModel.h"
#include "elements/SubcircuitChipElm.h"

class CirSim;
class QLayout;

// a pin being laid out (the TS version's PinLayoutEntry, which ExtListEntry satisfies; only
// name, pos, side, busWidth and busZ are used)
using PinLayoutEntry = ExtListEntry;

struct ChipPinEditorOptions {
    // label to draw in the middle of the chip
    std::function<std::optional<std::string>()> getLabel;
    // called for each pin after it's created from its entry, e.g. to copy how it's drawn
    std::function<void(Pin &pin, int i)> decoratePin;
};

// canvas for laying out the pins of a chip by dragging them around, used by the subcircuit and
// pin layout model editors.  Changes the pos/side of the entries and the size directly.
class ChipPinEditor : public QWidget {
public:
    // sizeX and sizeY are where the chip size is stored (the SubcircuitModel for subcircuits)
    ChipPinEditor(CirSim *app, std::vector<PinLayoutEntry> &entries, int &sizeX, int &sizeY,
                  ChipPinEditorOptions options = {});

    std::unique_ptr<SubcircuitChipElm> chip;

    // Width/Height buttons
    QLayout *createSizeControls();
    void createPins();
    void draw() { update(); }
    void adjustChipSize(int dx, int dy);

protected:
    void paintEvent(QPaintEvent *) override;
    void mousePressEvent(QMouseEvent *e) override;
    void mouseMoveEvent(QMouseEvent *e) override;
    void mouseReleaseEvent(QMouseEvent *) override;

private:
    int findNearestPin(int x, int y);
    void updatePinHighlight();
    // selectedPins keeps insertion order, like the TS version's Set
    bool isPinSelected(int i) const;
    void selectPin(int i);
    void deselectPin(int i);
    int firstSelectedSide() const;
    bool inRubberBand(int i, int x1, int y1, int x2, int y2) const;
    void onMouseDown(int x, int y, bool shift);
    void onMouseUp();
    void mouseMoved(int x, int y);

    CirSim *app;
    std::vector<PinLayoutEntry> &entries;
    int &sizeX;
    int &sizeY;
    ChipPinEditorOptions options;
    int postCount = 0;
    double scale = 1;

    bool dragging = false;
    bool rubberBand = false;
    int rubberBandX1 = 0, rubberBandY1 = 0, rubberBandX2 = 0, rubberBandY2 = 0;
    std::vector<int> selectedPins;
    std::vector<int> dragStartPosArr;
    std::vector<int> dragStartSideArr;
    int dragStartPos = 0;
    int dragStartSide = 0;
    int dragCurrentSide = 0;
    int selectedPin = -1;
};
