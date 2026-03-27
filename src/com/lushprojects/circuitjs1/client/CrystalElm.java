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

import com.lushprojects.circuitjs1.client.util.Locale;
import com.google.gwt.xml.client.Element;
import com.google.gwt.xml.client.Document;

class CrystalElm extends CompositeElm {
	static final int FLAG_SHOW_FREQ = 2;
	double seriesCapacitance, parallelCapacitance;
	double inductance, resistance;
	Point plate1[], plate2[];
	private static String modelString = "CapacitorElm 1 2\rCapacitorElm 1 3\rInductorElm 3 4\rResistorElm 4 2";
	private static int[] modelExternalNodes = { 1, 2 };
	
	public CrystalElm(int xx, int yy) {
	    super(xx, yy, modelString, modelExternalNodes);
	    flags = FLAG_SHOW_FREQ;
	    parallelCapacitance = 28.7e-12;
	    seriesCapacitance = 0.1e-12;
	    inductance = 2.5e-3;
	    resistance = 6.4;
	    initCrystal();
	}
	public CrystalElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st, modelString, modelExternalNodes);
	    CapacitorElm c1 = (CapacitorElm) compElmList.get(0);
	    parallelCapacitance = c1.getCapacitance();
	    CapacitorElm c2 = (CapacitorElm) compElmList.get(1);
	    seriesCapacitance = c2.getCapacitance();
	    InductorElm i1 = (InductorElm) compElmList.get(2);
	    inductance = i1.getInductance();
	    ResistorElm r1 = (ResistorElm) compElmList.get(3);
	    resistance = r1.getResistance();
	    initCrystal();
	}
	
	private void initCrystal() {
	    CapacitorElm c1 = (CapacitorElm) compElmList.get(0);
	    c1.setCapacitance(parallelCapacitance);
	    CapacitorElm c2 = (CapacitorElm) compElmList.get(1);
	    c2.setCapacitance(seriesCapacitance);
	    InductorElm i1 = (InductorElm) compElmList.get(2);
	    i1.setInductance(inductance);
	    ResistorElm r1 = (ResistorElm) compElmList.get(3);
	    r1.setResistance(resistance);
	}


	int getDumpType() { return 412; }
	String getXmlDumpType() { return "cr"; }

        void dumpXml(Document doc, Element elem) {
            super.dumpXml(doc, elem);
            XMLSerializer.dumpAttr(elem, "pc", parallelCapacitance);
            XMLSerializer.dumpAttr(elem, "sc", seriesCapacitance);
            XMLSerializer.dumpAttr(elem, "in", inductance);
            XMLSerializer.dumpAttr(elem, "r", resistance);
        }

        void undumpXml(XMLDeserializer xml) {
            super.undumpXml(xml);
            resistance = xml.parseDoubleAttr("r", resistance);
            inductance = xml.parseDoubleAttr("in", inductance);
            parallelCapacitance = xml.parseDoubleAttr("pc", parallelCapacitance);
            seriesCapacitance = xml.parseDoubleAttr("sc", seriesCapacitance);
	    initCrystal();
        }

	Point sandwichPoints[];
	
	void setPoints() {
	    super.setPoints();
	    double f = (dn/2-10)/dn;
	    // calc leads
	    lead1 = interpPoint(point1, point2, f);
	    lead2 = interpPoint(point1, point2, 1-f);
	    // calc plates
	    plate1 = newPointArray(2);
	    plate2 = newPointArray(2);
	    interpPoint2(point1, point2, plate1[0], plate1[1], f, 8);
	    interpPoint2(point1, point2, plate2[0], plate2[1], 1-f, 8);
	    
	    sandwichPoints = newPointArray(4);
	    double f2 = (dn/2-5)/dn;
	    interpPoint2(point1, point2, sandwichPoints[0], sandwichPoints[1],   f2, 10);
	    interpPoint2(point1, point2, sandwichPoints[3], sandwichPoints[2], 1-f2, 10);
	    
	    // need to do this explicitly for CompositeElms
	    setPost(0, point1);
	    setPost(1, point2);
	}
	
	void draw(Graphics g) {
	    int hs = 12;
	    setBbox(point1, point2, hs);
	    
	    // draw first lead and plate
	    setVoltageColor(g, volts[0]);
	    drawThickLine(g, point1, lead1);
	    setPowerColor(g, false);
	    drawThickLine(g, plate1[0], plate1[1]);
	    if (showPower())
		g.setColor(Color.gray);

	    // draw second lead and plate
	    setVoltageColor(g, volts[1]);
	    drawThickLine(g, point2, lead2);
	    setPowerColor(g, false);
	    drawThickLine(g, plate2[0], plate2[1]);
	    
	    int i;
	    setVoltageColor(g, .5*(volts[0]+volts[1]));	    
	    for (i = 0; i != 4; i++)
		drawThickLine(g,  sandwichPoints[i], sandwichPoints[(i+1) % 4]);
	    
	    updateDotCount();
	    if (!isCreating()) {
		drawDots(g, point1, lead1, curcount);
		drawDots(g, point2, lead2, -curcount);
	    }
	    drawPosts(g);
	    if (hasFlag(FLAG_SHOW_FREQ)) {
		double fs = 1/(Math.sqrt(inductance*seriesCapacitance)*Math.PI*2);
		String s = getShortUnitText(fs, "Hz");
		drawValues(g, s, hs);
	    }
	}
	
	public void stepFinished() {
	    super.stepFinished();
	    current = getCurrentIntoNode(1);
	}
	
	void getInfo(String arr[]) {
	    arr[0] = "crystal";
	    getBasicInfo(arr);
	    double fs = 1/(Math.sqrt(inductance*seriesCapacitance)*Math.PI*2);
	    double cSer = (parallelCapacitance*seriesCapacitance)/(parallelCapacitance+seriesCapacitance);
	    double fp = 1/(Math.sqrt(inductance*cSer)*Math.PI*2);
	    double q = 2*Math.PI*fs*inductance/resistance;
	    arr[3] = "fs = " + getUnitText(fs, "Hz");
	    arr[4] = "fp = " + getUnitText(fp, "Hz");
	    arr[5] = "Q = " + getUnitText(q, "");
	    arr[6] = "P = " + getUnitText(getPower(), "W");
	}
	
	public boolean canViewInScope() { return true; }
	
	public EditInfo getEditInfo(int n) {
	    if (n == 0)
		return new EditInfo(EditInfo.makeLink("crystal.html", "Parallel Capacitance"), parallelCapacitance);
	    if (n == 1)
		return new EditInfo("Series Capacitance (F)", seriesCapacitance);
	    if (n == 2)
		return new EditInfo("Inductance (H)", inductance, 0, 0);
	    if (n == 3)
		return new EditInfo("Resistance (" + Locale.ohmString + ")", resistance, 0, 0);
	    if (n == 4) {
		EditInfo ei = new EditInfo("", 0, -1, -1);
		ei.checkbox = new Checkbox("Show Frequency", hasFlag(FLAG_SHOW_FREQ));
		return ei;
	    }
	    return null;
	}
	public void setEditValue(int n, EditInfo ei) {
	    if (n == 0 && ei.value > 0)
		parallelCapacitance = ei.value;
	    if (n == 1 && ei.value > 0)
		seriesCapacitance = ei.value;
	    if (n == 2 && ei.value > 0)
		inductance = ei.value;
	    if (n == 3 && ei.value > 0)
		resistance = ei.value;
	    if (n == 4)
		flags = ei.changeFlag(flags, FLAG_SHOW_FREQ);
	    initCrystal();
	}
    }
