package com.lushprojects.circuitjs1.client;

import java.util.Vector;
import java.lang.Math;

import com.google.gwt.canvas.dom.client.Context2d.LineCap;
import com.google.gwt.user.client.Event;
import com.google.gwt.user.client.Event.NativePreviewEvent;
import com.google.gwt.core.client.GWT;
import com.google.gwt.core.client.Scheduler;
import com.google.gwt.dom.client.Document;
import com.google.gwt.http.client.URL;
import com.google.gwt.storage.client.Storage;
import com.google.gwt.user.client.ui.Frame;
import com.google.gwt.user.client.ui.RootLayoutPanel;
import com.google.gwt.user.client.ui.Widget;
import com.lushprojects.circuitjs1.client.util.Locale;
import com.lushprojects.circuitjs1.client.util.PerfMonitor;
import static com.google.gwt.event.dom.client.KeyCodes.*;

public class UIManager {

    CirSim app;
    Menus menus;

    // timing/frame fields
    long lastTime = 0, lastFrameTime, secTime = 0;
    int frames = 0;
    int steps = 0;
    int framerate = 0, steprate = 0;
    boolean needsRepaint;
    String lastCursorStyle;

    UIManager(CirSim app) {
	this.app = app;
    }

    // ---- Canvas/Layout ----

    void checkCanvasSize() {
        if (app.cv.getCoordinateSpaceWidth() != (int) (app.canvasWidth * CirSim.devicePixelRatio()))
            setCanvasSize();
    }

    public void setCanvasSize(){
    	int width, height;
    	width=(int)RootLayoutPanel.get().getOffsetWidth();
    	height=(int)RootLayoutPanel.get().getOffsetHeight();
    	height=height-(app.hideMenu?0:CirSim.MENUBARHEIGHT);

    	if (!app.isMobile(app.sidePanelCheckboxLabel))
    	    width=width-CirSim.VERTICALPANELWIDTH;
	if (menus.toolbarCheckItem.getState())
	    height -= CirSim.TOOLBARHEIGHT;

    	width = Math.max(width, 0);
    	height = Math.max(height, 0);

	if (app.cv != null) {
	    app.cv.setWidth(width + "PX");
	    app.cv.setHeight(height + "PX");
	    app.canvasWidth = width;
	    app.canvasHeight = height;
	    float scale = CirSim.devicePixelRatio();
	    app.cv.setCoordinateSpaceWidth((int)(width*scale));
	    app.cv.setCoordinateSpaceHeight((int)(height*scale));
	}

    	setCircuitArea();

	if (app.transform[0] == 0)
	    centreCircuit();
    }

    void setCircuitArea() {
    	int height = app.canvasHeight;
    	int width = app.canvasWidth;
	int h;
    	if (app.scopeManager == null || app.scopeManager.scopeCount == 0)
    	    h = 0;
	else
    	    h = (int) ((double)height * app.scopeManager.scopeHeightFraction);
    	app.circuitArea = new Rectangle(0, 0, width, height-h);
    }

    void centreCircuit() {
	if (app.elmList == null)
	    return;

	Rectangle bounds = getCircuitBounds();
    	setCircuitArea();

    	double scale = 1;
    	int cheight = app.circuitArea.height;

    	if (app.scopeManager.scopeCount == 0 && app.circuitArea.width < 800) {
    	    int h = (int) ((double)cheight * app.scopeManager.scopeHeightFraction);
    	    cheight -= h;
    	}

    	if (bounds != null)
    	    scale = Math.min(app.circuitArea.width /(double)(bounds.width+140),
    			     cheight/(double)(bounds.height+100));
    	scale = Math.min(scale, 1.5);

    	app.transform[0] = app.transform[3] = scale;
    	app.transform[1] = app.transform[2] = app.transform[4] = app.transform[5] = 0;
    	if (bounds != null) {
    	    app.transform[4] = (app.circuitArea.width -bounds.width *scale)/2 - bounds.x*scale;
    	    app.transform[5] = (cheight-bounds.height*scale)/2 - bounds.y*scale;
    	}
    }

