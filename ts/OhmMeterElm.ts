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

import { CircuitElm } from "./CircuitElm";
import { CurrentElm } from "./CurrentElm";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { StringTokenizer } from "./StringTokenizer";
import { VAL_R, UNITS_OHMS } from "./ScopeConstants";

export class OhmMeterElm extends CurrentElm {
    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
    }

    getDumpType(): number { return 216; }

    setPoints(): void {
        super.setPoints();
        this.calcLeads(26);
    }

    draw(g: Graphics): void {
        const cr = 12;
        this.draw2Leads(g);
        this.setVoltageColor(g, (this.nodes[0].v + this.nodes[1].v) / 2);
        this.setPowerColor(g, false);

        CircuitElm.drawThickCircle(g, this.center!.x, this.center!.y, cr);
        this.drawCenteredText(g, Locale.ohmString, this.center!.x, this.center!.y, true);

        this.setBbox(this.point1, this.point2, cr);
        this.doDots(g);
        if (this.showValues() && this.current !== 0) {
            const s = CircuitElm.getShortUnitText(this.getVoltageDiff() / this.current, Locale.ohmString);
            if (this.dx === 0 || this.dy === 0)
                this.drawValues(g, s, cr);
        }
        this.drawPosts(g);
    }

    getScopeValue(x: number): number {
        return (x === VAL_R) ? this.getVoltageDiff() / this.current : super.getScopeValue(x);
    }

    getScopeUnits(x: number): number {
        return (x === VAL_R) ? UNITS_OHMS : super.getScopeUnits(x);
    }

    canShowValueInScope(x: number): boolean {
        return x === VAL_R;
    }

    getInfo(arr: string[]): void {
        arr[0] = "ohmmeter";
        if (this.current === 0)
            arr[1] = "R = ∞";
        else
            arr[1] = "R = " + CircuitElm.getUnitText(this.getVoltageDiff() / this.current, Locale.ohmString);
    }
}
