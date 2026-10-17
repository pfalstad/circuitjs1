// Netlist <-> CircuitJS text conversion and wire routing.
//
// The AI (or any other tool) describes a circuit as a netlist: parts with a
// grid position and the name of the net each pin connects to. This module
// turns that into CircuitJS's text format in two passes:
//   1. partsToText() emits the parts only. The simulator loads them and we read
//      back the real pin coordinates (getPost), so multi-pin parts such as
//      transistors and op-amps never need their geometry duplicated here.
//   2. routeNets() connects the pins of each net with wires, and
//      buildCircuitText() emits the final circuit.
// CircuitJS connects elements only where endpoints coincide, so the router's
// job is to join same-net pins without ever putting a wire endpoint on a point
// that belongs to another net.

export const CELL = 16;       // pixels per grid cell in CircuitJS coordinates
const ORIGIN = 4;             // grid cells of margin around the circuit

// Pin order is the order of the simulator's posts for that element.
export const PART_TYPES = {
  resistor:   { pins: ["a", "b"], len: 4, unit: "Ω" },
  capacitor:  { pins: ["a", "b"], len: 4, unit: "F" },
  inductor:   { pins: ["a", "b"], len: 4, unit: "H" },
  battery:    { pins: ["negative", "positive"], len: 4, unit: "V" },
  ac_source:  { pins: ["a", "b"], len: 4, unit: "V" },
  diode:      { pins: ["anode", "cathode"], len: 4 },
  led:        { pins: ["anode", "cathode"], len: 4 },
  switch:     { pins: ["a", "b"], len: 4 },
  npn:        { pins: ["base", "collector", "emitter"], len: 3 },
  pnp:        { pins: ["base", "collector", "emitter"], len: 3 },
  nmos:       { pins: ["gate", "source", "drain"], len: 3 },
  pmos:       { pins: ["gate", "drain", "source"], len: 3 },
  opamp:      { pins: ["inverting", "noninverting", "output"], len: 4 },
};

const DIRS = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
const LED_RGB = { red: "1 0 0", green: "0 1 0", blue: "0 0 1", yellow: "1 1 0", white: "1 1 1" };

export function isGroundNet(name) {
  const n = String(name).trim().toLowerCase();
  return n === "gnd" || n === "0" || n === "ground";
}

// Structural checks that need no simulator. Returns a list of problems,
// each naming the part or net involved so the AI can fix it.
export function checkNetlist(netlist) {
  const errors = [];
  const ids = new Set();
  const netPins = new Map();
  if (!netlist || !Array.isArray(netlist.components) || netlist.components.length === 0)
    return ["The netlist has no components."];

  for (const c of netlist.components) {
    const spec = PART_TYPES[c.type];
    if (!spec) { errors.push(`${c.id}: unknown part type "${c.type}".`); continue; }
    if (ids.has(c.id)) errors.push(`${c.id}: duplicate part id.`);
    ids.add(c.id);
    if (!Array.isArray(c.nodes) || c.nodes.length !== spec.pins.length) {
      errors.push(`${c.id}: a ${c.type} needs ${spec.pins.length} nodes (${spec.pins.join(", ")}), got ${c.nodes?.length ?? 0}.`);
      continue;
    }
    if (!DIRS[c.orientation]) errors.push(`${c.id}: orientation must be right, down, left or up.`);
    if (["resistor", "capacitor", "inductor"].includes(c.type) && !(c.value > 0))
      errors.push(`${c.id}: ${c.type} value must be positive (got ${c.value}).`);
    if (c.type === "ac_source" && !(c.frequency > 0))
      errors.push(`${c.id}: ac_source needs a positive frequency.`);
    if (c.nodes[0] === c.nodes[1] && spec.pins.length === 2)
      errors.push(`${c.id}: both pins are on net "${c.nodes[0]}", so the part is shorted out.`);
    c.nodes.forEach((n, i) => {
      if (!netPins.has(n)) netPins.set(n, []);
      netPins.get(n).push(`${c.id}.${spec.pins[i]}`);
    });
  }
  if (![...netPins.keys()].some(isGroundNet))
    errors.push(`No pin is connected to ground. Name the ground net "gnd".`);
  for (const [net, pins] of netPins)
    if (pins.length < 2 && !isGroundNet(net))
      errors.push(`Net "${net}" only connects to ${pins[0]}; that pin is left floating.`);
  return errors;
}