    Rectangle getCircuitBounds() {
    	int minx = 30000, maxx = -30000, miny = 30000, maxy = -30000;
    	for (CircuitElm ce : app.elmList) {
    		if (!ce.isCenteredText()) {
    			minx = min(ce.x, min(ce.x2, minx));
    			maxx = max(ce.x, max(ce.x2, maxx));
    		}
    		miny = min(ce.y, min(ce.y2, miny));
    		maxy = max(ce.y, max(ce.y2, maxy));
    	}
    	if (minx > maxx)
    	    return null;
    	return new Rectangle(minx, miny, maxx-minx, maxy-miny);
    }

    // ---- Repaint ----

    void repaint() {
	if (!needsRepaint) {
	    needsRepaint = true;
	    Scheduler.get().scheduleFixedDelay(new Scheduler.RepeatingCommand() {
		public boolean execute() {
		      updateCircuit();
		      needsRepaint = false;
		      return false;
		  }
	    }, app.FASTTIMER);
	}
    }

    // ---- Sim Running ----

    public void setSimRunning(boolean s) {
    	if (s) {
    	    	if (app.stopMessage != null)
    	    	    return;
    		app.simRunning = true;
    		app.runStopButton.setHTML(Locale.LSHTML("<strong>RUN</strong>&nbsp;/&nbsp;Stop"));
    		app.runStopButton.setStylePrimaryName("topButton");
    		app.timer.scheduleRepeating(app.FASTTIMER);
    	} else {
    		app.simRunning = false;
    		app.runStopButton.setHTML(Locale.LSHTML("Run&nbsp;/&nbsp;<strong>STOP</strong>"));
    		app.runStopButton.setStylePrimaryName("topButton-red");
    		app.timer.cancel();
		repaint();
    	}
    }

    public boolean simIsRunning() {
    	return app.simRunning;
    }

    // ---- Drawing/Display ----

