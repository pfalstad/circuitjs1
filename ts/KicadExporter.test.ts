import { describe, it, expect, beforeAll } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { ResistorElm } from "./ResistorElm";
import { GroundElm } from "./GroundElm";
import { WireElm } from "./WireElm";
import { BusLogicInputElm } from "./BusLogicInputElm";
import { BusSplitterElm } from "./BusSplitterElm";
import { Counter2Elm } from "./Counter2Elm";
import { ChipElm } from "./ChipElm";
import { RailElm } from "./RailElm";
import { ACRailElm } from "./ACRailElm";
import { VarRailElm } from "./VarRailElm";
import { SweepElm } from "./SweepElm";
import { VoltageElm } from "./VoltageElm";
import { DCVoltageElm } from "./DCVoltageElm";
import { DiodeElm } from "./DiodeElm";
import { NandGateElm } from "./NandGateElm";
import { XorGateElm } from "./XorGateElm";
import { LogicInputElm } from "./LogicInputElm";
import { AndGateElm } from "./AndGateElm";
import { SevenSegElm } from "./SevenSegElm";
import { RelayElm } from "./RelayElm";
import { TextElm } from "./TextElm";
import { AnalogSwitchElm } from "./AnalogSwitchElm";
import { AnalogSwitch2Elm } from "./AnalogSwitch2Elm";
import { NDarlingtonElm } from "./NDarlingtonElm";
import { CounterElm } from "./CounterElm";
import { LatchElm } from "./LatchElm";
import { VCVSElm } from "./VCVSElm";
import { DFlipFlopElm } from "./DFlipFlopElm";
import { LabeledNodeElm } from "./LabeledNodeElm";
import { NoiseElm } from "./NoiseElm";
import { OpAmpElm } from "./OpAmpElm";
import { RelayCoilElm } from "./RelayCoilElm";
import { RelayContactElm } from "./RelayContactElm";
import { TriodeElm } from "./TriodeElm";
import { TransistorElm } from "./TransistorElm";
import { MosfetElm } from "./MosfetElm";
import { SwitchElm } from "./SwitchElm";
import { CapacitorElm } from "./CapacitorElm";
import { InductorElm } from "./InductorElm";
import { TransformerElm } from "./TransformerElm";
import { TappedTransformerElm } from "./TappedTransformerElm";
import { ControlledVoltageElm } from "./ControlledVoltageElm";
import { ControlledCurrentElm } from "./ControlledCurrentElm";
import { AmmeterElm } from "./AmmeterElm";
import { ProbeElm } from "./ProbeElm";
import { KICAD_SYMBOLS } from "./KicadSymbols";
import { describe as describePart, exportKicadSchematic, exportKicadProject, hasLayout, KicadExporter, kicadValue, spiceExpr, symbolOffset } from "./KicadExporter";
import { CirSim } from "./CirSim";

function place(e: any, x1: number, y1: number, x2: number, y2: number) {
    e.x = x1; e.y = y1; e.x2 = x2; e.y2 = y2;
    e.setPoints();
    return e;
}

// [lib_id, at x, at y, angle, mirrored] for each placed symbol
function symbols(text: string): [string, number, number, number, boolean][] {
    const re = /\(lib_id "([^"]+)"\)\n\t\t\(at ([-\d.]+) ([-\d.]+) (\d+)\)\n(\t\t\(mirror x\)\n)?/g;
    return [...text.matchAll(re)].map(m => [m[1], +m[2], +m[3], +m[4], m[5] !== undefined]);
}

// the symbols for one supply: its power symbol and ground, and its source for simulation with
// its own power symbol and ground
const SUPPLY_SOURCE = ["Simulation_SPICE:VDC", "power:GND", "power:GND", "power:VCC", "power:VCC"];

