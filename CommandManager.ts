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
import { CircuitLoader } from "./CircuitLoader";
import { MouseManager } from "./MouseManager";
import { CustomLogicModel } from "./CustomLogicModel";
import { DiodeModel } from "./DiodeModel";
import { MosfetModel } from "./MosfetModel";
import { Rectangle } from "./Rectangle";
import { Locale } from "./Locale";
import { EditDialog } from "./EditDialog";
import { EditOptions } from "./EditOptions";
import { ExportAsTextDialog } from "./ExportAsTextDialog";
import { ExportAsLocalFileDialog } from "./ExportAsLocalFileDialog";
import { SearchDialog } from "./SearchDialog";
import { ImportFromTextDialog } from "./ImportFromTextDialog";
import { EditCompositeModelDialog } from "./EditCompositeModelDialog";
import "./GetCircuitAsComposite";
import { Scope } from "./Scope";
import { ScopeElm } from "./ScopeElm";

export class CommandManager {

    app: CirSim;
    clipboard: string = "";

    constructor(app: CirSim) {
        this.app = app;
    }

    menuPerformed(menu: string, item: string): void {
        const contextPanel = this.app.ui?.contextPanel;

        if ((menu == "edit" || menu == "main" || menu == "scopes") && this.app.ui?.isReadOnly()) {
            window.alert(Locale.LS("Editing disabled.  Re-enable from the Options menu."));
            return;
        }
        if (item == "about")
            CirSim.aboutBox = new (window as any).AboutBox(CirSim.versionString);
        if (item == "importfromlocalfile") {
            this.app.undoManager?.pushUndo();
            if (CirSim.isElectron())
                CommandManager.electronOpenFile();
            else
                this.app.ui?.loadFileInput?.element.click();
        }
        if (item == "newwindow")
            CommandManager.newElectronWindow();
        if (item == "save")
            CommandManager.electronSave(this.app.dumpCircuit());
        if (item == "saveas")
            CommandManager.electronSaveAs(this.app.dumpCircuit());
        if (item == "importfromtext")
            new ImportFromTextDialog(this.app);
        if (item == "importfromdropbox")
            CirSim.dialogShowing = new (window as any).ImportFromDropboxDialog(this.app);
        if (item == "exportasurl") {
            this.doExportAsUrl();
            this.app.unsavedChanges = false;
        }
        if (item == "exportaslocalfile") {
            this.doExportAsLocalFile();
            this.app.unsavedChanges = false;
        }
        if (item == "exportastext") {
            this.doExportAsText();
            this.app.unsavedChanges = false;
        }
        if (item == "exportasimage")
            this.app.imageExporter?.doExportAsImage();
        if (item == "copypng") {
            this.app.imageExporter?.doImageToClipboard();
            if (this.app.ui?.contextPanel != null)
                this.app.ui.contextPanel.remove(); this.app.ui.contextPanel = null;
        }
        if (item == "exportassvg")
            this.app.imageExporter?.doExportAsSVG();
        if (item == "createsubcircuit")
            this.doCreateSubcircuit();
        if (item == "dcanalysis")
            this.doDCAnalysis();
        if (item == "print")
            this.app.imageExporter?.doPrint();
        if (item == "recover")
            this.app.undoManager?.doRecover();

        if ((menu == "elm" || menu == "scopepop") && contextPanel != null)
            contextPanel.remove(); this.app.ui.contextPanel = null;
        if (menu == "options" && item == "shortcuts") {
            CirSim.dialogShowing = new (window as any).ShortcutsDialog(this.app);
            CirSim.dialogShowing.show();
        }
        if (item == "subcircuits") {
            CirSim.dialogShowing = new (window as any).SubcircuitDialog(this.app);
            CirSim.dialogShowing.show();
        }
        if (item == "search") {
            new SearchDialog(this.app).show();
        }
        if (menu == "options" && item == "other")
            this.doEdit(new EditOptions(this.app, this.app.sim));
        if (item == "devtools")
            CommandManager.toggleDevTools();
        if (item == "undo")
            this.app.undoManager?.doUndo();
        if (item == "redo")
            this.app.undoManager?.doRedo();
        if (item == "runstop")
            this.app.setSimRunning(!this.app.simIsRunning());

        // if the mouse is hovering over an element, and a shortcut key is pressed, operate on that element (treat it like a context menu item selection)
        if (menu == "key" && this.app.mouse.getMouseElm() != null) {
            this.app.mouse.menuElm = this.app.mouse.getMouseElm();
            menu = "elm";
        }
        if (menu != "elm")
            this.app.mouse.menuElm = null;

        if (item == "cut")
            this.doCut();
        if (item == "copy")
            this.doCopy();
        if (item == "paste")
            this.doPaste(null);
        if (item == "duplicate")
            this.doDuplicate();
        if (item == "flip")
            this.app.mouse.doFlip();
        if (item == "split")
            this.app.mouse.doSplit(this.app.mouse.menuElm);
        if (item == "selectAll")
            this.app.mouse.doSelectAll();

        if (item == "centercircuit") {
            this.app.undoManager?.pushUndo();
            this.app.centerCircuit();
        }
        if (item == "rotate") {
            this.app.undoManager?.pushUndo();
            this.rotate();
        }
        if (item == "mirror") {
            this.app.undoManager?.pushUndo();
            this.mirror();
        }
        if (item == "convertWires") {
            this.app.undoManager?.pushUndo();
            (window as any).WireConverter?.convertWires(this.app);
            this.app.needAnalyze();
        }
        if (item == "createTest") {
            this.app.undoManager?.pushUndo();
            (window as any).TestCreator?.createTest(this.app);
        }
        if (item == "stackAll")
            (this.app.scopeManager as any).stackAll?.();
        if (item == "unstackAll")
            (this.app.scopeManager as any).unstackAll?.();
        if (item == "combineAll")
            (this.app.scopeManager as any).combineAll?.();
        if (item == "separateAll")
            (this.app.scopeManager as any).separateAll?.();
        if (item == "zoomin")
            this.app.mouse.zoomCircuit(20, true);
        if (item == "zoomout")
            this.app.mouse.zoomCircuit(-20, true);
        if (item == "zoom100")
            this.app.mouse.setCircuitScale(1, true);
        if (menu == "elm" && item == "edit")
            this.doEdit(this.app.mouse.menuElm);
        if (item == "delete") {
            if (menu != "elm")
                this.app.mouse.menuElm = null;
            this.app.undoManager?.pushUndo();
            this.doDelete(true);
        }
        if (item == "sliders")
            this.doSliders(this.app.mouse.menuElm);

        if (item == "viewInScope" && this.app.mouse.menuElm != null) {
            let i: number;
            for (i = 0; i != this.app.scopeManager.scopeCount; i++)
                if (this.app.scopeManager.scopes[i].getElm() == null)
                    break;
            if (i == this.app.scopeManager.scopeCount) {
                if (this.app.scopeManager.scopeCount == this.app.scopeManager.scopes.length)
                    return;
                this.app.scopeManager.scopeCount++;
                this.app.scopeManager.scopes[i] = new Scope(this.app, this.app.sim);
                this.app.scopeManager.scopes[i].position = i;
            }
            this.app.scopeManager.scopes[i].setElm(this.app.mouse.menuElm);
            if (i > 0)
                this.app.scopeManager.scopes[i].speed = this.app.scopeManager.scopes[i-1].speed;
        }

        if (item == "viewInFloatScope" && this.app.mouse.menuElm != null) {
            const newScope = new ScopeElm(
                this.app.snapGrid(this.app.mouse.menuElm.x + 50),
                this.app.snapGrid(this.app.mouse.menuElm.y + 50));
            this.app.elmList.push(newScope);
            newScope.setScopeElm(this.app.mouse.menuElm);
            // need to rebuild scopeElmArr
            this.app.needAnalyze();
        }

        if (item.startsWith("addToScope") && this.app.mouse.menuElm != null) {
            const n = parseInt(item.substring(10));
            const sm = this.app.scopeManager as any;
            if (n < sm.scopeCount + (sm.countScopeElms?.() ?? 0)) {
                if (n < sm.scopeCount)
                    sm.scopes[n].addElm(this.app.mouse.menuElm);
                else
                    sm.getNthScopeElm(n - sm.scopeCount).elmScope.addElm(this.app.mouse.menuElm);
            }
            sm.scopeMenuSelected = -1;
        }

        if (menu == "scopepop") {
            this.app.undoManager?.pushUndo();
            const sm = this.app.scopeManager as any;
            let s: any;
            if (sm.menuScope != -1)
                s = sm.scopes[sm.menuScope];
            else
                s = this.app.mouse.getMouseElm()?.elmScope;

            if (item == "dock") {
                if (sm.scopeCount == sm.scopes.length)
                    return;
                sm.scopes[sm.scopeCount] = this.app.mouse.getMouseElm()?.elmScope;
                this.app.mouse.getMouseElm()?.clearElmScope();
                sm.scopes[sm.scopeCount].position = sm.scopeCount;
                sm.scopeCount++;
                this.doDelete(false);
            }
            if (item == "undock") {
                const elm = s.getElm();
                const newScope = new ScopeElm(
                    this.app.snapGrid(elm.x + 50),
                    this.app.snapGrid(elm.y + 50));
                this.app.elmList.push(newScope);
                newScope.setElmScope(sm.scopes[sm.menuScope]);
                // remove scope from list.  setupScopes() will fix the positions
                for (let i = sm.menuScope; i < sm.scopeCount; i++)
                    sm.scopes[i] = sm.scopes[i+1];
                sm.scopeCount--;
                this.app.needAnalyze();      // need to rebuild scopeElmArr
            }
            if (item == "remove")
                s.setElm(null);  // setupScopes() will clean this up
            if (item == "removeplot")
                s.removePlot(sm.menuPlot);
            if (item == "speed2")
                s.speedUp();
            if (item == "speed1/2")
                s.slowDown();
            if (item == "maxscale")
                s.maxScale();
            if (item == "stack")
                sm.stackScope(sm.menuScope);
            if (item == "unstack")
                sm.unstackScope(sm.menuScope);
            if (item == "combine")
                sm.combineScope(sm.menuScope);
            if (item == "selecty")
                s.selectY();
            if (item == "reset")
                s.resetGraph(true);
            if (item == "exportcsv")
                s.exportCSV();
            if (item == "properties")
                s.showProperties();
            sm.deleteUnusedScopeElms?.();
        }

        if (menu == "circuits" && item.indexOf("setup ") == 0) {
            this.app.undoManager?.pushUndo();
            const sp = item.indexOf(' ', 6);
            this.app.menus.readSetupFile(item.substring(6, sp), item.substring(sp + 1));
        }
        if (item == "newblankcircuit") {
            this.app.undoManager?.pushUndo();
            this.app.menus.readSetupFile("blank.txt", "Blank Circuit");
        }

        // IES: Moved from itemStateChanged()
        if (menu == "main") {
            if (contextPanel != null)
                contextPanel.remove(); this.app.ui.contextPanel = null;
            this.app.setMouseMode(MouseManager.MODE_ADD_ELM);
            const s = item;
            if (s.length > 0)
                this.app.ui.mouseModeStr = s;
            if (s == "DragAll")
                this.app.setMouseMode(MouseManager.MODE_DRAG_ALL);
            else if (s == "DragRow")
                this.app.setMouseMode(MouseManager.MODE_DRAG_ROW);
            else if (s == "DragColumn")
                this.app.setMouseMode(MouseManager.MODE_DRAG_COLUMN);
            else if (s == "DragSelected")
                this.app.setMouseMode(MouseManager.MODE_DRAG_SELECTED);
            else if (s == "DragPost")
                this.app.setMouseMode(MouseManager.MODE_DRAG_POST);
            else if (s == "Select")
                this.app.setMouseMode(MouseManager.MODE_SELECT);

            this.app.updateToolbar();

            this.app.mouse.tempMouseMode = this.app.mouse.mouseMode;
        }
        if (item == "fullscreen") {
            if (!(window as any).Graphics?.isFullScreen)
                (window as any).Graphics?.viewFullScreen();
            else
                (window as any).Graphics?.exitFullScreen();
            this.app.centerCircuit();
        }

        this.app.repaint();
    }

