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

#include "Expr.h"

#include <cmath>
#include <iostream>
#include <limits>

#include "CircuitElm.h"
#include "JsMath.h"
#include "JsNumber.h"
#include "SimulationManager.h"

namespace {

// JS ToInt32, for the bitwise operators
int32_t toInt32(double d) {
    if (!std::isfinite(d))
        return 0;
    double t = std::trunc(d);
    double m = std::fmod(t, 4294967296.0);
    if (m < 0)
        m += 4294967296.0;
    return (int32_t) (uint32_t) m;
}

// Math.min/Math.max: NaN if either argument is, and -0 < +0
double jsMin(double a, double b) {
    if (std::isnan(a) || std::isnan(b))
        return std::numeric_limits<double>::quiet_NaN();
    if (a == 0 && b == 0)
        return std::signbit(a) ? a : b;
    return a < b ? a : b;
}

double jsMax(double a, double b) {
    if (std::isnan(a) || std::isnan(b))
        return std::numeric_limits<double>::quiet_NaN();
    if (a == 0 && b == 0)
        return std::signbit(a) ? b : a;
    return a > b ? a : b;
}

std::string lower(const std::string &s) {
    std::string out = s;
    for (char &c : out)
        if (c >= 'A' && c <= 'Z')
            c = (char) (c - 'A' + 'a');
    return out;
}

std::string trim(const std::string &s) {
    size_t a = s.find_first_not_of(" \t\n\r\f\v");
    if (a == std::string::npos)
        return "";
    size_t b = s.find_last_not_of(" \t\n\r\f\v");
    return s.substr(a, b - a + 1);
}

}  // namespace

ExprState::ExprState() : values(9, 0.0), lastValues(9, 0.0) {
    values[4] = 2.718281828459045;  // Math.E
}

void ExprState::updateLastValues(double lastOut) {
    lastOutput = lastOut;
    for (size_t i = 0; i != values.size(); i++)
        lastValues[i] = values[i];
    for (size_t i = 0; i != nodeValues.size(); i++)
        lastNodeValues[i] = nodeValues[i];
}

void ExprState::reset() {
    for (size_t i = 0; i != values.size(); i++)
        lastValues[i] = 0;
    for (size_t i = 0; i != lastNodeValues.size(); i++)
        lastNodeValues[i] = 0;
    lastOutput = 0;
}

Expr::Expr(std::unique_ptr<Expr> e1, std::unique_ptr<Expr> e2, int v) : type(v) {
    children.push_back(std::move(e1));
    if (e2)
        children.push_back(std::move(e2));
}

