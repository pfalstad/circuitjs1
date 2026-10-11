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

#include "OrderedMap.h"
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
class SubcircuitModel : public std::enable_shared_from_this<SubcircuitModel> {
public:
    static OrderedMap<SubcircuitModelRef> globalModelMap;
    static OrderedMap<SubcircuitModelRef> localModelMap;

    int flags = 0;
    int sizeX = 0;
    int sizeY = 0;
    std::string name;
    std::vector<ExtListEntry> extList;
    // XML tree storing child element definitions (TS: elmDoc, a document with root "elms")
    std::unique_ptr<XmlElement> elmDoc;
    std::optional<std::string> modelCircuit;
    bool dumped = false;
    bool internal = false;  // don't show in list
    bool builtin = false;   // included by default, don't allow deletion

    static int sequenceNumber;
    static constexpr int FLAG_SHOW_LABEL = 1;

    void setName(const std::string &n);
    static void initModelMap();
    static SubcircuitModelRef getModelWithName(const std::string &name);
    // create model from old-style nodeList/elmDump format, converting to XML immediately
    static SubcircuitModelRef createModelFromOldFormat(const std::string &name, const std::string &elmDump,
                                                       const std::string &nodeList, const std::vector<ExtListEntry> &extList);
    static void clearDumpedFlags();
    static std::vector<SubcircuitModelRef> getModelList();
    static SubcircuitModelRef undumpModel(StringTokenizer &st);
    void undump(StringTokenizer &st);
    // convert old-style nodeList/elmDump strings to XML element tree
    void convertOldFormatToXml(const std::string &nodeList, const std::string &elmDump);
    // where this model lives: local to the current circuit or global (TODO: persistent)
    std::string getScope();
    // names of models used by subcircuits in the given circuit, including nested ones
    static std::set<std::string> getModelNamesInUse(const std::vector<class CircuitElm *> &elmList);
    // move model to the global map, replacing any local or global model with the same name
    void makeGlobal();
    // move model to the local map so it belongs only to the current circuit
    void makeLocal();
    // dump models as a subcircuit library file, which can be loaded like a circuit
    static std::string dumpLibrary(const std::vector<SubcircuitModelRef> &models);
    // load models from a subcircuit library file and make them global
    static std::vector<SubcircuitModelRef> loadLibrary(CircuitXMLDeserializer &xml, const XmlElement *root);
    bool showLabel() const { return (flags & FLAG_SHOW_LABEL) != 0; }
    bool isBuiltin() const { return builtin; }
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
    // dump local models not already dumped (i.e. not used by any element), since local
    // models belong to the circuit and would otherwise be lost when it is reloaded
    static void dumpUnusedLocalModels(XmlElement *root);
    static void clearLocalModels();
    static void loadInternalModels();
};
