package com.lushprojects.circuitjs1.client;

import com.lushprojects.circuitjs1.client.util.Locale;

class ScopeOverlays {
    Scope scope;
    int textY;

    ScopeOverlays(Scope scope) {
	this.scope = scope;
    }

    void drawInfoText(Graphics g, String text) {
	if (scope.rect.y + scope.rect.height <= textY + 5)
	    return;
	g.drawString(text, 0, textY);
	textY += 15;
    }

    void drawScale(ScopePlot plot, Graphics g) {
	if (!scope.isManualScale()) {
	    if (scope.gridStepY != 0 && (!(scope.showV && scope.showI))) {
		String vScaleText = " V=" + plot.getUnitText(scope.gridStepY) + "/div";
		drawInfoText(g, "H=" + CircuitElm.getUnitText(scope.gridStepX, "s") + "/div" + vScaleText);
	    }
	} else {
	    if (scope.rect.y + scope.rect.height <= textY + 5)
		return;
	    double x = 0;
	    String hs = "H=" + CircuitElm.getUnitText(scope.gridStepX, "s") + "/div";
	    g.drawString(hs, 0, textY);
	    x += g.measureWidth(hs);
	    final double bulletWidth = 17;
	    for (int i = 0; i < scope.visiblePlots.size(); i++) {
		ScopePlot p = scope.visiblePlots.get(i);
		String s = p.getUnitText(p.manScale);
		if (p != null) {
		    String vScaleText = "=" + s + "/div";
		    double vScaleWidth = g.measureWidth(vScaleText);
		    if (x + bulletWidth + vScaleWidth > scope.rect.width) {
			x = 0;
			textY += 15;
			if (scope.rect.y + scope.rect.height <= textY + 5)
			    return;
		    }
		    g.setColor(p.color);
		    g.fillOval((int) x + 7, textY - 9, 8, 8);
		    x += bulletWidth;
		    g.setColor(CircuitElm.whiteColor);
		    g.drawString(vScaleText, (int) x, textY);
		    x += vScaleWidth;
		}
	    }
	    textY += 15;
	}
    }

    // shared cycle-detection loop for drawAverage, drawRMS, drawDutyCycle.
    // calls onCycleStart at first rising edge, onSample each sample thereafter,
    // onCycleEnd at each subsequent rising edge.  returns end-start span, or 0.
    int iterateCycles(ScopeDataIterator sdi, double mid,
		      Runnable onCycleStart, Runnable onSample, Runnable onCycleEnd) {
	double fnz = sdi.skipNonzeroValues();
	int state = (fnz > mid) ? 1 : -1;
	int waveCount = 0;
	int start = 0, end = 0;
	for (int i : sdi) {
	    boolean sw = false;
	    if (state == 1) {
		if (sdi.getMax() < mid) sw = true;
	    } else if (sdi.getMin() > mid) sw = true;
	    if (sw) {
		state = -state;
		if (state == 1) {
		    if (waveCount == 0) {
			start = i;
			onCycleStart.run();
		    } else {
			end = i;
			onCycleEnd.run();
		    }
		    waveCount++;
		}
	    }
	    if (waveCount > 0)
		onSample.run();
	}
	return end - start;
    }

    void drawRMS(Graphics g) {
	if (!scope.canShowRMS()) {
	    // needed for backward compatibility
	    scope.showRMS = false;
	    scope.showAverage = true;
	    drawAverage(g);
	    return;
	}
	ScopePlot plot = scope.visiblePlots.firstElement();
	double mid = (scope.maxValue + scope.minValue) / 2;
	ScopeDataIterator sdi = new ScopeDataIterator(scope, plot);
	double[] avg = {0}, endAvg = {0};
	int span = iterateCycles(sdi, mid,
	    () -> avg[0] = 0,
	    () -> { double m = (sdi.getMax() + sdi.getMin()) * .5; avg[0] += m * m; },
	    () -> endAvg[0] = avg[0]);
	if (span > 0)
	    drawInfoText(g, plot.getUnitText(Math.sqrt(endAvg[0] / span)) + "rms");
    }

