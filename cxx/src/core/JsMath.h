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

#pragma once

#include <cmath>

#include "../third_party/v8/ieee754.h"

// JavaScript's Math functions, using V8's own implementation (fdlibm) so results match
// the TS version bit for bit.  Use these instead of std:: for every transcendental
// function in the simulator.  (sqrt, floor, trunc, fmod and abs are exactly specified
// by IEEE 754, so std:: is fine for those.)
namespace jsmath {
namespace I = v8::base::ieee754;
inline double exp(double x) { return I::exp(x); }
inline double expm1(double x) { return I::expm1(x); }
inline double log(double x) { return I::log(x); }
inline double log1p(double x) { return I::log1p(x); }
inline double log2(double x) { return I::log2(x); }
inline double log10(double x) { return I::log10(x); }
inline double pow(double x, double y) { return I::pow(x, y); }
inline double cbrt(double x) { return I::cbrt(x); }
inline double sin(double x) { return I::sin(x); }
inline double cos(double x) { return I::cos(x); }
inline double tan(double x) { return I::tan(x); }
inline double asin(double x) { return I::asin(x); }
inline double acos(double x) { return I::acos(x); }
inline double atan(double x) { return I::atan(x); }
inline double atan2(double y, double x) { return I::atan2(y, x); }
inline double sinh(double x) { return I::sinh(x); }
inline double cosh(double x) { return I::cosh(x); }
inline double tanh(double x) { return I::tanh(x); }
inline double asinh(double x) { return I::asinh(x); }
inline double acosh(double x) { return I::acosh(x); }
inline double atanh(double x) { return I::atanh(x); }
// Math.round(): ties go toward +infinity
inline double round(double x) { return std::floor(x + 0.5); }
}  // namespace jsmath
