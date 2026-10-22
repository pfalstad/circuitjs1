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

#include <string>

#include "core/Color.h"
#include "core/EditInfo.h"

class CirSim;
class SimulationManager;

// the Options > Other Options... dialog (EditOptions.ts)
class EditOptions : public Editable {
public:
    EditOptions(CirSim *a, SimulationManager *s) : app(a), sim(s) {}

    std::string getEditTitle() override { return "Other Options"; }
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;

private:
    Color setColor(const std::string &name, EditInfo &ei, const Color &def);

    CirSim *app;
    SimulationManager *sim;
};
