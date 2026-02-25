package com.lushprojects.circuitjs1.client;

import com.google.gwt.storage.client.Storage;
import com.google.gwt.user.client.Window;
import com.google.gwt.dom.client.Document;
import com.lushprojects.circuitjs1.client.util.Locale;

public class CommandManager {

    CirSim sim;
    String clipboard;

    CommandManager(CirSim sim) {
	this.sim = sim;
    }

    public void menuPerformed(String menu, String item) {
	if ((menu=="edit" || menu=="main" || menu=="scopes") && sim.menus.noEditCheckItem.getState()) {
	    Window.alert(Locale.LS("Editing disabled.  Re-enable from the Options menu."));
	    return;
	}
    	if (item=="about")
    		sim.aboutBox = new AboutBox(circuitjs1.versionString);
    	if (item=="importfromlocalfile") {
    		sim.undoManager.pushUndo();
    		if (sim.isElectron())
    		    sim.electronOpenFile();
    		else
    		    sim.loadFileInput.click();
    	}
    	if (item=="newwindow") {
    	    Window.open(Document.get().getURL(), "_blank", "");
    	}
    	if (item=="save")
    	    sim.electronSave(sim.dumpCircuit());
    	if (item=="saveas")
    	    sim.electronSaveAs(sim.dumpCircuit());
    	if (item=="importfromtext") {
    		sim.dialogShowing = new ImportFromTextDialog(sim);
    	}
    	if (item=="importfromdropbox") {
    		sim.dialogShowing = new ImportFromDropboxDialog(sim);
    	}
    	if (item=="exportasurl") {
    		doExportAsUrl();
    		sim.unsavedChanges = false;
    	}
    	if (item=="exportaslocalfile") {
    		doExportAsLocalFile();
    		sim.unsavedChanges = false;
    	}
    	if (item=="exportastext") {
    		doExportAsText();
    		sim.unsavedChanges = false;
    	}
    	if (item=="exportasimage")
		sim.imageExporter.doExportAsImage();
    	if (item=="copypng") {
		sim.imageExporter.doImageToClipboard();
    		if (sim.contextPanel!=null)
			sim.contextPanel.hide();
    	}
    	if (item=="exportassvg")
		sim.imageExporter.doExportAsSVG();
    	if (item=="createsubcircuit")
		doCreateSubcircuit();
    	if (item=="dcanalysis")
    	    	doDCAnalysis();
    	if (item=="print")
    	    	sim.imageExporter.doPrint();
    	if (item=="recover")
    	    	sim.undoManager.doRecover();

    	if ((menu=="elm" || menu=="scopepop") && sim.contextPanel!=null)
    		sim.contextPanel.hide();
    	if (menu=="options" && item=="shortcuts") {
    	    	sim.dialogShowing = new ShortcutsDialog(sim);
    	    	sim.dialogShowing.show();
    	}
    	if (menu=="options" && item=="subcircuits") {
    	    	sim.dialogShowing = new SubcircuitDialog(sim);
    	    	sim.dialogShowing.show();
    	}
    	if (item=="search") {
    	    	sim.dialogShowing = new SearchDialog(sim);
    	    	sim.dialogShowing.show();
    	}
    	if (menu=="options" && item=="other")
    		doEdit(new EditOptions(sim, sim.sim));
    	if (item=="devtools")
    	    sim.toggleDevTools();
    	if (item=="undo")
    		sim.undoManager.doUndo();
    	if (item=="redo")
    		sim.undoManager.doRedo();

    	// if the mouse is hovering over an element, and a shortcut key is pressed, operate on that element (treat it like a context menu item selection)
    	if (menu == "key" && sim.mouse.getMouseElm() != null) {
    	    sim.mouse.menuElm = sim.mouse.getMouseElm();
    	    menu = "elm";
    	}
	if (menu != "elm")
		sim.mouse.menuElm = null;

    	if (item == "cut") {
    		doCut();
    	}
    	if (item == "copy") {
    		doCopy();
    	}
    	if (item=="paste")
    		doPaste(null);
    	if (item=="duplicate") {
    	    	doDuplicate();
    	}
    	if (item=="flip")
    	    sim.mouse.doFlip();
    	if (item=="split")
    	    sim.mouse.doSplit(sim.mouse.menuElm);
    	if (item=="selectAll")
    		sim.mouse.doSelectAll();

    	if (item=="centrecircuit") {
    		sim.undoManager.pushUndo();
    		sim.centreCircuit();
    	}
    	if (item=="flipx") {
	    sim.undoManager.pushUndo();
	    flipX();
    	}
    	if (item=="flipy") {
	    sim.undoManager.pushUndo();
	    flipY();
    	}
    	if (item=="flipxy") {
	    sim.undoManager.pushUndo();
	    flipXY();
    	}
    	if (item=="stackAll")
    		sim.scopeManager.stackAll();
    	if (item=="unstackAll")
    		sim.scopeManager.unstackAll();
    	if (item=="combineAll")
		sim.scopeManager.combineAll();
    	if (item=="separateAll")
		sim.scopeManager.separateAll();
    	if (item=="zoomin")
    	    sim.mouse.zoomCircuit(20, true);
    	if (item=="zoomout")
    	    sim.mouse.zoomCircuit(-20, true);
    	if (item=="zoom100")
    	    sim.mouse.setCircuitScale(1, true);
    	if (menu=="elm" && item=="edit")
    		doEdit(sim.mouse.menuElm);
    	if (item=="delete") {
    		if (menu!="elm")
    			sim.mouse.menuElm = null;
    		sim.undoManager.pushUndo();
    		doDelete(true);
    	}
    	if (item=="sliders")
    	    doSliders(sim.mouse.menuElm);

    	if (item=="viewInScope" && sim.mouse.menuElm != null) {
    		int i;
    		for (i = 0; i != sim.scopeManager.scopeCount; i++)
    			if (sim.scopeManager.scopes[i].getElm() == null)
    				break;
    		if (i == sim.scopeManager.scopeCount) {
    			if (sim.scopeManager.scopeCount == sim.scopeManager.scopes.length)
    				return;
    			sim.scopeManager.scopeCount++;
    			sim.scopeManager.scopes[i] = new Scope(sim, sim.sim);
    			sim.scopeManager.scopes[i].position = i;
    		}
    		sim.scopeManager.scopes[i].setElm(sim.mouse.menuElm);
    		if (i > 0)
    		    sim.scopeManager.scopes[i].speed = sim.scopeManager.scopes[i-1].speed;
    	}

    	if (item=="viewInFloatScope" && sim.mouse.menuElm != null) {
    	    ScopeElm newScope = new ScopeElm(sim.snapGrid(sim.mouse.menuElm.x+50), sim.snapGrid(sim.mouse.menuElm.y+50));
    	    sim.elmList.addElement(newScope);
    	    newScope.setScopeElm(sim.mouse.menuElm);

    	    // need to rebuild scopeElmArr
    	    sim.needAnalyze();
	}

    	if (item.startsWith("addToScope") && sim.mouse.menuElm != null) {
    	    int n;
    	    n = Integer.parseInt(item.substring(10));
    	    if (n < sim.scopeManager.scopeCount + sim.scopeManager.countScopeElms()) {
    		if (n < sim.scopeManager.scopeCount )
    		    sim.scopeManager.scopes[n].addElm(sim.mouse.menuElm);
    		else
    		    sim.scopeManager.getNthScopeElm(n-sim.scopeManager.scopeCount).elmScope.addElm(sim.mouse.menuElm);
    	    }
    	    sim.scopeManager.scopeMenuSelected = -1;
    	}

    	if (menu=="scopepop") {
    		sim.undoManager.pushUndo();
    		Scope s;
		if (sim.scopeManager.menuScope != -1 )
		    	s= sim.scopeManager.scopes[sim.scopeManager.menuScope];
		else
		    	s= ((ScopeElm)sim.mouse.getMouseElm()).elmScope;

    		if (item=="dock") {
            		if (sim.scopeManager.scopeCount == sim.scopeManager.scopes.length)
            			return;
            		sim.scopeManager.scopes[sim.scopeManager.scopeCount] = ((ScopeElm)sim.mouse.getMouseElm()).elmScope;
            		((ScopeElm)sim.mouse.getMouseElm()).clearElmScope();
            		sim.scopeManager.scopes[sim.scopeManager.scopeCount].position = sim.scopeManager.scopeCount;
            		sim.scopeManager.scopeCount++;
            		doDelete(false);
    		}
    		if (item=="undock") {
		    CircuitElm elm = s.getElm();
    	    	    ScopeElm newScope = new ScopeElm(sim.snapGrid(elm.x+50), sim.snapGrid(elm.y+50));
    	    	    sim.elmList.addElement(newScope);
    	    	    newScope.setElmScope(sim.scopeManager.scopes[sim.scopeManager.menuScope]);

    	    	    int i;
    	    	    // remove scope from list.  setupScopes() will fix the positions
    	    	    for (i = sim.scopeManager.menuScope; i < sim.scopeManager.scopeCount; i++)
    	    		sim.scopeManager.scopes[i] = sim.scopeManager.scopes[i+1];
    	    	    sim.scopeManager.scopeCount--;

    	            sim.needAnalyze();      // need to rebuild scopeElmArr
    		}
    		if (item=="remove")
    		    	s.setElm(null);  // setupScopes() will clean this up
    		if (item=="removeplot")
			s.removePlot(sim.scopeManager.menuPlot);
    		if (item=="speed2")
    			s.speedUp();
    		if (item=="speed1/2")
    			s.slowDown();
    		if (item=="maxscale")
    			s.maxScale();
    		if (item=="stack")
    			sim.scopeManager.stackScope(sim.scopeManager.menuScope);
    		if (item=="unstack")
    			sim.scopeManager.unstackScope(sim.scopeManager.menuScope);
    		if (item=="combine")
			sim.scopeManager.combineScope(sim.scopeManager.menuScope);
    		if (item=="selecty")
    			s.selectY();
    		if (item=="reset")
    			s.resetGraph(true);
    		if (item=="properties")
			s.properties();
    		sim.scopeManager.deleteUnusedScopeElms();
    	}
    	if (menu=="circuits" && item.indexOf("setup ") ==0) {
    		sim.undoManager.pushUndo();
    		int sp = item.indexOf(' ', 6);
    		sim.readSetupFile(item.substring(6, sp), item.substring(sp+1));
    	}
    	if (item=="newblankcircuit") {
    	    sim.undoManager.pushUndo();
    	    sim.readSetupFile("blank.txt", "Blank Circuit");
    	}

    	// IES: Moved from itemStateChanged()
    	if (menu=="main") {
    		if (sim.contextPanel!=null)
    			sim.contextPanel.hide();
    		sim.setMouseMode(MouseManager.MODE_ADD_ELM);
    		String s = item;
    		if (s.length() > 0)
    			sim.mouseModeStr = s;
    		if (s.compareTo("DragAll") == 0)
    			sim.setMouseMode(MouseManager.MODE_DRAG_ALL);
    		else if (s.compareTo("DragRow") == 0)
    			sim.setMouseMode(MouseManager.MODE_DRAG_ROW);
    		else if (s.compareTo("DragColumn") == 0)
    			sim.setMouseMode(MouseManager.MODE_DRAG_COLUMN);
    		else if (s.compareTo("DragSelected") == 0)
    			sim.setMouseMode(MouseManager.MODE_DRAG_SELECTED);
    		else if (s.compareTo("DragPost") == 0)
    			sim.setMouseMode(MouseManager.MODE_DRAG_POST);
    		else if (s.compareTo("Select") == 0)
    			sim.setMouseMode(MouseManager.MODE_SELECT);

		sim.updateToolbar();

    		sim.mouse.tempMouseMode = sim.mouse.mouseMode;
    	}
    	if (item=="fullscreen") {
    	    if (! Graphics.isFullScreen)
    		Graphics.viewFullScreen();
    	    else
    		Graphics.exitFullScreen();
    	    sim.centreCircuit();
    	}

	sim.repaint();
    }

