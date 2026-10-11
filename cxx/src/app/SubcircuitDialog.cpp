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

#include "SubcircuitDialog.h"

#include <QGridLayout>
#include <QLabel>
#include <QListWidget>
#include <QPushButton>
#include <QVBoxLayout>

#include "CirSim.h"
#include "core/Locale.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

SubcircuitDialog::SubcircuitDialog(CirSim *s) : QDialog(s), sim(s) {
    setAttribute(Qt::WA_DeleteOnClose);
    setWindowModality(Qt::ApplicationModal);
    setWindowTitle(LS("Subcircuit Manager"));
    setMinimumWidth(400);
    QVBoxLayout *v = new QVBoxLayout(this);

    subcircuitListBox = new QListWidget();
    subcircuitListBox->setSelectionMode(QAbstractItemView::ExtendedSelection);
    v->addWidget(subcircuitListBox);
    populateList({});

    // two rows of three equal-width buttons, so the columns line up
    QGridLayout *buttons = new QGridLayout();
    buttons->setSpacing(8);
    int n = 0;
    auto addButton = [&](const char *label, void (SubcircuitDialog::*handler)()) {
        QPushButton *b = new QPushButton(LS(label));
        b->setAutoDefault(false);
        connect(b, &QPushButton::clicked, this, handler);
        buttons->addWidget(b, n / 3, n % 3);
        n++;
    };
    addButton("Make Local", &SubcircuitDialog::handleMakeLocal);
    addButton("Make Global", &SubcircuitDialog::handleMakeGlobal);
    addButton("Make Persistent", &SubcircuitDialog::handleMakePersistent);
    addButton("Save", &SubcircuitDialog::handleSave);
    addButton("Delete", &SubcircuitDialog::handleDelete);
    QPushButton *done = new QPushButton(LS("Done"));
    done->setDefault(true);
    connect(done, &QPushButton::clicked, this, [this] { close(); });
    buttons->addWidget(done, 1, 2);
    v->addLayout(buttons);
}

void SubcircuitDialog::populateList(const std::set<SubcircuitModel *> &selected) {
    subcircuits.clear();
    for (const SubcircuitModelRef &m : SubcircuitModel::getModelList())
        if (!m->isBuiltin())
            subcircuits.push_back(m);
    subcircuitListBox->clear();
    for (const SubcircuitModelRef &m : subcircuits) {
        QListWidgetItem *item = new QListWidgetItem(
            QString::fromStdString(m->name + " (" + Locale::LS(m->getScope()) + ")"), subcircuitListBox);
        item->setSelected(selected.count(m.get()) > 0);
    }
}

std::vector<SubcircuitModelRef> SubcircuitDialog::getSelected() {
    std::vector<SubcircuitModelRef> sel;
    for (int i = 0; i < subcircuitListBox->count(); i++)
        if (subcircuitListBox->item(i)->isSelected())
            sel.push_back(subcircuits[i]);
    if (sel.empty())
        sim->alert(Locale::LS("Please select one or more subcircuits."));
    return sel;
}

std::set<SubcircuitModel *> SubcircuitDialog::asSet(const std::vector<SubcircuitModelRef> &v) {
    std::set<SubcircuitModel *> s;
    for (const SubcircuitModelRef &m : v)
        s.insert(m.get());
    return s;
}

void SubcircuitDialog::handleMakeLocal() {
    std::vector<SubcircuitModelRef> sel = getSelected();
    for (const SubcircuitModelRef &m : sel)
        m->makeLocal();
    populateList(asSet(sel));
}

void SubcircuitDialog::handleMakeGlobal() {
    std::vector<SubcircuitModelRef> sel = getSelected();
    for (const SubcircuitModelRef &m : sel)
        m->makeGlobal();
    populateList(asSet(sel));
}

void SubcircuitDialog::handleMakePersistent() {
    std::vector<SubcircuitModelRef> sel = getSelected();
    for (const SubcircuitModelRef &m : sel)
        m->makePersistent();
    populateList(asSet(sel));
}

// save selected subcircuits as a library file which can be loaded like a circuit
void SubcircuitDialog::handleSave() {
    std::vector<SubcircuitModelRef> sel = getSelected();
    if (sel.empty())
        return;
    std::string data = SubcircuitModel::dumpLibrary(sel);
    std::string base = "subcircuits";
    if (sel.size() == 1) {
        base = sel[0]->name;
        for (char &c : base)
            if (std::string("\\/:*?\"<>|").find(c) != std::string::npos)
                c = '_';
    }
    sim->saveFile(std::vector<unsigned char>(data.begin(), data.end()), base + ".txt");
}

void SubcircuitDialog::handleDelete() {
    std::vector<SubcircuitModelRef> sel = getSelected();
    if (sel.empty())
        return;
    std::set<std::string> inUse = SubcircuitModel::getModelNamesInUse(sim->elmList);
    std::string used;
    for (const SubcircuitModelRef &m : sel)
        if (inUse.count(m->name))
            used += (used.empty() ? "" : ", ") + m->name;
    if (!used.empty()) {
        sim->alert(Locale::LS("Can't delete subcircuits in use in the current circuit: ") + used);
        return;
    }
    std::string names;
    for (const SubcircuitModelRef &m : sel)
        names += (names.empty() ? "" : ", ") + m->name;
    if (!sim->confirm(Locale::LS("Are you sure you want to delete ") + names + "?"))
        return;
    for (const SubcircuitModelRef &m : sel)
        m->remove();
    populateList({});
}
