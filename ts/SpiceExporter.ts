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

// Exports a circuit as a SPICE netlist (for ngspice or LTspice).
//
// Nets are found from the circuit's posts: wires join posts, labeled nodes with the same
// name are one net, and ground is net 0.  Analog parts become SPICE devices with .model
// cards made from their CircuitJS models; switches are written in their current position.
// Subcircuits become .subckt definitions.  Anything without a SPICE equivalent is left
// out and listed in the warnings.

import { CircuitElm } from "./CircuitElm";
import { ResistorElm } from "./ResistorElm";
import { CapacitorElm } from "./CapacitorElm";
import { PolarCapacitorElm } from "./PolarCapacitorElm";
import { InductorElm } from "./InductorElm";
import { DiodeElm } from "./DiodeElm";
import { LEDElm } from "./LEDElm";
import { ZenerElm } from "./ZenerElm";
import { TransistorElm } from "./TransistorElm";
import { MosfetElm } from "./MosfetElm";
import { JfetElm } from "./JfetElm";
import { OpAmpElm } from "./OpAmpElm";
import { PotElm } from "./PotElm";
import { SwitchElm } from "./SwitchElm";
import { Switch2Elm } from "./Switch2Elm";
import { VoltageElm } from "./VoltageElm";
import { RailElm } from "./RailElm";
import { CurrentElm } from "./CurrentElm";
import { GroundElm } from "./GroundElm";
import { LabeledNodeElm } from "./LabeledNodeElm";
import { WireElm } from "./WireElm";
import { RoutedWireElm } from "./RoutedWireElm";
import { AmmeterElm } from "./AmmeterElm";
import { TextElm } from "./TextElm";
import { ScopeElm } from "./ScopeElm";
import { ProbeElm } from "./ProbeElm";
import { OutputElm } from "./OutputElm";
import { LogicOutputElm } from "./LogicOutputElm";
import { DataRecorderElm } from "./DataRecorderElm";
import { TestPointElm } from "./TestPointElm";
import { StopTriggerElm } from "./StopTriggerElm";
import { AudioOutputElm } from "./AudioOutputElm";
import { OhmMeterElm } from "./OhmMeterElm";
import { TransformerElm } from "./TransformerElm";
import { SubcircuitElm } from "./SubcircuitElm";
import { GateElm, AndGateElm, NandGateElm, OrGateElm, NorGateElm, XorGateElm, XnorGateElm } from "./GateElm";
import { InverterElm } from "./InverterElm";
import { SchmittElm } from "./SchmittElm";
import { InvertingSchmittElm } from "./InvertingSchmittElm";
import { LogicInputElm } from "./LogicInputElm";
import { CirSim } from "./CirSim";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

export interface SpiceExport {
    text: string; warnings: string[];
    // the net of each of the circuit's elements' posts (for checking the result against the simulator)
    postNets: Map<CircuitElm, string[]>;
}

export interface SpiceOptions {
    title?: string;
    // simulation time step and length, for the .tran line
    timeStep?: number;
    stopTime?: number;
}

// a value with a SPICE scale suffix.  SPICE reads "M" as milli, so mega is "meg"
export function spiceValue(v: number): string {
    if (v === 0 || !isFinite(v))
        return "0";
    const suffixes = ["f", "p", "n", "u", "m", "", "k", "meg", "g", "t"];
    let e = Math.floor(Math.log10(Math.abs(v)) / 3);
    e = Math.max(-5, Math.min(4, e));
    let m = parseFloat((v / Math.pow(1000, e)).toPrecision(6));
    if (Math.abs(m) >= 1000 && e < 4) {
        e++;
        m = parseFloat((m / 1000).toPrecision(6));
    }
    return m + suffixes[e + 5];
}

function num(v: number): string {
    return String(parseFloat(v.toPrecision(6)));
}

// SPICE names can't have spaces or the characters SPICE uses for syntax
function sanitize(s: string): string {
    return s.replace(/[^A-Za-z0-9_]+/g, "_") || "_";
}

class UnionFind {
    parent = new Map<string, string>();
    find(k: string): string {
        let p = this.parent.get(k);
        if (p === undefined) {
            this.parent.set(k, k);
            return k;
        }
        if (p === k)
            return k;
        p = this.find(p);
        this.parent.set(k, p);
        return p;
    }
    union(a: string, b: string): void {
        const ra = this.find(a), rb = this.find(b);
        if (ra === rb)
            return;
        // keep ground as the root, so it's easy to find
        if (ra === "0")
            this.parent.set(rb, ra);
        else
            this.parent.set(ra, rb);
    }
}

