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

interface Pt { x: number; y: number; }

// a symbol pin that isn't simply one of the element's posts: tied to a post that another
// pin also uses, or to a supply with a power symbol
interface PinTie { pin: string; post?: number; power?: string; }

export type Desc =
    // pins[i] is the symbol pin for post i (null = not exported).  a pin is given by its
    // number or its name, or for a logic gate as "@in" (the unit's next input) or "@out"
    { kind: "part"; sym: string; pins: (string | null)[]; value: string; props?: Record<string, string>;
      ties?: PinTie[];
      // posts whose pins may be swapped (a gate's inputs)
      swap?: number[];
      // the symbol hangs off post 0 in this direction
      dir?: Pt;
      // the ties' supplies may be swapped (a switch's throws), to put the higher one on top
      swapTies?: boolean;
      // logic that comes several to a package: the package's supply
      supply?: string; } |
    // a subcircuit, which becomes a sheet
    { kind: "sheet"; model: any } |
    { kind: "wire"; pts: Point[] } |
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
    [XorGateElm,  [[2, "XOR2"]]],
    [XnorGateElm, [[2, "XNOR2"]]],
]);

// part numbers for the logic symbols.  KiCad's library has some only as 74LS or CD4000 parts,
// which have the same pinouts
const LOGIC_VALUES: Record<string, string> = {
    AND2: "74HC08", AND3: "74HC11", AND4: "74HC21",
    AND8: "CD4068B",
    NAND2: "74HC00", NAND3: "74HC10", NAND4: "74HC20", NAND8: "74HC30", NAND13: "74HC133",
    OR2: "74HC32", OR3: "CD4075B", OR4: "CD4072B", OR8: "CD4078B",
    NOR2: "74HC02", NOR3: "74HC27", NOR4: "CD4002B",
    XOR2: "74HC86", XNOR2: "CD4077B",
    INV: "74HC04", SCHMITTINV: "74HC14", SCHMITT: "74HC7014",
    DFF: "74HC74", JKFF: "74HC107",
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

function railName(v: number): string {
    return (v >= 0 ? "+" : "-") + kicadValue(Math.abs(v), "V");
}

// KiCad simulation source for a VoltageElm's waveform, or null if there isn't one
function sourceSpec(e: any): { sym: string; value: string; props: Record<string, string> } | null {
    const max = e.maxVoltage, bias = e.bias, f = e.frequency;
    const freq = " " + kicadValue(f, "Hz");
    switch (e.waveform) {
    case VoltageElm.WF_DC:
        return { sym: "VDC", value: kicadValue(max + bias, "V"), props: { "Sim.Params": "dc=" + simNum(max + bias) } };
    case VoltageElm.WF_AC:
        return { sym: "VSIN", value: kicadValue(max, "V") + freq,
                 props: { "Sim.Params": `dc=${simNum(bias)} ampl=${simNum(max)} f=${simNum(f)}` } };
    // a square wave is high for the duty cycle and then low; a pulse is high, then zero
    case VoltageElm.WF_SQUARE:
    case VoltageElm.WF_PULSE: {
        const per = 1 / f;
        const lo = e.waveform === VoltageElm.WF_SQUARE ? bias - max : bias;
        return { sym: "VPULSE", value: kicadValue(max, "V") + freq,
                 props: { "Sim.Params": `y1=${simNum(lo)} y2=${simNum(bias + max)} td=0 tr=0 tf=0 ` +
                                        `tw=${simNum(e.dutyCycle * per)} per=${simNum(per)}` } };
    }
    }
    return null;
}

export function describe(ce: CircuitElm): Desc | null {
    // the class a loaded element gets (a DC rail placed from the menu is an ACRailElm
    // edited to DC, but loads back as a RailElm)
    const C = ce.getDumpClass();
    const e = ce as any;
    if (C === WireElm || C === RoutedWireElm) {
        if (e.busWidth > 1)
            return null;
        const pts = (C === RoutedWireElm && e.routePoints?.length >= 2) ?
            e.routePoints : [ce.getPost(0)!, ce.getPost(1)!];
        return { kind: "wire", pts };
    }
    if (C === AmmeterElm)
        return { kind: "wire", pts: [ce.getPost(0)!, ce.getPost(1)!] };
    if (C === GroundElm)
        return { kind: "power", name: "GND", dir: dirOf(ce) };
    if (C === LabeledNodeElm)
        return e.busWidth > 1 ? null : { kind: "label", name: e.text, dir: dirOf(ce) };
    // a DC rail is a supply; anything else is a source to ground
    if (C === RailElm) {
        if (e.waveform === VoltageElm.WF_DC)
            return { kind: "power", name: railName(e.maxVoltage + e.bias), dir: dirOf(ce) };
        const spec = sourceSpec(e);
        return spec ? { kind: "part", ...spec, pins: ["1"], ties: [{ pin: "2", power: "GND" }], dir: dirOf(ce) } : null;
    }
    // a logic input is a switch between the high and low levels
    if (C === LogicInputElm) {
        if (e.isTernary())
            return null;
        return { kind: "part", sym: "SPDT", pins: ["2"], value: "SW_SPDT", dir: dirOf(ce), swapTies: true,
                 ties: [{ pin: "1", power: railName(e.hiV) }, { pin: "3", power: e.loV === 0 ? "GND" : railName(e.loV) }] };
    }
    if (C === TextElm)
        return { kind: "text", text: e.text };
    if (C === SubcircuitElm)
        return e.model?.extList.every((x: any) => x.busWidth === 1) ? { kind: "sheet", model: e.model } : null;
    if (ce.getPostCount() === 0 || C === ScopeElm || C === ProbeElm || C === OutputElm ||
        C === LogicOutputElm || C === DataRecorderElm || C === TestPointElm ||
        C === StopTriggerElm || C === AudioOutputElm || C === OhmMeterElm)
        return { kind: "ignore" };

    if (C === ResistorElm)
        return { kind: "part", sym: "R", pins: ["1", "2"], value: kicadValue(e.resistance) };
    if (C === CapacitorElm)
        return { kind: "part", sym: "C", pins: ["1", "2"], value: kicadValue(e.capacitance) };
    if (C === PolarCapacitorElm)
        return { kind: "part", sym: "CP", pins: ["1", "2"], value: kicadValue(e.capacitance) };
    if (C === InductorElm)
        return { kind: "part", sym: "L", pins: ["1", "2"], value: kicadValue(e.inductance) };
    // CircuitJS diodes are anode first; KiCad pin 1 is the cathode
    if (C === DiodeElm || C === LEDElm || C === ZenerElm) {
        const sym = C === LEDElm ? "LED" : C === ZenerElm ? "DZ" : "D";
        const model = e.modelName && !e.modelName.startsWith("default") ? e.modelName : null;
        return { kind: "part", sym, pins: ["2", "1"], value: model ?? KICAD_SYMBOLS[sym].libId.split(":")[1] };
    }
    // posts: base, collector, emitter.  2N3904/2N3906 pins: 1=E 2=B 3=C
    if (C === TransistorElm)
        return { kind: "part", sym: e.pnp === 1 ? "NPN" : "PNP", pins: ["2", "3", "1"],
                 value: e.pnp === 1 ? "2N3904" : "2N3906" };
    // posts: gate, source, drain (n) or gate, drain, source (p), then body
    // 2N7000 pins: 1=S 2=G 3=D.  BS250 pins: 1=D 2=G 3=S
    if (C === MosfetElm)
        return { kind: "part", sym: e.pnp === 1 ? "NMOS" : "PMOS", pins: ["2", "1", "3", null],
                 value: e.pnp === 1 ? "2N7000" : "BS250" };
    // same post order as mosfets.  Q_*JFET_DGS pins: 1=D 2=G 3=S
    if (C === JfetElm)
        return { kind: "part", sym: e.pnp === 1 ? "NJFET" : "PJFET",
                 pins: e.pnp === 1 ? ["2", "3", "1"] : ["2", "1", "3"],
                 value: e.pnp === 1 ? "NJFET" : "PJFET" };
    // posts: -, +, out.  OPAMP pins: 1=+ 2=- 5=out (3, 4 are supplies)
    if (C === OpAmpElm)
        return { kind: "part", sym: "OPAMP", pins: ["2", "1", "5"], value: "OpAmp" };
    // posts: end 1, end 2, wiper.  pot pins: 1, 3 ends, 2 wiper
    if (C === PotElm)
        return { kind: "part", sym: "POT", pins: ["1", "3", "2"], value: kicadValue(e.maxResistance) };
    if (C === SwitchElm)
        return e.momentary ? { kind: "part", sym: "PUSH", pins: ["1", "2"], value: "SW_Push" } :
                             { kind: "part", sym: "SPST", pins: ["1", "2"], value: "SW_SPST" };
    // posts: common, throw 1, throw 2.  SPDT pins: 2=common, 1, 3 throws
    if (C === Switch2Elm)
        return e.throwCount === 2 ? { kind: "part", sym: "SPDT", pins: ["2", "1", "3"], value: "SW_SPDT" } : null;
    // CircuitJS voltage sources are (-, +); KiCad sources are (+, -)
    if (C === VoltageElm && ce.getPostCount() === 2) {
        const spec = sourceSpec(e);
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
    if (C === TransformerElm)
        return { kind: "part", sym: "XFMR", pins: ["1", "2", "4", "3"], value: "Transformer" };
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
        if (e.hasReset() && !e.invertSetReset())
            return null;
        const vcc = railName(e.highVoltage);
        const ties: PinTie[] = [];
        if (!e.hasReset())
            ties.push({ pin: "~{R}", power: vcc });
        if (!e.hasSet())
            ties.push({ pin: "~{S}", power: vcc });
        return logic("DFF", ["D", "Q", "~{Q}", "C", "~{R}", "~{S}"].slice(0, ce.getPostCount()), e.highVoltage, { ties });
    }
    // posts: J, clock, K, Q, ~Q, then reset.  the 74107 triggers on the falling edge
    if (C === JKFlipFlopElm) {
        if (e.positiveEdgeTriggered() || (e.hasReset() && !e.invertReset()))
            return null;
        const ties: PinTie[] = e.hasReset() ? [] : [{ pin: "~{R}", power: railName(e.highVoltage) }];
        return logic("JKFF", ["J", "C", "K", "Q", "~{Q}", "~{R}"].slice(0, ce.getPostCount()), e.highVoltage, { ties });
    }
    return null;
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
    return Math.round(p.x * 1000) / 1000 + "," + Math.round(p.y * 1000) / 1000;
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
interface PlacedSymbol {
    sym: KicadSymbol; ref: string; unit: number; value: string; at: Pt; orient: Orient;
    props?: Record<string, string>;
    // the unit's pin numbers and where they ended up
    pins: string[]; pinPts: Pt[];
}

// a logic package being filled with gates, one per unit
interface Package { sym: KicadSymbol; ref: string; value: string; supply: string; used: number; }

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

// resolve pin names (and "@in"/"@out") to the unit's pin numbers
function resolvePins(sym: KicadSymbol, unit: number, names: string[]): string[] {
    const pins = unitPins(sym, unit);
    const inputs = pins.filter(n => sym.types[n] === "input").sort((a, b) => sym.pins[b][1] - sym.pins[a][1]);
    let nextInput = 0;
    return names.map(name => {
        if (name === "@in")
            return inputs[nextInput++];
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
    private originX = 0;
    private originY = 0;
    warnings: string[] = [];

    constructor(private elms: CircuitElm[], opts: SheetOptions = {}) {
        this.hier = opts.hier ?? new Set();
        this.tags = opts.tags ?? [];
    }

    private toUnits(p: Point | Pt): Pt {
        return { x: (p.x - this.originX) / PIXELS_PER_UNIT + MARGIN, y: (p.y - this.originY) / PIXELS_PER_UNIT + MARGIN };
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
        if (this.uf.find("P" + name) === net)
            this.powers.push({ p, name, angle: this.powerAngle(name, d) });
        else if (this.uf.find("H" + name) === net)
            this.hlabels.push({ p, name, angle: this.labelAngle(d) });
        else
            this.labels.push({ p, name, angle: this.labelAngle(d) });
    }

    // place everything; the result is written by write()
    export(): void {
        const descs = this.elms.map(ce => describe(ce));

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
            } else if (d.kind === "power") {
                this.uf.union("p" + ptKey(this.toUnits(ce.getPost(0)!)), "P" + d.name);
            } else if (d.kind === "label") {
                this.uf.union("p" + ptKey(this.toUnits(ce.getPost(0)!)), (this.hier.has(d.name) ? "H" : "L") + d.name);
            } else if (d.kind === "sheet") {
                for (let j = 0; j !== ce.getPostCount(); j++)
                    this.uf.find("p" + ptKey(this.toUnits(ce.getPost(j)!)));
            } else {
                for (let j = 0; j !== ce.getPostCount(); j++)
                    if (d.pins[j] != null)
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
            } else if (d.kind === "text") {
                this.texts.push({ p: this.toUnits(ce), text: d.text });
            } else if (d.kind === "part" || d.kind === "sheet") {
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

        this.fixFalseConnections();
        this.powerSyms = this.powers.map(p => ({
            sym: p.name === "GND" ? KICAD_SYMBOLS.GND : KICAD_SYMBOLS.VCC, ref: this.nextRef("#PWR"), unit: 1,
            value: p.name, at: p.p, orient: { angle: p.angle, mirror: false }, pins: ["1"], pinPts: [p.p],
        }));
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

    // the unit a part goes in: the next free one in its package for logic, else unit 1
    private allocUnit(sym: KicadSymbol, d: PartDesc): { ref: string; unit: number } {
        if (!d.supply)
            return { ref: this.nextRef(sym.ref), unit: symbolUnits(sym).units[0] };
        const units = symbolUnits(sym).units;
        const key = d.sym + "|" + d.supply;
        let pkg = this.packages.get(key);
        if (pkg === undefined || pkg.used === units.length) {
            pkg = { sym, ref: this.nextRef(sym.ref), value: d.value, supply: d.supply, used: 0 };
            this.packages.set(key, pkg);
            this.allPackages.push(pkg);
        }
        return { ref: pkg.ref, unit: units[pkg.used++] };
    }

    private placePart(ce: CircuitElm, d: PartDesc): void {
        const sym = KICAD_SYMBOLS[d.sym];
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
        const map: (string | null)[] = Array(ce.getPostCount()).fill(null);
        postIdx.forEach((j, k) => map[j] = b.pins[k]);
        this.pinMap.set(ce, map);
        const placed = this.symbols[this.symbols.length - 1];
        allPins.forEach((n, i) => {
            if (unused.includes(n))
                this.addPoint(placed.pinPts[i], ncNet(n));
        });

        const powers = ties.map(t => t.power);
        if (d.swapTies) {
            const k = postIdx.length;
            if (b.pinPts[k].y > b.pinPts[k + 1].y) {
                powers.reverse();
                [nets[k], nets[k + 1]] = [nets[k + 1], nets[k]];
            }
        }
        const body = bodyRect(placed.pinPts);
        const tied: number[] = [];
        for (let k = 0; k !== posts.length; k++) {
            this.addPoint(b.pinPts[k], nets[k]);
            if (!posts[k]) {
                tied.push(k);
                continue;
            }
            const path = this.stubPath(b.pinPts[k], posts[k]!, nets[k], body);
            if (path === null) {
                // both labels read away from the symbol: the pin's the way it points, the
                // post's away from the symbol's middle
                const out = pinOut(sym, b.pins[k], b.orient);
                const c = body ? { x: (body.x0 + body.x1) / 2, y: (body.y0 + body.y1) / 2 } : b.at;
                const post = posts[k]!;
                this.netTag(b.pinPts[k], nets[k], { x: b.pinPts[k].x + out.x, y: b.pinPts[k].y + out.y });
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
            pins.forEach((n, i) => {
                const name = pkg.sym.pins[n][1] > 0 ? pkg.supply : "GND";
                this.addPoint(pinPts[i], this.uf.find("P" + name));
                this.powers.push({ p: pinPts[i], name, angle: 0 });
            });
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
        for (const l of this.labels) {
            const just = l.angle === 180 || l.angle === 270 ? "right bottom" : "left bottom";
            out.push(`\t(label ${quote(l.name)} (at ${num(l.p.x)} ${num(l.p.y)} ${l.angle}) ${effects(just)} (uuid ${quote(uuid())}))`);
        }
        for (const l of this.hlabels) {
            const just = l.angle === 180 || l.angle === 270 ? "right" : "left";
            out.push(`\t(hierarchical_label ${quote(l.name)} (shape passive) (at ${num(l.p.x)} ${num(l.p.y)} ${l.angle}) ` +
                     `${effects(just)} (uuid ${quote(uuid())}))`);
        }
        for (const t of this.texts)
            out.push(`\t(text ${quote(t.text)} (exclude_from_sim no) (at ${num(t.p.x)} ${num(t.p.y)} 0) ${effects("left bottom")} (uuid ${quote(uuid())}))`);

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
        for (const [k, v] of Object.entries(s.props ?? {}))
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

// the elements of a subcircuit model, built from its saved definition.  a model saved
// with positions is drawn as it was laid out, with its labeled-node pins as hierarchical
// labels.  one without (an old format) gets its parts in a grid, every pin labeled with its net
function modelSheet(model: any): { elms: CircuitElm[]; opts: SheetOptions } {
    const xml = new CircuitXMLDeserializer(CirSim.theApp);
    const children = model.elmDoc ? [...model.elmDoc.documentElement.children] as Element[] : [];
    const elms: CircuitElm[] = [], nodes: number[][] = [];
    const laidOut = children.every(c => c.tagName === "ccm" || c.getAttribute("x") != null);
    for (const child of children) {
        const className = CirSim.xmlDumpTypeMap.get(child.tagName);
        if (child.tagName === "ccm" || className == null)
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
export function exportKicadProject(elms: CircuitElm[], project: string): KicadProject {
    const root = new KicadExporter(elms);
    root.export();
    const warnings = [...root.warnings];

    const sheets = new Map<any, { exp: KicadExporter; file: string; uuid: string; elms: CircuitElm[] }>();
    const fileNames = new Set([project + ".kicad_sch"]);
    const build = (model: any, depth: number) => {
        if (sheets.has(model) || depth > 8)
            return;
        const { elms: modelElms, opts } = modelSheet(model);
        const exp = new KicadExporter(modelElms, opts);
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
