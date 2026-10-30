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

#include "TimerElm.h"

#include "../core/StringTokenizer.h"

#include "../core/SimulationManager.h"

void TimerElm::setupPins() {
    sizeX = 3;
    sizeY = 5;
    pins.assign(8, Pin());
    pins[N_DIS] = Pin(this, 1, SIDE_W, usePinNames() ? "dis" : "7");
    pins[N_TRIG] = Pin(this, 3, SIDE_W, usePinNames() ? "tr" : "2");
    if (usePinNames())
        pins[N_TRIG].lineOver = true;
    pins[N_THRES] = Pin(this, 4, SIDE_W, usePinNames() ? "th" : "6");
    pins[N_VCC] = Pin(this, 1, SIDE_N, usePinNames() ? "Vcc" : "8");
    pins[N_CTL] = Pin(this, 1, SIDE_S, usePinNames() ? "ctl" : "5");
    pins[N_OUT] = Pin(this, 2, SIDE_E, usePinNames() ? "out" : "3");
    pins[N_OUT].state = true;
    pins[N_RST] = Pin(this, 1, SIDE_E, usePinNames() ? "rst" : "4");
    if (usePinNames())
        pins[N_RST].lineOver = true;
    pins[N_GND] = Pin(this, 2, SIDE_S, usePinNames() ? "gnd" : "1");
}

void TimerElm::stamp() {
    ground = hasGroundPin() ? nodes[N_GND] : CircuitNode::ground;
    // stamp voltage divider to put ctl pin at 2/3 V
    sim->stampResistor(nodes[N_VCC], nodes[N_CTL], 5000);
    sim->stampResistor(nodes[N_CTL], ground, 10000);
    // discharge, output, and Vcc pins change in doStep()
    sim->stampNonLinear(nodes[N_DIS]);
    sim->stampNonLinear(nodes[N_OUT]);
    sim->stampNonLinear(nodes[N_VCC]);
    if (hasGroundPin())
        sim->stampNonLinear(nodes[N_GND]);
}

void TimerElm::calculateCurrent() {
    // need current for V, discharge, control, ground; output current is
    // calculated for us, and other pins have no current.
    pins[N_VCC].current = (nodes[N_CTL]->v - nodes[N_VCC]->v) / 5000;
    double groundVolts = hasGroundPin() ? nodes[N_GND]->v : 0;
    pins[N_CTL].current = -(nodes[N_CTL]->v - groundVolts) / 10000 - pins[N_VCC].current;
    pins[N_DIS].current = (!out) ? -(nodes[N_DIS]->v - groundVolts) / 10 : 0;
    pins[N_OUT].current = -(nodes[N_OUT]->v - (out ? nodes[N_VCC]->v : groundVolts));
    if (out)
        pins[N_VCC].current -= pins[N_OUT].current;
    if (hasGroundPin()) {
        pins[N_GND].current = (nodes[N_CTL]->v - groundVolts) / 10000;
        if (!out)
            pins[N_GND].current += (nodes[N_DIS]->v - groundVolts) / 10 + (nodes[N_OUT]->v - groundVolts);
    }
}

void TimerElm::startIteration() {
    double groundVolts = hasGroundPin() ? nodes[N_GND]->v : 0;
    out = nodes[N_OUT]->v > (nodes[N_VCC]->v + groundVolts) / 2;
    // check comparators
    if (nodes[N_THRES]->v > nodes[N_CTL]->v)
        out = false;
    // trigger overrides threshold
    // (save triggered flag in case reset and trigger pins are tied together)
    bool triggered = ((nodes[N_CTL]->v + groundVolts) / 2 > nodes[N_TRIG]->v);
    if (triggered || triggerSuppressed)
        out = true;
    // reset overrides trigger
    if (hasReset() && nodes[N_RST]->v < .7 + groundVolts) {
        out = false;
        // if trigger is overriden, save it
        triggerSuppressed = triggered;
    } else
        triggerSuppressed = false;
}

void TimerElm::doStep() {
    // if output is low, discharge pin 0.  we use a small
    // resistor because it is easier, and sometimes people tie
    // the discharge pin to the trigger and threshold pins.
    if (!out)
        sim->stampResistor(nodes[N_DIS], ground, 10);
    // if output is high, connect Vcc to output with a small resistor.  Otherwise connect output to ground.
    sim->stampResistor(out ? nodes[N_VCC] : ground, nodes[N_OUT], 1);
}

std::optional<EditInfo> TimerElm::getChipEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("", 0, 0, 0);
        ei.checkbox = Checkbox("Ground Pin", hasGroundPin());
        return ei.setStructural();
    }
    if (n == 1)
        return EditInfo::createCheckbox("Show Pin Numbers", usePinNumbers()).setStructural();
    return ChipElm::getChipEditInfo(n);
}

void TimerElm::setChipEditValue(int n, EditInfo &ei) {
    if (n == 0) {
        flags = ei.changeFlag(flags, FLAG_GROUND);
        allocNodes();
        setPoints();
        return;
    }
    if (n == 1) {
        flags = ei.changeFlag(flags, FLAG_NUMBERS);
        setupPins();
        setPoints();
        return;
    }
    ChipElm::setChipEditValue(n, ei);
}
