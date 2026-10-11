#!/usr/bin/env python3
# Compare expression evaluation between the C++ and TS versions.
# usage: tools/exprcompare.py exprs.txt   (one expression per line)
import math, os, struct, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
text = open(sys.argv[1]).read()
exprs = [l for l in text.split("\n") if l != ""]
inp = "\n".join(exprs) + "\n"
cx = subprocess.run([os.path.join(ROOT, "build-win" if os.name == "nt" else "build-mac", "exprtest")], input=inp, capture_output=True, text=True).stdout.split("\n")
ts = subprocess.run(["npx", "--prefix", "tools", "tsx", "tools/exprtest.ts"], cwd=ROOT, input=inp,
                    capture_output=True, text=True).stdout.split("\n")
bad = 0
for e, x, y in zip(exprs, cx, ts):
    if x.startswith("error") or y.startswith("error"):
        ok = x == y
    else:
        fx, fy = float(x), float(y)
        ok = (math.isnan(fx) and math.isnan(fy)) or struct.pack("d", fx) == struct.pack("d", fy)
    if not ok:
        bad += 1
        print("DIFF", repr(e), "| C++:", x, "| TS:", y)
print(len(exprs), "expressions,", bad, "differences")
sys.exit(1 if bad else 0)
