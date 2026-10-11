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

#include "SubcircuitModel.h"

#include <algorithm>
#include <functional>
#include <iostream>

#include "CircuitElm.h"
#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "DiodeModel.h"
#include "ElementFactory.h"
#include "JsNumber.h"
#include "MosfetModel.h"
#include "RelayModel.h"
#include "StringTokenizer.h"
#include "TransistorModel.h"
#include "../elements/GroundElm.h"
#include "../elements/SubcircuitElm.h"

OrderedMap<SubcircuitModelRef> SubcircuitModel::globalModelMap;
OrderedMap<SubcircuitModelRef> SubcircuitModel::localModelMap;
int SubcircuitModel::sequenceNumber = 0;

static SubcircuitModelRef lookup(OrderedMap<SubcircuitModelRef> &map, const std::string &name) {
    SubcircuitModelRef *m = map.get(name);
    return m ? *m : nullptr;
}

void SubcircuitModel::setName(const std::string &n) {
    SubcircuitModelRef self = shared_from_this();
    if (localModelMap.erase(name)) {
        name = n;
        localModelMap.set(name, self);
    } else {
        globalModelMap.erase(name);
        name = n;
        globalModelMap.set(name, self);
    }
    sequenceNumber++;
}

void SubcircuitModel::initModelMap() {
    globalModelMap.clear();
    localModelMap.clear();

    // create default stub model
    std::vector<ExtListEntry> extList;
    extList.emplace_back("gnd", 1);
    SubcircuitModelRef d = createModelFromOldFormat("default", "0 0", "GroundElm 1", extList);
    d->sizeX = d->sizeY = 1;
    d->builtin = true;
    localModelMap.erase(d->name);
    globalModelMap.set(d->name, d);
    sequenceNumber = 1;

    loadInternalModels();
}

SubcircuitModelRef SubcircuitModel::getModelWithName(const std::string &name) {
    if (globalModelMap.size() == 0 && localModelMap.size() == 0)
        initModelMap();
    if (SubcircuitModelRef lm = lookup(localModelMap, name))
        return lm;
    return lookup(globalModelMap, name);
}

SubcircuitModelRef SubcircuitModel::createModelFromOldFormat(const std::string &name, const std::string &elmDump,
                                                             const std::string &nodeList,
                                                             const std::vector<ExtListEntry> &extList) {
    SubcircuitModelRef lm = std::make_shared<SubcircuitModel>();
    lm->name = name;
    lm->extList = extList;
    lm->convertOldFormatToXml(nodeList, elmDump);
    localModelMap.set(name, lm);
    sequenceNumber++;
    return lm;
}

void SubcircuitModel::clearDumpedFlags() {
    for (auto &kv : globalModelMap)
        kv.second->dumped = false;
    for (auto &kv : localModelMap)
        kv.second->dumped = false;
}

std::vector<SubcircuitModelRef> SubcircuitModel::getModelList() {
    // local entries win on name collision
    OrderedMap<SubcircuitModelRef> merged;
    for (auto &kv : globalModelMap)
        merged.set(kv.first, kv.second);
    for (auto &kv : localModelMap)
        merged.set(kv.first, kv.second);
    std::vector<SubcircuitModelRef> result;
    for (auto &kv : merged)
        if (!kv.second->internal)
            result.push_back(kv.second);
    std::stable_sort(result.begin(), result.end(),
                     [](const SubcircuitModelRef &a, const SubcircuitModelRef &b) { return a->name < b->name; });
    return result;
}

// a fresh local model, shadowing any global one with the same name
static SubcircuitModelRef findOrCreateLocal(const std::string &name) {
    SubcircuitModelRef model = SubcircuitModel::getModelWithName(name);
    if (model == nullptr || (SubcircuitModel::globalModelMap.has(name) && !SubcircuitModel::localModelMap.has(name))) {
        // (for a global one, create a local shadow instead of modifying it)
        model = std::make_shared<SubcircuitModel>();
        model->name = name;
        SubcircuitModel::localModelMap.set(name, model);
        SubcircuitModel::sequenceNumber++;
    }
    return model;
}

