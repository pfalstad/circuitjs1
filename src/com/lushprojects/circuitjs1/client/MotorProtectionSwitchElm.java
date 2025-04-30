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

import com.google.gwt.canvas.dom.client.Context2d.LineCap;
import com.google.gwt.canvas.dom.client.Context2d.TextBaseline;
import com.lushprojects.circuitjs1.client.util.Locale;

class MotorProtectionSwitchElm extends CircuitElm {
	double resistance;
	double heats[];
	double i2t;
	Point posts[], leads[];
	double currents[], curcounts[];
	boolean blown;
	String label;
	final double blownResistance = 1e9;
	public MotorProtectionSwitchElm(int xx, int yy) {
	    super(xx, yy);
	    // from https://m.littelfuse.com/~/media/electronics/datasheets/fuses/littelfuse_fuse_218_datasheet.pdf.pdf
	    i2t = 6.73;
	    resistance = .0613;
	    heats = new double[3];
	    currents = new double[3];
	    curcounts = new double[3];
	    label = "";
	}
	public MotorProtectionSwitchElm(int xa, int ya, int xb, int yb, int f,
		    StringTokenizer st) {
	    super(xa, ya, xb, yb, f);
	    resistance = new Double(st.nextToken()).doubleValue();
	    i2t = new Double(st.nextToken()).doubleValue();
	    blown = new Boolean(st.nextToken()).booleanValue();
	    label = "";
	    try {
		label = CustomLogicModel.unescape(st.nextToken());
	    } catch (Exception e) {}
	    heats = new double[3];
	    currents = new double[3];
	    curcounts = new double[3];
	}
	String dump() {
	    return super.dump() + " " + resistance + " " + i2t + " " + blown + " " + CustomLogicModel.escape(label);
	}
	int getDumpType() { return 428; }

	void reset() {
	    super.reset();
	    heats = new double[3];
	    currents = new double[3];
	    blown = false;
	    setSwitchPositions();
	}
	void setPoints() {
	    super.setPoints();
	    posts = new Point[6];
	    leads = new Point[6];
	    int i;
	    for (i = 0; i != 3; i++) {
		posts[i*2]   = new Point(x+i*48, y);
		posts[i*2+1] = new Point(x+i*48, y+192);
		leads[i*2]   = new Point(x+i*48, y+80);
		leads[i*2+1] = new Point(x+i*48, y+176);
	    }
	}
	int getPostCount() { return 6; }
	Point getPost(int n) { return posts[n]; }

	Color getTempColor(Graphics g, int num) {
	    Color c = getVoltageColor(g, volts[num*2]);
	    double temp = heats[num]/i2t;
	    if (temp < .3333) {
		double val = temp*3;
		int x = (int) (255*val);
		if (x < 0)
		    x = 0;
		return new Color(x+(255-x)*c.getRed()/255, (255-x)*c.getGreen()/255, (255-x)*c.getBlue()/255);
	    }
	    if (temp < .6667) {
		int x = (int) ((temp-.3333)*3*255);
		if (x < 0)
		    x = 0;
		return new Color(255, x, 0);
	    }
	    if (temp < 1) {
		int x = (int) ((temp-.6666)*3*255);
		if (x < 0)
		    x = 0;
		return new Color(255, 255, x);
	    }
	    return Color.white;
	}
	