// a periodic waveform starts its cycle at t = -phase/(2 pi f), so start the SPICE source
// that much later in its cycle.  (SPICE holds the first value until the delay)
function delayFor(e: any, extra: number = 0): number {
    const per = 1 / e.frequency;
    const d = (-e.phaseShift / (2 * Math.PI) * per + extra) % per;
    return d < 0 ? d + per : d;
}

// the SPICE source for a VoltageElm's waveform, or null if there isn't one
function sourceSpec(e: any, timeStep: number): string | null {
    const max = e.maxVoltage, bias = e.bias, f = e.frequency;
    const per = 1 / f;
    switch (e.waveform) {
    case VoltageElm.WF_DC:
        return "DC " + num(max + bias);
    // a slider-controlled rail keeps its present voltage in frequency
    case VoltageElm.WF_VAR:
        return "DC " + num(f);
    case VoltageElm.WF_AC:
        return `SIN(${num(bias)} ${num(max)} ${num(f)} 0 0 ${num(e.phaseShift * 180 / Math.PI)})`;
    // a square wave is high for the duty cycle and then low; a pulse is high, then zero.
    // CircuitJS centers the edges on the cycle's start and the end of the duty cycle
    case VoltageElm.WF_SQUARE:
    case VoltageElm.WF_PULSE: {
        const lo = e.waveform === VoltageElm.WF_SQUARE ? bias - max : bias;
        const rise = Math.min(e.riseTime, e.dutyCycle * per);
        return `PULSE(${num(lo)} ${num(bias + max)} ${num(delayFor(e, -rise / 2))} ${num(rise)} ${num(rise)} ` +
               `${num(e.dutyCycle * per - rise)} ${num(per)})`;
    }
    // a triangle rises for half the cycle; a sawtooth rises for all of it
    case VoltageElm.WF_TRIANGLE:
        return `PULSE(${num(bias - max)} ${num(bias + max)} ${num(delayFor(e))} ${num(per / 2)} ${num(per / 2)} 0 ${num(per)})`;
    case VoltageElm.WF_SAWTOOTH: {
        const fall = Math.min(timeStep, per / 100);
        return `PULSE(${num(bias - max)} ${num(bias + max)} ${num(delayFor(e))} ${num(per - fall)} ${num(fall)} 0 ${num(per)})`;
    }
    }
    return null;
}

interface Model { kind: string; params: string; }

// the posts of each element in a sheet (the circuit or a subcircuit) as keys, which are
// joined into nets
interface Sheet {
    elms: CircuitElm[];
    keys: string[][];
    // net names given by the sheet (a subcircuit's pins), by key
    names?: Map<string, string>;
    // ground some node if nothing is grounded, as the simulator does
    findGround?: boolean;
}

// how sharply a logic input switches: the input goes from 12% to 88% of the way across
// over a twentieth of the logic level
function steepness(level: number): string {
    return num(40 / Math.max(Math.abs(level), 1e-3));
}

// a logic level from 0 to 1 for an input voltage, switching at a threshold
function level(v: string, threshold: number | string, k: string): string {
    return `0.5*(1+tanh(${k}*(${v}-(${threshold}))))`;
}

// the chip for each kind of gate, by input count, and how many gates it has.  where there's
// no 74HC part, it's the CD4000 one, as in the KiCad export
const LOGIC_PARTS: Record<string, Record<number, [string, number]>> = {
    AND:  { 2: ["74HC08", 4], 3: ["74HC11", 3], 4: ["74HC21", 2], 8: ["CD4068B", 1] },
    NAND: { 2: ["74HC00", 4], 3: ["74HC10", 3], 4: ["74HC20", 2], 8: ["74HC30", 1], 13: ["74HC133", 1] },
    OR:   { 2: ["74HC32", 4], 3: ["CD4075B", 3], 4: ["CD4072B", 2], 8: ["CD4078B", 1] },
    NOR:  { 2: ["74HC02", 4], 3: ["74HC27", 3], 4: ["CD4002B", 2] },
    XOR:  { 2: ["74HC86", 4] },
    XNOR: { 2: ["CD4077B", 4] },
};

