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

import { CirSim } from "./CirSim";
import { CircuitElm } from "./CircuitElm";
import { WireElm } from "./WireElm";
import { RoutedWireElm } from "./RoutedWireElm";
import { Point } from "./Point";
import { parseIntStrict } from "./NumberParse";

// Converts chains of WireElm into RoutedWireElm segments.
// Two wires touching at a point are combined, but if 3+ wires
// meet at a point (a junction), they must remain separate.

export class WireConverter {

    static convertWires(sim: CirSim): void {
        const elmList = sim.elmList;

        // check if any wires are selected; if so, only convert those
        let hasSelection = false;
        for (const ce of elmList) {
            if (ce.isWireElm() && !ce.isRoutedWireElm() && ce.isSelected()) {
                hasSelection = true;
                break;
            }
        }

        // collect WireElms (but not RoutedWireElms)
        const wires: WireElm[] = [];
        for (const ce of elmList) {
            if (ce.isRoutedWireElm())
                continue;
            if (ce.isWireElm() && (!hasSelection || ce.isSelected()))
                wires.push(ce as WireElm);
        }

        if (wires.length === 0)
            return;

        // count how many wire endpoints touch each point
        const pointCount = new Map<string, number>();
        for (const w of wires) {
            WireConverter.inc(pointCount, WireConverter.key(w.x, w.y));
            WireConverter.inc(pointCount, WireConverter.key(w.x2, w.y2));
        }

        // non-wire element connections force chain endpoints.
        // add 2 so the point can never be exactly 2 (chain interior).
        for (const ce of elmList) {
            if (ce.isWireElm())
                continue;
            for (let i = 0; i < ce.getPostCount(); i++) {
                const p = ce.getPost(i)!;
                const k = WireConverter.key(p.x, p.y);
                if (pointCount.has(k)) {
                    WireConverter.inc(pointCount, k);
                    WireConverter.inc(pointCount, k);
                }
            }
        }

        // build adjacency: for each wire, map its endpoints to the wire
        // a point is a "chain interior" if exactly 2 wires meet there
        const pointToWires = new Map<string, WireElm[]>();
        for (const w of wires) {
            WireConverter.addToList(pointToWires, WireConverter.key(w.x, w.y), w);
            WireConverter.addToList(pointToWires, WireConverter.key(w.x2, w.y2), w);
        }

        // find chains by traversing from chain endpoints
        // a chain endpoint is a point where count != 2
        const visited = new Set<WireElm>();
        const chains: WireElm[][] = [];

        for (const w of wires) {
            if (visited.has(w))
                continue;

            // try to start a chain from this wire
            const chain: WireElm[] = [];
            WireConverter.buildChain(w, chain, visited, pointCount, pointToWires);
            chains.push(chain);
        }

        // convert each chain to a RoutedWireElm
        for (const chain of chains) {
            if (chain.length === 1) {
                // single wire, convert directly
                const w = chain[0];
                const pts: Point[] = [];
                pts.push(new Point(w.x, w.y));
                pts.push(new Point(w.x2, w.y2));
                const rw = new RoutedWireElm(pts);
                const idx = elmList.indexOf(w);
                if (idx >= 0)
                    elmList.splice(idx, 1);
                elmList.push(rw);
                continue;
            }

            // order the chain and find the two endpoints
            const orderedPoints = WireConverter.orderChain(chain, pointCount);
            if (orderedPoints === null || orderedPoints.length < 3)
                continue;

            const rw = new RoutedWireElm(orderedPoints);

            // remove old wires, add new routed wire
            for (const w of chain) {
                const idx = elmList.indexOf(w);
                if (idx >= 0)
                    elmList.splice(idx, 1);
            }
            elmList.push(rw);
        }
    }

    // walk along connected wires where interior points have degree 2
    private static buildChain(start: WireElm, chain: WireElm[],
                               visited: Set<WireElm>,
                               pointCount: Map<string, number>,
                               pointToWires: Map<string, WireElm[]>): void {
        const stack: WireElm[] = [];
        stack.push(start);

        while (stack.length > 0) {
            const w = stack.pop()!;
            if (visited.has(w))
                continue;
            visited.add(w);
            chain.push(w);

            // try to extend from both endpoints
            const k1 = WireConverter.key(w.x, w.y);
            const k2 = WireConverter.key(w.x2, w.y2);

            // only extend through points with exactly degree 2 (chain interior)
            if (pointCount.get(k1) === 2) {
                for (const neighbor of pointToWires.get(k1)!) {
                    if (!visited.has(neighbor))
                        stack.push(neighbor);
                }
            }
            if (pointCount.get(k2) === 2) {
                for (const neighbor of pointToWires.get(k2)!) {
                    if (!visited.has(neighbor))
                        stack.push(neighbor);
                }
            }
        }
    }

    // order chain wires into a sequence of points from one endpoint to the other
    private static orderChain(chain: WireElm[], pointCount: Map<string, number>): Point[] | null {
        // build local adjacency for ordering
        const local = new Map<string, WireElm[]>();
        for (const w of chain) {
            WireConverter.addToList(local, WireConverter.key(w.x, w.y), w);
            WireConverter.addToList(local, WireConverter.key(w.x2, w.y2), w);
        }

        // find a chain endpoint (degree != 2) to start from
        let startWire: WireElm | null = null;
        let startKey = "";
        for (const w of chain) {
            const k1 = WireConverter.key(w.x, w.y);
            const k2 = WireConverter.key(w.x2, w.y2);
            if (pointCount.get(k1) !== 2) {
                startWire = w;
                startKey = k1;
                break;
            }
            if (pointCount.get(k2) !== 2) {
                startWire = w;
                startKey = k2;
                break;
            }
        }
        if (startWire === null)
            return null; // closed loop, skip

        // walk the chain in order
        const points: Point[] = [];
        points.push(new Point(WireConverter.keyX(startKey), WireConverter.keyY(startKey)));

        const used = new Set<WireElm>();
        let current: WireElm | null = startWire;
        let currentPt = startKey;

        while (current !== null) {
            used.add(current);
            // find the other endpoint of this wire
            const k1 = WireConverter.key(current.x, current.y);
            const k2 = WireConverter.key(current.x2, current.y2);
            const otherEnd = (k1 === currentPt) ? k2 : k1;
            points.push(new Point(WireConverter.keyX(otherEnd), WireConverter.keyY(otherEnd)));

            // find next wire at otherEnd (if it's a chain interior point)
            current = null;
            if (pointCount.get(otherEnd) === 2) {
                const neighbors = local.get(otherEnd);
                if (neighbors !== undefined) {
                    for (const w of neighbors) {
                        if (!used.has(w)) {
                            current = w;
                            currentPt = otherEnd;
                            break;
                        }
                    }
                }
            }
        }

        return points;
    }

    private static key(x: number, y: number): string {
        return x + "," + y;
    }

    private static keyX(k: string): number {
        return parseIntStrict(k.split(",")[0]);
    }

    private static keyY(k: string): number {
        return parseIntStrict(k.split(",")[1]);
    }

    private static inc(map: Map<string, number>, k: string): void {
        const v = map.get(k);
        map.set(k, v === undefined ? 1 : v + 1);
    }

    private static addToList(map: Map<string, WireElm[]>, k: string, w: WireElm): void {
        let list = map.get(k);
        if (list === undefined) {
            list = [];
            map.set(k, list);
        }
        list.push(w);
    }
}
