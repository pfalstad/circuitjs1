package com.falstad.afilter.client;

    class InductorElm extends CircuitElm {
	double inductance;
	double compResistance;
	public InductorElm(int xx, int yy) { super(xx, yy); inductance = 1; }
	public InductorElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    inductance = new Double(st.nextToken()).doubleValue();
	    current = new Double(st.nextToken()).doubleValue();
	}
	int getDumpType() { return 'l'; }
	String dump() {
	    return super.dump() + " " + inductance + " " + current;
	}
	void setPoints() {
	    super.setPoints();
	    calcLeads(32);
	}
	void draw(Graphics g) {
	    double v1 = volts[0];
	    double v2 = volts[1];
	    double r = sim.omega*inductance;
	    int i;
	    int hs = 8;
	    setBbox(point1, point2, hs);
	    draw2Leads(g);
	    setPowerColor(g, false);
	    setAdmittanceColor(g, r);
	    drawCoil(g, 8, lead1, lead2, v1, v2);
	    if (sim.showValuesCheckItem.getState()) {
		String s = getShortUnitText(inductance, "H");
		drawValues(g, s, hs);
	    }
	    doDots(g);
	    drawPosts(g);
	}
	void reset() { current = volts[0] = volts[1] = curcount = 0; }
	void stamp() {
	    sim.stampReactance(nodes[0], nodes[1], sim.omega*inductance);
	}
	void calculateCurrent() {
	    Complex q = new Complex(volts[0]-volts[1], voltsi[0]-voltsi[1]);
	    q.mult(0, 1/(sim.omega*inductance));
	    current = q.re;
	    currenti = q.im;
	}
	void getInfo(String arr[]) {
	    arr[0] = "inductor";
	    int x = getBasicInfo(arr);
	    arr[x++] = "L = " + getUnitText(inductance, "H");
	    arr[x++] = "P = " + getUnitText(getPower(), "W");
	}
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("Inductance (H)", inductance, 0, 0);
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    inductance = ei.value;
	}
	double getInductance() { return inductance; }
	void setInductance(double ii) {
	    inductance = ii;
	}
	double getValue() { return inductance; }
	void setValue(double c) { inductance = c; }
    }
