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

    class OrGateElm extends GateElm {
	public OrGateElm(int xx, int yy) { super(xx, yy); }
	public OrGateElm(int xa, int ya, int xb, int yb, int f,
			  StringTokenizer st) {
	    super(xa, ya, xb, yb, f, st);
	}
	String getGateName() {
		if (hasFlag(FLAG_INVERT_INPUTS))
			return "NAND gate";
		return "OR gate"; 
	}

	double getLeadAdjustment(int ix) {
	    if (useEuroGates())
		return 0;
	    if (inputCount > 3 && (ix == 0 || ix == inputCount-1))
			return -.15;
	    if (inputCount > 7 && (ix == 1 || ix == inputCount-2))
			return -.25;
	    if (inputCount >= 12 && (ix == 2 || ix == inputCount-3))
			return -.35;
	    return 0;
	}

	String getGateText() { return "\u22651"; }
	
	boolean calcFunction() {
	    int i;
	    boolean f = false;
	    for (i = 0; i != inputCount; i++)
		f |= getInput(i);
	    return f;
	}
	int getDumpType() { return 152; }
	int getShortcut() { return '3'; }
	boolean baseGateType() { return hasFlag(FLAG_DEMORGAN); }		// false OR, true AND
//	If FLAG_DEMORGAN = 1, we return true for AND gate baseGateType
//	otherwise we return 0 for OR
//	FLAG_DEMORGAN and FLAG_INVERT_INPUTS cannot be set at the same time from Edit popup
    }
