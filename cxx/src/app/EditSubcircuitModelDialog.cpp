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

#include "EditSubcircuitModelDialog.h"

#include <QCheckBox>
#include <QCloseEvent>
#include <QComboBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QMouseEvent>
#include <QPainter>
#include <QPushButton>
#include <QVBoxLayout>
#include <algorithm>
#include <climits>
#include <cmath>
#include <set>

#include "CirSim.h"
#include "QtGraphics.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"
#include "elements/SubcircuitElm.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

static std::string toLower(std::string s) {
    for (char &c : s)
        c = (char) std::tolower((unsigned char) c);
    return s;
}

// the 400x400 drawing of the chip
class PinLayoutCanvas : public QWidget {
public:
    explicit PinLayoutCanvas(EditSubcircuitModelDialog *d) : dlg(d) {
        setFixedSize(400, 400);
        setMouseTracking(true);
    }

protected:
    void paintEvent(QPaintEvent *) override {
        QPainter painter(this);
        dlg->drawChip(painter);
    }
    void mousePressEvent(QMouseEvent *e) override {
        if (e->button() == Qt::LeftButton)
            dlg->mouseDown((int) e->position().x(), (int) e->position().y(), e->modifiers() & Qt::ShiftModifier);
    }
    void mouseMoveEvent(QMouseEvent *e) override { dlg->mouseMoved((int) e->position().x(), (int) e->position().y()); }
    void mouseReleaseEvent(QMouseEvent *) override { dlg->mouseUp(); }

private:
    EditSubcircuitModelDialog *dlg;
};

EditSubcircuitModelDialog::EditSubcircuitModelDialog(CirSim *a) : QDialog(a), app(a) {
    setAttribute(Qt::WA_DeleteOnClose);
    setWindowModality(Qt::ApplicationModal);
    setWindowTitle(LS("Edit Subcircuit Pin Layout"));
}

bool EditSubcircuitModelDialog::createModel() {
    std::set<int> nodeSet;
    model = app->sim->getCircuitAsComposite();
    // (that redid the node allocation, so the simulation needs it redone too)
    app->needAnalyze();
    if (!model)
        return false;
    if (model->extList.empty()) {
        app->alert(Locale::LS("Device has no external inputs/outputs!"));
        model->remove();
        return false;
    }
    std::stable_sort(model->extList.begin(), model->extList.end(),
                     [](const ExtListEntry &a, const ExtListEntry &b) { return toLower(a.name) < toLower(b.name); });

    int pc = (int) model->extList.size();
    int sideCounts[4] = {0, 0, 0, 0};
    for (int i = 0; i < pc; i++) {
        const ExtListEntry &pin = model->extList[i];
        if (pin.busZ == 0)
            sideCounts[pin.side]++;
        if (nodeSet.count(pin.node)) {
            app->alert(Locale::LS("Can't have two input/output nodes connected!"));
            model->remove();
            return false;
        }
        nodeSet.insert(pin.node);
    }

    int xOffsetLeft = sideCounts[ChipElm::SIDE_W] > 0 ? 1 : 0;
    int xOffsetRight = sideCounts[ChipElm::SIDE_E] > 0 ? 1 : 0;
    for (ExtListEntry &pin : model->extList)
        if (pin.side == ChipElm::SIDE_N || pin.side == ChipElm::SIDE_S)
            pin.pos += xOffsetLeft;

    int minHeight = (sideCounts[ChipElm::SIDE_N] > 0 && sideCounts[ChipElm::SIDE_S] > 0) ? 2 : 1;
    int pinsNS = std::max(sideCounts[ChipElm::SIDE_N], sideCounts[ChipElm::SIDE_S]);
    int pinsWE = std::max(sideCounts[ChipElm::SIDE_W], sideCounts[ChipElm::SIDE_E]);
    model->sizeX = std::max(2, pinsNS + xOffsetLeft + xOffsetRight);
    model->sizeY = std::max(minHeight, pinsWE);
    return true;
}