    void doEdit(Editable eable) {
    	sim.mouse.clearSelection();
    	sim.undoManager.pushUndo();
    	if (sim.editDialog != null) {
    		sim.editDialog.setVisible(false);
    		sim.editDialog = null;
    	}
    	sim.editDialog = new EditDialog(eable, sim);
    	sim.editDialog.show();
    }

    void doSliders(CircuitElm ce) {
	sim.mouse.clearSelection();
	sim.undoManager.pushUndo();
	sim.dialogShowing = new SliderDialog(ce, sim);
	sim.dialogShowing.show();
    }

    void doExportAsUrl() {
    	String dump = sim.dumpCircuit();
	sim.dialogShowing = new ExportAsUrlDialog(dump);
	sim.dialogShowing.show();
    }

    void doExportAsText() {
    	String dump = sim.dumpCircuit();
    	sim.dialogShowing = new ExportAsTextDialog(sim, dump);
    	sim.dialogShowing.show();
    }

    void doCreateSubcircuit() {
    	EditCompositeModelDialog dlg = new EditCompositeModelDialog();
    	if (!dlg.createModel())
    	    return;
    	dlg.createDialog();
    	sim.dialogShowing = dlg;
    	sim.dialogShowing.show();
    }

    void doExportAsLocalFile() {
    	String dump = sim.dumpCircuit();
    	sim.dialogShowing = new ExportAsLocalFileDialog(dump);
    	sim.dialogShowing.show();
    }

