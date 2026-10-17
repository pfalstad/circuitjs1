# Circuit Studio

Circuit Studio adds two features on top of CircuitJS:

- **AI circuit builder.** Describe a circuit in plain language ("an NPN transistor switch that turns on a green LED") and Claude designs it. The app places the parts, routes the wires, runs the simulation, and checks the result. If the simulator finds a problem (a short circuit, a floating pin, an LED with too much current), the problems are sent back to Claude to fix, up to three rounds.
- **3D board view.** The circuit is shown as a 3D board next to the schematic: resistors with real colour bands, capacitors, batteries, LEDs that light up with their current, traces coloured by voltage, and dots that move with the current. Drag to orbit, scroll to zoom, hover a part to see its readings. Editing the schematic updates the 3D board.

Open `studio.html` instead of `circuitjs.html` to use them. The original simulator is unchanged.

## Running it

1. The compiled simulator is already included in `war/circuitjs1/`, so you don't need Java. Rebuild it only if you change the Java code (see [README.md](README.md); `./dev.sh` works on Linux only).
2. Start the Circuit Studio server (needs Node.js 18 or newer from https://nodejs.org):

   ```bash
   cd server
   npm install
   ANTHROPIC_API_KEY=sk-ant-... npm start
   ```

3. Open http://localhost:8080/studio.html.

The API key is read only by the server and is never sent to the browser. Without a key, the simulator and 3D view still work, and the AI button explains that the key is missing. Get a key at https://platform.claude.com.

Server settings, as environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Claude API key, required for the AI builder |
| `PORT` | `8080` | Port to listen on |
| `HOST` | `127.0.0.1` | Address to bind. Keep the default unless you know you need `0.0.0.0`: anyone who can reach the server can spend your API credits. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Claude model used to design circuits |

### In VS Code

Open the folder, then in a terminal run `./dev.sh setup` once and `./dev.sh start` (see README.md). In a second terminal, run the server as in step 2 above. VS Code forwards port 8080; open `/studio.html` on it. Java edits are recompiled by the GWT code server on reload, and edits to `war/studio/*.js` only need a browser reload.

## How it works

```
studio.html
 ├── CircuitJS in an iframe (circuitjs.html), driven through its JavaScript API
 ├── studio/main.js      UI: prompt, status, examples, tabs on small screens
 ├── studio/builder.js   loads a netlist into the simulator and checks the result
 ├── studio/netlist.js   netlist checks, CircuitJS text output, wire routing
 └── studio/view3d.js    Three.js 3D board (Three.js r169 is vendored in studio/vendor)
server/
 ├── server.mjs          static file server + POST /api/generate (calls Claude)
 └── prompt.mjs          system prompt and the netlist JSON schema
```

**Netlist.** Claude returns JSON that follows the schema in `server/prompt.mjs`: each part has a type, a value, a grid position, an orientation, and the name of the net each pin connects to. It does not draw wires.

**Building a circuit** (`builder.js`):

1. Structural checks: known part types, pin counts, a ground net, no net with a single pin.
2. The parts are loaded on their own, and their real pin positions are read back from the simulator. This way the geometry of transistors and op-amps is never duplicated in JavaScript.
3. Each net is routed as a minimum spanning tree of L-shaped wires. CircuitJS connects elements only where endpoints meet, so the router never puts a wire endpoint on a point that belongs to another net. Among the routes that are valid, it prefers ones that don't overlap other wires or cross part bodies.
4. The finished circuit is loaded and run. The builder then checks for a simulator stop message (a short or singular matrix), unconnected pins, LEDs above 30 mA, and currents above 5 A. Any problem is sent back to Claude.

**Additions to the CircuitJS JavaScript API** (in `JSInterface.java` and `CircuitElm.java`):

| Call | Returns |
|---|---|
| `CircuitJS1.getStopMessage()` | The simulator's error message, or `null` when it is running normally |
| `CircuitJS1.getBadConnectionCount()` | Number of pins that touch an element without connecting to it |
| `element.getPost(n)` | `[x, y]` of the element's n-th pin in circuit coordinates |

**Supported parts for the AI:** resistor, capacitor, inductor, battery, AC source, diode, LED (five colours), switch, NPN/PNP transistors, N/P-channel MOSFETs, and op-amps. To add one, add it to `PART_TYPES` and `partLine()` in `war/studio/netlist.js`, add it to the table and the `type` enum in `server/prompt.mjs`, and give it a 3D model in `addPart()` in `war/studio/view3d.js`. Parts without a model are drawn as a grey body.

## License

Circuit Studio is part of this fork of CircuitJS and is distributed under the same GNU GPL v2 or later (see [COPYING.txt](COPYING.txt)). Three.js is MIT licensed (see `war/studio/vendor/THREE-LICENSE.txt`).
