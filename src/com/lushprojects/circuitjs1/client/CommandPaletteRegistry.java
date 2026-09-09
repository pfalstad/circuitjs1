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

package com.lushprojects.circuitjs1.client;

import com.google.gwt.safehtml.shared.SafeHtmlUtils;
import com.google.gwt.user.client.Command;
import com.lushprojects.circuitjs1.client.util.Locale;

import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Vector;

// Static catalog of searchable palette commands. Most entries mirror existing menu
// actions (menu/item strings passed to CommandManager.menuPerformed). Example circuits
// from setuplist.txt are registered separately via registerCircuit().
public class CommandPaletteRegistry {

    static class PaletteCommand {
        String id;          // stable key for history, e.g. "edit:undo" or "circuits:555.txt"
        String label;
        String category;
        String keywords;    // extra lowercase text for fuzzy matching (class names, shortcuts, etc.)
        String menu;        // first arg to CommandManager.menuPerformed, unless custom is set
        String item;        // second arg to CommandManager.menuPerformed
        Command custom;     // toggles and other actions that don't map to a menu item
        boolean contextRequired; // true => needs an element under the cursor (elm:* commands)
        String hint;        // secondary label on the right (e.g. Circuits submenu name)

        PaletteCommand(String id, String label, String category, String keywords,
                       String menu, String item, boolean contextRequired) {
            this.id = id;
            this.label = label;
            this.category = category;
            this.keywords = keywords;
            this.menu = menu;
            this.item = item;
            this.contextRequired = contextRequired;
        }

        PaletteCommand(String id, String label, String category, String keywords, Command custom) {
            this(id, label, category, keywords, null, null, false);
            this.custom = custom;
        }

        String searchText() {
            return (label + " " + category + " " + keywords).toLowerCase();
        }
    }

    static Vector<PaletteCommand> commands = new Vector<PaletteCommand>();
    // Kept separate so hundreds of example circuits don't appear until the user types
    // at least MIN_CIRCUIT_QUERY_LEN characters.
    static Vector<PaletteCommand> circuitCommands = new Vector<PaletteCommand>();
    static HashMap<String, PaletteCommand> byId = new HashMap<String, PaletteCommand>();

    static final int MIN_CIRCUIT_QUERY_LEN = 2;

    static void clear() {
        commands.clear();
        circuitCommands.clear();
        byId.clear();
    }

    static void add(PaletteCommand cmd) {
        if (byId.containsKey(cmd.id))
            return;
        commands.add(cmd);
        byId.put(cmd.id, cmd);
    }

    static void add(String id, String label, String category, String keywords,
                    String menu, String item) {
        add(new PaletteCommand(id, label, category, keywords, menu, item, false));
    }

    static void addContext(String id, String label, String category, String keywords,
                           String menu, String item) {
        add(new PaletteCommand(id, label, category, keywords, menu, item, true));
    }

    static void addToggle(String id, String label, String category, String keywords, Command custom) {
        add(new PaletteCommand(id, label, category, keywords, custom));
    }

    static PaletteCommand get(String id) {
        return byId.get(id);
    }

