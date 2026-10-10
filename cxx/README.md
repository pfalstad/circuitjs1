# CircuitJS1 native port (C++17, Qt later)

A line-for-line port of the TypeScript simulator in `../ts`, aiming at native
Mac and Windows apps. The simulator core comes first, with no UI dependencies,
and is checked against the TS version step by step. The Qt UI comes after that.

## Layout

- `src/core/`: SimulationManager, CircuitElm, nodes/matrices, XML and text
  loading, ElementFactory, and SimApp (the part of CirSim the simulator needs)
- `src/elements/`: one file pair per element class, named as in `../ts`
- `tools/simtrace.cpp`, `tools/simtrace.ts`: run a circuit headless and print
  node voltages and element currents after every timestep
- `tools/compare.py`: runs both tools and diffs the traces
- `src/app/`: the Qt app: `CirSim` (main window and frame loop),
  `QtGraphics` (canvas API on QPainter), `MouseManager`

## Build and run

Qt 6 is found automatically at `~/Qt/6.8.3/macos` (installed with
`aqt install-qt mac desktop 6.8.3 clang_64 -O ~/Qt`); otherwise pass
`-DCMAKE_PREFIX_PATH=/path/to/Qt`. Without Qt, only the core and tools build.

    cmake -S . -B build && cmake --build build -j8
    open build/CircuitJS1.app --args $PWD/../ts/public/circuits/ceamp.txt

`--screenshot out.png [--frames n]` renders n frames, saves the canvas and quits.

Mouse: hover shows info, click toggles switches and logic inputs, drag moves
elements, Cmd-drag moves posts, Shift-drag selects, Option-drag or right-drag
pans, wheel zooms.

## Test
    (cd tools && npm install)          # once, for the TS harness
    tools/compare.py ../auto-tests/lrc.txt 2000
    tools/compare.py --all 2000

Set `DUMPMATRIX=n` to make both tools print the matrices at step n.

    tools/compare.py --dump --all                 # saved XML, TS vs C++
    tools/compare.py --dump ../ts/public/circuits/*.txt

`--dump` loads a circuit and prints it as saved XML. Circuits with unported
elements are skipped.

## Porting conventions

- Each TS class keeps its name, file name, method names and comments.
- Nodes are `NodeRef` (`shared_ptr<CircuitNode>`), because elements keep
  references to old nodes across re-analysis. Pass them by `const &`.
- Elements are raw pointers owned by `SimApp::elmList`.
- `ELM_CLASS(Name)` in each class stands in for `constructor.name`.
- `ElementFactory` calls `allocNodes()` after construction, because a C++ base
  constructor can't dispatch `getNodeCount()` to the subclass the way JS does.
- Numbers are read and written with JS semantics (`JsNumber.h`), so files
  round-trip identically.
- Use `jsmath::exp/log/pow/sin/...` (`JsMath.h`), never `std::`, for
  transcendental functions. These are V8's own fdlibm-based implementations
  (`src/third_party/v8`, BSD license), so results match the TS version bit for
  bit. `sqrt`, `floor`, `fmod` and `abs` are exact, so `std::` is fine for them.
- The core is built with `-ffp-contract=off`, because JS never fuses `a*b+c`.
  The one exception is V8's `ieee754.cc`, which Node on arm64 builds with
  contraction on; the `JSMATH_FP_CONTRACT` option controls that.
- A C++ base-class constructor can't call subclass overrides, but JS can.
  Watch for TS constructors that rely on that (SwitchElm/LogicInputElm, for
  example) and pass the needed information in explicitly.
- `draw()` code ports directly: `g.context.arc(...)` becomes `g.arc(...)`
  (`core/Graphics.h` has the canvas methods), and `g.context.save()` becomes
  `g.saveState()`.
- `getEditInfo()` returns `std::optional<EditInfo>`. `EditInfo`, `Checkbox`
  and `Choice` are plain data (`core/EditInfo.h`), and the Qt `EditDialog`
  copies widget state into them, so `ei.textf.value` becomes `ei.textf->value`.

## Status

Ported so far: resistor, capacitor, inductor, switch, ground, wire, voltage
source (all waveforms), rail, current source, diode and diode models, BJT and
transistor models, MOSFET/JFET and their models, op-amp, text, output, probe,
logic input/output, AND/NAND/OR/NOR/XOR/XNOR gates, inverter, and the chips:
D/JK/T flip-flops, half/full adders, counters (both kinds), ring counter,
latch, SIPO/PISO shift registers, sequence generator, monostable, 555 timer,
DAC, ADC, multiplexer, demultiplexer, analog mux, bus transceiver, bus
splitter, 7-segment decoder and display, decimal display, LED array, SRAM, ROM,
VCO, phase comparator, CCII+/-, time delay relay, custom logic (with models),
and the controlled sources VCCS/VCVS/CCCS/CCVS with the expression engine
(Expr, ExprEngine).

204 of the example circuits load fully, and every one of them that TS can also
run gives bit-identical traces. All 12 auto-tests that load are bit-identical
over 3000 steps. `compare.py` checks for exact equality by default; `--tol
1e-9` allows some slack.

Element tests: `tools/testelms.sh ClassName[:flags][,attr=value...]` builds a
circuit with the element and square-wave rails on its inputs (`simtrace
--testcircuit`), and compares both file formats against TS.
`tools/exprcompare.py exprs.txt` compares expression evaluation.

ChipElm note: TS constructors call setupPins() and other overrides from the
base constructor.  In C++ that part is in `postConstruct()`, which
ElementFactory calls once the object is fully constructed.

Scopes: docked scopes load from files (both formats), draw with auto/max/manual
scale, triggers, the Max/Min/RMS/frequency overlays and cursor readout, and can
be added, stacked, combined and removed from the context menus. Not yet: X/Y
plots, FFT, the scope properties dialog, undocked scopes (ScopeElm), and export.

Saving: File → Save / Save As write the same XML as the TS version. All 110
example circuits that load fully save byte-identically to TS. Undo/redo (Edit
menu and toolbar) is a port of UndoManager. The app asks about unsaved changes
before opening another circuit or quitting. That check compares the circuit
without its simulation state and scopes, so a click that changes nothing
doesn't count as a change.

Not yet ported: sparse solver (matrices of 150 or more rows), labeled nodes,
routed wires, composites/subcircuits (and subcircuit chips), sliders, relay
models, potentiometer, variable rail, sweep, audio output, analog switches,
LED, transformer, and the rest.
