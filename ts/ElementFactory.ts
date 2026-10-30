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
export type ElmCtor = {
    new(x: number, y: number): any;
    new(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer): any;
};

// An element class that isn't loaded until a circuit or the user needs it.  Its module is
// split into its own chunk; until load() is called the factory only knows its name.
export interface LazyElementClass {
    name: string;
    load: () => Promise<ElmCtor>;
    // other lazy classes it creates by name (e.g. in a CompositeElm model string)
    deps: string[];
    // what CirSim.register() would learn from an instance
    dumpType: number;
    xmlDumpType: string;
    dumpClass: string;
    shortcut: number;
}

export class ElementFactory {
    private static classMap: Map<string, ElmCtor> = new Map();
    private static lazyMap: Map<string, LazyElementClass> = new Map();
    private static loading: Map<string, Promise<void>> = new Map();

    // Register a class so create() can find it by name
    static registerClass(name: string, ctor: ElmCtor): void {
        ElementFactory.classMap.set(name, ctor);
    }

    // Register a class that create() can't find until ensureLoaded() has loaded it
    static registerLazyClass(lazy: LazyElementClass): void {
        ElementFactory.lazyMap.set(lazy.name, lazy);
    }

    static getLazyClass(name: string): LazyElementClass | undefined {
        return ElementFactory.lazyMap.get(name);
    }

    static lazyClassNames(): string[] {
        return [...ElementFactory.lazyMap.keys()];
    }

    // the classes among names (and the ones they depend on) that still have to be loaded
    static missing(names: Iterable<string>): string[] {
        const need = new Set<string>();
        const visit = (name: string) => {
            if (need.has(name) || ElementFactory.classMap.has(name))
                return;
            const lazy = ElementFactory.lazyMap.get(name);
            if (lazy == null)
                return;
            need.add(name);
            lazy.deps.forEach(visit);
        };
        for (const name of names)
            visit(name);
        return [...need];
    }

    // load the named classes (and the ones they depend on) so create() can find them.
    // Names that aren't element classes are ignored.  If a class fails to load (a network
    // error, say), it's left unloaded so the next call tries again.
    static async ensureLoaded(names: Iterable<string>): Promise<void> {
        await Promise.all(ElementFactory.missing(names).map(name => {
            let p = ElementFactory.loading.get(name);
            if (p == null) {
                p = ElementFactory.lazyMap.get(name)!.load().then(
                    ctor => ElementFactory.registerClass(name, ctor),
                    err => { ElementFactory.loading.delete(name); throw err; });
                ElementFactory.loading.set(name, p);
            }
            return p;
        }));
    }

    // Create element placed at (x1,y1) — used when user places a new element
    static create(name: string, x1: number, y1: number): any;
    // Create element from saved/loaded dump — used when loading a circuit file
    static create(name: string, x1: number, y1: number, x2: number, y2: number, f: number, st: StringTokenizer): any;
    static create(name: string, x1: number, y1: number, x2?: number, y2?: number, f?: number, st?: StringTokenizer): any {
        const ctor = ElementFactory.classMap.get(name);
        if (ctor == null) {
            if (ElementFactory.lazyMap.has(name))
                console.error("element class " + name + " used before it was loaded");
            return null;
        }
        if (x2 === undefined)
            return new ctor(x1, y1);
        return new ctor(x1, y1, x2, y2!, f!, st!);
    }

    static hasClass(name: string): boolean {
        return ElementFactory.classMap.has(name);
    }
}
