import { describe, it, expect, beforeAll } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { ResistorElm } from "./ResistorElm";
import { GroundElm } from "./GroundElm";
import { WireElm } from "./WireElm";
import { RailElm } from "./RailElm";
import { ACRailElm } from "./ACRailElm";
import { DiodeElm } from "./DiodeElm";
import { NandGateElm } from "./NandGateElm";
import { XorGateElm } from "./XorGateElm";
import { LogicInputElm } from "./LogicInputElm";
import { AndGateElm } from "./AndGateElm";
import { SevenSegElm } from "./SevenSegElm";
import { KICAD_SYMBOLS } from "./KicadSymbols";
import { exportKicadSchematic, kicadValue, symbolOffset } from "./KicadExporter";

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

describe("KiCad export", () => {
    beforeAll(() => {
        const off = { getState: () => false };
        // the elements only read menu checkboxes while being built
        (CircuitElm as any).app = (CircuitElm as any).app ?? { menus: new Proxy({}, { get: () => off }) };
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
        expect(syms.map(s => s[0]).sort()).toEqual(["Device:R", "power:GND", "power:VCC"]);
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
        expect(text.match(/\(lib_id "power:VCC"\)/g)?.length).toBe(2);
    });

    it("puts a 6-input AND in an 8-input part with the spare inputs tied high", () => {
        const and: any = new AndGateElm(0, 0);
        and.inputCount = 6;
        const res = exportKicadSchematic([place(and, 0, 0, 96, 0)], "test");
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain('(property "Value" "CD4068B"');
        // the two spare inputs share a +5V symbol and the part's own Vdd pin has another
        expect(res.text.match(/\(property "Value" "\+5V"/g)?.length).toBe(2);
        expect(res.text.match(/\(lib_id "power:GND"\)/g)?.length).toBe(1);
    });

    it("exports a logic-mode 7-segment display as common cathode with the common grounded", () => {
        const seg = new SevenSegElm(0, 0);
        const res = exportKicadSchematic([seg], "test");
        expect(res.warnings).toEqual([]);
        // its two common pins are joined, with one ground symbol
        expect(symbols(res.text).map(s => s[0]).sort()).toEqual(["Display_Character:SC39-11EWA", "power:GND"]);
    });

    it("leaves out gates with no 74xx equivalent", () => {
        const xor: any = new XorGateElm(0, 0);
        xor.inputCount = 3;
        expect(exportKicadSchematic([place(xor, 0, 0, 96, 0)], "test").warnings).toEqual(["XorGate"]);
    });

    it("exports a logic input as a switch between the supply and ground", () => {
        const text = exportKicadSchematic([place(new LogicInputElm(0, 0), 0, 0, -32, 0)], "test").text;
        expect(symbols(text).map(s => s[0]).sort()).toEqual(["Switch:SW_SPDT", "power:GND", "power:VCC"]);
        expect(text).toContain('(property "Value" "+5V"');
    });
});