function partLine(c) {
  const spec = PART_TYPES[c.type];
  const [dx, dy] = DIRS[c.orientation] || DIRS.right;
  const x1 = (ORIGIN + c.x) * CELL, y1 = (ORIGIN + c.y) * CELL;
  const x2 = x1 + dx * spec.len * CELL, y2 = y1 + dy * spec.len * CELL;
  const p = `${x1} ${y1} ${x2} ${y2}`;
  switch (c.type) {
    case "resistor":  return `r ${p} 0 ${c.value}`;
    case "capacitor": return `c ${p} 0 ${c.value} 0`;
    case "inductor":  return `l ${p} 0 ${c.value} 0`;
    case "battery":   return `v ${p} 0 0 40 ${c.value} 0 0 0.5`;
    case "ac_source": return `v ${p} 0 1 ${c.frequency} ${c.value} 0 0 0.5`;
    case "diode":     return `d ${p} 0`;
    case "led":       return `162 ${p} 0 ${LED_RGB[c.color] || LED_RGB.red}`;
    case "switch":    return `s ${p} 0 ${c.closed ? 0 : 1} false`;
    case "npn":       return `t ${p} 0 1 0 0 100`;
    case "pnp":       return `t ${p} 0 -1 0 0 100`;
    case "nmos":      return `f ${p} 0`;
    case "pmos":      return `f ${p} 1`;
    case "opamp":     return `a ${p} 0 15 -15`;
  }
}

function header(netlist) {
  const ts = netlist.timestep > 0 ? netlist.timestep : 5e-6;
  return `$ 1 ${ts} 10.20027730826997 50 5 50 5e-11`;
}

// Pass 1: parts only, in netlist order (the simulator keeps file order).
export function partsToText(netlist) {
  return [header(netlist), ...netlist.components.map(partLine)].join("\n") + "\n";
}

const key = (p) => `${p[0]},${p[1]}`;

