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

// Exports a circuit as a KiCad schematic (.kicad_sch, KiCad 9 format).
//
// Each supported element becomes a library symbol placed near its posts, in whichever of
// the 8 orientations puts its pins closest to them; short wires join each pin to its post.
// Circuit wires, ground, rails and labeled nodes are carried over as wires, power symbols
// and labels.  KiCad connects a wire end that lands in the middle of another wire, which
// CircuitJS does not, so any wire that would make a false connection is replaced by net
// labels at its ends.

import { KICAD_SYMBOLS, type KicadSymbol } from "./KicadSymbols";
import { CircuitElm } from "./CircuitElm";
import { Point } from "./Point";
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
import { VarRailElm } from "./VarRailElm";
import { AnalogSwitchElm } from "./AnalogSwitchElm";
import { AnalogSwitch2Elm } from "./AnalogSwitch2Elm";
import { DarlingtonElm } from "./DarlingtonElm";
import { ChipElm } from "./ChipElm";
import { CounterElm } from "./CounterElm";
import { LatchElm } from "./LatchElm";
import { VCCSElm } from "./VCCSElm";
import { VCVSElm } from "./VCVSElm";
import { ControlledVoltageElm } from "./ControlledVoltageElm";
import { ControlledCurrentElm } from "./ControlledCurrentElm";
import { spiceExpression, spiceValue, diodeParams, bjtParams, mosfetParams, elementsSpice } from "./SpiceExporter";
import { CC2Elm } from "./CC2Elm";
import { CC2NegElm } from "./CC2NegElm";
import { DecimalDisplayElm } from "./DecimalDisplayElm";
import { SweepElm } from "./SweepElm";
import { CurrentElm } from "./CurrentElm";
import { BatteryElm } from "./BatteryElm";
import { LampElm } from "./LampElm";
import { FuseElm } from "./FuseElm";
import { CrystalElm } from "./CrystalElm";
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
import { LogicInputElm } from "./LogicInputElm";
import { AndGateElm } from "./AndGateElm";
import { NandGateElm } from "./NandGateElm";
import { OrGateElm } from "./OrGateElm";
import { NorGateElm } from "./NorGateElm";
import { XorGateElm } from "./XorGateElm";
import { XnorGateElm } from "./XnorGateElm";
import { InverterElm } from "./InverterElm";
import { InvertingSchmittElm } from "./InvertingSchmittElm";
import { SchmittElm } from "./SchmittElm";
import { DFlipFlopElm } from "./DFlipFlopElm";
import { JKFlipFlopElm } from "./JKFlipFlopElm";
import { TimerElm } from "./TimerElm";
import { SCRElm } from "./SCRElm";
import { TriacElm } from "./TriacElm";
import { DiacElm } from "./DiacElm";
import { VaractorElm } from "./VaractorElm";
import { TunnelDiodeElm } from "./TunnelDiodeElm";
import { MemristorElm } from "./MemristorElm";
import { ThermistorNTCElm } from "./ThermistorNTCElm";
import { LDRElm } from "./LDRElm";
import { TransformerElm } from "./TransformerElm";
import { TappedTransformerElm } from "./TappedTransformerElm";
import { RelayElm } from "./RelayElm";
import { BusSplitterElm } from "./BusSplitterElm";
import { BusLogicInputElm } from "./BusLogicInputElm";
import { InstructionDisplayElm } from "./InstructionDisplayElm";
import { SimulationManager } from "./SimulationManager";
import { RelayCoilElm } from "./RelayCoilElm";
import { RelayContactElm } from "./RelayContactElm";
import { TriodeElm } from "./TriodeElm";
import { SevenSegElm } from "./SevenSegElm";
import { SubcircuitElm } from "./SubcircuitElm";
import { CirSim } from "./CirSim";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";

// coordinates are kept in KiCad grid units (1.27mm, y down).  a CircuitJS grid step of
// 8 pixels becomes 2.54mm, so posts on the CircuitJS grid land on KiCad's 100mil grid.
const MM_PER_UNIT = 1.27;
const PIXELS_PER_UNIT = 4;
const MARGIN = 20;
const EPS = 1e-6;

// z is the line, for a post on a bus (its lines' posts are all at one point)
interface Pt { x: number; y: number; z?: number; }

// a symbol pin that isn't simply one of the element's posts: tied to a post that another
// pin also uses, or to a supply with a power symbol
interface PinTie { pin: string; post?: number; power?: string; }

export type Desc =
    // pins[i] is the symbol pin for post i (null = not exported).  a pin is given by its
    // number or its name, or for a logic gate as "@in" (the unit's next input) or "@out",
    // or "@pas" (the next passive pin)
    { kind: "part"; sym: string; pins: (string | null)[]; value: string; props?: Record<string, string>;
      ties?: PinTie[];
      // posts whose pins may be swapped (a gate's inputs)
      swap?: number[];
      // the symbol hangs off post 0 in this direction
      dir?: Pt;
      // the ties' supplies may be swapped (a switch's throws), to put the higher one on top
      swapTies?: boolean;
      // logic that comes several to a package: the package's supply
      supply?: string;
      // the nets of the package's supply pins, by pin name, if not the supply for pins on
      // top and ground for the rest
      supplyPins?: Record<string, string>;
      // a unit of a part made of several elements (a relay's coil and contacts): the parts
      // with the same key share a reference
      group?: { key: string; unit: number };
      // a symbol made for this part, instead of one from the library
      symbol?: KicadSymbol;
      // posts that aren't pins, but whose nets the part's properties name: props() gives
      // the properties from those nets' SPICE names (null if they can't be named)
      inputs?: number[];
      inputProps?: (nets: string[] | null) => Record<string, string>;
      // a controlled source, whose expression names nets and ammeters with v() and i()
      controlled?: "v" | "i";
      // a SPICE model for the part, written to the project's library, with the subckt's
      // pin for each post, then each tie
      model?: SpiceModel;
      // model it from the SPICE export, though its symbol has a model of KiCad's
      spice?: boolean; } |
    // a subcircuit, which becomes a sheet
    { kind: "sheet"; model: any } |
    { kind: "wire"; pts: Point[] } |
    // a bus wire, a bus label (naming lines name0, name1...), and a bus splitter, which joins
    // each line of a bus to a post of its own
    { kind: "bus"; pts: Point[]; width: number } |
    { kind: "buslabel"; name: string; dir: Pt; width: number } |
    { kind: "splitter"; width: number } |
    { kind: "power"; name: string; dir: Pt } |
    { kind: "label"; name: string; dir: Pt } |
    { kind: "text"; text: string } |
    { kind: "ignore" };
type PartDesc = Extract<Desc, { kind: "part" }>;

// each gate type's sizes, as [input count, symbol, output pin if the part has two]
const GATES = new Map<Function, [number, string, string?][]>([
    [AndGateElm,  [[2, "AND2"], [3, "AND3"], [4, "AND4"], [8, "AND8", "1"]]],
    [NandGateElm, [[2, "NAND2"], [3, "NAND3"], [4, "NAND4"], [8, "NAND8"], [13, "NAND13"]]],
    [OrGateElm,   [[2, "OR2"], [3, "OR3"], [4, "OR4"], [8, "OR8", "1"]]],
    [NorGateElm,  [[2, "NOR2"], [3, "NOR3"], [4, "NOR4"], [8, "OR8", "13"]]],
    [XorGateElm,  [[2, "XOR2"], [9, "PARITY9", "Odd"]]],
    [XnorGateElm, [[2, "XNOR2"], [9, "PARITY9", "Even"]]],
]);

// part numbers for the logic symbols.  KiCad's library has some only as 74LS or CD4000 parts,
// which have the same pinouts
const LOGIC_VALUES: Record<string, string> = {
    AND2: "74HC08", AND3: "74HC11", AND4: "74HC21",
    AND8: "CD4068B",
    NAND2: "74HC00", NAND3: "74HC10", NAND4: "74HC20", NAND8: "74HC30", NAND13: "74HC133",
    OR2: "74HC32", OR3: "CD4075B", OR4: "CD4072B", OR8: "CD4078B",
    NOR2: "74HC02", NOR3: "74HC27", NOR4: "CD4002B",
    XOR2: "74HC86", XNOR2: "CD4077B", PARITY9: "74HC280",
    INV: "74HC04", SCHMITTINV: "74HC14", SCHMITT: "74HC7014",
    DFF: "74HC74", DFF_H: "CD4013B", JKFF: "74HC107",
    COUNTER161: "74HC161", COUNTER160: "74HC160", COUNTER4520: "CD4520B", COUNTER4518: "CD4518B",
    COUNTER4040: "CD4040B", REG175: "74HC175", REG273: "74HC273", LATCH373: "74HC373",
    ASW: "CD4066B", ASW2: "CD4053B",
};

function logic(sym: string, pins: (string | null)[], supply: number, rest?: Partial<PartDesc>): PartDesc {
    return { kind: "part", sym, pins, value: LOGIC_VALUES[sym], supply: railName(supply), ...rest };
}

// SI-prefixed value in the form KiCad uses for component values ("4.7k", "100n")
export function kicadValue(v: number, unit: string = ""): string {
    if (v === 0 || !isFinite(v))
        return "0" + unit;
    const prefixes = ["f", "p", "n", "u", "m", "", "k", "M", "G", "T"];
    let e = Math.floor(Math.log10(Math.abs(v)) / 3);
    e = Math.max(-5, Math.min(4, e));
    let m = v / Math.pow(1000, e);
    m = parseFloat(m.toPrecision(3));
    if (Math.abs(m) >= 1000 && e < 4) {
        e++;
        m = parseFloat((m / 1000).toPrecision(3));
    }
    return m + prefixes[e + 5] + unit;
}

function simNum(v: number): string {
    return String(parseFloat(v.toPrecision(6)));
}

// direction from post 0 toward point 2, along the nearest axis
function dirOf(ce: CircuitElm): Pt {
    const dx = ce.x2 - ce.x, dy = ce.y2 - ce.y;
    return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) };
}

// the voltage of a supply named by railName, or null if it isn't one
function railVoltage(name: string): number | null {
    const m = name.match(/^([+-])([\d.]+)([fpnumkMGT]?)V$/);
    if (!m)
        return null;
    const scale = "fpnum kMGT".indexOf(m[3] || " ") - 5;
    return (m[1] === "-" ? -1 : 1) * parseFloat(m[2]) * Math.pow(1000, scale);
}

function railName(v: number): string {
    return (v >= 0 ? "+" : "-") + kicadValue(Math.abs(v), "V");
}

// a waveform shifted by phaseShift (in radians) starts that much later in its cycle
function delayFor(e: any, extra: number = 0): number {
    const per = 1 / e.frequency;
    const d = (-e.phaseShift / (2 * Math.PI) * per + extra) % per;
    return d < 0 ? d + per : d;
}

// KiCad simulation source for a VoltageElm's waveform, or null if there isn't one
function sourceSpec(e: any, timeStep: number): { sym: string; value: string; props: Record<string, string> } | null {
    const max = e.maxVoltage, bias = e.bias, f = e.frequency;
    const per = 1 / f;
    const freq = " " + kicadValue(f, "Hz");
    const pulse = (y1: number, y2: number, td: number, tr: number, tf: number, tw: number) =>
        ({ sym: "VPULSE", value: kicadValue(max, "V") + freq,
           props: { "Sim.Params": `y1=${simNum(y1)} y2=${simNum(y2)} td=${simNum(td)} tr=${simNum(tr)} ` +
                                  `tf=${simNum(tf)} tw=${simNum(tw)} per=${simNum(per)}` } });
    switch (e.waveform) {
    case VoltageElm.WF_DC:
        return { sym: "VDC", value: kicadValue(max + bias, "V"), props: { "Sim.Params": "dc=" + simNum(max + bias) } };
    // a variable rail is a source at its present voltage (kept in frequency), so it can
    // still be changed
    case VoltageElm.WF_VAR:
        return { sym: "VDC", value: kicadValue(f, "V"), props: { "Sim.Params": "dc=" + simNum(f) } };
    case VoltageElm.WF_AC: {
        const phase = e.phaseShift ? " phase=" + simNum(e.phaseShift * 180 / Math.PI) : "";
        return { sym: "VSIN", value: kicadValue(max, "V") + freq,
                 props: { "Sim.Params": `dc=${simNum(bias)} ampl=${simNum(max)} f=${simNum(f)}${phase}` } };
    }
    // a square wave is high for the duty cycle and then low; a pulse is high, then zero.
    // CircuitJS centers the edges on the cycle's start and the end of the duty cycle
    case VoltageElm.WF_SQUARE:
    case VoltageElm.WF_PULSE: {
        const lo = e.waveform === VoltageElm.WF_SQUARE ? bias - max : bias;
        const rise = Math.min(e.riseTime, e.dutyCycle * per);
        return pulse(lo, bias + max, delayFor(e, -rise / 2), rise, rise, e.dutyCycle * per - rise);
    }
    // a triangle rises for half the cycle; a sawtooth rises for all of it
    case VoltageElm.WF_TRIANGLE:
        return pulse(bias - max, bias + max, delayFor(e), per / 2, per / 2, 0);
    case VoltageElm.WF_SAWTOOTH:
        return pulse(bias - max, bias + max, delayFor(e), per * .999, per * .001, 0);
    // a new random value, uniform over the range, each time step
    case VoltageElm.WF_NOISE:
        return { sym: "VRANDOM", value: "Noise",
                 props: { "Sim.Params": `ts=${simNum(timeStep)} td=0 range=${simNum(max)} offset=${simNum(bias)}` } };
    }
    return null;
}

export function describe(ce: CircuitElm, timeStep: number = 1e-6): Desc | null {
    const d = describePart(ce, timeStep);
    if (d !== null || !(ce instanceof ChipElm))
        return d;
    const C = ce.getDumpClass();
    return C === CC2Elm || C === CC2NegElm || C === DecimalDisplayElm ? null : chipBox(ce);
}

