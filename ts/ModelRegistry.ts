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

// where a model lives (see ModelRegistry)
export type ModelScope = "local" | "global" | "persistent";

// appends a model's XML element to doc's root element.  (Declared with method syntax so a
// registry of a specific model type can be used as a ModelRegistry<RegistryModel>.)
type DumpModelXml<T> = { dump(m: T, doc: Document): void }["dump"];

// what every model type has in common
export interface RegistryModel {
    name: string;
    // set when the model has been written to the current dump, so it's only written once
    dumped: boolean;
}

// The set of models of one type (diode, transistor, subcircuit, ...), by name.
//
// Models live in one of two tiers:
//   global: available to every circuit this session (built-in models, models saved in
//           local storage, and, for most model types, models loaded from circuit files)
//   local:  belong to the current circuit and are cleared when another circuit is loaded
// A local model shadows a global one with the same name.
//
// Built-in models are added by the init function, which runs the first time the registry
// is used.  If a storage prefix and an XML dump function are given, global models can also be
// persistent: saved in local storage (under prefix + name) so they're available across
// sessions.  Loading them is up to the model type, since only it knows the format.
export class ModelRegistry<T extends RegistryModel> {
    // every registry, so they can be cleared together
    private static readonly all: ModelRegistry<RegistryModel>[] = [];

    readonly globalMap = new Map<string, T>();
    localMap = new Map<string, T>();
    // local models registered only because a subcircuit model's definition includes them
    // (see markEmbedded())
    private readonly embedded = new WeakSet<T>();
    // bumped on every change to the set of models, so menus listing them know to rebuild
    sequenceNumber: number = 0;
    private initialized = false;

    constructor(private readonly init: (() => void) | null = null,
                readonly storagePrefix: string | null = null,
                private readonly dumpModelXml: DumpModelXml<T> | null = null) {
        ModelRegistry.all.push(this);
    }

    // clear the local models of every type, when another circuit is loaded
    static clearAllLocal(): void {
        for (const reg of ModelRegistry.all)
            reg.clearLocal();
    }

    // clear the dumped flags of every type, before dumping
    static clearAllDumpedFlags(): void {
        for (const reg of ModelRegistry.all)
            reg.clearDumpedFlags();
    }

    // write the local models of every type that haven't been written yet (because no element
    // uses them), since local models belong to the circuit
    static dumpAllUnusedLocal(doc: Document): void {
        for (const reg of ModelRegistry.all)
            reg.dumpUnusedLocal(doc);
    }

    private ensureInit(): void {
        if (this.initialized)
            return;
        this.initialized = true;
        this.init?.();
    }

    // drop all models; built-ins are added again on next use
    reset(): void {
        this.globalMap.clear();
        this.localMap.clear();
        this.initialized = false;
        this.sequenceNumber++;
    }

    get(name: string): T | undefined {
        this.ensureInit();
        return this.localMap.get(name) ?? this.globalMap.get(name);
    }

    has(name: string): boolean {
        return this.get(name) !== undefined;
    }

    hasGlobal(name: string): boolean {
        this.ensureInit();
        return this.globalMap.has(name);
    }

    hasLocal(name: string): boolean {
        this.ensureInit();
        return this.localMap.has(name);
    }

    isLocal(m: T): boolean {
        this.ensureInit();
        return this.localMap.get(m.name) === m;
    }

    isGlobal(m: T): boolean {
        this.ensureInit();
        return this.globalMap.get(m.name) === m;
    }

    // add (or replace) a model in the global tier, under its name
    setGlobal(m: T): void {
        this.ensureInit();
        this.globalMap.set(m.name, m);
        this.sequenceNumber++;
    }

    // add (or replace) a model in the local tier, under its name
    setLocal(m: T): void {
        this.ensureInit();
        this.localMap.set(m.name, m);
        this.sequenceNumber++;
    }

    removeGlobal(name: string): void {
        this.ensureInit();
        if (this.globalMap.delete(name))
            this.sequenceNumber++;
    }

    removeLocal(name: string): void {
        this.ensureInit();
        if (this.localMap.delete(name))
            this.sequenceNumber++;
    }

    // remove a model name from both tiers
    remove(name: string): void {
        this.removeLocal(name);
        this.removeGlobal(name);
    }

    // rename a model, keeping it in the same tier.  A model not in the registry yet is added
    // to the local tier (unless the name is empty).
    rename(m: T, name: string): void {
        this.ensureInit();
        const local = this.isLocal(m), global = !local && this.isGlobal(m);
        if (local)
            this.localMap.delete(m.name);
        else if (global)
            this.globalMap.delete(m.name);
        const saved = this.isSaved(m.name);
        if (saved)
            this.unsave(m.name);
        m.name = name;
        if (name)
            (global ? this.globalMap : this.localMap).set(name, m);
        if (saved && name)
            this.store(m);
        this.sequenceNumber++;
    }

