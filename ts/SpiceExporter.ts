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
// name are one net, and ground is net 0.  each line of a bus is a net of its own.  Analog parts become SPICE devices with .model
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
import { RelayElm } from "./RelayElm";
import { TimerElm } from "./TimerElm";
import { RelayCoilElm } from "./RelayCoilElm";
import { RelayContactElm } from "./RelayContactElm";
import { LampElm } from "./LampElm";
import { TriodeElm } from "./TriodeElm";
import { SCRElm } from "./SCRElm";
import { TriacElm } from "./TriacElm";
import { DiacElm } from "./DiacElm";
import { SparkGapElm } from "./SparkGapElm";
import { InvertingSchmittElm } from "./InvertingSchmittElm";
import { LogicInputElm } from "./LogicInputElm";
import { BusLogicInputElm } from "./BusLogicInputElm";
import { BusSplitterElm } from "./BusSplitterElm";
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
import { CustomLogicElm } from "./CustomLogicElm";
import { LEDArrayElm } from "./LEDArrayElm";
import { DPDTSwitchElm } from "./DPDTSwitchElm";
import { CrossSwitchElm } from "./CrossSwitchElm";
import { MBBSwitchElm } from "./MBBSwitchElm";
import { WattmeterElm } from "./WattmeterElm";
import { WattmeterTrueElm } from "./WattmeterTrueElm";
import { DecimalDisplayElm } from "./DecimalDisplayElm";
import { VAL_CURRENT, VAL_VOLTAGE } from "./ScopeConstants";
import { InstructionDisplayElm } from "./InstructionDisplayElm";
import { VCCSElm } from "./VCCSElm";
import { VCVSElm } from "./VCVSElm";
import { CCCSElm } from "./CCCSElm";
import { CCVSElm } from "./CCVSElm";
import { ControlledVoltageElm } from "./ControlledVoltageElm";
import { ControlledCurrentElm } from "./ControlledCurrentElm";
import { Expr } from "./Expr";
import { CompositeElm } from "./CompositeElm";
import { TriStateElm } from "./TriStateElm";
import { SevenSegElm } from "./SevenSegElm";
import { TappedTransformerElm } from "./TappedTransformerElm";
import { CustomTransformerElm } from "./CustomTransformerElm";
import { TransLineElm } from "./TransLineElm";
import { VaractorElm } from "./VaractorElm";
import { TunnelDiodeElm } from "./TunnelDiodeElm";
import { AMElm } from "./AMElm";
import { FMElm } from "./FMElm";
import { SweepElm } from "./SweepElm";
import { VarRailElm } from "./VarRailElm";
import { DiodeModel } from "./DiodeModel";
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
    // the scopes' traces, each an element and the value shown (Scope.VAL_VOLTAGE, say), for
    // the .print line
    scopes?: { elm: CircuitElm | null; value: number }[];
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
    // CircuitJS centers the edges on the cycle's start and the end of the duty cycle.  SPICE
    // takes a rise time of 0 as the time step, so an instant edge gets a short one.  SPICE
    // holds the first value until the first edge, so a wave that starts high starts from its
    // falling edge.  the simulator sees an edge at the start at its first step, when the
    // parts it clocks see it too, so that's where it goes
    case VoltageElm.WF_SQUARE:
    case VoltageElm.WF_PULSE: {
        const lo = e.waveform === VoltageElm.WF_SQUARE ? bias - max : bias, hi = bias + max;
        const highTime = e.dutyCycle * per;
        const rise = Math.min(e.riseTime > 0 ? e.riseTime : timeStep / 100, highTime, per - highTime);
        const toRise = delayFor(e), toFall = delayFor(e, highTime);
        const delay = (to: number) => num(Math.max(to, timeStep) - rise / 2);
        if (toFall < toRise)
            return `PULSE(${num(hi)} ${num(lo)} ${delay(toFall)} ${num(rise)} ${num(rise)} ` +
                   `${num(per - highTime - rise)} ${num(per)})`;
        return `PULSE(${num(lo)} ${num(hi)} ${delay(toRise)} ${num(rise)} ${num(rise)} ` +
               `${num(highTime - rise)} ${num(per)})`;
    }
    // a triangle rises for half the cycle; a sawtooth rises for all of it
    case VoltageElm.WF_TRIANGLE:
        return `PULSE(${num(bias - max)} ${num(bias + max)} ${num(delayFor(e))} ${num(per / 2)} ${num(per / 2)} 0 ${num(per)})`;
    case VoltageElm.WF_SAWTOOTH: {
        const fall = Math.min(timeStep, per / 100);
        return `PULSE(${num(bias - max)} ${num(bias + max)} ${num(delayFor(e))} ${num(per - fall)} ${num(fall)} 0 ${num(per)})`;
    }
    // CircuitJS's noise is a new uniform value from -max to max each step; ngspice's is
    // gaussian, so it gets the same rms, max/sqrt(3).  (LTspice has no TRNOISE; its nearest
    // is a behavioral source, V=bias+2*max*white(time/step).)
    case VoltageElm.WF_NOISE:
        return `DC ${num(bias)} TRNOISE(${num(max / Math.sqrt(3))} ${spiceValue(timeStep)} 0 0)`;
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
// than one output tags each one's nodes.  init is where the output starts
function logicOutput(out: string, expr: string, tau: number, tag: string = "", init: string = "0"): string[] {
    return [`Braw${tag} raw${tag} 0 V=${expr}`,
            `Rlag${tag} raw${tag} lag${tag} 1k`,
            `Clag${tag} lag${tag} 0 ${spiceValue(tau / 1000)} IC=${init}`,
            `Bout${tag} ${out} 0 V=V(lag${tag})`];
}

