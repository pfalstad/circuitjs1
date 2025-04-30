/*    
    Copyright (C) Paul Falstad and Iain Sharp
    
    This file is part of CircuitJS1.

    CircuitJS1 is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    CircuitJS1 is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with CircuitJS1.  If not, see <http://www.gnu.org/licenses/>.
*/

package com.lushprojects.circuitjs1.client;

    class DPDTSwitchElm extends SwitchElm {
	int poleCount;
	
	public DPDTSwitchElm(int xx, int yy) {
	    super(xx, yy, false);
	    noDiagonal = true;
	    poleCount = 2;
	}
	DPDTSwitchElm(int xx, int yy, boolean mm) {
	    super(xx, yy, mm);
	    noDiagonal = true;
	    poleCount = 2;
	}
	public DPDTSwitchElm(int xa, int ya, int xb, int yb, int f,
			  StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	    try {
		poleCount = new Integer(st.nextToken()).intValue();
	    } catch (Exception e) { }
	    noDiagonal = true;
	}
	int getDumpType() { return 429; }
	String dump() {
	    return super.dump() + " " + poleCount;
	}

	final int openhs = 16;
	final int posCount = 2;
	Point poleLeads[], throwLeads[], polePosts[], throwPosts[], linePoints[];
        int voltageSources[];
        double currents[], curcounts[];

	void setPoints() {
	    super.setPoints();
	    calcLeads(32);
	    voltageSources = new int[poleCount];
	    throwPosts = newPointArray(2*poleCount);
	    throwLeads = newPointArray(4*poleCount);
	    poleLeads = newPointArray(poleCount);
	    polePosts = newPointArray(poleCount);
	    linePoints = newPointArray(2);
	    currents = new double[poleCount];
	    curcounts = new double[poleCount];
	    int i;
	    for (i = 0; i != poleCount; i++) {
		int offset = -i*openhs*3;
		interpPoint(point1, point2, polePosts[i], 0, offset);
		interpPoint(lead1,  lead2,  poleLeads[i], 0, offset);
		interpPoint(point1, point2, throwPosts[i*2  ], 1, offset-openhs);
		interpPoint(lead1,  lead2,  throwLeads[i*4  ], 1, offset-openhs);
		interpPoint(point1, point2, throwPosts[i*2+1], 1, offset+openhs);
		interpPoint(lead1,  lead2,  throwLeads[i*4+1], 1, offset+openhs);
		interpPoint(lead1,  lead2,  throwLeads[i*4+2], 1, offset+openhs*.33);
		if (useIECSymbol())
		    interpPoint(lead1,  lead2,  throwLeads[i*4+3], 1.2, offset-openhs*.33);
		else
		    interpPoint(lead1,  lead2,  throwLeads[i*4+3], 1, offset-openhs);
	    }
	}
	
	void draw(Graphics g) {
	    setBbox(point1, point2, 1);
	    adjustBbox(throwPosts[1], throwPosts[poleCount*2-2]);

	    int i;
	    for (i = 0; i != poleCount; i++) {
		setVoltageColor(g, volts[i*3]);
		drawThickLine(g, polePosts[i],      poleLeads[i]);
		setVoltageColor(g, volts[i*3+1]);
		drawThickLine(g, throwPosts[i*2  ], throwLeads[i*4  ]);
		if (useIECSymbol())
		    drawThickLine(g, throwLeads[i*4  ], throwLeads[i*4+2]);
		setVoltageColor(g, volts[i*3+2]);
		drawThickLine(g, throwPosts[i*2+1], throwLeads[i*4+1]);
		
	        // draw line
		if (!needsHighlight())
		    g.setColor(Color.lightGray);
		
	        if (i < poleCount-1) {
	            int offset = -i*openhs*3;
	            interpPoint(point1, point2, linePoints[0], .5, offset-openhs*(.5-position)-4*position); // top
	            interpPoint(point1, point2, linePoints[1], .5, offset-openhs*3-openhs*(.5-position)+3+8*(1-position));
	            g.setLineDash(4, 4);
	            g.drawLine(linePoints[0], linePoints[1]);
	            g.setLineDash(0,  0);
	        }
		
		// draw switch
		if (!needsHighlight())
		    g.setColor(whiteColor);
		drawThickLine(g, poleLeads[i], throwLeads[i*4+3-position*2]);
		
		// current
		curcounts[i] = updateDotCount(currents[i], curcounts[i]);
		drawDots(g, polePosts[i], poleLeads[i], curcounts[i]);
		drawDots(g, throwLeads[i*4+position], throwPosts[i*2+position], curcounts[i]);
	    }
	    
	    drawPosts(g);
	}
	
	double getCurrentIntoNode(int n) {
	    int t = n/3;
	    int n3 = n % 3;
	    if (n3 == 0)
		return -currents[t];
	    if (n3 == position+1)
		return currents[t];
	    return 0;
	}

	void setCurrent(int vn, double c) {
	    int i;
	    for (i = 0; i != poleCount; i++)
		if (vn == voltageSources[i])
		    currents[i] = c;
	}
	Rectangle getSwitchRect() {
	    return new Rectangle(poleLeads[0]).union(new Rectangle(throwLeads[1])).union(new Rectangle(throwLeads[poleCount*4-4]));
	}	

	Point getPost(int n) {
	    int t = n/3;
	    int n3 = n % 3;
	    if (n3 == 0)
		return polePosts[t];
	    return throwPosts[t*2+n3-1];
	}
	int getPostCount() { return 3*poleCount; }
	void calculateCurrent() {
	}
	
        void setVoltageSource(int j, int vs) {
            voltageSources[j] = vs;
        }

	void stamp() {
	    int i;
	    for (i = 0; i != poleCount; i++)
		sim.stampVoltageSource(nodes[i*3], nodes[position+1+i*3], voltageSources[i], 0);
	}
		
	int getVoltageSourceCount() {
	    return poleCount;
	}
	
	boolean getConnection(int n1, int n2) {
	    return comparePair(n1, n2, 0, 1+position) || comparePair(n1, n2, 3, 4+position);
	}
	
	boolean isWireEquivalent() { return true; }
	
	// optimizing out this element is too complicated to be worth it (see #646)
	boolean isRemovableWire() { return false; }

	void getInfo(String arr[]) {
	    arr[0] = (poleCount == 2) ? "switch (DPDT)" : "switch (" + poleCount + "PDT)";
	    int i;
	    for (i = 0; i != poleCount; i++)
		arr[i+1] = "I" + (i+1) + " = " + getCurrentDText(currents[i]);
	}
	
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
	    	return new EditInfo("# of Poles", poleCount, 2, 10).setDimensionless();
	    if (n == 1)
		return EditInfo.createCheckbox("IEC Symbol", useIECSymbol());
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0 && ei.value >= 2) {
		poleCount = (int) ei.value;
		allocNodes();
		setPoints();
	    }
	    if (n == 1) {
		flags = ei.changeFlag(flags, FLAG_IEC);
		setPoints();
	    }
	}
	
	int getShortcut() { return 0; }

	void flip() {
	    if (dx == 0)
		x = x2 = x - (int) (dpx1*openhs*3);
	    if (dy == 0)
		y = y2 = y - (int) (dpy1*openhs*3);
	    position = 1-position;
	}

	void flipX(int c2, int count) {
	    flip();
	    super.flipX(c2, count);
	}

	void flipY(int c2, int count) {
	    flip();
	    super.flipY(c2, count);
	}

	void flipXY(int c2, int count) {
	    flip();
	    super.flipXY(c2, count);
	}
    }
