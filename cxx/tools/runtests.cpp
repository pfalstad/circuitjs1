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

// Runs the regression tests (../auto-tests, see core/TestManager.h) headless, without
// drawing, the way the app runs each frame (as ts/scripts/run-tests.ts does in Chrome):
//
//   runtests [options] [test files...]
//
// Test files are relative to the current directory.  With none, it runs those listed in
// ../auto-tests/tests.txt (relative to this tool's source directory).  Options:
//   --list=FILE    run the tests in this list instead (entries relative to the list, like
//                  ../auto-tests/gen/tests.txt)
//   --steps=N      time steps per batch for tests that don't say, 200 by default, as
//                  run-tests.ts uses
//   -v             print the simulator's console messages
//
// TRACE=1 prints the time and node voltages after each batch.
//
// Exits with status 1 if any test fails.

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "core/CircuitElm.h"
#include "core/CircuitLoader.h"
#include "core/ElementFactory.h"
#include "core/ScopeManager.h"
#include "core/SimApp.h"
#include "core/SimulationManager.h"
#include "core/TestManager.h"

#ifndef AUTO_TESTS_DIR
#define AUTO_TESTS_DIR "../auto-tests/"
#endif

// the app without a window: a frozen clock (tests run a fixed number of steps per batch)
// and a fixed canvas size, which sets how many samples the scopes hold
class TestApp : public SimApp {
public:
    SimulationManager *sim = nullptr;
    CircuitLoader *loader = nullptr;

    double currentTimeMillis() override { return 1e12; }

    void readCircuit(const std::string &text, int flags) override {
        loader->readCircuit(text, flags);
        for (CircuitElm *ce : elmList)
            ce->setPoints();
        stopMessage.reset();
        stopElm = nullptr;
        simRunning = true;
        needAnalyze();
    }

    void setCircuitArea() override {
        double h = scopeManager->scopeCount == 0 ? 0 : std::round(canvasHeight * scopeManager->scopeHeightFraction);
        circuitArea = Rectangle(0, 0, canvasWidth, canvasHeight - h);
    }
};

int main(int argc, char **argv) {
    std::string list;
    std::vector<std::string> tests;
    int steps = 200;
    bool verbose = false;
    for (int i = 1; i < argc; i++) {
        std::string a = argv[i];
        if (a.rfind("--list=", 0) == 0)
            list = a.substr(7);
        else if (a.rfind("--steps=", 0) == 0)
            steps = std::atoi(a.c_str() + 8);
        else if (a == "-v")
            verbose = true;
        else if (a.rfind("-", 0) == 0) {
            std::fprintf(stderr, "usage: runtests [--list=FILE] [--steps=N] [-v] [test files...]\n");
            return 2;
        } else
            tests.push_back(a);
    }
    if (list.empty() && tests.empty())
        list = std::string(AUTO_TESTS_DIR) + "tests.txt";

    TestApp app;
    SimulationManager sim(&app);
    CircuitElm::app = &app;
    CircuitElm::sim = &sim;
    registerElements();
    ScopeManager scopes(&app);
    app.scopeManager = &scopes;
    CircuitLoader loader(&app, &sim);
    app.sim = &sim;
    app.loader = &loader;
    app.canvasWidth = 1400;
    app.canvasHeight = 900;
    // the simulator's console messages go to std::cerr
    std::ostringstream discard;
    if (!verbose)
        std::cerr.rdbuf(discard.rdbuf());

    TestManager tm(&app, &sim);
    tm.headless = true;
    if (steps > 0)
        tm.stepsPerFrame = steps;
    tm.onResult = [](const TestResult &r) {
        std::string s = (r.pass ? "PASS " : "FAIL ") + r.name;
        for (auto *v : {&r.failures, &r.errors})
            for (auto &m : *v)
                s += "\n    " + m;
        std::printf("%s\n", s.c_str());
        std::fflush(stdout);
    };

    auto start = std::chrono::steady_clock::now();
    if (!list.empty())
        tm.runTestList(list);
    else {
        tm.testList = tests;
        tm.runNextTest();
    }

    // the app's frame loop (CirSim::updateCircuit()), less the drawing.  With a frozen
    // clock, runCircuit() only runs once lastIterTime is set
    sim.lastIterTime = 1;
    while (!tm.done) {
        app.setCircuitArea();
        bool didAnalyze = app.analyzeFlag;
        if (app.analyzeFlag || app.dcAnalysisFlag) {
            sim.analyzeCircuit();
            app.analyzeFlag = false;
        }
        if (sim.needsStamp && app.simRunning) {
            try {
                sim.preStampAndStampCircuit();
            } catch (std::exception &e) {
                sim.stop("Exception in stampCircuit()", nullptr);
                tm.addError(std::string("exception in stampCircuit: ") + e.what());
            }
        }
        scopes.setupScopes();
        if (app.simRunning) {
            try {
                sim.runCircuit(didAnalyze);
            } catch (std::exception &e) {
                tm.addError(std::string("exception in runCircuit: ") + e.what());
            }
        }
        if (std::getenv("TRACE") && sim.t > 0) {
            std::printf("%.17g", sim.t);
            for (auto &n : sim.nodeList)
                std::printf(" %.17g", n->v);
            std::printf("\n");
        }
        // the simulator stopped on its own (singular matrix, say), so the test can't finish
        tm.checkStalled();
        tm.runPending();
    }

    size_t failed = 0;
    for (auto &r : tm.results)
        failed += !r.pass;
    std::printf("\n%zu tests, %zu passed, %zu failed (%.1fs)\n", tm.results.size(), tm.results.size() - failed, failed,
                std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count());
    // free the circuit while the scopes and simulator it refers to are still here
    app.deleteAllElms();
    app.processFreeList();
    app.scopeManager = nullptr;
    return failed > 0 || tm.results.empty() ? 1 : 0;
}