// a Schmitt trigger input's state, from 0 to 1: it goes to 1 once the input rises past the
// upper threshold, and back to 0 once it falls past the lower.  the state is held on a small
// capacitor, which starts it at init
function schmittInput(input: string, lower: number, upper: number, k: string, timeStep: number, init: string = "0"):
        { lines: string[]; state: string } {
    const raw = "st_raw_" + input, q = "st_" + input;
    return { lines: [`B${q} ${raw} 0 V=${level(`V(${input})`, `${num(upper)}+${num(lower - upper)}*V(${q})`, k)}`,
                     `R${q} ${raw} ${q} 1k`,
                     `C${q} ${q} 0 ${spiceValue(timeStep / 4000)} IC=${init}`],
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
function heldState(q: string, expr: string, timeStep: number, init: number | string): string[] {
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
                    init: number | string = 0, force: (x: string) => string = x => x): string[] {
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

// a chip's pins in its .subckt are named after its labels, with "b" for an inverted one, and
// the line number for one line of a bus
function chipPinNames(e: any): string[] {
    const used = new Set<string>();
    return e.pins.map((p: any) => {
        let s = p.text === "" && p.clock ? "clk" : p.text;
        if (p.lineOver || (p.bubble && !p.clock))
            s += "b";
        if (p.busWidth > 1)
            s += (/\d$/.test(s) ? "_" : "") + p.busZ;
        s = sanitize(s.toLowerCase().replace("+", "p"));
        let name = s;
        for (let j = 2; used.has(name); j++)
            name = s + j;
        used.add(name);
        return name;
    });
}

// a logic part's .subckt starts its state from parameters, which default to 0.  each instance
// gives the ones where it is now
type StateParams = [string, number][];

interface ChipPart { want: string; size: number; desc: string; body: string[]; pins: string[]; params: StateParams }

// a 555 timer, with its pins in the order of the chip's, so a real 555's model can stand in
// for it.  as in the simulator, a divider puts the control pin at 2/3 Vcc; the output goes low
// once the threshold rises past the control voltage, and high once the trigger falls past
// half of it, the trigger winning, and a reset below 0.7V overrides both.  the output is 1
// ohm to Vcc or ground, and the discharge pin 10 ohms to ground while the output is low.  they
// follow the state after a short lag, as the simulator's do a step later, so that a trigger
// that the output itself ends (in a chain of 555s, say) still sets it.  they switch once the
// state is past halfway, so the discharge pin, often tied to the threshold, can't hold the
// state partway
function timerPart(e: any, timeStep: number): ChipPart {
    const k = steepness(0.1);
    const trig = level("(V(ctl)+V(g))/2-V(tr)", 0, k), thres = level("V(th)-V(ctl)", 0, k);
    const run = level("V(rst)-V(g)", 0.7, k);
    const params: StateParams = [["ic_q", e.out ? 1 : 0]];
    const body = [`Rdiv1 vcc ctl 5k`,
                  `Rdiv2 ctl g 10k`,
                  `Btrig trig 0 V=${trig}`,
                  ...heldState("q", `${run}*(V(trig)+(1-V(trig))*(1-${thres})*V(q))`, timeStep, "{ic_q}"),
                  `Bqo qo_raw 0 V=${level("V(q)", ".5", steepness(0.1))}`,
                  `Rlag qo_raw qo 1k`,
                  `Clag qo 0 ${spiceValue(timeStep / 4000)} IC={ic_q}`,
                  `Bhigh vcc out I=V(qo)*(V(vcc)-V(out))`,
                  `Blow out g I=(1-V(qo))*(V(out)-V(g))`,
                  `Bdis dis g I=(1-V(qo))*(V(dis)-V(g))/10`];
    return { want: "NE555", size: 1, desc: "555 timer", body, params,
             pins: ["g", "tr", "out", "rst", "ctl", "th", "dis", "vcc"] };
}

// a diode model's parameters
export function diodeParams(m: any): string {
    let params = `IS=${num(m.saturationCurrent)} N=${num(m.emissionCoefficient)}`;
    if (m.seriesResistance > 0)
        params += ` RS=${num(m.seriesResistance)}`;
    if (m.breakdownVoltage > 0)
        params += ` BV=${num(m.breakdownVoltage)}`;
    return params;
}

// a transistor's Gummel-Poon parameters, from its model and its beta
export function bjtParams(e: any): string {
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
    return p.join(" ");
}

// a mosfet's level 1 parameters.  CircuitJS's mosfet is SPICE's level 1 with KP = beta
export function mosfetParams(e: any): string {
    let params = `LEVEL=1 VTO=${num(e.pnp * e.vt)} KP=${num(e.beta)}`;
    if (e.model.lambda > 0)
        params += ` LAMBDA=${num(e.model.lambda)}`;
    // SPICE's bulk junctions are the body diode, which the simulator usually leaves out
    if (!e.bodyDiodeSimulated)
        params += " IS=0";
    return params;
}

// an SCR, triac, diac or spark gap as a part, with its on state held like a latch's and a
// switch for its on and off resistances.  posts: the SCR's anode, cathode and gate; the
// triac's MT2, MT1 and gate; the diac's and spark gap's two ends.
//   SCR: a gate resistance to the cathode, and the anode through the switch to a diode to the
//     cathode.  it's on while (gate current)/(trigger current) + (anode current)/(holding
//     current) is over 1, so a gate pulse turns it on and the anode current keeps it on.
//   triac: a gate resistance to MT1, and MT2 through a pair of opposite diodes and the switch
//     to MT1.  it turns on once the gate current's size is past the trigger current, and off
//     once the main current's is below the holding current.
//   diac: two paths between its ends, each a switched resistance and a diode, one each way.
//   spark gap: a switched resistance.  both turn on once the voltage across them is past the
//     breakdown voltage, and off once the current is below the holding current
function thyristorPart(ce: CircuitElm, timeStep: number): ChipPart {
    const e = ce as any, C = ce.constructor;
    const sharp = (th: number) => num(400 / th);
    const sw = (ron: number, roff: number) => `.model TSW SW (VT=0.5 VH=0 RON=${spiceValue(ron)} ROFF=${spiceValue(roff)})`;
    const dmodel = `.model DT D (${diodeParams(DiodeModel.getDefaultModel())})`;
    // turns on once on is, and off once hold isn't
    const latch = (on: string, hold: string) => heldState("s", `${on}+(1-${on})*${hold}*V(s)`, timeStep, "{ic_s}");
    if (C === SCRElm) {
        const ig = `(V(g)-V(c))/${spiceValue(e.gresistance)}`, ia = "I(Vsense)";
        return { want: "SCR", size: 1, pins: ["a", "c", "g"], params: [["ic_s", e.aresistance < 1 ? 1 : 0]],
                 desc: `SCR, trigger ${spiceValue(e.triggerI)}A, holding ${spiceValue(e.holdingI)}A`,
                 body: [`Rgate g c ${spiceValue(e.gresistance)}`,
                        `Vsense a a1 0`,
                        `Son a1 i s 0 TSW`,
                        `D1 i c DT`,
                        ...heldState("s", level(`${ig}/${spiceValue(e.triggerI)}+${ia}/${spiceValue(e.holdingI)}`, 1, "40"),
                                     timeStep, "{ic_s}"),
                        sw(0.0105, 1e6), dmodel] };
    }
    if (C === TriacElm) {
        const ig = `abs(V(g)-V(mt1))/${spiceValue(e.cresistance)}`;
        return { want: "TRIAC", size: 1, pins: ["mt2", "mt1", "g"], params: [["ic_s", e.state ? 1 : 0]],
                 desc: `triac, trigger ${spiceValue(e.triggerI)}A, holding ${spiceValue(e.holdingI)}A`,
                 body: [`Rgate g mt1 ${spiceValue(e.cresistance)}`,
                        `D1 mt2 i DT`,
                        `D2 i mt2 DT`,
                        `Son i i1 s 0 TSW`,
                        `Vsense i1 mt1 0`,
                        ...latch(level(ig, num(e.triggerI), sharp(e.triggerI)),
                                 level("abs(I(Vsense))", num(e.holdingI), sharp(e.holdingI))),
                        sw(0.01, 1e6), dmodel] };
    }
    const breakdown = level("abs(V(a)-V(b))", num(e.breakdown), sharp(e.breakdown));
    const holding = level("abs(I(Vsense))", num(e.holdcurrent), sharp(e.holdcurrent));
    const desc = `breakdown ${spiceValue(e.breakdown)}V, holding ${spiceValue(e.holdcurrent)}A, ` +
                 `${spiceValue(e.onresistance)} ohms on, ${spiceValue(e.offresistance)} off`;
    const params: StateParams = [["ic_s", e.state ? 1 : 0]];
    if (C === DiacElm)
        return { want: "DIAC", size: 1, pins: ["a", "b"], params, desc: "diac, " + desc,
                 body: [`Vsense a a1 0`,
                        `Sfwd a1 f s 0 TSW`,
                        `D1 f b DT`,
                        `D2 b r DT`,
                        `Srev r a1 s 0 TSW`,
                        ...latch(breakdown, holding),
                        sw(e.onresistance, e.offresistance), dmodel] };
    return { want: "SPARKGAP", size: 1, pins: ["a", "b"], params, desc: "spark gap, " + desc,
             body: [`Vsense a a1 0`,
                    `Son a1 b s 0 TSW`,
                    ...latch(breakdown, holding),
                    sw(e.onresistance, e.offresistance)] };
}

// a relay coil as a part, putting out on pin a whether it's activated, as the simulator's
// state 2 or 3.  the coil is an inductor and its resistance, with a source measuring its
// current, which is averaged over a millisecond.  it's energized (state 1 or 2) once that
// rises past the on current, until it falls below the off current, held like a Schmitt
// input's.  it's activated once it's been energized for the on delay, and stays activated
// until it's been unenergized for the off delay.  each delay is timed on a node that rises to
// 1 over it, and is cleared quickly when the coil changes back
function relayCoilPart(e: any, timeStep: number): ChipPart {
    const T = e.switchingTime;
    const ton = e.type === RelayCoilElm.TYPE_OFF_DELAY ? 0 : T, toff = e.type === RelayCoilElm.TYPE_ON_DELAY ? 0 : T;
    const on: number = e.onCurrent, off: number = e.offCurrent;
    const params: StateParams = [["ic_i", e.coilCurrent], ["ic_avg", e.avgCurrent],
                                 ["ic_e", e.state === 1 || e.state === 2 ? 1 : 0], ["ic_a", e.state >= 2 ? 1 : 0]];
    const body = [`Vsense c1 coil 0`,
                  `Lcoil coil coil_int ${spiceValue(e.inductance)} IC={ic_i}`,
                  `Rcoil coil_int c2 ${spiceValue(e.coilR)}`,
                  `Bavg avg_raw 0 V=abs(I(Vsense))`,
                  `Ravg avg_raw avg 1k`,
                  `Cavg avg 0 1u IC={ic_avg}`,
                  `Ben e_raw 0 V=${level("V(avg)", `${num(on)}+${num(off - on)}*V(e)`, num(40 / Math.max(on - off, on / 20)))}`,
                  `Ren e_raw e 1k`,
                  `Cen e 0 ${spiceValue(timeStep / 4000)} IC={ic_e}`];
    // a delay's timer, or the condition itself without a delay
    const done = (t: number, cond: string, node: string) => {
        if (t === 0)
            return cond;
        body.push(`B${node} 0 ${node} I=${cond}*(1-${level(`V(${node})`, "1.002", "1000")})*${spiceValue(1 / t)}` +
                  `-(1-${cond})*V(${node})*${spiceValue(4 / timeStep)}`,
                  `C${node} ${node} 0 1`,
                  `R${node} ${node} 0 1t`);
        return level(`V(${node})`, "0.999", "1e4");
    };
    const onDone = done(ton, "V(e)", "ton"), offDone = done(toff, "(1-V(e))", "toff");
    body.push(...heldState("a", `${onDone}+(1-${onDone})*(1-${offDone})*V(a)`, timeStep, "{ic_a}"));
    const kind = ["relay", "on-delay relay", "off-delay relay", "latching relay", "set", "reset"][e.type] ?? "relay";
    return { want: "RELAYCOIL", size: 1, pins: ["c1", "c2", "a"], params, body,
             desc: `${kind} coil, ${spiceValue(e.inductance)}H ${spiceValue(e.coilR)} ohms, on at ${spiceValue(on)}A, ` +
                   `off at ${spiceValue(off)}A` + (T > 0 ? `, switching in ${spiceValue(T)}s` : "") };
}

// a lamp, a filament whose resistance depends on its temperature, as in the simulator: from
// http://www.intusoft.com/nlpdf/nl11.pdf.  the temperature over room temperature is a voltage,
// on a 1F capacitor charged by the power over the filament's warming capacity and leaking
// heat over its cooling one
function lampPart(e: any): ChipPart {
    const nomR = e.nom_v * e.nom_v / e.nom_pow, room = e.roomTemp;
    const cap = 1.57e-4 * e.nom_pow, capw = cap * e.warmTime / .4, capc = cap * e.coolTime / .4, cr = 2600 / e.nom_pow;
    const tp = `min(max(V(dt)+${num(room)},200),5390)`;
    const r = `(${num(nomR)}*(1.26104-4.90662*sqrt(17.1839/${tp}-0.00318794)-7.8569/(${tp}-187.56)))`;
    return { want: "LAMP", size: 1, pins: ["a", "b"], params: [["ic_dt", e.temp - room]],
             desc: `lamp, ${num(e.nom_pow)}W at ${num(e.nom_v)}V`,
             body: [`Blamp a b I=V(a,b)/${r}`,
                    `Bheat 0 dt I=V(a,b)*V(a,b)/${r}/${spiceValue(capw)}-V(dt)/${spiceValue(capc * cr)}`,
                    `Cdt dt 0 1 IC={ic_dt}`,
                    `Rdt dt 0 1t`] };
}

// a triode, as in the simulator: the plate current is (Vgk+Vpk/mu)^1.5/kg1 once that's
// positive, and the grid conducts through 6k once it's above the cathode
function triodePart(e: any): ChipPart {
    const x = `max(V(g,k)+V(p,k)/${num(e.mu)},0)`;
    return { want: "TRIODE", size: 1, pins: ["p", "g", "k"], params: [],
             desc: `triode, mu ${num(e.mu)}, kg1 ${num(e.kg1)}`,
             body: [`Bplate p k I=${x}*sqrt(${x})/${num(e.kg1)}+V(p,k)*1e-8`,
                    `Bgrid g k I=max(V(g,k),0)/${num(e.gridCurrentR)}`,
                    `Rgrid g k 1e8`] };
}

// a relay as a part.  posts: each pole's common, the throw closed when off, the throw closed
// when on, then the coil's ends.  the coil is an inductor and its resistance, with a source
// measuring its current.  the armature's state turns on once that current rises past the on
// current and off once it falls below the off current, held like a Schmitt input's, and its
// position ramps from 0 to 1 and back over the switching time.  a throw is closed only once the
// position is all the way over, so both are open while it moves, as in the simulator.  relays
// without a switching time use the old model, where the position follows the coil current.
// with the pulldown, the simulator pulls the open throws to ground instead of connecting them
// through the off resistance
function relayPart(e: any, timeStep: number): ChipPart {
    const poles: number = e.poleCount(), on: number = e.onCurrent(), off: number = e.offCurrent();
    const T: number = e.switchingTime(), pulldown: boolean = e.needsPulldown();
    const pins: string[] = [];
    for (let p = 0; p !== poles; p++)
        pins.push(`com${p}`, `nc${p}`, `no${p}`);
    pins.push("c1", "c2");
    const params: StateParams = [["ic_i", e.coilCurrent]];
    const body = [`Vsense c1 coil 0`,
                  `Lcoil coil coil_int ${spiceValue(e.inductance())} IC={ic_i}`,
                  `Rcoil coil_int c2 ${spiceValue(e.coilR())}`];
    const i = "abs(I(Vsense))";
    let closedOn: string, closedOff: string;
    if (T > 0) {
        params.push(["ic_on", e.onState ? 1 : 0], ["ic_pos", e.d_position]);
        const k = num(40 / Math.max(on - off, on / 20));
        body.push(`Bon on_raw 0 V=${level(i, `${num(on)}+${num(off - on)}*V(on)`, k)}`,
                  `Ron on_raw on 1k`,
                  `Con on 0 ${spiceValue(timeStep / 4000)} IC={ic_on}`,
                  // the position moves at 1/T toward 1 while on and toward 0 while off, and stops just
                  // past there.  the stops are smooth, since sharp ones stall ngspice
                  `Bpos 0 pos I=(V(on)*(1-${level("V(pos)", "1.002", "1000")})-(1-V(on))*${level("V(pos)", "-0.002", "1000")})*${spiceValue(1 / T)}`,
                  `Cpos pos 0 1 IC={ic_pos}`,
                  `Rpos pos 0 1t`);
        closedOn = `V(on)*${level("V(pos)", "0.999", "1e4")}`;
        closedOff = `(1-V(on))*(1-${level("V(pos)", "0.001", "1e4")})`;
    } else {
        // the old model's position, 2.3(I/Ion)^2-1.3 clamped to 0..1, closing a throw past 0.9 or
        // 0.1.  it lags a little, as the simulator's follows the current a step later
        params.push(["ic_pos", e.d_position]);
        body.push(`Bpos pos_raw 0 V=max(0,min(1,2.3*I(Vsense)*I(Vsense)/${spiceValue(on * on)}-1.3))`,
                  `Rpos pos_raw pos 1k`,
                  `Cpos pos 0 ${spiceValue(timeStep / 4000)} IC={ic_pos}`);
        closedOn = level("V(pos)", "0.9", "1000");
        closedOff = `(1-${level("V(pos)", "0.1", "1000")})`;
    }
    body.push(`Bclosed_on closed_on 0 V=${closedOn}`,
              `Bclosed_off closed_off 0 V=${closedOff}`,
              `.model RSW SW (VT=0.5 VH=0 RON=${spiceValue(e.r_on())} ROFF=${spiceValue(pulldown ? 1e12 : e.r_off())})`);
    // with the pulldown, the simulator still connects the pole to both throws through the off
    // resistance while it moves
    if (pulldown)
        body.push(`Bmoving moving 0 V=1-V(closed_on)-V(closed_off)`,
                  `.model RMID SW (VT=0.5 VH=0 RON=${spiceValue(e.r_off())} ROFF=1t)`);
    for (let p = 0; p !== poles; p++) {
        body.push(`Soff${p} com${p} nc${p} closed_off 0 RSW`,
                  `Son${p} com${p} no${p} closed_on 0 RSW`);
        if (pulldown)
            body.push(`Smid_nc${p} com${p} nc${p} moving 0 RMID`,
                      `Smid_no${p} com${p} no${p} moving 0 RMID`,
                      `Rpd_nc${p} nc${p} 0 ${spiceValue(e.r_off())}`,
                      `Rpd_no${p} no${p} 0 ${spiceValue(e.r_off())}`);
    }
    const desc = `${poles > 1 ? poles + "-pole " : ""}relay, coil ${spiceValue(e.inductance())}H ${spiceValue(e.coilR())} ohms, ` +
                 (T > 0 ? `on at ${spiceValue(on)}A, off at ${spiceValue(off)}A, switching in ${spiceValue(T)}s`
                        : `on near ${spiceValue(on)}A`) +
                 (pulldown ? ", open throws pulled down" : "");
    return { want: poles > 1 ? `RELAY${poles}P` : "RELAY", size: 1, desc, body, pins, params };
}

// a logic chip as a logic part, or null if it can't be.  each input is turned into a level
// from 0 to 1 once, on its own node, and each output is a logic output of the inputs and state.
// the outputs and state start where they are in the simulator
function chipPart(ce: CircuitElm, timeStep: number): ChipPart | null {
    const params: StateParams = [];
    const part = chipPartBody(ce, timeStep, params);
    return part && { ...part, params };
}

function chipPartBody(ce: CircuitElm, timeStep: number, params: StateParams): Omit<ChipPart, "params"> | null {
    const C = ce.getDumpClass();
    const e = ce as any;
    const hi: number = e.highVoltage, bits: number = e.bits;
    const pins = chipPinNames(e), body: string[] = [];
    // a state parameter, starting at v
    const ic = (name: string, v: number) => { params.push([name, v]); return `{${name}}`; };
    // whether pin i is high now
    const now = (i: number) => e.pins[i].value ? 1 : 0;
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
    const output = (i: number, expr: string) =>
        body.push(...logicOutput(pins[i], `${num(hi)}*${expr}`, timeStep / 4, "_" + pins[i], ic("ic_" + pins[i], now(i) * hi)));
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
        body.push(...clockedBit("st", next, clock(3, false), timeStep, ic("ic_st", now(1)), setReset(set, reset)));
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
        body.push(...clockedBit("st", next, clock(1, falling), timeStep, ic("ic_st", now(3)), setReset(null, reset)));
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
        body.push(...clockedBit("st", xor(input(0), "V(st)"), clock(3, false), timeStep, ic("ic_st", now(1)), force));
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
        next.forEach((x, i) => body.push(...clockedBit("st" + i, x, clk, timeStep, ic("ic_st" + i, now(2 + bits - 1 - i)),
                                                       setReset(null, reset))));
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
                                                    timeStep, ic("ic_st" + i, now(bits - 1 - i)), setReset(null, activeLow(clr)))));
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
        // with no output high (after a reset), the simulator sets the first
        const none = q.every((_, i) => !now(2 + i));
        q.forEach((x, i) => {
            const shift = q[(i + bits - 1) % bits];
            body.push(...clockedBit("st" + i, inhibit ? mux(inhibit, x, shift) : shift, clk, timeStep,
                                    ic("ic_st" + i, none ? (i === 0 ? 1 : 0) : now(2 + i)),
                                    setReset(i === 0 ? reset : null, i === 0 ? null : reset)));
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
            body.push(...clockedBit("st" + i, i === 0 ? input(0) : `V(st${i - 1})`, clk, timeStep, ic("ic_st" + i, now(2 + i))));
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
            const init = ic("ic_st" + i, now(bits + i));
            body.push(...(edge ? clockedBit("st" + i, d, ld, timeStep, init, setReset(set, reset)) :
                                 heldState("st" + i, setReset(set, reset)(mux(ld, d, q)), timeStep, init)));
        }
        for (let i = 0; i !== bits; i++)
            output(bits + i, `V(st${i})`);
        return { want: `${edge ? "REG" : "LATCH"}${bits}`, size: 1, pins, body,
                 desc: `${bits}-bit ${edge ? "register" : "latch"}, ${logic}` +
                       (reset ? `, reset active ${e.resetActiveLow() ? "low" : "high"}` : "") + (set ? ", set" : "") +
                       (ies.length ? ", input enables" : "") };
    }
    // posts: the data inputs (each a bus of width lines, for a bus multiplexer), the selects, the
    // output, then the inverted output and the strobe, which holds the output low
    if (C === MultiplexerElm) {
        const count: number = e.outputCount, sel = Array.from({ length: e.selectBitCount }, (_, i) => input(e.selectPin + i));
        const width = e.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS ? e.dataBusWidth : 1;
        const inverted = e.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT);
        for (let i = 0; i !== width; i++) {
            let f = Array.from({ length: count }, (_, k) => `${matches(sel, k)}*${input(k * width + i)}`).join("+");
            if (e.strobe >= 0)
                f = `${not(input(e.strobe))}*(${f})`;
            body.push(`Bsel${i} sel${i} 0 V=${f}`);
            output(e.outputPin + i, `V(sel${i})`);
            if (inverted)
                output(e.outputPin + width + i, not(`V(sel${i})`));
        }
        return { want: `MUX${count}` + (width > 1 ? "X" + width : "") + (e.strobe >= 0 ? "_STR" : ""), size: 1, pins, body,
                 desc: `${count}-input ${width > 1 ? width + "-bit " : ""}multiplexer, ${logic}` +
                       (e.strobe >= 0 ? ", strobe active high" : "") };
    }
    // posts: the outputs, the selects, then the input (or the input, the selects, then the outputs,
    // for a bus demultiplexer, whose input and outputs can be buses of width lines).  the other
    // outputs are low (high, inverted)
    if (C === DeMultiplexerElm) {
        const count: number = e.outputCount, sel = Array.from({ length: e.selectBitCount }, (_, i) => input(e.selectPin + i));
        const width = e.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BUS ? e.dataBusWidth : 1;
        const idle = e.invertOutputs() ? "1" : "0";
        for (let k = 0; k !== count; k++)
            for (let i = 0; i !== width; i++)
                output(e.outputPin + k * width + i, mux(matches(sel, k), input(e.inputPin + i), idle));
        return { want: `DEMUX${count}` + (width > 1 ? "X" + width : "") + (e.invertOutputs() ? "_INV" : ""), size: 1, pins, body,
                 desc: `${count}-output ${width > 1 ? width + "-bit " : ""}demultiplexer, ${logic}` +
                       (e.invertOutputs() ? ", unselected outputs high" : "") };
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
        body.push(...logicOutput(pins[bits], `V(${pins[bits + 1]})*(${f})`, timeStep / 4, "_" + pins[bits],
                                 ic("ic_" + pins[bits], ce.getPostVoltage(bits))));
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
    // posts: the inputs, then the outputs.  the first rule whose left side matches the pins
    // sets the outputs, and with none matching they hold their values
    if (C === CustomLogicElm)
        return customLogic(e, pins, body, input, ic, timeStep);
    return null;
}

