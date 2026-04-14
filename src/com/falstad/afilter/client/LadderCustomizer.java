package com.falstad.afilter.client;

class LadderCustomizer extends ScaleFilter {
    public LadderCustomizer(int f, StringTokenizer st) {
	super(f, st);
    }
    int getMaxPoles() { return 20; }
    int getDefaultPoles() { return 10; }
    void create() {
	super.create();
	polesChanged();
    }
};
