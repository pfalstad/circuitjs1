import { test, expect, Sim } from "./fixtures";
import * as fs from "fs";

// Builds the TD4 4-bit CPU (public/circuits/td4.txt) from scratch with the mouse and keyboard,
// the way a user would: draw its command decoder and make that into a subcircuit (arranging
// its pins), then clear the canvas and build the CPU, setting each part's properties as it
// goes.  Then checks the result against the file, and runs the program in its ROM, which
// sweeps a lit LED back and forth across the four output LEDs.

type Pt = [number, number];

// a part: the tool to draw it with (a shortcut key, or one of the menu items in `tools`),
// where to drag it from and to, and what to do to it after: type its text (a label's name,
// say) into its properties, set other properties, mirror it, or click it (to turn on a
// logic input).  `route` is the path a routed wire takes.  A routed wire finds its own way
// around what's already there, but it can be dragged to go through a point (`via`) instead.
interface Part {
    tool: string; from: Pt; to: Pt;
    text?: string; props?: Props; then?: "Mirror X" | "Mirror Y" | "click";
    route?: string; via?: Pt;
}
// properties to set: dropdowns, checkboxes, text fields and multi-line text fields, by label
interface Props {
    choices?: Record<string, string>; checks?: Record<string, boolean>;
    fields?: Record<string, string>; areas?: Record<string, string>;
}

const logic = "Logic Gates, Input and Output", chips = "Digital Chips";
const tools: Record<string, string[]> = {
    or:       [logic, "Add OR Gate"],
    nand:     [logic, "Add NAND Gate"],
    busInput: [logic, "Add Bus Input"],
    counter:  [chips, "Add Counter w/ Load (9316)"],
    mux:      [chips, "Add Multiplexer"],
    adder:    [chips, "Add Adder"],
    splitter: [chips, "Add Bus Splitter"],
    dff:      [chips, "Add D Flip-Flop"],
    rom:      [chips, "Add ROM"],
    clock:    ["Inputs and Sources", "Add Clock"],
    insDisp:  ["Outputs and Labels", "Add Instruction Display"],
    decoder:  ["Subcircuits", "Add decoder"],
};
const toolType: Record<string, string> = {
    w: "WireElm", "Shift+W": "RoutedWireElm", b: "LabeledNodeElm", r: "ResistorElm", l: "LEDElm",
    g: "GroundElm", i: "LogicInputElm", "Shift+V": "RailElm", t: "TextElm", "1": "InverterElm",
    or: "OrGateElm", nand: "NandGateElm", busInput: "BusLogicInputElm", counter: "Counter2Elm",
    mux: "MultiplexerElm", adder: "FullAdderElm", splitter: "BusSplitterElm", dff: "DFlipFlopElm",
    rom: "ROMElm", clock: "ClockElm", insDisp: "InstructionDisplayElm", decoder: "SubcircuitElm",
};

const w = (from: Pt, to: Pt, props?: Props): Part => ({ tool: "w", from, to, props });
const rw = (route: string, props?: Props, via?: Pt): Part => {
    const pts = route.split(";").map(p => p.split(",").map(Number) as Pt);
    return { tool: "Shift+W", from: pts[0], to: pts[pts.length - 1], route, props, via };
};
const label = (from: Pt, to: Pt, text: string): Part => ({ tool: "b", from, to, text });
const ground = (at: Pt, len = 16): Part => ({ tool: "g", from: at, to: [at[0], at[1] + len] });
const signalGround = (at: Pt, len = 16): Part => ({ ...ground(at, len), props: { choices: { Symbol: "Signal" } } });
// text goes where the drag ends; these are on the grid points nearest where they are in the file
const text = (at: Pt, s: string): Part => ({ tool: "t", from: [at[0] - 16, at[1]], to: at, text: s });
const busOrder = { choices: { "Bit Order": "Bus" } };
const showBus = { checks: { "Show Bus Value": true } };

