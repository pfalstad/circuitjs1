/// <reference types="node" />
// Compares a circuit's SPICE export against the simulator.  It loads a circuit file, runs
// the simulator on it headlessly, exports it and runs the netlist in ngspice, and reports
// each net whose voltage differs between the two:
//
//   CIRCUIT=../tests/custom.txt npx vitest run spice-compare
//
// CIRCUIT is the circuit file, text or XML.  STOP is how long to simulate (4000 time steps by default), RESET=0
// starts from the state the file was saved in instead of from reset, and OUT is where to
// write the netlist and both sets of voltages (the system's temporary directory by default).
// it needs ngspice, and skips itself without CIRCUIT.

import { it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { basename, join } from "path";
import { makeApp, loadCircuit, startSimulator, runSimulator, readWrdata, differences } from "./simHarness";
import { exportSpiceNetlist } from "../SpiceExporter";

const FILE = process.env.CIRCUIT ?? "";
const OUT = process.env.OUT ?? join(tmpdir(), "spice-compare-" + basename(FILE).replace(/\.\w+$/, ""));
const SAMPLES = 200;

it.skipIf(!FILE)("matches the simulator", () => {
    vi.useFakeTimers();
    const app = makeApp();
    const timeStep = loadCircuit(readFileSync(FILE, "utf8"), app);
    const STOP = process.env.STOP ? parseFloat(process.env.STOP) : 4000 * timeStep;
    startSimulator(app, timeStep);

    const res = exportSpiceNetlist(app.elmList, { timeStep, stopTime: STOP });
    // each net, with a post on it to read the simulator's voltage from, and what's on it
    const probes = new Map<string, [any, number]>(), who = new Map<string, string[]>();
    for (const [ce, nets] of res.postNets)
        nets.forEach((n, j) => {
            const e = ce as any;
            if (n !== "0" && !probes.has(n) && e.nodes?.[j])
                probes.set(n, [e, j]);
            const pin = e.pins?.[j] ? ":" + (e.pins[j].text || "clk") : ":" + j;
            who.set(n, [...(who.get(n) ?? []), `${ce.getClassName().replace(/Elm$/, "")}@${e.x},${e.y}${pin}`]);
        });
    // (a net only a left-out part is on isn't in the netlist)
    const used = new Set(res.text.split("\n").filter(l => /^[A-Z]/.test(l)).flatMap(l => l.split(/[\s(),]+/)));
    const nets = [...probes.keys()].filter(n => used.has(n));

    // the simulator's voltages, after the first time step past each sample time
    const rows = runSimulator(app, STOP, SAMPLES, () => nets.map(n => { const [e, j] = probes.get(n)!; return e.nodes[j].v; }));
    vi.useRealTimers();

    // (without the .print line, whose table would only fill ngspice's output)
    const cir = res.text.replace(/^\.print .*\n(\+ .*\n)*/m, "").replace(/\n\.end\n$/,
        `\n.control\nrun\nwrdata ${OUT}.spice ${nets.map(n => `v(${n})`).join(" ")}\n.endc\n.end\n`);
    writeFileSync(OUT + ".cir", cir);
    writeFileSync(OUT + ".sim", rows.map(r => r.join(" ")).join("\n") + "\n");
    execFileSync("ngspice", ["-b", OUT + ".cir"], { stdio: ["ignore", "pipe", "pipe"] });
    const data = readWrdata(readFileSync(OUT + ".spice", "utf8"));
    const report = differences(nets, n => who.get(n)!.join(" "), rows, data, timeStep);
    const summary = `${FILE}: ${nets.length} nets, ${report.length} differ` +
                    (res.warnings.length ? `; left out of the export: ${[...new Set(res.warnings)].join(", ")}` : "") +
                    `\nnetlist and voltages in ${OUT}.*`;
    expect(report, summary + "\n" + report.join("\n")).toEqual([]);
});
