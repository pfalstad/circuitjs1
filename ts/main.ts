/// <reference types="vite/client" />
import { CircuitElm } from "./CircuitElm";
import { Graphics } from "./Graphics";
import { Color } from "./Color";
import { CirSim } from "./CirSim";
import { SimulationManager } from "./SimulationManager";
import { UIManager } from "./UIManager";
import { ScopeManager } from "./ScopeManager";
import { CircuitLoader } from "./CircuitLoader";
import { JSInterface } from "./JSInterface";
import { HookRegistry } from "./HookRegistry";
import { Locale } from "./Locale";
import * as LZString from "lz-string";
import "./canvas2svg.js";
import { ImageExporter } from "./ImageExporter";
import { CommandManager } from "./CommandManager";
import { registerElements, registerLastElements } from "./registerElements";
// these only install themselves into window or HookRegistry
import "./Adjustable";
import "./AboutBox";
import "./SliderDialog";
import "./ScopePropertiesDialog";
import "./ShortcutsDialog";
import "./ModelManagerDialog";
import "./ExportAsUrlDialog";
import "./ExportAsImageDialog";
import "./ScopeExportImageDialog";
import "./ImportFromDropboxDialog";

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

const app = new CirSim();
await app.init({ SimulationManager, UIManager, ImageExporter, CommandManager, CircuitLoader,
                 registerElements, registerLastElements });

// load circuit

/*
const loader = new CircuitLoader(app, sim, new ScopeManager(), app.menus);
const file = '/circuits/amp-invert.txt';
loader.loadCircuitFromUrl(file, null);
*/
