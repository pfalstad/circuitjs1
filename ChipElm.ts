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
import { CircuitNode } from "./CircuitNode";
import { Graphics } from "./Graphics";
import { Font } from "./Font";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageSource } from "./VoltageSource";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { WireRouter } from "./WireRouter";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class Pin {
    chip: ChipElm;
    pos: number;
    side: number;
    side0: number;
    text: string;
    post: Point;
    stub: Point;
    textloc: Point;
    bubbleX: number = 0;
    bubbleY: number = 0;
    voltSource: VoltageSource | null = null;
    lineOver: boolean = false;
    bubble: boolean = false;
    clock: boolean = false;
    output: boolean = false;
    value: boolean = false;
    state: boolean = false;
    selected: boolean = false;
    curcount: number = 0;
    current: number = 0;
    busWidth: number = 1;
    busZ: number = 0;
    clockPointsX: number[] | null = null;
    clockPointsY: number[] | null = null;

    constructor(chip: ChipElm, p: number, s: number, t: string) {
        this.chip = chip;
        this.pos = p;
        this.side0 = this.side = s;
        this.text = t;
    }

    setPoint(px: number, py: number, dx: number, dy: number, dax: number, day: number, sx: number, sy: number): void {
        const chip = this.chip;
        if (chip.isFlippedX()) {
            dx  = -dx;
            dax = -dax;
            px += chip.cspc2 * (chip.flippedSizeX - 1);
            sx  = -sx;
        }
        if (chip.isFlippedY()) {
            dy  = -dy;
            day = -day;
            py += chip.cspc2 * (chip.flippedSizeY - 1);
            sy  = -sy;
        }
        const xa = px + chip.cspc2 * dx * this.pos + sx;
        const ya = py + chip.cspc2 * dy * this.pos + sy;
        this.post    = new Point(xa + dax * chip.cspc2, ya + day * chip.cspc2);
        const busExtra = (this.busWidth > 1) ? 2 : 0;
        this.stub    = new Point(xa + dax * (chip.cspc + busExtra), ya + day * (chip.cspc + busExtra));
        this.textloc = new Point(xa, ya);
        this.post.z  = this.busZ;
        if (this.bubble) {
            this.bubbleX = xa + dax * 10 * chip.csize;
            this.bubbleY = ya + day * 10 * chip.csize;
        }
        if (this.clock) {
            if (this.clockPointsX === null) {
                this.clockPointsX = new Array(3);
                this.clockPointsY = new Array(3);
            }
            this.clockPointsX[0] = xa + dax * chip.cspc - dx * chip.cspc / 2;
            this.clockPointsY[0] = ya + day * chip.cspc - dy * chip.cspc / 2;
            this.clockPointsX[1] = xa;
            this.clockPointsY[1] = ya;
            this.clockPointsX[2] = xa + dax * chip.cspc + dx * chip.cspc / 2;
            this.clockPointsY[2] = ya + day * chip.cspc + dy * chip.cspc / 2;
            if (this.text.length > 0) {
                this.clockPointsX[1] += dax * chip.cspc / 2;
                this.clockPointsY[1] += day * chip.cspc / 2;
                this.textloc.x -= dax * chip.cspc / 2;
                this.textloc.y -= day * chip.cspc / 4;
            }
        } else {
            this.clockPointsX = null;
            this.clockPointsY = null;
        }
    }

    // convert position + side to a grid index so we can detect overlaps
    toGrid(p: number, s: number): number {
        const chip = this.chip;
        if (s === ChipElm.SIDE_N) return p;
        if (s === ChipElm.SIDE_S) return p + chip.sizeX * (chip.sizeY - 1);
        if (s === ChipElm.SIDE_W) return p * chip.sizeX;
        if (s === ChipElm.SIDE_E) return p * chip.sizeX + chip.sizeX - 1;
        return -1;
    }

    overlaps(p: number, s: number): boolean {
        const g = this.toGrid(p, s);
        if (g === -1) return true;
        return this.toGrid(this.pos, this.side) === g;
    }

    fixName(): void {
        if (this.text.startsWith("/")) {
            this.text = this.text.substring(1);
            this.lineOver = true;
        } else if (this.text.startsWith("#")) {
            this.text = this.text.substring(1);
            this.bubble = true;
        }

        let result = this.text.replace("CLK:", "");
        if (result.length !== this.text.length) {
            this.clock = true;
            this.text = result;
        }
        result = this.text.replace("INV:", "");
        if (result.length !== this.text.length) {
            this.bubble = true;
            this.text = result;
        }

        if (this.text.toLowerCase() === "clk") {
            this.text = "";
            this.clock = true;
        }
    }
}

