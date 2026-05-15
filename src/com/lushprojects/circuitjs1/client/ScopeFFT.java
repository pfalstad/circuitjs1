package com.lushprojects.circuitjs1.client;

import com.lushprojects.circuitjs1.client.util.Locale;

class ScopeFFT {
    Scope scope;
    boolean enabled;
    boolean logSpectrum;
    boolean showPhaseAngle;
    double fftMaxMagnitude;
    double[] fftReal, fftImag;
    private FFT fft;

    ScopeFFT(Scope scope) {
	this.scope = scope;
    }

    void show(boolean b) {
	enabled = b;
	if (!enabled)
	    fft = null;
    }

    void drawVerticalGridLines(Graphics g) {
	int prevEnd = 0;
	int divs = 20;
	double maxFrequency = 1 / (scope.sim.maxTimeStep * scope.speed * divs * 2);
	for (int i = 0; i < divs; i++) {
	    int x = scope.rect.width * i / divs;
	    if (x < prevEnd) continue;
	    String s = ((int) Math.round(i * maxFrequency)) + "Hz";
	    int sWidth = (int) Math.ceil(g.context.measureText(s).getWidth());
	    prevEnd = x + sWidth + 4;
	    if (i > 0) {
		g.setColor("#880000");
		g.drawLine(x, 0, x, scope.rect.height);
	    }
	    g.setColor("#FF0000");
	    g.drawString(s, x + 2, scope.rect.height);
	}
    }

    void draw(Graphics g) {
	if (fft == null || fft.getSize() != scope.scopePointCount)
	    fft = new FFT(scope.scopePointCount);
	double[] real = new double[scope.scopePointCount];
	double[] imag = new double[scope.scopePointCount];
	ScopePlot plot = (scope.visiblePlots.size() == 0) ? scope.plots.firstElement() : scope.visiblePlots.firstElement();
	double maxV[] = plot.maxValues;
	double minV[] = plot.minValues;
	int ptr = plot.ptr;
	for (int i = 0; i < scope.scopePointCount; i++) {
	    int ii = (ptr - i + scope.scopePointCount) & (scope.scopePointCount - 1);
	    // average max and min to prevent DC spike from masking rest of spectrum
	    real[i] = .5 * (maxV[ii] + minV[ii]);
	    imag[i] = 0;
	}
	fft.fft(real, imag, true);
	double maxM = 1e-8;
	for (int i = 0; i < scope.scopePointCount / 2; i++) {
	    double m = fft.magnitude(real[i], imag[i]);
	    if (m > maxM)
		maxM = m;
	}
	fftMaxMagnitude = maxM;
	fftReal = real;
	fftImag = imag;
	int prevX = 0;
	g.setColor("#FF0000");
	if (!logSpectrum) {
	    int prevHeight = 0;
	    int y = (scope.rect.height - 1) - 12;
	    for (int i = 0; i < scope.scopePointCount / 2; i++) {
		int x = 2 * i * scope.rect.width / scope.scopePointCount;
		double magnitude = fft.magnitude(real[i], imag[i]);
		int height = (int) ((magnitude * y) / maxM);
		if (x != prevX)
		    g.drawLine(prevX, y - prevHeight, x, y - height);
		prevHeight = height;
		prevX = x;
	    }
	} else {
	    double dbRange = 80;
	    int topMargin = 5;
	    int bottomMargin = 12;
	    int plotHeight = scope.rect.height - topMargin - bottomMargin;
	    double pixelsPerDb = plotHeight / dbRange;
	    int prevY = 0;
	    for (int db = -20; db >= -80; db -= 20) {
		int y = topMargin + (int) (-db * pixelsPerDb);
		if (y < 0 || y >= scope.rect.height)
		    continue;
		g.setColor("#880000");
		g.drawLine(0, y, scope.rect.width, y);
		g.setColor("#FF0000");
		g.drawString(db + " dB", 2, y - 2);
	    }
	    g.setColor("#FF0000");
	    for (int i = 0; i < scope.scopePointCount / 2; i++) {
		int x = 2 * i * scope.rect.width / scope.scopePointCount;
		double magnitude = fft.magnitude(real[i], imag[i]);
		double db = 20 * Math.log(magnitude / maxM) / Math.log(10);
		if (db < -dbRange)
		    db = -dbRange;
		int y = topMargin + (int) (-db * pixelsPerDb);
		if (x != prevX)
		    g.drawLine(prevX, prevY, x, y);
		prevY = y;
		prevX = x;
	    }
	}
    }

    void drawPhaseAngle(Graphics g) {
	ScopePlot vPlot = null, iPlot = null;
	for (ScopePlot p : scope.visiblePlots) {
	    if (p.units == Scope.UNITS_V) {
		if (vPlot != null) return;
		vPlot = p;
	    } else if (p.units == Scope.UNITS_A) {
		if (iPlot != null) return;
		iPlot = p;
	    } else
		return;
	}
	if (vPlot == null || iPlot == null)
	    return;
	if (fft == null || fft.getSize() != scope.scopePointCount)
	    fft = new FFT(scope.scopePointCount);
	double[] vReal = new double[scope.scopePointCount];
	double[] vImag = new double[scope.scopePointCount];
	double[] iReal = new double[scope.scopePointCount];
	double[] iImag = new double[scope.scopePointCount];
	int ipa = scope.displayStartIndex(vPlot, scope.rect.width);
	int validCount = scope.validDataCount(vPlot, ipa, scope.rect.width);
	for (int i = 0; i < validCount; i++) {
	    int ip = (i + ipa) & (scope.scopePointCount - 1);
	    vReal[i] = .5 * (vPlot.maxValues[ip] + vPlot.minValues[ip]);
	    iReal[i] = .5 * (iPlot.maxValues[ip] + iPlot.minValues[ip]);
	}
	fft.fft(vReal, vImag, true);
	fft.fft(iReal, iImag, true);
	int fund = 1;
	double maxM = 0;
	for (int i = 1; i < scope.scopePointCount / 2; i++) {
	    double m = fft.magnitude(vReal[i], vImag[i]);
	    if (m > maxM) { maxM = m; fund = i; }
	}
	if (maxM < 1e-8)
	    return;
	double angleV = Math.atan2(vImag[fund], vReal[fund]);
	double angleI = Math.atan2(iImag[fund], iReal[fund]);
	double angle = (angleV - angleI) * 180 / Math.PI;
	while (angle > 180) angle -= 360;
	while (angle < -180) angle += 360;
	scope.drawInfoText(g, Locale.LS("Phase angle: ") + CircuitElm.showFormat.format(angle) + "°");
    }

    int addCursorInfo(String[] info, int ct, int mouseCursorX) {
	double maxFrequency = 1 / (scope.sim.maxTimeStep * scope.speed * 2);
	info[ct++] = CircuitElm.getUnitText(maxFrequency * (mouseCursorX - scope.rect.x) / scope.rect.width, "Hz");
	if (fft != null && fftReal != null && fftMaxMagnitude > 0) {
	    int fftIndex = (mouseCursorX - scope.rect.x) * scope.scopePointCount / (2 * scope.rect.width);
	    if (fftIndex >= 0 && fftIndex < scope.scopePointCount / 2) {
		double mag = fft.magnitude(fftReal[fftIndex], fftImag[fftIndex]);
		double db = 20 * Math.log(mag / fftMaxMagnitude) / Math.log(10);
		info[ct++] = Math.round(db) + " dB";
	    }
	}
	return ct;
    }
}
