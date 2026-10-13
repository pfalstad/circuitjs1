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

#include <clocale>

#include "CirSim.h"
#include "ConsoleDialog.h"
#include "QtGraphics.h"

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
    if (!args.isEmpty())
        app.loadFile(args[0]);
    else
        app.loadDefaultCircuit();
    return qapp.exec();
}
