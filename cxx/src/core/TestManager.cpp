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

#include "TestManager.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <memory>
#include <sstream>

#include "CircuitElm.h"
#include "JsNumber.h"
#include "NumberFormat.h"
#include "Scope.h"
#include "ScopeManager.h"
#include "ScopePlot.h"
#include "SimApp.h"
#include "../elements/SwitchElm.h"

TestManager *TestManager::theManager = nullptr;

TestManager::TestManager(SimApp *a, SimulationManager *s) : app(a), sim(s) {
    theManager = this;
    SimulationManager::testHooks = this;
}

TestManager::~TestManager() {
    if (theManager == this)
        theManager = nullptr;
    if (SimulationManager::testHooks == this)
        SimulationManager::testHooks = nullptr;
}

static bool readFile(const std::string &path, std::string &text) {
    std::ifstream in(path, std::ios::binary);
    if (!in)
        return false;
    std::stringstream ss;
    ss << in.rdbuf();
    text = ss.str();
    return true;
}

static std::string dirOf(const std::string &path) {
    size_t slash = path.find_last_of("/\\");
    return slash == std::string::npos ? "" : path.substr(0, slash + 1);
}

static bool isAbsolute(const std::string &path) {
    return !path.empty() && (path[0] == '/' || path[0] == '\\' || (path.size() > 1 && path[1] == ':'));
}

static std::string trim(const std::string &s) {
    size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos)
        return "";
    size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

static std::string joinLines(const std::vector<std::string> &a, const std::vector<std::string> &b,
                             const std::string &sep) {
    std::string out;
    for (auto *v : {&a, &b})
        for (auto &s : *v)
            out += sep + s;
    return out;
}

void TestManager::runTest(const std::string &file) {
    testList = {file};
    testListDir = "";
    testListIdx = 0;
    results.clear();
    done = false;
    runNextTest();
}

void TestManager::runTestList(const std::string &file) {
    testList.clear();
    testListIdx = 0;
    results.clear();
    done = false;
    std::string text;
    if (!readFile(file, text)) {
        report("Could not load test list: " + file);
        finish();
        return;
    }
    std::istringstream in(text);
    std::string line;
    while (std::getline(in, line)) {
        line = trim(line);
        if (!line.empty() && line[0] != '#')
            testList.push_back(line);
    }
    testListDir = dirOf(file);
    runNextTest();
}

void TestManager::loadTestCircuit(const std::string &name) {
    std::string path = isAbsolute(name) ? name : testListDir + name;
    std::string text;
    if (!readFile(path, text)) {
        addResult({name, false, {"could not load: " + path}, {}});
        return;
    }
    testLen = -1;
    testSpf = 0;
    testNoReset = false;
    refData.clear();
    switchEvents.clear();
    currentErrors.clear();
    try {
        app->readCircuit(text);
    } catch (std::exception &e) {
        addResult({name, false, {std::string("exception loading: ") + e.what()}, {}});
        return;
    }
    // under "Current Circuit:" (after loading, which clears it)
    size_t count = testList.size();
    app->setCircuitTitle(count > 1 ? name + " (" + std::to_string(testListIdx) + "/" + std::to_string(count) + ")"
                                   : name);
    if (testLen < 0) {
        addResult({name, false, {"no <test> tag"}, {}});
        return;
    }
    startTest();
}

void TestManager::runNextTest() {
    if (testListIdx >= testList.size()) {
        finish();
        return;
    }
    currentTestName = testList[testListIdx++];
    loadTestCircuit(currentTestName);
}

void TestManager::seedRandom() {
    // mulberry32, as in the TS version (Math.imul is a 32-bit multiply)
    auto state = std::make_shared<uint32_t>(12345);
    app->randomSource = [state]() {
        uint32_t &a = *state;
        a += 0x6D2B79F5u;
        uint32_t t = (a ^ (a >> 15)) * (1u | a);
        t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
        return (double) (t ^ (t >> 14)) / 4294967296.0;
    };
}

void TestManager::startTest() {
    recording = false;
    nextEventIdx = 0;
    seedRandom();
    if (!testNoReset)
        app->resetAction();
    app->setSimRunning(true);
    testRunning = true;
}

void TestManager::addResult(TestResult r) {
    results.push_back(r);
    SimulationManager::console((r.pass ? "PASS: " : "FAIL: ") + r.name + joinLines(r.failures, r.errors, "\n    "));
    if (onResult)
        onResult(r);
    runNextTest();
}

void TestManager::finish() {
    done = true;
    testRunning = recording = false;
    size_t passed = std::count_if(results.begin(), results.end(), [](const TestResult &r) { return r.pass; });
    size_t failed = results.size() - passed;
    if (results.size() == 1) {
        const TestResult &r = results[0];
        report(r.pass ? "Test PASSED" : "Test FAILED:" + joinLines(r.failures, r.errors, "\n"));
    } else {
        std::string msg = "Tests: " + std::to_string(results.size()) + ", Passed: " + std::to_string(passed) +
                          ", Failed: " + std::to_string(failed);
        if (failed > 0) {
            msg += "\n\nFailures:";
            for (auto &r : results)
                if (!r.pass)
                    msg += "\n" + r.name + joinLines(r.failures, r.errors, "\n  ");
        }
        report(msg);
    }
    if (onFinish)
        onFinish();
}

