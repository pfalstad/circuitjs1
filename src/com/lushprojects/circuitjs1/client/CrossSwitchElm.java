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

    class CrossSwitchElm extends SwitchElm {
	final int poleCount = 2;
	
	public CrossSwitchElm(int xx, int yy) {
	    super(xx, yy, false);
	    noDiagonal = true;
	}
	CrossSwitchElm(int xx, int yy, boolean mm) {
	    super(xx, yy, mm);
	    noDiagonal = true;
	}
	public CrossSwitchElm(int xa, int ya, int xb, int yb, int f,
			  StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	    noDiagonal = true;
	}
	int getDumpType() { return 430; }

	final int openhs = 16;
	final int posCount = 2;
	Point poleLeads[], throwLeads[], polePosts[], throwPosts[], linePoints[];
	Point crossPoints[];
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
	    crossPoints = newPointArray(6);
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
	    double dp = 16/dn;
	    interpPoint(point1, point2, crossPoints[0], 1+dp  , openhs);
	    interpPoint(point1, point2, crossPoints[1], 1+dp*2, openhs);
	    interpPoint(point1, point2, crossPoints[2], 1+dp*3, openhs);
	    interpPoint(point1, point2, crossPoints[3], 1+dp*2, -openhs);
	    interpPoint(point1, point2, crossPoints[4], 1+dp  , -openhs*4);
	    interpPoint(point1, point2, crossPoints[5], 1+dp*3, -openhs*4);
	}
	
	void draw(Graphics g) {
	    setBbox(point1, point2, 1);
	    adjustBbox(crossPoints[2], crossPoints[5]);

	    int i;

	    setVoltageColor(g, volts[1]);
	    drawThickLine(g, crossPoints[1], crossPoints[2]);
	    drawThickLine(g, crossPoints[1], crossPoints[3]);
	    drawThickLine(g, crossPoints[3], throwPosts[0]);
	    drawThickLine(g, throwPosts[0], throwPosts[3]);
	    setVoltageColor(g, volts[3]);
	    drawThickLine(g, throwPosts[2], crossPoints[5]);
	    drawThickLine(g, throwPosts[1], crossPoints[0]);
	    drawThickLine(g, crossPoints[0], crossPoints[4]);
		
	    for (i = 0; i != poleCount; i++) {
		setVoltageColor(g, volts[i*2]);
		drawThickLine(g, polePosts[i],      poleLeads[i]);
		setVoltageColor(g, volts[i*2+1]);
                if (useIECSymbol())
                    drawThickLine(g, throwLeads[i*4  ], throwLeads[i*4+2]);
		drawThickLine(g, throwPosts[i*2  ], throwLeads[i*4  ]);
		setVoltageColor(g, volts[3-i*2]);
		drawThickLine(g, throwPosts[i*2+1], throwLeads[i*4+1]);
		
	        // draw line
		if (!needsHighlight())
		    g.setColor(Color.lightGray);
		
	        if (i < poleCount-1) {
	            int offset = -i*openhs*3;
	            int adj = position*-3;
	            interpPoint(point1, point2, linePoints[0], .5, offset-openhs*(.5-position)+adj);
	            interpPoint(point1, point2, linePoints[1], .5, offset-openhs*3-openhs*(.5-position)+7+adj);
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
		if (i == 1 && position == 0)
		    drawDots(g, throwPosts[2], crossPoints[5], curcounts[1]);
		if (i == 0 && position == 1) {
		    drawDots(g, throwPosts[1], crossPoints[0], curcounts[0]);
		    drawDots(g, crossPoints[0], crossPoints[4], curcounts[0]);
		    drawDots(g, crossPoints[4], crossPoints[5], curcounts[0]);
		}
		if (i == 1 && position == 1)
		    drawDots(g, throwPosts[3], throwPosts[0], curcounts[1]);
		drawDots(g, throwPosts[0], crossPoints[3], curcounts[position]);
		drawDots(g, crossPoints[3], crossPoints[1], curcounts[position]);
		drawDots(g, crossPoints[1], crossPoints[2], curcounts[position]);
	    }
	    
	    drawPosts(g);
	    drawPost(g, throwPosts[0]);
	    drawPost(g, crossPoints[4]);
	}
	
	double getCurrentIntoNode(int n) {
	    if (n == 0 || n == 2)
		return -currents[n/2];
	    if (position == 0)
		return currents[n/2];
	    return currents[1-n/2];
	}

	void setCurrent(int vn, double c) {
	    if (vn == voltageSources[0])
		currents[0] = c;
	    else
		currents[1] = c;
	}
	
	Rectangle getSwitchRect() {
	    return new Rectangle(poleLeads[0]).union(new Rectangle(throwLeads[1])).union(new Rectangle(throwLeads[poleCount*4-4]));
	}	

	Point getPost(int n) {
	    if (n == 0 || n == 2)
		return polePosts[n/2];
	    if (n == 1)
		return crossPoints[2];
	    return crossPoints[5];
	}
	int getPostCount() { return 2*poleCount; }
	void calculateCurrent() {
	}
	
        void setVoltageSource(int j, int vs) {
            voltageSources[j] = vs;
        }

	void stamp() {
	    int i;
	    if (position == 0) {
		for (i = 0; i != poleCount; i++)
		    sim.stampVoltageSource(nodes[i*2], nodes[i*2+1], voltageSources[i], 0);
	    } else {		
		for (i = 0; i != poleCount; i++)
		    sim.stampVoltageSource(nodes[i*2], nodes[3-i*2], voltageSources[i], 0);
	    }
	}
		
	int getVoltageSourceCount() {
	    return poleCount;
	}
	
	boolean getConnection(int n1, int n2) {
	    if (position == 0)
		return comparePair(n1, n2, 0, 1) || comparePair(n1, n2, 2, 3);
	    else
		return comparePair(n1, n2, 0, 3) || comparePair(n1, n2, 2, 1);
	}
	
	boolean isWireEquivalent() { return true; }
	
	// optimizing out this element is too complicated to be worth it (see #646)
	boolean isRemovableWire() { return false; }

	String getElmType() { return "cross switch"; }
	void getInfo(String arr[]) {
	    arr[0] = "cross switch";
	    int i;
	    for (i = 0; i != poleCount; i++)
		arr[i+1] = "I" + (i+1) + " = " + getCurrentDText(currents[i]);
	}
	
	int getShortcut() { return 0; }

	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return EditInfo.createCheckbox("IEC Symbol", useIECSymbol());
	    return null;
	}
	
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0) {
		flags = ei.changeFlag(flags, FLAG_IEC);
		setPoints();
	    }
	}

    }