    public void updateCircuit() {
        PerfMonitor perfmon = new PerfMonitor();
        perfmon.startContext("updateCircuit()");

        checkCanvasSize();

        boolean didAnalyze = app.analyzeFlag;
        if (app.analyzeFlag || app.dcAnalysisFlag) {
            perfmon.startContext("analyzeCircuit()");
            app.sim.analyzeCircuit();
            app.analyzeFlag = false;
            perfmon.stopContext();
        }

        if (app.sim.needsStamp && app.simRunning) {
            perfmon.startContext("stampCircuit()");
            try {
                app.sim.preStampAndStampCircuit();
            } catch (Exception e) {
                app.sim.stop("Exception in stampCircuit()", null);
		GWT.log("Exception in stampCircuit", e);
            }
            perfmon.stopContext();
        }

        if (app.stopElm != null && app.stopElm != app.mouse.getMouseElm())
            app.stopElm.setMouseElm(true);

        app.scopeManager.setupScopes();

        Graphics g = new Graphics(app.cvcontext);

        if (menus.printableCheckItem.getState()) {
            CircuitElm.whiteColor = Color.black;
            CircuitElm.lightGrayColor = Color.black;
            g.setColor(Color.white);
            app.cv.getElement().getStyle().setBackgroundColor("#fff");
        } else {
            CircuitElm.whiteColor = Color.white;
            CircuitElm.lightGrayColor = Color.lightGray;
            g.setColor(Color.black);
            app.cv.getElement().getStyle().setBackgroundColor("#000");
        }

        g.fillRect(0, 0, app.canvasWidth, app.canvasHeight);

        if (app.simRunning) {
            if (app.sim.needsStamp)
                CirSim.console("needsStamp while simRunning?");

            perfmon.startContext("runCircuit()");
            try {
                app.sim.runCircuit(didAnalyze);
            } catch (Exception e) {
                CirSim.debugger();
                CirSim.console("exception in runCircuit " + e);
                e.printStackTrace();
            }
            perfmon.stopContext();
        }

        long sysTime = System.currentTimeMillis();
        if (app.simRunning) {
            if (lastTime != 0) {
                int inc = (int) (sysTime - lastTime);
                double c = app.currentBar.getValue();
                c = java.lang.Math.exp(c / 3.5 - 14.2);
                CircuitElm.currentMult = 1.7 * inc * c;
                if (!menus.conventionCheckItem.getState())
                    CircuitElm.currentMult = -CircuitElm.currentMult;
            }
            lastTime = sysTime;
        } else {
            lastTime = 0;
        }

        if (sysTime - secTime >= 1000) {
            framerate = frames;
            steprate = steps;
            frames = 0;
            steps = 0;
            secTime = sysTime;
        }

        CircuitElm.powerMult = Math.exp(app.powerBar.getValue() / 4.762 - 7);

        perfmon.startContext("graphics");

        g.setFont(CircuitElm.unitsFont);

        g.context.setLineCap(LineCap.ROUND);

        if (menus.noEditCheckItem.getState())
            g.drawLock(20, 30);

        g.setColor(Color.white);

        double scale = CirSim.devicePixelRatio();
        app.cvcontext.setTransform(app.transform[0] * scale, 0, 0, app.transform[3] * scale, app.transform[4] * scale, app.transform[5] * scale);

        perfmon.startContext("elm.draw()");
        for (CircuitElm ce : app.elmList) {
            if (menus.powerCheckItem.getState())
                g.setColor(Color.gray);

            ce.draw(g);
        }
        perfmon.stopContext();

        if (app.mouse.mouseMode != MouseManager.MODE_DRAG_ROW && app.mouse.mouseMode != MouseManager.MODE_DRAG_COLUMN) {
            for (int i = 0; i != app.postDrawList.size(); i++)
                CircuitElm.drawPost(g, app.postDrawList.get(i));
        }

        if (app.mouse.tempMouseMode == MouseManager.MODE_DRAG_ROW ||
            app.mouse.tempMouseMode == MouseManager.MODE_DRAG_COLUMN ||
            app.mouse.tempMouseMode == MouseManager.MODE_DRAG_POST ||
            app.mouse.tempMouseMode == MouseManager.MODE_DRAG_SELECTED) {
            for (CircuitElm ce : app.elmList) {
                if (ce != app.mouse.getMouseElm() || app.mouse.tempMouseMode != MouseManager.MODE_DRAG_POST) {
                    g.setColor(Color.gray);
                    g.fillOval(ce.x - 3, ce.y - 3, 7, 7);
                    g.fillOval(ce.x2 - 3, ce.y2 - 3, 7, 7);
                } else {
                    ce.drawHandles(g, CircuitElm.selectColor);
                }
            }
        }

        if (app.mouse.tempMouseMode == MouseManager.MODE_SELECT && app.mouse.getMouseElm() != null) {
            app.mouse.getMouseElm().drawHandles(g, CircuitElm.selectColor);
        }

        if (app.mouse.dragElm != null && (app.mouse.dragElm.x != app.mouse.dragElm.x2 || app.mouse.dragElm.y != app.mouse.dragElm.y2)) {
            app.mouse.dragElm.draw(g);
            app.mouse.dragElm.drawHandles(g, CircuitElm.selectColor);
        }

        for (int i = 0; i != app.badConnectionList.size(); i++) {
            Point cn = app.badConnectionList.get(i);
            g.setColor(Color.red);
            g.fillOval(cn.x - 3, cn.y - 3, 7, 7);
        }

        if (app.mouse.selectedArea != null) {
            g.setColor(CircuitElm.selectColor);
            g.drawRect(app.mouse.selectedArea.x, app.mouse.selectedArea.y, app.mouse.selectedArea.width, app.mouse.selectedArea.height);
        }

        if (menus.crossHairCheckItem.getState() && app.mouse.mouseCursorX >= 0
                && app.mouse.mouseCursorX <= app.circuitArea.width && app.mouse.mouseCursorY <= app.circuitArea.height) {
            g.setColor(Color.gray);
            int x = app.snapGrid(app.mouse.inverseTransformX(app.mouse.mouseCursorX));
            int y = app.snapGrid(app.mouse.inverseTransformY(app.mouse.mouseCursorY));
            g.drawLine(x, app.mouse.inverseTransformY(0), x, app.mouse.inverseTransformY(app.circuitArea.height));
            g.drawLine(app.mouse.inverseTransformX(0), y, app.mouse.inverseTransformX(app.circuitArea.width), y);
        }

        app.cvcontext.setTransform(scale, 0, 0, scale, 0, 0);

        perfmon.startContext("drawBottomArea()");
        drawBottomArea(g);
        perfmon.stopContext();

        g.setColor(Color.white);

        perfmon.stopContext(); // graphics

        if (app.stopElm != null && app.stopElm != app.mouse.getMouseElm())
            app.stopElm.setMouseElm(false);

        frames++;

        if (app.dcAnalysisFlag) {
            app.dcAnalysisFlag = false;
            app.analyzeFlag = true;
        }

        lastFrameTime = lastTime;

        perfmon.stopContext(); // updateCircuit

        if (app.developerMode) {
            int height = 15;
            int increment = 15;
            g.drawString("Framerate: " + CircuitElm.showFormat.format(framerate), 10, height);
            g.drawString("Steprate: " + CircuitElm.showFormat.format(steprate), 10, height += increment);
            g.drawString("Steprate/iter: " + CircuitElm.showFormat.format(steprate / app.getIterCount()), 10, height += increment);
            g.drawString("iterc: " + CircuitElm.showFormat.format(app.getIterCount()), 10, height += increment);
            g.drawString("Frames: " + frames, 10, height += increment);

            height += (increment * 2);

            String perfmonResult = PerfMonitor.buildString(perfmon).toString();
            String[] splits = perfmonResult.split("\n");
            for (int x = 0; x < splits.length; x++) {
                g.drawString(splits[x], 10, height + (increment * x));
            }
        }

        app.jsInterface.callUpdateHook();
    }

