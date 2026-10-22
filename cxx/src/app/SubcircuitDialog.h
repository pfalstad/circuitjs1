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
#include <set>
#include <vector>

#include "core/SubcircuitModel.h"

class CirSim;
class QListWidget;

// the Subcircuit Manager: change where models live, save them as a library, delete them
class SubcircuitDialog : public QDialog {
public:
    explicit SubcircuitDialog(CirSim *sim);

private:
    // fill list box, selecting the models in selected
    void populateList(const std::set<SubcircuitModel *> &selected);
    std::vector<SubcircuitModelRef> getSelected();
    static std::set<SubcircuitModel *> asSet(const std::vector<SubcircuitModelRef> &v);
    void handleMakeLocal();
    void handleMakeGlobal();
    void handleMakePersistent();
    void handleSave();
    void handleDelete();

    CirSim *sim;
    QListWidget *subcircuitListBox;
    std::vector<SubcircuitModelRef> subcircuits;
};
