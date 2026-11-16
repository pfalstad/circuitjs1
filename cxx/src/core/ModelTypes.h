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

#pragma once

#include <functional>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "ModelRegistry.h"

class CircuitXMLDeserializer;
class SimApp;
class XmlElement;
class SubcircuitModel;

struct ModelType {
    // XML tag of the model's definition
    std::string tag;
    ModelRegistryBase *registry;
    // load a definition (as a local model) from the current XML element
    std::function<RegistryModel *(CircuitXMLDeserializer &xml)> undump;
    // name of the type of the given model, for display
    std::function<std::string(RegistryModel *m)> typeName;
};

// the types of models used by elements other than subcircuits
const std::vector<ModelType> &elmModelTypes();
const ModelType &subcircuitModelType();
std::vector<const ModelType *> allModelTypes();
const ModelType *getElmModelType(const std::string &tag);

// a model of a known type
struct TypedModel {
    const ModelType *type;
    RegistryModel *model;
};

// models created or loaded by the user, as opposed to built-in ones or ones generated from
// the parameters of old-style elements
inline bool isUserModel(const RegistryModel *m) { return m->isUserModel(); }

// models used by elements of the current circuit, including elements inside subcircuits
std::set<RegistryModel *> getModelsInUse(SimApp *app);

// whether a subcircuit model's elements use a subcircuit named name, directly or inside the
// subcircuits they use (looked up by name, as the elements would)
bool usesSubcircuit(SubcircuitModel *model, const std::string &name);

// the user models that a model's elements refer to by name: for a subcircuit, the subcircuits
// and element models (diode, transistor, pin layout, ...) used inside it.  (Not the models
// those refer to; see withDependencies.)
std::vector<TypedModel> modelDependencies(const TypedModel &tm);

// models, plus the models they depend on (directly or indirectly) that have to move with them
// to scope, so that a global model doesn't refer to local models (which are dropped when another
// circuit is loaded) and a persistent one doesn't refer to models that won't be there in the
// next session.  With no scope, all the models they depend on (e.g. to export them together).
std::vector<TypedModel> withDependencies(const std::vector<TypedModel> &models,
                                         std::optional<ModelScope> scope = std::nullopt);

// the subcircuit models whose elements use model (directly).  (Not shadowed ones, which
// elements can't get by name.)
std::vector<TypedModel> modelUsers(RegistryModel *model);

// the models that use models (directly or indirectly) and would have to move with them to scope
// because they're more global than that (the reverse of withDependencies), e.g. a persistent
// subcircuit using one that's being made local, which would be missing in the next session
std::vector<TypedModel> usersToMove(const std::vector<TypedModel> &models, ModelScope scope);

// ask whether the models that use the ones being moved (see usersToMove) may move to scope too.
// Returns false if they decline.
bool confirmMoveUsers(SimApp *app, const std::vector<TypedModel> &users, ModelScope scope);

// if moving any of models to scope would replace a different model with the same name (e.g. a
// global one shadowed by a local one), ask the user.  Returns false if they decline.
bool confirmReplace(SimApp *app, const std::vector<TypedModel> &models, ModelScope scope);

// models (of all types) as a model library file, which can be loaded like a circuit.
// Subcircuit models go last, after any element models they might use.
std::string dumpModelLibrary(const std::vector<TypedModel> &models);

// load the models in a model library file and make them global.  Models identical to existing
// ones are skipped, and if some would replace different models with the same names, the user
// is asked whether to replace those.
std::vector<TypedModel> loadModelLibrary(CircuitXMLDeserializer &xml, const XmlElement *root);

// a model replaced by pasting (see resolvePastedModels), and the scope the old one had
struct PastedModelReplacement {
    const ModelType *type;
    std::string name;
    ModelScope scope;
};

struct ResolvedPaste {
    std::string text;
    std::vector<PastedModelReplacement> replaced;
};

// Before pasting text (a clipboard), deal with its model definitions whose names are already
// used here: definitions identical to the existing models are dropped (so pasting doesn't add
// copies), and if some are different, the user is asked whether to replace the existing models.
// If not, those definitions are dropped too, so the pasted elements use the existing models.
// Returns the text to paste and the models being replaced (see finishPastedModels).
ResolvedPaste resolvePastedModels(SimApp *app, const std::string &text);

// after pasting, put the models that replaced existing ones (see resolvePastedModels) in the
// replaced models' scopes, since a pasted definition loads as a local model (and would otherwise
// shadow a global one), and make the elements that used the old models use the new ones.
// Returns the names of the replaced subcircuit models, whose instances need refreshing.
std::vector<std::string> finishPastedModels(SimApp *app, const std::vector<PastedModelReplacement> &replaced);

// load the persistent models of all types
void loadModelsFromStorage();
