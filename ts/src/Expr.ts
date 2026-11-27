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

import { SimulationManager } from "./SimulationManager";
import { parseFloatStrict } from "./NumberParse";

// a quantity an expression refers to by name: v(name) for the voltage of a labeled node
// or across a voltmeter, i(name) for the current through an ammeter.  the parser records
// these; the element owning the expression resolves them when the circuit is analyzed.
export class ExprNodeRef {
    name: string;
    current: boolean;  // true for i(name), false for v(name)

    constructor(name: string, current: boolean) {
        this.name = name;
        this.current = current;
    }
}

export class ExprState {
    values: number[];
    lastValues: number[];
    // values of the quantities referenced by v(name)/i(name), one slot per reference, in
    // the order ExprParser.getNodeRefs() returned them.  sized by the element after parsing.
    nodeValues: number[] = [];
    // the same quantities one timestep ago, for dvdt()/didt()
    lastNodeValues: number[] = [];
    lastOutput: number = 0;
    t: number = 0;

    constructor(_xx: number) {
        this.values = new Array(9).fill(0);
        this.lastValues = new Array(9).fill(0);
        this.values[4] = Math.E;
    }

    updateLastValues(lastOut: number): void {
        this.lastOutput = lastOut;
        for (let i = 0; i !== this.values.length; i++)
            this.lastValues[i] = this.values[i];
        for (let i = 0; i !== this.nodeValues.length; i++)
            this.lastNodeValues[i] = this.nodeValues[i];
    }

    reset(): void {
        for (let i = 0; i !== this.values.length; i++)
            this.lastValues[i] = 0;
        for (let i = 0; i !== this.lastNodeValues.length; i++)
            this.lastNodeValues[i] = 0;
        this.lastOutput = 0;
    }
}

export class Expr {
    children: Expr[] | null = null;
    value: number = 0;
    type: number;
    // for E_NODEV, the referenced name (value holds its index into ExprState.nodeValues)
    name: string = "";

    static readonly E_ADD = 1;
    static readonly E_SUB = 2;
    static readonly E_T = 3;
    // v(name)/i(name): a quantity referenced by name.  must be below E_A, since eval()'s
    // default branch resolves anything >= E_A by range subtraction.
    static readonly E_NODEV = 4;
    // dvdt(name)/didt(name): rate of change of the same quantity.  shares the reference
    // slot with E_NODEV, since the slot holds the raw quantity either way.
    static readonly E_NODEDVDT = 5;
    static readonly E_VAL = 6;
    static readonly E_MUL = 7;
    static readonly E_DIV = 8;
    static readonly E_POW = 9;
    static readonly E_UMINUS = 10;
    static readonly E_SIN = 11;
    static readonly E_COS = 12;
    static readonly E_ABS = 13;
    static readonly E_EXP = 14;
    static readonly E_LOG = 15;
    static readonly E_SQRT = 16;
    static readonly E_TAN = 17;
    static readonly E_R = 18;
    static readonly E_MAX = 19;
    static readonly E_MIN = 20;
    static readonly E_CLAMP = 21;
    static readonly E_PWL = 22;
    static readonly E_TRIANGLE = 23;
    static readonly E_SAWTOOTH = 24;
    static readonly E_MOD = 25;
    static readonly E_STEP = 26;
    static readonly E_SELECT = 27;
    static readonly E_PWR = 28;
    static readonly E_PWRS = 29;
    static readonly E_LASTOUTPUT = 30;
    static readonly E_TIMESTEP = 31;
    static readonly E_TERNARY = 32;
    static readonly E_OR = 33;
    static readonly E_AND = 34;
    static readonly E_EQUALS = 35;
    static readonly E_LEQ = 36;
    static readonly E_GEQ = 37;
    static readonly E_LESS = 38;
    static readonly E_GREATER = 39;
    static readonly E_NEQ = 40;
    static readonly E_NOT = 41;
    static readonly E_FLOOR = 42;
    static readonly E_CEIL = 43;
    static readonly E_ASIN = 44;
    static readonly E_ACOS = 45;
    static readonly E_ATAN = 46;
    static readonly E_SINH = 47;
    static readonly E_COSH = 48;
    static readonly E_TANH = 49;
    static readonly E_BITAND = 50;
    static readonly E_BITOR = 51;
    static readonly E_RSHIFT = 52;
    static readonly E_A = 53;
    static readonly E_DADT = 53 + 10; // E_A + 10
    static readonly E_LASTA = 53 + 20; // E_DADT + 10

