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
#include <memory>
#include <vector>

#include "core/SubcircuitModel.h"
#include "elements/SubcircuitChipElm.h"

class CirSim;
class QCheckBox;
class QComboBox;
class QLineEdit;
class QPainter;

// the subcircuit pin layout editor, used when creating a subcircuit, editing a model's
// pin layout, and saving an edited model.  Shows itself from createDialog() and deletes
// itself when closed.
class EditSubcircuitModelDialog : public QDialog {
public:
    explicit EditSubcircuitModelDialog(CirSim *app);

    SubcircuitModelRef model;
    std::unique_ptr<SubcircuitChipElm> chip;
    int postCount = 0;
    double scale = 1;
    bool popContext = false;

    static constexpr int SCOPE_THIS_CIRCUIT = 0;
    static constexpr int SCOPE_THIS_SESSION = 1;
    static constexpr int SCOPE_SAVE_ACROSS_SESSIONS = 2;

    void setModel(const SubcircuitModelRef &m) { model = m; }
    // make a model from the circuit (or the selection), with a first guess at the layout
    bool createModel();
    void createDialog();
    void createPinsFromModel();
    void enterPressed();
    void closeDialog() { close(); }
    void drawChip(QPainter &painter);
    void adjustChipSize(int dx, int dy);
    int findNearestPin(int x, int y);
    void updatePinHighlight();
    void mouseDown(int x, int y, bool shift);
    void mouseMoved(int x, int y);
    void mouseUp();

    // Preserve pin positions/sides from existingModel in newModel, matching by name.
    static void preservePinLayout(SubcircuitModel &newModel, const SubcircuitModel &existingModel);

protected:
    void closeEvent(QCloseEvent *e) override;

private:
    static int pinToGrid(int pos, int side, int sizeX, int sizeY);
    static bool pinIsOccupied(int pos, int side, const std::vector<std::pair<int, int>> &placed, int sizeX, int sizeY);
    // selectedPins keeps insertion order, like the TS version's Set
    bool isPinSelected(int i) const;
    void selectPin(int i);
    void deselectPin(int i);
    int firstSelectedSide() const;
    bool inRubberBand(int i, int x1, int y1, int x2, int y2) const;
    std::optional<std::string> labelName();

    CirSim *app;
    QLineEdit *modelNameInput = nullptr;
    QComboBox *scopeSelect = nullptr;
    QCheckBox *labelCheck = nullptr;
    QWidget *canvas = nullptr;

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
