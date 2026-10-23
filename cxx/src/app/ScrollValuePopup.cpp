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

#include "ScrollValuePopup.h"

#include <QGuiApplication>
#include <QKeyEvent>
#include <QLabel>
#include <QMouseEvent>
#include <QScreen>
#include <QVBoxLayout>
#include <QWheelEvent>
#include <algorithm>

#include "CirSim.h"
#include "core/CircuitElm.h"
#include "core/JsMath.h"

WheelPopup::WheelPopup(CirSim *sim) : QFrame(nullptr, Qt::Popup | Qt::FramelessWindowHint), sim(sim) {
    setAttribute(Qt::WA_DeleteOnClose);
    setObjectName("wheelPopup");
    setStyleSheet("QFrame#wheelPopup { background: #f8f8f8; border: 1px solid #bbb; }"
                  "QLabel { color: black; font-size: 13px; }");
    setMouseTracking(true);
    layout = new QVBoxLayout(this);
    layout->setContentsMargins(8, 4, 8, 4);
    layout->setSpacing(0);
}

double WheelPopup::normalizeWheelDelta(QWheelEvent *e) {
    // browsers report deltaY in pixels, positive = scroll down; Qt reports angle in
    // eighths of a degree (120 per notch), positive = scroll up
    double deltaY = !e->pixelDelta().isNull() ? -e->pixelDelta().y() : -e->angleDelta().y() * 100.0 / 120.0;
    return jsmath::round(deltaY * 0.12);
}

QLabel *WheelPopup::addLabel(const QString &style) {
    QLabel *l = new QLabel("---", this);
    l->setAlignment(Qt::AlignCenter);
    l->setStyleSheet(style);
    l->setMinimumWidth(80);
    layout->addWidget(l);
    return l;
}

void WheelPopup::place(QPoint globalPos, double fx, double fy) {
    adjustSize();
    int w = width(), h = height();
    int left = globalPos.x() - (int) (w * fx);
    int top = globalPos.y() - (int) (h * fy);
    if (QScreen *scr = QGuiApplication::screenAt(globalPos)) {
        QRect r = scr->availableGeometry();
        left = std::max(r.left(), std::min(left, r.right() - w));
        top = std::max(r.top(), std::min(top, r.bottom() - h));
    }
    move(left, top);
}

void WheelPopup::close(bool keepChanges) {
    if (closed)
        return;
    closed = true;
    if (!keepChanges)
        revert();
    QFrame::close();
    sim->repaint();
}

void WheelPopup::wheelEvent(QWheelEvent *e) {
    e->accept();
    doDeltaY(normalizeWheelDelta(e));
}

void WheelPopup::mousePressEvent(QMouseEvent *e) {
    close(e->button() == Qt::LeftButton || e->button() == Qt::MiddleButton);
}

void WheelPopup::mouseMoveEvent(QMouseEvent *e) {
    // a popup gets mouse moves even outside itself; leaving it is like 'mouseout'
    if (!rect().contains(e->position().toPoint()))
        close(true);
}

void WheelPopup::keyPressEvent(QKeyEvent *e) {
    int key = e->key();
    if (key == Qt::Key_Escape || key == Qt::Key_Space)
        close(false);
    else if (key == Qt::Key_Return || key == Qt::Key_Enter)
        close(true);
}

void WheelPopup::hideEvent(QHideEvent *e) {
    // hidden by something else (e.g. the app being deactivated): keep the change
    if (!closed)
        close(true);
    QFrame::hideEvent(e);
}

// ---- ScrollValuePopup ----

static const double e12[] = {1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2};

ScrollValuePopup::ScrollValuePopup(QPoint globalPos, double dy, CircuitElm *elm, CirSim *sim)
    : WheelPopup(sim), myElm(elm) {
    sim->pushUndo();
    setupValues();

    QLabel *nameLabel = addLabel("font-weight: bold; margin-bottom: 2px;");
    nameLabel->setText(QString::fromStdString(name));
    for (int i = 0; i < labMax; i++)
        labels.push_back(addLabel(i == 2 ? "font-size: 17px; font-weight: bold; "
                                           "border-top: 1px solid black; border-bottom: 1px solid black;"
                                  : (i == 1 || i == 3) ? "color: darkgray;"
                                                       : "font-size: 10px; color: lightgray;"));

    doDeltaY(dy);
    // the selected value (4th of 6 rows) goes under the pointer
    place(globalPos, .25, 7 / 12.);
    show();
}

void ScrollValuePopup::setupValues() {
    if (myElm->isResistorElm()) {
        minpow = -1;
        maxpow = 7;
    }
    if (myElm->isCapacitorElm()) {
        minpow = -11;
        maxpow = -3;
    }
    if (myElm->isInductorElm()) {
        minpow = -6;
        maxpow = 0;
    }
    values.assign(2 + (maxpow - minpow) * 12, 0);
    int ptr = 0;
    for (int i = minpow; i <= maxpow; i++) {
        int jmax = (i != maxpow) ? 12 : 1;
        for (int j = 0; j < jmax; j++, ptr++)
            values[ptr] = jsmath::pow(10.0, i) * e12[j];
    }
    nvalues = ptr;
    values[nvalues] = 1e99;
    inf = *myElm->getEditInfo(0);
    double currentvalue = inf.value;
    for (int i = 0; i < nvalues + 1; i++) {
        if (CircuitElm::getShortUnitText(currentvalue, "") == CircuitElm::getShortUnitText(values[i], "")) {
            // match to an existing value
            values[i] = currentvalue;  // just in case it isn't 100% identical
            currentidx = i;
            break;
        }
        if (currentvalue < values[i]) {
            // overshot - need to insert value
            currentidx = i;
            for (int j = nvalues - 1; j >= i; j--)
                values[j + 1] = values[j];
            values[i] = currentvalue;
            nvalues++;
            break;
        }
    }
    name = inf.name;
    lastidx = currentidx;
}

void ScrollValuePopup::setupLabels() {
    int thissel = getSelIdx();
    for (int i = 0; i < labMax; i++) {
        int idx = thissel + i - 2;
        if (idx < 0 || idx >= nvalues)
            labels[i]->setText("---");
        else
            labels[i]->setText(QString::fromStdString(CircuitElm::getShortUnitText(values[idx], "")));
    }
}

void ScrollValuePopup::doDeltaY(double dy) {
    // a single wheel event moves at most one step (times the sensitivity).  a mouse wheel
    // notch's pixel delta varies a lot by platform, which otherwise skipped values; small
    // trackpad deltas still accumulate
    dy /= sim->devicePixelRatioF();
    deltaY += std::max((double) -scale, std::min((double) scale, dy));
    setElmValue(getSelIdx());
    setupLabels();
}

void ScrollValuePopup::setElmValue(int i) {
    if (i != lastidx) {
        lastidx = i;
        inf.value = values[i];
        myElm->setEditValue(0, inf);
        sim->needAnalyze();
        sim->repaint();
    }
}

int ScrollValuePopup::getSelIdx() const {
    int r = currentidx + (int) jsmath::round(sim->mouse.wheelSensitivity * deltaY / scale);
    if (r < 0)
        r = 0;
    if (r >= nvalues)
        r = nvalues - 1;
    return r;
}
