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

import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;

class WattmeterTrueElm extends CircuitElm {
    int width;
    VoltageSource voltSources[];
    double currents[];
    double curcounts[];

    int meter = 0; // 0=instantaneous, 1=average
    final int PM_INST = 0;
    final int PM_AVG = 1;
	int selectedValue=0;
    double avgPower, totalPower, count;
    int zerocount;
    double maxP, lastMaxP, minP, lastMinP;
    boolean increasingP = true, decreasingP = true;

    public WattmeterTrueElm(int xx, int yy) {
	super(xx, yy);
	setup();
    }
    public WattmeterTrueElm(int xa, int ya, int xb, int yb, int f,
	    StringTokenizer st) {
	super(xa, ya, xb, yb, f);
	width = Integer.parseInt(st.nextToken());
        try {
			meter = Integer.parseInt(st.nextToken());
        } catch (Exception e) {}
	setup();
    }

    void setup() {
	voltSources = new VoltageSource[2];
	currents = new double[2];
	curcounts = new double[2];
    }
    String dump() { return super.dump() + " " + width + " " + meter; }

    void dumpXml(Document doc, Element elem) {
	super.dumpXml(doc, elem);
	XMLSerializer.dumpAttr(elem, "w", width);
	XMLSerializer.dumpAttr(elem, "meter", meter);
    }
    void undumpXml(XMLDeserializer xml) {
	super.undumpXml(xml);
	width = xml.parseIntAttr("w", width);
	meter = xml.parseIntAttr("meter", meter);
	setup();
    }

    int getVoltageSourceCount() { return 1; }

//	Change 502 to whatever seems appropriate
    int getDumpType() { return 502; }
    int getPostCount() { return 4; }