function describePart(ce: CircuitElm, timeStep: number): Desc | null {
    // the class a loaded element gets (a DC rail placed from the menu is an ACRailElm
    // edited to DC, but loads back as a RailElm)
    const C = ce.getDumpClass();
    const e = ce as any;
    if (C === WireElm || C === RoutedWireElm) {
        const pts = (C === RoutedWireElm && e.routePoints?.length >= 2) ?
            e.routePoints : [e.point1, e.point2];
        return e.busWidth > 1 ? { kind: "bus", pts, width: e.busWidth } : { kind: "wire", pts };
    }
    if (C === BusSplitterElm)
        return { kind: "splitter", width: e.bits };
    // a bus logic input is a box putting out each line
    if (C === BusLogicInputElm)
        return { kind: "part", sym: "", symbol: lineBox("Bus Logic Input", e.busWidth), value: "Bus Logic Input",
                 pins: Array.from({ length: e.busWidth }, (_, i) => String(i + 1)) };
    if (C === AmmeterElm)
        return { kind: "wire", pts: [ce.getPost(0)!, ce.getPost(1)!] };
    if (C === GroundElm)
        return { kind: "power", name: "GND", dir: dirOf(ce) };
    if (C === LabeledNodeElm)
        return e.busWidth > 1 ? { kind: "buslabel", name: e.text, dir: dirOf(ce), width: e.busWidth } :
                                { kind: "label", name: e.text, dir: dirOf(ce) };
    // a DC rail is a supply; anything else is a source to ground
    if (C === RailElm || C === VarRailElm) {
        if (e.waveform === VoltageElm.WF_DC)
            return { kind: "power", name: railName(e.maxVoltage + e.bias), dir: dirOf(ce) };
        const spec = sourceSpec(e, timeStep);
        return spec ? { kind: "part", ...spec, pins: ["1"], ties: [{ pin: "2", power: "GND" }], dir: dirOf(ce) } : null;
    }
    // KiCad has no swept source, so a sweep is a sine at its starting frequency (simulated
    // as the SPICE export has it)
    if (C === SweepElm)
        return { kind: "part", sym: "VSIN", pins: ["1"], ties: [{ pin: "2", power: "GND" }], dir: dirOf(ce), spice: true,
                 value: kicadValue(e.maxV, "V") + " " + kicadValue(e.minF, "Hz") + "-" + kicadValue(e.maxF, "Hz"),
                 props: { "Sim.Params": `dc=0 ampl=${simNum(e.maxV)} f=${simNum(e.minF)}` } };
    // a logic input is a switch between the high and low levels
    if (C === LogicInputElm) {
        if (e.isTernary())
            return null;
        return { kind: "part", sym: "SPDT", pins: ["2"], value: "SW_SPDT", dir: dirOf(ce), swapTies: true,
                 ties: [{ pin: "1", power: railName(e.hiV) }, { pin: "3", power: e.loV === 0 ? "GND" : railName(e.loV) }],
                 model: switchModel(["out", "hi", "lo"], [["out", "hi", e.position !== 0], ["out", "lo", e.position === 0]], 0) };
    }
    // CircuitJS keeps line breaks as "\n"
    if (C === TextElm)
        return { kind: "text", text: e.text.replace(/\\n/g, "\n") };
    if (C === SubcircuitElm)
        return e.model?.extList.every((x: any) => x.busWidth === 1) ? { kind: "sheet", model: e.model } : null;
    if (ce.getPostCount() === 0 || C === ScopeElm || C === ProbeElm || C === OutputElm || C === InstructionDisplayElm ||
        C === LogicOutputElm || C === DataRecorderElm || C === TestPointElm ||
        C === StopTriggerElm || C === AudioOutputElm || C === OhmMeterElm)
        return { kind: "ignore" };

    if (C === ResistorElm)
        return { kind: "part", sym: "R", pins: ["1", "2"], value: kicadValue(e.resistance) };
    // the simulator starts a capacitor at its initial voltage, and an inductor at its initial
    // current, from post 0 to 1
    if (C === CapacitorElm || C === PolarCapacitorElm)
        return { kind: "part", sym: C === CapacitorElm ? "C" : "CP", pins: ["1", "2"], value: kicadValue(e.capacitance),
                 ...reactance("C", e.capacitance, e.initialVoltage, e.seriesResistance) };
    if (C === InductorElm)
        return { kind: "part", sym: "L", pins: ["1", "2"], value: kicadValue(e.inductance),
                 ...reactance("L", e.inductance, e.initialCurrent, e.seriesResistance) };
    // CircuitJS diodes are anode first; KiCad pin 1 is the cathode
    if (C === DiodeElm || C === LEDElm || C === ZenerElm) {
        const sym = C === LEDElm ? "LED" : C === ZenerElm ? "DZ" : "D";
        const model = e.modelName && !e.modelName.startsWith("default") ? e.modelName : null;
        return { kind: "part", sym, pins: ["2", "1"], value: model ?? KICAD_SYMBOLS[sym].libId.split(":")[1],
                 props: { "Sim.Device": "D", "Sim.Pins": "1=K 2=A", "Sim.Params": simParams(diodeParams(e.model)) } };
    }
    // posts: base, collector, emitter.  2N3904/2N3906 pins: 1=E 2=B 3=C
    if (C === TransistorElm)
        return { kind: "part", sym: e.pnp === 1 ? "NPN" : "PNP", pins: ["2", "3", "1"],
                 value: e.pnp === 1 ? "2N3904" : "2N3906",
                 props: { "Sim.Device": e.pnp === 1 ? "NPN" : "PNP", "Sim.Type": "GUMMELPOON", "Sim.Params": simParams(bjtParams(e)) } };
    // posts: gate, source, drain (n) or gate, drain, source (p), then body, which is tied to
    // the source (KiCad's symbols have no body pin).  2N7000 pins: 1=S 2=G 3=D.  BS250 pins: 1=D 2=G 3=S.
    // its capacitances are level 1's overlap capacitances, per meter of width
    if (C === MosfetElm) {
        const m = e.model, caps = m.capGS > 0 || m.capGD > 0 ?
            ` w=1 l=1 cgso=${simNum(m.capGS)} cgdo=${simNum(m.capGD)}` : "";
        return { kind: "part", sym: e.pnp === 1 ? "NMOS" : "PMOS", pins: ["2", "1", "3", null],
                 value: e.pnp === 1 ? "2N7000" : "BS250",
                 props: { "Sim.Device": e.pnp === 1 ? "NMOS" : "PMOS", "Sim.Type": "MOS1",
                          "Sim.Pins": e.pnp === 1 ? "1=S 2=G 3=D 1=B" : "1=D 2=G 3=S 3=B",
                          "Sim.Params": simParams(mosfetParams(e)).replace(/^level=1 /, "") + caps } };
    }
    // same post order as mosfets.  Q_*JFET_DGS pins: 1=D 2=G 3=S
    if (C === JfetElm)
        return { kind: "part", sym: e.pnp === 1 ? "NJFET" : "PJFET",
                 pins: e.pnp === 1 ? ["2", "3", "1"] : ["2", "1", "3"],
                 value: e.pnp === 1 ? "NJFET" : "PJFET" };
    // posts: base, collector, emitter.  TIP120/TIP125 pins: 1=B 2=C 3=E
    if (C === DarlingtonElm)
        return { kind: "part", sym: e.pnp === 1 ? "DARL_NPN" : "DARL_PNP", pins: ["1", "2", "3"],
                 value: e.pnp === 1 ? "TIP120" : "TIP125" };
    // posts: -, +, out.  OPAMP pins: 1=+ 2=- 5=out, 3=vcc 4=vee.  the output limits are the
    // supplies, which KiCad's model limits the output to
    if (C === OpAmpElm)
        return { kind: "part", sym: "OPAMP", pins: ["2", "1", "5"], value: "OpAmp", spice: true,
                 ties: [{ pin: "3", power: railName(e.maxOut) }, { pin: "4", power: e.minOut === 0 ? "GND" : railName(e.minOut) }] };
    // posts: end 1, end 2, wiper.  pot pins: 1, 3 ends, 2 wiper
    if (C === PotElm)
        return { kind: "part", sym: "POT", pins: ["1", "3", "2"], value: kicadValue(e.maxResistance) };
    // position 0 is closed
    if (C === SwitchElm)
        return { kind: "part", ...(e.momentary ? { sym: "PUSH", value: "SW_Push" } : { sym: "SPST", value: "SW_SPST" }),
                 pins: ["1", "2"], model: switchModel(["a", "b"], [["a", "b", e.position === 0]], e.resistance) };
    // posts: common, throw 1, throw 2.  SPDT pins: 2=common, 1, 3 throws.  position 2 is the
    // center off, if it has one
    if (C === Switch2Elm)
        return e.throwCount === 2 ? { kind: "part", sym: "SPDT", pins: ["2", "1", "3"], value: "SW_SPDT",
                                      model: switchModel(["c", "t1", "t2"], [["c", "t1", e.position === 0], ["c", "t2", e.position === 1]],
                                                         e.resistance) } : null;
    // posts: the switch's ends, then the control.  the switches have 5V logic; the 4053
    // connects X to X0 when A is low, so a normally closed switch is one side of it.
    // 4053 pins: 14=X 12=X0 13=X1 11=A, 6=Inh 10=B 9=C
    if (C === AnalogSwitchElm) {
        if (!e.hasFlag(e.FLAG_INVERT))
            return logic("ASW", ["@pas", "@pas", "@in"], 5, { swap: [0, 1] });
        return logic("ASW2", ["14", "12", "11"], 5,
                     { ties: [{ pin: "6", power: "GND" }, { pin: "10", power: "GND" }, { pin: "9", power: "GND" }] });
    }
    // posts: common, the contact made above the threshold, the one made below, control
    if (C === AnalogSwitch2Elm) {
        const swap = e.hasFlag(e.FLAG_INVERT);
        return logic("ASW2", ["14", swap ? "12" : "13", swap ? "13" : "12", "11"], 5,
                     { ties: [{ pin: "6", power: "GND" }, { pin: "10", power: "GND" }, { pin: "9", power: "GND" }] });
    }
    // CircuitJS voltage sources are (-, +); KiCad sources are (+, -)
    if (C === VoltageElm && ce.getPostCount() === 2) {
        const spec = sourceSpec(e, timeStep);
        return spec ? { kind: "part", ...spec, pins: ["2", "1"] } : null;
    }
    // CircuitJS current flows from post 0 through the source to post 1, as SPICE does from + to -
    if (C === CurrentElm)
        return { kind: "part", sym: "IDC", pins: ["1", "2"], value: kicadValue(e.currentValue, "A"),
                 props: { "Sim.Params": "dc=" + simNum(e.currentValue) } };
    if (C === BatteryElm)
        return { kind: "part", sym: "BAT", pins: ["2", "1"], value: "Battery" };
    if (C === LampElm)
        return { kind: "part", sym: "LAMP", pins: ["1", "2"], value: "Lamp" };
    if (C === FuseElm)
        return { kind: "part", sym: "FUSE", pins: ["1", "2"], value: "Fuse" };
    if (C === CrystalElm)
        return { kind: "part", sym: "XTAL", pins: ["1", "2"], value: "Crystal" };
    if (C === SCRElm)
        return { kind: "part", sym: "SCR", pins: ["A", "K", "G"], value: "SCR" };
    // posts: MT2, MT1 (on the gate's side), gate
    if (C === TriacElm)
        return { kind: "part", sym: "TRIAC", pins: ["A2", "A1", "G"], value: "Triac" };
    if (C === DiacElm)
        return { kind: "part", sym: "DIAC", pins: ["1", "2"], value: "DIAC" };
    if (C === VaractorElm)
        return { kind: "part", sym: "VARACTOR", pins: ["A", "K"], value: "Varactor" };
    if (C === TunnelDiodeElm)
        return { kind: "part", sym: "TUNNEL", pins: ["A", "K"], value: "D_Tunnel" };
    if (C === MemristorElm)
        return { kind: "part", sym: "MEMRISTOR", pins: ["1", "2"], value: "Memristor" };
    if (C === ThermistorNTCElm)
        return { kind: "part", sym: "NTC", pins: ["1", "2"], value: "NTC" };
    if (C === LDRElm)
        return { kind: "part", sym: "LDR", pins: ["1", "2"], value: "LDR" };
    // posts: primary ends, then the secondary ends beside them
    // the first winding goes from post 0 to 2, the second from 1 to 3, with posts 0 and 1 in
    // phase.  they go on the pins on the same side, unless the secondary is drawn reversed
    // (KiCad's transformers have no dots, so the ends on top are in phase)
    if (C === TransformerElm) {
        const k = simNum(Math.min(e.couplingCoef, 1));
        return { kind: "part", sym: "XFMR", pins: e.polarity === 1 ? ["1", "4", "2", "3"] : ["1", "3", "2", "4"],
                 value: "Transformer", model: { name: "XFMR", pins: ["p1", "s1", "p2", "s2"], body: [
                     `L1 p1 p2 ${spiceValue(e.inductance)}`, `L2 s1 s2 ${spiceValue(e.inductance * e.ratio * e.ratio)}`,
                     `K1 L1 L2 ${k}`] } };
    }
    // posts: the primary's ends, then the secondary's, with its center tap.  each half of the
    // secondary has a quarter of the inductance of the whole
    if (C === TappedTransformerElm) {
        const k = simNum(Math.min(e.couplingCoef, 1)), l2 = spiceValue(e.inductance * e.ratio * e.ratio / 4);
        return { kind: "part", sym: "XFMR_CT", pins: ["1", "2", "5", "4", "3"], value: "Transformer",
                 model: { name: "XFMR_CT", pins: ["p1", "p2", "s1", "ct", "s2"], body: [
                     `L1 p1 p2 ${spiceValue(e.inductance)}`, `L2 s1 ct ${l2}`, `L3 ct s2 ${l2}`,
                     `K12 L1 L2 ${k}`, `K13 L1 L3 ${k}`, `K23 L2 L3 ${k}`] } };
    }
    // posts: each pole's common, normally closed and normally open contacts, then the coil.
    // relay pins: x1 common, x2 NC, x4 NO for pole x; A1, A2 coil, which may be swapped
    if (C === RelayElm) {
        const poles = e.poleCount();
        if (poles > 2)
            return null;
        const pins: string[] = [];
        for (let p = 1; p <= poles; p++)
            pins.push(p + "1", p + "2", p + "4");
        return { kind: "part", sym: "RELAY" + poles, pins: [...pins, "A1", "A2"], swap: [3 * poles, 3 * poles + 1],
                 value: poles === 1 ? "Relay_SPDT" : "Relay_DPDT" };
    }
    // posts: plate, grid, cathode.  two to an ECC83, whose heater is wired for 6.3V
    if (C === TriodeElm)
        return { kind: "part", sym: "TRIODE", pins: ["A", "G", "K"], value: "ECC83",
                 supply: "+6.3V", supplyPins: { F1: "+6.3V", F2: "GND" } };
    // a 555 without reset or ground posts has reset tied to Vcc and is grounded internally
    if (C === TimerElm) {
        const n = ce.getPostCount();
        const ties: PinTie[] = [];
        if (n < 7)
            ties.push({ pin: "~{RST}", post: 3 });
        if (n < 8)
            ties.push({ pin: "GND", power: "GND" });
        return { kind: "part", sym: "555", value: "NE555",
                 pins: ["DISCH", "TRIG", "THRES", "VCC", "CONT", "OUT", "~{RST}", "GND"].slice(0, n), ties };
    }

    // logic.  the 74xx parts have active-low set/reset, so active-high ones can't be exported
    // a gate with an unusual number of inputs goes in the next bigger part, with the
    // spare inputs tied where they don't change the output
    const sizes = GATES.get(C);
    if (sizes !== undefined) {
        const size = sizes.find(sz => sz[0] >= e.inputCount);
        if (size === undefined)
            return null;
        const [count, sym, out] = size;
        const spare = (C === AndGateElm || C === NandGateElm) ? railName(e.highVoltage) : "GND";
        const pins: string[] = Array(e.inputCount).fill("@in");
        const ties = Array.from({ length: count - e.inputCount }, () => ({ pin: "@in", power: spare }));
        return logic(sym, [...pins, out ?? "@out"], e.highVoltage, { swap: pins.map((_, i) => i), ties });
    }
    // a display in logic mode lights segments on a high input, like a common cathode one
    if (C === SevenSegElm) {
        if (e.useBus() || e.baseSegmentCount !== 7 || e.extraSegment === SevenSegElm.ES_COLON)
            return null;
        const anode = e.diodeDirection === -1;
        const common = anode ? "CA" : "CC";
        const pins = ["A", "B", "C", "D", "E", "F", "G"];
        if (e.extraSegment === SevenSegElm.ES_DP)
            pins.push("DP");
        // the display has two common pins
        const ties: PinTie[] = e.diodeDirection === 0 ?
            [{ pin: "3", power: "GND" }, { pin: "8", power: "GND" }] : [{ pin: "8", post: pins.length }];
        if (e.diodeDirection !== 0)
            pins.push("3");
        return { kind: "part", sym: anode ? "7SEG_CA" : "7SEG_CC", pins, ties,
                 value: anode ? "SA39-11EWA" : "SC39-11EWA" };
    }
    if (C === InverterElm)
        return logic("INV", ["@in", "@out"], e.highVoltage);
    if (C === InvertingSchmittElm || C === SchmittElm)
        return logic(C === SchmittElm ? "SCHMITT" : "SCHMITTINV", ["@in", "@out"], e.logicOnLevel);
    // posts: D, Q, ~Q, clock, then reset and set
    if (C === DFlipFlopElm) {
        const pins = ["D", "Q", "~{Q}", "C", "~{R}", "~{S}"].slice(0, ce.getPostCount());
        // the 4013 has active-high set and reset
        if (e.hasReset() && !e.invertSetReset()) {
            const ties: PinTie[] = e.hasSet() ? [] : [{ pin: "S", power: "GND" }];
            return logic("DFF_H", pins.map(p => p.replace(/~\{([RS])\}/, "$1")), e.highVoltage, { ties });
        }
        const vcc = railName(e.highVoltage);
        const ties: PinTie[] = [];
        if (!e.hasReset())
            ties.push({ pin: "~{R}", power: vcc });
        if (!e.hasSet())
            ties.push({ pin: "~{S}", power: vcc });
        return logic("DFF", pins, e.highVoltage, { ties });
    }
    // posts: J, clock, K, Q, ~Q, then reset.  the 74107 triggers on the falling edge
    if (C === JKFlipFlopElm) {
        if (e.positiveEdgeTriggered() || (e.hasReset() && !e.invertReset()))
            return null;
        const ties: PinTie[] = e.hasReset() ? [] : [{ pin: "~{R}", power: railName(e.highVoltage) }];
        return logic("JKFF", ["J", "C", "K", "Q", "~{Q}", "~{R}"].slice(0, ce.getPostCount()), e.highVoltage, { ties });
    }
    if (C === CounterElm)
        return counter(e);
    if (C === LatchElm)
        return latch(e);
    if (C === VCVSElm || C === VCCSElm)
        return behavioralSource(e, C === VCVSElm);
    // a controlled source is a behavioral source too.  pin 1 is the voltage's +, and where
    // the current comes in
    if (C === ControlledVoltageElm || C === ControlledCurrentElm)
        return { kind: "part", sym: "BSOURCE", pins: C === ControlledVoltageElm ? ["2", "1"] : ["1", "2"],
                 value: e.exprString, props: {},
                 controlled: C === ControlledVoltageElm ? "v" : "i" };
    return null;
}

