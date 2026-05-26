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
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { Point } from "./Point";
import { StringTokenizer } from "./StringTokenizer";
import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Locale } from "./Locale";

export class AudioOutputElm extends CircuitElm {
    dataCount: number = 0;
    dataPtr: number = 0;
    data: number[] = [];
    dataFull: boolean = false;
    button: HTMLButtonElement | null = null;
    samplingRate: number = 0;
    labelNum: number = 0;
    duration: number = 0;
    sampleStep: number = 0;
    dataStart: number = 0;
    static lastSamplingRate: number = 8000;
    static okToChangeTimeStep: boolean = false;

    constructor(xx: number, yy: number);
    constructor(xa: number, ya: number, xb: number, yb: number, f: number, st: StringTokenizer);
    constructor(xxOrXa: number, yyOrYa: number, xb?: number, yb?: number, f?: number, st?: StringTokenizer) {
        if (xb === undefined) {
            super(xxOrXa, yyOrYa);
            this.duration = 1;
            this.samplingRate = AudioOutputElm.lastSamplingRate;
            this.labelNum = this.getNextLabelNum();
            this.setDataCount();
            this.createButton();
        } else {
            super(xxOrXa, yyOrYa, xb, yb!, f!);
            this.duration = parseFloat(st!.nextToken());
            this.samplingRate = parseInt(st!.nextToken());
            this.labelNum = parseInt(st!.nextToken());
            this.setDataCount();
            this.createButton();
        }
    }
    dump(): string {
        return super.dump() + " " + this.duration + " " + this.samplingRate + " " + this.labelNum;
    }

    dumpXml(doc: Document, elem: Element): void {
        super.dumpXml(doc, elem);
        CircuitXMLSerializer.dumpAttr(elem, "du", this.duration);
        CircuitXMLSerializer.dumpAttr(elem, "sa", this.samplingRate);
        CircuitXMLSerializer.dumpAttr(elem, "la", this.labelNum);
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        super.undumpXml(xml);
        this.duration = xml.parseDoubleAttr("du", this.duration);
        this.samplingRate = xml.parseIntAttr("sa", this.samplingRate);
        this.labelNum = xml.parseIntAttr("la", this.labelNum);
        this.setDataCount();
        this.setButtonLabel();
    }

    draggingDone(): void {
        this.setTimeStep();
    }

    // get next unused labelNum value
    getNextLabelNum(): number {
        let num = 1;
        if (CircuitElm.sim.elmList == null)
            return 0;
        for (const ce of CircuitElm.sim.elmList) {
            if (!(ce instanceof AudioOutputElm))
                continue;
            const ln = (ce as AudioOutputElm).labelNum;
            if (ln >= num)
                num = ln + 1;
        }
        return num;
    }

    getDumpType(): number { return 211; }
    getXmlDumpType(): string { return "aout"; }
    getPostCount(): number { return 1; }

    reset(): void {
        this.dataPtr = 0;
        this.dataFull = false;
        this.dataSampleCount = 0;
        this.nextDataSample = 0;
        this.dataSample = 0;
    }
    setPoints(): void {
        super.setPoints();
        this.lead1 = new Point();
    }
    draw(g: Graphics): void {
        g.save();
        const selected = (this.needsHighlight());
        const fontSize = 14;
        const s = this.labelNum > 1 ? "Audio " + this.labelNum : "Audio Out";
        g.context.font = (selected ? "bold " : "") + fontSize + "px SansSerif";
        const textWidth = Math.floor(g.context.measureText(s).width);
        g.setColor(Color.darkGray);
        const pct = this.dataFull ? textWidth : Math.floor(textWidth * this.dataPtr / this.dataCount);
        g.fillRect(this.x2 - Math.floor(textWidth / 2), this.y2 - 10, pct, 20);
        g.setColor(selected ? CircuitElm.selectColor : CircuitElm.whiteColor);
        this.interpPoint(this.point1, this.point2, this.lead1, 1 - (textWidth / 2. + 8) / this.dn);
        this.setBbox(this.point1, this.lead1, 0);
        this.drawCenteredText(g, s, this.x2, this.y2, true);
        this.setVoltageColor(g, this.nodes[0].v);
        if (selected)
            g.setColor(CircuitElm.selectColor);
        CircuitElm.drawThickLine(g, this.point1, this.lead1!);
        this.drawPosts(g);
        g.restore();
    }
    getVoltageDiff(): number { return this.nodes[0].v; }
    getInfo(arr: string[]): void {
        arr[0] = "audio output";
        arr[1] = "V = " + CircuitElm.getVoltageText(this.nodes[0].v);
        const ct = this.dataFull ? this.dataCount : this.dataPtr;
        const dur = this.sampleStep * ct;
        arr[2] = "start = " + CircuitElm.getUnitText(this.dataFull ? CircuitElm.sim.t - this.duration : this.dataStart, "s");
        arr[3] = "dur = " + CircuitElm.getUnitText(dur, "s");
        arr[4] = "samples = " + ct + (this.dataFull ? "" : "/" + this.dataCount);
    }

