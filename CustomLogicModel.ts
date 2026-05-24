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

export class CustomLogicModel {
    static escape(s: string): string {
        if (s.length === 0)
            return "\\0";
        return s.replace(/\\/g, "\\\\")
                .replace(/\n/g, "\\n")
                .replace(/ /g, "\\s")
                .replace(/\+/g, "\\p")
                .replace(/=/g, "\\q")
                .replace(/#/g, "\\h")
                .replace(/&/g, "\\a")
                .replace(/\r/g, "\\r");
    }

    static unescape(s: string): string {
        if (s === "\\0")
            return "";
        let i = 0;
        while (i < s.length) {
            if (s.charAt(i) === '\\') {
                const c = s.charAt(i + 1);
                if (c === 'n')
                    s = s.substring(0, i) + "\n" + s.substring(i + 2);
                else if (c === 'r')
                    s = s.substring(0, i) + "\r" + s.substring(i + 2);
                else if (c === 's')
                    s = s.substring(0, i) + " " + s.substring(i + 2);
                else if (c === 'p')
                    s = s.substring(0, i) + "+" + s.substring(i + 2);
                else if (c === 'q')
                    s = s.substring(0, i) + "=" + s.substring(i + 2);
                else if (c === 'h')
                    s = s.substring(0, i) + "#" + s.substring(i + 2);
                else if (c === 'a')
                    s = s.substring(0, i) + "&" + s.substring(i + 2);
                else
                    s = s.substring(0, i) + s.substring(i + 1);
            }
            i++;
        }
        return s;
    }

    static clearDumpedFlags(): void {}
}
