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

class CirSim;
class QLabel;
class QPushButton;
class QSlider;
class QVBoxLayout;
class Scrollbar;

// the panel on the right: run/stop, reset, speed sliders, circuit title
// (the verticalPanel in UIManager.ts)
class Sidebar : public QWidget {
public:
    static constexpr int WIDTH = 166;

    explicit Sidebar(CirSim *app);

    // refresh controls from the app's state (after loading a circuit, etc.)
    void sync();
    void setSimRunning(bool running);
    void setPowerBarEnable(bool enabled);
    void setCircuitTitle(const QString &title);
    QString circuitTitle() const;

    // the circuit's sliders (Adjustable, VarRailElm, etc.), added at the bottom like the
    // TS version's addWidgetToVerticalPanel()
    void addSlider(Scrollbar *sb);
    void removeSlider(Scrollbar *sb);
    void updateSlider(Scrollbar *sb);

private:
    CirSim *app;
    QPushButton *resetButton;
    QPushButton *runStopButton;
    QSlider *speedBar;
    QSlider *currentBar;
    QSlider *powerBar;
    QLabel *powerLabel;
    QLabel *titleLabel;
    QVBoxLayout *layout;
};
