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

import com.google.gwt.storage.client.Storage;
import com.google.gwt.user.client.Window;
import com.google.gwt.user.client.ui.Button;
import com.lushprojects.circuitjs1.client.util.Locale;

class EditOptions implements Editable {
	CirSim app;
	SimulationManager sim;
	
	public EditOptions(CirSim a, SimulationManager s) { app = a; sim = s; }
	
	public EditInfo getEditInfo(int n) {
		if (n == 0)
			return new EditInfo("Time step size (s)", sim.maxTimeStep, 0, 0);
		if (n == 1)
			return new EditInfo("Range for voltage color (V)",
					CircuitElm.voltageRange, 0, 0);
		if (n == 2) {
	            EditInfo ei =  new EditInfo("Change Language", 0, -1, -1);
	            ei.choice = new Choice();
	            ei.choice.add("(no change)");
	            ei.choice.add("Čeština");
	            ei.choice.add("Dansk");
	            ei.choice.add("Deutsch");
	            ei.choice.add("English");
	            ei.choice.add("Español");
	            ei.choice.add("Français");
	            ei.choice.add("Italiano");
	            ei.choice.add("Norsk bokmål");
	            ei.choice.add("Polski");
	            ei.choice.add("Português");
	            ei.choice.add("\u0420\u0443\u0441\u0441\u043a\u0438\u0439"); // Russian 
	            ei.choice.add("\u4e2d\u6587 (\u4e2d\u56fd\u5927\u9646)"); // Chinese 
	            ei.choice.add("\u4e2d\u6587 (\u53f0\u6e7e)"); // Chinese (tw) 
	            ei.choice.add("日本語"); // Japanese
	            ei.choice.add("한국어"); // Korean
	            return ei;
		}
		
		if (n == 3)
		    return new EditInfo("Positive Color", CircuitElm.positiveColor.getHexValue()).setIsColor();
		if (n == 4)
		    return new EditInfo("Negative Color", CircuitElm.negativeColor.getHexValue()).setIsColor();
		if (n == 5)
		    return new EditInfo("Neutral Color", CircuitElm.neutralColor.getHexValue()).setIsColor();
		if (n == 6)
		    return new EditInfo("Selection Color", CircuitElm.selectColor.getHexValue()).setIsColor();
		if (n == 7)
		    return new EditInfo("Current Color", CircuitElm.currentColor.getHexValue()).setIsColor();
		if (n == 8) {
		    EditInfo ei = new EditInfo("", 0, -1, -1);
		    ei.button = new Button(Locale.LS("Reset Colors to Default"));
		    return ei;
		}
		if (n == 9)
		    return new EditInfo("# of Decimal Digits (short format)", CircuitElm.shortDecimalDigits);
		if (n == 10)
		    return new EditInfo("# of Decimal Digits (long format)", CircuitElm.decimalDigits);
		if (n == 11) {
		    EditInfo ei = new EditInfo("", 0, -1, -1);
		    ei.checkbox = new Checkbox("Developer Mode", app.developerMode);
		    return ei;
		}
		if (n == 12)
		    return new EditInfo("Minimum Target Frame Rate", app.minFrameRate);
		if (n == 13)
		    return new EditInfo("Mouse Wheel Sensitivity", app.mouse.wheelSensitivity);
		if (n == 14) {
		    EditInfo ei = new EditInfo("", 0, -1, -1);
		    ei.checkbox = new Checkbox("Auto-Adjust Timestep", sim.adjustTimeStep);
		    return ei;
		}
		if (n == 15 && sim.adjustTimeStep)
		    return new EditInfo("Minimum time step size (s)", sim.minTimeStep, 0, 0);
		if (n == 15) {
		    EditInfo ei = new EditInfo("Matrix Solver", 0, -1, -1);
		    ei.choice = new Choice();
		    ei.choice.add(Locale.LS("Auto"));
		    ei.choice.add(Locale.LS("Dense (Crout's LU)"));
		    ei.choice.add(Locale.LS("Sparse (CSC LU)"));
		    ei.choice.select(sim.solverType);
		    return ei;
		}

		// don't add new options here.  they are only visible if sim.adjustTimeStemp is set, and it isn't by default

		return null;
	}
	