    void drawBottomArea(Graphics g) {
	int leftX = 0;
	int h = 0;
	if (app.stopMessage == null && app.scopeManager.scopeCount == 0) {
	    leftX = max(app.canvasWidth-CirSim.infoWidth, 0);
	    int h0 = (int) (app.canvasHeight * app.scopeManager.scopeHeightFraction);
	    h = (app.mouse.getMouseElm() == null) ? 70 : h0;
	    if (app.hideInfoBox)
		h = 0;
	}
	if (app.stopMessage != null && app.circuitArea.height > app.canvasHeight-30)
	    h = 30;
	g.setColor(menus.printableCheckItem.getState() ? "#eee" : "#111");
	g.fillRect(leftX, app.circuitArea.height-h, app.circuitArea.width, app.canvasHeight-app.circuitArea.height+h);
	g.setFont(CircuitElm.unitsFont);
	int ct = app.scopeManager.scopeCount;
	if (app.stopMessage != null)
	    ct = 0;
	int i;
	Scope.clearCursorInfo();
	for (i = 0; i != ct; i++)
	    app.scopeManager.scopes[i].selectScope(app.mouse.mouseCursorX, app.mouse.mouseCursorY);
	if (app.scopeElmArr != null)
	    for (i=0; i != app.scopeElmArr.length; i++)
		app.scopeElmArr[i].selectScope(app.mouse.mouseCursorX, app.mouse.mouseCursorY);
	for (i = 0; i != ct; i++)
	    app.scopeManager.scopes[i].draw(g);
	if (app.mouse.mouseWasOverSplitter) {
		g.setColor(CircuitElm.selectColor);
		g.setLineWidth(4.0);
		g.drawLine(0, app.circuitArea.height-2, app.circuitArea.width, app.circuitArea.height-2);
		g.setLineWidth(1.0);
	}
	g.setColor(CircuitElm.whiteColor);

	if (app.stopMessage != null) {
	    g.drawString(app.stopMessage, 10, app.canvasHeight-10);
	} else if (!app.hideInfoBox) {
	    String info[] = new String[10];
	    if (app.mouse.getMouseElm() != null) {
		if (app.mouse.mousePost == -1) {
		    app.mouse.getMouseElm().getInfo(info);
		    info[0] = Locale.LS(info[0]);
		    if (info[1] != null)
			info[1] = Locale.LS(info[1]);
		} else
		    info[0] = "V = " +
			CircuitElm.getUnitText(app.mouse.getMouseElm().getPostVoltage(app.mouse.mousePost), "V");

	    } else {
	    	info[0] = "t = " + CircuitElm.getTimeText(app.sim.t);
	    	double timerate = 160*app.getIterCount()*app.sim.timeStep;
	    	if (timerate >= .1)
	    	    info[0] += " (" + CircuitElm.showFormat.format(timerate) + "x)";
	    	info[1] = Locale.LS("time step = ") + CircuitElm.getTimeText(app.sim.timeStep);
	    }
	    if (app.hintType != -1) {
		for (i = 0; info[i] != null; i++)
		    ;
		String s = getHint();
		if (s == null)
		    app.hintType = -1;
		else
		    info[i] = s;
	    }
	    int x = leftX + 5;
	    if (ct != 0)
		x = app.scopeManager.scopes[ct-1].rightEdge() + 20;

	    for (i = 0; info[i] != null; i++)
		;
	    int badnodes = app.badConnectionList.size();
	    if (badnodes > 0)
		info[i++] = badnodes + ((badnodes == 1) ?
					Locale.LS(" bad connection") : Locale.LS(" bad connections"));
	    if (app.savedFlag)
		info[i++] = "(saved)";

	    int ybase = app.circuitArea.height-h;
	    for (i = 0; info[i] != null; i++)
		g.drawString(info[i], x, ybase+15*(i+1));
	}
    }