// a custom logic chip.  each rule's match is a product on a node of its own, and it fires if
// it matches and no rule before it does.  each output is a held state (and so is whether it's
// high impedance, if any rule makes it so), which takes the firing rule's value.
//
// a rising or falling transition on a pin is a short pulse, while its level differs from a
// delayed copy of it.  the outputs are a master and a slave: the rules set the master, and the
// slave follows it except while a pulse is on.  the rules see the outputs as the master has
// them, except during a pulse, when they see the slave.  so a rule that looks at the outputs
// (a toggle, say) sees them as they were before the edge, and fires once, and a rule that holds
// them (ab=ab) holds the new values once the pulse is over
function customLogic(e: any, pins: string[], body: string[], input: (i: number) => string,
                     ic: (name: string, v: number) => string, timeStep: number): Omit<ChipPart, "params"> {
    const model = e.model, ni: number = e.inputCount, no: number = e.outputCount, hi: number = e.highVoltage;
    const rulesLeft: string[] = model.rulesLeft, rulesRight: string[] = model.rulesRight;
    const edges = rulesLeft.some(r => /[+-]/.test(r));
    const tri: boolean = model.triState;
    // a pin's level: an input's, or an output's state
    const pinLevel = (j: number) => j < ni ? input(j) : edges ? mux("V(anyp)", `V(st${j - ni})`, `V(m${j - ni})`) : `V(m${j - ni})`;
    const pulses = new Map<string, string>(), delayed = new Set<number>();
    const pulse = (j: number, rising: boolean) => {
        const name = (rising ? "rise" : "fall") + j, d = "dly" + j;
        if (!pulses.has(name)) {
            if (!delayed.has(j))
                body.push(`B${d} ${d}_raw 0 V=${pinLevel(j)}`, `R${d} ${d}_raw ${d} 1k`,
                          `C${d} ${d} 0 ${spiceValue(timeStep / 1000)} IC=${ic("ic_" + d, e.pins[j].value ? 1 : 0)}`);
            delayed.add(j);
            body.push(`B${name} ${name} 0 V=${level(rising ? `${pinLevel(j)}-V(${d})` : `V(${d})-${pinLevel(j)}`, ".5", steepness(1))}`);
            pulses.set(name, `V(${name})`);
        }
        return pulses.get(name)!;
    };
    body.push(...model.rules.split("\n").map((l: string) => l.trim()).filter((l: string) => l !== "").map((l: string) => "* " + l));
    // each rule's match, and the pin where each of its letters is first
    const bounds = rulesLeft.map((rl, i) => {
        const lits: string[] = [], bound = new Map<string, number>();
        for (let j = 0; j !== rl.length; j++) {
            const x = rl.charAt(j);
            if (x === "0" || x === "1")
                lits.push(x === "1" ? pinLevel(j) : not(pinLevel(j)));
            else if (x === "+" || x === "-")
                lits.push(pulse(j, x === "+"));
            else if (x >= "a" && x <= "z")
                bound.set(x, j);
            else if (x >= "A" && x <= "Z")
                lits.push(`(1-${xor(pinLevel(j), pinLevel(bound.get(x.toLowerCase())!))})`);
        }
        body.push(`Br${i} r${i} 0 V=${and(lits)}`);
        return bound;
    });
    // whether each rule fires, and whether none does
    rulesLeft.forEach((_, i) => body.push(`Bf${i} f${i} 0 V=${and([`V(r${i})`, ...rulesLeft.slice(0, i).map((_, h) => not(`V(r${h})`))])}`));
    body.push(`Bnone none 0 V=${and(rulesLeft.map((_, i) => not(`V(r${i})`)))}`);
    const ps = [...pulses.values()];
    if (edges)
        body.push(`Banyp anyp 0 V=${ps.length === 1 ? ps[0] : not(and(ps.map(not)))}`);
    for (let k = 0; k !== no; k++) {
        const terms: string[] = [], zterms: string[] = [];
        rulesRight.forEach((rr, i) => {
            const x = rr.charAt(k), bound = bounds[i];
            if (x === "1")
                terms.push(`V(f${i})`);
            else if (x === "_") {
                // a high impedance output keeps its value for when it's driven again
                terms.push(`V(f${i})*V(m${k})`);
                zterms.push(`V(f${i})`);
            } else if (x >= "a" && x <= "z" && bound.has(x))
                terms.push(`V(f${i})*${pinLevel(bound.get(x)!)}`);
        });
        const out = pins[ni + k], v = e.pins[ni + k].value ? 1 : 0;
        const init = ic("ic_" + out, v), drv = ic("ic_drv_" + out, v * hi);
        body.push(...heldState(`m${k}`, [...terms, `V(none)*V(m${k})`].join("+"), timeStep, init));
        if (edges)
            body.push(...heldState(`st${k}`, mux("V(anyp)", `V(st${k})`, `V(m${k})`), timeStep, init));
        if (!tri) {
            body.push(...logicOutput(out, `${num(hi)}*V(${edges ? "st" : "m"}${k})`, timeStep / 4, "_" + out, drv));
            continue;
        }
        body.push(...heldState(`z${k}`, [...zterms, `V(none)*V(z${k})`].join("+"), timeStep,
                               ic("ic_z_" + out, e.highImpedance[ni + k] ? 1 : 0)));
        // the output drives its pin through a switch, which opens while it's high impedance
        body.push(...logicOutput(`drv_${out}`, `${num(hi)}*V(${edges ? "st" : "m"}${k})`, timeStep / 4, "_" + out, drv),
                  `Bdrv${k} en${k} 0 V=1-V(z${k})`,
                  `S${k} drv_${out} ${out} en${k} 0 TRI`);
    }
    if (tri)
        body.push(".model TRI SW (VT=0.5 VH=0 RON=1m ROFF=100meg)");
    const name = sanitize(model.name === "default" ? "CUSTOM" : model.name).toUpperCase();
    return { want: name, size: 1, pins, body,
             desc: `custom logic "${model.infoText.replace(/\s+/g, " ")}", ${num(hi)}V logic` };
}

