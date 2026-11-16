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

#include <QWidget>
#include <optional>
#include <string>

class CirSim;
class QLabel;
class QPushButton;

// the bar above the canvas shown while viewing a subcircuit's components
// ("Viewing: a > b") or editing a subcircuit model ("Editing: a" with Save buttons)
class SubcircuitBar : public QWidget {
public:
    explicit SubcircuitBar(CirSim *app);

    void setSubcircuitPath(const std::optional<std::string> &path);
    void setContextInfo(const std::optional<std::string> &modelName);

private:
    void saveContext(bool copy);
    void updateVisibility();

    CirSim *app;
    QLabel *subcircuitLabel;
    QLabel *contextLabel;
    QPushButton *backButton;
    QPushButton *contextSaveButton;
    QPushButton *contextSaveCopyButton;
    bool hasSubcircuit = false;
    bool hasContext = false;
};