    Color getBackgroundColor() {
	if (menus.printableCheckItem.getState())
	    return Color.white;
	return Color.black;
    }

    String getHint() {
	CircuitElm c1 = app.getElm(app.hintItem1);
	CircuitElm c2 = app.getElm(app.hintItem2);
	if (c1 == null || c2 == null)
	    return null;
	if (app.hintType == CirSim.HINT_LC) {
	    if (!(c1 instanceof InductorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    InductorElm ie = (InductorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("res.f = ") + CircuitElm.getUnitText(1/(2*CirSim.pi*Math.sqrt(ie.inductance*
						    ce.capacitance)), "Hz");
	}
	if (app.hintType == CirSim.HINT_RC) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return "RC = " + CircuitElm.getUnitText(re.resistance*ce.capacitance,
					 "s");
	}
	if (app.hintType == CirSim.HINT_3DB_C) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("f.3db = ") +
		CircuitElm.getUnitText(1/(2*CirSim.pi*re.resistance*ce.capacitance), "Hz");
	}
	if (app.hintType == CirSim.HINT_3DB_L) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof InductorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    InductorElm ie = (InductorElm) c2;
	    return Locale.LS("f.3db = ") +
		CircuitElm.getUnitText(re.resistance/(2*CirSim.pi*ie.inductance), "Hz");
	}
	if (app.hintType == CirSim.HINT_TWINT) {
	    if (!(c1 instanceof ResistorElm))
		return null;
	    if (!(c2 instanceof CapacitorElm))
		return null;
	    ResistorElm re = (ResistorElm) c1;
	    CapacitorElm ce = (CapacitorElm) c2;
	    return Locale.LS("fc = ") +
		CircuitElm.getUnitText(1/(2*CirSim.pi*re.resistance*ce.capacitance), "Hz");
	}
	return null;
    }

    // ---- UI Controls ----

    void setPowerBarEnable() {
    	if (menus.powerCheckItem.getState()) {
    	    app.powerLabel.setStyleName("disabled", false);
    	    app.powerBar.enable();
    	} else {
    	    app.powerLabel.setStyleName("disabled", true);
    	    app.powerBar.disable();
    	}
    }

    void enableItems() {
    }

    void setToolbar() {
	app.layoutPanel.setWidgetHidden(app.toolbar, !menus.toolbarCheckItem.getState());
	setCanvasSize();
    }

    void updateToolbar() {
	if (app.mouse.dragElm != null)
	    app.toolbar.setModeLabel(Locale.LS("Drag Mouse"));
	else
	    app.toolbar.setModeLabel(Locale.LS("Mode: ") + app.classToLabelMap.get(app.mouseModeStr));
	app.toolbar.highlightButton(app.mouseModeStr);
    }

    void setMouseMode(int mode) {
    	app.mouse.mouseMode = mode;
    	if ( mode == MouseManager.MODE_ADD_ELM ) {
    		setCursorStyle("cursorCross");
    	} else {
    		setCursorStyle("cursorPointer");
    	}
    }

    void setCursorStyle(String s) {
    	if (lastCursorStyle!=null)
    		app.cv.removeStyleName(lastCursorStyle);
    	app.cv.addStyleName(s);
    	lastCursorStyle=s;
    }

    void setGrid() {
	app.gridSize = (menus.smallGridCheckItem.getState()) ? 8 : 16;
	app.gridMask = ~(app.gridSize-1);
	app.gridRound = app.gridSize/2-1;
    }

    // ---- Dialogs ----

