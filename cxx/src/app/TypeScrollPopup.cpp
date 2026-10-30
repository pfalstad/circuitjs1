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
#include "elements/GateElm.h"
#include "elements/MosfetElm.h"
#include "elements/TransistorElm.h"

#include "TypeScrollPopup.h"

#include <QLabel>
#include <algorithm>
#include <iterator>

#include "CirSim.h"
#include "core/ElementFactory.h"
#include "core/JsMath.h"
#include "core/Locale.h"
#include "core/ScopeManager.h"

using Locale::LS;

// gate cycle order (wraps). the current gate is found by dump type; the next
// one is created through ElementFactory by class name.
static const int gateDumpTypes[] = {150, 151, 152, 153, 154, 431};
static const char *const gateClasses[] = {"AndGateElm", "NandGateElm", "OrGateElm",
                                          "NorGateElm", "XorGateElm", "XnorGateElm"};

static int getPnp(CircuitElm *e) {
    return e->isMosfetElm() ? static_cast<MosfetElm *>(e)->pnp : static_cast<TransistorElm *>(e)->pnp;
}

TypeScrollPopup::TypeScrollPopup(QPoint globalPos, double dy, CircuitElm *elm, CirSim *sim)
    : WheelPopup(sim), myElm(elm), originalElm(elm) {
    sim->pushUndo();
    if (elm->isGateElm()) {
        const int *t = std::find(std::begin(gateDumpTypes), std::end(gateDumpTypes), elm->getDumpType());
        gateIndex = t == std::end(gateDumpTypes) ? -1 : (int) (t - std::begin(gateDumpTypes));
    } else
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
    if (myElm->isGateElm())
        return LS("Gate Type");
    return LS("Transistor Type");
}

void TypeScrollPopup::doDeltaY(double dy) {
    // same as ScrollValuePopup (#421): a single wheel event moves at most one step
    // (times the sensitivity), so one notch is one step on any device; small
    // trackpad deltas still accumulate
    dy /= sim->devicePixelRatioF();
    deltaY += std::max((double) -ScrollValuePopup::scale, std::min((double) ScrollValuePopup::scale, dy));
    int steps = (int) jsmath::round(sim->mouse.wheelSensitivity * deltaY / ScrollValuePopup::scale);
    while (stepsDone < steps) {
        stepsDone++;
        toggle(1);
    }
    while (stepsDone > steps) {
        stepsDone--;
        toggle(-1);
    }
}

void TypeScrollPopup::stepGate(int dir) {
    GateElm *old = static_cast<GateElm *>(myElm);
    const int n = (int) std::size(gateClasses);
    gateIndex = (gateIndex + dir + n) % n;
    GateElm *g = static_cast<GateElm *>(ElementFactory::create(gateClasses[gateIndex], old->x, old->y));
    g->x2 = old->x2;
    g->y2 = old->y2;
    g->flags = old->flags & ~(GateElm::FLAG_INVERT_INPUTS | GateElm::FLAG_DEMORGAN);
    g->inputCount = old->inputCount;
    g->highVoltage = old->highVoltage;
    g->propagationDelay = old->propagationDelay;
    g->setSize((g->flags & GateElm::FLAG_SMALL) != 0 ? 1 : 2);
    g->allocNodes();
    g->setupVolts();
    g->setPoints();
    replaceElm(g);
}

void TypeScrollPopup::replaceElm(CircuitElm *newElm) {
    CircuitElm *old = myElm;
    int i = sim->locateElm(old);
    sim->elmList[i] = newElm;
    newElm->setSelected(old->isSelected());
    sim->mouse.setMouseElm(newElm);
    myElm = newElm;
    sim->scopeManager->deleteUnusedScopeElms();
    // (a gate this popup made, not the original)
    if (old != originalElm) {
        old->deleteElm();
        delete old;
    }
}

void TypeScrollPopup::toggle(int dir) {
    if (myElm->isGateElm()) {
        if (gateIndex >= 0)
            stepGate(dir);
    } else if (myElm->isMosfetElm()) {
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
    if (myElm->isGateElm()) {
        text = LS(static_cast<GateElm *>(myElm)->getGateName());
    } else if (myElm->isMosfetElm()) {
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
    if (myElm != originalElm) {
        // gate: put the original element back, flags and all
        replaceElm(originalElm);
        sim->needAnalyze();
    } else {
        while (currentPnp != originalPnp)
            toggle(1);
    }
}

void TypeScrollPopup::keep() {
    if (myElm != originalElm) {
        originalElm->deleteElm();
        delete originalElm;
        originalElm = myElm;
    }
}