// the command decoder, which becomes the "decoder" subcircuit
const decoder: Part[] = [
    { tool: "or",   from: [1824, 368], to: [1984, 368] },
    { tool: "1",    from: [1680, 448], to: [1776, 448] },
    { tool: "or",   from: [1824, 464], to: [1984, 464] },
    { tool: "nand", from: [1824, 560], to: [1984, 560] },
    { tool: "nand", from: [1824, 656], to: [1984, 656], props: { fields: { "# of Inputs": "3" } } },
    { tool: "or",   from: [1664, 672], to: [1824, 672] },
    { tool: "or",   from: [1664, 768], to: [1824, 768] },
    label([1664, 688], [1600, 688], "D4"),
    label([1680, 352], [1616, 352], "D6"),
    label([1824, 768], [1872, 768], "SEL_A"),
    w([1664, 688], [1664, 752]),
    label([1664, 656], [1600, 656], "/CARRY"),
    label([1648, 784], [1568, 784], "D7"),
    w([1648, 784], [1664, 784]),
    w([1776, 448], [1824, 448]),
    w([1808, 384], [1824, 384]),
    w([1808, 480], [1824, 480]),
    w([1808, 576], [1824, 576]),
    w([1808, 656], [1824, 656]),
    w([1808, 656], [1808, 576]),
    w([1808, 576], [1808, 480]),
    w([1808, 480], [1808, 384]),
    rw("1776,448;1776,544;1824,544"),
    w([1824, 352], [1760, 352]),
    label([1984, 368], [2032, 368], "/LOAD0"),
    label([1984, 464], [2032, 464], "/LOAD1"),
    label([1984, 560], [2032, 560], "/LOAD2"),
    label([1984, 656], [2032, 656], "/LOAD3"),
    w([1680, 352], [1680, 448]),
    w([1680, 352], [1760, 352]),
    rw("1680,448;1680,624;1824,624;1824,640"),
    rw("1648,784;1648,384;1808,384"),
];

const romContents = "0: B1 B2 B4 B8 B4 B2 B1 B2\n8: B4 B8 B4 B2 F0\n";
const instructions = [
    "0-0xF=ADD A, {a}", "0x10-0x1F=MOV A, B", "0x20-0x2F=IN A", "0x30-0x3F=MOV A,{a & 15}",
    "0x40-0x4F=MOV B,A", "0x50-0x5F=ADD B, {a & 15}", "0x60-0x6F=IN B", "0x70-0x7F=MOV B,{a & 15}",
    "0x90-0x9F=OUT B", "0xB0-0xBF=OUT {a & 15}", "0xE0-0xEF=JNC {a & 15}", "0xF0-0xFF=JUMP {a & 15}",
].join("\n");

