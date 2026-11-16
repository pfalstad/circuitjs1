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

#include <QElapsedTimer>
#include <cmath>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "core/JsNumber.h"

// Frame timing for developer mode: a tree of named contexts and how long each took
// (UIManager.ts PerfMonitor/PerfEntry).
class PerfMonitor {
public:
    PerfMonitor() { timer.start(); }

    void startContext(const std::string &name) {
        auto newEntry = startNewEntry(ctx);
        if (ctx == nullptr) {
            if (rootCtx == nullptr) {
                rootCtxName = name;
                rootCtx = std::move(newEntry);
                ctx = rootCtx.get();
            }
        } else {
            PerfEntry *e = newEntry.get();
            if (ctx->addChild(name, std::move(newEntry)))
                ctx = e;
        }
    }

    void stopContext() {
        if (ctx != nullptr) {
            ctx->endTime = getTime();
            ctx->length = std::round((ctx->endTime - ctx->startTime) * 1000) / 1000;
            ctx = ctx->parent;
        }
    }

    std::string buildString() const {
        std::string sb;
        if (rootCtx != nullptr)
            buildStringInternal(sb, rootCtxName, *rootCtx, 0);
        return sb;
    }

private:
    struct PerfEntry {
        PerfEntry *parent;
        std::vector<std::pair<std::string, std::unique_ptr<PerfEntry>>> children;
        double startTime = 0, endTime = 0, length = 0;

        explicit PerfEntry(PerfEntry *p) : parent(p) {}

        bool addChild(const std::string &name, std::unique_ptr<PerfEntry> entry) {
            for (auto &c : children)
                if (c.first == name)
                    return false;
            children.emplace_back(name, std::move(entry));
            return true;
        }
    };

    std::unique_ptr<PerfEntry> startNewEntry(PerfEntry *parent) {
        auto newEntry = std::make_unique<PerfEntry>(parent);
        newEntry->startTime = getTime();
        return newEntry;
    }

    static void buildStringInternal(std::string &sb, const std::string &name, const PerfEntry &entry, int depth) {
        for (int x = 0; x < depth; x++)
            sb += "-";
        sb += name;
        sb += ": ";
        sb += jsNumberToString(entry.length);
        sb += "\n";
        for (auto &c : entry.children)
            buildStringInternal(sb, c.first, *c.second, depth + 1);
    }

    // milliseconds, to the microsecond (like performance.now())
    double getTime() const { return timer.nsecsElapsed() / 1000 / 1000.0; }

    QElapsedTimer timer;
    std::string rootCtxName;
    std::unique_ptr<PerfEntry> rootCtx;
    PerfEntry *ctx = nullptr;
};
