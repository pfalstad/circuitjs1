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

#include "CommandPaletteHistory.h"

#include "CommandPaletteRegistry.h"
#include "core/Storage.h"

void CommandPaletteHistory::record(const QString &id) {
    if (id.isEmpty())
        return;
    QStringList ids = load();
    ids.removeAll(id);
    ids.prepend(id);
    while (ids.size() > MAX)
        ids.removeLast();
    save(ids);
}

QStringList CommandPaletteHistory::getRecentIds() {
    QStringList ids = load();
    pruneStale(ids);
    return ids;
}

void CommandPaletteHistory::pruneStale(QStringList &ids) {
    bool changed = false;
    for (int i = ids.size() - 1; i >= 0; i--) {
        if (CommandPaletteRegistry::get(ids[i]) == nullptr) {
            ids.removeAt(i);
            changed = true;
        }
    }
    if (changed)
        save(ids);
}

void CommandPaletteHistory::save(const QStringList &ids) {
    if (Storage::localStorage)
        Storage::localStorage->setItem(KEY, ids.join("\n").toStdString());
}

QStringList CommandPaletteHistory::load() {
    if (!Storage::localStorage)
        return {};
    std::optional<std::string> s = Storage::localStorage->getItem(KEY);
    if (!s || s->empty())
        return {};
    return QString::fromStdString(*s).split("\n", Qt::SkipEmptyParts);
}