    constructor(e1OrV: Expr | number, e2OrVv?: Expr | number | null, v?: number) {
        if (typeof e1OrV === "number" && e2OrVv === undefined) {
            // Expr(int v)
            this.type = e1OrV;
        } else if (typeof e1OrV === "number" && typeof e2OrVv === "number") {
            // Expr(int v, double vv)
            this.type = e1OrV;
            this.value = e2OrVv;
        } else {
            // Expr(Expr e1, Expr|null e2, int v)
            this.type = v!;
            this.children = [e1OrV as Expr];
            if (e2OrVv != null)
                this.children.push(e2OrVv as Expr);
        }
    }

    eval(es: ExprState): number {
        let left: Expr | null = null;
        let right: Expr | null = null;
        if (this.children != null && this.children.length > 0) {
            left = this.children[0];
            if (this.children.length >= 2)
                right = this.children[this.children.length - 1];
        }
        switch (this.type) {
        case Expr.E_ADD: return left!.eval(es) + right!.eval(es);
        case Expr.E_SUB: return left!.eval(es) - right!.eval(es);
        case Expr.E_MUL: return left!.eval(es) * right!.eval(es);
        case Expr.E_DIV: return left!.eval(es) / right!.eval(es);
        case Expr.E_POW: return Math.pow(left!.eval(es), right!.eval(es));
        case Expr.E_OR:  return (left!.eval(es) !== 0 || right!.eval(es) !== 0) ? 1 : 0;
        case Expr.E_AND: return (left!.eval(es) !== 0 && right!.eval(es) !== 0) ? 1 : 0;
        case Expr.E_EQUALS: return (left!.eval(es) === right!.eval(es)) ? 1 : 0;
        case Expr.E_NEQ: return (left!.eval(es) !== right!.eval(es)) ? 1 : 0;
        case Expr.E_LEQ: return (left!.eval(es) <= right!.eval(es)) ? 1 : 0;
        case Expr.E_GEQ: return (left!.eval(es) >= right!.eval(es)) ? 1 : 0;
        case Expr.E_LESS: return (left!.eval(es) < right!.eval(es)) ? 1 : 0;
        case Expr.E_GREATER: return (left!.eval(es) > right!.eval(es)) ? 1 : 0;
        case Expr.E_TERNARY: return this.children![left!.eval(es) !== 0 ? 1 : 2].eval(es);
        case Expr.E_UMINUS: return -left!.eval(es);
        case Expr.E_NOT: return left!.eval(es) === 0 ? 1 : 0;
        case Expr.E_VAL: return this.value;
        case Expr.E_T: return es.t;
        case Expr.E_NODEV: return es.nodeValues[this.value];
        case Expr.E_NODEDVDT:
            return (es.nodeValues[this.value] - es.lastNodeValues[this.value]) /
                SimulationManager.theSim.timeStep;
        case Expr.E_SIN: return Math.sin(left!.eval(es));
        case Expr.E_COS: return Math.cos(left!.eval(es));
        case Expr.E_ABS: return Math.abs(left!.eval(es));
        case Expr.E_EXP: return Math.exp(left!.eval(es));
        case Expr.E_LOG: return Math.log(left!.eval(es));
        case Expr.E_SQRT: return Math.sqrt(left!.eval(es));
        case Expr.E_TAN: return Math.tan(left!.eval(es));
        case Expr.E_ASIN: return Math.asin(left!.eval(es));
        case Expr.E_ACOS: return Math.acos(left!.eval(es));
        case Expr.E_ATAN: return Math.atan(left!.eval(es));
        case Expr.E_SINH: return Math.sinh(left!.eval(es));
        case Expr.E_COSH: return Math.cosh(left!.eval(es));
        case Expr.E_TANH: return Math.tanh(left!.eval(es));
        case Expr.E_BITAND: return (left!.eval(es) | 0) & (right!.eval(es) | 0);
        case Expr.E_BITOR:  return (left!.eval(es) | 0) | (right!.eval(es) | 0);
        case Expr.E_RSHIFT: return (left!.eval(es) | 0) >> (right!.eval(es) | 0);
        case Expr.E_FLOOR: return Math.floor(left!.eval(es));
        case Expr.E_CEIL: return Math.ceil(left!.eval(es));
        case Expr.E_MIN: {
            let x = left!.eval(es);
            for (let i = 1; i < this.children!.length; i++)
                x = Math.min(x, this.children![i].eval(es));
            return x;
        }
        case Expr.E_MAX: {
            let x = left!.eval(es);
            for (let i = 1; i < this.children!.length; i++)
                x = Math.max(x, this.children![i].eval(es));
            return x;
        }
        case Expr.E_CLAMP:
            return Math.min(Math.max(left!.eval(es), this.children![1].eval(es)), this.children![2].eval(es));
        case Expr.E_STEP: {
            const x = left!.eval(es);
            if (right == null)
                return (x < 0) ? 0 : 1;
            return (x > right.eval(es)) ? 0 : (x < 0) ? 0 : 1;
        }
        case Expr.E_SELECT: {
            const x = left!.eval(es);
            return this.children![x > 0 ? 2 : 1].eval(es);
        }
        case Expr.E_TRIANGLE: {
            const x = this.posmod(left!.eval(es), Math.PI * 2) / Math.PI;
            return (x < 1) ? -1 + x * 2 : 3 - x * 2;
        }
        case Expr.E_SAWTOOTH: {
            const x = this.posmod(left!.eval(es), Math.PI * 2) / Math.PI;
            return x - 1;
        }
        case Expr.E_MOD:
            return left!.eval(es) % right!.eval(es);
        case Expr.E_PWL:
            return this.pwl(es, this.children!);
        case Expr.E_PWR:
            return Math.pow(Math.abs(left!.eval(es)), right!.eval(es));
        case Expr.E_PWRS: {
            const x = left!.eval(es);
            if (x < 0)
                return -Math.pow(-x, right!.eval(es));
            return Math.pow(x, right!.eval(es));
        }
        case Expr.E_LASTOUTPUT:
            return es.lastOutput;
        case Expr.E_TIMESTEP:
            return SimulationManager.theSim.timeStep;
        default:
            if (this.type >= Expr.E_LASTA)
                return es.lastValues[this.type - Expr.E_LASTA];
            if (this.type >= Expr.E_DADT)
                return (es.values[this.type - Expr.E_DADT] - es.lastValues[this.type - Expr.E_DADT]) / SimulationManager.theSim.timeStep;
            if (this.type >= Expr.E_A)
                return es.values[this.type - Expr.E_A];
            console.error("unknown Expr type");
        }
        return 0;
    }

