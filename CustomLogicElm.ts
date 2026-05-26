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

import { ChipElm, Pin } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { EditDialog } from "./EditDialog";
import { CustomLogicModel } from "./CustomLogicModel";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";
import { Locale } from "./Locale";

export class CustomLogicElm extends ChipElm {
    modelName: string;
    postCount: number = 0;
    inputCount: number = 0;
    outputCount: number = 0;
    model: CustomLogicModel;
    lastValues: boolean[] = [];
    patternValues: boolean[] = new Array(26).fill(false);
    highImpedance: boolean[] = [];
    static lastModelName: string = "default";

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.modelName = CustomLogicElm.lastModelName;
            this.setupPins();
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.modelName = CustomLogicModel.unescape(st!.nextToken());
            this.updateModels();
            for (let i = 0; i !== this.getPostCount(); i++) {
                if (this.pins[i].output) {
                    const v = parseFloat(st!.nextToken()); // this.volts
                    this.pins[i].value = this.nodes[i].v > this.getThreshold();
                }
            }
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        if (!this.model.dumped)
            this.model.dumpXml(doc);
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "mo", this.modelName);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.modelName = xml.parseStringAttr("mo", null) ?? this.modelName;
        this.updateModels();
    }

    updateModels(): void {
        this.model = CustomLogicModel.getModelWithNameOrCopy(this.modelName, this.model ?? null);
        this.setupPins();
        this.allocNodes();
        this.setPoints();
    }

    setupPins(): void {
        if (this.modelName == null) {
            this.postCount = this.bits;
            this.allocNodes();
            return;
        }

        this.model = CustomLogicModel.getModelWithName(this.modelName);
        this.inputCount  = this.model.inputs.length;
        this.outputCount = this.model.outputs.length;
        this.sizeY = this.inputCount > this.outputCount ? this.inputCount : this.outputCount;
        if (this.sizeY === 0)
            this.sizeY = 1;
        this.sizeX = 2;
        this.postCount = this.inputCount + this.outputCount;
        this.pins = new Array(this.postCount);
        for (let i = 0; i !== this.inputCount; i++) {
            this.pins[i] = new Pin(this, i, ChipElm.SIDE_W, this.model.inputs[i]);
            this.pins[i].fixName();
        }
        for (let i = 0; i !== this.outputCount; i++) {
            this.pins[i + this.inputCount] = new Pin(this, i, ChipElm.SIDE_E, this.model.outputs[i]);
            this.pins[i + this.inputCount].output = true;
            this.pins[i + this.inputCount].fixName();
        }
        this.lastValues    = new Array(this.postCount).fill(false);
        this.patternValues = new Array(26).fill(false);
        this.highImpedance = new Array(this.postCount).fill(false);
    }

    getPostCount(): number { return this.postCount; }

    getVoltageSourceCount(): number { return this.outputCount; }

    // keep track of whether we have any tri-state outputs.  if not, then we can simplify things quite a bit, making the simulation faster
    hasTriState(): boolean { return this.model == null ? false : this.model.triState; }

    nonLinear(): boolean { return this.hasTriState(); }

    getInternalNodeCount(): number {
        // for tri-state outputs, we need an internal node to connect a voltage source to, and then connect a resistor from there to the output.
        // we do this for all outputs if any of them are tri-state
        return this.hasTriState() ? this.outputCount : 0;
    }

    stamp(): void {
        const add = this.hasTriState() ? this.outputCount : 0;
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (p.output) {
                CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[i + add], p.voltSource);
                if (this.hasTriState()) {
                    CircuitElm.sim.stampNonLinear(this.nodes[i + add]);
                    CircuitElm.sim.stampNonLinear(this.nodes[i]);
                }
            }
        }
    }

    doStep(): void {
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (!p.output)
                p.value = this.nodes[i].v > this.getThreshold();
        }
        this.execute();
        const add = this.hasTriState() ? this.outputCount : 0;
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (p.output) {
                // connect output voltage source (to internal node if tri-state, otherwise connect directly to output)
                CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[i + add], p.voltSource, p.value ? this.highVoltage : 0);

                // add resistor for tri-state if necessary
                if (this.hasTriState())
                    CircuitElm.sim.stampResistor(this.nodes[i + add], this.nodes[i], this.highImpedance[i] ? 1e8 : 1e-3);
            }
        }
    }

    execute(): void {
        for (let i = 0; i !== this.model.rulesLeft.length; i++) {
            // check for a match
            const rl = this.model.rulesLeft[i];
            let j: number;
            for (j = 0; j !== rl.length; j++) {
                const x = rl.charAt(j);
                if (x === '0' || x === '1') {
                    if (this.pins[j].value === (x === '1'))
                        continue;
                    break;
                }

                // don't care
                if (x === '?')
                    continue;

                // up transition
                if (x === '+') {
                    if (this.pins[j].value && !this.lastValues[j])
                        continue;
                    break;
                }

                // down transition
                if (x === '-') {
                    if (!this.pins[j].value && this.lastValues[j])
                        continue;
                    break;
                }

                // save pattern values
                if (x >= 'a' && x <= 'z') {
                    this.patternValues[x.charCodeAt(0) - 'a'.charCodeAt(0)] = this.pins[j].value;
                    continue;
                }

                // compare pattern values
                if (x >= 'A' && x <= 'Z') {
                    if (this.patternValues[x.charCodeAt(0) - 'A'.charCodeAt(0)] !== this.pins[j].value)
                        break;
                    continue;
                }
            }
            if (j !== rl.length)
                continue;

            // success
            const rr = this.model.rulesRight[i];
            for (j = 0; j !== rr.length; j++) {
                const x = rr.charAt(j);
                this.highImpedance[j + this.inputCount] = false;
                if (x >= 'a' && x <= 'z')
                    this.pins[j + this.inputCount].value = this.patternValues[x.charCodeAt(0) - 'a'.charCodeAt(0)];
                else if (x === '_')
                    this.highImpedance[j + this.inputCount] = true;
                else
                    this.pins[j + this.inputCount].value = (x === '1');
            }
            break;
        }

        // save values for transition checking
        for (let j = 0; j !== this.postCount; j++)
            this.lastValues[j] = this.pins[j].value;
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Model Name", 0, -1, -1);
            ei.text = this.modelName;
            ei.disallowSliders();
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Edit Model") };
            return ei;
        }
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            const newModelName = ei.textf!.value;
            if (this.modelName === newModelName)
                return;
            this.modelName = CustomLogicElm.lastModelName = ei.textf!.value;
            this.model = CustomLogicModel.getModelWithNameOrCopy(this.modelName, this.model);
            this.setupPins();
            this.allocNodes();
            this.setPoints();
            return;
        }
        if (n === 1) {
            const editDialog = new EditDialog(this.model, CirSim.theApp);
            CirSim.customLogicEditDialog = editDialog;
            editDialog.show();
            return;
        }
    }

    getDumpType(): number { return 208; }
    getXmlDumpType(): string { return "cl"; }
    getElmType(): string { return "custom logic"; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        arr[0] = this.model.infoText;
    }
}