// a logic output, a source to ground following the expression after a short lag, as the
// simulator's outputs follow their inputs a step later.  without it, a loop of gates (a
// latch or a ring oscillator) has nothing to settle or oscillate with
function logicOutput(out: string, expr: string, tau: number): string[] {
    return [`Braw raw 0 V=${expr}`,
            "Rlag raw lag 1k",
            `Clag lag 0 ${spiceValue(tau / 1000)} IC=0`,
            `Bout ${out} 0 V=V(lag)`];
}

// a Schmitt trigger input's state, from 0 to 1: it goes to 1 once the input rises past the
// upper threshold, and back to 0 once it falls past the lower.  the state is held on a small
// capacitor, which starts it at 0, as the simulator does
function schmittInput(input: string, lower: number, upper: number, k: string, timeStep: number):
        { lines: string[]; state: string } {
    const raw = "st_raw_" + input, q = "st_" + input;
    return { lines: [`B${q} ${raw} 0 V=${level(`V(${input})`, `${num(upper)}+${num(lower - upper)}*V(${q})`, k)}`,
                     `R${q} ${raw} ${q} 1k`,
                     `C${q} ${q} 0 ${spiceValue(timeStep / 4000)} IC=0`],
             state: `V(${q})` };
}

class NetlistWriter {
    lines: string[] = [];
    warnings: string[] = [];
    private refCounts = new Map<string, number>();
    private packages = new Map<string, { ref: string; used: number }>();
    private nets = new Map<string, string>();
    private usedNets = new Set<string>(["0"]);
    private netCount = 0;
    private uf = new UnionFind();

    constructor(private exp: SpiceExporter, private sheet: Sheet) {}

    private ref(prefix: string): string {
        const n = (this.refCounts.get(prefix) ?? 0) + 1;
        this.refCounts.set(prefix, n);
        return prefix + n;
    }

    net(key: string): string {
        const r = this.uf.find(key);
        if (r === "0")
            return "0";
        let name = this.nets.get(r);
        if (name === undefined) {
            do
                name = "n" + ++this.netCount;
            while (this.usedNets.has(name));
            this.usedNets.add(name);
            this.nets.set(r, name);
        }
        return name;
    }

    postKeys(i: number): string[] {
        return this.sheet.keys[i];
    }

    // an element with no SPICE equivalent is listed in the warnings, and as a comment with its
    // nets, to show where it was
    private leftOut(ce: CircuitElm, n: string[]): void {
        const name = ce.getClassName().replace(/Elm$/, "");
        this.warnings.push(name);
        this.lines.push("* X" + name + " " + n.join(" "));
    }

    // a reference for a gate, lettered by package (U1A, U1B...) as a chip of this part with
    // this many gates would have it
    private packRef(part: string, size: number): string {
        if (size === 1)
            return this.ref("XU");
        let p = this.packages.get(part);
        if (p === undefined || p.used === size) {
            p = { ref: this.ref("XU"), used: 0 };
            this.packages.set(part, p);
        }
        return p.ref + String.fromCharCode(65 + p.used++);
    }

    // a private node inside an element, such as between a part and its series resistance
    private internalNet(want: string): string {
        let name = sanitize(want);
        while (this.usedNets.has(name))
            name += "_";
        this.usedNets.add(name);
        return name;
    }

    private nameNet(key: string, want: string): void {
        const r = this.uf.find(key);
        if (r === "0" || this.nets.has(r))
            return;
        let name = sanitize(want);
        if (name === "0" || /^n\d+$/.test(name))
            name = "_" + name;
        while (this.usedNets.has(name))
            name += "_";
        this.usedNets.add(name);
        this.nets.set(r, name);
    }