void TestManager::report(const std::string &msg) {
    SimulationManager::console(msg);
    if (!headless)
        app->alert(msg);
}

void TestManager::checkStalled() {
    if (testRunning && !recording && !app->simRunning && pending.empty()) {
        testRunning = false;
        pending.push_back([this] { compareAndReport(); });
    }
}

void TestManager::runPending() {
    auto p = std::move(pending);
    pending.clear();
    for (auto &f : p)
        f();
}

void TestManager::recordSwitchToggle(CircuitElm *se) {
    if (!recording)
        return;
    int elmNo = app->locateElm(se);
    if (elmNo >= 0)
        switchEvents.push_back({sim->t, elmNo});
}

void TestManager::saveTestTag(double len, int spf, bool noReset) {
    testLen = len;
    testSpf = spf;
    testNoReset = noReset;
    refData.clear();
    switchEvents.clear();
}

// how close to an event's time counts as having reached it
double TestManager::eps() const { return sim->maxTimeStep * 1e-6; }

double TestManager::clampTimeStep(double t, double timeStep) {
    if (!testRunning)
        return timeStep;
    double e = eps();
    if (!recording && nextEventIdx < switchEvents.size()) {
        double evTime = switchEvents[nextEventIdx].t;
        if (evTime > t + e && evTime < t + timeStep - e)
            return evTime - t;
    }
    if (testLen >= 0 && testLen > t + e && testLen < t + timeStep - e)
        return testLen - t;
    return timeStep;
}

bool TestManager::checkTime() {
    if (!testRunning || recording)
        return false;
    if (fireSwitchEvents(switchEvents))
        return true;
    if (testLen >= 0 && sim->t >= testLen - eps()) {
        testRunning = false;
        app->setSimRunning(false);
        // let the frame finish drawing before moving on, so errors drawing it are counted
        pending.push_back([this] { compareAndReport(); });
        return true;
    }
    return false;
}

bool TestManager::fireSwitchEvents(const std::vector<SwitchEvent> &events) {
    double t = sim->t + eps();
    bool fired = false, analyze = false;
    while (nextEventIdx < events.size()) {
        const SwitchEvent &ev = events[nextEventIdx];
        if (ev.t > t)
            break;
        CircuitElm *ce = app->getElm(ev.elmNo);
        if (ce != nullptr && ce->isSwitchElm()) {
            static_cast<SwitchElm *>(ce)->toggle();
            // as the mouse and keyboard handlers do
            if (!ce->isLogicInputElm())
                analyze = true;
            fired = true;
        } else
            currentErrors.push_back("switch event at t=" + jsNumberToString(ev.t) + ": element " +
                                    std::to_string(ev.elmNo) + " is not a switch");
        nextEventIdx++;
    }
    if (fired && analyze)
        app->needAnalyze();
    return fired;
}

// the sample times, oldest first, that dumpScopeData() writes for a plot.  This keeps the
// Java version's order so its test files still work: the values are the plot's buffer from
// (ptr - n) to (ptr - 1), where n is the number of samples (one per pixel, those at t >= 0).
// The first can be the current, partly filled sample instead, so compareAndReport() skips it.
int TestManager::plotSampleCount(const ScopePlot &plot) const {
    int spc = plot.scopePointCount;
    double ts = sim->maxTimeStep * plot.scopePlotSpeed;
    double tStart = sim->t - ts * spc;
    int n = 0;
    for (int i = 0; i < spc; i++)
        if (tStart + ts * i >= 0)
            n++;
    return n;
}

