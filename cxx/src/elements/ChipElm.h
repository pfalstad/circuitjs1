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
#include <vector>

#include "../core/CircuitElm.h"

class ChipElm;

// the two constructors every chip class has; the real work is in postConstruct()
#define CHIP_CONSTRUCTORS(Name, Base) \
    Name(int xx, int yy) : Base(xx, yy) {} \
    Name(int xa, int ya, int xb, int yb, int f, StringTokenizer &st) : Base(xa, ya, xb, yb, f, st) {}

class Pin {
public:
    ChipElm *chip;
    int pos;
    int side;
    int side0;
    std::string text;
    Point post;
    Point stub;
    Point textloc;
    int bubbleX = 0;
    int bubbleY = 0;
    VoltageSource *voltSource = nullptr;
    bool lineOver = false;
    bool bubble = false;
    bool clock = false;
    bool output = false;
    bool value = false;
    bool state = false;
    bool selected = false;
    double curcount = 0;
    double current = 0;
    int busWidth = 1;
    int busZ = 0;
    std::vector<int> clockPointsX;  // empty if none
    std::vector<int> clockPointsY;

    Pin() : chip(nullptr), pos(0), side(0), side0(0) {}
    Pin(ChipElm *chip, int p, int s, const std::string &t) : chip(chip), pos(p), side(s), side0(s), text(t) {}

    void setPoint(int px, int py, int dx, int dy, int dax, int day, int sx, int sy);
    // convert position + side to a grid index so we can detect overlaps
    int toGrid(int p, int s);
    bool overlaps(int p, int s);
    void fixName();
};

class ChipElm : public CircuitElm {
public:
    int csize = 0;
    int cspc = 0;
    int cspc2 = 0;
    int bits = 0;
    double highVoltage = 5;
    int bitOrder = 0;
    std::vector<Pin> pins;
    std::vector<int> rectPointsX;
    std::vector<int> rectPointsY;
    int sizeX = 0;
    int sizeY = 0;
    int flippedSizeX = 0;
    int flippedSizeY = 0;
    bool lastClock = false;
    bool justLoaded = false;
    int labelX = 0;
    int labelY = 0;

    static constexpr int FLAG_SMALL = 1;
    static constexpr int FLAG_FLIP_X = 1 << 10;
    static constexpr int FLAG_FLIP_Y = 1 << 11;
    static constexpr int FLAG_FLIP_XY = 1 << 12;
    static constexpr int FLAG_CUSTOM_VOLTAGE = 1 << 13;
    static constexpr int BIT_ORDER_MSB_FIRST = 0;
    static constexpr int BIT_ORDER_LSB_FIRST = 1;
    static constexpr int BIT_ORDER_BUS = 2;

    static constexpr int SIDE_N = 0;
    static constexpr int SIDE_S = 1;
    static constexpr int SIDE_W = 2;
    static constexpr int SIDE_E = 3;

    static const int sideFlipXY[4];

    // The TS constructors call setupPins() and other overrides, so that part is in
    // postConstruct(), which ElementFactory calls once the object is complete.  Subclasses
    // that read more tokens override postConstruct() and call ChipElm::postConstruct() first,
    // just as the TS constructors call super() first.
    ChipElm(int xx, int yy);
    ChipElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st);
    void postConstruct(StringTokenizer *st) override;

    virtual bool needsBits() { return false; }
    bool hasCustomVoltage() { return (flags & FLAG_CUSTOM_VOLTAGE) != 0; }
    bool useBus() { return bitOrder == BIT_ORDER_BUS; }
    virtual bool isDigitalChip() { return true; }
    virtual double getThreshold() { return highVoltage / 2; }
    virtual int defaultBitCount() { return 4; }

    void setSize(int s);
    virtual void setupPins() = 0;

    void draw(Graphics &g) override { drawChip(g); }
    void drawChip(Graphics &g);
    virtual void drawLabel(Graphics &g, int x, int y) {}
    void drag(int xx, int yy) override;
    void setPoints() override;
    void initBoundingBox() override;
    // TODO: addRoutingObstacle (WireRouter), getPinPos/getOverlappingPin (subcircuit editor)

    int getOverlappingPin(int p1, int p2, int pin);
    Point getPost(int n) override { return pins[n].post; }
    int getPostWidth(int n) override { return pins[n].busWidth; }
    void setVoltageSource(int j, VoltageSource *vs) override;
    void setHighVoltage(double hv) override { highVoltage = hv; }
    void stamp() override;
    virtual void execute() {}
    void startIteration() override;
    void doStep() override;
    void reset() override;
    std::string dump() override;
    void dumpXml(XmlElement *doc, XmlElement *elem) override;
    void dumpXmlState(XmlElement *doc, XmlElement *elem) override;
    void undumpXml(CircuitXMLDeserializer &xml) override;
    void writeOutput(int n, bool value);
    void getInfo(std::vector<std::string> &arr) override;
    void setCurrent(VoltageSource *vs, double c) override;
    bool validate() override;
    virtual std::string getChipName() { return "chip"; }
    bool getConnection(int, int) override { return false; }
    bool hasGroundConnection(int n1) override { return pins[n1].output; }
    double getCurrentIntoNode(int n) override;

    bool isFlippedX() { return hasFlag(FLAG_FLIP_X); }
    bool isFlippedY() { return hasFlag(FLAG_FLIP_Y); }
    bool isFlippedXY() { return hasFlag(FLAG_FLIP_XY); }
    virtual bool allowBus() { return false; }
    int flippedXSide(int s);
    void flipX(int center2, int count) override;
    void flipY(int center2, int count) override;
    void flipXY(int xmy, int count) override;
    int getNumHandles() override { return 0; }

    std::optional<EditInfo> getEditInfo(int n) override;
    void setEditValue(int n, EditInfo &ei) override;
    virtual std::optional<EditInfo> getChipEditInfo(int) { return std::nullopt; }
    virtual void setChipEditValue(int, EditInfo &) {}

    void makeBitPins(int count, int pos, int side, int offset, const std::string &name, bool output, bool state,
                     bool reversed);

    static std::string writeBits(const std::vector<bool> &data);
    static void readBits(StringTokenizer &st, std::vector<bool> &output);
    static std::string writeBitsToString(const std::vector<bool> &data);
    static void readBitsFromString(const std::string &s, std::vector<bool> &output);
};