    private pwl(es: ExprState, args: Expr[]): number {
        const x = args[0].eval(es);
        let x0 = args[1].eval(es);
        let y0 = args[2].eval(es);
        if (x < x0)
            return y0;
        let x1 = args[3].eval(es);
        let y1 = args[4].eval(es);
        let i = 5;
        while (true) {
            if (x < x1)
                return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
            if (i + 1 >= args.length)
                break;
            x0 = x1;
            y0 = y1;
            x1 = args[i].eval(es);
            y1 = args[i + 1].eval(es);
            i += 2;
        }
        return y1;
    }

    private posmod(x: number, y: number): number {
        x %= y;
        return (x >= 0) ? x : x + y;
    }
}

export class ExprParser {
    private text: string;
    // original text with case preserved.  node labels are case-sensitive, so v(name)
    // arguments are scanned out of this rather than out of the lowercased text.
    private origText: string;
    private token: string = "";
    private pos: number = 0;
    private tlen: number;
    private err: string | null = null;
    private nodeRefs: ExprNodeRef[] = [];

    constructor(s: string) {
        this.origText = s;
        this.text = s.toLowerCase();
        this.tlen = this.text.length;
        this.getToken();
    }

    // quantities referenced by v()/i() in this expression, in slot order
    getNodeRefs(): ExprNodeRef[] { return this.nodeRefs; }

