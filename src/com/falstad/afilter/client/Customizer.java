package com.falstad.afilter.client;

import com.google.gwt.user.client.ui.Label;
import com.google.gwt.xml.client.Element;

class Customizer {
    int flags;
    CirSim sim;
    Label labels[];
    Scrollbar bars[];
    int lcount;
    public Customizer(int f, StringTokenizer st) {
	flags = f;
	sim = CircuitElm.sim;
	labels = new Label[10];
	bars = new Scrollbar[10];
	lcount = 0;
    }
    String getClassName() { return getClass().getName().replace("com.falstad.afilter.client.", ""); }
    void dumpXml(Element elem) {
	XMLSerializer.dumpAttr(elem, "f", flags);
    }
    void undumpXml(XMLDeserializer xml) {
	flags = xml.parseIntAttr("f", flags);
    }
    void create() {}
    void delete() {
	int i;
	for (i = 0; i != lcount; i++) {
	    sim.removeWidgetFromVerticalPanel(labels[i]);
	    sim.removeWidgetFromVerticalPanel(bars[i]);
	}
    }
    void getInfo(String info[], int i) {}
    
    void slidersChanged(Scrollbar s) {}
    boolean editPerformed(Editable ce) { return false; }
    boolean circuitChanged() { return true; }
    Scrollbar createSlider(String n, int x, int mn, int mx) {
	labels[lcount] = new Label(n);
	Scrollbar sb = bars[lcount] = new Scrollbar(
	    Scrollbar.HORIZONTAL, x, 1, mn, mx, this, this);
	sim.addLabeledSlider(labels[lcount], sb);
	return bars[lcount++];
    }
    double [] getIdealResponse(int size) { return null; }
    Complex [] getPoles() { return null; }
    Complex [] getZeros() { return null; }
    // should this pole be highlighted when the mouse is over mouseElm?
    boolean isPoleSelected(Complex p, CircuitElm mouseElm) { return false; }
};
