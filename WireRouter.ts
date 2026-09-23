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

import { Point } from "./Point";
import { parseIntStrict } from "./NumberParse";

interface RoutableElm {
    x: number; y: number; x2: number; y2: number;
    getPostCount(): number;
    getPost(n: number): Point;
    addRoutingObstacle(router: WireRouter): void;
}

// Simple min-heap for A* priority queue
class MinHeap<T> {
    private data: T[] = [];
    constructor(private compare: (a: T, b: T) => number) {}
    offer(item: T): void {
        this.data.push(item);
        this._bubbleUp(this.data.length - 1);
    }
    poll(): T | undefined {
        if (this.data.length === 0) return undefined;
        const top = this.data[0];
        const last = this.data.pop()!;
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }
    isEmpty(): boolean { return this.data.length === 0; }
    private _bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.compare(this.data[i], this.data[parent]) < 0) {
                [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
                i = parent;
            } else break;
        }
    }
    private _sinkDown(i: number): void {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && this.compare(this.data[l], this.data[smallest]) < 0) smallest = l;
            if (r < n && this.compare(this.data[r], this.data[smallest]) < 0) smallest = r;
            if (smallest === i) break;
            [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
            i = smallest;
        }
    }
}

interface AStarNode {
    r: number; c: number; dir: number;
    gScore: number; fScore: number;
}

export class WireRouter {
    private rows: number = 0;
    private cols: number = 0;
    private grid: number[][] | null = null;

    private static readonly OBSTACLE   = 1;
    private static readonly HORIZONTAL = 2;
    private static readonly VERTICAL   = 4;

    private static readonly NONE  = 0;
    private static readonly UP    = 1;
    private static readonly DOWN  = 2;
    private static readonly LEFT  = 3;
    private static readonly RIGHT = 4;

    private turnPenalty: number = 4.0;
    private gridSize: number = 16;
    private originX: number = 0;
    private originY: number = 0;

    static lastRouter: WireRouter | null = null;

    private static readonly ESCAPE_BONUS = -0.4;

    constructor() {
        WireRouter.lastRouter = this;
    }

    setTurnPenalty(penalty: number): void {
        this.turnPenalty = penalty;
    }

    addObstacle(px1: number, py1: number, px2: number, py2: number): void;
    addObstacle(pts: Point[]): void;
    addObstacle(px1OrPts: number | Point[], py1?: number, px2?: number, py2?: number): void {
        if (Array.isArray(px1OrPts)) {
            const pts = px1OrPts;
            let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
            for (let i = 1; i < pts.length; i++) {
                if (pts[i].x < minX) minX = pts[i].x;
                if (pts[i].y < minY) minY = pts[i].y;
                if (pts[i].x > maxX) maxX = pts[i].x;
                if (pts[i].y > maxY) maxY = pts[i].y;
            }
            this.addObstacle(minX, minY, maxX, maxY);
            return;
        }
        let px1n = px1OrPts + this.gridSize / 2;
        let px2n = px2! + this.gridSize / 2;
        let py1n = py1! + this.gridSize / 2;
        let py2n = py2! + this.gridSize / 2;
        const r1 = (py1n - this.originY) / this.gridSize | 0;
        const c1 = (px1n - this.originX) / this.gridSize | 0;
        const r2 = (py2n - this.originY) / this.gridSize | 0;
        const c2 = (px2n - this.originX) / this.gridSize | 0;
        const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
        const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
        for (let c = minC; c <= maxC; c++)
            for (let r = minR; r <= maxR; r++)
                if (this.isValid(r, c))
                    this.grid![r][c] |= WireRouter.OBSTACLE;
    }

    addObstaclePoint(px: number, py: number): void {
        const r = (py - this.originY) / this.gridSize | 0;
        const c = (px - this.originX) / this.gridSize | 0;
        if (this.isValid(r, c))
            this.grid![r][c] |= WireRouter.OBSTACLE;
    }

    addWire(px1: number, py1: number, px2: number, py2: number): void {
        const r1 = (py1 - this.originY) / this.gridSize | 0;
        const c1 = (px1 - this.originX) / this.gridSize | 0;
        const r2 = (py2 - this.originY) / this.gridSize | 0;
        const c2 = (px2 - this.originX) / this.gridSize | 0;
        const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
        const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
        if (r1 === r2) {
            for (let c = minC; c <= maxC; c++)
                if (this.isValid(r1, c))
                    this.grid![r1][c] |= WireRouter.HORIZONTAL;
        } else {
            for (let r = minR; r <= maxR; r++)
                if (this.isValid(r, c1))
                    this.grid![r][c1] |= WireRouter.VERTICAL;
        }
    }

