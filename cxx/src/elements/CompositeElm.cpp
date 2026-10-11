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

#include "CompositeElm.h"

#include <iostream>
#include <regex>
#include <stdexcept>
#include <unordered_map>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/ElementFactory.h"
#include "../core/JsNumber.h"
#include "../core/StringTokenizer.h"
#include "../core/SubcircuitModel.h"
#include "../core/XmlDoc.h"
#include "GroundElm.h"

CompositeElm::~CompositeElm() {
    clearChildren();
}

void CompositeElm::clearChildren() {
    for (CircuitElm *ce : compElmList)
        delete ce;
    compElmList.clear();
}

void CompositeElm::loadComposite(StringTokenizer *stIn, const std::string &model, const std::vector<int> &externalNodes) {
    clearChildren();
    std::vector<std::string> nodeInfoList;

    // Build compElmList from input string, storing node info for later
    size_t p = 0;
    while (p <= model.size()) {
        size_t e = model.find('\r', p);
        if (e == std::string::npos)
            e = model.size();
        std::string line = model.substr(p, e - p);
        p = e + 1;
        size_t sp = line.find(' ');
        if (sp == std::string::npos)
            continue;
        std::string ceType = line.substr(0, sp);
        std::string nodeStr = line.substr(sp + 1);
        CircuitElm *newce = ElementFactory::constructElement(ceType, 0, 0);
        if (newce != nullptr && stIn != nullptr) {
            int tint = newce->getDumpType();
            delete newce;
            std::string dumpedCe = stIn->nextToken();
            if (useEscape())
                dumpedCe = CustomLogicModel::unescape(dumpedCe);
            StringTokenizer stCe(dumpedCe, useEscape() ? " " : "_");
            int flags = parseIntStrict(stCe.nextToken());
            newce = ElementFactory::createCe(tint, 0, 0, 0, 0, flags, stCe);
        }
        if (newce == nullptr) {
            std::cerr << "failed to create " << ceType << " in CompositeElm\n";
            continue;
        }
        if (newce->isGroundElm())
            static_cast<GroundElm *>(newce)->setOldStyle();
        newce->parent = this;
        compElmList.push_back(newce);
        nodeInfoList.push_back(nodeStr);
    }

    compNodeInfo = nodeInfoList;
    compRefNodeInfo.clear();  // the old text format has no expression references
    extNodeIds = externalNodes;
    numPosts = numNodes = (int) externalNodes.size();
    posts.assign(numPosts, Point());
    allocNodes();

    // dump new circuits with escape()
    flags |= FLAG_ESCAPE;
}

void CompositeElm::loadCompositeXml(const std::vector<const XmlElement *> &elmEntries,
                                    const std::vector<int> &externalNodes) {
    CircuitXMLDeserializer xml(app);
    clearChildren();
    std::vector<std::string> nodeInfoList;
    std::vector<std::string> refNodeInfoList;

    for (const XmlElement *childElem : elmEntries) {
        const std::string &tagName = childElem->tagName;
        if (tagName == "ccm") {
            // referenced subcircuit model definition, embedded here when this model was
            // originally created from a selection that included an instance of it.  Register
            // it so any instance below that references it by name can resolve it, same as
            // CircuitXMLDeserializer's element loading does for a whole-circuit load.
            xml.parseChildElement(childElem);
            SubcircuitModel::undumpEmbeddedModelXml(xml);
            continue;
        }
        const std::string *cn = ElementFactory::xmlClassName(tagName);
        if (cn == nullptr)
            continue;
        const std::string &className = *cn;
        // skip non-essential display-only elements
        // GroundElm is only skipped if it has coordinates (newer dump, purely visual)
        if (className == "WireElm" || className == "RoutedWireElm" || className == "LabeledNodeElm" ||
            className == "ScopeElm" || className == "GraphicElm" ||
            (className == "GroundElm" && childElem->hasAttribute("x")))
            continue;
        CircuitElm *newce = ElementFactory::constructElement(className, 0, 0);
        if (newce == nullptr)
            continue;
        if (newce->isGroundElm())
            static_cast<GroundElm *>(newce)->setOldStyle();
        xml.parseChildElement(childElem);
        newce->undumpXml(xml);
        newce->parent = this;
        compElmList.push_back(newce);
        const std::string *nn = childElem->getAttribute("nn");
        nodeInfoList.push_back(nn ? *nn : "");
        const std::string *rn = childElem->getAttribute("rn");
        refNodeInfoList.push_back(rn ? *rn : "");
    }

    compNodeInfo = nodeInfoList;
    compRefNodeInfo = refNodeInfoList;
    extNodeIds = externalNodes;

    // we set numNodes here so allocNodes() will work when creating.
    // the real node count will be filled in during preStamp
    numPosts = numNodes = (int) externalNodes.size();
    posts.assign(numPosts, Point());
    flags |= FLAG_ESCAPE;
}

