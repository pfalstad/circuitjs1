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

import { RailElm } from "./RailElm";
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageElm } from "./VoltageElm";

export class AntennaElm extends RailElm {
    fmphase: number = 0;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa, VoltageElm.WF_AC);
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!, st!);
            this.waveform = VoltageElm.WF_AC;
        }
    }

    drawRail(g: Graphics): void {
        this.drawRailText(g, "Ant");
    }

    getVoltage(): number {
        const fm = 3 * Math.sin(this.fmphase);
        return Math.sin(2 * CircuitElm.pi * CircuitElm.sim.t * 3000) * (1.3 + Math.sin(2 * CircuitElm.pi * CircuitElm.sim.t * 12)) * 3 +
               Math.sin(2 * CircuitElm.pi * CircuitElm.sim.t * 2710) * (1.3 + Math.sin(2 * CircuitElm.pi * CircuitElm.sim.t * 13)) * 3 +
               Math.sin(2 * CircuitElm.pi * CircuitElm.sim.t * 2433) * (1.3 + Math.sin(2 * CircuitElm.pi * CircuitElm.sim.t * 14)) * 3 + fm;
    }

    stepFinished(): void {
        this.fmphase += 2 * CircuitElm.pi * (2200 + Math.sin(2 * CircuitElm.pi * CircuitElm.sim.t * 13) * 100) * CircuitElm.sim.timeStep;
    }

    getDumpType(): number { return 'A'.charCodeAt(0); }
    getShortcut(): number { return 0; }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        arr[0] = "Antenna (amplified)";
    }

    getEditInfo(n: number): null { return null; }

    getXmlDumpType(): string { return "ant"; }
}