	public void setEditValue(int n, EditInfo ei) {
		if (n == 0 && ei.value > 0) {
			sim.maxTimeStep = ei.value;

			// if timestep changed manually, prompt before changing it again
			AudioOutputElm.okToChangeTimeStep = false;
		}
		if (n == 1 && ei.value > 0)
			CircuitElm.voltageRange = ei.value;
		if (n == 2) {
		    	int lang = ei.choice.getSelectedIndex();
		    	if (lang == 0)
		    	    return;
		    	String langString = null;
		    	switch (lang) {
		    	// Czech is csx instead of cs because we are not ready to use it automatically yet
		    	case 1: langString = "csx"; break;
		    	case 2: langString = "da"; break;
		    	case 3: langString = "de"; break;
		    	case 4: langString = "en"; break;
		    	case 5: langString = "es"; break;
		    	case 6: langString = "fr"; break;
		    	case 7: langString = "it"; break;
		    	case 8: langString = "nb"; break;
		    	case 9: langString = "pl"; break;
			case 10: langString = "pt"; break;
		    	case 11: langString = "ru"; break;
		    	case 12: langString = "zh"; break;
		    	case 13: langString = "zh-tw"; break;
		    	case 14: langString = "ja"; break;
		    	case 15: langString = "kr"; break;
		    	}
		    	if (langString == null)
		    	    return;
		        Storage stor = Storage.getLocalStorageIfSupported();
		        if (stor == null) {
		            Window.alert(Locale.LS("Can't set language"));
		            return;
		        }
		        stor.setItem("language", langString);
		        if (Window.confirm(Locale.LS("Must restart to set language.  Restart now?")))
		            Window.Location.reload();
		}
		if (n == 3) {
		    CircuitElm.positiveColor = setColor("positiveColor", ei, Color.green);
		    CircuitElm.setColorScale();
		}
		if (n == 4) {
		    CircuitElm.negativeColor = setColor("negativeColor", ei, Color.red);
		    CircuitElm.setColorScale();
		}
		if (n == 5) {
		    CircuitElm.neutralColor = setColor("neutralColor", ei, Color.gray);
		    CircuitElm.setColorScale();
		}
		if (n == 6)
		    CircuitElm.selectColor = setColor("selectColor", ei, Color.cyan);
		if (n == 7)
		    CircuitElm.currentColor = setColor("currentColor", ei, Color.yellow);
		if (n == 8) {
		    // Reset all colors to defaults
		    Storage stor = Storage.getLocalStorageIfSupported();
		    if (stor != null) {
			stor.removeItem("positiveColor");
			stor.removeItem("negativeColor");
			stor.removeItem("neutralColor");
			stor.removeItem("selectColor");
			stor.removeItem("currentColor");
		    }
		    app.ui.setColors(null, null, null, null, null);
		    ei.newDialog = true;
		}
		if (n == 9)
		    CircuitElm.setDecimalDigits((int)ei.value, true, true);
		if (n == 10)
		    CircuitElm.setDecimalDigits((int)ei.value, false, true);
		if (n == 11)
	            app.developerMode = ei.checkbox.getState();
		if (n == 12 && ei.value > 0)
		    app.minFrameRate = ei.value;
		if (n == 13 && ei.value > 0) {
		    app.mouse.wheelSensitivity = ei.value;
		    Storage stor = Storage.getLocalStorageIfSupported();
		    if (stor != null)
			stor.setItem("wheelSensitivity", Double.toString(app.mouse.wheelSensitivity));
		}
		if (n == 14) {
		    sim.adjustTimeStep = ei.checkbox.getState();
		    ei.newDialog = true;
		}
		if (n == 15 && ei.value > 0)
		    sim.minTimeStep = ei.value;
		if (n == 15) {
		    int newType = ei.choice.getSelectedIndex();
		    if (newType != sim.solverType) {
			sim.solverType = newType;
			Storage stor = Storage.getLocalStorageIfSupported();
			if (stor != null)
			    stor.setItem("solverType", Integer.toString(sim.solverType));
			app.needAnalyze();
		    }
		}
	}
	
	Color setColor(String name, EditInfo ei, Color def) {
	    String val = ei.textf.getText();
	    if (val.length() == 0)
		val = def.getHexValue();
	    Storage stor = Storage.getLocalStorageIfSupported();
	    if (stor != null)
		stor.setItem(name, val);
	    return new Color(val);
	}
};