    write(): void {
        const { elms, keys } = this.sheet;
        const parts: { ce: CircuitElm; keys: string[] }[] = [];
        const labels: [string, string][] = [];
        elms.forEach((ce, i) => {
            const C = ce.getDumpClass();
            const e = ce as any;
            const k = keys[i];
            if (C === WireElm || C === RoutedWireElm) {
                if (e.busWidth > 1)
                    this.warnings.push("bus wire");
                else
                    this.uf.union(k[0], k[1]);
            } else if (C === GroundElm)
                this.uf.union(k[0], "0");
            else if (C === LabeledNodeElm) {
                if (e.busWidth > 1)
                    this.warnings.push(ce.getClassName().replace(/Elm$/, ""));
                else {
                    this.uf.union(k[0], "L" + e.text);
                    labels.push([k[0], e.text]);
                }
            // an ideal closed switch is a wire
            } else if (C === SwitchElm && e.position === 0 && !(e.resistance > 0))
                this.uf.union(k[0], k[1]);
            else if (C === Switch2Elm && !(e.position === 2 && e.hasCenterOff()) && !(e.resistance > 0))
                this.uf.union(k[0], k[e.position + 1]);
            else
                parts.push({ ce, keys: k });
        });
        // with no ground or rails, the first voltage source's first post is ground.  rails are
        // grounded already, through their sources
        if (this.sheet.findGround && !elms.some(ce => ce.getDumpClass() === GroundElm)) {
            const rail = parts.some(p => p.ce.isRailElm());
            const src = parts.find(p => p.ce.isVoltageElm() && !p.ce.isRailElm()) ?? parts.find(p => p.ce.isBatteryElm());
            if (src && !rail)
                this.uf.union(src.keys[0], "0");
        }
        // the sheet's pins are named first, so labels with the same name don't get another
        for (const [key, name] of this.sheet.names ?? [])
            this.nameNet(key, name);
        for (const [key, name] of labels)
            this.nameNet(key, name);
        const written: { ce: CircuitElm; nets: string[] }[] = [];
        for (const p of parts) {
            const nets = p.keys.map(k => this.net(k));
            const count = this.lines.length;
            this.writeElm(p.ce, nets);
            if (this.lines.slice(count).some(l => !l.startsWith("*")))
                written.push({ ce: p.ce, nets });
        }
        if (this.sheet.findGround)
            this.tieFloating(written);
    }

    // the simulator connects each part of the circuit that has no path to ground to it,
    // through a big resistor, and so does SPICE need it to
    private tieFloating(parts: { ce: CircuitElm; nets: string[] }[]): void {
        const uf = new UnionFind();
        for (const { ce, nets } of parts)
            for (let i = 0; i !== nets.length; i++) {
                // can't see inside a subcircuit, so leave its pins alone
                if (ce.hasGroundConnection(i) || ce.getDumpClass() === SubcircuitElm)
                    uf.union(nets[i], "0");
                for (let j = i + 1; j < nets.length; j++)
                    if (ce.getConnection(i, j))
                        uf.union(nets[i], nets[j]);
            }
        for (const { nets } of parts)
            for (const n of nets)
                if (uf.find(n) !== uf.find("0")) {
                    this.lines.push(this.ref("Rfloat") + " " + n + " 0 100meg");
                    uf.union(n, "0");
                }
    }