// the CPU
const cpu: Part[] = [
    // the labels (first, since routed wires go around them)
    text([528, 256], "A"),
    text([544, 464], "B"),
    text([528, 864], "PC"),
    text([624, 720], "Out"),
    text([1312, 720], "Command Decoder"),
    text([288, 624], "In"),
    text([1168, 976], "Current Instruction"),
    // the A, B, output and PC registers (counters with load inputs)
    { tool: "counter", from: [496, 288], to: [528, 288], props: busOrder },
    label([592, 352], [640, 352], "/LOAD0"),
    label([384, 352], [336, 352], "/RESET"),
    w([432, 352], [496, 352]),
    label([368, 288], [304, 288], "CLOCK"),
    w([464, 288], [496, 288]),
    w([464, 496], [496, 496]),
    w([432, 560], [496, 560]),
    label([592, 560], [640, 560], "/LOAD1"),
    { tool: "counter", from: [496, 496], to: [528, 496], props: busOrder },
    { tool: "counter", from: [496, 704], to: [528, 704], props: busOrder },
    label([592, 768], [640, 768], "/LOAD2"),
    w([432, 768], [496, 768]),
    w([464, 704], [496, 704]),
    { tool: "counter", from: [496, 896], to: [528, 896], props: busOrder },
    label([592, 960], [640, 960], "/LOAD3"),
    w([432, 960], [496, 960]),
    w([464, 896], [496, 896]),
    w([464, 288], [464, 496]),
    w([464, 496], [464, 704]),
    w([464, 704], [464, 896]),
    w([432, 352], [432, 560]),
    w([432, 768], [432, 960]),
    w([432, 768], [432, 560]),
    w([496, 320], [448, 320]),
    w([448, 320], [448, 528]),
    w([448, 528], [496, 528]),
    w([448, 528], [448, 736]),
    w([448, 736], [496, 736]),
    w([448, 736], [448, 928]),
    w([448, 928], [496, 928]),
    // the data selector, and the adder
    { tool: "mux", from: [752, 320], to: [784, 320], props: { choices: { "Input Mode": "Bus Input/Output" } } },
    w([592, 320], [752, 320], showBus),
    rw("592,528;720,528;720,352;752,352", showBus, [720, 352]),
    label([816, 480], [816, 512], "SEL_A"),
    label([848, 480], [848, 544], "SEL_B"),
    { tool: "adder", from: [928, 320], to: [960, 320], props: busOrder },
    w([880, 320], [928, 320]),
    rw("1024,384;1040,384;1040,224;448,224;448,320", showBus, [448, 224]),
    { tool: "busInput", from: [752, 416], to: [752, 496] },
    { tool: "splitter", from: [256, 672], to: [288, 672], then: "Mirror X" },
    { tool: "splitter", from: [688, 1056], to: [720, 1056], then: "Mirror Y" },
    // the output LEDs
    { tool: "r", from: [784, 1056], to: [880, 1056] },
    { tool: "r", from: [784, 1088], to: [880, 1088] },
    { tool: "r", from: [784, 1120], to: [880, 1120] },
    { tool: "r", from: [784, 1152], to: [880, 1152] },
    { tool: "l", from: [880, 1152], to: [880, 1216] },
    signalGround([880, 1216]),
    signalGround([928, 384]),
    signalGround([592, 384], 32),
    signalGround([496, 384], 32),
    signalGround([496, 592], 32),
    signalGround([592, 592], 32),
    signalGround([496, 800], 32),
    signalGround([592, 800], 32),
    signalGround([912, 1216]),
    { tool: "l", from: [912, 1152], to: [912, 1216] },
    signalGround([944, 1216]),
    { tool: "l", from: [944, 1152], to: [944, 1216] },
    signalGround([976, 1216]),
    { tool: "l", from: [976, 1152], to: [976, 1216] },
    rw("880,1120;912,1120;912,1152"),
    rw("880,1088;944,1088;944,1152"),
    rw("880,1056;976,1056;976,1152"),
    // (the point it's dragged through stays on its path, even though it's not a corner)
    rw("592,736;688,736;688,800;688,1152", undefined, [688, 800]),
    { tool: "splitter", from: [960, 752], to: [1024, 752], props: { fields: { "# of Bits": "8" } } },
    { tool: "splitter", from: [1056, 880], to: [1088, 880], then: "Mirror X" },
    rw("928,352;896,352;896,720;1152,720;1152,880", showBus),
    // the command decoder
    { tool: "decoder", from: [1312, 768], to: [1328, 784] },
    rw("1056,848;1296,848;1296,768;1312,768"),
    rw("1056,784;1312,784;1312,800"),
    rw("1056,752;1072,752;1072,832;1312,832"),
    label([1472, 768], [1520, 768], "/LOAD0"),
    label([1472, 800], [1520, 800], "/LOAD1"),
    label([1472, 832], [1520, 832], "/LOAD2"),
    label([1472, 864], [1520, 864], "/LOAD3"),
    label([1472, 896], [1520, 896], "SEL_A"),
    rw("848,480;1088,480;1088,816;1056,816"),
    // the input switches
    { tool: "i", from: [256, 672], to: [224, 672] },
    { tool: "i", from: [256, 704], to: [224, 704] },
    { tool: "i", from: [256, 736], to: [224, 736] },
    { tool: "i", from: [256, 768], to: [224, 768], then: "click" },
    rw("752,384;704,384;704,672;352,672", undefined, [704, 672]),
    // the carry flag
    { tool: "dff", from: [1184, 320], to: [1232, 320],
      props: { checks: { "Reset Pin": true, "Invert Set/Reset": true } } },
    w([1024, 320], [1184, 320]),
    label([1184, 352], [1136, 352], "CLOCK"),
    label([1184, 384], [1136, 384], "/RESET"),
    // the reset switch and the clock
    { tool: "i", from: [384, 352], to: [384, 400], then: "click" },
    { tool: "clock", from: [368, 288], to: [368, 208], props: { fields: { "Frequency (Hz)": "1000" } } },
    w([368, 288], [464, 288]),
    rw("1280,384;1280,864;1312,864"),
    w([592, 928], [656, 928], showBus),
    w([656, 928], [800, 928]),
    { tool: "Shift+V", from: [496, 992], to: [464, 992] },
    { tool: "Shift+V", from: [592, 992], to: [624, 992] },
    w([896, 928], [896, 752]),
    w([896, 752], [960, 752]),
    // the instruction display, and the ROM with the program
    rw("896,928;896,1024;1200,1024", { checks: { "Show Bus Value (Hex)": true } }),
    { tool: "insDisp", from: [1200, 1024], to: [1264, 1024],
      props: { fields: { "Bus Width": "8" }, areas: { "Lookup Table": instructions } } },
    w([384, 352], [432, 352]),
    { tool: "rom", from: [800, 896], to: [832, 896],
      props: { choices: { "Bit Order": "Bus" }, fields: { "# of Data Bits": "8" },
               checks: { "Hex Display": true }, areas: { Contents: romContents } } },
    { tool: "i", from: [800, 896], to: [768, 896] },
];