const LOGIC_CHIPS = new Set<any>([DFlipFlopElm, JKFlipFlopElm, TFlipFlopElm, CounterElm, Counter2Elm,
                                  RingCounterElm, SipoShiftElm, LatchElm, MultiplexerElm, DeMultiplexerElm,
                                  HalfAdderElm, FullAdderElm, SevenSegDecoderElm, AnalogMuxElm, DACElm, ADCElm,
                                  CustomLogicElm]);

// a CircuitJS expression as a SPICE behavioral source's, or null if it uses something SPICE
// doesn't have (the last output, the last values of the inputs, bit operations).  input(k)
// is input k (a, b...) and ref(k) reference k (v() or i()).  powers are **, which ngspice
// and LTspice both take, and conditions use ngspice's ?:
export function spiceExpression(e: Expr, input: (k: number) => string | null, ref: (k: number) => string | null,
                         timeStep: number): string | null {
    const c = e.children ?? [];
    const x = (i: number) => spiceExpression(c[i], input, ref, timeStep);
    const all = (...xs: (string | null)[]) => xs.every(v => v !== null);
    const bin = (op: string) => { const a = x(0), b = x(1); return all(a, b) ? `(${a}${op}${b})` : null; };
    const fn = (name: string) => { const a = x(0); return a === null ? null : `${name}(${a})`; };
    // the argument mod 2 pi, from 0 to 2 pi
    const phase = (a: string) => `(${a}-${num(2 * Math.PI)}*floor((${a})/${num(2 * Math.PI)}))`;
    switch (e.type) {
    case Expr.E_ADD: return bin("+");
    case Expr.E_SUB: return bin("-");
    case Expr.E_MUL: return bin("*");
    case Expr.E_DIV: return bin("/");
    case Expr.E_POW: return bin("**");
    case Expr.E_OR: return bin("||");
    case Expr.E_AND: return bin("&&");
    case Expr.E_EQUALS: return bin("==");
    case Expr.E_NEQ: return bin("!=");
    case Expr.E_LEQ: return bin("<=");
    case Expr.E_GEQ: return bin(">=");
    case Expr.E_LESS: return bin("<");
    case Expr.E_GREATER: return bin(">");
    case Expr.E_TERNARY: { const [a, b, d] = [x(0), x(1), x(2)]; return all(a, b, d) ? `(${a}?${b}:${d})` : null; }
    case Expr.E_UMINUS: { const a = x(0); return a === null ? null : `(-${a})`; }
    case Expr.E_NOT: { const a = x(0); return a === null ? null : `(${a}==0)`; }
    case Expr.E_VAL: return num(e.value);
    case Expr.E_T: return "time";
    case Expr.E_TIMESTEP: return num(timeStep);
    case Expr.E_NODEV: return ref(e.value);
    case Expr.E_NODEDVDT: { const r = ref(e.value); return r === null ? null : `ddt(${r})`; }
    case Expr.E_SIN: return fn("sin");
    case Expr.E_COS: return fn("cos");
    case Expr.E_TAN: return fn("tan");
    case Expr.E_ASIN: return fn("asin");
    case Expr.E_ACOS: return fn("acos");
    case Expr.E_ATAN: return fn("atan");
    case Expr.E_SINH: return fn("sinh");
    case Expr.E_COSH: return fn("cosh");
    case Expr.E_TANH: return fn("tanh");
    case Expr.E_ABS: return fn("abs");
    case Expr.E_EXP: return fn("exp");
    // log is base 10 in ngspice
    case Expr.E_LOG: return fn("ln");
    case Expr.E_SQRT: return fn("sqrt");
    case Expr.E_FLOOR: return fn("floor");
    case Expr.E_CEIL: return fn("ceil");
    case Expr.E_MIN:
    case Expr.E_MAX: {
        const xs = c.map((_, i) => x(i));
        if (!all(...xs))
            return null;
        const f = e.type === Expr.E_MIN ? "min" : "max";
        return xs.reduce((a, b) => `${f}(${a},${b})`)!;
    }
    case Expr.E_CLAMP: { const [a, lo, hi] = [x(0), x(1), x(2)]; return all(a, lo, hi) ? `min(max(${a},${lo}),${hi})` : null; }
    case Expr.E_STEP: {
        const a = x(0);
        if (c.length < 2)
            return a === null ? null : `(${a}<0?0:1)`;
        const b = x(1);
        return all(a, b) ? `((${a}>${b})||(${a}<0)?0:1)` : null;
    }
    case Expr.E_SELECT: { const [a, b, d] = [x(0), x(1), x(2)]; return all(a, b, d) ? `(${a}>0?${d}:${b})` : null; }
    case Expr.E_PWR: { const [a, b] = [x(0), x(1)]; return all(a, b) ? `(abs(${a})**${b})` : null; }
    case Expr.E_PWRS: { const [a, b] = [x(0), x(1)]; return all(a, b) ? `(${a}<0?-((-${a})**${b}):${a}**${b})` : null; }
    case Expr.E_TRIANGLE: {
        const a = x(0);
        if (a === null)
            return null;
        const p = `(${phase(a)}/${num(Math.PI)})`;
        return `(${p}<1?-1+2*${p}:3-2*${p})`;
    }
    case Expr.E_SAWTOOTH: { const a = x(0); return a === null ? null : `(${phase(a)}/${num(Math.PI)}-1)`; }
    // the last point's value past it, the first's before it, and straight lines between
    case Expr.E_PWL: {
        const xs = c.map((_, i) => x(i));
        if (!all(...xs) || xs.length < 3)
            return null;
        const v = xs[0]!, pts: [string, string][] = [];
        for (let i = 1; i + 1 < xs.length; i += 2)
            pts.push([xs[i]!, xs[i + 1]!]);
        let f = pts[pts.length - 1][1];
        for (let i = pts.length - 1; i > 0; i--) {
            const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
            f = `(${v}<${x1}?${y0}+(${v}-${x0})*(${y1}-${y0})/(${x1}-${x0}):${f})`;
        }
        return `(${v}<${pts[0][0]}?${pts[0][1]}:${f})`;
    }
    }
    if (e.type >= Expr.E_LASTA)
        return null;
    if (e.type >= Expr.E_DADT) {
        const a = input(e.type - Expr.E_DADT);
        return a === null ? null : `ddt(${a})`;
    }
    if (e.type >= Expr.E_A)
        return input(e.type - Expr.E_A);
    return null;
}