    void drawAverage(Graphics g) {
	ScopePlot plot = scope.visiblePlots.firstElement();
	double mid = (scope.maxValue + scope.minValue) / 2;
	ScopeDataIterator sdi = new ScopeDataIterator(scope, plot);
	double[] avg = {0}, endAvg = {0};
	int span = iterateCycles(sdi, mid,
	    () -> avg[0] = 0,
	    () -> avg[0] += (sdi.getMax() + sdi.getMin()) * .5,
	    () -> endAvg[0] = avg[0]);
	if (span > 0)
	    drawInfoText(g, plot.getUnitText(endAvg[0] / span) + Locale.LS(" average"));
    }

    void drawDutyCycle(Graphics g) {
	ScopePlot plot = scope.visiblePlots.firstElement();
	double mid = (scope.maxValue + scope.minValue) / 2;
	ScopeDataIterator sdi = new ScopeDataIterator(scope, plot);
	int[] dutyLen = {0}, prevDuty = {0};
	int span = iterateCycles(sdi, mid,
	    () -> dutyLen[0] = 0,
	    () -> { if (sdi.getMax() > mid) dutyLen[0]++; },
	    () -> prevDuty[0] = dutyLen[0]);
	if (span > 0)
	    drawInfoText(g, Locale.LS("Duty cycle ") + 100 * prevDuty[0] / span + "%");
    }

    void drawFrequency(Graphics g) {
	double avg = 0;
	ScopePlot plot = scope.visiblePlots.firstElement();
	ScopeDataIterator sdi = new ScopeDataIterator(scope, plot);
	for (int i : sdi)
	    avg += sdi.getMin() + sdi.getMax();
	avg /= sdi.validCount * 2;
	int state = 0;
	double thresh = avg * .05;
	int oi = 0;
	double avperiod = 0;
	int periodct = -1;
	double avperiod2 = 0;
	for (int i : sdi) {
	    double q = sdi.getMax() - avg;
	    int os = state;
	    if (q < thresh)
		state = 1;
	    else if (q > -thresh)
		state = 2;
	    if (state == 2 && os == 1) {
		int pd = i - oi;
		oi = i;
		if (pd < 12)
		    continue;
		if (periodct >= 0) {
		    avperiod += pd;
		    avperiod2 += pd * pd;
		}
		periodct++;
	    }
	}
	avperiod /= periodct;
	avperiod2 /= periodct;
	double periodstd = Math.sqrt(avperiod2 - avperiod * avperiod);
	double freq = 1 / (avperiod * scope.sim.maxTimeStep * scope.speed);
	if (periodct < 1 || periodstd > 2)
	    freq = 0;
	if (freq != 0)
	    drawInfoText(g, CircuitElm.getUnitText(freq, "Hz"));
    }

    void drawElmInfo(Graphics g) {
	String info[] = new String[1];
	scope.getElm().getInfo(info);
	for (int i = 0; info[i] != null; i++)
	    drawInfoText(g, info[i]);
    }

    void draw(Graphics g) {
	g.setColor(CircuitElm.whiteColor);
	textY = 10;
	if (scope.visiblePlots.size() == 0) {
	    if (scope.showElmInfo)
		drawElmInfo(g);
	    return;
	}
	ScopePlot plot = scope.visiblePlots.firstElement();
	if (scope.showScale)
	    drawScale(plot, g);
	if (scope.showMax)
	    drawInfoText(g, "Max=" + plot.getUnitText(scope.maxValue));
	if (scope.showMin) {
	    int ym = scope.rect.height - 5;
	    g.drawString("Min=" + plot.getUnitText(scope.minValue), 0, ym);
	}
	if (scope.showP2P)
	    drawInfoText(g, "P-P=" + plot.getUnitText(scope.maxValue - scope.minValue));
	if (scope.showRMS)
	    drawRMS(g);
	if (scope.showAverage)
	    drawAverage(g);
	if (scope.showDutyCycle)
	    drawDutyCycle(g);
	String t = scope.getScopeLabelOrText(true);
	if (t != null && t != "")
	    drawInfoText(g, t);
	if (scope.showFreq)
	    drawFrequency(g);
	if (scope.showElmInfo)
	    drawElmInfo(g);
	if (scope.fftPlot.showPhaseAngle)
	    scope.fftPlot.drawPhaseAngle(g);
    }
}
