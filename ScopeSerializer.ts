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

import { Scope } from "./Scope";
import { ScopePlot } from "./ScopePlot";
import { ScopePlot2d } from "./ScopePlot2d";
import { XMLSerializer as CircuitXMLSerializer } from "./XMLSerializer";
import { XMLDeserializer } from "./XMLDeserializer";
import { StringTokenizer } from "./StringTokenizer";
import { CustomLogicModel } from "./CustomLogicModel";
import {
    UNITS_V, UNITS_A, UNITS_W, UNITS_OHMS, UNITS_C,
} from "./ScopeConstants";

export class ScopeSerializer {
    scope: Scope;

    static readonly FLAG_YELM              = 32;
    static readonly FLAG_IVALUE            = 2048;
    static readonly FLAG_PLOTS             = 4096;
    static readonly FLAG_MAN_SCALE         = 16;
    static readonly FLAG_PERPLOTFLAGS      = 1 << 18;
    static readonly FLAG_PERPLOT_MAN_SCALE = 1 << 19;
    static readonly FLAG_DIVISIONS         = 1 << 21;
    static readonly FLAG_TRIGGER           = 1 << 24;

    constructor(scope: Scope) {
        this.scope = scope;
    }

    getFlags(): number {
        let flags = (this.scope.showI ? 1 : 0) | (this.scope.showV ? 2 : 0) |
                (this.scope.showMax ? 0 : 4) |   // showMax used to be always on
                (this.scope.showFreq ? 8 : 0) |
                // In this version we always dump manual settings using the PERPLOT format
                (this.scope.isManualScale() ? (ScopeSerializer.FLAG_MAN_SCALE | ScopeSerializer.FLAG_PERPLOT_MAN_SCALE) : 0) |
                (this.scope.plot2d.enabled ? 64 : 0) |
                (this.scope.plot2d.plotXY ? 128 : 0) | (this.scope.showMin ? 256 : 0) | (this.scope.showScale ? 512 : 0) |
                (this.scope.fftPlot.enabled ? 1024 : 0) | (this.scope.maxScale ? 8192 : 0) | (this.scope.showRMS ? 16384 : 0) |
                (this.scope.showDutyCycle ? 32768 : 0) | (this.scope.fftPlot.logSpectrum ? 65536 : 0) |
                (this.scope.showAverage ? (1 << 17) : 0) | (this.scope.showElmInfo ? (1 << 20) : 0) |
                (this.scope.showP2P ? (1 << 22) : 0) | (this.scope.fftPlot.showPhaseAngle ? (1 << 23) : 0);
        flags |= ScopeSerializer.FLAG_PLOTS; // 4096
        let allPlotFlags = 0;
        for (const p of this.scope.plots)
            allPlotFlags |= p.getPlotFlags();
        flags |= (allPlotFlags !== 0) ? ScopeSerializer.FLAG_PERPLOTFLAGS : 0;
        if (this.scope.isManualScale())
            flags |= ScopeSerializer.FLAG_DIVISIONS;
        if (this.scope.trigger.isActive())
            flags |= ScopeSerializer.FLAG_TRIGGER;
        return flags;
    }

    setFlags(flags: number): void {
        this.scope.showI = (flags & 1) !== 0;
        this.scope.showV = (flags & 2) !== 0;
        this.scope.showMax = (flags & 4) === 0;
        this.scope.showFreq = (flags & 8) !== 0;
        this.scope.manualScale = (flags & ScopeSerializer.FLAG_MAN_SCALE) !== 0;
        this.scope.plot2d.enabled = (flags & 64) !== 0;
        this.scope.plot2d.plotXY = (flags & 128) !== 0;
        this.scope.showMin = (flags & 256) !== 0;
        this.scope.showScale = (flags & 512) !== 0;
        this.scope.fftPlot.show((flags & 1024) !== 0);
        this.scope.maxScale = (flags & 8192) !== 0;
        this.scope.showRMS = (flags & 16384) !== 0;
        this.scope.showDutyCycle = (flags & 32768) !== 0;
        this.scope.fftPlot.logSpectrum = (flags & 65536) !== 0;
        this.scope.showAverage = (flags & (1 << 17)) !== 0;
        this.scope.showElmInfo = (flags & (1 << 20)) !== 0;
        this.scope.showP2P = (flags & (1 << 22)) !== 0;
        this.scope.fftPlot.showPhaseAngle = (flags & (1 << 23)) !== 0;
    }

