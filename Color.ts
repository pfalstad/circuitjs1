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

export class Color {
    static readonly white     = new Color(255, 255, 255);
    static readonly lightGray = new Color(192, 192, 192);
    static readonly gray      = new Color(128, 128, 128);
    static readonly GRAY      = new Color(128, 128, 128);
    static readonly dark_gray = new Color(64, 64, 64);
    static readonly darkGray  = new Color(64, 64, 64);
    static readonly black     = new Color(0, 0, 0);
    static readonly red       = new Color(255, 0, 0);
    static readonly pink      = new Color(255, 175, 175);
    static readonly orange    = new Color(255, 200, 0);
    static readonly yellow    = new Color(255, 255, 0);
    static readonly green     = new Color(0, 255, 0);
    static readonly magenta   = new Color(255, 0, 255);
    static readonly cyan      = new Color(0, 255, 255);
    static readonly blue      = new Color(0, 0, 255);
    static readonly NONE      = new Color("");

    private r: number = 0;
    private g: number = 0;
    private b: number = 0;
    private colorText: string | null = null;

    constructor(colorText: string);
    constructor(c1: Color, c2: Color, mix: number);
    constructor(r: number, g: number, b: number);
    constructor(arg0: string | Color | number, arg1?: Color | number, arg2?: number) {
        if (typeof arg0 === "string") {
            this.colorText = arg0;
            if (arg0.startsWith("#") && arg0.length === 7) {
                this.r = parseIntStrict(arg0.substring(1, 3), 16);
                this.g = parseIntStrict(arg0.substring(3, 5), 16);
                this.b = parseIntStrict(arg0.substring(5, 7), 16);
            }
        } else if (arg0 instanceof Color) {
            const c1 = arg0;
            const c2 = arg1 as Color;
            const mix = arg2 as number;
            const m0 = 1 - mix;
            this.r = Math.trunc(c1.r * m0 + c2.r * mix);
            this.g = Math.trunc(c1.g * m0 + c2.g * mix);
            this.b = Math.trunc(c1.b * m0 + c2.b * mix);
        } else {
            this.r = arg0;
            this.g = arg1 as number;
            this.b = arg2 as number;
        }
    }

    getRed(): number   { return this.r; }
    getGreen(): number { return this.g; }
    getBlue(): number  { return this.b; }

    getHexValue(): string {
        if (this.colorText !== null)
            return this.colorText;
        return "#" + this.pad(this.r.toString(16))
                   + this.pad(this.g.toString(16))
                   + this.pad(this.b.toString(16));
    }

    private pad(s: string): string {
        if (s.length === 0) return "00";
        if (s.length === 1) return "0" + s;
        return s;
    }

    toString(): string {
        if (this.colorText !== null)
            return this.colorText;
        return "red=" + this.r + ", green=" + this.g + ", blue=" + this.b;
    }
}
