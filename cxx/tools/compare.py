#!/usr/bin/env python3
# Compare simulator traces from the TypeScript and C++ versions.
#
# usage: tools/compare.py [--tol RTOL] circuit.txt [steps]   (runs both simtrace tools)
#        tools/compare.py [--tol RTOL] --all [steps]        (every circuit in ../auto-tests)
#        tools/compare.py --dump --all | circuit.txt...     (compare saved XML instead)
#
# Each trace line is: t v0 v1 ... | i0 i1 ...   (node voltages, then element currents)

import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TSX = os.path.join(ROOT, "..", "ts", "node_modules", ".bin", "tsx")
BUILD = os.path.join(ROOT, "build-win" if os.name == "nt" else "build-mac")
CXX = os.path.join(BUILD, "simtrace")

# The C++ core uses V8's own math functions, so traces should be bit-identical.
# Use --tol to allow some slack (e.g. when comparing against a Node built differently).
RTOL = 0.0
ATOL = 0.0


def run(cmd):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.splitlines(), r.stderr


def close(a, b):
    if math.isnan(a) and math.isnan(b):
        return True
    if a == b:
        return True
    return abs(a - b) <= ATOL + RTOL * max(abs(a), abs(b))


def compare(circuit, steps):
    ts, ts_err = run([TSX, "tools/simtrace.ts", circuit, str(steps)])
    cx, cx_err = run([CXX, circuit, str(steps)])
    name = os.path.basename(circuit)
    if "unrecognized" in cx_err or "unsupported" in cx_err:
        return name, "skipped (unported elements)"
    if not ts:
        return name, "TS produced no output: " + ts_err.strip().splitlines()[-1] if ts_err.strip() else "TS produced no output"
    if not cx:
        return name, "C++ produced no output: " + (cx_err.strip().splitlines()[-1] if cx_err.strip() else "")
    for n, (a, b) in enumerate(zip(ts, cx)):
        if a.startswith("stop") or b.startswith("stop"):
            if a != b:
                return name, f"step {n}: TS '{a}' vs C++ '{b}'"
            continue
        va, ia = a.split("|")
        vb, ib = b.split("|")
        va, vb = [float(x) for x in va.split()], [float(x) for x in vb.split()]
        ia, ib = [float(x) for x in ia.split()], [float(x) for x in ib.split()]
        if len(va) != len(vb):
            return name, f"step {n}: {len(va)-1} nodes in TS, {len(vb)-1} in C++"
        if len(ia) != len(ib):
            return name, f"step {n}: {len(ia)} elements in TS, {len(ib)} in C++"
        for k, (x, y) in enumerate(zip(va, vb)):
            if not close(x, y):
                what = "t" if k == 0 else f"node {k-1}"
                return name, f"step {n}: {what} TS {x!r} vs C++ {y!r}"
        for k, (x, y) in enumerate(zip(ia, ib)):
            if not close(x, y):
                return name, f"step {n}: element {k} current TS {x!r} vs C++ {y!r}"
    if len(ts) != len(cx):
        return name, f"TS ran {len(ts)} steps, C++ ran {len(cx)}"
    return name, None


def compare_dump(circuit):
    """compare the saved XML from both versions; returns (name, error or None)"""
    ts, ts_err = run([TSX, "tools/simtrace.ts", "--dump", circuit])
    cx, cx_err = run([CXX, "--dump", circuit])
    name = os.path.basename(circuit)
    if "unrecognized" in cx_err or "unsupported" in cx_err:
        return name, "skipped (unported elements)"
    if not ts:
        return name, "TS produced no output"
    if ts == cx:
        return name, None
    for n, (a, b) in enumerate(zip(ts, cx)):
        if a != b:
            return name, f"line {n+1}:\n    TS:  {a.strip()}\n    C++: {b.strip()}"
    return name, f"TS wrote {len(ts)} lines, C++ wrote {len(cx)}"


def main():
    global RTOL, ATOL
    args = sys.argv[1:]
    dumpMode = False
    if args[:1] == ["--dump"]:
        dumpMode = True
        args = args[1:]
    if args[:1] == ["--tol"]:
        RTOL = float(args[1])
        ATOL = RTOL * 1e-3
        args = args[2:]
    if not args:
        print(__doc__ or "usage: compare.py circuit.txt [steps] | --all [steps]")
        return 2
    if args[0] == "--all":
        steps = int(args[1]) if len(args) > 1 else 1000
        d = os.path.join(ROOT, "..", "auto-tests")
        circuits = sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith(".txt") and f != "tests.txt")
    elif dumpMode:
        steps = 0
        circuits = args
    else:
        steps = int(args[1]) if len(args) > 1 else 1000
        circuits = [args[0]]
    failures = 0
    for c in circuits:
        name, err = compare_dump(os.path.abspath(c)) if dumpMode else compare(os.path.abspath(c), steps)
        if err and err.startswith("skipped"):
            print(f"skip {name}")
        elif err:
            failures += 1
            print(f"FAIL {name}: {err}")
        else:
            print(f"ok   {name}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