    initGrid(wire: RoutableElm, gridSize: number, elmList: RoutableElm[],
             bounds: { x: number; y: number; width: number; height: number } | null): void {
        this.gridSize = gridSize;

        let minX = Math.min(wire.x, wire.x2);
        let minY = Math.min(wire.y, wire.y2);
        let maxX = Math.max(wire.x, wire.x2);
        let maxY = Math.max(wire.y, wire.y2);
        if (bounds !== null) {
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }

        const margin = 2;
        this.originX = (minX / this.gridSize | 0) * this.gridSize - margin * this.gridSize;
        this.originY = (minY / this.gridSize | 0) * this.gridSize - margin * this.gridSize;
        this.rows = (maxY - this.originY) / this.gridSize + 1 + margin * 2 | 0;
        this.cols = (maxX - this.originX) / this.gridSize + 1 + margin * 2 | 0;

        this.grid = [];
        for (let r = 0; r < this.rows; r++)
            this.grid.push(new Array(this.cols).fill(0));

        for (const ce of elmList) {
            if (wire === ce) continue;
            ce.addRoutingObstacle(this);
            for (let i = 0; i < ce.getPostCount(); i++) {
                const p = ce.getPost(i);
                this.addObstaclePoint(p.x, p.y);
            }
        }
        // clear start and end cells
        this.grid[(wire.y  - this.originY) / this.gridSize | 0][(wire.x  - this.originX) / this.gridSize | 0] = 0;
        this.grid[(wire.y2 - this.originY) / this.gridSize | 0][(wire.x2 - this.originX) / this.gridSize | 0] = 0;
    }

    private dr(dir: number): number {
        if (dir === WireRouter.UP)   return -1;
        if (dir === WireRouter.DOWN) return +1;
        return 0;
    }

    private dc(dir: number): number {
        if (dir === WireRouter.LEFT)  return -1;
        if (dir === WireRouter.RIGHT) return +1;
        return 0;
    }

    private getPreferredEscapeDirections(r: number, c: number): number[] {
        const prefs: number[] = [];
        if (!this.canMoveTo(r - 1, c, WireRouter.UP))    prefs.push(WireRouter.DOWN);
        if (!this.canMoveTo(r + 1, c, WireRouter.DOWN))  prefs.push(WireRouter.UP);
        if (!this.canMoveTo(r, c - 1, WireRouter.LEFT))  prefs.push(WireRouter.RIGHT);
        if (!this.canMoveTo(r, c + 1, WireRouter.RIGHT)) prefs.push(WireRouter.LEFT);
        return prefs;
    }

    private tryPatternRouting(startR: number, startC: number, goalR: number, goalC: number): Point[] {
        if (startR === goalR && startC === goalC) {
            return [new Point(startC * this.gridSize + this.originX, startR * this.gridSize + this.originY)];
        }

        const startPrefs = this.getPreferredEscapeDirections(startR, startC);
        let bestCost = Infinity;
        let bestCorners: number[][] | null = null;

        const tryPath = (path: number[][], initialDir: number) => {
            const cost = this.evaluatePath(path, initialDir, startPrefs);
            if (cost >= 0 && cost < bestCost) {
                bestCost = cost;
                bestCorners = path;
            }
        };

        if (startR !== goalR && startC !== goalC) {
            tryPath([[startR, startC], [startR, goalC], [goalR, goalC]],
                    goalC > startC ? WireRouter.RIGHT : WireRouter.LEFT);
            tryPath([[startR, startC], [goalR, startC], [goalR, goalC]],
                    goalR > startR ? WireRouter.DOWN : WireRouter.UP);
        } else if (startR === goalR) {
            tryPath([[startR, startC], [goalR, goalC]],
                    goalC > startC ? WireRouter.RIGHT : WireRouter.LEFT);
        } else {
            tryPath([[startR, startC], [goalR, goalC]],
                    goalR > startR ? WireRouter.DOWN : WireRouter.UP);
        }

        const maxDetour = 5;

        if (startR !== goalR) {
            for (let margin = 1; margin <= maxDetour; margin++) {
                for (const side of [-1, +1]) {
                    for (const base of [startC, goalC]) {
                        const detourCol = base + side * margin;
                        if (!this.isValid(0, detourCol)) continue;
                        const z: number[][] = [[startR, startC]];
                        if (startC !== detourCol) z.push([startR, detourCol]);
                        if (startR !== goalR)     z.push([goalR,  detourCol]);
                        if (detourCol !== goalC)  z.push([goalR,  goalC]);
                        if (z.length >= 2)
                            tryPath(z, detourCol > startC ? WireRouter.RIGHT : WireRouter.LEFT);
                    }
                }
            }
        }

        if (startC !== goalC) {
            for (let margin = 1; margin <= maxDetour; margin++) {
                for (const side of [-1, +1]) {
                    for (const base of [startR, goalR]) {
                        const detourRow = base + side * margin;
                        if (!this.isValid(detourRow, 0)) continue;
                        const z: number[][] = [[startR, startC]];
                        if (startR !== detourRow) z.push([detourRow, startC]);
                        if (startC !== goalC)     z.push([detourRow, goalC]);
                        if (detourRow !== goalR)  z.push([goalR,     goalC]);
                        if (z.length >= 2)
                            tryPath(z, detourRow > startR ? WireRouter.DOWN : WireRouter.UP);
                    }
                }
            }
        }

        if (bestCorners === null) return [];
        return this.pixelsFromGridPoints(bestCorners);
    }

