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

import { ChipElm } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { SubcircuitModel } from "./SubcircuitModel";
import { CustomLogicModel } from "./CustomLogicModel";
import { DiodeModel } from "./DiodeModel";
import { ExtListEntry } from "./ExtListEntry";
import { HookRegistry } from "./HookRegistry";
import { LabeledNodeElm } from "./LabeledNodeElm";
import { RelayModel } from "./RelayModel";
import { SimulationManager } from "./SimulationManager";
import { SwitchElm } from "./SwitchElm";
import { TransistorModel } from "./TransistorModel";

function getCircuitAsComposite(sim: SimulationManager): SubcircuitModel | null {
    const elmDoc = document.implementation.createDocument(null, "elms");
    const elmRoot = elmDoc.documentElement;
    CustomLogicModel.clearDumpedFlags();
    DiodeModel.clearDumpedFlags();
    TransistorModel.clearDumpedFlags();
    RelayModel.clearDumpedFlags();

    const sideLabels: LabeledNodeElm[][] = [[], [], [], []];
    const extList: ExtListEntry[] = [];
    const sel = sim.app.isSelection();

    // Temporarily open any closed switches so the model's nn node IDs reflect
    // open topology.  buildCompNodeList() can then merge them when loaded closed.
    const closedSwitches: SwitchElm[] = [];
    for (let i = 0; i !== sim.app.elmList.length; i++) {
        const ce = sim.app.elmList[i];
        if (ce.isSwitchElm() && (ce as SwitchElm).position === 0) {
            closedSwitches.push(ce as SwitchElm);
            (ce as SwitchElm).position = 1;
        }
    }

    // redo node allocation to avoid auto-assigning ground
    if (!sim.preStampCircuit(true)) {
        for (const se of closedSwitches) se.position = 0;
        return null;
    }

    // restore switch positions
    for (const se of closedSwitches) se.position = 0;

    const nodeCount = sim.nodeList.length;
    const used: boolean[] = new Array(nodeCount).fill(false);
    const extnodes: boolean[] = new Array(nodeCount).fill(false);

    // find all the labeled nodes, get a list of them, and create a node number map
    for (let i = 0; i !== sim.elmList.length; i++) {
        const ce = sim.getElm(i) as CircuitElm;
        if (sel && !ce.isSelected()) continue;
        if (!ce.isLabeledNodeElm()) continue;
        const lne = ce as LabeledNodeElm;
        if (lne.isInternal()) continue;
        // already added to list?
        if (extnodes[ce.getNode(0).index]) continue;

        let side = ChipElm.SIDE_W;
        if (Math.abs(ce.dx) >= Math.abs(ce.dy) && ce.dx > 0) side = ChipElm.SIDE_E;
        if (Math.abs(ce.dx) <= Math.abs(ce.dy) && ce.dy < 0) side = ChipElm.SIDE_N;
        if (Math.abs(ce.dx) <= Math.abs(ce.dy) && ce.dy > 0) side = ChipElm.SIDE_S;

        sideLabels[side].push(lne);
        for (let j = 0; j < lne.busWidth; j++) {
            extnodes[ce.getNode(j).index] = true;
            if (ce.getNode(j).index === 0) {
                window.alert('Node "' + lne.text + '" can\'t be connected to ground');
                return null;
            }
        }
    }

    sideLabels[ChipElm.SIDE_W].sort((a, b) => a.y - b.y);
    sideLabels[ChipElm.SIDE_E].sort((a, b) => a.y - b.y);
    sideLabels[ChipElm.SIDE_N].sort((a, b) => a.x - b.x);
    sideLabels[ChipElm.SIDE_S].sort((a, b) => a.x - b.x);

    for (let side = 0; side < sideLabels.length; side++) {
        for (let pos = 0; pos < sideLabels[side].length; pos++) {
            const lne = sideLabels[side][pos];
            for (let j = 0; j < lne.busWidth; j++) {
                const ent = new ExtListEntry(lne.text, lne.getNode(j).index, pos, side);
                ent.busWidth = lne.busWidth;
                ent.busZ = j;
                extList.push(ent);
            }
        }
    }

    // build list of elements to dump, separating out non-essential elements
    const dumpList: CircuitElm[] = [];
    const extraList: CircuitElm[] = [];
    for (let i = 0; i !== sim.app.elmList.length; i++) {
        const ce = sim.app.elmList[i] as CircuitElm;
        if (sel && !ce.isSelected()) continue;
        if (ce.isWireElm() || ce.isRoutedWireElm() || ce.isLabeledNodeElm() ||
                ce.isScopeElm() || ce.isGraphicElm() || ce.isGroundElm()) {
            extraList.push(ce);
        } else {
            dumpList.push(ce);
        }
    }
    dumpList.push(...extraList);

    // which node ids the model actually contains, so we can tell whether an expression
    // reference points at something inside the selection
    const inModel: boolean[] = new Array(nodeCount).fill(false);
    for (const ce of dumpList)
        for (let j = 0; j !== ce.getPostCount(); j++)
            inModel[ce.getNode(j).index] = true;

    // output all the elements as XML
    for (let i = 0; i !== dumpList.length; i++) {
        const ce = dumpList[i];
        let nn = "";
        for (let j = 0; j !== ce.getPostCount(); j++) {
            const n = ce.getNode(j).index;
            used[n] = true;
            if (nn.length > 0) nn += " ";
            nn += n;
        }
        // Nodes an expression refers to by name (v(label)/i(label)).  The name was already
        // resolved to a node by the preStampCircuit() above, so we record the number and
        // the model carries no names at all: references become per-instance by
        // construction, and can't collide with names outside the subcircuit.
        let rn = "";
        for (let j = 0; j !== ce.getRefNodeCount(); j++) {
            const n = ce.getNode(ce.getRefNodeBase() + j).index;
            if (n !== 0 && !inModel[n]) {
                window.alert('Element "' + ce.getElmType() +
                    '" refers to a node outside the selection');
                for (const se of closedSwitches) se.position = 0;
                return null;
            }
            used[n] = true;
            if (rn.length > 0) rn += " ";
            rn += n;
        }
        const child = elmDoc.createElement(ce.getXmlDumpType());
        CircuitXMLSerializer.dumpAttr(child, "nn", nn);
        if (rn.length > 0)
            CircuitXMLSerializer.dumpAttr(child, "rn", rn);
        ce.dumpXml(elmDoc, child);
        // remove child elements (state) since this is a model definition, not an instance
        let cn = child.firstChild;
        while (cn !== null) {
            const next = cn.nextSibling;
            if (cn.nodeType === Node.ELEMENT_NODE)
                child.removeChild(cn);
            cn = next;
        }
        elmRoot.appendChild(child);
    }

    for (let i = 0; i !== extList.length; i++) {
        const ent = extList[i];
        if (!used[ent.node]) {
            window.alert('Node "' + ent.name + '" is not used!');
            return null;
        }
    }

    const ccm = SubcircuitModel.createModel("", elmDoc, extList);
    SimulationManager.console("created model " + CircuitXMLSerializer.prettyPrint(elmDoc));
    return ccm;
}

HookRegistry.getCircuitAsComposite = (sim) => getCircuitAsComposite(sim as SimulationManager);
