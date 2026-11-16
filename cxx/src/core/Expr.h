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

// a quantity an expression refers to by name: v(name) for the voltage of a labeled node
// or across a voltmeter, i(name) for the current through an ammeter.  the parser records
// these; the element owning the expression resolves them when the circuit is analyzed.
struct ExprNodeRef {
    std::string name;
    bool current;  // true for i(name), false for v(name)
};

class ExprState {
public:
    std::vector<double> values;
    std::vector<double> lastValues;
    // values of the quantities referenced by v(name)/i(name), one slot per reference, in
    // the order ExprParser::getNodeRefs() returned them.  sized by the element after parsing.
    std::vector<double> nodeValues;
    // the same quantities one timestep ago, for dvdt()/didt()
    std::vector<double> lastNodeValues;
    double lastOutput = 0;
    double t = 0;

    ExprState();
    void updateLastValues(double lastOut);
    void reset();
};

class Expr {
public:
    std::vector<std::unique_ptr<Expr>> children;
    double value = 0;
    int type;
    // for E_NODEV, the referenced name (value holds its index into ExprState::nodeValues)
    std::string name;

    static constexpr int E_ADD = 1;
    static constexpr int E_SUB = 2;
    static constexpr int E_T = 3;
    // v(name)/i(name): a quantity referenced by name.  must be below E_A, since eval()'s
    // default branch resolves anything >= E_A by range subtraction.
    static constexpr int E_NODEV = 4;
    // dvdt(name)/didt(name): rate of change of the same quantity.  shares the reference
    // slot with E_NODEV, since the slot holds the raw quantity either way.
    static constexpr int E_NODEDVDT = 5;
    static constexpr int E_VAL = 6;
    static constexpr int E_MUL = 7;
    static constexpr int E_DIV = 8;
    static constexpr int E_POW = 9;
    static constexpr int E_UMINUS = 10;
    static constexpr int E_SIN = 11;
    static constexpr int E_COS = 12;
    static constexpr int E_ABS = 13;
    static constexpr int E_EXP = 14;
    static constexpr int E_LOG = 15;
    static constexpr int E_SQRT = 16;
    static constexpr int E_TAN = 17;
    static constexpr int E_R = 18;
    static constexpr int E_MAX = 19;
    static constexpr int E_MIN = 20;
    static constexpr int E_CLAMP = 21;
    static constexpr int E_PWL = 22;
    static constexpr int E_TRIANGLE = 23;
    static constexpr int E_SAWTOOTH = 24;
    static constexpr int E_MOD = 25;
    static constexpr int E_STEP = 26;
    static constexpr int E_SELECT = 27;
    static constexpr int E_PWR = 28;
    static constexpr int E_PWRS = 29;
    static constexpr int E_LASTOUTPUT = 30;
    static constexpr int E_TIMESTEP = 31;
    static constexpr int E_TERNARY = 32;
    static constexpr int E_OR = 33;
    static constexpr int E_AND = 34;
    static constexpr int E_EQUALS = 35;
    static constexpr int E_LEQ = 36;
    static constexpr int E_GEQ = 37;
    static constexpr int E_LESS = 38;
    static constexpr int E_GREATER = 39;
    static constexpr int E_NEQ = 40;
    static constexpr int E_NOT = 41;
    static constexpr int E_FLOOR = 42;
    static constexpr int E_CEIL = 43;
    static constexpr int E_ASIN = 44;
    static constexpr int E_ACOS = 45;
    static constexpr int E_ATAN = 46;
    static constexpr int E_SINH = 47;
    static constexpr int E_COSH = 48;
    static constexpr int E_TANH = 49;
    static constexpr int E_BITAND = 50;
    static constexpr int E_BITOR = 51;
    static constexpr int E_RSHIFT = 52;
    static constexpr int E_A = 53;
    static constexpr int E_DADT = 53 + 10;   // E_A + 10
    static constexpr int E_LASTA = 53 + 20;  // E_DADT + 10

    explicit Expr(int v) : type(v) {}
    Expr(int v, double vv) : value(vv), type(v) {}
    Expr(std::unique_ptr<Expr> e1, std::unique_ptr<Expr> e2, int v);

    double eval(ExprState &es) const;

private:
    double pwl(ExprState &es) const;
    static double posmod(double x, double y);
};

class ExprParser {
public:
    explicit ExprParser(const std::string &s);

    // quantities referenced by v()/i() in this expression, in slot order
    const std::vector<ExprNodeRef> &getNodeRefs() const { return nodeRefs; }
    std::unique_ptr<Expr> parseExpression();
    const std::optional<std::string> &gotError() const { return err; }

private:
    std::string text;
    // original text with case preserved.  node labels are case-sensitive, so v(name)
    // arguments are scanned out of this rather than out of the lowercased text.
    std::string origText;
    std::string token;
    size_t pos = 0;
    size_t tlen;
    std::optional<std::string> err;
    std::vector<ExprNodeRef> nodeRefs;

    void getToken();
    bool skip(const std::string &s);
    void setError(const std::string &s);
    void skipOrError(const std::string &s);
    std::unique_ptr<Expr> parse();
    std::unique_ptr<Expr> parseOr();
    std::unique_ptr<Expr> parseAnd();
    std::unique_ptr<Expr> parseBitOr();
    std::unique_ptr<Expr> parseBitAnd();
    std::unique_ptr<Expr> parseEquals();
    std::unique_ptr<Expr> parseCompare();
    std::unique_ptr<Expr> parseShift();
    std::unique_ptr<Expr> parseAdd();
    std::unique_ptr<Expr> parseMult();
    std::unique_ptr<Expr> parseUminus();
    std::unique_ptr<Expr> parsePow();
    std::unique_ptr<Expr> parseFunc(int t);
    std::unique_ptr<Expr> parseFuncMulti(int t, int minArgs, int maxArgs);
    bool nextCharIsOpenParen();
    std::unique_ptr<Expr> parseNodeRefFunc(bool current, bool deriv = false);
    std::string scanNodeName();
    std::unique_ptr<Expr> makeNodeRef(const std::string &name, bool current, bool deriv);
    std::unique_ptr<Expr> parseTerm();
};