describe("KiCad export", () => {
    beforeAll(() => {
        const off = { getState: () => false };
        // the elements only read menu checkboxes while being built
        (CircuitElm as any).app = (CircuitElm as any).app ?? { menus: new Proxy({}, { get: () => off }) };
        (CircuitElm as any).app.snapGrid ??= (x: number) => x;
    });

    it("formats component values", () => {
        expect(kicadValue(4700)).toBe("4.7k");
        expect(kicadValue(1e-7)).toBe("100n");
        expect(kicadValue(1e6)).toBe("1M");
        expect(kicadValue(0.5, "V")).toBe("500mV");
        expect(kicadValue(999.9)).toBe("1k");
        expect(kicadValue(-12, "V")).toBe("-12V");
    });

    // KiCad rotates a symbol and then mirrors it (checked against kicad-cli netlists)
    it("places symbol pins the way KiCad does", () => {
        const plus: [number, number] = [-7.62, 2.54];
        expect(symbolOffset(plus, { angle: 0, mirror: false })).toEqual({ x: -6, y: -2 });
        expect(symbolOffset(plus, { angle: 90, mirror: false })).toEqual({ x: -2, y: 6 });
        expect(symbolOffset(plus, { angle: 90, mirror: true })).toEqual({ x: -2, y: -6 });
        expect(symbolOffset(plus, { angle: 180, mirror: true })).toEqual({ x: 6, y: -2 });
    });

    it("exports a resistor between a supply and ground", () => {
        const elms = [
            place(new RailElm(0, 0), 0, 0, 0, -32),
            place(new ResistorElm(0, 0), 0, 0, 0, 64),
            place(new GroundElm(0, 0), 0, 64, 0, 80),
        ];
        (elms[0] as any).maxVoltage = 5;
        const res = exportKicadSchematic(elms, "test");
        expect(res.warnings).toEqual([]);
        const syms = symbols(res.text);
        expect(syms.map(s => s[0]).sort()).toEqual(["Device:R", ...SUPPLY_SOURCE].sort());
        expect(res.text).toContain('(property "Value" "+5V"');
        expect(res.text).toContain('(property "Value" "1k"');
        // the 64 pixel resistor is 20.32mm long, vertical, centered between its posts
        const r = syms.find(s => s[0] === "Device:R")!;
        expect(r[3] % 180).toBe(0);
        const supply = syms.find(s => s[0] === "power:VCC")!;
        const gnd = syms.find(s => s[0] === "power:GND")!;
        expect(gnd[2] - supply[2]).toBeCloseTo(20.32);
        expect(r[2]).toBeCloseTo((gnd[2] + supply[2]) / 2);
        expect(res.text).toContain(KICAD_SYMBOLS.R.def);
    });

    it("puts the diode's cathode (KiCad pin 1) on CircuitJS post 1", () => {
        const d = place(new DiodeElm(0, 0), 0, 0, 64, 0);
        const syms = symbols(exportKicadSchematic([d], "test").text);
        // Device:D has its cathode on the left at angle 0, so a diode drawn left to right is turned around
        expect(syms[0][3]).toBe(180);
    });

    it("exports an AC rail as a source to ground", () => {
        const rail = place(new ACRailElm(0, 0), 0, 0, 0, -32);
        const res = exportKicadSchematic([rail], "test");
        expect(symbols(res.text).map(s => s[0]).sort()).toEqual(["Simulation_SPICE:VSIN", "power:GND"]);
        expect(res.text).toMatch(/"Sim.Params" "dc=0 ampl=169.706 f=60"/);
    });

    it("exports triangle and sawtooth rails as pulse sources", () => {
        const rail: any = place(new ACRailElm(0, 0), 0, 0, 0, -32);
        rail.waveform = VoltageElm.WF_TRIANGLE;
        rail.frequency = 1000; rail.maxVoltage = 5; rail.bias = 0;
        let res = exportKicadSchematic([rail], "test");
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain('"Sim.Params" "y1=-5 y2=5 td=0 tr=0.0005 tf=0.0005 tw=0 per=0.001"');
        rail.waveform = VoltageElm.WF_SAWTOOTH;
        res = exportKicadSchematic([rail], "test");
        expect(res.text).toContain('"Sim.Params" "y1=-5 y2=5 td=0 tr=0.000999 tf=0.000001 tw=0 per=0.001"');
    });

    it("exports a variable rail as a DC source at its present voltage", () => {
        // the constructor makes the slider, which needs a page
        const rail: any = Object.setPrototypeOf(place(new ACRailElm(0, 0), 0, 0, 0, -32), VarRailElm.prototype);
        rail.waveform = VoltageElm.WF_VAR;
        rail.frequency = 2.5;
        const res = exportKicadSchematic([rail], "test");
        expect(res.warnings).toEqual([]);
        expect(symbols(res.text).map(s => s[0]).sort()).toEqual(["Simulation_SPICE:VDC", "power:GND"]);
        expect(res.text).toContain('"Sim.Params" "dc=2.5"');
    });

    it("exports a sweep as a sine source at its starting frequency, simulated as a sweep", () => {
        const sim = CircuitElm.sim;
        (CircuitElm as any).sim = { timeStep: 1e-6 };
        let sweep;
        try {
            sweep = place(new SweepElm(0, 0), 0, 0, 0, -32);
        } finally {
            (CircuitElm as any).sim = sim;
        }
        const res = exportKicadSchematic([sweep], "test");
        expect(res.warnings).toEqual([]);
        expect(symbols(res.text).map(s => s[0]).sort()).toEqual(["Simulation_SPICE:VSIN", "power:GND"]);
        expect(res.text).toContain('(property "Value" "5V 20Hz-4kHz"');
        // simulated as the SPICE export sweeps it
        expect(res.text).toMatch(/"Sim.Name" "VSIN_\w+"/);
        // (the one Sim.Params is the library symbol's)
        expect(res.text.match(/"Sim\.Params"/g)!.length).toBe(1);
    });

    it("replaces a wire that would short to a post on another net with labels", () => {
        // in CircuitJS a wire passing over a post doesn't connect to it; in KiCad it would
        const elms = [
            place(new WireElm(0, 0), 0, 0, 128, 0),
            place(new ResistorElm(0, 0), 64, 0, 64, 64),
            place(new ResistorElm(0, 0), 0, 0, 0, 64),
            place(new ResistorElm(0, 0), 128, 0, 128, 64),
            // (grounded, so they aren't tied to ground for simulation)
            place(new GroundElm(0, 0), 0, 64, 0, 96),
            place(new GroundElm(0, 0), 64, 64, 64, 96),
        ];
        const res = exportKicadSchematic(elms, "test");
        // 0,0 to 128,0 in CircuitJS is 25.4 to 66.04mm on the sheet
        expect(res.text).not.toContain("(xy 25.4 25.4) (xy 66.04 25.4)");
        expect(res.text.match(/\(label /g)?.length).toBe(2);
    });

    it("lists elements it can't export", () => {
        class GizmoElm extends CircuitElm {}
        const res = exportKicadSchematic([place(new GizmoElm(0, 0), 0, 0, 64, 0)], "test");
        expect(res.warnings).toEqual(["Gizmo"]);
        expect(res.text).toContain('(text "?Gizmo"');
    });

    it("packs gates four to a 74HC00, each package with its supply unit", () => {
        const gates = [0, 1, 2, 3, 4].map(i => place(new NandGateElm(0, 0), 0, i * 96, 96, i * 96));
        const text = exportKicadSchematic(gates, "test").text;
        const units = [...text.matchAll(/\(reference "(U\d)"\) \(unit (\d)\)/g)].map(m => m[1] + m[2]);
        expect(units.sort()).toEqual(["U11", "U12", "U13", "U14", "U15", "U21", "U25"]);
        expect(text).toContain('(property "Value" "74HC00"');
        expect(text.match(/\(lib_id "power:VCC"\)/g)?.length).toBe(3);
    });

    it("puts a 6-input AND in an 8-input part with the spare inputs tied high", () => {
        const and: any = new AndGateElm(0, 0);
        and.inputCount = 6;
        const res = exportKicadSchematic([place(and, 0, 0, 96, 0)], "test");
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain('(property "Value" "CD4068B"');
        // the two spare inputs share a +5V symbol and the part's own Vdd pin has another
        expect(res.text.match(/\(property "Value" "\+5V"/g)?.length).toBe(3);
        expect(res.text.match(/\(lib_id "power:GND"\)/g)?.length).toBe(2);
    });

    it("exports a logic-mode 7-segment display as common cathode with the common grounded", () => {
        const seg = new SevenSegElm(0, 0);
        const res = exportKicadSchematic([seg], "test");
        expect(res.warnings).toEqual([]);
        // its two common pins are joined, with one ground symbol
        expect(symbols(res.text).map(s => s[0]).sort()).toEqual(["Display_Character:SC39-11EWA", "power:GND"]);
    });

    it("puts XOR gates with more than 2 inputs in a parity chip", () => {
        const xor: any = new XorGateElm(0, 0);
        xor.inputCount = 3;
        const exp = new KicadExporter([place(xor, 0, 0, 96, 0)]);
        exp.export();
        expect(exp.warnings).toEqual([]);
        // the odd output, and the spare inputs grounded
        expect(exp.pinMap.get(xor)![3]).toBe("6");
        const res = exportKicadSchematic([xor], "test");
        expect(res.text).toContain('(property "Value" "74HC280"');
        xor.inputCount = 10;
        expect(exportKicadSchematic([place(xor, 0, 0, 96, 0)], "test").warnings).toEqual(["XorGate"]);
    });

    it("exports analog switches as CD4066 and CD4053 sections", () => {
        const sw: any = place(new AnalogSwitchElm(0, 0), 0, 0, 64, 0);
        let exp = new KicadExporter([sw]);
        exp.export();
        expect(exp.pinMap.get(sw)!.slice().sort()).toEqual(["1", "13", "2"]);
        // normally closed: X and X0, which are joined while A is low
        sw.flags |= sw.FLAG_INVERT;
        exp = new KicadExporter([sw]);
        exp.export();
        expect(exp.pinMap.get(sw)).toEqual(["14", "12", "11"]);
        const sw2: any = place(new AnalogSwitch2Elm(0, 0), 0, 0, 64, 0);
        exp = new KicadExporter([sw2]);
        exp.export();
        expect(exp.warnings).toEqual([]);
        expect(exp.pinMap.get(sw2)).toEqual(["14", "13", "12", "11"]);
    });

    it("connects an op-amp's supplies to its output limits", () => {
        const op: any = place(new OpAmpElm(0, 0), 0, 0, 64, 0);
        let res = exportKicadSchematic([op], "test");
        expect(res.text).toContain('(property "Value" "+15V"');
        expect(res.text).toContain('(property "Value" "-15V"');
        op.maxOut = 5; op.minOut = 0;
        res = exportKicadSchematic([op], "test");
        expect(symbols(res.text).map(s => s[0]).sort()).toEqual(["Simulation_SPICE:OPAMP", ...SUPPLY_SOURCE].sort());
        expect(res.text).toContain('(property "Value" "+5V"');
    });

    it("adds a source for each supply, for simulation", () => {
        const op: any = place(new OpAmpElm(0, 0), 0, 0, 64, 0);
        const res = exportKicadSchematic([op], "test");
        // +15V and -15V, each from a source to ground
        expect(res.text.match(/\(lib_id "Simulation_SPICE:VDC"\)/g)?.length).toBe(2);
        expect(res.text).toContain('"Sim.Params" "dc=15"');
        expect(res.text).toContain('"Sim.Params" "dc=-15"');
        // with no supplies, there's nothing to add
        expect(exportKicadSchematic([place(new ResistorElm(0, 0), 0, 0, 0, 64)], "test").text).not.toContain("VDC");
    });

    it("exports a Darlington pair", () => {
        // its parts can't be made here, but only its type matters
        const q = Object.assign(Object.create(NDarlingtonElm.prototype), { pnp: 1 });
        expect(describePart(q)).toMatchObject({ sym: "DARL_NPN", pins: ["1", "2", "3"], value: "TIP120" });
    });

    it("exports a counter as a 74HC161, or as a box when no part fits", () => {
        const ctr: any = place(new CounterElm(0, 0), 0, 0, 64, 0);
        ctr.invertreset = true;
        let exp = new KicadExporter([ctr]);
        exp.export();
        expect(exp.warnings).toEqual([]);
        // clock, reset, then the outputs from the most significant
        expect(exp.pinMap.get(ctr)).toEqual(["2", "1", "11", "12", "13", "14"]);
        ctr.flags |= CounterElm.FLAG_UP_DOWN;
        ctr.setupPins();
        place(ctr, 0, 0, 64, 0);
        const res = exportKicadSchematic([ctr], "test");
        expect(res.warnings).toEqual([]);
        const [box] = symbols(res.text);
        expect(box[0]).toMatch(/^CircuitJS:Counter_[0-9a-f]{8}$/);
        // laid out as CircuitJS draws it, so it needs no turning and its pins land on the posts
        expect(box.slice(3)).toEqual([0, false]);
        expect(res.text).not.toContain("(wire ");
        expect(res.text).toContain('(name "U/D"');
    });

    it("exports a 4-bit register as a 74HC175", () => {
        const reg = place(new LatchElm(0, 0), 0, 0, 64, 0);
        const exp = new KicadExporter([reg]);
        exp.export();
        expect(exp.warnings).toEqual([]);
        expect(exp.pinMap.get(reg)).toEqual(["4", "5", "12", "13", "2", "7", "10", "15", "9"]);
    });

    it("exports a D flip-flop with active-high reset as a CD4013", () => {
        const ff: any = new DFlipFlopElm(0, 0);
        ff.flags |= DFlipFlopElm.FLAG_RESET;
        ff.setupPins();
        const exp = new KicadExporter([place(ff, 0, 0, 64, 0)]);
        exp.export();
        expect(exp.warnings).toEqual([]);
        expect(exp.pinMap.get(ff)).toEqual(["5", "1", "2", "3", "4"]);
    });

    it("exports a noise source", () => {
        const res = exportKicadProject([place(new NoiseElm(0, 0), 0, 0, 0, -32)], "test", 5e-6);
        expect(res.warnings).toEqual([]);
        expect(res.files[0].text).toContain('(property "Value" "Noise"');
        expect(res.files[0].text).toContain('"Sim.Params" "ts=0.000005 td=0 range=5 offset=0"');
    });

    it("translates expressions for behavioral sources", () => {
        expect(spiceExpr(".1*(a-b)", ["/x", "0"])).toBe(".1*(V(/x)-V(0))");
        expect(spiceExpr("5*sin(400*2*pi*t)", [])).toBe("5*sin(400*2*pi*time)");
        expect(spiceExpr("lastoutput+a*timestep", ["/x"])).toBe(null);
    });

    it("exports a VCVS as a behavioral source reading its inputs by name", () => {
        const vcvs: any = place(new VCVSElm(0, 0), 0, 0, 64, 0);
        vcvs.exprString = "2*a-b";
        const a = vcvs.getPost(0), b = vcvs.getPost(1);
        const lbl: any = place(new LabeledNodeElm(0, 0), a.x, a.y, a.x - 32, a.y);
        lbl.text = "in";
        const res = exportKicadSchematic([vcvs, lbl, place(new GroundElm(0, 0), b.x, b.y, b.x - 32, b.y)], "test");
        expect(res.warnings).toEqual([]);
        expect(symbols(res.text).map(s => s[0])).toContain("Simulation_SPICE:BSOURCE");
        expect(res.text).toContain('"Sim.Params" "type=\\"B\\" model=\\"v=2*V(/in)-V(0)\\""');
    });

    it("exports a controlled voltage source reading a labeled node and a voltmeter", () => {
        // the source from ground up to a resistor, + at the top; a voltmeter across the resistor
        const cv: any = place(new ControlledVoltageElm(0, 0), 0, 64, 0, 0);
        cv.setExpr("2*v(in)+v(m)");
        const r = place(new ResistorElm(0, 0), 0, 0, 64, 0);
        const meter: any = place(new ProbeElm(0, 0), 0, 0, 64, 0);
        meter.label = "m";
        const lbl: any = place(new LabeledNodeElm(0, 0), 64, 0, 64, 32);
        lbl.text = "in";
        const elms = [cv, r, meter, lbl, place(new GroundElm(0, 0), 0, 64, 0, 96)];
        const exp = new KicadExporter(elms);
        exp.export();
        expect(exp.pinMap.get(cv)).toEqual(["2", "1"]);
        const { text, warnings } = exportKicadSchematic(elms, "test");
        expect(warnings).toEqual([]);
        expect(text).toContain('"Sim.Device" "SPICE"');
        // the voltmeter's ends are labeled, the one at the source's + with an automatic name
        // (the last is the placed source's; the first is the library symbol's)
        const m = [...text.matchAll(/"Sim.Params" "type=\\"B\\" model=\\"v=(.*?)\\""/g)].pop()!;
        expect(m[1]).toMatch(/^\(\(2\*V\(\/in\)\)\+V\(\/(\w+),\/in\)\)$/);
        const auto = m[1].match(/V\(\/(\w+),/)![1];
        expect(text).toContain(`(label "${auto}"`);
    });

    it("exports an ammeter a controlled current source reads as a 0V source", () => {
        const ci: any = place(new ControlledCurrentElm(0, 0), 128, 0, 128, 64);
        ci.setExpr("2*i(a)");
        const amm: any = place(new AmmeterElm(0, 0), 0, 0, 64, 0);
        amm.label = "a";
        const elms = [place(new DCVoltageElm(0, 0), 0, 64, 0, 0), amm, place(new ResistorElm(0, 0), 64, 0, 64, 64),
                      place(new WireElm(0, 0), 0, 64, 64, 64), place(new GroundElm(0, 0), 0, 64, 0, 96),
                      ci, place(new ResistorElm(0, 0), 128, 64, 160, 64), place(new GroundElm(0, 0), 128, 0, 128, -32)];
        const exp = new KicadExporter(elms);
        exp.export();
        // the current comes out of post 1, into pin 2
        expect(exp.pinMap.get(ci)).toEqual(["1", "2"]);
        expect(exp.pinMap.get(amm)).toEqual(["1", "2"]);
        const { text, warnings } = exportKicadSchematic(elms, "test");
        expect(warnings).toEqual([]);
        const ref = text.match(/model=\\"i=\(2\*I\((V\d+)\)\)\\"/)![1];
        expect(text).toMatch(new RegExp(`"Reference" "${ref}"[^]*?"Value" "0V"`));
        // the second resistor's far end goes nowhere, which doesn't need tying to ground
        expect(text).not.toContain('"100M"');
    });

    it("puts a transformer's windings on its primary and secondary pins, with a model", () => {
        for (const reverse of [false, true]) {
            const t: any = new TransformerElm(0, 0);
            if (reverse)
                t.flags |= TransformerElm.FLAG_REVERSE;
            t.polarity = reverse ? -1 : 1;
            place(t, 0, 0, 64, 0);
            const exp = new KicadExporter([t]);
            exp.export();
            const pins = exp.pinMap.get(t)!;
            // the primary is posts 0 and 2, the secondary 1 and 3
            expect([pins[0], pins[2]].sort()).toEqual(["1", "2"]);
            expect([pins[1], pins[3]].sort()).toEqual(["3", "4"]);
        }
        const t = place(new TransformerElm(0, 0), 0, 0, 64, 0);
        const res = exportKicadProject([t], "test");
        const lib = res.files.find(f => f.name === "test.lib")!.text;
        const name = lib.match(/\.subckt (XFMR_\w+) p1 s1 p2 s2/)![1];
        expect(lib).toContain("K1 L1 L2 0.999");
        const sch = res.files[0].text;
        expect(sch).toContain(`"Sim.Name" "${name}"`);
        expect(sch).toContain('"Sim.Library" "test.lib"');
        expect(sch).toContain('"Sim.Pins" "1=p1 4=s1 2=p2 3=s2"');
    });

    it("exports a tapped transformer with its center tap on the middle pin", () => {
        const t = place(new TappedTransformerElm(0, 0), 0, 0, 64, 0);
        const res = exportKicadProject([t], "test");
        expect(res.warnings).toEqual([]);
        expect(res.root.pinMap.get(t)).toEqual(["1", "2", "5", "4", "3"]);
        expect(res.files.find(f => f.name === "test.lib")!.text).toMatch(/L2 s1 ct \S+\nL3 ct s2 /);
    });

    it("grounds a circuit without one where the simulator does", () => {
        const src = place(new DCVoltageElm(0, 0), 0, 64, 0, 0);
        const { text } = exportKicadSchematic([src, place(new ResistorElm(0, 0), 0, 0, 0, 64)], "test");
        // at the source's first post
        expect(symbols(text).filter(s => s[0] === "power:GND").length).toBe(1);
        expect(text).not.toContain('"100M"');
    });

    it("ties a part of the circuit with no path to ground to it, for simulation", () => {
        const loop = [place(new DCVoltageElm(0, 0), 0, 64, 0, 0), place(new ResistorElm(0, 0), 0, 0, 0, 64)];
        const grounded = [place(new ResistorElm(0, 0), 128, 0, 128, 64), place(new GroundElm(0, 0), 128, 64, 128, 96)];
        // a 100M resistor to ground, from the source's first post, as the simulator ties it
        const text = exportKicadSchematic([...loop, ...grounded], "test").text;
        expect(text.match(/\(property "Value" "100M"/g)!.length).toBe(1);
        const [, name] = text.match(/\(label "([^"]+)" \(at [\d.]+ ([\d.]+)/)!;
        expect(text.match(new RegExp(`\\(label "${name}"`, "g"))!.length).toBe(2);
        expect(exportKicadSchematic([...loop, place(new GroundElm(0, 0), 0, 64, 0, 96)], "test").text).not.toContain('"100M"');
    });

    // a placed part's property (the last; the first is the library symbol's)
    const prop = (text: string, name: string) =>
        [...text.matchAll(new RegExp(`\\(property "${name.replace(".", "\\.")}" "((?:[^"\\\\]|\\\\.)*)"`, "g"))].pop()?.[1];

    // a part with a post grounded (the first, unless given), so it isn't tied to ground for simulation
    const grounded = (ce: CircuitElm, j = 0) => {
        const p = ce.getPost(j)!;
        return [ce, place(new GroundElm(0, 0), p.x, p.y, p.x, p.y + 32)];
    };

    it("gives diodes, transistors and mosfets KiCad's models, with their parameters", () => {
        const d = exportKicadSchematic(grounded(place(new DiodeElm(0, 0), 0, 0, 64, 0)), "test").text;
        expect(prop(d, "Sim.Device")).toBe("D");
        expect(prop(d, "Sim.Params")).toMatch(/^is=\S+ n=\S+/);
        const q = exportKicadSchematic(grounded(place(new TransistorElm(0, 0), 0, 0, 64, 0)), "test").text;
        expect(prop(q, "Sim.Device")).toBe("NPN");
        expect(prop(q, "Sim.Type")).toBe("GUMMELPOON");
        expect(prop(q, "Sim.Params")).toMatch(/\bbf=100\b/);
        const m = exportKicadSchematic(grounded(place(new MosfetElm(0, 0, false), 0, 0, 64, 0), 1), "test").text;
        expect(prop(m, "Sim.Type")).toBe("MOS1");
        // with its body on its source
        expect(prop(m, "Sim.Pins")).toBe("1=S 2=G 3=D 1=B");
        expect(prop(m, "Sim.Params")).toMatch(/^vto=\S+ kp=/);
    });

    it("gives a capacitor its initial voltage, and a series resistance a model", () => {
        const c: any = place(new CapacitorElm(0, 0), 0, 0, 64, 0);
        c.initialVoltage = 3;
        const text = exportKicadSchematic(grounded(c), "test").text;
        expect(prop(text, "Sim.Params")).toBe("c=0.00001 ic=3");
        const l: any = place(new InductorElm(0, 0), 0, 0, 64, 0);
        l.seriesResistance = 2;
        const lib = exportKicadProject([l], "test").files.find(f => f.name === "test.lib")!.text;
        expect(lib).toMatch(/L1 a m 1 IC=0\nR1 m b 2\n/);
    });

    it("models a part KiCad has no model for from the SPICE export of its gates", () => {
        const g1 = place(new NandGateElm(0, 0), 0, 0, 64, 0), g2 = place(new NandGateElm(0, 0), 0, 96, 64, 96);
        const res = exportKicadProject([g1, g2, place(new ResistorElm(0, 0), 128, 0, 128, 64)], "test");
        const lib = res.files.find(f => f.name === "test.lib")!.text;
        // both gates are in one 74HC00, whose model has the SPICE export's gates on their pins
        const [, name, pins] = lib.match(/^\.subckt (74HC00_\w+) ((?:n\d+ ?)+)$/m)!;
        expect(pins.trim().split(" ").length).toBe(6);
        expect(lib.match(/^XU\w+ n\d+ n\d+ n\d+ 74HC00\b/gm)!.length).toBe(2);
        const sch = res.files[0].text;
        expect(sch).toContain(`"Sim.Name" "${name}"`);
        // the resistor is KiCad's own
        expect(lib).not.toMatch(/^\.subckt R_/m);
    });

    it("models a switch as set", () => {
        for (const position of [0, 1]) {
            const sw: any = place(new SwitchElm(0, 0), 0, 0, 64, 0);
            sw.position = position;
            const lib = exportKicadProject([sw], "test").files.find(f => f.name === "test.lib")!.text;
            expect(lib).toContain(position === 0 ? "R1 a b 1u" : "R1 a b 1T");
        }
    });

    it("models a logic input as connected to its level's supply, whichever pin that's on", () => {
        for (const position of [0, 1]) {
            const li: any = place(new LogicInputElm(0, 0), 0, 0, -32, 0);
            li.position = position;
            const res = exportKicadProject([li], "test");
            const sch = res.files[0].text, lib = res.files.find(f => f.name === "test.lib")!.text;
            // (which pin is which, kicad-compare checks against the simulator)
            const pins = sch.match(/"Sim\.Pins" "(\S+=out[^"]*|[^"]*=out\b[^"]*)"/)![1];
            expect(pins.split(" ").map(p => p.split("=")[1]).sort()).toEqual(["hi", "lo", "out"]);
            expect(lib).toContain(`out ${position === 1 ? "hi" : "lo"} 1u`);
        }
    });

    it("exports a logic input as a switch between the supply and ground", () => {
        const text = exportKicadSchematic([place(new LogicInputElm(0, 0), 0, 0, -32, 0)], "test").text;
        expect(symbols(text).map(s => s[0]).sort()).toEqual([...SUPPLY_SOURCE, "Switch:SW_SPDT"].sort());
        expect(text).toContain('(property "Value" "+5V"');
    });

    it("exports a relay with its contacts and coil on the right pins", () => {
        const relay = place(new RelayElm(0, 0), 0, 0, 64, 0);
        const exp = new KicadExporter([relay]);
        exp.export();
        expect(exp.warnings).toEqual([]);
        const pins = exp.pinMap.get(relay)!;
        expect(pins.slice(0, 3)).toEqual(["11", "12", "14"]);
        expect(pins.slice(3).sort()).toEqual(["A1", "A2"]);
    });

    it("lays out a relay's coil and contacts the way CircuitJS does", () => {
        // coil posts are below the contacts, left and right; ground the right one
        const relay = place(new RelayElm(0, 0), 0, 0, 64, 0);
        const left = relay.getPost(3), right = relay.getPost(4);
        const elms = [relay,
            place(new ResistorElm(0, 0), left.x, left.y, left.x - 64, left.y),
            place(new GroundElm(0, 0), right.x, right.y, right.x, right.y + 16)];
        const text = exportKicadSchematic(elms, "test").text;
        // the coil and contacts are all wired straight to their posts
        expect(text).not.toContain("(label ");
        expect(text.match(/\(lib_id "power:GND"\)/g)?.length).toBe(1);
    });

    it("makes linked relay coils and contacts the units of one relay", () => {
        const coil = place(new RelayCoilElm(0, 0), 0, 0, 0, 64);
        const no = place(new RelayContactElm(0, 0), 96, 0, 96, 64);
        const nc = place(new RelayContactElm(0, 0), 192, 0, 192, 64);
        nc.flags |= nc.FLAG_NORMALLY_CLOSED;
        const other = place(new RelayContactElm(0, 0), 288, 0, 288, 64);
        other.label = "other";
        const exp = new KicadExporter([coil, no, nc, other]);
        exp.export();
        expect(exp.warnings).toEqual([]);
        expect(exp.pinMap.get(coil)!.slice().sort()).toEqual(["A1", "A2"]);
        expect(exp.pinMap.get(no)!.slice().sort()).toEqual(["13", "14"]);
        expect(exp.pinMap.get(nc)!.slice().sort()).toEqual(["21", "22"]);
        expect(exp.refs.get(no)).toBe(exp.refs.get(coil));
        expect(exp.refs.get(nc)).toBe(exp.refs.get(coil));
        expect(exp.refs.get(other)).not.toBe(exp.refs.get(coil));
        // (less the resistors tying each to ground for simulation)
        const text = exportKicadSchematic([coil, no, nc, other], "test").text;
        expect(symbols(text).map(s => s[0]).filter(s => s !== "Device:R" && s !== "power:GND").sort()).toEqual(
            ["CircuitJS:Relay_Coil_NO_NC", "CircuitJS:Relay_Coil_NO_NC", "CircuitJS:Relay_Coil_NO_NC", "CircuitJS:Relay_NO"]);
    });

    it("puts triodes two to an ECC83, with the heater on 6.3V", () => {
        const tubes = [0, 1, 2].map(i => place(new TriodeElm(0, 0), i * 128, 0, i * 128 + 32, 0));
        const exp = new KicadExporter(tubes);
        exp.export();
        expect(exp.warnings).toEqual([]);
        expect(exp.pinMap.get(tubes[0])).toEqual(["6", "7", "8"]);
        expect(exp.pinMap.get(tubes[1])).toEqual(["1", "2", "3"]);
        expect(exp.refs.get(tubes[1])).toBe(exp.refs.get(tubes[0]));
        expect(exp.refs.get(tubes[2])).not.toBe(exp.refs.get(tubes[0]));
        const text = exportKicadSchematic(tubes, "test").text;
        expect(text).toContain('(property "Value" "+6.3V"');
    });

    it("exports a bus as a KiCad bus, with a net for each line", () => {
        // a bus logic input, a bus wire to a splitter, and a resistor on each line
        const input = place(new BusLogicInputElm(0, 0), 0, 0, 0, 0);
        input.busWidth = 4;
        const splitter = place(new BusSplitterElm(0, 0), 64, 0, 96, 0);
        const wire = place(new WireElm(0, 0), 0, 0, 64, 0);
        const lines = [0, 1, 2, 3].map(i => {
            const p = splitter.getPost(4 + i);
            return place(new ResistorElm(0, 0), p.x, p.y, p.x + 64, p.y);
        });
        const elms = [input, wire, splitter, ...lines];
        const exp = new KicadExporter(elms);
        exp.export();
        expect(exp.warnings).toEqual([]);
        const text = exportKicadSchematic(elms, "test").text;
        expect(text).toContain("(bus (pts");
        expect(text.match(/\(bus_entry /g)?.length).toBe(4);
        expect(text).toContain('(label "BUS1_[0..3]"');
        // each line's resistor and the input's pin for it are on the line's net
        for (let i = 0; i !== 4; i++)
            expect(text.match(new RegExp(`\\(label "BUS1_${i}"`, "g"))?.length).toBe(2);
    });

    it("gives a chip's bus pin a pin for each line, and moves the pins after it along", () => {
        const c: any = new Counter2Elm(0, 0);
        c.bitOrder = ChipElm.BIT_ORDER_BUS;
        c.setupPins();
        place(c, 0, 0, 32, 0);
        const d: any = describePart(c);
        expect(d.symbol.names).toMatchObject({ 1: "Q3", 2: "Q2", 3: "Q1", 4: "Q0" });
        // the lines 2.54mm apart, and the pins below them as far apart as before, lower down
        const y = (n: number) => d.symbol.pins[String(n)][1];
        expect([4, 3, 2, 1].map(n => y(n) - y(4))).toEqual([0, -2.54, -5.08, -7.62]);
        const pins = c.pins.slice(0, c.getPostCount()).map((p: any) => p.text);
        const load = pins.indexOf("LOAD") + 1, ent = pins.indexOf("EnT") + 1;
        expect(y(load) - y(ent)).toBeCloseTo(10.16);
        expect(y(1) - y(load)).toBeCloseTo(10.16);
    });

    it("uses a subcircuit's layout even when it holds a relay model", () => {
        const elm = (tagName: string, attrs: Record<string, string>) =>
            ({ tagName, getAttribute: (k: string) => attrs[k] ?? null }) as unknown as Element;
        CirSim.xmlDumpTypeMap.set("rl", "RelayElm");
        const relay = elm("rl", { x: "0 0 64 0" }), model = elm("rlm", { nm: "default" });
        expect(hasLayout([model, relay])).toBe(true);
        expect(hasLayout([model, elm("rl", {})])).toBe(false);
    });

    it("breaks text into lines where CircuitJS does", () => {
        const t: any = new TextElm(0, 0);
        t.text = "first\\nsecond";
        const text = exportKicadSchematic([t], "test").text;
        // KiCad reads \n in a string as a line break
        expect(text).toContain('(text "first\\nsecond"');
    });
});