SubcircuitModelRef SubcircuitModel::undumpModel(StringTokenizer &st) {
    std::string name = CustomLogicModel::unescape(st.nextToken());
    SubcircuitModelRef model = findOrCreateLocal(name);
    model->undump(st);
    return model;
}

void SubcircuitModel::undump(StringTokenizer &st) {
    flags = parseIntStrict(st.nextToken());
    sizeX = parseIntStrict(st.nextToken());
    sizeY = parseIntStrict(st.nextToken());
    int extCount = parseIntStrict(st.nextToken());
    extList.clear();
    for (int i = 0; i < extCount; i++) {
        std::string s = CustomLogicModel::unescape(st.nextToken());
        int n = parseIntStrict(st.nextToken());
        int p = parseIntStrict(st.nextToken());
        int sd = parseIntStrict(st.nextToken());
        extList.emplace_back(s, n, p, sd);
    }
    std::string nodeList = CustomLogicModel::unescape(st.nextToken());
    std::string elmDump = CustomLogicModel::unescape(st.nextToken());
    convertOldFormatToXml(nodeList, elmDump);
}

void SubcircuitModel::convertOldFormatToXml(const std::string &nodeList, const std::string &elmDump) {
    elmDoc = std::make_unique<XmlElement>("elms");
    XmlElement *root = elmDoc.get();

    StringTokenizer elmTokenizer(elmDump, " ");
    size_t p = 0;
    while (p <= nodeList.size()) {
        size_t e = nodeList.find('\r', p);
        if (e == std::string::npos)
            e = nodeList.size();
        std::string line = nodeList.substr(p, e - p);
        p = e + 1;
        if (line.empty())
            continue;
        StringTokenizer stModel(line, " +\t\n\r\f");
        std::string ceType = stModel.nextToken();

        std::string nn;
        while (stModel.hasMoreTokens()) {
            if (!nn.empty())
                nn += " ";
            nn += stModel.nextToken();
        }

        if (ceType == "CustomCompositeElm")
            ceType = "SubcircuitElm";
        CircuitElm *ce = ElementFactory::constructElement(ceType, 0, 0);
        if (ce == nullptr) {
            std::cerr << "can't create element in convertOldFormatToXml " << ceType << "\n";
            continue;
        }

        if (elmTokenizer.hasMoreTokens()) {
            std::string dumpedCe = CustomLogicModel::unescape(elmTokenizer.nextToken());
            StringTokenizer stCe(dumpedCe, " ");
            int ceFlags = parseIntStrict(stCe.nextToken());
            int t = ce->getDumpType();
            delete ce;
            ce = ElementFactory::createCe(t, 0, 0, 0, 0, ceFlags, stCe);
            if (ce == nullptr)
                continue;
        }

        if (ce->isGroundElm())
            static_cast<GroundElm *>(ce)->setOldStyle();

        auto child = std::make_unique<XmlElement>(ce->getXmlDumpType());
        CircuitXMLSerializer::dumpAttr(child.get(), "nn", nn);
        ce->dumpXml(root, child.get());
        child->removeAttribute("x");
        root->appendChild(std::move(child));
        delete ce;
    }
}

std::string SubcircuitModel::getScope() {
    SubcircuitModelRef *lm = localModelMap.get(name);
    if (lm != nullptr && lm->get() == this)
        return "local";
    // TODO: "persistent" (saved in storage across sessions)
    return "global";
}

std::set<std::string> SubcircuitModel::getModelNamesInUse(const std::vector<CircuitElm *> &elmList) {
    std::set<std::string> names;
    std::function<void(const std::vector<CircuitElm *> &)> scan = [&](const std::vector<CircuitElm *> &list) {
        for (CircuitElm *ce : list) {
            if (!ce->isSubcircuitElm())
                continue;
            names.insert(static_cast<SubcircuitElm *>(ce)->modelName);
            if (std::vector<CircuitElm *> *children = ce->getChildElmList())
                scan(*children);
        }
    };
    scan(elmList);
    return names;
}

