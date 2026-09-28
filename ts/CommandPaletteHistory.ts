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

import { CommandPaletteRegistry } from "./CommandPaletteRegistry";

// Persists the last few palette command ids (CommandPaletteRegistry.PaletteCommand.id)
// in localStorage. CommandPalette shows them under "Recent" when the filter is empty.
export class CommandPaletteHistory {

    static readonly MAX = 10;
    static readonly KEY = "commandPaletteHistory";

    static record(id: string | null | undefined): void {
        if (id == null || id.length === 0)
            return;
        const ids = CommandPaletteHistory.load();
        const existing = ids.indexOf(id);
        if (existing >= 0)
            ids.splice(existing, 1);
        ids.unshift(id);
        while (ids.length > CommandPaletteHistory.MAX)
            ids.pop();
        CommandPaletteHistory.save(ids);
    }

    static getRecentIds(): string[] {
        const ids = CommandPaletteHistory.load();
        CommandPaletteHistory.pruneStale(ids);
        return ids;
    }

    // Drop ids that no longer exist in CommandPaletteRegistry (e.g. after palette changes).
    static pruneStale(ids: string[]): void {
        let changed = false;
        for (let i = ids.length - 1; i >= 0; i--) {
            if (CommandPaletteRegistry.get(ids[i]) == null) {
                ids.splice(i, 1);
                changed = true;
            }
        }
        if (changed)
            CommandPaletteHistory.save(ids);
    }

    static save(ids: string[]): void {
        try {
            localStorage.setItem(CommandPaletteHistory.KEY, ids.join("\n"));
        } catch (e) {}
    }

    static load(): string[] {
        try {
            const s = localStorage.getItem(CommandPaletteHistory.KEY);
            if (s == null || s.length === 0)
                return [];
            return s.split("\n").filter(p => p.length > 0);
        } catch (e) {
            return [];
        }
    }
}
