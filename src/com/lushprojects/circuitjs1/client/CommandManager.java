package com.lushprojects.circuitjs1.client;

import com.google.gwt.storage.client.Storage;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.PopupPanel;
import com.google.gwt.dom.client.Document;
import com.google.gwt.xml.client.XMLParser;
import com.lushprojects.circuitjs1.client.util.Locale;

public class CommandManager {

    CirSim app;
    String clipboard;

    CommandManager(CirSim app) {
	this.app = app;
    }

    public void menuPerformed(String menu, String item) {
	PopupPanel contextPanel = app.ui.contextPanel;
	
	if ((menu=="edit" || menu=="main" || menu=="scopes") && app.ui.isReadOnly()) {
	    Window.alert(Locale.LS("Editing disabled.  Re-enable from the Options menu."));
	    return;
	}
    	if (item=="about")
    		app.aboutBox = new AboutBox(circuitjs1.versionString);
    	if (item=="importfromlocalfile") {
    		app.undoManager.pushUndo();
    		if (app.isElectron())
    		    electronOpenFile();
    		else
    		    app.ui.loadFileInput.click();
    	}
    	if (item=="newwindow") {
    	    Window.open(Document.get().getURL(), "_blank", "");
    	}
    	if (item=="save")
    	    electronSave(app.dumpCircuit());
    	if (item=="saveas")
    	    electronSaveAs(app.dumpCircuit());
    	if (item=="importfromtext") {
    		app.dialogShowing = new ImportFromTextDialog(app);
    	}
    	if (item=="importfromdropbox") {
    		app.dialogShowing = new ImportFromDropboxDialog(app);
    	}
    	if (item=="exportasurl") {
    		doExportAsUrl();
    		app.unsavedChanges = false;
    	}
    	if (item=="exportaslocalfile") {
    		doExportAsLocalFile();
    		app.unsavedChanges = false;
    	}
    	if (item=="exportastext") {
    		doExportAsText();
    		app.unsavedChanges = false;
    	}
    	if (item=="exportasimage")
		app.imageExporter.doExportAsImage();
    	if (item=="copypng") {
		app.imageExporter.doImageToClipboard();
    		if (app.ui.contextPanel!=null)
			app.ui.contextPanel.hide();
    	}
    	if (item=="exportassvg")
		app.imageExporter.doExportAsSVG();
    	if (item=="createsubcircuit")
		doCreateSubcircuit();
    	if (item=="dcanalysis")
    	    	doDCAnalysis();
    	if (item=="print")
    	    	app.imageExporter.doPrint();
    	if (item=="recover")
    	    	app.undoManager.doRecover();

    	if ((menu=="elm" || menu=="scopepop") && contextPanel != null)
    		contextPanel.hide();
    	if (menu=="options" && item=="shortcuts") {
    	    	app.dialogShowing = new ShortcutsDialog(app);
    	    	app.dialogShowing.show();
    	}
    	if (item=="subcircuits") {
    	    	app.dialogShowing = new SubcircuitDialog(app);
    	    	app.dialogShowing.show();
    	}
    	if (item=="search") {
    	    	app.dialogShowing = new SearchDialog(app);
    	    	app.dialogShowing.show();
    	}
    	if (menu=="options" && item=="other")
    		doEdit(new EditOptions(app, app.sim));
    	if (item=="devtools")
    	    toggleDevTools();
    	if (item=="undo")
    		app.undoManager.doUndo();
    	if (item=="redo")
    		app.undoManager.doRedo();

    	// if the mouse is hovering over an element, and a shortcut key is pressed, operate on that element (treat it like a context menu item selection)
    	if (menu == "key" && app.mouse.getMouseElm() != null) {
    	    app.mouse.menuElm = app.mouse.getMouseElm();
    	    menu = "elm";
    	}
	if (menu != "elm")
		app.mouse.menuElm = null;

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
    	    app.mouse.doFlip();
    	if (item=="split")
    	    app.mouse.doSplit(app.mouse.menuElm);
    	if (item=="selectAll")
    		app.mouse.doSelectAll();

    	if (item=="centercircuit") {
    		app.undoManager.pushUndo();
    		app.centerCircuit();
    	}
    	if (item=="flipx") {
	    app.undoManager.pushUndo();
	    flipX();
    	}
    	if (item=="flipy") {
	    app.undoManager.pushUndo();
	    flipY();
    	}
    	if (item=="flipxy") {
	    app.undoManager.pushUndo();
	    flipXY();
    	}
    	if (item=="convertWires") {
	    app.undoManager.pushUndo();
	    WireConverter.convertWires(app);
	    app.needAnalyze();
    	}
    	if (item=="stackAll")
    		app.scopeManager.stackAll();
    	if (item=="unstackAll")
    		app.scopeManager.unstackAll();
    	if (item=="combineAll")
		app.scopeManager.combineAll();
    	if (item=="separateAll")
		app.scopeManager.separateAll();
    	if (item=="zoomin")
    	    app.mouse.zoomCircuit(20, true);
    	if (item=="zoomout")
    	    app.mouse.zoomCircuit(-20, true);
    	if (item=="zoom100")
    	    app.mouse.setCircuitScale(1, true);
    	if (menu=="elm" && item=="edit")
    		doEdit(app.mouse.menuElm);
    	if (item=="delete") {
    		if (menu!="elm")
    			app.mouse.menuElm = null;
    		app.undoManager.pushUndo();
    		doDelete(true);
    	}
    	if (item=="sliders")
    	    doSliders(app.mouse.menuElm);

    	if (item=="viewInScope" && app.mouse.menuElm != null) {
    		int i;
    		for (i = 0; i != app.scopeManager.scopeCount; i++)
    			if (app.scopeManager.scopes[i].getElm() == null)
    				break;
    		if (i == app.scopeManager.scopeCount) {
    			if (app.scopeManager.scopeCount == app.scopeManager.scopes.length)
    				return;
    			app.scopeManager.scopeCount++;
    			app.scopeManager.scopes[i] = new Scope(app, app.sim);
    			app.scopeManager.scopes[i].position = i;
    		}
    		app.scopeManager.scopes[i].setElm(app.mouse.menuElm);
    		if (i > 0)
    		    app.scopeManager.scopes[i].speed = app.scopeManager.scopes[i-1].speed;
    	}

    	if (item=="viewInFloatScope" && app.mouse.menuElm != null) {
    	    ScopeElm newScope = new ScopeElm(app.snapGrid(app.mouse.menuElm.x+50), app.snapGrid(app.mouse.menuElm.y+50));
    	    app.elmList.addElement(newScope);
    	    newScope.setScopeElm(app.mouse.menuElm);

    	    // need to rebuild scopeElmArr
    	    app.needAnalyze();
	}

    	if (item.startsWith("addToScope") && app.mouse.menuElm != null) {
    	    int n;
    	    n = Integer.parseInt(item.substring(10));
    	    if (n < app.scopeManager.scopeCount + app.scopeManager.countScopeElms()) {
    		if (n < app.scopeManager.scopeCount )
    		    app.scopeManager.scopes[n].addElm(app.mouse.menuElm);
    		else
    		    app.scopeManager.getNthScopeElm(n-app.scopeManager.scopeCount).elmScope.addElm(app.mouse.menuElm);
    	    }
    	    app.scopeManager.scopeMenuSelected = -1;
    	}

    	if (menu=="scopepop") {
    		app.undoManager.pushUndo();
    		Scope s;
		if (app.scopeManager.menuScope != -1 )
		    	s= app.scopeManager.scopes[app.scopeManager.menuScope];
		else
		    	s= ((ScopeElm)app.mouse.getMouseElm()).elmScope;

    		if (item=="dock") {
            		if (app.scopeManager.scopeCount == app.scopeManager.scopes.length)
            			return;
            		app.scopeManager.scopes[app.scopeManager.scopeCount] = ((ScopeElm)app.mouse.getMouseElm()).elmScope;
            		((ScopeElm)app.mouse.getMouseElm()).clearElmScope();
            		app.scopeManager.scopes[app.scopeManager.scopeCount].position = app.scopeManager.scopeCount;
            		app.scopeManager.scopeCount++;
            		doDelete(false);
    		}
    		if (item=="undock") {
		    CircuitElm elm = s.getElm();
    	    	    ScopeElm newScope = new ScopeElm(app.snapGrid(elm.x+50), app.snapGrid(elm.y+50));
    	    	    app.elmList.addElement(newScope);
    	    	    newScope.setElmScope(app.scopeManager.scopes[app.scopeManager.menuScope]);

    	    	    int i;
    	    	    // remove scope from list.  setupScopes() will fix the positions
    	    	    for (i = app.scopeManager.menuScope; i < app.scopeManager.scopeCount; i++)
    	    		app.scopeManager.scopes[i] = app.scopeManager.scopes[i+1];
    	    	    app.scopeManager.scopeCount--;

    	            app.needAnalyze();      // need to rebuild scopeElmArr
    		}
    		if (item=="remove")
    		    	s.setElm(null);  // setupScopes() will clean this up
    		if (item=="removeplot")
			s.removePlot(app.scopeManager.menuPlot);
    		if (item=="speed2")
    			s.speedUp();
    		if (item=="speed1/2")
    			s.slowDown();
    		if (item=="maxscale")
    			s.maxScale();
    		if (item=="stack")
    			app.scopeManager.stackScope(app.scopeManager.menuScope);
    		if (item=="unstack")
    			app.scopeManager.unstackScope(app.scopeManager.menuScope);
    		if (item=="combine")
			app.scopeManager.combineScope(app.scopeManager.menuScope);
    		if (item=="selecty")
    			s.selectY();
    		if (item=="reset")
    			s.resetGraph(true);
    		if (item=="exportcsv")
    			s.exportCSV();
    		if (item=="properties")
			s.properties();
    		app.scopeManager.deleteUnusedScopeElms();
    	}
    	if (menu=="circuits" && item.indexOf("setup ") ==0) {
    		app.undoManager.pushUndo();
    		int sp = item.indexOf(' ', 6);
    		app.menus.readSetupFile(item.substring(6, sp), item.substring(sp+1));
    	}
    	if (item=="newblankcircuit") {
    	    app.undoManager.pushUndo();
    	    app.menus.readSetupFile("blank.txt", "Blank Circuit");
    	}

    	// IES: Moved from itemStateChanged()
    	if (menu=="main") {
    		if (contextPanel != null)
    			contextPanel.hide();
    		app.setMouseMode(MouseManager.MODE_ADD_ELM);
    		String s = item;
    		if (s.length() > 0)
    			app.ui.mouseModeStr = s;
    		if (s.compareTo("DragAll") == 0)
    			app.setMouseMode(MouseManager.MODE_DRAG_ALL);
    		else if (s.compareTo("DragRow") == 0)
    			app.setMouseMode(MouseManager.MODE_DRAG_ROW);
    		else if (s.compareTo("DragColumn") == 0)
    			app.setMouseMode(MouseManager.MODE_DRAG_COLUMN);
    		else if (s.compareTo("DragSelected") == 0)
    			app.setMouseMode(MouseManager.MODE_DRAG_SELECTED);
    		else if (s.compareTo("DragPost") == 0)
    			app.setMouseMode(MouseManager.MODE_DRAG_POST);
    		else if (s.compareTo("Select") == 0)
    			app.setMouseMode(MouseManager.MODE_SELECT);

		app.updateToolbar();

    		app.mouse.tempMouseMode = app.mouse.mouseMode;
    	}
    	if (item=="fullscreen") {
    	    if (! Graphics.isFullScreen)
    		Graphics.viewFullScreen();
    	    else
    		Graphics.exitFullScreen();
    	    app.centerCircuit();
    	}

	app.repaint();
    }

