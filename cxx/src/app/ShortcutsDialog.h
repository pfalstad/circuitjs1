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
#include <QKeySequence>
#include <vector>

class CirSim;
class QAction;
class QKeySequenceEdit;
class QPushButton;

// Options > Shortcuts...: assign keys to the Draw menu items and to Start/Stop Simulation
// (ShortcutsDialog.ts)
class ShortcutsDialog : public QDialog {
public:
    explicit ShortcutsDialog(CirSim *sim);

private:
    struct Row {
        QAction *action;  // the Draw menu item, or nullptr for run/stop
        QString name;
        QKeySequence shortcut;
        QKeySequenceEdit *edit;
    };
    void setRowShortcut(Row &row, const QKeySequence &seq);
    bool checkForDuplicates();
    void enterPressed();

    CirSim *sim;
    std::vector<Row> rows;
    QPushButton *okButton;
};