void SubcircuitModel::makeGlobal() {
    SubcircuitModelRef self = shared_from_this();
    localModelMap.erase(name);
    globalModelMap.set(name, self);
    sequenceNumber++;
}

void SubcircuitModel::makeLocal() {
    SubcircuitModelRef self = shared_from_this();
    SubcircuitModelRef *g = globalModelMap.get(name);
    if (g != nullptr && g->get() == this)
        globalModelMap.erase(name);
    localModelMap.set(name, self);
    sequenceNumber++;
}

std::string SubcircuitModel::dumpLibrary(const std::vector<SubcircuitModelRef> &models) {
    XmlElement root("cir");
    CircuitXMLSerializer::dumpAttr(&root, "sublib", 1);
    for (const SubcircuitModelRef &m : models)
        m->buildXmlElement(root.createChild("ccm"));
    return CircuitXMLSerializer::prettyPrint(&root);
}

std::vector<SubcircuitModelRef> SubcircuitModel::loadLibrary(CircuitXMLDeserializer &xml, const XmlElement *root) {
    // load into an empty local map so we can tell which models (including nested ones) came from the file
    OrderedMap<SubcircuitModelRef> loaded;
    std::swap(localModelMap, loaded);
    try {
        xml.currentXmlElement = root;
        for (const XmlElement *child : xml.getChildElements()) {
            if (child->tagName != "ccm")
                continue;
            xml.parseChildElement(child);
            undumpModelXml(xml);
        }
    } catch (...) {
    }
    std::swap(localModelMap, loaded);
    std::vector<SubcircuitModelRef> out;
    for (auto &kv : loaded) {
        kv.second->makeGlobal();
        out.push_back(kv.second);
    }
    return out;
}

bool SubcircuitModel::busNodesConsecutive() {
    for (size_t i = 0; i < extList.size(); i++) {
        const ExtListEntry &ent = extList[i];
        if (ent.busZ > 0 && ent.node != extList[i - 1].node + 1)
            return false;
    }
    return true;
}

void SubcircuitModel::buildXmlElement(XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
    CircuitXMLSerializer::dumpAttr(elem, "f", flags);
    CircuitXMLSerializer::dumpAttr(elem, "sx", sizeX);
    CircuitXMLSerializer::dumpAttr(elem, "sy", sizeY);
    bool bcs = busNodesConsecutive();
    if (bcs)
        CircuitXMLSerializer::dumpAttr(elem, "bcs", 1);
    for (const ExtListEntry &ent : extList) {
        if (bcs && ent.busZ > 0)
            continue;
        XmlElement *ext = elem->createChild("ext");
        CircuitXMLSerializer::dumpAttr(ext, "nm", ent.name);
        CircuitXMLSerializer::dumpAttr(ext, "nd", ent.node);
        CircuitXMLSerializer::dumpAttr(ext, "ps", ent.pos);
        CircuitXMLSerializer::dumpAttr(ext, "sd", ent.side);
        if (ent.busWidth > 1) {
            CircuitXMLSerializer::dumpAttr(ext, "bw", ent.busWidth);
            if (!bcs)
                CircuitXMLSerializer::dumpAttr(ext, "bz", ent.busZ);
        }
    }
    // copy child elements from elmDoc into output
    if (elmDoc)
        for (const auto &c : elmDoc->children)
            elem->appendChild(c->clone());
}

void SubcircuitModel::dumpXml(XmlElement *root) {
    if (internal)
        return;
    dumped = true;
    buildXmlElement(root->createChild("ccm"));
}

SubcircuitModelRef SubcircuitModel::undumpModelXml(CircuitXMLDeserializer &xml) {
    std::string name = xml.parseStringAttr("nm", std::nullopt).value_or("");
    SubcircuitModelRef model = findOrCreateLocal(name);
    model->undumpXml(xml);
    return model;
}

void SubcircuitModel::undumpEmbeddedModelXml(CircuitXMLDeserializer &xml) {
    std::string name = xml.parseStringAttr("nm", std::nullopt).value_or("");
    if (getModelWithName(name) != nullptr)
        return;
    SubcircuitModelRef model = std::make_shared<SubcircuitModel>();
    model->name = name;
    localModelMap.set(name, model);
    sequenceNumber++;
    model->undumpXml(xml);
}

