// Circuit Studio server: serves the CircuitJS web app from ../war and exposes
// POST /api/generate, which asks Claude for a circuit netlist. The API key
// stays on the server; the browser never sees it.
//
//   ANTHROPIC_API_KEY=... node server.mjs        (or: npm start)
//   then open http://localhost:8080/studio.html

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, NETLIST_SCHEMA } from "./prompt.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WAR = path.resolve(here, "..", "war");
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_ATTEMPTS = 4;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".wasm": "application/wasm", ".gif": "image/gif", ".jpg": "image/jpeg",
};

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// attempts: [{ netlist, problems: [string] }], the AI's earlier answers and
// what the simulator said about each, so Claude can repair its own circuit.
async function generate(prompt, attempts) {
  const messages = [{ role: "user", content: prompt }];
  for (const a of attempts) {
    messages.push({ role: "assistant", content: JSON.stringify(a.netlist) });
    messages.push({
      role: "user",
      content: `The simulator found these problems with that netlist:\n- ${a.problems.join("\n- ")}\n\nReturn a corrected netlist.`,
    });
  }

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: NETLIST_SCHEMA },
    },
    messages,
  });

  if (response.stop_reason === "refusal")
    throw new HttpError(422, "Claude declined to design this circuit.");
  if (response.stop_reason === "max_tokens")
    throw new HttpError(502, "The circuit description was too long. Try a simpler request.");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "Claude returned a netlist that could not be read.");
  }
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new HttpError(413, "Request too large.");
  }
  try { return JSON.parse(body); } catch { throw new HttpError(400, "Invalid JSON."); }
}

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function handleGenerate(req, res) {
  const { prompt, attempts = [] } = await readJson(req);
  if (typeof prompt !== "string" || !prompt.trim())
    throw new HttpError(400, "Describe the circuit you want.");
  if (prompt.length > 4000) throw new HttpError(400, "Please keep the description under 4000 characters.");
  if (!Array.isArray(attempts) || attempts.length >= MAX_ATTEMPTS)
    throw new HttpError(400, "Too many repair attempts.");
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    throw new HttpError(503, "The AI builder is not configured: start the server with ANTHROPIC_API_KEY set.");
  const netlist = await generate(prompt.trim(), attempts);
  send(res, 200, { netlist });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/studio.html";
  const file = path.resolve(WAR, "." + rel);
  if (!file.startsWith(WAR + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/generate") return await handleGenerate(req, res);
    if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res);
    res.writeHead(405); res.end();
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: "Claude is busy right now. Try again in a moment." });
    if (err instanceof Anthropic.AuthenticationError) return send(res, 503, { error: "The server's Anthropic API key was rejected." });
    if (err instanceof Anthropic.APIError) return send(res, 502, { error: `Claude API error: ${err.message}` });
    console.error(err);
    send(res, 500, { error: "Unexpected server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Circuit Studio: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}/studio.html`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    console.log("Note: ANTHROPIC_API_KEY is not set, so the AI builder is disabled. The simulator and 3D view still work.");
});
