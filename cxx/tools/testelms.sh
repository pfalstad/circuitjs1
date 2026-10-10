#!/bin/bash
# Compare elements against the TS version using generated test circuits (one element,
# square-wave rails on its inputs), in both file formats.
# usage: tools/testelms.sh ClassName[:flags][,attr=value...]...
#   e.g. DFlipFlopElm:6 sets flags to 6; SevenSegElm,di=1,ex=1 sets XML attributes
cd "$(dirname "$0")/.."
steps=3000
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
for arg in "$@"; do
    spec=${arg%%,*}
    extra=""
    [[ $arg == *,* ]] && extra=$(echo "${arg#*,}" | tr ',' ' ')
    cls=${spec%%:*}
    fl="$extra"
    [[ $spec == *:* ]] && fl="f=${spec#*:} $extra"
    for fmt in xml text; do
        f="$tmp/$cls-$fmt.txt"
        if ! build/simtrace --testcircuit "$cls" $fmt $fl > "$f"; then fail=1; continue; fi
        out=$(tools/compare.py "$f" $steps 2>&1 | tail -4)
        case "$out" in
            ok*) echo "ok   $arg ($fmt)";;
            *) echo "FAIL $arg ($fmt): $out"; fail=1;;
        esac
    done
done
exit $fail