void EditSubcircuitModelDialog::createDialog() {
    QVBoxLayout *v = new QVBoxLayout(this);

    QLabel *title = new QLabel(LS("Edit Subcircuit Pin Layout"));
    QFont bold = title->font();
    bold.setBold(true);
    title->setFont(bold);
    v->addWidget(title);
    v->addWidget(new QLabel(LS("Drag the pins to the desired position")));

    canvas = new PinLayoutCanvas(this);
    v->addWidget(canvas);

    chip.reset(SubcircuitChipElm::create(50, 50));
    chip->x2 = 200;
    chip->y2 = 50;
    selectedPin = -1;
    createPinsFromModel();

    if (model->name.empty()) {
        v->addWidget(new QLabel(LS("Model Name")));
        modelNameInput = new QLineEdit();
        connect(modelNameInput, &QLineEdit::textChanged, this, [this] { canvas->update(); });
        v->addWidget(modelNameInput);
    }

    // Width/Height controls
    QHBoxLayout *hp = new QHBoxLayout();
    auto addBtn = [&](const QString &label, int dx, int dy) {
        QPushButton *b = new QPushButton(label);
        b->setAutoDefault(false);
        connect(b, &QPushButton::clicked, this, [this, dx, dy] { adjustChipSize(dx, dy); });
        hp->addWidget(b);
    };
    hp->addWidget(new QLabel(LS("Width")));
    addBtn("+", 1, 0);
    addBtn("-", -1, 0);
    hp->addSpacing(12);
    hp->addWidget(new QLabel(LS("Height")));
    addBtn("+", 0, 1);
    addBtn("-", 0, -1);
    hp->addStretch(1);
    v->addLayout(hp);

    // Label checkbox
    labelCheck = new QCheckBox(LS("Show Label"));
    labelCheck->setChecked(model->showLabel());
    connect(labelCheck, &QCheckBox::toggled, this, [this](bool on) {
        model->setShowLabel(on);
        canvas->update();
    });
    v->addWidget(labelCheck);

    // Scope selector
    QHBoxLayout *scopeRow = new QHBoxLayout();
    scopeRow->addWidget(new QLabel(LS("Scope:")));
    scopeSelect = new QComboBox();
    scopeSelect->addItems({LS("This Circuit"), LS("This Session"), LS("Save Across Sessions")});
    if (model->isSaved())
        scopeSelect->setCurrentIndex(SCOPE_SAVE_ACROSS_SESSIONS);
    else if (!model->name.empty() && SubcircuitModel::globalModelMap.has(model->name))
        scopeSelect->setCurrentIndex(SCOPE_THIS_SESSION);
    else
        scopeSelect->setCurrentIndex(SCOPE_THIS_CIRCUIT);
    scopeRow->addWidget(scopeSelect);
    scopeRow->addStretch(1);
    v->addLayout(scopeRow);

    QHBoxLayout *btnRow = new QHBoxLayout();
    btnRow->addStretch(1);
    QPushButton *cancelBtn = new QPushButton(LS("Cancel"));
    cancelBtn->setAutoDefault(false);
    connect(cancelBtn, &QPushButton::clicked, this, [this] { closeDialog(); });
    QPushButton *okBtn = new QPushButton(LS("OK"));
    okBtn->setDefault(true);
    connect(okBtn, &QPushButton::clicked, this, [this] { enterPressed(); });
    btnRow->addWidget(cancelBtn);
    btnRow->addWidget(okBtn);
    v->addLayout(btnRow);

    if (modelNameInput)
        modelNameInput->setFocus();
    show();
    raise();
    activateWindow();
}