// Pass 2: given pin coordinates read back from the simulator
// (pinPos[i][j] = [x, y] of pin j of component i), connect every net.
export function routeNets(netlist, pinPos) {
  const errors = [];
  const owner = new Map();          // point -> net name, for every pin and wire endpoint
  const nets = new Map();           // net -> [points]
  netlist.components.forEach((c, i) => {
    c.nodes.forEach((net, j) => {
      const pt = pinPos[i][j];
      const k = key(pt);
      const prev = owner.get(k);
      if (prev !== undefined && prev !== net)
        errors.push(`${c.id}.${PART_TYPES[c.type].pins[j]} sits on the same grid point as a pin on net "${prev}", which shorts "${net}" to "${prev}". Move the parts apart.`);
      owner.set(k, net);
      if (!nets.has(net)) nets.set(net, []);
      if (!nets.get(net).some((q) => key(q) === k)) nets.get(net).push(pt);
    });
  });
  if (errors.length) return { wires: [], ground: null, errors };

  const segments = [];              // {a, b, net} already placed, for overlap scoring
  const wires = [];

  // Part bodies are obstacles: the line between a two-pin part's pins, or the
  // box spanned by a transistor's or op-amp's pins.
  const bodies = pinPos.map((pins) => {
    const xs = pins.map((p) => p[0]), ys = pins.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), line: pins.length === 2 };
  });
  const inBody = (x, y, b) => b.line
    ? (b.x0 === b.x1 ? x === b.x0 && y > b.y0 && y < b.y1 : y === b.y0 && x > b.x0 && x < b.x1)
    : x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;

  const free = (pt, net) => { const o = owner.get(key(pt)); return o === undefined || o === net; };
  const onSegment = (p, s) =>
    (s.a[0] === s.b[0] && p[0] === s.a[0] && p[1] > Math.min(s.a[1], s.b[1]) && p[1] < Math.max(s.a[1], s.b[1])) ||
    (s.a[1] === s.b[1] && p[1] === s.a[1] && p[0] > Math.min(s.a[0], s.b[0]) && p[0] < Math.max(s.a[0], s.b[0]));
  const overlap = (s, t) => {
    if (s.a[0] === s.b[0] && t.a[0] === t.b[0] && s.a[0] === t.a[0]) {
      const lo = Math.max(Math.min(s.a[1], s.b[1]), Math.min(t.a[1], t.b[1]));
      const hi = Math.min(Math.max(s.a[1], s.b[1]), Math.max(t.a[1], t.b[1]));
      return Math.max(0, hi - lo);
    }
    if (s.a[1] === s.b[1] && t.a[1] === t.b[1] && s.a[1] === t.a[1]) {
      const lo = Math.max(Math.min(s.a[0], s.b[0]), Math.min(t.a[0], t.b[0]));
      const hi = Math.min(Math.max(s.a[0], s.b[0]), Math.max(t.a[0], t.b[0]));
      return Math.max(0, hi - lo);
    }
    return 0;
  };
  // Cost of a candidate path: overlapping other nets' wires is bad, running a
  // wire across a pin of another net is confusing, length breaks ties.
  const cost = (path, net) => {
    let c = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const s = { a: path[i], b: path[i + 1] };
      c += Math.abs(s.a[0] - s.b[0]) + Math.abs(s.a[1] - s.b[1]);
      for (const t of segments) if (t.net !== net) c += 50 * overlap(s, t);
      for (const [k, o] of owner) {
        if (o === net) continue;
        const [x, y] = k.split(",").map(Number);
        if (onSegment([x, y], s)) c += 400;
      }
      const steps = Math.max(Math.abs(s.a[0] - s.b[0]), Math.abs(s.a[1] - s.b[1])) / (CELL / 2);
      for (let t = 0; t <= steps; t++) {
        const x = s.a[0] + Math.sign(s.b[0] - s.a[0]) * t * (CELL / 2);
        const y = s.a[1] + Math.sign(s.b[1] - s.a[1]) * t * (CELL / 2);
        for (const b of bodies) if (inBody(x, y, b)) c += 200;
      }
    }
    return c;
  };
  const candidates = (a, b) => {
    if (a[0] === b[0] || a[1] === b[1]) {
      const out = [[a, b]];
      for (let d = 1; d <= 4; d++) for (const s of [d, -d]) {
        const off = s * CELL;
        out.push(a[0] === b[0]
          ? [a, [a[0] + off, a[1]], [b[0] + off, b[1]], b]
          : [a, [a[0], a[1] + off], [b[0], b[1] + off], b]);
      }
      return out;
    }
    const out = [[a, [b[0], a[1]], b], [a, [a[0], b[1]], b]];
    for (let d = 1; d <= 4; d++) for (const s of [d, -d]) {
      const mx = Math.round((a[0] + b[0]) / 2 / CELL) * CELL + s * CELL;
      const my = Math.round((a[1] + b[1]) / 2 / CELL) * CELL + s * CELL;
      out.push([a, [mx, a[1]], [mx, b[1]], b]);
      out.push([a, [a[0], my], [b[0], my], b]);
    }
    return out;
  };

  // Route nets with the most pins first; they are the hardest to fit.
  const order = [...nets.entries()].sort((p, q) => q[1].length - p[1].length);
  for (const [net, pts] of order) {
    // Prim's minimum spanning tree on Manhattan distance.
    const inTree = [pts[0]];
    const rest = pts.slice(1);
    while (rest.length) {
      let best = null;
      for (const a of inTree) for (let r = 0; r < rest.length; r++) {
        const b = rest[r];
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        if (!best || d < best.d) best = { a, r, d };
      }
      const b = rest.splice(best.r, 1)[0];
      inTree.push(b);
      const options = candidates(best.a, b)
        .filter((path) => path.slice(1, -1).every((p) => free(p, net)))
        .map((path) => ({ path, c: cost(path, net) }))
        .sort((p, q) => p.c - q.c);
      if (!options.length) {
        errors.push(`Could not route net "${net}" without touching another net. Spread the parts out.`);
        continue;
      }
      const path = options[0].path;
      for (let i = 0; i + 1 < path.length; i++) {
        const s = { a: path[i], b: path[i + 1], net };
        if (key(s.a) === key(s.b)) continue;
        segments.push(s);
        wires.push(`w ${s.a[0]} ${s.a[1]} ${s.b[0]} ${s.b[1]} 0`);
        owner.set(key(s.a), net);
        owner.set(key(s.b), net);
      }
    }
  }

  // One ground symbol, hanging below the lowest ground pin.
  let ground = null;
  for (const [net, pts] of nets) {
    if (!isGroundNet(net)) continue;
    const p = pts.reduce((m, q) => (q[1] > m[1] ? q : m));
    ground = `g ${p[0]} ${p[1]} ${p[0]} ${p[1] + 2 * CELL} 0 0`;
  }
  return { wires, ground, errors };
}

export function buildCircuitText(netlist, routed) {
  const lines = [header(netlist), ...netlist.components.map(partLine), ...routed.wires];
  if (routed.ground) lines.push(routed.ground);
  return lines.join("\n") + "\n";
}
