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

#include "BatteryElm.h"

#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/Locale.h"
#include "../core/SimulationManager.h"
#include "../core/XmlDoc.h"

const std::vector<std::string> BatteryElm::batteryTypeNames = {
    "Alkaline 1.5V", "Lithium-Ion", "NiMH 1.2V", "NiCd 1.2V", "Lead-Acid"};
const std::vector<std::string> BatteryElm::batteryTypeTables = {
    "0=0.8\n10=0.95\n20=1.05\n40=1.18\n60=1.28\n80=1.38\n90=1.43\n100=1.55\n",  // alkaline
    "0=3.00\n5=3.30\n10=3.45\n20=3.55\n30=3.62\n40=3.68\n50=3.73\n60=3.79\n70=3.87\n80=3.97\n90=4.08\n95=4.15\n100=4.20\n",  // lithium-ion
    "0=1.00\n10=1.15\n20=1.20\n50=1.25\n80=1.30\n90=1.33\n100=1.40\n",  // NiMH
    "0=1.00\n10=1.15\n20=1.20\n50=1.22\n80=1.25\n90=1.28\n100=1.35\n",  // NiCd
    "0=1.75\n10=1.90\n20=1.95\n50=2.05\n80=2.10\n90=2.12\n100=2.15\n",  // lead-acid
};
const std::vector<std::array<double, 4>> BatteryElm::batteryTypeDefaults = {
    {2.5, .15, .25, 1500},    // alkaline (AA)
    {3.0, .025, .020, 2000},  // lithium-ion (18650)
    {2.0, .030, .040, 1800},  // NiMH (AA)
    {1.0, .020, .025, 1200},  // NiCd (AA)
    {10, .008, .012, 5000},   // lead-acid (2V)
};

namespace {

// String.prototype.trim() for the ASCII whitespace a table can contain
std::string jsTrim(const std::string &s) {
    const char *ws = " \t\n\r\f\v";
    size_t a = s.find_first_not_of(ws);
    if (a == std::string::npos)
        return "";
    size_t b = s.find_last_not_of(ws);
    return s.substr(a, b - a + 1);
}

}  // namespace

BatteryElm::BatteryElm(int xx, int yy) : CircuitElm(xx, yy) {
    r0 = .01;
    r1 = .02;
    c1 = 2000;
    capacityAh = 2;
    initialSoc = 1;
    flags |= FLAG_SHOW_VOLTAGE | FLAG_SHOW_SOC;
    batteryType = BT_LITHIUM;
    socVoltageTable = batteryTypeTables[batteryType];
    parseSocTable(nullptr);
    reset();
}

void BatteryElm::dragPlace(int xa, int ya, bool vertical) {
    CircuitElm::dragPlace(xa, ya, vertical);
    swapDragEndpoints();
}

void BatteryElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "r0", r0);
    CircuitXMLSerializer::dumpAttr(elem, "r1", r1);
    CircuitXMLSerializer::dumpAttr(elem, "c1", c1);
    CircuitXMLSerializer::dumpAttr(elem, "cap", capacityAh);
    CircuitXMLSerializer::dumpAttr(elem, "isoc", initialSoc);
    CircuitXMLSerializer::dumpAttr(elem, "bt", batteryType);
    if (batteryType == BT_CUSTOM && !socVoltageTable.empty())
        elem->text += socVoltageTable;
}

void BatteryElm::dumpXmlState(XmlElement *doc, XmlElement *elem) {
    CircuitXMLSerializer::dumpAttr(elem, "soc", soc);
}

void BatteryElm::undumpXml(CircuitXMLDeserializer &xml) {
    CircuitElm::undumpXml(xml);
    r0 = xml.parseDoubleAttr("r0", .01);
    r1 = xml.parseDoubleAttr("r1", .02);
    c1 = xml.parseDoubleAttr("c1", 2000);
    capacityAh = xml.parseDoubleAttr("cap", 2);
    initialSoc = clampSoc(xml.parseDoubleAttr("isoc", 1));
    // soc itself isn't lower-clamped (over-discharge is modeled), only capped at 100%
    soc = std::min(1.0, xml.parseDoubleAttr("soc", initialSoc));
    batteryType = xml.parseIntAttr("bt", BT_LITHIUM);
    if (batteryType == BT_CUSTOM) {
        socVoltageTable = xml.parseContents().value_or("");
        if (socVoltageTable.empty())
            socVoltageTable = batteryTypeTables[BT_LITHIUM];
    } else
        socVoltageTable = (batteryType >= 0 && batteryType < (int) batteryTypeTables.size())
            ? batteryTypeTables[batteryType] : batteryTypeTables[BT_LITHIUM];
    parseSocTable(nullptr);
}

void BatteryElm::reset() {
    soc = clampSoc(initialSoc);
    capVoltDiff = capCurrent = curSourceValue = 0;
    curcount = 0;
}

double BatteryElm::clampSoc(double s) {
    if (s < 0)
        return 0;
    if (s > 1)
        return 1;
    return s;
}

