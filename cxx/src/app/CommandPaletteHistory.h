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

#include <QStringList>

// Persists the last few palette command ids (PaletteCommand::id) in localStorage.
// CommandPalette shows them under "Recent" when the filter is empty.
// (CommandPaletteHistory.ts)
class CommandPaletteHistory {
public:
    static constexpr int MAX = 10;
    static constexpr const char *KEY = "commandPaletteHistory";

    static void record(const QString &id);
    static QStringList getRecentIds();
    // Drop ids that no longer exist in CommandPaletteRegistry (e.g. after palette changes).
    static void pruneStale(QStringList &ids);
    static void save(const QStringList &ids);
    static QStringList load();
};
