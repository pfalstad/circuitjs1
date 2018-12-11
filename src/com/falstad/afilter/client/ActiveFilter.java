package com.falstad.afilter.client;

class ActiveFilter extends FilterCustomizer {
    public ActiveFilter(int f, StringTokenizer st) {
	super(f, st);
    }
    Scrollbar bwslider;
    void create() {
	super.create();
	bwslider = createSlider("Gain-BW Product", 6, 5, 10);
//	sim.main.validate();
	polesChanged();
    }
    void slidersChanged(Scrollbar s) {
	super.slidersChanged(s);
	if (s == bwslider)
	    bwChanged();
    }

    void bwChanged() {
	int i;
	double bw = Math.pow(10, bwslider.getValue());
	for (i = 0; i != sim.countElm(OpAmpElm.class); i++) {
	    CircuitElm ce = sim.getElm(i, OpAmpElm.class);
	    ((OpAmpElm) ce).setGainProduct(bw);
	}
	sim.needAnalyze();
    }
};
