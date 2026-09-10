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

// contributed by Edward Calver

import { ChipElm, Pin } from "./ChipElm";
import { Checkbox } from "./Checkbox";
import { CircuitElm } from "./CircuitElm";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { StringTokenizer } from "./StringTokenizer";
import { parseIntStrict } from "./NumberParse";

export class SeqGenElm extends ChipElm {
    readonly FLAG_NEW_VERSION = 2;
    readonly FLAG_PLAY_ONCE = 4;
    readonly FLAG_HAS_RESET = 8;

    bitPosition: number = 0;
    bitCount: number = 0;
    data: Int32Array = new Int32Array(1);
    clockstate: boolean = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        super(xa, ya, xb, yb, f, st);
        if (st !== undefined) {
            try {
                if ((this.flags & this.FLAG_NEW_VERSION) === 0) {
                    this.flags |= this.FLAG_NEW_VERSION;
                    // old format: single byte read backwards
                    let oldData = parseIntStrict(st.nextToken());
                    let newData = 0;
                    for (let i = 0; i < 32; i++) {
                        if (((~(0x7FFFFFFF - 1) >> i) !== 0) && (oldData & (1 << i)))
                            newData |= (1 << i);
                    }
                    this.bitCount = 8;
                    this.data = new Int32Array([newData]);
                } else {
                    this.bitCount = parseIntStrict(st.nextToken());
                    const wordCount = Math.trunc(this.bitCount / 32) + (this.bitCount % 32 !== 0 ? 1 : 0);
                    this.data = new Int32Array(wordCount);
                    for (let i = 0; i < wordCount; i++)
                        this.data[i] = parseIntStrict(st.nextToken());
                }
            } catch (e) {}
            if (this.bitCount > this.data.length * 32)
                this.bitCount = this.data.length * 32;
        } else {
            this.bitCount = 8;
            this.data = new Int32Array([0]);
            this.flags |= this.FLAG_NEW_VERSION;
            this.flags |= this.FLAG_HAS_RESET;
            this.setupPins();
            this.allocNodes();
        }
    }

    getChipName(): string { return "sequence generator"; }

    setupPins(): void {
        this.sizeX = 2;
        this.sizeY = 2;
        this.pins = new Array(this.getPostCount());

        this.pins[0] = new Pin(this, 0, ChipElm.SIDE_W, "");
        this.pins[0].clock = true;
        this.pins[1] = new Pin(this, 1, ChipElm.SIDE_E, "Q");
        this.pins[1].output = true;
        if (this.hasReset())
            this.pins[2] = new Pin(this, 1, ChipElm.SIDE_W, "R");
    }

    getVoltageDiff(): number { return this.nodes[1].v; }
    getPostCount(): number { return this.hasReset() ? 3 : 2; }
    getVoltageSourceCount(): number { return 1; }
    hasPlayOnce(): boolean { return (this.flags & this.FLAG_PLAY_ONCE) !== 0; }
    hasReset(): boolean { return (this.flags & this.FLAG_HAS_RESET) !== 0; }

    reset(): void {
        super.reset();
        this.bitPosition = 0;
    }

    nextBit(): void {
        if (this.data.length > 0 && this.bitCount > 0) {
            if (this.bitPosition >= this.bitCount) {
                if (this.hasPlayOnce()) {
                    this.pins[1].value = false;
                    return;
                }
                this.bitPosition = 0;
            }
            this.pins[1].value = (this.data[Math.trunc(this.bitPosition / 32)] & (1 << (this.bitPosition % 32))) !== 0;
            this.bitPosition++;
        } else {
            this.pins[1].value = false;
        }
    }

    execute(): void {
        if (this.hasReset() && this.pins[2].value) {
            this.bitPosition = 0;
            this.clockstate = this.pins[0].value;
            this.nextBit();
        } else {
            if (this.pins[0].value !== this.clockstate) {
                this.clockstate = this.pins[0].value;
                if (this.clockstate)
                    this.nextBit();
            }
        }
    }

    getDumpType(): number { return 188; }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "bc", this.bitCount);
        let s = "";
        for (let i = 0; i < this.data.length; i++) {
            if (i > 0) s += " ";
            s += this.data[i];
        }
        CircuitXMLSerializer.dumpAttr(elem, "dt", s);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.bitCount = xml.parseIntAttr("bc", this.bitCount);
        const dt = xml.parseStringAttr("dt", null);
        if (dt !== null) {
            const st = new StringTokenizer(dt, " ");
            const words: number[] = [];
            while (st.hasMoreTokens()) words.push(parseIntStrict(st.nextToken()));
            this.data = new Int32Array(words);
        }
        if (this.bitCount > this.data.length * 32)
            this.bitCount = this.data.length * 32;
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Play Once", this.hasPlayOnce());
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("Sequence", 0, -1, -1);
            ei.textArea = document.createElement("textarea");
            ei.textArea.rows = 5;
            let sb = "";
            for (let i = 0; i < this.bitCount; i++)
                sb += (this.data[Math.trunc(i / 32)] & (1 << (i % 32))) !== 0 ? '1' : '0';
            ei.textArea.value = sb;
            return ei;
        }
        return null;
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.flags = ei.changeFlag(this.flags, this.FLAG_PLAY_ONCE);
            return;
        }
        if (n === 1) {
            const s = ei.textArea!.value;
            // count bits
            this.bitCount = 0;
            for (let i = 0; i < s.length; i++)
                if (s[i] === '0' || s[i] === '1') this.bitCount++;
            const wordCount = Math.max(1, Math.trunc(this.bitCount / 32));
            this.data = new Int32Array(wordCount);
            // fill bits
            this.bitCount = 0;
            for (let i = 0; i < s.length; i++) {
                const c = s[i];
                if (c === '0' || c === '1') {
                    if (c === '1')
                        this.data[Math.trunc(this.bitCount / 32)] |= (1 << (this.bitCount % 32));
                    this.bitCount++;
                }
            }
        }
    }
}