    private getToken(): void {
        while (this.pos < this.tlen && this.text.charAt(this.pos) === ' ')
            this.pos++;
        if (this.pos === this.tlen) {
            this.token = "";
            return;
        }
        let i = this.pos;
        const c = this.text.charCodeAt(i);
        if ((c >= 48 && c <= 57) || this.text.charAt(i) === '.') { // '0'-'9' or '.'
            for (i = this.pos; i !== this.tlen; i++) {
                if (this.text.charAt(i) === 'e' || this.text.charAt(i) === 'E') {
                    i++;
                    if (i < this.tlen && (this.text.charAt(i) === '+' || this.text.charAt(i) === '-'))
                        i++;
                }
                const ch = this.text.charCodeAt(i);
                if (!((ch >= 48 && ch <= 57) || this.text.charAt(i) === '.'))
                    break;
            }
        } else if (c >= 97 && c <= 122) { // 'a'-'z'
            for (i = this.pos; i !== this.tlen; i++) {
                const ch = this.text.charCodeAt(i);
                if (!(ch >= 97 && ch <= 122))
                    break;
            }
        } else {
            i++;
            if (i < this.tlen) {
                const ch = this.text.charAt(i);
                const cc = this.text.charAt(i - 1);
                // ||, &&, <<, >>, ==
                if (ch === cc && (cc === '|' || cc === '&' || cc === '<' || cc === '>' || cc === '='))
                    i++;
                // <=, >=, !=
                else if ((cc === '<' || cc === '>' || cc === '!') && ch === '=')
                    i++;
            }
        }
        this.token = this.text.substring(this.pos, i);
        this.pos = i;
    }

    private skip(s: string): boolean {
        if (this.token !== s)
            return false;
        this.getToken();
        return true;
    }

    private setError(s: string): void {
        if (this.err == null)
            this.err = s;
    }

    private skipOrError(s: string): void {
        if (!this.skip(s))
            this.setError("expected " + s + ", got " + this.token);
    }

    parseExpression(): Expr {
        if (this.token.length === 0)
            return new Expr(Expr.E_VAL, 0);
        const e = this.parse();
        if (this.token.length > 0)
            this.setError("unexpected token: " + this.token);
        return e;
    }

    private parse(): Expr {
        const e = this.parseOr();
        if (this.skip("?")) {
            const e2 = this.parseOr();
            this.skipOrError(":");
            const e3 = this.parse();
            const ret = new Expr(e, e2, Expr.E_TERNARY);
            ret.children!.push(e3);
            return ret;
        }
        return e;
    }

    private parseOr(): Expr {
        let e = this.parseAnd();
        while (this.skip("||"))
            e = new Expr(e, this.parseAnd(), Expr.E_OR);
        return e;
    }

    private parseAnd(): Expr {
        let e = this.parseBitOr();
        while (this.skip("&&"))
            e = new Expr(e, this.parseBitOr(), Expr.E_AND);
        return e;
    }