// a dump of a circuit, as a sorted list of its elements (and its subcircuit models' elements),
// each with its attributes in order, for comparing two circuits.  Text labels are compared
// without their positions, which in the file aren't on the grid.
function normalizedDump(dump: string): string[] {
    const doc = new DOMParser().parseFromString(dump, "text/xml");
    const out: string[] = [];
    const add = (el: Element, prefix: string) => {
        const attrs = [...el.attributes]
            .filter(a => !(el.tagName === "x" && a.name === "x"))
            .map(a => `${a.name}="${a.value}"`).sort().join(" ");
        const body = el.children.length === 0 ? (el.textContent ?? "").trim() : "";
        out.push(`${prefix}<${el.tagName} ${attrs}>${body}`);
    };
    for (const el of doc.documentElement.children) {
        add(el, "");
        if (el.tagName === "ccm")
            for (const c of el.children)
                add(c, `ccm ${el.getAttribute("nm")}: `);
    }
    return out.sort();
}

test.use({ viewport: { width: 2300, height: 1400 } });    // (big enough to fit it all in)

test("build the TD4 CPU from scratch, and it runs its program", async ({ sim, page }) => {
    // (it has a lot of parts)
    test.setTimeout(10 * 60_000);

    const describe = (p: Part) => `${p.tool} ${p.from} to ${p.to}` + (p.text != null ? ` "${p.text}"` : "");
    let lastTool = "";
    let menuPicks = 0;
    const build = async (p: Part) => {
        // pick the tool, if it isn't the one already picked: by its shortcut key, or from the
        // Draw menu, or (every other time) from the same menu by right-clicking an empty spot
        if (p.tool !== lastTool) {
            if (tools[p.tool] == null)
                await page.keyboard.press(p.tool);
            else if (menuPicks++ % 2 === 0)
                await sim.menu("Draw", ...tools[p.tool]);
            else
                await sim.contextMenu(1200, 96, ...tools[p.tool]);
            lastTool = p.tool;
        }
        await sim.drag(...p.from, ...p.to);

        if (p.via != null) {
            // switch to the select tool, and drag the wire (by the middle of its longest
            // segment) to where it should go through
            await page.keyboard.press(" ");
            lastTool = "";
            await sim.analyzed();
            const grab: Pt = await page.evaluate(([from, to]) => {
                const e = (window as any).__app.elmList.find((e: any) => e.routePoints != null &&
                    e.x === from[0] && e.y === from[1] && e.x2 === to[0] && e.y2 === to[1]);
                const pts = e.routePoints;
                let best = 0, bestLen = -1;
                for (let i = 0; i < pts.length - 1; i++) {
                    const len = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
                    if (len > bestLen) { best = i; bestLen = len; }
                }
                return [(pts[best].x + pts[best + 1].x) / 2, (pts[best].y + pts[best + 1].y) / 2];
            }, [p.from, p.to]);
            await sim.drag(...grab, ...p.via);
        }
        if (p.text == null && p.props == null && p.then == null)
            return;

        // then switch to the select tool to work on it, once the circuit's been analyzed with
        // it in (which can change what properties it has, like a wire carrying a bus)
        await page.keyboard.press("Escape");
        await sim.analyzed();
        lastTool = "";
        const type = toolType[p.tool];
        const at = p.tool === "t" ? p.to : p.from;
        if (p.then === "click") {
            await sim.click(...p.to);    // (a logic input's switch is the box at its end)
            return;
        }
        if (p.then != null) {
            await sim.clickElm(...at, { type, button: "right" });
            await page.locator(".elmContextMenu:visible").getByText(p.then, { exact: true }).click();
            return;
        }
        if (p.route != null) {
            // (a routed wire's middle may not be on it, if it bends: click its first segment)
            const [a, b] = p.route.split(";").map(q => q.split(",").map(Number));
            await sim.click((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        } else
            await sim.clickElm(...at, { type });
        await expect(sim.dialog).toBeVisible();
        if (p.text != null)
            await page.keyboard.type(p.text);    // (into the first field, which is focused)
        // (changing a dropdown can change which other properties there are, so do those first)
        for (const [name, v] of Object.entries(p.props?.choices ?? {}))
            await sim.choice(name).selectOption({ label: v });
        for (const [name, v] of Object.entries(p.props?.checks ?? {}))
            await sim.dialog.getByLabel(name, { exact: true }).setChecked(v);
        for (const [name, v] of Object.entries(p.props?.fields ?? {}))
            await sim.field(name).fill(v);
        for (const [name, v] of Object.entries(p.props?.areas ?? {}))
            await sim.textArea(name).fill(v);
        await sim.dialog.getByRole("button", { name: "OK" }).click();
        await expect(sim.dialog).toBeHidden();
    };

    // ---- the command decoder subcircuit ----
    for (const p of decoder)
        await test.step(describe(p), () => build(p));
    await page.keyboard.press("Escape");
    lastTool = "";

    // make it into a subcircuit.  Its pins start out in the order of their labels, top to
    // bottom, on the side each label points to; put the inputs in the order they're wired up
    // to outside, and make it wider
    await sim.menu("File", "Create Subcircuit...");
    await expect(sim.dialog).toBeVisible();
    const { SIDE_W, SIDE_E } = Sim;
    const layout = async () => (await sim.pinLayout()).pins.map(p => [p.name, p.side, p.pos]);
    expect(await layout()).toEqual([
        ["/CARRY", SIDE_W, 1], ["/LOAD0", SIDE_E, 0], ["/LOAD1", SIDE_E, 1], ["/LOAD2", SIDE_E, 2],
        ["/LOAD3", SIDE_E, 3], ["D4", SIDE_W, 2], ["D6", SIDE_W, 0], ["D7", SIDE_W, 3], ["SEL_A", SIDE_E, 4]]);
    await sim.movePin("D4", SIDE_W, 0);
    await sim.movePin("/CARRY", SIDE_W, 3);
    const widthPlus = sim.dialog.getByRole("button", { name: "+" }).first();
    await widthPlus.click();
    await widthPlus.click();
    expect(await layout()).toEqual([
        ["/CARRY", SIDE_W, 3], ["/LOAD0", SIDE_E, 0], ["/LOAD1", SIDE_E, 1], ["/LOAD2", SIDE_E, 2],
        ["/LOAD3", SIDE_E, 3], ["D4", SIDE_W, 0], ["D6", SIDE_W, 1], ["D7", SIDE_W, 2], ["SEL_A", SIDE_E, 4]]);
    expect(await sim.pinLayout()).toMatchObject({ sizeX: 4, sizeY: 5 });
    await sim.dialog.getByRole("textbox").fill("decoder");
    await sim.dialog.getByRole("button", { name: "OK" }).click();
    await expect(sim.dialog).toBeHidden();

    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    expect(await sim.elements()).toHaveLength(0);

    // ---- the CPU ----
    for (const p of cpu)
        await test.step(describe(p), () => build(p));
    await page.keyboard.press("Escape");

    // the routed wires took the paths they do in the file
    const routes = await page.evaluate(() => (window as any).__app.elmList
        .filter((e: any) => e.routePoints != null)
        .map((e: any) => e.routePoints.map((p: any) => p.x + "," + p.y).join(";")));
    expect(routes.sort()).toEqual(cpu.filter(p => p.route != null).map(p => p.route).sort());

    // and it's the same as the file, apart from where its labels are exactly
    const file = fs.readFileSync("public/circuits/td4.txt", "utf8");
    const refPage = await page.context().newPage();
    const ref = new Sim(refPage);
    await ref.open(file);
    const expected = await refPage.evaluate(normalizedDump, await ref.dump());
    await refPage.close();
    expect(await page.evaluate(normalizedDump, await sim.dump())).toEqual(expected);

    // ---- run it ----
    // The program outputs 1, 2, 4, 8, 4, 2, 1, ... so one LED at a time lights up, sweeping back
    // and forth.  Watch which LEDs are lit (left to right) as it runs.
    await page.evaluate(() => {
        const app = (window as any).__app;
        const leds = app.elmList.filter((e: any) => e.getClassName() === "LEDElm")
            .sort((a: any, b: any) => a.x - b.x);
        const w = window as any;
        w.__lit = [];
        const sample = () => {
            const lit = leds.map((e: any) => Math.abs(e.current ?? 0) > 1e-3 ? "*" : ".").join("");
            if (w.__lit[w.__lit.length - 1] !== lit)
                w.__lit.push(lit);
            w.__t = app.sim.t;
            requestAnimationFrame(sample);
        };
        sample();
        app.setSimRunning(true);
    });
    // (each instruction takes one 1 ms clock cycle, and the program is 13 instructions long)
    await page.waitForFunction(() => (window as any).__t > 0.05, null, { timeout: 60_000 });
    const lit: string[] = await page.evaluate(() => (window as any).__lit);
    // never more than one at a time, and each of them lights up
    expect(lit.filter(l => l.split("*").length > 2)).toEqual([]);
    expect(new Set(lit.filter(l => l.includes("*")))).toEqual(new Set(["*...", ".*..", "..*.", "...*"]));
});
