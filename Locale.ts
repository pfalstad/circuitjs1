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

// Simplified from util/Locale.java

export class Locale {
    static ohmString = "Ω";
    static muString  = "μ";

    static localizationMap: Map<string, string> = new Map();

    static LS(s: string): string {
        if (s == null)
            return s;

        if (s.length === 0)
            return s;

        const sm = Locale.localizationMap.get(s);
        if (sm != null)
            return sm;

        // use trailing ~ to differentiate strings that are the same in English but need
        // different translations.
        // remove these if there's no translation.
        const ix = s.indexOf('~');
        if (ix !== s.length - 1)
            return s;

        s = s.substring(0, ix);
        const sm2 = Locale.localizationMap.get(s);
        if (sm2 != null)
            return sm2;

        return s;
    }

    static weAreInUS(orCanada: boolean): boolean {
        try {
            const languages = navigator.languages;
            const l = (languages && languages.length > 0 ? languages[0] : navigator.language) || "";
            if (l.length > 2) {
                const region = l.slice(-2).toUpperCase();
                return region === "US" || (region === "CA" && orCanada);
            }
            return false;
        } catch (e) { return false; }
    }

    static weAreInGermany(): boolean {
        try {
            const languages = navigator.languages;
            const l = (languages && languages.length > 0 ? languages[0] : navigator.language) || "";
            return l.toUpperCase().startsWith("DE");
        } catch (e) { return false; }
    }
}
