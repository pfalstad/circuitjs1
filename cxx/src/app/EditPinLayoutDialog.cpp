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

#include "EditPinLayoutDialog.h"

#include <QComboBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QPushButton>
#include <QVBoxLayout>

#include "CirSim.h"
#include "EditDialog.h"
#include "core/Locale.h"
#include "core/PinLayoutModel.h"
#include "elements/ChipElm.h"

static QString LS(const std::string &s) { return QString::fromStdString(Locale::LS(s)); }

static const ModelScope SCOPES[] = {ModelScope::Local, ModelScope::Global, ModelScope::Persistent};

static std::string trim(const std::string &s) {
    const char *ws = " \t\n\r\f\v";
    size_t a = s.find_first_not_of(ws);
    if (a == std::string::npos)
        return "";
    return s.substr(a, s.find_last_not_of(ws) - a + 1);
}

EditPinLayoutDialog::EditPinLayoutDialog(CirSim *a, ChipElm *c, PinLayoutModel *m)
    : QDialog(a), app(a), chip(c), model(m) {
    setAttribute(Qt::WA_DeleteOnClose);
    setWindowModality(Qt::ApplicationModal);
    std::string titleText = Locale::LS(model == nullptr ? "Create Pin Layout" : "Edit Pin Layout");
    setWindowTitle(QString::fromStdString(titleText));
    ModelRegistry<PinLayoutModel> &reg = PinLayoutModel::registry();

    // start from where the chip's pins are now (where the model puts them, if editing it)
    sizeX = chip->sizeX;
    sizeY = chip->sizeY;
    for (int i = 0; i != chip->getPostCount(); i++) {
        const Pin &p = chip->pins[i];
        PinLayoutEntry e(p.text, 0, p.pos, p.side0);
        e.busWidth = p.busWidth;
        e.busZ = p.busZ;
        entries.push_back(e);
    }

    QVBoxLayout *v = new QVBoxLayout(this);
    QLabel *title = new QLabel(QString::fromStdString(titleText));
    QFont bold = title->font();
    bold.setBold(true);
    title->setFont(bold);
    v->addWidget(title);
    v->addWidget(new QLabel(LS("Drag the pins to the desired position")));

    ChipPinEditorOptions opts;
    // draw the pins like the chip does
    opts.decoratePin = [this](Pin &pin, int i) {
        const Pin &cp = chip->pins[i];
        pin.text = cp.text;
        pin.lineOver = cp.lineOver;
        pin.bubble = cp.bubble;
        pin.clock = cp.clock;
    };
    editor = new ChipPinEditor(app, entries, sizeX, sizeY, opts);
    v->addWidget(editor);
    v->addLayout(editor->createSizeControls());

    QHBoxLayout *nameRow = new QHBoxLayout();
    nameRow->addWidget(new QLabel(LS("Model Name")));
    nameInput = new QLineEdit(QString::fromStdString(
        model != nullptr ? model->name : reg.uniqueName(chip->getChipName() + " " + Locale::LS("layout"))));
    nameRow->addWidget(nameInput);
    v->addLayout(nameRow);

    QHBoxLayout *scopeRow = new QHBoxLayout();
    scopeRow->addWidget(new QLabel(LS("Scope:")));
    scopeSelect = new QComboBox();
    for (const char *s : {"This Circuit", "This Session", "Save Across Sessions"})
        scopeSelect->addItem(LS(s));
    int scopeIndex = 0;
    if (model != nullptr)
        for (int i = 0; i != 3; i++)
            if (SCOPES[i] == reg.scope(model))
                scopeIndex = i;
    scopeSelect->setCurrentIndex(scopeIndex);
    scopeRow->addWidget(scopeSelect);
    scopeRow->addStretch(1);
    v->addLayout(scopeRow);

    QHBoxLayout *btnRow = new QHBoxLayout();
    btnRow->addStretch(1);
    QPushButton *cancelBtn = new QPushButton(LS("Cancel"));
    cancelBtn->setAutoDefault(false);
    connect(cancelBtn, &QPushButton::clicked, this, [this] { close(); });
    QPushButton *okBtn = new QPushButton(LS("OK"));
    okBtn->setDefault(true);
    connect(okBtn, &QPushButton::clicked, this, [this] { enterPressed(); });
    btnRow->addWidget(cancelBtn);
    btnRow->addWidget(okBtn);
    v->addLayout(btnRow);
}

void EditPinLayoutDialog::enterPressed() {
    ModelRegistry<PinLayoutModel> &reg = PinLayoutModel::registry();
    std::string name = trim(nameInput->text().toStdString());
    if (name.empty()) {
        app->alert(Locale::LS("Please enter a model name."));
        return;
    }
    PinLayoutModel *existing = reg.get(name);
    if (existing != nullptr && existing != model) {
        app->alert(Locale::LS("A pin layout with that name already exists."));
        return;
    }
    std::vector<PinLayoutPin> pins;
    for (const PinLayoutEntry &e : entries)
        pins.push_back(PinLayoutPin{e.name, e.side, e.pos});
    ModelScope scope = SCOPES[scopeSelect->currentIndex()];
    if (model == nullptr) {
        PinLayoutModel *m = new PinLayoutModel();
        m->name = name;
        m->elmType = chip->getXmlDumpType();
        m->copyLayout(sizeX, sizeY, pins);
        reg.setScope(m, scope);
        chip->setPinLayout(m);
    } else {
        if (name != model->name)
            reg.rename(model, name);
        model->copyLayout(sizeX, sizeY, pins);
        // also updates the saved copy, if any
        reg.setScope(model, scope);
        // move the pins of every chip using this model
        app->updateModels();
    }
    app->needAnalyze();
    if (app->editDialog != nullptr)
        app->editDialog->resetDialog();
    close();
}
