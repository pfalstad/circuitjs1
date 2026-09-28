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

import { CircuitElm } from "./CircuitElm";
import { CircuitNode } from "./CircuitNode";
import { VoltageSource } from "./VoltageSource";
import { Expr, ExprState, ExprParser, ExprNodeRef } from "./Expr";
import { SimulationManager } from "./SimulationManager";
import { HookRegistry } from "./HookRegistry";

// an element that owns an ExprEngine stamps each input's derivative itself, since the
// shape of the stamp depends on whether its output is a current or a voltage source
export interface ExprStampTarget {
    // dx is d(output)/d(input) for an input that is the voltage from pos to neg
    stampInputDerivative(pos: CircuitNode, neg: CircuitNode, dx: number): void;
    // dx is d(output)/d(input) for an input that is the current through vs
    stampInputDerivativeVS(vs: VoltageSource, dx: number): void;
}

export type ExprOwner = CircuitElm & ExprStampTarget;

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
export class ExprEngine {
    owner: ExprOwner;

    // how many expression inputs come from the owner's pins, ahead of the references
    pinInputCount: number = 0;

    exprString: string = "";
    expr: Expr | null = null;
    state: ExprState = new ExprState(0);

    refs: ExprNodeRef[] = [];
    // what each reference resolved to: the meter element for a v()/i() on a named meter,
    // null for a labeled node (whose node we hold directly) or an unresolved name
    refElms: (CircuitElm | null)[] = [];

    // previous value of each expression input, used for the numeric derivative
    lastInputs: number[] = [];

    // value of the expression at the last evalAndStamp()
    value: number = 0;

    // roll the current values into the previous-timestep slots that lasta..lasti,
    // lastoutput and dvdt()/didt() read.  called once per timestep, from stepFinished().
    stepFinished(output: number): void { this.state.updateLastValues(output); }

    constructor(owner: ExprOwner) {
        this.owner = owner;
    }

    // parse a new expression, returning a parse error message or null.  the caller must
    // call alloc() afterwards, and the circuit must be re-analyzed: the reference count
    // may have changed, and with it the owner's node count.
    parse(exprString: string): string | null {
        this.exprString = exprString;
        const parser = new ExprParser(exprString);
        this.expr = parser.parseExpression();
        this.refs = parser.getNodeRefs();
        return parser.gotError();
    }

    getRefCount(): number { return this.refs.length; }

    // two nodes per reference: the positive and negative end of the referenced quantity
    getRefNodeCount(): number { return 2 * this.refs.length; }

    // index in the owner's nodes[] of the positive node of reference k
    refNodeIndex(k: number): number {
        return this.owner.getRefNodeBase() + 2 * k;
    }

    // size the arrays that depend on the input count.  call after parse(), and whenever
    // the owner's pin input count changes.
    alloc(pinInputCount: number): void {
        this.pinInputCount = pinInputCount;
        this.state.nodeValues = new Array(this.getRefCount()).fill(0);
        this.state.lastNodeValues = new Array(this.getRefCount()).fill(0);
        this.lastInputs = new Array(this.getInputCount()).fill(0);
        this.refElms = new Array(this.getRefCount()).fill(null);
    }

    reset(): void {
        this.state.reset();
        this.lastInputs.fill(0);
    }

    resolveRefs(elmList: CircuitElm[]): void {
        this.refElms = new Array(this.getRefCount()).fill(null);
        for (let k = 0; k !== this.getRefCount(); k++) {
            const ref = this.refs[k];
            const ix = this.refNodeIndex(k);
            this.owner.setNode(ix,     CircuitNode.ground);
            this.owner.setNode(ix + 1, CircuitNode.ground);

            // a labeled node wins over an element with the same name
            if (!ref.current) {
                const cn = HookRegistry.getLabeledNode?.(ref.name);
                if (cn != null) {
                    this.owner.setNode(ix, cn);
                    continue;
                }
            }

            let elm: CircuitElm | null = null;
            for (let j = 0; j !== elmList.length; j++)
                if (elmList[j].getExprRefName() === ref.name) {
                    elm = elmList[j];
                    break;
                }
            if (elm == null || elm.getPostCount() < 2)
                continue;  // unresolved; the slots stay ground and getInfo() reports it
            this.refElms[k] = elm;
            // take the meter's nodes even for a current reference, where we don't stamp
            // against them: its voltage source row has to land in the same matrix as us.
            this.owner.setNode(ix,     elm.getNode(0));
            this.owner.setNode(ix + 1, elm.getNode(1));
        }
    }

    // Inside a subcircuit a reference arrives as node numbers rather than a name, because
    // the name was resolved when the model was built (see GetCircuitAsSubcircuit's "rn").
    // That's enough for v(), but i() also needs the element itself, for its current and
    // its voltage source row -- so find the sibling whose voltage source spans the two
    // nodes we recorded.  This is how CCCSElm/CCVSElm already locate their sense elements.
    // Only fills gaps: a name resolved at the top level keeps the element it found.
    resolveRefElmsByNode(elmList: CircuitElm[]): void {
        for (let k = 0; k !== this.getRefCount(); k++) {
            if (!this.refs[k].current || this.refElms[k] != null)
                continue;
            const ix = this.refNodeIndex(k);
            const n0 = this.owner.nodes[ix];
            const n1 = this.owner.nodes[ix + 1];
            if (n0 === n1)
                continue;  // unresolved (both ground)
            for (let j = 0; j !== elmList.length; j++) {
                const ce = elmList[j];
                if (ce === this.owner || ce.voltSource == null || ce.getPostCount() < 2)
                    continue;
                if ((ce.getNode(0) === n0 && ce.getNode(1) === n1) ||
                        (ce.getNode(0) === n1 && ce.getNode(1) === n0)) {
                    this.refElms[k] = ce;
                    break;
                }
            }
        }
    }