    void doDCAnalysis() {
	sim.dcAnalysisFlag = true;
	sim.resetAction();
    }

    void setMenuSelection() {
    	if (sim.mouse.menuElm != null) {
    		if (sim.mouse.menuElm.selected)
    			return;
    		sim.mouse.clearSelection();
    		sim.mouse.menuElm.setSelected(true);
    	}
    }

    int countSelected() {
	int count = 0;
	for (CircuitElm ce: sim.elmList)
	    if (ce.isSelected())
		count++;
	return count;
    }

    class FlipInfo { public int cx, cy, count; }

    FlipInfo prepareFlip() {
    	int i;
    	sim.undoManager.pushUndo();
    	setMenuSelection();
    	int minx = 30000, maxx = -30000;
    	int miny = 30000, maxy = -30000;
	int count = countSelected();
    	for (i = 0; i != sim.elmList.size(); i++) {
	    CircuitElm ce = sim.getElm(i);
	    if (ce.isSelected() || count == 0) {
		minx = Math.min(ce.x, Math.min(ce.x2, minx));
		maxx = Math.max(ce.x, Math.max(ce.x2, maxx));
		miny = Math.min(ce.y, Math.min(ce.y2, miny));
		maxy = Math.max(ce.y, Math.max(ce.y2, maxy));
	    }
    	}
	FlipInfo fi = new FlipInfo();
	fi.cx = (minx+maxx)/2;
	fi.cy = (miny+maxy)/2;
	fi.count = count;
	return fi;
    }

