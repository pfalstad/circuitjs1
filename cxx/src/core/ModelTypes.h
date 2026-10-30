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
#include <set>
#include <string>
#include <vector>

#include "ModelRegistry.h"

class CircuitXMLDeserializer;
class SimApp;
class XmlElement;

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

// models (of all types) as a model library file, which can be loaded like a circuit.
// Subcircuit models go last, after any element models they might use.
std::string dumpModelLibrary(const std::vector<TypedModel> &models);

// load the models in a model library file and make them global
std::vector<TypedModel> loadModelLibrary(CircuitXMLDeserializer &xml, const XmlElement *root);

// load the persistent models of all types
void loadModelsFromStorage();