    private parseBitOr(): Expr {
        let e = this.parseBitAnd();
        while (this.skip("|"))
            e = new Expr(e, this.parseBitAnd(), Expr.E_BITOR);
        return e;
    }

    private parseBitAnd(): Expr {
        let e = this.parseEquals();
        while (this.skip("&"))
            e = new Expr(e, this.parseEquals(), Expr.E_BITAND);
        return e;
    }

    private parseEquals(): Expr {
        const e = this.parseCompare();
        if (this.skip("=="))
            return new Expr(e, this.parseCompare(), Expr.E_EQUALS);
        return e;
    }

    private parseCompare(): Expr {
        const e = this.parseShift();
        if (this.skip("<=")) return new Expr(e, this.parseShift(), Expr.E_LEQ);
        if (this.skip(">=")) return new Expr(e, this.parseShift(), Expr.E_GEQ);
        if (this.skip("!=")) return new Expr(e, this.parseShift(), Expr.E_NEQ);
        if (this.skip("<"))  return new Expr(e, this.parseShift(), Expr.E_LESS);
        if (this.skip(">"))  return new Expr(e, this.parseShift(), Expr.E_GREATER);
        return e;
    }

    private parseShift(): Expr {
        let e = this.parseAdd();
        while (this.skip(">>"))
            e = new Expr(e, this.parseAdd(), Expr.E_RSHIFT);
        return e;
    }

    private parseAdd(): Expr {
        let e = this.parseMult();
        while (true) {
            if (this.skip("+"))
                e = new Expr(e, this.parseMult(), Expr.E_ADD);
            else if (this.skip("-"))
                e = new Expr(e, this.parseMult(), Expr.E_SUB);
            else
                break;
        }
        return e;
    }

    private parseMult(): Expr {
        let e = this.parseUminus();
        while (true) {
            if (this.skip("*"))
                e = new Expr(e, this.parseUminus(), Expr.E_MUL);
            else if (this.skip("/"))
                e = new Expr(e, this.parseUminus(), Expr.E_DIV);
            else
                break;
        }
        return e;
    }

    private parseUminus(): Expr {
        this.skip("+");
        if (this.skip("!"))
            return new Expr(this.parseUminus(), null, Expr.E_NOT);
        if (this.skip("-"))
            return new Expr(this.parseUminus(), null, Expr.E_UMINUS);
        return this.parsePow();
    }

    private parsePow(): Expr {
        let e = this.parseTerm();
        while (this.skip("^"))
            e = new Expr(e, this.parseTerm(), Expr.E_POW);
        return e;
    }

    private parseFunc(t: number): Expr {
        this.skipOrError("(");
        const e = this.parse();
        this.skipOrError(")");
        return new Expr(e, null, t);
    }

    private parseFuncMulti(t: number, minArgs: number, maxArgs: number): Expr {
        let args = 1;
        this.skipOrError("(");
        const e1 = this.parse();
        const e = new Expr(e1, null, t);
        while (this.skip(",")) {
            e.children!.push(this.parse());
            args++;
        }
        this.skipOrError(")");
        if (args < minArgs || args > maxArgs)
            this.setError("bad number of function args: " + args);
        return e;
    }

    // is the next non-space character of the raw text an open paren?  used to tell the
    // input letter "i" apart from the function "i(".
    private nextCharIsOpenParen(): boolean {
        let i = this.pos;
        while (i < this.tlen && this.origText.charAt(i) === ' ')
            i++;
        return i < this.tlen && this.origText.charAt(i) === '(';
    }