void SubcircuitModel::parseXmlElement(CircuitXMLDeserializer &xml) {
    flags = xml.parseIntAttr("f", flags);
    sizeX = xml.parseIntAttr("sx", sizeX);
    sizeY = xml.parseIntAttr("sy", sizeY);
    bool bcs = xml.parseIntAttr("bcs", 0) != 0;
    extList.clear();

    // build elmDoc from XML children
    elmDoc = std::make_unique<XmlElement>("elms");
    XmlElement *root = elmDoc.get();

    const XmlElement *self = xml.currentXmlElement;
    for (const XmlElement *child : xml.getChildElements()) {
        if (child->tagName == "ext") {
            xml.parseChildElement(child);
            std::string s = xml.parseStringAttr("nm", std::string()).value_or("");
            int n = xml.parseIntAttr("nd", 0);
            int p = xml.parseIntAttr("ps", 0);
            int sd = xml.parseIntAttr("sd", 0);
            int bw = xml.parseIntAttr("bw", 1);
            if (bcs && bw > 1) {
                // expand compact bus entries
                for (int j = 0; j < bw; j++) {
                    ExtListEntry ent(s, n + j, p, sd);
                    ent.busWidth = bw;
                    ent.busZ = j;
                    extList.push_back(ent);
                }
            } else {
                ExtListEntry ent(s, n, p, sd);
                ent.busWidth = bw;
                ent.busZ = xml.parseIntAttr("bz", 0);
                extList.push_back(ent);
            }
        } else {
            // element definition - import into elmDoc
            root->appendChild(child->clone());

            // model definitions need to be registered immediately (not just left in elmDoc),
            // since elements like RelayElm look up their model by name as soon as they're
            // instantiated from elmDoc (e.g. in CompositeElm::loadCompositeXml())
            const std::string &tagName = child->tagName;
            xml.parseChildElement(child);
            if (tagName == "dm")
                DiodeModel::undumpModelXml(xml);
            else if (tagName == "rlm")
                RelayModel::undumpModelXml(xml);
            else if (tagName == "tm")
                TransistorModel::undumpModelXml(xml);
            else if (tagName == "clm")
                CustomLogicModel::undumpModelXml(xml);
            else if (tagName == "mm")
                MosfetModel::undumpModelXml(xml);
            else if (tagName == "ccm")
                undumpEmbeddedModelXml(xml);
        }
    }
    xml.parseChildElement(self);
}

std::vector<const XmlElement *> SubcircuitModel::getElmEntries() const {
    std::vector<const XmlElement *> entries;
    if (elmDoc)
        for (const auto &c : elmDoc->children)
            entries.push_back(c.get());
    return entries;
}

std::string SubcircuitModel::getNodeList() const {
    std::string nodeList;
    for (const XmlElement *child : getElmEntries()) {
        const std::string *className = ElementFactory::xmlClassName(child->tagName);
        if (className == nullptr)
            continue;
        const std::string *nn = child->getAttribute("nn");
        if (!nodeList.empty())
            nodeList += "\r";
        nodeList += *className + (nn && !nn->empty() ? " " + *nn : "");
    }
    return nodeList;
}

bool SubcircuitModel::canLoadModelCircuit() const {
    if (modelCircuit && !modelCircuit->empty())
        return true;
    for (const XmlElement *child : getElmEntries())
        if (child->hasAttribute("x"))
            return true;
    return false;
}

void SubcircuitModel::remove() {
    std::string n = name;
    localModelMap.erase(n);
    globalModelMap.erase(n);
    sequenceNumber++;
}

void SubcircuitModel::replaceModel(const SubcircuitModelRef &model) {
    SubcircuitModelRef *g = globalModelMap.get(model->name);
    if (g != nullptr && *g == model)
        localModelMap.erase(model->name);
    else
        localModelMap.set(model->name, model);
    sequenceNumber++;
}

