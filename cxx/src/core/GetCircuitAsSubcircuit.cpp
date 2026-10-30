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

#include <algorithm>
#include <cstdlib>

#include "CircuitElm.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "DiodeModel.h"
#include "MosfetModel.h"
#include "RelayModel.h"
#include "SimApp.h"
#include "SimulationManager.h"
#include "SubcircuitModel.h"
#include "TransistorModel.h"
#include "XmlDoc.h"
#include "../elements/ChipElm.h"
#include "../elements/LabeledNodeElm.h"
#include "../elements/SwitchElm.h"

SubcircuitModelRef SimulationManager::getCircuitAsComposite() {
    SimulationManager *sim = this;
    auto elmDoc = std::make_unique<XmlElement>("elms");
    XmlElement *elmRoot = elmDoc.get();
    ModelRegistryBase::clearAllDumpedFlags();

    std::vector<LabeledNodeElm *> sideLabels[4];
    std::vector<ExtListEntry> extList;
    bool sel = app->isSelection();

    // Temporarily open any closed switches so the model's nn node IDs reflect
    // open topology.  buildCompNodeList() can then merge them when loaded closed.
    std::vector<SwitchElm *> closedSwitches;
    for (CircuitElm *ce : app->elmList) {
        if (ce->isSwitchElm() && static_cast<SwitchElm *>(ce)->position == 0) {
            closedSwitches.push_back(static_cast<SwitchElm *>(ce));
            static_cast<SwitchElm *>(ce)->position = 1;
        }
    }

    // redo node allocation to avoid auto-assigning ground
    if (!sim->preStampCircuit(true)) {
        for (SwitchElm *se : closedSwitches)
            se->position = 0;
        return nullptr;
    }

    // restore switch positions
    for (SwitchElm *se : closedSwitches)
        se->position = 0;

    size_t nodeCount = sim->nodeList.size();
    std::vector<bool> used(nodeCount, false);
    std::vector<bool> extnodes(nodeCount, false);

    // find all the labeled nodes, get a list of them, and create a node number map
    for (size_t i = 0; i != sim->elmList.size(); i++) {
        CircuitElm *ce = sim->getElm((int) i);
        if (sel && !ce->isSelected())
            continue;
        if (!ce->isLabeledNodeElm())
            continue;
        LabeledNodeElm *lne = static_cast<LabeledNodeElm *>(ce);
        if (lne->isInternal())
            continue;
        // already added to list?
        if (extnodes[ce->getNode(0)->index])
            continue;

        int side = ChipElm::SIDE_W;
        if (std::abs(ce->dx) >= std::abs(ce->dy) && ce->dx > 0)
            side = ChipElm::SIDE_E;
        if (std::abs(ce->dx) <= std::abs(ce->dy) && ce->dy < 0)
            side = ChipElm::SIDE_N;
        if (std::abs(ce->dx) <= std::abs(ce->dy) && ce->dy > 0)
            side = ChipElm::SIDE_S;

        sideLabels[side].push_back(lne);
        for (int j = 0; j < lne->busWidth; j++) {
            extnodes[ce->getNode(j)->index] = true;
            if (ce->getNode(j)->index == 0) {
                app->alert("Node \"" + lne->text + "\" can't be connected to ground");
                return nullptr;
            }
        }
    }

    auto byY = [](LabeledNodeElm *a, LabeledNodeElm *b) { return a->y < b->y; };
    auto byX = [](LabeledNodeElm *a, LabeledNodeElm *b) { return a->x < b->x; };
    std::stable_sort(sideLabels[ChipElm::SIDE_W].begin(), sideLabels[ChipElm::SIDE_W].end(), byY);
    std::stable_sort(sideLabels[ChipElm::SIDE_E].begin(), sideLabels[ChipElm::SIDE_E].end(), byY);
    std::stable_sort(sideLabels[ChipElm::SIDE_N].begin(), sideLabels[ChipElm::SIDE_N].end(), byX);
    std::stable_sort(sideLabels[ChipElm::SIDE_S].begin(), sideLabels[ChipElm::SIDE_S].end(), byX);

    for (int side = 0; side < 4; side++) {
        for (size_t pos = 0; pos < sideLabels[side].size(); pos++) {
            LabeledNodeElm *lne = sideLabels[side][pos];
            for (int j = 0; j < lne->busWidth; j++) {
                ExtListEntry ent(lne->text, lne->getNode(j)->index, (int) pos, side);
                ent.busWidth = lne->busWidth;
                ent.busZ = j;
                extList.push_back(ent);
            }
        }
    }

    // build list of elements to dump, separating out non-essential elements
    std::vector<CircuitElm *> dumpList;
    std::vector<CircuitElm *> extraList;
    for (CircuitElm *ce : app->elmList) {
        if (sel && !ce->isSelected())
            continue;
        if (ce->isWireElm() || ce->isRoutedWireElm() || ce->isLabeledNodeElm() ||
            ce->isScopeElm() || ce->isGraphicElm() || ce->isGroundElm())
            extraList.push_back(ce);
        else
            dumpList.push_back(ce);
    }
    dumpList.insert(dumpList.end(), extraList.begin(), extraList.end());

    // which node ids the model actually contains, so we can tell whether an expression
    // reference points at something inside the selection
    std::vector<bool> inModel(nodeCount, false);
    for (CircuitElm *ce : dumpList)
        for (int j = 0; j != ce->getPostCount(); j++)
            inModel[ce->getNode(j)->index] = true;

    // output all the elements as XML
    for (CircuitElm *ce : dumpList) {
        std::string nn;
        for (int j = 0; j != ce->getPostCount(); j++) {
            int n = ce->getNode(j)->index;
            used[n] = true;
            if (!nn.empty())
                nn += " ";
            nn += std::to_string(n);
        }
        // Nodes an expression refers to by name (v(label)/i(label)).  The name was already
        // resolved to a node by the preStampCircuit() above, so we record the number and
        // the model carries no names at all: references become per-instance by
        // construction, and can't collide with names outside the subcircuit.
        std::string rn;
        for (int j = 0; j != ce->getRefNodeCount(); j++) {
            int n = ce->getNode(ce->getRefNodeBase() + j)->index;
            if (n != 0 && !inModel[n]) {
                app->alert("Element \"" + ce->getElmType() + "\" refers to a node outside the selection");
                for (SwitchElm *se : closedSwitches)
                    se->position = 0;
                return nullptr;
            }
            used[n] = true;
            if (!rn.empty())
                rn += " ";
            rn += std::to_string(n);
        }
        auto child = std::make_unique<XmlElement>(ce->getXmlDumpType());
        CircuitXMLSerializer::dumpAttr(child.get(), "nn", nn);
        if (!rn.empty())
            CircuitXMLSerializer::dumpAttr(child.get(), "rn", rn);
        ce->dumpXml(elmRoot, child.get());
        // remove child elements (state) since this is a model definition, not an instance
        child->children.clear();
        elmRoot->appendChild(std::move(child));
    }

    for (const ExtListEntry &ent : extList) {
        if (!used[ent.node]) {
            app->alert("Node \"" + ent.name + "\" is not used!");
            return nullptr;
        }
    }

    std::string pretty = CircuitXMLSerializer::prettyPrint(elmRoot);
    SubcircuitModelRef ccm = SubcircuitModel::createModel("", std::move(elmDoc), extList);
    console("created model " + pretty);
    return ccm;
}
