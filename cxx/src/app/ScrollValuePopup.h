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

#include <QFrame>
#include <vector>

#include "core/EditInfo.h"

class CircuitElm;
class CirSim;
class QLabel;
class QVBoxLayout;
class QWheelEvent;

// Base for the small popups the mouse wheel brings up over an element.  It grabs the
// mouse and keyboard (Qt::Popup): the wheel adjusts, Enter or a left/middle click keeps
// the change, Escape/Space or a right click reverts it, and moving off it keeps it.
class WheelPopup : public QFrame {
public:
    WheelPopup(CirSim *sim);

    // GWT's MouseWheelEvent.getDeltaY() scale, as ScrollValuePopup.normalizeWheelDelta()
    // computes it from a browser 'wheel' event
    static double normalizeWheelDelta(QWheelEvent *e);

    virtual void doDeltaY(double dy) = 0;
    void close(bool keepChanges);
    bool isShowing() const { return !closed; }

protected:
    virtual void revert() = 0;
    // called when the popup closes keeping the changes
    virtual void keep() {}
    // put the popup at globalPos - (w*fx, h*fy), kept on-screen
    void place(QPoint globalPos, double fx, double fy);
    QLabel *addLabel(const QString &style);

    void wheelEvent(QWheelEvent *e) override;
    void mousePressEvent(QMouseEvent *e) override;
    void mouseMoveEvent(QMouseEvent *e) override;
    void keyPressEvent(QKeyEvent *e) override;
    void hideEvent(QHideEvent *e) override;

    CirSim *sim;
    QVBoxLayout *layout;
    bool closed = false;
};

// popup shown when the mouse wheel is scrolled over a resistor/capacitor/inductor: scrolling
// steps the value through the E12 preferred-value series, previewing a few neighboring values
// (ScrollValuePopup.ts)
class ScrollValuePopup : public WheelPopup {
public:
    ScrollValuePopup(QPoint globalPos, double dy, CircuitElm *elm, CirSim *sim);

    void doDeltaY(double dy) override;

    // wheel delta for one step (TypeScrollPopup uses it too)
    static constexpr int scale = 6;

protected:
    void revert() override { setElmValue(currentidx); }

private:
    static constexpr int labMax = 5;

    void setupValues();
    void setupLabels();
    void setElmValue(int i);
    int getSelIdx() const;

    std::vector<double> values;
    int minpow = 0;
    int maxpow = 1;
    int nvalues = 0;
    int currentidx = 0;
    int lastidx = 0;
    CircuitElm *myElm;
    std::vector<QLabel *> labels;
    double deltaY = 0;
    std::string name;
    EditInfo inf{"", 0.0};
};