    // Called from UIManager.init() after menus.init() so mainMenuItems is populated.
    static void buildStatic(CirSim app) {
        clear();
        UIManager ui = app.ui;
        Menus m = app.menus;

        // Element placement modes come from the same list as the Draw menu.
        int i;
        for (i = 0; i != ui.mainMenuItems.size(); i++) {
            CheckboxMenuItem item = ui.mainMenuItems.get(i);
            String cls = ui.mainMenuItemNames.get(i);
            String name = item.getName();
            String label = Locale.LS("Mode: ") + name;
            String kw = cls + " " + name;
            String sc = item.getShortcut();
            if (sc != null && sc.length() == 1)
                kw += " " + sc;
            add("main:" + cls, label, "Mode", kw, "main", cls);
        }

        String cm = m.ctrlMetaKey;
        add("file:newblankcircuit", "New Blank Circuit", "File", "new blank", "file", "newblankcircuit");
        add("file:importfromtext", "Import From Text...", "File", "import text", "file", "importfromtext");
        add("file:importfromdropbox", "Import From Dropbox...", "File", "import dropbox", "file", "importfromdropbox");
        if (m.isElectron()) {
            add("file:save", "Save", "File", "save " + cm + "S", "file", "save");
            add("file:saveas", "Save As...", "File", "save export", "file", "saveas");
        } else {
            add("file:exportaslocalfile", "Save As...", "File", "save export " + cm + "S", "file", "exportaslocalfile");
        }
        add("file:exportasurl", "Export As Link...", "File", "export url link share", "file", "exportasurl");
        add("file:exportastext", "Export As Text...", "File", "export text", "file", "exportastext");
        add("file:exportasimage", "Save As Image...", "File", "export image png", "file", "exportasimage");
        add("file:copypng", "Copy Circuit Image to Clipboard", "File", "copy image clipboard png", "file", "copypng");
        add("file:exportassvg", "Save As SVG...", "File", "export svg vector", "file", "exportassvg");
        add("file:createsubcircuit", "Create Subcircuit...", "File", "subcircuit create", "file", "createsubcircuit");
        add("file:dcanalysis", "Find DC Operating Point", "File", "dc analysis operating point", "file", "dcanalysis");
        add("file:recover", "Recover Auto-Save", "File", "recover autosave restore", "file", "recover");
        add("file:print", "Print...", "File", "print " + cm + "P", "file", "print");
        add("view:fullscreen", "Toggle Full Screen", "View", "fullscreen", "view", "fullscreen");
        add("file:about", "About...", "File", "about help", "file", "about");

        add("edit:undo", "Undo", "Edit", "undo " + cm + "Z", "edit", "undo");
        add("edit:redo", "Redo", "Edit", "redo " + cm + "Y", "edit", "redo");
        add("edit:cut", "Cut", "Edit", "cut " + cm + "X", "edit", "cut");
        add("edit:copy", "Copy", "Edit", "copy " + cm + "C", "edit", "copy");
        add("edit:paste", "Paste", "Edit", "paste " + cm + "V", "edit", "paste");
        add("edit:duplicate", "Duplicate", "Edit", "duplicate clone " + cm + "D", "edit", "duplicate");
        add("edit:selectAll", "Select All", "Edit", "select all " + cm + "A", "edit", "selectAll");
        add("edit:search", "Find Component...", "Edit", "find component search /", "edit", "search");
        add("edit:centercircuit", Locale.weAreInUS(false) ? "Center Circuit" : "Centre Circuit", "Edit", "center centre fit", "edit", "centercircuit");
        add("zoom:zoom100", "Zoom 100%", "View", "zoom reset 0", "zoom", "zoom100");
        add("zoom:zoomin", "Zoom In", "View", "zoom in +", "zoom", "zoomin");
        add("zoom:zoomout", "Zoom Out", "View", "zoom out -", "zoom", "zoomout");
        add("edit:mirrorX", "Mirror X", "Edit", "mirror flip x", "edit", "mirrorX");
        add("edit:mirrorY", "Mirror Y", "Edit", "mirror flip y", "edit", "mirrorY");
        add("edit:rotateCCW", "Rotate CCW", "Edit", "rotate counterclockwise ccw", "edit", "rotateCCW");
        add("edit:rotateCW", "Rotate CW", "Edit", "rotate clockwise cw", "edit", "rotateCW");

        add("scopes:stackAll", "Stack All", "Scopes", "stack scopes", "scopes", "stackAll");
        add("scopes:unstackAll", "Unstack All", "Scopes", "unstack scopes", "scopes", "unstackAll");
        add("scopes:combineAll", "Combine All", "Scopes", "combine scopes merge", "scopes", "combineAll");
        add("scopes:separateAll", "Separate All", "Scopes", "separate scopes split", "scopes", "separateAll");

        add("tools:convertWires", "Convert Wires to Routed Wires", "Tools", "convert wires routed", "tools", "convertWires");
        add("tools:subcircuits", "Subcircuit Manager", "Tools", "subcircuit manager", "tools", "subcircuits");

        add("key:runstop", "Run/Stop Simulation", "Simulation", "run stop pause start simulation", "key", "runstop");
        add("key:commandpalette", "Command Palette", "View", "command palette search", "key", "commandpalette");

        final CheckboxMenuItem dots = m.dotsCheckItem;
        addToggle("options:showcurrent", "Show Current", "Options", "current dots flow",
                new Command() {
                    public void execute() {
                        dots.setState(!dots.getState());
                        app.repaint();
                    }
                });
        final CheckboxMenuItem volts = m.voltsCheckItem;
        addToggle("options:showvoltage", "Show Voltage", "Options", "voltage power bar",
                new Command() {
                    public void execute() {
                        volts.setState(!volts.getState());
                        if (volts.getState())
                            m.powerCheckItem.setState(false);
                        app.setPowerBarEnable();
                    }
                });
        final CheckboxMenuItem power = m.powerCheckItem;
        addToggle("options:showpower", "Show Power", "Options", "power bar watt",
                new Command() {
                    public void execute() {
                        power.setState(!power.getState());
                        if (power.getState())
                            volts.setState(false);
                        app.setPowerBarEnable();
                    }
                });
        final CheckboxMenuItem showValues = m.showValuesCheckItem;
        addToggle("options:showvalues", "Show Values", "Options", "values labels",
                new Command() {
                    public void execute() {
                        showValues.setState(!showValues.getState());
                        app.repaint();
                    }
                });
        final CheckboxMenuItem smallGrid = m.smallGridCheckItem;
        addToggle("options:smallgrid", "Small Grid", "Options", "grid snap",
                new Command() {
                    public void execute() {
                        smallGrid.setState(!smallGrid.getState());
                        app.setGrid();
                    }
                });
        final CheckboxMenuItem toolbar = m.toolbarCheckItem;
        addToggle("options:toolbar", "Toolbar", "Options", "toolbar show hide",
                new Command() {
                    public void execute() {
                        toolbar.setState(!toolbar.getState());
                        app.setToolbar();
                    }
                });
        final CheckboxMenuItem crossHair = m.crossHairCheckItem;
        addToggle("options:crosshair", "Show Cursor Crosshair", "Options", "crosshair cursor",
                new Command() {
                    public void execute() {
                        crossHair.setState(!crossHair.getState());
                        app.setOptionInStorage("crossHair", crossHair.getState());
                    }
                });
        final CheckboxMenuItem euroRes = m.euroResistorCheckItem;
        addToggle("options:euroresistors", "European Resistors", "Options", "european resistors iec",
                new Command() {
                    public void execute() {
                        euroRes.setState(!euroRes.getState());
                        app.repaint();
                    }
                });
        final CheckboxMenuItem showOhm = m.showOhmCheckItem;
        addToggle("options:showohm", "Show \u03a9 Unit", "Options", "ohm unit omega",
                new Command() {
                    public void execute() {
                        showOhm.setState(!showOhm.getState());
                        app.repaint();
                    }
                });
        final CheckboxMenuItem euroGates = m.euroGatesCheckItem;
        addToggle("options:eurogates", "IEC Gates", "Options", "iec gates logic",
                new Command() {
                    public void execute() {
                        euroGates.setState(!euroGates.getState());
                        app.repaint();
                    }
                });
        final CheckboxMenuItem printable = m.printableCheckItem;
        addToggle("options:whitebackground", "White Background", "Options", "white background printable",
                new Command() {
                    public void execute() {
                        printable.setState(!printable.getState());
                        app.repaint();
                    }
                });
        final CheckboxMenuItem convention = m.conventionCheckItem;
        addToggle("options:conventionalcurrent", "Conventional Current Motion", "Options", "conventional current",
                new Command() {
                    public void execute() {
                        convention.setState(!convention.getState());
                        app.repaint();
                    }
                });
        final CheckboxMenuItem noEdit = m.noEditCheckItem;
        addToggle("options:disableediting", "Disable Editing", "Options", "disable editing readonly",
                new Command() {
                    public void execute() {
                        noEdit.setState(!noEdit.getState());
                    }
                });
        final CheckboxMenuItem mouseWheelEdit = m.mouseWheelEditCheckItem;
        addToggle("options:mousewheeledit", "Edit Values With Mouse Wheel", "Options", "mouse wheel edit values",
                new Command() {
                    public void execute() {
                        mouseWheelEdit.setState(!mouseWheelEdit.getState());
                        app.setOptionInStorage("mouseWheelEdit", mouseWheelEdit.getState());
                    }
                });

        add("options:shortcuts", "Shortcuts...", "Options", "keyboard shortcuts keys", "options", "shortcuts");
        add("options:other", "Other Options...", "Options", "options settings preferences", "options", "other");
        if (m.isElectron())
            add("options:devtools", "Toggle Dev Tools", "Options", "developer tools debug", "options", "devtools");

        addContext("elm:edit", "Edit Element...", "Element", "edit properties", "elm", "edit");
        addContext("elm:viewInScope", "View in New Scope", "Element", "scope view", "elm", "viewInScope");
        addContext("elm:viewInFloatScope", "View in New Undocked Scope", "Element", "float scope undock", "elm", "viewInFloatScope");
        addContext("elm:cut", "Cut Element", "Element", "cut", "elm", "cut");
        addContext("elm:copy", "Copy Element", "Element", "copy", "elm", "copy");
        addContext("elm:delete", "Delete Element", "Element", "delete remove backspace", "elm", "delete");
        addContext("elm:duplicate", "Duplicate Element", "Element", "duplicate clone", "elm", "duplicate");
        addContext("elm:flip", "Swap Terminals", "Element", "swap flip terminals", "elm", "flip");
        addContext("elm:mirrorX", "Mirror Element X", "Element", "mirror flip x", "elm", "mirrorX");
        addContext("elm:mirrorY", "Mirror Element Y", "Element", "mirror flip y", "elm", "mirrorY");
        addContext("elm:rotateCCW", "Rotate Element CCW", "Element", "rotate ccw", "elm", "rotateCCW");
        addContext("elm:rotateCW", "Rotate Element CW", "Element", "rotate cw", "elm", "rotateCW");
        addContext("elm:split", "Split Wire Manually", "Element", "split wire", "elm", "split");
        addContext("elm:sliders", "Element Sliders...", "Element", "sliders adjust", "elm", "sliders");
    }