    dataSampleCount: number = 0;
    nextDataSample: number = 0;
    dataSample: number = 0;

    stepFinished(): void {
        this.dataSample += this.nodes[0].v;
        this.dataSampleCount++;
        if (CircuitElm.sim.t >= this.nextDataSample) {
            this.nextDataSample += this.sampleStep;
            this.data[this.dataPtr++] = this.dataSample / this.dataSampleCount;
            this.dataSampleCount = 0;
            this.dataSample = 0;
            if (this.dataPtr >= this.dataCount) {
                this.dataPtr = 0;
                this.dataFull = true;
            }
        }
    }

    setDataCount(): void {
        this.dataCount = Math.floor(this.samplingRate * this.duration);
        this.data = new Array(this.dataCount).fill(0);
        this.dataStart = CircuitElm.sim.t;
        this.dataPtr = 0;
        this.dataFull = false;
        this.sampleStep = 1. / this.samplingRate;
        this.nextDataSample = CircuitElm.sim.t + this.sampleStep;
    }

    readonly samplingRateChoices = [8000, 11025, 16000, 22050, 44100, 48000];

    getEditInfo(n: number): EditInfo | null {
        if (n === 0) {
            return new EditInfo("Duration (s)", this.duration, 0, 5).setPositive();
        }
        if (n === 1) {
            const ei = new EditInfo("Sampling Rate", 0, -1, -1);
            ei.choice = new Choice();
            for (let i = 0; i !== this.samplingRateChoices.length; i++) {
                ei.choice.add(this.samplingRateChoices[i] + "");
                if (this.samplingRateChoices[i] === this.samplingRate)
                    ei.choice.select(i);
            }
            return ei;
        }
        if (n === 2) {
            const ei = new EditInfo("", 0, -1, -1);
            const url = AudioOutputElm.getLastBlob();
            if (url === null)
                return null;
            const now = new Date();
            const pad = (x: number) => x.toString().padStart(2, "0");
            const fname = "audio-" + now.getFullYear() +
                pad(now.getMonth() + 1) + pad(now.getDate()) + "-" +
                pad(now.getHours()) + pad(now.getMinutes()) + ".circuitjs.wav";
            const a = document.createElement("a");
            a.textContent = Locale.LS("Download last played audio");
            a.href = url;
            a.setAttribute("download", fname);
            ei.widget = a;
            return ei;
        }

        return null;
    }
    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0 && ei.value > 0) {
            this.duration = ei.value;
            this.setDataCount();
        }
        if (n === 1) {
            const nsr = this.samplingRateChoices[ei.choice!.getSelectedIndex()];
            if (nsr !== this.samplingRate) {
                this.samplingRate = nsr;
                AudioOutputElm.lastSamplingRate = nsr;
                this.setDataCount();
                this.setTimeStep();
            }
        }
    }

    setTimeStep(): void {
        /*
        // timestep must be smaller than 1/sampleRate
        if (sim.timeStep > sampleStep)
            sim.timeStep = sampleStep;
        else {
            // make sure sampleStep/timeStep is an integer.  otherwise we get distortion
//          int frac = (int)Math.round(sampleStep/sim.timeStep);
//          sim.timeStep = sampleStep / frac;

            // actually, just make timestep = 1/sampleRate
            sim.timeStep = sampleStep;
        }
        */

//      int frac = (int)Math.round(Math.max(sampleStep*33000, 1));
        const target = this.sampleStep / 8;
        if (CircuitElm.sim.maxTimeStep !== target) {
            if (AudioOutputElm.okToChangeTimeStep || window.confirm(Locale.LS("Adjust timestep for best audio quality and performance?"))) {
                CircuitElm.sim.maxTimeStep = target;
                AudioOutputElm.okToChangeTimeStep = true;
            }
        }
    }

    createButton(): void {
        const btn = document.createElement("button");
        btn.className = "topButton";
        CircuitElm.app.addWidgetToVerticalPanel(btn);
        this.button = btn;
        this.setButtonLabel();
        btn.addEventListener("click", () => { this.play(); });
    }

    setButtonLabel(): void {
        let label = "&#9654; " + Locale.LS("Play Audio");
        if (this.labelNum > 1)
            label += " " + this.labelNum;
        if (this.button)
            this.button.innerHTML = label;
    }

    delete(): void {
        if (this.button)
            CircuitElm.app.removeWidgetFromVerticalPanel(this.button);
        super.delete();
    }

    static playAudio(samples: number[], sampleRate: number): void {
        // build a WAV file from PCM int16 samples and play it
        const intSamples = new Int16Array(samples);
        const numSamples = intSamples.length;
        const buffer = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buffer);
        const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
        writeStr(0, "RIFF");
        view.setUint32(4, 36 + numSamples * 2, true);
        writeStr(8, "WAVE");
        writeStr(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);  // PCM
        view.setUint16(22, 1, true);  // mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, "data");
        view.setUint32(40, numSamples * 2, true);
        for (let i = 0; i < numSamples; i++)
            view.setInt16(44 + i * 2, intSamples[i], true);

        const d = document as any;
        if (d.audioBlob) {
            if (d.audioObject) d.audioObject.parentNode?.removeChild(d.audioObject);
            URL.revokeObjectURL(d.audioBlob);
        }
        const blob = new Blob([buffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        d.audioBlob = url;
        const audio = document.createElement("audio");
        d.audioObject = audio;
        audio.src = url;
        document.body.appendChild(audio);
        audio.play();
    }

    static getLastBlob(): string | null {
        return (document as any).audioBlob ?? null;
    }

    play(): void {
        let ct = this.dataPtr;
        let base = 0;
        if (this.dataFull) {
            ct = this.dataCount;
            base = this.dataPtr;
        }
        if (ct * this.sampleStep < .05) {
            window.alert(Locale.LS("Audio data is not ready yet.  Increase simulation speed to make data ready sooner."));
            return;
        }

        // rescale data to maximize
        let max = -1e8;
        let min = 1e8;
        for (let i = 0; i !== ct; i++) {
            if (this.data[i] > max) max = this.data[i];
            if (this.data[i] < min) min = this.data[i];
        }

        const adj = -(max + min) / 2;
        const mult = (.25 * 32766) / (max + adj);

        // fade in over 1/20 sec
        const fadeLen = Math.floor(this.samplingRate / 20);
        const fadeOut = ct - fadeLen;

        const fadeMult = mult / fadeLen;
        const arr: number[] = [];
        for (let i = 0; i !== ct; i++) {
            const fade = (i < fadeLen) ? i * fadeMult : (i > fadeOut) ? (ct - i) * fadeMult : mult;
            const s = Math.floor((this.data[(i + base) % this.dataCount] + adj) * fade);
            arr.push(s);
        }
        AudioOutputElm.playAudio(arr, this.samplingRate);
    }
}