    dumpXml(doc: Document, root: Element): void {
        const vPlot = this.scope.plots[0];
        const elm = vPlot.elm;
        if (elm === null)
            return;
        // sync scale[] from scaleX/scaleY for 2d plots so they get saved correctly
        if (this.scope.plot2d.enabled && this.scope.plots.length >= 2) {
            const px = this.scope.plot2d.validPlotIndex(this.scope.plot2d.plotX, 0);
            const py = this.scope.plot2d.validPlotIndex(this.scope.plot2d.plotY, 1);
            this.scope.scale[this.scope.plots[px].units] = this.scope.plot2d.scaleX;
            this.scope.scale[this.scope.plots[py].units] = this.scope.plot2d.scaleY;
        }
        const flags = this.getFlags();
        const eno = this.scope.app.locateElm(elm);
        if (eno < 0)
            return;
        const xmlElm = doc.createElement("o");
        CircuitXMLSerializer.dumpAttr(xmlElm, "en", eno);
        CircuitXMLSerializer.dumpAttr(xmlElm, "sp", vPlot.scopePlotSpeed);
        // strip flags that belong to old text format or are superseded by explicit XML attributes
        const f = flags & ~(ScopeSerializer.FLAG_PERPLOTFLAGS | ScopeSerializer.FLAG_PERPLOT_MAN_SCALE | ScopeSerializer.FLAG_PLOTS | ScopeSerializer.FLAG_TRIGGER);
        CircuitXMLSerializer.dumpAttr(xmlElm, "f", ScopeSerializer.exportAsDecOrHex(f, 0));
        CircuitXMLSerializer.dumpAttr(xmlElm, "p", this.scope.position);
        if (this.scope.manDivisions !== 8)
            CircuitXMLSerializer.dumpAttr(xmlElm, "md", this.scope.manDivisions);
        this.scope.trigger.dumpXml(xmlElm);
        if (this.scope.plot2d.plotXY) {
            if (this.scope.plot2d.plotX !== 0) CircuitXMLSerializer.dumpAttr(xmlElm, "xy2x", this.scope.plot2d.plotX);
            if (this.scope.plot2d.plotY !== 1) CircuitXMLSerializer.dumpAttr(xmlElm, "xy2y", this.scope.plot2d.plotY);
            if (this.scope.plot2d.plotBrightness >= 0) CircuitXMLSerializer.dumpAttr(xmlElm, "xy2br", this.scope.plot2d.plotBrightness);
            if (this.scope.plot2d.plotColorR >= 0) CircuitXMLSerializer.dumpAttr(xmlElm, "xy2r", this.scope.plot2d.plotColorR);
            if (this.scope.plot2d.plotColorG >= 0) CircuitXMLSerializer.dumpAttr(xmlElm, "xy2g", this.scope.plot2d.plotColorG);
            if (this.scope.plot2d.plotColorB >= 0) CircuitXMLSerializer.dumpAttr(xmlElm, "xy2b", this.scope.plot2d.plotColorB);
        }
        root.appendChild(xmlElm);
        for (let i = 0; i < this.scope.plots.length; i++) {
            const p = this.scope.plots[i];
            const pelm = doc.createElement("p");
            if (p.getPlotFlags() > 0)
                CircuitXMLSerializer.dumpAttr(pelm, "f", p.getPlotFlags().toString(16));
            if (p.elm !== elm)
                CircuitXMLSerializer.dumpAttr(pelm, "e", this.scope.app.locateElm(p.elm));
            CircuitXMLSerializer.dumpAttr(pelm, "v", p.value);
            CircuitXMLSerializer.dumpAttr(pelm, "sc", this.scope.scale[p.units]);
            if (this.scope.isManualScale()) {
                CircuitXMLSerializer.dumpAttr(pelm, "ms", p.manScale);
                CircuitXMLSerializer.dumpAttr(pelm, "mp", p.manVPosition);
            }
            xmlElm.appendChild(pelm);
        }
        if (this.scope.text !== null)
            xmlElm.setAttribute("x", this.scope.text);
        if (this.scope.plot2d.trailPersistence !== ScopePlot2d.DEFAULT_TRAIL_PERSISTENCE)
            CircuitXMLSerializer.dumpAttr(xmlElm, "tp", this.scope.plot2d.trailPersistence);
    }

