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
#include "ModelTypes.h"
#include "MosfetModel.h"
#include "RelayModel.h"
#include "Storage.h"
#include "StringTokenizer.h"
#include "TransistorModel.h"
#include "../elements/GroundElm.h"
#include "../elements/SubcircuitElm.h"

ModelRegistry<SubcircuitModel, SubcircuitModelRef> &SubcircuitModel::registry() {
    static ModelRegistry<SubcircuitModel, SubcircuitModelRef> r([] { initModelMap(); }, "subcircuit:",
                                                                [](SubcircuitModel *m, XmlElement *root) {
                                                                    m->buildXmlElement(root->createChild("ccm"));
                                                                });
    return r;
}

void SubcircuitModel::setName(const std::string &n) {
    registry().rename(shared_from_this(), n);
}

void SubcircuitModel::initModelMap() {
    // create default stub model
    std::vector<ExtListEntry> extList;
    extList.emplace_back("gnd", 1);
    SubcircuitModelRef d = createModelFromOldFormat("default", "0 0", "GroundElm 1", extList);
    d->sizeX = d->sizeY = 1;
    d->builtin = true;
    registry().makeGlobal(d);

    loadInternalModels();
}

void SubcircuitModel::loadModelsFromStorage() {
    registry().loadFromStorage([](const std::string &data) {
        try {
            if (data[0] == '<') {
                loadModelFromStorage(data);
            } else {
                std::string firstLine = data;
                size_t lineLen = data.find('\n');
                if (lineLen != std::string::npos)
                    firstLine = data.substr(0, lineLen);
                StringTokenizer st(firstLine, " ");
                if (st.nextToken() == ".") {
                    SubcircuitModelRef model = undumpModel(st);
                    if (lineLen != std::string::npos)
                        model->modelCircuit = data.substr(lineLen + 1);
                    // move from local to global since this is from storage
                    registry().makeGlobal(model);
                }
            }
        } catch (std::exception &e) {
            std::cerr << "Exception: " << e.what() << "\n";
        }
    });
}

SubcircuitModelRef SubcircuitModel::getModelWithName(const std::string &name) {
    return registry().get(name);
}

SubcircuitModelRef SubcircuitModel::getModelForLoad(const std::string &name) {
    return registry().getForLoad(name, [] { return std::make_shared<SubcircuitModel>(); });
}

SubcircuitModelRef SubcircuitModel::createModelFromOldFormat(const std::string &name, const std::string &elmDump,
                                                             const std::string &nodeList,
                                                             const std::vector<ExtListEntry> &extList) {
    SubcircuitModelRef lm = std::make_shared<SubcircuitModel>();
    lm->name = name;
    lm->extList = extList;
    lm->convertOldFormatToXml(nodeList, elmDump);
    registry().setLocal(lm);
    return lm;
}

SubcircuitModelRef SubcircuitModel::createModel(const std::string &name, std::unique_ptr<XmlElement> elmDoc,
                                               const std::vector<ExtListEntry> &extList) {
    SubcircuitModelRef lm = std::make_shared<SubcircuitModel>();
    lm->name = name;
    lm->elmDoc = std::move(elmDoc);
    lm->extList = extList;
    registry().setLocal(lm);
    return lm;
}

std::vector<SubcircuitModelRef> SubcircuitModel::getModelList() {
    std::vector<SubcircuitModelRef> result;
    for (const SubcircuitModelRef &dm : registry().models())
        if (!dm->internal)
            result.push_back(dm);
    std::stable_sort(result.begin(), result.end(),
                     [](const SubcircuitModelRef &a, const SubcircuitModelRef &b) { return a->name < b->name; });
    return result;
}

