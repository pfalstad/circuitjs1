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

// (before any Qt header: Qt #defines 'emit', which TransistorElm uses as a member name)
#include "elements/MosfetElm.h"
#include "elements/TransistorElm.h"

#include "TypeScrollPopup.h"

#include <QLabel>

#include "CirSim.h"
#include "core/Locale.h"

using Locale::LS;

static int getPnp(CircuitElm *e) {
    return e->isMosfetElm() ? static_cast<MosfetElm *>(e)->pnp : static_cast<TransistorElm *>(e)->pnp;
}

TypeScrollPopup::TypeScrollPopup(QPoint globalPos, double dy, CircuitElm *elm, CirSim *sim)
    : WheelPopup(sim), myElm(elm) {
    sim->pushUndo();
    originalPnp = currentPnp = getPnp(elm);

    QLabel *header = addLabel("font-size: 10px; color: gray;");
    header->setText(QString::fromStdString(getHeaderText()));
    typeLabel = addLabel("font-size: 17px; font-weight: bold; "
                         "border-top: 1px solid black; border-bottom: 1px solid black;");
    updateLabel();

    doDeltaY(dy);
    place(globalPos, .25, .5);
    show();
}

std::string TypeScrollPopup::getHeaderText() {
    if (myElm->isJfetElm())
        return LS("JFET Type");
    if (myElm->isMosfetElm())
        return LS("MOSFET Type");
    return LS("Transistor Type");
}

void TypeScrollPopup::doDeltaY(double dy) {
    deltaY += dy;
    // toggle on every 30 units of scroll (same sensitivity as ScrollValuePopup)
    while (deltaY >= 30) {
        deltaY -= 30;
        toggle();
    }
    while (deltaY <= -30) {
        deltaY += 30;
        toggle();
    }
}

void TypeScrollPopup::toggle() {
    if (myElm->isMosfetElm()) {
        MosfetElm *e = static_cast<MosfetElm *>(myElm);
        e->pnp = -e->pnp;
        e->flags ^= MosfetElm::FLAG_PNP;
        e->setPoints();
        currentPnp = e->pnp;
    } else if (myElm->isTransistorElm()) {
        TransistorElm *e = static_cast<TransistorElm *>(myElm);
        e->pnp = -e->pnp;
        e->setPoints();
        currentPnp = e->pnp;
    }
    sim->needAnalyze();
    sim->repaint();
    updateLabel();
}

void TypeScrollPopup::updateLabel() {
    std::string text;
    if (myElm->isMosfetElm()) {
        text = myElm->isJfetElm()
            ? (currentPnp == -1 ? LS("P-Channel JFET") : LS("N-Channel JFET"))
            : (currentPnp == -1 ? LS("P-Channel") : LS("N-Channel"));
    } else {
        text = currentPnp == -1 ? "PNP" : "NPN";
    }
    typeLabel->setText(QString::fromStdString(text));
}

void TypeScrollPopup::revert() {
    // revert to original state
    while (currentPnp != originalPnp)
        toggle();
}
