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
#include "core/Scrollbar.h"

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
    QVBoxLayout *v = layout = new QVBoxLayout(this);
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

// the widgets for one slider
struct SliderWidget {
    QLabel *label;
    QSlider *slider;
};

void Sidebar::addSlider(Scrollbar *sb) {
    SliderWidget *w = new SliderWidget;
    w->label = new QLabel(QString::fromStdString(Locale::LS(sb->label)));
    w->label->setWordWrap(true);
    w->slider = new QSlider(Qt::Horizontal);
    // before the stretch at the end
    int at = layout->count() - 1;
    layout->insertSpacing(at++, 8);
    layout->insertWidget(at++, w->label);
    layout->insertWidget(at, w->slider);
    sb->widget = w;
    updateSlider(sb);
    connect(w->slider, &QSlider::valueChanged, this, [sb](int val) { sb->userSetValue(val); });
}

void Sidebar::removeSlider(Scrollbar *sb) {
    SliderWidget *w = static_cast<SliderWidget *>(sb->widget);
    if (w == nullptr)
        return;
    // the spacing item is just before the label
    int i = layout->indexOf(w->label);
    if (i > 0) {
        QLayoutItem *spacer = layout->itemAt(i - 1);
        if (spacer->spacerItem() != nullptr) {
            layout->removeItem(spacer);
            delete spacer;
        }
    }
    delete w->label;
    delete w->slider;
    delete w;
    sb->widget = nullptr;
}

void Sidebar::updateSlider(Scrollbar *sb) {
    SliderWidget *w = static_cast<SliderWidget *>(sb->widget);
    if (w == nullptr)
        return;
    QSignalBlocker block(w->slider);
    w->label->setText(QString::fromStdString(Locale::LS(sb->label)));
    w->slider->setRange(sb->getMin(), sb->getMax());
    int step = sb->getStepSize() > 0 ? std::max(1, (int) std::lround(sb->getStepSize())) : 1;
    w->slider->setSingleStep(step);
    w->slider->setPageStep(std::max(step, (sb->getMax() - sb->getMin()) / 10));
    w->slider->setValue(sb->getValue());
    w->slider->setEnabled(sb->isEnabled());
}