    private evaluatePath(corners: number[][], initialDir: number, startPrefs: number[]): number {
        if (corners.length < 2) return -1;

        let cost = 0.0;
        let prevDir = WireRouter.NONE;
        let prev = corners[0];

        for (let i = 1; i < corners.length; i++) {
            const curr = corners[i];
            const dr = curr[0] - prev[0];
            const dc = curr[1] - prev[1];
            const steps = Math.max(Math.abs(dr), Math.abs(dc));
            if (steps === 0) continue;

            let moveDir: number;
            if (dr === 0 && dc > 0)      moveDir = WireRouter.RIGHT;
            else if (dr === 0 && dc < 0) moveDir = WireRouter.LEFT;
            else if (dc === 0 && dr > 0) moveDir = WireRouter.DOWN;
            else if (dc === 0 && dr < 0) moveDir = WireRouter.UP;
            else return -1;

            let r = prev[0], c = prev[1];
            for (let s = 0; s < steps; s++) {
                r += Math.sign(dr);
                c += Math.sign(dc);
                if (!this.isValid(r, c) || !this.canMoveTo(r, c, moveDir))
                    return -1;
            }

            cost += steps;
            if (prevDir !== WireRouter.NONE && moveDir !== prevDir && moveDir !== this.opposite(prevDir))
                cost += this.turnPenalty;
            prevDir = moveDir;
            prev = curr;
        }

        for (const p of startPrefs) {
            if (p === initialDir) {
                cost += WireRouter.ESCAPE_BONUS;
                break;
            }
        }
        return cost;
    }

    private pixelsFromGridPoints(gridPoints: number[][]): Point[] {
        return gridPoints.map(g => new Point(g[1] * this.gridSize + this.originX, g[0] * this.gridSize + this.originY));
    }

