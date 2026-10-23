import { describe, it, expect, beforeAll } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { ResistorElm } from "./ResistorElm";
import { GroundElm } from "./GroundElm";
import { WireElm } from "./WireElm";
import { RailElm } from "./RailElm";
import { ACRailElm } from "./ACRailElm";
import { DiodeElm } from "./DiodeElm";
import { DCVoltageElm } from "./DCVoltageElm";
import { LabeledNodeElm } from "./LabeledNodeElm";
import { NTransistorElm } from "./NTransistorElm";
import { SwitchElm } from "./SwitchElm";
import { AnalogSwitchElm } from "./AnalogSwitchElm";
import { AnalogSwitch2Elm } from "./AnalogSwitch2Elm";
import { NandGateElm } from "./NandGateElm";
import { AndGateElm } from "./AndGateElm";
import { CapacitorElm } from "./CapacitorElm";
import { TimerElm } from "./TimerElm";
import { SchmittElm } from "./SchmittElm";
import { LogicInputElm } from "./LogicInputElm";
import { DFlipFlopElm } from "./DFlipFlopElm";
import { CounterElm } from "./CounterElm";
import { exportSpiceNetlist, spiceValue } from "./SpiceExporter";

function place(e: any, x1: number, y1: number, x2: number, y2: number) {
    e.x = x1; e.y = y1; e.x2 = x2; e.y2 = y2;
    e.setPoints();
    return e;
}

// the netlist's device lines, split into words
function devices(text: string): string[][] {
    return text.split("\n").filter(l => /^[A-Z]/.test(l)).map(l => l.split(" "));
}

