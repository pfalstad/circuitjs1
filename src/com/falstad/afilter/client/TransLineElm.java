package com.falstad.afilter.client;

class TransLineElm extends CircuitElm {
    double delay, imped;
    int width;
    public TransLineElm(int xx, int yy) {
	super(xx, yy);
	delay = 1000*sim.timeStep;
	imped = 75;
	noDiagonal = true;
	reset();
    }
    public TransLineElm(int xa, int ya, int xb, int yb, int f,
			StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	delay = new Double(st.nextToken()).doubleValue();
	imped = new Double(st.nextToken()).doubleValue();
	width = new Integer(st.nextToken()).intValue();
	// next slot is for resistance (losses), which is not implemented
	st.nextToken();
	noDiagonal = true;
	reset();
    }
    int getDumpType() { return 171; }
    int getPostCount() { return 4; }
    int getInternalNodeCount() { return 2; }
    String dump() {
	return super.dump() + " " + delay + " " + imped + " " + width + " " + 0.;
    }
    void drag(int xx, int yy) {
	xx = sim.snapGrid(xx);
	yy = sim.snapGrid(yy);
	int w1 = max(sim.gridSize, abs(yy-y));
	int w2 = max(sim.gridSize, abs(xx-x));
	if (w1 > w2) {
	    xx = x;
	    width = w2;
	} else {
	    yy = y;
	    width = w1;
	}
	x2 = xx; y2 = yy;
	setPoints();
    }
	
    Point posts[], inner[];
	
    void reset() {
	if (sim.timeStep == 0)
	    return;
	current1 = current2 = 0;
	super.reset();
    }
    void setPoints() {
	super.setPoints();
	int ds = (dy == 0) ? sign(dx) : -sign(dy);
	Point p3 = interpPoint(point1, point2, 0, -width*ds);
	Point p4 = interpPoint(point1, point2, 1, -width*ds);
	int sep = sim.gridSize/2;
	Point p5 = interpPoint(point1, point2, 0, -(width/2-sep)*ds);
	Point p6 = interpPoint(point1, point2, 1, -(width/2-sep)*ds);
	Point p7 = interpPoint(point1, point2, 0, -(width/2+sep)*ds);
	Point p8 = interpPoint(point1, point2, 1, -(width/2+sep)*ds);
	    
	// we number the posts like this because we want the lower-numbered
	// points to be on the bottom, so that if some of them are unconnected
	// (which is often true) then the bottom ones will get automatically
	// attached to ground.
	posts = new Point[] { p3, p4, point1, point2 };
	inner = new Point[] { p7, p8, p5, p6 };
    }
    void draw(Graphics g) {
	setBbox(posts[0], posts[3], 0);
	int segments = (int) (dn/2);
	double segf = 1./segments;
	int i;
	g.setColor(Color.darkGray);
	g.fillRect(inner[2].x, inner[2].y,
		   inner[1].x-inner[2].x+2, inner[1].y-inner[2].y+2);
	for (i = 0; i != 4; i++) {
	    setVoltageColor(g, volts[i]);
	    drawThickLine(g, posts[i], inner[i]);
	}
	Complex vl = new Complex(volts [2]-volts [0]+volts [2]-volts [4],
				 voltsi[2]-voltsi[0]+voltsi[2]-voltsi[4]);
	Complex vr = new Complex(volts [3]-volts [1]+volts [3]-volts [5],
				 voltsi[3]-voltsi[1]+voltsi[3]-voltsi[5]);
	double rot = -delay*2*pi*sim.frequency/segments;
	vr.rotate(rot*segments);
	for (i = 0; i != segments; i++) {
	    setVoltageColor(g, vl.re+vr.re);
	    vl.rotate(rot);
	    vr.rotate(-rot);
	    interpPoint(inner[0], inner[1], ps1, i*segf);
	    interpPoint(inner[2], inner[3], ps2, i*segf);
	    g.drawLine(ps1.x, ps1.y, ps2.x, ps2.y);
	    interpPoint(inner[2], inner[3], ps1, (i+1)*segf);
	    drawThickLine(g, ps1, ps2);
	}
	setVoltageColor(g, volts[0]);
	drawThickLine(g, inner[0], inner[1]);
	drawPosts(g);

	curCount1 = updateDotCount(-current1, curCount1);
	curCount2 = updateDotCount(current2, curCount2);
	if (sim.dragElm != this) {
	    drawDots(g, posts[0], inner[0], curCount1);
	    drawDots(g, posts[2], inner[2], -curCount1);
	    drawDots(g, posts[1], inner[1], -curCount2);
	    drawDots(g, posts[3], inner[3], curCount2);
	}
    }

    int voltSource1, voltSource2;
    double current1, current2, curCount1, curCount2;
    void setVoltageSource(int n, int v) {
	if (n == 0)
	    voltSource1 = v;
	else
	    voltSource2 = v;
    }
    void setCurrent(int v, double cr, double ci) {
	if (v == voltSource1)
	    current1 = cr;
	else
	    current2 = cr;
    }
	
    void stamp() {
	sim.stampResistor(nodes[2], nodes[4], imped);
	sim.stampResistor(nodes[3], nodes[5], imped);
	// -(v20 + v24) -> voltSource2
	// -(v31 + v35) -> voltSource1
	Complex coef = new Complex();
	coef.setMagPhase(1, -delay*2*pi*sim.frequency);
	sim.stampVoltageSource(nodes[4], nodes[0], voltSource1);
	sim.stampVCVS(nodes[3], nodes[1], coef, voltSource1);
	sim.stampVCVS(nodes[3], nodes[5], coef, voltSource1);
	sim.stampVoltageSource(nodes[5], nodes[1], voltSource2);
	sim.stampVCVS(nodes[2], nodes[0], coef, voltSource2);
	sim.stampVCVS(nodes[2], nodes[4], coef, voltSource2);
    }

    Point getPost(int n) {
	return posts[n];
    }
	
    //double getVoltageDiff() { return volts[0]; }
    int getVoltageSourceCount() { return 2; }
    boolean hasGroundConnection(int n1) { return false; }
    boolean getConnection(int n1, int n2) {
	return false;
	/*if (comparePair(n1, n2, 0, 1))
	  return true;
	  if (comparePair(n1, n2, 2, 3))
	  return true;
	  return false;*/
    }
    void getInfo(String arr[]) {
	arr[0] = "transmission line";
	arr[1] = getUnitText(imped, sim.ohmString);
	arr[2] = "delay = " + getUnitText(delay, "s");
	arr[3] = "length = " + getUnitText(2.9979e8*delay, "m");
	if (sim.frequency*delay > .01)
	    arr[4] = "  (" + CircuitElm.showFormat.format(sim.frequency*delay) + "\u03bb)";
    }
    public EditInfo getEditInfo(int n) {
	if (n == 0)
	    return new EditInfo("Delay (ns)", delay*1e9, 0, 0);
	if (n == 1)
	    return new EditInfo("Impedance (ohms)", imped, 0, 0);
	return null;
    }
    public void setEditValue(int n, EditInfo ei) {
	if (n == 0) {
	    delay = ei.value*1e-9;
	    reset();
	}
	if (n == 1) {
	    imped = ei.value;
	    reset();
	}
    }
    double getDelay() { return delay; }
    void setDelay(double d) { delay = d; }
}

