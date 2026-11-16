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

// Evaluates expressions read from stdin (one per line) with fixed inputs, printing the
// result or the parse error, in the same format as tools/exprtest.ts.

#include <cstdio>
#include <iostream>
#include <string>

#include "core/CircuitElm.h"
#include "core/Expr.h"
#include "core/SimApp.h"
#include "core/SimulationManager.h"

int main() {
    SimApp app;
    SimulationManager sim(&app);
    CircuitElm::sim = &sim;
    sim.timeStep = 5e-6;
    std::string line;
    while (std::getline(std::cin, line)) {
        ExprParser p(line);
        std::unique_ptr<Expr> e = p.parseExpression();
        if (p.gotError()) {
            std::printf("error %s\n", p.gotError()->c_str());
            continue;
        }
        ExprState es;
        for (int i = 0; i != 9; i++) {
            es.values[i] = 0.37 * (i + 1) - 1.1;
            es.lastValues[i] = 0.31 * (i + 1) - 1.0;
        }
        es.t = 0.0123;
        es.lastOutput = 0.5;
        es.nodeValues.assign(p.getNodeRefs().size(), 1.25);
        es.lastNodeValues.assign(p.getNodeRefs().size(), 1.0);
        std::printf("%.17g\n", e->eval(es));
    }
    return 0;
}