    void doEdit(Editable eable) {
    	app.mouse.clearSelection();
    	app.undoManager.pushUndo();
    	if (app.editDialog != null) {
    		app.editDialog.setVisible(false);
    		app.editDialog = null;
    	}
    	app.editDialog = new EditDialog(eable, app);
    	app.editDialog.show();
    }

    void doSliders(CircuitElm ce) {
	app.mouse.clearSelection();
	app.undoManager.pushUndo();
	app.dialogShowing = new SliderDialog(ce, app);
	app.dialogShowing.show();
    }

    void doExportAsUrl() {
    	String dump = app.dumpCircuit();
	app.dialogShowing = new ExportAsUrlDialog(dump);
	app.dialogShowing.show();
    }

    void doExportAsText() {
    	String dump = app.dumpCircuit();
    	app.dialogShowing = new ExportAsTextDialog(app, dump);
    	app.dialogShowing.show();
    }

    void doCreateSubcircuit() {
    	EditCompositeModelDialog dlg = new EditCompositeModelDialog();
    	if (!dlg.createModel())
    	    return;
    	dlg.createDialog();
    	app.dialogShowing = dlg;
    	app.dialogShowing.show();
    }

    void doExportAsLocalFile() {
    	String dump = app.dumpCircuit();
    	app.dialogShowing = new ExportAsLocalFileDialog(dump);
    	app.dialogShowing.show();
    }

