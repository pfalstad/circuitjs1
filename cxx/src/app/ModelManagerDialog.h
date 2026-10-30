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
#include <string>
#include <vector>

#include "core/ModelTypes.h"

class CirSim;
class QComboBox;
class QListWidget;

// lists the user's models of all types (subcircuits, diodes, transistors, ...) and lets them
// change where the models live (see ModelRegistry), save them to a library file, or delete them
class ModelManagerDialog : public QDialog {
public:
    explicit ModelManagerDialog(CirSim *sim);

private:
    // fill type selector and list box, selecting the models in selected
    void populateList(const std::set<RegistryModel *> &selected);
    std::vector<TypedModel> getSelected();
    void handleSetScope(ModelScope scope);
    void handleSave();
    void handleDelete();

    // type shown in the list, or "" for all types (remembered between uses)
    static inline std::string typeFilter;

    CirSim *sim;
    QComboBox *typeSelect;
    QListWidget *modelListBox;
    std::vector<TypedModel> models;
    // (set while populateList() fills typeSelect, so its change signal is ignored)
    bool populating = false;
};
