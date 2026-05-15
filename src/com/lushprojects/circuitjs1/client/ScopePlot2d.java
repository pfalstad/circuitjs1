package com.lushprojects.circuitjs1.client;

import com.google.gwt.canvas.client.Canvas;
import com.google.gwt.canvas.dom.client.Context2d;

class ScopePlot2d {
    boolean enabled;
    boolean plotXY;
    double scaleX, scaleY;

    private Canvas imageCanvas;
    private Context2d imageContext;
    private int draw_ox, draw_oy;
    private int alphaCounter;

    Scope scope;

    ScopePlot2d(Scope scope) {
	this.scope = scope;
	scaleX = 5;
	scaleY = .1;
	imageCanvas = Canvas.createIfSupported();
	imageContext = imageCanvas.getContext2d();
    }

    void allocImage() {
	if (imageCanvas != null) {
	    imageCanvas.setWidth(scope.rect.width + "PX");
	    imageCanvas.setHeight(scope.rect.height + "PX");
	    imageCanvas.setCoordinateSpaceWidth(scope.rect.width);
	    imageCanvas.setCoordinateSpaceHeight(scope.rect.height);
	    clearView();
	}
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

    void drawTo(int x2, int y2) {
	if (draw_ox == -1) {
	    draw_ox = x2;
	    draw_oy = y2;
	}
	if (scope.app.isPrintable()) {
	    imageContext.setStrokeStyle("#000000");
	} else {
	    imageContext.setStrokeStyle("#ffffff");
	}
	imageContext.beginPath();
	imageContext.moveTo(draw_ox, draw_oy);
	imageContext.lineTo(x2, y2);
	imageContext.stroke();
	draw_ox = x2;
	draw_oy = y2;
    }

    void timeStep() {
	if (imageContext == null || scope.plots.size() < 2)
	    return;
	double v = scope.plots.get(0).lastValue;
	double yval = scope.plots.get(1).lastValue;
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
	    x = (int)(scope.rect.width  * .499 + (v    / scope.plots.get(0).manScale) * gridPx + gridPx * scope.manDivisions * (double)(scope.plots.get(0).manVPosition) / (double)(Scope.V_POSITION_STEPS));
	    y = (int)(scope.rect.height * .499 - (yval / scope.plots.get(1).manScale) * gridPx - gridPx * scope.manDivisions * (double)(scope.plots.get(1).manVPosition) / (double)(Scope.V_POSITION_STEPS));
	}
	drawTo(x, y);
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
	scope.textY = 10;
	g.setColor(CircuitElm.whiteColor);
	if (scope.text != null)
	    scope.drawInfoText(g, scope.text);
	if (scope.showScale && scope.plots.size() >= 2 && scope.isManualScale()) {
	    ScopePlot px = scope.plots.get(0);
	    ScopePlot py = scope.plots.get(1);
	    scope.drawInfoText(g, "X=" + px.getUnitText(px.manScale) + "/div, Y=" + py.getUnitText(py.manScale) + "/div");
	}
	g.context.restore();
	scope.drawSettingsWheel(g);
	if (!scope.app.dialogIsShowing() && scope.rect.contains(scope.app.mouse.mouseCursorX, scope.app.mouse.mouseCursorY) && scope.plots.size() >= 2) {
	    double gridPx = calcGridPx(scope.rect.width, scope.rect.height);
	    String[] info = new String[2];
	    ScopePlot px = scope.plots.get(0);
	    ScopePlot py = scope.plots.get(1);
	    double xValue, yValue;
	    if (scope.isManualScale()) {
		xValue = px.manScale * ((double)(scope.app.mouse.mouseCursorX - scope.rect.x - scope.rect.width  / 2) / gridPx - scope.manDivisions * px.manVPosition / (double)(Scope.V_POSITION_STEPS));
		yValue = py.manScale * ((double)(-scope.app.mouse.mouseCursorY + scope.rect.y + scope.rect.height / 2) / gridPx - scope.manDivisions * py.manVPosition / (double)(Scope.V_POSITION_STEPS));
	    } else {
		xValue =  ((double)(scope.app.mouse.mouseCursorX - scope.rect.x) / (0.499 * (double)(scope.rect.width))  - 1.0) * scaleX;
		yValue = -((double)(scope.app.mouse.mouseCursorY - scope.rect.y) / (0.499 * (double)(scope.rect.height)) - 1.0) * scaleY;
	    }
	    info[0] = px.getUnitText(xValue);
	    info[1] = py.getUnitText(yValue);
	    scope.drawCursorInfo(g, info, 2, scope.app.mouse.mouseCursorX, true);
	}
    }
}
