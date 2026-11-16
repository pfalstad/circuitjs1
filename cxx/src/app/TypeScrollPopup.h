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
// ScrollValuePopup for R/C/L values (TypeScrollPopup.ts).
// Also cycles logic gates through AND/NAND/OR/NOR/XOR/XNOR. Gate type is the
// element's class, not a field, so each step replaces the element with a new
// one of the next class. Invert Inputs and DeMorgan are cleared on each step
// (Invert Inputs changes the gate's function). A scope on the gate is removed,
// same as deleting the gate.
class TypeScrollPopup : public WheelPopup {
public:
    TypeScrollPopup(QPoint globalPos, double dy, CircuitElm *elm, CirSim *sim);

    void doDeltaY(double dy) override;

protected:
    void revert() override;
    void keep() override;

private:
    std::string getHeaderText();
    void stepGate(int dir);
    // put newElm in myElm's place in the circuit
    void replaceElm(CircuitElm *newElm);
    void toggle(int dir);
    void updateLabel();

    CircuitElm *myElm;
    // (out of the circuit while a gate of another type is in its place; freed if that's kept)
    CircuitElm *originalElm;
    int originalPnp = 0;
    int currentPnp = 0;
    int gateIndex = 0;
    QLabel *typeLabel;
    double deltaY = 0;
    int stepsDone = 0;
};