// a frequency sweep's phase.  the frequency goes from the lowest to the highest (linearly, or
// by the same ratio each step), then starts again from the lowest, or comes back down.  each
// sweep advances the phase by the same amount, so the phase is that times the number of
// sweeps so far, plus the integral of the frequency over this one
function sweepPhase(e: any): string {
    const T: number = e.sweepTime, f0: number = e.minF, f1: number = e.maxF;
    const log = (e.flags & SweepElm.FLAG_LOG) !== 0, bidir = (e.flags & SweepElm.FLAG_BIDIR) !== 0;
    const r = Math.log(f1 / f0);
    // the integral over a sweep up, and over the part of one to time x into it
    const whole = log ? T * (f1 - f0) / r : T * (f0 + f1) / 2;
    const up = (x: string) => log ? `${num(f0 * T / r)}*(exp(${num(r / T)}*${x})-1)` : `(${num(f0)}*${x}+${num((f1 - f0) / (2 * T))}*${x}*${x})`;
    const down = (x: string) => log ? `${num(f1 * T / r)}*(1-exp(${num(-r / T)}*${x}))` : `(${num(f1)}*${x}-${num((f1 - f0) / (2 * T))}*${x}*${x})`;
    const k = `floor(time/${num(T)})`, x = `(time-${num(T)}*${k})`;
    if (!bidir)
        return `${num(2 * Math.PI)}*(${num(whole)}*${k}+${up(x)})`;
    // up on even sweeps, down on odd ones
    const odd = `(${k}-2*floor(${k}/2))`;
    return `${num(2 * Math.PI)}*(${num(whole)}*${k}+(${odd}>0.5?${down(x)}:${up(x)}))`;
}

// a switch's closed connections in its current position, from each pole to its throw.  a
// make-before-break switch between throws has all its posts connected, through the pole
function switchConnections(ce: CircuitElm): [number, number][] {
    const n = ce.getPostCount(), pairs: [number, number][] = [];
    for (let i = 0; i !== n; i++)
        for (let j = i + 1; j !== n; j++)
            if (ce.getConnection(i, j) && !pairs.some(([, b]) => b === i))
                pairs.push([i, j]);
    return pairs;
}

const SWITCHES = new Set<any>([DPDTSwitchElm, CrossSwitchElm, MBBSwitchElm]);
const CONTROLLED = new Set<any>([VCVSElm, VCCSElm, CCVSElm, CCCSElm, ControlledVoltageElm, ControlledCurrentElm]);

