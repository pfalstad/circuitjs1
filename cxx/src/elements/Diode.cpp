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

#include "Diode.h"

#include <cmath>

#include "../core/JsMath.h"
#include "../core/DiodeModel.h"
#include "../core/SimulationManager.h"

void Diode::setup(DiodeModel *model) {
    leakage = model->saturationCurrent;
    zvoltage = model->breakdownVoltage;
    vscale = model->vscale;
    vdcoef = model->vdcoef;

    // critical voltage for limiting; current is vscale/sqrt(2) at
    // this voltage
    vcrit = vscale * jsmath::log(vscale / (std::sqrt(2) * leakage));
    // translated, *positive* critical voltage for limiting in Zener breakdown region;
    // limitstep() uses this with translated voltages in an analogous fashion to vcrit.
    vzcrit = vt * jsmath::log(vt / (std::sqrt(2) * leakage));
    if (zvoltage == 0)
        zoffset = 0;
    else {
        // calculate offset which will give us 5mA at zvoltage
        double i = -.005;
        zoffset = zvoltage - jsmath::log(-(1 + i / leakage)) / vzcoef;
    }
}

void Diode::setupForDefaultModel() {
    setup(DiodeModel::getDefaultModel());
}

double Diode::limitStep(double vnew, double vold) {
    double arg;

    // check new voltage; has current changed by factor of e^2?
    if (vnew > vcrit && std::abs(vnew - vold) > (vscale + vscale)) {
        if (vold > 0) {
            arg = 1 + (vnew - vold) / vscale;
            if (arg > 0) {
                // adjust vnew so that the current is the same
                // as in linearized model from previous iteration.
                // current at vnew = old current * arg
                vnew = vold + vscale * jsmath::log(arg);
            } else {
                vnew = vcrit;
            }
        } else {
            // adjust vnew so that the current is the same
            // as in linearized model from previous iteration.
            // (1/vscale = slope of load line)
            vnew = vscale * jsmath::log(vnew / vscale);
        }
        sim->converged = false;
    } else if (vnew < 0 && zoffset != 0) {
        // for Zener breakdown, use the same logic but translate the values,
        // and replace the normal values with the Zener-specific ones to
        // account for the steeper exponential of our Zener breakdown curve.
        vnew = -vnew - zoffset;
        vold = -vold - zoffset;

        if (vnew > vzcrit && std::abs(vnew - vold) > (vt + vt)) {
            if (vold > 0) {
                arg = 1 + (vnew - vold) / vt;
                if (arg > 0)
                    vnew = vold + vt * jsmath::log(arg);
                else
                    vnew = vzcrit;
            } else {
                vnew = vt * jsmath::log(vnew / vt);
            }
            sim->converged = false;
        }
        vnew = -(vnew + zoffset);
    }
    return vnew;
}

void Diode::stamp(const NodeRef &n0, const NodeRef &n1) {
    nodes[0] = n0;
    nodes[1] = n1;
    sim->stampNonLinear(nodes[0]);
    sim->stampNonLinear(nodes[1]);
}

void Diode::doStep(double voltdiff) {
    // used to have .1 here, but needed .01 for peak detector
    if (std::abs(voltdiff - lastvoltdiff) > .01)
        sim->converged = false;
    voltdiff = limitStep(voltdiff, lastvoltdiff);
    lastvoltdiff = voltdiff;

    // To prevent a possible singular matrix or other numeric issues, put a tiny conductance
    // in parallel with each P-N junction.
    double gmin = leakage * 0.01;
    if (sim->subIterations > 100) {
        // if we have trouble converging, put a conductance in parallel with the diode.
        // Gradually increase the conductance value for each iteration.
        gmin = jsmath::exp(-9 * jsmath::log(10) * (1 - sim->subIterations / 3000.));
        if (gmin > .1)
            gmin = .1;
    }

    if (voltdiff >= 0 || zvoltage == 0) {
        // regular diode or forward-biased zener
        double eval = jsmath::exp(voltdiff * vdcoef);
        double geq = vdcoef * leakage * eval + gmin;
        double nc = (eval - 1) * leakage - geq * voltdiff;
        sim->stampConductance(nodes[0], nodes[1], geq);
        sim->stampCurrentSource(nodes[0], nodes[1], nc);
    } else {
        // Zener diode

        // For reverse-biased Zener diodes, mimic the Zener breakdown curve with an
        // exponential similar to the ideal Shockley curve. (The real breakdown curve
        // isn't a simple exponential, but this approximation should be OK.)

        /*
         * I(Vd) = Is * (exp[Vd*C] - exp[(-Vd-Vz)*Cz] - 1 )
         *
         * geq is I'(Vd)
         * nc is I(Vd) + I'(Vd)*(-Vd)
         */

        double geq = leakage * (
            vdcoef * jsmath::exp(voltdiff * vdcoef) + vzcoef * jsmath::exp((-voltdiff - zoffset) * vzcoef)
        ) + gmin;

        double nc = leakage * (
            jsmath::exp(voltdiff * vdcoef)
            - jsmath::exp((-voltdiff - zoffset) * vzcoef)
            - 1
        ) + geq * (-voltdiff);

        sim->stampConductance(nodes[0], nodes[1], geq);
        sim->stampCurrentSource(nodes[0], nodes[1], nc);
    }
}

double Diode::calculateCurrent(double voltdiff) {
    if (voltdiff >= 0 || zvoltage == 0)
        return leakage * (jsmath::exp(voltdiff * vdcoef) - 1);
    return leakage * (
        jsmath::exp(voltdiff * vdcoef)
        - jsmath::exp((-voltdiff - zoffset) * vzcoef)
        - 1
    );
}