    undumpXml(xml: XMLDeserializer): void {
        const e = xml.parseIntAttr("en", -1);
        if (e === -1)
            return;
        const ce = this.scope.app.getElm(e);
        this.scope.setElm(ce);
        this.scope.plots = [];
        this.scope.speed = xml.parseIntAttr("sp", 64);
        const fs = xml.parseStringAttr("f", "0")!;
        const flags = ScopeSerializer.importDecOrHex(fs);
        this.scope.position = xml.parseIntAttr("p", 0);
        this.scope.manDivisions = xml.parseIntAttr("md", 8);
        this.scope.text = xml.parseStringAttr("x", null);
        this.scope.plot2d.trailPersistence = xml.parseIntAttr("tp", ScopePlot2d.DEFAULT_TRAIL_PERSISTENCE);
        // All of these must be read before parseChildElement() changes the XML context
        // to a child <p> element.
        this.scope.trigger.undumpXml(xml);
        const xy2x  = xml.parseIntAttr("xy2x",  0);
        const xy2y  = xml.parseIntAttr("xy2y",  1);
        const xy2br = xml.parseIntAttr("xy2br", -1);
        const xy2r  = xml.parseIntAttr("xy2r",  -1);
        const xy2g  = xml.parseIntAttr("xy2g",  -1);
        const xy2b  = xml.parseIntAttr("xy2b",  -1);
        for (const elem of xml.getChildElements()) {
            xml.parseChildElement(elem);
            const plotFlags = parseInt(xml.parseStringAttr("f", "0")!, 16);
            const plotElm = this.scope.app.getElm(xml.parseIntAttr("e", e));
            const val = xml.parseIntAttr("v", -1);
            const u = plotElm.getScopeUnits(val);
            const sc = xml.parseDoubleAttr("sc", -1);
            if (sc >= 0)
                this.scope.scale[u] = sc;
            const p = new ScopePlot(plotElm, u, val, this.scope.getManScaleFromMaxScale(u, false));
            this.scope.plots.push(p);
            p.acCoupled = (plotFlags & ScopePlot.FLAG_AC) !== 0;
            const ms = xml.parseDoubleAttr("ms", -1);
            if (ms >= 0) {
                p.manScaleSet = true;
                p.manScale = ms;
                p.manVPosition = xml.parseIntAttr("mp", 0);
            }
        }
        // setFlags after plots are loaded so hasPlotValue checks work correctly
        this.setFlags(flags);
        // restore XY plot indices (parsed above before child loop changed context)
        if (this.scope.plot2d.plotXY) {
            this.scope.plot2d.plotX          = xy2x;
            this.scope.plot2d.plotY          = xy2y;
            this.scope.plot2d.plotBrightness = xy2br;
            this.scope.plot2d.plotColorR     = xy2r;
            this.scope.plot2d.plotColorG     = xy2g;
            this.scope.plot2d.plotColorB     = xy2b;
        }
        // restore scaleX/scaleY for 2d plots
        if (this.scope.plot2d.enabled && this.scope.plots.length >= 1) {
            const px = this.scope.plot2d.validPlotIndex(this.scope.plot2d.plotX, 0);
            const py = this.scope.plot2d.validPlotIndex(this.scope.plot2d.plotY, Math.min(1, this.scope.plots.length - 1));
            this.scope.plot2d.scaleX = this.scope.scale[this.scope.plots[px].units];
            this.scope.plot2d.scaleY = this.scope.scale[this.scope.plots[py].units];
        }
    }

