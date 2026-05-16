package com.lushprojects.circuitjs1.client;

import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.canvas.dom.client.Context2d;

class ScopePlot2d {
    boolean enabled;
    boolean plotXY;
    double scaleX, scaleY;

    // X/Y axis plot indices (into scope.plots)
    int plotX = 0, plotY = 1;
    // Modulator plot indices (-1 = none)
    int plotBrightness = -1;
    int plotColorR = -1, plotColorG = -1, plotColorB = -1;
    // Auto-scales for modulator plots
    double scaleBrightness = 5, scaleR = 5, scaleG = 5, scaleB = 5;

    private Canvas imageCanvas;
    private Context2d imageContext;
    private int draw_ox, draw_oy;
    private int alphaCounter;

    Scope scope;

    ScopePlot2d(Scope scope) {
	this.scope = scope;
	scaleX = 5;
	scaleY = .1;
    }

    void allocImage() {
	if (!enabled)
	    return;
	if (imageCanvas == null) {
	    imageCanvas = Canvas.createIfSupported();
	    imageContext = imageCanvas.getContext2d();
	}
	imageCanvas.setWidth(scope.rect.width + "PX");
	imageCanvas.setHeight(scope.rect.height + "PX");
	imageCanvas.setCoordinateSpaceWidth(scope.rect.width);
	imageCanvas.setCoordinateSpaceHeight(scope.rect.height);
	clearView();
    }

    void clearView() {
	if (imageContext != null) {
	    if (scope.app.isPrintable()) {
		imageContext.setFillStyle("#eee");
	    } else {
		imageContext.setFillStyle("#111");
	    }
	    imageContext.fillRect(0, 0, scope.rect.width - 1, scope.rect.height - 1);
	}
	draw_ox = draw_oy = -1;
    }

    double calcGridPx(int width, int height) {
	int m = width < height ? width : height;
	return ((double)(m) / 2) / ((double)(scope.manDivisions) / 2 + 0.05);
    }

    // Draw a segment from (ox,oy) to (x2,y2) with the given color and alpha.
    void drawSegment(int ox, int oy, int x2, int y2, String color, double alpha) {
	if (alpha != 1.0)
	    imageContext.setGlobalAlpha(alpha);
	imageContext.setStrokeStyle(color);
	imageContext.beginPath();
	imageContext.moveTo(ox, oy);
	imageContext.lineTo(x2, y2);
	imageContext.stroke();
	if (alpha != 1.0)
	    imageContext.setGlobalAlpha(1.0);
    }

    void drawTo(int x2, int y2) {
	if (draw_ox == -1) {
	    draw_ox = x2;
	    draw_oy = y2;
	    return;
	}
	String color = scope.app.isPrintable() ? "#000000" : "#ffffff";
	drawSegment(draw_ox, draw_oy, x2, y2, color, 1.0);
	draw_ox = x2;
	draw_oy = y2;
    }

    void drawTo(int x2, int y2, String color, double alpha) {
	if (draw_ox == -1) {
	    draw_ox = x2;
	    draw_oy = y2;
	    return;
	}
	drawSegment(draw_ox, draw_oy, x2, y2, color, alpha);
	draw_ox = x2;
	draw_oy = y2;
    }

    // Map a value in [-scale, +scale] to [0, 255] (bipolar).
    int mapBipolar(double value, double scale) {
	return (int) Math.max(0, Math.min(255, (value / scale + 1) * 127.5));
    }

