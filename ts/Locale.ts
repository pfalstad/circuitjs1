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
import { parseIntStrict } from "./NumberParse";
import { moduleBaseURL } from "./ModuleBase";

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

    // Ported from circuitjs1.java: circuitjs1.language()
    static language(): string {
        const nav = navigator as any;
        if (nav.languages) {
            if (nav.languages.length > 0)
                return nav.languages[0];
            else
                // In Electron, navigator.languages returns an empty array
                return "en-US";
        } else {
            return nav.language || nav.userLanguage;
        }
    }

    // Ported from circuitjs1.java: circuitjs1.convertUnicodeEscapes()
    static convertUnicodeEscapes(input: string): string {
        if (input.indexOf("\\u") < 0)
            return input;
        let result = "";
        const length = input.length;
        let i = 0;

        while (i < length) {
            if (i + 5 < length && input.charAt(i) === '\\' && input.charAt(i + 1) === 'u') {
                // Found a Unicode escape sequence
                const hexCode = input.substring(i + 2, i + 6);
                const codePoint = parseIntStrict(hexCode, 16);
                if (!isNaN(codePoint)) {
                    // Convert hex code to a Unicode character
                    result += String.fromCharCode(codePoint);
                    i += 6;  // Skip past the escape sequence
                } else {
                    // If the hex code is invalid, append as is
                    result += "\\u" + hexCode;
                    i += 6;
                }
            } else {
                // Normal character, just append it
                result += input.charAt(i);
                i++;
            }
        }
        return result;
    }

    // Ported from circuitjs1.java: circuitjs1.processLocale()
    static processLocale(data: string): Map<string, string> {
        const localizationMap = new Map<string, string>();
        const lines = data.split(/\r?\n/);
        for (let i = 0; i !== lines.length; i++) {
            let line = lines[i];
            if (line.length === 0)
                continue;
            if (line.charAt(0) !== '"') {
                console.log("ignoring line in string catalog: " + line);
                continue;
            }
            line = Locale.convertUnicodeEscapes(line);
            const q2 = line.indexOf('"', 1);
            if ((q2 < 0)
                || (line.charAt(q2 + 1) !== '=')
                || (line.charAt(q2 + 2) !== '"')
                || (line.charAt(line.length - 1) !== '"')) {
                console.log("ignoring line in string catalog: " + line);
                continue;
            }
            const str1 = line.substring(1, q2);
            const str2 = line.substring(q2 + 3, line.length - 1);
            localizationMap.set(str1, str2);
        }
        return localizationMap;
    }

    // Ported from circuitjs1.java: circuitjs1.loadLocale()
    static async load(): Promise<void> {
        const qp = new URLSearchParams(window.location.search);
        let lang: string | null = qp.get("lang");
        if (lang == null) {
            let stor: Storage | null = null;
            try {
                stor = window.localStorage;
            } catch (e) {}
            if (stor != null)
                lang = stor.getItem("language");
            if (lang == null)
                lang = Locale.language();
        }

        console.log("got language " + lang);

        // check for Taiwan Chinese. Otherwise, strip the region code
        if (lang.toLowerCase() === "zh-tw" || lang.toLowerCase() === "zh-cht")
            lang = "zh-tw";
        else
            lang = lang.replace(/-.*/, "");

        if (lang.startsWith("en")) {
            // no need to load locale file for English
            Locale.localizationMap = new Map<string, string>();
            return;
        }

        const url = moduleBaseURL + "locale/locale_" + lang + ".txt";
        try {
            const response = await fetch(url);
            if (response.ok) {
                const text = await response.text();
                Locale.localizationMap = Locale.processLocale(text);
            } else {
                console.log("Bad file server response: " + response.statusText);
                // if there was an error in retrieving the
                // language, default to English (empty map)
                Locale.localizationMap = new Map<string, string>();
            }
        } catch (e) {
            console.log("failed file reading", e);
            Locale.localizationMap = new Map<string, string>();
        }
    }
}