double Expr::eval(ExprState &es) const {
    const Expr *left = nullptr;
    const Expr *right = nullptr;
    if (!children.empty()) {
        left = children[0].get();
        if (children.size() >= 2)
            right = children.back().get();
    }
    double timeStep = CircuitElm::sim->timeStep;
    switch (type) {
    case E_ADD: return left->eval(es) + right->eval(es);
    case E_SUB: return left->eval(es) - right->eval(es);
    case E_MUL: return left->eval(es) * right->eval(es);
    case E_DIV: return left->eval(es) / right->eval(es);
    case E_POW: return jsmath::pow(left->eval(es), right->eval(es));
    case E_OR: return (left->eval(es) != 0 || right->eval(es) != 0) ? 1 : 0;
    case E_AND: return (left->eval(es) != 0 && right->eval(es) != 0) ? 1 : 0;
    case E_EQUALS: return (left->eval(es) == right->eval(es)) ? 1 : 0;
    case E_NEQ: return (left->eval(es) != right->eval(es)) ? 1 : 0;
    case E_LEQ: return (left->eval(es) <= right->eval(es)) ? 1 : 0;
    case E_GEQ: return (left->eval(es) >= right->eval(es)) ? 1 : 0;
    case E_LESS: return (left->eval(es) < right->eval(es)) ? 1 : 0;
    case E_GREATER: return (left->eval(es) > right->eval(es)) ? 1 : 0;
    case E_TERNARY: return children[left->eval(es) != 0 ? 1 : 2]->eval(es);
    case E_UMINUS: return -left->eval(es);
    case E_NOT: return left->eval(es) == 0 ? 1 : 0;
    case E_VAL: return value;
    case E_T: return es.t;
    case E_NODEV: return es.nodeValues[(size_t) value];
    case E_NODEDVDT:
        return (es.nodeValues[(size_t) value] - es.lastNodeValues[(size_t) value]) / timeStep;
    case E_SIN: return jsmath::sin(left->eval(es));
    case E_COS: return jsmath::cos(left->eval(es));
    case E_ABS: return std::abs(left->eval(es));
    case E_EXP: return jsmath::exp(left->eval(es));
    case E_LOG: return jsmath::log(left->eval(es));
    case E_SQRT: return std::sqrt(left->eval(es));
    case E_TAN: return jsmath::tan(left->eval(es));
    case E_ASIN: return jsmath::asin(left->eval(es));
    case E_ACOS: return jsmath::acos(left->eval(es));
    case E_ATAN: return jsmath::atan(left->eval(es));
    case E_SINH: return jsmath::sinh(left->eval(es));
    case E_COSH: return jsmath::cosh(left->eval(es));
    case E_TANH: return jsmath::tanh(left->eval(es));
    case E_BITAND: return toInt32(left->eval(es)) & toInt32(right->eval(es));
    case E_BITOR: return toInt32(left->eval(es)) | toInt32(right->eval(es));
    case E_RSHIFT: return toInt32(left->eval(es)) >> (toInt32(right->eval(es)) & 31);
    case E_FLOOR: return std::floor(left->eval(es));
    case E_CEIL: return std::ceil(left->eval(es));
    case E_MIN: {
        double x = left->eval(es);
        for (size_t i = 1; i < children.size(); i++)
            x = jsMin(x, children[i]->eval(es));
        return x;
    }
    case E_MAX: {
        double x = left->eval(es);
        for (size_t i = 1; i < children.size(); i++)
            x = jsMax(x, children[i]->eval(es));
        return x;
    }
    case E_CLAMP:
        return jsMin(jsMax(left->eval(es), children[1]->eval(es)), children[2]->eval(es));
    case E_STEP: {
        double x = left->eval(es);
        if (right == nullptr)
            return (x < 0) ? 0 : 1;
        return (x > right->eval(es)) ? 0 : (x < 0) ? 0 : 1;
    }
    case E_SELECT: {
        double x = left->eval(es);
        return children[x > 0 ? 2 : 1]->eval(es);
    }
    case E_TRIANGLE: {
        double x = posmod(left->eval(es), CircuitElm::pi * 2) / CircuitElm::pi;
        return (x < 1) ? -1 + x * 2 : 3 - x * 2;
    }
    case E_SAWTOOTH: {
        double x = posmod(left->eval(es), CircuitElm::pi * 2) / CircuitElm::pi;
        return x - 1;
    }
    case E_MOD:
        return std::fmod(left->eval(es), right->eval(es));
    case E_PWL:
        return pwl(es);
    case E_PWR:
        return jsmath::pow(std::abs(left->eval(es)), right->eval(es));
    case E_PWRS: {
        double x = left->eval(es);
        if (x < 0)
            return -jsmath::pow(-x, right->eval(es));
        return jsmath::pow(x, right->eval(es));
    }
    case E_LASTOUTPUT:
        return es.lastOutput;
    case E_TIMESTEP:
        return timeStep;
    default:
        if (type >= E_LASTA)
            return es.lastValues[type - E_LASTA];
        if (type >= E_DADT)
            return (es.values[type - E_DADT] - es.lastValues[type - E_DADT]) / timeStep;
        if (type >= E_A)
            return es.values[type - E_A];
        std::cerr << "unknown Expr type\n";
    }
    return 0;
}

