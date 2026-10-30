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

#include "SubcircuitElm.h"

#include <cstdio>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/ElementFactory.h"
#include "../core/Locale.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"

std::string SubcircuitElm::lastModelName = "default";

SubcircuitElm::SubcircuitElm(int xx, int yy) : CompositeElm(xx, yy) {
    // use last model as default when creating new element in UI;
    // use "default" otherwise, to avoid infinite recursion with nested subcircuits
    modelName = (xx == 0 && yy == 0) ? "default" : lastModelName;
    flags |= FLAG_ESCAPE;
    if (useSmallGrid())
        flags |= FLAG_SMALL;
    updateModels();
}

SubcircuitElm::SubcircuitElm(int xx, int yy, const std::string &name) : CompositeElm(xx, yy) {
    modelName = name;
    flags |= FLAG_ESCAPE;
    if (useSmallGrid())
        flags |= FLAG_SMALL;
    updateModels();
}

SubcircuitElm::SubcircuitElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : CompositeElm(xa, ya, xb, yb, f) {
    modelName = CustomLogicModel::unescape(st.nextToken());
    updateModelsFrom(&st);
}

void SubcircuitElm::dumpXmlModel(XmlElement *doc) {
    // dump models of all children first
    for (CircuitElm *ce : compElmList)
        ce->dumpXmlModel(doc);
    // model may be missing (e.g. wasn't available under its scope in this circuit); modelName
    // is still dumped by dumpXml() so the reference is preserved for a future retry
    if (model != nullptr && !(model->builtin || model->dumped))
        model->dumpXml(doc);
}

void SubcircuitElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    dumpXmlModel(doc);
    CompositeElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "mo", modelName);
    if (highVoltage != 0)
        CircuitXMLSerializer::dumpAttr(elem, "hv", highVoltage);
}

void SubcircuitElm::undumpXml(CircuitXMLDeserializer &xml) {
    modelName = xml.parseStringAttr("mo", modelName).value_or(modelName);
    highVoltage = xml.parseDoubleAttr("hv", highVoltage);
    updateModels();
    CompositeElm::undumpXml(xml);
}

void SubcircuitElm::draw(Graphics &g) {
    for (int i = 0; i < postCount; i++) {
        chip->nodes[i] = nodes[i];
        chip->pins[i].current = getCurrentIntoNode(i);
    }
    chip->setSelected(needsHighlight());
    chip->draw(g);
}

void SubcircuitElm::addRoutingObstacle(WireRouter &router) {
    chip->addRoutingObstacle(router);
}

void SubcircuitElm::setPoints() {
    chip.reset(SubcircuitChipElm::create(x, y));
    chip->x2 = x2;
    chip->y2 = y2;
    chip->flags = (flags & (ChipElm::FLAG_FLIP_X | ChipElm::FLAG_FLIP_Y | ChipElm::FLAG_FLIP_XY));

    if (model == nullptr) {
        // model couldn't be resolved (missing/not in scope); draw as a labeled placeholder
        // instead of crashing, so the rest of the circuit stays usable
        chip->setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
        chip->setLabel(std::string("?"));
        chip->sizeX = chip->sizeY = 2;
        chip->allocPins(0);
        chip->allocNodes();
        chip->setPoints();
        boundingBox = chip->boundingBox;
        return;
    }

    if (x2 - x > model->sizeX * 16 && isCreating())
        flags &= ~FLAG_SMALL;
    chip->setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
    chip->setLabel((model->flags & SubcircuitModel::FLAG_SHOW_LABEL) != 0 ? std::optional<std::string>(model->name)
                                                                          : std::nullopt);

    chip->sizeX = model->sizeX;
    chip->sizeY = model->sizeY;
    chip->allocPins(postCount);
    for (int i = 0; i < postCount; i++) {
        const ExtListEntry &pin = model->extList[i];
        chip->setPin(i, pin.pos, pin.side, pin.name);
        chip->pins[i].busWidth = pin.busWidth;
        chip->pins[i].busZ = pin.busZ;
    }
    // (the TS version's chip.nodes array grows as draw() fills it in)
    chip->allocNodes();

    chip->setPoints();
    boundingBox = chip->boundingBox;
    for (int i = 0; i < getPostCount(); i++)
        setPost(i, chip->getPost(i));
}