    void flipX() {
	FlipInfo fi = prepareFlip();
	int center2 = fi.cx*2;
	for (CircuitElm ce : sim.elmList) {
	    if (ce.isSelected() || fi.count == 0)
		ce.flipX(center2, fi.count);
    	}
	sim.needAnalyze();
    }

    void flipY() {
	FlipInfo fi = prepareFlip();
	int center2 = fi.cy*2;
	for (CircuitElm ce : sim.elmList) {
	    if (ce.isSelected() || fi.count == 0)
		ce.flipY(center2, fi.count);
    	}
	sim.needAnalyze();
    }

    void flipXY() {
	FlipInfo fi = prepareFlip();
	int xmy = sim.snapGrid(fi.cx-fi.cy);
	sim.console("xmy " + xmy + " grid " + sim.gridSize + " " + fi.cx + " " + fi.cy);
	for (CircuitElm ce : sim.elmList) {
	    if (ce.isSelected() || fi.count == 0)
		ce.flipXY(xmy, fi.count);
    	}
	sim.needAnalyze();
    }

    void doCut() {
    	int i;
    	sim.undoManager.pushUndo();
    	setMenuSelection();
    	clipboard = "";
    	for (i = sim.elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = sim.getElm(i);
    		if (willDelete(ce) && !(ce instanceof ScopeElm) ) {
    			clipboard += ce.dump() + "\n";
    		}
    	}
    	writeClipboardToStorage();
    	doDelete(true);
    	enablePaste();
    }

    void writeClipboardToStorage() {
    	Storage stor = Storage.getLocalStorageIfSupported();
    	if (stor == null)
    		return;
    	stor.setItem("circuitClipboard", clipboard);
    }

    void readClipboardFromStorage() {
    	Storage stor = Storage.getLocalStorageIfSupported();
    	if (stor == null)
    		return;
    	clipboard = stor.getItem("circuitClipboard");
    }

    void doDelete(boolean pushUndoFlag) {
    	int i;
    	if (pushUndoFlag)
    	    sim.undoManager.pushUndo();
    	boolean hasDeleted = false;

    	for (i = sim.elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = sim.getElm(i);
    		if (willDelete(ce)) {
    		    	if (ce.isMouseElm())
    		    	    sim.mouse.setMouseElm(null);
    			ce.delete();
    			sim.elmList.removeElementAt(i);
    			hasDeleted = true;
    		}
    	}
    	if ( hasDeleted ) {
    	    sim.scopeManager.deleteUnusedScopeElms();
    	    sim.needAnalyze();
    	    sim.undoManager.writeRecoveryToStorage();
    	}
    }

    boolean willDelete( CircuitElm ce ) {
	return ce.isSelected() || ce.isMouseElm();
    }

