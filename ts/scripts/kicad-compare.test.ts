/// <reference types="node" />
// Compares a circuit's KiCad export against the simulator.  It loads a circuit file, runs
// the simulator on it headlessly, exports it as a KiCad project, has kicad-cli write the
// project's SPICE netlist (as KiCad's simulator would run it) and runs that in ngspice, and
// reports each net whose voltage differs between the two:
//
//   CIRCUIT=../tests/custom.txt npx vitest run kicad-compare
//
// CIRCUIT, STOP, RESET and OUT are as for spice-compare (OUT is a folder here, for the
// project).  KICAD_CLI is kicad-cli, if it isn't where macOS puts it.  It needs kicad-cli and
// ngspice, and skips itself without CIRCUIT.  Only the top sheet's nets are compared.

import { it, expect, vi } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { basename, join } from "path";
import { makeApp, loadCircuit, startSimulator, runSimulator, readWrdata, differences } from "./simHarness";
import { exportKicadProject } from "../KicadExporter";
import { spiceValue } from "../SpiceExporter";

const FILE = process.env.CIRCUIT ?? "";
const NAME = basename(FILE).replace(/\.\w+$/, "");
const OUT = process.env.OUT ?? join(tmpdir(), "kicad-compare-" + NAME);
const KICAD_CLI = process.env.KICAD_CLI ?? "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli";
const SAMPLES = 200;

// each net's name, and its parts' pins ("R1:2"), from a KiCad (S-expression) netlist
function netlistNets(text: string): Map<string, string> {
    const nets = new Map<string, string>();
    for (const chunk of text.split(/\(net\s*\(code/).slice(1)) {
        const name = chunk.match(/\(name "((?:[^"\\]|\\.)*)"\)/)![1];
        for (const m of chunk.matchAll(/\(node\s*\(ref "([^"]+)"\)\s*\(pin "([^"]+)"\)/g))
            nets.set(m[1] + ":" + m[2], name);
    }
    return nets;
}

// a net's name in KiCad's SPICE netlist, where ground is 0 (as KiCad's simulator makes it)
function spiceName(net: string): string {
    return net === "GND" ? "0" : net.replace(/[()\s]/g, "_");
}

it.skipIf(!FILE)("matches the simulator", () => {
    vi.useFakeTimers();
    const app = makeApp();
    const timeStep = loadCircuit(readFileSync(FILE, "utf8"), app);
    const STOP = process.env.STOP ? parseFloat(process.env.STOP) : 4000 * timeStep;
    startSimulator(app, timeStep);

    const res = exportKicadProject(app.elmList, NAME, timeStep);
    mkdirSync(OUT, { recursive: true });
    // relative model libraries are found from the project file
    writeFileSync(join(OUT, NAME + ".kicad_pro"), JSON.stringify({ meta: { filename: NAME + ".kicad_pro", version: 1 } }) + "\n");
    for (const f of res.files)
        writeFileSync(join(OUT, f.name), f.text);
    const sch = join(OUT, NAME + ".kicad_sch");
    const cli = (format: string, out: string) =>
        execFileSync(KICAD_CLI, ["sch", "export", "netlist", "--format", format, "-o", out, sch], { stdio: ["ignore", "pipe", "pipe"] });
    cli("kicadsexpr", join(OUT, NAME + ".net"));
    cli("spice", join(OUT, NAME + ".cir"));
    const kicadNets = netlistNets(readFileSync(join(OUT, NAME + ".net"), "utf8"));

    // each net, with a post on it to read the simulator's voltage from, and what's on it.
    // the top sheet's parts are numbered as its exporter numbered them, in its one place
    const root = res.root, refs = res.paths.get(root)![0].refs;
    const probes = new Map<string, [any, number]>(), who = new Map<string, string[]>();
    for (const [ce, pins] of root.pinMap) {
        const ref = refs.get(root.refs.get(ce)!)!;
        pins.forEach((pin, j) => {
            const net = pin !== null ? kicadNets.get(ref + ":" + pin) : undefined;
            if (net === undefined)
                return;
            const n = spiceName(net), e = ce as any;
            if (n !== "0" && !probes.has(n) && e.nodes?.[j])
                probes.set(n, [e, j]);
            who.set(n, [...(who.get(n) ?? []), `${ref}:${pin}`]);
        });
    }
    const netlist = readFileSync(join(OUT, NAME + ".cir"), "utf8")
        .replace(/(?<=[\s(,])GND(?=[\s),]|$)/gm, "0");
    const used = new Set(netlist.split("\n").filter(l => /^[A-Z]/.test(l)).flatMap(l => l.split(/[\s(),]+/)));
    const nets = [...probes.keys()].filter(n => used.has(n));

    const rows = runSimulator(app, STOP, SAMPLES, () => nets.map(n => { const [e, j] = probes.get(n)!; return e.nodes[j].v; }));
    vi.useRealTimers();

    // start from the parts' initial conditions, as CircuitJS does, if anything holds energy
    // (in the netlist or a model), as the SPICE export does; otherwise from the operating point
    const lib = res.files.find(f => f.name.endsWith(".lib"))?.text ?? "";
    const uic = [netlist, lib].some(t => /^\s*[CLKT]/m.test(t) || /\bIC=/i.test(t) || /\b(cjo|cje|cjc|cgs|cgd|cbd|cbs)=/i.test(t)) ? " uic" : "";
    const cir = netlist.replace(/\.end\s*$/, `.tran ${spiceValue(timeStep)} ${spiceValue(STOP)}${uic}\n.control\nrun\n` +
        `wrdata ${join(OUT, NAME + ".spice")} ${nets.map(n => `v(${n})`).join(" ")}\n.endc\n.end\n`);
    writeFileSync(join(OUT, NAME + ".run.cir"), cir);
    writeFileSync(join(OUT, NAME + ".sim"), rows.map(r => r.join(" ")).join("\n") + "\n");
    execFileSync("ngspice", ["-b", join(OUT, NAME + ".run.cir")], { stdio: ["ignore", "pipe", "pipe"] });
    const data = readWrdata(readFileSync(join(OUT, NAME + ".spice"), "utf8"));
    const report = differences(nets, n => who.get(n)!.join(" "), rows, data, timeStep);
    const summary = `${FILE}: ${nets.length} nets, ${report.length} differ` +
                    (res.warnings.length ? `; left out of the export: ${[...new Set(res.warnings)].join(", ")}` : "") +
                    `\nproject, netlist and voltages in ${OUT}`;
    expect(report, summary + "\n" + report.join("\n")).toEqual([]);
});