    routeWire(px1: number, py1: number, px2: number, py2: number): Point[] {
        const startR = (py1 - this.originY) / this.gridSize | 0;
        const startC = (px1 - this.originX) / this.gridSize | 0;
        const goalR  = (py2 - this.originY) / this.gridSize | 0;
        const goalC  = (px2 - this.originX) / this.gridSize | 0;

        if (!this.isValid(startR, startC) || !this.isValid(goalR, goalC))
            return [];

        if (!this.canMoveTo(goalR, goalC, WireRouter.UP) && !this.canMoveTo(goalR, goalC, WireRouter.DOWN) &&
            !this.canMoveTo(goalR, goalC, WireRouter.LEFT) && !this.canMoveTo(goalR, goalC, WireRouter.RIGHT))
            return [];

        const patternPath = this.tryPatternRouting(startR, startC, goalR, goalC);
        if (patternPath.length > 0) {
            console.log("pattern");
            return patternPath;
        }

        console.log("A*");

        const openSet = new MinHeap<AStarNode>((a, b) => a.fScore - b.fScore);
        const gScore = new Map<string, number>();
        const cameFrom = new Map<string, string>();

        const startPrefs = this.getPreferredEscapeDirections(startR, startC);

        for (const d of [WireRouter.UP, WireRouter.DOWN, WireRouter.LEFT, WireRouter.RIGHT]) {
            if (!this.canMoveTo(startR + this.dr(d), startC + this.dc(d), d)) continue;
            let initG = 0.0;
            if (startPrefs.includes(d)) initG += WireRouter.ESCAPE_BONUS;
            const key = this.key(startR, startC, d);
            const h = this.manhattan(startR, startC, goalR, goalC);
            openSet.offer({ r: startR, c: startC, dir: d, gScore: initG, fScore: initG + h });
            gScore.set(key, initG);
        }

        let bestGoalNode: AStarNode | null = null;

        while (!openSet.isEmpty()) {
            const current = openSet.poll()!;
            const currKey = this.key(current.r, current.c, current.dir);

            if (current.gScore > (gScore.get(currKey) ?? Infinity)) continue;

            if (current.r === goalR && current.c === goalC) {
                if (bestGoalNode === null || current.gScore < bestGoalNode.gScore)
                    bestGoalNode = current;
            }

            for (const neigh of this.neighbors(current.r, current.c)) {
                const nr = neigh[0], nc = neigh[1], moveDir = neigh[2];
                if (!this.canMoveTo(nr, nc, moveDir)) continue;

                let moveCost = 1.0;
                if (current.dir !== WireRouter.NONE && moveDir !== current.dir && moveDir !== this.opposite(current.dir))
                    moveCost += this.turnPenalty;

                const nKey = this.key(nr, nc, moveDir);
                const tentG = current.gScore + moveCost;
                if (tentG < (gScore.get(nKey) ?? Infinity)) {
                    cameFrom.set(nKey, currKey);
                    gScore.set(nKey, tentG);
                    const h = this.manhattan(nr, nc, goalR, goalC);
                    openSet.offer({ r: nr, c: nc, dir: moveDir, gScore: tentG, fScore: tentG + h });
                }
            }
        }

        if (bestGoalNode === null) return [];

        const fullPath: number[][] = [];
        let currentKey: string | undefined = this.key(bestGoalNode.r, bestGoalNode.c, bestGoalNode.dir);
        while (currentKey !== undefined) {
            const pos = this.parseKey(currentKey);
            fullPath.unshift([pos[0], pos[1]]);
            currentKey = cameFrom.get(currentKey);
        }

        const compressed = this.compressPath(fullPath);
        return compressed.map(pt => new Point(pt[1] * this.gridSize + this.originX, pt[0] * this.gridSize + this.originY));
    }

    private compressPath(fullPath: number[][]): number[][] {
        if (fullPath.length <= 2) return [...fullPath];
        const minimal: number[][] = [fullPath[0]];
        for (let i = 1; i < fullPath.length - 1; i++) {
            const a = fullPath[i - 1], b = fullPath[i], c = fullPath[i + 1];
            const dx1 = b[1] - a[1], dy1 = b[0] - a[0];
            const dx2 = c[1] - b[1], dy2 = c[0] - b[0];
            const collinear = (dx1 * dy2 - dy1 * dx2 === 0) && (dx1 * dx2 + dy1 * dy2 > 0);
            if (!collinear) minimal.push(b);
        }
        const last = fullPath[fullPath.length - 1];
        const prev = minimal[minimal.length - 1];
        if (prev[0] !== last[0] || prev[1] !== last[1]) minimal.push(last);
        return minimal;
    }

    placeWire(path: number[][]): void {
        if (path.length < 2) return;
        const s = path[0], e = path[path.length - 1];
        this.grid![s[0]][s[1]] |= (WireRouter.HORIZONTAL | WireRouter.VERTICAL);
        this.grid![e[0]][e[1]] |= (WireRouter.HORIZONTAL | WireRouter.VERTICAL);
        let prevDir = WireRouter.NONE;
        for (let i = 1; i < path.length; i++) {
            const prev = path[i - 1], curr = path[i];
            const dr = curr[0] - prev[0], dc = curr[1] - prev[1];
            const thisDir = this.getMoveDir(dr, dc);
            const flag = (thisDir === WireRouter.LEFT || thisDir === WireRouter.RIGHT) ? WireRouter.HORIZONTAL : WireRouter.VERTICAL;
            this.grid![curr[0]][curr[1]] |= flag;
            if (prevDir !== WireRouter.NONE && thisDir !== prevDir && thisDir !== this.opposite(prevDir))
                this.grid![prev[0]][prev[1]] |= (WireRouter.HORIZONTAL | WireRouter.VERTICAL);
            prevDir = thisDir;
        }
    }

    private isValid(r: number, c: number): boolean {
        return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
    }

