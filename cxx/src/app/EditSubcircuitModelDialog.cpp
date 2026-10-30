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
#include <QPushButton>
#include <QVBoxLayout>
#include <algorithm>
#include <cmath>
#include <set>

#include "ChipPinEditor.h"
#include "CirSim.h"
#include "core/CircuitElm.h"
#include "core/Locale.h"
#include "elements/SubcircuitElm.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

static std::string toLower(std::string s) {
    for (char &c : s)
        c = (char) std::tolower((unsigned char) c);
    return s;
}

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

    ChipPinEditorOptions opts;
    opts.getLabel = [this] { return labelName(); };
    editor = new ChipPinEditor(app, model->extList, model->sizeX, model->sizeY, opts);
    v->addWidget(editor);

    if (model->name.empty()) {
        v->addWidget(new QLabel(LS("Model Name")));
        modelNameInput = new QLineEdit();
        connect(modelNameInput, &QLineEdit::textChanged, this, [this] { drawChip(); });
        v->addWidget(modelNameInput);
    }

    v->addLayout(editor->createSizeControls());

    // Label checkbox
    labelCheck = new QCheckBox(LS("Show Label"));
    labelCheck->setChecked(model->showLabel());
    connect(labelCheck, &QCheckBox::toggled, this, [this](bool on) {
        model->setShowLabel(on);
        drawChip();
    });
    v->addWidget(labelCheck);

    // Scope selector
    QHBoxLayout *scopeRow = new QHBoxLayout();
    scopeRow->addWidget(new QLabel(LS("Scope:")));
    scopeSelect = new QComboBox();
    scopeSelect->addItems({LS("This Circuit"), LS("This Session"), LS("Save Across Sessions")});
    if (model->isSaved())
        scopeSelect->setCurrentIndex(SCOPE_SAVE_ACROSS_SESSIONS);
    else if (!model->name.empty() && SubcircuitModel::registry().hasGlobal(model->name))
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
    SubcircuitModel::registry().remove(model->name);
    model->setSaved(false);
    if (scope == SCOPE_THIS_CIRCUIT)
        SubcircuitModel::registry().setLocal(model);
    else if (scope == SCOPE_THIS_SESSION)
        SubcircuitModel::registry().setGlobal(model);
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

void EditSubcircuitModelDialog::drawChip() {
    if (editor)
        editor->draw();
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