void BatteryElm::parseSocTable(EditInfo *ei) {
    socTable.clear();
    if (socVoltageTable.empty())
        return;
    size_t start = 0;
    while (true) {
        size_t nl = socVoltageTable.find('\n', start);
        std::string line = jsTrim(socVoltageTable.substr(start, nl == std::string::npos ? std::string::npos : nl - start));
        if (!line.empty()) {
            size_t eq = line.find('=');
            if (eq == std::string::npos) {
                if (ei)
                    ei->setError("missing =: " + line);
            } else {
                try {
                    double socPct = parseFloatStrict(jsTrim(line.substr(0, eq)));
                    double v = parseFloatStrict(jsTrim(line.substr(eq + 1)));
                    socTable.push_back({socPct, v});
                } catch (...) {
                    if (ei)
                        ei->setError("bad line: " + line);
                }
            }
        }
        if (nl == std::string::npos)
            break;
        start = nl + 1;
    }
    // insertion sort by SOC percent (tables are tiny, simplicity over speed)
    for (size_t i = 1; i < socTable.size(); i++) {
        std::array<double, 2> cur = socTable[i];
        int j = (int) i - 1;
        while (j >= 0 && socTable[j][0] > cur[0]) {
            socTable[j + 1] = socTable[j];
            j--;
        }
        socTable[j + 1] = cur;
    }
}

double BatteryElm::getVoltageForSoc(double socFrac) {
    double socPct = socFrac * 100;
    if (socPct < 0) {
        // over-discharged: extrapolate linearly using the slope between 0% and 10%
        double v0 = interpSocTable(0);
        double v10 = interpSocTable(10);
        double slope = (v10 - v0) / 10;  // volts per percent SOC
        return v0 + slope * 3 * socPct;
    }
    return interpSocTable(socPct);
}

double BatteryElm::interpSocTable(double socPct) {
    if (socTable.empty())
        return 3.7;
    if (socTable.size() == 1)
        return socTable[0][1];
    if (socPct <= socTable[0][0])
        return socTable[0][1];
    size_t n = socTable.size();
    if (socPct >= socTable[n - 1][0])
        return socTable[n - 1][1];
    for (size_t i = 0; i < n - 1; i++) {
        const std::array<double, 2> &a = socTable[i];
        const std::array<double, 2> &b = socTable[i + 1];
        if (socPct >= a[0] && socPct <= b[0]) {
            if (b[0] == a[0])
                return a[1];
            double frac = (socPct - a[0]) / (b[0] - a[0]);
            return a[1] + frac * (b[1] - a[1]);
        }
    }
    return socTable[n - 1][1];
}

void BatteryElm::setVoltageSource(int n, VoltageSource *v) {
    CircuitElm::setVoltageSource(n, v);
    v->setNodes(nodes[0], nodes[2]);
}

void BatteryElm::stamp() {
    sim->stampVoltageSource(nodes[0], nodes[2], voltSource);
    sim->stampResistor(nodes[2], nodes[3], r0);
    sim->stampResistor(nodes[3], nodes[1], r1);

    if (doDcAnalysis()) {
        // when finding DC operating point, replace cap with a 100M resistor
        compResistance = 1e8;
    } else {
        // trapezoidal capacitor companion model (Norton equivalent):
        // resistor in parallel with a current source, between nodes[3] and nodes[1]
        compResistance = sim->timeStep / (2 * c1);
    }
    sim->stampResistor(nodes[3], nodes[1], compResistance);
    // (the TS version marks the right side of nodes 3 and 1 as changing here; that's a no-op)
}

void BatteryElm::startIteration() {
    if (doDcAnalysis())
        curSourceValue = 0;
    else
        curSourceValue = -capVoltDiff / compResistance - capCurrent;
}

void BatteryElm::doStep() {
    sim->updateVoltageSource(nodes[0], nodes[2], voltSource, getVoltageForSoc(soc));
    sim->stampCurrentSource(nodes[3], nodes[1], curSourceValue);
}

void BatteryElm::stepFinished() {
    capVoltDiff = nodes[3]->v - nodes[1]->v;
    if (compResistance > 0)
        capCurrent = capVoltDiff / compResistance + curSourceValue;

    // coulomb counting: "current" (set from the internal voltage source's solved
    // current) is positive when the battery is discharging, per CircuitElm's
    // getCurrentIntoNode() convention for post 1 (the + terminal).
    if (capacityAh > 0 && !doDcAnalysis()) {
        soc -= current * sim->timeStep / (3600 * capacityAh);
        // no lower clamp: below 0% the voltage table is extrapolated (see getVoltageForSoc)
        if (soc > 1)
            soc = 1;
    }
}

void BatteryElm::setPoints() {
    CircuitElm::setPoints();
    calcLeads(8);
}

