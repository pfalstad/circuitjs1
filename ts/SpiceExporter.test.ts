import { describe, it, expect, beforeAll } from "vitest";
import { CircuitElm } from "./CircuitElm";
import { ResistorElm } from "./ResistorElm";
import { GroundElm } from "./GroundElm";
import { WireElm } from "./WireElm";
import { RailElm } from "./RailElm";
import { ACRailElm } from "./ACRailElm";
import { DiodeElm } from "./DiodeElm";
import { DCVoltageElm } from "./DCVoltageElm";
import { LogicOutputElm } from "./LogicOutputElm";
import { ProbeElm } from "./ProbeElm";
import { SCRElm } from "./SCRElm";
import { RelayCoilElm } from "./RelayCoilElm";
import { RelayContactElm } from "./RelayContactElm";
import { LampElm } from "./LampElm";
import { LabeledNodeElm } from "./LabeledNodeElm";
import { NTransistorElm } from "./NTransistorElm";
import { SwitchElm } from "./SwitchElm";
import { AnalogSwitchElm } from "./AnalogSwitchElm";
import { AnalogSwitch2Elm } from "./AnalogSwitch2Elm";
import { NandGateElm } from "./NandGateElm";
import { AndGateElm } from "./AndGateElm";
import { CapacitorElm } from "./CapacitorElm";
import { TimerElm } from "./TimerElm";
import { MonostableElm } from "./MonostableElm";
import { SchmittElm } from "./SchmittElm";
import { LogicInputElm } from "./LogicInputElm";
import { DFlipFlopElm } from "./DFlipFlopElm";
import { CounterElm } from "./CounterElm";
import { FullAdderElm } from "./FullAdderElm";
import { SevenSegDecoderElm } from "./SevenSegDecoderElm";
import { DACElm } from "./DACElm";
import { ChipElm } from "./ChipElm";
import { BusLogicInputElm } from "./BusLogicInputElm";
import { BusSplitterElm } from "./BusSplitterElm";
import { CustomLogicElm } from "./CustomLogicElm";
import { CustomLogicModel } from "./CustomLogicModel";
import { CirSim } from "./CirSim";
import { ElementFactory } from "./ElementFactory";
import { ExtListEntry } from "./ExtListEntry";
import { SubcircuitModel } from "./SubcircuitModel";
import { SubcircuitElm } from "./SubcircuitElm";
import { DPDTSwitchElm } from "./DPDTSwitchElm";
import { MBBSwitchElm } from "./MBBSwitchElm";
import { TriStateElm } from "./TriStateElm";
import { VCCSElm } from "./VCCSElm";
import { CrystalElm } from "./CrystalElm";
import { InductorElm } from "./InductorElm";
import { RelayElm } from "./RelayElm";
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
            { menus: new Proxy({}, { get: () => off }), snapGrid: (z: number) => Math.round(z / 8) * 8, mouse: {},
              deleteSliders: () => {} };
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
        // nothing to start from an initial condition, so SPICE starts from the operating point
        expect(res.text).toContain(".tran 1u 1m\n.end");
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
        const text = exportSpiceNetlist([c, place(new GroundElm(0, 0), 0, 0, 0, 16)]).text;
        expect(devices(text)[0]).toEqual(["C1", "0", "n1", "10u", "IC=-10"]);
        expect(text).toMatch(/^\.tran \S+ \S+ uic$/m);
    });

    it("lists what it can't export", () => {
        const mono = place(new MonostableElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([mono]);
        expect(res.warnings).toEqual(["Monostable"]);
        // and leaves a comment where it was
        expect(res.text).toContain("\n* XMonostable " + res.postNets.get(mono)!.join(" ") + "\n");
        expect(devices(res.text)).toEqual([]);
    });

    it("exports gates as 74HC parts, one instance per gate", () => {
        const nands = [0, 1, 2, 3, 4].map(i => place(new NandGateElm(0, 0), 0, i * 100, 64, i * 100));
        const res = exportSpiceNetlist(nands);
        expect(res.warnings).toEqual([]);
        // one definition: two inputs, multiplied, inverted, then a short lag
        expect(res.text.match(/^\.subckt .*/gm)).toEqual([".subckt 74HC00 a b y params: ic_y=0"]);
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
        expect(text).toContain("* 5-input AND gate, 5V logic\n.subckt AND5 a b c d e y params: ic_y=0\n");
        expect(text).toContain("* 2-input NAND gate, 3.3V logic\n.subckt NAND2 a b y params: ic_y=0\n");
        expect(devices(text).filter(l => l[0].startsWith("XU")).map(l => l[0] + " " + l[l.length - 1]))
            .toEqual(["XU1 AND5", "XU2 NAND2"]);
    });

    it("gives Schmitt triggers a state node", () => {
        const s = place(new SchmittElm(0, 0), 0, 0, 64, 0);
        const text = exportSpiceNetlist([s]).text;
        expect(text).toContain(".subckt 74HC7014 a y params: ic_st=0 ic_y=0\n");
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
        expect(res.text.match(/^\.subckt .*/gm)).toEqual([".subckt 74HC74 d q qb clk rb sb params: ic_st=0 ic_q=0 ic_qb=0",
                                                        ".subckt DFF d q qb clk params: ic_st=0 ic_q=0 ic_qb=0"]);
        // the master follows D while the clock is low; the state follows the master while it's high
        expect(res.text).toMatch(/^Bst_m st_m_raw 0 V=.*\(V\(l_clk\)\*V\(st_m\)\+\(1-V\(l_clk\)\)\*/m);
        expect(res.text).toMatch(/^Bst st_raw 0 V=.*\(V\(l_clk\)\*V\(st_m\)\+\(1-V\(l_clk\)\)\*V\(st\)\)/m);
        // (leaving out the state parameters: each starts with ~Q high)
        const x = devices(res.text).filter(l => l[0].startsWith("XU")).map(l => l.filter(w => !w.includes("=")));
        expect(x.map(l => l[0] + " " + l[l.length - 1])).toEqual(["XU1A 74HC74", "XU1B 74HC74", "XU2A 74HC74", "XU3 DFF"]);
        expect(x[3].slice(1, -1)).toEqual(res.postNets.get(plain));
        expect(res.text).toMatch(/^XU3 .* DFF ic_qb=5$/m);
    });

    it("gives counters a state bit for each output", () => {
        const c = place(new CounterElm(0, 0), 0, 0, 64, 0);
        c.modulus = 10;
        const text = exportSpiceNetlist([c]).text;
        expect(text).toContain("* 4-bit counter modulo 10, 5V logic, rising edge, reset active high\n" +
                               ".subckt COUNTER4_MOD10 clk r q3 q2 q1 q0 params: ic_st0=0 ic_st1=0 ic_st2=0 ic_st3=0 ic_q0=0 ic_q1=0 ic_q2=0 ic_q3=0\n");
        expect(text.match(/^Cst\d /gm)).toEqual(["Cst0 ", "Cst1 ", "Cst2 ", "Cst3 "]);
        expect(text).toMatch(/^Bout_q0 q0 0 V=V\(lag_q0\)$/m);
    });

    it("exports combinational chips", () => {
        const add = place(new FullAdderElm(0, 0), 0, 0, 64, 0);
        const seg = place(new SevenSegDecoderElm(0, 0), 0, 200, 64, 200);
        const dac = place(new DACElm(0, 0), 0, 400, 64, 400);
        const res = exportSpiceNetlist([add, seg, dac]);
        expect(res.warnings).toEqual([]);
        expect(res.text.match(/^\.subckt .*/gm)).toEqual([
            ".subckt 74HC283 a0 a1 a2 a3 b0 b1 b2 b3 s0 s1 s2 s3 cin c params: ic_s0=0 ic_s1=0 ic_s2=0 ic_s3=0 ic_c=0",
            ".subckt SEG7DEC a b c d e f g i3 i2 i1 i0 params: ic_a=0 ic_b=0 ic_c=0 ic_d=0 ic_e=0 ic_f=0 ic_g=0",
            ".subckt DAC4 d0 d1 d2 d3 o vp params: ic_o=0",
        ]);
        // each carry is on its own node, made from the last one
        expect(res.text).toMatch(/^Bc2 c2 0 V=V\(l_a1\)\*V\(l_b1\)\+V\(c1\)\*/m);
        // segment b is off only for 5, 6, b, c, e and f
        const b = res.text.match(/^Braw_b raw_b 0 V=5\*\((.*)\)$/m)![1];
        expect(b.split("+").length).toBe(10);
        expect(res.text).toMatch(/^Braw_o raw_o 0 V=V\(vp\)\*\(0\.0666667\*V\(l_d0\)\+0\.133333\*V\(l_d1\)/m);
    });

    it("gives each line of a bus a net of its own", () => {
        const add = new FullAdderElm(0, 0);
        add.bitOrder = ChipElm.BIT_ORDER_BUS;
        add.setupPins();
        place(add, 0, 0, 64, 0);
        const post = (e: any, n: number) => e.getPost(n);
        // a bus wire from each A, B and sum bus to a bus input or splitter
        const bus = (p: any, x: number, y: number) => {
            const w = place(new WireElm(0, 0), p.x, p.y, x, y);
            w.busWidth = 4;
            w.allocNodes();
            return w;
        };
        const inA = place(new BusLogicInputElm(0, 0), -64, post(add, 0).y, -96, post(add, 0).y);
        inA.value = 5;
        const inB = place(new BusLogicInputElm(0, 0), -64, 200, -96, 200);
        inB.value = 6;
        // B reaches the adder through a pair of bus labels
        const lb = [place(new LabeledNodeElm(0, 0), -64, 200, -64, 232), place(new LabeledNodeElm(0, 0), post(add, 4).x, post(add, 4).y, post(add, 4).x, post(add, 4).y + 32)];
        for (const l of lb) {
            l.text = "B";
            l.busWidth = 4;
            l.allocNodes();
        }
        const split = new BusSplitterElm(0, 0);
        const sp = post(add, 8);
        place(split, sp.x + 64, sp.y, sp.x + 128, sp.y);
        const elms = [add, inA, bus(post(add, 0), -64, post(add, 0).y), inB, ...lb, split, bus(sp, post(split, 0).x, post(split, 0).y)];
        const res = exportSpiceNetlist(elms);
        expect(res.warnings).toEqual([]);
        const nets = res.postNets.get(add)!;
        // the lines are four different nets, each driven by its own source
        const a = nets.slice(0, 4), b = nets.slice(4, 8);
        expect(new Set(a).size).toBe(4);
        expect(res.postNets.get(inA)).toEqual(a);
        expect(res.postNets.get(inB)).toEqual(b);
        expect(b).toEqual(["B_0", "B_1", "B_2", "B_3"]);
        expect(res.postNets.get(split)!.slice(0, 4)).toEqual(res.postNets.get(split)!.slice(4));
        expect(res.postNets.get(split)!.slice(0, 4)).toEqual(nets.slice(8, 12));
        const v = devices(res.text).filter(l => l[0].startsWith("V"));
        expect(v.map(l => l[1] + " " + l[4])).toEqual([...a.map((x, i) => x + " " + ((5 >> i) & 1 ? 5 : 0)),
                                                        ...b.map((x, i) => x + " " + ((6 >> i) & 1 ? 5 : 0))]);
    });

    it("exports custom logic from its rules", () => {
        const m = CustomLogicModel.getModelWithName("toggle");
        m.inputs = ["C"];
        m.outputs = ["Q"];
        m.rules = "+0=1\n+1=0";
        m.parseRules(null);
        CustomLogicElm.lastModelName = "toggle";
        const e = place(new CustomLogicElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([e]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt TOGGLE c q params: ic_dly0=0 ic_q=0 ic_drv_q=0\n* +0=1\n* +1=0\n");
        // a rule fires on the rising pulse, seeing the output as it was before the edge (the
        // slave, during a pulse) and otherwise as the rules last set it (the master)
        expect(res.text).toMatch(/^Br0 r0 0 V=V\(rise0\)\*\(1-\(V\(anyp\)\*V\(st0\)\+\(1-V\(anyp\)\)\*V\(m0\)\)\)$/m);
        expect(res.text).toMatch(/^Bf1 f1 0 V=V\(r1\)\*\(1-V\(r0\)\)$/m);
        // the slave follows the master except during the pulse
        expect(res.text).toMatch(/^Bst0 st0_raw 0 V=.*\(V\(anyp\)\*V\(st0\)\+\(1-V\(anyp\)\)\*V\(m0\)\)/m);
    });

    it("gives a subcircuit's bus pin a port for each line", () => {
        ElementFactory.registerClass("ResistorElm", ResistorElm as any);
        (CirSim as any).xmlDumpTypeMap = new Map([["r", "ResistorElm"]]);
        // a resistor from each line of bus D to G.  the loader only reads tagName and
        // getAttribute(), so stubs stand in for the model's elements
        const elm = (nn: string) => ({ tagName: "r", nodeType: 1, getAttribute: (k: string) => ({ nn, r: "1000" } as any)[k] ?? null });
        const elms = [elm("1 3"), elm("2 3")];
        const doc = { documentElement: { children: elms, childNodes: elms } } as unknown as Document;
        (globalThis as any).Node ??= class { static ELEMENT_NODE = 1; };
        const d0 = new ExtListEntry("D", 1, 0, 2), d1 = new ExtListEntry("D", 2, 0, 2);
        d0.busWidth = d1.busWidth = 2;
        d1.busZ = 1;
        // skip adding the built-in models, which needs a real DOM
        (SubcircuitModel.registry as any).initialized = true;
        SubcircuitModel.createModel("busres", doc, [d0, d1, new ExtListEntry("G", 3, 0, 3)]);
        const x = place(new SubcircuitElm(0, 0, "busres"), 0, 0, 64, 0);
        const res = exportSpiceNetlist([x]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt busres D_0 D_1 G\nR1 D_0 G 1k\nR2 D_1 G 1k\n.ends busres\n");
        const nets = res.postNets.get(x)!;
        expect(new Set(nets).size).toBe(3);
        expect(devices(res.text).find(l => l[0] === "X1")).toEqual(["X1", ...nets, "busres"]);
    });

    it("joins a switch's pole to its throw in its current position", () => {
        const dpdt = place(new DPDTSwitchElm(0, 0), 0, 0, 64, 0);
        dpdt.position = 1;
        const res = exportSpiceNetlist([dpdt]);
        expect(res.warnings).toEqual([]);
        const n = res.postNets.get(dpdt)!;
        // posts: each pole, then its two throws
        expect([n[0] === n[2], n[0] === n[1], n[3] === n[5], n[3] === n[4]]).toEqual([true, false, true, false]);
        // a make-before-break switch between throws, with resistance, has a resistor to each
        const mbb = place(new MBBSwitchElm(0, 0), 0, 100, 64, 100);
        mbb.position = 1;
        mbb.both = true;
        mbb.resistance = 10;
        const m = exportSpiceNetlist([mbb]);
        const mn = m.postNets.get(mbb)!;
        expect(devices(m.text).filter(l => !l[0].startsWith("Rfloat")))
            .toEqual([["R1", mn[0], mn[1], "10"], ["R2", mn[0], mn[2], "10"]]);
    });

    it("exports controlled sources as behavioral sources", () => {
        const g = place(new VCCSElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([g]);
        expect(res.warnings).toEqual([]);
        const [a, b, cp, cm] = res.postNets.get(g)!;
        // CircuitJS's VCCS pushes its current out of C+, which SPICE has as flowing into C-
        expect(devices(res.text).find(l => l[0] === "B1")).toEqual(["B1", cm, cp, `I=(0.1*(V(${a})-V(${b})))`]);
    });

    it("exports a tri-state buffer as an output through a switch", () => {
        const t = place(new TriStateElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([t]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt TRISTATE a0 y0 en params: ic_a0=0\n");
        expect(res.text).toMatch(/^S0 d0 y0 en 0 TRI$/m);
        expect(res.text).toMatch(/^R0 y0 0 100meg$/m);
    });

    it("exports a relay as a coil, an armature state and a switch per throw", () => {
        const r = place(new RelayElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([r]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt RELAY com0 nc0 no0 c1 c2 params: ic_i=0 ic_on=0 ic_pos=0\n");
        expect(res.text).toMatch(/^Lcoil coil coil_int /m);
        expect(res.text).toMatch(/^Soff0 com0 nc0 closed_off 0 RSW$/m);
        expect(res.text).toMatch(/^Son0 com0 no0 closed_on 0 RSW$/m);
        expect(res.text).toContain(".options method=gear\n");
        expect(devices(res.text).find(l => l[0] === "XU1")).toEqual(["XU1", ...res.postNets.get(r)!, "RELAY"]);
    });

    it("exports a 555 with its pins in the chip's order", () => {
        const t = place(new TimerElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([t]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt NE555 g tr out rst ctl th dis vcc params: ic_q=0\n");
        // posts: discharge, trigger, threshold, Vcc, control, output, reset, ground
        const n = res.postNets.get(t)!;
        expect(devices(res.text).find(l => l[0] === "XU1"))
            .toEqual(["XU1", n[7], n[1], n[5], n[6], n[4], n[2], n[0], n[3], "NE555"]);
    });

    it("exports an SCR as a latch and a switch", () => {
        const scr = place(new SCRElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([scr]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt SCR a c g params: ic_s=0\n");
        expect(res.text).toMatch(/^Son a1 i s 0 TSW$/m);
        expect(devices(res.text).find(l => l[0] === "XU1")).toEqual(["XU1", ...res.postNets.get(scr)!, "SCR"]);
    });

    it("exports a relay coil and its contacts, linked by their label", () => {
        const coil = place(new RelayCoilElm(0, 0), 0, 0, 0, 64);
        const no = place(new RelayContactElm(0, 0), 64, 0, 64, 64);
        const nc = place(new RelayContactElm(0, 0), 128, 0, 128, 64);
        nc.flags |= nc.FLAG_NORMALLY_CLOSED;
        const other = place(new RelayContactElm(0, 0), 192, 0, 192, 64);
        other.label = "other";
        const res = exportSpiceNetlist([coil, no, nc, other]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt RELAYCOIL c1 c2 a params: ic_i=0 ic_avg=0 ic_e=0 ic_a=0\n");
        const d = devices(res.text);
        expect(d.find(l => l[0] === "XU1")).toEqual(["XU1", ...res.postNets.get(coil)!, "relay_label", "RELAYCOIL"]);
        // the normally closed contact sees the position negated
        expect(d.find(l => l[0] === "S1")!.slice(1, 5)).toEqual([...res.postNets.get(no)!, "relay_label", "0"]);
        expect(d.find(l => l[0] === "S2")!.slice(1, 5)).toEqual([...res.postNets.get(nc)!, "0", "relay_label"]);
        // a contact without a coil stays where it is
        expect(d.find(l => l[0] === "R1")).toEqual(["R1", ...res.postNets.get(other)!, "50m"]);
    });

    it("exports a lamp with its filament's temperature", () => {
        const lamp = place(new LampElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([lamp]);
        expect(res.warnings).toEqual([]);
        expect(res.text).toContain(".subckt LAMP a b params: ic_dt=0\n");
        expect(res.text).toMatch(/^Cdt dt 0 1 IC=\{ic_dt\}$/m);
    });

    it("prints the outputs and the scopes' traces", () => {
        const v = place(new DCVoltageElm(0, 0), 0, 64, 0, 0);
        const r = place(new ResistorElm(0, 0), 0, 0, 64, 0);
        const out = place(new LogicOutputElm(0, 0), 64, 0, 64, 32);
        const g = place(new GroundElm(0, 0), 0, 64, 0, 96);
        const meter = place(new ProbeElm(0, 0), 64, 0, 64, 64);
        meter.label = "vout";
        const r2 = place(new ResistorElm(0, 0), 64, 0, 64, 64);
        const g2 = place(new GroundElm(0, 0), 64, 64, 64, 96);
        const res = exportSpiceNetlist([v, r, out, g, meter, r2, g2],
            { scopes: [{ elm: r, value: 0 }, { elm: v, value: 3 }, { elm: r2, value: 0 }] });
        expect(res.warnings).toEqual([]);
        // the voltmeter names the output's net
        expect(res.postNets.get(out)![0]).toBe("vout");
        const top = res.postNets.get(r)![0];
        expect(res.text).toMatch(new RegExp(`^\\.print tran V\\(vout\\) V\\(${top},vout\\) I\\(V1\\)$`, "m"));
        expect(res.text).toContain("* SPICE's source currents are into the + terminal");
    });

    it("exports an element made of others as a .subckt of them", () => {
        // CapacitorElm 1 2, CapacitorElm 1 3, InductorElm 3 4, ResistorElm 4 2
        for (const [name, c] of [["CapacitorElm", CapacitorElm], ["InductorElm", InductorElm], ["ResistorElm", ResistorElm]] as const)
            ElementFactory.registerClass(name, c as any);
        const x = place(new CrystalElm(0, 0), 0, 0, 64, 0);
        const res = exportSpiceNetlist([x]);
        expect(res.warnings).toEqual([]);
        const sub = res.text.match(/^\.subckt CRYSTAL[^]*?^\.ends CRYSTAL$/m)![0].split("\n");
        expect(sub[0]).toBe(".subckt CRYSTAL p0 p1");
        expect(sub.slice(1, -1).map(l => l.split(" ").slice(0, 3).join(" ")))
            .toEqual(["C1 p0 p1", "C2 p0 n1", "L1 n1 L1_int", "RL1 L1_int n2", "R1 n2 p1"]);
        expect(devices(res.text).find(l => l[0] === "X1")).toEqual(["X1", ...res.postNets.get(x)!, "CRYSTAL"]);
    });
});