    undump(st: StringTokenizer): void {
        this.scope.initialize();
        const e = parseInt(st.nextToken());
        if (e === -1)
            return;
        const ce = this.scope.app.getElm(e);
        this.scope.setElm(ce);
        this.scope.speed = parseInt(st.nextToken());
        let value = parseInt(st.nextToken());
        // fix old value for VAL_POWER which doesn't work for transistors
        if (!ce.isTransistorElm() && value === Scope.VAL_POWER_OLD)
            value = Scope.VAL_POWER;
        const flags = ScopeSerializer.importDecOrHex(st.nextToken());
        this.scope.scale[UNITS_V] = parseFloat(st.nextToken());
        this.scope.scale[UNITS_A] = parseFloat(st.nextToken());
        if (this.scope.scale[UNITS_V] === 0)
            this.scope.scale[UNITS_V] = 0.5;
        if (this.scope.scale[UNITS_A] === 0)
            this.scope.scale[UNITS_A] = 1;
        this.scope.plot2d.scaleX = this.scope.scale[UNITS_V];
        this.scope.plot2d.scaleY = this.scope.scale[UNITS_A];
        this.scope.scale[UNITS_OHMS] = this.scope.scale[UNITS_W] = this.scope.scale[UNITS_C] = this.scope.scale[UNITS_V];
        this.scope.text = null;
        const plot2dFlag = (flags & 64) !== 0;
        const hasPlotFlags = (flags & ScopeSerializer.FLAG_PERPLOTFLAGS) !== 0;
        if ((flags & ScopeSerializer.FLAG_PLOTS) !== 0) {
            // new-style dump
            try {
                this.scope.position = parseInt(st.nextToken());
                const sz = parseInt(st.nextToken());
                this.scope.manDivisions = 8;
                if ((flags & ScopeSerializer.FLAG_DIVISIONS) !== 0)
                    this.scope.manDivisions = Scope.lastManDivisions = parseInt(st.nextToken());
                let u = ce.getScopeUnits(value);
                if (u > UNITS_A)
                    this.scope.scale[u] = parseFloat(st.nextToken());
                this.scope.setValue(value);
                // setValue(0) creates an extra plot for current, so remove that
                while (this.scope.plots.length > 1)
                    this.scope.plots.splice(1, 1);
                let plotFlags = 0;
                for (let i = 0; i !== sz; i++) {
                    if (hasPlotFlags)
                        plotFlags = parseInt(st.nextToken(), 16);
                    if (i !== 0) {
                        const ne = parseInt(st.nextToken());
                        const val = parseInt(st.nextToken());
                        const elm2 = this.scope.app.getElm(ne);
                        u = elm2.getScopeUnits(val);
                        if (u > UNITS_A)
                            this.scope.scale[u] = parseFloat(st.nextToken());
                        this.scope.plots.push(new ScopePlot(elm2, u, val, this.scope.getManScaleFromMaxScale(u, false)));
                    }
                    const p = this.scope.plots[i];
                    p.acCoupled = (plotFlags & ScopePlot.FLAG_AC) !== 0;
                    if ((flags & ScopeSerializer.FLAG_PERPLOT_MAN_SCALE) !== 0) {
                        p.manScaleSet = true;
                        p.manScale = parseFloat(st.nextToken());
                        p.manVPosition = parseInt(st.nextToken());
                    }
                }
                while (st.hasMoreTokens()) {
                    if (this.scope.text === null)
                        this.scope.text = st.nextToken();
                    else
                        this.scope.text += " " + st.nextToken();
                }
            } catch (ee) {
            }
        } else {
            // old-style dump
            let yElm = null;
            let ivalue = 0;
            this.scope.manDivisions = 8;
            try {
                this.scope.position = parseInt(st.nextToken());
                let ye = -1;
                if ((flags & ScopeSerializer.FLAG_YELM) !== 0) {
                    ye = parseInt(st.nextToken());
                    if (ye !== -1)
                        yElm = this.scope.app.getElm(ye);
                    // sinediode.txt has yElm set to something even though there's no xy plot
                    if (!plot2dFlag)
                        yElm = null;
                }
                if ((flags & ScopeSerializer.FLAG_IVALUE) !== 0)
                    ivalue = parseInt(st.nextToken());
                while (st.hasMoreTokens()) {
                    if (this.scope.text === null)
                        this.scope.text = st.nextToken();
                    else
                        this.scope.text += " " + st.nextToken();
                }
            } catch (ee) {
            }
            this.scope.setValues(value, ivalue, this.scope.app.getElm(e), yElm);
        }
        if (this.scope.text !== null)
            this.scope.text = CustomLogicModel.unescape(this.scope.text);
        this.scope.plot2d.enabled = plot2dFlag;
        this.setFlags(flags);
    }

    saveAsDefault(): void {
        const stor = typeof localStorage !== 'undefined' ? localStorage : null;
        if (stor === null)
            return;
        const vPlot = this.scope.plots[0];
        const flags = this.getFlags();
        let s = "1 " + flags + " " + vPlot.scopePlotSpeed;
        if ((flags & ScopeSerializer.FLAG_TRIGGER) !== 0)
            s += " " + this.scope.trigger.level;
        stor.setItem("scopeDefaults", s);
    }

    loadDefaults(): boolean {
        const stor = typeof localStorage !== 'undefined' ? localStorage : null;
        if (stor === null)
            return false;
        const str = stor.getItem("scopeDefaults");
        if (str === null)
            return false;
        const arr = str.split(" ");
        const flags = parseInt(arr[1]);
        this.setFlags(flags);
        this.scope.speed = parseInt(arr[2]);
        if (arr.length > 3 && (flags & ScopeSerializer.FLAG_TRIGGER) !== 0)
            this.scope.trigger.level = parseFloat(arr[3]);
        return true;
    }

    private static exportAsDecOrHex(v: number, thresh: number): string {
        if (v >= thresh)
            return "x" + v.toString(16);
        else
            return v.toString();
    }

    private static importDecOrHex(s: string): number {
        if (s.charAt(0) === 'x')
            return parseInt(s.substring(1), 16);
        else
            return parseInt(s);
    }
}
