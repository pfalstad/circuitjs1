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
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { AudioOutputElm } from "./AudioOutputElm";
import { EditInfo } from "./EditInfo";
import { Graphics } from "./Graphics";
import { Locale } from "./Locale";
import { RailElm } from "./RailElm";
import { StringTokenizer } from "./StringTokenizer";
import { VoltageElm } from "./VoltageElm";
import { parseIntStrict, parseFloatStrict } from "./NumberParse";

class AudioFileEntry {
    fileName: string;
    data: Float32Array;
}

export class AudioInputElm extends RailElm {
    data: Float32Array | null = null;
    timeOffset: number = 0;
    samplingRate: number = 0;
    fileNum: number = 0;
    fileName: string | null = null;
    declare maxVoltage: number;
    startPosition: number = 0;

    static lastSamplingRate: number = 0;

    // cache to preserve audio data when doing cut/paste, or undo/redo
    static fileNumCounter: number = 1;
    static audioFileMap: Map<number, AudioFileEntry> = new Map();

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xa: number, ya: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (st !== undefined) {
            super(xa, ya, xb!, yb!, f!, st);
            this.waveform = VoltageElm.WF_AC;
            this.maxVoltage = parseFloatStrict(st.nextToken());
            this.startPosition = parseFloatStrict(st.nextToken());
            this.fileNum = parseIntStrict(st.nextToken());
            this.lookupFileNumber();
            this.samplingRate = AudioInputElm.lastSamplingRate;
        } else {
            super(xa, ya, VoltageElm.WF_AC);
            this.maxVoltage = 5;
        }
    }

    dump(): string {
        this.genFileNumber();
        return super.dump() + " " + this.maxVoltage + " " + this.startPosition + " " + this.fileNum;
    }

    genFileNumber(): void {
        // add a file number to the dump so we can preserve the audio file data when doing cut and paste, or undo/redo.
        // we don't save the entire file in the dump because it would be huge.
        if (this.data !== null) {
            if (this.fileNum === 0)
                this.fileNum = AudioInputElm.fileNumCounter++;
            const ent = new AudioFileEntry();
            ent.fileName = this.fileName!;
            ent.data = this.data;
            AudioInputElm.audioFileMap.set(this.fileNum, ent);
        }
    }

    lookupFileNumber(): void {
        const ent = AudioInputElm.audioFileMap.get(this.fileNum);
        if (ent !== undefined) {
            this.fileName = ent.fileName;
            this.data = ent.data;
        }
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "ma", this.maxVoltage);
        CircuitXMLSerializer.dumpAttr(elem, "st", this.startPosition);
        this.genFileNumber();
        CircuitXMLSerializer.dumpAttr(elem, "fi", this.fileNum);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.maxVoltage = xml.parseDoubleAttr("ma", this.maxVoltage);
        this.startPosition = xml.parseDoubleAttr("st", this.startPosition);
        this.fileNum = xml.parseIntAttr("fi", this.fileNum);
        this.lookupFileNumber();
        this.samplingRate = AudioInputElm.lastSamplingRate;
    }

    reset(): void {
        this.timeOffset = this.startPosition;
    }

    drawRail(g: Graphics): void {
        this.drawRailText(g, this.fileName === null ? Locale.LS("No file") : this.fileName);
    }

    getRailText(): string {
        return this.fileName === null ? Locale.LS("No file") : this.fileName;
    }

    setSamplingRate(sr: number): void {
        this.samplingRate = sr;
    }

    getVoltage(): number {
        if (this.data === null)
            return 0;
        if (this.timeOffset < this.startPosition)
            this.timeOffset = this.startPosition;
        const dptr = this.timeOffset * this.samplingRate;
        const iptr = Math.trunc(dptr);
        const frac = dptr - iptr;
        if (iptr >= this.data.length)
            return 0;
        const value1 = this.data[iptr];
        const value2 = (iptr + 1 < this.data.length) ? this.data[iptr + 1] : 0;
        return (value1 * (1 - frac) + value2 * frac) * this.maxVoltage;
    }

    stepFinished(): void {
        this.timeOffset += CircuitElm.sim.timeStep;
    }

    getDumpType(): number { return 411; }
    getXmlDumpType(): string { return "ain"; }
    getShortcut(): number { return 0; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            const ei = new EditInfo("", 0, -1, -1);
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "audio/*";
            input.addEventListener("change", () => {
                const file = input.files?.[0];
                if (file) {
                    this.fileName = file.name.replace(/\.[^.]*$/, "");
                    AudioInputElm.fetchLoadFileData(this, file);
                }
            });
            ei.widget = input;
            return ei;
        }
        if (n === 1)
            return new EditInfo("Max Voltage", this.maxVoltage).setUnitStep();
        if (n === 2)
            return new EditInfo("Start Position (s)", this.startPosition);
        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 1)
            this.maxVoltage = ei.value;
        if (n === 2)
            this.startPosition = ei.value;
    }

    // fetch audio data for a selected file
    static fetchLoadFileData(elm: AudioInputElm, file: File): void {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        elm.setSamplingRate(context.sampleRate);
        const reader = new FileReader();
        reader.onload = (e) => {
            context.decodeAudioData(e.target!.result as ArrayBuffer,
                (buffer: AudioBuffer) => {
                    elm.gotAudioData(buffer.getChannelData(0));
                },
                (err: any) => { console.log("Error decoding audio data", err); }
            );
        };
        reader.readAsArrayBuffer(file);
    }

    gotAudioData(d: Float32Array): void {
        this.data = d;
        AudioInputElm.lastSamplingRate = this.samplingRate;
        AudioOutputElm.lastSamplingRate = this.samplingRate;
    }

    getInfo(arr: string[]): void {
        arr[0] = "audio input";
        if (this.data === null) {
            arr[1] = "no file loaded";
            return;
        }
        arr[1] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        arr[2] = "pos = " + CircuitElm.getUnitText(this.timeOffset, "s");
        const dur = this.data.length / this.samplingRate;
        arr[3] = "dur = " + CircuitElm.getUnitText(dur, "s");
    }

    static clearCache(): void {
        AudioInputElm.audioFileMap.clear();
    }
}
