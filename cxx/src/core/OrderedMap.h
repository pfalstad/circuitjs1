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

#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

// string-keyed map that iterates in insertion order, like a JS Map
template <class V>
class OrderedMap {
public:
    V *get(const std::string &k) {
        auto it = index.find(k);
        return it == index.end() ? nullptr : &items[it->second].second;
    }
    void set(const std::string &k, V v) {
        auto it = index.find(k);
        if (it != index.end()) {
            items[it->second].second = std::move(v);
            return;
        }
        index[k] = items.size();
        items.emplace_back(k, std::move(v));
    }
    bool has(const std::string &k) const { return index.count(k) > 0; }
    size_t size() const { return items.size(); }
    auto begin() { return items.begin(); }
    auto end() { return items.end(); }

private:
    std::vector<std::pair<std::string, V>> items;
    std::unordered_map<std::string, size_t> index;
};
