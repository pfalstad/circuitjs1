// Types for the Emscripten-generated engine.js (scripts/build-wasm.sh). The module's own
// exports are typed by wasmEngine.ts's EngineModule.
declare const createEngine: () => Promise<unknown>;
export default createEngine;
