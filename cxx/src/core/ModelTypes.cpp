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

#include <algorithm>
#include <functional>
#include <iostream>
#include <memory>
#include <set>

#include "CircuitElm.h"
#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "DiodeModel.h"
#include "Locale.h"
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

// the type of the model defined by an XML element with this tag, if it's a model definition
static const ModelType *modelTypeForTag(const std::string &tag) {
    return tag == "ccm" ? &subcircuitModelType() : getElmModelType(tag);
}

namespace {
// models collected by collectAllLocal(), which are no longer in their registries
struct CollectedModels {
    std::vector<TypedModel> models;
    // keeps the (subcircuit) models alive
    std::vector<std::shared_ptr<RegistryModel>> hold;
};
}  // namespace

// run fn with empty local tiers for every model type and return the models it added there (so
// loading definitions doesn't change any existing model).  The previous local models are put back.
static CollectedModels collectAllLocal(const std::function<void()> &fn) {
    std::vector<const ModelType *> types = allModelTypes();
    CollectedModels result;
    std::function<void(size_t)> run = [&](size_t i) {
        if (i == types.size()) {
            fn();
            return;
        }
        for (const std::shared_ptr<RegistryModel> &m : types[i]->registry->anyCollectLocal([&] { run(i + 1); })) {
            result.models.push_back({types[i], m.get()});
            result.hold.push_back(m);
        }
    };
    run(0);
    return result;
}

// the model of the same type and name as tm that's in use here, if tm (a model loaded but not
// registered) has a different definition; tm's name is free if it's null
static RegistryModel *differentModelNamed(const TypedModel &tm) {
    ModelRegistryBase *reg = tm.type->registry;
    RegistryModel *old = reg->anyGet(tm.model->name);
    if (old == nullptr || reg->anySerialize(old) == reg->anySerialize(tm.model))
        return nullptr;
    return old;
}

// names, without duplicates, joined with ", "
static std::string joinNames(const std::vector<TypedModel> &models) {
    std::vector<std::string> names;
    for (const TypedModel &tm : models)
        if (std::find(names.begin(), names.end(), tm.model->name) == names.end())
            names.push_back(tm.model->name);
    std::string s;
    for (const std::string &n : names)
        s += (s.empty() ? "" : ", ") + n;
    return s;
}

// every element below root (not root itself), in document order
static void forEachDescendant(const XmlElement *root, const std::function<void(const XmlElement *)> &fn) {
    for (const auto &child : root->children) {
        fn(child.get());
        forEachDescendant(child.get(), fn);
    }
}

bool usesSubcircuit(SubcircuitModel *model, const std::string &name) {
    std::set<SubcircuitModel *> seen;
    std::function<bool(SubcircuitModel *)> visit = [&](SubcircuitModel *m) -> bool {
        if (seen.count(m) || !m->elmDoc)
            return false;
        seen.insert(m);
        bool found = false;
        std::vector<SubcircuitModel *> inner;
        forEachDescendant(m->elmDoc.get(), [&](const XmlElement *el) {
            if (found || el->tagName != "cc")
                return;
            const std::string *mo = el->getAttribute("mo");
            if (mo == nullptr)
                return;
            if (*mo == name) {
                found = true;
                return;
            }
            if (SubcircuitModelRef im = SubcircuitModel::registry().get(*mo))
                inner.push_back(im.get());
        });
        if (found)
            return true;
        for (SubcircuitModel *im : inner)
            if (visit(im))
                return true;
        return false;
    };
    return visit(model);
}

std::vector<TypedModel> modelDependencies(const TypedModel &tm) {
    std::vector<TypedModel> deps;
    if (tm.type->tag != "ccm")
        return deps;
    SubcircuitModel *sm = static_cast<SubcircuitModel *>(tm.model);
    if (!sm->elmDoc)
        return deps;
    std::set<RegistryModel *> seen;
    auto add = [&](const ModelType *type, const std::string *name) {
        if (name == nullptr || name->empty())
            return;
        RegistryModel *m = type->registry->anyGet(*name);
        if (m != nullptr && m != tm.model && isUserModel(m) && !seen.count(m)) {
            seen.insert(m);
            deps.push_back({type, m});
        }
    };
    const ModelType *subType = &subcircuitModelType();
    const ModelType *pinLayoutType = getElmModelType("plm");
    // (elements are flat, but walk all descendants to include those of embedded definitions)
    forEachDescendant(sm->elmDoc.get(), [&](const XmlElement *el) {
        add(pinLayoutType, el->getAttribute("pl"));
        const std::string *mo = el->getAttribute("mo");
        if (mo == nullptr)
            return;
        if (el->tagName == "cc")
            add(subType, mo);
        else
            // "mo" is the model name for elements that have models (and something else, like a
            // counter's modulus, for a few that don't, which won't match a model)
            for (const ModelType &t : elmModelTypes())
                if (&t != pinLayoutType)
                    add(&t, mo);
    });
    return deps;
}