    // Called from Menus.processSetupList() for each circuit entry in setuplist.txt.
    static void registerCircuit(String file, String title, String submenuPath) {
        String label = Locale.LS("Circuit: ") + title;
        String id = "circuits:" + file;
        String stem = file;
        int dot = stem.lastIndexOf('.');
        if (dot > 0)
            stem = stem.substring(0, dot);
        String kw = stem + " " + title;
        if (submenuPath != null && submenuPath.length() > 0)
            kw += " " + submenuPath;
        PaletteCommand cmd = new PaletteCommand(id, label, "Circuits", kw,
                "circuits", "setup " + file + " " + title, false);
        if (submenuPath != null && submenuPath.length() > 0)
            cmd.hint = submenuPath;
        if (byId.containsKey(id))
            return;
        circuitCommands.add(cmd);
        byId.put(id, cmd);
    }

    // Substring matches rank above scattered-character (fuzzy) matches.
    static int fuzzyScore(String query, PaletteCommand cmd) {
        if (query.length() == 0)
            return 1;
        String target = cmd.searchText();
        int idx = target.indexOf(query);
        if (idx >= 0)
            return 1000 - idx + (query.length() * 10);
        int qi = 0;
        int score = 0;
        int lastMatch = -2;
        for (int ti = 0; ti < target.length() && qi < query.length(); ti++) {
            if (target.charAt(ti) == query.charAt(qi)) {
                score += (lastMatch == ti - 1) ? 10 : 1;
                lastMatch = ti;
                qi++;
            }
        }
        if (qi != query.length())
            return 0;
        return score;
    }