void SubcircuitElm::updateModels() {
    // rebuilding from the same model (e.g. after it was edited): keep the inner
    // elements' state (SRAM contents etc.), matched up by index
    std::unique_ptr<XmlElement> state;
    if (builtModelName == modelName && !compElmList.empty()) {
        state = std::make_unique<XmlElement>("cir");
        dumpXmlState(state.get(), state.get());
    }
    model = nullptr;
    updateModelsFrom(nullptr);
    if (state && model != nullptr) {
        CircuitXMLDeserializer xml(app);
        xml.parseChildElement(state.get());
        try {
            undumpChildState(xml, true);
        } catch (const std::exception &e) {
            SimulationManager::console(std::string("couldn't restore subcircuit state: ") + e.what());
        }
    }
}

void SubcircuitElm::updateModelsFrom(StringTokenizer *st) {
    if (model != nullptr && model->name == modelName)
        return;
    model = SubcircuitModel::getModelWithName(modelName);
    if (model == nullptr) {
        // referenced subcircuit model isn't available (e.g. not in scope in this circuit).
        // fall back to an empty/placeholder state instead of leaving fields uninitialized,
        // so the rest of the circuit keeps working; modelName is preserved so a later
        // updateModels() call (if the model becomes available) can still resolve it
        postCount = 0;
        clearChildren();
        builtModelName.reset();
        numPosts = numNodes = 0;
        posts.clear();
        allocNodes();
        setPoints();
        return;
    }
    postCount = (int) model->extList.size();
    std::vector<int> externalNodes(postCount);
    for (int i = 0; i < postCount; i++)
        externalNodes[i] = model->extList[i].node;
    if (st != nullptr)
        loadComposite(st, model->getNodeList(), externalNodes);
    else
        loadCompositeXml(model->getElmEntries(), externalNodes);
    builtModelName = model->name;
    propagateHighVoltage();
    allocNodes();
    setPoints();
}

void SubcircuitElm::propagateHighVoltage() {
    if (highVoltage == 0)
        return;
    for (CircuitElm *ce : compElmList) {
        ce->setHighVoltage(highVoltage);
        if (SubcircuitElm *se = dynamic_cast<SubcircuitElm *>(ce))
            se->propagateHighVoltage();
    }
}

void SubcircuitElm::flipX(int center2, int count) {
    flags ^= ChipElm::FLAG_FLIP_X;
    if (count != 1) {
        int xs = (chip->flippedSizeX + 1) * chip->cspc2;
        x = center2 - x - xs;
        x2 = center2 - x2;
    }
    setPoints();
}

void SubcircuitElm::flipY(int center2, int count) {
    flags ^= ChipElm::FLAG_FLIP_Y;
    if (count != 1) {
        int xs = (chip->flippedSizeY - 1) * chip->cspc2;
        y = center2 - y - xs;
        y2 = center2 - y2;
    }
    setPoints();
}

void SubcircuitElm::flipXY(int xmy, int count) {
    flags ^= ChipElm::FLAG_FLIP_XY;
    // FLAG_FLIP_XY is applied first, so need to swap X and Y
    if (isFlippedX() != isFlippedY())
        flags ^= ChipElm::FLAG_FLIP_X | ChipElm::FLAG_FLIP_Y;
    if (count != 1) {
        x += chip->cspc2;
        CompositeElm::flipXY(xmy, count);
        x -= chip->cspc2;
    }
    setPoints();
}

std::vector<CircuitElm *> SubcircuitElm::buildDisplayElmList() {
    std::vector<CircuitElm *> allElms(compElmList.begin(), compElmList.end());
    displayElms.clear();
    CircuitXMLDeserializer xml(app);
    size_t compIdx = 0;
    for (const XmlElement *childElem : model->getElmEntries()) {
        const std::string *className = ElementFactory::xmlClassName(childElem->tagName);
        if (className == nullptr)
            continue;
        CircuitElm *ce;
        if (*className == "WireElm" || *className == "RoutedWireElm" ||
            *className == "LabeledNodeElm" || *className == "ScopeElm" ||
            *className == "GraphicElm" ||
            (*className == "GroundElm" && childElem->hasAttribute("x"))) {
            ce = ElementFactory::constructElement(*className, 0, 0);
            if (ce == nullptr)
                continue;
            displayElms.emplace_back(ce);
            xml.parseChildElement(childElem);
            ce->undumpXml(xml);
            allElms.push_back(ce);
        } else {
            if (compIdx >= compElmList.size())
                continue;
            ce = compElmList[compIdx++];
        }
        ce->setPositionFromXml(childElem);
    }
    return allElms;
}