void CompositeElm::buildCompNodeList() {
    // (TS: a Map, which iterates in insertion order)
    std::unordered_map<int, std::vector<CircuitNodeLink>> compNodeHash;
    std::vector<int> order;
    auto addLink = [&](int node, int num, CircuitElm *ce) {
        auto it = compNodeHash.find(node);
        if (it == compNodeHash.end()) {
            compNodeHash[node] = {CircuitNodeLink{num, ce}};
            order.push_back(node);
        } else
            it->second.push_back(CircuitNodeLink{num, ce});
    };

    compNodeList.emplace();

    for (size_t i = 0; i != compElmList.size(); i++) {
        CircuitElm *ce = compElmList[i];
        StringTokenizer stNodes(compNodeInfo[i], " +\t");
        int thisPost = 0;
        while (stNodes.hasMoreTokens()) {
            int nodeOfThisPost = parseIntStrict(stNodes.nextToken());

            // node = 0 means ground
            if (nodeOfThisPost == 0) {
                ce->setNode(thisPost, CircuitNode::ground);
                thisPost++;
                continue;
            }
            addLink(nodeOfThisPost, thisPost, ce);
            thisPost++;
        }

        // reference nodes: same node numbers, but they land past the posts and
        // internal nodes rather than continuing the post sequence
        if (i >= compRefNodeInfo.size() || compRefNodeInfo[i].empty())
            continue;
        StringTokenizer stRefs(compRefNodeInfo[i], " +\t");
        int thisRef = ce->getRefNodeBase();
        while (stRefs.hasMoreTokens()) {
            int nodeOfThisRef = parseIntStrict(stRefs.nextToken());
            if (nodeOfThisRef == 0) {
                ce->setNode(thisRef, CircuitNode::ground);
                thisRef++;
                continue;
            }
            addLink(nodeOfThisRef, thisRef, ce);
            thisRef++;
        }
    }

    // Flatten compNodeHash in to compNodeList: external nodes first
    for (int id : extNodeIds) {
        auto it = compNodeHash.find(id);
        if (it == compNodeHash.end()) {
            // missing external node
            compNodeList.reset();
            return;
        }
        compNodeList->push_back(it->second);
        compNodeHash.erase(it);
    }
    for (int id : order) {
        auto it = compNodeHash.find(id);
        if (it != compNodeHash.end())
            compNodeList->push_back(it->second);
    }

    // allocate more nodes for sub-elements' internal nodes
    for (CircuitElm *ce : compElmList) {
        int inodes = ce->getInternalNodeCount();
        for (int j = 0; j != inodes; j++)
            compNodeList->push_back({CircuitNodeLink{j + ce->getPostCount(), ce}});
    }

    numNodes = (int) compNodeList->size();
}

void CompositeElm::preStamp() {
    for (CircuitElm *ce : compElmList)
        ce->preStamp();
    buildCompNodeList();
    allocNodes();
}

std::string CompositeElm::dump() {
    return CircuitElm::dump() + dumpElements();
}

std::string CompositeElm::dumpElements(std::optional<long> mask) {
    static const std::regex coords("[A-Za-z0-9]+ 0 0 0 0 ");
    std::string dumpStr;
    for (size_t i = 0; i < compElmList.size(); i++) {
        if (mask && (*mask & (1L << i)) == 0)
            continue;
        std::string tstring = compElmList[i]->dump();
        // remove unused tint x1 y1 x2 y2 coords
        tstring = std::regex_replace(tstring, coords, "", std::regex_constants::format_first_only);
        dumpStr += " " + CustomLogicModel::escape(tstring);
    }
    return dumpStr;
}

void CompositeElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    for (size_t i = 0; i != compElmList.size(); i++) {
        CircuitElm *ce = compElmList[i];
        auto child = std::make_unique<XmlElement>(ce->getXmlDumpType());
        ce->dumpXmlState(doc, child.get());

        // if no state dumped, skip it
        if (child->attrs.empty() && child->children.empty())
            continue;
        child->setAttribute("ix", std::to_string(i));
        elem->appendChild(std::move(child));
    }
}

void CompositeElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    const XmlElement *state = xml.currentXmlElement;

    for (const XmlElement *elem : xml.getChildElements()) {
        xml.parseChildElement(elem);
        int ix = xml.parseIntAttr("ix", -1);
        if (ix < 0 || ix >= (int) compElmList.size()) {
            std::cerr << "ix " << ix << " out of range\n";
            continue;
        }
        CircuitElm *ce = compElmList[ix];
        if (elem->tagName != ce->getXmlDumpType())
            throw std::runtime_error("dump type mismatch for composite child: " + std::to_string(ix));
        ce->undumpXml(xml);
    }

    // restore current XML element so superclasses can finish parsing
    xml.parseChildElement(state);
}

void CompositeElm::reset() {
    for (CircuitElm *ce : compElmList)
        ce->reset();
}

double CompositeElm::getPower() {
    double power = 0;
    for (CircuitElm *ce : compElmList)
        power += ce->getPower();
    return power;
}

void CompositeElm::stamp() {
    for (CircuitElm *ce : compElmList)
        ce->setParentList(compElmList);
}

void CompositeElm::setNode(int p, const NodeRef &n) {
    CircuitElm::setNode(p, n);
    if (!compNodeList)
        return;
    for (const CircuitNodeLink &link : (*compNodeList)[p])
        link.elm->setNode(link.num, n);
}

void CompositeElm::deleteElm() {
    for (CircuitElm *ce : compElmList)
        ce->deleteElm();
    CircuitElm::deleteElm();
}

double CompositeElm::getCurrentIntoNode(int n) {
    double c = 0;
    if (!compNodeList)
        return 0;
    for (const CircuitNodeLink &link : (*compNodeList)[n])
        c += link.elm->getCurrentIntoNode(link.num);
    return c;
}
