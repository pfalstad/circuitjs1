Test circuits for the TS bugs found while porting to C++ (the fixes are in the
stashed ts/ changes).  Each was checked against the stock TS code with
cxx/tools/compare.py: the stock code loads or runs it wrong, the fixed code
(and the C++ port) runs it right.  Inputs are logic inputs you can click, and
outputs are logic outputs.

tsbug-counter2-text.txt   (Counter2Elm, old text format)
    100 Hz clock, CLR/LOAD/EnP/EnT high.
    Fixed: Q outputs count up in binary.
    Stock: outputs never change. The pin index fields were reset to 0
    after super() had run setupPins().

tsbug-latch-text.txt   (LatchElm with reset and set pins, text format)
    Fixed: a register with I0-3, a clock, R and S pins; clocks the inputs
    through, and R or S clears or sets the outputs.
    Stock: "exception while undumping" in the console, and the chip
    is missing.  The flag constants were undefined inside setupPins().

tsbug-latch-reset.txt   (register with an active-low reset pin, XML)
    Loads and runs fine in both versions: a 100 Hz clock loads I3 (high)
    into O3, and the reset input is held high (inactive).  Press Reset.
    Stock: the circuit freezes.  Sim time stays at 0, the outputs stop
    updating, and the console shows "exception in runCircuit TypeError:
    Cannot set properties of null" on every frame, until you reload.
    Fixed: it keeps running.
    Why: reset() nulls outputValues and resetNodes() zeroes every node.  On
    the first step the active-low reset pin reads as 0 (asserted), so
    doLoad() writes to the null array.  The exception aborts the step
    before the nodes are solved, so the next step does the same thing.
    Without an inverted reset pin the first step doesn't write the array,
    and execute() recreates it, which is why a plain latch doesn't show it.

tsbug-seqgen-text.txt   (SeqGenElm with reset pin, text format)
    Fixed: sequence generator with clock, reset and output pins.
    Stock: exception on load, chip missing.

tsbug-seqgen-edit.txt   (SeqGenElm, XML; tests the edit dialog)
    Edit the chip and set the sequence to the 40 bits shown in the circuit:
        0000000000000000000000000000000011111111
    Fixed: the output goes high for 8 clocks out of every 40.
    Stock: the edit doesn't take at all.  Reopening the dialog shows the
    old sequence.  getChipEditInfo() built its own <textarea>, but EditDialog
    shows a new one and stores it in ei.textArea.element, so
    setChipEditValue() read the old, hidden one.  It now uses
    {value} / .element like BatteryElm and CustomLogicModel.  With that
    fixed, a second bug shows: only one 32-bit word was allocated (trunc
    instead of ceil), so bits 32-39 read as 0 and the output never goes
    high.

tsbug-analogmux-text.txt   (AnalogMuxElm, text format)
    Fixed: an analog mux, with square waves on its inputs.
    Stock: "exception while undumping ... reading '0'", chip missing.
    getPostCount() was NaN during super().

tsbug-customlogic-tristate.txt   (CustomLogicElm tri-state outputs)
    Two tri-state buffers (A1=A / ?0=_) with outputs tied together.  The top
    one is enabled with A high; the bottom one is disabled.
    Fixed: the output is high.  Click the enables and A inputs to switch
    which buffer drives it.
    Stock: "Singular matrix!" immediately.  The internal node behind each
    output resistor wasn't reported as connected to the output.

tsbug-inductor-sr.txt   (InductorElm, XML with no "sr" attribute)
    LC tank: 10uF charged to 5V and 10mH.  The scope shows the capacitor.
    Fixed: steady 5V oscillation at about 500 Hz.
    Stock: dies away in about 20 ms.  A missing sr loaded as the new-element
    default of 1 ohm instead of 0, and sr is only saved when it's nonzero, so
    every saved inductor with sr=0 came back as 1 ohm.

tsbug-transformer-isat.txt   (TransformerElm, old text format)
    Save the circuit (XML) and look at the <T> line in the saved file.
    Stock: it has isat="undefined", because saturationCurrent had no
    initializer, so old-format transformers (and new ones) left it undefined
    and dumpXml()'s "saturationCurrent !== 0" test passed.  Reloading that
    file makes it NaN, and saving again writes isat="NaN".
    Fixed: no isat attribute.

tsbug-relaycontact-xml.txt   (RelayContactElm, XML)
    latchingrelay.txt saved as XML.
    Stock: the relay contacts are missing; they're all at 0,0 (top left),
    and the relays don't switch anything.  RelayContactElm had a method
    setPosition(i_position, type), which (no overloading in JS) replaced
    CircuitElm.setPosition(x, y, x2, y2), so setPositionFromXml() set the
    contact's switch position to its x coordinate instead of placing it.
    Every saved circuit with relay contacts broke when reloaded.  Renamed it
    setContactPosition() (callers: RelayCoilElm, MotorProtectionSwitchElm).
    Fixed: same as latchingrelay.txt.

tsbug-opamp-gain-text.txt   (ComparatorElm in text format; its op-amp has no gain value)
    Stock: "nan/infinite matrix!" immediately.  OpAmpElm.gain had no
    initializer, so a text-format op-amp with FLAG_GAIN (8) but no gain value
    (which is what TS itself writes inside a composite's text dump, since
    OpAmpElm has no text dump() of its own) got gain = undefined -> NaN.
    Fixed: gain defaults to 100000, and the comparator works.

No file: LEDArrayElm
    Place a new LED array from the menu and drive it.
    Stock: brightness is reset to [] after setupPins(), so LED colors
    are NaN until you press Reset.  Loading from a file is fine.

No visible symptom (latent): BusTransceiverElm (the same field-reset
pattern, but the constructor and undumpXml call setupPins() again) and
PisoShiftElm (instance flag constant, but nothing reads it during super()).
