// Circuit Studio: connects the CircuitJS iframe, the AI builder and the 3D view.

import { CircuitView3D } from "./view3d.js";
import { buildCircuit } from "./builder.js";

const MAX_ROUNDS = 3;   // first design + up to two repairs
const EXAMPLES = [
  "A red LED lit from a 9 V battery",
  "An NPN transistor switch that turns on a green LED",
  "An RC low-pass filter with a 1 kHz cutoff driven by a 1 V sine wave",
  "A full-wave bridge rectifier with a smoothing capacitor",
  "An inverting op-amp amplifier with a gain of 10",
  "An astable multivibrator that flashes two LEDs",
];

const $ = (id) => document.getElementById(id);
const status = $("status");

function waitForSim(iframe) {
  return new Promise((resolve) => {
    const check = () => {
      const sim = iframe.contentWindow && iframe.contentWindow.CircuitJS1;
      if (sim && sim.getElements) resolve(sim);
      else setTimeout(check, 100);
    };
    check();
  });
}

function showStatus({ title, step, explanation, problems = [], warnings = [], error }) {
  status.replaceChildren();
  status.classList.add("show");
  const add = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = text;
    status.appendChild(el);
    return el;
  };
  if (title) add("div", "title", title);
  if (step) add("div", "step", step);
  if (explanation) add("div", "", explanation);
  if (error) add("div", "err", error);
  const list = (items, cls) => {
    if (!items.length) return;
    const ul = add("ul", cls, "");
    for (const t of items) { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); }
  };
  list(problems, "err");
  list(warnings, "warn");
}

async function askClaude(prompt, attempts) {
  const res = await fetch("api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, attempts }),
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(body.error || `The server answered ${res.status}.`);
  return body.netlist;
}

async function runAI(sim, view, prompt) {
  const attempts = [];
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    showStatus({
      step: round === 1
        ? "Claude is designing your circuit…"
        : `The simulator found problems, so Claude is fixing them (attempt ${round} of ${MAX_ROUNDS})…`,
    });
    const netlist = await askClaude(prompt, attempts);
    showStatus({ title: netlist.title, step: "Placing parts, routing wires and running the simulation…" });
    view.resetView();
    const { problems, warnings } = await buildCircuit(sim, netlist);
    if (!problems.length) {
      showStatus({ title: netlist.title, explanation: netlist.explanation, warnings });
      return;
    }
    attempts.push({ netlist, problems });
    if (round === MAX_ROUNDS)
      showStatus({
        title: netlist.title,
        explanation: netlist.explanation,
        error: "The circuit still has problems after several attempts. Try rephrasing the request, or fix it by hand in the schematic:",
        problems,
        warnings,
      });
  }
}

async function start() {
  const sim = await waitForSim($("sim"));
  const view = new CircuitView3D($("view3d"));
  view.hoverCb = (h) => {
    const tip = $("tip");
    if (!h) { tip.style.display = "none"; return; }
    tip.textContent = h.lines.join("\n");
    tip.style.left = h.x + 14 + "px";
    tip.style.top = h.y + 14 + "px";
    tip.style.display = "block";
  };

  // Rebuild the 3D board whenever the circuit changes, at most once a frame.
  let pending = false;
  const rebuild = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; view.build(sim); });
  };
  sim.onanalyze = rebuild;
  rebuild();

  $("voltToggle").addEventListener("change", (e) => {
    view.showVoltage = e.target.checked;
    $("legend").style.display = e.target.checked ? "" : "none";
  });
  $("resetView").addEventListener("click", () => view.resetView());

  for (const text of EXAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", () => { $("prompt").value = text; $("prompt").focus(); });
    $("examples").appendChild(b);
  }

  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      document.body.dataset.tab = b.dataset.tab;
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    }));

  $("ask").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const prompt = $("prompt").value.trim();
    if (!prompt) { $("prompt").focus(); return; }
    $("buildBtn").disabled = true;
    try {
      await runAI(sim, view, prompt);
    } catch (err) {
      showStatus({ error: err.message });
    } finally {
      $("buildBtn").disabled = false;
    }
  });

  // Exposed for debugging and for tests: load a netlist without the AI.
  window.studio = { sim, view, buildCircuit: (netlist) => buildCircuit(sim, netlist) };
}

start();