// posts: clock, reset, then the outputs, most significant first, then up/down
function counter(e: any): PartDesc | null {
    const bits: number = e.bits;
    if (e.useBus() || e.hasUpDown() || bits > 12)
        return null;
    const mod = e.modulus || (1 << bits);
    const fall = e.negativeEdgeTriggered(), lowReset = e.invertreset;
    const outs = (name: (i: number) => string) => Array.from({ length: bits }, (_, j) => name(bits - 1 - j));
    const vcc = railName(e.highVoltage);
    // the 74HC161 and 160 count on the rising edge, with an active-low reset
    if (!fall && lowReset && bits <= 4 && (mod === 1 << bits || (mod === 10 && bits === 4)))
        return logic(mod === 10 ? "COUNTER160" : "COUNTER161", ["CP", "~{MR}", ...outs(i => "Q" + i)], e.highVoltage, {
            ties: [{ pin: "~{PE}", power: vcc }, { pin: "CEP", power: vcc }, { pin: "CET", power: vcc },
                   ...[0, 1, 2, 3].map(i => ({ pin: "D" + i, power: "GND" }))] });
    if (lowReset)
        return null;
    // the 4520 and 4518 count on CK rising with Enable high, or on Enable falling with CK low
    if (bits <= 4 && (mod === 1 << bits || (mod === 10 && bits === 4)))
        return logic(mod === 10 ? "COUNTER4518" : "COUNTER4520", [fall ? "Enable" : "CK", "Reset", ...outs(i => "Q" + (i + 1))],
                     e.highVoltage, { ties: [{ pin: fall ? "CK" : "Enable", power: fall ? "GND" : vcc }] });
    // the 4040 counts on the falling edge
    if (fall && mod === 1 << bits)
        return logic("COUNTER4040", ["CLK", "Reset", ...outs(i => "Q" + i)], e.highVoltage);
    return null;
}

// posts: inputs, outputs, load, then reset, set and the enables
function latch(e: any): PartDesc | null {
    const bits: number = e.bits;
    if (e.useBus() || e.hasSet() || e.hasOutputEnable() || bits > 8 || (e.hasReset() && !e.resetActiveLow()))
        return null;
    const ins = Array.from({ length: bits }, (_, i) => "D" + i);
    const vcc = railName(e.highVoltage);
    // the 74HC373 is transparent while LE is high, and has no reset
    if (!e.isEdgeTriggered())
        return e.hasReset() ? null :
            logic("LATCH373", [...ins, ...ins.map((_, i) => "O" + i), "LE"], e.highVoltage, { ties: [{ pin: "OE", power: "GND" }] });
    const pins = [...ins, ...ins.map((_, i) => "Q" + i), "Cp", ...(e.hasReset() ? ["~{Mr}"] : [])];
    return logic(bits <= 4 ? "REG175" : "REG273", pins, e.highVoltage,
                 { ties: e.hasReset() ? [] : [{ pin: "~{Mr}", power: vcc }] });
}

// CircuitJS expression functions that ngspice's behavioral sources also have
const SPICE_FUNCS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
                             "abs", "exp", "log", "sqrt", "floor", "ceil", "min", "max", "pi"]);

// a CircuitJS expression as an ngspice one, with input i's voltage read from inputs[i], or
// null if it uses something ngspice doesn't have (the last output, the time step...)
export function spiceExpr(expr: string, inputs: string[]): string | null {
    let ok = true;
    const out = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, id => {
        const k = id.length === 1 ? id.toLowerCase().charCodeAt(0) - 97 : -1;
        if (id === "t")
            return "time";
        if (k >= 0 && k < inputs.length)
            return "V(" + inputs[k] + ")";
        if (!SPICE_FUNCS.has(id))
            ok = false;
        return id;
    });
    return ok ? out : null;
}

// a VCVS or VCCS is a behavioral source; its inputs are read by net name.
// posts: inputs, then +, -
function behavioralSource(e: any, voltage: boolean): PartDesc {
    const n: number = e.inputCount;
    const expr: string = e.exprString;
    return { kind: "part", sym: "BSOURCE", pins: [...Array(n).fill(null), "1", "2"], value: expr,
             inputs: Array.from({ length: n }, (_, i) => i),
             inputProps: nets => {
                 const x = nets && spiceExpr(expr, nets);
                 return x === null ? { "Sim.Enable": "0" } :
                     { "Sim.Device": "SPICE", "Sim.Params": `type="B" model="${voltage ? "v" : "i"}=${x}"` };
             } };
}

// a capacitor's or inductor's sim fields: KiCad's own, with its initial condition, or with a
// series resistance (which SPICE's don't have), a model of the two
function reactance(kind: "C" | "L", value: number, ic: number, r: number): { props?: Record<string, string>; model?: SpiceModel } {
    if (r > 0)
        return { model: { name: kind, pins: ["a", "b"],
                          body: [`${kind}1 a m ${spiceValue(value)} IC=${simNum(ic)}`, `R1 m b ${spiceValue(r)}`] } };
    return { props: { "Sim.Device": kind, "Sim.Params": `${kind.toLowerCase()}=${simNum(value)} ic=${simNum(ic)}` } };
}

// a switch as it's set: a resistance between each pair of its pins that's closed (a small
// one if it has none), and an open circuit's between the rest
function switchModel(pins: string[], pairs: [string, string, boolean][], resistance: number): SpiceModel {
    return { name: "SW", pins, body: pairs.map(([a, b, closed], i) =>
        `R${i + 1} ${a} ${b} ${closed ? spiceValue(resistance > 0 ? resistance : 1e-6) : "1T"}`) };
}

// SPICE model parameters as KiCad writes them
function simParams(spice: string): string {
    return spice.replace(/\b([A-Z]+)=/g, (_, name) => name.toLowerCase() + "=");
}

// the library symbol's fields saying how to simulate it
function simFields(sym: KicadSymbol): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const m of sym.def.matchAll(/\(property "(Sim\.\w+)" "((?:[^"\\]|\\.)*)"/g))
        fields[m[1]] = m[2].replace(/\\(.)/g, "$1");
    return fields;
}

// symbols made by chipBox, with their outlines (left, bottom, right, top in symbol coordinates)
const boxSymbols = new WeakMap<KicadSymbol, number[]>();

// a chip with no KiCad part is a box like the one CircuitJS draws, with its pin names
function chipBox(ce: ChipElm): PartDesc | null {
    const pins = ce.pins.slice(0, ce.getPostCount());
    // symbol coordinates (mm, y up) from post 0
    const o = ce.getPost(0)!;
    const mm = (x: number, y: number): [number, number] =>
        [round3((x - o.x) / PIXELS_PER_UNIT * MM_PER_UNIT), round3(-(y - o.y) / PIXELS_PER_UNIT * MM_PER_UNIT)];
    const [x0, y0] = mm(ce.rectPointsX[0], ce.rectPointsY[0]);
    const [x1, y1] = mm(ce.rectPointsX[2], ce.rectPointsY[2]);
    let [l, r, b, t] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
    // each pin's end, and its direction toward the body
    const ats = pins.map((_, j) => mm(ce.getPost(j)!.x, ce.getPost(j)!.y));
    const angles = ats.map(at => at[0] <= l ? 0 : at[0] >= r ? 180 : at[1] >= t ? 270 : 90);
    // a bus pin is a pin for each line, 2.54mm apart, going down a side or across the top or
    // bottom, which moves the pins after it along and stretches the box
    const stretch = [0, 0];
    for (const side of [[0, 180], [90, 270]]) {
        const across = side[0] === 0;
        for (const angle of side) {
            const along = (j: number) => across ? -ats[j][1] : ats[j][0];
            const order = pins.map((_, j) => j).filter(j => angles[j] === angle).sort((i, j) => along(i) - along(j));
            // a bus's lines are all at one place in the order
            let shift = 0;
            for (let k = 0; k !== order.length;) {
                const pos = along(order[k]);
                let extra = 0;
                for (; k !== order.length && along(order[k]) === pos; k++) {
                    const j = order[k], move = shift + pins[j].busZ * 2.54;
                    if (across)
                        ats[j] = [ats[j][0], round3(ats[j][1] - move)];
                    else
                        ats[j] = [round3(ats[j][0] + move), ats[j][1]];
                    extra = Math.max(extra, pins[j].busZ * 2.54);
                }
                shift += extra;
            }
            stretch[across ? 0 : 1] = Math.max(stretch[across ? 0 : 1], shift);
        }
    }
    b = round3(b - stretch[0]);
    r = round3(r + stretch[1]);
    pins.forEach((_, j) => {
        if (angles[j] === 90)
            ats[j] = [ats[j][0], round3(ats[j][1] - stretch[0])];
        if (angles[j] === 180)
            ats[j] = [round3(ats[j][0] + stretch[1]), ats[j][1]];
    });
    const sym: KicadSymbol = { libId: "", ref: "U", footprint: "", pins: {}, names: {}, types: {}, units: {}, angles: {}, def: "" };
    const pinDefs: string[] = [];
    pins.forEach((p, j) => {
        const num = String(j + 1);
        const at = ats[j], angle = angles[j];
        // the distance to the body
        const len = round3(angle === 0 ? l - at[0] : angle === 180 ? at[0] - r : angle === 270 ? at[1] - t : b - at[1]);
        const text = p.busWidth > 1 ? p.text + p.busZ : p.text;
        const name = p.lineOver ? "~{" + text + "}" : text;
        const type = p.output ? "output" : "input";
        const shape = p.bubble ? (p.clock ? "inverted_clock" : "inverted") : p.clock ? "clock" : "line";
        sym.pins[num] = at;
        sym.names[num] = name;
        sym.types[num] = type;
        sym.units[num] = 1;
        sym.angles[num] = angle;
        pinDefs.push(`(pin ${type} ${shape} (at ${at[0]} ${at[1]} ${angle}) (length ${len}) ` +
                     `(name ${quote(name)} (effects (font (size 1.27 1.27)))) (number ${quote(num)} (effects (font (size 1.27 1.27)))))`);
    });
    const value = ce.getChipName().replace(/\s+/g, " ");
    const body = `(rectangle (start ${l} ${b}) (end ${r} ${t}) (stroke (width 0.254) (type default)) (fill (type background)))`;
    const font = "(effects (font (size 1.27 1.27)) (justify left))";
    const hidden = "(effects (font (size 1.27 1.27)) (hide yes))";
    const rest = `(pin_names (offset 0.508)) (exclude_from_sim yes) (in_bom yes) (on_board yes)\n` +
        `\t\t\t(property "Reference" "U" (at ${l} ${round3(t + 1.27)} 0) ${font})\n` +
        `\t\t\t(property "Value" ${quote(value)} (at ${l} ${round3(b - 1.27)} 0) ${font})\n` +
        `\t\t\t(property "Footprint" "" (at 0 0 0) ${hidden})\n` +
        `\t\t\t(property "Datasheet" "" (at 0 0 0) ${hidden})\n` +
        `\t\t\t(property "Description" "CircuitJS chip" (at 0 0 0) ${hidden})\n`;
    const units = `\t\t\t(symbol "@_0_1" ${body})\n\t\t\t(symbol "@_1_1"\n` +
        pinDefs.map(d => "\t\t\t\t" + d + "\n").join("") + "\t\t\t)\n";
    // the same layout always gets the same name
    const base = value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Chip";
    const name = base + "_" + hashString(rest + units);
    sym.libId = "CircuitJS:" + name;
    sym.def = `(symbol ${quote(sym.libId)} ${rest}${units.replace(/@/g, name)}\t\t)`;
    boxSymbols.set(sym, [l, b, r, t]);
    return { kind: "part", sym: "", symbol: sym, pins: pins.map((_, j) => String(j + 1)), value };
}

// relay coils and contacts linked by the same label are the units of one relay: its coils,
// then its contacts.  posts: the coil's or contact's ends, which may be swapped
function relayGroups(elms: CircuitElm[], descs: (Desc | null)[]): void {
    const groups = new Map<string, number[]>();
    elms.forEach((ce, i) => {
        const C = ce.getDumpClass();
        if (C === RelayCoilElm || C === RelayContactElm) {
            const label = (ce as any).label;
            groups.set(label, [...(groups.get(label) ?? []), i]);
        }
    });
    for (const [label, idx] of groups) {
        const coils = idx.filter(i => elms[i].getDumpClass() === RelayCoilElm);
        const contacts = idx.filter(i => elms[i].getDumpClass() === RelayContactElm);
        const kinds = [...coils.map(() => "coil" as const),
                       ...contacts.map(i => (elms[i] as any).isNormallyClosed() ? "NC" as const : "NO" as const)];
        const sym = relaySymbol(kinds);
        const value = coils.some(i => RelayCoilElm.isLatchingType((elms[i] as any).type)) ? "Latching relay" : "Relay";
        [...coils, ...contacts].forEach((i, k) => {
            const unit = k + 1;
            descs[i] = { kind: "part", sym: "", symbol: sym, pins: unitPins(sym, unit), swap: [0, 1],
                         value, group: { key: "relay:" + label, unit } };
        });
    }
}

// a box putting out the lines of a bus, line 0 at the top
function lineBox(title: string, width: number): KicadSymbol {
    const name = title.replace(/\s+/g, "_") + "_" + width;
    const sym: KicadSymbol = { libId: "CircuitJS:" + name, ref: "U", footprint: "", pins: {}, names: {}, types: {},
                               units: {}, angles: {}, def: "" };
    const t = 2.54, b = round3(-2.54 * width);
    const pinDefs = Array.from({ length: width }, (_, i) => {
        const num = String(i + 1), y = round3(-2.54 * i);
        sym.pins[num] = [7.62, y];
        sym.names[num] = String(i);
        sym.types[num] = "output";
        sym.units[num] = 1;
        sym.angles[num] = 180;
        return `\t\t\t\t(pin output line (at 7.62 ${y} 180) (length 2.54) ` +
               `(name "${i}" (effects (font (size 1.27 1.27)))) (number "${num}" (effects (font (size 1.27 1.27)))))\n`;
    });
    const font = "(effects (font (size 1.27 1.27)) (justify left))";
    const hidden = "(effects (font (size 1.27 1.27)) (hide yes))";
    sym.def = `(symbol ${quote(sym.libId)} (pin_names (offset 0.508)) (exclude_from_sim yes) (in_bom yes) (on_board yes)\n` +
        `\t\t\t(property "Reference" "U" (at -5.08 ${round3(t + 1.27)} 0) ${font})\n` +
        `\t\t\t(property "Value" ${quote(title)} (at -5.08 ${round3(b - 1.27)} 0) ${font})\n` +
        `\t\t\t(property "Footprint" "" (at 0 0 0) ${hidden})\n` +
        `\t\t\t(property "Datasheet" "" (at 0 0 0) ${hidden})\n` +
        `\t\t\t(property "Description" "CircuitJS ${title.toLowerCase()}" (at 0 0 0) ${hidden})\n` +
        `\t\t\t(symbol "${name}_0_1" (rectangle (start -5.08 ${t}) (end 5.08 ${b}) ` +
        `(stroke (width 0.254) (type default)) (fill (type background))))\n` +
        `\t\t\t(symbol "${name}_1_1"\n` + pinDefs.join("") + "\t\t\t)\n\t\t)";
    return sym;
}

const relaySymbols = new Map<string, KicadSymbol>();

