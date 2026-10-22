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

#include <QDialog>
#include <optional>
#include <vector>

#include "core/EditInfo.h"

class Adjustable;
class CircuitElm;
class CirSim;
class QCheckBox;
class QLineEdit;
class QVBoxLayout;

// add/edit sliders for an element's values (SliderDialog.ts)
class SliderDialog : public QDialog {
public:
    SliderDialog(CircuitElm *ce, CirSim *f);

    bool apply();

private:
    // the widgets for one edit item (TS keeps these on the EditInfo)
    struct Row {
        std::optional<EditInfo> ei;
        QCheckBox *checkbox = nullptr;
        QLineEdit *minBox = nullptr;
        QLineEdit *maxBox = nullptr;
        QLineEdit *stepBox = nullptr;
        QLineEdit *labelBox = nullptr;
        QCheckBox *logCheckbox = nullptr;
    };

    void buildDialog();
    void clearDialog();
    Adjustable *findAdjustable(int item);
    void checkboxChanged(int i, bool checked);
    void choiceChanged(int i, int selectedIndex);

    CircuitElm *elm;
    CirSim *sim;
    std::vector<Row> rows;
    int einfocount = 0;
    QWidget *content = nullptr;
    QVBoxLayout *contentLayout = nullptr;
};
