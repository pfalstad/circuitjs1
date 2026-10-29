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
import { ModelRegistry, type RegistryModel } from "./ModelRegistry";

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

// load the models in a model library file and make them global
export function loadModelLibrary(xml: CircuitXMLDeserializer, root: Element): TypedModel[] {
    const loaded: TypedModel[] = [];
    // load subcircuits into an empty local map so we can tell which ones (including nested
    // ones) came from the file
    const subType = subcircuitModelType();
    const subs = subType.registry.collectLocal(() => {
        xml.currentXmlElement = root;
        for (const child of xml.getChildElements()) {
            xml.parseChildElement(child);
            if (child.tagName === "ccm") {
                subType.undump(xml);
                continue;
            }
            const type = getElmModelType(child.tagName);
            if (!type) continue;
            const m = type.undump(xml);
            type.registry.setScope(m, "global");
            loaded.push({ type, model: m });
        }
    });
    for (const m of subs) {
        subType.registry.setScope(m, "global");
        loaded.push({ type: subType, model: m });
    }
    return loaded;
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

HookRegistry.loadModelsFromStorage = () => loadModelsFromStorage();