void SubcircuitModel::dumpUnusedLocalModels(XmlElement *root) {
    std::vector<SubcircuitModelRef> list;
    for (auto &kv : localModelMap)
        list.push_back(kv.second);
    for (const SubcircuitModelRef &m : list)
        if (!m->dumped && !m->builtin && !m->name.empty())
            m->dumpXml(root);
}

void SubcircuitModel::clearLocalModels() {
    localModelMap.clear();
    sequenceNumber++;
}

static const char *lm317 =
    R"(. ~LM317-v2 0 2 2 3 adj 2 1 1 in 1 0 2 out 3 0 3 JfetElm\s3\s4\s1\s\rResistorElm\s5\s39\rCapacitorElm\s39\s6\rCapacitorElm\s39\s5\rTransistorElm\s39\s5\s6\s\rResistorElm\s7\s40\rCapacitorElm\s40\s8\rCapacitorElm\s40\s5\rTransistorElm\s40\s5\s8\s\rResistorElm\s5\s41\rCapacitorElm\s41\s9\rCapacitorElm\s41\s7\rTransistorElm\s41\s7\s9\s\rResistorElm\s7\s42\rCapacitorElm\s42\s3\rCapacitorElm\s42\s10\rTransistorElm\s42\s10\s3\s\rResistorElm\s10\s43\rCapacitorElm\s43\s11\rCapacitorElm\s43\s3\rTransistorElm\s43\s3\s11\s\rResistorElm\s10\s44\rCapacitorElm\s44\s13\rCapacitorElm\s44\s12\rTransistorElm\s44\s12\s13\s\rResistorElm\s5\s45\rCapacitorElm\s45\s14\rCapacitorElm\s45\s11\rTransistorElm\s45\s11\s14\s\rResistorElm\s12\s46\rCapacitorElm\s46\s11\rCapacitorElm\s46\s15\rTransistorElm\s46\s15\s11\s\rResistorElm\s5\s47\rCapacitorElm\s47\s17\rCapacitorElm\s47\s16\rTransistorElm\s47\s16\s17\s\rResistorElm\s15\s48\rCapacitorElm\s48\s18\rCapacitorElm\s48\s16\rTransistorElm\s48\s16\s18\s\rResistorElm\s19\s49\rCapacitorElm\s49\s16\rCapacitorElm\s49\s3\rTransistorElm\s49\s3\s16\s\rResistorElm\s20\s50\rCapacitorElm\s50\s19\rCapacitorElm\s50\s1\rTransistorElm\s50\s1\s19\s\rResistorElm\s5\s51\rCapacitorElm\s51\s21\rCapacitorElm\s51\s20\rTransistorElm\s51\s20\s21\s\rResistorElm\s22\s52\rCapacitorElm\s52\s20\rCapacitorElm\s52\s3\rTransistorElm\s52\s3\s20\s\rResistorElm\s23\s53\rCapacitorElm\s53\s16\rCapacitorElm\s53\s22\rTransistorElm\s53\s22\s16\s\rResistorElm\s3\s54\rCapacitorElm\s54\s24\rCapacitorElm\s54\s22\rTransistorElm\s54\s22\s24\s\rResistorElm\s23\s55\rCapacitorElm\s55\s16\rCapacitorElm\s55\s23\rTransistorElm\s55\s23\s16\s\rResistorElm\s3\s56\rCapacitorElm\s56\s25\rCapacitorElm\s56\s23\rTransistorElm\s56\s23\s25\s\rResistorElm\s26\s57\rCapacitorElm\s57\s16\rCapacitorElm\s57\s3\rTransistorElm\s57\s3\s16\s\rResistorElm\s27\s58\rCapacitorElm\s58\s3\rCapacitorElm\s58\s26\rTransistorElm\s58\s26\s3\s\rResistorElm\s28\s59\rCapacitorElm\s59\s1\rCapacitorElm\s59\s28\rTransistorElm\s59\s28\s1\s\rResistorElm\s28\s60\rCapacitorElm\s60\s1\rCapacitorElm\s60\s16\rTransistorElm\s60\s16\s1\s\rResistorElm\s16\s61\rCapacitorElm\s61\s29\rCapacitorElm\s61\s28\rTransistorElm\s61\s28\s29\s\rResistorElm\s31\s62\rCapacitorElm\s62\s32\rCapacitorElm\s62\s30\rTransistorElm\s62\s30\s32\s\rResistorElm\s31\s63\rCapacitorElm\s63\s33\rCapacitorElm\s63\s30\rTransistorElm\s63\s30\s33\s\rResistorElm\s34\s64\rCapacitorElm\s64\s35\rCapacitorElm\s64\s1\rTransistorElm\s64\s1\s35\s\rResistorElm\s35\s65\rCapacitorElm\s65\s36\rCapacitorElm\s65\s1\rTransistorElm\s65\s1\s36\s\rDiodeElm\s3\s4\rDiodeElm\s37\s1\rDiodeElm\s32\s38\rResistorElm\s1\s6\rResistorElm\s1\s9\rResistorElm\s1\s14\rResistorElm\s1\s17\rResistorElm\s1\s21\rResistorElm\s4\s7\rResistorElm\s7\s10\rResistorElm\s11\s12\rResistorElm\s8\s3\rResistorElm\s13\s3\rResistorElm\s15\s3\rResistorElm\s18\s3\rResistorElm\s19\s3\rResistorElm\s2\s24\rResistorElm\s24\s25\rResistorElm\s16\s26\rResistorElm\s16\s31\rResistorElm\s29\s35\rResistorElm\s16\s34\rRes)"
    R"(istorElm\s27\s30\rResistorElm\s30\s31\rResistorElm\s3\s35\rResistorElm\s37\s38\rResistorElm\s33\s32\rResistorElm\s33\s36\rResistorElm\s36\s3\rCapacitorElm\s22\s3\rCapacitorElm\s22\s2\rCapacitorElm\s26\s27\rCapacitorElm\s5\s3\rCapacitorElm\s28\s3\rCapacitorElm\s23\s3\r 0\\s-7\\s0.0001\s0\\s200\s2\\s1.5000000000000002e-13\\s0\\s0\s2\\s1e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.1\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s200\s2\\s1.5000000000000002e-13\\s0\\s0\s2\\s1e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.1\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s50\s2\\s4e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A2\s0\\s100\s2\\s3.0000000000000003e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A0.2\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s10\s2\\s3e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A2\s0\\s10\s2\\s3e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s-1\\s0\\s0\\s40\\s~lm317-qpl-A2\s0\\s50\s2\\s4e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A2\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s500\s2\\s4e-13\\s0\\s0\s2\\s2e-13\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A0.2\s0\\s20\s2\\s1e-11\\s0\\s0\s2\\s5e-12\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A5\s0\\s2\s2\\s1e-10\\s0\\s0\s2\\s5e-11\\s0\\s0\s0\\s1\\s0\\s0\\s80\\s~lm317-qnl-A50\s2\\s~lm317-dz\s2\\s~lm317-dz\s2\\s~lm317-dz\s0\\s310\s0\\s310\s0\\s190\s0\\s82\s0\\s5600\s0\\s100000\s0\\s130\s0\\s12400\s0\\s180\s0\\s4100\s0\\s5800\s0\\s72\s0\\s5100\s0\\s12000\s0\\s2400\s0\\s6700\s0\\s12000\s0\\s130\)"
    R"(s0\\s370\s0\\s13000\s0\\s400\s0\\s160\s0\\s18000\s0\\s160\s0\\s3\s0\\s0.1\s2\\s3e-11\\s0\\s0\s2\\s3e-11\\s0\\s0\s2\\s5e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s2\\s1e-12\\s0\\s0\s2\\s1e-12\\s0\\s0)";