export abstract class ChipElm extends CircuitElm {
    csize: number = 0;
    cspc: number = 0;
    cspc2: number = 0;
    bits: number = 0;
    highVoltage: number = 5;
    bitOrder: number = 0;
    pins: Pin[];
    rectPointsX: number[];
    rectPointsY: number[];
    sizeX: number = 0;
    sizeY: number = 0;
    flippedSizeX: number = 0;
    flippedSizeY: number = 0;
    lastClock: boolean = false;
    labelX: number = 0;
    labelY: number = 0;

    static readonly FLAG_SMALL         = 1;
    static readonly FLAG_FLIP_X        = 1 << 10;
    static readonly FLAG_FLIP_Y        = 1 << 11;
    static readonly FLAG_FLIP_XY       = 1 << 12;
    static readonly FLAG_CUSTOM_VOLTAGE = 1 << 13;
    static readonly BIT_ORDER_MSB_FIRST = 0;
    static readonly BIT_ORDER_LSB_FIRST = 1;
    static readonly BIT_ORDER_BUS       = 2;

    static readonly SIDE_N = 0;
    static readonly SIDE_S = 1;
    static readonly SIDE_W = 2;
    static readonly SIDE_E = 3;

    static readonly sideFlipXY = [
        ChipElm.SIDE_W, ChipElm.SIDE_E, ChipElm.SIDE_N, ChipElm.SIDE_S
    ];

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
            if (this.needsBits())
                this.bits = this.defaultBitCount();
            this.highVoltage = 5;
            this.noDiagonal = true;
            this.setupPins();
            this.setSize(this.useSmallGrid() ? 1 : 2);
        } else {
            super(xa, ya, xb, yb!, f!);
            if (this.needsBits())
                this.bits = st!.hasMoreTokens() ? parseInt(st!.nextToken()) : this.defaultBitCount();
            this.highVoltage = this.hasCustomVoltage() ? parseFloat(st!.nextToken()) : 5;
            this.noDiagonal = true;
            this.setupPins();
            this.setSize((f! & ChipElm.FLAG_SMALL) !== 0 ? 1 : 2);
            for (let i = 0; i !== this.getPostCount(); i++) {
                //if (this.pins == null)
                //    this.volts[i] = parseFloat(st!.nextToken());
                //else
                if (this.pins[i].state) {
                    const v = parseFloat(st!.nextToken());
                    this.pins[i].value = v > this.getThreshold();
                }
            }
        }
    }

    needsBits(): boolean { return false; }
    hasCustomVoltage(): boolean { return (this.flags & ChipElm.FLAG_CUSTOM_VOLTAGE) !== 0; }
    useBus(): boolean { return this.bitOrder === ChipElm.BIT_ORDER_BUS; }
    isDigitalChip(): boolean { return true; }
    getThreshold(): number { return this.highVoltage / 2; }
    defaultBitCount(): number { return 4; }

    setSize(s: number): void {
        this.csize = s;
        this.cspc  = 8 * s;
        this.cspc2 = this.cspc * 2;
        this.flags &= ~ChipElm.FLAG_SMALL;
        this.flags |= (s === 1) ? ChipElm.FLAG_SMALL : 0;
    }

    abstract setupPins(): void;

    draw(g: Graphics): void {
        this.drawChip(g);
    }

    drawChip(g: Graphics): void {
        g.save();
        const f = new Font("normal", 0, 10 * this.csize);
        let hasVertical = false;
        for (let i = 0; i !== this.getPostCount(); i++)
            if (this.pins[i].side === ChipElm.SIDE_N || this.pins[i].side === ChipElm.SIDE_S) {
                hasVertical = true;
                break;
            }
        for (let i = 0; i !== this.getPostCount(); i++) {
            g.setFont(f);
            const p = this.pins[i];
            if (p.busZ > 0)
                continue;
            this.setVoltageColor(g, this.nodes[i].v);
            const a = p.post;
            const b = p.stub;
            CircuitElm.drawThickLine(g, a, b, p.busWidth > 1 ? 5 : 3);
            p.curcount = this.updateDotCountImpl(p.current, p.curcount);
            this.drawDots(g, b, a, p.curcount);
            if (p.bubble) {
                g.setColor(CircuitElm.app.getBackgroundColor());
                CircuitElm.drawThickCircle(g, p.bubbleX, p.bubbleY, 1);
                g.setColor(CircuitElm.lightGrayColor);
                CircuitElm.drawThickCircle(g, p.bubbleX, p.bubbleY, 3);
            }
            if (p.clockPointsX !== null)  {
                g.setColor(CircuitElm.lightGrayColor);
                g.drawPolyline(p.clockPointsX, p.clockPointsY!, 3);
            }
            g.setColor(p.selected ? CircuitElm.selectColor : CircuitElm.whiteColor);
            let fsz = 10 * this.csize;
            let availSpace = this.cspc * 2 - 8;
            if (!hasVertical && this.sizeX > 2)
                availSpace = this.cspc * 2.5 + this.cspc * (this.sizeX - 3);
            const text = p.busWidth > 1 ? p.text + "/" + p.busWidth : p.text;
            while (true) {
                const sw = g.context.measureText(text).width;
                if (sw > availSpace) {
                    fsz -= 1;
                    g.setFont(new Font("normal", 0, fsz));
                    continue;
                }
                const asc = g.currentFontSize;
                let tx: number;
                if (p.side === this.flippedXSide(ChipElm.SIDE_W))
                    tx = p.textloc.x - (this.cspc - 5);
                else if (p.side === this.flippedXSide(ChipElm.SIDE_E))
                    tx = p.textloc.x + (this.cspc - 5) - sw;
                else
                    tx = p.textloc.x - sw / 2;
                g.drawString(text, tx, p.textloc.y + asc / 3);
                if (p.lineOver) {
                    const ya = p.textloc.y - asc + asc / 3;
                    g.drawLine(tx, ya, tx + sw, ya);
                }
                break;
            }
        }
        this.drawLabel(g, this.labelX, this.labelY);
        g.setColor(this.needsHighlight() ? CircuitElm.selectColor : CircuitElm.lightGrayColor);
        CircuitElm.drawThickPolygon(g, this.rectPointsX, this.rectPointsY, 4);
        this.drawPosts(g);
        g.restore();
    }

    drawLabel(g: Graphics, x: number, y: number): void {}

    drag(xx: number, yy: number): void {
        yy = this.snapGrid(yy);
        if (xx < this.x) {
            xx = this.x; yy = this.y;
        } else {
            this.y = this.y2 = yy;
            this.x2 = Math.min(this.snapGrid(xx), this.x + (this.sizeX + 1) * this.cspc2);
        }
        this.setPoints();
    }

    setPoints(): void {
        if (this.x2 - this.x > this.sizeX * this.cspc2 && this.isCreating())
            this.setSize(2);
        const x0 = this.x + this.cspc2;
        const y0 = this.y;
        const xr = x0 - this.cspc;
        const yr = y0 - this.cspc;
        this.flippedSizeX = this.sizeX;
        this.flippedSizeY = this.sizeY;
        if (this.isFlippedXY()) {
            this.flippedSizeX = this.sizeY;
            this.flippedSizeY = this.sizeX;
        }
        const xs = this.flippedSizeX * this.cspc2;
        const ys = this.flippedSizeY * this.cspc2;
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            p.side = p.side0;
            if ((this.flags & ChipElm.FLAG_FLIP_XY) !== 0)
                p.side = ChipElm.sideFlipXY[p.side];
            switch (p.side) {
                case ChipElm.SIDE_N: p.setPoint(x0, y0,  1,  0,  0, -1, 0,        0        ); break;
                case ChipElm.SIDE_S: p.setPoint(x0, y0,  1,  0,  0,  1, 0,        ys-this.cspc2); break;
                case ChipElm.SIDE_W: p.setPoint(x0, y0,  0,  1, -1,  0, 0,        0        ); break;
                case ChipElm.SIDE_E: p.setPoint(x0, y0,  0,  1,  1,  0, xs-this.cspc2, 0   ); break;
            }
        }
        this.rectPointsX = [xr, xr+xs, xr+xs, xr];
        this.rectPointsY = [yr, yr,     yr+ys, yr+ys];
        this.setBbox(xr, yr, this.rectPointsX[2], this.rectPointsY[2]);
        this.labelX = xr + xs / 2;
        this.labelY = yr + ys / 2;
    }

    addRoutingObstacle(router: WireRouter): void {
        router.addObstacle(this.rectPointsX[0], this.rectPointsY[0], this.rectPointsX[2], this.rectPointsY[2]);
    }

    getPinPos(xp: number, yp: number, currentSide: number, pos: number[]): boolean {
        const x0 = this.x + this.cspc2;
        const y0 = this.y;
        const xr = x0 - this.cspc;
        const yr = y0 - this.cspc;
        const xd = (xp - xr) / this.cspc2 - .5;
        const yd = (yp - yr) / this.cspc2 - .5;
        if (xd >= 0 && xd <= this.sizeX && yd >= 0 && yd <= this.sizeY) {
            const dW = xd, dE = this.sizeX - xd, dN = yd, dS = this.sizeY - yd;
            const curDist = (currentSide === ChipElm.SIDE_N) ? dN : (currentSide === ChipElm.SIDE_S) ? dS :
                            (currentSide === ChipElm.SIDE_W) ? dW : dE;
            const minDist = Math.min(Math.min(dW, dE), Math.min(dN, dS));
            let side: number;
            if (curDist <= minDist + 1.0) {
                side = currentSide;
            } else {
                side = (minDist === dN) ? ChipElm.SIDE_N : (minDist === dS) ? ChipElm.SIDE_S :
                       (minDist === dW) ? ChipElm.SIDE_W : ChipElm.SIDE_E;
            }
            pos[0] = (side === ChipElm.SIDE_N || side === ChipElm.SIDE_S)
                ? Math.max(0, Math.min(Math.round(xd), this.sizeX - 1))
                : Math.max(0, Math.min(Math.round(yd), this.sizeY - 1));
            pos[1] = side;
            return true;
        }
        const distW = xd < 0          ? -xd              : Number.MAX_VALUE;
        const distE = xd > this.sizeX ? xd - this.sizeX  : Number.MAX_VALUE;
        const distN = yd < 0          ? -yd              : Number.MAX_VALUE;
        const distS = yd > this.sizeY ? yd - this.sizeY  : Number.MAX_VALUE;
        const minDist = Math.min(Math.min(distW, distE), Math.min(distN, distS));
        if (minDist === distN) {
            pos[0] = Math.max(0, Math.min(Math.round(xd), this.sizeX - 1));
            pos[1] = ChipElm.SIDE_N;
        } else if (minDist === distS) {
            pos[0] = Math.max(0, Math.min(Math.round(xd), this.sizeX - 1));
            pos[1] = ChipElm.SIDE_S;
        } else if (minDist === distW) {
            pos[0] = Math.max(0, Math.min(Math.round(yd), this.sizeY - 1));
            pos[1] = ChipElm.SIDE_W;
        } else {
            pos[0] = Math.max(0, Math.min(Math.round(yd), this.sizeY - 1));
            pos[1] = ChipElm.SIDE_E;
        }
        return true;
    }

    getOverlappingPin(p1: number, p2: number, pin: number): number {
        for (let i = 0; i !== this.getPostCount(); i++) {
            if (pin === i || this.pins[i].busZ > 0)
                continue;
            if (this.pins[i].overlaps(p1, p2))
                return i;
        }
        return -1;
    }

    getPost(n: number): Point { return this.pins[n].post; }
    getPostWidth(n: number): number { return this.pins[n].busWidth; }

    abstract getVoltageSourceCount(): number;

    setVoltageSource(j: number, vs: VoltageSource): void {
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (p.output && j-- === 0) {
                p.voltSource = vs;
                vs.setNodes(CircuitNode.ground, this.nodes[i]);
                return;
            }
        }
        console.log("setVoltageSource failed for " + this);
    }

    setHighVoltage(hv: number): void { this.highVoltage = hv; }

    stamp(): void {
        let vsc = 0;
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (p.output) {
                CircuitElm.sim.stampVoltageSource(CircuitNode.ground, this.nodes[i], p.voltSource);
                vsc++;
            }
        }
        if (vsc !== this.getVoltageSourceCount())
            console.log("voltage source count does not match number of outputs");
    }

    execute(): void {}

    doStep(): void {
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (!p.output)
                p.value = this.nodes[i].v > this.getThreshold();
        }
        this.execute();
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (p.output)
                CircuitElm.sim.updateVoltageSource(CircuitNode.ground, this.nodes[i], p.voltSource!,
                    p.value ? this.highVoltage : 0);
        }
    }

    reset(): void {
        for (let i = 0; i !== this.getPostCount(); i++) {
            this.pins[i].value    = false;
            this.pins[i].curcount = 0;
        }
        this.lastClock = false;
    }

    dump(): string {
        if (this.highVoltage === 5)
            this.flags &= ~ChipElm.FLAG_CUSTOM_VOLTAGE;
        else
            this.flags |= ChipElm.FLAG_CUSTOM_VOLTAGE;
        let s = super.dump();
        if (this.needsBits())
            s += " " + this.bits;
        if (this.hasCustomVoltage())
            s += " " + this.highVoltage;
        for (let i = 0; i !== this.getPostCount(); i++)
            if (this.pins[i].state)
                s += " " + this.nodes[i].v;
        return s;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        if (this.bits > 0)
            CircuitXMLSerializer.dumpAttr(elem, "bi", this.bits);
        if (this.highVoltage !== 5)
            CircuitXMLSerializer.dumpAttr(elem, "hv", this.highVoltage);
        if (this.bitOrder !== 0)
            CircuitXMLSerializer.dumpAttr(elem, "bo", this.bitOrder);
    }

    dumpXmlState(doc: Document, elem: Element): void {
        for (let i = 0; i !== this.getPostCount(); i++)
            if (this.pins[i].state && this.nodes[i].v > 0)
                CircuitXMLSerializer.dumpAttr(elem, "v" + i, this.nodes[i].v);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.flags = 0; // might get set by setSize() in constructor
        super.undumpXml(xml);
        this.bits        = xml.parseIntAttr("bi", this.bits);
        this.highVoltage = xml.parseDoubleAttr("hv", this.highVoltage);
        this.bitOrder    = xml.parseIntAttr("bo", this.bitOrder);
        this.setupPins();
        this.setSize((this.flags & ChipElm.FLAG_SMALL) !== 0 ? 1 : 2);
        for (let i = 0; i !== this.getPostCount(); i++) {
            const v = xml.parseDoubleAttr("v" + i, 0);
            if (this.pins != null)
                this.pins[i].value = v > this.getThreshold();
        }
    }

    writeOutput(n: number, value: boolean): void {
        if (!this.pins[n].output)
            console.log("pin " + n + " is not an output!");
        this.pins[n].value = value;
    }

    getInfo(arr: string[]): void {
        arr[0] = this.getChipName();
        let a = 1, shown = 0;
        for (let i = 0; i !== this.getPostCount(); i++) {
            const p = this.pins[i];
            if (arr[a] !== null && arr[a] !== undefined)
                arr[a] += "; ";
            else
                arr[a] = "";
            let t = p.text;
            if (p.lineOver) t += "'";
            if (p.clock)    t = "Clk";
            if (p.busWidth > 1) {
                let value = 0;
                for (let j = 0; j < p.busWidth; j++)
                    if (this.nodes[i + j].v > this.getThreshold())
                        value |= 1 << this.pins[i + j].busZ;
                arr[a] += t + " = " + value + " / 0x" + value.toString(16).toUpperCase();
                i += p.busWidth - 1;
            } else
                arr[a] += t + " = " + CircuitElm.getVoltageText(this.nodes[i].v);
            if (++shown % 2 === 0)
                a++;
        }
    }

    setCurrent(vs: VoltageSource, c: number): void {
        for (let i = 0; i !== this.getPostCount(); i++)
            if (this.pins[i].output && this.pins[i].voltSource === vs)
                this.pins[i].current = c;
    }

    validate(): boolean {
        for (let i = 0; i !== this.getPostCount(); i++)
            if (this.pins[i].output && !this.validateRailNode(i))
                return false;
        return true;
    }

    getChipName(): string { return "chip"; }
    getConnection(n1: number, n2: number): boolean { return false; }
    hasGroundConnection(n1: number): boolean { return this.pins[n1].output; }

    getCurrentIntoNode(n: number): number { return this.pins[n].current; }

    isFlippedX():  boolean { return this.hasFlag(ChipElm.FLAG_FLIP_X ); }
    isFlippedY():  boolean { return this.hasFlag(ChipElm.FLAG_FLIP_Y ); }
    isFlippedXY(): boolean { return this.hasFlag(ChipElm.FLAG_FLIP_XY); }

    allowBus(): boolean { return false; }

    flippedXSide(s: number): number {
        if (!this.isFlippedX()) return s;
        if (s === ChipElm.SIDE_W) return ChipElm.SIDE_E;
        if (s === ChipElm.SIDE_E) return ChipElm.SIDE_W;
        return s;
    }

    flipX(center2: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_X;
        if (count !== 1) {
            const xs = (this.flippedSizeX + 1) * this.cspc2;
            this.x  = center2 - this.x - xs;
            this.x2 = center2 - this.x2;
        }
        this.setPoints();
    }

    flipY(center2: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_Y;
        if (count !== 1) {
            const ys = (this.flippedSizeY - 1) * this.cspc2;
            this.y  = center2 - this.y - ys;
            this.y2 = center2 - this.y2;
        }
        this.setPoints();
    }

    flipXY(xmy: number, count: number): void {
        this.flags ^= ChipElm.FLAG_FLIP_XY;
        if (this.isFlippedX() !== this.isFlippedY())
            this.flags ^= ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y;
        if (count !== 1) {
            this.x += this.cspc2;
            super.flipXY(xmy, count);
            this.x -= this.cspc2;
        }
        this.setPoints();
    }

    getNumHandles(): number { return 0; }

    getEditInfo(n: number): EditInfo | null {
        if (this.isDigitalChip()) {
            if (n === 0)
                return new EditInfo("High Logic Voltage", this.highVoltage);
            n--;
        }
        if (this.allowBus()) {
            if (n === 0) {
                const ei = new EditInfo("Bit Order", 0, -1, -1);
                ei.choice = new Choice();
                ei.choice.add("MSB First");
                ei.choice.add("LSB First");
                ei.choice.add("Bus");
                ei.choice.select(this.bitOrder);
                return ei;
            }
            n--;
        }
        return this.getChipEditInfo(n);
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (this.isDigitalChip()) {
            if (n === 0) {
                this.highVoltage = ei.value;
                return;
            }
            n--;
        }
        if (this.allowBus()) {
            if (n === 0) {
                this.bitOrder = ei.choice!.getSelectedIndex();
                this.setupPins();
                this.setPoints();
                return;
            }
            n--;
        }
        this.setChipEditValue(n, ei);
    }

    getChipEditInfo(n: number): EditInfo | null { return null; }
    setChipEditValue(n: number, ei: EditInfo): void {}

    makeBitPins(count: number, pos: number, side: number, offset: number, name: string, output: boolean, state: boolean, reversed: boolean): void {
        for (let i = 0; i !== count; i++) {
            const ii = reversed ? offset + count - 1 - i : offset + i;
            if (this.useBus()) {
                this.pins[ii] = new Pin(this, pos, side, name);
                this.pins[ii].busWidth = count;
                this.pins[ii].busZ    = i;
            } else if (this.bitOrder === ChipElm.BIT_ORDER_LSB_FIRST) {
                this.pins[ii] = new Pin(this, pos + i, side, name + i);
            } else {
                this.pins[ii] = new Pin(this, pos + (count - 1 - i), side, name + i);
            }
            this.pins[ii].output = output;
            this.pins[ii].state  = state;
        }
    }

    static writeBits(data: boolean[]): string {
        let sb = "";
        let integer = 0;
        let bitIndex = 0;
        for (let i = 0; i < data.length; i++) {
            if (bitIndex >= 32) {
                sb += " " + integer;
                integer  = 0;
                bitIndex = 0;
            }
            if (data[i])
                integer |= 1 << bitIndex;
            bitIndex++;
        }
        if (bitIndex > 0)
            sb += " " + integer;
        return sb;
    }

    static readBits(st: StringTokenizer, output: boolean[]): void {
        let integer  = 0;
        let bitIndex = 32; // force load on first iteration
        for (let i = 0; i < output.length; i++) {
            if (bitIndex >= 32) {
                if (st.hasMoreTokens()) {
                    integer  = parseInt(st.nextToken());
                    bitIndex = 0;
                } else
                    break;
            }
            output[i] = (integer & (1 << bitIndex)) !== 0;
            bitIndex++;
        }
    }

    static writeBitsToString(data: boolean[]): string {
        let sb = "";
        let integer  = 0;
        let bitIndex = 0;
        for (let i = 0; i < data.length; i++) {
            if (bitIndex >= 32) {
                if (sb.length > 0) sb += " ";
                sb += integer;
                integer  = 0;
                bitIndex = 0;
            }
            if (data[i])
                integer |= 1 << bitIndex;
            bitIndex++;
        }
        if (sb.length > 0) sb += " ";
        sb += integer;
        return sb;
    }

    static readBitsFromString(s: string, output: boolean[]): void {
        const st = new StringTokenizer(s, " ");
        let integer  = 0;
        let bitIndex = 32;
        for (let i = 0; i < output.length; i++) {
            if (bitIndex >= 32) {
                if (st.hasMoreTokens()) {
                    integer  = parseInt(st.nextToken());
                    bitIndex = 0;
                } else
                    break;
            }
            output[i] = (integer & (1 << bitIndex)) !== 0;
            bitIndex++;
        }
    }
}