    // Compute the draw color from R/G/B modulator plots.
    String computeColor() {
	if (plotColorR < 0 && plotColorG < 0 && plotColorB < 0)
	    return scope.app.isPrintable() ? "#000000" : "#ffffff";
	int r = 0, g = 0, b = 0;
	if (plotColorR >= 0 && plotColorR < scope.plots.size()) {
	    double rv = scope.plots.get(plotColorR).lastValue;
	    while (Math.abs(rv) > scaleR) scaleR *= 2;
	    r = mapBipolar(rv, scaleR);
	}
	if (plotColorG >= 0 && plotColorG < scope.plots.size()) {
	    double gv = scope.plots.get(plotColorG).lastValue;
	    while (Math.abs(gv) > scaleG) scaleG *= 2;
	    g = mapBipolar(gv, scaleG);
	}
	if (plotColorB >= 0 && plotColorB < scope.plots.size()) {
	    double bv = scope.plots.get(plotColorB).lastValue;
	    while (Math.abs(bv) > scaleB) scaleB *= 2;
	    b = mapBipolar(bv, scaleB);
	}
	return "rgb(" + r + "," + g + "," + b + ")";
    }

    // Compute draw alpha from the brightness modulator plot (0 = off, 1 = full).
    double computeAlpha() {
	if (plotBrightness < 0 || plotBrightness >= scope.plots.size())
	    return 1.0;
	double bv = Math.abs(scope.plots.get(plotBrightness).lastValue);
	while (bv > scaleBrightness) scaleBrightness *= 2;
	return scaleBrightness > 0 ? bv / scaleBrightness : 0;
    }

    // Clamp plotX/plotY to valid range.
    int validPlotIndex(int idx, int defaultIdx) {
	if (scope.plots.size() == 0) return 0;
	if (idx < 0 || idx >= scope.plots.size()) return Math.min(defaultIdx, scope.plots.size() - 1);
	return idx;
    }

    void timeStep() {
	if (imageContext == null || scope.plots.size() < 1)
	    return;
	int px = validPlotIndex(plotX, 0);
	int py = validPlotIndex(plotY, Math.min(1, scope.plots.size() - 1));
	double v = scope.plots.get(px).lastValue;
	double yval = scope.plots.get(py).lastValue;
	int x, y;
	if (!scope.isManualScale()) {
	    boolean newscale = false;
	    while (v > scaleX || v < -scaleX) { scaleX *= 2; newscale = true; }
	    while (yval > scaleY || yval < -scaleY) { scaleY *= 2; newscale = true; }
	    if (newscale)
		clearView();
	    double xa = v / scaleX;
	    double ya = yval / scaleY;
	    x = (int)(scope.rect.width  * (1 + xa) * .499);
	    y = (int)(scope.rect.height * (1 - ya) * .499);
	} else {
	    double gridPx = calcGridPx(scope.rect.width, scope.rect.height);
	    x = (int)(scope.rect.width  * .499 + (v    / scope.plots.get(px).manScale) * gridPx + gridPx * scope.manDivisions * (double)(scope.plots.get(px).manVPosition) / (double)(Scope.V_POSITION_STEPS));
	    y = (int)(scope.rect.height * .499 - (yval / scope.plots.get(py).manScale) * gridPx - gridPx * scope.manDivisions * (double)(scope.plots.get(py).manVPosition) / (double)(Scope.V_POSITION_STEPS));
	}
	String color = computeColor();
	double alpha = computeAlpha();
	drawTo(x, y, color, alpha);
    }

    void maxScale() {
	double x = 1e-8;
	scope.scale[Scope.UNITS_V]    *= x;
	scope.scale[Scope.UNITS_A]    *= x;
	scope.scale[Scope.UNITS_OHMS] *= x;
	scope.scale[Scope.UNITS_W]    *= x;
	scope.scale[Scope.UNITS_C]    *= x;
	scaleX *= x;
	scaleY *= x;
	scaleBrightness *= x;
	scaleR *= x;
	scaleG *= x;
	scaleB *= x;
    }

