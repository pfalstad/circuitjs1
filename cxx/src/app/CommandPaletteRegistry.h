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

#include <QPointer>
#include <QString>
#include <functional>
#include <map>
#include <memory>
#include <vector>

class CirSim;
class QAction;

struct PaletteCommand {
    QString id;        // stable key for history, e.g. "edit:undo" or "circuits:555.txt"
    QString label;
    QString category;
    QString keywords;  // extra text for fuzzy matching (class names, shortcuts, etc.)
    // the menu item this runs (the TS version passes menu/item strings to
    // CommandManager.menuPerformed instead)
    QPointer<QAction> action;
    std::function<void()> custom;  // for actions that aren't menu items
    QString hint;      // secondary label on the right (e.g. Circuits submenu name)

    QString searchText() const { return (label + " " + category + " " + keywords).toLower(); }
};

// Static catalog of searchable palette commands. Most entries are existing menu items.
// Example circuits from setuplist.txt are registered separately via registerCircuit().
// (CommandPaletteRegistry.ts)
class CommandPaletteRegistry {
public:
    static std::vector<PaletteCommand *> commands;
    // Kept separate so hundreds of example circuits don't appear until the user types
    // at least MIN_CIRCUIT_QUERY_LEN characters.
    static std::vector<PaletteCommand *> circuitCommands;

    static constexpr int MIN_CIRCUIT_QUERY_LEN = 2;

    static void clear();
    static void addCommand(std::unique_ptr<PaletteCommand> cmd);
    // a menu item, found by its (untranslated) menu text; skipped if there's no such item
    static void add(CirSim *app, const QString &id, const char *name, const QString &category,
                    const QString &keywords);
    static PaletteCommand *get(const QString &id);

    // Called after CirSim::createMenus(), so the menu items exist.
    static void buildStatic(CirSim *app);
    // Called from CirSim::createCircuitsMenu() for each circuit entry in setuplist.txt.
    static void registerCircuit(const QString &file, const QString &title, const QString &submenuPath,
                                QAction *action);

    static int fuzzyScore(const QString &query, const PaletteCommand *cmd);
    static std::vector<PaletteCommand *> search(const QString &query, int maxResults);
    static std::vector<PaletteCommand *> recentCommands();
    // Returns HTML with matched portions wrapped in <b> (label is escaped).
    static QString highlightMatch(const QString &label, const QString &query);

private:
    static std::map<QString, std::unique_ptr<PaletteCommand>> byId;
};