    static Vector<PaletteCommand> search(String query, int maxResults) {
        String q = query.toLowerCase().trim();
        Vector<ScoredCommand> scored = new Vector<ScoredCommand>();
        int i;
        for (i = 0; i != commands.size(); i++) {
            PaletteCommand cmd = commands.get(i);
            int score = fuzzyScore(q, cmd);
            if (score > 0)
                scored.add(new ScoredCommand(cmd, score));
        }
        if (q.length() >= MIN_CIRCUIT_QUERY_LEN) {
            for (i = 0; i != circuitCommands.size(); i++) {
                PaletteCommand cmd = circuitCommands.get(i);
                int score = fuzzyScore(q, cmd);
                if (score > 0)
                    scored.add(new ScoredCommand(cmd, score));
            }
        }
        Collections.sort(scored, new Comparator<ScoredCommand>() {
            public int compare(ScoredCommand a, ScoredCommand b) {
                return b.score - a.score;
            }
        });
        Vector<PaletteCommand> result = new Vector<PaletteCommand>();
        for (i = 0; i != scored.size() && i < maxResults; i++)
            result.add(scored.get(i).cmd);
        return result;
    }

    // Resolves ids from CommandPaletteHistory; skips entries removed from the registry.
    static Vector<PaletteCommand> recentCommands() {
        Vector<PaletteCommand> result = new Vector<PaletteCommand>();
        Vector<String> ids = CommandPaletteHistory.getRecentIds();
        int i;
        for (i = 0; i != ids.size(); i++) {
            PaletteCommand cmd = get(ids.get(i));
            if (cmd != null)
                result.add(cmd);
        }
        return result;
    }