    void draw(Graphics g) {
	if (imageContext == null)
	    return;
	g.context.save();
	g.context.translate(scope.rect.x, scope.rect.y);
	g.clipRect(0, 0, scope.rect.width, scope.rect.height);

	alphaCounter++;
	if (alphaCounter > 2) {
	    alphaCounter = 0;
	    imageContext.setGlobalAlpha(0.01);
	    if (scope.app.isPrintable()) {
		imageContext.setFillStyle("#ffffff");
	    } else {
		imageContext.setFillStyle("#000000");
	    }
	    imageContext.fillRect(0, 0, scope.rect.width, scope.rect.height);
	    imageContext.setGlobalAlpha(1.0);
	}

	g.context.drawImage(imageContext.getCanvas(), 0.0, 0.0);
	g.setColor(CircuitElm.whiteColor);
	g.fillOval(draw_ox - 2, draw_oy - 2, 5, 5);
	g.setColor(CircuitElm.positiveColor);
	g.drawLine(0, scope.rect.height / 2, scope.rect.width - 1, scope.rect.height / 2);
	if (!plotXY)
	    g.setColor(Color.yellow);
	g.drawLine(scope.rect.width / 2, 0, scope.rect.width / 2, scope.rect.height - 1);
	if (scope.isManualScale()) {
	    double gridPx = calcGridPx(scope.rect.width, scope.rect.height);
	    g.setColor("#404040");
	    for (int i = -scope.manDivisions; i <= scope.manDivisions; i++) {
		if (i != 0)
		    g.drawLine((int)(gridPx * i) + scope.rect.width / 2, 0, (int)(gridPx * i) + scope.rect.width / 2, scope.rect.height);
		g.drawLine(0, (int)(gridPx * i) + scope.rect.height / 2, scope.rect.width, (int)(gridPx * i) + scope.rect.height / 2);
	    }
	}
	scope.overlays.textY = 10;
	g.setColor(CircuitElm.whiteColor);
	if (scope.text != null)
	    scope.drawInfoText(g, scope.text);
	int px = validPlotIndex(plotX, 0);
	int py = validPlotIndex(plotY, Math.min(1, scope.plots.size() - 1));
	if (scope.showScale && scope.plots.size() >= 1 && scope.isManualScale() && px < scope.plots.size() && py < scope.plots.size()) {
	    ScopePlot spx = scope.plots.get(px);
	    ScopePlot spy = scope.plots.get(py);
	    scope.drawInfoText(g, "X=" + spx.getUnitText(spx.manScale) + "/div, Y=" + spy.getUnitText(spy.manScale) + "/div");
	}
	g.context.restore();
	scope.drawSettingsWheel(g);
	if (!scope.app.dialogIsShowing() && scope.rect.contains(scope.app.mouse.mouseCursorX, scope.app.mouse.mouseCursorY) && scope.plots.size() >= 1 && px < scope.plots.size() && py < scope.plots.size()) {
	    double gridPx = calcGridPx(scope.rect.width, scope.rect.height);
	    String[] info = new String[2];
	    ScopePlot spx = scope.plots.get(px);
	    ScopePlot spy = scope.plots.get(py);
	    double xValue, yValue;
	    if (scope.isManualScale()) {
		xValue = spx.manScale * ((double)(scope.app.mouse.mouseCursorX - scope.rect.x - scope.rect.width  / 2) / gridPx - scope.manDivisions * spx.manVPosition / (double)(Scope.V_POSITION_STEPS));
		yValue = spy.manScale * ((double)(-scope.app.mouse.mouseCursorY + scope.rect.y + scope.rect.height / 2) / gridPx - scope.manDivisions * spy.manVPosition / (double)(Scope.V_POSITION_STEPS));
	    } else {
		xValue =  ((double)(scope.app.mouse.mouseCursorX - scope.rect.x) / (0.499 * (double)(scope.rect.width))  - 1.0) * scaleX;
		yValue = -((double)(scope.app.mouse.mouseCursorY - scope.rect.y) / (0.499 * (double)(scope.rect.height)) - 1.0) * scaleY;
	    }
	    info[0] = spx.getUnitText(xValue);
	    info[1] = spy.getUnitText(yValue);
	    scope.drawCursorInfo(g, info, 2, scope.app.mouse.mouseCursorX, true);
	}
    }
}
