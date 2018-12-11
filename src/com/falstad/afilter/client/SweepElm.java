package com.falstad.afilter.client;

class SweepElm extends CircuitElm {
    double maxV, maxF, minF, sweepTime, frequency;
    final int FLAG_LOG = 1;
    final int FLAG_BIDIR = 2;
	
    public SweepElm(int xx, int yy) {
	super(xx, yy);
	minF = 20; maxF = 4000;
	maxV = 5;
	sweepTime = .1;
	flags = FLAG_BIDIR;
	reset();
    }
    public SweepElm(int xa, int ya, int xb, int yb, int f, StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	minF = new Double(st.nextToken()).doubleValue();
	maxF = new Double(st.nextToken()).doubleValue();
	maxV = new Double(st.nextToken()).doubleValue();
	sweepTime = new Double(st.nextToken()).doubleValue();
	reset();
    }
    int getDumpType() { return 170; }
    int getPostCount() { return 1; }
    final int circleSize = 17;

    String dump() {
	return super.dump() + " " + minF + " " + maxF + " " + maxV + " " +
	    sweepTime;
    }
    void setPoints() {
	super.setPoints();
	lead1 = interpPoint(point1, point2, 1-circleSize/dn);
    }
    void draw(Graphics g) {
	setBbox(point1, point2, circleSize);
	setVoltageColor(g, volts[0]);
	drawThickLine(g, point1, lead1);
	g.setColor(needsHighlight() ? selectColor : Color.gray);
	setPowerColor(g, false);
	int xc = point2.x; int yc = point2.y;
	drawThickCircle(g, xc, yc, circleSize);
	int wl = 8;
//	CirSim.console("draw sweep " + point1 + " " + point2);
	adjustBbox(xc-circleSize, yc-circleSize,
		   xc+circleSize, yc+circleSize);
//	CirSim.console("adjust bbox " + boundingBox);
	int i;
	int xl = 10;
	int ox = -1, oy = -1;
	long tm = System.currentTimeMillis();
	//double w = (this == mouseElm ? 3 : 2);
	tm %= 2000;
	if (tm > 1000)
	    tm = 2000-tm;
	double w = 1+tm*.002;
	if (!sim.stoppedCheck.getState())
	    w = 1+2*(frequency-minF)/(maxF-minF);
	for (i = -xl; i <= xl; i++) {
	    int yy = yc+(int) (.95*Math.sin(i*pi*w/xl)*wl);
	    if (ox != -1)
		drawThickLine(g, ox, oy, xc+i, yy);
	    ox = xc+i; oy = yy;
	}
	if (sim.showValuesCheckItem.getState()) {
	    String s = getShortUnitText(sim.frequency, "Hz");
	    if (dx == 0 || dy == 0)
		drawValues(g, s, circleSize);
	}
	    
	drawPosts(g);
	curcount = updateDotCount(-current, curcount);
	if (sim.dragElm != this)
	    drawDots(g, point1, lead1, curcount);
    }
	
    void stamp() {
	sim.stampVoltageSource(0, nodes[0], voltSource, 1);
    }
    double fadd, fmul, freqTime;
    int dir = 1;
    void setParams() {
	if (frequency < minF || frequency > maxF) {
	    frequency = minF;
	    freqTime = 0;
	    dir = 1;
	}
	if ((flags & FLAG_LOG) == 0) {
	    fadd = dir*sim.timeStep*(maxF-minF)/sweepTime;
	    fmul = 1;
	} else {
	    fadd = 0;
	    fmul = Math.pow(maxF/minF, dir*sim.timeStep/sweepTime);
	}
    }
    void reset() {
	super.reset();
	frequency = minF;
	freqTime = 0;
	dir = 1;
	setParams();
    }
    double v;
    void startIteration() { v = 1; }
    void doStep() {
	sim.updateVoltageSource(0, nodes[0], voltSource, v);
    }
	
    double getVoltageDiff() { return volts[0]; }
    int getVoltageSourceCount() { return 1; }
    boolean hasGroundConnection(int n1) { return true; }
    void getInfo(String arr[]) {
	arr[0] = "input";
	arr[1] = "I = " + getCurrentDText(getCurrent());
	arr[2] = getPeakIText(current, currenti);
	arr[3] = "V = " + getVoltageText(volts[0]);
	arr[4] = getPeakVText(volts[0], voltsi[0]);
	arr[5] = "f = " + getUnitText(sim.frequency, "Hz");
    }
    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Min Frequency (Hz)", minF, 0, 0);
	if (n == 1)
	    return new EditInfo("Max Frequency (Hz)", maxF, 0, 0);
	if (n == 2)
	    return new EditInfo("Sweep Time (s)", sweepTime, 0, 0);
	if (n == 3) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Logarithmic", (flags & FLAG_LOG) != 0);
	    return ei;
	}
	if (n == 4)
	    return new EditInfo("Max Voltage", maxV, 0, 0);
	if (n == 5) {
	    EditInfo ei = new EditInfo("", 0, -1, -1);
	    ei.checkbox = new Checkbox("Bidirectional", (flags & FLAG_BIDIR) != 0);
	    return ei;
	}
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0)
	    minF = ei.value;
	if (n == 1)
	    maxF = ei.value;
	if (n == 2)
	    sweepTime = ei.value;
	if (n == 3) {
	    flags &= ~FLAG_LOG;
	    if (ei.checkbox.getState())
		flags |= FLAG_LOG;
	}
	if (n == 4)
	    maxV = ei.value;
	if (n == 5) {
	    flags &= ~FLAG_BIDIR;
	    if (ei.checkbox.getState())
		flags |= FLAG_BIDIR;
	}
	setParams();
    }
    int getShortcut() { return 'i'; }
}
    
