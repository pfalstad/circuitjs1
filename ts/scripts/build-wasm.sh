#!/bin/sh
# Builds digital/wasm/engine.cpp into digital/wasm/engine.js (a single ES module with the
# WebAssembly embedded). Needs Emscripten (em++ on PATH). The output is committed, so a normal
# `npm run build` does not need Emscripten - only a change to engine.cpp does.
set -e
cd "$(dirname "$0")/../digital/wasm"
em++ engine.cpp -o engine.js \
    -O3 -std=c++17 -fno-exceptions -fno-rtti \
    -sMODULARIZE -sEXPORT_ES6 -sSINGLE_FILE -sENVIRONMENT=web,node \
    -sALLOW_MEMORY_GROWTH -sSTACK_SIZE=16MB \
    -sEXPORTED_FUNCTIONS=_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=HEAPF64,HEAP32,HEAPU32 \
    "$@"
echo "built $(pwd)/engine.js ($(wc -c < engine.js) bytes)"
