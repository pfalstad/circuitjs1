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

// The model types (subcircuit, diode, transistor, ...), for code that handles models of any
// type: the Model Manager, model library files, and loading persistent models.

import { CustomLogicModel } from "./CustomLogicModel";
import { DiodeModel } from "./DiodeModel";
import { RelayModel } from "./RelayModel";
import { TransistorModel } from "./TransistorModel";
import { MosfetModel } from "./MosfetModel";
import { SubcircuitModel } from "./SubcircuitModel";
import { PinLayoutModel } from "./PinLayoutModel";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";
import { HookRegistry } from "./HookRegistry";
import { Locale } from "./Locale";
import { ModelRegistry, type ModelScope, type RegistryModel } from "./ModelRegistry";

export interface ModelType {
    // XML tag of the model's definition
    tag: string;
    registry: ModelRegistry<RegistryModel>;
    // load a definition (as a local model) from the current XML element
    undump: (xml: CircuitXMLDeserializer) => RegistryModel;
    // name of the type of the given model, for display
    typeName: (m: RegistryModel) => string;
}

// the types of models used by elements other than subcircuits
export function elmModelTypes(): ModelType[] {
    return [
        { tag: "dm",  registry: DiodeModel.registry,       undump: (xml) => DiodeModel.undumpModelXml(xml),
          typeName: () => "Diode" },
        { tag: "tm",  registry: TransistorModel.registry,  undump: (xml) => TransistorModel.undumpModelXml(xml),
          typeName: () => "Transistor" },
        { tag: "mm",  registry: MosfetModel.registry,      undump: (xml) => MosfetModel.undumpModelXml(xml),
          typeName: (m) => (m as MosfetModel).isJfet() ? "JFET" : "MOSFET" },
        { tag: "rlm", registry: RelayModel.registry,       undump: (xml) => RelayModel.undumpModelXml(xml),
          typeName: () => "Relay" },
        { tag: "clm", registry: CustomLogicModel.registry, undump: (xml) => CustomLogicModel.undumpModelXml(xml),
          typeName: () => "Custom Logic" },
        { tag: "plm", registry: PinLayoutModel.registry,   undump: (xml) => PinLayoutModel.undumpModelXml(xml),
          typeName: () => "Pin Layout" },
    ];
}

export function subcircuitModelType(): ModelType {
    return { tag: "ccm", registry: SubcircuitModel.registry, undump: (xml) => SubcircuitModel.undumpModelXml(xml),
             typeName: () => "Subcircuit" };
}

export function allModelTypes(): ModelType[] {
    return [subcircuitModelType(), ...elmModelTypes()];
}

export function getElmModelType(tag: string): ModelType | undefined {
    return elmModelTypes().find(t => t.tag === tag);
}

// a model of a known type
export interface TypedModel {
    type: ModelType;
    model: RegistryModel;
}

// models created or loaded by the user, as opposed to built-in ones or ones generated from
// the parameters of old-style elements
export function isUserModel(m: RegistryModel): boolean {
    const f = m as any;
    return !(f.builtIn || f.builtin || f.internal || f.readOnly || f.oldStyle);
}

// models used by elements of the current circuit, including elements inside subcircuits
export function getModelsInUse(): Set<RegistryModel> {
    const used = new Set<RegistryModel>();
    const scan = (list: any[]) => {
        for (const ce of list) {
            if (ce.model) used.add(ce.model);
            if (ce.pinLayout) used.add(ce.pinLayout);
            if (ce.compElmList) scan(ce.compElmList);
        }
    };
    scan(CirSim.theApp.elmList);
    return used;
}

// the user models that a model's elements refer to by name: for a subcircuit, the subcircuits
// and element models (diode, transistor, pin layout, ...) used inside it.  (Not the models
// those refer to; see withDependencies.)
export function modelDependencies(tm: TypedModel): TypedModel[] {
    const doc = (tm.model as SubcircuitModel).elmDoc;
    if (tm.type.tag !== "ccm" || !doc)
        return [];
    const deps = new Map<RegistryModel, TypedModel>();
    const add = (type: ModelType, name: string | null) => {
        const m = name ? type.registry.get(name) : undefined;
        if (m && m !== tm.model && isUserModel(m))
            deps.set(m, { type, model: m });
    };
    const subType = subcircuitModelType();
    const elmTypes = elmModelTypes();
    const pinLayoutType = elmTypes.find(t => t.tag === "plm")!;
    // (elements are flat, but walk all descendants to include those of embedded definitions)
    for (const el of Array.from(doc.documentElement.getElementsByTagName("*"))) {
        add(pinLayoutType, el.getAttribute("pl"));
        const mo = el.getAttribute("mo");
        if (mo === null)
            continue;
        if (el.tagName === "cc")
            add(subType, mo);
        else
            // "mo" is the model name for elements that have models (and something else, like a
            // counter's modulus, for a few that don't, which won't match a model)
            for (const t of elmTypes)
                if (t !== pinLayoutType)
                    add(t, mo);
    }
    return [...deps.values()];
}