    boolean dialogIsShowing() {
    	if (CirSim.editDialog!=null && CirSim.editDialog.isShowing())
    		return true;
        if (CirSim.customLogicEditDialog!=null && CirSim.customLogicEditDialog.isShowing())
                return true;
        if (CirSim.diodeModelEditDialog!=null && CirSim.diodeModelEditDialog.isShowing())
                return true;
       	if (CirSim.dialogShowing != null && CirSim.dialogShowing.isShowing())
       		return true;
    	if (app.contextPanel!=null && app.contextPanel.isShowing())
    		return true;
    	if (CirSim.scrollValuePopup != null && CirSim.scrollValuePopup.isShowing())
    		return true;
    	if (CirSim.aboutBox !=null && CirSim.aboutBox.isShowing())
    		return true;
    	return false;
    }

    // ---- Keyboard ----

    public void onPreviewNativeEvent(NativePreviewEvent e) {
    	int cc=e.getNativeEvent().getCharCode();
    	int t=e.getTypeInt();
    	int code=e.getNativeEvent().getKeyCode();
    	if (dialogIsShowing()) {
    		if (CirSim.scrollValuePopup != null && CirSim.scrollValuePopup.isShowing() &&
    				(t & Event.ONKEYDOWN)!=0) {
    			if (code==KEY_ESCAPE || code==KEY_SPACE)
    				CirSim.scrollValuePopup.close(false);
    			if (code==KEY_ENTER)
    				CirSim.scrollValuePopup.close(true);
    		}

    		Dialog dlg = CirSim.editDialog;
    		if (CirSim.diodeModelEditDialog != null)
    		    dlg = CirSim.diodeModelEditDialog;
    		if (CirSim.customLogicEditDialog != null)
    		    dlg = CirSim.customLogicEditDialog;
    		if (CirSim.dialogShowing != null)
    		    dlg = CirSim.dialogShowing;
    		if (dlg!=null && dlg.isShowing() &&
    				(t & Event.ONKEYDOWN)!=0) {
    			if (code==KEY_ESCAPE)
    			    dlg.closeDialog();
    			if (code==KEY_ENTER)
    			    dlg.enterPressed();
    		}
    		return;
    	}

    	if ((t&Event.ONKEYPRESS)!=0) {
		if (cc=='-') {
    		    app.commands.menuPerformed("key", "zoomout");
    		    e.cancel();
    		}
    		if (cc=='+' || cc == '=') {
    		    app.commands.menuPerformed("key", "zoomin");
    		    e.cancel();
    		}
		if (cc=='0') {
    		    app.commands.menuPerformed("key", "zoom100");
    		    e.cancel();
		}
		if (cc=='/' && app.shortcuts['/'] == null) {
		    app.commands.menuPerformed("key", "search");
		    e.cancel();
		}
    	}

    	if (menus.noEditCheckItem.getState())
    	    return;

    	if ((t & Event.ONKEYDOWN)!=0) {
    		if (code==KEY_BACKSPACE || code==KEY_DELETE) {
    		    if (app.scopeManager.scopeSelected != -1) {
    			app.scopeManager.scopes[app.scopeManager.scopeSelected].setElm(null);
    			app.scopeManager.scopeSelected = -1;
    		    } else {
    		    	app.mouse.menuElm = null;
    		    	app.undoManager.pushUndo();
    			app.commands.doDelete(true);
    			e.cancel();
    		    }
    		}
    		if (code==KEY_ESCAPE){
    			setMouseMode(MouseManager.MODE_SELECT);
    			app.mouseModeStr = "Select";
			updateToolbar();
    			app.mouse.tempMouseMode = app.mouse.mouseMode;
    			e.cancel();
    		}

    		if (e.getNativeEvent().getCtrlKey() || e.getNativeEvent().getMetaKey()) {
    			if (code==KEY_C) {
    				app.commands.menuPerformed("key", "copy");
    				e.cancel();
    			}
    			if (code==KEY_X) {
    				app.commands.menuPerformed("key", "cut");
    				e.cancel();
    			}
    			if (code==KEY_V) {
    				app.commands.menuPerformed("key", "paste");
    				e.cancel();
    			}
    			if (code==KEY_Z) {
    				app.commands.menuPerformed("key", "undo");
    				e.cancel();
    			}
    			if (code==KEY_Y) {
    				app.commands.menuPerformed("key", "redo");
    				e.cancel();
    			}
    			if (code==KEY_D) {
    			    	app.commands.menuPerformed("key", "duplicate");
    			    	e.cancel();
    			}
    			if (code==KEY_A) {
    				app.commands.menuPerformed("key", "selectAll");
    				e.cancel();
    			}
    			if (code==KEY_P) {
				app.commands.menuPerformed("key", "print");
				e.cancel();
			}
    			if (code==KEY_N && CirSim.isElectron()) {
				app.commands.menuPerformed("key", "newwindow");
				e.cancel();
			}
    			if (code==KEY_S) {
    			    	String cmd = "exportaslocalfile";
    			    	if (CirSim.isElectron())
    			    	    cmd = menus.saveFileItem.isEnabled() ? "save" : "saveas";
				app.commands.menuPerformed("key", cmd);
				e.cancel();
			}
    			if (code==KEY_O) {
				app.commands.menuPerformed("key", "importfromlocalfile");
				e.cancel();
			}
    		}
    	}
    	if ((t&Event.ONKEYPRESS)!=0) {
    		if (cc>32 && cc<127){
    			String c=app.shortcuts[cc];
    			e.cancel();
    			if (c==null)
    				return;
    			setMouseMode(MouseManager.MODE_ADD_ELM);
    			app.mouseModeStr=c;
			updateToolbar();
    			app.mouse.tempMouseMode = app.mouse.mouseMode;
    		}
    		if (cc==32) {
		    setMouseMode(MouseManager.MODE_SELECT);
		    app.mouseModeStr = "Select";
		    updateToolbar();
		    app.mouse.tempMouseMode = app.mouse.mouseMode;
		    e.cancel();
    		}
    	}
    }

