// Scans for *Elm.ts files and regenerates registerElements.ts.
// Run with: npx tsx scripts/generateRegistrations.ts
//
// Element classes the startup code already imports statically (following imports from
// main.ts), and the common ones listed in CORE, are core: they're in the main chunk, and
// registered up front as before.  The rest are lazy: each is loaded with import() the first time a circuit or the
// user needs it.  For those, registerElements.ts records what CirSim.register() would learn
// from an instance (dump types, shortcut), which this script finds by building one under
// Node.
//
// Special constructors (classes that need extra args beyond (0,0)) are listed
// in SPECIAL_CTORS below.  Everything else gets `new FooElm(0, 0)`.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { makeHeadlessApp } from "./headlessApp";
import { ElementFactory } from "../ElementFactory";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out  = join(root, "registerElements.ts");

const SKIP = new Set(["GateElm", "ChipElm", "CompositeElm", "SubcircuitChipElm", "JfetElm", "GraphicElm", "ControlledSourceElm"]);

// Classes used in so many circuits (or on the toolbar) that they're worth loading at
// startup even though the startup code doesn't import them.
const CORE = new Set([
    "ResistorElm", "RailElm", "CapacitorElm", "PolarCapacitorElm", "OutputElm",
    "LogicInputElm", "LogicOutputElm", "OpAmpElm", "DiodeElm", "InductorElm", "TextElm",
    "TransistorElm", "NTransistorElm", "PTransistorElm",
    "MosfetElm", "NMosfetElm", "PMosfetElm", "ProbeElm",
    "DCVoltageElm", "ACVoltageElm", "Switch2Elm",
    "InverterElm", "AndGateElm", "NandGateElm", "OrGateElm", "NorGateElm", "XorGateElm", "XnorGateElm",
]);

// Classes that must be registered last (after all other elements).
const REGISTER_LAST = new Set(["SubcircuitElm"]);

// Classes to add to ElementFactory but not CirSim.register.
// Used when another class's getDumpClass() causes the dump-type mapping,
// but the base class still needs to be constructable by name at load time.
// Value is the source file to import from (defaults to the class name).
const FACTORY_ONLY: Record<string, string> = {
    TransistorElm: "TransistorElm",
    MosfetElm: "MosfetElm",
    JfetElm: "JfetElm",
};

// Classes that need a non-standard constructor for CirSim.register().
// Value is the argument list as a string (after x, y).
const SPECIAL_CTORS: Record<string, string> = {
    VoltageElm: "VoltageElm.WF_DC",
};

const source = (file: string) => readFileSync(join(root, file + ".ts"), "utf8");

