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

#include "ShortcutsDialog.h"

#include <QAction>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QKeySequenceEdit>
#include <QLabel>
#include <QMap>
#include <QMenuBar>
#include <QPushButton>
#include <QScrollArea>
#include <QVBoxLayout>

#include "CirSim.h"
#include "core/Locale.h"

static QString LS(const std::string &s) { return QString::fromStdString(Locale::LS(s)); }

ShortcutsDialog::ShortcutsDialog(CirSim *s) : QDialog(s), sim(s) {
    setWindowTitle(LS("Edit Shortcuts"));
    setAttribute(Qt::WA_DeleteOnClose);
    setModal(true);
    setMinimumWidth(400);

    // everything we can assign a shortcut to: the Draw menu's element items, plus
    // the "start/stop simulation" action and the command palette
    for (QAction *a : sim->mainMenuItems)
        rows.push_back({a, a->text(), a->shortcut(), nullptr});
    rows.push_back({nullptr, LS("Start/Stop Simulation"), sim->runStopShortcut, nullptr});
    rows.push_back({nullptr, LS("Command Palette"), sim->paletteShortcut, nullptr, true});

    QWidget *table = new QWidget();
    QGridLayout *grid = new QGridLayout(table);
    for (size_t i = 0; i != rows.size(); i++) {
        Row &row = rows[i];
        grid->addWidget(new QLabel(row.name), (int) i, 0);
        row.edit = new QKeySequenceEdit(row.shortcut);
        row.edit->setMaximumSequenceLength(1);
        row.edit->setFinishingKeyCombinations({});
        connect(row.edit, &QKeySequenceEdit::keySequenceChanged, this, [this, i](const QKeySequence &seq) {
            // backspace/delete clears the shortcut, like the web version
            QKeyCombination k = seq.isEmpty() ? QKeyCombination() : seq[0];
            bool clear = k.keyboardModifiers() == Qt::NoModifier &&
                         (k.key() == Qt::Key_Backspace || k.key() == Qt::Key_Delete);
            setRowShortcut(rows[i], clear ? QKeySequence() : seq);
        });
        grid->addWidget(row.edit, (int) i, 1);
        QPushButton *clearButton = new QPushButton(LS("Clear"));
        clearButton->setAutoDefault(false);
        connect(clearButton, &QPushButton::clicked, this, [this, i] { setRowShortcut(rows[i], QKeySequence()); });
        grid->addWidget(clearButton, (int) i, 2);
    }
    QScrollArea *sp = new QScrollArea();
    sp->setWidget(table);
    sp->setWidgetResizable(true);
    sp->setMinimumHeight(400);

    QVBoxLayout *vp = new QVBoxLayout(this);
    vp->addWidget(sp);
    QHBoxLayout *hp = new QHBoxLayout();
    okButton = new QPushButton(LS("OK"));
    okButton->setAutoDefault(false);
    connect(okButton, &QPushButton::clicked, this, [this] { enterPressed(); });
    hp->addWidget(okButton);
    hp->addStretch();
    QPushButton *cancelButton = new QPushButton(LS("Cancel"));
    cancelButton->setAutoDefault(false);
    connect(cancelButton, &QPushButton::clicked, this, [this] { close(); });
    hp->addWidget(cancelButton);
    vp->addLayout(hp);
    checkForDuplicates();
}

void ShortcutsDialog::setRowShortcut(Row &row, const QKeySequence &seq) {
    row.shortcut = seq;
    if (row.edit->keySequence() != seq) {
        QSignalBlocker block(row.edit);
        row.edit->setKeySequence(seq);
    }
    checkForDuplicates();
}

void ShortcutsDialog::enterPressed() {
    if (checkForDuplicates())
        return;
    for (Row &row : rows) {
        if (row.action)
            row.action->setShortcut(row.shortcut);
        else if (row.palette)
            sim->setPaletteShortcut(row.shortcut);
        else
            sim->setRunStopShortcut(row.shortcut);
    }
    sim->saveShortcuts();
    close();
}

// mark shortcuts used twice, or already used by another menu item, in red
bool ShortcutsDialog::checkForDuplicates() {
    // shortcuts of menu items not in the dialog (Edit > Copy, etc.)
    QMap<QKeySequence, QString> others;
    QList<QAction *> rowActions;
    for (Row &row : rows)
        if (row.action)
            rowActions.push_back(row.action);
    for (QAction *a : sim->menuBar()->findChildren<QAction *>()) {
        if (rowActions.contains(a) || a == sim->searchItem)
            continue;
        for (const QKeySequence &k : a->shortcuts())
            if (a != sim->runStopAction || k != sim->runStopShortcut)
                others[k] = a->text().remove('&');
    }

    QMap<QKeySequence, Row *> rowForShortcut;
    bool result = false;
    for (Row &row : rows) {
        row.edit->setStyleSheet("");
        row.edit->setToolTip("");
    }
    for (Row &row : rows) {
        if (row.shortcut.isEmpty())
            continue;
        if (others.contains(row.shortcut)) {
            row.edit->setStyleSheet("color: red");
            row.edit->setToolTip(LS("Already used by ") + others[row.shortcut]);
            result = true;
        }
        Row *other = rowForShortcut.value(row.shortcut);
        if (other != nullptr) {
            row.edit->setStyleSheet("color: red");
            other->edit->setStyleSheet("color: red");
            row.edit->setToolTip(LS("Already used by ") + other->name);
            result = true;
        }
        rowForShortcut[row.shortcut] = &row;
    }
    okButton->setEnabled(!result);
    return result;
}