bool SubcircuitElm::onDoubleClick() {
    if (!canViewComponents())
        return false;
    // the first click of the double-click brought up our properties; hide them
    app->closeEditDialog();
    app->pushSubcircuit(this, buildDisplayElmList());
    return true;
}

bool SubcircuitElm::canViewComponents() {
    if (model == nullptr)
        return false;
    for (const XmlElement *childElem : model->getElmEntries())
        if (childElem->hasAttribute("x"))
            return true;
    return false;
}

void SubcircuitElm::getInfo(std::vector<std::string> &arr) {
    CompositeElm::getInfo(arr);
    if (model == nullptr) {
        arr[0] = Locale::LS("subcircuit") + " (" + Locale::LS("missing: ") + modelName + ")";
        return;
    }
    if (model->builtin && model->name.rfind("~", 0) == 0)
        arr[0] = model->name.substr(1);
    else
        arr[0] = "subcircuit (" + model->name + ")";
    size_t a = 1;
    for (int i = 0; i < postCount; i++) {
        if (a >= arr.size())
            break;
        const ExtListEntry &ent = model->extList[i];
        if (ent.busZ > 0)
            continue;
        if (ent.busWidth > 1) {
            int value = 0;
            for (int j = 0; j < ent.busWidth; j++)
                if (nodes[i + j]->v > chip->getThreshold())
                    value |= 1 << j;
            char buf[16];
            std::snprintf(buf, sizeof(buf), "%X", value);
            arr[a] = ent.name + " = " + std::to_string(value) + " / 0x" + buf;
        } else {
            arr[a] = ent.name + " = " + getVoltageText(nodes[i]->v);
        }
        a++;
    }
}

std::optional<EditInfo> SubcircuitElm::getEditInfo(int n) {
    // if model is internal, don't allow it to be changed
    if (model != nullptr && model->internal)
        n += 2;

    if (n == 0) {
        std::string label = (model == nullptr) ? Locale::LS("Model not found: ") + modelName
                                               : EditInfo::makeLink("subcircuits.html", "Model Name");
        EditInfo ei(label, 0, -1, -1);
        models = SubcircuitModel::getModelList();
        ei.choice = Choice();
        for (size_t i = 0; i < models.size(); i++) {
            ei.choice->add(models[i]->name);
            if (models[i] == model)
                ei.choice->select((int) i);
        }
        return ei;
    }
    // remaining fields all depend on having a resolved model
    if (model == nullptr)
        return std::nullopt;
    if (n == 1) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Edit Pin Layout")};
        return ei;
    }
    if (n == 2 && canViewComponents()) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("View Components")};
        return ei;
    }
    int hvIdx = canViewComponents() ? 3 : 2;
    if (n == hvIdx)
        return EditInfo("High Logic Voltage (0=default)", highVoltage, 0, 10).setUnitStep();
    if (n == hvIdx + 1 && model->canLoadModelCircuit()) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Edit Model")};
        return ei;
    }
    return std::nullopt;
}

void SubcircuitElm::setEditValue(int n, EditInfo &ei) {
    if (model != nullptr && model->internal)
        n += 2;
    if (n == 0) {
        model = models[ei.choice->getSelectedIndex()];
        lastModelName = modelName = model->name;
        updateModels();
        setPoints();
        return;
    }
    if (model == nullptr)
        return;
    if (n == 1) {
        if (model->name == "default") {
            app->alert(Locale::LS("Can't edit this model."));
            return;
        }
        app->editSubcircuitPinLayout(model);
        return;
    }
    if (n == 2 && canViewComponents()) {
        app->closeEditDialog();
        app->pushSubcircuit(this, buildDisplayElmList());
        return;
    }
    int hvIdx = canViewComponents() ? 3 : 2;
    if (n == hvIdx) {
        highVoltage = ei.value;
        propagateHighVoltage();
    }
    if (n == hvIdx + 1) {
        SubcircuitModelRef m = model;
        // (closing the dialog may delete us)
        app->closeEditDialog();
        app->pushContext(m->name);
        if (m->modelCircuit)
            app->readCircuit(*m->modelCircuit);
        else if (m->elmDoc)
            app->readCircuitFromDoc(m->elmDoc.get());
    }
}
