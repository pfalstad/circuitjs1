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
import { Checkbox } from "./Checkbox";

export class TimerElm extends ChipElm {
    static readonly FLAG_RESET   = 2;
    static readonly FLAG_GROUND  = 4;
    static readonly FLAG_NUMBERS = 8;

    static readonly N_DIS   = 0;
    static readonly N_TRIG  = 1;
    static readonly N_THRES = 2;
    static readonly N_VCC   = 3;
    static readonly N_CTL   = 4;
    static readonly N_OUT   = 5;
    static readonly N_RST   = 6;
    static readonly N_GND   = 7;

    getDefaultFlags(): number { return TimerElm.FLAG_RESET | TimerElm.FLAG_GROUND; }

    ground: CircuitNode;
    out: boolean = false;
    triggerSuppressed: boolean = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
        }
    }

    getChipName(): string { return "555 Timer"; }

    setupPins(): void {
        this.sizeX = 3;
        this.sizeY = 5;
        this.pins = new Array(8);
        const N = TimerElm;
        this.pins[N.N_DIS]   = new Pin(this, 1, ChipElm.SIDE_W, this.usePinNames() ? "dis" : "7");
        this.pins[N.N_TRIG]  = new Pin(this, 3, ChipElm.SIDE_W, this.usePinNames() ? "tr"  : "2");
        if (this.usePinNames())
            this.pins[N.N_TRIG].lineOver = true;
        this.pins[N.N_THRES] = new Pin(this, 4, ChipElm.SIDE_W, this.usePinNames() ? "th"  : "6");
        this.pins[N.N_VCC]   = new Pin(this, 1, ChipElm.SIDE_N, this.usePinNames() ? "Vcc" : "8");
        this.pins[N.N_CTL]   = new Pin(this, 1, ChipElm.SIDE_S, this.usePinNames() ? "ctl" : "5");
        this.pins[N.N_OUT]   = new Pin(this, 2, ChipElm.SIDE_E, this.usePinNames() ? "out" : "3");
        this.pins[N.N_OUT].state = true;
        this.pins[N.N_RST]   = new Pin(this, 1, ChipElm.SIDE_E, this.usePinNames() ? "rst" : "4");
        if (this.usePinNames())
            this.pins[N.N_RST].lineOver = true;
        this.pins[N.N_GND]   = new Pin(this, 2, ChipElm.SIDE_S, this.usePinNames() ? "gnd" : "1");
    }

    nonLinear(): boolean { return true; }
    hasReset(): boolean { return (this.flags & TimerElm.FLAG_RESET) !== 0 || this.hasGroundPin(); }
    hasGroundPin(): boolean { return (this.flags & TimerElm.FLAG_GROUND) !== 0; }
    usePinNumbers(): boolean { return (this.flags & TimerElm.FLAG_NUMBERS) !== 0; }
    usePinNames(): boolean { return (this.flags & TimerElm.FLAG_NUMBERS) === 0; }
    isDigitalChip(): boolean { return false; }

    stamp(): void {
        const N = TimerElm;
        this.ground = this.hasGroundPin() ? this.nodes[N.N_GND] : CircuitNode.ground;
        // stamp voltage divider to put ctl pin at 2/3 V
        CircuitElm.sim.stampResistor(this.nodes[N.N_VCC], this.nodes[N.N_CTL],  5000);
        CircuitElm.sim.stampResistor(this.nodes[N.N_CTL], this.ground,          10000);
        // discharge, output, and Vcc pins change in doStep()
        CircuitElm.sim.stampNonLinear(this.nodes[N.N_DIS]);
        CircuitElm.sim.stampNonLinear(this.nodes[N.N_OUT]);
        CircuitElm.sim.stampNonLinear(this.nodes[N.N_VCC]);
        if (this.hasGroundPin())
            CircuitElm.sim.stampNonLinear(this.nodes[N.N_GND]);
    }

    calculateCurrent(): void {
        // need current for V, discharge, control, ground; output current is
        // calculated for us, and other pins have no current.
        const N = TimerElm;
        this.pins[N.N_VCC].current = (this.nodes[N.N_CTL].v - this.nodes[N.N_VCC].v) / 5000;
        const groundVolts = this.hasGroundPin() ? this.nodes[N.N_GND].v : 0;
        this.pins[N.N_CTL].current = -(this.nodes[N.N_CTL].v - groundVolts) / 10000 - this.pins[N.N_VCC].current;
        this.pins[N.N_DIS].current = (!this.out) ? -(this.nodes[N.N_DIS].v - groundVolts) / 10 : 0;
        this.pins[N.N_OUT].current = -(this.nodes[N.N_OUT].v - (this.out ? this.nodes[N.N_VCC].v : groundVolts));
        if (this.out)
            this.pins[N.N_VCC].current -= this.pins[N.N_OUT].current;
        if (this.hasGroundPin()) {
            this.pins[N.N_GND].current = (this.nodes[N.N_CTL].v - groundVolts) / 10000;
            if (!this.out)
                this.pins[N.N_GND].current += (this.nodes[N.N_DIS].v - groundVolts) / 10 + (this.nodes[N.N_OUT].v - groundVolts);
        }
    }

    startIteration(): void {
        const N = TimerElm;
        const groundVolts = this.hasGroundPin() ? this.nodes[N.N_GND].v : 0;
        this.out = this.nodes[N.N_OUT].v > (this.nodes[N.N_VCC].v + groundVolts) / 2;
        // check comparators
        if (this.nodes[N.N_THRES].v > this.nodes[N.N_CTL].v)
            this.out = false;

        // trigger overrides threshold
        // (save triggered flag in case reset and trigger pins are tied together)
        const triggered = ((this.nodes[N.N_CTL].v + groundVolts) / 2 > this.nodes[N.N_TRIG].v);
        if (triggered || this.triggerSuppressed)
            this.out = true;

        // reset overrides trigger
        if (this.hasReset() && this.nodes[N.N_RST].v < .7 + groundVolts) {
            this.out = false;
            // if trigger is overriden, save it
            this.triggerSuppressed = triggered;
        } else
            this.triggerSuppressed = false;
    }

    doStep(): void {
        const N = TimerElm;
        // if output is low, discharge pin 0.  we use a small
        // resistor because it's easier, and sometimes people tie
        // the discharge pin to the trigger and threshold pins.
        if (!this.out)
            CircuitElm.sim.stampResistor(this.nodes[N.N_DIS], this.ground, 10);

        // if output is high, connect Vcc to output with a small resistor.  Otherwise connect output to ground.
        CircuitElm.sim.stampResistor(this.out ? this.nodes[N.N_VCC] : this.ground, this.nodes[N.N_OUT], 1);
    }

    getPostCount(): number { return this.hasGroundPin() ? 8 : this.hasReset() ? 7 : 6; }
    getVoltageSourceCount(): number { return 0; }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }
    getDumpType(): number { return 165; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, 0, 0);
            ei.checkbox = new Checkbox("Ground Pin", this.hasGroundPin());
            return ei;
        }
        if (n === 1)
            return EditInfo.createCheckbox("Show Pin Numbers", this.usePinNumbers());
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.flags = ei.changeFlag(this.flags, TimerElm.FLAG_GROUND);
            this.allocNodes();
            this.setPoints();
            return;
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, TimerElm.FLAG_NUMBERS);
            this.setupPins();
            this.setPoints();
            return;
        }
        super.setChipEditValue(n, ei);
    }
}