    doEdit(eable: any): void {
        this.app.mouse.clearSelection();
        this.app.undoManager?.pushUndo();
        if (CirSim.editDialog != null) {
            CirSim.editDialog.setVisible(false);
            CirSim.editDialog = null;
        }
        CirSim.editDialog = new EditDialog(eable, this.app);
        CirSim.editDialog.show();
    }

    doSliders(ce: any): void {
        this.app.mouse.clearSelection();
        this.app.undoManager?.pushUndo();
        CirSim.dialogShowing = new (window as any).SliderDialog(ce, this.app);
        CirSim.dialogShowing.show();
    }

    doExportAsUrl(): void {
        const dump = this.app.dumpCircuit();
        CirSim.dialogShowing = new (window as any).ExportAsUrlDialog(dump);
        CirSim.dialogShowing.show();
    }

    doExportAsText(): void {
        const dump = this.app.dumpCircuit();
        CirSim.dialogShowing = new ExportAsTextDialog(this.app, dump);
        CirSim.dialogShowing.show();
    }

    doCreateSubcircuit(): void {
        const dlg = new EditCompositeModelDialog();
        if (!dlg.createModel())
            return;
        dlg.createDialog();
        CirSim.dialogShowing = dlg;
        CirSim.dialogShowing.show();
    }

