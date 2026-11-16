/*
    Copyright (C) Paul Falstad

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

// Automated regression tests (TestManager.ts).
//
// A test is a circuit file with a <test len="..."/> tag, the switch toggles to replay
// (<switchevent t="..." en="..."/>) and the scope data to expect (<scopedata ...>).  The
// app runs one with --test <file> or a list of them with --testlist <file> (one file name per
// line, relative to the list); tools/runtests runs them headless.  With --testui, the side
// panel gets Start/Stop/Cancel Test buttons for recording a test: Start resets the circuit
// and starts recording switch toggles, Stop saves the circuit with the test tags added.
//
// While a test is running or being recorded, the simulation runs in batches of a fixed
// number of time steps instead of however many the clock allows each frame, so the results
// don't depend on how fast the machine is (with an adaptive time step, where a batch ends
// changes the waveform, and switch events take effect between batches).  A test records
// how many steps (<test spf="...">); otherwise it's stepsPerFrame, 20 by default.  The
// app runs batches back to back while a test runs, not one a frame (CirSim::runTestBatches()),
// so tests run as fast as the machine allows, with the same results.
// A test runs from reset, unless it says not to (<test noreset="1">): then it runs from the
// state the file was loaded in, to check that elements load the state they were saved with.
// The random numbers (noise sources, and op-amps and gates settling) come from a generator
// seeded the same way each time, for the same reason.
//
// The frame loop (CirSim::updateCircuit(), or tools/runtests) calls runPending() after each
// frame: the end of a test is handled there, after the frame is drawn, as TS's setTimeout().

#pragma once

#include <functional>
#include <optional>
#include <string>
#include <vector>

#include "SimulationManager.h"

class CircuitElm;
class ScopePlot;
class SimApp;

struct TestResult {
    std::string name;
    bool pass = false;
    std::vector<std::string> failures;
    std::vector<std::string> errors;
};

class TestManager : public TestHooks {
public:
    struct ScopeDataRef {
        int si, pi, en, value, units, speed;
        double ts;
        std::vector<double> values;
    };
    struct SwitchEvent {
        double t;
        int elmNo;
    };

    static TestManager *theManager;
    static constexpr double TOLERANCE = 1e-3;
    static constexpr double SCALE_TOLERANCE = 1e-4;

    SimApp *app;
    SimulationManager *sim;
    bool testRunning = false;
    bool recording = false;
    std::optional<std::string> savedCircuitDump;
    double testLen = -1;
    std::vector<ScopeDataRef> refData;
    std::vector<SwitchEvent> switchEvents;
    size_t nextEventIdx = 0;
    int stepsPerFrame = 20;
    // the test's own steps per frame (<test spf=>), 0 if it doesn't say
    int testSpf = 0;
    // the test runs from the state the file was loaded in, not from reset (<test noreset="1">)
    bool testNoReset = false;
    // don't show alerts (results go to the console and the callbacks)
    bool headless = false;

    // test list mode
    std::vector<std::string> testList;
    std::string testListDir;
    size_t testListIdx = 0;
    std::vector<TestResult> results;
    std::string currentTestName;
    // errors (exceptions) while the current test ran
    std::vector<std::string> currentErrors;
    bool done = false;

    // called after each test, and when the run is finished
    std::function<void(const TestResult &)> onResult;
    std::function<void()> onFinish;

    TestManager(SimApp *app, SimulationManager *sim);
    ~TestManager() override;

    // run one test file, or the tests listed in a file (relative to the list's directory)
    void runTest(const std::string &file);
    void runTestList(const std::string &file);
    void runNextTest();

    // the same random numbers each time a test runs
    void seedRandom();
    void startTest();

    // an error happened while a test ran (an exception in the simulator, say)
    void addError(const std::string &msg) {
        if (testRunning)
            currentErrors.push_back(msg);
    }

    // if the simulator stopped on its own (singular matrix, say) while a test ran, the test
    // can't reach its end, so end it there.  For running tests unattended: the web version
    // waits, as it does if the user stops the simulation
    void checkStalled();
    // run what was deferred to after the frame (the end of a test)
    void runPending();
    bool hasPending() const { return !pending.empty(); }

    // called from SwitchElm::toggle() (via CircuitElm::recordToggle())
    void recordSwitchToggle(CircuitElm *ce) override;

    // called from CircuitXMLDeserializer for <test>, <switchevent> and <scopedata>
    void saveTestTag(double len, int spf, bool noReset);
    void saveSwitchEvent(double t, int elmNo) { switchEvents.push_back({t, elmNo}); }
    void saveScopeDataTag(int si, int pi, int en, int v, int u, int sp, double ts, std::vector<double> values) {
        refData.push_back({si, pi, en, v, u, sp, ts, std::move(values)});
    }

    // --- hooks called from SimulationManager::runCircuit() ---
    int fixedStepsPerFrame() override { return testRunning ? (testSpf ? testSpf : stepsPerFrame) : 0; }
    double clampTimeStep(double t, double timeStep) override;
    bool checkTime() override;

    void compareAndReport();

    // --- recording (the Start/Stop/Cancel Test buttons) ---
    void startRecording();
    // stops recording and returns the test file, or nothing if it wasn't recording
    std::optional<std::string> stopRecording();
    void cancelRecording() { testRunning = recording = false; }
    // the circuit as it was when recording started, with the test tags added
    std::string testDump();
    std::string dumpSwitchEvents();
    std::string dumpScopeData();

private:
    std::vector<std::function<void()>> pending;

    void loadTestCircuit(const std::string &name);
    void addResult(TestResult r);
    void finish();
    void report(const std::string &msg);
    double eps() const;
    bool fireSwitchEvents(const std::vector<SwitchEvent> &events);
    int plotSampleCount(const ScopePlot &plot) const;
};
