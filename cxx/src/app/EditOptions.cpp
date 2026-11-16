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

#include "EditOptions.h"

#include <cmath>

#include "CirSim.h"
#include "core/CircuitElm.h"
#include "core/JsNumber.h"
#include "core/Locale.h"
#include "core/SimulationManager.h"
#include "core/Storage.h"

std::optional<EditInfo> EditOptions::getEditInfo(int n) {
    if (n == 0)
        return EditInfo("Time step size (s)", sim->maxTimeStep, 0, 0).setPositive();
    if (n == 1)
        return EditInfo("Range for voltage color (V)", CircuitElm::voltageRange, 0, 0).setPositive();
    if (n == 2) {
        EditInfo ei("Change Language", 0, -1, -1);
        ei.choice = Choice();
        ei.choice->add("(no change)");
        ei.choice->add("Čeština");
        ei.choice->add("Dansk");
        ei.choice->add("Deutsch");
        ei.choice->add("English");
        ei.choice->add("Español");
        ei.choice->add("Suomi");
        ei.choice->add("Français");
        ei.choice->add("Italiano");
        ei.choice->add("Norsk bokmål");
        ei.choice->add("Polski");
        ei.choice->add("Português");
        ei.choice->add("Русский");  // Russian
        ei.choice->add("中文 (中国大陆)");  // Chinese
        ei.choice->add("中文 (台湾)");  // Chinese (tw)
        ei.choice->add("日本語");  // Japanese
        ei.choice->add("한국어");  // Korean
        return ei;
    }
    if (n == 3)
        return EditInfo::createCheckbox("Show Properties on Create", app->showPropsOnCreate);
    if (n == 4)
        return EditInfo::createCheckbox("Show Properties on Click", app->showPropsOnClick);
    if (n == 5)
        return EditInfo("Positive Color", CircuitElm::positiveColor.getHexValue()).setIsColor().newColumnMethod();
    if (n == 6)
        return EditInfo("Negative Color", CircuitElm::negativeColor.getHexValue()).setIsColor();
    if (n == 7)
        return EditInfo("Neutral Color", CircuitElm::neutralColor.getHexValue()).setIsColor();
    if (n == 8)
        return EditInfo("Selection Color", CircuitElm::selectColor.getHexValue()).setIsColor();
    if (n == 9)
        return EditInfo("Current Color", CircuitElm::currentColor.getHexValue()).setIsColor();
    if (n == 10) {
        EditInfo ei("", 0, -1, -1);
        ei.button = EditButton{Locale::LS("Reset Colors to Default")};
        return ei;
    }
    if (n == 11)
        return EditInfo("# of Decimal Digits (short format)", CircuitElm::shortDecimalDigits).setInteger();
    if (n == 12)
        return EditInfo("# of Decimal Digits (long format)", CircuitElm::decimalDigits).setInteger().newColumnMethod();
    if (n == 13)
        return EditInfo::createCheckbox("Developer Mode", app->developerMode);
    if (n == 14)
        return EditInfo("Minimum Target Frame Rate", app->minFrameRate).setPositive();
    if (n == 15)
        return EditInfo("Mouse Wheel Sensitivity", app->mouse.wheelSensitivity).setPositive();
    if (n == 16)
        return EditInfo::createCheckbox("Auto-Run DC Operating Point on Reset", app->autoDCOnReset);
    if (n == 17)
        return EditInfo::createCheckbox("Auto-Adjust Timestep", sim->adjustTimeStep);
    if (n == 18) {
        EditInfo ei("Matrix Solver", 0, -1, -1);
        ei.choice = Choice();
        ei.choice->add(Locale::LS("Auto"));
        ei.choice->add(Locale::LS("Dense (Crout's LU)"));
        ei.choice->add(Locale::LS("Sparse (CSC LU)"));
        ei.choice->select(sim->solverType);
        return ei;
    }
    if (n == 19)
        return EditInfo("Value Label Font Size", CircuitElm::valueFontSize);

    // add new options here (before the adjustTimeStep conditional below)

    if (n == 20 && sim->adjustTimeStep)
        return EditInfo("Minimum time step size (s)", sim->minTimeStep, 0, 0).setPositive();

    // do not add new options here because they will be hidden unless adjustTimeStep is set

    return std::nullopt;
}