	void draw(Graphics g) {
	    int i;
	    int hs=6;
	    setBbox(posts[0], posts[5], hs);
	    g.context.save();
	    g.context.translate(x, y);
	    int spx = 48;
	    g.setLineDash(4, 4);
	    int squareX = -spx-12;
	    int squareY = 48-12;
	    
	    // dotted lines
	    g.setColor(Color.lightGray);
	    g.drawLine(squareX+24+4, squareY+12, 48*2-(blown ? 8 : 0), squareY+12);
	    g.drawLine(squareX+12, squareY+24+4, squareX+12, 80+48+48/2);
	    g.drawLine(squareX+12, 80+48+48/2, -spx/2, 80+48+48/2);
	    g.drawLine(squareX+12, 80+   48/2, -spx/2, 80+   48/2);
	    g.setLineDash(0, 0);
	    
	    for (i = 0; i != 3; i++) {
		// terminal at top
		setVoltageColor(g, volts[i*2]);
		drawThickLine(g, i*spx, 0, i*spx, 32);
		if (blown)
		    drawThickLine(g, i*spx-4, 32, i*spx+4, 32);
		int sw = blown ? 16 : 0;
		drawThickLine(g, i*spx-sw, 32, i*spx, 64);
		g.context.setLineCap(LineCap.BUTT);
		drawThickLine(g, i*spx, 64, i*spx, 80);
		g.drawLine(i*spx-4, 16-4, i*spx+4, 16+4); 
		g.drawLine(i*spx+4, 16-4, i*spx-4, 16+4); 
		setVoltageColor(g, volts[i*2+1]);
		drawThickLine(g, i*spx, 176, i*spx, 192);
		g.context.setLineCap(LineCap.ROUND);
		g.setColor(getTempColor(g, i));
		g.drawLine(i*spx, 80, i*spx, 96);
		int q = 12;
		g.drawLine(i*spx-q, 96, i*spx, 96);
		g.drawLine(i*spx-q, 96, i*spx-q, 112);
		g.drawLine(i*spx-q, 112, i*spx, 112);
		g.drawLine(i*spx, 112, i*spx, 128);
		g.setColor(Color.lightGray);
		g.context.setFont("italic 30px serif");
		g.context.setTextBaseline("middle");
		g.context.setTextAlign("center");
		g.drawString("I >", i*spx, 80+48+48/2);
	    }
	    g.setColor(Color.lightGray);
	    for (i = 0; i != 3; i++)
		g.drawLine(-spx/2,  80+48*i, 2*spx+spx/2,  80+48*i);
	    for (i = 0; i != 4; i++)
		g.drawLine(i*spx-spx/2, 80, i*spx-spx/2, 80+48*2);
	    
	    for (i = 0; i != 3; i++)
		g.drawLine(squareX + 12*i, squareY, squareX+12*i, squareY+24);
	    for (i = 0; i != 3; i++)
		g.drawLine(squareX, squareY+12*i, squareX+24, squareY+12*i);
	    g.drawLine(squareX-spx/2, squareY+12, squareX, squareY+12);
	    g.drawLine(squareX-spx/2, squareY, squareX-spx/2, squareY+24);
	    g.context.setFont("normal 12px sans-serif");
	    g.setColor(Color.white);
	    g.drawString(label, 120, squareY+12);
	    g.context.restore();
	    if (!blown) {
		for (i = 0; i != 3; i++) {
		    curcounts[i] = updateDotCount(currents[i], curcounts[i]);
		    drawDots(g, posts[i*2],   leads[i*2], curcounts[i]);
		    drawDots(g, posts[i*2+1], leads[i*2+1], -curcounts[i]);
		}
	    }

	    setSwitchPositions();
	    drawPosts(g);
	}

	void calculateCurrent() {
	    int i;
	    for (i = 0; i != 3; i++)
		currents[i] = (volts[i*2]-volts[i*2+1])/(blown ? blownResistance : resistance);
	}
	void stamp() {
	    int i;
	    for (i = 0; i != 6; i++)
		sim.stampNonLinear(nodes[i]);
	}
	boolean nonLinear() { return true; }
	
	boolean getConnection(int n1, int n2) {
	    return n1/2 == n2/2;
	}
	
	void startIteration() {
	    int j;
	    boolean wasBlown = blown;
	    for (j = 0; j != 3; j++) {
		double i = currents[j];
	    
		// accumulate heat
		double heat = heats[j];
		heat += i*i*sim.timeStep;

		// dissipate heat.  we assume the fuse can dissipate its entire i2t in 3 seconds
		heat -= sim.timeStep*i2t/3;
	    
		if (heat < 0)
		    heat = 0;
		if (heat > i2t)
		    blown = true;
		heats[j] = heat;
	    }
	    
	    if (blown != wasBlown)
		setSwitchPositions();
	}
	
	void setSwitchPositions() {
	    int i;
	    int switchPosition = (blown) ? 0 : 1;
	    for (i = 0; i != sim.elmList.size(); i++) {
		Object o = sim.elmList.elementAt(i);
		if (o instanceof RelayContactElm) {
		    RelayContactElm s2 = (RelayContactElm) o;
		    if (s2.label.equals(label))
			s2.setPosition(switchPosition, RelayCoilElm.TYPE_NORMAL);
		}
	    }
	}

	void doStep() {
	    int i;
	    for (i = 0; i != 3; i++)
		sim.stampResistor(nodes[i*2], nodes[i*2+1], blown ? blownResistance : resistance);
	}
	void getInfo(String arr[]) {
	    arr[0] = "motor protection switch";
	    getBasicInfo(arr);
	    arr[3] = "R = " + getUnitText(resistance, Locale.ohmString);
	    arr[4] = "I2t = " + i2t;
	}
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo("I2t", i2t, 0, 0);
	    if (n == 1)
		return new EditInfo("On Resistance", resistance, 0, 0);
	    if (n == 2)
		return new EditInfo("Label (for linking)", label);
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0 && ei.value > 0)
		i2t = ei.value;
	    if (n == 1 && ei.value > 0)
		resistance = ei.value;
	    if (n == 2)
	        label = ei.textf.getText();
	}
	
	double getCurrentIntoNode(int n) {
	    if ((n % 2) == 1)
		return currents[n/2];
	    return -currents[n/2];
	}

	boolean canFlipX() { return false; }
	boolean canFlipY() { return false; }
    }
