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

    class SevenSegDecoderElm extends ChipElm {

	private static final boolean[][] symbols={
		{true,true,true,true,true,true,false},//0
		{false,true,true,false,false,false,false},//1
		{true,true,false,true,true,false,true},//2
		{true,true,true,true,false,false,true},//3
		{false,true,true,false,false,true,true},//4
		{true,false,true,true,false,true,true},//5
		{true,false,true,true,true,true,true},//6
		{true,true,true,false,false,false,false},//7
		{true,true,true,true,true,true,true},//8
		{true,true,true,false,false,true,true},//9
		{true,true,true,false,true,true,true},//A
		{false,false,true,true,true,true,true},//B
		{true,false,false,true,true,true,false},//C
		{false,true,true,true,true,false,true},//D
		{true,false,false,true,true,true,true},//E
		{true,false,false,false,true,true,true},//F
	};

	// 14-segment encoding: a=top, b=upper-right, c=lower-right, d=bottom, e=lower-left, f=upper-left,
	// g=diag UL-center, h=vert upper, i=diag UR-center, j=horiz right-center,
	// k=diag center-LR, l=vert lower, m=diag center-LL, n=horiz left-center
	private static final boolean[][] symbols14={
		{true,true,true,true,true,true, false,false,true,false,false,false,true,false},//0
		{false,true,true,false,false,false, false,false,true,false,false,false,false,false},//1
		{true,true,false,true,true,false, false,false,false,true,false,false,false,true},//2
		{true,true,true,true,false,false, false,false,false,true,false,false,false,true},//3
		{false,true,true,false,false,true, false,false,false,true,false,false,false,true},//4
		{true,false,true,true,false,true, false,false,false,true,false,false,false,true},//5
		{true,false,true,true,true,true, false,false,false,true,false,false,false,true},//6
		{true,false,false,false,false,false, false,false,true,false,false,true,false,false},//7
		{true,true,true,true,true,true, false,false,false,true,false,false,false,true},//8
		{true,true,true,true,false,true, false,false,false,true,false,false,false,true},//9
		{true,true,true,false,true,true, false,false,false,true,false,false,false,true},//A
		{true,true,true,true,false,false, false,true,false,true,false,true,false,false},//B
		{true,false,false,true,true,true, false,false,false,false,false,false,false,false},//C
		{true,true,true,true,false,false, false,true,false,false,false,true,false,false},//D
		{true,false,false,true,true,true, false,false,false,true,false,false,false,true},//E
		{true,false,false,false,true,true, false,false,false,true,false,false,false,true},//F
	};

	// 16-segment encoding: a=top-left, b=top-right, c=upper-right, d=lower-right,
	// e=bottom-right, f=bottom-left, g=lower-left, h=upper-left,
	// i=diag UL-center, j=vert upper, k=diag UR-center, l=horiz right,
	// m=diag center-LR, n=vert lower, o=diag center-LL, p=horiz left
	private static final boolean[][] symbols16={
		{true,true,true,true,true,true,true,true, false,false,true,false,false,false,true,false},//0
		{false,false,true,true,false,false,false,false, false,false,true,false,false,false,false,false},//1
		{true,true,true,false,true,true,true,false, false,false,false,true,false,false,false,true},//2
		{true,true,true,true,true,true,false,false, false,false,false,true,false,false,false,true},//3
		{false,false,true,true,false,false,false,true, false,false,false,true,false,false,false,true},//4
		{true,true,false,true,true,true,false,true, false,false,false,true,false,false,false,true},//5
		{true,true,false,true,true,true,true,true, false,false,false,true,false,false,false,true},//6
		{true,true,false,false,false,false,false,false, false,false,true,false,false,true,false,false},//7
		{true,true,true,true,true,true,true,true, false,false,false,true,false,false,false,true},//8
		{true,true,true,true,true,true,false,true, false,false,false,true,false,false,false,true},//9
		{true,true,true,true,false,false,true,true, false,false,false,true,false,false,false,true},//A
		{true,true,true,true,true,true,false,false, false,true,false,true,false,true,false,false},//B
		{true,true,false,false,true,true,true,true, false,false,false,false,false,false,false,false},//C
		{true,true,true,true,true,true,false,false, false,true,false,false,false,true,false,false},//D
		{true,true,false,false,true,true,true,true, false,false,false,true,false,false,false,true},//E
		{true,true,false,false,false,false,true,true, false,false,false,true,false,false,false,true},//F
	};

	static final int FLAG_ENABLE = (1<<1);
	static final int FLAG_BLANK_F = (1<<2);

	int segmentType; // 0=7-seg, 1=14-seg, 2=16-seg

	public SevenSegDecoderElm(int xx, int yy) { super(xx, yy); }
	public SevenSegDecoderElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	    try {
		segmentType = Integer.parseInt(st.nextToken());
		setupPins();
		setPoints();
	    } catch (Exception e) {}
	}

	String dump() { return super.dump() + " " + segmentType; }

	int getSegmentCount() {
	    if (segmentType == 1) return 14;
	    if (segmentType == 2) return 16;
	    return 7;
	}

	String getChipName() {
	    return getSegmentCount() + "-Segment Decoder";
	}

	void setupPins() {
	    int segCount = getSegmentCount();
	    sizeX = 3;
	    sizeY = Math.max(segCount, 4);
	    pins = new Pin[getPostCount()];

	    pins[segCount+0] = new Pin(0, SIDE_W, "I3");
	    pins[segCount+1] = new Pin(1, SIDE_W, "I2");
	    pins[segCount+2] = new Pin(2, SIDE_W, "I1");
	    pins[segCount+3] = new Pin(3, SIDE_W, "I0");

	    for (int i = 0; i < segCount; i++) {
		pins[i] = new Pin(i, SIDE_E, Character.toString((char)('a'+i)));
		pins[i].output = true;
	    }

	    if (hasBlank()) {
		pins[segCount+4] = new Pin(4, SIDE_W, "BI");
		pins[segCount+4].bubble = true;
	    }
	    allocNodes();
	}

	boolean hasBlank() { return (flags & FLAG_ENABLE) != 0; }
	boolean blankOnF() { return (flags & FLAG_BLANK_F) != 0; }

	int getPostCount() {
	    int segCount = getSegmentCount();
	    return segCount + 4 + (hasBlank() ? 1 : 0);
	}
	int getVoltageSourceCount() { return getSegmentCount(); }

	void execute() {
	    int segCount = getSegmentCount();
	    int input=0;
	    if(pins[segCount+0].value)input+=8;
	    if(pins[segCount+1].value)input+=4;
	    if(pins[segCount+2].value)input+=2;
	    if(pins[segCount+3].value)input+=1;
	    boolean en = true;
	    if (hasBlank() && !pins[segCount+4].value)
		en = false;
	    if (!en || (input == 15 && blankOnF())) {
		for (int i = 0; i != segCount; i++)
		    writeOutput(i, false);
	    } else {
		boolean[][] sym = (segCount == 14) ? symbols14 : (segCount == 16) ? symbols16 : symbols;
		for (int i = 0; i < segCount; i++)
		    writeOutput(i, sym[input][i]);
	    }
	}

        public EditInfo getChipEditInfo(int n) {
            if (n == 0) {
                EditInfo ei = new EditInfo("Segments", 0, -1, -1);
                ei.choice = new Choice();
                ei.choice.add("7 Segment");
                ei.choice.add("14 Segment");
                ei.choice.add("16 Segment");
                ei.choice.select(segmentType);
                return ei;
            }
            if (n == 1) {
                EditInfo ei = new EditInfo("", 0, -1, -1);
                ei.checkbox = new Checkbox("Blank Pin", hasBlank());
                return ei;
            }
            if (n == 2) {
                EditInfo ei = new EditInfo("", 0, -1, -1);
                ei.checkbox = new Checkbox("Blank on 1111", blankOnF());
                return ei;
            }
            return super.getChipEditInfo(n);
        }
        public void setChipEditValue(int n, EditInfo ei) {
            if (n == 0) {
        	segmentType = ei.choice.getSelectedIndex();
        	setupPins();
        	setPoints();
        	return;
            }
            if (n == 1) {
        	flags = ei.changeFlag(flags, FLAG_ENABLE);
        	setupPins();
        	setPoints();
        	return;
            }
            if (n == 2)
        	flags = ei.changeFlag(flags, FLAG_BLANK_F);
            super.setChipEditValue(n, ei);
        }

	int getDumpType() { return 197; }

    }
