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

// Stub — to be implemented from ScopePlot2d.java
import { Graphics } from "./Graphics";
import type { Scope } from "./Scope";

export class ScopePlot2d {
    enabled: boolean = false;
    plotXY: boolean = false;
    plotX: number = 0;
    plotY: number = 1;
    plotBrightness: number = -1;
    plotColorR: number = -1;
    plotColorG: number = -1;
    plotColorB: number = -1;
    scaleX: number = 5;
    scaleY: number = 0.1;
    static readonly DEFAULT_TRAIL_PERSISTENCE: number = 0;
    trailPersistence: number = 0;
    lastTrailSimTime: number = -1;

    scope: Scope;

    constructor(scope: Scope) {
        this.scope = scope;
    }

    draw(g: Graphics): void {}
    timeStep(): void {}
    allocImage(): void {}
    clearView(): void {}
    maxScale(): void {}

    validPlotIndex(idx: number, def: number): number {
        return idx >= 0 && idx < this.scope.plots.length ? idx : def;
    }
}
