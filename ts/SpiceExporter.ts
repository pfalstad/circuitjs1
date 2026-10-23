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
import { AnalogSwitchElm } from "./AnalogSwitchElm";
import { AnalogSwitch2Elm } from "./AnalogSwitch2Elm";
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
import { DFlipFlopElm } from "./DFlipFlopElm";
import { JKFlipFlopElm } from "./JKFlipFlopElm";
import { TFlipFlopElm } from "./TFlipFlopElm";
import { CounterElm } from "./CounterElm";
import { Counter2Elm } from "./Counter2Elm";
import { RingCounterElm } from "./RingCounterElm";
import { SipoShiftElm } from "./SipoShiftElm";
import { LatchElm } from "./LatchElm";
import { MultiplexerElm } from "./MultiplexerElm";
import { DeMultiplexerElm } from "./DeMultiplexerElm";
import { HalfAdderElm } from "./HalfAdderElm";
import { FullAdderElm } from "./FullAdderElm";
import { SevenSegDecoderElm } from "./SevenSegDecoderElm";
import { AnalogMuxElm } from "./AnalogMuxElm";
import { DACElm } from "./DACElm";
import { ADCElm } from "./ADCElm";
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
// latch or a ring oscillator) has nothing to settle or oscillate with.  a part with more
// than one output tags each one's nodes
function logicOutput(out: string, expr: string, tau: number, tag: string = ""): string[] {
    return [`Braw${tag} raw${tag} 0 V=${expr}`,
            `Rlag${tag} raw${tag} lag${tag} 1k`,
            `Clag${tag} lag${tag} 0 ${spiceValue(tau / 1000)} IC=0`,
            `Bout${tag} ${out} 0 V=V(lag${tag})`];
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

// logic expressions on levels from 0 to 1
const not = (x: string) => `(1-${x})`;
const and = (xs: string[]) => xs.length === 0 ? "1" : xs.join("*");
const xor = (a: string, b: string) => `(${a}+${b}-2*${a}*${b})`;
const mux = (sel: string, a: string, b: string) => `(${sel}*${a}+(1-${sel})*${b})`;
// whether bits q (least significant first) hold the value v
const matches = (q: string[], v: number) => and(q.map((x, i) => (v >> i) & 1 ? x : not(x)));

// a state held on a small capacitor, from 0 to 1, which follows expr.  a steep level restores
// it to 0 or 1, so it holds its value when expr is itself
function heldState(q: string, expr: string, timeStep: number, init: number): string[] {
    return [`B${q} ${q}_raw 0 V=${level(expr, ".5", steepness(1))}`,
            `R${q} ${q}_raw ${q} 1k`,
            `C${q} ${q} 0 ${spiceValue(timeStep / 4000)} IC=${init}`];
}

// a state bit that takes the value of next when the clock level clk rises.  it's a master and
// a slave: the master follows next while the clock is low and holds while it's high, and the
// slave, the bit, follows the master while the clock is high and holds while it's low.  so
// the bit changes only on the edge, however next depends on it.  force wraps both stages'
// inputs, for asynchronous sets and resets
function clockedBit(q: string, next: string, clk: string, timeStep: number,
                    init: number = 0, force: (x: string) => string = x => x): string[] {
    const m = q + "_m";
    return [...heldState(m, force(mux(clk, `V(${m})`, next)), timeStep, init),
            ...heldState(q, force(mux(clk, `V(${m})`, `V(${q})`)), timeStep, init)];
}

// asynchronous set and reset levels, the set winning when both are given
const setReset = (set: string | null, reset: string | null) => (x: string) =>
    set && reset ? `(${set}+${not(set)}*${not(reset)}*${x})` : set ? `(${set}+${not(set)}*${x})` :
    reset ? `(${not(reset)}*${x})` : x;

// a counter's next state, counting up or down from bits q, least significant first, and
// wrapping around at the modulus (0 for none)
function countNext(q: string[], up: boolean, mod: number): string[] {
    const size = 2 ** q.length;
    let next = q.map((x, i) => xor(x, and(q.slice(0, i).map(y => up ? y : not(y)))));
    if (mod <= 0 || mod === size)
        return next;
    if (up) {
        if (mod < size) {
            const top = matches(q, mod - 1);
            next = next.map(x => `${not(top)}*${x}`);
        }
        return next;
    }
    // counting down from 0 gives the modulus less one
    const zero = matches(q, 0), top = (mod - 1) % size;
    return next.map((x, i) => (top >> i) & 1 ? `(${zero}+${not(zero)}*${x})` : `${not(zero)}*${x}`);
}

// a chip's pins in its .subckt are named after its labels, with "b" for an inverted one
function chipPinNames(e: any): string[] {
    const used = new Set<string>();
    return e.pins.map((p: any) => {
        let s = p.text === "" && p.clock ? "clk" : p.text;
        if (p.lineOver || (p.bubble && !p.clock))
            s += "b";
        s = sanitize(s.toLowerCase().replace("+", "p"));
        let name = s;
        for (let j = 2; used.has(name); j++)
            name = s + j;
        used.add(name);
        return name;
    });
}

interface ChipPart { want: string; size: number; desc: string; body: string[]; pins: string[] }

// a logic chip as a logic part, or null if it can't be.  each input is turned into a level
// from 0 to 1 once, on its own node, and each output is a logic output of the inputs and state
function chipPart(ce: CircuitElm, timeStep: number): ChipPart | null {
    const C = ce.getDumpClass();
    const e = ce as any;
    if (e.useBus() || e.pins.some((p: any) => p.busWidth > 1))
        return null;
    const hi: number = e.highVoltage, bits: number = e.bits;
    const pins = chipPinNames(e), body: string[] = [];
    const levels = new Map<number, string>();
    const input = (i: number) => {
        let x = levels.get(i);
        if (x === undefined) {
            body.push(`Bl_${pins[i]} l_${pins[i]} 0 V=${level(`V(${pins[i]})`, num(hi / 2), steepness(hi))}`);
            levels.set(i, x = `V(l_${pins[i]})`);
        }
        return x;
    };
    const activeLow = (i: number) => not(input(i));
    const output = (i: number, expr: string) => body.push(...logicOutput(pins[i], `${num(hi)}*${expr}`, timeStep / 4, "_" + pins[i]));
    // a clock level that rises on the active edge
    const clock = (i: number, falling: boolean) => falling ? not(input(i)) : input(i);
    const bitNames = (prefix: string) => Array.from({ length: bits }, (_, i) => prefix + i);
    const logic = `${num(hi)}V logic`;
    const named = (chip: string) => hi === 5 ? chip : undefined;

    // posts: D, Q, ~Q, clock, then reset and set
    if (C === DFlipFlopElm) {
        const inv = e.invertSetReset();
        const sr = (i: number) => e.getPostCount() > i ? (inv ? activeLow(i) : input(i)) : null;
        const set = sr(5), reset = sr(4);
        const next = input(0);
        body.push(...clockedBit("st", next, clock(3, false), timeStep, 0, setReset(set, reset)));
        output(1, "V(st)");
        // with both set and reset, both outputs are high
        output(2, reset ? `(${reset}+${not(set ?? "0")}*${not(reset)}*${not("V(st)")})` : not("V(st)"));
        const chip = set && reset ? named(inv ? "74HC74" : "CD4013B") : undefined;
        return { want: chip ?? (set ? "DFF_SR" : reset ? "DFF_R" : "DFF"), size: chip ? 2 : 1, pins, body,
                 desc: `D flip-flop, ${logic}` + (reset ? `, ${set ? "set and reset" : "reset"}${inv ? " active low" : ""}` : "") };
    }
    // posts: J, clock, K, Q, ~Q, then reset
    if (C === JKFlipFlopElm) {
        const falling = !e.positiveEdgeTriggered();
        const reset = e.hasReset() ? (e.invertReset() ? activeLow(5) : input(5)) : null;
        const next = `(${input(0)}*${not("V(st)")}+${not(input(2))}*V(st))`;
        body.push(...clockedBit("st", next, clock(1, falling), timeStep, 0, setReset(null, reset)));
        output(3, "V(st)");
        output(4, not("V(st)"));
        const chip = falling && e.hasReset() && e.invertReset() ? named("74HC107") : undefined;
        return { want: chip ?? (reset ? "JKFF_R" : "JKFF"), size: chip ? 2 : 1, pins, body,
                 desc: `JK flip-flop, ${logic}, ${falling ? "falling" : "rising"} edge` +
                       (reset ? `, reset${e.invertReset() ? " active low" : ""}` : "") };
    }
    // posts: T, Q, ~Q, clock, then reset and set.  the reset wins
    if (C === TFlipFlopElm) {
        const set = e.hasSet() ? input(5) : null, reset = e.hasReset() ? input(4) : null;
        const force = (x: string) => setReset(null, reset)(setReset(set, null)(x));
        body.push(...clockedBit("st", xor(input(0), "V(st)"), clock(3, false), timeStep, 0, force));
        output(1, "V(st)");
        output(2, not("V(st)"));
        return { want: set ? "TFF_SR" : reset ? "TFF_R" : "TFF", size: 1, pins, body,
                 desc: `T flip-flop, ${logic}` + (reset ? `, ${set ? "set and reset" : "reset"}` : "") };
    }
    // posts: clock, reset, the outputs, most significant first, then up/down (high to count down)
    if (C === CounterElm) {
        const falling = e.negativeEdgeTriggered(), mod = Math.max(e.modulus, 0);
        const reset = e.invertreset ? activeLow(1) : input(1);
        const q = bitNames("V(st").map(x => x + ")");
        const up = countNext(q, true, mod);
        const next = e.hasUpDown() ? countNext(q, false, mod).map((dn, i) => mux(input(bits + 2), dn, up[i])) : up;
        const clk = clock(0, falling);
        next.forEach((x, i) => body.push(...clockedBit("st" + i, x, clk, timeStep, 0, setReset(null, reset))));
        q.forEach((x, i) => output(2 + bits - 1 - i, x));
        const plain = !e.hasUpDown() && (mod === 0 || mod === 2 ** bits) && falling && !e.invertreset;
        const chip = plain ? named(bits === 4 ? "74HC393" : bits === 7 ? "CD4024B" : bits === 12 ? "CD4040B" :
                                   bits === 14 ? "CD4020B" : "") || undefined : undefined;
        return { want: chip ?? `COUNTER${bits}` + (mod > 0 && mod !== 2 ** bits ? `_MOD${mod}` : "") + (e.hasUpDown() ? "_UD" : ""),
                 size: chip === "74HC393" ? 2 : 1, pins, body,
                 desc: `${bits}-bit ${e.hasUpDown() ? "up/down " : ""}counter` + (mod > 0 ? ` modulo ${mod}` : "") +
                       `, ${logic}, ${falling ? "falling" : "rising"} edge, reset active ${e.invertreset ? "low" : "high"}` };
    }
    // posts: the outputs and the inputs, most significant first, then clock, clear, count enable
    // P, ripple carry, load and count enable T.  clear is active low and asynchronous; load is
    // active low and synchronous, and wins over counting
    if (C === Counter2Elm) {
        const size = 2 ** bits, mod = e.modulus > 0 ? e.modulus : size;
        const q = bitNames("V(st").map(x => x + ")");
        const { clk, clr, enp, rco, load, ent } = e;
        const en = `${input(enp)}*${input(ent)}`, ld = activeLow(load);
        const count = countNext(q, true, mod);
        const ck = clock(clk, false);
        q.forEach((x, i) => body.push(...clockedBit("st" + i, mux(ld, input(2 * bits - 1 - i), mux(en, count[i], x)), ck,
                                                    timeStep, 0, setReset(null, activeLow(clr)))));
        q.forEach((x, i) => output(bits - 1 - i, x));
        output(rco, mod - 1 < size ? `${input(ent)}*${matches(q, mod - 1)}` : "0");
        const chip = bits === 4 && (mod === 16 || mod === 10) ? named(mod === 10 ? "74HC160" : "74HC161") : undefined;
        return { want: chip ?? `COUNTER${bits}_LOAD` + (mod !== size ? `_MOD${mod}` : ""), size: 1, pins, body,
                 desc: `${bits}-bit synchronous counter` + (mod !== size ? ` modulo ${mod}` : "") + `, ${logic}, with load and enables` };
    }
    // posts: clock, reset, the outputs, then clock inhibit.  one output is high, starting with the
    // first, and each clock moves it to the next
    if (C === RingCounterElm) {
        const reset = e.hasInvertReset() ? activeLow(1) : input(1);
        const inhibit = e.hasClockInhibit() ? input(e.clockInhibit) : null;
        const q = bitNames("V(st").map(x => x + ")");
        const clk = clock(0, false);
        q.forEach((x, i) => {
            const shift = q[(i + bits - 1) % bits];
            body.push(...clockedBit("st" + i, inhibit ? mux(inhibit, x, shift) : shift, clk, timeStep,
                                    i === 0 ? 1 : 0, setReset(i === 0 ? reset : null, i === 0 ? null : reset)));
        });
        q.forEach((x, i) => output(2 + i, x));
        return { want: `RING${bits}`, size: 1, pins, body,
                 desc: `${bits}-output ring counter, ${logic}, reset active ${e.hasInvertReset() ? "low" : "high"}` +
                       (inhibit ? ", clock inhibit" : "") };
    }
    // posts: data, clock, then the outputs.  each clock shifts the data in at Q0
    if (C === SipoShiftElm) {
        const clk = clock(1, false);
        for (let i = 0; i !== bits; i++)
            body.push(...clockedBit("st" + i, i === 0 ? input(0) : `V(st${i - 1})`, clk, timeStep));
        for (let i = 0; i !== bits; i++)
            output(2 + i, `V(st${i})`);
        return { want: `SIPO${bits}`, size: 1, pins, body, desc: `${bits}-bit serial-in parallel-out shift register, ${logic}` };
    }
    // posts: the inputs, the outputs, load (or clock), then reset, set, the input enables and
    // the output enables.  a register loads on the rising edge of the clock; a latch follows
    // its inputs while load is high.  the inputs are enabled while the input enables are low
    if (C === LatchElm) {
        if (e.hasOutputEnable())
            return null;
        const ld = input(e.loadPin);
        const set = e.hasSet() ? input(e.setPin) : null;
        const reset = e.hasReset() ? (e.resetActiveLow() ? activeLow(e.resetPin) : input(e.resetPin)) : null;
        const ies = [e.inputEnableCount() >= 1 ? e.ie1Pin : -1, e.inputEnableCount() >= 2 ? e.ie2Pin : -1]
            .filter(i => i >= 0).map(activeLow);
        const edge = e.isEdgeTriggered();
        for (let i = 0; i !== bits; i++) {
            const q = `V(st${i})`, d = ies.length ? mux(and(ies), input(i), q) : input(i);
            body.push(...(edge ? clockedBit("st" + i, d, ld, timeStep, 0, setReset(set, reset)) :
                                 heldState("st" + i, setReset(set, reset)(mux(ld, d, q)), timeStep, 0)));
        }
        for (let i = 0; i !== bits; i++)
            output(bits + i, `V(st${i})`);
        return { want: `${edge ? "REG" : "LATCH"}${bits}`, size: 1, pins, body,
                 desc: `${bits}-bit ${edge ? "register" : "latch"}, ${logic}` +
                       (reset ? `, reset active ${e.resetActiveLow() ? "low" : "high"}` : "") + (set ? ", set" : "") +
                       (ies.length ? ", input enables" : "") };
    }
    // posts: the data inputs, the selects, the output, then the inverted output and the strobe,
    // which holds the output low
    if (C === MultiplexerElm) {
        const count: number = e.outputCount, sel = Array.from({ length: e.selectBitCount }, (_, i) => input(e.selectPin + i));
        let f = Array.from({ length: count }, (_, k) => `${matches(sel, k)}*${input(k)}`).join("+");
        if (e.strobe >= 0)
            f = `${not(input(e.strobe))}*(${f})`;
        body.push(`Bsel sel 0 V=${f}`);
        output(e.outputPin, "V(sel)");
        if (e.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT))
            output(e.outputPin + 1, not("V(sel)"));
        return { want: `MUX${count}` + (e.strobe >= 0 ? "_STR" : ""), size: 1, pins, body,
                 desc: `${count}-input multiplexer, ${logic}` + (e.strobe >= 0 ? ", strobe active high" : "") };
    }
    // posts: the outputs, the selects, then the input.  the other outputs are low (high, inverted)
    if (C === DeMultiplexerElm) {
        const count: number = e.outputCount, sel = Array.from({ length: e.selectBitCount }, (_, i) => input(e.selectPin + i));
        const idle = e.invertOutputs() ? "1" : "0";
        for (let k = 0; k !== count; k++)
            output(e.outputPin + k, mux(matches(sel, k), input(e.inputPin), idle));
        return { want: `DEMUX${count}` + (e.invertOutputs() ? "_INV" : ""), size: 1, pins, body,
                 desc: `${count}-output demultiplexer, ${logic}` + (e.invertOutputs() ? ", unselected outputs high" : "") };
    }
    // posts: sum, carry, A, B
    if (C === HalfAdderElm) {
        output(0, xor(input(2), input(3)));
        output(1, `${input(2)}*${input(3)}`);
        return { want: "HALFADDER", size: 1, pins, body, desc: `half adder, ${logic}` };
    }
    // posts: A, B, the sums, least significant first, then carry in and carry out.  each carry
    // is on its own node, or each would have the last one in it twice
    if (C === FullAdderElm) {
        let c = input(e.carryIn);
        for (let i = 0; i !== bits; i++) {
            const a = input(i), b = input(bits + i), ab = xor(a, b);
            output(2 * bits + i, xor(ab, c));
            body.push(`Bc${i + 1} c${i + 1} 0 V=${a}*${b}+${c}*${ab}`);
            c = `V(c${i + 1})`;
        }
        output(e.carryOut, c);
        const chip = bits === 4 ? named("74HC283") : undefined;
        return { want: chip ?? `ADDER${bits}`, size: 1, pins, body, desc: `${bits}-bit adder, ${logic}` };
    }
    // posts: the segments, the inputs, most significant first, then blank (active low).  the
    // segments for each input come from the decoder itself
    if (C === SevenSegDecoderElm) {
        const segs: number = e.getSegmentCount();
        const ins = [3, 2, 1, 0].map(i => input(segs + i));
        const saved = e.pins.map((p: any) => p.value);
        const on: number[][] = Array.from({ length: segs }, (): number[] => []);
        try {
            for (let v = 0; v !== 16; v++) {
                ins.forEach((_, i) => e.pins[segs + 3 - i].value = ((v >> i) & 1) === 1);
                if (e.hasBlank())
                    e.pins[segs + 4].value = true;
                e.execute();
                for (let j = 0; j !== segs; j++)
                    if (e.pins[j].value)
                        on[j].push(v);
            }
        } finally {
            e.pins.forEach((p: any, i: number) => p.value = saved[i]);
        }
        const blank = e.hasBlank() ? input(segs + 4) + "*" : "";
        for (let j = 0; j !== segs; j++)
            output(j, on[j].length === 0 ? "0" : `${blank}(${on[j].map(v => matches(ins, v)).join("+")})`);
        return { want: `SEG${segs}DEC` + (e.hasBlank() ? "_BI" : ""), size: 1, pins, body,
                 desc: `${segs}-segment decoder, ${logic}` + (e.hasBlank() ? ", blank active low" : "") +
                       (e.blankOnF() ? ", blank on 1111" : "") };
    }
    // posts: the inputs, the selects, then the output.  each input has a switch to the output,
    // closed while it's selected.  with the pulldown, an unselected input is pulled to ground
    // instead of connected through the off resistance
    if (C === AnalogMuxElm) {
        const count: number = e.inputCount, th: number = e.threshold;
        const sel = Array.from({ length: e.selectBitCount }, (_, i) => level(`V(${pins[count + i]})`, num(th), steepness(2 * th)));
        const out = pins[e.outputPin], pulldown = e.needsPulldown();
        body.push(`.model ASW SW (VT=0.5 VH=0 RON=${spiceValue(e.r_on)} ROFF=${spiceValue(pulldown ? 1e12 : e.r_off)})`);
        if (pulldown)
            body.push(`.model APD SW (VT=-0.5 VH=0 RON=${spiceValue(e.r_off)} ROFF=1t)`);
        for (let k = 0; k !== count; k++) {
            body.push(`Bsel${k} sel${k} 0 V=${matches(sel, k)}`,
                      `S${k} ${pins[k]} ${out} sel${k} 0 ASW`);
            if (pulldown)
                body.push(`Spd${k} ${pins[k]} 0 0 sel${k} APD`);
        }
        const chip = count === 8 && !pulldown ? "CD4051B" : undefined;
        return { want: `ANALOGMUX${count}`, size: 1, pins, body,
                 desc: `${count}-input analog multiplexer, ${spiceValue(e.r_on)} ohms on, switching at ${num(th)}V` +
                       (pulldown ? ", unselected inputs pulled down" : "") + (chip ? ` (like a ${chip} with INH low)` : "") };
    }
    // posts: the inputs, least significant first, the output, then the reference.  the output is
    // the reference times the input's fraction of full scale
    if (C === DACElm) {
        const max = 2 ** bits - 1;
        const f = Array.from({ length: bits }, (_, i) => `${num(2 ** i / max)}*${input(i)}`).join("+");
        body.push(...logicOutput(pins[bits], `V(${pins[bits + 1]})*(${f})`, timeStep / 4, "_" + pins[bits]));
        return { want: `DAC${bits}`, size: 1, pins, body, desc: `${bits}-bit DAC, inputs ${logic}` };
    }
    // posts: the outputs, least significant first, the input, then the reference.  the output is
    // the input's fraction of the reference, rounded down: code j starts at j/max of it (a little
    // below, so the full reference gives the top code), and bit i changes at each multiple of 2^i
    if (C === ADCElm) {
        if (bits > 10)
            return null;
        const max = 2 ** bits - 1, vin = `V(${pins[bits]})`, ref = `V(${pins[bits + 1]})`;
        const k = steepness(hi / max);
        for (let j = 1; j <= max; j++)
            body.push(`Bt${j} t${j} 0 V=${level(vin, `${num((j - .05) / max)}*${ref}`, k)}`);
        for (let i = 0; i !== bits; i++) {
            let f = "";
            for (let j = 1 << i, sign = 1; j <= max; j += 1 << i, sign = -sign)
                f += (sign > 0 ? (f ? "+" : "") : "-") + `V(t${j})`;
            output(i, `(${f})`);
        }
        return { want: `ADC${bits}`, size: 1, pins, body, desc: `${bits}-bit ADC, outputs ${logic}` };
    }
    return null;
}

