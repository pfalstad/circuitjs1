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
import { VoltageSource } from "./VoltageSource";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Checkbox } from "./Checkbox";

export class LatchElm extends ChipElm {
    readonly FLAG_STATE = 2;
    readonly FLAG_NO_EDGE = 4;
    readonly FLAG_RESET = 8;
    readonly FLAG_SET = 16;
    // enable mode stored in bits 5-6: 0=none, 1=one each, 2=two each
    readonly FLAG_ENABLE_MASK = 32 | 64;
    readonly FLAG_ENABLE_SHIFT = 5;
    readonly FLAG_RESET_INVERT = 128;

    hasReset(): boolean { return (this.flags & this.FLAG_RESET) !== 0; }
    hasSet(): boolean { return (this.flags & this.FLAG_SET) !== 0; }
    resetActiveLow(): boolean { return (this.flags & this.FLAG_RESET_INVERT) !== 0; }
    enableMode(): number { return (this.flags & this.FLAG_ENABLE_MASK) >> this.FLAG_ENABLE_SHIFT; }
    inputEnableCount(): number { return this.enableMode(); }
    outputEnableCount(): number { return this.enableMode(); }
    hasOutputEnable(): boolean { return this.enableMode() > 0; }

    loadPin: number = 0;
    resetPin: number = 0;
    setPin: number = 0;
    ie1Pin: number = 0;
    ie2Pin: number = 0;
    oe1Pin: number = 0;
    oe2Pin: number = 0;
    intNodes: number = 0;
    vSources: VoltageSource[] | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.flags |= this.FLAG_STATE;
            this.setupPins();
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);

            // add FLAG_STATE flag to old latches so their state gets saved
            if ((this.flags & this.FLAG_STATE) === 0) {
                this.flags |= this.FLAG_STATE;
                this.setupPins();
            }
            this.restoreOutputValues();
        }
    }
    getChipName(): string { return this.isEdgeTriggered() ? "Register" : "Latch"; }
    needsBits(): boolean { return true; }
    allowBus(): boolean { return true; }
    isEdgeTriggered(): boolean { return (this.flags & this.FLAG_NO_EDGE) === 0; }
    nonLinear(): boolean { return this.hasOutputEnable(); }

    setupPins(): void {
        this.sizeX = 2;
        const ieCount = this.inputEnableCount();
        const oeCount = this.outputEnableCount();
        const extraLeftPins = (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0) + ieCount;
        const extraRightPins = oeCount;
        const bitsY = this.useBus() ? 1 : this.bits;
        this.sizeY = Math.max(bitsY + 1 + extraLeftPins, bitsY + extraRightPins);
        this.pins = new Array(this.getPostCount());
        this.makeBitPins(this.bits, 0, ChipElm.SIDE_W, 0, "I", false, false, false);
        this.makeBitPins(this.bits, 0, ChipElm.SIDE_E, this.bits, "O", !this.hasOutputEnable(), (this.flags & this.FLAG_STATE) !== 0, false);
        let pinIndex = this.bits * 2;
        let leftPos = bitsY;
        let rightPos = bitsY;

        this.pins[this.loadPin = pinIndex++] = new Pin(this, leftPos++, ChipElm.SIDE_W, this.isEdgeTriggered() ? "" : "Ld");
        this.pins[this.loadPin].clock = this.isEdgeTriggered();
        if (this.hasReset()) {
            this.pins[this.resetPin = pinIndex++] = new Pin(this, leftPos++, ChipElm.SIDE_W, "R");
            this.pins[this.resetPin].lineOver = this.resetActiveLow();
        }
        if (this.hasSet())
            this.pins[this.setPin = pinIndex++] = new Pin(this, leftPos++, ChipElm.SIDE_W, "S");
        rightPos = leftPos;
        if (ieCount >= 1) {
            this.pins[this.ie1Pin = pinIndex++] = new Pin(this, leftPos++, ChipElm.SIDE_W, "IE");
            this.pins[this.ie1Pin].lineOver = true;
        }
        if (ieCount >= 2) {
            this.pins[this.ie2Pin = pinIndex++] = new Pin(this, leftPos++, ChipElm.SIDE_W, "IE");
            this.pins[this.ie2Pin].lineOver = true;
        }
        if (oeCount >= 1) {
            this.pins[this.oe1Pin = pinIndex++] = new Pin(this, rightPos++, ChipElm.SIDE_E, "OE");
            this.pins[this.oe1Pin].lineOver = true;
        }
        if (oeCount >= 2) {
            this.pins[this.oe2Pin = pinIndex++] = new Pin(this, rightPos++, ChipElm.SIDE_E, "OE");
            this.pins[this.oe2Pin].lineOver = true;
        }
        this.intNodes = pinIndex;
        this.allocNodes();
    }

    lastLoad: boolean = false;
    outputValues: boolean[] | null = null;

    lastOutputValues(): boolean[] {
        if (this.outputValues === null)
            this.outputValues = new Array(this.bits).fill(false);
        return this.outputValues;
    }

    restoreOutputValues(): void {
        const ov = this.lastOutputValues();
        for (let i = 0; i !== this.bits; i++)
            ov[i] = this.pins[i + this.bits].value;
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.restoreOutputValues();
    }

    reset(): void {
        super.reset();
        this.outputValues = null;
    }

    // execute() is used by ChipElm.doStep() when there's no output enable.
    // when output enable is present, we override doStep() entirely.
    execute(): void {
        this.doLoad();
        for (let i = 0; i !== this.bits; i++)
            this.pins[i + this.bits].value = this.lastOutputValues()[i];
    }

    // shared load logic
    doLoad(): void {
        if (this.hasSet() && this.pins[this.setPin].value) {
            for (let i = 0; i !== this.bits; i++)
                this.outputValues![i] = true;
            this.lastLoad = this.pins[this.loadPin].value;
            return;
        }
        if (this.hasReset() && (this.pins[this.resetPin].value !== this.resetActiveLow())) {
            for (let i = 0; i !== this.bits; i++)
                this.outputValues![i] = false;
            this.lastLoad = this.pins[this.loadPin].value;
            return;
        }
        let inputEnabled = true;
        if (this.inputEnableCount() >= 1 && this.pins[this.ie1Pin].value)
            inputEnabled = false;
        if (this.inputEnableCount() >= 2 && this.pins[this.ie2Pin].value)
            inputEnabled = false;
        if (inputEnabled && this.pins[this.loadPin].value && (!this.isEdgeTriggered() || !this.lastLoad))
            for (let i = 0; i !== this.bits; i++)
                this.outputValues![i] = this.pins[i].value;
        this.lastLoad = this.pins[this.loadPin].value;
    }

    startIteration(): void {
        if (!this.hasOutputEnable()) {
            super.startIteration();
            return;
        }
        for (let i = 0; i < this.getPostCount(); i++) {
            const p = this.pins[i];
            if (!p.output)
                p.value = this.nodes[i].v > this.getThreshold();
        }
        this.doLoad();
    }

    doStep(): void {
        if (!this.hasOutputEnable()) {
            super.doStep();
            return;
        }

        let outputEnabled = true;
        if (this.outputEnableCount() >= 1 && this.pins[this.oe1Pin].value)
            outputEnabled = false;
        if (this.outputEnableCount() >= 2 && this.pins[this.oe2Pin].value)
            outputEnabled = false;

        for (let i = 0; i < this.bits; i++) {
            const v = this.lastOutputValues()[i] ? this.highVoltage : 0;
            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.intNodes + i], this.vSources![i], v);
            if (outputEnabled)
                CircuitElm.sim.stampResistor(this.nodes[this.intNodes + i], this.nodes[this.bits + i], 1);
            else
                CircuitElm.sim.stampResistor(this.nodes[this.bits + i], CircuitNode.ground, 1e8);
        }
    }

    stamp(): void {
        if (!this.hasOutputEnable()) {
            super.stamp();
            return;
        }
        for (let i = 0; i < this.bits; i++) {
            CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[this.intNodes + i], this.vSources![i]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.intNodes + i]);
            CircuitElm.sim.stampNonLinear(this.nodes[this.bits + i]);
        }
    }

    getVoltageSourceCount(): number { return this.bits; }

    getInternalNodeCount(): number {
        return this.hasOutputEnable() ? this.bits : 0;
    }

    setVoltageSource(j: number, vs: VoltageSource): void {
        if (this.hasOutputEnable()) {
            if (this.vSources === null || this.vSources.length !== this.bits)
                this.vSources = new Array(this.bits);
            this.vSources[j] = vs;
            vs.setNodes(CircuitNode.ground, this.nodes[this.intNodes + j]);
        } else {
            super.setVoltageSource(j, vs);
        }
    }

    getMatrixConnection(n1: number, n2: number): boolean {
        if (this.hasOutputEnable()) {
            for (let i = 0; i < this.bits; i++)
                if (this.comparePair(n1, n2, this.intNodes + i, this.bits + i))
                    return true;
        }
        return false;
    }

    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean {
        if (this.hasOutputEnable())
            return (n1 >= this.bits && n1 < this.bits * 2);
        return this.pins[n1].output;
    }

    getPostCount(): number {
        return this.bits * 2 + 1
            + (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0)
            + this.inputEnableCount() + this.outputEnableCount();
    }
    getDumpType(): number { return 168; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("# of Bits", this.bits, 1, 1).setDimensionless();
        if (n === 1)
            return EditInfo.createCheckbox("Edge Triggered", this.isEdgeTriggered());
        if (n === 2)
            return EditInfo.createCheckbox("Reset Pin", this.hasReset());
        if (n === 3)
            return EditInfo.createCheckbox("Set Pin", this.hasSet());
        if (n === 4) {
            const ei = new EditInfo("Enable Pins", 0);
            ei.choice = new Choice();
            ei.choice.add("None");
            ei.choice.add("1 Input/Output Enable");
            ei.choice.add("2 Input/Output Enables");
            ei.choice.select(this.enableMode());
            return ei;
        }
        if (n === 5 && this.hasReset())
            return EditInfo.createCheckbox("Invert Reset", this.resetActiveLow());
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2 && this.bits !== Math.floor(ei.value)) {
                this.bits = Math.floor(ei.value);
                this.setupPins();
                this.setPoints();
            } else if (ei.value < 2)
                ei.setError("must be >= 2");
        }
        if (n === 1) {
            this.flags = ei.changeFlagInverted(this.flags, this.FLAG_NO_EDGE);
            this.setupPins();
            this.setPoints();
            ei.newDialog = true;
        }
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_RESET);
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 3) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_SET);
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 4) {
            const mode = ei.choice!.getSelectedIndex();
            this.flags = (this.flags & ~this.FLAG_ENABLE_MASK) | (mode << this.FLAG_ENABLE_SHIFT);
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 5) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_RESET_INVERT);
            this.setupPins();
            this.setPoints();
        }
    }
}
