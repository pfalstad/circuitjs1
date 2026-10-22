import { describe, it, expect, beforeAll } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { ResistorElm } from "./ResistorElm";
import { GroundElm } from "./GroundElm";
import { WireElm } from "./WireElm";
import { RailElm } from "./RailElm";
import { ACRailElm } from "./ACRailElm";
import { VarRailElm } from "./VarRailElm";
import { SweepElm } from "./SweepElm";
import { VoltageElm } from "./VoltageElm";
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

    it("exports a sweep as a sine source at its starting frequency", () => {
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
        expect(res.text).toContain('"Sim.Params" "dc=0 ampl=5 f=20"');
    });

    it("replaces a wire that would short to a post on another net with labels", () => {
        // in CircuitJS a wire passing over a post doesn't connect to it; in KiCad it would
        const elms = [
            place(new WireElm(0, 0), 0, 0, 128, 0),
            place(new ResistorElm(0, 0), 64, 0, 64, 64),
            place(new ResistorElm(0, 0), 0, 0, 0, 64),
            place(new ResistorElm(0, 0), 128, 0, 128, 64),
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