    private writeElm(ce: CircuitElm, n: string[]): void {
        const C = ce.getDumpClass();
        const e = ce as any;
        const L = (...words: (string | number)[]) => this.lines.push(words.join(" "));
        if (ce.getPostCount() === 0 || C === TextElm || C === ScopeElm || C === ProbeElm || C === OutputElm ||
            C === LogicOutputElm || C === DataRecorderElm || C === TestPointElm ||
            C === StopTriggerElm || C === AudioOutputElm || C === OhmMeterElm)
            return;

        if (C === ResistorElm) {
            L(this.ref("R"), n[0], n[1], spiceValue(e.resistance));
            return;
        }
        // the simulator starts each capacitor at its initial voltage, and each inductor at its
        // initial current, which SPICE does when told to use initial conditions
        if (C === CapacitorElm || C === PolarCapacitorElm) {
            const ref = this.ref("C");
            const ic = "IC=" + num(e.initialVoltage);
            if (e.seriesResistance > 0) {
                const mid = this.internalNet(ref + "_int");
                L(ref, n[0], mid, spiceValue(e.capacitance), ic);
                L("R" + ref, mid, n[1], spiceValue(e.seriesResistance));
            } else
                L(ref, n[0], n[1], spiceValue(e.capacitance), ic);
            return;
        }
        if (C === InductorElm) {
            const ref = this.ref("L");
            const ic = "IC=" + num(e.initialCurrent);
            if (e.seriesResistance > 0) {
                const mid = this.internalNet(ref + "_int");
                L(ref, n[0], mid, spiceValue(e.inductance), ic);
                L("R" + ref, mid, n[1], spiceValue(e.seriesResistance));
            } else
                L(ref, n[0], n[1], spiceValue(e.inductance), ic);
            if (e.saturationCurrent > 0)
                this.warnings.push("inductor saturation");
            return;
        }
        // posts: end 1, end 2, wiper
        if (C === PotElm) {
            const ref = this.ref("R");
            L(ref + "a", n[0], n[2], spiceValue(Math.max(e.maxResistance * e.position, 1e-6)));
            L(ref + "b", n[1], n[2], spiceValue(Math.max(e.maxResistance * (1 - e.position), 1e-6)));
            return;
        }
        // posts: anode, cathode
        if (C === DiodeElm || C === LEDElm || C === ZenerElm) {
            const m = e.model;
            let params = `IS=${num(m.saturationCurrent)} N=${num(m.emissionCoefficient)}`;
            if (m.seriesResistance > 0)
                params += ` RS=${num(m.seriesResistance)}`;
            if (m.breakdownVoltage > 0)
                params += ` BV=${num(m.breakdownVoltage)}`;
            L(this.ref("D"), n[0], n[1], this.exp.model("D", m.name, { kind: "D", params }));
            return;
        }
        // posts: base, collector, emitter.  SPICE: collector, base, emitter
        if (C === TransistorElm) {
            const m = e.model;
            const p: string[] = [`IS=${num(m.satCur)}`, `BF=${num(e.beta)}`, `BR=${num(m.betaR)}`,
                                 `NF=${num(m.emissionCoeffF)}`, `NR=${num(m.emissionCoeffR)}`];
            const opt = (name: string, v: number) => { if (v > 0) p.push(`${name}=${num(v)}`); };
            const inv = (name: string, v: number) => { if (v > 0) p.push(`${name}=${num(1 / v)}`); };
            inv("VAF", m.invEarlyVoltF);
            inv("VAR", m.invEarlyVoltR);
            inv("IKF", m.invRollOffF);
            inv("IKR", m.invRollOffR);
            if (m.BEleakCur > 0)
                p.push(`ISE=${num(m.BEleakCur)}`, `NE=${num(m.leakBEemissionCoeff)}`);
            if (m.BCleakCur > 0)
                p.push(`ISC=${num(m.BCleakCur)}`, `NC=${num(m.leakBCemissionCoeff)}`);
            if (m.junctionCapBE > 0)
                p.push(`CJE=${num(m.junctionCapBE)}`, `VJE=${num(m.junctionPotBE)}`, `MJE=${num(m.junctionExpBE)}`);
            if (m.junctionCapBC > 0)
                p.push(`CJC=${num(m.junctionCapBC)}`, `VJC=${num(m.junctionPotBC)}`, `MJC=${num(m.junctionExpBC)}`);
            opt("TF", m.transitTimeF);
            opt("TR", m.transitTimeR);
            const kind = e.pnp === 1 ? "NPN" : "PNP";
            L(this.ref("Q"), n[1], n[0], n[2], this.exp.model("Q", m.name, { kind, params: p.join(" ") }));
            return;
        }
        // posts: gate, source, drain (n) or gate, drain, source (p).  SPICE: drain, gate, source.
        // CircuitJS's square law with beta is SPICE's JFET with BETA = beta/2
        if (C === JfetElm) {
            const [d, s] = e.pnp === 1 ? [n[2], n[1]] : [n[1], n[2]];
            L(this.ref("J"), d, n[0], s, this.exp.model("J", e.model.name,
              { kind: e.pnp === 1 ? "NJF" : "PJF", params: `VTO=${num(e.vt)} BETA=${num(e.beta / 2)}` }));
            return;
        }
        // as above, then the body if it has a terminal; otherwise it's tied to the source.
        // CircuitJS's mosfet is SPICE's level 1 with KP = beta
        if (C === MosfetElm) {
            const [d, s] = e.pnp === 1 ? [n[2], n[1]] : [n[1], n[2]];
            const b = ce.getPostCount() > 3 ? n[3] : s;
            const m = e.model;
            let params = `LEVEL=1 VTO=${num(e.pnp * e.vt)} KP=${num(e.beta)}`;
            if (m.lambda > 0)
                params += ` LAMBDA=${num(m.lambda)}`;
            // SPICE's bulk junctions are the body diode, which the simulator usually leaves out
            if (!e.bodyDiodeSimulated)
                params += " IS=0";
            L(this.ref("M"), d, n[0], s, b, this.exp.model("M", m.name, { kind: e.pnp === 1 ? "NMOS" : "PMOS", params }));
            if (m.capGS > 0)
                L(this.ref("C"), n[0], s, spiceValue(m.capGS));
            if (m.capGD > 0)
                L(this.ref("C"), n[0], d, spiceValue(m.capGD));
            return;
        }
        // posts: -, +, out.  the output is a voltage source with the gain around the middle of the
        // output range, limited to it.  a smooth limit converges better than a hard one
        if (C === OpAmpElm) {
            const mid = (e.maxOut + e.minOut) / 2, half = (e.maxOut - e.minOut) / 2;
            L(this.ref("B"), n[2], "0",
              `V=${num(mid)}+${num(half)}*tanh(${num(e.gain / half)}*(V(${n[1]})-V(${n[0]})))`);
            return;
        }
        if (C === SwitchElm) {
            if (e.position === 0)
                L(this.ref("R"), n[0], n[1], spiceValue(e.resistance));
            return;
        }
        // posts: common, then the throws
        if (C === Switch2Elm) {
            if (!(e.position === 2 && e.hasCenterOff()))
                L(this.ref("R"), n[0], n[e.position + 1], spiceValue(e.resistance));
            return;
        }
        // CircuitJS sources are (-, +); SPICE's are (+, -)
        if ((C === VoltageElm && ce.getPostCount() === 2) || C === RailElm) {
            const spec = sourceSpec(e, this.exp.timeStep);
            if (spec === null) {
                this.leftOut(ce, n);
                return;
            }
            const ref = this.ref("V");
            const [plus, minus] = C === RailElm ? [n[0], "0"] : [n[1], n[0]];
            if (C === VoltageElm && e.internalResistance > 0) {
                const mid = this.internalNet(ref + "_int");
                L(ref, mid, minus, spec);
                L("R" + ref, plus, mid, spiceValue(e.internalResistance));
            } else
                L(ref, plus, minus, spec);
            return;
        }
        // CircuitJS current flows from post 0 through the source to post 1, as SPICE does from + to -
        if (C === CurrentElm) {
            if (e.isVoltageLimited())
                this.warnings.push("current source voltage limit");
            L(this.ref("I"), n[0], n[1], "DC", num(e.currentValue));
            return;
        }
        // a zero volt source, which SPICE can measure current through
        if (C === AmmeterElm) {
            L(this.ref("V"), n[0], n[1], "DC 0");
            return;
        }
        // the first winding goes from post 0 to 2, the second from 1 to 3, with the dots on posts 0 and 1
        if (C === TransformerElm) {
            const ref = this.ref("L");
            L(ref + "a", n[0], n[2], spiceValue(e.inductance));
            L(ref + "b", n[1], n[3], spiceValue(e.inductance * e.ratio * e.ratio));
            L("K" + ref.substring(1), ref + "a", ref + "b", num(Math.min(e.couplingCoef, 1)));
            if (e.saturationCurrent > 0)
                this.warnings.push("transformer saturation");
            return;
        }
        // a logic input is a source at the high or low level (or in between, for ternary)
        if (C === LogicInputElm) {
            const v = e.isTernary() ? e.loV + e.position * (e.hiV - e.loV) * .5 : e.position === 0 ? e.loV : e.hiV;
            L(this.ref("V"), n[0], "0", "DC", num(v));
            return;
        }
        // posts: inputs, then the output
        if (ce instanceof GateElm) {
            const kind = ce instanceof NandGateElm ? "NAND" : ce instanceof AndGateElm ? "AND" :
                         ce instanceof XnorGateElm ? "XNOR" : ce instanceof XorGateElm ? "XOR" :
                         ce instanceof NorGateElm ? "NOR" : ce instanceof OrGateElm ? "OR" : null;
            if (kind === null) {
                this.leftOut(ce, n);
                return;
            }
            const count = e.inputCount, hi = e.highVoltage, delay = e.propagationDelay;
            const schmitt = e.hasSchmittInputs(), inverted = e.hasFlag(GateElm.FLAG_INVERT_INPUTS);
            const pins = Array.from({ length: count }, (_, i) => i < 25 ? String.fromCharCode(97 + i) : "i" + (i + 1));
            const k = steepness(hi), body: string[] = [];
            const ins = pins.map(p => {
                let x: string;
                if (schmitt) {
                    const st = schmittInput(p, .35 * hi, .55 * hi, k, this.exp.timeStep);
                    body.push(...st.lines);
                    x = st.state;
                } else
                    x = level(`V(${p})`, num(hi / 2), k);
                return inverted ? `(1-${x})` : x;
            });
            // an OR gate's output is low only when all of its inputs are
            let f = kind === "AND" || kind === "NAND" ? ins.join("*") :
                    kind === "XOR" || kind === "XNOR" ? ins.reduce((a, b) => `(${a}+${b}-2*${a}*${b})`) :
                    ins.map(x => `(1-${x})`).join("*");
            if (ce.isInverting() !== (kind === "OR" || kind === "NOR"))
                f = `1-(${f})`;
            body.push(...logicOutput("y", `${num(hi)}*(${f})`, delay > 0 ? delay : this.exp.timeStep / 4));

            // a gate of the usual kind is named after its chip
            let part: [string, number] | undefined;
            if (hi === 5 && !inverted && delay === 0)
                part = schmitt ? (kind === "NAND" && count === 2 ? ["74HC132", 4] : undefined) : LOGIC_PARTS[kind][count];
            const desc = `${count}-input ${kind} gate, ${num(hi)}V logic` + (schmitt ? ", Schmitt inputs" : "") +
                         (inverted ? ", inverted inputs" : "") + (delay > 0 ? `, ${spiceValue(delay)}s delay` : "");
            const name = this.exp.logicPart(part?.[0] ?? kind + count, desc, [...pins, "y"], body);
            L(this.packRef(name, part?.[1] ?? 1), ...n.slice(0, count + 1), name);
            return;
        }
        if (C === InverterElm) {
            const hi = e.highVoltage;
            const body = logicOutput("y", `${num(hi)}*(1-${level("V(a)", num(hi / 2), steepness(hi))})`, this.exp.timeStep / 4);
            const name = this.exp.logicPart(hi === 5 ? "74HC04" : "INV", `inverter, ${num(hi)}V logic`, ["a", "y"], body);
            L(this.packRef(name, hi === 5 ? 6 : 1), n[0], n[1], name);
            return;
        }
        // the output is on once the input rises past the upper trigger, until it falls past the lower
        if (C === SchmittElm || C === InvertingSchmittElm) {
            const on = e.logicOnLevel, off = e.logicOffLevel, invert = C === InvertingSchmittElm;
            const st = schmittInput("a", e.lowerTrigger, e.upperTrigger, steepness(e.upperTrigger - e.lowerTrigger), this.exp.timeStep);
            const body = [...st.lines,
                          ...logicOutput("y", `${num(off)}+${num(on - off)}*${invert ? `(1-${st.state})` : st.state}`, this.exp.timeStep / 4)];
            const usual = on === 5 && off === 0;
            const want = invert ? (usual ? "74HC14" : "SCHMITT_INV") : (usual ? "74HC7014" : "SCHMITT");
            const desc = (invert ? "inverting " : "") + `Schmitt trigger, switching at ${num(e.lowerTrigger)}V and ` +
                         `${num(e.upperTrigger)}V, output ${num(off)}V to ${num(on)}V`;
            const name = this.exp.logicPart(want, desc, ["a", "y"], body);
            L(this.packRef(name, usual ? 6 : 1), n[0], n[1], name);
            return;
        }
        if (C === SubcircuitElm) {
            const sub = e.model ? this.exp.subckt(e.model) : null;
            if (sub === null) {
                this.leftOut(ce, n);
                return;
            }
            L(this.ref("X"), ...n.slice(0, e.model.extList.length), sub);
            return;
        }
        this.leftOut(ce, n);
    }
}

