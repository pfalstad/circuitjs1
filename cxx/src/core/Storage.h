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

#include <optional>
#include <string>
#include <vector>

// persistent key/value storage (window.localStorage in the TS version).  The app installs
// one; the headless tools have none, so nothing is saved across sessions there.
class Storage {
public:
    virtual ~Storage() = default;
    virtual std::optional<std::string> getItem(const std::string &key) = 0;
    virtual void setItem(const std::string &key, const std::string &value) = 0;
    virtual void removeItem(const std::string &key) = 0;
    virtual std::vector<std::string> keys() = 0;

    static inline Storage *localStorage = nullptr;
};
