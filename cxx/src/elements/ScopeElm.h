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

#include <memory>

#include "../core/CircuitElm.h"

class Scope;

// an undocked scope, placed in the circuit like an element
class ScopeElm : public CircuitElm {
public:
    ELM_CLASS(ScopeElm)
    std::unique_ptr<Scope> elmScope;  // null after dockScope() takes it

    ScopeElm(int xx, int yy);
    ScopeElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    ~ScopeElm() override;

    void setScopeElm(CircuitElm *e);
    void setScopeRect();
    void setPoints() override;
    void setElmScope(std::unique_ptr<Scope> s);
    void stepScope();
    void reset() override;
    // (TS: clearElmScope(); here the caller takes ownership of the scope)
    std::unique_ptr<Scope> takeElmScope();
    bool canViewInScope() override { return false; }
    int getDumpType() override { return 403; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void draw(Graphics &g) override;
    int getPostCount() override { return 0; }
    int getNumHandles() override { return 2; }
    bool isScopeElm() override { return true; }
    void selectScope(double mx, double my);
};