void EditSubcircuitModelDialog::createPinsFromModel() {
    postCount = (int) model->extList.size();
    chip->allocPins(postCount);
    chip->sizeX = model->sizeX;
    chip->sizeY = model->sizeY;
    chip->allocNodes();
    for (int i = 0; i < postCount; i++) {
        const ExtListEntry &pin = model->extList[i];
        chip->setPin(i, pin.pos, pin.side, pin.name);
        chip->pins[i].busWidth = pin.busWidth;
        chip->pins[i].busZ = pin.busZ;
        if (isPinSelected(i))
            chip->pins[i].selected = true;
    }
    chip->setPoints();

    // (the TS version does this in drawChip(); the mouse handlers need it before the next paint)
    const Rectangle &bb = chip->boundingBox;
    double scalew = 400.0 / (bb.width + bb.x * 2);
    double scaleh = 400.0 / (bb.height + bb.y * 2);
    scale = 1 / std::min(scalew, scaleh);
}

void EditSubcircuitModelDialog::enterPressed() {
    if (modelNameInput) {
        std::string name = modelNameInput->text().toStdString();
        if (name.empty()) {
            app->alert(Locale::LS("Please enter a model name."));
            return;
        }
        SubcircuitElm::lastModelName = name;
        model->setName(name);
    }
    int scope = scopeSelect->currentIndex();
    SubcircuitModel::localModelMap.erase(model->name);
    SubcircuitModel::globalModelMap.erase(model->name);
    model->setSaved(false);
    if (scope == SCOPE_THIS_CIRCUIT)
        SubcircuitModel::localModelMap.set(model->name, model);
    else if (scope == SCOPE_THIS_SESSION)
        SubcircuitModel::globalModelMap.set(model->name, model);
    else
        model->setSaved(true);
    // (updating the models replaces the components we may be viewing)
    app->resetSubcircuitView();
    app->updateModels();
    app->needAnalyze();
    if (!popContext && !app->contextStack.empty())
        app->contextStack.back().changedModels.push_back(model);
    if (popContext) {
        SubcircuitModelRef savedModel = model;
        std::vector<SubcircuitModelRef> changedModels = app->popContextAndGetChangedModels();
        changedModels.push_back(savedModel);
        for (const SubcircuitModelRef &m : changedModels) {
            SubcircuitModel::replaceModel(m);
            app->refreshModels(m->name);
        }
        if (!app->contextStack.empty()) {
            std::vector<SubcircuitModelRef> &cm = app->contextStack.back().changedModels;
            cm.insert(cm.end(), changedModels.begin(), changedModels.end());
        }
    }
    closeDialog();
}

void EditSubcircuitModelDialog::closeEvent(QCloseEvent *e) {
    // a newly created model that was never named (cancelled) is discarded
    if (model && model->name.empty())
        model->remove();
    QDialog::closeEvent(e);
}

std::optional<std::string> EditSubcircuitModelDialog::labelName() {
    if (labelCheck == nullptr || !labelCheck->isChecked())
        return std::nullopt;
    return modelNameInput ? modelNameInput->text().toStdString() : model->name;
}

void EditSubcircuitModelDialog::drawChip(QPainter &painter) {
    if (!chip)
        return;
    QtGraphics g(painter);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.setColor(app->getBackgroundColor());
    g.fillRect(0, 0, canvas->width(), canvas->height());
    g.setTransform(1 / scale, 0, 0, 1 / scale, 0, 0);
    g.setFont(CircuitElm::unitsFont);
    g.setLineCap(Graphics::CAP_ROUND);
    chip->setLabel(labelName());
    chip->draw(g);

    if (rubberBand) {
        int x1 = std::min(rubberBandX1, rubberBandX2);
        int y1 = std::min(rubberBandY1, rubberBandY2);
        int w = std::abs(rubberBandX2 - rubberBandX1);
        int h = std::abs(rubberBandY2 - rubberBandY1);
        painter.setTransform(QTransform());
        painter.fillRect(QRectF(x1, y1, w, h), QColor(68, 136, 255, 38));
        painter.setPen(QPen(QColor(0x44, 0x88, 0xff), 1));
        painter.setBrush(Qt::NoBrush);
        painter.drawRect(QRectF(x1 + .5, y1 + .5, w, h));
    }
}

