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
import * as LZString from "lz-string";

// used via the global (window.LZString) by CirSim.decompress() and ExportAsUrlDialog
(window as any).LZString = LZString;

HookRegistry.createJSInterface = (app: any) => new JSInterface(app);

const app = new CirSim();
await app.init();

// load circuit

/*
const loader = new CircuitLoader(app, sim, new ScopeManager(), app.menus);
const file = '/circuits/amp-invert.txt';
loader.loadCircuitFromUrl(file, null);
*/