void BatteryElm::draw(Graphics &g) {
    setBbox(x, y, x2, y2);
    draw2Leads(g);
    setVoltageColor(g, nodes[0]->v);
    setPowerColor(g, false);
    interpPoint2(lead1, lead2, ps1, ps2, 0, 10);
    drawThickLine(g, ps1, ps2);
    setVoltageColor(g, nodes[1]->v);
    setPowerColor(g, false);
    const int hs = 16;
    setBbox(point1, point2, hs);
    interpPoint2(lead1, lead2, ps1, ps2, 1, hs);
    drawThickLine(g, ps1, ps2);

    if (dx == 0 || dy == 0) {
        bool showV = (flags & FLAG_SHOW_VOLTAGE) != 0;
        bool showSoc = (flags & FLAG_SHOW_SOC) != 0;
        std::optional<std::string> s;
        if (showV && showSoc)
            s = getShortUnitText(getVoltageForSoc(soc), "V") + " " + getSocText();
        else if (showV)
            s = getShortUnitText(getVoltageForSoc(soc), "V");
        else if (showSoc)
            s = getSocText();
        if (s)
            drawValues(g, *s, hs);
    }
    updateDotCount();
    if (!isCreating())
        drawDots(g, point1, point2, curcount);
    drawPosts(g);
}

std::string BatteryElm::getSocText() {
    return jsNumberToString(jsmath::round(soc * 100)) + "%";
}

std::string BatteryElm::getBatteryTypeName() {
    return (batteryType >= 0 && batteryType < (int) batteryTypeNames.size()) ? batteryTypeNames[batteryType]
                                                                              : "Custom";
}

void BatteryElm::getInfo(std::vector<std::string> &arr) {
    arr[0] = Locale::LS("battery") + " (" + Locale::LS(getBatteryTypeName()) + ")";
    arr[1] = "I = " + getCurrentText(getCurrent());
    arr[2] = "Vd = " + getVoltageText(getVoltageDiff());
    arr[3] = "SOC = " + getSocText();
    arr[4] = "P = " + getUnitText(getPower(), "W");
}

std::optional<EditInfo> BatteryElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Battery Type", batteryType, -1, -1);
        ei.choice = Choice();
        for (size_t i = 0; i != batteryTypeNames.size(); i++)
            ei.choice->add(batteryTypeNames[i]);
        ei.choice->add("Custom");
        // "Custom" is the entry after all the presets, since BT_CUSTOM isn't a valid array index
        ei.choice->select(batteryType == BT_CUSTOM ? (int) batteryTypeNames.size() : batteryType);
        return ei;
    }
    if (n == 1)
        return EditInfo("Capacity (Ah)", capacityAh).setPositive();
    if (n == 2)
        return EditInfo("Initial State of Charge (%)", initialSoc * 100, 0, 100).setDimensionless();
    if (n == 3)
        return EditInfo("R0, Ohmic Resistance (ohms)", r0).setPositive();
    if (n == 4)
        return EditInfo("R1, Polarization Resistance (ohms)", r1).setPositive();
    if (n == 5)
        return EditInfo("C1, Polarization Capacitance (F)", c1).setPositive();
    if (n == 6) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Show Voltage", (flags & FLAG_SHOW_VOLTAGE) != 0);
        return ei;
    }
    if (n == 7) {
        EditInfo ei("", 0, -1, -1);
        ei.checkbox = Checkbox("Show State of Charge", (flags & FLAG_SHOW_SOC) != 0);
        return ei;
    }
    if (n == 8 && batteryType == BT_CUSTOM) {
        EditInfo ei("SOC(%) = Voltage Table", 0);
        ei.textArea = TextArea{socVoltageTable};
        return ei;
    }
    return std::nullopt;
}

void BatteryElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0 && ei.choice) {
        int oldType = batteryType;
        int sel = ei.choice->getSelectedIndex();
        batteryType = (sel >= (int) batteryTypeNames.size()) ? BT_CUSTOM : sel;
        if (batteryType != BT_CUSTOM) {
            socVoltageTable = batteryTypeTables[batteryType];
            if (batteryType != oldType) {
                const std::array<double, 4> &d = batteryTypeDefaults[batteryType];
                capacityAh = d[0];
                r0 = d[1];
                r1 = d[2];
                c1 = d[3];
            }
        } else if (oldType != BT_CUSTOM)
            socVoltageTable = batteryTypeTables[oldType];
        parseSocTable(nullptr);
        if (batteryType != oldType)
            ei.newDialog = true;
    }
    if (n == 1)
        capacityAh = ei.value;
    if (n == 2) {
        double v = ei.value;
        if (v < 0)
            v = 0;
        if (v > 100)
            v = 100;
        initialSoc = v * .01;
    }
    if (n == 3)
        r0 = ei.value;
    if (n == 4)
        r1 = ei.value;
    if (n == 5)
        c1 = ei.value;
    if (n == 6 && ei.checkbox)
        flags = ei.changeFlag(flags, FLAG_SHOW_VOLTAGE);
    if (n == 7 && ei.checkbox)
        flags = ei.changeFlag(flags, FLAG_SHOW_SOC);
    if (n == 8) {
        socVoltageTable = ei.textArea->value;
        parseSocTable(&ei);
    }
}