double Expr::pwl(ExprState &es) const {
    const auto &args = children;
    double x = args[0]->eval(es);
    double x0 = args[1]->eval(es);
    double y0 = args[2]->eval(es);
    if (x < x0)
        return y0;
    double x1 = args[3]->eval(es);
    double y1 = args[4]->eval(es);
    size_t i = 5;
    while (true) {
        if (x < x1)
            return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
        if (i + 1 >= args.size())
            break;
        x0 = x1;
        y0 = y1;
        x1 = args[i]->eval(es);
        y1 = args[i + 1]->eval(es);
        i += 2;
    }
    return y1;
}

double Expr::posmod(double x, double y) {
    x = std::fmod(x, y);
    return (x >= 0) ? x : x + y;
}

ExprParser::ExprParser(const std::string &s) : text(lower(s)), origText(s), tlen(s.size()) {
    getToken();
}

void ExprParser::getToken() {
    while (pos < tlen && text[pos] == ' ')
        pos++;
    if (pos == tlen) {
        token = "";
        return;
    }
    size_t i = pos;
    char c = text[i];
    auto isDigit = [](char ch) { return ch >= '0' && ch <= '9'; };
    if (isDigit(c) || c == '.') {
        for (i = pos; i != tlen; i++) {
            if (text[i] == 'e' || text[i] == 'E') {
                i++;
                if (i < tlen && (text[i] == '+' || text[i] == '-'))
                    i++;
            }
            // (i can reach tlen here, where JS charAt() returns "")
            if (i >= tlen || !(isDigit(text[i]) || text[i] == '.'))
                break;
        }
    } else if (c >= 'a' && c <= 'z') {
        for (i = pos; i != tlen; i++) {
            char ch = text[i];
            if (!(ch >= 'a' && ch <= 'z'))
                break;
        }
    } else {
        i++;
        if (i < tlen) {
            char ch = text[i];
            char cc = text[i - 1];
            // ||, &&, <<, >>, ==
            if (ch == cc && (cc == '|' || cc == '&' || cc == '<' || cc == '>' || cc == '='))
                i++;
            // <=, >=, !=
            else if ((cc == '<' || cc == '>' || cc == '!') && ch == '=')
                i++;
        }
    }
    if (i > tlen)
        i = tlen;
    token = text.substr(pos, i - pos);
    pos = i;
}

bool ExprParser::skip(const std::string &s) {
    if (token != s)
        return false;
    getToken();
    return true;
}

void ExprParser::setError(const std::string &s) {
    if (!err)
        err = s;
}

void ExprParser::skipOrError(const std::string &s) {
    if (!skip(s))
        setError("expected " + s + ", got " + token);
}

std::unique_ptr<Expr> ExprParser::parseExpression() {
    if (token.empty())
        return std::make_unique<Expr>(Expr::E_VAL, 0.0);
    std::unique_ptr<Expr> e = parse();
    if (!token.empty())
        setError("unexpected token: " + token);
    return e;
}

std::unique_ptr<Expr> ExprParser::parse() {
    std::unique_ptr<Expr> e = parseOr();
    if (skip("?")) {
        std::unique_ptr<Expr> e2 = parseOr();
        skipOrError(":");
        std::unique_ptr<Expr> e3 = parse();
        auto ret = std::make_unique<Expr>(std::move(e), std::move(e2), Expr::E_TERNARY);
        ret->children.push_back(std::move(e3));
        return ret;
    }
    return e;
}

