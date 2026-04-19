package com.lushprojects.circuitjs1.client;

import java.util.Vector;

// Creates a test harness for a selected ChipElm by adding LogicInputElms
// to all inputs and LogicOutputElms/WireElms to all outputs.

class TestCreator {

    static final boolean enabled = false;

    static void createTest(CirSim app) {
/*
	Vector<CircuitElm> elmList = app.ui.elmList;

	// find the single selected ChipElm
	ChipElm chip = null;
	int selectedCount = 0;
	for (int i = 0; i < elmList.size(); i++) {
	    CircuitElm ce = elmList.get(i);
	    if (ce.isSelected()) {
		selectedCount++;
		if (ce instanceof ChipElm)
		    chip = (ChipElm) ce;
	    }
	}
	if (selectedCount != 1 || chip == null) {
	    com.google.gwt.user.client.Window.alert("Select a single chip element first.");
	    return;
	}

	int gridSize = app.gridSize;

	// iterate over pins, skipping bus duplicates (busZ > 0)
	for (int i = 0; i < chip.getPostCount(); i++) {
	    ChipElm.Pin p = chip.pins[i];
	    if (p.busZ > 0)
		continue;

	    Point post = chip.getPost(i);
	    // stub is the point closer to the chip body; post is the external connection point
	    // we want to place our element extending outward from the post

	    // determine direction away from chip based on pin side
	    int dx = 0, dy = 0;
	    switch (p.side) {
		case ChipElm.SIDE_W: dx = -1; break;
		case ChipElm.SIDE_E: dx = 1; break;
		case ChipElm.SIDE_N: dy = -1; break;
		case ChipElm.SIDE_S: dy = 1; break;
	    }

	    int len = gridSize * 4; // length of the new element
	    int x1 = post.x;
	    int y1 = post.y;
	    int x2 = x1 + dx * len;
	    int y2 = y1 + dy * len;

	    CircuitElm elm;
	    if (p.output) {
		// output pin: add LogicOutputElm (width 1) or WireElm with bus value display (width > 1)
		if (p.busWidth > 1) {
		    // wire with "show bus value" flag, element goes from post outward
		    WireElm wire = new WireElm(x1, y1);
		    wire.x2 = x2;
		    wire.y2 = y2;
		    wire.setPoints();
		    wire.flags |= WireElm.FLAG_SHOW_BUS_VALUE;
		    elm = wire;
		} else {
		    // LogicOutputElm: post 0 is at (x1,y1), text at (x2,y2)
		    elm = new LogicOutputElm(x1, y1);
		    elm.x2 = x2;
		    elm.y2 = y2;
		    elm.setPoints();
		}
	    } else {
		// input pin: add LogicInputElm (width 1) or BusLogicInputElm (width > 1)
		if (p.busWidth > 1) {
		    BusLogicInputElm bli = new BusLogicInputElm(x1, y1);
		    bli.busWidth = p.busWidth;
		    bli.x2 = x2;
		    bli.y2 = y2;
		    bli.allocNodes();
		    bli.setPoints();
		    elm = bli;
		} else {
		    elm = new LogicInputElm(x1, y1);
		    elm.x2 = x2;
		    elm.y2 = y2;
		    elm.setPoints();
		}
	    }

	    elmList.addElement(elm);
	}

	app.needAnalyze();
*/
    }
}