SubcircuitModelRef SubcircuitModel::undumpModel(StringTokenizer &st) {
    std::string name = CustomLogicModel::unescape(st.nextToken());
    SubcircuitModelRef model = getModelForLoad(name);
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

bool SubcircuitModel::isSaved() {
    return registry().isSaved(name);
}

void SubcircuitModel::setSaved(bool sv) {
    if (sv) {
        registry().store(this);
        registry().setGlobal(shared_from_this());
    } else {
        registry().unsave(name);
    }
}

void SubcircuitModel::loadModelFromStorage(const std::string &data) {
    std::unique_ptr<XmlElement> root = parseXml(data);
    CircuitXMLDeserializer xml(nullptr);
    xml.currentXmlElement = root.get();
    std::string modelName = xml.parseStringAttr("nm", std::nullopt).value_or("");
    SubcircuitModelRef model = std::make_shared<SubcircuitModel>();
    model->name = modelName;
    model->parseXmlElement(xml);
    registry().setGlobal(model);
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
    SubcircuitModelRef model = getModelForLoad(name);
    model->undumpXml(xml);
    return model;
}

void SubcircuitModel::undumpEmbeddedModelXml(CircuitXMLDeserializer &xml) {
    std::string name = xml.parseStringAttr("nm", std::nullopt).value_or("");
    if (getModelWithName(name) != nullptr)
        return;
    SubcircuitModelRef model = std::make_shared<SubcircuitModel>();
    model->name = name;
    registry().setLocal(model);
    model->undumpXml(xml);
}

bool SubcircuitModel::undumpEmbeddedElmModelXml(CircuitXMLDeserializer &xml, const XmlElement *elm) {
    const ModelType *type = getElmModelType(elm->tagName);
    if (type == nullptr)
        return false;
    const std::string *name = elm->getAttribute("nm");
    if (name != nullptr && !type->registry->has(*name)) {
        xml.parseChildElement(elm);
        type->registry->anyMakeGlobal(type->undump(xml));
    }
    return true;
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
            const ModelType *elmModelType = getElmModelType(tagName);
            if (elmModelType != nullptr)
                elmModelType->undump(xml);
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
    registry().deleteModel(shared_from_this());
}

void SubcircuitModel::replaceModel(const SubcircuitModelRef &model) {
    if (registry().isGlobal(model.get()))
        registry().removeLocal(model->name);
    else
        registry().setLocal(model);
}

// the built-in models.  In XML (as in the TS version, where loading the old text format
// would need each element's class loaded)
static const char *internalModels[] = {
    R"(<ccm nm="~LM317-v2" f="0" sx="2" sy="2" bcs="1"><ext nm="adj" nd="2" ps="1" sd="1"/><ext nm="in" nd="1" ps="0" sd="2"/><ext nm="out" nd="3" ps="0" sd="3"/><j nn="3 4 1" f="0" mo="~lm317-jfet"/><r nn="5 39" f="0" r="200"/><c nn="39 6" f="2" c="1.5000000000000002e-13" iv="0" sr="0"/><c nn="39 5" f="2" c="1e-13" iv="0" sr="0"/><t nn="39 5 6" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.1"/><r nn="7 40" f="0" r="500"/><c nn="40 8" f="2" c="4e-13" iv="0" sr="0"/><c nn="40 5" f="2" c="2e-13" iv="0" sr="0"/><t nn="40 5 8" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="5 41" f="0" r="200"/><c nn="41 9" f="2" c="1.5000000000000002e-13" iv="0" sr="0"/><c nn="41 7" f="2" c="1e-13" iv="0" sr="0"/><t nn="41 7 9" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.1"/><r nn="7 42" f="0" r="500"/><c nn="42 3" f="2" c="4e-13" iv="0" sr="0"/><c nn="42 10" f="2" c="2e-13" iv="0" sr="0"/><t nn="42 10 3" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="10 43" f="0" r="100"/><c nn="43 11" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="43 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="43 3 11" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="10 44" f="0" r="500"/><c nn="44 13" f="2" c="4e-13" iv="0" sr="0"/><c nn="44 12" f="2" c="2e-13" iv="0" sr="0"/><t nn="44 12 13" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="5 45" f="0" r="100"/><c nn="45 14" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="45 11" f="2" c="2e-13" iv="0" sr="0"/><t nn="45 11 14" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="12 46" f="0" r="100"/><c nn="46 11" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="46 15" f="2" c="2e-13" iv="0" sr="0"/><t nn="46 15 11" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="5 47" f="0" r="100"/><c nn="47 17" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="47 16" f="2" c="2e-13" iv="0" sr="0"/><t nn="47 16 17" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="15 48" f="0" r="500"/><c nn="48 18" f="2" c="4e-13" iv="0" sr="0"/><c nn="48 16" f="2" c="2e-13" iv="0" sr="0"/><t nn="48 16 18" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="19 49" f="0" r="100"/><c nn="49 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="49 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="49 3 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="20 50" f="0" r="500"/><c nn="50 19" f="2" c="4e-13" iv="0" sr="0"/><c nn="50 1" f="2" c="2e-13" iv="0" sr="0"/><t nn="50 1 19" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="5 51" f="0" r="100"/><c nn="51 21" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="51 20" f="2" c="2e-13" iv="0" sr="0"/><t nn="51 20 21" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="22 52" f="0" r="100"/><c nn="52 20" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="52 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="52 3 20" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="23 53" f="0" r="100"/><c nn="53 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="53 22" f="2" c="2e-13" iv="0" sr="0"/><t nn="53 22 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="3 54" f="0" r="500"/><c nn="54 24" f="2" c="4e-13" iv="0" sr="0"/><c nn="54 22" f="2" c="2e-13" iv="0" sr="0"/><t nn="54 22 24" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="23 55" f="0" r="100"/><c nn="55 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="55 23" f="2" c="2e-13" iv="0" sr="0"/><t nn="55 23 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="3 56" f="0" r="50"/><c nn="56 25" f="2" c="4e-12" iv="0" sr="0"/><c nn="56 23" f="2" c="2e-12" iv="0" sr="0"/><t nn="56 23 25" f="0" pn="1" be="80" mo="~lm317-qnl-A2"/><r nn="26 57" f="0" r="100"/><c nn="57 16" f="2" c="3.0000000000000003e-13" iv="0" sr="0"/><c nn="57 3" f="2" c="2e-13" iv="0" sr="0"/><t nn="57 3 16" f="0" pn="-1" be="40" mo="~lm317-qpl-A0.2"/><r nn="27 58" f="0" r="500"/><c nn="58 3" f="2" c="4e-13" iv="0" sr="0"/><c nn="58 26" f="2" c="2e-13" iv="0" sr="0"/><t nn="58 26 3" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="28 59" f="0" r="10"/><c nn="59 1" f="2" c="3e-12" iv="0" sr="0"/><c nn="59 28" f="2" c="2e-12" iv="0" sr="0"/><t nn="59 28 1" f="0" pn="-1" be="40" mo="~lm317-qpl-A2"/><r nn="28 60" f="0" r="10"/><c nn="60 1" f="2" c="3e-12" iv="0" sr="0"/><c nn="60 16" f="2" c="2e-12" iv="0" sr="0"/><t nn="60 16 1" f="0" pn="-1" be="40" mo="~lm317-qpl-A2"/><r nn="16 61" f="0" r="50"/><c nn="61 29" f="2" c="4e-12" iv="0" sr="0"/><c nn="61 28" f="2" c="2e-12" iv="0" sr="0"/><t nn="61 28 29" f="0" pn="1" be="80" mo="~lm317-qnl-A2"/><r nn="31 62" f="0" r="500"/><c nn="62 32" f="2" c="4e-13" iv="0" sr="0"/><c nn="62 30" f="2" c="2e-13" iv="0" sr="0"/><t nn="62 30 32" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="31 63" f="0" r="500"/><c nn="63 33" f="2" c="4e-13" iv="0" sr="0"/><c nn="63 30" f="2" c="2e-13" iv="0" sr="0"/><t nn="63 30 33" f="0" pn="1" be="80" mo="~lm317-qnl-A0.2"/><r nn="34 64" f="0" r="20"/><c nn="64 35" f="2" c="1e-11" iv="0" sr="0"/><c nn="64 1" f="2" c="5e-12" iv="0" sr="0"/><t nn="64 1 35" f="0" pn="1" be="80" mo="~lm317-qnl-A5"/><r nn="35 65" f="0" r="2"/><c nn="65 36" f="2" c="1e-10" iv="0" sr="0"/><c nn="65 1" f="2" c="5e-11" iv="0" sr="0"/><t nn="65 1 36" f="0" pn="1" be="80" mo="~lm317-qnl-A50"/><d nn="3 4" f="2" mo="~lm317-dz"/><d nn="37 1" f="2" mo="~lm317-dz"/><d nn="32 38" f="2" mo="~lm317-dz"/><r nn="1 6" f="0" r="310"/><r nn="1 9" f="0" r="310"/><r nn="1 14" f="0" r="190"/><r nn="1 17" f="0" r="82"/><r nn="1 21" f="0" r="5600"/><r nn="4 7" f="0" r="100000"/><r nn="7 10" f="0" r="130"/><r nn="11 12" f="0" r="12400"/><r nn="8 3" f="0" r="180"/><r nn="13 3" f="0" r="4100"/><r nn="15 3" f="0" r="5800"/><r nn="18 3" f="0" r="72"/><r nn="19 3" f="0" r="5100"/><r nn="2 24" f="0" r="12000"/><r nn="24 25" f="0" r="2400"/><r nn="16 26" f="0" r="6700"/><r nn="16 31" f="0" r="12000"/><r nn="29 35" f="0" r="130"/><r nn="16 34" f="0" r="370"/><r nn="27 30" f="0" r="13000"/><r nn="30 31" f="0" r="400"/><r nn="3 35" f="0" r="160"/><r nn="37 38" f="0" r="18000"/><r nn="33 32" f="0" r="160"/><r nn="33 36" f="0" r="3"/><r nn="36 3" f="0" r="0.1"/><c nn="22 3" f="2" c="3e-11" iv="0" sr="0"/><c nn="22 2" f="2" c="3e-11" iv="0" sr="0"/><c nn="26 27" f="2" c="5e-12" iv="0" sr="0"/><c nn="5 3" f="2" c="2e-12" iv="0" sr="0"/><c nn="28 3" f="2" c="1e-12" iv="0" sr="0"/><c nn="23 3" f="2" c="1e-12" iv="0" sr="0"/></ccm>)",
    R"(<ccm nm="~TL431" f="0" sx="1" sy="3" bcs="1"><ext nm="A" nd="2" ps="0" sd="1"/><ext nm="C" nd="1" ps="0" sd="0"/><ext nm="ref" nd="3" ps="1" sd="2"/><r nn="3 18" f="0" r="40"/><c nn="18 4" f="2" c="1e-12" iv="0" sr="0"/><c nn="18 1" f="2" c="2e-12" iv="0" sr="0"/><t nn="18 1 4" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="4 5" f="0" r="3280"/><r nn="5 6" f="0" r="2400"/><r nn="5 7" f="0" r="7200"/><r nn="6 19" f="0" r="33.333333333333336"/><c nn="19 2" f="2" c="1.2e-12" iv="0" sr="0"/><c nn="19 6" f="2" c="2.4e-12" iv="0" sr="0"/><t nn="19 6 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A1.2"/><r nn="6 20" f="0" r="18.18181818181818"/><c nn="20 8" f="2" c="2.2000000000000003e-12" iv="0" sr="0"/><c nn="20 7" f="2" c="4.400000000000001e-12" iv="0" sr="0"/><t nn="20 7 8" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A2.2"/><r nn="8 2" f="0" r="800"/><r nn="4 21" f="0" r="40"/><c nn="21 10" f="2" c="1e-12" iv="0" sr="0"/><c nn="21 9" f="2" c="2e-12" iv="0" sr="0"/><t nn="21 9 10" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="10 11" f="0" r="4000"/><r nn="7 22" f="0" r="40"/><c nn="22 2" f="2" c="1e-12" iv="0" sr="0"/><c nn="22 11" f="2" c="2e-12" iv="0" sr="0"/><t nn="22 11 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="13 23" f="0" r="80"/><c nn="23 2" f="2" c="5e-13" iv="0" sr="0"/><c nn="23 12" f="2" c="1e-12" iv="0" sr="0"/><t nn="23 12 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A0.5"/><r nn="9 24" f="0" r="80"/><c nn="24 14" f="2" c="1e-12" iv="0" sr="0"/><c nn="24 9" f="2" c="3e-12" iv="0" sr="0"/><t nn="24 9 14" f="0" pn="-1" be="60" mo="~tl431ed-qp_ed"/><r nn="9 25" f="0" r="80"/><c nn="25 15" f="2" c="1e-12" iv="0" sr="0"/><c nn="25 12" f="2" c="3e-12" iv="0" sr="0"/><t nn="25 12 15" f="0" pn="-1" be="60" mo="~tl431ed-qp_ed"/><r nn="1 14" f="0" r="800"/><r nn="1 15" f="0" r="800"/><r nn="12 26" f="0" r="40"/><c nn="26 16" f="2" c="1e-12" iv="0" sr="0"/><c nn="26 1" f="2" c="2e-12" iv="0" sr="0"/><t nn="26 1 16" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><r nn="17 16" f="0" r="150"/><r nn="17 27" f="0" r="8"/><c nn="27 2" f="2" c="5e-12" iv="0" sr="0"/><c nn="27 1" f="2" c="1e-11" iv="0" sr="0"/><t nn="27 1 2" f="0" pn="1" be="140" mo="~tl431ed-qn_ed-A5"/><r nn="17 2" f="0" r="10000"/><r nn="12 28" f="0" r="40"/><c nn="28 3" f="2" c="1e-12" iv="0" sr="0"/><c nn="28 12" f="2" c="2e-12" iv="0" sr="0"/><t nn="28 12 3" f="0" pn="1" be="140" mo="~tl431ed-qn_ed"/><d nn="2 12" f="2" mo="~tl431ed-d_ed"/><r nn="13 6" f="0" r="1000"/><d nn="2 1" f="2" mo="~tl431ed-d_ed"/><c nn="1 12" f="2" c="1e-11" iv="0" sr="0"/><c nn="7 11" f="2" c="2e-11" iv="0" sr="0"/></ccm>)",
};

void SubcircuitModel::loadInternalModels() {
    for (const char *data : internalModels) {
        std::unique_ptr<XmlElement> root = parseXml(data);
        CircuitXMLDeserializer xml(nullptr);
        xml.currentXmlElement = root.get();
        SubcircuitModelRef model = undumpModelXml(xml);
        model->internal = model->builtin = true;
        // move from local to global since these are builtins
        registry().makeGlobal(model);
    }
}
