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

#include "Sidebar.h"

#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QSlider>
#include <QVBoxLayout>

#include "CirSim.h"
#include "core/Locale.h"

static QString LS(const char *s) { return QString::fromStdString(Locale::LS(s)); }

static QSlider *makeSlider(int value, int min, int max) {
    QSlider *s = new QSlider(Qt::Horizontal);
    s->setRange(min, max);
    s->setValue(value);
    s->setPageStep((max - min) / 10);
    return s;
}

Sidebar::Sidebar(CirSim *a) : QWidget(a), app(a) {
    setFixedWidth(WIDTH);
    QVBoxLayout *v = new QVBoxLayout(this);
    v->setContentsMargins(6, 6, 6, 6);
    v->setSpacing(4);

    // make buttons side by side
    QHBoxLayout *buttons = new QHBoxLayout();
    buttons->setSpacing(4);
    resetButton = new QPushButton(LS("Reset"));
    runStopButton = new QPushButton();
    buttons->addWidget(resetButton);
    buttons->addWidget(runStopButton, 1);
    v->addLayout(buttons);
    connect(resetButton, &QPushButton::clicked, this, [this] { app->resetAction(); });
    connect(runStopButton, &QPushButton::clicked, this, [this] { app->setSimRunning(!app->simIsRunning()); });

    QPushButton *openButton = new QPushButton(LS("Open File..."));
    v->addWidget(openButton);
    connect(openButton, &QPushButton::clicked, this, [this] { app->openFile(); });

    auto addLabel = [&](const QString &text) {
        QLabel *l = new QLabel(text);
        v->addSpacing(8);
        v->addWidget(l);
        return l;
    };

    // was max of 140
    addLabel(LS("Simulation Speed"));
    speedBar = makeSlider(app->speedBarValue, 0, 260);
    v->addWidget(speedBar);
    connect(speedBar, &QSlider::valueChanged, this, [this](int val) { app->speedBarValue = val; });

    addLabel(LS("Current Speed"));
    currentBar = makeSlider(app->currentBarValue, 1, 100);
    v->addWidget(currentBar);
    connect(currentBar, &QSlider::valueChanged, this, [this](int val) { app->currentBarValue = val; });

    powerLabel = addLabel(LS("Power Brightness"));
    powerBar = makeSlider(app->powerBarValue, 1, 100);
    v->addWidget(powerBar);
    connect(powerBar, &QSlider::valueChanged, this, [this](int val) {
        app->powerBarValue = val;
        app->repaint();
    });

    addLabel(LS("Current Circuit:"));
    titleLabel = new QLabel();
    titleLabel->setWordWrap(true);
    v->addWidget(titleLabel);

    v->addStretch(1);
    sync();
}

void Sidebar::sync() {
    QSignalBlocker b1(speedBar), b2(currentBar), b3(powerBar);
    speedBar->setValue(app->speedBarValue);
    currentBar->setValue(app->currentBarValue);
    powerBar->setValue(app->powerBarValue);
    setPowerBarEnable(app->options.power);
    setSimRunning(app->simIsRunning());
}

void Sidebar::setSimRunning(bool running) {
    if (running) {
        runStopButton->setText(LS("RUN / Stop"));
        runStopButton->setStyleSheet("");
    } else {
        runStopButton->setText(LS("Run / STOP"));
        runStopButton->setStyleSheet("QPushButton { background-color: #ff0000; color: white; "
                                     "border: 1px solid #a0a0a0; border-radius: 4px; padding: 4px 6px; }");
    }
}

void Sidebar::setPowerBarEnable(bool enabled) {
    powerLabel->setEnabled(enabled);
    powerBar->setEnabled(enabled);
}

void Sidebar::setCircuitTitle(const QString &title) {
    titleLabel->setText(title);
}

QString Sidebar::circuitTitle() const {
    return titleLabel->text();
}
