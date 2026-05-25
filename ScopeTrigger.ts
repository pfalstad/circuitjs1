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

// Stub — to be implemented from ScopeTrigger.java
import { Graphics } from "./Graphics";
import { Rectangle } from "./Rectangle";
import { ScopePlot } from "./ScopePlot";
import { SimulationManager } from "./SimulationManager";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class ScopeTrigger {
    static readonly TRIGGER_FREERUN = 0;
    static readonly TRIGGER_NORMAL  = 1;
    static readonly TRIGGER_AUTO    = 2;
    static readonly TRIGGER_EDGE_RISING  = 0;
    static readonly TRIGGER_EDGE_FALLING = 1;

    mode: number = ScopeTrigger.TRIGGER_FREERUN;
    edge: number = ScopeTrigger.TRIGGER_EDGE_RISING;
    level: number = 0;
    time: number = 0;

    isActive(): boolean { return false; }
    isTriggered(): boolean { return false; }
    reset(scopePointCount: number): void {}
    check(visiblePlots: ScopePlot[], plot2dEnabled: boolean, sim: SimulationManager, scopePointCount: number, width: number): void {}
    displayStartIndex(plot: ScopePlot, w: number, scopePointCount: number): number { return plot.startIndex(w); }
    validDataCount(plot: ScopePlot, ipa: number, w: number, scopePointCount: number): number { return Math.min(w, plot.scopePointCount); }
    drawIndicator(g: Graphics, visiblePlots: ScopePlot[], rect: Rectangle): void {}
    dumpXml(elem: Element): void {}
    undumpXml(xml: CircuitXMLDeserializer): void {}
}