std::vector<TypedModel> withDependencies(const std::vector<TypedModel> &models, std::optional<ModelScope> scope) {
    std::vector<TypedModel> result = models;
    if (scope == ModelScope::Local)
        return result;
    std::set<RegistryModel *> seen;
    for (const TypedModel &tm : models)
        seen.insert(tm.model);
    std::function<void(const TypedModel &)> visit = [&](const TypedModel &tm) {
        for (const TypedModel &dep : modelDependencies(tm)) {
            if (seen.count(dep.model))
                continue;
            seen.insert(dep.model);
            ModelScope s = dep.type->registry->anyScope(dep.model);
            if (!scope || s == ModelScope::Local || (scope == ModelScope::Persistent && s == ModelScope::Global))
                result.push_back(dep);
            visit(dep);
        }
    };
    for (const TypedModel &tm : models)
        visit(tm);
    return result;
}

std::vector<TypedModel> modelUsers(RegistryModel *model) {
    const ModelType *type = &subcircuitModelType();
    std::vector<TypedModel> result;
    for (RegistryModel *m : type->registry->anyAllModels()) {
        if (!isUserModel(m) || type->registry->anyIsShadowed(m))
            continue;
        TypedModel tm{type, m};
        for (const TypedModel &d : modelDependencies(tm))
            if (d.model == model) {
                result.push_back(tm);
                break;
            }
    }
    return result;
}

static int scopeRank(ModelScope sc) {
    return sc == ModelScope::Local ? 0 : sc == ModelScope::Global ? 1 : 2;
}

std::vector<TypedModel> usersToMove(const std::vector<TypedModel> &models, ModelScope scope) {
    std::vector<TypedModel> result;
    std::set<RegistryModel *> seen;
    for (const TypedModel &tm : models)
        seen.insert(tm.model);
    std::function<void(RegistryModel *)> visit = [&](RegistryModel *model) {
        for (const TypedModel &u : modelUsers(model)) {
            if (seen.count(u.model) || scopeRank(u.type->registry->anyScope(u.model)) <= scopeRank(scope))
                continue;
            seen.insert(u.model);
            result.push_back(u);
            visit(u.model);
        }
    };
    for (const TypedModel &tm : models)
        visit(tm.model);
    return result;
}

bool confirmMoveUsers(SimApp *app, const std::vector<TypedModel> &users, ModelScope scope) {
    if (users.empty())
        return true;
    return app->confirm(Locale::LS("Models that use this will also be made ") + Locale::LS(modelScopeName(scope)) +
                        ": " + joinNames(users) + ". " + Locale::LS("Continue?"));
}

bool confirmReplace(SimApp *app, const std::vector<TypedModel> &models, ModelScope scope) {
    std::vector<TypedModel> replacing;
    for (const TypedModel &tm : models)
        if (tm.type->registry->anyWouldReplace(tm.model, scope))
            replacing.push_back(tm);
    if (replacing.empty())
        return true;
    return app->confirm(Locale::LS("This will replace another model with the same name: ") + joinNames(replacing) +
                        ". " + Locale::LS("Continue?"));
}