    doExportAsLocalFile(): void {
        const dump = this.app.dumpCircuit();
        CirSim.dialogShowing = new ExportAsLocalFileDialog(dump);
        CirSim.dialogShowing.show();
    }

    doDCAnalysis(): void {
        this.app.dcAnalysisFlag = true;
        this.app.resetAction();
    }

    setMenuSelection(): void {
        if (this.app.mouse.menuElm != null) {
            if (this.app.mouse.menuElm.selected)
                return;
            this.app.mouse.clearSelection();
            this.app.mouse.menuElm.setSelected(true);
        }
    }

    countSelected(): number {
        let count = 0;
        for (const ce of this.app.elmList)
            if (ce.isSelected())
                count++;
        return count;
    }

    prepareFlip(): { cx: number; cy: number; count: number } {
        this.app.undoManager?.pushUndo();
        this.setMenuSelection();
        let minx = 30000, maxx = -30000;
        let miny = 30000, maxy = -30000;
        const count = this.countSelected();
        for (const ce of this.app.elmList) {
            if (ce.isSelected() || count == 0) {
                minx = Math.min(ce.x, Math.min(ce.x2, minx));
                maxx = Math.max(ce.x, Math.max(ce.x2, maxx));
                miny = Math.min(ce.y, Math.min(ce.y2, miny));
                maxy = Math.max(ce.y, Math.max(ce.y2, maxy));
            }
        }
        return { cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, count };
    }