// a relay with these units, drawn as KiCad draws a relay with separate coil and contact
// units.  coil pins are A1, A2, then B1, B2 and so on; contact n's pins are n3, n4 if
// normally open and n1, n2 if normally closed
function relaySymbol(kinds: ("coil" | "NO" | "NC")[]): KicadSymbol {
    const name = "Relay_" + kinds.map(k => k === "coil" ? "Coil" : k).join("_");
    const cached = relaySymbols.get(name);
    if (cached)
        return cached;
    const sym: KicadSymbol = { libId: "CircuitJS:" + name, ref: "K", footprint: "", pins: {}, names: {}, types: {},
                               units: {}, angles: {}, def: "" };
    const line = (pts: number[][], width = 0) =>
        `(polyline (pts ${pts.map(p => `(xy ${p[0]} ${p[1]})`).join(" ")}) ` +
        `(stroke (width ${width}) (type default)) (fill (type none)))`;
    const pin = (num: string, y: number) =>
        `(pin passive line (at 0 ${y} ${y > 0 ? 270 : 90}) (length 2.54) ` +
        `(name "" (effects (font (size 1.27 1.27)))) (number ${quote(num)} (effects (font (size 1.27 1.27)))))`;
    const coil = [`(rectangle (start -3.175 1.905) (end 3.175 -1.905) (stroke (width 0.254) (type default)) (fill (type background)))`,
                  line([[-2.54, -1.905], [2.54, 1.905]], 0.254), line([[0, 5.08], [0, 1.905]]), line([[0, -5.08], [0, -1.905]])];
    // the dashes are the link to the coil
    const link = [line([[-3.175, 0], [-2.54, 0]], 0.254), line([[-1.905, 0], [-1.27, 0]], 0.254)];
    const no = [...link, line([[0, 2.54], [-1.905, -3.81]], 0.508), line([[0, 2.54], [0, 5.08]]),
                line([[0, -5.08], [0, -2.54], [-0.635, -3.175], [0, -3.81]])];
    // a normally closed contact's blade rests against a ledge
    const nc = [...link, line([[0, -2.54], [1.905, 3.81]], 0.508), line([[0, -2.54], [0, -5.08]]),
                line([[0, 5.08], [0, 2.54], [1.524, 2.54]])];
    let coilCount = 0, contactCount = 0;
    const units = kinds.map((k, i) => {
        const unit = i + 1;
        const nums = k === "coil" ? [0, 1].map(j => String.fromCharCode(65 + coilCount) + (j + 1)) :
            (k === "NO" ? ["3", "4"] : ["1", "2"]).map(j => (contactCount + 1) + j);
        if (k === "coil")
            coilCount++;
        else
            contactCount++;
        nums.forEach((n, j) => {
            sym.pins[n] = [0, j ? -7.62 : 7.62];
            sym.names[n] = "";
            sym.types[n] = "passive";
            sym.units[n] = unit;
            sym.angles[n] = j ? 90 : 270;
        });
        const body = k === "coil" ? coil : k === "NO" ? no : nc;
        return `\t\t\t(symbol "${name}_${unit}_1"\n` + [...body, pin(nums[0], 7.62), pin(nums[1], -7.62)]
            .map(d => "\t\t\t\t" + d + "\n").join("") + "\t\t\t)\n";
    });
    const font = "(effects (font (size 1.27 1.27)) (justify left))";
    const hidden = "(effects (font (size 1.27 1.27)) (hide yes))";
    sym.def = `(symbol ${quote(sym.libId)} (pin_names (hide yes)) (exclude_from_sim yes) (in_bom yes) (on_board yes)\n` +
        `\t\t\t(property "Reference" "K" (at 5.08 2.54 0) ${font})\n` +
        `\t\t\t(property "Value" "Relay" (at 5.08 0 0) ${font})\n` +
        `\t\t\t(property "Footprint" "" (at 0 0 0) ${hidden})\n` +
        `\t\t\t(property "Datasheet" "" (at 0 0 0) ${hidden})\n` +
        `\t\t\t(property "Description" "CircuitJS relay" (at 0 0 0) ${hidden})\n` +
        units.join("") + "\t\t)";
    relaySymbols.set(name, sym);
    return sym;
}

function round3(v: number): number {
    return Math.round(v * 1000) / 1000 + 0;
}

function hashString(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i !== s.length; i++)
        h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, "0");
}

// symbol orientation: rotation (degrees counterclockwise) and optional mirror about the x axis
interface Orient { angle: number; mirror: boolean; }
const ORIENTS: Orient[] = [];
for (const mirror of [false, true])
    for (const angle of [0, 90, 180, 270])
        ORIENTS.push({ angle, mirror });

// offset on the sheet (grid units, y down) of a point in symbol coordinates (mm, y up)
// (KiCad rotates first, then mirrors)
export function symbolOffset(p: [number, number], o: Orient): Pt {
    const x = p[0] / MM_PER_UNIT, y = p[1] / MM_PER_UNIT;
    const c = Math.round(Math.cos(o.angle * Math.PI / 180)), s = Math.round(Math.sin(o.angle * Math.PI / 180));
    const sy = -(x * s + y * c);
    return { x: x * c - y * s, y: o.mirror ? -sy : sy };
}

// symbol position offsets to try, nearest first, by ring
const SHIFTS: { x: number; y: number; ring: number }[] = [];
for (let ring = 0; ring <= 4; ring++)
    for (let x = -ring; x <= ring; x++)
        for (let y = -ring; y <= ring; y++)
            if (Math.max(Math.abs(x), Math.abs(y)) === ring)
                SHIFTS.push({ x, y, ring });

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
        if (ra !== rb)
            this.parent.set(ra, rb);
    }
}

function ptKey(p: Pt): string {
    return Math.round(p.x * 1000) / 1000 + "," + Math.round(p.y * 1000) / 1000 + (p.z ? "#" + p.z : "");
}