std::vector<TypedModel> loadModelLibrary(CircuitXMLDeserializer &xml, const XmlElement *root) {
    // load into empty local tiers so we can tell which models (including nested ones) came
    // from the file, and nothing existing changes before we know what would be replaced
    CollectedModels fromFile = collectAllLocal([&] {
        xml.currentXmlElement = root;
        for (const XmlElement *child : xml.getChildElements()) {
            const ModelType *type = modelTypeForTag(child->tagName);
            if (type == nullptr)
                continue;
            xml.parseChildElement(child);
            type->undump(xml);
        }
    });
    std::vector<TypedModel> loaded;
    std::vector<TypedModel> replacing;
    for (const TypedModel &tm : fromFile.models) {
        if (!tm.type->registry->has(tm.model->name))
            loaded.push_back(tm);
        else if (differentModelNamed(tm))
            replacing.push_back(tm);
    }
    if (!replacing.empty() && xml.app != nullptr &&
        xml.app->confirm(Locale::LS("The library has different versions of models that already exist: ") +
                         joinNames(replacing) + ". " + Locale::LS("Replace them?")))
        loaded.insert(loaded.end(), replacing.begin(), replacing.end());
    // (a model replacing a persistent one stays persistent, updating the saved copy)
    for (const TypedModel &tm : loaded)
        tm.type->registry->anySetScope(tm.model, tm.type->registry->anyIsSaved(tm.model->name) ? ModelScope::Persistent
                                                                                              : ModelScope::Global);
    return loaded;
}

ResolvedPaste resolvePastedModels(SimApp *app, const std::string &text) {
    ResolvedPaste result{text, {}};
    if (text.empty() || text[0] != '<')
        return result;
    std::unique_ptr<XmlElement> root;
    try {
        root = parseXml(text);
    } catch (std::exception &) {
        return result;  // (let the loader report it)
    }
    CircuitXMLDeserializer xml(app);
    std::set<const XmlElement *> drop;
    struct Conflict {
        const XmlElement *node;
        const ModelType *type;
        std::string name;
        RegistryModel *old;
    };
    std::vector<Conflict> conflicts;
    for (const auto &nodePtr : root->children) {
        const XmlElement *node = nodePtr.get();
        const ModelType *type = modelTypeForTag(node->tagName);
        const std::string *name = node->getAttribute("nm");
        if (type == nullptr || name == nullptr || !type->registry->has(*name))
            continue;
        CollectedModels collected = collectAllLocal([&] {
            xml.currentXmlElement = root.get();
            xml.parseChildElement(node);
            type->undump(xml);
        });
        const TypedModel *loaded = nullptr;
        for (const TypedModel &tm : collected.models)
            if (tm.type->registry == type->registry && tm.model->name == *name) {
                loaded = &tm;
                break;
            }
        if (loaded == nullptr)
            continue;
        if (RegistryModel *old = differentModelNamed(*loaded))
            conflicts.push_back({node, type, *name, old});
        else
            drop.insert(node);
    }
    if (!conflicts.empty()) {
        std::vector<std::string> names;
        for (const Conflict &c : conflicts)
            if (std::find(names.begin(), names.end(), c.name) == names.end())
                names.push_back(c.name);
        std::string list;
        for (const std::string &n : names)
            list += (list.empty() ? "" : ", ") + n;
        bool replace = app->confirm(
            Locale::LS("The pasted elements use models that are different from the ones here with the same names: ") +
            list + ".\n" +
            Locale::LS("Replace the existing models? (Otherwise the pasted elements will use the existing ones.)"));
        for (const Conflict &c : conflicts) {
            if (replace)
                result.replaced.push_back({c.type, c.name, c.type->registry->anyScope(c.old)});
            else
                drop.insert(c.node);
        }
    }
    if (drop.empty())
        return result;
    auto &ch = root->children;
    ch.erase(std::remove_if(ch.begin(), ch.end(), [&](const std::unique_ptr<XmlElement> &e) { return drop.count(e.get()) > 0; }),
             ch.end());
    result.text = CircuitXMLSerializer::prettyPrint(root.get());
    return result;
}

std::vector<std::string> finishPastedModels(SimApp *app, const std::vector<PastedModelReplacement> &replaced) {
    for (const PastedModelReplacement &r : replaced) {
        RegistryModel *m = r.type->registry->anyGet(r.name);
        if (m != nullptr && r.scope != ModelScope::Local)
            r.type->registry->anySetScope(m, r.scope);
    }
    std::vector<std::string> refresh;
    if (replaced.empty())
        return refresh;
    app->updateModels();
    for (const PastedModelReplacement &r : replaced)
        if (r.type->tag == "ccm")
            refresh.push_back(r.name);
    return refresh;
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