    // mirror horizontally
    mirror(): void {
        const fi = this.prepareFlip();
        const center2 = fi.cx * 2;
        for (const ce of this.app.elmList)
            if (ce.isSelected() || fi.count == 0)
                ce.flipX(center2, fi.count);
        this.app.needAnalyze();
    }

    // rotate 90 degrees: a diagonal flip followed by a vertical flip cancels out the mirroring and leaves a pure rotation
    rotate(): void {
        const fi = this.prepareFlip();
        const center2 = fi.cy * 2;
        const xmy = this.app.snapGrid(fi.cx - fi.cy);
        for (const ce of this.app.elmList) {
            if (ce.isSelected() || fi.count == 0) {
                ce.flipXY(xmy, fi.count);
                ce.flipY(center2, fi.count);
            }
        }
        this.app.needAnalyze();
    }

    doCut(): void {
        this.app.undoManager?.pushUndo();
        this.setMenuSelection();
        this.clipboard = this.copyOfSelectedElms();
        this.writeClipboardToStorage();
        this.doDelete(true);
        this.enablePaste();
    }

    writeClipboardToStorage(): void {
        localStorage.setItem("circuitClipboard", this.clipboard);
    }

    readClipboardFromStorage(): void {
        this.clipboard = localStorage.getItem("circuitClipboard") ?? "";
    }