static const char *tl431 =
    R"(. ~TL431 0 1 3 3 A 2 0 1 C 1 0 0 ref 3 1 2 ResistorElm\s3\s18\rCapacitorElm\s18\s4\rCapacitorElm\s18\s1\rTransistorElm\s18\s1\s4\s\rResistorElm\s4\s5\rResistorElm\s5\s6\rResistorElm\s5\s7\rResistorElm\s6\s19\rCapacitorElm\s19\s2\rCapacitorElm\s19\s6\rTransistorElm\s19\s6\s2\s\rResistorElm\s6\s20\rCapacitorElm\s20\s8\rCapacitorElm\s20\s7\rTransistorElm\s20\s7\s8\s\rResistorElm\s8\s2\rResistorElm\s4\s21\rCapacitorElm\s21\s10\rCapacitorElm\s21\s9\rTransistorElm\s21\s9\s10\s\rResistorElm\s10\s11\rResistorElm\s7\s22\rCapacitorElm\s22\s2\rCapacitorElm\s22\s11\rTransistorElm\s22\s11\s2\s\rResistorElm\s13\s23\rCapacitorElm\s23\s2\rCapacitorElm\s23\s12\rTransistorElm\s23\s12\s2\s\rResistorElm\s9\s24\rCapacitorElm\s24\s14\rCapacitorElm\s24\s9\rTransistorElm\s24\s9\s14\s\rResistorElm\s9\s25\rCapacitorElm\s25\s15\rCapacitorElm\s25\s12\rTransistorElm\s25\s12\s15\s\rResistorElm\s1\s14\rResistorElm\s1\s15\rResistorElm\s12\s26\rCapacitorElm\s26\s16\rCapacitorElm\s26\s1\rTransistorElm\s26\s1\s16\s\rResistorElm\s17\s16\rResistorElm\s17\s27\rCapacitorElm\s27\s2\rCapacitorElm\s27\s1\rTransistorElm\s27\s1\s2\s\rResistorElm\s17\s2\rResistorElm\s12\s28\rCapacitorElm\s28\s3\rCapacitorElm\s28\s12\rTransistorElm\s28\s12\s3\s\rDiodeElm\s2\s12\rResistorElm\s13\s6\rDiodeElm\s2\s1\rCapacitorElm\s1\s12\rCapacitorElm\s7\s11\r 0\\s40\s2\\s1e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed\s0\\s3280\s0\\s2400\s0\\s7200\s0\\s33.333333333333336\s2\\s1.2e-12\\s0\\s0\s2\\s2.4e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed-A1.2\s0\\s18.18181818181818\s2\\s2.2000000000000003e-12\\s0\\s0\s2\\s4.400000000000001e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed-A2.2\s0\\s800\s0\\s40\s2\\s1e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed\s0\\s4000\s0\\s40\s2\\s1e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed\s0\\s80\s2\\s5e-13\\s0\\s0\s2\\s1e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed-A0.5\s0\\s80\s2\\s1e-12\\s0\\s0\s2\\s3e-12\\s0\\s0\s0\\s-1\\s0\\s0\\s60\\s~tl431ed-qp_ed\s0\\s80\s2\\s1e-12\\s0\\s0\s2\\s3e-12\\s0\\s0\s0\\s-1\\s0\\s0\\s60\\s~tl431ed-qp_ed\s0\\s800\s0\\s800\s0\\s40\s2\\s1e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed\s0\\s150\s0\\s8\s2\\s5e-12\\s0\\s0\s2\\s1e-11\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed-A5\s0\\s10000\s0\\s40\s2\\s1e-12\\s0\\s0\s2\\s2e-12\\s0\\s0\s0\\s1\\s0\\s0\\s140\\s~tl431ed-qn_ed\s2\\s~tl431ed-d_ed\s0\\s1000\s2\\s~tl431ed-d_ed\s2\\s1e-11\\s0\\s0\s2\\s2e-11\\s0\\s0)";

void SubcircuitModel::loadInternalModels() {
    for (const char *modelStr : {lm317, tl431}) {
        StringTokenizer st(modelStr, " ");
        st.nextToken();  // "."
        SubcircuitModelRef model = undumpModel(st);
        model->internal = model->builtin = true;
        // move from local to global since these are builtins
        localModelMap.erase(model->name);
        globalModelMap.set(model->name, model);
    }
}
