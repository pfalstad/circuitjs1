import { describe, it, expect, beforeEach } from "vitest";
import { Scheduler } from "./Scheduler";
import { DigitalElm, DigitalConst } from "./DigitalElm";
import { NandGateElm, AndGateElm, XorGateElm } from "../GateElm";

// Verifies GateElm.getInput()/evaluate() actually read from the DigitalElm
// graph (this.inputs) once it's populated, rather than silently continuing
// to read analog voltages - the fix this.inputs.length > 0 branch in
// getInput() exists for. Real CircuitElm construction isn't possible
// headlessly (needs CircuitElm.app - see ChipGroupLogic.test.ts), so this
// bypasses the constructor via Object.create() while exercising the real
// getInput()/calcFunction()/evaluate() methods.

beforeEach(() => {
    DigitalElm.current = new Scheduler();
});

function fakeGate<T extends object>(proto: T, inputCount: number, flags: number): T {
    const gate = Object.create(proto) as any;
    gate.inputCount = inputCount;
    gate.flags = flags;
    gate.inputs = [];
    return gate;
}

describe("GateElm digital graph input path", () => {
    it("NAND reads from this.inputs, not this.nodes, once wired", () => {
        const gate = fakeGate(NandGateElm.prototype, 2, 0);
        gate.inputs = [new DigitalConst(true), new DigitalConst(true)];
        // gate.nodes deliberately left undefined - if getInput() fell back
        // to the voltage path here it would throw, not just be wrong.
        expect(gate.evaluate()).toBe(false); // NAND(1,1) = 0

        gate.inputs = [new DigitalConst(true), new DigitalConst(false)];
        expect(gate.evaluate()).toBe(true); // NAND(1,0) = 1
    });

    it("AND/XOR truth tables match via the digital graph", () => {
        const and = fakeGate(AndGateElm.prototype, 2, 0);
        and.inputs = [new DigitalConst(true), new DigitalConst(false)];
        expect(and.evaluate()).toBe(false);
        and.inputs = [new DigitalConst(true), new DigitalConst(true)];
        expect(and.evaluate()).toBe(true);

        const xor = fakeGate(XorGateElm.prototype, 2, 0);
        xor.inputs = [new DigitalConst(true), new DigitalConst(true)];
        expect(xor.evaluate()).toBe(false);
        xor.inputs = [new DigitalConst(true), new DigitalConst(false)];
        expect(xor.evaluate()).toBe(true);
    });

    it("FLAG_INVERT_INPUTS still applies on the digital graph path", () => {
        const and = fakeGate(AndGateElm.prototype, 2, AndGateElm.FLAG_INVERT_INPUTS);
        and.inputs = [new DigitalConst(false), new DigitalConst(false)];
        // both inputs read as inverted (true), so AND(true,true) = true
        expect(and.evaluate()).toBe(true);
    });
});
