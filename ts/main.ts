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
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').then(registration => {
            console.log('Service Worker registered with scope:', registration.scope);
        }).catch(error => {
            console.error('Service Worker registration failed:', error);
        });
    });
}

const app = new CirSim();
await app.init();

// load circuit

/*
const loader = new CircuitLoader(app, sim, new ScopeManager(), app.menus);
const file = '/circuits/amp-invert.txt';
loader.loadCircuitFromUrl(file, null);
*/