// models, plus the models they depend on (directly or indirectly) that have to move with them
// to scope, so that a global model doesn't refer to local models (which are dropped when another
// circuit is loaded) and a persistent one doesn't refer to models that won't be there in the
// next session.  With no scope, all the models they depend on (e.g. to export them together).
export function withDependencies(models: TypedModel[], scope?: ModelScope): TypedModel[] {
    const result = [...models];
    if (scope === "local")
        return result;
    const seen = new Set<RegistryModel>(models.map(tm => tm.model));
    const visit = (tm: TypedModel) => {
        for (const dep of modelDependencies(tm)) {
            if (seen.has(dep.model))
                continue;
            seen.add(dep.model);
            const s = dep.type.registry.scope(dep.model);
            if (!scope || s === "local" || (scope === "persistent" && s === "global"))
                result.push(dep);
            visit(dep);
        }
    };
    models.forEach(visit);
    return result;
}

// if moving any of models to scope would replace a different model with the same name (e.g. a
// global one shadowed by a local one), ask the user.  Returns false if they decline.
export function confirmReplace(models: TypedModel[], scope: ModelScope): boolean {
    const replacing = models.filter(tm => tm.type.registry.wouldReplace(tm.model, scope));
    if (replacing.length === 0)
        return true;
    return window.confirm(Locale.LS("This will replace another model with the same name: ") +
        [...new Set(replacing.map(tm => tm.model.name))].join(", ") + ". " + Locale.LS("Continue?"));
}

// models (of all types) as a model library file, which can be loaded like a circuit.
// Subcircuit models go last, after any element models they might use.
export function dumpModelLibrary(models: TypedModel[]): string {
    const doc = document.implementation.createDocument(null, "cir", null);
    CircuitXMLSerializer.dumpAttr(doc.documentElement, "lib", 1);
    const sorted = [...models.filter(tm => tm.type.tag !== "ccm"), ...models.filter(tm => tm.type.tag === "ccm")];
    for (const tm of sorted)
        tm.type.registry.dumpXml(tm.model, doc);
    return CircuitXMLSerializer.prettyPrint(doc);
}

// the type of the model defined by an XML element with this tag, if it's a model definition
function modelTypeForTag(tag: string): ModelType | undefined {
    return tag === "ccm" ? subcircuitModelType() : getElmModelType(tag);
}

// run fn with empty local tiers for every model type and return the models it added there (so
// loading definitions doesn't change any existing model).  The previous local models are put back.
function collectAllLocal(fn: () => void): TypedModel[] {
    const types = allModelTypes();
    const result: TypedModel[] = [];
    const run = (i: number): void => {
        if (i === types.length) {
            fn();
            return;
        }
        for (const m of types[i].registry.collectLocal(() => run(i + 1)))
            result.push({ type: types[i], model: m });
    };
    run(0);
    return result;
}

// the model of the same type and name as tm that's in use here, if tm (a model loaded but not
// registered) has a different definition; tm's name is free if it's undefined
function differentModelNamed(tm: TypedModel): RegistryModel | undefined {
    const reg = tm.type.registry;
    const old = reg.get(tm.model.name);
    if (!old || reg.serialize(old) === reg.serialize(tm.model))
        return undefined;
    return old;
}

// load the models in a model library file and make them global.  Models identical to existing
// ones are skipped, and if some would replace different models with the same names, the user
// is asked whether to replace those.
export function loadModelLibrary(xml: CircuitXMLDeserializer, root: Element): TypedModel[] {
    // load into empty local tiers so we can tell which models (including nested ones) came
    // from the file, and nothing existing changes before we know what would be replaced
    const fromFile = collectAllLocal(() => {
        xml.currentXmlElement = root;
        for (const child of xml.getChildElements()) {
            const type = modelTypeForTag(child.tagName);
            if (!type) continue;
            xml.parseChildElement(child);
            type.undump(xml);
        }
    });
    const loaded: TypedModel[] = [];
    const replacing: TypedModel[] = [];
    for (const tm of fromFile) {
        if (!tm.type.registry.has(tm.model.name))
            loaded.push(tm);
        else if (differentModelNamed(tm))
            replacing.push(tm);
    }
    if (replacing.length > 0 &&
            window.confirm(Locale.LS("The library has different versions of models that already exist: ") +
                [...new Set(replacing.map(tm => tm.model.name))].join(", ") + ". " + Locale.LS("Replace them?")))
        loaded.push(...replacing);
    for (const tm of loaded)
        tm.type.registry.setScope(tm.model, "global");
    return loaded;
}

