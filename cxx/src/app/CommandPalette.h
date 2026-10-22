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

class CirSim;
class QLineEdit;
class QListWidget;
struct PaletteCommand;

// Command palette popup (VS Code / Sublime style). Opened via double-tap Shift, /, the
// toolbar's search button, Edit > Find Component/Command..., or a user-assigned shortcut.
// A Qt::Popup, so clicking outside it closes it, like the overlay in the web version.
// (CommandPalette.ts)
class CommandPalette : public QFrame {
public:
    static constexpr int WIDTH = 520;
    static constexpr int MAX_RESULTS = 50;
    static constexpr int MAX_LIST_HEIGHT = 360;

    explicit CommandPalette(CirSim *sim);
    void show();
    void moveSelection(int delta);
    void executeSelected();
    static void execute(PaletteCommand *cmd);

protected:
    bool eventFilter(QObject *o, QEvent *e) override;

private:
    void onFilterTextChanged();
    void refreshList();
    void addSectionLabel(const QString &text);
    void addCommandRow(PaletteCommand *cmd, const QString &query);
    void updateSelectionHighlight();
    void fitList();

    CirSim *sim;
    QLineEdit *filterBox;
    QListWidget *listPanel;
    std::vector<PaletteCommand *> visibleCommands;
    std::vector<int> commandRows;  // listPanel row of each visible command
    int selectedIndex = 0;
    QString lastQuery;
};
