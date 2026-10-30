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

#include "ModelManagerDialog.h"

#include <QComboBox>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QListWidget>
#include <QPushButton>
#include <QVBoxLayout>
#include <algorithm>
#include <functional>
#include <typeinfo>

#include "CirSim.h"
#include "core/Locale.h"

static QString LS(const std::string &s) { return QString::fromStdString(Locale::LS(s)); }

ModelManagerDialog::ModelManagerDialog(CirSim *s) : QDialog(s), sim(s) {
    setAttribute(Qt::WA_DeleteOnClose);
    setWindowModality(Qt::ApplicationModal);
    setWindowTitle(LS("Model Manager"));
    setMinimumWidth(400);
    QVBoxLayout *v = new QVBoxLayout(this);

    QHBoxLayout *typeRow = new QHBoxLayout();
    typeRow->addWidget(new QLabel(LS("Type:")));
    typeSelect = new QComboBox();
    typeRow->addWidget(typeSelect);
    typeRow->addStretch(1);
    v->addLayout(typeRow);
    connect(typeSelect, &QComboBox::currentIndexChanged, this, [this](int) {
        if (populating)
            return;
        typeFilter = typeSelect->currentData().toString().toStdString();
        populateList({});
    });

    modelListBox = new QListWidget();
    modelListBox->setSelectionMode(QAbstractItemView::ExtendedSelection);
    v->addWidget(modelListBox);
    populateList({});

    // two rows of three equal-width buttons, so the columns line up
    QGridLayout *buttons = new QGridLayout();
    buttons->setSpacing(8);
    int n = 0;
    auto addButton = [&](const char *label, std::function<void()> handler) {
        QPushButton *b = new QPushButton(LS(label));
        b->setAutoDefault(false);
        connect(b, &QPushButton::clicked, this, handler);
        buttons->addWidget(b, n / 3, n % 3);
        n++;
        return b;
    };
    addButton("Make Local", [this] { handleSetScope(ModelScope::Local); });
    addButton("Make Global", [this] { handleSetScope(ModelScope::Global); });
    addButton("Make Persistent", [this] { handleSetScope(ModelScope::Persistent); });
    addButton("Export", [this] { handleSave(); });
    addButton("Delete", [this] { handleDelete(); });
    addButton("Done", [this] { close(); })->setDefault(true);
    v->addLayout(buttons);
}

void ModelManagerDialog::populateList(const std::set<RegistryModel *> &selected) {
    std::vector<TypedModel> all;
    for (const ModelType *type : allModelTypes())
        for (RegistryModel *model : type->registry->anyModels())
            if (isUserModel(model))
                all.push_back({type, model});
    auto typeName = [](const TypedModel &tm) { return tm.type->typeName(tm.model); };
    std::stable_sort(all.begin(), all.end(), [&](const TypedModel &a, const TypedModel &b) {
        int c = typeName(a).compare(typeName(b));
        return c != 0 ? c < 0 : a.model->name < b.model->name;
    });

    // offer the types that have models, plus the current filter
    std::vector<std::string> typeNames;
    for (const TypedModel &tm : all)
        if (std::find(typeNames.begin(), typeNames.end(), typeName(tm)) == typeNames.end())
            typeNames.push_back(typeName(tm));
    const std::string filter = typeFilter;
    if (!filter.empty() && std::find(typeNames.begin(), typeNames.end(), filter) == typeNames.end())
        typeNames.push_back(filter);
    populating = true;
    typeSelect->clear();
    typeSelect->addItem(LS("All Types"), QString());
    for (const std::string &t : typeNames)
        typeSelect->addItem(LS(t), QString::fromStdString(t));
    typeSelect->setCurrentIndex(std::max(0, typeSelect->findData(QString::fromStdString(filter))));
    populating = false;

    models.clear();
    for (const TypedModel &tm : all)
        if (filter.empty() || typeName(tm) == filter)
            models.push_back(tm);
    modelListBox->clear();
    for (const TypedModel &tm : models) {
        std::string text = tm.model->name + " (";
        if (filter.empty())
            text += Locale::LS(typeName(tm)) + ", ";
        text += Locale::LS(modelScopeName(tm.type->registry->anyScope(tm.model))) + ")";
        QListWidgetItem *item = new QListWidgetItem(QString::fromStdString(text), modelListBox);
        item->setSelected(selected.count(tm.model) > 0);
    }
}

std::vector<TypedModel> ModelManagerDialog::getSelected() {
    std::vector<TypedModel> sel;
    for (int i = 0; i < modelListBox->count(); i++)
        if (modelListBox->item(i)->isSelected())
            sel.push_back(models[i]);
    if (sel.empty())
        sim->alert(Locale::LS("Please select one or more models."));
    return sel;
}

void ModelManagerDialog::handleSetScope(ModelScope scope) {
    std::vector<TypedModel> sel = getSelected();
    std::set<RegistryModel *> selSet;
    for (const TypedModel &tm : sel) {
        tm.type->registry->anySetScope(tm.model, scope);
        selSet.insert(tm.model);
    }
    populateList(selSet);
}

// save selected models as a library file which can be loaded like a circuit
void ModelManagerDialog::handleSave() {
    std::vector<TypedModel> sel = getSelected();
    if (sel.empty())
        return;
    std::string data = dumpModelLibrary(sel);
    std::string base = "models";
    if (sel.size() == 1) {
        base = sel[0].model->name;
        for (char &c : base)
            if (std::string("\\/:*?\"<>|").find(c) != std::string::npos)
                c = '_';
    }
    sim->saveFile(std::vector<unsigned char>(data.begin(), data.end()), base + ".txt");
}

void ModelManagerDialog::handleDelete() {
    std::vector<TypedModel> sel = getSelected();
    if (sel.empty())
        return;
    std::set<RegistryModel *> inUse = getModelsInUse(sim);
    // (an element may hold a different model object with the same name, e.g. after the model was replaced)
    std::string used;
    for (const TypedModel &tm : sel) {
        bool isUsed = std::any_of(inUse.begin(), inUse.end(), [&](RegistryModel *u) {
            return u == tm.model || (typeid(*u) == typeid(*tm.model) && u->name == tm.model->name);
        });
        if (isUsed)
            used += (used.empty() ? "" : ", ") + tm.model->name;
    }
    if (!used.empty()) {
        sim->alert(Locale::LS("Can't delete models in use in the current circuit: ") + used);
        return;
    }
    std::string names;
    for (const TypedModel &tm : sel)
        names += (names.empty() ? "" : ", ") + tm.model->name;
    if (!sim->confirm(Locale::LS("Are you sure you want to delete ") + names + "?"))
        return;
    for (const TypedModel &tm : sel)
        tm.type->registry->anyDelete(tm.model);
    populateList({});
}
