/*
    Copyright (C) Paul Falstad and Iain Sharp

    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

import { CirSim } from "./CirSim";
import { Locale } from "./Locale";
import { CommandPaletteHistory } from "./CommandPaletteHistory";

export interface PaletteCommandInit {
    id: string;          // stable key for history, e.g. "edit:undo" or "circuits:555.txt"
    label: string;
    category: string;
    keywords: string;    // extra lowercase text for fuzzy matching (class names, shortcuts, etc.)
    menu?: string;        // first arg to CommandManager.menuPerformed, unless custom is set
    item?: string;        // second arg to CommandManager.menuPerformed
    custom?: { execute(): void }; // toggles and other actions that don't map to a menu item
    hint?: string;        // secondary label on the right (e.g. Circuits submenu name)
}

export class PaletteCommand {
    id: string;
    label: string;
    category: string;
    keywords: string;
    menu: string | null;
    item: string | null;
    custom: { execute(): void } | null;
    hint: string | null;

    constructor(init: PaletteCommandInit) {
        this.id = init.id;
        this.label = init.label;
        this.category = init.category;
        this.keywords = init.keywords;
        this.menu = init.menu ?? null;
        this.item = init.item ?? null;
        this.custom = init.custom ?? null;
        this.hint = init.hint ?? null;
    }

    searchText(): string {
        return (this.label + " " + this.category + " " + this.keywords).toLowerCase();
    }
}

class ScoredCommand {
    constructor(public cmd: PaletteCommand, public score: number) {}
}

// Static catalog of searchable palette commands. Most entries mirror existing menu
// actions (menu/item strings passed to CommandManager.menuPerformed). Example circuits
// from setuplist.txt are registered separately via registerCircuit().
export class CommandPaletteRegistry {

    static commands: PaletteCommand[] = [];
    // Kept separate so hundreds of example circuits don't appear until the user types
    // at least MIN_CIRCUIT_QUERY_LEN characters.
    static circuitCommands: PaletteCommand[] = [];
    static byId: Map<string, PaletteCommand> = new Map();

    static readonly MIN_CIRCUIT_QUERY_LEN = 2;

    static clear(): void {
        CommandPaletteRegistry.commands = [];
        CommandPaletteRegistry.circuitCommands = [];
        CommandPaletteRegistry.byId.clear();
    }

    static addCommand(cmd: PaletteCommand): void {
        if (CommandPaletteRegistry.byId.has(cmd.id))
            return;
        CommandPaletteRegistry.commands.push(cmd);
        CommandPaletteRegistry.byId.set(cmd.id, cmd);
    }

    static add(id: string, label: string, category: string, keywords: string,
               menu: string, item: string): void {
        CommandPaletteRegistry.addCommand(new PaletteCommand({ id, label, category, keywords, menu, item }));
    }

    static addToggle(id: string, label: string, category: string, keywords: string,
                      custom: { execute(): void }): void {
        CommandPaletteRegistry.addCommand(new PaletteCommand({ id, label, category, keywords, custom }));
    }

    static get(id: string): PaletteCommand | undefined {
        return CommandPaletteRegistry.byId.get(id);
    }

    // Called from UIManager.init() after menus.init() so mainMenuItems is populated.
    static buildStatic(app: CirSim): void {
        CommandPaletteRegistry.clear();
        const ui = app.ui as any;
        const m = app.menus as any;

        // Element placement modes come from the same list as the Draw menu.
        for (let i = 0; i !== ui.mainMenuItems.length; i++) {
            const item = ui.mainMenuItems[i];
            const cls = ui.mainMenuItemNames[i];
            const name = item.getLabel();
            const label = Locale.LS("Mode: ") + name;
            let kw = cls + " " + name;
            const sc = item.getShortcut();
            if (sc != null && sc.length === 1)
                kw += " " + sc;
            CommandPaletteRegistry.add("main:" + cls, label, "Mode", kw, "main", cls);
        }

        const cm = m.ctrlMetaKey;
        CommandPaletteRegistry.add("file:newblankcircuit", "New Blank Circuit", "File", "new blank", "file", "newblankcircuit");
        CommandPaletteRegistry.add("file:importfromtext", "Import From Text...", "File", "import text", "file", "importfromtext");
        CommandPaletteRegistry.add("file:importfromdropbox", "Import From Dropbox...", "File", "import dropbox", "file", "importfromdropbox");
        if (CirSim.isElectron()) {
            CommandPaletteRegistry.add("file:save", "Save", "File", "save " + cm + "S", "file", "save");
            CommandPaletteRegistry.add("file:saveas", "Save As...", "File", "save export", "file", "saveas");
        } else {
            CommandPaletteRegistry.add("file:exportaslocalfile", "Save As...", "File", "save export " + cm + "S", "file", "exportaslocalfile");
        }
        CommandPaletteRegistry.add("file:exportasurl", "Export As Link...", "File", "export url link share", "file", "exportasurl");
        CommandPaletteRegistry.add("file:exportastext", "Export As Text...", "File", "export text", "file", "exportastext");
        CommandPaletteRegistry.add("file:exportasimage", "Save As Image...", "File", "export image png", "file", "exportasimage");
        CommandPaletteRegistry.add("file:copypng", "Copy Circuit Image to Clipboard", "File", "copy image clipboard png", "file", "copypng");
        CommandPaletteRegistry.add("file:exportassvg", "Save As SVG...", "File", "export svg vector", "file", "exportassvg");
        CommandPaletteRegistry.add("file:createsubcircuit", "Create Subcircuit...", "File", "subcircuit create", "file", "createsubcircuit");
        CommandPaletteRegistry.add("file:dcanalysis", "Find DC Operating Point", "File", "dc analysis operating point", "file", "dcanalysis");
        CommandPaletteRegistry.add("file:recover", "Recover Auto-Save", "File", "recover autosave restore", "file", "recover");
        CommandPaletteRegistry.add("file:print", "Print...", "File", "print " + cm + "P", "file", "print");
        CommandPaletteRegistry.add("view:fullscreen", "Toggle Full Screen", "View", "fullscreen", "view", "fullscreen");
        CommandPaletteRegistry.add("file:about", "About...", "File", "about help", "file", "about");

        CommandPaletteRegistry.add("edit:undo", "Undo", "Edit", "undo " + cm + "Z", "edit", "undo");
        CommandPaletteRegistry.add("edit:redo", "Redo", "Edit", "redo " + cm + "Y", "edit", "redo");
        CommandPaletteRegistry.add("edit:cut", "Cut", "Edit", "cut " + cm + "X", "edit", "cut");
        CommandPaletteRegistry.add("edit:copy", "Copy", "Edit", "copy " + cm + "C", "edit", "copy");
        CommandPaletteRegistry.add("edit:paste", "Paste", "Edit", "paste " + cm + "V", "edit", "paste");
        CommandPaletteRegistry.add("edit:duplicate", "Duplicate", "Edit", "duplicate clone " + cm + "D", "edit", "duplicate");
        CommandPaletteRegistry.add("edit:selectAll", "Select All", "Edit", "select all " + cm + "A", "edit", "selectAll");
        CommandPaletteRegistry.add("edit:search", "Find Component/Command...", "Edit", "find component search command palette /", "edit", "search");
        CommandPaletteRegistry.add("edit:centercircuit", Locale.weAreInUS(false) ? "Center Circuit" : "Centre Circuit", "Edit", "center centre fit", "edit", "centercircuit");
        CommandPaletteRegistry.add("zoom:zoom100", "Zoom 100%", "View", "zoom reset 0", "zoom", "zoom100");
        CommandPaletteRegistry.add("zoom:zoomin", "Zoom In", "View", "zoom in +", "zoom", "zoomin");
        CommandPaletteRegistry.add("zoom:zoomout", "Zoom Out", "View", "zoom out -", "zoom", "zoomout");
        CommandPaletteRegistry.add("edit:mirrorX", "Mirror X", "Edit", "mirror flip x", "edit", "mirrorX");
        CommandPaletteRegistry.add("edit:mirrorY", "Mirror Y", "Edit", "mirror flip y", "edit", "mirrorY");
        CommandPaletteRegistry.add("edit:rotateCCW", "Rotate CCW", "Edit", "rotate counterclockwise ccw", "edit", "rotateCCW");
        CommandPaletteRegistry.add("edit:rotateCW", "Rotate CW", "Edit", "rotate clockwise cw", "edit", "rotateCW");

        CommandPaletteRegistry.add("scopes:stackAll", "Stack All", "Scopes", "stack scopes", "scopes", "stackAll");
        CommandPaletteRegistry.add("scopes:unstackAll", "Unstack All", "Scopes", "unstack scopes", "scopes", "unstackAll");
        CommandPaletteRegistry.add("scopes:combineAll", "Combine All", "Scopes", "combine scopes merge", "scopes", "combineAll");
        CommandPaletteRegistry.add("scopes:separateAll", "Separate All", "Scopes", "separate scopes split", "scopes", "separateAll");

        CommandPaletteRegistry.add("tools:convertWires", "Convert Wires to Routed Wires", "Tools", "convert wires routed", "tools", "convertWires");
        CommandPaletteRegistry.add("tools:subcircuits", "Subcircuit Manager", "Tools", "subcircuit manager", "tools", "subcircuits");

        CommandPaletteRegistry.add("key:runstop", "Run/Stop Simulation", "Simulation", "run stop pause start simulation", "key", "runstop");

        const dots = m.dotsCheckItem;
        CommandPaletteRegistry.addToggle("options:showcurrent", "Show Current", "Options", "current dots flow", {
            execute: () => { dots.toggle(); app.repaint(); }
        });
        const volts = m.voltsCheckItem;
        const power = m.powerCheckItem;
        CommandPaletteRegistry.addToggle("options:showvoltage", "Show Voltage", "Options", "voltage power bar", {
            execute: () => {
                volts.setState(!volts.getState());
                if (volts.getState())
                    power.setState(false);
                app.setPowerBarEnable();
            }
        });
        CommandPaletteRegistry.addToggle("options:showpower", "Show Power", "Options", "power bar watt", {
            execute: () => {
                power.setState(!power.getState());
                if (power.getState())
                    volts.setState(false);
                app.setPowerBarEnable();
            }
        });
        const showValues = m.showValuesCheckItem;
        CommandPaletteRegistry.addToggle("options:showvalues", "Show Values", "Options", "values labels", {
            execute: () => { showValues.toggle(); app.repaint(); }
        });
        const smallGrid = m.smallGridCheckItem;
        CommandPaletteRegistry.addToggle("options:smallgrid", "Small Grid", "Options", "grid snap", {
            execute: () => { smallGrid.toggle(); app.setGrid(); }
        });
        const toolbar = m.toolbarCheckItem;
        CommandPaletteRegistry.addToggle("options:toolbar", "Toolbar", "Options", "toolbar show hide", {
            execute: () => { toolbar.toggle(); app.setToolbar(); }
        });
        const crossHair = m.crossHairCheckItem;
        CommandPaletteRegistry.addToggle("options:crosshair", "Show Cursor Crosshair", "Options", "crosshair cursor", {
            execute: () => { crossHair.toggle(); app.setOptionInStorage("crossHair", crossHair.getState()); }
        });
        const euroRes = m.euroResistorCheckItem;
        CommandPaletteRegistry.addToggle("options:euroresistors", "European Resistors", "Options", "european resistors iec", {
            execute: () => { euroRes.toggle(); app.repaint(); }
        });
        const showOhm = m.showOhmCheckItem;
        CommandPaletteRegistry.addToggle("options:showohm", "Show Ω Unit", "Options", "ohm unit omega", {
            execute: () => { showOhm.toggle(); app.repaint(); }
        });
        const euroGates = m.euroGatesCheckItem;
        CommandPaletteRegistry.addToggle("options:eurogates", "IEC Gates", "Options", "iec gates logic", {
            execute: () => { euroGates.toggle(); app.repaint(); }
        });
        const printable = m.printableCheckItem;
        CommandPaletteRegistry.addToggle("options:whitebackground", "White Background", "Options", "white background printable", {
            execute: () => { printable.toggle(); app.repaint(); }
        });
        const convention = m.conventionCheckItem;
        CommandPaletteRegistry.addToggle("options:conventionalcurrent", "Conventional Current Motion", "Options", "conventional current", {
            execute: () => { convention.toggle(); app.repaint(); }
        });
        const noEdit = m.noEditCheckItem;
        CommandPaletteRegistry.addToggle("options:disableediting", "Disable Editing", "Options", "disable editing readonly", {
            execute: () => { noEdit.toggle(); }
        });
        const mouseWheelEdit = m.mouseWheelEditCheckItem;
        CommandPaletteRegistry.addToggle("options:mousewheeledit", "Edit Values With Mouse Wheel", "Options", "mouse wheel edit values", {
            execute: () => {
                mouseWheelEdit.setState(!mouseWheelEdit.getState());
                app.setOptionInStorage("mouseWheelEdit", mouseWheelEdit.getState());
            }
        });

        CommandPaletteRegistry.add("options:shortcuts", "Shortcuts...", "Options", "keyboard shortcuts keys", "options", "shortcuts");
        CommandPaletteRegistry.add("options:other", "Other Options...", "Options", "options settings preferences", "options", "other");
        if (CirSim.isElectron())
            CommandPaletteRegistry.add("options:devtools", "Toggle Dev Tools", "Options", "developer tools debug", "options", "devtools");
    }

    // Called from Menus.processSetupList() for each circuit entry in setuplist.txt.
    static registerCircuit(file: string, title: string, submenuPath: string | null): void {
        const label = Locale.LS("Circuit: ") + title;
        const id = "circuits:" + file;
        if (CommandPaletteRegistry.byId.has(id))
            return;
        let stem = file;
        const dot = stem.lastIndexOf('.');
        if (dot > 0)
            stem = stem.substring(0, dot);
        let kw = stem + " " + title;
        if (submenuPath != null && submenuPath.length > 0)
            kw += " " + submenuPath;
        const cmd = new PaletteCommand({
            id, label, category: "Circuits", keywords: kw,
            menu: "circuits", item: "setup " + file + " " + title,
            hint: (submenuPath != null && submenuPath.length > 0) ? submenuPath : undefined,
        });
        CommandPaletteRegistry.circuitCommands.push(cmd);
        CommandPaletteRegistry.byId.set(id, cmd);
    }

    // Substring matches rank above scattered-character (fuzzy) matches.
    static fuzzyScore(query: string, cmd: PaletteCommand): number {
        if (query.length === 0)
            return 1;
        const target = cmd.searchText();
        const idx = target.indexOf(query);
        if (idx >= 0)
            return 1000 - idx + (query.length * 10);
        let qi = 0;
        let score = 0;
        let lastMatch = -2;
        for (let ti = 0; ti < target.length && qi < query.length; ti++) {
            if (target.charAt(ti) === query.charAt(qi)) {
                score += (lastMatch === ti - 1) ? 10 : 1;
                lastMatch = ti;
                qi++;
            }
        }
        if (qi !== query.length)
            return 0;
        return score;
    }

    static search(query: string, maxResults: number): PaletteCommand[] {
        const q = query.toLowerCase().trim();
        const scored: ScoredCommand[] = [];
        for (const cmd of CommandPaletteRegistry.commands) {
            const score = CommandPaletteRegistry.fuzzyScore(q, cmd);
            if (score > 0)
                scored.push(new ScoredCommand(cmd, score));
        }
        if (q.length >= CommandPaletteRegistry.MIN_CIRCUIT_QUERY_LEN) {
            for (const cmd of CommandPaletteRegistry.circuitCommands) {
                const score = CommandPaletteRegistry.fuzzyScore(q, cmd);
                if (score > 0)
                    scored.push(new ScoredCommand(cmd, score));
            }
        }
        scored.sort((a, b) => {
            const aMode = a.cmd.category === "Mode";
            const bMode = b.cmd.category === "Mode";
            if (aMode !== bMode)
                return aMode ? -1 : 1;
            return b.score - a.score;
        });
        return scored.slice(0, maxResults).map(s => s.cmd);
    }

    // Resolves ids from CommandPaletteHistory; skips entries removed from the registry.
    static recentCommands(): PaletteCommand[] {
        const ids: string[] = CommandPaletteHistory.getRecentIds();
        const result: PaletteCommand[] = [];
        for (const id of ids) {
            const cmd = CommandPaletteRegistry.get(id);
            if (cmd != null)
                result.push(cmd);
        }
        return result;
    }

    // Returns HTML with matched portions wrapped in <b> (label is escaped).
    static highlightMatch(label: string, query: string): string {
        if (query == null || query.trim().length === 0)
            return CommandPaletteRegistry.escapeHtml(label);
        const q = query.toLowerCase().trim();
        const lower = label.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx >= 0) {
            return CommandPaletteRegistry.escapeHtml(label.substring(0, idx))
                + "<b>" + CommandPaletteRegistry.escapeHtml(label.substring(idx, idx + q.length)) + "</b>"
                + CommandPaletteRegistry.escapeHtml(label.substring(idx + q.length));
        }
        let sb = "";
        let qi = 0;
        for (let i = 0; i < label.length; i++) {
            const c = label.charAt(i);
            if (qi < q.length && c.toLowerCase() === q.charAt(qi)) {
                sb += "<b>" + CommandPaletteRegistry.escapeHtml(c) + "</b>";
                qi++;
            } else {
                sb += CommandPaletteRegistry.escapeHtml(c);
            }
        }
        return sb;
    }

    private static escapeHtml(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
}
