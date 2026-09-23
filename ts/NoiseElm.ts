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
import { VoltageElm } from "./VoltageElm";
import { StringTokenizer } from "./StringTokenizer";

export class NoiseElm extends RailElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb !== undefined) {
            super(xa, ya, xb, yb!, f!, st!);
            this.waveform = VoltageElm.WF_NOISE;
        } else {
            super(xa, ya, VoltageElm.WF_NOISE);
        }
    }

    // dump this class as a RailElm.  The 'n' dump type is still used in CirSim.createCe to read old files
//  getDumpType() { return 'n'; }
    getDumpClass(): typeof RailElm { return RailElm; }
    getShortcut(): number { return 0; }
}
