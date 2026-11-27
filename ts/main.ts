/// <reference types="vite/client" />
import { CircuitElm } from "./src/CircuitElm";
import { Graphics } from "./src/Graphics";
import { Color } from "./src/Color";
import { CirSim } from "./src/CirSim";
import { SimulationManager } from "./src/SimulationManager";
import { UIManager } from "./src/UIManager";
import { ScopeManager } from "./src/ScopeManager";
import { CircuitLoader } from "./src/CircuitLoader";
import { JSInterface } from "./src/JSInterface";
import { HookRegistry } from "./src/HookRegistry";
import { Locale } from "./src/Locale";
import * as LZString from "lz-string";
import "./src/canvas2svg.js";
import { ImageExporter } from "./src/ImageExporter";
import { CommandManager } from "./src/CommandManager";
import { registerElements, registerLastElements } from "./src/registerElements";
// these only install themselves into window or HookRegistry
import "./src/Adjustable";
import "./src/AboutBox";
import "./src/SliderDialog";
import "./src/ScopePropertiesDialog";
import "./src/ShortcutsDialog";
import "./src/ModelManagerDialog";
import "./src/ExportAsUrlDialog";
import "./src/ExportAsImageDialog";
import "./src/ScopeExportImageDialog";
import "./src/ImportFromDropboxDialog";

// used via the global (window.LZString) by CirSim.decompress() and ExportAsUrlDialog
(window as any).LZString = LZString;
// canvas2svg.js sets window.C2S; used by ImageExporter for SVG export

HookRegistry.createJSInterface = (app: any) => new JSInterface(app);

// loadLocale() launches the sim after determining the language (see circuitjs1.java)
await Locale.load();

// Registered only in production builds so dev mode doesn't log a 404 for a
// service-worker.js that dist.sh generates as a deploy-time step (see
// ts/service-worker.template.js). 'service-worker.js' is deliberately a
// plain page-relative path (not ModuleBase-relative): register() resolves
// it against circuitjs.html's own location, which is where it needs to
// live for its scope to cover the whole deployed site.
//
// Not under file:// (the Electron offline app): the files are already local,
// and the worker's fetch() can't load file: URLs, so once it takes control
// every uncached request (about.html, circuits) fails.  Unregister any worker
// that an earlier build left behind.
//
// The worker precaches only the app shell, and caches everything else as
// it's used.  An installed app gets everything, so it works fully offline:
// on every launch we ask the worker to download whatever isn't cached yet.
// That's nearly free once it's done, and finishes any interrupted download.
function isInstalledApp(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true;  // iOS Safari
}

function makeAvailableOffline() {
    // Make the browser less likely to evict the cache under storage pressure.
    navigator.storage?.persist?.();
    navigator.serviceWorker.ready.then(registration =>
        registration.active?.postMessage({ type: 'cacheAll' }));
}

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'file:') {
    navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs)
            reg.unregister();
    });
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const registerServiceWorker = () => {
        navigator.serviceWorker.register('service-worker.js').then(registration => {
            console.log('Service Worker registered with scope:', registration.scope);
        }).catch(error => {
            console.error('Service Worker registration failed:', error);
        });
        if (isInstalledApp())
            makeAvailableOffline();
    };
    window.addEventListener('appinstalled', makeAvailableOffline);
    // The top-level await above can outlast the page's load event, in which
    // case a 'load' listener added now would never fire.
    if (document.readyState === 'complete')
        registerServiceWorker();
    else
        window.addEventListener('load', registerServiceWorker);
}

// regression tests (see TestManager.ts): loaded only when asked for
{
    const qp = new URLSearchParams(window.location.search);
    if (["test", "testlist", "testui"].some(k => qp.has(k))) {
        const { TestManager } = await import("./src/TestManager");
        TestManager.enabled = qp.has("testui");
    }
}

const app = new CirSim();
await app.init({ SimulationManager, UIManager, ImageExporter, CommandManager, CircuitLoader,
                 registerElements, registerLastElements });

// the UI tests (ui-tests/) reach into the app through this
if (new URLSearchParams(window.location.search).has("uitest"))
    (window as any).__app = app;

// load circuit

/*
const loader = new CircuitLoader(app, sim, new ScopeManager(), app.menus);
const file = '/circuits/amp-invert.txt';
loader.loadCircuitFromUrl(file, null);
*/