    doDelete(pushUndoFlag: boolean): void {
        if (pushUndoFlag)
            this.app.undoManager?.pushUndo();
        let hasDeleted = false;

        for (let i = this.app.elmList.length - 1; i >= 0; i--) {
            const ce = this.app.elmList[i];
            if (this.willDelete(ce)) {
                if (ce.isMouseElm())
                    this.app.mouse.setMouseElm(null);
                ce.delete();
                this.app.elmList.splice(i, 1);
                hasDeleted = true;
            }
        }
        if (hasDeleted) {
            (this.app.scopeManager as any).deleteUnusedScopeElms?.();
            this.app.needAnalyze();
            this.app.undoManager?.writeRecoveryToStorage();
        }
    }

    willDelete(ce: any): boolean {
        return ce.isSelected() || ce.isMouseElm();
    }

    copyOfSelectedElms(): string {
        // Build an XML document string containing the selected elements
        const doc = document.implementation.createDocument(null, "cir", null);
        const root = doc.documentElement;

        CustomLogicModel.clearDumpedFlags();
        (window as any).CustomCompositeModel?.clearDumpedFlags();
        DiodeModel.clearDumpedFlags();
        (window as any).TransistorModel?.clearDumpedFlags();
        MosfetModel.clearDumpedFlags();

        for (let i = this.app.elmList.length - 1; i >= 0; i--) {
            const ce = this.app.elmList[i];
            ce.dumpXmlModel?.(doc);
            if (ce.isSelected() && !ce.isScopeElm?.()) {
                const elem = doc.createElement(ce.getXmlDumpType());
                ce.dumpXml?.(doc, elem);
                ce.dumpXmlState?.(doc, elem);
                root.appendChild(elem);
            }
        }
        return new window.XMLSerializer().serializeToString(doc);
    }

    doCopy(): void {
        const clearSel = (this.app.mouse.menuElm != null && !this.app.mouse.menuElm.selected);
        this.setMenuSelection();
        this.clipboard = this.copyOfSelectedElms();
        if (clearSel)
            this.app.mouse.clearSelection();
        this.writeClipboardToStorage();
        this.enablePaste();
    }

    enablePaste(): void {
        if (this.clipboard == null || this.clipboard.length == 0)
            this.readClipboardFromStorage();
        this.app.menus.pasteItem.setEnabled(this.clipboard != null && this.clipboard.length > 0);
    }

    doDuplicate(): void {
        this.setMenuSelection();
        const s = this.copyOfSelectedElms();
        this.doPaste(s);
    }