class NetlistWriter {
    lines: string[] = [];
    warnings: string[] = [];
    private refCounts = new Map<string, number>();
    private packages = new Map<string, { ref: string; used: number }>();
    private nets = new Map<string, string>();
    private usedNets = new Set<string>(["0"]);
    private netCount = 0;
    private uf = new UnionFind();
    // each element's nets, and the current through each source or ammeter (from its post 0
    // to its post 1, as CircuitJS has it), for the controlled sources that refer to them
    private elmNets = new Map<CircuitElm, string[]>();
    vsources = new Map<CircuitElm, string>();

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
            // a bus wire's posts are each line at one end, then each at the other, and a bus
            // splitter's are each line of the bus, then the line's own pin
            if (C === WireElm || C === RoutedWireElm || C === BusSplitterElm) {
                const w = k.length / 2;
                for (let j = 0; j !== w; j++)
                    this.uf.union(k[j], k[j + w]);
            } else if (C === GroundElm)
                this.uf.union(k[0], "0");
            // a bus label names a net for each line
            else if (C === LabeledNodeElm) {
                for (let j = 0; j !== k.length; j++) {
                    const name = k.length > 1 ? e.text + "_" + j : e.text;
                    this.uf.union(k[j], "L" + name);
                    labels.push([k[j], name]);
                }
            // an ideal closed switch is a wire
            } else if (C === SwitchElm && e.position === 0 && !(e.resistance > 0))
                this.uf.union(k[0], k[1]);
            else if (C === Switch2Elm && !(e.position === 2 && e.hasCenterOff()) && !(e.resistance > 0))
                this.uf.union(k[0], k[e.position + 1]);
            else if (SWITCHES.has(C) && !(e.resistance > 0))
                for (const [a, b] of switchConnections(ce))
                    this.uf.union(k[a], k[b]);
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
        // a labeled voltmeter to ground names the net it measures
        for (const p of parts)
            if (p.ce.getDumpClass() === ProbeElm && (p.ce as any).label && this.uf.find(p.keys[1]) === "0")
                labels.push([p.keys[0], (p.ce as any).label]);
        // the sheet's pins are named first, so labels with the same name don't get another
        for (const [key, name] of this.sheet.names ?? [])
            this.nameNet(key, name);
        for (const [key, name] of labels)
            this.nameNet(key, name);
        const written: { ce: CircuitElm; nets: string[] }[] = [];
        // a controlled source can refer to another element's source, so it goes after them
        parts.sort((a, b) => +CONTROLLED.has(a.ce.getDumpClass()) - +CONTROLLED.has(b.ce.getDumpClass()));
        for (const p of parts)
            this.elmNets.set(p.ce, p.keys.map(k => this.net(k)));
        this.relayGroups(parts.map(p => p.ce));
        for (const p of parts) {
            const nets = this.elmNets.get(p.ce)!;
            const count = this.lines.length;
            this.writeElm(p.ce, nets);
            if (this.lines.slice(count).some(l => !l.startsWith("*")))
                written.push({ ce: p.ce, nets });
        }
        this.writeRelayStates();
        if (this.sheet.findGround)
            this.tieFloating(written);
    }

    // relay coils and the contacts with their label.  each label has a node for its contacts'
    // position, 1 while the coil holds them over.  a coil's part puts out whether it's
    // activated: past its on current for its on delay, until it's below its off current for
    // its off delay.  usually the position is just that; a latching coil toggles it each time
    // it's activated, and set and reset coils set it to 1 or 0
    private relays = new Map<string, { position: string; mode: "follow" | "toggle" | "setReset";
                                       coils: CircuitElm[]; outputs: Map<CircuitElm, string> }>();

    private relayGroups(elms: CircuitElm[]): void {
        for (const ce of elms) {
            if (ce.getDumpClass() !== RelayCoilElm)
                continue;
            const label: string = (ce as any).label;
            let g = this.relays.get(label);
            if (!g) {
                g = { position: this.internalNet("relay_" + label), mode: "follow", coils: [], outputs: new Map() };
                this.relays.set(label, g);
            }
            g.coils.push(ce);
        }
        for (const g of this.relays.values()) {
            const types = g.coils.map(c => (c as any).type as number);
            g.mode = types.some(t => t === RelayCoilElm.TYPE_LATCHING_ON || t === RelayCoilElm.TYPE_LATCHING_OFF) ? "setReset" :
                     types[0] === RelayCoilElm.TYPE_LATCHING ? "toggle" : "follow";
            g.coils.forEach((c, i) => g.outputs.set(c, g.mode === "follow" && i === 0 ? g.position
                                                                                  : this.internalNet(`${g.position}_a${i}`)));
        }
    }

    private writeRelayStates(): void {
        for (const g of this.relays.values()) {
            const q = g.position, init = (g.coils[0] as any).switchPosition;
            for (const suffix of ["_raw", "_m", "_m_raw"])
                this.usedNets.add(q + suffix);
            const a = (c: CircuitElm) => `V(${g.outputs.get(c)})`;
            if (g.mode === "toggle")
                this.lines.push(...clockedBit(q, `(1-V(${q}))`, a(g.coils[0]), this.exp.timeStep, init));
            else if (g.mode === "setReset") {
                const of = (t: number) => g.coils.filter(c => (c as any).type === t).map(a);
                const set = of(RelayCoilElm.TYPE_LATCHING_ON), reset = of(RelayCoilElm.TYPE_LATCHING_OFF);
                const any = (xs: string[]) => xs.length === 0 ? "0" : `(1-${and(xs.map(not))})`;
                this.lines.push(...heldState(q, `${any(set)}+(1-${any(set)})*(1-${any(reset)})*V(${q})`, this.exp.timeStep, init));
            }
        }
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

    // the .model card for a diode model, with any more parameters
    private diodeModel(m: any, more: string = ""): string {
        return this.exp.model("D", m.name, { kind: "D", params: diodeParams(m) + more });
    }

    // a controlled source, as a behavioral source.  a VCVS or VCCS's inputs are its input
    // pins' voltages; a CCVS or CCCS's are the currents through a zero volt source between
    // each pair of its input pins (or, SPICE style, through the source already between them).
    // v() and i() references are a labeled node's voltage, or an element's voltage or the
    // current through the source it is
    private controlledSource(ce: CircuitElm, n: string[]): void {
        const C = ce.getDumpClass();
        const e = ce as any;
        const inputs: string[] = [];
        if (C === VCVSElm || C === VCCSElm)
            for (let i = 0; i !== e.inputCount; i++)
                inputs.push(`V(${n[i]})`);
        const sensed = C === CCVSElm || C === CCCSElm;
        const ref = this.ref("B"), senses: string[] = [];
        if (sensed)
            for (let i = 0; i + 1 < e.inputCount; i += 2) {
                if (!e.isSpiceStyle()) {
                    const v = `V${ref}_${String.fromCharCode(97 + i / 2)}`;
                    senses.push(`${v} ${n[i]} ${n[i + 1]} DC 0`);
                    inputs.push(`I(${v})`);
                    continue;
                }
                const src = [...this.vsources].find(([s]) => {
                    const sn = this.elmNets.get(s)!;
                    return sn[0] === n[i] && sn[1] === n[i + 1] || sn[0] === n[i + 1] && sn[1] === n[i];
                });
                if (src === undefined) {
                    this.leftOut(ce, n);
                    return;
                }
                inputs.push(src[1]);
            }
        const engine = e.engine;
        const refs = (k: number): string | null => {
            const r = engine.refs[k], elm = engine.refElms[k];
            if (elm == null)
                return r.current ? null : `V(${this.net("L" + r.name)})`;
            const en = this.elmNets.get(elm);
            if (en === undefined)
                return null;
            if (!r.current)
                return `V(${en[0]},${en[1]})`;
            return this.vsources.get(elm) ?? null;
        };
        // i is also the first pair's current
        const input = (k: number) => inputs[k] ?? (sensed && k === 8 ? inputs[0] ?? null : null);
        const f = engine.expr && spiceExpression(engine.expr, input, refs, this.exp.timeStep);
        if (!f) {
            this.leftOut(ce, n);
            return;
        }
        // the outputs: + then - for a voltage, and for a current, the end it flows into the
        // source from first, as SPICE has it.  a VCCS or CCCS's current flows out of its + pin
        const no = ce.getPostCount();
        const [p, m] = C === ControlledVoltageElm ? [n[1], n[0]] : C === ControlledCurrentElm ? [n[0], n[1]] :
                       C === CCCSElm || C === VCCSElm ? [n[no - 1], n[no - 2]] : [n[no - 2], n[no - 1]];
        const voltage = C === VCVSElm || C === CCVSElm || C === ControlledVoltageElm;
        this.lines.push(...senses, `${ref} ${p} ${m} ${voltage ? "V" : "I"}=${f}`);
    }

    private writeElm(ce: CircuitElm, n: string[]): void {
        const C = ce.getDumpClass();
        const e = ce as any;
        const L = (...words: (string | number)[]) => this.lines.push(words.join(" "));
        if (ce.getPostCount() === 0 || C === TextElm || C === ScopeElm || C === ProbeElm || C === OutputElm ||
            C === LogicOutputElm || C === DataRecorderElm || C === TestPointElm || C === StopTriggerElm ||
            C === AudioOutputElm || C === OhmMeterElm || C === DecimalDisplayElm || C === InstructionDisplayElm)
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
            L(this.ref("D"), n[0], n[1], this.diodeModel(e.model));
            return;
        }
        // a diode with SPICE's junction capacitance, which goes as 1/sqrt(1-v/vf) reverse biased.
        // (CircuitJS holds it at the zero bias value forward biased, where SPICE's keeps rising)
        if (C === VaractorElm) {
            L(this.ref("D"), n[0], n[1], this.diodeModel(e.model, ` CJO=${num(e.baseCapacitance)} VJ=${num(e.model.fwdrop)} M=0.5`));
            return;
        }
        // CircuitJS's tunnel diode equation: its diode part is a diode, which SPICE limits the
        // voltage steps of, as it doesn't a behavioral source's, and the tunnel and excess
        // currents are a behavioral current.  a little junction capacitance lets SPICE follow
        // the jump across the negative resistance in a relaxation oscillator
        if (C === TunnelDiodeElm) {
            const { pvp, pip, pvv, pvt, pvpp, piv } = TunnelDiodeElm, v = `V(${n[0]},${n[1]})`;
            // (N for SPICE's thermal voltage at 27C)
            const params = `IS=${num(pip * Math.exp(-pvpp / pvt))} N=${num(pvt / 0.0258520)} CJO=1p`;
            L(this.ref("D"), n[0], n[1], this.exp.model("D", "tunnel", { kind: "D", params }));
            L(this.ref("B"), n[0], n[1], `I=${num(pip / pvp)}*${v}*exp(1-${v}/${num(pvp)})+${num(piv * Math.exp(-pvv))}*(exp(${v})-1)`);
            return;
        }
        // posts: the columns, then the rows.  each LED goes from its row to its column
        if (C === LEDArrayElm) {
            const cols: number = e.sizeX, rows: number = e.sizeY;
            const model = this.diodeModel(DiodeModel.getModelWithName("default-led"));
            const pins = [...Array.from({ length: cols }, (_, i) => "c" + i), ...Array.from({ length: rows }, (_, i) => "r" + i)];
            const body: string[] = [];
            for (let y = 0; y !== rows; y++)
                for (let x = 0; x !== cols; x++)
                    body.push(`D${y}_${x} r${y} c${x} ${model}`);
            const name = this.exp.logicPart(`LEDARRAY${cols}X${rows}`, `${cols}x${rows} LED array, anodes on the rows`, pins, body);
            L(this.ref("XU"), ...n, name);
            return;
        }
        // posts: base, collector, emitter.  SPICE: collector, base, emitter
        if (C === TransistorElm) {
            const kind = e.pnp === 1 ? "NPN" : "PNP";
            L(this.ref("Q"), n[1], n[0], n[2], this.exp.model("Q", e.model.name, { kind, params: bjtParams(e) }));
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
        // as above, then the body if it has a terminal; otherwise it's tied to the source
        if (C === MosfetElm) {
            const [d, s] = e.pnp === 1 ? [n[2], n[1]] : [n[1], n[2]];
            const b = ce.getPostCount() > 3 ? n[3] : s;
            const m = e.model;
            L(this.ref("M"), d, n[0], s, b, this.exp.model("M", m.name, { kind: e.pnp === 1 ? "NMOS" : "PMOS", params: mosfetParams(e) }));
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
        // posts: discharge, trigger, threshold, Vcc, control, output, then reset and ground if
        // it has them.  without a ground pin it's on ground, and without a reset it's on Vcc
        if (C === TimerElm) {
            const part = timerPart(e, this.exp.timeStep);
            const N = TimerElm;
            const gnd = e.hasGroundPin() ? n[N.N_GND] : "0", rst = e.hasReset() ? n[N.N_RST] : n[N.N_VCC];
            const name = this.exp.logicPart(part.want, part.desc, part.pins, part.body, part.params);
            L(this.packRef(name, 1), gnd, n[N.N_TRIG], n[N.N_OUT], rst, n[N.N_CTL], n[N.N_THRES], n[N.N_DIS], n[N.N_VCC],
              name, ...SpiceExporter.instanceParams(part.params));
            return;
        }
        if (C === SCRElm || C === TriacElm || C === DiacElm || C === SparkGapElm) {
            const part = thyristorPart(ce, this.exp.timeStep);
            const name = this.exp.logicPart(part.want, part.desc, part.pins, part.body, part.params);
            L(this.packRef(name, 1), ...n, name, ...SpiceExporter.instanceParams(part.params));
            return;
        }
        // posts: the coil's ends
        if (C === RelayCoilElm) {
            this.exp.gear = true;
            const g = this.relays.get(e.label)!;
            const part = relayCoilPart(e, this.exp.timeStep);
            const name = this.exp.logicPart(part.want, part.desc, part.pins, part.body, part.params);
            L(this.packRef(name, 1), n[0], n[1], g.outputs.get(ce)!, name, ...SpiceExporter.instanceParams(part.params));
            return;
        }
        // posts: the contact's ends.  without a coil it stays where it is
        if (C === RelayContactElm) {
            const g = this.relays.get(e.label), nc = e.isNormallyClosed();
            if (!g) {
                L(this.ref("R"), n[0], n[1], spiceValue(e.i_position === 0 ? e.r_on : e.r_off));
                return;
            }
            const sw = this.exp.model("S", "relay", { kind: "SW",
                params: `VT=${nc ? -0.5 : 0.5} VH=0 RON=${spiceValue(e.r_on)} ROFF=${spiceValue(e.r_off)}` });
            L(this.ref("S"), n[0], n[1], ...(nc ? ["0", g.position] : [g.position, "0"]), sw);
            return;
        }
        if (C === LampElm || C === TriodeElm) {
            const part = C === LampElm ? lampPart(e) : triodePart(e);
            const name = this.exp.logicPart(part.want, part.desc, part.pins, part.body, part.params);
            L(this.packRef(name, 1), ...n, name, ...SpiceExporter.instanceParams(part.params));
            return;
        }
        if (C === RelayElm) {
            this.exp.gear = true;
            const part = relayPart(e, this.exp.timeStep);
            const name = this.exp.logicPart(part.want, part.desc, part.pins, part.body, part.params);
            L(this.packRef(name, 1), ...n, name, ...SpiceExporter.instanceParams(part.params));
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
        if ((C === VoltageElm && ce.getPostCount() === 2) || C === RailElm || C === VarRailElm) {
            const spec = sourceSpec(e, this.exp.timeStep);
            if (spec === null) {
                this.leftOut(ce, n);
                return;
            }
            // SPICE's current is into the + end, which is CircuitJS's post 1 (or a rail's post)
            const ref = this.ref("V");
            this.vsources.set(ce, `(-I(${ref}))`);
            const [plus, minus] = C === VoltageElm ? [n[1], n[0]] : [n[0], "0"];
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
            const ref = this.ref("V");
            this.vsources.set(ce, `I(${ref})`);
            L(ref, n[0], n[1], "DC 0");
            return;
        }
        // posts: the current path (both pairs, for the wattmeter that also measures current
        // through its voltage side), as zero volt sources, and a voltmeter's 100 megohms
        if (C === WattmeterElm) {
            L(this.ref("V"), n[0], n[1], "DC 0");
            L(this.ref("V"), n[2], n[3], "DC 0");
            return;
        }
        if (C === WattmeterTrueElm) {
            L(this.ref("R"), n[0], n[1], "100meg");
            L(this.ref("V"), n[2], n[3], "DC 0");
            return;
        }
        if (SWITCHES.has(C)) {
            for (const [a, b] of switchConnections(ce))
                L(this.ref("R"), n[a], n[b], spiceValue(e.resistance));
            return;
        }
        if (CONTROLLED.has(C)) {
            this.controlledSource(ce, n);
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
        // posts: primary, then the secondary's ends and its center tap.  each half of the
        // secondary has a quarter of the inductance of the whole
        if (C === TappedTransformerElm) {
            const ref = this.ref("L"), l2 = e.inductance * e.ratio * e.ratio / 4, k = num(Math.min(e.couplingCoef, 1));
            L(ref + "a", n[0], n[1], spiceValue(e.inductance));
            L(ref + "b", n[2], n[3], spiceValue(l2));
            L(ref + "c", n[3], n[4], spiceValue(l2));
            const r = ref.substring(1);
            L("K" + r + "ab", ref + "a", ref + "b", k);
            L("K" + r + "ac", ref + "a", ref + "c", k);
            L("K" + r + "bc", ref + "b", ref + "c", k);
            return;
        }
        // each coil goes from its node to the next, the other way round for reverse polarity,
        // and every pair is coupled
        if (C === CustomTransformerElm) {
            const ref = this.ref("L"), k = num(Math.min(e.couplingCoef, 1)), r = ref.substring(1);
            const coils = Array.from({ length: e.coilCount }, (_, i) => ref + "_" + i);
            coils.forEach((c, i) => {
                const a = n[e.coilNodes[i]], b = n[e.coilNodes[i] + 1];
                L(c, ...(e.coilPolarities[i] < 0 ? [b, a] : [a, b]), spiceValue(e.coilInductances[i]));
            });
            for (let i = 0; i !== coils.length; i++)
                for (let j = i + 1; j < coils.length; j++)
                    L(`K${r}_${i}_${j}`, coils[i], coils[j], k);
            return;
        }
        // posts: the two ends' returns, then their signals
        if (C === TransLineElm) {
            L(this.ref("T"), n[2], n[0], n[3], n[1], `Z0=${num(e.imped)}`, `TD=${num(e.delay)}`);
            return;
        }
        // a tri-state buffer drives its output through a switch, which opens while its enable is
        // low, with a resistor to ground if it has one.  posts: inputs, outputs, enable
        if (C === TriStateElm) {
            const w: number = e.busWidth, hi: number = e.highVoltage, k = steepness(hi);
            const ins = Array.from({ length: w }, (_, i) => "a" + i), outs = ins.map((_, i) => "y" + i);
            const body = [`.model TRI SW (VT=${num(hi / 2)} VH=0 RON=${spiceValue(e.r_on)} ROFF=${spiceValue(e.r_off)})`];
            const params: StateParams = [];
            ins.forEach((a, i) => {
                params.push(["ic_" + a, ce.getPostVoltage(i) > hi / 2 ? hi : 0]);
                body.push(...logicOutput("d" + i, `${num(hi)}*${level(`V(${a})`, num(hi / 2), k)}`, this.exp.timeStep / 4, "_" + i, `{ic_${a}}`),
                          `S${i} d${i} ${outs[i]} en 0 TRI`);
                if (e.r_off_ground > 0)
                    body.push(`R${i} ${outs[i]} 0 ${spiceValue(e.r_off_ground)}`);
            });
            const name = this.exp.logicPart(w === 1 ? "TRISTATE" : "TRISTATE" + w, `${w > 1 ? w + "-bit " : ""}tri-state buffer, ${num(hi)}V logic`,
                                            [...ins, ...outs, "en"], body, params);
            L(this.ref("XU"), ...n, name, ...SpiceExporter.instanceParams(params));
            return;
        }
        // an LED from each segment to the common pin (or the other way, common anode)
        if (C === SevenSegElm) {
            if (e.diodeDirection === 0)
                return;
            const model = this.diodeModel(DiodeModel.getModelWithName("default-led"));
            const segs = Array.from({ length: e.segmentCount }, (_, i) => String.fromCharCode(97 + i));
            const cc = e.diodeDirection === 1;
            const body = segs.map((s, i) => `D${i} ${cc ? s + " com" : "com " + s} ${model}`);
            const name = this.exp.logicPart(`SEG${e.segmentCount}_${cc ? "CC" : "CA"}`,
                                            `${e.segmentCount}-segment LED display, common ${cc ? "cathode" : "anode"}`, [...segs, "com"], body);
            L(this.ref("XU"), ...segs.map((_, i) => n[i]), n[e.commonPin], name);
            return;
        }
        // sources made of sines of the time
        if (C === AMElm) {
            const w = (f: number) => `${num(2 * Math.PI * f)}*time`;
            L(this.ref("B"), n[0], "0", `V=${num(e.maxVoltage)}*(sin(${w(e.signalfreq)})+1)/2*sin(${w(e.carrierfreq)})`);
            return;
        }
        // the phase is the integral of the carrier frequency plus the signal times the deviation
        if (C === FMElm) {
            const ws = num(2 * Math.PI * e.signalfreq);
            L(this.ref("B"), n[0], "0", `V=${num(e.maxVoltage)}*sin(${num(2 * Math.PI * e.carrierfreq)}*time+` +
              `${num(e.deviation / e.signalfreq)}*(1-cos(${ws}*time)))`);
            return;
        }
        if (C === SweepElm) {
            L(this.ref("B"), n[0], "0", `V=${num(e.maxV)}*sin(${sweepPhase(e)})`);
            return;
        }
        // a logic input is a source at the high or low level (or in between, for ternary)
        if (C === LogicInputElm) {
            const v = e.isTernary() ? e.loV + e.position * (e.hiV - e.loV) * .5 : e.position === 0 ? e.loV : e.hiV;
            L(this.ref("V"), n[0], "0", "DC", num(v));
            return;
        }
        // a source for each line, at the high or low level for its bit
        if (C === BusLogicInputElm) {
            for (let i = 0; i !== n.length; i++)
                L(this.ref("V"), n[i], "0", "DC", num((e.value >> i) & 1 ? e.hiV : e.loV));
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
            const params: StateParams = [["ic_y", e.lastOutput ? hi : 0]];
            body.push(...logicOutput("y", `${num(hi)}*(${f})`, delay > 0 ? delay : this.exp.timeStep / 4, "", "{ic_y}"));

            // a gate of the usual kind is named after its chip
            let part: [string, number] | undefined;
            if (hi === 5 && !inverted && delay === 0)
                part = schmitt ? (kind === "NAND" && count === 2 ? ["74HC132", 4] : undefined) : LOGIC_PARTS[kind][count];
            const desc = `${count}-input ${kind} gate, ${num(hi)}V logic` + (schmitt ? ", Schmitt inputs" : "") +
                         (inverted ? ", inverted inputs" : "") + (delay > 0 ? `, ${spiceValue(delay)}s delay` : "");
            const name = this.exp.logicPart(part?.[0] ?? kind + count, desc, [...pins, "y"], body, params);
            L(this.packRef(name, part?.[1] ?? 1), ...n.slice(0, count + 1), name, ...SpiceExporter.instanceParams(params));
            return;
        }
        if (C === InverterElm) {
            const hi = e.highVoltage;
            const params: StateParams = [["ic_y", ce.getPostVoltage(1)]];
            const body = logicOutput("y", `${num(hi)}*(1-${level("V(a)", num(hi / 2), steepness(hi))})`, this.exp.timeStep / 4, "", "{ic_y}");
            const name = this.exp.logicPart(hi === 5 ? "74HC04" : "INV", `inverter, ${num(hi)}V logic`, ["a", "y"], body, params);
            L(this.packRef(name, hi === 5 ? 6 : 1), n[0], n[1], name, ...SpiceExporter.instanceParams(params));
            return;
        }
        // the output is on once the input rises past the upper trigger, until it falls past the lower
        if (C === SchmittElm || C === InvertingSchmittElm) {
            const on = e.logicOnLevel, off = e.logicOffLevel, invert = C === InvertingSchmittElm;
            // the simulator's state is whether the input was last low
            const params: StateParams = [["ic_st", e.state ? 0 : 1], ["ic_y", ce.getPostVoltage(1)]];
            const st = schmittInput("a", e.lowerTrigger, e.upperTrigger, steepness(e.upperTrigger - e.lowerTrigger), this.exp.timeStep, "{ic_st}");
            const body = [...st.lines,
                          ...logicOutput("y", `${num(off)}+${num(on - off)}*${invert ? `(1-${st.state})` : st.state}`, this.exp.timeStep / 4,
                                         "", "{ic_y}")];
            const usual = on === 5 && off === 0;
            const want = invert ? (usual ? "74HC14" : "SCHMITT_INV") : (usual ? "74HC7014" : "SCHMITT");
            const desc = (invert ? "inverting " : "") + `Schmitt trigger, switching at ${num(e.lowerTrigger)}V and ` +
                         `${num(e.upperTrigger)}V, output ${num(off)}V to ${num(on)}V`;
            const name = this.exp.logicPart(want, desc, ["a", "y"], body, params);
            L(this.packRef(name, usual ? 6 : 1), n[0], n[1], name, ...SpiceExporter.instanceParams(params));
            return;
        }
        if (LOGIC_CHIPS.has(C)) {
            const part = chipPart(ce, this.exp.timeStep);
            if (part === null) {
                this.leftOut(ce, n);
                return;
            }
            const name = this.exp.logicPart(part.want, part.desc, part.pins, part.body, part.params);
            L(this.packRef(name, part.size), ...n, name, ...SpiceExporter.instanceParams(part.params));
            return;
        }
        // an element made of others (a comparator, a darlington...) is a .subckt of them
        if (ce instanceof CompositeElm && C !== SubcircuitElm) {
            const sub = this.exp.compositeSubckt(ce);
            if (sub === null) {
                this.leftOut(ce, n);
                return;
            }
            L(this.ref("X"), ...n, sub);
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
    private scopes: { elm: CircuitElm | null; value: number }[];
    // whether to integrate with Gear's method, as the simulator does relay coils
    gear = false;

    constructor(private elms: CircuitElm[], opts: SpiceOptions = {}) {
        this.timeStep = opts.timeStep ?? 5e-6;
        this.stopTime = opts.stopTime ?? this.timeStep * 1000;
        this.title = opts.title ?? "CircuitJS circuit";
        this.scopes = opts.scopes ?? [];
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
    logicPart(want: string, desc: string, pins: string[], body: string[], params: StateParams = []): string {
        const decl = params.length ? " params: " + params.map(([p]) => p + "=0").join(" ") : "";
        const key = pins.join(" ") + decl + "\n" + body.join("\n");
        let name = this.logicParts.get(key);
        if (name !== undefined)
            return name;
        name = want;
        for (let i = 2; this.subcktNames.has(name.toLowerCase()); i++)
            name = want + "_" + i;
        this.subcktNames.add(name.toLowerCase());
        this.logicParts.set(key, name);
        this.subcktText.push("", "* " + desc, ".subckt " + name + " " + pins.join(" ") + decl, ...body, ".ends " + name);
        return name;
    }

    // an instance's state parameters, for those not at 0
    static instanceParams(params: StateParams): string[] {
        return params.filter(([, v]) => v !== 0).map(([p, v]) => p + "=" + num(v));
    }

    // the name of the .subckt for a subcircuit model, writing it if it's new
    subckt(model: any): string | null {
        if (this.subckts.has(model))
            return this.subckts.get(model)!;
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
            // a bus pin has an entry for each line, each with a node of its own
            for (const x of model.extList)
                names.set("n" + x.node, x.busWidth > 1 ? x.name + "_" + x.busZ : x.name);
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

    // elements on their own (the parts of one schematic symbol): their lines, with element k's
    // post j on net e<k>_<j>, after the .models and .subckts they use.  null if they can't be
    // exported, or if they join their posts (an ideal closed switch is a wire)
    elementsSpice(elms: CircuitElm[]): string[] | null {
        const keys = elms.map((ce, k) => Array.from({ length: ce.getPostCount() }, (_, j) => `e${k}_${j}`));
        const w = new NetlistWriter(this, { elms, keys, names: new Map(keys.flat().map(k => [k, k])) });
        w.write();
        const nets = keys.flat().map(k => w.net(k));
        if (w.warnings.length || w.lines.length === 0 || new Set(nets).size !== nets.length)
            return null;
        return [...this.modelCards, ...this.subcktText, ...w.lines];
    }

    // the .subckt for an element made of others, or null if they can't all be exported.  its
    // pins are p0, p1... in the order of the element's posts, and the same parts with the
    // same values are one .subckt
    compositeSubckt(ce: CompositeElm): string | null {
        const c = ce as any;
        const elms: CircuitElm[] = c.compElmList;
        const keys = elms.map((_, i) => (c.compNodeInfo[i] as string).trim().split(/\s+/).map(t => t === "0" ? "0" : "n" + t));
        const names = new Map<string, string>(c.extNodeIds.map((id: number, i: number) => ["n" + id, "p" + i] as [string, string]));
        const w = new NetlistWriter(this, { elms, keys, names });
        w.write();
        if (w.warnings.length)
            return null;
        const pins = c.extNodeIds.map((id: number) => w.net("n" + id));
        const name = ce.getClassName().replace(/Elm$/, "").toUpperCase();
        return this.logicPart(name, ce.getClassName().replace(/Elm$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(),
                              pins, w.lines);
    }

    // a .print line for what's watched: the logic outputs, outputs and voltmeters, the
    // decimal displays' inputs, and the scopes' voltages, and currents through sources
    private watched(w: NetlistWriter, postNets: Map<CircuitElm, string[]>): string[] {
        const vars: string[] = [];
        const add = (v: string) => { if (!vars.includes(v)) vars.push(v); };
        let negated = false;
        const volt = (nets: string[], a: number, b: number) => {
            const na = a < 0 ? "0" : nets[a], nb = b < 0 ? "0" : nets[b];
            if (na !== nb)
                add(nb === "0" ? `V(${na})` : `V(${na},${nb})`);
        };
        const used = new Set(w.lines.filter(l => /^[A-Z]/.test(l)).flatMap(l => l.split(/[\s(),=]+/)));
        for (const ce of this.elms) {
            const C = ce.getDumpClass(), nets = postNets.get(ce)!;
            if (C === LogicOutputElm || C === OutputElm || C === ProbeElm)
                volt(nets, 0, ce.getPostCount() > 1 ? 1 : -1);
            else if (C === DecimalDisplayElm)
                nets.forEach((_, j) => volt(nets, j, -1));
        }
        for (const { elm, value } of this.scopes) {
            const nets = elm && postNets.get(elm);
            if (!nets)
                continue;
            if (elm instanceof TransistorElm && value >= 4 && value <= 6) {
                // posts: base, collector, emitter
                const [a, b] = ({ 4: [0, 2], 5: [0, 1], 6: [1, 2] } as Record<number, number[]>)[value];
                volt(nets, a, b);
            } else if (value === VAL_CURRENT) {
                // (a voltage source's current is negated: SPICE's is into its + terminal)
                const i = w.vsources.get(elm);
                if (i) {
                    negated ||= i.startsWith("(-");
                    add(i.replace(/^\(-(.*)\)$/, "$1"));
                }
            } else if (value === VAL_VOLTAGE && !(elm instanceof TransistorElm)) {
                const posts = voltagePosts(elm);
                if (posts)
                    volt(nets, ...posts);
            }
        }
        // only nets in the netlist, as a left-out part's can't be printed
        const ok = vars.filter(v => v.startsWith("I(") || v.slice(2, -1).split(",").every(n => n === "0" || used.has(n)));
        if (ok.length === 0)
            return [];
        const lines = ["* the outputs and scope traces"];
        if (negated && ok.some(v => v.startsWith("I(")))
            lines.push("* SPICE's source currents are into the + terminal, the opposite of CircuitJS's");
        for (let j = 0; j < ok.length; j += 8)
            lines.push((j === 0 ? ".print tran " : "+ ") + ok.slice(j, j + 8).join(" "));
        return lines;
    }

    export(): SpiceExport {
        const key = (ce: CircuitElm, j: number) => {
            const p = ce.getPost(j)!;
            return "p" + Math.round(p.x) + "," + Math.round(p.y) + "," + p.z;
        };
        const w = new NetlistWriter(this, {
            elms: this.elms,
            keys: this.elms.map(ce => Array.from({ length: ce.getPostCount() }, (_, j) => key(ce, j))),
            findGround: true,
        });
        w.write();
        this.warnings.push(...w.warnings);
        const postNets = new Map(this.elms.map((ce, i) => [ce, w.postKeys(i).map(k => w.net(k))] as [CircuitElm, string[]]));
        // with nothing that holds energy, SPICE starts from the operating point, as the
        // simulator settles to at its first step.  (that's also easier for SPICE to start, with a
        // loop through a limited behavioral source, say.)  capacitors, inductors, transmission
        // lines, logic state and junction capacitances start from their initial conditions
        const tran = `.tran ${spiceValue(this.timeStep)} ${spiceValue(this.stopTime)}`;
        const uic = [...this.subcktText, ...w.lines].some(l => /^[CLKT]/.test(l) || / IC=/.test(l)) ||
                    this.modelCards.some(m => /\b(CJO|CJE|CJC|CGS|CGD|CBD|CBS)=/.test(m));
        const watched = this.watched(w, postNets);
        const text = ["* " + this.title.replace(/\n/g, " "),
                      ...this.modelCards, ...this.subcktText, "",
                      ...w.lines, "",
                      ...(this.gear ? ["* the simulator integrates relay coils with backward Euler.  with the",
                                       "* trapezoidal method, a coil's kick into an open contact rings",
                                       ".options method=gear"] : []),
                      ...watched,
                      ...(uic ? ["* uic starts from the parts' initial conditions, as CircuitJS does.  if SPICE",
                                 "* can't start the simulation, remove it to start from the operating point",
                                 tran + " uic"] : [tran]),
                      ".end", ""].join("\n");
        return { text, warnings: this.warnings, postNets };
    }
}

// the posts an element's voltage is between, as its scope shows it: [a, b] for V(a)-V(b), with
// -1 for ground, or null if it isn't a difference of post voltages.  the element is given nodes
// of its own for the moment, each post's at a power of 3, so each difference has its own value
function voltagePosts(ce: CircuitElm): [number, number] | null {
    const e = ce as any, count = ce.getPostCount();
    const saved = e.nodes;
    let d: number;
    try {
        e.nodes = Array.from({ length: Math.max(saved?.length ?? 0, count) }, (_, i) => ({ v: i < count ? 3 ** (i + 1) : 0 }));
        d = ce.getVoltageDiff();
    } finally {
        e.nodes = saved;
    }
    const v = (i: number) => i < 0 ? 0 : 3 ** (i + 1);
    for (let a = -1; a < count; a++)
        for (let b = -1; b < count; b++)
            if (a !== b && v(a) - v(b) === d)
                return [a, b];
    return null;
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

// elements on their own, as SpiceExporter.elementsSpice() has them
export function elementsSpice(elms: CircuitElm[], timeStep: number): string[] | null {
    return new SpiceExporter(elms, { timeStep }).elementsSpice(elms);
}

export function exportSpiceNetlist(elms: CircuitElm[], opts: SpiceOptions = {}): SpiceExport {
    return new SpiceExporter(elms, opts).export();
}
