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

// Menu item shortcuts are stored as a single char, and sim.shortcuts maps that char
// code to the class name it adds.
//
// A plain, unmodified printable key (letters, digits, punctuation) still uses its own
// char code exactly as before, matched via the browser's keypress event (which gives us
// the actual typed character, so it's layout-aware and naturally distinguishes e.g. 'c'
// from Shift-'c' == 'C').
//
// Everything else -- function keys, Home/End/etc. (which never generate a keypress event
// at all), and any key combined with Ctrl, Alt, and/or Meta (which normally suppress the
// keypress event too) -- is matched instead via the keydown event's native keyCode plus
// modifier state, encoded into a placeholder char code starting at PLACEHOLDER_BASE
// (chosen well above the printable-ASCII range so it can never collide with a plain
// printable-character shortcut). displayName()/displayText() turn that back into a
// readable label like "F3" or "Ctrl-C" for the UI.
export class KeyNames {
    private static readonly PLACEHOLDER_BASE = 300;
    private static readonly KEYCODE_BITS = 8; // native keyCodes fit comfortably in 8 bits

    static readonly MOD_SHIFT = 1;
    static readonly MOD_CTRL  = 2;
    static readonly MOD_ALT   = 4;
    static readonly MOD_META  = 8;
    private static readonly MOD_MASK = KeyNames.MOD_SHIFT | KeyNames.MOD_CTRL | KeyNames.MOD_ALT | KeyNames.MOD_META;

    private static readonly isMac = typeof navigator !== "undefined" &&
        navigator.platform.toLowerCase().includes("mac");

    // keys that never generate a keypress event on their own, even with no modifiers held
    private static readonly NONPRINTING_KEYCODES = [
        36, 35, 33, 34, 45, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123
    ];

    private static isNonPrinting(keyCode: number): boolean {
        for (let i = 0; i !== KeyNames.NONPRINTING_KEYCODES.length; i++)
            if (KeyNames.NONPRINTING_KEYCODES[i] === keyCode)
                return true;
        return false;
    }

    // the modifier keys themselves (Shift, Ctrl, Alt, various Meta/Windows/Cmd key codes) --
    // pressing one of these alone (before the "real" key that goes with it) isn't a shortcut
    private static isModifierKeyCode(keyCode: number): boolean {
        switch (keyCode) {
        case 16: case 17: case 18: case 91: case 92: case 93: case 224:
            return true;
        }
        return false;
    }

    // true if a keydown for this key/modifier combo should be matched right away via
    // keyCode (rather than waiting to see if a keypress event follows)
    private static usesKeyCodePath(keyCode: number, ctrl: boolean, alt: boolean, meta: boolean): boolean {
        if (KeyNames.isModifierKeyCode(keyCode))
            return false;
        return ctrl || alt || meta || KeyNames.isNonPrinting(keyCode);
    }

    // encodes a keyCode + modifier state from a keydown event into a placeholder char code,
    // or -1 if this key/modifier combo should go through the ordinary keypress-based path
    // instead (a plain printable character with no Ctrl/Alt/Meta held)
    static keyCodeToPlaceholder(keyCode: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): number {
        if (!KeyNames.usesKeyCodePath(keyCode, ctrl, alt, meta))
            return -1;
        const mods = (shift ? KeyNames.MOD_SHIFT : 0) | (ctrl ? KeyNames.MOD_CTRL : 0) |
            (alt ? KeyNames.MOD_ALT : 0) | (meta ? KeyNames.MOD_META : 0);
        return KeyNames.PLACEHOLDER_BASE + keyCode + (mods << KeyNames.KEYCODE_BITS);
    }

    private static keyLabel(keyCode: number): string {
        switch (keyCode) {
        case 36: return "Home";
        case 35: return "End";
        case 33: return "Page Up";
        case 34: return "Page Down";
        case 45: return "Insert";
        case 112: return "F1";
        case 113: return "F2";
        case 114: return "F3";
        case 115: return "F4";
        case 116: return "F5";
        case 117: return "F6";
        case 118: return "F7";
        case 119: return "F8";
        case 120: return "F9";
        case 121: return "F10";
        case 122: return "F11";
        case 123: return "F12";
        case 186: return ";";
        case 187: return "=";
        case 188: return ",";
        case 189: return "-";
        case 190: return ".";
        case 191: return "/";
        case 192: return "`";
        case 219: return "[";
        case 220: return "\\";
        case 221: return "]";
        case 222: return "'";
        }
        if (keyCode >= 65 && keyCode <= 90)  // A-Z
            return String.fromCharCode(keyCode);
        if (keyCode >= 48 && keyCode <= 57)  // 0-9
            return String.fromCharCode(keyCode);
        return "Key" + keyCode;
    }

    // display name for a placeholder char code, or null if c isn't one of ours
    static displayName(c: number): string | null {
        const code = c - KeyNames.PLACEHOLDER_BASE;
        if (code < 0)
            return null;
        const keyCode = code & ((1 << KeyNames.KEYCODE_BITS) - 1);
        const mods = code >> KeyNames.KEYCODE_BITS;
        if ((mods & ~KeyNames.MOD_MASK) !== 0)
            return null;
        let sb = "";
        if ((mods & KeyNames.MOD_CTRL) !== 0)
            sb += "Ctrl-";
        if ((mods & KeyNames.MOD_ALT) !== 0)
            sb += KeyNames.isMac ? "Opt-" : "Alt-";
        if ((mods & KeyNames.MOD_META) !== 0)
            sb += KeyNames.isMac ? "Cmd-" : "Win-";
        if ((mods & KeyNames.MOD_SHIFT) !== 0)
            sb += "Shift-";
        sb += KeyNames.keyLabel(keyCode);
        return sb;
    }

    // text to show in the UI for a stored (single-char) shortcut string
    static displayText(shortcut: string | null): string | null {
        if (shortcut == null || shortcut.length !== 1)
            return shortcut;
        if (shortcut.charAt(0) === ' ')
            return "Space";
        const name = KeyNames.displayName(shortcut.charCodeAt(0));
        return name != null ? name : shortcut;
    }
}