    // parse v(name), v(name1,name2) or i(name).  called just after the function letter was
    // skipped, so token is "(" and pos points at the first character after the "(".
    private parseNodeRefFunc(current: boolean, deriv: boolean = false): Expr {
        const fn = (deriv ? "d" : "") + (current ? "i" : "v") + (deriv ? "dt" : "");
        if (this.token !== "(") {
            this.setError("expected ( after " + fn + ", got " + this.token);
            return new Expr(Expr.E_VAL, 0);
        }
        let e = this.makeNodeRef(this.scanNodeName(), current, deriv);
        if (this.pos < this.tlen && this.origText.charAt(this.pos) === ',') {
            this.pos++;
            const e2 = this.makeNodeRef(this.scanNodeName(), current, deriv);
            if (current)
                this.setError(fn + "() takes one name");
            else
                e = new Expr(e, e2, Expr.E_SUB);
        }
        if (this.pos < this.tlen && this.origText.charAt(this.pos) === ')')
            this.pos++;
        else
            this.setError("expected ) in " + fn + "()");
        this.getToken();
        return e;
    }

    // scan a node name out of the raw text, stopping at ',' or ')'.  a double-quoted
    // name may contain those characters.
    private scanNodeName(): string {
        while (this.pos < this.tlen && this.origText.charAt(this.pos) === ' ')
            this.pos++;
        let s: string;
        if (this.pos < this.tlen && this.origText.charAt(this.pos) === '"') {
            this.pos++;
            const start = this.pos;
            while (this.pos < this.tlen && this.origText.charAt(this.pos) !== '"')
                this.pos++;
            s = this.origText.substring(start, this.pos);
            if (this.pos < this.tlen)
                this.pos++; // skip closing quote
            while (this.pos < this.tlen && this.origText.charAt(this.pos) === ' ')
                this.pos++;
        } else {
            const start = this.pos;
            while (this.pos < this.tlen) {
                const c = this.origText.charAt(this.pos);
                if (c === ',' || c === ')')
                    break;
                this.pos++;
            }
            s = this.origText.substring(start, this.pos).trim();
        }
        if (s.length === 0)
            this.setError("missing name in a v()/i() reference");
        return s;
    }

    // get an E_NODEV node for the given reference, allocating a slot for it if we haven't
    // seen it before (so repeated references to the same thing share one slot)
    // deriv picks E_NODEDVDT over E_NODEV; both read the same slot, which holds the raw
    // quantity, so v(x) and dvdt(x) share one reference and one pair of nodes
    private makeNodeRef(name: string, current: boolean, deriv: boolean): Expr {
        let ix = -1;
        for (let i = 0; i !== this.nodeRefs.length; i++)
            if (this.nodeRefs[i].name === name && this.nodeRefs[i].current === current)
                ix = i;
        if (ix < 0) {
            ix = this.nodeRefs.length;
            this.nodeRefs.push(new ExprNodeRef(name, current));
        }
        const e = new Expr(deriv ? Expr.E_NODEDVDT : Expr.E_NODEV, ix);
        e.name = name;
        return e;
    }