    static boolean isAvailable(PaletteCommand cmd, CirSim app) {
        if (!cmd.contextRequired)
            return true;
        // Shown but styled disabled when nothing is under the cursor.
        return app.mouse.getMouseElm() != null;
    }

    // Returns HTML with matched portions wrapped in <b> (label is escaped).
    static String highlightMatch(String label, String query) {
        if (query == null || query.trim().length() == 0)
            return SafeHtmlUtils.htmlEscape(label);
        String q = query.toLowerCase().trim();
        String lower = label.toLowerCase();
        int idx = lower.indexOf(q);
        if (idx >= 0) {
            return SafeHtmlUtils.htmlEscape(label.substring(0, idx))
                    + "<b>" + SafeHtmlUtils.htmlEscape(label.substring(idx, idx + q.length())) + "</b>"
                    + SafeHtmlUtils.htmlEscape(label.substring(idx + q.length()));
        }
        StringBuilder sb = new StringBuilder();
        int qi = 0;
        for (int i = 0; i < label.length(); i++) {
            char c = label.charAt(i);
            if (qi < q.length() && Character.toLowerCase(c) == q.charAt(qi)) {
                sb.append("<b>").append(SafeHtmlUtils.htmlEscape(String.valueOf(c))).append("</b>");
                qi++;
            } else {
                sb.append(SafeHtmlUtils.htmlEscape(String.valueOf(c)));
            }
        }
        return sb.toString();
    }

    static class ScoredCommand {
        PaletteCommand cmd;
        int score;

        ScoredCommand(PaletteCommand cmd, int score) {
            this.cmd = cmd;
            this.score = score;
        }
    }
}