    doPaste(dump: string | null): void {
        this.app.undoManager?.pushUndo();
        this.app.mouse.clearSelection();
        let oldbb: Rectangle | null = null;

        // get old bounding box
        for (const ce of this.app.elmList) {
            const bb = ce.getBoundingBox();
            if (oldbb != null)
                oldbb = oldbb.union(bb);
            else
                oldbb = bb;
        }

        // add new items
        const oldsz = this.app.elmList.length;
        let flags = CircuitLoader.RC_RETAIN;

        // don't recenter circuit if we're going to paste in place because that will change the transform
        // in fact, don't ever recenter circuit, unless old circuit was empty
        if (oldsz > 0)
            flags |= CircuitLoader.RC_NO_CENTER;

        if (dump != null)
            this.app.loader.readCircuit(dump, flags);
        else {
            this.readClipboardFromStorage();
            this.app.loader.readCircuit(this.clipboard, flags);
        }

        // select new items and get their bounding box
        let newbb: Rectangle | null = null;
        for (let i = oldsz; i != this.app.elmList.length; i++) {
            const ce = this.app.elmList[i];
            ce.setSelected(true);
            const bb = ce.getBoundingBox();
            if (newbb != null)
                newbb = newbb.union(bb);
            else
                newbb = bb;
        }

        if (oldbb != null && newbb != null) {
            // find a place on the edge for new items
            let dx = 0, dy = 0;
            const spacew = this.app.circuitArea.width - oldbb.width - newbb.width;
            const spaceh = this.app.circuitArea.height - oldbb.height - newbb.height;

            if (!oldbb.intersects(newbb)) {
                // old coordinates may be really far away so move them to same origin as current circuit
                dx = this.app.snapGrid(oldbb.x - newbb.x);
                dy = this.app.snapGrid(oldbb.y - newbb.y);
            }

            if (spacew > spaceh)
                dx = this.app.snapGrid(oldbb.x + oldbb.width  - newbb.x + this.app.gridSize);
            else
                dy = this.app.snapGrid(oldbb.y + oldbb.height - newbb.y + this.app.gridSize);

            // move new items near the mouse if possible
            if (this.app.mouse.mouseCursorX > 0 && this.app.circuitArea.contains(this.app.mouse.mouseCursorX, this.app.mouse.mouseCursorY)) {
                const gx = this.app.mouse.inverseTransformX(this.app.mouse.mouseCursorX);
                const gy = this.app.mouse.inverseTransformY(this.app.mouse.mouseCursorY);
                const mdx = this.app.snapGrid(gx - (newbb.x + newbb.width / 2));
                const mdy = this.app.snapGrid(gy - (newbb.y + newbb.height / 2));
                let i: number;
                for (i = oldsz; i != this.app.elmList.length; i++) {
                    if (!this.app.elmList[i].allowMove(mdx, mdy))
                        break;
                }
                if (i == this.app.elmList.length) {
                    dx = mdx;
                    dy = mdy;
                }
            }

            // move the new items
            for (let i = oldsz; i != this.app.elmList.length; i++)
                this.app.elmList[i].move(dx, dy);
        }
        this.app.needAnalyze();
        this.app.undoManager?.writeRecoveryToStorage();
    }

    static electronSaveAsCallback(s: string): void {
        s = s.substring(s.lastIndexOf('/') + 1);
        s = s.substring(s.lastIndexOf('\\') + 1);
        const app = CirSim.theApp;
        app.setCircuitTitle(s);
        app.allowSave(true);
        app.savedFlag = true;
        app.repaint();
    }

    static electronSaveCallback(): void {
        const app = CirSim.theApp;
        app.savedFlag = true;
        app.repaint();
    }

    static newElectronWindow(): void {
        (window as any).newWindow?.();
    }

    static electronSaveAs(dump: string): void {
        (window as any).showSaveDialog?.().then((file: any) => {
            if (file.canceled) return;
            (window as any).saveFile(file, dump);
            CommandManager.electronSaveAsCallback(file.filePath.toString());
        });
    }

    static electronSave(dump: string): void {
        (window as any).saveFile?.(null, dump);
        CommandManager.electronSaveCallback();
    }

    static electronOpenFileCallback(text: string, name: string): void {
        const app = CirSim.theApp;
        (window as any).LoadFile?.doLoadCallback(text, name);
        app.allowSave(true);
    }

    static electronOpenFile(): void {
        (window as any).openFile?.((text: string, name: string) => {
            CommandManager.electronOpenFileCallback(text, name);
        });
    }

    static toggleDevTools(): void {
        (window as any).toggleDevTools?.();
    }
}
