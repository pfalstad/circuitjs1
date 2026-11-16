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

interface RoutableElm {
    x: number; y: number; x2: number; y2: number;
    getPostCount(): number;
    getPost(n: number): Point;
    addRoutingObstacle(router: WireRouter): void;
}

// Min-heap of A* states keyed on fScore, stored in parallel arrays.
class StateHeap {
    private f: number[] = [];
    private g: number[] = [];
    private s: number[] = [];
    isEmpty(): boolean { return this.f.length === 0; }
    topG(): number { return this.g[0]; }
    topState(): number { return this.s[0]; }
    offer(f: number, g: number, s: number): void {
        const fa = this.f, ga = this.g, sa = this.s;
        let i = fa.length;
        fa.push(f); ga.push(g); sa.push(s);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (f >= fa[p]) break;
            fa[i] = fa[p]; ga[i] = ga[p]; sa[i] = sa[p];
            i = p;
        }
        fa[i] = f; ga[i] = g; sa[i] = s;
    }
    pop(): void {
        const fa = this.f, ga = this.g, sa = this.s;
        const lf = fa.pop()!, lg = ga.pop()!, ls = sa.pop()!;
        const n = fa.length;
        if (n === 0) return;
        let i = 0;
        while (true) {
            const l = 2 * i + 1, r = l + 1;
            let m = i, mf = lf;
            if (l < n && fa[l] < mf) { m = l; mf = fa[l]; }
            if (r < n && fa[r] < mf) { m = r; }
            if (m === i) break;
            fa[i] = fa[m]; ga[i] = ga[m]; sa[i] = sa[m];
            i = m;
        }
        fa[i] = lf; ga[i] = lg; sa[i] = ls;
    }
}

export class WireRouter {
    private rows: number = 0;
    private cols: number = 0;
    private grid: Uint8Array[] | null = null;

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

    // clear the cell at a point, so a route can start or end there whatever is in it
    clearPoint(px: number, py: number): void {
        const r = (py - this.originY) / this.gridSize | 0;
        const c = (px - this.originX) / this.gridSize | 0;
        if (this.isValid(r, c))
            this.grid![r][c] = 0;
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
            this.grid.push(new Uint8Array(this.cols));

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
            // the corner cell must also be free in the new direction
            if (!this.canLeave(r, c, moveDir))
                return -1;
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
        const fullPath = this.aStar(startR, startC, goalR, goalC);
        if (fullPath === null) return [];
        const compressed = this.compressPath(fullPath);
        return compressed.map(pt => new Point(pt[1] * this.gridSize + this.originX, pt[0] * this.gridSize + this.originY));
    }

    // A* search state, indexed by (r * cols + c) * 4 + (dir - 1).  Buffers are shared
    // between routers and reused; a generation stamp marks which entries are valid
    // so they never need to be cleared.
    private static gScoreBuf = new Float64Array(0);
    private static cameFromBuf = new Int32Array(0);
    private static stampBuf = new Uint32Array(0);
    private static generation = 0;

    private aStar(startR: number, startC: number, goalR: number, goalC: number): number[][] | null {
        const cols = this.cols;
        const nStates = this.rows * cols * 4;
        if (WireRouter.stampBuf.length < nStates) {
            WireRouter.gScoreBuf = new Float64Array(nStates);
            WireRouter.cameFromBuf = new Int32Array(nStates);
            WireRouter.stampBuf = new Uint32Array(nStates);
            WireRouter.generation = 0;
        }
        if (++WireRouter.generation === 0xffffffff) {
            WireRouter.stampBuf.fill(0);
            WireRouter.generation = 1;
        }
        const gen = WireRouter.generation;
        const gScore = WireRouter.gScoreBuf;
        const cameFrom = WireRouter.cameFromBuf;
        const stamp = WireRouter.stampBuf;
        const grid = this.grid!;
        const turnPenalty = this.turnPenalty;
        const heap = new StateHeap();
        const OBST = WireRouter.OBSTACLE, HORIZ = WireRouter.HORIZONTAL, VERT = WireRouter.VERTICAL;

        const startPrefs = this.getPreferredEscapeDirections(startR, startC);

        for (const d of [WireRouter.UP, WireRouter.DOWN, WireRouter.LEFT, WireRouter.RIGHT]) {
            if (!this.canMoveTo(startR + this.dr(d), startC + this.dc(d), d)) continue;
            let initG = 0.0;
            if (startPrefs.includes(d)) initG += WireRouter.ESCAPE_BONUS;
            const s = (startR * cols + startC) * 4 + d - 1;
            heap.offer(initG + Math.abs(startR - goalR) + Math.abs(startC - goalC), initG, s);
            gScore[s] = initG;
            cameFrom[s] = -1;
            stamp[s] = gen;
        }

        // the heuristic (manhattan distance) is consistent, so the first goal state
        // popped has the lowest cost and we can stop there.
        let goalState = -1;
        while (!heap.isEmpty()) {
            const g = heap.topG(), s = heap.topState();
            heap.pop();
            if (g > gScore[s]) continue;

            const cell = s >> 2;
            const dir = (s & 3) + 1;
            const r = (cell / cols) | 0;
            const c = cell - r * cols;
            if (r === goalR && c === goalC) { goalState = s; break; }

            const here = grid[r][c];
            for (let moveDir = 1; moveDir <= 4; moveDir++) {
                let nr = r, nc = c;
                if (moveDir === WireRouter.UP) nr--;
                else if (moveDir === WireRouter.DOWN) nr++;
                else if (moveDir === WireRouter.LEFT) nc--;
                else nc++;
                if (nr < 0 || nr >= this.rows || nc < 0 || nc >= cols) continue;
                const horiz = moveDir >= WireRouter.LEFT;
                const flag = horiz ? HORIZ : VERT;
                // canLeave(r, c, moveDir) && canMoveTo(nr, nc, moveDir)
                if ((here & flag) !== 0) continue;
                const there = grid[nr][nc];
                if ((there & (OBST | flag)) !== 0) continue;

                let moveCost = 1.0;
                if (horiz !== (dir >= WireRouter.LEFT))
                    moveCost += turnPenalty;

                const ns = (nr * cols + nc) * 4 + moveDir - 1;
                const tentG = g + moveCost;
                if (stamp[ns] !== gen || tentG < gScore[ns]) {
                    stamp[ns] = gen;
                    cameFrom[ns] = s;
                    gScore[ns] = tentG;
                    heap.offer(tentG + Math.abs(nr - goalR) + Math.abs(nc - goalC), tentG, ns);
                }
            }
        }

        if (goalState < 0) return null;

        const fullPath: number[][] = [];
        for (let s = goalState; s >= 0; s = cameFrom[s]) {
            const cell = s >> 2;
            const r = (cell / cols) | 0;
            fullPath.push([r, cell - r * cols]);
        }
        fullPath.reverse();
        return fullPath;
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

    // check that a wire can exit cell (r, c) in moveDir.  canMoveTo() only checks the
    // cell being entered, so without this a wire could turn in a cell that has an
    // existing wire running in the new direction and overlap it.
    private canLeave(r: number, c: number, moveDir: number): boolean {
        const flag = (moveDir === WireRouter.LEFT || moveDir === WireRouter.RIGHT) ? WireRouter.HORIZONTAL : WireRouter.VERTICAL;
        return (this.grid![r][c] & flag) === 0;
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
