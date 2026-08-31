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
import { StringTokenizer } from "./StringTokenizer";
import { EditInfo } from "./EditInfo";
import { Checkbox } from "./Checkbox";
import { Choice } from "./Choice";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { GroupPin, syncedValue } from "./digital/DigitalElm";
import type { Group, DigitalElmInstance } from "./digital/DigitalElm";
import { appendInfoLine } from "./digital/CircuitWiring";
import { digitalStateTextForOutput } from "./digital/DigitalGraphBuilder";
import { chipStart } from "./digital/chip_desc";
import type { ChipDesc, ChipLogic } from "./digital/chip_desc";
import type { DigitalSynthesis } from "./digital/DigitalGraphBuilder";

export class SevenSegDecoderElm extends ChipElm implements Group {

    private static readonly symbols: boolean[][] = [
        [true,true,true,true,true,true,false],     //0
        [false,true,true,false,false,false,false],  //1
        [true,true,false,true,true,false,true],     //2
        [true,true,true,true,false,false,true],     //3
        [false,true,true,false,false,true,true],    //4
        [true,false,true,true,false,true,true],     //5
        [true,false,true,true,true,true,true],      //6
        [true,true,true,false,false,false,false],   //7
        [true,true,true,true,true,true,true],       //8
        [true,true,true,false,false,true,true],     //9
        [true,true,true,false,true,true,true],      //A
        [false,false,true,true,true,true,true],     //B
        [true,false,false,true,true,true,false],    //C
        [false,true,true,true,true,false,true],     //D
        [true,false,false,true,true,true,true],     //E
        [true,false,false,false,true,true,true],    //F
    ];

    // 14-segment encoding: a=top, b=upper-right, c=lower-right, d=bottom, e=lower-left, f=upper-left,
    // g=diag UL-center, h=vert upper, i=diag UR-center, j=horiz right-center,
    // k=diag center-LR, l=vert lower, m=diag center-LL, n=horiz left-center
    private static readonly symbols14: boolean[][] = [
        [true,true,true,true,true,true, false,false,true,false,false,false,true,false],     //0
        [false,true,true,false,false,false, false,false,true,false,false,false,false,false], //1
        [true,true,false,true,true,false, false,false,false,true,false,false,false,true],    //2
        [true,true,true,true,false,false, false,false,false,true,false,false,false,true],    //3
        [false,true,true,false,false,true, false,false,false,true,false,false,false,true],   //4
        [true,false,true,true,false,true, false,false,false,true,false,false,false,true],    //5
        [true,false,true,true,true,true, false,false,false,true,false,false,false,true],     //6
        [true,false,false,false,false,false, false,false,true,false,false,true,false,false], //7
        [true,true,true,true,true,true, false,false,false,true,false,false,false,true],      //8
        [true,true,true,true,false,true, false,false,false,true,false,false,false,true],     //9
        [true,true,true,false,true,true, false,false,false,true,false,false,false,true],     //A
        [true,true,true,true,false,false, false,true,false,true,false,true,false,false],     //B
        [true,false,false,true,true,true, false,false,false,false,false,false,false,false],  //C
        [true,true,true,true,false,false, false,true,false,false,false,true,false,false],    //D
        [true,false,false,true,true,true, false,false,false,true,false,false,false,true],    //E
        [true,false,false,false,true,true, false,false,false,true,false,false,false,true],   //F
    ];

    // 16-segment encoding: a=top-left, b=top-right, c=upper-right, d=lower-right,
    // e=bottom-right, f=bottom-left, g=lower-left, h=upper-left,
    // i=diag UL-center, j=vert upper, k=diag UR-center, l=horiz right,
    // m=diag center-LR, n=vert lower, o=diag center-LL, p=horiz left
    private static readonly symbols16: boolean[][] = [
        [true,true,true,true,true,true,true,true, false,false,true,false,false,false,true,false],     //0
        [false,false,true,true,false,false,false,false, false,false,true,false,false,false,false,false], //1
        [true,true,true,false,true,true,true,false, false,false,false,true,false,false,false,true],    //2
        [true,true,true,true,true,true,false,false, false,false,false,true,false,false,false,true],    //3
        [false,false,true,true,false,false,false,true, false,false,false,true,false,false,false,true], //4
        [true,true,false,true,true,true,false,true, false,false,false,true,false,false,false,true],    //5
        [true,true,false,true,true,true,true,true, false,false,false,true,false,false,false,true],     //6
        [true,true,false,false,false,false,false,false, false,false,true,false,false,true,false,false],//7
        [true,true,true,true,true,true,true,true, false,false,false,true,false,false,false,true],      //8
        [true,true,true,true,true,true,false,true, false,false,false,true,false,false,false,true],     //9
        [true,true,true,true,false,false,true,true, false,false,false,true,false,false,false,true],    //A
        [true,true,true,true,true,true,false,false, false,true,false,true,false,true,false,false],     //B
        [true,true,false,false,true,true,true,true, false,false,false,false,false,false,false,false],  //C
        [true,true,true,true,true,true,false,false, false,true,false,false,false,true,false,false],    //D
        [true,true,false,false,true,true,true,true, false,false,false,true,false,false,false,true],    //E
        [true,true,false,false,false,false,true,true, false,false,false,true,false,false,false,true],  //F
    ];