    void drag(int xx, int yy) {
	xx = snapGrid(xx);
	yy = snapGrid(yy);
	int w1 = max(app.gridSize, abs(yy-y));
	int w2 = max(app.gridSize, abs(xx-x));
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

    Point posts[];
    Point inner[];
    int maxTextLen;

    void setPoints() {
	super.setPoints();
	int ds = (dy == 0) ? sign(dx) : -sign(dy);
	
	// get 2 more terminals
	Point p3 = interpPoint(point1, point2, 0, -width*ds);
	Point p4 = interpPoint(point1, point2, 1, -width*ds);
	
	// get stubs
	int sep = app.gridSize;
	Point p5 = interpPoint(point1, point2,   sep/dn);
	Point p6 = interpPoint(point1, point2, 1-sep/dn);
	Point p7 = interpPoint(p3, p4,   sep/dn);
	Point p8 = interpPoint(p3, p4, 1-sep/dn);

	// we number the posts like this because we want the lower-numbered
	// points to be on the bottom, so that if some of them are unconnected
	// (which is often true) then the bottom ones will get automatically
	// attached to ground.
	posts = new Point[] { p3, p4, point1, point2 };
	inner = new Point[] { p7, p8, p5, p6 };

	// get rectangle
	Point r1 = interpPoint(point1, point2,   sep/dn, ds*sep);
	Point r2 = interpPoint(point1, point2, 1-sep/dn, ds*sep);
	Point r3 = interpPoint(point1, point2,   sep/dn, -ds*(sep+width));
	Point r4 = interpPoint(point1, point2, 1-sep/dn, -ds*(sep+width));
	rectPointsX = new int[] { r1.x, r2.x, r4.x, r3.x };
	rectPointsY = new int[] { r1.y, r2.y, r4.y, r3.y };

	center = interpPoint(r1, r4, .5);
	maxTextLen = max(abs(r1.x-r4.x)-5, 5);
    }

    int rectPointsX[], rectPointsY[];
    Point center;

    Point getPost(int n) {
	return posts[n];
    }

    void stamp() {
	//	2  3
	//	0  1
	// zero-valued voltage source from 2 to 3, so we can measure current
	sim.stampVoltageSource(nodes[2], nodes[3], voltSources[0], 0);
	// but turn nodes 0 to 1 into a resistor, so we can measure voltage
    sim.stampResistor(nodes[0], nodes[1], 1e8);
    }

    void setVoltageSource(int j, VoltageSource vs) {
	voltSources[j] = vs;
    }

    void draw(Graphics g) {
		int i;
		for (i = 0; i != 2; i++)
			curcounts[i] = updateDotCount(currents[i], curcounts[i]);
		double flip = 1;
		for (i = 0; i != 4; i++) {
			setVoltageColor(g, volts[i]);
			drawThickLine(g, posts[i], inner[i]);
			if (i == 2 || i == 3)
				drawDots(g, posts[i], inner[i], curcounts[i/2]*flip);
			if (i==2)	// Ammeter + terminal
			{	
				g.setColor(Color.yellow);
				int w = (int)g.context.measureText("+").getWidth();
				Point plusPoint = interpPoint(posts[i], inner[i], (dn/2-4)/dn, 5 );
				g.drawString("+", plusPoint.x-w/2, plusPoint.y);
			}
			else if (i==1)	// Voltmeter + terminal
			{	
				int w = (int)g.context.measureText("+").getWidth();
				Point plusPoint = interpPoint(posts[i], inner[i], (dn/2-4)/dn, 13 );
				g.drawString("+", plusPoint.x-w/2, plusPoint.y);
			}
			flip *= -1;
		}

		g.setColor(needsHighlight() ? selectColor : lightGrayColor);
		drawThickPolygon(g, rectPointsX, rectPointsY, 4);
	
//	Set bounding box to be full watt-meter box
		setBbox(rectPointsX[0], rectPointsY[0], rectPointsX[2], rectPointsY[2]);
		drawPosts(g);

		String str = getUnitText(getMeterPower(), "W");
		g.save();
		int fsize = 15;
		int w;
	// adjust font size to fit
		while (true) {
			g.setFont(new Font("SansSerif", 0, fsize));
			w=(int)g.context.measureText(str).getWidth();
			if (w < maxTextLen)
			break;
			fsize--;
		}
		g.setColor(whiteColor);
		g.context.setTextBaseline("middle");
		g.drawString(str, center.x-w/2, center.y);
		g.restore();
    }

    void stepFinished(){
	double p = getPower();
	count++;
	totalPower += p;
	if (p > maxP && increasingP) {
	    maxP = p;
	    increasingP = true;
	    decreasingP = false;
	}
	if (p < maxP && increasingP) {
	    lastMaxP = maxP;
	    minP = p;
	    increasingP = false;
	    decreasingP = true;
	    avgPower = totalPower / count;
	    if (Double.isNaN(avgPower))
		avgPower = 0;
	    count = 0;
	    totalPower = 0;
	}
	if (p < minP && decreasingP) {
	    minP = p;
	    increasingP = false;
	    decreasingP = true;
	}
	if (p > minP && decreasingP) {
	    lastMinP = minP;
	    maxP = p;
	    increasingP = true;
	    decreasingP = false;
	    avgPower = totalPower / count;
	    if (Double.isNaN(avgPower))
		avgPower = 0;
	    count = 0;
	    totalPower = 0;
	}
	if (p == 0) {
	    zerocount++;
	    if (zerocount > 5) {
		totalPower = 0;
		avgPower = 0;
		maxP = 0;
		minP = 0;
	    }
	} else {
	    zerocount = 0;
	}
    }

    void setCurrent(VoltageSource vn, double c) {
		currents[vn == voltSources[1] ? 0 : 1] = c;
    }
    double getCurrentIntoNode(int n) {
		if (n % 2 == 0)
			return -currents[n/2];
		else
			return currents[n/2];
    }

    boolean getConnection(int n1, int n2) { return (n1/2) == (n2/2); }
    boolean hasGroundConnection(int n1) { return false; }

    void getInfo(String arr[]) {
		arr[0] = "Wattmeter (true)";
		getBasicInfo(arr);
		double P = getPower();
		arr[3] = "P = " + getUnitText(getVoltageDiff()*getCurrent(), "W");
		arr[4] = "P = " + getUnitText(getAveragePower(), "W");
   }

    double getPower() {return getVoltageDiff()*getCurrent();} 

    double getMeterPower() { 
		double value;
        switch (meter) {
        case PM_INST:
            value = getVoltageDiff()*getCurrent();
            break;
        case PM_AVG:
            value = getAveragePower();
            break;
		default:
			value = -1;
		}
		return value;
	}

    boolean canViewInScope() { return true; }
    double getCurrent() { return currents[1]; }
    double getVoltageDiff() { return volts[1]-volts[0]; }
	double getAveragePower() {return avgPower; }
	
    boolean canFlipX() { return false; }
    boolean canFlipY() { return false; }

    public EditInfo getEditInfo(int n) {
        if (n==0){
            EditInfo ei =  new EditInfo("Value", selectedValue, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("Instantaneous Power");
            ei.choice.add("Average Power");
            ei.choice.select(meter);
            return ei;
        }
        return null;
    }

    public void setEditValue(int n, EditInfo ei) {
        if (n==0)
            meter = ei.choice.getSelectedIndex();
    }
}
