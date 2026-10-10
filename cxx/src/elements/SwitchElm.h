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

#include "../core/CircuitElm.h"

// SPST switch
class SwitchElm : public CircuitElm {
public:
    void addRoutingObstacle(WireRouter &wr) override;
    ELM_CLASS(SwitchElm)
    bool momentary;
    // position 0 == closed, position 1 == open
    int position;
    int posCount;
    double resistance = 0;
    static constexpr double COMPOSITE_CLOSED_R = 0.001;
    static constexpr int FLAG_IEC = 2;
    static constexpr int FLAG_LABEL = 4;
    std::optional<std::string> label;
    std::optional<std::string> keyShortcut;
    static constexpr int openhs = 16;
    Point ps, ps2;
    std::vector<Point> extraPoints;

    SwitchElm(int xx, int yy, bool mm = false);
    SwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : SwitchElm(xa, ya, xb, yb, f, st, false) {}

    int getDumpType() override { return 's'; }
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void setPoints() override;
    bool isSwitchElm() override { return true; }
    void calculateCurrent() override;
    virtual void mouseUp();
    void simpleToggle();
    virtual void toggle();
    bool getConnection(int n1, int n2) override { return position == 0; }
    bool isWireEquivalent() override { return position == 0 && parent == nullptr && resistance == 0; }
    bool isRemovableWire() override { return position == 0 && parent == nullptr && resistance == 0; }
    void stamp() override;
    bool useIECSymbol() const { return (flags & FLAG_IEC) != 0; }
    int getShortcut() override { return 's'; }

protected:
    // a base constructor can't call the subclass's isLogicInputElm(), so LogicInputElm
    // passes it in (it reads "true"/"false" positions the other way around)
    SwitchElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st, bool isLogicInput);

public:
    void draw(Graphics &g) override;
    virtual Rectangle getSwitchRect();
    std::string getElmType() override { return "switch (SPST)"; }
    void getInfo(std::vector<std::string> &arr) override;
    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    // helper methods for keyboard shortcut edit field, usable by subclasses
    EditInfo getKeyShortcutEditInfo();
    void setKeyShortcutEditValue(EditInfo &ei);
};