    // ---- Widget management ----

    void createNewLoadFile() {
    	int idx=app.verticalPanel.getWidgetIndex(app.loadFileInput);
    	LoadFile newlf=new LoadFile(app);
    	app.verticalPanel.insert(newlf, idx);
    	app.verticalPanel.remove(idx+1);
    	app.loadFileInput=newlf;
    }

    void addWidgetToVerticalPanel(Widget w) {
	if (app.verticalPanel == null)
	    return;
    	if (app.iFrame!=null) {
    		int i=app.verticalPanel.getWidgetIndex(app.iFrame);
    		app.verticalPanel.insert(w, i);
    		setiFrameHeight();
    	}
    	else
    		app.verticalPanel.add(w);
    }

    void removeWidgetFromVerticalPanel(Widget w){
	if (app.verticalPanel == null)
	    return;
    	app.verticalPanel.remove(w);
    	if (app.iFrame!=null)
    		setiFrameHeight();
    }

    // ---- Other ----

    void setCircuitTitle(String s) {
	app.titleLabel.setText(s);
	if (s != null && s.length() > 0)
	    Document.get().setTitle(s + " - " + CirSim.baseTitle);
	else
	    Document.get().setTitle(CirSim.baseTitle);
    }

    void allowSave(boolean b) {
	if (menus.saveFileItem != null)
	    menus.saveFileItem.setEnabled(b);
    }

    boolean isSelection() {
	for (CircuitElm ce : app.elmList)
	    if (ce.isSelected())
		return true;
	return false;
    }

    public void resetAction(){
    	app.analyzeFlag = true;
    	if (app.sim.t == 0)
    	    setSimRunning(true);
    	app.sim.resetTime();
    	for (CircuitElm ce : app.elmList)
		ce.reset();
	app.scopeManager.resetGraphs();
    	repaint();
    }

    void composeSubcircuitMenu() {
	if (menus.subcircuitMenuBar == null)
	    return;
	int mi;

	for (mi = 0; mi != 2; mi++) {
	    com.google.gwt.user.client.ui.MenuBar menu = menus.subcircuitMenuBar[mi];
	    menu.clearItems();
	    Vector<CustomCompositeModel> list = CustomCompositeModel.getModelList();
	    int i;
	    for (i = 0; i != list.size(); i++) {
		String name = list.get(i).name;
		menu.addItem(app.getClassCheckItem(Locale.LS("Add ") + name, "CustomCompositeElm:" + name));
	    }
	}
	MouseManager.lastSubcircuitMenuUpdate = CustomCompositeModel.sequenceNumber;
    }

