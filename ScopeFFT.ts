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

// Stub — to be implemented from ScopeFFT.java
import { Graphics } from "./Graphics";
import type { Scope } from "./Scope";

export class ScopeFFT {
    scope: Scope;
    enabled: boolean = false;
    logSpectrum: boolean = false;
    showPhaseAngle: boolean = false;

    constructor(scope: Scope) {
        this.scope = scope;
    }

    show(b: boolean): void { this.enabled = b; }
    draw(g: Graphics): void {}
    drawVerticalGridLines(g: Graphics): void {}
    addCursorInfo(info: string[], ct: number, x: number): number { return ct; }
}