describe("SPICE export", () => {
    beforeAll(() => {
        const off = { getState: () => false };
        // the elements only read menu checkboxes while being built, and snap to the grid
        (CircuitElm as any).app = (CircuitElm as any).app ??
            { menus: new Proxy({}, { get: () => off }), snapGrid: (z: number) => Math.round(z / 8) * 8 };
    });

    it("formats values with SPICE suffixes", () => {
        expect(spiceValue(4700)).toBe("4.7k");
        expect(spiceValue(1e6)).toBe("1meg");
        expect(spiceValue(1e-7)).toBe("100n");
        expect(spiceValue(0.5)).toBe("500m");
        expect(spiceValue(12)).toBe("12");
    });

    it("exports a divider between a rail and ground", () => {
        const rail = place(new RailElm(0, 0), 0, 0, 0, -32);
        rail.maxVoltage = 5;
        const elms = [
            rail,
            place(new ResistorElm(0, 0), 0, 0, 0, 64),
            place(new ResistorElm(0, 0), 0, 64, 0, 128),
            place(new WireElm(0, 0), 0, 128, 32, 128),
            place(new GroundElm(0, 0), 32, 128, 32, 144),
        ];
        const res = exportSpiceNetlist(elms, { timeStep: 1e-6, stopTime: 1e-3 });
        expect(res.warnings).toEqual([]);
        expect(devices(res.text)).toEqual([
            ["V1", "n1", "0", "DC", "5"],
            ["R1", "n1", "n2", "1k"],
            ["R2", "n2", "0", "1k"],
        ]);
        expect(res.text).toContain(".tran 1u 1m uic\n.end");
    });

    it("puts a source's + terminal first", () => {
        const v = place(new DCVoltageElm(0, 0), 0, 0, 0, -64);
        const g = place(new GroundElm(0, 0), 0, 0, 0, 16);
        const d = devices(exportSpiceNetlist([v, g]).text);
        expect(d[0].slice(0, 3)).toEqual(["V1", "n1", "0"]);
    });

    it("writes waveforms", () => {
        const rail = place(new ACRailElm(0, 0), 0, 0, 0, -32);
        rail.maxVoltage = 2;
        rail.frequency = 1000;
        expect(exportSpiceNetlist([rail]).text).toContain("V1 n1 0 SIN(0 2 1000 0 0 0)");
    });

    it("names nets after labeled nodes", () => {
        const elms = [
            place(new ResistorElm(0, 0), 0, 0, 64, 0),
            place(new LabeledNodeElm(0, 0), 64, 0, 64, -16),
            place(new ResistorElm(0, 0), 200, 0, 264, 0),
            place(new LabeledNodeElm(0, 0), 200, 0, 200, -16),
            place(new GroundElm(0, 0), 0, 0, 0, 16),
            place(new GroundElm(0, 0), 264, 0, 264, 16),
        ];
        (elms[1] as any).text = (elms[3] as any).text = "out 1";
        const d = devices(exportSpiceNetlist(elms).text);
        expect(d).toEqual([["R1", "0", "out_1", "1k"], ["R2", "out_1", "0", "1k"]]);
    });

    it("writes models for diodes and transistors", () => {
        const elms = [
            place(new DiodeElm(0, 0), 0, 0, 64, 0),
            place(new NTransistorElm(0, 0), 100, 0, 132, 0),
        ];
        const text = exportSpiceNetlist(elms).text;
        const d = devices(text);
        expect(d[0][0]).toBe("D1");
        expect(text).toMatch(new RegExp("^\\.model " + d[0][3] + " D \\(IS=", "m"));
        // Q collector base emitter
        const q = elms[1];
        expect(d[1][0]).toBe("Q1");
        expect(text).toMatch(new RegExp("^\\.model " + d[1][4] + " NPN \\(IS=.* BF=100 ", "m"));
        expect(d[1][2]).not.toBe(d[1][1]);
        expect(q.getPostCount()).toBe(3);
    });

    it("treats a closed ideal switch as a wire and leaves out an open one", () => {
        const closed = place(new SwitchElm(0, 0), 0, 0, 64, 0);
        closed.position = 0;
        const open = place(new SwitchElm(0, 0), 0, 100, 64, 100);
        open.position = 1;
        const elms = [
            closed, open,
            place(new ResistorElm(0, 0), 64, 0, 64, 100),
            place(new GroundElm(0, 0), 0, 0, 0, 16),
        ];
        const d = devices(exportSpiceNetlist(elms).text);
        expect(d.length).toBe(1);
        expect(d[0].slice(0, 2)).toEqual(["R1", "0"]);
    });

    it("grounds the first voltage source in a circuit with no ground", () => {
        const v = place(new DCVoltageElm(0, 0), 0, 64, 0, 0);
        const elms = [
            v,
            place(new ResistorElm(0, 0), 0, 0, 64, 0),
            place(new ResistorElm(0, 0), 64, 0, 64, 64),
            place(new WireElm(0, 0), 64, 64, 0, 64),
        ];
        expect(devices(exportSpiceNetlist(elms).text)[0].slice(0, 3)).toEqual(["V1", "n1", "0"]);
    });

    it("ties a floating part of the circuit to ground, as the simulator does", () => {
        const elms = [
            place(new DCVoltageElm(0, 0), 0, 64, 0, 0),
            place(new ResistorElm(0, 0), 0, 0, 0, 64),
            place(new GroundElm(0, 0), 0, 64, 0, 80),
            place(new ResistorElm(0, 0), 200, 0, 264, 0),
        ];
        const d = devices(exportSpiceNetlist(elms).text);
        expect(d.filter(l => l[0].startsWith("Rfloat")).map(l => l.slice(2))).toEqual([["0", "100meg"]]);
    });

    it("starts capacitors at their initial voltage", () => {
        const c = place(new CapacitorElm(0, 0), 0, 0, 64, 0);
        c.initialVoltage = -10;
        expect(devices(exportSpiceNetlist([c, place(new GroundElm(0, 0), 0, 0, 0, 16)]).text)[0])
            .toEqual(["C1", "0", "n1", "10u", "IC=-10"]);
    });

    it("lists what it can't export", () => {
        const timer = place(new TimerElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([timer]);
        expect(res.warnings).toEqual(["Timer"]);
        // and leaves a comment where it was
        expect(res.text).toContain("\n* XTimer " + res.postNets.get(timer)!.join(" ") + "\n");
        expect(devices(res.text)).toEqual([]);
    });

    it("exports gates as 74HC parts, one instance per gate", () => {
        const nands = [0, 1, 2, 3, 4].map(i => place(new NandGateElm(0, 0), 0, i * 100, 64, i * 100));
        const res = exportSpiceNetlist(nands);
        expect(res.warnings).toEqual([]);
        // one definition: two inputs, multiplied, inverted, then a short lag
        expect(res.text.match(/^\.subckt .*/gm)).toEqual([".subckt 74HC00 a b y"]);
        expect(res.text).toMatch(/^Braw raw 0 V=5\*\(1-\(0\.5\*\(1\+tanh\(8\*\(V\(a\)-\(2\.5\)\)\)\)\*0\.5\*.*V\(b\)/m);
        expect(res.text).toMatch(/^Bout y 0 V=V\(lag\)$/m);
        // four gates to a package
        const x = devices(res.text).filter(l => l[0].startsWith("XU"));
        expect(x.map(l => l[0])).toEqual(["XU1A", "XU1B", "XU1C", "XU1D", "XU2A"]);
        expect(x[0].slice(1)).toEqual([...res.postNets.get(nands[0])!, "74HC00"]);
    });

    it("names gates without a usual part after what they are", () => {
        const and5 = place(new AndGateElm(0, 0), 0, 0, 64, 0);
        and5.inputCount = 5;
        and5.setPoints();
        const nand = place(new NandGateElm(0, 0), 0, 100, 64, 100);
        nand.highVoltage = 3.3;
        const text = exportSpiceNetlist([and5, nand]).text;
        expect(text).toContain("* 5-input AND gate, 5V logic\n.subckt AND5 a b c d e y\n");
        expect(text).toContain("* 2-input NAND gate, 3.3V logic\n.subckt NAND2 a b y\n");
        expect(devices(text).filter(l => l[0].startsWith("XU")).map(l => l[0] + " " + l[l.length - 1]))
            .toEqual(["XU1 AND5", "XU2 NAND2"]);
    });

    it("gives Schmitt triggers a state node", () => {
        const s = place(new SchmittElm(0, 0), 0, 0, 64, 0);
        const text = exportSpiceNetlist([s]).text;
        expect(text).toContain(".subckt 74HC7014 a y\n");
        expect(text).toMatch(/^Bst_a st_raw_a 0 V=0\.5\*\(1\+tanh\(\S+\*\(V\(a\)-\(3\.33\+-1\.67\*V\(st_a\)\)\)\)\)$/m);
        expect(text).toMatch(/^Braw raw 0 V=0\+5\*V\(st_a\)$/m);
    });

    it("exports analog switches as voltage-controlled switches", () => {
        const sw = place(new AnalogSwitchElm(0, 0), 0, 0, 64, 0);
        const sw2 = place(new AnalogSwitch2Elm(0, 0), 0, 100, 64, 100);
        sw2.flags = (sw2.flags | sw2.FLAG_INVERT) & ~sw2.FLAG_PULLDOWN;
        const res = exportSpiceNetlist([sw, sw2]);
        expect(res.warnings).toEqual([]);
        const [a, b, c] = res.postNets.get(sw)!;
        const [com, no, nc, ctl] = res.postNets.get(sw2)!;
        expect(res.text).toContain(".model S_analog SW (VT=2.5 VH=0 RON=20 ROFF=1t)\n");
        expect(res.text).toContain(".model S_analog_3 SW (VT=2.5 VH=0 RON=20 ROFF=10g)\n");
        expect(res.text).toContain(".model S_analog_2 SW (VT=-2.5 VH=0 RON=20 ROFF=10g)\n");
        const d = devices(res.text).filter(l => !l[0].startsWith("Rfloat"));
        expect(d).toEqual([
            ["S1", a, b, c, "0", "S_analog"],
            ["R1", a, "0", "10g"],
            ["R2", b, "0", "10g"],
            // swapped, so the first throw closes when the control is low
            ["S2", com, no, "0", ctl, "S_analog_2"],
            ["S3", com, nc, ctl, "0", "S_analog_3"],
        ]);
    });

    it("exports flip-flops as parts named after their chips, with a master and slave state", () => {
        const dffs = [0, 1, 2].map(i => {
            const d = place(new DFlipFlopElm(0, 0), 0, i * 100, 64, i * 100);
            d.flags |= DFlipFlopElm.FLAG_SET | DFlipFlopElm.FLAG_INVERT_SET_RESET;
            d.setupPins();
            d.allocNodes();
            d.setPoints();
            return d;
        });
        const plain = place(new DFlipFlopElm(0, 0), 0, 300, 64, 300);
        const res = exportSpiceNetlist([...dffs, plain]);
        expect(res.warnings).toEqual([]);
        expect(res.text.match(/^\.subckt .*/gm)).toEqual([".subckt 74HC74 d q qb clk rb sb", ".subckt DFF d q qb clk"]);
        // the master follows D while the clock is low; the state follows the master while it's high
        expect(res.text).toMatch(/^Bst_m st_m_raw 0 V=.*\(V\(l_clk\)\*V\(st_m\)\+\(1-V\(l_clk\)\)\*/m);
        expect(res.text).toMatch(/^Bst st_raw 0 V=.*\(V\(l_clk\)\*V\(st_m\)\+\(1-V\(l_clk\)\)\*V\(st\)\)/m);
        const x = devices(res.text).filter(l => l[0].startsWith("XU"));
        expect(x.map(l => l[0] + " " + l[l.length - 1])).toEqual(["XU1A 74HC74", "XU1B 74HC74", "XU2A 74HC74", "XU3 DFF"]);
        expect(x[3].slice(1, -1)).toEqual(res.postNets.get(plain));
    });

    it("gives counters a state bit for each output", () => {
        const c = place(new CounterElm(0, 0), 0, 0, 64, 0);
        c.modulus = 10;
        const text = exportSpiceNetlist([c]).text;
        expect(text).toContain("* 4-bit counter modulo 10, 5V logic, rising edge, reset active high\n" +
                               ".subckt COUNTER4_MOD10 clk r q3 q2 q1 q0\n");
        expect(text.match(/^Cst\d /gm)).toEqual(["Cst0 ", "Cst1 ", "Cst2 ", "Cst3 "]);
        expect(text).toMatch(/^Bout_q0 q0 0 V=V\(lag_q0\)$/m);
    });
});
