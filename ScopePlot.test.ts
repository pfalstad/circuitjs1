import { describe, it, expect, vi } from "vitest";
import { ScopePlot } from "./ScopePlot";
import { UNITS_V, VAL_VOLTAGE } from "./ScopeConstants";
import { State } from "./digital/DigitalElm";

// A digital element is duck-typed by digitalScopeSource() (addInput() +
// numeric inputCount, matching GateElm/InverterElm/DelayBufferElm), so a
// plain fake object exercises the real ScopePlot.fillFromDigitalHistory()
// logic without needing a real CircuitElm (which needs CircuitElm.app -
// see ChipGroupLogic.test.ts).
function fakeDigitalElm(history: [number, boolean][], nowTick: number, state = State.Passive, highVoltage = 5) {
    return {
        addInput: () => {},
        inputCount: 1,
        scheduler: { currentTime: nowTick },
        state,
        history,
        highVoltage,
        currentValue: () => (history.length ? history[history.length - 1][1] : false),
        _backfillHistory: vi.fn(),
    } as any;
}

describe("ScopePlot digital history fill", () => {
    it("recognizes a gate-like element as a digital scope source", () => {
        const elm = fakeDigitalElm([], 0);
        const plot = new ScopePlot(elm, UNITS_V, VAL_VOLTAGE, 1);
        expect(plot.digitalElm).toBe(elm);
        expect(plot.canAcCouple()).toBe(false);
    });

    it("leaves a non-voltage plot (e.g. current) with no digitalElm", () => {
        const elm = fakeDigitalElm([], 0);
        const plot = new ScopePlot(elm, 1 /* UNITS_A */, 3 /* VAL_CURRENT */, 1);
        expect(plot.digitalElm).toBeNull();
    });

    it("fills columns from the change-list, marking any column a transition crossed", () => {
        const elm = fakeDigitalElm([[0, true], [25, false], [50, true]], 100);
        const plot = new ScopePlot(elm, UNITS_V, VAL_VOLTAGE, 1);
        plot.scopePointCount = 8; // power of 2, per the ptr-masking convention
        plot.scopePlotSpeed = 10; // ticks per column
        plot.minValues = new Array(8).fill(0);
        plot.maxValues = new Array(8).fill(0);

        plot.fillFromDigitalHistory();

        // window = [20, 100), 10 ticks/column:
        // col0 [20,30): true->false@25   -> 0..5
        // col1 [30,40): steady false     -> 0..0
        // col2 [40,50): steady false     -> 0..0
        // col3 [50,60): false->true@50   -> 0..5
        // col4-7 [60,100): steady true   -> 5..5
        expect(plot.minValues).toEqual([0, 0, 0, 0, 5, 5, 5, 5]);
        expect(plot.maxValues).toEqual([5, 0, 0, 5, 5, 5, 5, 5]);
        expect(plot.ptr).toBe(7);
    });

    it("backfills an Asleep element's history before reading it", () => {
        const elm = fakeDigitalElm([[0, false]], 100, State.Asleep);
        const plot = new ScopePlot(elm, UNITS_V, VAL_VOLTAGE, 1);
        plot.scopePointCount = 4;
        plot.scopePlotSpeed = 10;
        plot.minValues = new Array(4).fill(0);
        plot.maxValues = new Array(4).fill(0);

        plot.fillFromDigitalHistory();

        expect(elm._backfillHistory).toHaveBeenCalledWith(100);
    });

    it("does not rebuild twice for the same scheduler tick", () => {
        const elm = fakeDigitalElm([[0, true]], 50);
        const plot = new ScopePlot(elm, UNITS_V, VAL_VOLTAGE, 1);
        plot.scopePointCount = 4;
        plot.scopePlotSpeed = 10;
        plot.minValues = new Array(4).fill(0);
        plot.maxValues = new Array(4).fill(0);

        plot.fillFromDigitalHistory();
        plot.minValues[0] = 999; // sentinel - a second rebuild would overwrite this
        plot.fillFromDigitalHistory();
        expect(plot.minValues[0]).toBe(999);
    });

    it("re-resolves digitalElm once wiring becomes available (save/reload regression)", () => {
        // Reproduces the ScopeSerializer.undumpXml() ordering bug: a
        // LabeledNodeElm-like wire-equivalent element whose node/links
        // aren't populated yet at ScopePlot construction time (the node
        // graph is built later, once the whole saved circuit has been
        // read) must not be permanently stuck with digitalElm === null.
        const label: any = { isWireEquivalent: () => true, nodes: [] };
        const plot = new ScopePlot(label, UNITS_V, VAL_VOLTAGE, 1);
        expect(plot.digitalElm).toBeNull(); // nothing to resolve against yet

        // Wiring completes (SimulationManager.makeNodeList() equivalent).
        const driver = fakeDigitalElm([[0, true]], 0);
        // driver's output post is index `inputCount` (1), matching
        // GateElm's real convention - see CircuitWiring.isDigitalOutputPost().
        label.nodes = [{ links: [{ num: 1, elm: driver }, { num: 0, elm: label }] }];

        plot.refreshDigitalSource();
        expect(plot.digitalElm).toBe(driver);
    });
});
