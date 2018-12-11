package com.falstad.afilter.client;

    class CapacitorElm extends CircuitElm {
	double capacitance;
	double compResistance, voltdiff;
	Point plate1[], plate2[];
	public CapacitorElm(int xx, int yy) {
	    super(xx, yy);
	    capacitance = 1e-5;
	}
	public CapacitorElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    capacitance = new Double(st.nextToken()).doubleValue();
	    voltdiff = new Double(st.nextToken()).doubleValue();
	}
	int getDumpType() { return 'c'; }
	String dump() {
	    return super.dump() + " " + capacitance + " " + voltdiff;
	}
	void setPoints() {
	    super.setPoints();
	    double f = (dn/2-4)/dn;
	    // calc leads
	    lead1 = interpPoint(point1, point2, f);
	    lead2 = interpPoint(point1, point2, 1-f);
	    // calc plates
	    plate1 = newPointArray(2);
	    plate2 = newPointArray(2);
	    interpPoint2(point1, point2, plate1[0], plate1[1], f, 12);
	    interpPoint2(point1, point2, plate2[0], plate2[1], 1-f, 12);
	}
	
	void draw(Graphics g) {
	    int hs = 12;
	    setBbox(point1, point2, hs);
	    double r = 1/(sim.omega*capacitance);
	    
	    // draw first lead and plate
	    setVoltageColor(g, volts[0]);
	    drawThickLine(g, point1, lead1);
	    setPowerColor(g, false);
	    setAdmittanceColor(g, r);
	    drawThickLine(g, plate1[0], plate1[1]);
	    if (sim.powerCheckItem.getState())
		g.setColor(Color.gray);
	    else if (sim.admittanceCheckItem.getState())
		g.setColor(whiteColor);

	    // draw second lead and plate
	    setVoltageColor(g, volts[1]);
	    drawThickLine(g, point2, lead2);
	    setPowerColor(g, false);
	    setAdmittanceColor(g, r);
	    drawThickLine(g, plate2[0], plate2[1]);
	    
	    updateDotCount();
	    if (sim.dragElm != this) {
		drawDots(g, point1, lead1, curcount);
		drawDots(g, point2, lead2, -curcount);
	    }
	    drawPosts(g);
	    if (sim.showValuesCheckItem.getState()) {
		String s = getShortUnitText(capacitance, "F");
		drawValues(g, s, hs);
	    }
	}
	void stamp() {
	    sim.stampReactance(nodes[0], nodes[1], -1/(sim.omega*capacitance));
	}
	void getInfo(String arr[]) {
	    arr[0] = "capacitor";
	    int x = getBasicInfo(arr);
	    arr[x++] = "C = " + getUnitText(capacitance, "F");
	    arr[x++] = "P = " + getUnitText(getPower(), "W");
	    //double v = getVoltageDiff();
	    //arr[4] = "U = " + getUnitText(.5*capacitance*v*v, "J");
	}
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("Capacitance (F)", capacitance, 0, 0);
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    capacitance = ei.value;
	}
 	void calculateCurrent() {
 	    Complex q = new Complex(volts[0]-volts[1], voltsi[0]-voltsi[1]);
 	    q.mult(0, -sim.omega*capacitance);
 	    current = q.re;
	    currenti = q.im;
 	}
 	double getCapacitance() { return capacitance; }
 	void setCapacitance(double c) { capacitance = c; }
 	double getValue() { return capacitance; }
 	void setValue(double c) { capacitance = c; }
	boolean needsShortcut() { return true; }
	int getShortcut() { return 'c'; }
    }