// modules a file imports statically (not import(), not `import type`)
function staticImports(file: string): string[] {
    const re = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?["']\.\/([\w.]+?)(?:\.js|\.ts)?["']/gm;
    return [...source(file).matchAll(re)].map(m => m[1]).filter(f => existsSync(join(root, f + ".ts")));
}

// every module the startup code imports statically.  registerElements.ts is left out,
// since its static imports are the core classes this decides.
const startup = new Set<string>();
const visit = (file: string) => {
    if (startup.has(file) || file === "registerElements")
        return;
    startup.add(file);
    staticImports(file).forEach(visit);
};
visit("main");

// a module that does something when it's loaded (fills in HookRegistry, say) has to be
// loaded at startup
const hasSideEffects = (file: string) => /^(?!export\b|import\b)[A-Za-z_][\w.]*\s*=[^=]/m.test(source(file));

const elmFiles = readdirSync(root)
    .filter(f => f.endsWith("Elm.ts") && !f.startsWith("Circuit"))
    .map(f => f.replace(/\.ts$/, ""))
    .filter(name => !SKIP.has(name) && !(name in FACTORY_ONLY))
    .sort();

const fileOf = (name: string) => FACTORY_ONLY[name] ?? name;
const isCore = (name: string) => CORE.has(name) || startup.has(fileOf(name)) || hasSideEffects(fileOf(name));

const allNames = [...Object.keys(FACTORY_ONLY), ...elmFiles].sort();
const coreNames = allNames.filter(isCore);
const lazyNames = allNames.filter(n => !isCore(n));

// what CirSim.register() needs from each lazy class, from an instance built under Node
interface Info { dumpType: number; xmlDumpType: string; dumpClass: string; shortcut: number; }
const app = makeHeadlessApp();
// composite elements build their parts by name, and look up their dump types.  (Some
// complain while their parts' dump types are still being registered; harmless, since
// they're built again below.)
const classes = new Map<string, any>();
for (const name of allNames)
    classes.set(name, (await import("../" + fileOf(name)))[name]);
for (const [name, cls] of classes)
    ElementFactory.registerClass(name, cls);
for (const name of elmFiles)
    try { app.register(name, new (classes.get(name))(0, 0)); } catch {}
const info = new Map<string, Info>();
for (const name of lazyNames.filter(n => !(n in FACTORY_ONLY))) {
    const cls = classes.get(name);
    const extra = SPECIAL_CTORS[name];
    const elm = extra ? new cls(0, 0, cls[extra.split(".")[1]]) : new cls(0, 0);
    info.set(name, {
        dumpType: elm.getDumpType(),
        xmlDumpType: elm.getXmlDumpType(),
        dumpClass: elm.getDumpClass?.()?.name ?? name,
        shortcut: elm.needsShortcut() ? elm.getShortcut() : 0,
    });
}

// the lazy classes each lazy class names in a string, which it may create by name (e.g. in
// a CompositeElm model string, or by XML tag in an XML one), so they're loaded along with
// it.  Only strings, so comments and methods like isZenerElm() don't count.  Not a word
// match, since model strings run names together ("...\\rCCVSElm...").
const xmlTag = (n: string) => info.has(n) ? new RegExp("<" + info.get(n)!.xmlDumpType.replace(/\W/g, "\\$&") + "[\\s/>]") : null;
// (comments are matched too, so quotes in them don't start a string)
const strings = (src: string) =>
    [...src.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/g)]
        .map(m => m[1] ?? "").join("\n");
const deps = (name: string) => {
    const src = strings(source(fileOf(name)));
    return lazyNames.filter(n => n !== name && (src.includes(n) || xmlTag(n)?.test(src)));
};

const importLine = (name: string) => `import { ${name} } from "./${fileOf(name)}";`;
const loader = (name: string) => `async () => (await import("./${fileOf(name)}")).${name} as any`;

const factoryLines = coreNames
    .map(name => `    ElementFactory.registerClass("${name}", ${name} as any);`)
    .join("\n");

const lazyFactoryLines = lazyNames.filter(n => n in FACTORY_ONLY)
    .map(name => `    ElementFactory.registerLazyClass({ name: "${name}", load: ${loader(name)}, deps: ${JSON.stringify(deps(name))},
        dumpType: 0, xmlDumpType: "", dumpClass: "${name}", shortcut: 0 });`)
    .join("\n");

const makeRegLine = (name: string) => {
    if (!isCore(name)) {
        const i = info.get(name)!;
        return `    CirSim.theApp.registerLazy({ name: "${name}", load: ${loader(name)}, deps: ${JSON.stringify(deps(name))},
        dumpType: ${i.dumpType}, xmlDumpType: ${JSON.stringify(i.xmlDumpType)}, dumpClass: "${i.dumpClass}", shortcut: ${i.shortcut} });`;
    }
    const extra = SPECIAL_CTORS[name];
    const args  = extra ? `0, 0, ${extra}` : "0, 0";
    return `    CirSim.theApp.register("${name}", new ${name}(${args}));`;
};

const cirSimLines     = elmFiles.filter(n => !REGISTER_LAST.has(n)).map(makeRegLine).join("\n");
const cirSimLastLines = elmFiles.filter(n =>  REGISTER_LAST.has(n)).map(makeRegLine).join("\n");

const content = `\
// AUTO-GENERATED by scripts/generateRegistrations.ts — do not edit by hand

import { ElementFactory } from "./ElementFactory";
import { CirSim } from "./CirSim";
${coreNames.map(importLine).join("\n")}

export function registerElements(): void {
${factoryLines}
${lazyFactoryLines}

${cirSimLines}
}

// registered last, after the classes the built-in models use are loaded (see
// HookRegistry.loadModelClasses) — constructor triggers model loading which requires
// other elements
export function registerLastElements(): void {
${cirSimLastLines}
}
`;

writeFileSync(out, content);
console.log(`Wrote ${coreNames.length} core and ${lazyNames.length} lazy elements to registerElements.ts`);
console.log("lazy: " + lazyNames.join(" "));