std::unique_ptr<Expr> ExprParser::parseOr() {
    std::unique_ptr<Expr> e = parseAnd();
    while (skip("||"))
        e = std::make_unique<Expr>(std::move(e), parseAnd(), Expr::E_OR);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseAnd() {
    std::unique_ptr<Expr> e = parseBitOr();
    while (skip("&&"))
        e = std::make_unique<Expr>(std::move(e), parseBitOr(), Expr::E_AND);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseBitOr() {
    std::unique_ptr<Expr> e = parseBitAnd();
    while (skip("|"))
        e = std::make_unique<Expr>(std::move(e), parseBitAnd(), Expr::E_BITOR);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseBitAnd() {
    std::unique_ptr<Expr> e = parseEquals();
    while (skip("&"))
        e = std::make_unique<Expr>(std::move(e), parseEquals(), Expr::E_BITAND);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseEquals() {
    std::unique_ptr<Expr> e = parseCompare();
    if (skip("=="))
        return std::make_unique<Expr>(std::move(e), parseCompare(), Expr::E_EQUALS);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseCompare() {
    std::unique_ptr<Expr> e = parseShift();
    if (skip("<=")) return std::make_unique<Expr>(std::move(e), parseShift(), Expr::E_LEQ);
    if (skip(">=")) return std::make_unique<Expr>(std::move(e), parseShift(), Expr::E_GEQ);
    if (skip("!=")) return std::make_unique<Expr>(std::move(e), parseShift(), Expr::E_NEQ);
    if (skip("<")) return std::make_unique<Expr>(std::move(e), parseShift(), Expr::E_LESS);
    if (skip(">")) return std::make_unique<Expr>(std::move(e), parseShift(), Expr::E_GREATER);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseShift() {
    std::unique_ptr<Expr> e = parseAdd();
    while (skip(">>"))
        e = std::make_unique<Expr>(std::move(e), parseAdd(), Expr::E_RSHIFT);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseAdd() {
    std::unique_ptr<Expr> e = parseMult();
    while (true) {
        if (skip("+"))
            e = std::make_unique<Expr>(std::move(e), parseMult(), Expr::E_ADD);
        else if (skip("-"))
            e = std::make_unique<Expr>(std::move(e), parseMult(), Expr::E_SUB);
        else
            break;
    }
    return e;
}

std::unique_ptr<Expr> ExprParser::parseMult() {
    std::unique_ptr<Expr> e = parseUminus();
    while (true) {
        if (skip("*"))
            e = std::make_unique<Expr>(std::move(e), parseUminus(), Expr::E_MUL);
        else if (skip("/"))
            e = std::make_unique<Expr>(std::move(e), parseUminus(), Expr::E_DIV);
        else
            break;
    }
    return e;
}

std::unique_ptr<Expr> ExprParser::parseUminus() {
    skip("+");
    if (skip("!"))
        return std::make_unique<Expr>(parseUminus(), nullptr, Expr::E_NOT);
    if (skip("-"))
        return std::make_unique<Expr>(parseUminus(), nullptr, Expr::E_UMINUS);
    return parsePow();
}

std::unique_ptr<Expr> ExprParser::parsePow() {
    std::unique_ptr<Expr> e = parseTerm();
    while (skip("^"))
        e = std::make_unique<Expr>(std::move(e), parseTerm(), Expr::E_POW);
    return e;
}

std::unique_ptr<Expr> ExprParser::parseFunc(int t) {
    skipOrError("(");
    std::unique_ptr<Expr> e = parse();
    skipOrError(")");
    return std::make_unique<Expr>(std::move(e), nullptr, t);
}

std::unique_ptr<Expr> ExprParser::parseFuncMulti(int t, int minArgs, int maxArgs) {
    int args = 1;
    skipOrError("(");
    std::unique_ptr<Expr> e1 = parse();
    auto e = std::make_unique<Expr>(std::move(e1), nullptr, t);
    while (skip(",")) {
        e->children.push_back(parse());
        args++;
    }
    skipOrError(")");
    if (args < minArgs || args > maxArgs)
        setError("bad number of function args: " + std::to_string(args));
    return e;
}

// is the next non-space character of the raw text an open paren?  used to tell the
// input letter "i" apart from the function "i(".
bool ExprParser::nextCharIsOpenParen() {
    size_t i = pos;
    while (i < tlen && origText[i] == ' ')
        i++;
    return i < tlen && origText[i] == '(';
}

// parse v(name), v(name1,name2) or i(name).  called just after the function letter was
// skipped, so token is "(" and pos points at the first character after the "(".
std::unique_ptr<Expr> ExprParser::parseNodeRefFunc(bool current, bool deriv) {
    std::string fn = std::string(deriv ? "d" : "") + (current ? "i" : "v") + (deriv ? "dt" : "");
    if (token != "(") {
        setError("expected ( after " + fn + ", got " + token);
        return std::make_unique<Expr>(Expr::E_VAL, 0.0);
    }
    std::unique_ptr<Expr> e = makeNodeRef(scanNodeName(), current, deriv);
    if (pos < tlen && origText[pos] == ',') {
        pos++;
        std::unique_ptr<Expr> e2 = makeNodeRef(scanNodeName(), current, deriv);
        if (current)
            setError(fn + "() takes one name");
        else
            e = std::make_unique<Expr>(std::move(e), std::move(e2), Expr::E_SUB);
    }
    if (pos < tlen && origText[pos] == ')')
        pos++;
    else
        setError("expected ) in " + fn + "()");
    getToken();
    return e;
}

// scan a node name out of the raw text, stopping at ',' or ')'.  a double-quoted
// name may contain those characters.
std::string ExprParser::scanNodeName() {
    while (pos < tlen && origText[pos] == ' ')
        pos++;
    std::string s;
    if (pos < tlen && origText[pos] == '"') {
        pos++;
        size_t start = pos;
        while (pos < tlen && origText[pos] != '"')
            pos++;
        s = origText.substr(start, pos - start);
        if (pos < tlen)
            pos++;  // skip closing quote
        while (pos < tlen && origText[pos] == ' ')
            pos++;
    } else {
        size_t start = pos;
        while (pos < tlen) {
            char c = origText[pos];
            if (c == ',' || c == ')')
                break;
            pos++;
        }
        s = trim(origText.substr(start, pos - start));
    }
    if (s.empty())
        setError("missing name in a v()/i() reference");
    return s;
}

// get an E_NODEV node for the given reference, allocating a slot for it if we have not
// seen it before (so repeated references to the same thing share one slot)
// deriv picks E_NODEDVDT over E_NODEV; both read the same slot, which holds the raw
// quantity, so v(x) and dvdt(x) share one reference and one pair of nodes
std::unique_ptr<Expr> ExprParser::makeNodeRef(const std::string &name, bool current, bool deriv) {
    int ix = -1;
    for (size_t i = 0; i != nodeRefs.size(); i++)
        if (nodeRefs[i].name == name && nodeRefs[i].current == current)
            ix = (int) i;
    if (ix < 0) {
        ix = (int) nodeRefs.size();
        nodeRefs.push_back(ExprNodeRef{name, current});
    }
    auto e = std::make_unique<Expr>(deriv ? Expr::E_NODEDVDT : Expr::E_NODEV, (double) ix);
    e->name = name;
    return e;
}

std::unique_ptr<Expr> ExprParser::parseTerm() {
    if (skip("(")) {
        std::unique_ptr<Expr> e = parse();
        skipOrError(")");
        return e;
    }
    if (skip("t"))
        return std::make_unique<Expr>(Expr::E_T);
    // i(name) has to be checked before the a..i input letters below, since "i" is also
    // the 9th input.  only "i" immediately followed by "(" is a reference; "i" followed
    // by anything else keeps its old meaning, and "i(" was a syntax error before.
    if (token == "i" && nextCharIsOpenParen()) {
        getToken();
        return parseNodeRefFunc(true, false);
    }
    if (token.size() == 1) {
        char c = token[0];
        if (c >= 'a' && c <= 'i') {
            getToken();
            return std::make_unique<Expr>(Expr::E_A + (c - 'a'));
        }
    }
    if (token.rfind("last", 0) == 0 && token.size() == 5) {
        char c = token[4];
        if (c >= 'a' && c <= 'i') {
            getToken();
            return std::make_unique<Expr>(Expr::E_LASTA + (c - 'a'));
        }
    }
    // dvdt(name)/didt(name): rate of change of a referenced quantity.  "didt" is also
    // the pin form (d/dt of input i), so only a following "(" makes it a reference;
    // "didt" alone keeps its old meaning and "dvdt" alone was never valid.
    if ((token == "dvdt" || token == "didt") && nextCharIsOpenParen()) {
        bool current = token == "didt";
        getToken();
        return parseNodeRefFunc(current, true);
    }
    if (token.size() == 4 && token[0] == 'd' && token.compare(2, 2, "dt") == 0) {
        char c = token[1];
        if (c >= 'a' && c <= 'i') {
            getToken();
            return std::make_unique<Expr>(Expr::E_DADT + (c - 'a'));
        }
    }
    if (skip("lastoutput")) return std::make_unique<Expr>(Expr::E_LASTOUTPUT);
    if (skip("timestep")) return std::make_unique<Expr>(Expr::E_TIMESTEP);
    if (skip("pi")) return std::make_unique<Expr>(Expr::E_VAL, 3.14159265358979323846);
    if (skip("v")) return parseNodeRefFunc(false, false);
    if (skip("sin")) return parseFunc(Expr::E_SIN);
    if (skip("cos")) return parseFunc(Expr::E_COS);
    if (skip("asin")) return parseFunc(Expr::E_ASIN);
    if (skip("acos")) return parseFunc(Expr::E_ACOS);
    if (skip("atan")) return parseFunc(Expr::E_ATAN);
    if (skip("sinh")) return parseFunc(Expr::E_SINH);
    if (skip("cosh")) return parseFunc(Expr::E_COSH);
    if (skip("tanh")) return parseFunc(Expr::E_TANH);
    if (skip("abs")) return parseFunc(Expr::E_ABS);
    if (skip("exp")) return parseFunc(Expr::E_EXP);
    if (skip("log")) return parseFunc(Expr::E_LOG);
    if (skip("sqrt")) return parseFunc(Expr::E_SQRT);
    if (skip("tan")) return parseFunc(Expr::E_TAN);
    if (skip("tri")) return parseFunc(Expr::E_TRIANGLE);
    if (skip("saw")) return parseFunc(Expr::E_SAWTOOTH);
    if (skip("floor")) return parseFunc(Expr::E_FLOOR);
    if (skip("ceil")) return parseFunc(Expr::E_CEIL);
    if (skip("min")) return parseFuncMulti(Expr::E_MIN, 2, 1000);
    if (skip("max")) return parseFuncMulti(Expr::E_MAX, 2, 1000);
    if (skip("pwl")) return parseFuncMulti(Expr::E_PWL, 2, 1000);
    if (skip("mod")) return parseFuncMulti(Expr::E_MOD, 2, 2);
    if (skip("step")) return parseFuncMulti(Expr::E_STEP, 1, 2);
    if (skip("select")) return parseFuncMulti(Expr::E_SELECT, 3, 3);
    if (skip("clamp")) return parseFuncMulti(Expr::E_CLAMP, 3, 3);
    if (skip("pwr")) return parseFuncMulti(Expr::E_PWR, 2, 2);
    if (skip("pwrs")) return parseFuncMulti(Expr::E_PWRS, 2, 2);
    double v = jsParseFloat(token);
    if (!std::isnan(v)) {
        getToken();
        return std::make_unique<Expr>(Expr::E_VAL, v);
    }
    if (token.empty())
        setError("unexpected end of input");
    else
        setError("unrecognized token: " + token);
    return std::make_unique<Expr>(Expr::E_VAL, 0.0);
}
