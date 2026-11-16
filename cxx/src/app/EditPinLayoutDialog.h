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
#include <vector>

#include "ChipPinEditor.h"

class ChipElm;
class CirSim;
class PinLayoutModel;
class QComboBox;
class QLineEdit;

// editor for a chip's pin layout model (see PinLayoutModel).  Lays out a copy of the pins, so
// nothing changes until OK is pressed.  Deletes itself when closed.
class EditPinLayoutDialog : public QDialog {
public:
    // model is the model to edit, or null to create one from the chip's current layout
    EditPinLayoutDialog(CirSim *app, ChipElm *chip, PinLayoutModel *model);

    void enterPressed();

private:
    CirSim *app;
    ChipElm *chip;
    PinLayoutModel *model;
    std::vector<PinLayoutEntry> entries;
    int sizeX;
    int sizeY;
    ChipPinEditor *editor;
    QLineEdit *nameInput;
    QComboBox *scopeSelect;
};
