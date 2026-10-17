// Loads a netlist into the running simulator and checks that it works.
// Returns { problems, warnings }: problems are sent back to the AI for repair,
// warnings are only shown to the user.

import { PART_TYPES, checkNetlist, partsToText, routeNets, buildCircuitText } from "./netlist.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function buildCircuit(sim, netlist) {
  const problems = checkNetlist(netlist);
  if (problems.length) return { problems, warnings: [] };

  // Pass 1: parts only, to learn where every pin really is.
  sim.importCircuit(partsToText(netlist), false);
  const placed = sim.getElements();
  if (placed.length !== netlist.components.length)
    return { problems: [`The simulator loaded ${placed.length} of ${netlist.components.length} parts.`], warnings: [] };
  const pinPos = netlist.components.map((c, i) =>
    PART_TYPES[c.type].pins.map((_, j) => { const p = placed[i].getPost(j); return [p[0], p[1]]; }));

  // Pass 2: route the nets and load the finished circuit.
  const routed = routeNets(netlist, pinPos);
  if (routed.errors.length) return { problems: routed.errors, warnings: [] };
  // The simulator refuses to run while the previous circuit's stop message is
  // set, and that message is only cleared when the new circuit is analyzed.
  const analyzed = new Promise((resolve) => {
    const prev = sim.onanalyze;
    sim.onanalyze = (s) => { sim.onanalyze = prev; if (prev) prev(s); resolve(); };
  });
  sim.importCircuit(buildCircuitText(netlist, routed), false);
  await Promise.race([analyzed, sleep(2000)]);
  sim.setSimRunning(true);

  // Let the circuit settle before judging it.
  await sleep(700);
  return checkRunningCircuit(sim, netlist);
}

export function checkRunningCircuit(sim, netlist) {
  const problems = [];
  const warnings = [];
  const stop = sim.getStopMessage();
  if (stop) {
    let hint = "";
    if (/current/i.test(stop)) hint = " This usually means a short circuit, such as an LED, diode or switch placed directly across a voltage source.";
    else if (/singular|matrix/i.test(stop)) hint = " This usually means a floating node, two voltage sources in parallel, or a loop of voltage sources and inductors.";
    problems.push(`The simulation stopped: "${stop}".${hint}`);
  } else if (!sim.isRunning()) {
    problems.push("The simulation did not start.");
  }
  if (sim.getBadConnectionCount() > 0)
    warnings.push("Some wires cross a pin without connecting to it.");

  const els = sim.getElements();
  const posts = new Map();
  for (const e of els) for (let j = 0; j < e.getPostCount(); j++) {
    const p = e.getPost(j);
    const k = p[0] + "," + p[1];
    posts.set(k, (posts.get(k) || 0) + 1);
  }
  const dangling = [...posts.values()].filter((n) => n === 1).length;
  // The ground symbol is the only element expected to have a lone post.
  if (dangling > 1) warnings.push(`${dangling - 1} pin(s) are not connected to anything.`);

  if (!stop) netlist.components.forEach((c, i) => {
    const e = els[i];
    if (!e) return;
    const amps = Math.abs(e.getCurrent());
    if (c.type === "led" && amps > 0.03)
      problems.push(`${c.id} (LED) carries ${(amps * 1000).toFixed(0)} mA, which would destroy a real LED. Keep it under 20 mA with a series resistor.`);
    else if (amps > 5)
      problems.push(`${c.id} carries ${amps.toFixed(1)} A, which looks like a short circuit.`);
  });
  return { problems, warnings };
}
