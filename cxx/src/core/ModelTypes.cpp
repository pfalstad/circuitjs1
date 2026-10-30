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

#include "ModelTypes.h"

#include <functional>
#include <iostream>

#include "CircuitElm.h"
#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "DiodeModel.h"
#include "MosfetModel.h"
#include "PinLayoutModel.h"
#include "RelayModel.h"
#include "SimApp.h"
#include "SubcircuitModel.h"
#include "TransistorModel.h"
#include "XmlDoc.h"
#include "../elements/ChipElm.h"

const std::vector<ModelType> &elmModelTypes() {
    static const std::vector<ModelType> types = {
        {"dm", &DiodeModel::registry(), [](CircuitXMLDeserializer &xml) -> RegistryModel * { return DiodeModel::undumpModelXml(xml); },
         [](RegistryModel *) -> std::string { return "Diode"; }},
        {"tm", &TransistorModel::registry(), [](CircuitXMLDeserializer &xml) -> RegistryModel * { return TransistorModel::undumpModelXml(xml); },
         [](RegistryModel *) -> std::string { return "Transistor"; }},
        {"mm", &MosfetModel::registry(), [](CircuitXMLDeserializer &xml) -> RegistryModel * { return MosfetModel::undumpModelXml(xml); },
         [](RegistryModel *m) -> std::string { return static_cast<MosfetModel *>(m)->isJfet() ? "JFET" : "MOSFET"; }},
        {"rlm", &RelayModel::registry(), [](CircuitXMLDeserializer &xml) -> RegistryModel * { return RelayModel::undumpModelXml(xml); },
         [](RegistryModel *) -> std::string { return "Relay"; }},
        {"clm", &CustomLogicModel::registry(), [](CircuitXMLDeserializer &xml) -> RegistryModel * { return CustomLogicModel::undumpModelXml(xml); },
         [](RegistryModel *) -> std::string { return "Custom Logic"; }},
        {"plm", &PinLayoutModel::registry(), [](CircuitXMLDeserializer &xml) -> RegistryModel * { return PinLayoutModel::undumpModelXml(xml); },
         [](RegistryModel *) -> std::string { return "Pin Layout"; }},
    };
    return types;
}

const ModelType &subcircuitModelType() {
    static const ModelType type = {"ccm", &SubcircuitModel::registry(),
                                   [](CircuitXMLDeserializer &xml) -> RegistryModel * { return SubcircuitModel::undumpModelXml(xml).get(); },
                                   [](RegistryModel *) -> std::string { return "Subcircuit"; }};
    return type;
}

std::vector<const ModelType *> allModelTypes() {
    std::vector<const ModelType *> types = {&subcircuitModelType()};
    for (const ModelType &t : elmModelTypes())
        types.push_back(&t);
    return types;
}

const ModelType *getElmModelType(const std::string &tag) {
    for (const ModelType &t : elmModelTypes())
        if (t.tag == tag)
            return &t;
    return nullptr;
}

std::set<RegistryModel *> getModelsInUse(SimApp *app) {
    std::set<RegistryModel *> used;
    std::function<void(std::vector<CircuitElm *> &)> scan = [&](std::vector<CircuitElm *> &list) {
        for (CircuitElm *ce : list) {
            if (RegistryModel *m = ce->getModel())
                used.insert(m);
            if (ChipElm *chip = dynamic_cast<ChipElm *>(ce); chip != nullptr && chip->pinLayout != nullptr)
                used.insert(chip->pinLayout);
            if (std::vector<CircuitElm *> *children = ce->getChildElmList())
                scan(*children);
        }
    };
    scan(app->elmList);
    return used;
}

std::string dumpModelLibrary(const std::vector<TypedModel> &models) {
    XmlElement root("cir");
    CircuitXMLSerializer::dumpAttr(&root, "lib", 1);
    std::vector<TypedModel> sorted;
    for (const TypedModel &tm : models)
        if (tm.type->tag != "ccm")
            sorted.push_back(tm);
    for (const TypedModel &tm : models)
        if (tm.type->tag == "ccm")
            sorted.push_back(tm);
    for (const TypedModel &tm : sorted)
        tm.type->registry->anyDumpXml(tm.model, &root);
    return CircuitXMLSerializer::prettyPrint(&root);
}

std::vector<TypedModel> loadModelLibrary(CircuitXMLDeserializer &xml, const XmlElement *root) {
    std::vector<TypedModel> loaded;
    // load subcircuits into an empty local map so we can tell which ones (including nested
    // ones) came from the file
    const ModelType &subType = subcircuitModelType();
    std::vector<RegistryModel *> subs = subType.registry->anyCollectLocal([&] {
        xml.currentXmlElement = root;
        for (const XmlElement *child : xml.getChildElements()) {
            xml.parseChildElement(child);
            if (child->tagName == "ccm") {
                subType.undump(xml);
                continue;
            }
            const ModelType *type = getElmModelType(child->tagName);
            if (type == nullptr)
                continue;
            RegistryModel *m = type->undump(xml);
            type->registry->anySetScope(m, ModelScope::Global);
            loaded.push_back({type, m});
        }
    });
    for (RegistryModel *m : subs) {
        subType.registry->anySetScope(m, ModelScope::Global);
        loaded.push_back({&subType, m});
    }
    return loaded;
}

void loadModelsFromStorage() {
    for (const ModelType &type : elmModelTypes()) {
        type.registry->loadFromStorage([&type](const std::string &data) {
            try {
                std::unique_ptr<XmlElement> root = parseXml(data);
                if (root->tagName != type.tag)
                    return;
                CircuitXMLDeserializer xml(nullptr);
                xml.currentXmlElement = root.get();
                type.registry->anyMakeGlobal(type.undump(xml));
            } catch (std::exception &e) {
                std::cerr << "Exception: " << e.what() << "\n";
            }
        });
    }
    SubcircuitModel::loadModelsFromStorage();
}