export class SpiceExporter {
    timeStep: number;
    private stopTime: number;
    private title: string;
    private models = new Map<string, string>();
    private modelCards: string[] = [];
    private subckts = new Map<any, string | null>();
    private subcktNames = new Set<string>();
    private subcktText: string[] = [];
    private logicParts = new Map<string, string>();
    private warnings: string[] = [];

    constructor(private elms: CircuitElm[], opts: SpiceOptions = {}) {
        this.timeStep = opts.timeStep ?? 5e-6;
        this.stopTime = opts.stopTime ?? this.timeStep * 1000;
        this.title = opts.title ?? "CircuitJS circuit";
    }

    // the name of a .model card with these parameters, adding it if it's new.  models with
    // the same CircuitJS name but different parameters (a transistor's beta is set on the
    // element) get numbered names
    model(prefix: string, name: string, m: Model): string {
        const card = m.kind + " (" + m.params + ")";
        const key = prefix + " " + card;
        let mname = this.models.get(key);
        if (mname !== undefined)
            return mname;
        const base = prefix + "_" + sanitize(name ?? "default");
        mname = base;
        const taken = new Set(this.models.values());
        for (let i = 2; taken.has(mname); i++)
            mname = base + "_" + i;
        this.models.set(key, mname);
        this.modelCards.push(".model " + mname + " " + card);
        return mname;
    }

