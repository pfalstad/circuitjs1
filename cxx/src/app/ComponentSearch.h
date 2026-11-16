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

#include <QLineEdit>
#include <vector>

class CirSim;
class QListWidget;
struct PaletteCommand;

// Always-visible component search field (at the right end of the toolbar; the web
// version puts it in the menu bar, which on macOS isn't part of the window). Typing
// filters the element list directly, so placing a part no longer requires walking
// through Draw -> submenu -> item. Enter or a click selects the placement mode.
//
// The list is fed by CommandPaletteRegistry::componentCommands, i.e. the same
// entries the command palette uses, so labels, translations and the
// class-name keywords stay in sync with the Draw menu automatically.
// (ComponentSearch.ts)
class ComponentSearch : public QLineEdit {
public:
    explicit ComponentSearch(CirSim *app);
    ~ComponentSearch() override;

protected:
    void keyPressEvent(QKeyEvent *e) override;
    void focusInEvent(QFocusEvent *e) override;
    void focusOutEvent(QFocusEvent *e) override;

private:
    static constexpr int MAX_RESULTS = 12;
    static constexpr int LIST_WIDTH = 340;

    void refresh();
    void render(const QString &query);
    void moveSelection(int delta);
    void select(int index);
    void clear();
    void hideList();

    CirSim *app;
    // a separate window below the field, so it can hang over the canvas; it never takes
    // the focus, so typing stays in the field
    QListWidget *list;
    std::vector<PaletteCommand *> results;
    int selected = 0;
};