void TestManager::compareAndReport() {
    std::vector<std::string> failures;
    ScopeManager *sm = app->scopeManager;
    if (refData.empty())
        failures.push_back("no scope data to compare");
    for (const ScopeDataRef &ref : refData) {
        std::string label = "scope " + std::to_string(ref.si) + " plot " + std::to_string(ref.pi);
        if (sm == nullptr || ref.si >= sm->scopeCount) {
            failures.push_back(label + ": no such scope");
            continue;
        }
        Scope &scope = *sm->scopes[ref.si];
        if (ref.pi >= (int) scope.plots.size()) {
            failures.push_back(label + ": no such plot");
            continue;
        }
        ScopePlot &plot = *scope.plots[ref.pi];
        if (plot.elm == nullptr || plot.liveMax.empty()) {
            failures.push_back(label + ": no data");
            continue;
        }
        int en = app->locateElm(plot.elm);
        if (en != ref.en || plot.value != ref.value || plot.scopePlotSpeed != ref.speed) {
            failures.push_back(label + ": shows element " + std::to_string(en) + " value " + std::to_string(plot.value) +
                               " speed " + std::to_string(plot.scopePlotSpeed) + ", test expects element " +
                               std::to_string(ref.en) + " value " + std::to_string(ref.value) + " speed " +
                               std::to_string(ref.speed));
            continue;
        }
        int spc = plot.scopePointCount;
        int n = (int) ref.values.size();
        int mismatch = 0;
        double maxDiff = 0;
        std::string first;
        // within TOLERANCE of the value, but near zero (where a waveform crosses it) that's
        // too fine, so at least a small fraction of the plot's peak
        double peak = -INFINITY;
        for (double v : ref.values)
            peak = std::max(peak, std::fabs(v));
        double floor = std::max(1e-9, SCALE_TOLERANCE * peak);
        // skip k = 0 (see plotSampleCount()), and samples older than this scope holds
        for (int k = std::max(1, n - spc + 1); k < n; k++) {
            int age = n - k;
            double actual = plot.liveMax[(plot.ptr - age) & (spc - 1)];
            double expected = ref.values[k];
            double diff = std::fabs(actual - expected);
            double tol = std::max(TOLERANCE * std::fabs(expected), floor);
            if (!(diff <= tol)) {
                if (mismatch == 0)
                    first = ", first at sample " + std::to_string(k) + " (t=" +
                            jsToPrecision(sim->t - age * ref.ts, 4) + "): got " + jsNumberToString(actual) +
                            ", expected " + jsNumberToString(expected);
                mismatch++;
                if (!(diff <= maxDiff))
                    maxDiff = diff;
            }
        }
        if (mismatch > 0)
            failures.push_back(label + ": " + std::to_string(mismatch) + " of " + std::to_string(n - 1) +
                               " samples differ, max diff=" + jsNumberToString(maxDiff) + first);
    }
    if (app->stopMessage)
        failures.push_back("simulation stopped: " + *app->stopMessage);
    std::vector<std::string> errors;
    for (auto &e : currentErrors)
        errors.push_back("error: " + e);
    addResult({currentTestName.empty() ? "test" : currentTestName, failures.empty() && currentErrors.empty(),
               failures, errors});
}

// --- recording ---

void TestManager::startRecording() {
    switchEvents.clear();
    testLen = -1;
    testSpf = 0;
    testNoReset = false;
    seedRandom();
    app->resetAction();
    savedCircuitDump = app->dumpCircuit();
    testRunning = true;
    recording = true;
}

std::optional<std::string> TestManager::stopRecording() {
    if (!recording)
        return std::nullopt;
    testRunning = recording = false;
    return testDump();
}

std::string TestManager::testDump() {
    std::string dump = savedCircuitDump ? *savedCircuitDump : app->dumpCircuit();
    std::string insert = "  <test len=\"" + jsNumberToString(sim->t) + "\" spf=\"" +
                         std::to_string(testSpf ? testSpf : stepsPerFrame) + "\"" +
                         (testNoReset ? " noreset=\"1\"" : "") + "/>\n" + dumpSwitchEvents() + dumpScopeData();
    size_t idx = dump.rfind("</cir>");
    if (idx != std::string::npos)
        dump.insert(idx, insert);
    else
        dump += insert;
    return dump;
}

std::string TestManager::dumpSwitchEvents() {
    std::string sb;
    for (auto &ev : switchEvents)
        sb += "  <switchevent t=\"" + jsNumberToString(ev.t) + "\" en=\"" + std::to_string(ev.elmNo) + "\"/>\n";
    return sb;
}

std::string TestManager::dumpScopeData() {
    std::string sb;
    ScopeManager *sm = app->scopeManager;
    if (sm == nullptr)
        return sb;
    for (int si = 0; si < sm->scopeCount; si++) {
        Scope &scope = *sm->scopes[si];
        for (size_t pi = 0; pi < scope.plots.size(); pi++) {
            ScopePlot &plot = *scope.plots[pi];
            if (plot.elm == nullptr || plot.liveMax.empty())
                continue;
            int en = app->locateElm(plot.elm);
            if (en < 0)
                continue;
            int spc = plot.scopePointCount;
            double ts = sim->maxTimeStep * plot.scopePlotSpeed;
            int n = plotSampleCount(plot);
            std::string vals;
            for (int k = 0; k < n; k++) {
                if (k)
                    vals += ",";
                vals += jsNumberToString(plot.liveMax[(plot.ptr - n + k) & (spc - 1)]);
            }
            sb += "  <scopedata si=\"" + std::to_string(si) + "\" pi=\"" + std::to_string(pi) + "\" en=\"" +
                  std::to_string(en) + "\" v=\"" + std::to_string(plot.value) + "\" u=\"" + std::to_string(plot.units) +
                  "\" sp=\"" + std::to_string(plot.scopePlotSpeed) + "\" ts=\"" + jsNumberToString(ts) + "\">" + vals +
                  "</scopedata>\n";
        }
    }
    return sb;
}