    // the model to load a definition of the given name into: the local one if there is one,
    // otherwise a new local model.  A global model of the same name is shadowed, not modified.
    getForLoad(name: string, create: () => T): T {
        this.ensureInit();
        const lm = this.localMap.get(name);
        if (lm) {
            this.embedded.delete(lm);
            return lm;
        }
        const m = create();
        m.name = name;
        this.setLocal(m);
        return m;
    }

    // move a model to the global tier, replacing any model with the same name in either tier
    makeGlobal(m: T): void {
        this.removeLocal(m.name);
        this.setGlobal(m);
    }

    // move a model to the local tier, replacing any local model with the same name
    makeLocal(m: T): void {
        if (this.isGlobal(m))
            this.removeGlobal(m.name);
        this.setLocal(m);
    }

    // mark a local model as registered only because a subcircuit model's definition includes
    // it, so it isn't written with the circuit unless an element uses it; the subcircuit
    // model's definition already has it.  Loading it from the circuit itself clears the mark.
    markEmbedded(m: T): void {
        this.embedded.add(m);
    }

    // write local models not already written, except embedded ones
    dumpUnusedLocal(doc: Document): void {
        if (!this.dumpModelXml)
            return;
        for (const m of this.localMap.values()) {
            if (m.dumped || !m.name || this.embedded.has(m))
                continue;
            this.dumpModelXml(m, doc);
            m.dumped = true;
        }
    }

    scope(m: T): ModelScope {
        if (this.isLocal(m))
            return "local";
        return this.isSaved(m.name) ? "persistent" : "global";
    }

    // move a model to the given scope.  Making a persistent model global leaves it persistent,
    // but updates the saved copy.
    setScope(m: T, scope: ModelScope): void {
        if (scope === "local") {
            this.unsave(m.name);
            this.makeLocal(m);
            return;
        }
        this.makeGlobal(m);
        if (scope === "persistent" || this.isSaved(m.name))
            this.store(m);
    }

    // remove a model, including any saved copy
    delete(m: T): void {
        this.unsave(m.name);
        this.remove(m.name);
    }

    // run fn with an empty local tier and return the models it added there; the previous
    // local models are put back afterwards
    collectLocal(fn: () => void): T[] {
        this.ensureInit();
        const oldLocalMap = this.localMap;
        const collected = new Map<string, T>();
        this.localMap = collected;
        try {
            fn();
        } finally {
            this.localMap = oldLocalMap;
        }
        return [...collected.values()];
    }

    clearLocal(): void {
        this.localMap.clear();
        this.sequenceNumber++;
    }

    // all models, with local ones shadowing global ones of the same name
    models(): T[] {
        this.ensureInit();
        const merged = new Map<string, T>(this.globalMap);
        for (const [k, v] of this.localMap)
            merged.set(k, v);
        return [...merged.values()];
    }

    clearDumpedFlags(): void {
        for (const m of this.globalMap.values())
            m.dumped = false;
        for (const m of this.localMap.values())
            m.dumped = false;
    }

    // base if it isn't taken, otherwise base-2, base-3, ...
    uniqueName(base: string): string {
        if (!this.has(base))
            return base;
        for (let num = 2; ; num++) {
            const n = base + "-" + num;
            if (!this.has(n))
                return n;
        }
    }

    // local storage, for models saved across sessions

    private storageKey(name: string): string {
        return this.storagePrefix! + name;
    }

    canSave(): boolean {
        return this.storagePrefix !== null && this.dumpModelXml !== null && typeof localStorage !== "undefined";
    }

    isSaved(name: string): boolean {
        if (!this.canSave() || !name)
            return false;
        return localStorage.getItem(this.storageKey(name)) !== null;
    }

    // save a model in local storage
    store(m: T): void {
        if (this.canSave())
            localStorage.setItem(this.storageKey(m.name), this.serialize(m));
    }

    // update the saved copy of a model if it has one, after it's been changed
    resave(m: T): void {
        if (this.isSaved(m.name))
            this.store(m);
    }

    unsave(name: string): void {
        if (this.canSave())
            localStorage.removeItem(this.storageKey(name));
    }

    // append the model's XML element to doc's root element
    dumpXml(m: T, doc: Document): void {
        const dumped = m.dumped;
        this.dumpModelXml!(m, doc);
        m.dumped = dumped;
    }

    // the model as an XML string
    serialize(m: T): string {
        const doc = document.implementation.createDocument(null, "models", null);
        this.dumpXml(m, doc);
        return new XMLSerializer().serializeToString(doc.documentElement.firstElementChild!);
    }

    // call load(data) for each model saved in local storage
    loadFromStorage(load: (data: string) => void): void {
        for (const data of this.storedData())
            load(data);
    }

    // what's saved in storage for each stored model
    storedData(): string[] {
        if (!this.canSave())
            return [];
        const stor = window.localStorage;
        if (stor === null)
            return [];
        // collect keys first, since loading may change storage
        const keys: string[] = [];
        for (let i = 0; i < stor.length; i++) {
            const key = stor.key(i);
            if (key && key.startsWith(this.storagePrefix!))
                keys.push(key);
        }
        const data: string[] = [];
        for (const key of keys) {
            const d = stor.getItem(key);
            if (d)
                data.push(d);
        }
        return data;
    }
}