function samePt(a: Pt, b: Pt): boolean {
    return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

// true if q lies on segment a-b but not at either end
function onInterior(q: Pt, a: Pt, b: Pt): boolean {
    if (samePt(q, a) || samePt(q, b))
        return false;
    const cross = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
    if (Math.abs(cross) > EPS)
        return false;
    const dot = (q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y);
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return dot > 0 && dot < len2;
}

// a symbol's body, estimated as the box its pin ends enclose, less a margin.  null for
// parts whose pins are in a line (a resistor), which have nothing to go around
interface Rect { x0: number; y0: number; x1: number; y1: number; }
function bodyRect(pinPts: Pt[]): Rect | null {
    const xs = pinPts.map(p => p.x), ys = pinPts.map(p => p.y);
    const r = { x0: Math.min(...xs) + 1, y0: Math.min(...ys) + 1, x1: Math.max(...xs) - 1, y1: Math.max(...ys) - 1 };
    return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
}

// does the horizontal or vertical segment a-b pass through the inside of r?
function crossesRect(a: Pt, b: Pt, r: Rect | null): boolean {
    if (r === null)
        return false;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    return x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1;
}

// the direction a placed pin points away from its symbol's body
function pinOut(sym: KicadSymbol, pin: string, o: Orient): Pt {
    const a = sym.angles[pin] * Math.PI / 180;
    const d = symbolOffset([-Math.cos(a) * MM_PER_UNIT, -Math.sin(a) * MM_PER_UNIT], o);
    return { x: Math.round(d.x), y: Math.round(d.y) };
}

// unit vector along the nearer axis to d
function axisDir(d: Pt): Pt {
    return Math.abs(d.x) > Math.abs(d.y) ? { x: Math.sign(d.x), y: 0 } : { x: 0, y: Math.sign(d.y) || 1 };
}

function quote(s: string): string {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

function num(u: number): string {
    return String(parseFloat((u * MM_PER_UNIT).toFixed(4)));
}

function uuid(): string {
    if (typeof crypto !== "undefined" && (crypto as any).randomUUID)
        return (crypto as any).randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
}

interface Seg { a: Pt; b: Pt; net: string; group: number; }

// buckets items by the grid cells their bounding boxes touch, so conflict checks only
// look at nearby points and wires
class Grid<T> {
    private static readonly CELL = 8;
    private cells = new Map<string, T[]>();

    private range(a: Pt, b: Pt, f: (k: string) => void): void {
        const c = Grid.CELL;
        const x0 = Math.floor((Math.min(a.x, b.x) - EPS) / c), x1 = Math.floor((Math.max(a.x, b.x) + EPS) / c);
        const y0 = Math.floor((Math.min(a.y, b.y) - EPS) / c), y1 = Math.floor((Math.max(a.y, b.y) + EPS) / c);
        for (let x = x0; x <= x1; x++)
            for (let y = y0; y <= y1; y++)
                f(x + "," + y);
    }

    add(a: Pt, b: Pt, item: T): void {
        this.range(a, b, k => {
            const l = this.cells.get(k);
            if (l)
                l.push(item);
            else
                this.cells.set(k, [item]);
        });
    }

    // items whose boxes may touch the box from a to b (possibly more than once)
    near(a: Pt, b: Pt): T[] {
        const out: T[] = [];
        this.range(a, b, k => {
            const l = this.cells.get(k);
            if (l)
                out.push(...l);
        });
        return out;
    }
}
// a subckt: its name (made unique by its contents), pins and lines
export interface SpiceModel { name: string; pins: string[]; body: string[]; }

function modelText(m: SpiceModel): string {
    return [`.subckt ${m.name} ${m.pins.join(" ")}`, ...m.body, `.ends ${m.name}`].join("\n") + "\n";
}

// the project's library of models, next to its schematics
function modelLibrary(project: string): string {
    return project + ".lib";
}

// a model's name, with a hash of its contents so different ones don't clash
function uniqueModel(m: SpiceModel): SpiceModel {
    let h = 0x811c9dc5;
    for (const c of modelText(m))
        h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return { ...m, name: m.name + "_" + h.toString(16).padStart(8, "0") };
}

interface PlacedSymbol {
    sym: KicadSymbol; ref: string; unit: number; value: string; at: Pt; orient: Orient;
    props?: Record<string, string>;
    // its model, in the project's library
    model?: string;
    // the unit's pin numbers and where they ended up
    pins: string[]; pinPts: Pt[];
}

// a logic package being filled with gates, one per unit
interface Package { sym: KicadSymbol; ref: string; value: string; supply: string; supplyPins?: Record<string, string>; used: number; }

// a symbol's units: the ones that hold gates, and the one with the supply pins (0 if none)
function symbolUnits(sym: KicadSymbol): { units: number[]; powerUnit: number } {
    const all = new Set(Object.values(sym.units));
    let powerUnit = 0;
    for (const u of all)
        if (u !== 0 && Object.keys(sym.units).every(n => sym.units[n] !== u || sym.types[n] === "power_in"))
            powerUnit = u;
    const units = [...all].filter(u => u !== 0 && u !== powerUnit).sort((a, b) => a - b);
    return { units: units.length ? units : [1], powerUnit };
}

// the pin numbers in a unit, including those common to all units
function unitPins(sym: KicadSymbol, unit: number): string[] {
    return Object.keys(sym.units).filter(n => sym.units[n] === unit || sym.units[n] === 0);
}

// resolve pin names (and "@in"/"@out", and "@pas" for the unit's next passive pin) to the
// unit's pin numbers
function resolvePins(sym: KicadSymbol, unit: number, names: string[]): string[] {
    const pins = unitPins(sym, unit);
    const inputs = pins.filter(n => sym.types[n] === "input").sort((a, b) => sym.pins[b][1] - sym.pins[a][1]);
    const passive = pins.filter(n => sym.types[n] === "passive");
    let nextInput = 0, nextPassive = 0;
    return names.map(name => {
        if (name === "@in")
            return inputs[nextInput++];
        if (name === "@pas")
            return passive[nextPassive++];
        if (name === "@out")
            return pins.find(n => sym.types[n] === "output")!;
        if (pins.includes(name))
            return name;
        const n = pins.find(n => sym.names[n] === name);
        if (n === undefined)
            throw new Error("no pin " + name + " in " + sym.libId);
        return n;
    });
}

export interface KicadExport { text: string; warnings: string[]; }

// a net name to put at a point that isn't a labeled node: a subcircuit's pin, or any net in
// a subcircuit saved without a layout
interface NetTag { p: Point; name: string; kind: "label" | "hier" | "power"; dir: Pt; }

interface SheetOptions {
    // labeled nodes that are the sheet's pins, so get hierarchical labels
    hier?: Set<string>;
    tags?: NetTag[];
    // the simulation's time step, for random sources
    timeStep?: number;
}

// a subcircuit's box on its parent sheet
interface PlacedSheet {
    model: any; uuid: string; name: string; x0: number; y0: number; x1: number; y1: number;
    pins: { name: string; p: Pt; angle: number }[];
}

// what writing a sheet needs from the rest of the project: each place the sheet is used
// (its path) with the reference designators its parts get there, the page number of each
// subcircuit box in each place, and the subcircuits' file names
interface WriteContext {
    project: string; uuid: string; root: boolean;
    paths: { path: string; refs: Map<string, string> }[];
    pages: Map<string, { path: string; page: number }[]>;
    fileOf: (model: any) => string;
}

export class KicadExporter {
    private uf = new UnionFind();
    // connection points (wire ends, pins, labels) with their nets
    private points: { p: Pt; net: string }[] = [];
    private pointGrid = new Grid<{ p: Pt; net: string }>();
    private segs: Seg[] = [];
    private segGrid = new Grid<Seg>();
    private groupCount = 0;
    private symbols: PlacedSymbol[] = [];
    private labels: { p: Pt; name: string; angle: number }[] = [];
    private hlabels: { p: Pt; name: string; angle: number }[] = [];
    private powers: { p: Pt; name: string; angle: number }[] = [];
    private powerSyms: PlacedSymbol[] = [];
    sheets: PlacedSheet[] = [];
    private hier: Set<string>;
    private tags: NetTag[];
    private texts: { p: Pt; text: string }[] = [];
    private refCounts = new Map<string, number>();
    private netNames = new Map<string, string>();
    // reference designator given to each exported part, and the pin number for each post
    refs = new Map<CircuitElm, string>();
    pinMap = new Map<CircuitElm, (string | null)[]>();
    private packages = new Map<string, Package>();
    private allPackages: Package[] = [];
    private groupRefs = new Map<string, string>();
    private buses: { a: Pt; b: Pt }[] = [];
    // bus entries, from a point on a bus to the end of a wire
    private busEntries: { a: Pt; b: Pt }[] = [];
    private originX = 0;
    private originY = 0;
    // properties set once every part has its reference
    private lateProps: (() => void)[] = [];
    private descs: (Desc | null)[] = [];
    // the models this sheet's parts use, by name
    models = new Map<string, string>();
    // how many exported posts are on each net, for dangles()
    private postCount: Map<string, number> | null = null;
    // each placed part's element and desc, for modelParts()
    private placedElms = new Map<CircuitElm, PartDesc>();
    warnings: string[] = [];

    private timeStep: number;
    // a subcircuit's sheet, whose nets' SPICE names depend on where it's used
    private sub: boolean;

    constructor(private elms: CircuitElm[], opts: SheetOptions = {}) {
        this.hier = opts.hier ?? new Set();
        this.tags = opts.tags ?? [];
        this.timeStep = opts.timeStep ?? 1e-6;
        this.sub = opts.hier !== undefined;
    }

    private toUnits(p: Point | Pt): Pt {
        const q: Pt = { x: (p.x - this.originX) / PIXELS_PER_UNIT + MARGIN, y: (p.y - this.originY) / PIXELS_PER_UNIT + MARGIN };
        if (p.z)
            q.z = p.z;
        return q;
    }

    private net(p: Pt): string {
        return this.uf.find("p" + ptKey(p));
    }

    private nextRef(prefix: string): string {
        const n = (this.refCounts.get(prefix) ?? 0) + 1;
        this.refCounts.set(prefix, n);
        return prefix + (prefix.startsWith("#") ? String(n).padStart(2, "0") : n);
    }

    // would a connection at p on net n short to something else?
    private pointConflicts(p: Pt, n: string): boolean {
        for (const q of this.pointGrid.near(p, p))
            if (q.net !== n && samePt(p, q.p))
                return true;
        for (const s of this.segGrid.near(p, p))
            if (s.net !== n && onInterior(p, s.a, s.b))
                return true;
        return false;
    }

    // would a new wire from a to b on net n short to something else?
    private segConflicts(a: Pt, b: Pt, n: string): boolean {
        for (const q of this.pointGrid.near(a, b))
            if (q.net !== n && onInterior(q.p, a, b))
                return true;
        return false;
    }

    private addPoint(p: Pt, net: string): void {
        const q = { p, net };
        this.points.push(q);
        this.pointGrid.add(p, p, q);
    }

    private addSeg(a: Pt, b: Pt, net: string, group: number): void {
        if (samePt(a, b))
            return;
        const s = { a, b, net, group };
        this.segs.push(s);
        this.segGrid.add(a, b, s);
        this.addPoint(a, net);
        this.addPoint(b, net);
    }

    // wire path from a symbol pin to its post: straight, or an L.  null if every way would
    // touch another net or cut across the symbol's body, so it gets net labels instead
    private stubPath(pin: Pt, post: Pt, n: string, body: Rect | null): Pt[] | null {
        const paths = (Math.abs(pin.x - post.x) < EPS || Math.abs(pin.y - post.y) < EPS) ? [[pin, post]] :
            [[pin, { x: post.x, y: pin.y }, post], [pin, { x: pin.x, y: post.y }, post]];
        for (const path of paths) {
            let ok = path.length === 2 || !this.pointConflicts(path[1], n);
            for (let i = 1; ok && i < path.length; i++)
                ok = !this.segConflicts(path[i - 1], path[i], n) && !crossesRect(path[i - 1], path[i], body);
            if (ok)
                return path;
        }
        return null;
    }

    // name a net at p with a label (or a power symbol for a supply), its text running toward
    private netTag(p: Pt, net: string, toward: Pt): void {
        const name = this.netNames.get(net)!;
        const d = axisDir({ x: toward.x - p.x, y: toward.y - p.y });
        const list = this.uf.find("P" + name) === net ? this.powers :
                     this.uf.find("H" + name) === net ? this.hlabels : this.labels;
        // a post may already have the name, from a ground or labeled node there
        if (list.some(l => l.name === name && samePt(l.p, p)))
            return;
        list.push({ p, name, angle: list === this.powers ? this.powerAngle(name, d) : this.labelAngle(d) });
    }

    // place everything; the result is written by write()
    export(): void {
        // bus wires and labels get their widths from what they connect to, as the simulator
        // finds them (the elements of a subcircuit's sheet haven't been through it)
        SimulationManager.prototype.detectBusWidthsForList.call({}, this.elms);
        const descs = this.descs = this.elms.map(ce => describe(ce, this.timeStep));
        relayGroups(this.elms, descs);
        // an ammeter whose current a controlled source reads is a 0V source, which SPICE
        // can measure the current through
        this.elms.forEach((ce, i) => {
            const d = descs[i];
            if (d?.kind !== "part" || !d.controlled)
                return;
            for (const r of (ce as any).engine.refs) {
                const m = r.current ? this.refElm(r.name) : undefined;
                if (m?.getDumpClass() === AmmeterElm)
                    descs[this.elms.indexOf(m)] = { kind: "part", sym: "VDC", pins: ["1", "2"], value: "0V",
                                                    props: { "Sim.Params": "dc=0" } };
            }
        });

        // with no ground and no rails, the simulator grounds the first voltage source's first
        // post (or a battery's), so put a ground there
        if (!this.sub && !this.elms.some(ce => ce.isGroundElm() || ce.isRailElm())) {
            const src = this.elms.find(ce => ce.isVoltageElm()) ?? this.elms.find(ce => ce.isBatteryElm());
            if (src) {
                const [a, b] = [src.getPost(0)!, src.getPost(1)!];
                const d = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? { x: Math.sign(a.x - b.x) || 1, y: 0 } :
                                                                        { x: 0, y: Math.sign(a.y - b.y) };
                this.tags = [...this.tags, { p: a, name: "GND", kind: "power", dir: d }];
            }
        }

        let minX = Infinity, minY = Infinity;
        for (let i = 0; i !== this.elms.length; i++) {
            const ce = this.elms[i];
            if (descs[i]?.kind === "ignore")
                continue;
            minX = Math.min(minX, ce.x, ce.x2);
            minY = Math.min(minY, ce.y, ce.y2);
        }
        if (minX === Infinity)
            minX = minY = 0;
        this.originX = Math.floor(minX / 8) * 8;
        this.originY = Math.floor(minY / 8) * 8;

        // nets as KiCad will see them: posts at the same point, wires, same-named labels and power
        for (let i = 0; i !== this.elms.length; i++) {
            const ce = this.elms[i], d = descs[i];
            if (d === null || d.kind === "ignore" || d.kind === "text")
                continue;
            if (d.kind === "wire") {
                for (let j = 1; j < d.pts.length; j++)
                    this.uf.union("p" + ptKey(this.toUnits(d.pts[j - 1])), "p" + ptKey(this.toUnits(d.pts[j])));
            // a bus wire's posts are each line at one end, then each at the other, and a
            // splitter's are each line of its bus, then each line's own post
            } else if (d.kind === "bus" || d.kind === "splitter") {
                for (let j = 0; j !== d.width; j++)
                    this.uf.union("p" + ptKey(this.toUnits(ce.getPost(j)!)), "p" + ptKey(this.toUnits(ce.getPost(j + d.width)!)));
            } else if (d.kind === "buslabel") {
                for (let j = 0; j !== d.width; j++)
                    this.uf.union("p" + ptKey(this.toUnits(ce.getPost(j)!)), "L" + d.name + j);
            } else if (d.kind === "power") {
                this.uf.union("p" + ptKey(this.toUnits(ce.getPost(0)!)), "P" + d.name);
            } else if (d.kind === "label") {
                this.uf.union("p" + ptKey(this.toUnits(ce.getPost(0)!)), (this.hier.has(d.name) ? "H" : "L") + d.name);
            } else if (d.kind === "sheet") {
                for (let j = 0; j !== ce.getPostCount(); j++)
                    this.uf.find("p" + ptKey(this.toUnits(ce.getPost(j)!)));
            } else {
                for (let j = 0; j !== ce.getPostCount(); j++)
                    if (d.pins[j] != null || d.inputs?.includes(j))
                        this.uf.find("p" + ptKey(this.toUnits(ce.getPost(j)!)));
                for (const t of d.ties ?? [])
                    if (t.power)
                        this.uf.find("P" + t.power);
                if (d.supply) {
                    this.uf.find("P" + d.supply);
                    this.uf.find("PGND");
                }
            }
        }
        const tagPrefix = { label: "L", hier: "H", power: "P" };
        for (const t of this.tags)
            this.uf.union("p" + ptKey(this.toUnits(t.p)), tagPrefix[t.kind] + t.name);
        const busNames = this.busGroups(descs);
        this.nameNets();

        // everything except the symbols' pins and stubs
        const postPoints: { p: Pt; net: string }[] = [];
        for (let i = 0; i !== this.elms.length; i++) {
            const ce = this.elms[i], d = descs[i];
            if (d === null) {
                const name = ce.getClassName().replace(/Elm$/, "");
                this.warnings.push(name);
                const c = this.toUnits({ x: (ce.x + ce.x2) / 2, y: (ce.y + ce.y2) / 2 });
                this.texts.push({ p: c, text: "?" + name });
                continue;
            }
            if (d.kind === "wire") {
                const g = this.groupCount++;
                for (let j = 1; j < d.pts.length; j++) {
                    const a = this.toUnits(d.pts[j - 1]), b = this.toUnits(d.pts[j]);
                    this.addSeg(a, b, this.net(a), g);
                }
            } else if (d.kind === "power" || d.kind === "label") {
                const p = this.toUnits(ce.getPost(0)!);
                this.addPoint(p, this.net(p));
                if (d.kind === "power")
                    this.powers.push({ p, name: d.name, angle: this.powerAngle(d.name, d.dir) });
                else if (this.hier.has(d.name))
                    this.hlabels.push({ p, name: d.name, angle: this.labelAngle(d.dir) });
                else
                    this.labels.push({ p, name: d.name, angle: this.labelAngle(d.dir) });
            } else if (d.kind === "bus") {
                for (let j = 1; j < d.pts.length; j++)
                    this.addBus(this.toUnits(d.pts[j - 1]), this.toUnits(d.pts[j]));
            } else if (d.kind === "buslabel") {
                const p = this.toUnits(ce.getPost(0)!);
                this.labels.push({ p: { x: p.x, y: p.y }, name: busNames.get(ce)!, angle: this.labelAngle(d.dir) });
            } else if (d.kind === "splitter") {
                this.placeSplitter(ce, d.width);
            } else if (d.kind === "text") {
                this.texts.push({ p: this.toUnits(ce), text: d.text });
            } else if (d.kind === "part" || d.kind === "sheet") {
                if (d.kind === "part" && d.inputs)
                    this.nameInputs(ce, d);
                if (d.kind === "part" && d.controlled)
                    this.nameRefs(ce, d);
                for (let j = 0; j !== ce.getPostCount(); j++) {
                    if (d.kind === "part" && d.pins[j] == null)
                        continue;
                    const p = this.toUnits(ce.getPost(j)!);
                    postPoints.push({ p, net: this.net(p) });
                }
                if (d.kind === "sheet")
                    this.placeSheet(ce, d.model);
            }
        }
        for (const t of this.tags) {
            const p = this.toUnits(t.p);
            this.addPoint(p, this.net(p));
            const list = t.kind === "power" ? this.powers : t.kind === "hier" ? this.hlabels : this.labels;
            list.push({ p, name: t.name, angle: t.kind === "power" ? this.powerAngle(t.name, t.dir) : this.labelAngle(t.dir) });
        }
        for (const q of postPoints)
            this.addPoint(q.p, q.net);

        for (let i = 0; i !== this.elms.length; i++) {
            const d = descs[i];
            if (d !== null && d.kind === "part")
                this.placePart(this.elms[i], d);
        }
        this.placePowerUnits();
        for (const f of this.lateProps)
            f();
        this.modelParts();
        this.trimBuses();
        this.labelBuses(busNames);

        this.fixFalseConnections();
        this.powerSyms = this.powers.map(p => ({
            sym: p.name === "GND" ? KICAD_SYMBOLS.GND : KICAD_SYMBOLS.VCC, ref: this.nextRef("#PWR"), unit: 1,
            value: p.name, at: p.p, orient: { angle: p.angle, mirror: false }, pins: ["1"], pinPts: [p.p],
        }));
    }

    // is an element's post connected to nothing, outside the element or in it?  the simulator
    // ties such a node to ground through a big resistor, and a model needs it tied too
    private dangles(ce: CircuitElm, j: number): boolean {
        if (this.postCount === null) {
            this.postCount = new Map();
            this.elms.forEach((e, k) => {
                if (this.descs[k] !== null && this.descs[k]!.kind !== "ignore")
                    for (let i = 0; i !== e.getPostCount(); i++) {
                        const net = this.net(this.toUnits(e.getPost(i)!));
                        this.postCount!.set(net, (this.postCount!.get(net) ?? 0) + 1);
                    }
            });
        }
        if (this.postCount.get(this.net(this.toUnits(ce.getPost(j)!))) !== 1)
            return false;
        for (let k = 0; k !== ce.getPostCount(); k++)
            if (k !== j && ce.getConnection(j, k))
                return false;
        return true;
    }

    // a model for each part KiCad has none for, from the SPICE export of the elements in it
    // (a 74HC00's gates, a relay's coil and contacts), with their posts on its pins
    private modelParts(): void {
        const parts = new Map<string, CircuitElm[]>();
        for (const [ce, d] of this.placedElms) {
            if (d.model || d.props?.["Sim.Device"] || d.controlled)
                continue;
            const ref = this.refs.get(ce)!;
            parts.set(ref, [...parts.get(ref) ?? [], ce]);
        }
        for (const [ref, elms] of parts) {
            // KiCad simulates resistors, capacitors and inductors from their values
            const syms = this.symbols.filter(s => s.ref === ref);
            if (/^[RCL]$/.test(syms[0].sym.ref) || syms.some(s => s.props?.["Sim.Device"]) ||
                    !this.placedElms.get(elms[0])!.spice && syms.some(s => simFields(s.sym)["Sim.Device"]))
                continue;
            const lines = elementsSpice(elms, this.timeStep);
            if (lines === null)
                continue;
            // each post's net is its pin's, or one of its own.  a pin connected to nothing is tied
            // to ground through a big resistor, as the simulator ties a node with no path to
            // ground (a 555's discharge, driven only by a current, would be singular)
            const pinName = (pin: string) => "n" + pin.replace(/[^A-Za-z0-9_]/g, "_");
            const used = new Set<string>(), rename = new Map<string, string>(), ties: string[] = [];
            elms.forEach((ce, k) => this.pinMap.get(ce)!.forEach((pin, j) => {
                if (pin === null)
                    return;
                if (!used.has(pin) && this.dangles(ce, j))
                    ties.push(`Rtie_${pinName(pin)} ${pinName(pin)} 0 100meg`);
                used.add(pin);
                rename.set(`e${k}_${j}`, pinName(pin));
            }));
            const body = [...lines.map(l => /^\s*[*.]/.test(l) ? l : l.replace(/\be\d+_\d+\b/g, n => rename.get(n) ?? n)), ...ties];
            const pins = [...used];
            const m = uniqueModel({ name: syms[0].sym.libId.split(":")[1].replace(/[^A-Za-z0-9_]/g, "_").toUpperCase(),
                                    pins: pins.map(pinName), body });
            this.models.set(m.name, modelText(m));
            for (const s of syms) {
                s.model = m.name;
                s.props = { ...s.props, "Sim.Device": "SUBCKT", "Sim.Name": m.name,
                            "Sim.Pins": pins.map(p => p + "=" + pinName(p)).join(" ") };
            }
        }
    }

    // label the nets a part reads by name, and give it the properties that name them.  on a
    // subcircuit's sheet the names depend on where it's used, so there are none
    private nameInputs(ce: CircuitElm, d: PartDesc): void {
        const names: string[] = [];
        for (const j of d.inputs!) {
            const p = this.toUnits(ce.getPost(j)!), net = this.net(p);
            const name = this.netNames.get(net)!;
            this.addPoint(p, net);
            this.netTag(p, net, { x: 2 * p.x - this.toUnits(ce).x, y: p.y });
            names.push(this.spiceNet(net));
        }
        d.props = { ...d.props, ...d.inputProps!(this.sub ? null : names) };
    }

    // a net's name in KiCad's SPICE netlist, which names a net with a local label after
    // the sheet it's on
    private spiceNet(net: string): string {
        const name = this.netNames.get(net)!;
        return name === "GND" ? "0" : this.uf.find("P" + name) === net ? name : "/" + name;
    }

    // the element a v() or i() reference names, as the simulator finds it
    private refElm(name: string): CircuitElm | undefined {
        return this.elms.find(ce => ce.getExprRefName() === name && ce.getPostCount() >= 2);
    }

    // a controlled source's v() references read a labeled node, or the voltage across a
    // named element (a voltmeter), whose nets get labels.  i() references read the current
    // through an ammeter, as a 0V source, so the properties wait until it has a reference
    private nameRefs(ce: CircuitElm, d: PartDesc): void {
        const engine = (ce as any).engine;
        const refs: ((() => string | null) | null)[] = engine.refs.map((r: any) => {
            if (this.sub)
                return null;
            // a labeled node wins over an element with the same name
            if (!r.current && this.elms.some(l => l.getDumpClass() === LabeledNodeElm && (l as any).text === r.name))
                return () => `V(${this.spiceNet(this.uf.find("L" + r.name))})`;
            const elm = this.refElm(r.name);
            if (elm === undefined)
                return null;
            if (r.current)
                return () => elm.getDumpClass() === AmmeterElm ? `I(${this.refs.get(elm)})` : null;
            const ps = [0, 1].map(j => this.toUnits(elm.getPost(j)!));
            const nets = ps.map((p, j) => {
                const net = this.net(p), q = ps[1 - j];
                // the label points away from the element
                this.addPoint(p, net);
                this.netTag(p, net, { x: 2 * p.x - q.x, y: 2 * p.y - q.y });
                return this.spiceNet(net);
            });
            return () => `V(${nets[0]},${nets[1]})`;
        });
        this.lateProps.push(() => {
            const f = engine.expr && spiceExpression(engine.expr, () => null, k => refs[k]?.() ?? null, this.timeStep);
            Object.assign(d.props!, f ? { "Sim.Device": "SPICE", "Sim.Params": `type="B" model="${d.controlled}=${f}"` } : { "Sim.Enable": "0" });
        });
    }

    // the supplies this sheet's power symbols name
    supplyNames(): string[] {
        return this.powerSyms.map(p => p.value).filter(n => n !== "GND");
    }

    // a power symbol only names a net, so KiCad's simulator needs a source for each supply.
    // put them in a row below everything else, with a big resistor to ground from each part of
    // the circuit that has no path to ground, as the simulator ties it
    addSupplySources(names: string[]): void {
        const supplies = names.map(n => ({ name: n, v: railVoltage(n) })).filter(s => s.v !== null);
        const floating = this.floating();
        if (supplies.length === 0 && floating.length === 0)
            return;
        let maxY = 0;
        this.points.forEach(q => maxY = Math.max(maxY, q.p.y));
        this.texts.forEach(t => maxY = Math.max(maxY, t.p.y));
        this.symbols.forEach(s => maxY = Math.max(maxY, s.at.y));
        this.sheets.forEach(s => maxY = Math.max(maxY, s.y1));
        const top = maxY + 6;
        this.texts.push({ p: { x: MARGIN, y: top }, text: "Supplies for simulation" });
        const orient = { angle: 0, mirror: false };
        supplies.forEach(({ name, v }, i) => {
            const at = { x: MARGIN + 2 + 10 * i, y: top + 10 };
            const pinPts = ["1", "2"].map(n => {
                const o = symbolOffset(KICAD_SYMBOLS.VDC.pins[n], orient);
                return { x: at.x + o.x, y: at.y + o.y };
            });
            this.symbols.push({ sym: KICAD_SYMBOLS.VDC, ref: this.nextRef("V"), unit: 1, value: kicadValue(v!, "V"), at, orient,
                                props: { "Sim.Params": "dc=" + simNum(v!) }, pins: ["1", "2"], pinPts });
            pinPts.forEach((p, k) => {
                const net = k === 0 ? name : "GND";
                this.addPoint(p, "P" + net);
                this.powerSyms.push({
                    sym: k === 0 ? KICAD_SYMBOLS.VCC : KICAD_SYMBOLS.GND, ref: this.nextRef("#PWR"), unit: 1, value: net, at: p,
                    orient: { angle: this.powerAngle(net, { x: 0, y: k === 0 ? -1 : 1 }), mirror: false }, pins: ["1"], pinPts: [p],
                });
            });
        });
        // the resistors' tops are labeled with the nets they tie, which get labels where they are
        floating.forEach(({ p, net }, i) => {
            const name = this.netNames.get(net)!;
            this.netTag(p, net, { x: p.x + 1, y: p.y });
            const at = { x: MARGIN + 2 + 10 * (supplies.length + i), y: top + 10 };
            const pinPts = ["1", "2"].map(n => {
                const o = symbolOffset(KICAD_SYMBOLS.R.pins[n], orient);
                return { x: at.x + o.x, y: at.y + o.y };
            });
            this.symbols.push({ sym: KICAD_SYMBOLS.R, ref: this.nextRef("R"), unit: 1, value: "100M", at, orient,
                                props: { "Sim.Device": "R", "Sim.Params": "r=100Meg" }, pins: ["1", "2"], pinPts });
            this.addPoint(pinPts[0], net);
            this.labels.push({ p: pinPts[0], name, angle: this.labelAngle({ x: 0, y: -1 }) });
            this.addPoint(pinPts[1], "PGND");
            this.powerSyms.push({ sym: KICAD_SYMBOLS.GND, ref: this.nextRef("#PWR"), unit: 1, value: "GND", at: pinPts[1],
                                  orient: { angle: this.powerAngle("GND", { x: 0, y: 1 }), mirror: false }, pins: ["1"], pinPts: [pinPts[1]] });
        });
    }

    // a post on each part of the circuit with no path to ground (a supply has one, through its
    // source, and a subcircuit's pins might): its first, in the order of the elements, which is
    // the node the simulator ties to ground
    private floating(): { p: Pt; net: string }[] {
        const uf = new UnionFind(), ground = this.uf.find("PGND");
        for (const p of this.powers)
            uf.union(this.uf.find("P" + p.name), ground);
        // what isn't exported (an output, a scope) doesn't connect anything
        const posts = this.elms.map((ce, k) => this.descs[k] === null || this.descs[k]!.kind === "ignore" ? [] :
            Array.from({ length: ce.getPostCount() }, (_, j) => this.toUnits(ce.getPost(j)!)));
        const nets = posts.map(ps => ps.map(p => this.net(p)));
        this.elms.forEach((ce, k) => {
            const n = nets[k];
            for (let i = 0; i !== n.length; i++) {
                // a 555's output is driven, though the simulator doesn't say so
                if (ce.hasGroundConnection(i) || ce.getDumpClass() === SubcircuitElm ||
                        ce.getDumpClass() === TimerElm && i === TimerElm.N_OUT)
                    uf.union(n[i], ground);
                for (let j = i + 1; j < n.length; j++)
                    if (ce.getConnection(i, j))
                        uf.union(n[i], n[j]);
            }
        });
        // a pin connected to nothing is fine on its own (or its model ties it, see modelParts())
        const count = new Map<string, number>();
        for (const net of nets.flat())
            count.set(uf.find(net), (count.get(uf.find(net)) ?? 0) + 1);
        const out: { p: Pt; net: string }[] = [];
        nets.forEach((n, k) => n.forEach((net, j) => {
            if (uf.find(net) !== uf.find(ground) && count.get(uf.find(net))! > 1) {
                out.push({ p: posts[k][j], net });
                uf.union(net, ground);
            }
        }));
        return out;
    }

    // this sheet's own reference designators, which become the project's in each place it's used
    localRefs(): string[] {
        return [...new Set([...this.symbols, ...this.powerSyms].map(s => s.ref))];
    }

    // a subcircuit's box: its pins are its posts, on whichever edge each is on.  the box
    // reaches the chip's outline on sides with no pins
    private placeSheet(ce: CircuitElm, model: any): void {
        const posts = Array.from({ length: ce.getPostCount() }, (_, j) => this.toUnits(ce.getPost(j)!));
        let x0 = Math.min(...posts.map(p => p.x)), x1 = Math.max(...posts.map(p => p.x));
        let y0 = Math.min(...posts.map(p => p.y)), y1 = Math.max(...posts.map(p => p.y));
        const edges = [(p: Pt) => p.x === x0, (p: Pt) => p.x === x1, (p: Pt) => p.y === y0, (p: Pt) => p.y === y1];
        const counts = edges.map(on => posts.filter(on).length);
        const side = posts.map(p => {
            let best = -1;
            edges.forEach((on, i) => { if (on(p) && (best < 0 || counts[i] > counts[best])) best = i; });
            return best;
        });
        const used = [0, 1, 2, 3].map(i => side.includes(i));
        const bb = ce.getBoundingBox();
        const tl = this.toUnits({ x: bb.x, y: bb.y }), br = this.toUnits({ x: bb.x + bb.width, y: bb.y + bb.height });
        if (!used[0]) x0 = Math.min(x0 - 2, tl.x);
        if (!used[1]) x1 = Math.max(x1 + 2, br.x);
        if (!used[2]) y0 = Math.min(y0 - 2, tl.y);
        if (!used[3]) y1 = Math.max(y1 + 2, br.y);
        x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);

        let name = model.name;
        for (let n = 2; this.sheets.some(sh => sh.name === name); n++)
            name = model.name + " " + n;
        const angles = [180, 0, 90, 270];
        this.sheets.push({
            model, uuid: uuid(), name, x0, y0, x1, y1,
            pins: posts.map((p, j) => ({ name: model.extList[j].name, p, angle: angles[side[j]] })),
        });
    }

    // the buses: each set of bus wires, labels and posts joined at their ends.  each is named
    // after a bus label on it, or else BUSn_, and its lines' nets after it (name0, name1...).
    // returns the names, by bus label element and by bus for labelBuses
    private busGroups(descs: (Desc | null)[]): Map<any, string> {
        const bu = new UnionFind();
        const unitKey = (p: Pt) => "b" + ptKey({ x: p.x, y: p.y });
        const key = (p: Point | Pt) => unitKey(this.toUnits({ x: p.x, y: p.y }));
        const groups = new Map<string, { width: number; name?: string; p: Pt }>();
        const add = (p: Point | Pt, width: number, name?: string) => {
            const r = bu.find(key(p));
            const g = groups.get(r) ?? { width, p: this.toUnits({ x: p.x, y: p.y }) };
            g.width = Math.max(g.width, width);
            g.name ??= name;
            groups.set(r, g);
        };
        this.elms.forEach((ce, i) => {
            const d = descs[i];
            if (d?.kind === "bus") {
                for (let j = 1; j < d.pts.length; j++)
                    bu.union(key(d.pts[j - 1]), key(d.pts[j]));
            } else if (d?.kind === "buslabel")
                bu.union(key(ce.getPost(0)!), "n" + d.name);
        });
        this.elms.forEach((ce, i) => {
            const d = descs[i];
            if (d?.kind === "bus")
                add(d.pts[0], d.width);
            else if (d?.kind === "buslabel")
                add(ce.getPost(0)!, d.width, d.name);
        });
        const names = new Map<any, string>();
        let n = 1;
        for (const [root, g] of groups) {
            const prefix = g.name ?? "BUS" + n++ + "_";
            for (let j = 0; j !== g.width; j++) {
                const net = this.net({ ...g.p, z: j });
                if (!this.lineNames.has(net))
                    this.lineNames.set(net, prefix + j);
            }
            names.set(root, `${prefix}[0..${g.width - 1}]`);
        }
        this.elms.forEach((ce, i) => {
            const d = descs[i];
            if (d?.kind === "buslabel")
                names.set(ce, names.get(bu.find(key(ce.getPost(0)!)))!);
        });
        this.busRoot = (p: Pt) => bu.find(unitKey(p));
        return names;
    }
    private lineNames = new Map<string, string>();
    private busRoot: (p: Pt) => string = () => "";

    private addBus(a: Pt, b: Pt): void {
        a = { x: a.x, y: a.y };
        b = { x: b.x, y: b.y };
        if (samePt(a, b))
            return;
        this.buses.push({ a, b });
        this.addPoint(a, "bus");
        this.addPoint(b, "bus");
    }

    // a bus part's lines all have their posts at the bus's end, where one line's pin may now
    // be.  a bus can't touch a pin, so it stops short of it
    private trimBuses(): void {
        const onPin = (p: Pt) => this.symbols.some(s => s.pinPts.some(q => samePt(p, q)));
        for (const s of this.buses)
            for (const [end, other] of [["a", "b"], ["b", "a"]] as const) {
                const p = s[end], q = s[other];
                for (let k = 0; k !== 3 && onPin(s[end]) && Math.abs(s[end].x - q.x) + Math.abs(s[end].y - q.y) > 2; k++)
                    s[end] = { x: s[end].x + 2 * Math.sign(q.x - p.x), y: s[end].y + 2 * Math.sign(q.y - p.y) };
            }
    }

    // a vector label on each bus without a bus label, at the middle of its longest wire
    private labelBuses(names: Map<any, string>): void {
        const labeled = new Set(this.labels.filter(l => l.name.endsWith("]")).map(l => this.busRoot(l.p)));
        const longest = new Map<string, { a: Pt; b: Pt }>();
        const len = (s: { a: Pt; b: Pt }) => Math.abs(s.a.x - s.b.x) + Math.abs(s.a.y - s.b.y);
        for (const s of this.buses) {
            const r = this.busRoot(s.a), best = longest.get(r);
            if (!labeled.has(r) && (best === undefined || len(s) > len(best)))
                longest.set(r, s);
        }
        for (const [r, s] of longest) {
            const name = names.get(r);
            if (name === undefined)
                continue;
            // on the grid, along the wire
            const mid = (u: number, v: number) => 2 * Math.round((u + v) / 4);
            const p = s.a.x === s.b.x ? { x: s.a.x, y: mid(s.a.y, s.b.y) } :
                      s.a.y === s.b.y ? { x: mid(s.a.x, s.b.x), y: s.a.y } : s.a;
            this.labels.push({ p, name, angle: s.a.x === s.b.x ? 90 : 0 });
        }
    }

    // a bus splitter is its bus running alongside its line posts, with a bus entry and a
    // short wire out to each, which has the line's name
    private placeSplitter(ce: CircuitElm, width: number): void {
        const bus = this.toUnits(ce.getPost(0)!);
        const posts = Array.from({ length: width }, (_, i) => this.toUnits(ce.getPost(width + i)!));
        // a along the way from the bus to the posts, b across it
        const column = posts.every(q => q.x === posts[0].x);
        const A = (p: Pt) => column ? p.x : p.y, B = (p: Pt) => column ? p.y : p.x;
        const mk = (a: number, b: number): Pt => column ? { x: a, y: b } : { x: b, y: a };
        const a1 = A(posts[0]), sgn = Math.sign(a1 - A(bus)) || 1, ab = a1 - 4 * sgn;
        const bs = [B(bus), ...posts.map(q => B(q) - 2)];
        const lo = Math.min(...bs), hi = Math.max(...bs);
        this.addBus(bus, mk(ab, B(bus)));
        this.addBus(mk(ab, lo), mk(ab, B(bus)));
        this.addBus(mk(ab, B(bus)), mk(ab, hi));
        const g = this.groupCount++;
        for (const q of posts) {
            const net = this.net(q), end = mk(a1 - 2 * sgn, B(q));
            this.addSeg({ x: q.x, y: q.y }, end, net, g);
            this.busEntries.push({ a: mk(ab, B(q) - 2), b: end });
            this.netTag({ x: q.x, y: q.y }, net, mk(a1 + 4 * sgn, B(q)));
        }
    }

    private nameNets(): void {
        // a supply's name wins over a sheet pin's, which wins over a label's
        const named = new Map<string, string>();
        const used = new Set<string>();
        for (const prefix of ["P", "H", "L"])
            for (const k of this.uf.parent.keys()) {
                const r = this.uf.find(k);
                if (k[0] === prefix && !named.has(r))
                    named.set(r, k.substring(1));
                if (k[0] === prefix)
                    used.add(k.substring(1));
            }
        // then a bus line's name, as KiCad names the bus's members
        for (const [r, name] of this.lineNames)
            if (!named.has(r)) {
                named.set(r, name);
                used.add(name);
            }
        let n = 1;
        for (const k of this.uf.parent.keys()) {
            const r = this.uf.find(k);
            if (this.netNames.has(r))
                continue;
            let name = named.get(r);
            if (name === undefined) {
                while (used.has("Net" + n))
                    n++;
                name = "Net" + n++;
            }
            this.netNames.set(r, name);
        }
    }

    // a power symbol's own drawing points along -y (ground) or +y (supplies) at angle 0.
    // turn it to point the way the CircuitJS element was drawn
    private powerAngle(name: string, d: Pt): number {
        const down = name === "GND";
        if (Math.abs(d.x) > Math.abs(d.y))
            return (d.x > 0) === down ? 90 : 270;
        return (d.y > 0) === down ? 0 : 180;
    }

    private labelAngle(d: Pt): number {
        if (Math.abs(d.x) >= Math.abs(d.y))
            return d.x < 0 ? 180 : 0;
        return d.y < 0 ? 90 : 270;
    }

    // the unit a part goes in: its own for a part of a group, the next free one in its package
    // for logic, else unit 1
    private allocUnit(sym: KicadSymbol, d: PartDesc): { ref: string; unit: number } {
        if (d.group) {
            let ref = this.groupRefs.get(d.group.key);
            if (ref === undefined) {
                ref = this.nextRef(sym.ref);
                this.groupRefs.set(d.group.key, ref);
            }
            return { ref, unit: d.group.unit };
        }
        if (!d.supply)
            return { ref: this.nextRef(sym.ref), unit: symbolUnits(sym).units[0] };
        const units = symbolUnits(sym).units;
        const key = d.sym + "|" + d.supply;
        let pkg = this.packages.get(key);
        if (pkg === undefined || pkg.used === units.length) {
            pkg = { sym, ref: this.nextRef(sym.ref), value: d.value, supply: d.supply, supplyPins: d.supplyPins, used: 0 };
            this.packages.set(key, pkg);
            this.allPackages.push(pkg);
        }
        return { ref: pkg.ref, unit: units[pkg.used++] };
    }

    private placePart(ce: CircuitElm, d: PartDesc): void {
        const sym = d.symbol ?? KICAD_SYMBOLS[d.sym];
        const { ref, unit } = this.allocUnit(sym, d);

        // every pin that gets connected: to a post (posts[k] set), or to a supply.  logic
        // without a separate supply unit has its supply pins in each gate
        const ties = (d.ties ?? []).slice();
        if (d.supply && symbolUnits(sym).powerUnit === 0)
            for (const n of unitPins(sym, unit))
                if (sym.types[n] === "power_in")
                    ties.push({ pin: n, power: sym.pins[n][1] > 0 ? d.supply : "GND" });
        const postIdx: number[] = [], names: string[] = [];
        for (let j = 0; j !== ce.getPostCount(); j++)
            if (d.pins[j] != null) {
                postIdx.push(j);
                names.push(d.pins[j]!);
            }
        const pinNums = resolvePins(sym, unit, [...names, ...ties.map(t => t.pin)]);
        const posts: (Pt | null)[] = [], nets: string[] = [];
        for (const j of postIdx)
            posts.push(this.toUnits(ce.getPost(j)!));
        for (const t of ties)
            posts.push(t.post !== undefined ? this.toUnits(ce.getPost(t.post)!) : null);
        for (let k = 0; k !== posts.length; k++)
            nets.push(posts[k] ? this.net(posts[k]!) : this.uf.find("P" + ties[k - postIdx.length].power));
        const swap = (d.swap ?? []).map(j => postIdx.indexOf(j)).filter(k => k >= 0);
        // the unit's other pins aren't connected, so nothing may touch them either
        const allPins = unitPins(sym, unit);
        const unused = allPins.filter(n => !pinNums.includes(n) && sym.types[n] !== "no_connect");
        const ncNet = (n: string) => "nc:" + ref + ":" + n;

        let best: { cost: number; at: Pt; orient: Orient; pins: string[]; pinPts: Pt[] } | null = null;
        // if every orientation would short something, try moving the symbol a little
        // (finishing the ring of moves where something works)
        let goodRing = -1;
        for (const shift of SHIFTS) {
            if (goodRing >= 0 && shift.ring > goodRing)
                break;
            for (const orient of ORIENTS) {
                const pins = pinNums.slice();
                let offs = pins.map(n => symbolOffset(sym.pins[n], orient));
                if (swap.length > 1) {
                    // match interchangeable pins to their posts in order along the axis they're spread on
                    const so = swap.map(k => offs[k]);
                    const ax = Math.max(...so.map(o => o.x)) - Math.min(...so.map(o => o.x)) >
                               Math.max(...so.map(o => o.y)) - Math.min(...so.map(o => o.y)) ? "x" : "y";
                    const byPin = swap.slice().sort((a, b) => offs[a][ax] - offs[b][ax]);
                    const byPost = swap.slice().sort((a, b) => posts[a]![ax] - posts[b]![ax]);
                    const pinsBefore = pins.slice();
                    for (let i = 0; i !== swap.length; i++)
                        pins[byPost[i]] = pinsBefore[byPin[i]];
                    offs = pins.map(n => symbolOffset(sym.pins[n], orient));
                }
                let cx = 0, cy = 0, n = 0;
                for (let k = 0; k !== posts.length; k++)
                    if (posts[k]) {
                        cx += posts[k]!.x - offs[k].x;
                        cy += posts[k]!.y - offs[k].y;
                        n++;
                    }
                const at = { x: Math.round(cx / n) + shift.x, y: Math.round(cy / n) + shift.y };
                const pinPts = offs.map(o => ({ x: at.x + o.x, y: at.y + o.y }));
                const body = bodyRect(allPins.map(n => {
                    const o = symbolOffset(sym.pins[n], orient);
                    return { x: at.x + o.x, y: at.y + o.y };
                }));
                let cost = orient.mirror ? 0.01 : 0;
                if (d.dir) {
                    // hang the symbol's body off the post the way the element was drawn
                    const bx = offs.reduce((a, o) => a + o.x, 0) / offs.length - offs[0].x;
                    const by = offs.reduce((a, o) => a + o.y, 0) / offs.length - offs[0].y;
                    cost -= bx * d.dir.x + by * d.dir.y;
                }
                for (const n of unused) {
                    const o = symbolOffset(sym.pins[n], orient);
                    if (this.pointConflicts({ x: at.x + o.x, y: at.y + o.y }, ncNet(n)))
                        cost += 1e6;
                }
                for (let k = 0; k !== posts.length; k++) {
                    // a pin landing on another net's point would short them
                    if (this.pointConflicts(pinPts[k], nets[k]))
                        cost += 1e6;
                    if (!posts[k])
                        continue;
                    cost += Math.abs(pinPts[k].x - posts[k]!.x) + Math.abs(pinPts[k].y - posts[k]!.y);
                    // labels are clear but harder to follow than a wire
                    if (this.stubPath(pinPts[k], posts[k]!, nets[k], body) === null)
                        cost += 200;
                }
                if (best === null || cost < best.cost)
                    best = { cost, at, orient, pins, pinPts };
                if (cost < 1e6 && goodRing < 0)
                    goodRing = shift.ring;
            }
        }
        const b = best!;
        if (b.cost >= 1e6)
            this.warnings.push(ce.getClassName().replace(/Elm$/, "") + " (pin overlap)");

        this.symbols.push({
            sym, ref, unit, value: d.value, at: b.at, orient: b.orient, props: d.props,
            pins: allPins, pinPts: allPins.map(n => {
                const o = symbolOffset(sym.pins[n], b.orient);
                return { x: b.at.x + o.x, y: b.at.y + o.y };
            }),
        });
        this.refs.set(ce, ref);
        this.placedElms.set(ce, d);
        const map: (string | null)[] = Array(ce.getPostCount()).fill(null);
        postIdx.forEach((j, k) => map[j] = b.pins[k]);
        this.pinMap.set(ce, map);
        const placed = this.symbols[this.symbols.length - 1];
        allPins.forEach((n, i) => {
            if (unused.includes(n))
                this.addPoint(placed.pinPts[i], ncNet(n));
        });

        const powers = ties.map(t => t.power);
        const tiePins = b.pins.slice(postIdx.length);
        if (d.swapTies) {
            const k = postIdx.length;
            if (b.pinPts[k].y > b.pinPts[k + 1].y) {
                powers.reverse();
                tiePins.reverse();
                [nets[k], nets[k + 1]] = [nets[k + 1], nets[k]];
            }
        }
        if (d.model) {
            // a pin connected to nothing is tied to ground, as in modelParts()
            const n = ce.getPostCount();
            const ties = postIdx.filter(j => this.dangles(ce, j))
                .map(j => `Rtie_${d.model!.pins[j]} ${d.model!.pins[j]} 0 100meg`);
            const m = uniqueModel({ ...d.model, body: [...d.model.body, ...ties] });
            this.models.set(m.name, modelText(m));
            placed.model = m.name;
            placed.props = { ...placed.props, "Sim.Device": "SUBCKT", "Sim.Name": m.name,
                             "Sim.Pins": [...postIdx.map(j => map[j] + "=" + m.pins[j]),
                                          ...tiePins.map((p, i) => p + "=" + m.pins[n + i])].join(" ") };
        }
        const body = bodyRect(placed.pinPts);
        // every pin first, so no pin's stub runs over another
        for (let k = 0; k !== posts.length; k++)
            this.addPoint(b.pinPts[k], nets[k]);
        const tied: number[] = [];
        for (let k = 0; k !== posts.length; k++) {
            if (!posts[k]) {
                tied.push(k);
                continue;
            }
            // a bus's lines all have their posts at its end, which has the bus's label, so
            // each line's pin just gets the line's name
            const bus = posts.some((q, i) => i !== k && q && samePt(q, posts[k]!));
            const path = bus ? null : this.stubPath(b.pinPts[k], posts[k]!, nets[k], body);
            if (path === null) {
                // both labels read away from the symbol: the pin's the way it points, the
                // post's away from the symbol's middle
                const out = pinOut(sym, b.pins[k], b.orient);
                const c = body ? { x: (body.x0 + body.x1) / 2, y: (body.y0 + body.y1) / 2 } : b.at;
                const post = posts[k]!;
                this.netTag(b.pinPts[k], nets[k], { x: b.pinPts[k].x + out.x, y: b.pinPts[k].y + out.y });
                if (!bus)
                    this.netTag(post, nets[k], { x: 2 * post.x - c.x, y: 2 * post.y - c.y });
                continue;
            }
            const g = this.groupCount++;
            for (let i = 1; i < path.length; i++)
                this.addSeg(path[i - 1], path[i], nets[k], g);
        }
        this.placeTies(tied.map(k => ({ p: b.pinPts[k], net: nets[k], power: powers[k - postIdx.length]!,
                                         out: pinOut(sym, b.pins[k], b.orient) })));
    }

    // power symbols for pins tied to supplies.  pins on the same side with the same supply are
    // joined, with one symbol for the lot.  pins on the left or right get a short wire out
    // first so the symbol can stand upright
    private placeTies(ties: { p: Pt; net: string; power: string; out: Pt }[]): void {
        const groups = new Map<string, { p: Pt; net: string; power: string; out: Pt }[]>();
        for (const t of ties) {
            const out = t.out;
            const key = t.power + "|" + out.x + "|" + out.y + "|" + (out.x !== 0 ? t.p.x : t.p.y);
            if (!groups.has(key))
                groups.set(key, []);
            groups.get(key)!.push(t);
        }
        for (const g of groups.values()) {
            const { power, net, out } = g[0];
            const up = power !== "GND";
            if (out.x !== 0) {
                const ends = g.map(t => ({ x: t.p.x + 2 * out.x, y: t.p.y })).sort((a, b) => a.y - b.y);
                const segs: [Pt, Pt][] = g.map((t, i) => [t.p, { x: t.p.x + 2 * out.x, y: t.p.y }]);
                for (let i = 1; i < ends.length; i++)
                    segs.push([ends[i - 1], ends[i]]);
                const ok = ends.every(e => !this.pointConflicts(e, net)) &&
                           segs.every(([a, b2]) => !this.segConflicts(a, b2, net));
                if (ok) {
                    const grp = this.groupCount++;
                    for (const [a, b2] of segs)
                        this.addSeg(a, b2, net, grp);
                    const e = up ? ends[0] : ends[ends.length - 1];
                    this.powers.push({ p: e, name: power, angle: 0 });
                    continue;
                }
            } else if (g.length > 1 && (out.y < 0) === up) {
                // along the top (a supply) or bottom (ground): join the pins, symbol on the first
                const pins = g.map(t => t.p).sort((a, b2) => a.x - b2.x);
                const ok = pins.slice(1).every((p2, i) => !this.segConflicts(pins[i], p2, net));
                if (ok) {
                    const grp = this.groupCount++;
                    for (let i = 1; i < pins.length; i++)
                        this.addSeg(pins[i - 1], pins[i], net, grp);
                    this.powers.push({ p: pins[0], name: power, angle: this.powerAngle(power, out) });
                    continue;
                }
            }
            // a supply points up and ground down, unless that's back into the symbol
            for (const t of g) {
                let dir = { x: 0, y: up ? -1 : 1 };
                if (dir.y * t.out.y < 0)
                    dir = t.out;
                this.powers.push({ p: t.p, name: power, angle: this.powerAngle(power, dir) });
            }
        }
    }

    // each logic package's supply unit goes in a row below the circuit, with its supplies attached
    private placePowerUnits(): void {
        let maxY = 0;
        for (const q of this.points)
            maxY = Math.max(maxY, q.p.y);
        let x = MARGIN + 4;
        for (const pkg of this.allPackages) {
            const unit = symbolUnits(pkg.sym).powerUnit;
            if (unit === 0)
                continue;
            const pins = unitPins(pkg.sym, unit);
            const top = Math.max(...pins.map(n => pkg.sym.pins[n][1])) / MM_PER_UNIT;
            const at = { x, y: maxY + 8 + top };
            const orient = { angle: 0, mirror: false };
            const pinPts = pins.map(n => {
                const o = symbolOffset(pkg.sym.pins[n], orient);
                return { x: at.x + o.x, y: at.y + o.y };
            });
            this.symbols.push({ sym: pkg.sym, ref: pkg.ref, unit, value: pkg.value, at, orient, pins, pinPts });
            // a supply on bottom pins (a tube's heater) hangs below them on wires joined
            // under the ground beside them, pointing down
            const hung = new Map<string, Pt[]>();
            pins.forEach((n, i) => {
                const name = pkg.supplyPins?.[pkg.sym.names[n]] ?? (pkg.sym.pins[n][1] > 0 ? pkg.supply : "GND");
                this.addPoint(pinPts[i], this.uf.find("P" + name));
                if (name !== "GND" && pkg.sym.pins[n][1] <= 0)
                    hung.set(name, [...(hung.get(name) ?? []), pinPts[i]]);
                else
                    this.powers.push({ p: pinPts[i], name, angle: 0 });
            });
            for (const [name, pts] of hung) {
                const net = this.uf.find("P" + name), g = this.groupCount++;
                const ends = pts.map(p => ({ x: p.x, y: p.y + 6 })).sort((a, b) => a.x - b.x);
                pts.forEach((p, i) => this.addSeg(p, { x: p.x, y: p.y + 6 }, net, g));
                this.addSeg(ends[0], ends[ends.length - 1], net, g);
                this.powers.push({ p: ends[0], name, angle: 180 });
            }
            x += 8;
        }
    }

    // replace any wire that passes through or ends on a connection point on another net
    // with labels at its ends
    private fixFalseConnections(): void {
        const bad = new Set<number>();
        for (const s of this.segs)
            for (const q of this.pointGrid.near(s.a, s.b))
                if (q.net !== s.net && (onInterior(q.p, s.a, s.b) || samePt(q.p, s.a) || samePt(q.p, s.b)))
                    bad.add(s.group);
        if (bad.size === 0)
            return;
        // a wire's ends are the points only one of its segments reaches (not its bends)
        const ends = new Map<string, { p: Pt; net: string; toward: Pt; count: number }>();
        for (const s of this.segs)
            if (bad.has(s.group))
                for (const [p, q] of [[s.a, s.b], [s.b, s.a]]) {
                    const k = s.group + ":" + ptKey(p);
                    const e = ends.get(k);
                    if (e)
                        e.count++;
                    else
                        ends.set(k, { p, net: s.net, toward: q, count: 1 });
                }
        this.segs = this.segs.filter(s => !bad.has(s.group));
        for (const e of ends.values())
            if (e.count === 1)
                this.netTag(e.p, e.net, e.toward);
    }

    private junctions(): Pt[] {
        const count = new Map<string, { p: Pt; n: number }>();
        const add = (p: Pt) => {
            const k = ptKey(p);
            const c = count.get(k);
            if (c)
                c.n++;
            else
                count.set(k, { p, n: 1 });
        };
        for (const s of this.segs) {
            add(s.a);
            add(s.b);
        }
        for (const ps of this.symbols)
            for (const p of ps.pinPts)
                add(p);
        // a wire end in the middle of another wire is a tee
        const grid = new Grid<Seg>();
        for (const s of this.segs)
            grid.add(s.a, s.b, s);
        for (const c of count.values())
            if (grid.near(c.p, c.p).some(s => onInterior(c.p, s.a, s.b)))
                c.n += 2;
        return [...count.values()].filter(c => c.n >= 3).map(c => c.p);
    }

    write(ctx: WriteContext): string {
        const out: string[] = [];
        const effects = (justify?: string, hide?: boolean) =>
            `(effects (font (size 1.27 1.27))${justify ? ` (justify ${justify})` : ""}${hide ? " (hide yes)" : ""})`;

        let maxX = 0, maxY = 0;
        const grow = (p: Pt) => { maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
        this.points.forEach(q => grow(q.p));
        this.texts.forEach(t => grow(t.p));
        this.symbols.forEach(s => grow(s.at));
        this.sheets.forEach(s => grow({ x: s.x1, y: s.y1 }));
        const w = (maxX + MARGIN) * MM_PER_UNIT, h = (maxY + MARGIN) * MM_PER_UNIT;
        const papers: [string, number, number][] =
            [["A4", 297, 210], ["A3", 420, 297], ["A2", 594, 420], ["A1", 841, 594], ["A0", 1189, 841]];
        const paper = papers.find(p => w <= p[1] && h <= p[2]);

        out.push("(kicad_sch");
        out.push("\t(version 20250114)");
        out.push('\t(generator "circuitjs")');
        out.push('\t(generator_version "1.0")');
        out.push(`\t(uuid ${quote(ctx.uuid)})`);
        out.push(paper ? `\t(paper "${paper[0]}")` : `\t(paper "User" ${Math.ceil(w)} ${Math.ceil(h)})`);
        out.push("\t(lib_symbols");
        const libIds = new Set<string>();
        for (const s of [...this.symbols, ...this.powerSyms])
            if (!libIds.has(s.sym.libId)) {
                libIds.add(s.sym.libId);
                out.push("\t\t" + s.sym.def);
            }
        out.push("\t)");

        for (const p of this.junctions())
            out.push(`\t(junction (at ${num(p.x)} ${num(p.y)}) (diameter 0) (color 0 0 0 0) (uuid ${quote(uuid())}))`);
        for (const s of this.segs)
            out.push(`\t(wire (pts (xy ${num(s.a.x)} ${num(s.a.y)}) (xy ${num(s.b.x)} ${num(s.b.y)})) ` +
                     `(stroke (width 0) (type default)) (uuid ${quote(uuid())}))`);
        for (const s of this.buses)
            out.push(`\t(bus (pts (xy ${num(s.a.x)} ${num(s.a.y)}) (xy ${num(s.b.x)} ${num(s.b.y)})) ` +
                     `(stroke (width 0) (type default)) (uuid ${quote(uuid())}))`);
        for (const e of this.busEntries)
            out.push(`\t(bus_entry (at ${num(e.a.x)} ${num(e.a.y)}) (size ${num(e.b.x - e.a.x)} ${num(e.b.y - e.a.y)}) ` +
                     `(stroke (width 0) (type default)) (uuid ${quote(uuid())}))`);
        for (const l of this.labels) {
            const just = l.angle === 180 || l.angle === 270 ? "right bottom" : "left bottom";
            out.push(`\t(label ${quote(l.name)} (at ${num(l.p.x)} ${num(l.p.y)} ${l.angle}) ${effects(just)} (uuid ${quote(uuid())}))`);
        }
        for (const l of this.hlabels) {
            const just = l.angle === 180 || l.angle === 270 ? "right" : "left";
            out.push(`\t(hierarchical_label ${quote(l.name)} (shape passive) (at ${num(l.p.x)} ${num(l.p.y)} ${l.angle}) ` +
                     `${effects(just)} (uuid ${quote(uuid())}))`);
        }
        // CircuitJS puts the first line's baseline at the text's position, with more lines below
        for (const t of this.texts)
            out.push(`\t(text ${quote(t.text)} (exclude_from_sim no) (at ${num(t.p.x)} ${num(t.p.y - 1)} 0) ${effects("left top")} (uuid ${quote(uuid())}))`);

        for (const s of [...this.symbols, ...this.powerSyms])
            this.writeSymbol(out, ctx, s, effects);
        for (const sh of this.sheets)
            this.writeSheet(out, ctx, sh, effects);

        if (ctx.root) {
            out.push("\t(sheet_instances");
            out.push('\t\t(path "/" (page "1"))');
            out.push("\t)");
        }
        out.push("\t(embedded_fonts no)");
        out.push(")");
        return out.join("\n") + "\n";
    }

    private writeSheet(out: string[], ctx: WriteContext, sh: PlacedSheet,
                       effects: (justify?: string, hide?: boolean) => string): void {
        out.push("\t(sheet");
        out.push(`\t\t(at ${num(sh.x0)} ${num(sh.y0)})`);
        out.push(`\t\t(size ${num(sh.x1 - sh.x0)} ${num(sh.y1 - sh.y0)})`);
        out.push("\t\t(exclude_from_sim no)");
        out.push("\t\t(in_bom yes)");
        out.push("\t\t(on_board yes)");
        out.push("\t\t(dnp no)");
        out.push("\t\t(stroke (width 0.1524) (type solid))");
        out.push("\t\t(fill (color 0 0 0 0.0000))");
        out.push(`\t\t(uuid ${quote(sh.uuid)})`);
        out.push(`\t\t(property "Sheetname" ${quote(sh.name)} (at ${num(sh.x0)} ${num(sh.y0 - 0.5)} 0) ${effects("left bottom")})`);
        out.push(`\t\t(property "Sheetfile" ${quote(ctx.fileOf(sh.model))} (at ${num(sh.x0)} ${num(sh.y1 + 0.5)} 0) ${effects("left top", true)})`);
        for (const pin of sh.pins)
            out.push(`\t\t(pin ${quote(pin.name)} passive (at ${num(pin.p.x)} ${num(pin.p.y)} ${pin.angle}) ` +
                     `${effects(pin.angle === 0 || pin.angle === 270 ? "right" : "left")} (uuid ${quote(uuid())}))`);
        const pages = (ctx.pages.get(sh.uuid) ?? []).map(pg => `(path ${quote(pg.path)} (page ${quote(String(pg.page))}))`);
        out.push(`\t\t(instances (project ${quote(ctx.project)} ${pages.join(" ")}))`);
        out.push("\t)");
    }

    private writeSymbol(out: string[], ctx: WriteContext, s: PlacedSymbol,
                        effects: (justify?: string, hide?: boolean) => string): void {
        const at = s.at;
        const isPower = s.sym.ref.startsWith("#");
        // put the reference and value beside the pins' bounding box, on the side away
        // from the longer axis
        let x0 = at.x, x1 = at.x, y0 = at.y, y1 = at.y;
        for (const p of s.pinPts) {
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
            y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
        let refAt: Pt, valAt: Pt, just: string;
        if (isPower) {
            const below = s.sym === KICAD_SYMBOLS.GND ? (s.orient.angle === 0 ? 1 : -1) : (s.orient.angle === 180 ? 1 : -1);
            refAt = { x: at.x, y: at.y + below * 5 };
            valAt = { x: at.x, y: at.y + below * 3 };
            just = "";
        } else if (boxSymbols.has(s.sym)) {
            // a box's origin is one of its pins, so go by its outline: above and below it
            const [l, b, r, t] = boxSymbols.get(s.sym)!;
            const cs = [[l, b], [r, t]].map(c => symbolOffset(c as [number, number], s.orient));
            const left = Math.min(...cs.map(c => at.x + c.x));
            refAt = { x: left, y: Math.min(y0, ...cs.map(c => at.y + c.y)) - 1.5 };
            valAt = { x: left, y: Math.max(y1, ...cs.map(c => at.y + c.y)) + 1.5 };
            just = "left";
        } else if (y1 - y0 >= x1 - x0) {
            refAt = { x: Math.max(x1, at.x + 1) + 1.5, y: at.y - 1 };
            valAt = { x: Math.max(x1, at.x + 1) + 1.5, y: at.y + 1 };
            just = "left";
        } else {
            refAt = { x: at.x, y: Math.min(y0, at.y - 2) - 1.5 };
            valAt = { x: at.x, y: Math.max(y1, at.y + 2) + 2 };
            just = "";
        }
        // a field's position is absolute, but its angle and justification turn with the
        // symbol.  keep the text horizontal and left-justified on the sheet
        const fieldAngle = s.orient.angle % 180 === 90 ? 90 : 0;
        if (s.orient.angle === 180 && just === "left")
            just = "right";
        const prop = (name: string, value: string, p: Pt, hide: boolean, j?: string) =>
            `\t\t(property ${quote(name)} ${quote(value)} (at ${num(p.x)} ${num(p.y)} ${fieldAngle}) ${effects(j || undefined, hide)})`;

        out.push("\t(symbol");
        out.push(`\t\t(lib_id ${quote(s.sym.libId)})`);
        out.push(`\t\t(at ${num(at.x)} ${num(at.y)} ${s.orient.angle})`);
        if (s.orient.mirror)
            out.push("\t\t(mirror x)");
        out.push(`\t\t(unit ${s.unit})`);
        out.push("\t\t(exclude_from_sim no)");
        out.push(`\t\t(in_bom ${isPower ? "no" : "yes"})`);
        out.push(`\t\t(on_board ${isPower ? "no" : "yes"})`);
        out.push("\t\t(dnp no)");
        out.push(`\t\t(uuid ${quote(uuid())})`);
        out.push(prop("Reference", ctx.paths[0]?.refs.get(s.ref) ?? s.ref, refAt, isPower, just));
        out.push(prop("Value", s.value, valAt, false, just));
        out.push(prop("Footprint", s.sym.footprint, at, true));
        out.push(prop("Datasheet", "", at, true));
        // a placed symbol's fields don't come from its library symbol, and without the sim
        // fields KiCad guesses the model from the value
        const props: Record<string, string> = { ...simFields(s.sym), ...s.props };
        // a subckt has no type, and the parameters were KiCad's model's
        if (s.model) {
            delete props["Sim.Type"];
            delete props["Sim.Params"];
            props["Sim.Library"] = modelLibrary(ctx.project);
        }
        for (const [k, v] of Object.entries(props))
            out.push(prop(k, v, at, true));
        for (const n of s.pins)
            out.push(`\t\t(pin ${quote(n)} (uuid ${quote(uuid())}))`);
        const paths = ctx.paths.map(p =>
            `(path ${quote(p.path)} (reference ${quote(p.refs.get(s.ref)!)}) (unit ${s.unit}))`);
        out.push(`\t\t(instances (project ${quote(ctx.project)} ${paths.join(" ")}))`);
        out.push("\t)");
    }
}

// the top sheet comes first in files.  root is its exporter, whose refs and pinMap say
// which part and pin each element and post became (the top sheet's parts keep their numbers)
export interface KicadProject {
    files: { name: string; text: string }[]; warnings: string[]; root: KicadExporter;
    // each subcircuit model's sheet and the elements built for it, and each sheet's places
    // (for checking the result against the simulator)
    sheets: Map<any, { exp: KicadExporter; elms: CircuitElm[] }>;
    paths: Map<KicadExporter, { path: string; refs: Map<string, string> }[]>;
}

// was a subcircuit model saved with its elements' positions?  the definition also holds the
// models its elements use (relay, diode, subcircuit models and so on), which have none
export function hasLayout(children: Element[]): boolean {
    return children.every(c => !CirSim.xmlDumpTypeMap.has(c.tagName) || c.getAttribute("x") != null);
}

// the elements of a subcircuit model, built from its saved definition.  a model saved
// with positions is drawn as it was laid out, with its labeled-node pins as hierarchical
// labels.  one without (an old format) gets its parts in a grid, every pin labeled with its net
function modelSheet(model: any): { elms: CircuitElm[]; opts: SheetOptions } {
    const xml = new CircuitXMLDeserializer(CirSim.theApp);
    const children = model.elmDoc ? [...model.elmDoc.documentElement.children] as Element[] : [];
    const elms: CircuitElm[] = [], nodes: number[][] = [];
    const laidOut = hasLayout(children);
    for (const child of children) {
        const className = CirSim.xmlDumpTypeMap.get(child.tagName);
        if (className == null)
            continue;
        const ce: CircuitElm = CirSim.constructElement(className, 0, 0);
        if (ce == null)
            continue;
        xml.parseChildElement(child);
        ce.undumpXml(xml);
        if (laidOut)
            ce.setPositionFromXml(child);
        elms.push(ce);
        nodes.push((child.getAttribute("nn") ?? "").split(" ").filter(t => t !== "").map(Number));
    }
    const ext = new Map<number, string>(model.extList.map((x: any) => [x.node, x.name]));
    const hier = new Set<string>(model.extList.map((x: any) => x.name));
    const tags: NetTag[] = [];
    const away = (ce: CircuitElm, p: Point) => axisDir({ x: p.x - (ce.x + ce.x2) / 2, y: p.y - (ce.y + ce.y2) / 2 });

    if (laidOut) {
        // a pin with no labeled node of its name gets a label on some post of its node
        const labeled = new Set(elms.filter(ce => ce instanceof LabeledNodeElm).map(ce => (ce as any).text));
        for (const [node, name] of ext) {
            if (labeled.has(name))
                continue;
            const i = nodes.findIndex((nn, i) => nn.includes(node) && elms[i].getPostCount() > nn.indexOf(node));
            if (i >= 0) {
                const p = elms[i].getPost(nodes[i].indexOf(node))!;
                tags.push({ p, name, kind: "hier", dir: away(elms[i], p) });
            }
        }
        return { elms, opts: { hier, tags } };
    }

    // no layout: wires, grounds and labels only say which nodes are the same
    const uf = new UnionFind();
    const keep: CircuitElm[] = [], keepNodes: number[][] = [];
    elms.forEach((ce, i) => {
        const d = describe(ce), nn = nodes[i];
        if (d?.kind === "wire")
            uf.union(String(nn[0]), String(nn[1]));
        else if (d?.kind === "power" && d.name === "GND")
            uf.union(String(nn[0]), "0");
        else if (d?.kind === "label")
            uf.union(String(nn[0]), "L" + d.name);
        else {
            keep.push(ce);
            keepNodes.push(nn);
        }
    });
    const names = new Map<string, { name: string; kind: NetTag["kind"] }>();
    for (const [node, name] of ext)
        names.set(uf.find(String(node)), { name, kind: "hier" });
    if (!names.has(uf.find("0")))
        names.set(uf.find("0"), { name: "GND", kind: "power" });
    for (const k of uf.parent.keys())
        if (k[0] === "L" && !names.has(uf.find(k)))
            names.set(uf.find(k), { name: k.substring(1), kind: "label" });
    keep.forEach((ce, i) => {
        ce.setPosition((i % 6) * 192, Math.floor(i / 6) * 192, (i % 6) * 192 + 64, Math.floor(i / 6) * 192);
        keepNodes[i].forEach((node, j) => {
            if (j >= ce.getPostCount())
                return;
            const r = uf.find(String(node));
            const tag = names.get(r) ?? { name: "N" + r, kind: "label" as const };
            const p = ce.getPost(j)!;
            tags.push({ p, ...tag, dir: away(ce, p) });
        });
    });
    return { elms: keep, opts: { hier, tags } };
}

// export a circuit as a KiCad project: the circuit's sheet, plus a sheet for each subcircuit
// model it uses (including subcircuits inside those).  the first file is the top sheet
export function exportKicadProject(elms: CircuitElm[], project: string, timeStep?: number): KicadProject {
    const root = new KicadExporter(elms, { timeStep });
    root.export();
    const warnings = [...root.warnings];

    const sheets = new Map<any, { exp: KicadExporter; file: string; uuid: string; elms: CircuitElm[] }>();
    const fileNames = new Set([project + ".kicad_sch"]);
    const build = (model: any, depth: number) => {
        if (sheets.has(model) || depth > 8)
            return;
        const { elms: modelElms, opts } = modelSheet(model);
        const exp = new KicadExporter(modelElms, { ...opts, timeStep });
        let file = model.name.replace(/[^A-Za-z0-9_.-]+/g, "_") + ".kicad_sch";
        for (let n = 2; fileNames.has(file); n++)
            file = model.name.replace(/[^A-Za-z0-9_.-]+/g, "_") + "_" + n + ".kicad_sch";
        fileNames.add(file);
        sheets.set(model, { exp, file, uuid: uuid(), elms: modelElms });
        exp.export();
        warnings.push(...exp.warnings);
        for (const sh of exp.sheets)
            build(sh.model, depth + 1);
    };
    try {
        for (const sh of root.sheets)
            build(sh.model, 1);
        // power symbols are global, so one source for each supply on the top sheet
        root.addSupplySources([...new Set([root, ...[...sheets.values()].map(s => s.exp)].flatMap(e => e.supplyNames()))]);

        // number the parts in each place each sheet is used, the top sheet first
        const counts = new Map<string, number>();
        const designator = (local: string) => {
            const prefix = local.replace(/\d+$/, "");
            const n = (counts.get(prefix) ?? 0) + 1;
            counts.set(prefix, n);
            return prefix + (prefix.startsWith("#") ? String(n).padStart(2, "0") : n);
        };
        const paths = new Map<KicadExporter, { path: string; refs: Map<string, string> }[]>();
        const pages = new Map<string, { path: string; page: number }[]>();
        let page = 1;
        const visit = (exp: KicadExporter, path: string, depth: number) => {
            const refs = new Map(exp.localRefs().map(r => [r, designator(r)] as [string, string]));
            if (!paths.has(exp))
                paths.set(exp, []);
            paths.get(exp)!.push({ path, refs });
            for (const sh of exp.sheets) {
                const child = sheets.get(sh.model);
                if (child === undefined || depth > 8)
                    continue;
                if (!pages.has(sh.uuid))
                    pages.set(sh.uuid, []);
                pages.get(sh.uuid)!.push({ path, page: ++page });
                visit(child.exp, path + "/" + sh.uuid, depth + 1);
            }
        };
        const rootUuid = uuid();
        visit(root, "/" + rootUuid, 1);

        const fileOf = (model: any) => sheets.get(model)?.file ?? "";
        const files = [{ name: project + ".kicad_sch",
                         text: root.write({ project, uuid: rootUuid, root: true, paths: paths.get(root)!, pages, fileOf }) }];
        for (const s of sheets.values())
            if (paths.has(s.exp))
                files.push({ name: s.file,
                             text: s.exp.write({ project, uuid: s.uuid, root: false, paths: paths.get(s.exp)!, pages, fileOf }) });
        const models = new Map([root, ...[...sheets.values()].map(s => s.exp)].flatMap(e => [...e.models]));
        if (models.size > 0)
            files.push({ name: modelLibrary(project),
                         text: "* SPICE models for " + project + ", exported from CircuitJS\n" + [...models.values()].join("") });
        return { files, warnings, root, sheets, paths };
    } finally {
        // the subcircuits' parts were only built to export them; let go of any sliders
        for (const s of sheets.values())
            for (const ce of s.elms)
                ce.delete();
    }
}

// export a circuit with no subcircuits as a single schematic
export function exportKicadSchematic(elms: CircuitElm[], project: string): KicadExport {
    const res = exportKicadProject(elms, project);
    return { text: res.files[0].text, warnings: res.warnings };
}