    public void setiFrameHeight() {
    	if (app.iFrame==null)
    		return;
    	int i;
    	int cumheight=0;
    	for (i=0; i < app.verticalPanel.getWidgetIndex(app.iFrame); i++) {
    		if (app.verticalPanel.getWidget(i) !=app.loadFileInput) {
    			cumheight=cumheight+app.verticalPanel.getWidget(i).getOffsetHeight();
    			if (app.verticalPanel.getWidget(i).getStyleName().contains("topSpace"))
    					cumheight+=12;
    		}
    	}
    	int ih=RootLayoutPanel.get().getOffsetHeight()-(app.hideMenu?0:CirSim.MENUBARHEIGHT)-cumheight;
    	if (ih<0)
    		ih=0;
    	app.iFrame.setHeight(ih+"px");
    }

    void setColors(String positiveColor, String negativeColor, String neutralColor, String selectColor, String currentColor) {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor != null) {
            if (positiveColor == null)
        	positiveColor = stor.getItem("positiveColor");
            if (negativeColor == null)
        	negativeColor = stor.getItem("negativeColor");
            if (neutralColor == null)
        	neutralColor = stor.getItem("neutralColor");
            if (selectColor == null)
        	selectColor = stor.getItem("selectColor");
            if (currentColor == null)
        	currentColor = stor.getItem("currentColor");
        }

	if (positiveColor != null)
	    CircuitElm.positiveColor = new Color(URL.decodeQueryString(positiveColor));
	else if (getOptionFromStorage("alternativeColor", false))
	    CircuitElm.positiveColor = Color.blue;

	if (negativeColor != null)
	    CircuitElm.negativeColor = new Color(URL.decodeQueryString(negativeColor));
	if (neutralColor != null)
	    CircuitElm.neutralColor = new Color(URL.decodeQueryString(neutralColor));

	if (selectColor != null)
	    CircuitElm.selectColor = new Color(URL.decodeQueryString(selectColor));
	else
	    CircuitElm.selectColor = Color.cyan;

	if (currentColor != null)
	    CircuitElm.currentColor = new Color(URL.decodeQueryString(currentColor));
	else
	    CircuitElm.currentColor = menus.conventionCheckItem.getState() ? Color.yellow : Color.cyan;

	CircuitElm.setColorScale();
    }

    void setWheelSensitivity() {
	app.mouse.wheelSensitivity = 1;
	try {
	    Storage stor = Storage.getLocalStorageIfSupported();
	    app.mouse.wheelSensitivity = Double.parseDouble(stor.getItem("wheelSensitivity"));
	} catch (Exception e) {}
    }

    boolean getOptionFromStorage(String key, boolean val) {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return val;
        String s = stor.getItem(key);
        if (s == null)
            return val;
        return s == "true";
    }

    void setOptionInStorage(String key, boolean val) {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        stor.setItem(key,  val ? "true" : "false");
    }

    void saveShortcuts() {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        String str = "1";
        int i;
        for (i = 0; i != app.shortcuts.length; i++) {
            String sh = app.shortcuts[i];
            if (sh == null)
        		continue;
            str += ";" + i + "=" + sh;
        }
        stor.setItem("shortcuts", str);
    }

    void loadShortcuts() {
        Storage stor = Storage.getLocalStorageIfSupported();
        if (stor == null)
            return;
        String str = stor.getItem("shortcuts");
        if (str == null)
            return;
        String keys[] = str.split(";");

        int i;
        for (i = 0; i != app.shortcuts.length; i++)
            app.shortcuts[i] = null;

        for (i = 0; i != app.mainMenuItems.size(); i++) {
            CheckboxMenuItem item = app.mainMenuItems.get(i);
            if (item.getShortcut().length() > 1)
        		break;
            item.setShortcut("");
        }

        for (i = 1; i < keys.length; i++) {
            String arr[] = keys[i].split("=");
            if (arr.length != 2)
        	continue;
            int c = Integer.parseInt(arr[0]);
            String className = arr[1];
            app.shortcuts[c] = className;

            int j;
            for (j = 0; j != app.mainMenuItems.size(); j++) {
        		if (app.mainMenuItemNames.get(j) == className) {
        		    CheckboxMenuItem item = app.mainMenuItems.get(j);
        		    item.setShortcut(Character.toString((char)c));
        		    break;
        		}
            }
        }
    }

    String getLabelTextForClass(String cls) {
	return app.classToLabelMap.get(cls);
    }

    static int min(int a, int b) { return (a < b) ? a : b; }
    static int max(int a, int b) { return (a > b) ? a : b; }
}
