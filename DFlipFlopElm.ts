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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { appendInfoLine, digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import { chipStart, i1 as internalQ, POS_EDGE_PIN as posEdge } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class DFlipFlopElm extends ChipElm {
    static readonly FLAG_RESET            = 2;
    static readonly FLAG_SET              = 4;
    static readonly FLAG_INVERT_SET_RESET = 8;

    hasReset():       boolean { return (this.flags & DFlipFlopElm.FLAG_RESET) !== 0 || this.hasSet(); }
    hasSet():         boolean { return (this.flags & DFlipFlopElm.FLAG_SET) !== 0; }
    invertSetReset(): boolean { return (this.flags & DFlipFlopElm.FLAG_INVERT_SET_RESET) !== 0; }

    // matches dice-ts's 7474 clock-to-Q delay (~/Projects/dice-ts/src/chips/7474.ts)
    propagationDelay: number = 10.0e-9;

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        appendInfoLine(arr, "opt Q: " + digitalStateTextForOutput(this, 0));
        appendInfoLine(arr, "opt /Q: " + digitalStateTextForOutput(this, 1));
    }

    /** Phase 3 (see noble-stirring-rabin.md), revised: matches dice-ts's real chips/7474.ts
     * structure, which this originally didn't - the state cell computes Q onto an INTERNAL pin
     * (own prevOutputPin, per-pin post index -> pin number is postIndex+1 throughout otherwise,
     * matching GateElm.digitalSynthesis()'s convention) rather than the real external Q pin
     * directly; a separate buffer cell copies that onto the real Q pin, and /Q is derived from
     * the SAME internal pin, not from the buffered external one. So the state cell's only
     * consumers are ever its own two same-macro siblings (the buffer and /Q) - never whatever
     * external element happens to be wired to this flip-flop's real Q pin.
     *
     * That indirection matters far beyond matching the reference chip byte-for-byte: chip.ts's
     * ASLEEP/promotion machinery lets a chip stop needing live pushes to a given consumer only
     * once THAT CONSUMER completes a "catch my upstream still mid-relearning" handshake at its
     * own next activation (activateInputs() in chip.ts) - and it needs to happen for every
     * consumer before the chip can go fully quiet. Wire external consumers straight to the state
     * cell (as this used to) and its consumer set is whatever the rest of the circuit happens to
     * be - here, in a self-resetting counter's reset path, that's every bit of every counter
     * reset feeds, all of which have their own independent, slow-to-align activation schedules.
     * Confirmed empirically: a synthetic single-counter-plus-flip-flop self-reset circuit (no
     * second counter, nothing else) made ZERO promotion progress after 500,000 clock periods
     * with the direct-to-Qpin version, forever; wired the dice-ts way (buffer decouples the state
     * cell down to just 2 fixed, local, fast-settling consumers), the equivalent dice-ts circuit
     * settles within tens of periods. /Q isn't strictly !Q during a set/reset collision - see
     * evaluate()'s own docstring - so notQ re-derives the same isSet/isReset override rather than
     * simply inverting the buffered Q. */
    digitalSynthesis(): DigitalSynthesis {
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const Dpin = 1, Qpin = 2, notQpin = 3, clkPin = 4;
        const hasR = this.hasReset(), hasS = this.hasSet();
        const Rpin = hasR ? 5 : 0;
        const Spin = hasS ? 6 : 0;
        const invertBit = this.invertSetReset() ? 1 : 0;

        const stateIn: number[] = [Dpin, clkPin];
        if (hasR) stateIn.push(Rpin);
        if (hasS) stateIn.push(Spin);

        const state: ChipLogic = (pin, prevPin, eventPin) => {
            const isSet = hasS ? (pin[Spin] ^ invertBit) : 0;
            const isReset = hasR ? (pin[Rpin] ^ invertBit) : 0;
            if (isSet || isReset) pin[internalQ] = isSet;
            else if (posEdge(pin, eventPin, clkPin)) pin[internalQ] = pin[Dpin];
            else pin[internalQ] = prevPin[internalQ];
        };

        const qBuf: ChipLogic = (pin) => { pin[Qpin] = pin[internalQ]; };

        const notQIn: number[] = [internalQ];
        if (hasR) notQIn.push(Rpin);
        if (hasS) notQIn.push(Spin);
        const notQ: ChipLogic = (pin) => {
            const isSet = hasS ? (pin[Spin] ^ invertBit) : 0;
            const isReset = hasR ? (pin[Rpin] ^ invertBit) : 0;
            pin[notQpin] = (isSet || isReset) ? isReset : (pin[internalQ] ^ 1);
        };

        const desc: ChipDesc[] = [
            chipStart(state).inputPins(...stateIn).eventPins(clkPin).outputPin(internalQ).prevOutputPin(internalQ)
                .outputDelayS(this.propagationDelay, this.propagationDelay),
            chipStart(qBuf).inputPins(internalQ).outputPin(Qpin),
            chipStart(notQ).inputPins(...notQIn).outputPin(notQpin),
        ];
        return { desc, pinMap };
    }

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            this.pins[2].value = !this.pins[1].value;
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            this.pins[2].value = !this.pins[1].value;
        }
    }

    getChipName(): string { return "D flip-flop"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 3;
        this.pins = new Array(this.getPostCount());
        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "D");
        this.pins[1] = new Pin(this, 0, ChipElm.SIDE_E, "Q");
        this.pins[1].output = this.pins[1].state = true;
        this.pins[2] = new Pin(this, this.hasSet() ? 1 : 2, ChipElm.SIDE_E, "Q");
        this.pins[2].output = true;
        this.pins[2].lineOver = true;
        this.pins[3] = new Pin(this, 1, ChipElm.SIDE_W, "");
        this.pins[3].clock = true;
        if (!this.hasSet()) {
            if (this.hasReset()) {
                this.pins[4] = new Pin(this, 2, ChipElm.SIDE_W, "R");
                this.pins[4].bubble = this.invertSetReset();
            }
        } else {
            this.pins[5] = new Pin(this, 2, ChipElm.SIDE_W, "S");
            this.pins[4] = new Pin(this, 2, ChipElm.SIDE_E, "R");
            this.pins[4].bubble = this.pins[5].bubble = this.invertSetReset();
        }
    }

    getPostCount(): number {
        return 4 + (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0);
    }

    getVoltageSourceCount(): number { return 2; }

    execute(): void {
        let isSet   = false;
        let isReset = false;

        if (this.hasSet()   && this.pins[5].value !== this.invertSetReset()) isSet   = true;
        if (this.hasReset() && this.pins[4].value !== this.invertSetReset()) isReset = true;

        if (isSet || isReset) {
            this.writeOutput(1, false);
            this.writeOutput(2, false);
            if (isSet)   this.writeOutput(1, true);
            if (isReset) this.writeOutput(2, true);
        } else {
            if (this.pins[3].value && !this.lastClock)
                this.writeOutput(1, this.pins[0].value);
            this.writeOutput(2, !this.pins[1].value);
        }

        this.lastClock = this.pins[3].value;
    }

    getDumpType(): number { return 155; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Reset Pin", this.hasReset());
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Set Pin", this.hasSet());
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Invert Set/Reset", this.invertSetReset());
            return ei;
        }
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.checkbox!.getState())
                this.flags |= DFlipFlopElm.FLAG_RESET;
            else
                this.flags &= ~DFlipFlopElm.FLAG_RESET | DFlipFlopElm.FLAG_SET;
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 1) {
            if (ei.checkbox!.getState())
                this.flags |= DFlipFlopElm.FLAG_SET;
            else
                this.flags &= ~DFlipFlopElm.FLAG_SET;
            this.setupPins();
            this.allocNodes();
            this.setPoints();
        }
        if (n === 2) {
            this.flags = ei.changeFlag(this.flags, DFlipFlopElm.FLAG_INVERT_SET_RESET);
            this.setupPins();
            this.setPoints();
        }
        super.setChipEditValue(n, ei);
    }
}