    void doDCAnalysis() {
	app.dcAnalysisFlag = true;
	app.resetAction();
    }

    void setMenuSelection() {
    	if (app.mouse.menuElm != null) {
    		if (app.mouse.menuElm.selected)
    			return;
    		app.mouse.clearSelection();
    		app.mouse.menuElm.setSelected(true);
    	}
    }

    int countSelected() {
	int count = 0;
	for (CircuitElm ce: app.elmList)
	    if (ce.isSelected())
		count++;
	return count;
    }

    class FlipInfo { public int cx, cy, count; }

    FlipInfo prepareFlip() {
    	int i;
    	app.undoManager.pushUndo();
    	setMenuSelection();
    	int minx = 30000, maxx = -30000;
    	int miny = 30000, maxy = -30000;
	int count = countSelected();
    	for (CircuitElm ce : app.elmList) {
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
	for (CircuitElm ce : app.elmList) {
	    if (ce.isSelected() || fi.count == 0)
		ce.flipX(center2, fi.count);
    	}
	app.needAnalyze();
    }

    void flipY() {
	FlipInfo fi = prepareFlip();
	int center2 = fi.cy*2;
	for (CircuitElm ce : app.elmList) {
	    if (ce.isSelected() || fi.count == 0)
		ce.flipY(center2, fi.count);
    	}
	app.needAnalyze();
    }

    void flipXY() {
	FlipInfo fi = prepareFlip();
	int xmy = app.snapGrid(fi.cx-fi.cy);
	app.console("xmy " + xmy + " grid " + app.gridSize + " " + fi.cx + " " + fi.cy);
	for (CircuitElm ce : app.elmList) {
	    if (ce.isSelected() || fi.count == 0)
		ce.flipXY(xmy, fi.count);
    	}
	app.needAnalyze();
    }

    void doCut() {
    	app.undoManager.pushUndo();
    	setMenuSelection();
    	clipboard = copyOfSelectedElms();
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
    	if (pushUndoFlag)
    	    app.undoManager.pushUndo();
    	boolean hasDeleted = false;

    	for (int i = app.elmList.size()-1; i >= 0; i--) {
    		CircuitElm ce = app.elmList.get(i);
    		if (willDelete(ce)) {
    		    	if (ce.isMouseElm())
    		    	    app.mouse.setMouseElm(null);
    			ce.delete();
    			app.elmList.removeElementAt(i);
    			hasDeleted = true;
    		}
    	}
    	if ( hasDeleted ) {
    	    app.scopeManager.deleteUnusedScopeElms();
    	    app.needAnalyze();
    	    app.undoManager.writeRecoveryToStorage();
    	}
    }

    boolean willDelete( CircuitElm ce ) {
	return ce.isSelected() || ce.isMouseElm();
    }

    String copyOfSelectedElms() {
	com.google.gwt.xml.client.Document doc = XMLParser.createDocument();
	com.google.gwt.xml.client.Element root = doc.createElement("cir");
	doc.appendChild(root);

	CustomLogicModel.clearDumpedFlags();
	CustomCompositeModel.clearDumpedFlags();
	DiodeModel.clearDumpedFlags();
	TransistorModel.clearDumpedFlags();
	MosfetModel.clearDumpedFlags();
	for (int i = app.elmList.size()-1; i >= 0; i--) {
	    CircuitElm ce = app.elmList.get(i);
	    ce.dumpXmlModel(doc);
	    if (ce.isSelected() && !(ce instanceof ScopeElm)) {
		com.google.gwt.xml.client.Element elem = doc.createElement(ce.getXmlDumpType());
		ce.dumpXml(doc, elem);
		ce.dumpXmlState(doc, elem);
		root.appendChild(elem);
	    }
	}
	return doc.toString();
    }

    void doCopy() {
    	boolean clearSel = (app.mouse.menuElm != null && !app.mouse.menuElm.selected);

    	setMenuSelection();
    	clipboard=copyOfSelectedElms();

    	if (clearSel)
    	    app.mouse.clearSelection();

    	writeClipboardToStorage();
    	enablePaste();
    }

    void enablePaste() {
    	if (clipboard == null || clipboard.length() == 0)
    		readClipboardFromStorage();
    	app.menus.pasteItem.setEnabled(clipboard != null && clipboard.length() > 0);
    }

    void doDuplicate() {
    	String s;
    	setMenuSelection();
    	s=copyOfSelectedElms();
    	doPaste(s);
    }

    void doPaste(String dump) {
    	app.undoManager.pushUndo();
    	app.mouse.clearSelection();
    	int i;
    	Rectangle oldbb = null;

    	// get old bounding box
    	for (CircuitElm ce : app.elmList) {
    		Rectangle bb = ce.getBoundingBox();
    		if (oldbb != null)
    			oldbb = oldbb.union(bb);
    		else
    			oldbb = bb;
    	}

    	// add new items
    	int oldsz = app.elmList.size();
    	int flags = CircuitLoader.RC_RETAIN;

    	// don't recenter circuit if we're going to paste in place because that will change the transform

    	// in fact, don't ever recenter circuit, unless old circuit was empty
    	if (oldsz > 0)
    	    flags |= CircuitLoader.RC_NO_CENTER;

    	if (dump != null)
    	    app.loader.readCircuit(dump, flags);
    	else {
    	    readClipboardFromStorage();
    	    app.loader.readCircuit(clipboard, flags);
    	}

    	// select new items and get their bounding box
    	Rectangle newbb = null;
    	for (i = oldsz; i != app.elmList.size(); i++) {
    		CircuitElm ce = app.elmList.get(i);
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
    		int spacew = app.circuitArea.width - oldbb.width - newbb.width;
    		int spaceh = app.circuitArea.height - oldbb.height - newbb.height;

    		if (!oldbb.intersects(newbb)) {
    		    // old coordinates may be really far away so move them to same origin as current circuit
    		    dx = app.snapGrid(oldbb.x - newbb.x);
    		    dy = app.snapGrid(oldbb.y - newbb.y);
    		}

    		if (spacew > spaceh) {
    			dx = app.snapGrid(oldbb.x + oldbb.width  - newbb.x + app.gridSize);
    		} else {
    			dy = app.snapGrid(oldbb.y + oldbb.height - newbb.y + app.gridSize);
    		}

    		// move new items near the mouse if possible
    		if (app.mouse.mouseCursorX > 0 && app.circuitArea.contains(app.mouse.mouseCursorX, app.mouse.mouseCursorY)) {
    	    	    int gx = app.mouse.inverseTransformX(app.mouse.mouseCursorX);
    	    	    int gy = app.mouse.inverseTransformY(app.mouse.mouseCursorY);
    	    	    int mdx = app.snapGrid(gx-(newbb.x+newbb.width/2));
    	    	    int mdy = app.snapGrid(gy-(newbb.y+newbb.height/2));
    	    	    for (i = oldsz; i != app.elmList.size(); i++) {
    	    		if (!app.elmList.get(i).allowMove(mdx, mdy))
    	    		    break;
    	    	    }
    	    	    if (i == app.elmList.size()) {
    	    		dx = mdx;
    	    		dy = mdy;
    	    	    }
    		}

    		// move the new items
    		for (i = oldsz; i != app.elmList.size(); i++) {
    			CircuitElm ce = app.elmList.get(i);
    			ce.move(dx, dy);
    		}

    	}
    	app.needAnalyze();
    	app.undoManager.writeRecoveryToStorage();
    }
    
    static void electronSaveAsCallback(String s) {
	s = s.substring(s.lastIndexOf('/')+1);
	s = s.substring(s.lastIndexOf('\\')+1);
	CirSim app = CirSim.theApp;
	app.setCircuitTitle(s);
	app.allowSave(true);
	app.savedFlag = true;
	app.repaint();
    }

    static void electronSaveCallback() {
	CirSim app = CirSim.theApp;
	app.savedFlag = true;
	app.repaint();
    }
        
    static native void electronSaveAs(String dump) /*-{
        $wnd.showSaveDialog().then(function (file) {
            if (file.canceled)
            	return;
            $wnd.saveFile(file, dump);
            @com.lushprojects.circuitjs1.client.CommandManager::electronSaveAsCallback(Ljava/lang/String;)(file.filePath.toString());
        });
    }-*/;

    static native void electronSave(String dump) /*-{
        $wnd.saveFile(null, dump);
        @com.lushprojects.circuitjs1.client.CommandManager::electronSaveCallback()();
    }-*/;
    
    static void electronOpenFileCallback(String text, String name) {
	CirSim app = CirSim.theApp;
	LoadFile.doLoadCallback(text, name);
	app.allowSave(true);
    }
    
    static native void electronOpenFile() /*-{
        $wnd.openFile(function (text, name) {
            @com.lushprojects.circuitjs1.client.CommandManager::electronOpenFileCallback(Ljava/lang/String;Ljava/lang/String;)(text, name);
        });
    }-*/;
    
    static native void toggleDevTools() /*-{
        $wnd.toggleDevTools();
    }-*/;
    

}