    private parseTerm(): Expr {
        if (this.skip("(")) {
            const e = this.parse();
            this.skipOrError(")");
            return e;
        }
        if (this.skip("t"))
            return new Expr(Expr.E_T);
        // i(name) has to be checked before the a..i input letters below, since "i" is also
        // the 9th input.  only "i" immediately followed by "(" is a reference; "i" followed
        // by anything else keeps its old meaning, and "i(" was a syntax error before.
        if (this.token === "i" && this.nextCharIsOpenParen()) {
            this.getToken();
            return this.parseNodeRefFunc(true, false);
        }
        if (this.token.length === 1) {
            const c = this.token.charCodeAt(0);
            if (c >= 97 && c <= 105) { // 'a'-'i'
                this.getToken();
                return new Expr(Expr.E_A + (c - 97));
            }
        }
        if (this.token.startsWith("last") && this.token.length === 5) {
            const c = this.token.charCodeAt(4);
            if (c >= 97 && c <= 105) { // 'a'-'i'
                this.getToken();
                return new Expr(Expr.E_LASTA + (c - 97));
            }
        }
        // dvdt(name)/didt(name): rate of change of a referenced quantity.  "didt" is also
        // the pin form (d/dt of input i), so only a following "(" makes it a reference;
        // "didt" alone keeps its old meaning and "dvdt" alone was never valid.
        if ((this.token === "dvdt" || this.token === "didt") && this.nextCharIsOpenParen()) {
            const current = this.token === "didt";
            this.getToken();
            return this.parseNodeRefFunc(current, true);
        }
        if (this.token.endsWith("dt") && this.token.startsWith("d") && this.token.length === 4) {
            const c = this.token.charCodeAt(1);
            if (c >= 97 && c <= 105) { // 'a'-'i'
                this.getToken();
                return new Expr(Expr.E_DADT + (c - 97));
            }
        }
        if (this.skip("lastoutput")) return new Expr(Expr.E_LASTOUTPUT);
        if (this.skip("timestep"))  return new Expr(Expr.E_TIMESTEP);
        if (this.skip("pi"))        return new Expr(Expr.E_VAL, 3.14159265358979323846);
        if (this.skip("v"))         return this.parseNodeRefFunc(false, false);
        if (this.skip("sin"))   return this.parseFunc(Expr.E_SIN);
        if (this.skip("cos"))   return this.parseFunc(Expr.E_COS);
        if (this.skip("asin"))  return this.parseFunc(Expr.E_ASIN);
        if (this.skip("acos"))  return this.parseFunc(Expr.E_ACOS);
        if (this.skip("atan"))  return this.parseFunc(Expr.E_ATAN);
        if (this.skip("sinh"))  return this.parseFunc(Expr.E_SINH);
        if (this.skip("cosh"))  return this.parseFunc(Expr.E_COSH);
        if (this.skip("tanh"))  return this.parseFunc(Expr.E_TANH);
        if (this.skip("abs"))   return this.parseFunc(Expr.E_ABS);
        if (this.skip("exp"))   return this.parseFunc(Expr.E_EXP);
        if (this.skip("log"))   return this.parseFunc(Expr.E_LOG);
        if (this.skip("sqrt"))  return this.parseFunc(Expr.E_SQRT);
        if (this.skip("tan"))   return this.parseFunc(Expr.E_TAN);
        if (this.skip("tri"))   return this.parseFunc(Expr.E_TRIANGLE);
        if (this.skip("saw"))   return this.parseFunc(Expr.E_SAWTOOTH);
        if (this.skip("floor")) return this.parseFunc(Expr.E_FLOOR);
        if (this.skip("ceil"))  return this.parseFunc(Expr.E_CEIL);
        if (this.skip("min"))   return this.parseFuncMulti(Expr.E_MIN, 2, 1000);
        if (this.skip("max"))   return this.parseFuncMulti(Expr.E_MAX, 2, 1000);
        if (this.skip("pwl"))   return this.parseFuncMulti(Expr.E_PWL, 2, 1000);
        if (this.skip("mod"))   return this.parseFuncMulti(Expr.E_MOD, 2, 2);
        if (this.skip("step"))  return this.parseFuncMulti(Expr.E_STEP, 1, 2);
        if (this.skip("select"))return this.parseFuncMulti(Expr.E_SELECT, 3, 3);
        if (this.skip("clamp")) return this.parseFuncMulti(Expr.E_CLAMP, 3, 3);
        if (this.skip("pwr"))   return this.parseFuncMulti(Expr.E_PWR, 2, 2);
        if (this.skip("pwrs"))  return this.parseFuncMulti(Expr.E_PWRS, 2, 2);
        try {
            const v = parseFloatStrict(this.token);
            if (isNaN(v)) throw new Error("NaN");
            this.getToken();
            return new Expr(Expr.E_VAL, v);
        } catch (_e) {
            if (this.token.length === 0)
                this.setError("unexpected end of input");
            else
                this.setError("unrecognized token: " + this.token);
            return new Expr(Expr.E_VAL, 0);
        }
    }

    gotError(): string | null { return this.err; }
}