    // total number of expression inputs we take a derivative against
    getInputCount(): number { return this.pinInputCount + this.refs.length; }

    getInputValue(i: number): number {
        if (i < this.pinInputCount)
            return this.owner.nodes[i].v;
        const k = i - this.pinInputCount;
        const elm = this.refElms[k];
        if (this.refs[k].current)
            return (elm == null) ? 0 : elm.getCurrent();
        const ix = this.refNodeIndex(k);
        return this.owner.nodes[ix].v - this.owner.nodes[ix + 1].v;
    }

    setInputValue(i: number, v: number): void {
        if (i < this.pinInputCount)
            this.state.values[i] = v;
        else
            this.state.nodeValues[i - this.pinInputCount] = v;
    }

    // the node pair input i is a voltage across.  ground/ground for a current reference,
    // which stamps against a voltage source row instead.
    getInputNodePos(i: number): CircuitNode {
        if (i < this.pinInputCount)
            return this.owner.nodes[i];
        const k = i - this.pinInputCount;
        return this.refs[k].current ? CircuitNode.ground : this.owner.nodes[this.refNodeIndex(k)];
    }

    getInputNodeNeg(i: number): CircuitNode {
        if (i < this.pinInputCount)
            return CircuitNode.ground;
        const k = i - this.pinInputCount;
        return this.refs[k].current ? CircuitNode.ground : this.owner.nodes[this.refNodeIndex(k) + 1];
    }

    // the voltage source input i is the current through, or null if it's a voltage
    getInputVS(i: number): VoltageSource | null {
        if (i < this.pinInputCount)
            return null;
        const k = i - this.pinInputCount;
        if (!this.refs[k].current)
            return null;
        const elm = this.refElms[k];
        return (elm == null) ? null : elm.voltSource;
    }

    // have all our inputs settled?  currents get a tighter window than voltages, matching
    // what CCCSElm/CCVSElm already do for their current inputs.
    checkConvergence(baseLimit: number): boolean {
        for (let i = 0; i !== this.getInputCount(); i++) {
            const lim = (this.getInputVS(i) != null) ? baseLimit * 0.1 : baseLimit;
            if (Math.abs(this.getInputValue(i) - this.lastInputs[i]) > lim)
                return false;
        }
        return true;
    }

    saveInputs(): void {
        for (let i = 0; i !== this.getInputCount(); i++)
            this.lastInputs[i] = this.getInputValue(i);
    }

    // evaluate the expression and stamp the linearization of each input's contribution,
    // through the owner's stampInputDerivative*() methods.  negate is for the elements
    // whose output is the negated expression value.  leaves the value in this.value and
    // returns the right-side residual for the caller to stamp.
    evalAndStamp(negate: boolean): number {
        const sgn = negate ? -1 : 1;
        const n = this.getInputCount();
        const e = this.expr!;

        for (let i = 0; i !== n; i++)
            this.setInputValue(i, this.getInputValue(i));
        this.state.t = SimulationManager.theSim.t;
        const v0 = sgn * e.eval(this.state);
        this.value = v0;
        let rs = v0;

        for (let i = 0; i !== n; i++) {
            const x0 = this.getInputValue(i);
            let dv = x0 - this.lastInputs[i];
            if (Math.abs(dv) < 1e-6) dv = 1e-6;
            this.setInputValue(i, x0);
            const v = sgn * e.eval(this.state);
            this.setInputValue(i, x0 - dv);
            const v2 = sgn * e.eval(this.state);
            let dx = (v - v2) / dv;
            if (Math.abs(dx) < 1e-6)
                dx = (dx > 0) ? 1e-6 : -1e-6;
            const vs = this.getInputVS(i);
            if (vs != null)
                this.owner.stampInputDerivativeVS(vs, dx);
            else
                this.owner.stampInputDerivative(this.getInputNodePos(i), this.getInputNodeNeg(i), dx);
            rs -= dx * x0;
            this.setInputValue(i, x0);
        }
        return rs;
    }

    // describe any v()/i() reference we couldn't resolve, appending to arr from index i
    // and returning the next free index
    addUnresolvedInfo(arr: string[], i: number): number {
        for (let k = 0; k !== this.getRefCount(); k++) {
            const ref = this.refs[k];
            const resolved = this.refElms[k] != null ||
                (!ref.current && HookRegistry.getLabeledNode?.(ref.name) != null);
            if (!resolved)
                arr[i++] = "unknown name: " + (ref.current ? "i(" : "v(") + ref.name + ")";
            else if (ref.current && this.getInputVS(k + this.pinInputCount) == null)
                arr[i++] = "not a current meter: " + ref.name;
        }
        return i;
    }
}