void EditSubcircuitModelDialog::adjustChipSize(int dx, int dy) {
    if (dx < 0) {
        for (int i = 0; i < postCount; i++) {
            const Pin &p = chip->pins[i];
            if (p.busZ > 0)
                continue;
            if ((p.side == ChipElm::SIDE_N || p.side == ChipElm::SIDE_S) && p.pos >= chip->sizeX + dx)
                return;
        }
    }
    if (dy < 0) {
        bool needShift = false;
        for (int i = 0; i < postCount; i++) {
            const Pin &p = chip->pins[i];
            if (p.busZ > 0)
                continue;
            if ((p.side == ChipElm::SIDE_E || p.side == ChipElm::SIDE_W) && p.pos >= chip->sizeY + dy) {
                needShift = true;
                break;
            }
        }
        if (needShift) {
            for (int i = 0; i < postCount; i++) {
                const Pin &p = chip->pins[i];
                if (p.busZ > 0)
                    continue;
                if ((p.side == ChipElm::SIDE_E || p.side == ChipElm::SIDE_W) && p.pos == 0)
                    return;
            }
            for (ExtListEntry &pe : model->extList)
                if (pe.side == ChipElm::SIDE_E || pe.side == ChipElm::SIDE_W)
                    pe.pos -= 1;
        }
    }
    if (chip->sizeX + dx < 1 || chip->sizeY + dy < 1)
        return;
    model->sizeX += dx;
    model->sizeY += dy;
    createPinsFromModel();
    canvas->update();
}

