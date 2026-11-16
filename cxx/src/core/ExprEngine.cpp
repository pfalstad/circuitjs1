/*
    Copyright (C) Paul Falstad

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

#include "ExprEngine.h"

#include "../elements/LabeledNodeElm.h"

#include <cmath>

#include "CircuitElm.h"
#include "SimulationManager.h"

std::optional<std::string> ExprEngine::parse(const std::string &s) {
    exprString = s;
    ExprParser parser(s);
    expr = parser.parseExpression();
    refs = parser.getNodeRefs();
    return parser.gotError();
}

int ExprEngine::refNodeIndex(int k) {
    return owner->getRefNodeBase() + 2 * k;
}

void ExprEngine::alloc(int pic) {
    pinInputCount = pic;
    state.nodeValues.assign(getRefCount(), 0);
    state.lastNodeValues.assign(getRefCount(), 0);
    lastInputs.assign(getInputCount(), 0);
    refElms.assign(getRefCount(), nullptr);
}

void ExprEngine::reset() {
    state.reset();
    std::fill(lastInputs.begin(), lastInputs.end(), 0.0);
}

void ExprEngine::resolveRefs(std::vector<CircuitElm *> &elmList) {
    refElms.assign(getRefCount(), nullptr);
    for (int k = 0; k != getRefCount(); k++) {
        const ExprNodeRef &ref = refs[k];
        int ix = refNodeIndex(k);
        owner->setNode(ix, CircuitNode::ground);
        owner->setNode(ix + 1, CircuitNode::ground);

        // a labeled node wins over an element with the same name
        if (!ref.current) {
            NodeRef cn = LabeledNodeElm::getByName(ref.name);
            if (cn != nullptr) {
                owner->setNode(ix, cn);
                continue;
            }
        }

        CircuitElm *elm = nullptr;
        for (CircuitElm *ce : elmList)
            if (ce->getExprRefName() == ref.name) {
                elm = ce;
                break;
            }
        if (elm == nullptr || elm->getPostCount() < 2)
            continue;  // unresolved; the slots stay ground and getInfo() reports it
        refElms[k] = elm;
        // take the meter's nodes even for a current reference, where we do not stamp
        // against them: its voltage source row has to land in the same matrix as us.
        owner->setNode(ix, elm->getNode(0));
        owner->setNode(ix + 1, elm->getNode(1));
    }
}

// Inside a subcircuit a reference arrives as node numbers rather than a name, because
// the name was resolved when the model was built (see GetCircuitAsSubcircuit's "rn").
// That is enough for v(), but i() also needs the element itself, for its current and
// its voltage source row -- so find the sibling whose voltage source spans the two
// nodes we recorded.  This is how CCCSElm/CCVSElm already locate their sense elements.
// Only fills gaps: a name resolved at the top level keeps the element it found.
void ExprEngine::resolveRefElmsByNode(std::vector<CircuitElm *> &elmList) {
    for (int k = 0; k != getRefCount(); k++) {
        if (!refs[k].current || refElms[k] != nullptr)
            continue;
        int ix = refNodeIndex(k);
        const NodeRef &n0 = owner->nodes[ix];
        const NodeRef &n1 = owner->nodes[ix + 1];
        if (n0 == n1)
            continue;  // unresolved (both ground)
        for (CircuitElm *ce : elmList) {
            if (ce == owner || ce->voltSource == nullptr || ce->getPostCount() < 2)
                continue;
            if ((ce->getNode(0) == n0 && ce->getNode(1) == n1) || (ce->getNode(0) == n1 && ce->getNode(1) == n0)) {
                refElms[k] = ce;
                break;
            }
        }
    }
}

double ExprEngine::getInputValue(int i) {
    if (i < pinInputCount)
        return owner->nodes[i]->v;
    int k = i - pinInputCount;
    CircuitElm *elm = refElms[k];
    if (refs[k].current)
        return (elm == nullptr) ? 0 : elm->getCurrent();
    int ix = refNodeIndex(k);
    return owner->nodes[ix]->v - owner->nodes[ix + 1]->v;
}

void ExprEngine::setInputValue(int i, double v) {
    if (i < pinInputCount)
        state.values[i] = v;
    else
        state.nodeValues[i - pinInputCount] = v;
}

// the node pair input i is a voltage across.  ground/ground for a current reference,
// which stamps against a voltage source row instead.
const NodeRef &ExprEngine::getInputNodePos(int i) {
    if (i < pinInputCount)
        return owner->nodes[i];
    int k = i - pinInputCount;
    return refs[k].current ? CircuitNode::ground : owner->nodes[refNodeIndex(k)];
}

const NodeRef &ExprEngine::getInputNodeNeg(int i) {
    if (i < pinInputCount)
        return CircuitNode::ground;
    int k = i - pinInputCount;
    return refs[k].current ? CircuitNode::ground : owner->nodes[refNodeIndex(k) + 1];
}

// the voltage source input i is the current through, or null if it is a voltage
VoltageSource *ExprEngine::getInputVS(int i) {
    if (i < pinInputCount)
        return nullptr;
    int k = i - pinInputCount;
    if (!refs[k].current)
        return nullptr;
    CircuitElm *elm = refElms[k];
    return (elm == nullptr) ? nullptr : elm->voltSource;
}

// have all our inputs settled?  currents get a tighter window than voltages, matching
// what CCCSElm/CCVSElm already do for their current inputs.
bool ExprEngine::checkConvergence(double baseLimit) {
    for (int i = 0; i != getInputCount(); i++) {
        double lim = (getInputVS(i) != nullptr) ? baseLimit * 0.1 : baseLimit;
        if (std::abs(getInputValue(i) - lastInputs[i]) > lim)
            return false;
    }
    return true;
}

void ExprEngine::saveInputs() {
    for (int i = 0; i != getInputCount(); i++)
        lastInputs[i] = getInputValue(i);
}

// evaluate the expression and stamp the linearization of each input's contribution,
// through the owner's stampInputDerivative*() methods.  negate is for the elements
// whose output is the negated expression value.  leaves the value in this.value and
// returns the right-side residual for the caller to stamp.
double ExprEngine::evalAndStamp(bool negate) {
    double sgn = negate ? -1 : 1;
    int n = getInputCount();
    const Expr &e = *expr;

    for (int i = 0; i != n; i++)
        setInputValue(i, getInputValue(i));
    state.t = CircuitElm::sim->t;
    double v0 = sgn * e.eval(state);
    value = v0;
    double rs = v0;

    for (int i = 0; i != n; i++) {
        double x0 = getInputValue(i);
        double dv = x0 - lastInputs[i];
        if (std::abs(dv) < 1e-6) dv = 1e-6;
        setInputValue(i, x0);
        double v = sgn * e.eval(state);
        setInputValue(i, x0 - dv);
        double v2 = sgn * e.eval(state);
        double dx = (v - v2) / dv;
        if (std::abs(dx) < 1e-6)
            dx = (dx > 0) ? 1e-6 : -1e-6;
        VoltageSource *vs = getInputVS(i);
        if (vs != nullptr)
            target->stampInputDerivativeVS(vs, dx);
        else
            target->stampInputDerivative(getInputNodePos(i), getInputNodeNeg(i), dx);
        rs -= dx * x0;
        setInputValue(i, x0);
    }
    return rs;
}

// describe any v()/i() reference we could not resolve, appending to arr from index i
// and returning the next free index
int ExprEngine::addUnresolvedInfo(std::vector<std::string> &arr, int i) {
    for (int k = 0; k != getRefCount(); k++) {
        const ExprNodeRef &ref = refs[k];
        bool resolved = refElms[k] != nullptr || (!ref.current && LabeledNodeElm::getByName(ref.name) != nullptr);
        std::string msg;
        if (!resolved)
            msg = "unknown name: " + std::string(ref.current ? "i(" : "v(") + ref.name + ")";
        else if (ref.current && getInputVS(k + pinInputCount) == nullptr)
            msg = "not a current meter: " + ref.name;
        else
            continue;
        if ((int) arr.size() <= i)
            arr.resize(i + 1);
        arr[i++] = msg;
    }
    return i;
}
