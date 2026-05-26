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

import { SRAMElm } from "./SRAMElm";
import { ChipElm, Pin } from "./ChipElm";
import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { StringTokenizer } from "./StringTokenizer";

export class ROMElm extends SRAMElm {

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
        }
    }

    getChipName(): string { return "ROM"; }
    getDumpType(): number { return 436; }

    // no WE pin; just OE + address + data
    setupPins(): void {
	if (this.addressBits === undefined)
	    this.addressBits = 0;
        if (this.addressBits === 0)
            this.addressBits = this.dataBits = 4;
        this.sizeX = 2;
        const addrY = this.useBus() ? 1 : this.addressBits;
        const dataY = this.useBus() ? 1 : this.dataBits;
        this.sizeY = Math.max(addrY, dataY) + 1;
        this.bits = this.addressBits;
        this.pins = new Array(this.getPostCount());

        // OE (active low) at top-left
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "OE");
        this.pins[0].lineOver = true;

        this.addressNodes = 1;
        this.dataNodes = 1 + this.addressBits;
        this.internalNodes = 1 + this.addressBits + this.dataBits;

        this.makeBitPins(this.addressBits, this.sizeY - addrY, ChipElm.SIDE_W, this.addressNodes, "A", false, false, true);
        this.makeBitPins(this.dataBits, this.sizeY - dataY, ChipElm.SIDE_E, this.dataNodes, "D", true, false, true);
        this.allocNodes();
    }

    getPostCount(): number {
        return 1 + this.addressBits + this.dataBits;
    }

    doStep(): void {
        const outputEnabled = this.nodes[0].v < this.getThreshold();

        // get address
        this.address = 0;
        for (let i = 0; i !== this.addressBits; i++)
            this.address |= (this.nodes[this.addressNodes + i].v > this.getThreshold()) ? 1 << (this.addressBits - 1 - i) : 0;

        const dataObj = this.map.get(this.address);
        const data = (dataObj === undefined) ? 0 : dataObj;
        for (let i = 0; i !== this.dataBits; i++) {
            const p = this.pins[i + this.dataNodes];
            CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[this.internalNodes + i], p.voltSource,
                (data & (1 << (this.dataBits - 1 - i))) === 0 ? 0 : this.highVoltage);

            // if output enabled, stamp a small resistor from internal voltage source to data pin.
            // if output disabled, stamp a large pulldown resistor from data pin to ground.
            if (outputEnabled)
                CircuitElm.sim.stampResistor(this.nodes[this.internalNodes + i], this.nodes[this.dataNodes + i], 1);
            else
                CircuitElm.sim.stampResistor(this.nodes[this.dataNodes + i], CircuitNode.ground, 1e8);
        }
    }

    // no writing
    stepFinished(): void {}
}