    static readonly FLAG_ENABLE = (1 << 1);
    static readonly FLAG_BLANK_F = (1 << 2);

    segmentType: number = 0; // 0=7-seg, 1=14-seg, 2=16-seg

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb !== undefined) {
            super(xa, ya, xb, yb!, f!, st!);
            try {
                this.segmentType = parseInt(st!.nextToken());
                this.setupPins();
                this.setPoints();
            } catch (e) {}
        } else {
            super(xa, ya);
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "sgt", this.segmentType);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.segmentType = xml.parseIntAttr("sgt", this.segmentType);
        this.setupPins();
    }

    getSegmentCount(): number {
        if (this.segmentType === 1) return 14;
        if (this.segmentType === 2) return 16;
        return 7;
    }

    needsBits(): boolean { return false; }
    allowBus(): boolean { return true; }

    getChipName(): string {
        if (this.getSegmentCount() === 7)  return "7-Segment Decoder";
        if (this.getSegmentCount() === 14) return "14-Segment Decoder";
        return "16-Segment Decoder";
    }

    setupPins(): void {
        const segCount = this.getSegmentCount();
        this.bits = 4;
        this.sizeX = 3;
        const inputPinsY = this.useBus() ? 1 : 4;
        const outputPinsY = this.useBus() ? 1 : segCount;
        this.sizeY = Math.max(outputPinsY, inputPinsY + (this.hasBlank() ? 1 : 0));
        this.pins = new Array(this.getPostCount());

        this.makeBitPins(4, 0, ChipElm.SIDE_W, segCount, "I", false, false, true);

        if (this.useBus()) {
            this.makeBitPins(segCount, 0, ChipElm.SIDE_E, 0, "seg", true, false, false);
        } else {
            for (let i = 0; i < segCount; i++) {
                this.pins[i] = new Pin(this, i, ChipElm.SIDE_E, String.fromCharCode('a'.charCodeAt(0) + i));
                this.pins[i].output = true;
            }
        }

        if (this.hasBlank()) {
            this.pins[segCount + 4] = new Pin(this, inputPinsY, ChipElm.SIDE_W, "BI");
            this.pins[segCount + 4].bubble = true;
        }
        this.allocNodes();
    }

    hasBlank(): boolean { return (this.flags & SevenSegDecoderElm.FLAG_ENABLE) !== 0; }
    blankOnF(): boolean { return (this.flags & SevenSegDecoderElm.FLAG_BLANK_F) !== 0; }

    // --- Group/GroupPin: digital fast-path scaffolding - see
    // CounterElm.ts/DFlipFlopElm.ts for the same pattern.
    //
    // this.inputs layout (wireDigitalCircuit() populates it as every
    // non-output pin, in post order): setupPins() lays the segment
    // outputs out first (posts [0, segCount), all output - excluded), then
    // the I3..I0 bit pins via makeBitPins(..., reversed=true) - which,
    // read in POST order, comes out I3,I2,I1,I0 (see execute()'s own
    // pins[segCount+0..3] indexing, weights 8/4/2/1 respectively) - then
    // BI last (iff hasBlank()). So:
    //   inputs[0..3] -> I3,I2,I1,I0 (weights 8,4,2,1 - matches execute())
    //   inputs[4]    -> BI (iff hasBlank())
    // digitalPins[k] is segment k (pins[k], k in [0, segCount)) - already
    // in post order with nothing else output before it, so no reindexing
    // is needed the way a chip with non-output pins mixed in earlier
    // would require.
    inputs: DigitalElmInstance[] = [];
    digitalPins: GroupPin[] = [];
    digitalDebugPins = false;

    initDigitalPins(): void {
        const segCount = this.getSegmentCount();
        this.digitalPins = Array.from({ length: segCount }, (_, k) => new GroupPin(this, k));
        for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
    }

    /** Pure combinational equivalent of execute() above - no clock/edge
     * dependency, so sender is unused. */
    evaluate(pin: GroupPin, sender: DigitalElmInstance | null): boolean[] {
        const now = pin.scheduler.currentTime;
        const segCount = this.getSegmentCount();
        let input = 0;
        if (syncedValue(this.inputs[0], now)) input += 8;
        if (syncedValue(this.inputs[1], now)) input += 4;
        if (syncedValue(this.inputs[2], now)) input += 2;
        if (syncedValue(this.inputs[3], now)) input += 1;
        let en = true;
        if (this.hasBlank() && !syncedValue(this.inputs[4], now)) en = false;
        if (!en || (input === 15 && this.blankOnF()))
            return new Array(segCount).fill(false);
        const sym = (segCount === 14) ? SevenSegDecoderElm.symbols14 :
                    (segCount === 16) ? SevenSegDecoderElm.symbols16 :
                                        SevenSegDecoderElm.symbols;
        return sym[input];
    }

    getInfo(arr: string[]): void {
        super.getInfo(arr);
        for (let k = 0; k < this.digitalPins.length; k++)
            appendInfoLine(arr, `${this.pins[k].text}: ${digitalStateTextForOutput(this, k)}`);
    }

    /** Phase 3 (see noble-stirring-rabin.md): one LUT cell per segment, a near-direct translation
     * of dice-ts's chips/7448.ts segment() - the static symbols/symbols14/symbols16 ROM tables
     * already are the logic function, unchanged from evaluate() above. All real pins (segCount is
     * at most 16), so no internal-pin budget concern the way CounterElm/MultiplexerElm have. */
    digitalSynthesis(): DigitalSynthesis {
        const segCount = this.getSegmentCount();
        const postCount = this.getPostCount();
        const pinMap = new Map<number, number>();
        for (let i = 0; i < postCount; i++) pinMap.set(i, i + 1);

        const iPin3 = segCount + 1, iPin2 = segCount + 2, iPin1 = segCount + 3, iPin0 = segCount + 4;
        const hasBI = this.hasBlank();
        const biPin = hasBI ? segCount + 5 : 0;
        const blankOnF = this.blankOnF();
        const sym = (segCount === 14) ? SevenSegDecoderElm.symbols14 :
                    (segCount === 16) ? SevenSegDecoderElm.symbols16 :
                                        SevenSegDecoderElm.symbols;

        const inPins = [iPin3, iPin2, iPin1, iPin0];
        if (hasBI) inPins.push(biPin);

        const desc: ChipDesc[] = [];
        for (let seg = 0; seg < segCount; seg++) {
            const outPin = seg + 1;
            const logic: ChipLogic = (pin) => {
                const input = (pin[iPin3] << 3) | (pin[iPin2] << 2) | (pin[iPin1] << 1) | pin[iPin0];
                const en = !hasBI || pin[biPin];
                pin[outPin] = (!en || (input === 15 && blankOnF)) ? 0 : (sym[input][seg] ? 1 : 0);
            };
            desc.push(chipStart(logic).inputPins(...inPins).outputPin(outPin));
        }
        return { desc, pinMap };
    }

    getPostCount(): number {
        const segCount = this.getSegmentCount();
        return segCount + 4 + (this.hasBlank() ? 1 : 0);
    }

    getVoltageSourceCount(): number { return this.getSegmentCount(); }

    execute(): void {
        const segCount = this.getSegmentCount();
        let input = 0;
        if (this.pins[segCount + 0].value) input += 8;
        if (this.pins[segCount + 1].value) input += 4;
        if (this.pins[segCount + 2].value) input += 2;
        if (this.pins[segCount + 3].value) input += 1;
        let en = true;
        if (this.hasBlank() && !this.pins[segCount + 4].value)
            en = false;
        if (!en || (input === 15 && this.blankOnF())) {
            for (let i = 0; i !== segCount; i++)
                this.writeOutput(i, false);
        } else {
            const sym = (segCount === 14) ? SevenSegDecoderElm.symbols14 :
                        (segCount === 16) ? SevenSegDecoderElm.symbols16 :
                                            SevenSegDecoderElm.symbols;
            for (let i = 0; i < segCount; i++)
                this.writeOutput(i, sym[input][i]);
        }
    }

    getChipEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("Segments", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("7 Segment");
            ei.choice.add("14 Segment");
            ei.choice.add("16 Segment");
            ei.choice.select(this.segmentType);
            return ei;
        }
        if (n === 1) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Blank Pin", this.hasBlank());
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Blank on 1111", this.blankOnF());
            return ei;
        }
        if (n === 3)
            return EditInfo.createCheckbox("Digital Debug", this.digitalDebugPins);
        return super.getChipEditInfo(n);
    }

    setChipEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.segmentType = ei.choice.getSelectedIndex();
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 1) {
            this.flags = ei.changeFlag(this.flags, SevenSegDecoderElm.FLAG_ENABLE);
            this.setupPins();
            this.setPoints();
            return;
        }
        if (n === 2)
            this.flags = ei.changeFlag(this.flags, SevenSegDecoderElm.FLAG_BLANK_F);
        if (n === 3) {
            this.digitalDebugPins = ei.checkbox!.getState();
            for (const p of this.digitalPins) p.digitalDebug = this.digitalDebugPins;
            return;
        }
        super.setChipEditValue(n, ei);
    }

    getDumpType(): number { return 197; }
}