    // the name of the .subckt for a logic part with this body, writing it if it's new.  a part
    // that differs from another of the same name (a different logic level, say) is numbered
    logicPart(want: string, desc: string, pins: string[], body: string[]): string {
        const key = pins.join(" ") + "\n" + body.join("\n");
        let name = this.logicParts.get(key);
        if (name !== undefined)
            return name;
        name = want;
        for (let i = 2; this.subcktNames.has(name.toLowerCase()); i++)
            name = want + "_" + i;
        this.subcktNames.add(name.toLowerCase());
        this.logicParts.set(key, name);
        this.subcktText.push("", "* " + desc, ".subckt " + name + " " + pins.join(" "), ...body, ".ends " + name);
        return name;
    }

    // the name of the .subckt for a subcircuit model, writing it if it's new
    subckt(model: any): string | null {
        if (this.subckts.has(model))
            return this.subckts.get(model)!;
        if (model.extList.some((x: any) => x.busWidth > 1)) {
            this.subckts.set(model, null);
            return null;
        }
        let name = sanitize(model.name);
        while (this.subcktNames.has(name.toLowerCase()))
            name += "_";
        this.subcktNames.add(name.toLowerCase());
        // set before writing, so a model that (somehow) contains itself doesn't recurse forever
        this.subckts.set(model, name);

        const elms = modelElements(model);
        try {
            const names = new Map<string, string>();
            const ports: string[] = [];
            const w = new NetlistWriter(this, {
                elms: elms.map(x => x.ce),
                keys: elms.map(x => x.nodes.map(nd => nd === 0 ? "0" : "n" + nd)),
                names,
            });
            for (const x of model.extList)
                names.set("n" + x.node, x.name);
            w.write();
            for (const x of model.extList)
                ports.push(x.node === 0 ? "0" : w.net("n" + x.node));
            this.subcktText.push("", ".subckt " + name + " " + ports.join(" "), ...w.lines, ".ends " + name);
            this.warnings.push(...w.warnings);
        } finally {
            // the subcircuit's parts were only built to export them; let go of any sliders
            for (const x of elms)
                x.ce.delete();
        }
        return name;
    }

