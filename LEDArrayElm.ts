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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Diode } from "./Diode";
import { DiodeModel } from "./DiodeModel";
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export class LEDArrayElm extends ChipElm {
    diodes: Diode[] | null = null;
    currents: number[] = [];
    brightness: number[] = [];
    lastDrawTime: number = 0;
    decayMultiplier: number = 1;
    // time constant for exponential brightness decay (30ms persistence of vision)
    static readonly brightnessTau = 0.03;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xa, ya);
        } else {
            super(xa, ya, xb, yb!, f!, st!);
            try {
                this.sizeX = parseInt(st!.nextToken());
                this.sizeY = parseInt(st!.nextToken());
            } catch (e) {}
            this.allocNodes();
            this.setupPins();
            this.setPoints();
        }
    }

    dump(): string { return super.dump() + " " + this.sizeX + " " + this.sizeY; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "sx", this.sizeX);
        CircuitXMLSerializer.dumpAttr(elem, "sy", this.sizeY);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.sizeX = xml.parseIntAttr("sx", this.sizeX);
        this.sizeY = xml.parseIntAttr("sy", this.sizeY);
    }

    getChipName(): string { return "LED array"; }

    setupPins(): void {
        if (this.sizeX === 0 || this.sizeY === 0) {
            this.sizeX = this.sizeY = 8;
            this.allocNodes();
        }
        this.pins = new Array(this.sizeX + this.sizeY);
        for (let i = 0; i !== this.sizeX; i++)
            this.pins[i] = new Pin(this, i, ChipElm.SIDE_S, "");
        for (let i = 0; i !== this.sizeY; i++)
            this.pins[i + this.sizeX] = new Pin(this, i, ChipElm.SIDE_W, "");
        this.brightness = new Array(this.sizeX * this.sizeY).fill(0);
    }

    reset(): void {
        this.brightness = new Array(this.sizeX * this.sizeY).fill(0);
    }

    stamp(): void {
        super.stamp();
        this.diodes = new Array(this.sizeX * this.sizeY);
        const model = DiodeModel.getModelWithName("default-led");
        for (let i = 0; i !== this.diodes.length; i++) {
            this.diodes[i] = new Diode(CircuitElm.sim);
            this.diodes[i].setup(model);
            this.diodes[i].stamp(this.nodes[this.sizeX + Math.trunc(i / this.sizeX)], this.nodes[i % this.sizeX]);
        }
        this.currents = new Array(this.diodes.length).fill(0);
    }

    doStep(): void {
        super.doStep();
        let i = 0;
        for (let iy = 0; iy !== this.sizeY; iy++)
            for (let ix = 0; ix !== this.sizeX; ix++, i++)
                this.diodes![i].doStep(this.volts[this.sizeX + iy] - this.volts[ix]);
    }

    nonLinear(): boolean { return true; }
    isDigitalChip(): boolean { return false; }

    draw(g: Graphics): void {
        const elapsed = CircuitElm.sim.t - this.lastDrawTime;
        this.lastDrawTime = CircuitElm.sim.t;
        this.decayMultiplier = (elapsed > 0) ? Math.exp(-elapsed / LEDArrayElm.brightnessTau) : 1;
        this.drawChip(g);
        for (let ix = 0; ix !== this.sizeX; ix++) {
            for (let iy = 0; iy !== this.sizeY; iy++) {
                const i = ix + iy * this.sizeX;
                this.setLEDColor(g, i);
                if (this.isFlippedXY())
                    g.fillOval(this.pins[iy + this.sizeX].post.x - this.cspc / 2,
                               this.pins[ix].post.y - this.cspc / 2,
                               this.cspc, this.cspc);
                else
                    g.fillOval(this.pins[ix].post.x - this.cspc / 2,
                               this.pins[iy + this.sizeX].post.y - this.cspc / 2,
                               this.cspc, this.cspc);
            }
        }
    }

    calculateCurrent(): void {
        for (let ix = 0; ix !== this.sizeX; ix++)
            this.pins[ix].current = 0;

        // avoid exception if called before stamp()
        if (this.diodes == null)
            return;

        let i = 0;
        for (let iy = 0; iy !== this.sizeY; iy++) {
            let cur = 0;
            for (let ix = 0; ix !== this.sizeX; ix++, i++) {
                this.currents[i] = this.diodes[i].calculateCurrent(this.volts[this.sizeX + iy] - this.volts[ix]);
                cur += this.currents[i];
                this.pins[ix].current += this.currents[i];
            }
            this.pins[iy + this.sizeX].current = -cur;
        }
    }

    stepFinished(): void {
        for (let i = 0; i !== this.currents.length; i++)
            if (Math.abs(this.currents[i]) > 1e12)
                CircuitElm.sim.stop("max current exceeded", this);
    }

    private setLEDColor(g: Graphics, p: number): void {
        // 10mA current = max brightness
        if (!this.currents || this.currents.length === 0) {
            g.setColor(new Color(20, 0, 0));
            return;
        }
        let w = this.currents[p] / 0.01;
        if (w > 0)
            w = 255 * (1 + 0.2 * Math.log(w));
        if (w > 255)
            w = 255;
        if (w < 20)
            w = 20;

        // when diode turns off, fade gradually to simulate persistence of vision
        w = Math.max(w, this.brightness[p]);
        this.brightness[p] = w * this.decayMultiplier;

        g.setColor(new Color(Math.trunc(w), 0, 0));
    }

    getPostCount(): number { return this.sizeX + this.sizeY; }
    getVoltageSourceCount(): number { return 0; }
    getMatrixConnection(n1: number, n2: number): boolean { return true; }
    getDumpType(): number { return 405; }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Grid Width", this.sizeX).setDimensionless();
        if (n === 1)
            return new EditInfo("Grid Height", this.sizeY).setDimensionless();
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            if (ei.value >= 2 && ei.value <= 16) {
                this.sizeX = Math.trunc(ei.value);
                this.allocNodes();
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 2 and 16");
            return;
        }
        if (n === 1) {
            if (ei.value >= 2 && ei.value <= 16) {
                this.sizeY = Math.trunc(ei.value);
                this.allocNodes();
                this.setupPins();
                this.setPoints();
            } else
                ei.setError("must be between 2 and 16");
            return;
        }
    }

    getInfo(arr: string[]): void {
        arr[0] = this.getChipName();
    }
}
