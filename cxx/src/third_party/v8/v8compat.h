// Minimal stand-ins for the parts of V8's base library that ieee754.cc uses.
// Copyright 2016 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <type_traits>

#define V8_BASE_EXPORT
#define V8_INLINE inline
#define V8_WARN_UNUSED_RESULT
#ifdef _MSC_VER
#define V8_CC_MSVC 1
#else
#define V8_CC_MSVC 0
#endif

namespace v8 {
namespace base {

template <class Dest, class Source>
inline Dest bit_cast(const Source &source) {
    static_assert(sizeof(Dest) == sizeof(Source), "bit_cast sizes must match");
    Dest dest;
    std::memcpy(&dest, &source, sizeof(dest));
    return dest;
}

template <typename signed_type>
inline signed_type SubWithWraparound(signed_type a, signed_type b) {
    using unsigned_type = typename std::make_unsigned<signed_type>::type;
    return static_cast<signed_type>(static_cast<unsigned_type>(a) - static_cast<unsigned_type>(b));
}

template <typename signed_type>
inline signed_type NegateWithWraparound(signed_type a) {
    if (a == std::numeric_limits<signed_type>::min()) return a;
    return -a;
}

template <typename T>
inline T Divide(T x, T y) {
    if (y != 0) return x / y;
    if (x == 0 || x != x) return std::numeric_limits<T>::quiet_NaN();
    if ((x >= 0) == (std::signbit(y) == 0)) return std::numeric_limits<T>::infinity();
    return -std::numeric_limits<T>::infinity();
}

}  // namespace base
}  // namespace v8
