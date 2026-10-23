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

#include "CommandPaletteRegistry.h"

#include <QAction>
#include <QMenu>
#include <QMenuBar>
#include <algorithm>

#include "CirSim.h"
#include "CommandPaletteHistory.h"
#include "core/Locale.h"

std::vector<PaletteCommand *> CommandPaletteRegistry::commands;
std::vector<PaletteCommand *> CommandPaletteRegistry::circuitCommands;
std::map<QString, std::unique_ptr<PaletteCommand>> CommandPaletteRegistry::byId;

static QString LSq(const char *s) { return QString::fromStdString(Locale::LS(s)); }

void CommandPaletteRegistry::clear() {
    commands.clear();
    circuitCommands.clear();
    byId.clear();
}

void CommandPaletteRegistry::addCommand(std::unique_ptr<PaletteCommand> cmd) {
    if (byId.count(cmd->id))
        return;
    commands.push_back(cmd.get());
    byId[cmd->id] = std::move(cmd);
}

PaletteCommand *CommandPaletteRegistry::get(const QString &id) {
    auto it = byId.find(id);
    return it == byId.end() ? nullptr : it->second.get();
}

// the first menu bar item (in menu order) with this text
static QAction *findMenuAction(const QList<QAction *> &actions, const QString &text) {
    for (QAction *a : actions) {
        if (a->menu() != nullptr) {
            if (QAction *found = findMenuAction(a->menu()->actions(), text))
                return found;
        } else if (!a->isSeparator() && QString(a->text()).remove('&') == text) {
            return a;
        }
    }
    return nullptr;
}

// the item's key shortcuts, so they can be searched for (TS adds "Cmd-Z" etc. by hand)
static QString shortcutKeywords(QAction *a) {
    QString kw;
    for (const QKeySequence &k : a->shortcuts()) {
        QString s = k.toString(QKeySequence::PortableText);
#ifdef Q_OS_MACOS
        s.replace("Ctrl+", "Cmd-");
#endif
        kw += " " + s;
    }
    return kw;
}

void CommandPaletteRegistry::add(CirSim *app, const QString &id, const char *name, const QString &category,
                                 const QString &keywords) {
    QAction *a = findMenuAction(app->menuBar()->actions(), LSq(name));
    if (a == nullptr)
        return;
    auto cmd = std::make_unique<PaletteCommand>();
    cmd->id = id;
    cmd->label = QString(a->text()).remove('&');
    cmd->category = category;
    cmd->keywords = keywords + shortcutKeywords(a);
    cmd->action = a;
    addCommand(std::move(cmd));
}