int EditSubcircuitModelDialog::findNearestPin(int x, int y) {
    double bestDist = 20;
    int best = -1;
    for (int i = 0; i < postCount; i++) {
        const Pin &p = chip->pins[i];
        if (p.busZ > 0)
            continue;
        double dx = x * scale - p.textloc.x;
        double dy = y * scale - p.textloc.y;
        double dist = std::hypot(dx, dy);
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    return best;
}

void EditSubcircuitModelDialog::updatePinHighlight() {
    for (int i = 0; i < postCount; i++)
        chip->pins[i].selected = isPinSelected(i);
}

bool EditSubcircuitModelDialog::isPinSelected(int i) const {
    return std::find(selectedPins.begin(), selectedPins.end(), i) != selectedPins.end();
}

void EditSubcircuitModelDialog::selectPin(int i) {
    if (!isPinSelected(i))
        selectedPins.push_back(i);
}

void EditSubcircuitModelDialog::deselectPin(int i) {
    selectedPins.erase(std::remove(selectedPins.begin(), selectedPins.end(), i), selectedPins.end());
}

int EditSubcircuitModelDialog::firstSelectedSide() const {
    return selectedPins.empty() ? -1 : model->extList[selectedPins[0]].side;
}

// is pin i's label inside the rubber band (in canvas coordinates)?
bool EditSubcircuitModelDialog::inRubberBand(int i, int x1, int y1, int x2, int y2) const {
    int px = (int) (chip->pins[i].textloc.x / scale);
    int py = (int) (chip->pins[i].textloc.y / scale);
    return px >= x1 && px <= x2 && py >= y1 && py <= y2;
}

void EditSubcircuitModelDialog::mouseUp() {
    if (rubberBand) {
        int x1 = std::min(rubberBandX1, rubberBandX2);
        int x2 = std::max(rubberBandX1, rubberBandX2);
        int y1 = std::min(rubberBandY1, rubberBandY2);
        int y2 = std::max(rubberBandY1, rubberBandY2);
        int selSide = firstSelectedSide();
        for (int i = 0; i < postCount; i++) {
            if (chip->pins[i].busZ > 0)
                continue;
            if (inRubberBand(i, x1, y1, x2, y2)) {
                if (selSide == -1)
                    selSide = model->extList[i].side;
                if (model->extList[i].side == selSide)
                    selectPin(i);
            }
        }
        rubberBand = false;
        updatePinHighlight();
        canvas->update();
    }
    dragging = false;
}

void EditSubcircuitModelDialog::mouseMoved(int x, int y) {
    if (rubberBand) {
        rubberBandX2 = x;
        rubberBandY2 = y;
        int x1 = std::min(rubberBandX1, rubberBandX2);
        int x2 = std::max(rubberBandX1, rubberBandX2);
        int y1 = std::min(rubberBandY1, rubberBandY2);
        int y2 = std::max(rubberBandY1, rubberBandY2);
        int selSide2 = firstSelectedSide();
        if (selSide2 == -1) {
            for (int i = 0; i < postCount; i++) {
                if (chip->pins[i].busZ > 0)
                    continue;
                if (inRubberBand(i, x1, y1, x2, y2)) {
                    selSide2 = model->extList[i].side;
                    break;
                }
            }
        }
        for (int i = 0; i < postCount; i++) {
            chip->pins[i].selected = isPinSelected(i);
            if (chip->pins[i].busZ > 0)
                continue;
            if (inRubberBand(i, x1, y1, x2, y2) && model->extList[i].side == selSide2)
                chip->pins[i].selected = true;
        }
        canvas->update();
        return;
    }
    if (dragging) {
        if (selectedPin < 0)
            return;
        int pos[2] = {0, 0};
        if (!chip->getPinPos((int) (x * scale), (int) (y * scale), dragCurrentSide, pos))
            return;
        dragCurrentSide = pos[1];

        // Reset to drag-start snapshot so each call is idempotent
        for (int i = 0; i < postCount; i++) {
            model->extList[i].pos = dragStartPosArr[i];
            model->extList[i].side = dragStartSideArr[i];
        }
        int newSide = pos[1];
        int maxNewPos = (newSide == ChipElm::SIDE_N || newSide == ChipElm::SIDE_S) ? chip->sizeX - 1 : chip->sizeY - 1;
        int minOff = INT_MAX, maxOff = INT_MIN;
        int sameSideCount = 0;
        for (int idx : selectedPins) {
            if (dragStartSideArr[idx] != dragStartSide)
                continue;
            sameSideCount++;
            int off = dragStartPosArr[idx] - dragStartPos;
            minOff = std::min(minOff, off);
            maxOff = std::max(maxOff, off);
        }
        int groupSize = maxOff - minOff + 1;
        int effectiveSide = newSide;
        int effectiveMaxPos = maxNewPos;
        if (groupSize > maxNewPos + 1) {
            effectiveSide = dragStartSide;
            effectiveMaxPos = (effectiveSide == ChipElm::SIDE_N || effectiveSide == ChipElm::SIDE_S) ? chip->sizeX - 1
                                                                                                   : chip->sizeY - 1;
        }
        int anchor = std::max(-minOff, std::min(effectiveMaxPos - maxOff, pos[0]));
        int delta = anchor - dragStartPos;
        bool sameSide = (effectiveSide == dragStartSide);
        bool contiguous = (groupSize == sameSideCount);

        // move a pin along with the rest of its bus
        auto updateBusGroup = [this](ExtListEntry &pj, int newPos, std::optional<int> newSideVal) {
            pj.pos = newPos;
            if (newSideVal)
                pj.side = *newSideVal;
            for (ExtListEntry &pjj : model->extList) {
                if (pjj.name == pj.name && pjj.busWidth == pj.busWidth) {
                    pjj.pos = newPos;
                    if (newSideVal)
                        pjj.side = *newSideVal;
                }
            }
        };

        if (sameSide && contiguous) {
            for (int i = 0; i < postCount; i++) {
                if (isPinSelected(i) || chip->pins[i].busZ > 0)
                    continue;
                if (dragStartSideArr[i] != dragStartSide)
                    continue;
                int origPos = dragStartPosArr[i];
                int newPos;
                if (delta >= 0)
                    newPos = (origPos >= dragStartPos + maxOff + 1 && origPos <= anchor + maxOff) ? origPos - groupSize : origPos;
                else
                    newPos = (origPos >= anchor + minOff && origPos <= dragStartPos + minOff - 1) ? origPos + groupSize : origPos;
                if (newPos != origPos)
                    updateBusGroup(model->extList[i], newPos, std::nullopt);
            }
        } else {
            std::set<int> groupPos;
            for (int idx : selectedPins) {
                if (dragStartSideArr[idx] != dragStartSide)
                    continue;
                groupPos.insert(anchor + dragStartPosArr[idx] - dragStartPos);
            }
            std::vector<int> displaced;
            for (int i = 0; i < postCount; i++) {
                if (isPinSelected(i) || chip->pins[i].busZ > 0)
                    continue;
                if (dragStartSideArr[i] != effectiveSide)
                    continue;
                if (groupPos.count(dragStartPosArr[i]))
                    displaced.push_back(i);
            }
            std::set<int> taken;
            for (int i = 0; i < postCount; i++) {
                if (isPinSelected(i) || chip->pins[i].busZ > 0)
                    continue;
                if (dragStartSideArr[i] == effectiveSide && !groupPos.count(dragStartPosArr[i]))
                    taken.insert(dragStartPosArr[i]);
            }
            std::vector<int> available;
            for (int slot = 0; slot <= effectiveMaxPos; slot++)
                if (!groupPos.count(slot) && !taken.count(slot))
                    available.push_back(slot);
            std::stable_sort(displaced.begin(), displaced.end(),
                             [this](int a, int b) { return dragStartPosArr[a] < dragStartPosArr[b]; });
            std::vector<int> freeSlots;
            int na = (int) available.size();
            if (delta >= 0) {
                for (int k = na - 1; k >= 0 && freeSlots.size() < displaced.size(); k--)
                    if (available[k] < anchor)
                        freeSlots.push_back(available[k]);
                for (int k = 0; k < na && freeSlots.size() < displaced.size(); k++)
                    if (available[k] > anchor + maxOff)
                        freeSlots.push_back(available[k]);
            } else {
                for (int k = 0; k < na && freeSlots.size() < displaced.size(); k++)
                    if (available[k] > anchor + maxOff)
                        freeSlots.push_back(available[k]);
                for (int k = na - 1; k >= 0 && freeSlots.size() < displaced.size(); k--)
                    if (available[k] < anchor)
                        freeSlots.push_back(available[k]);
            }
            std::sort(freeSlots.begin(), freeSlots.end());
            for (size_t k = 0; k < displaced.size() && k < freeSlots.size(); k++)
                updateBusGroup(model->extList[displaced[k]], freeSlots[k], std::nullopt);
        }
        // Move selected pins to their new positions
        for (int idx : selectedPins) {
            if (dragStartSideArr[idx] != dragStartSide)
                continue;
            int newPos = anchor + dragStartPosArr[idx] - dragStartPos;
            updateBusGroup(model->extList[idx], newPos, effectiveSide);
        }
        createPinsFromModel();
        canvas->update();
    } else {
        // hover: highlight nearest pin without disturbing selectedPins
        int hoveredPin = findNearestPin(x, y);
        for (int i = 0; i < postCount; i++)
            chip->pins[i].selected = isPinSelected(i) || i == hoveredPin;
        canvas->update();
    }
}

void EditSubcircuitModelDialog::mouseDown(int x, int y, bool shift) {
    int hoveredPin = findNearestPin(x, y);

    if (hoveredPin < 0) {
        if (!shift)
            selectedPins.clear();
        rubberBand = true;
        rubberBandX1 = rubberBandX2 = x;
        rubberBandY1 = rubberBandY2 = y;
        updatePinHighlight();
        canvas->update();
        return;
    }

    rubberBand = false;
    if (shift) {
        if (isPinSelected(hoveredPin)) {
            deselectPin(hoveredPin);
        } else {
            int hSide = model->extList[hoveredPin].side;
            bool ok = selectedPins.empty();
            if (!ok)
                ok = (firstSelectedSide() == hSide);
            if (ok)
                selectPin(hoveredPin);
        }
    } else {
        if (!isPinSelected(hoveredPin)) {
            selectedPins.clear();
            selectPin(hoveredPin);
        }
    }
    selectedPin = hoveredPin;

    dragStartPosArr.assign(postCount, 0);
    dragStartSideArr.assign(postCount, 0);
    for (int i = 0; i < postCount; i++) {
        dragStartPosArr[i] = model->extList[i].pos;
        dragStartSideArr[i] = model->extList[i].side;
    }
    const ExtListEntry &sp = model->extList[selectedPin];
    dragStartPos = sp.pos;
    dragStartSide = dragCurrentSide = sp.side;

    updatePinHighlight();
    dragging = true;
    canvas->update();
}

void EditSubcircuitModelDialog::preservePinLayout(SubcircuitModel &newModel, const SubcircuitModel &existingModel) {
    int n = (int) newModel.extList.size();
    std::vector<bool> matched(n, false);
    bool anyPreserved = false;
    std::vector<std::pair<int, int>> placed;

    // Pass 1: copy pos/side from existing model for matched busZ==0 pins
    for (int i = 0; i < n; i++) {
        ExtListEntry &ent = newModel.extList[i];
        if (ent.busZ != 0)
            continue;
        for (const ExtListEntry &old : existingModel.extList) {
            if (old.busZ == 0 && old.name == ent.name) {
                ent.pos = old.pos;
                ent.side = old.side;
                matched[i] = true;
                anyPreserved = true;
                break;
            }
        }
        if (matched[i])
            placed.emplace_back(ent.pos, ent.side);
    }
    if (!anyPreserved)
        return;

    newModel.sizeX = existingModel.sizeX;
    newModel.sizeY = existingModel.sizeY;

    // Pass 2: place unmatched busZ==0 pins in free freeSlots
    for (int i = 0; i < n; i++) {
        if (matched[i])
            continue;
        ExtListEntry &ent = newModel.extList[i];
        if (ent.busZ != 0)
            continue;
        int side = ent.side;
        bool ns = (side == ChipElm::SIDE_N || side == ChipElm::SIDE_S);
        int foundPos = -1;
        for (int expansion = 0; expansion <= n && foundPos < 0; expansion++) {
            int curSizeX = newModel.sizeX + (ns ? expansion : 0);
            int curSizeY = newModel.sizeY + (ns ? 0 : expansion);
            int maxPos = ns ? curSizeX : curSizeY;
            for (int p = 0; p < maxPos; p++) {
                if (!pinIsOccupied(p, side, placed, curSizeX, curSizeY)) {
                    foundPos = p;
                    newModel.sizeX = curSizeX;
                    newModel.sizeY = curSizeY;
                    break;
                }
            }
        }
        ent.pos = foundPos >= 0 ? foundPos : 0;
        placed.emplace_back(ent.pos, side);
    }

    // Pass 3: propagate pos/side from busZ==0 anchor to bus sub-entries
    for (ExtListEntry &ent : newModel.extList) {
        if (ent.busZ == 0)
            continue;
        for (const ExtListEntry &anchor : newModel.extList) {
            if (anchor.busZ == 0 && anchor.name == ent.name) {
                ent.pos = anchor.pos;
                ent.side = anchor.side;
                break;
            }
        }
    }
}

int EditSubcircuitModelDialog::pinToGrid(int pos, int side, int sizeX, int sizeY) {
    if (side == ChipElm::SIDE_N)
        return pos;
    if (side == ChipElm::SIDE_S)
        return pos + sizeX * (sizeY - 1);
    if (side == ChipElm::SIDE_W)
        return pos * sizeX;
    if (side == ChipElm::SIDE_E)
        return pos * sizeX + sizeX - 1;
    return -1;
}

bool EditSubcircuitModelDialog::pinIsOccupied(int pos, int side, const std::vector<std::pair<int, int>> &placed,
                                              int sizeX, int sizeY) {
    int g = pinToGrid(pos, side, sizeX, sizeY);
    if (g < 0)
        return true;
    for (const auto &p : placed)
        if (pinToGrid(p.first, p.second, sizeX, sizeY) == g)
            return true;
    return false;
}
