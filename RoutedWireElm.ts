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

import { WireElm } from "./WireElm";
import { WireRouter } from "./WireRouter";
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { CirSim } from "./CirSim";
import { UIManager } from "./UIManager";

export class RoutedWireElm extends WireElm {
    routePoints: Point[] | null = null;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(points: Point[]);
    constructor(xxOrPoints: number | Point[], yy?: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (Array.isArray(xxOrPoints)) {
            const points = xxOrPoints;
            super(points[0].x, points[0].y);
            this.setPoints(points);
        } else if (xb !== undefined) {
            super(xxOrPoints, yy!, xb, yb!, f!, st!);
        } else {
            super(xxOrPoints, yy!);
        }
    }

    getDumpType(): number { return 0; }
    getXmlDumpType(): string { return "rw"; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.routePoints !== null && this.routePoints.length > 0) {
            const parts = this.routePoints.map(p => p.x + "," + p.y);
            elem.appendChild(doc.createTextNode(parts.join(";")));
        }
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        try {
            const contents = xml.parseContents();
            if (contents !== null && contents.length > 0) {
                const points: Point[] = [];
                for (const pair of contents.split(";")) {
                    const xy = pair.split(",");
                    points.push(new Point(parseInt(xy[0]), parseInt(xy[1])));
                }
                if (points.length >= 2)
                    this.routePoints = points;
            }
        } catch (e) {}
    }

    getShortcut(): number { return 'W'.charCodeAt(0); }

    setPoints(pointsOrRouting?: boolean | Point[]): void {
        if (Array.isArray(pointsOrRouting)) {
            const points = pointsOrRouting;
            const first = points[0];
            const last = points[points.length - 1];
            this.x = first.x; this.y = first.y;
            this.x2 = last.x; this.y2 = last.y;
            super.setPoints();
            this.routePoints = points;
            return;
        }

        const routing = pointsOrRouting !== false;
        super.setPoints();

        // if endpoints haven't changed, keep existing route
        if (this.routePoints !== null && this.routePoints.length >= 2) {
            const first = this.routePoints[0];
            const last = this.routePoints[this.routePoints.length - 1];
            if (first.x === this.x && first.y === this.y && last.x === this.x2 && last.y === this.y2)
                return;
        }

        if (!routing) {
            this.routePoints = [this.point1, this.point2];
            return;
        }

        const router = new WireRouter();
        router.initGrid(this, CirSim.theApp.gridSize, UIManager.theUI.elmList, UIManager.theUI.getCircuitBounds());
        const result = router.routeWire(this.x, this.y, this.x2, this.y2);
        if (result.length < 2) {
            CirSim.console("routing failed");
            this.routePoints = [this.point1, new Point(this.x2, this.y), this.point2];
            return;
        }
        CirSim.console("route success");
        this.routePoints = result;
    }

    // split this routed wire at the point nearest (mx, my)
    split(mx: number, my: number): RoutedWireElm | null {
        if (this.routePoints === null || this.routePoints.length < 2)
            return null;

        let bestSeg = -1;
        let bestDist = Number.MAX_SAFE_INTEGER;
        for (let i = 0; i < this.routePoints.length - 1; i++) {
            const a = this.routePoints[i];
            const b = this.routePoints[i + 1];
            const d = RoutedWireElm.segmentDistanceSq(a.x, a.y, b.x, b.y, mx, my);
            if (d < bestDist) { bestDist = d; bestSeg = i; }
        }

        const a = this.routePoints[bestSeg];
        const b = this.routePoints[bestSeg + 1];

        let sx: number, sy: number;
        if (a.x === b.x) {
            sx = a.x;
            sy = this.snapGrid(my);
            sy = Math.max(Math.min(a.y, b.y), Math.min(sy, Math.max(a.y, b.y)));
        } else {
            sy = a.y;
            sx = this.snapGrid(mx);
            sx = Math.max(Math.min(a.x, b.x), Math.min(sx, Math.max(a.x, b.x)));
        }

        if ((sx === this.x && sy === this.y) || (sx === this.x2 && sy === this.y2))
            return null;

        const rp1: Point[] = [];
        for (let i = 0; i <= bestSeg; i++) rp1.push(this.routePoints[i]);
        rp1.push(new Point(sx, sy));

        const rp2: Point[] = [new Point(sx, sy)];
        for (let i = bestSeg + 1; i < this.routePoints.length; i++) rp2.push(this.routePoints[i]);

        this.setPoints(rp1);
        return new RoutedWireElm(rp2);
    }

    rerouteVia(vx: number, vy: number): void {
        const router = new WireRouter();
        router.initGrid(this, CirSim.theApp.gridSize, UIManager.theUI.elmList, UIManager.theUI.getCircuitBounds());
        const rp1 = router.routeWire(this.x, this.y, vx, vy);
        if (rp1.length < 2) return;

        for (let i = 0; i < rp1.length - 1; i++)
            router.addWire(rp1[i].x, rp1[i].y, rp1[i + 1].x, rp1[i + 1].y);

        const rp2 = router.routeWire(vx, vy, this.x2, this.y2);
        if (rp2.length < 2) return;

        this.routePoints = [...rp1, ...rp2.slice(1)];
    }

    addRoutingObstacle(router: WireRouter): void {
        if (this.routePoints === null) return;
        for (let i = 0; i < this.routePoints.length - 1; i++)
            router.addWire(this.routePoints[i].x, this.routePoints[i].y,
                           this.routePoints[i + 1].x, this.routePoints[i + 1].y);
    }

    draw(g: Graphics): void {
        if (this.routePoints === null || this.routePoints.length < 2) {
            super.draw(g);
            return;
        }
        this.setVoltageColor(g, this.volts[0]);
        for (let i = 0; i < this.routePoints.length - 1; i++)
            CircuitElm.drawThickLine(g, this.routePoints[i], this.routePoints[i + 1], this.busWidth > 1 ? 5 : 3);

        if (this.currents !== null) {
            this.current = 0;
            for (let i = 0; i < this.currents.length; i++)
                this.current += this.currents[i];
        }
        this.doDots(g);

        const m = 5;
        let minX = this.point1.x, minY = this.point1.y, maxX = this.point1.x, maxY = this.point1.y;
        for (let i = 1; i < this.routePoints.length; i++) {
            const p = this.routePoints[i];
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
        this.setBbox(minX - m, minY - m, maxX + m, maxY + m);

        let s = "";
        if (this.busWidth > 1 && (this.mustShowBusValue() || this.mustShowBusValueHex())) {
            const value = this.getBusValue();
            if (this.mustShowBusValue()) s = "" + value;
            if (this.mustShowBusValueHex()) s = (s.length > 0 ? s + " " : "") + "0x" + value.toString(16).toUpperCase();
        } else if (this.busWidth === 1) {
            if (this.mustShowCurrent()) s = CircuitElm.getShortUnitText(Math.abs(this.getCurrent()), "A");
            if (this.mustShowVoltage()) s = (s.length > 0 ? s + " " : "") + CircuitElm.getShortUnitText(this.volts[0], "V");
        }
        if (s.length > 0)
            this.drawValuesOnLongestSegment(g, s);
        this.drawPosts(g);
    }

    drawValuesOnLongestSegment(g: Graphics, s: string): void {
        if (this.routePoints === null || this.routePoints.length < 2) return;
        let bestLen = 0, bestSeg = 0;
        for (let i = 0; i < this.routePoints.length - 1; i++) {
            const a = this.routePoints[i], b = this.routePoints[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = dx * dx + dy * dy;
            if (len > bestLen) { bestLen = len; bestSeg = i; }
        }
        const a = this.routePoints[bestSeg], b = this.routePoints[bestSeg + 1];
        const mx = (a.x + b.x) / 2 | 0, my = (a.y + b.y) / 2 | 0;
        g.setFont(CircuitElm.unitsFont);
        const w = g.measureWidth(s);
        const ya = g.currentFontSize / 2 | 0;
        g.setColor(CircuitElm.whiteColor);
        if (a.y === b.y)
            g.drawString(s, mx - w / 2, my - 6);
        else
            g.drawString(s, mx + 4, my + ya);
    }

    doDots(g: Graphics): void {
        this.updateDotCount();
        if (this.isCreating() || this.curcount === 0 || this.routePoints === null) return;
        let cc = this.curcount;
        for (let i = 0; i < this.routePoints.length - 1; i++) {
            const a = this.routePoints[i], b = this.routePoints[i + 1];
            this.drawDots(g, a, b, cc);
            const dx = b.x - a.x, dy = b.y - a.y;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            cc = this.addCurCount(cc, segLen);
        }
    }

    getMouseDistance(gx: number, gy: number): number {
        if (this.routePoints === null) return super.getMouseDistance(gx, gy);
        const thresh = 10;
        let best = Number.MAX_SAFE_INTEGER;
        for (let i = 0; i < this.routePoints.length - 1; i++) {
            const a = this.routePoints[i], b = this.routePoints[i + 1];
            const d = RoutedWireElm.segmentDistanceSq(a.x, a.y, b.x, b.y, gx, gy);
            if (d < best) best = d;
        }
        return best <= thresh * thresh ? best : -1;
    }

    static segmentDistanceSq(ax: number, ay: number, bx: number, by: number, gx: number, gy: number): number {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return (gx - ax) * (gx - ax) + (gy - ay) * (gy - ay);
        let t = ((gx - ax) * dx + (gy - ay) * dy) / lenSq;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = ax + t * dx, py = ay + t * dy;
        const ex = gx - px, ey = gy - py;
        return ex * ex + ey * ey | 0;
    }

    pointOnPath(p: Point): boolean {
        if (this.routePoints === null || this.routePoints.length < 2) return false;
        if (p.equals(this.point1) || p.equals(this.point2)) return false;
        for (let i = 0; i < this.routePoints.length - 1; i++) {
            const a = this.routePoints[i], b = this.routePoints[i + 1];
            if (a.x === b.x && p.x === a.x) {
                const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
                if (p.y >= lo && p.y <= hi) return true;
            } else if (a.y === b.y && p.y === a.y) {
                const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
                if (p.x >= lo && p.x <= hi) return true;
            }
        }
        return false;
    }

    getSnapPointOnWire(mx: number, my: number): Point | null {
        if (this.routePoints === null || this.routePoints.length < 2) return null;

        let bestSeg = -1, bestDist = Number.MAX_SAFE_INTEGER;
        for (let i = 0; i < this.routePoints.length - 1; i++) {
            const a = this.routePoints[i], b = this.routePoints[i + 1];
            const d = this.lineDistanceSq(a.x, a.y, b.x, b.y, mx, my);
            if (d < bestDist) { bestDist = d; bestSeg = i; }
        }

        const a = this.routePoints[bestSeg], b = this.routePoints[bestSeg + 1];
        let sx: number, sy: number;
        if (a.x === b.x) {
            sx = a.x;
            sy = this.snapGrid(my);
        } else {
            sy = a.y;
            sx = this.snapGrid(mx);
        }
        return new Point(sx, sy);
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        arr[0] = (this.busWidth > 1) ? "routed bus wire (" + this.busWidth + ")" : "routed wire";
    }
}