void CommandPaletteRegistry::buildStatic(CirSim *app) {
    // keep the circuits, which createCircuitsMenu() registered already
    std::vector<PaletteCommand *> circuits = circuitCommands;
    std::map<QString, std::unique_ptr<PaletteCommand>> circuitIds;
    for (PaletteCommand *c : circuits)
        circuitIds[c->id] = std::move(byId[c->id]);
    clear();
    circuitCommands = circuits;
    byId = std::move(circuitIds);

    // Element placement modes come from the same list as the Draw menu.
    for (QAction *item : app->mainMenuItems) {
        if (!item->isEnabled())
            continue;
        QString cls = item->data().toString();
        QString name = app->classToLabelMap.value(cls);
        auto cmd = std::make_unique<PaletteCommand>();
        cmd->id = "main:" + cls;
        cmd->label = LSq("Mode: ") + name;
        cmd->category = "Mode";
        cmd->keywords = cls + " " + name;
        QString sc = item->shortcut().toString(QKeySequence::PortableText);
        if (sc.size() == 1)
            cmd->keywords += " " + sc.toLower();
        cmd->action = item;
        addCommand(std::move(cmd));
    }

    add(app, "file:newwindow", "New Window...", "File", "new window");
    add(app, "file:newblankcircuit", "New Blank Circuit", "File", "new blank");
    add(app, "file:open", "Open File...", "File", "open file load");
    add(app, "file:importfromtext", "Import From Text...", "File", "import text");
    add(app, "file:save", "Save", "File", "save");
    add(app, "file:saveas", "Save As...", "File", "save export");
    add(app, "file:exportasurl", "Export As Link...", "File", "export url link share");
    add(app, "file:exportastext", "Export As Text...", "File", "export text");
    add(app, "file:exportasimage", "Export As Image...", "File", "export image png");
    add(app, "file:copypng", "Copy Circuit Image to Clipboard", "File", "copy image clipboard png");
    add(app, "file:exportassvg", "Export As SVG...", "File", "export svg vector");
    add(app, "file:createsubcircuit", "Create Subcircuit...", "File", "subcircuit create");
    add(app, "file:dcanalysis", "Find DC Operating Point", "File", "dc analysis operating point");
    add(app, "file:recover", "Recover Auto-Save", "File", "recover autosave restore");
    add(app, "file:print", "Print...", "File", "print");
    add(app, "view:fullscreen", "Toggle Full Screen", "View", "fullscreen");
    add(app, "file:about", "About...", "File", "about help");

    add(app, "edit:undo", "Undo", "Edit", "undo");
    add(app, "edit:redo", "Redo", "Edit", "redo");
    add(app, "edit:cut", "Cut", "Edit", "cut");
    add(app, "edit:copy", "Copy", "Edit", "copy");
    add(app, "edit:paste", "Paste", "Edit", "paste");
    add(app, "edit:duplicate", "Duplicate", "Edit", "duplicate clone");
    add(app, "edit:selectAll", "Select All", "Edit", "select all");
    add(app, "edit:search", "Find Component/Command...", "Edit", "find component search command palette /");
    add(app, "edit:centercircuit", "Center Circuit", "Edit", "center centre fit");
    add(app, "edit:centercircuit", "Centre Circuit", "Edit", "center centre fit");
    add(app, "zoom:zoom100", "Zoom 100%", "View", "zoom reset");
    add(app, "zoom:zoomin", "Zoom In", "View", "zoom in");
    add(app, "zoom:zoomout", "Zoom Out", "View", "zoom out");
    add(app, "edit:mirrorX", "Mirror X", "Edit", "mirror flip x");
    add(app, "edit:mirrorY", "Mirror Y", "Edit", "mirror flip y");
    add(app, "edit:rotateCCW", "Rotate CCW", "Edit", "rotate counterclockwise ccw");
    add(app, "edit:rotateCW", "Rotate CW", "Edit", "rotate clockwise cw");

    add(app, "scopes:stackAll", "Stack All", "Scopes", "stack scopes");
    add(app, "scopes:unstackAll", "Unstack All", "Scopes", "unstack scopes");
    add(app, "scopes:combineAll", "Combine All", "Scopes", "combine scopes merge");
    add(app, "scopes:separateAll", "Separate All", "Scopes", "separate scopes split");

    add(app, "tools:convertWires", "Convert Wires to Routed Wires", "Tools", "convert wires routed");
    add(app, "tools:subcircuits", "Subcircuit Manager", "Tools", "subcircuit manager");
    add(app, "tools:console", "Console", "Tools", "console log debug messages");

    // the TS version has one Run/Stop command; here the Simulation menu's Run is a check item
    auto runStop = std::make_unique<PaletteCommand>();
    runStop->id = "key:runstop";
    runStop->label = LSq("Run/Stop Simulation");
    runStop->category = "Simulation";
    runStop->keywords = "run stop pause start simulation" + shortcutKeywords(app->runStopAction);
    runStop->action = app->runStopAction;
    addCommand(std::move(runStop));
    add(app, "sim:reset", "Reset", "Simulation", "reset restart simulation");

    add(app, "options:showcurrent", "Show Current", "Options", "current dots flow");
    add(app, "options:showvoltage", "Show Voltage", "Options", "voltage power bar");
    add(app, "options:showpower", "Show Power", "Options", "power bar watt");
    add(app, "options:showvalues", "Show Values", "Options", "values labels");
    add(app, "options:smallgrid", "Small Grid", "Options", "grid snap");
    add(app, "options:toolbar", "Toolbar", "Options", "toolbar show hide");
    add(app, "options:showpropsoncreate", "Show Properties On Create", "Options", "properties create edit");
    add(app, "options:crosshair", "Show Cursor Cross Hairs", "Options", "crosshair cursor");
    add(app, "options:euroresistors", "European Resistors", "Options", "european resistors iec");
    add(app, "options:showohm", "Show Ω Unit", "Options", "ohm unit omega");
    add(app, "options:eurogates", "IEC Gates", "Options", "iec gates logic");
    add(app, "options:whitebackground", "White Background", "Options", "white background printable");
    add(app, "options:conventionalcurrent", "Conventional Current Motion", "Options", "conventional current");
    add(app, "options:disableediting", "Disable Editing", "Options", "disable editing readonly");
    add(app, "options:mousewheeledit", "Edit Values With Mouse Wheel", "Options", "mouse wheel edit values");

    add(app, "options:shortcuts", "Shortcuts...", "Options", "keyboard shortcuts keys");
    add(app, "options:other", "Other Options...", "Options", "options settings preferences");
}