// a model replaced by pasting (see resolvePastedModels), and the scope the old one had
export interface PastedModelReplacement {
    type: ModelType;
    name: string;
    scope: ModelScope;
}

// Before pasting text (a clipboard), deal with its model definitions whose names are already
// used here: definitions identical to the existing models are dropped (so pasting doesn't add
// copies), and if some are different, the user is asked whether to replace the existing models.
// If not, those definitions are dropped too, so the pasted elements use the existing models.
// Returns the text to paste and the models being replaced (see finishPastedModels).
export function resolvePastedModels(text: string): { text: string, replaced: PastedModelReplacement[] } {
    if (!text.startsWith("<"))
        return { text, replaced: [] };
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const root = doc.documentElement;
    const xml = new CircuitXMLDeserializer(CirSim.theApp);
    const drop: Element[] = [];
    const conflicts: { node: Element, type: ModelType, name: string, old: RegistryModel }[] = [];
    for (const node of Array.from(root.children)) {
        const type = modelTypeForTag(node.tagName);
        const name = node.getAttribute("nm");
        if (!type || name === null || !type.registry.has(name))
            continue;
        const loaded = collectAllLocal(() => {
            xml.currentXmlElement = root;
            xml.parseChildElement(node);
            type.undump(xml);
        }).find(tm => tm.type.registry === type.registry && tm.model.name === name);
        if (!loaded)
            continue;
        const old = differentModelNamed(loaded);
        if (old)
            conflicts.push({ node, type, name, old });
        else
            drop.push(node);
    }
    const replaced: PastedModelReplacement[] = [];
    if (conflicts.length > 0) {
        const replace = window.confirm(
            Locale.LS("The pasted elements use models that are different from the ones here with the same names: ") +
            [...new Set(conflicts.map(c => c.name))].join(", ") + ".\n" +
            Locale.LS("Replace the existing models? (Otherwise the pasted elements will use the existing ones.)"));
        for (const c of conflicts) {
            if (replace)
                replaced.push({ type: c.type, name: c.name, scope: c.type.registry.scope(c.old) });
            else
                drop.push(c.node);
        }
    }
    if (drop.length === 0)
        return { text, replaced };
    for (const node of drop)
        node.remove();
    return { text: new XMLSerializer().serializeToString(doc), replaced };
}

// after pasting, put the models that replaced existing ones (see resolvePastedModels) in the
// replaced models' scopes, since a pasted definition loads as a local model (and would otherwise
// shadow a global one), and make the elements that used the old models use the new ones
export function finishPastedModels(replaced: PastedModelReplacement[]): void {
    for (const r of replaced) {
        const m = r.type.registry.get(r.name);
        if (m && r.scope !== "local")
            r.type.registry.setScope(m, r.scope);
    }
    if (replaced.length === 0)
        return;
    CirSim.theApp.updateModels();
    for (const r of replaced)
        if (r.type.tag === "ccm")
            CirSim.theApp.refreshModels(r.name);
}

// load the persistent models of all types
export function loadModelsFromStorage(): void {
    for (const type of elmModelTypes()) {
        type.registry.loadFromStorage((data) => {
            try {
                const root = new DOMParser().parseFromString(data, "text/xml").documentElement;
                if (root.tagName !== type.tag) return;
                const xml = new CircuitXMLDeserializer(CirSim.theApp);
                xml.currentXmlElement = root;
                type.registry.makeGlobal(type.undump(xml));
            } catch (e) {
                CirSim.console("Exception: " + e);
            }
        });
    }
    SubcircuitModel.loadModelsFromStorage();
}

// load the element classes that the stored subcircuit models are made of, since ones
// saved in the old text format build their elements when they're loaded
export async function loadModelClasses(): Promise<void> {
    await CirSim.loadClassesFor(SubcircuitModel.registry.storedData().join("\n"));
}

HookRegistry.loadModelsFromStorage = () => loadModelsFromStorage();
HookRegistry.loadModelClasses = () => loadModelClasses();
