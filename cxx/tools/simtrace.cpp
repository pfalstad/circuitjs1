/*
    Copyright (C) Paul Falstad and Iain Sharp

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

// Runs a circuit through the C++ simulator headless and prints node voltages and element
// currents after every timestep, in the same format as tools/simtrace.ts.
//
// usage: simtrace circuit.txt [steps]
//        simtrace --dump circuit.txt    (print the circuit as saved XML)
//        simtrace --testcircuit ClassName [text] [f=flags] [attr=value...]
//            print a test circuit: one element with a square-wave rail on every input
//            post, each at a different frequency.  XML by default; "text" writes the old
//            format, to test the elements' text-format loading.  "ui" gives a chip logic
//            inputs and outputs instead (clock pins still get a square wave), for trying
//            it by hand.
//
// DUMPMATRIX=n prints the matrices at step n; TOGGLE=elm:step,... toggles the switches
// with those element indexes at those steps (as clicking them in the app does).

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "core/CircuitElm.h"
#include "core/CircuitLoader.h"
#include "core/CircuitXMLDeserializer.h"
#include "core/CircuitXMLSerializer.h"
#include "core/XmlDoc.h"
#include "core/ScopeManager.h"
#include "core/ElementFactory.h"
#include "core/SimApp.h"
#include "core/SimulationManager.h"
#include "core/JsNumber.h"
#include "elements/ChipElm.h"
#include "elements/AudioOutputElm.h"
#include "elements/LogicInputElm.h"
#include "elements/SwitchElm.h"
#include "elements/VoltageElm.h"

// frozen clock and fixed "random" numbers, matching the TS harness
class TraceApp : public SimApp {
public:
    double getIterCount() override { return 1; }
    double currentTimeMillis() override { return 1e12; }
    double randomDouble() override { return 0.5; }
    int randomInt() override { return 0; }
};

static int testCircuit(TraceApp &app, SimulationManager &sim, const std::string &cls, bool text, bool ui, int flags,
                       const std::vector<std::pair<std::string, std::string>> &attrs) {
    CircuitElm *elm = ElementFactory::create(cls, 192, 96);
    if (elm == nullptr) {
        std::cerr << "no class " << cls << "\n";
        return 1;
    }
    if (flags >= 0) {
        elm->flags = flags;
        if (ChipElm *chip = dynamic_cast<ChipElm *>(elm)) {
            chip->setupPins();
            chip->allocNodes();
        }
    }
    elm->drag(192 + 64, 96);
    if (!attrs.empty()) {
        // set XML attributes by round-tripping the element through XML
        XmlElement root("cir");
        XmlElement e(elm->getXmlDumpType());
        elm->dumpXml(&root, &e);
        for (auto &a : attrs)
            e.setAttribute(a.first, a.second);
        CircuitXMLDeserializer xml(&app);
        xml.currentXmlElement = &e;
        xml.currentElm = elm;
        elm->undumpXml(xml);
        elm->setPositionFromXml(&e);
    }
    elm->setPoints();
    app.elmList.push_back(elm);
    std::string lines;
    int n = 0;
    int minX = 1 << 30, maxX = -(1 << 30);
    for (int i = 0; i != elm->getPostCount(); i++) {
        minX = std::min(minX, elm->getPost(i).x);
        maxX = std::max(maxX, elm->getPost(i).x);
    }
    int centerX = maxX > minX ? (minX + maxX) / 2 : elm->getPost(0).x + 16;
    for (int i = 0; i != elm->getPostCount(); i++) {
        // outputs drive themselves; bus bits share a post, so skip them
        if (elm->hasGroundConnection(i) || elm->getPostWidth(i) > 1)
            continue;
        Point pt = elm->getPost(i);
        double freq = 211 * (n + 1) + 97 * n * n;
        n++;
        // the rail's post is its first point; point it away from the element
        int dx = pt.x < centerX ? -32 : 32;
        ChipElm *chip = dynamic_cast<ChipElm *>(elm);
        if (ui && chip != nullptr && !chip->pins[i].clock) {
            // active-low and enable inputs start out high
            Pin &pin = chip->pins[i];
            CircuitElm *e = ElementFactory::create("LogicInputElm", pt.x, pt.y);
            if (pin.bubble || pin.text.rfind("En", 0) == 0)
                static_cast<LogicInputElm *>(e)->position = 1;
            e->drag(pt.x + dx * 2, pt.y);
            e->setPoints();
            app.elmList.push_back(e);
            continue;
        }
        if (ui)
            freq = 100;
        if (text) {
            lines += "R " + std::to_string(pt.x) + " " + std::to_string(pt.y) + " " + std::to_string(pt.x + dx) +
                     " " + std::to_string(pt.y) + " 0 2 " + jsNumberToString(freq) + " 2.5 2.5 0 0.5\n";
            continue;
        }
        CircuitElm *r = ElementFactory::create("RailElm", pt.x, pt.y);
        r->drag(pt.x + dx, pt.y);
        VoltageElm *v = static_cast<VoltageElm *>(r);
        v->waveform = VoltageElm::WF_SQUARE;
        v->frequency = freq;
        v->maxVoltage = 2.5;
        v->bias = 2.5;
        r->setPoints();
        app.elmList.push_back(r);
    }
    if (ui) {
        if (ChipElm *chip = dynamic_cast<ChipElm *>(elm))
            for (int i = 0; i != elm->getPostCount(); i++) {
                if (!chip->pins[i].output || elm->getPostWidth(i) > 1)
                    continue;
                Point pt = elm->getPost(i);
                int dx = pt.x < centerX ? -64 : 64;
                CircuitElm *e = ElementFactory::create("LogicOutputElm", pt.x, pt.y);
                e->drag(pt.x + dx, pt.y);
                e->setPoints();
                app.elmList.push_back(e);
            }
        if (text) {
            std::printf("$ 1 5.0E-6 10 50 5.0 50 5e-11\n");
            for (CircuitElm *e : app.elmList) {
                if (e->getDumpType() == 'R')
                    continue;
                if (e->getDumpType() == 'L')  // the old format, with position and momentary
                    std::printf("L %d %d %d %d 0 %d false 5 0\n", e->x, e->y, e->x2, e->y2,
                                static_cast<LogicInputElm *>(e)->position);
                else
                    std::printf("%s\n", e->dump().c_str());
            }
            std::printf("%s", lines.c_str());
            return 0;
        }
    }
    if (text) {
        std::printf("$ 1 5.0E-6 10 50 5.0 50 5e-11\n%s\n%s", elm->dump().c_str(), lines.c_str());
        return 0;
    }
    sim.maxTimeStep = sim.timeStep = 5e-6;
    sim.minTimeStep = 50e-12;
    CircuitXMLSerializer xml(&app, &sim);
    std::fputs(xml.dumpCircuit().c_str(), stdout);
    return 0;
}

int main(int argc, char **argv) {
    if (argc > 2 && std::string(argv[1]) == "--testcircuit") {
        TraceApp app;
        SimulationManager sim(&app);
        CircuitElm::app = &app;
        CircuitElm::sim = &sim;
        registerElements();
        bool text = false, ui = false;
        int flags = -1;
        std::vector<std::pair<std::string, std::string>> attrs;
        for (int i = 3; i < argc; i++) {
            std::string a = argv[i];
            size_t eq = a.find('=');
            if (a == "text")
                text = true;
            else if (a == "ui")
                ui = true;
            else if (a.rfind("f=", 0) == 0)
                flags = std::atoi(a.c_str() + 2);
            else if (eq != std::string::npos)
                attrs.emplace_back(a.substr(0, eq), a.substr(eq + 1));
        }
        return testCircuit(app, sim, argv[2], text, ui, flags, attrs);
    }
    bool dump = argc > 1 && std::string(argv[1]) == "--dump";
    if (dump) {
        argv++;
        argc--;
    }
    if (argc < 2) {
        std::cerr << "usage: simtrace [--dump] circuit.txt [steps]\n";
        return 1;
    }
    int steps = argc > 2 ? std::atoi(argv[2]) : 1000;

    std::ifstream in(argv[1], std::ios::binary);
    if (!in) {
        std::cerr << "can't open " << argv[1] << "\n";
        return 1;
    }
    std::stringstream ss;
    ss << in.rdbuf();

    TraceApp app;
    SimulationManager sim(&app);
    CircuitElm::app = &app;
    CircuitElm::sim = &sim;
    registerElements();

    ScopeManager scopes(&app);
    if (dump)
        app.scopeManager = &scopes;  // so scopes get loaded and saved

    CircuitLoader loader(&app, &sim);
    loader.readCircuit(ss.str());
    for (CircuitElm *ce : app.elmList)
        ce->setPoints();

    if (dump) {
        CircuitXMLSerializer xml(&app, &sim);
        std::fputs(xml.dumpCircuit().c_str(), stdout);
        app.scopeManager = nullptr;
        return 0;
    }

    // with no time passing, each runCircuit(true) call does exactly one timestep
    sim.lastIterTime = 1;

    // SOLVER=n overrides the circuit's matrix solver (0=auto, 1=dense, 2=sparse)
    if (const char *so = std::getenv("SOLVER"))
        sim.solverType = std::atoi(so);

    sim.analyzeCircuit();
    sim.preStampAndStampCircuit();

    const char *ds = std::getenv("DUMPMATRIX");
    int dumpStep = ds ? std::atoi(ds) : -1;
    // TOGGLE=elm:step,... toggles switches, as clicking them in the app does
    std::vector<std::pair<int, int>> toggles;
    if (const char *tg = std::getenv("TOGGLE")) {
        std::stringstream ts(tg);
        std::string item;
        while (std::getline(ts, item, ','))
            if (item.find(':') != std::string::npos)
                toggles.emplace_back(std::atoi(item.c_str()), std::atoi(item.c_str() + item.find(':') + 1));
    }
    for (int s = 0; s < steps; s++) {
        if (s == dumpStep)
            app.dumpMatrix = true;
        bool toggled = false;
        for (auto &t : toggles)
            if (t.second == s) {
                if (SwitchElm *sw = dynamic_cast<SwitchElm *>(app.getElm(t.first))) {
                    sw->toggle();
                    toggled = true;
                }
            }
        if (toggled) {
            // what the app's next frame does after needAnalyze()
            sim.analyzeCircuit();
            if (sim.needsStamp)
                sim.preStampAndStampCircuit();
        }
        sim.runCircuit(true);
        if (app.stopMessage) {
            std::printf("stop %s\n", app.stopMessage->c_str());
            break;
        }
        std::printf("%.17g", sim.t);
        for (auto &n : sim.nodeList)
            std::printf(" %.17g", n->v);
        std::printf(" |");
        for (CircuitElm *ce : sim.elmList)
            std::printf(" %.17g", ce->getCurrent());
        std::printf("\n");
    }
    // AUDIOOUT=file: press Play on the first audio output and save the WAV it would play
    if (const char *ao = std::getenv("AUDIOOUT")) {
        for (CircuitElm *ce : app.elmList)
            if (ce->isAudioOutputElm()) {
                static_cast<AudioOutputElm *>(ce)->play();
                break;
            }
        if (!AudioOutputElm::lastWav.empty()) {
            std::ofstream out(ao, std::ios::binary);
            out.write((const char *) AudioOutputElm::lastWav.data(), (std::streamsize) AudioOutputElm::lastWav.size());
        }
    }
    return 0;
}