void EditOptions::setEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        sim->maxTimeStep = ei.value;

        // if timestep changed manually, prompt before changing it again
        // AudioOutputElm.okToChangeTimeStep = false;
    }
    if (n == 1)
        CircuitElm::voltageRange = ei.value;
    if (n == 2) {
        int lang = ei.choice->getSelectedIndex();
        if (lang == 0)
            return;
        std::string langString;
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
        if (langString.empty())
            return;
        Storage *stor = Storage::localStorage;
        if (stor == nullptr) {
            app->alert(Locale::LS("Can't set language"));
            return;
        }
        stor->setItem("language", langString);
        app->alert(Locale::LS("Must restart to set language."));
    }
    if (n == 3) {
        app->showPropsOnCreate = ei.checkbox->getState();
        app->setOptionInStorage("showPropsOnCreate", app->showPropsOnCreate);
    }
    if (n == 4) {
        app->showPropsOnClick = ei.checkbox->getState();
        app->setOptionInStorage("showPropsOnClick", app->showPropsOnClick);
    }
    if (n == 5) {
        CircuitElm::positiveColor = setColor("positiveColor", ei, Color::green);
        CircuitElm::setColorScale();
    }
    if (n == 6) {
        CircuitElm::negativeColor = setColor("negativeColor", ei, Color::red);
        CircuitElm::setColorScale();
    }
    if (n == 7) {
        CircuitElm::neutralColor = setColor("neutralColor", ei, Color::gray);
        CircuitElm::setColorScale();
    }
    if (n == 8)
        CircuitElm::selectColor = setColor("selectColor", ei, Color::cyan);
    if (n == 9)
        CircuitElm::currentColor = setColor("currentColor", ei, Color::yellow);
    if (n == 10) {
        // Reset all colors to defaults
        Storage *stor = Storage::localStorage;
        if (stor != nullptr) {
            stor->removeItem("positiveColor");
            stor->removeItem("negativeColor");
            stor->removeItem("neutralColor");
            stor->removeItem("selectColor");
            stor->removeItem("currentColor");
        }
        app->setColors();
        ei.newDialog = true;
    }
    if (n == 11)
        CircuitElm::setDecimalDigits((int) std::trunc(ei.value), true, true);
    if (n == 12)
        CircuitElm::setDecimalDigits((int) std::trunc(ei.value), false, true);
    if (n == 13)
        app->developerMode = ei.checkbox->getState();
    if (n == 14)
        app->minFrameRate = ei.value;
    if (n == 15) {
        app->mouse.wheelSensitivity = ei.value;
        if (Storage::localStorage != nullptr)
            Storage::localStorage->setItem("wheelSensitivity", jsNumberToString(app->mouse.wheelSensitivity));
    }
    if (n == 16)
        app->autoDCOnReset = ei.checkbox->getState();
    if (n == 17) {
        sim->adjustTimeStep = ei.checkbox->getState();
        ei.newDialog = true;
    }
    if (n == 18) {
        int newType = ei.choice->getSelectedIndex();
        if (newType != sim->solverType) {
            sim->solverType = newType;
            app->needAnalyze();
        }
    }
    if (n == 19)
        CircuitElm::setValueFontSize(ei.value > 0 ? (int) std::trunc(ei.value) : 12);
    if (n == 20 && ei.value > 0)
        sim->minTimeStep = ei.value;
}

Color EditOptions::setColor(const std::string &name, EditInfo &ei, const Color &def) {
    std::string val = ei.textf ? ei.textf->value : "";
    if (val.empty())
        val = def.getHexValue();
    if (Storage::localStorage != nullptr)
        Storage::localStorage->setItem(name, val);
    return Color(val);
}