void CommandPaletteRegistry::registerCircuit(const QString &file, const QString &title,
                                             const QString &submenuPath, QAction *action) {
    QString id = "circuits:" + file;
    if (byId.count(id))
        return;
    QString stem = file;
    int dot = stem.lastIndexOf('.');
    if (dot > 0)
        stem = stem.left(dot);
    QString kw = stem + " " + title;
    if (!submenuPath.isEmpty())
        kw += " " + submenuPath;
    auto cmd = std::make_unique<PaletteCommand>();
    cmd->id = id;
    cmd->label = LSq("Circuit: ") + title;
    cmd->category = "Circuits";
    cmd->keywords = kw;
    cmd->action = action;
    cmd->hint = submenuPath;
    circuitCommands.push_back(cmd.get());
    byId[id] = std::move(cmd);
}

// Substring matches rank above scattered-character (fuzzy) matches.
int CommandPaletteRegistry::fuzzyScore(const QString &query, const PaletteCommand *cmd) {
    if (query.isEmpty())
        return 1;
    QString target = cmd->searchText();
    int idx = target.indexOf(query);
    if (idx >= 0)
        return 1000 - idx + (query.size() * 10);
    int qi = 0;
    int score = 0;
    int lastMatch = -2;
    for (int ti = 0; ti < target.size() && qi < query.size(); ti++) {
        if (target[ti] == query[qi]) {
            score += (lastMatch == ti - 1) ? 10 : 1;
            lastMatch = ti;
            qi++;
        }
    }
    if (qi != query.size())
        return 0;
    return score;
}

std::vector<PaletteCommand *> CommandPaletteRegistry::search(const QString &query, int maxResults) {
    QString q = query.toLower().trimmed();
    std::vector<std::pair<PaletteCommand *, int>> scored;
    for (PaletteCommand *cmd : commands) {
        int score = fuzzyScore(q, cmd);
        if (score > 0)
            scored.push_back({cmd, score});
    }
    if (q.size() >= MIN_CIRCUIT_QUERY_LEN) {
        for (PaletteCommand *cmd : circuitCommands) {
            int score = fuzzyScore(q, cmd);
            if (score > 0)
                scored.push_back({cmd, score});
        }
    }
    // stable, like JS's sort
    std::stable_sort(scored.begin(), scored.end(), [](const auto &a, const auto &b) {
        bool aMode = a.first->category == "Mode";
        bool bMode = b.first->category == "Mode";
        if (aMode != bMode)
            return aMode;
        return b.second < a.second;
    });
    std::vector<PaletteCommand *> result;
    for (size_t i = 0; i < scored.size() && (int) i < maxResults; i++)
        result.push_back(scored[i].first);
    return result;
}

// Resolves ids from CommandPaletteHistory; skips entries removed from the registry.
std::vector<PaletteCommand *> CommandPaletteRegistry::recentCommands() {
    std::vector<PaletteCommand *> result;
    for (const QString &id : CommandPaletteHistory::getRecentIds())
        if (PaletteCommand *cmd = get(id))
            result.push_back(cmd);
    return result;
}

QString CommandPaletteRegistry::highlightMatch(const QString &label, const QString &query) {
    if (query.trimmed().isEmpty())
        return label.toHtmlEscaped();
    QString q = query.toLower().trimmed();
    QString lower = label.toLower();
    int idx = lower.indexOf(q);
    if (idx >= 0) {
        return label.left(idx).toHtmlEscaped()
            + "<b>" + label.mid(idx, q.size()).toHtmlEscaped() + "</b>"
            + label.mid(idx + q.size()).toHtmlEscaped();
    }
    QString sb;
    int qi = 0;
    for (int i = 0; i < label.size(); i++) {
        QString c = label.mid(i, 1);
        if (qi < q.size() && c.toLower() == q.mid(qi, 1)) {
            sb += "<b>" + c.toHtmlEscaped() + "</b>";
            qi++;
        } else {
            sb += c.toHtmlEscaped();
        }
    }
    return sb;
}
