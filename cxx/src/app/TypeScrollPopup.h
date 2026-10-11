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

#include "ScrollValuePopup.h"

// popup for toggling MOSFET/JFET/transistor type on scroll wheel, similar to
// ScrollValuePopup for R/C/L values (TypeScrollPopup.ts)
class TypeScrollPopup : public WheelPopup {
public:
    TypeScrollPopup(QPoint globalPos, double dy, CircuitElm *elm, CirSim *sim);

    void doDeltaY(double dy) override;

protected:
    void revert() override;

private:
    std::string getHeaderText();
    void toggle();
    void updateLabel();

    CircuitElm *myElm;
    int originalPnp;
    int currentPnp;
    QLabel *typeLabel;
    double deltaY = 0;
};
