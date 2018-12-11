package com.falstad.afilter.client;

import com.google.gwt.user.client.ui.Label;

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
};
