// Evaluates expressions read from stdin (one per line) with fixed inputs, printing the
// result or the parse error, in the same format as tools/exprtest.cpp.

import fs from "node:fs";
import { Expr, ExprParser, ExprState } from "../../ts/Expr";
import { SimulationManager } from "../../ts/SimulationManager";

(SimulationManager as any).theSim = { timeStep: 5e-6 };
const out: string[] = [];
for (const line of fs.readFileSync(0, "utf8").split("\n")) {
    if (line === "") continue;
    const p = new ExprParser(line);
    const e: Expr = p.parseExpression();
    if (p.gotError() != null) {
        out.push("error " + p.gotError());
        continue;
    }
    const es = new ExprState(0);
    for (let i = 0; i !== 9; i++) {
        es.values[i] = 0.37 * (i + 1) - 1.1;
        es.lastValues[i] = 0.31 * (i + 1) - 1.0;
    }
    es.t = 0.0123;
    es.lastOutput = 0.5;
    es.nodeValues = new Array(p.getNodeRefs().length).fill(1.25);
    es.lastNodeValues = new Array(p.getNodeRefs().length).fill(1.0);
    const v = e.eval(es);
    out.push(Object.is(v, -0) ? "-0" : v.toPrecision(17));
}
process.stdout.write(out.join("\n") + "\n");
