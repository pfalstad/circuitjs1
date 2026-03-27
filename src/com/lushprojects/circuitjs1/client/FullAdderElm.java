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

    class FullAdderElm extends ChipElm {
	public FullAdderElm(int xx, int yy) {
	    super(xx, yy);
	    flags |= FLAG_BITS;
	    bits = 4;
	    setupPins();
	}
	public FullAdderElm(int xa, int ya, int xb, int yb, int f,
			    StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	    if (!needsBits())
		bits = 1;
	    setupPins();
	}
	static final int FLAG_BITS = 2;
	
	String getChipName() { return "Adder"; }
	int carryIn, carryOut;

	void setupPins() {
	    sizeX=2;
	    int bitsY = useBus() ? 1 : bits;
	    sizeY=bitsY*2+1;
	    pins=new Pin[getPostCount()];

	    makeBitPins(bits, 0,       SIDE_W, 0,      "A", false, false, false);
	    makeBitPins(bits, bitsY,   SIDE_W, bits,    "B", false, false, false);
	    makeBitPins(bits, 2,       SIDE_E, bits*2,  "S", true,  false, false);
	    carryIn = bits*3;
	    carryOut = bits*3+1;
	    pins[carryOut] = new Pin(0, SIDE_E, "C");
	    pins[carryOut].output=true;
	    pins[carryIn] = new Pin(bitsY*2, SIDE_W, "Cin");
	    allocNodes();
	}
	int getPostCount() {
	    return bits*3+2;
	}
	int getVoltageSourceCount() { return bits+1; }

	void execute() {
	    int i;
	    int c = pins[carryIn].value ? 1 : 0;
	    for (i = 0; i != bits; i++) {
		int v = (pins[i].value ? 1 : 0) + (pins[i+bits].value ? 1 : 0) + c;
		c = (v > 1) ? 1 : 0;
		writeOutput(i+bits*2, ((v & 1) == 1));
	    }
	    writeOutput(carryOut, (c == 1));
	}
	int getDumpType() { return 196; }
	boolean needsBits() { return (flags & FLAG_BITS) != 0; }
	boolean allowBus() { return needsBits(); }

        public EditInfo getChipEditInfo(int n) {
            if (n == 0)
                return new EditInfo("# of Bits", bits, 1, 1).setDimensionless();
            return super.getChipEditInfo(n);
        }
        public void setChipEditValue(int n, EditInfo ei) {
            if (n == 0 && ei.value > 0) {
                bits = (int)ei.value;
                flags |= FLAG_BITS;
                setupPins();
                setPoints();
                allocNodes();
                return;
            }
            super.setChipEditValue(n, ei);
        }

    }