const LOGIC_CHIPS = new Set<any>([DFlipFlopElm, JKFlipFlopElm, TFlipFlopElm, CounterElm, Counter2Elm,
                                  RingCounterElm, SipoShiftElm, LatchElm, MultiplexerElm, DeMultiplexerElm,
                                  HalfAdderElm, FullAdderElm, SevenSegDecoderElm, AnalogMuxElm, DACElm, ADCElm]);

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
        // posts: the two ends, then the control (SPDT: common, NO, NC, control).  a SPICE
        // switch closes when its control is above VT; one that closes when the control is low
        // sees it negated.  with the pulldown, the simulator leaves an open switch out
        // entirely and pulls its ends to ground instead
        if (C === AnalogSwitchElm || C === AnalogSwitch2Elm) {
            const pulldown = e.needsPulldown(), inv = e.hasFlag(e.FLAG_INVERT);
            const roff = pulldown ? 1e12 : e.r_off;
            const sw = (ctlHigh: boolean) => this.exp.model("S", "analog", { kind: "SW",
                params: `VT=${num(ctlHigh ? e.threshold : -e.threshold)} VH=0 RON=${spiceValue(e.r_on)} ROFF=${spiceValue(roff)}` });
            const ctl = (ctlHigh: boolean) => ctlHigh ? [n[n.length - 1], "0"] : ["0", n[n.length - 1]];
            const ends = C === AnalogSwitchElm ? [n[1]] : [n[1], n[2]];
            ends.forEach((end, i) => {
                // the SPDT's NC throw is closed when the NO one is open
                const high = (i === 0) !== inv;
                L(this.ref("S"), n[0], end, ...ctl(high), sw(high));
            });
            if (pulldown)
                for (const p of C === AnalogSwitchElm ? [n[0], n[1]] : ends)
                    L(this.ref("R"), p, "0", spiceValue(e.r_off));
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
        if (LOGIC_CHIPS.has(C)) {
            const part = chipPart(ce, this.exp.timeStep);
            if (part === null) {
                this.leftOut(ce, n);
                return;
            }
            const name = this.exp.logicPart(part.want, part.desc, part.pins, part.body);
            L(this.packRef(name, part.size), ...n, name);
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
