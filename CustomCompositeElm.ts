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

import { CompositeElm } from "./CompositeElm";
import { CustomCompositeChipElm } from "./CustomCompositeChipElm";
import { CustomCompositeModel } from "./CustomCompositeModel";
import { ChipElm } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { WireRouter } from "./WireRouter";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CustomLogicModel } from "./CustomLogicModel";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Locale } from "./Locale";
import { CirSim } from "./CirSim";
import { EditCompositeModelDialog } from "./EditCompositeModelDialog";
import { HookRegistry } from "./HookRegistry";

export class CustomCompositeElm extends CompositeElm {
    modelName: string;
    chip: CustomCompositeChipElm = null!;
    postCount: number = 0;
    inputCount: number = 0;
    outputCount: number = 0;
    model: CustomCompositeModel = null!;
    highVoltage: number = 0;
    static lastModelName: string = "default";
    static readonly FLAG_SMALL = 2;

    constructor(xx: number, yy: number);
    constructor(xx: number, yy: number, name: string);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, nameOrXb?: string | number, yb?: number, f?: number, st?: StringTokenizer) {
        if (typeof nameOrXb === "number") {
            // text-dump constructor
            super(xxOrXa, yyOrYa, nameOrXb, yb!, f!);
            this.modelName = CustomLogicModel.unescape(st!.nextToken());
            this.updateModels(st!);
        } else {
            super(xxOrXa, yyOrYa);
            if (typeof nameOrXb === "string") {
                this.modelName = nameOrXb;
            } else {
                // use last model as default when creating new element in UI;
                // use "default" otherwise, to avoid infinite recursion with nested subcircuits
                this.modelName = (xxOrXa === 0 && yyOrYa === 0) ? "default" : CustomCompositeElm.lastModelName;
            }
            this.flags |= CompositeElm.FLAG_ESCAPE;
            if (this.useSmallGrid()) this.flags |= CustomCompositeElm.FLAG_SMALL;
            this.updateModels();
        }
    }

    dumpXmlModel(doc: Document): void {
        // dump models of all children first
        if (this.compElmList) {
            for (const ce of this.compElmList) ce.dumpXmlModel(doc);
        }
        if (!(this.model.builtin || this.model.dumped))
            this.model.dumpXml(doc);
    }

    dumpXml(doc: Document, elem: Element): void {
        this.dumpXmlModel(doc);
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modelName);
        if (this.highVoltage !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "hv", this.highVoltage);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.modelName    = xml.parseStringAttr("mo", this.modelName)!;
        this.highVoltage  = xml.parseDoubleAttr("hv", 0);
        this.updateModels();
        super.undumpXml(xml);
    }

    draw(g: Graphics): void {
        for (let i = 0; i < this.postCount; i++) {
            this.chip.nodes[i] = this.nodes[i];
            this.chip.pins[i].current = this.getCurrentIntoNode(i);
        }
        this.chip.setSelected(this.needsHighlight());
        this.chip.draw(g);
        this.boundingBox = this.chip.boundingBox;
    }

    addRoutingObstacle(router: WireRouter): void {
        this.chip.addRoutingObstacle(router);
    }

    setPoints(): void {
        this.chip = new CustomCompositeChipElm(this.x, this.y);
        this.chip.x2 = this.x2;
        this.chip.y2 = this.y2;
        this.chip.flags = (this.flags & (ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y | ChipElm.FLAG_FLIP_XY));
        if (this.x2 - this.x > this.model.sizeX * 16 && this.isCreating())
            this.flags &= ~CustomCompositeElm.FLAG_SMALL;
        this.chip.setSize((this.flags & CustomCompositeElm.FLAG_SMALL) !== 0 ? 1 : 2);
        this.chip.setLabel((this.model.flags & CustomCompositeModel.FLAG_SHOW_LABEL) !== 0 ? this.model.name : null);

        this.chip.sizeX = this.model.sizeX;
        this.chip.sizeY = this.model.sizeY;
        this.chip.allocPins(this.postCount);
        for (let i = 0; i < this.postCount; i++) {
            const pin = this.model.extList[i];
            this.chip.setPin(i, pin.pos, pin.side, pin.name);
            this.chip.pins[i].busWidth = pin.busWidth;
            this.chip.pins[i].busZ = pin.busZ;
        }

        this.chip.setPoints();
        for (let i = 0; i < this.getPostCount(); i++)
            this.setPost(i, this.chip.getPost(i));
    }

    updateModels(): void;
    updateModels(st: StringTokenizer): void;
    updateModels(st?: StringTokenizer): void {
        if (st !== undefined) {
            this._updateModels(st);
        } else {
            this.model = null!;
            this._updateModels(null);
        }
    }

    private _updateModels(st: StringTokenizer | null): void {
        if (this.model !== null && this.model.name === this.modelName) return;
        this.model = CustomCompositeModel.getModelWithName(this.modelName)!;
        if (!this.model) return;
        this.postCount = this.model.extList.length;
        const externalNodes = new Array(this.postCount);
        for (let i = 0; i < this.postCount; i++)
            externalNodes[i] = this.model.extList[i].node;
        if (st !== null) {
            this.loadComposite(st, this.model.getNodeList(), externalNodes);
        } else {
            this.loadCompositeXml(this.model.getElmEntries(), externalNodes);
        }
        this.propagateHighVoltage();
        this.allocNodes();
        this.setPoints();
    }

    propagateHighVoltage(): void {
        if (this.highVoltage === 0) return;
        for (const ce of this.compElmList) {
            ce.setHighVoltage(this.highVoltage);
            if (ce instanceof CustomCompositeElm)
                (ce as CustomCompositeElm).propagateHighVoltage();
        }
    }

    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    getPostCount(): number { return this.postCount; }
    getPostWidth(n: number): number { return this.chip ? this.chip.getPostWidth(n) : 1; }

    flipX(center2: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_X;
        if (count !== 1) {
            const xs = (this.chip.flippedSizeX + 1) * this.chip.cspc2;
            this.x  = center2 - this.x - xs;
            this.x2 = center2 - this.x2;
        }
        this.setPoints();
    }

    flipY(center2: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_Y;
        if (count !== 1) {
            const xs = (this.chip.flippedSizeY - 1) * this.chip.cspc2;
            this.y  = center2 - this.y - xs;
            this.y2 = center2 - this.y2;
        }
        this.setPoints();
    }

    isFlippedX(): boolean { return (this.flags & ChipElm.FLAG_FLIP_X) !== 0; }
    isFlippedY(): boolean { return (this.flags & ChipElm.FLAG_FLIP_Y) !== 0; }

    flipXY(xmy: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_XY;
        // FLAG_FLIP_XY is applied first, so need to swap X and Y
        if (this.isFlippedX() !== this.isFlippedY())
            this.flags ^= ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y;
        if (count !== 1) {
            this.x += this.chip.cspc2;
            super.flipXY(xmy, count);
            this.x -= this.chip.cspc2;
        }
        this.setPoints();
    }

    // build a display list with all elements including ones skipped by loadCompositeXml
    buildDisplayElmList(): CircuitElm[] {
        const allElms: CircuitElm[] = [...this.compElmList];
        const elmEntries = this.model.getElmEntries();
        const xml = new CircuitXMLDeserializer(CircuitElm.app);
        let compIdx = 0;
        for (const childElem of elmEntries) {
            const tagName = childElem.tagName;
            const className = CirSim.xmlDumpTypeMap.get(tagName);
            if (!className) continue;
            let ce: CircuitElm;
            if (className === "WireElm" || className === "RoutedWireElm" ||
                className === "LabeledNodeElm" || className === "ScopeElm" ||
                className === "GraphicElm" ||
                (className === "GroundElm" && childElem.getAttribute("x") !== null)) {
                ce = CirSim.constructElement(className, 0, 0);
                xml.parseChildElement(childElem);
                ce.undumpXml(xml);
                allElms.push(ce);
            } else {
                ce = this.compElmList[compIdx++];
            }
            ce.setPositionFromXml(childElem);
        }
        return allElms;
    }

    canViewComponents(): boolean {
        const elmEntries = this.model.getElmEntries();
        for (const childElem of elmEntries) {
            if (childElem.getAttribute("x") !== null) return true;
        }
        return false;
    }

    isCustomCompositeElm(): boolean { return true; }

    onDoubleClick(): void {
        if (this.canViewComponents())
            CircuitElm.app.ui.pushSubcircuit(this, this.buildDisplayElmList());
        else if (!CircuitElm.app.ui.isReadOnly())
            CircuitElm.app.commands.doEdit(this);
    }

    getDumpType(): number { return 410; }
    getXmlDumpType(): string { return "cc"; }

    getElmType(): string { return "subcircuit"; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        if (this.model.builtin)
            arr[0] = this.model.name.substring(1);
        else
            arr[0] = "subcircuit (" + this.model.name + ")";
        let a = 1;
        for (let i = 0; i < this.postCount; i++) {
            if (a >= arr.length) break;
            const ent = this.model.extList[i];
            if (ent.busZ > 0) continue;
            if (ent.busWidth > 1) {
                let value = 0;
                for (let j = 0; j < ent.busWidth; j++)
                    if (this.nodes[i + j].v > this.chip.getThreshold())
                        value |= 1 << j;
                arr[a] = ent.name + " = " + value + " / 0x" + value.toString(16).toUpperCase();
            } else {
                arr[a] = ent.name + " = " + CircuitElm.getVoltageText(this.nodes[i].v);
            }
            a++;
        }
    }

    private models: CustomCompositeModel[] = [];

    getEditInfo(n: number): EditInfo | null {
        // if model is internal, don't allow it to be changed
        if (this.model.internal) n += 2;

        if (n === 0) {
            const ei = new EditInfo(EditInfo.makeLink("subcircuits.html", "Model Name"), 0, -1, -1);
            this.models = CustomCompositeModel.getModelList();
            ei.choice = new Choice();
            for (let i = 0; i < this.models.length; i++) {
                const ccm = this.models[i];
                ei.choice.add(ccm.name);
                if (ccm === this.model) ei.choice.select(i);
            }
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Edit Pin Layout") };
            return ei;
        }
        if (n === 2 && this.canViewComponents()) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("View Components") };
            return ei;
        }
        const hvIdx = this.canViewComponents() ? 3 : 2;
        if (n === hvIdx)
            return new EditInfo("High Logic Voltage (0=default)", this.highVoltage, 0, 10);
        if (n === hvIdx + 1 && this.model.canLoadModelCircuit()) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Edit Model") };
            return ei;
        }
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (this.model.internal) n += 2;
        if (n === 0) {
            this.model = this.models[ei.choice.getSelectedIndex()];
            CustomCompositeElm.lastModelName = this.modelName = this.model.name;
            this.updateModels();
            this.setPoints();
            return;
        }
        if (n === 1) {
            if (this.model.name === "default") {
                window.alert(Locale.LS("Can't edit this model."));
                return;
            }
            const dlg = new EditCompositeModelDialog();
            dlg.setModel(this.model);
            dlg.createDialog();
            CirSim.dialogShowing = dlg;
            dlg.show();
            return;
        }
        if (n === 2) {
            CircuitElm.app.ui.pushSubcircuit(this, this.buildDisplayElmList());
            CirSim.editDialog.closeDialog();
        }
        const hvIdx = this.canViewComponents() ? 3 : 2;
        if (n === hvIdx) {
            this.highVoltage = ei.value;
            this.propagateHighVoltage();
        }
        if (n === hvIdx + 1) {
            CircuitElm.app.pushContext(this.model.name);
            if (this.model.modelCircuit !== null)
                CircuitElm.app.readCircuit(this.model.modelCircuit);
            else if (this.model.elmDoc) {
                const xmlDes = new CircuitXMLDeserializer(CircuitElm.app);
                xmlDes.readCircuitFromDoc(this.model.elmDoc);
            }
            CirSim.editDialog.closeDialog();
        }
    }

    getNumHandles(): number { return 0; }
}

HookRegistry.createCustomCompositeElm = (x, y, name) => new CustomCompositeElm(x, y, name);
