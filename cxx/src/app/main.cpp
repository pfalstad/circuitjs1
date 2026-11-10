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

#include <QApplication>
#include <QTimer>

#include <clocale>
#include <cstdio>
#include <optional>

#include "CirSim.h"
#include "ConsoleDialog.h"
#include "QtGraphics.h"
#include "core/TestManager.h"

int main(int argc, char **argv) {
    QApplication qapp(argc, argv);
    // QApplication sets the C locale from the environment on Unix; keep '.' as
    // the decimal point so strtod/printf work the same in comma-decimal locales
    std::setlocale(LC_NUMERIC, "C");
    QApplication::setApplicationName("CircuitJS1");
    QApplication::setOrganizationName("lushprojects");

    QStringList args = QCoreApplication::arguments();
    args.removeFirst();
    // --lang xx: use that language instead of the saved or system one
    int li = args.indexOf("--lang");
    if (li >= 0 && li + 1 < args.size()) {
        CirSim::langOverride = args[li + 1];
        args.remove(li, 2);
    }
    // --pos x,y: top-left of the window (used by New Window to cascade)
    int pi = args.indexOf("--pos");
    if (pi >= 0 && pi + 1 < args.size()) {
        QStringList xy = args[pi + 1].split(',');
        if (xy.size() == 2) {
            CirSim::posOverride = QPoint(xy[0].toInt(), xy[1].toInt());
            CirSim::hasPosOverride = true;
        }
        args.remove(pi, 2);
    }

    QtGraphicsImage::install();
    // before CirSim, so it captures loading messages and outlives it
    ConsoleDialog console;
    CirSim app;
    app.show();

    // --screenshot out.png [--frames n]: render, save the canvas, quit
    int shot = args.indexOf("--screenshot");
    if (shot >= 0 && shot + 1 < args.size()) {
        int frames = 60;
        int fi = args.indexOf("--frames");
        if (fi >= 0 && fi + 1 < args.size()) {
            frames = args[fi + 1].toInt();
            args.remove(fi, 2);
            if (fi < shot)
                shot -= 2;
        }
        app.scheduleScreenshot(args[shot + 1], frames);
        args.remove(shot, 2);
    }
    // regression tests (core/TestManager.h): --test file or --testlist file runs them,
    // --testui adds the Start/Stop/Cancel Test buttons for recording one.  --teststeps n
    // sets the time steps per batch for tests that don't say.  --headless prints the results instead of showing them, and quits when
    // done, with exit status 1 if any test failed (add -platform offscreen for no window).
    auto takeOption = [&](const QString &name) -> std::optional<QString> {
        int i = args.indexOf(name);
        if (i < 0 || i + 1 >= args.size())
            return std::nullopt;
        QString v = args[i + 1];
        args.remove(i, 2);
        return v;
    };
    auto takeFlag = [&](const QString &name) {
        int i = args.indexOf(name);
        if (i >= 0)
            args.remove(i);
        return i >= 0;
    };
    std::optional<QString> testFile = takeOption("--test");
    std::optional<QString> testList = takeOption("--testlist");
    std::optional<QString> testSteps = takeOption("--teststeps");
    bool testUi = takeFlag("--testui");
    bool headless = takeFlag("--headless");
    if (testFile || testList || testUi) {
        TestManager *tm = app.getTestManager();
        tm->headless = headless;
        if (testSteps && testSteps->toInt() > 0)
            tm->stepsPerFrame = testSteps->toInt();
        if (testUi)
            app.addTestButtons();
        if (headless) {
            tm->onResult = [](const TestResult &r) {
                std::string s = (r.pass ? "PASS " : "FAIL ") + r.name;
                for (auto *v : {&r.failures, &r.errors})
                    for (auto &m : *v)
                        s += "\n    " + m;
                std::printf("%s\n", s.c_str());
                std::fflush(stdout);
            };
            tm->onFinish = [tm] {
                size_t failed = 0;
                for (auto &r : tm->results)
                    failed += !r.pass;
                std::printf("\n%zu tests, %zu passed, %zu failed\n", tm->results.size(), tm->results.size() - failed,
                            failed);
                std::fflush(stdout);
                int code = failed > 0 || tm->results.empty() ? 1 : 0;
                QTimer::singleShot(0, [code] { QApplication::exit(code); });
            };
        }
    }
    if (testFile || testList) {
        // after the window is up, as the web version runs them after init()
        QTimer::singleShot(0, &app, [&app, testFile, testList] {
            if (testFile)
                app.getTestManager()->runTest(testFile->toStdString());
            else
                app.getTestManager()->runTestList(testList->toStdString());
        });
    } else if (!args.isEmpty())
        app.loadFile(args[0]);
    else
        app.loadDefaultCircuit();
    return qapp.exec();
}
