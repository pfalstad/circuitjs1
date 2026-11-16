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

#pragma once

#include <memory>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "ModelRegistry.h"
#include "XmlDoc.h"

class CircuitXMLDeserializer;
class StringTokenizer;

struct ExtListEntry {
    std::string name;
    int node = 0;
    int pos = 0;
    int side = 2;  // ChipElm::SIDE_W
    int busWidth = 1;
    int busZ = 0;

    ExtListEntry(std::string n, int nd) : name(std::move(n)), node(nd) {}
    ExtListEntry(std::string n, int nd, int p, int s) : name(std::move(n)), node(nd), pos(p), side(s) {}
};

class SubcircuitModel;
using SubcircuitModelRef = std::shared_ptr<SubcircuitModel>;

// model for subcircuits
class SubcircuitModel : public std::enable_shared_from_this<SubcircuitModel>, public RegistryModel {
public:
    // models loaded from circuit files are local; models saved in storage (or made global by
    // the user) are global
    static ModelRegistry<SubcircuitModel, SubcircuitModelRef> &registry();

    int flags = 0;
    int sizeX = 0;
    int sizeY = 0;
    std::vector<ExtListEntry> extList;
    // XML tree storing child element definitions (TS: elmDoc, a document with root "elms")
    std::unique_ptr<XmlElement> elmDoc;
    std::optional<std::string> modelCircuit;
    bool internal = false;  // don't show in list
    bool builtin = false;   // included by default, don't allow deletion

    // changes whenever the set of models changes
    static int sequenceNumber() { return registry().sequenceNumber; }
    static constexpr int FLAG_SHOW_LABEL = 1;

    void setName(const std::string &n);
    static void loadModelsFromStorage();
    static SubcircuitModelRef getModelWithName(const std::string &name);
    // create model from old-style nodeList/elmDump format, converting to XML immediately
    static SubcircuitModelRef createModelFromOldFormat(const std::string &name, const std::string &elmDump,
                                                       const std::string &nodeList, const std::vector<ExtListEntry> &extList);
    // create model with XML element doc already built
    static SubcircuitModelRef createModel(const std::string &name, std::unique_ptr<XmlElement> elmDoc,
                                          const std::vector<ExtListEntry> &extList);
    static std::vector<SubcircuitModelRef> getModelList();
    static SubcircuitModelRef undumpModel(StringTokenizer &st);
    void undump(StringTokenizer &st);
    // convert old-style nodeList/elmDump strings to XML element tree
    void convertOldFormatToXml(const std::string &nodeList, const std::string &elmDump);
    bool isSaved();
    void setSaved(bool sv);
    static void loadModelFromStorage(const std::string &data);
    bool showLabel() const { return (flags & FLAG_SHOW_LABEL) != 0; }
    bool isBuiltin() const { return builtin; }
    bool isUserModel() const override { return !(builtin || internal); }
    void setShowLabel(bool sl) { flags = sl ? (flags | FLAG_SHOW_LABEL) : (flags & ~FLAG_SHOW_LABEL); }
    // check if all bus entries have consecutive node numbers so we can use compact format
    bool busNodesConsecutive();
    // build XML attributes and children into the given element
    void buildXmlElement(XmlElement *elem);
    void dumpXml(XmlElement *root);
    static SubcircuitModelRef undumpModelXml(CircuitXMLDeserializer &xml);
    // register a model definition embedded in another model (a nested subcircuit), unless a model
    // with that name already exists.  The embedded copy is a snapshot taken when the outer model
    // was created, so it may be stale; it must never overwrite a model that instances are using.
    static void undumpEmbeddedModelXml(CircuitXMLDeserializer &xml);
    // register an element model definition embedded in a subcircuit model as the subcircuit is
    // built, unless a model with that name exists.  The definitions are registered when the
    // subcircuit model is loaded, but as local models; a global subcircuit model outlives them.
    // Returns false if elm isn't an element model definition.
    static bool undumpEmbeddedElmModelXml(CircuitXMLDeserializer &xml, const XmlElement *elm);
    // parse XML attributes and children from deserializer
    void parseXmlElement(CircuitXMLDeserializer &xml);
    void undumpXml(CircuitXMLDeserializer &xml) { parseXmlElement(xml); }
    // child elements from elmDoc for use by loadCompositeXml
    std::vector<const XmlElement *> getElmEntries() const;
    // reconstruct old-format nodeList string from XML (for loadComposite compatibility)
    std::string getNodeList() const;
    bool canLoadModelCircuit() const;
    void remove();
    // replace a model in whichever map it lives in.  A global model replaces any local
    // copy with the same name (e.g. a stale one reloaded from a saved editing context).
    static void replaceModel(const SubcircuitModelRef &model);
    static void loadInternalModels();

private:
    // add the built-in models (called by the registry when first used)
    static void initModelMap();
    // the model to load a definition into (see ModelRegistry.getForLoad)
    static SubcircuitModelRef getModelForLoad(const std::string &name);
};