    private canMoveTo(r: number, c: number, moveDir: number): boolean {
        if (!this.isValid(r, c)) return false;
        const cell = this.grid![r][c];
        if ((cell & WireRouter.OBSTACLE) !== 0) return false;
        const flag = (moveDir === WireRouter.LEFT || moveDir === WireRouter.RIGHT) ? WireRouter.HORIZONTAL : WireRouter.VERTICAL;
        return (cell & flag) === 0;
    }

    private getMoveDir(dr: number, dc: number): number {
        if (dr === -1) return WireRouter.UP;
        if (dr ===  1) return WireRouter.DOWN;
        if (dc === -1) return WireRouter.LEFT;
        if (dc ===  1) return WireRouter.RIGHT;
        return WireRouter.NONE;
    }

    private opposite(d: number): number {
        if (d === WireRouter.UP)    return WireRouter.DOWN;
        if (d === WireRouter.DOWN)  return WireRouter.UP;
        if (d === WireRouter.LEFT)  return WireRouter.RIGHT;
        if (d === WireRouter.RIGHT) return WireRouter.LEFT;
        return WireRouter.NONE;
    }

    private manhattan(r1: number, c1: number, r2: number, c2: number): number {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2);
    }

    private neighbors(r: number, c: number): number[][] {
        const list: number[][] = [];
        if (r > 0)           list.push([r - 1, c, WireRouter.UP]);
        if (r < this.rows-1) list.push([r + 1, c, WireRouter.DOWN]);
        if (c > 0)           list.push([r, c - 1, WireRouter.LEFT]);
        if (c < this.cols-1) list.push([r, c + 1, WireRouter.RIGHT]);
        return list;
    }

    private key(r: number, c: number, d: number): string {
        return r + "," + c + "," + d;
    }

    private parseKey(key: string): number[] {
        const parts = key.split(",");
        return [parseIntStrict(parts[0]), parseIntStrict(parts[1]), parseIntStrict(parts[2])];
    }

    drawGrid(ctx: CanvasRenderingContext2D, showGridLines: boolean): void {
        if (this.grid === null || this.rows === 0 || this.cols === 0) return;
        ctx.save();
        ctx.translate(-this.gridSize / 2, -this.gridSize / 2);

        if (showGridLines) {
            ctx.strokeStyle = "#222244";
            ctx.lineWidth = 0.5;
            for (let r = 0; r < this.rows; r++) {
                const y = this.originY + r * this.gridSize;
                ctx.beginPath();
                ctx.moveTo(this.originX, y);
                ctx.lineTo(this.originX + this.cols * this.gridSize, y);
                ctx.stroke();
            }
            for (let c = 0; c < this.cols; c++) {
                const x = this.originX + c * this.gridSize;
                ctx.beginPath();
                ctx.moveTo(x, this.originY);
                ctx.lineTo(x, this.originY + this.rows * this.gridSize);
                ctx.stroke();
            }
        }

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.grid[r][c];
                const x = this.originX + c * this.gridSize;
                const y = this.originY + r * this.gridSize;
                const size = this.gridSize;

                if ((cell & WireRouter.OBSTACLE) !== 0) {
                    ctx.fillStyle = "#88ccff";
                    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
                    continue;
                }

                const hasHoriz = (cell & WireRouter.HORIZONTAL) !== 0;
                const hasVert  = (cell & WireRouter.VERTICAL)   !== 0;

                if (hasHoriz || hasVert) {
                    ctx.strokeStyle = "#88ccff";
                    ctx.lineWidth = 2.2;
                    const midX = x + size / 2;
                    const midY = y + size / 2;
                    if (hasHoriz) {
                        ctx.beginPath(); ctx.moveTo(x + 2, midY); ctx.lineTo(x + size - 2, midY); ctx.stroke();
                    }
                    if (hasVert) {
                        ctx.beginPath(); ctx.moveTo(midX, y + 2); ctx.lineTo(midX, y + size - 2); ctx.stroke();
                    }
                    if (hasHoriz && hasVert) {
                        ctx.fillStyle = "#44aaff";
                        ctx.beginPath(); ctx.arc(midX, midY, 3.5, 0, 2 * Math.PI); ctx.fill();
                    }
                }
            }
        }

        ctx.fillStyle = "rgba(255, 180, 60, 0.4)";
        ctx.fillRect(this.originX - 4, this.originY - 4, 8, 8);
        ctx.restore();
    }
}