    String copyOfSelectedElms() {
	String r = sim.dumpOptions();
	CustomLogicModel.clearDumpedFlags();
	CustomCompositeModel.clearDumpedFlags();
	DiodeModel.clearDumpedFlags();
	TransistorModel.clearDumpedFlags();
	for (int i = sim.elmList.size()-1; i >= 0; i--) {
	    CircuitElm ce = sim.getElm(i);
	    String m = ce.dumpModel();
	    if (m != null && !m.isEmpty())
		r += m + "\n";
	    if (ce.isSelected() && !(ce instanceof ScopeElm))
		r += ce.dump() + "\n";
	}
	return r;
    }

    void doCopy() {
    	boolean clearSel = (sim.mouse.menuElm != null && !sim.mouse.menuElm.selected);

    	setMenuSelection();
    	clipboard=copyOfSelectedElms();

    	if (clearSel)
    	    sim.mouse.clearSelection();

    	writeClipboardToStorage();
    	enablePaste();
    }

    void enablePaste() {
    	if (clipboard == null || clipboard.length() == 0)
    		readClipboardFromStorage();
    	sim.menus.pasteItem.setEnabled(clipboard != null && clipboard.length() > 0);
    }

    void doDuplicate() {
    	String s;
    	setMenuSelection();
    	s=copyOfSelectedElms();
    	doPaste(s);
    }

    void doPaste(String dump) {
    	sim.undoManager.pushUndo();
    	sim.mouse.clearSelection();
    	int i;
    	Rectangle oldbb = null;

    	// get old bounding box
    	for (i = 0; i != sim.elmList.size(); i++) {
    		CircuitElm ce = sim.getElm(i);
    		Rectangle bb = ce.getBoundingBox();
    		if (oldbb != null)
    			oldbb = oldbb.union(bb);
    		else
    			oldbb = bb;
    	}

    	// add new items
    	int oldsz = sim.elmList.size();
    	int flags = CircuitLoader.RC_RETAIN;

    	// don't recenter circuit if we're going to paste in place because that will change the transform

    	// in fact, don't ever recenter circuit, unless old circuit was empty
    	if (oldsz > 0)
    	    flags |= CircuitLoader.RC_NO_CENTER;

    	if (dump != null)
    	    sim.loader.readCircuit(dump, flags);
    	else {
    	    readClipboardFromStorage();
    	    sim.loader.readCircuit(clipboard, flags);
    	}

    	// select new items and get their bounding box
    	Rectangle newbb = null;
    	for (i = oldsz; i != sim.elmList.size(); i++) {
    		CircuitElm ce = sim.getElm(i);
    		ce.setSelected(true);
    		Rectangle bb = ce.getBoundingBox();
    		if (newbb != null)
    			newbb = newbb.union(bb);
    		else
    			newbb = bb;
    	}

    	if (oldbb != null && newbb != null) {
    		// find a place on the edge for new items
    		int dx = 0, dy = 0;
    		int spacew = sim.circuitArea.width - oldbb.width - newbb.width;
    		int spaceh = sim.circuitArea.height - oldbb.height - newbb.height;

    		if (!oldbb.intersects(newbb)) {
    		    // old coordinates may be really far away so move them to same origin as current circuit
    		    dx = sim.snapGrid(oldbb.x - newbb.x);
    		    dy = sim.snapGrid(oldbb.y - newbb.y);
    		}

    		if (spacew > spaceh) {
    			dx = sim.snapGrid(oldbb.x + oldbb.width  - newbb.x + sim.gridSize);
    		} else {
    			dy = sim.snapGrid(oldbb.y + oldbb.height - newbb.y + sim.gridSize);
    		}

    		// move new items near the mouse if possible
    		if (sim.mouse.mouseCursorX > 0 && sim.circuitArea.contains(sim.mouse.mouseCursorX, sim.mouse.mouseCursorY)) {
    	    	    int gx = sim.mouse.inverseTransformX(sim.mouse.mouseCursorX);
    	    	    int gy = sim.mouse.inverseTransformY(sim.mouse.mouseCursorY);
    	    	    int mdx = sim.snapGrid(gx-(newbb.x+newbb.width/2));
    	    	    int mdy = sim.snapGrid(gy-(newbb.y+newbb.height/2));
    	    	    for (i = oldsz; i != sim.elmList.size(); i++) {
    	    		if (!sim.getElm(i).allowMove(mdx, mdy))
    	    		    break;
    	    	    }
    	    	    if (i == sim.elmList.size()) {
    	    		dx = mdx;
    	    		dy = mdy;
    	    	    }
    		}

    		// move the new items
    		for (i = oldsz; i != sim.elmList.size(); i++) {
    			CircuitElm ce = sim.getElm(i);
    			ce.move(dx, dy);
    		}

    	}
    	sim.needAnalyze();
    	sim.undoManager.writeRecoveryToStorage();
    }
}