    export(): SpiceExport {
        const key = (ce: CircuitElm, j: number) => {
            const p = ce.getPost(j)!;
            return "p" + Math.round(p.x) + "," + Math.round(p.y);
        };
        const w = new NetlistWriter(this, {
            elms: this.elms,
            keys: this.elms.map(ce => Array.from({ length: ce.getPostCount() }, (_, j) => key(ce, j))),
            findGround: true,
        });
        w.write();
        this.warnings.push(...w.warnings);
        const postNets = new Map(this.elms.map((ce, i) => [ce, w.postKeys(i).map(k => w.net(k))] as [CircuitElm, string[]]));
        const text = ["* " + this.title.replace(/\n/g, " "),
                      ...this.modelCards, ...this.subcktText, "",
                      ...w.lines, "",
                      "* uic starts from the parts' initial conditions, as CircuitJS does.  if SPICE",
                      "* can't start the simulation, remove it to start from the operating point",
                      `.tran ${spiceValue(this.timeStep)} ${spiceValue(this.stopTime)} uic`,
                      ".end", ""].join("\n");
        return { text, warnings: this.warnings, postNets };
    }
}

// the elements of a subcircuit model, built from its saved definition, with the model's
// node number for each of their posts (0 is ground)
function modelElements(model: any): { ce: CircuitElm; nodes: number[] }[] {
    const xml = new CircuitXMLDeserializer(CirSim.theApp);
    const children = model.elmDoc ? [...model.elmDoc.documentElement.children] as Element[] : [];
    const res: { ce: CircuitElm; nodes: number[] }[] = [];
    for (const child of children) {
        const className = CirSim.xmlDumpTypeMap.get(child.tagName);
        if (className == null)
            continue;
        const ce: CircuitElm = CirSim.constructElement(className, 0, 0);
        if (ce == null)
            continue;
        xml.parseChildElement(child);
        ce.undumpXml(xml);
        const nodes = (child.getAttribute("nn") ?? "").split(" ").filter(t => t !== "").map(Number);
        if (nodes.length < ce.getPostCount()) {
            ce.delete();
            continue;
        }
        res.push({ ce, nodes });
    }
    return res;
}

export function exportSpiceNetlist(elms: CircuitElm[], opts: SpiceOptions = {}): SpiceExport {
    return new SpiceExporter(elms, opts).export();
}
