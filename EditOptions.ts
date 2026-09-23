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

import type { Editable } from "./Editable";
import { EditInfo } from "./EditInfo";
import { Choice } from "./Choice";
import { Checkbox } from "./Checkbox";
import { Color } from "./Color";
import { CircuitElm } from "./CircuitElm";
import { CirSim } from "./CirSim";
import { SimulationManager } from "./SimulationManager";
import { Locale } from "./Locale";

export class EditOptions implements Editable {
    app: CirSim;
    sim: SimulationManager;

    constructor(a: CirSim, s: SimulationManager) { this.app = a; this.sim = s; }

    getEditInfo(n: number): EditInfo | null {
        if (n === 0)
            return new EditInfo("Time step size (s)", this.sim.maxTimeStep, 0, 0).setPositive();
        if (n === 1)
            return new EditInfo("Range for voltage color (V)",
                CircuitElm.voltageRange, 0, 0).setPositive();
        if (n === 2) {
            const ei = new EditInfo("Change Language", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add("(no change)");
            ei.choice.add("Čeština");
            ei.choice.add("Dansk");
            ei.choice.add("Deutsch");
            ei.choice.add("English");
            ei.choice.add("Español");
            ei.choice.add("Suomi");
            ei.choice.add("Français");
            ei.choice.add("Italiano");
            ei.choice.add("Norsk bokmål");
            ei.choice.add("Polski");
            ei.choice.add("Português");
            ei.choice.add("Русский"); // Russian
            ei.choice.add("中文 (中国大陆)"); // Chinese
            ei.choice.add("中文 (台湾)"); // Chinese (tw)
            ei.choice.add("日本語"); // Japanese
            ei.choice.add("한국어"); // Korean
            return ei;
        }
        if (n === 3)
            return new EditInfo("Positive Color", CircuitElm.positiveColor.getHexValue()).setIsColor().newColumnMethod();
        if (n === 4)
            return new EditInfo("Negative Color", CircuitElm.negativeColor.getHexValue()).setIsColor();
        if (n === 5)
            return new EditInfo("Neutral Color", CircuitElm.neutralColor.getHexValue()).setIsColor();
        if (n === 6)
            return new EditInfo("Selection Color", CircuitElm.selectColor.getHexValue()).setIsColor();
        if (n === 7)
            return new EditInfo("Current Color", CircuitElm.currentColor.getHexValue()).setIsColor();
        if (n === 8) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.button = { label: Locale.LS("Reset Colors to Default") };
            return ei;
        }
        if (n === 9)
            return new EditInfo("# of Decimal Digits (short format)", CircuitElm.shortDecimalDigits);
        if (n === 10)
            return new EditInfo("# of Decimal Digits (long format)", CircuitElm.decimalDigits).newColumnMethod();
        if (n === 11) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Developer Mode", this.app.developerMode);
            return ei;
        }
        if (n === 12)
            return new EditInfo("Minimum Target Frame Rate", this.app.minFrameRate).setPositive();
        if (n === 13)
            return new EditInfo("Mouse Wheel Sensitivity", this.app.mouse.wheelSensitivity).setPositive();
        if (n === 14) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Auto-Run DC Operating Point on Reset", this.app.autoDCOnReset);
            return ei;
        }
        if (n === 15) {
            const ei = new EditInfo("", 0, -1, -1);
            ei.checkbox = new Checkbox("Auto-Adjust Timestep", this.sim.adjustTimeStep);
            return ei;
        }
        if (n === 16) {
            const ei = new EditInfo("Matrix Solver", 0, -1, -1);
            ei.choice = new Choice();
            ei.choice.add(Locale.LS("Auto"));
            ei.choice.add(Locale.LS("Dense (Crout's LU)"));
            ei.choice.add(Locale.LS("Sparse (CSC LU)"));
            ei.choice.select(this.sim.solverType);
            return ei;
        }
        if (n === 17)
            return new EditInfo("Value Label Font Size", CircuitElm.valueFontSize);

        // add new options here (before the adjustTimeStep conditional below)

        if (n === 18 && this.sim.adjustTimeStep)
            return new EditInfo("Minimum time step size (s)", this.sim.minTimeStep, 0, 0).setPositive();

        // do not add new options here because they will be hidden unless adjustTimeStep is set

        return null;
    }

    setEditValue(n: number, ei: EditInfo): void {
        if (n === 0) {
            this.sim.maxTimeStep = ei.value;

            // if timestep changed manually, prompt before changing it again
            // AudioOutputElm.okToChangeTimeStep = false;
        }
        if (n === 1)
            CircuitElm.voltageRange = ei.value;
        if (n === 2) {
            const lang = ei.choice!.getSelectedIndex();
            if (lang === 0)
                return;
            let langString: string | null = null;
            switch (lang) {
            // Czech is csx instead of cs because we are not ready to use it automatically yet
            case 1:  langString = "csx"; break;
            case 2:  langString = "da";  break;
            case 3:  langString = "de";  break;
            case 4:  langString = "en";  break;
            case 5:  langString = "es";  break;
            case 6:  langString = "fi";  break;
            case 7:  langString = "fr";  break;
            case 8:  langString = "it";  break;
            case 9:  langString = "nb";  break;
            case 10: langString = "pl";  break;
            case 11: langString = "pt";  break;
            case 12: langString = "ru";  break;
            case 13: langString = "zh";  break;
            case 14: langString = "zh-tw"; break;
            case 15: langString = "ja";  break;
            case 16: langString = "kr";  break;
            }
            if (langString == null)
                return;
            const stor = typeof localStorage !== 'undefined' ? localStorage : null;
            if (stor == null) {
                window.alert(Locale.LS("Can't set language"));
                return;
            }
            stor.setItem("language", langString);
            if (window.confirm(Locale.LS("Must restart to set language.  Restart now?")))
                window.location.reload();
        }
        if (n === 3) {
            CircuitElm.positiveColor = this.setColor("positiveColor", ei, Color.green);
            CircuitElm.setColorScale();
        }
        if (n === 4) {
            CircuitElm.negativeColor = this.setColor("negativeColor", ei, Color.red);
            CircuitElm.setColorScale();
        }
        if (n === 5) {
            CircuitElm.neutralColor = this.setColor("neutralColor", ei, Color.gray);
            CircuitElm.setColorScale();
        }
        if (n === 6)
            CircuitElm.selectColor = this.setColor("selectColor", ei, Color.cyan);
        if (n === 7)
            CircuitElm.currentColor = this.setColor("currentColor", ei, Color.yellow);
        if (n === 8) {
            // Reset all colors to defaults
            const stor = typeof localStorage !== 'undefined' ? localStorage : null;
            if (stor != null) {
                stor.removeItem("positiveColor");
                stor.removeItem("negativeColor");
                stor.removeItem("neutralColor");
                stor.removeItem("selectColor");
                stor.removeItem("currentColor");
            }
            this.app.ui.setColors(null, null, null, null, null);
            ei.newDialog = true;
        }
        if (n === 9)
            CircuitElm.setDecimalDigits(Math.trunc(ei.value), true, true);
        if (n === 10)
            CircuitElm.setDecimalDigits(Math.trunc(ei.value), false, true);
        if (n === 11)
            this.app.developerMode = ei.checkbox!.getState();
        if (n === 12)
            this.app.minFrameRate = ei.value;
        if (n === 13) {
            this.app.mouse.wheelSensitivity = ei.value;
            const stor = typeof localStorage !== 'undefined' ? localStorage : null;
            if (stor != null)
                stor.setItem("wheelSensitivity", this.app.mouse.wheelSensitivity.toString());
        }
        if (n === 14)
            this.app.autoDCOnReset = ei.checkbox!.getState();
        if (n === 15) {
            this.sim.adjustTimeStep = ei.checkbox!.getState();
            ei.newDialog = true;
        }
        if (n === 16) {
            const newType = ei.choice!.getSelectedIndex();
            if (newType !== this.sim.solverType) {
                this.sim.solverType = newType;
                this.app.needAnalyze();
            }
        }
        if (n === 17)
            CircuitElm.setValueFontSize(ei.value > 0 ? Math.trunc(ei.value) : 12);
        if (n === 18 && ei.value > 0)
            this.sim.minTimeStep = ei.value;
    }

    setColor(name: string, ei: EditInfo, def: Color): Color {
        let val = ei.textf.value;
        if (val.length === 0)
            val = def.getHexValue();
        const stor = typeof localStorage !== 'undefined' ? localStorage : null;
        if (stor != null)
            stor.setItem(name, val);
        return new Color(val);
    }
}
