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

import { StringTokenizer } from "./StringTokenizer";

// Constructor signatures for the two creation patterns used throughout the codebase
type ElmCtor = {
    new(x: number, y: number): any;
    new(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer): any;
};

export class ElementFactory {
    private static classMap: Map<string, ElmCtor> = new Map();

    // Register a class so create() can find it by name
    static registerClass(name: string, ctor: ElmCtor): void {
        ElementFactory.classMap.set(name, ctor);
    }

    // Create element placed at (x1,y1) — used when user places a new element
    static create(name: string, x1: number, y1: number): any;
    // Create element from saved/loaded dump — used when loading a circuit file
    static create(name: string, x1: number, y1: number, x2: number, y2: number, f: number, st: StringTokenizer): any;
    static create(name: string, x1: number, y1: number, x2?: number, y2?: number, f?: number, st?: StringTokenizer): any {
        const ctor = ElementFactory.classMap.get(name);
        if (ctor == null) return null;
        if (x2 === undefined)
            return new ctor(x1, y1);
        return new ctor(x1, y1, x2, y2!, f!, st!);
    }

    static hasClass(name: string): boolean {
        return ElementFactory.classMap.has(name);
    }
}
