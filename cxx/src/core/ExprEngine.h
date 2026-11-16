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

#pragma once

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "CircuitNode.h"
#include "Expr.h"

class CircuitElm;
class VoltageSource;

// an element that owns an ExprEngine stamps each input's derivative itself, since the
// shape of the stamp depends on whether its output is a current or a voltage source
class ExprStampTarget {
public:
    virtual ~ExprStampTarget() = default;
    // dx is d(output)/d(input) for an input that is the voltage from pos to neg
    virtual void stampInputDerivative(const NodeRef &pos, const NodeRef &neg, double dx) = 0;
    // dx is d(output)/d(input) for an input that is the current through vs
    virtual void stampInputDerivativeVS(VoltageSource *vs, double dx) = 0;
};

// The expression machinery shared by the controlled sources: parsing, the v(name)/i(name)
// references and their resolution, and the numeric Jacobian.
//
// Expression inputs come in two groups.  First the owner's own input pins, whose voltages
// live in ExprState.values[] as the letters a..i; the owner says how many there are via
// pinInputCount (0 for elements with no input pins, and for the current-controlled sources,
// whose pin inputs are currents they load themselves).  After those come the v()/i()
// references, whose values live in ExprState.nodeValues[].
//
// Each reference occupies two nodes in the owner's nodes[] array, past its posts and
// internal nodes: the positive and negative end of the referenced quantity.  They live
// there rather than here so that the analyzer can see them and pull the referenced node
// into the same matrix, which is what makes it legal to stamp a derivative against it.
class ExprEngine {
public:
    CircuitElm *owner;
    ExprStampTarget *target;

    // how many expression inputs come from the owner's pins, ahead of the references
    int pinInputCount = 0;

    std::string exprString;
    std::unique_ptr<Expr> expr;
    ExprState state;

    std::vector<ExprNodeRef> refs;
    // what each reference resolved to: the meter element for a v()/i() on a named meter,
    // null for a labeled node (whose node we hold directly) or an unresolved name
    std::vector<CircuitElm *> refElms;

    // previous value of each expression input, used for the numeric derivative
    std::vector<double> lastInputs;

    // value of the expression at the last evalAndStamp()
    double value = 0;

    ExprEngine(CircuitElm *owner, ExprStampTarget *target) : owner(owner), target(target) {}

    // roll the current values into the previous-timestep slots that lasta..lasti,
    // lastoutput and dvdt()/didt() read.  called once per timestep, from stepFinished().
    void stepFinished(double output) { state.updateLastValues(output); }

    // parse a new expression, returning a parse error message or nullopt.  the caller must
    // call alloc() afterwards, and the circuit must be re-analyzed: the reference count
    // may have changed, and with it the owner's node count.
    std::optional<std::string> parse(const std::string &exprString);

    int getRefCount() const { return (int) refs.size(); }
    // two nodes per reference: the positive and negative end of the referenced quantity
    int getRefNodeCount() const { return 2 * (int) refs.size(); }
    // index in the owner's nodes[] of the positive node of reference k
    int refNodeIndex(int k);

    // size the arrays that depend on the input count.  call after parse(), and whenever
    // the owner's pin input count changes.
    void alloc(int pinInputCount);
    void reset();
    void resolveRefs(std::vector<CircuitElm *> &elmList);
    void resolveRefElmsByNode(std::vector<CircuitElm *> &elmList);

    // total number of expression inputs we take a derivative against
    int getInputCount() const { return pinInputCount + (int) refs.size(); }
    double getInputValue(int i);
    void setInputValue(int i, double v);
    const NodeRef &getInputNodePos(int i);
    const NodeRef &getInputNodeNeg(int i);
    VoltageSource *getInputVS(int i);
    bool checkConvergence(double baseLimit);
    void saveInputs();
    double evalAndStamp(bool negate);
    int addUnresolvedInfo(std::vector<std::string> &arr, int i);
};
