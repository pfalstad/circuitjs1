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

package com.lushprojects.circuitjs1.client;

import com.google.gwt.storage.client.Storage;

import java.util.Vector;

// Persists the last few palette command ids (CommandPaletteRegistry.PaletteCommand.id)
// in localStorage. CommandPalette shows them under "Recent" when the filter is empty.
public class CommandPaletteHistory {

    static final int MAX = 10;
    static final String KEY = "commandPaletteHistory";

    static void record(String id) {
        if (id == null || id.isEmpty())
            return;
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        Vector<String> ids = load();
        for (int i = 0; i != ids.size(); i++) {
            if (ids.get(i).equals(id)) {
                ids.remove(i);
                break;
            }
        }
        ids.insertElementAt(id, 0);
        while (ids.size() > MAX)
            ids.removeElementAt(ids.size() - 1);
        save(ids);
    }

    static Vector<String> getRecentIds() {
        Vector<String> ids = load();
        pruneStale(ids);
        return ids;
    }

    // Drop ids that no longer exist in CommandPaletteRegistry (e.g. after palette changes).
    static void pruneStale(Vector<String> ids) {
        int i;
        boolean changed = false;
        for (i = ids.size() - 1; i >= 0; i--) {
            if (CommandPaletteRegistry.get(ids.get(i)) == null) {
                ids.remove(i);
                changed = true;
            }
        }
        if (changed)
            save(ids);
    }

    static void save(Vector<String> ids) {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i != ids.size(); i++) {
            if (i > 0)
                sb.append('\n');
            sb.append(ids.get(i));
        }
        stor.setItem(KEY, sb.toString());
    }

    static Vector<String> load() {
        Vector<String> ids = new Vector<String>();
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return ids;
        String s = stor.getItem(KEY);
        if (s == null || s.length() == 0)
            return ids;
        String[] parts = s.split("\n");
        for (int i = 0; i != parts.length; i++) {
            if (parts[i].length() > 0)
                ids.add(parts[i]);
        }
        return ids;
    }
}
