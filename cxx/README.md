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

    cmake -S . -B build-mac && cmake --build build-mac -j8
    open build-mac/CircuitJS1.app --args $PWD/../ts/public/circuits/ceamp.txt

On Windows, install the VS 2022 Build Tools (C++ workload), `pip install cmake ninja aqtinstall`,
and `aqt install-qt windows desktop 6.8.3 win64_msvc2022_64 -O %USERPROFILE%\Qt`; then
`build-win.bat` builds into `build-win/` and copies the Qt DLLs next to `CircuitJS1.exe`.

`--screenshot out.png [--frames n]` renders n frames, saves the canvas and quits.

Mouse: hover shows info, click toggles switches and logic inputs, drag moves
elements, Cmd-drag moves posts, Shift-drag selects, Option-drag or right-drag
pans, wheel zooms.

## Test
    (cd tools && npm install)          # once, for the TS harness
    tools/compare.py ../auto-tests/lrc.txt 2000
    tools/compare.py --all 2000

Set `DUMPMATRIX=n` to make both tools print the matrices at step n, and
`TOGGLE=elm:step,...` to toggle switches (by element index) at those steps, the
way clicking them in the app does. `AUDIOOUT=file.wav` saves the first audio output's WAV
after the run.

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
source (all waveforms), rail, variable rail, potentiometer (with linking),
labeled node (including bus labels and v(label) references in expressions),
SPDT/multi-throw switch (with linking), sweep, Zener, LED, transformer (with
saturation), analog switches (SPST and SPDT), memristor, transmission line,
relay (with relay models), relay coil and contact, cross switch, motor
protection switch, routed wire (with the WireRouter: routing new wires,
rerouting by dragging, and splitting), audio output and audio input,
noise generator, subcircuits (SubcircuitElm with SubcircuitModel: loading and
saving in both formats, nested models, the built-in LM317/TL431, library
files), and the composite elements (Darlington, unijunction, crystal, OTA,
Norton amp, comparator, real op-amp, optocoupler),
current source, diode and diode models, BJT and
transistor models, MOSFET/JFET and their models, op-amp, text, output, probe,
logic input/output, AND/NAND/OR/NOR/XOR/XNOR gates, inverter, and the chips:
D/JK/T flip-flops, half/full adders, counters (both kinds), ring counter,
latch, SIPO/PISO shift registers, sequence generator, monostable, 555 timer,
DAC, ADC, multiplexer, demultiplexer, analog mux, bus transceiver, bus
splitter, 7-segment decoder and display, decimal display, LED array, SRAM, ROM,
VCO, phase comparator, CCII+/-, time delay relay, custom logic (with models),
the controlled sources VCCS/VCVS/CCCS/CCVS with the expression engine
(Expr, ExprEngine), the two-terminal controlled voltage/current sources, AC and
square-wave rails, clock, push switch, swapped op-amp, polarized capacitor,
varactor, tunnel diode, SCR, triac, diac, triode, lamp, spark gap, Schmitt
triggers, tri-state buffer, delay buffer, fuse, LDR, thermistor, AM/FM sources,
antenna, external voltage, ammeter, ohmmeter, wattmeters, battery, tapped and
custom transformers, gyrator, DC and 3-phase motors, DPDT and MBB switches, bus
logic input, instruction display, test point, stop trigger, data recorder and
data input, box, line, and undocked scopes (ScopeElm).  Every concrete element
class in `../ts` now has a port.

375 of the 376 example circuits load fully (jsinterface-phase.txt uses an
ExtClock element that TS doesn't have either), and all of them give bit-identical
traces and save byte-identically to TS. All 16 auto-tests are bit-identical
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
plots, FFT, the scope properties dialog, and export.  Undocked scopes (ScopeElm)
load, save and draw in the circuit, and can be docked, undocked and created with
"View in New Undocked Scope".

Saving: File → Save / Save As write the same XML as the TS version. Every
example circuit that loads saves byte-identically to TS. Undo/redo (Edit
menu and toolbar) is a port of UndoManager. The app asks about unsaved changes
before opening another circuit or quitting. That check compares the circuit
without its simulation state and scopes, so a click that changes nothing
doesn't count as a change.

Sliders: element values with sliders (Adjustable) load and save in both
formats, show in the side panel, and can be added, shared and edited with the
Sliders... dialog in the element context menu.  The slider logic is
`core/Scrollbar.h` (the TS Scrollbar without the drawing), so slider-driven
values match TS exactly.

Subcircuit UI: File → Create Subcircuit... makes a model from the circuit (or
the selection) and opens the pin layout editor; the Draw menu's Subcircuits
submenu lists the models.  A subcircuit's edit dialog has Edit Pin Layout, View
Components (also on double-click; read-only, with live voltages, and nested
subcircuits can be entered too) and Edit Model, which swaps the circuit for the
model's circuit until you Save, Save Copy or go Back in the bar above the canvas.
Tools → Subcircuit Manager makes models local, global or persistent, saves them
as a library file, and deletes them.  Persistent models are kept with QSettings
(`core/Storage.h` stands in for localStorage; the headless tools have none).
File → Save is refused while editing a model, since it would write the model's
circuit over the file.

Sparse solver: `core/matrix/` is a port of the TS DMatrixSparseCSC/SparseLU (from
EJML), used for matrices of 150 or more rows, or always when the circuit asks for it.
`SOLVER=n` makes both trace tools use solver n (0=auto, 1=dense, 2=sparse); with
sparse forced, every example circuit that runs gives bit-identical traces.

Options: Options → Other Options... is a port of EditOptions (time step, voltage
range, colors, decimal digits, developer mode, frame rate, wheel sensitivity, auto DC,
auto timestep, matrix solver, value font size).  Colors, decimal digits, font size and
wheel sensitivity are saved with QSettings, as TS saves them in localStorage.  The
language choice is saved but does nothing yet, since translations aren't ported.

Console: Tools → Console shows everything written to std::cerr/std::cout
(including `SimulationManager::console()`) and Qt warnings, from startup on, since
there is no browser console.  Output still goes to the terminal as well.

Not yet ported: the rest.

Audio: the core does the sampling, scaling and WAV encoding (matching the TS
version byte for byte; `AUDIOOUT=file` makes both tools save the WAV that Play
would play).  The app plays it and decodes audio input files (WAV, MP3, FLAC)
with miniaudio (`src/third_party/miniaudio`, public domain / MIT-0), which
compiles into the app, so there is nothing extra to install or ship.
