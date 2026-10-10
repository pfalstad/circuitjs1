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

#include "ChipElm.h"

#include <algorithm>
#include <cmath>

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/Graphics.h"
#include "../core/JsMath.h"
#include "../core/JsNumber.h"
#include "../core/SimApp.h"
#include "../core/SimulationManager.h"
#include "../core/StringTokenizer.h"
#include "../core/WireRouter.h"

void Pin::setPoint(int px, int py, int dx, int dy, int dax, int day, int sx, int sy) {
    if (chip->isFlippedX()) {
        dx = -dx;
        dax = -dax;
        px += chip->cspc2 * (chip->flippedSizeX - 1);
        sx = -sx;
    }
    if (chip->isFlippedY()) {
        dy = -dy;
        day = -day;
        py += chip->cspc2 * (chip->flippedSizeY - 1);
        sy = -sy;
    }
    int xa = px + chip->cspc2 * dx * pos + sx;
    int ya = py + chip->cspc2 * dy * pos + sy;
    post = Point(xa + dax * chip->cspc2, ya + day * chip->cspc2);
    int busExtra = (busWidth > 1) ? 2 : 0;
    stub = Point(xa + dax * (chip->cspc + busExtra), ya + day * (chip->cspc + busExtra));
    textloc = Point(xa, ya);
    post.z = busZ;
    if (bubble) {
        bubbleX = xa + dax * 10 * chip->csize;
        bubbleY = ya + day * 10 * chip->csize;
    }
    if (clock) {
        clockPointsX.assign(3, 0);
        clockPointsY.assign(3, 0);
        clockPointsX[0] = xa + dax * chip->cspc - dx * chip->cspc / 2;
        clockPointsY[0] = ya + day * chip->cspc - dy * chip->cspc / 2;
        clockPointsX[1] = xa;
        clockPointsY[1] = ya;
        clockPointsX[2] = xa + dax * chip->cspc + dx * chip->cspc / 2;
        clockPointsY[2] = ya + day * chip->cspc + dy * chip->cspc / 2;
        if (!text.empty()) {
            clockPointsX[1] += dax * chip->cspc / 2;
            clockPointsY[1] += day * chip->cspc / 2;
            textloc.x -= dax * chip->cspc / 2;
            textloc.y -= day * chip->cspc / 4;
        }
    } else {
        clockPointsX.clear();
        clockPointsY.clear();
    }
}

int Pin::toGrid(int p, int s) {
    if (s == ChipElm::SIDE_N) return p;
    if (s == ChipElm::SIDE_S) return p + chip->sizeX * (chip->sizeY - 1);
    if (s == ChipElm::SIDE_W) return p * chip->sizeX;
    if (s == ChipElm::SIDE_E) return p * chip->sizeX + chip->sizeX - 1;
    return -1;
}

bool Pin::overlaps(int p, int s) {
    int g = toGrid(p, s);
    if (g == -1) return true;
    return toGrid(pos, side) == g;
}

// replace the first occurrence, like JS String.replace() with a string pattern
static std::string replaceFirst(const std::string &s, const std::string &from) {
    size_t i = s.find(from);
    if (i == std::string::npos)
        return s;
    return s.substr(0, i) + s.substr(i + from.size());
}

void Pin::fixName() {
    if (text.rfind("/", 0) == 0) {
        text = text.substr(1);
        lineOver = true;
    } else if (text.rfind("#", 0) == 0) {
        text = text.substr(1);
        bubble = true;
    }

    std::string result = replaceFirst(text, "CLK:");
    if (result.size() != text.size()) {
        clock = true;
        text = result;
    }
    result = replaceFirst(text, "INV:");
    if (result.size() != text.size()) {
        bubble = true;
        text = result;
    }

    std::string lower = text;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    if (lower == "clk") {
        text = "";
        clock = true;
    }
}

const int ChipElm::sideFlipXY[4] = {SIDE_W, SIDE_E, SIDE_N, SIDE_S};

ChipElm::ChipElm(int xx, int yy) : CircuitElm(xx, yy) {
    highVoltage = 5;
    noDiagonal = true;
}

ChipElm::ChipElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &)
    : CircuitElm(xa, ya, xb, yb, f) {
    highVoltage = 5;
    noDiagonal = true;
}

void ChipElm::postConstruct(StringTokenizer *st) {
    if (st == nullptr) {
        if (needsBits())
            bits = defaultBitCount();
        highVoltage = 5;
        setupPins();
        allocNodes();
        setSize(useSmallGrid() ? 1 : 2);
        return;
    }
    if (needsBits())
        bits = st->hasMoreTokens() ? parseIntStrict(st->nextToken()) : defaultBitCount();
    highVoltage = hasCustomVoltage() ? parseFloatStrict(st->nextToken()) : 5;
    setupPins();
    allocNodes();
    setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
    for (int i = 0; i != getPostCount(); i++) {
        if (pins[i].state) {
            double v = parseFloatStrict(st->nextToken());
            pins[i].value = v > getThreshold();
        }
    }
    justLoaded = true;
}

void ChipElm::setSize(int s) {
    csize = s;
    cspc = 8 * s;
    cspc2 = cspc * 2;
    flags &= ~FLAG_SMALL;
    flags |= (s == 1) ? FLAG_SMALL : 0;
}

void ChipElm::drawChip(Graphics &g) {
    g.save();
    Font f("normal", 0, 10 * csize);
    bool hasVertical = false;
    for (int i = 0; i != getPostCount(); i++)
        if (pins[i].side == SIDE_N || pins[i].side == SIDE_S) {
            hasVertical = true;
            break;
        }
    for (int i = 0; i != getPostCount(); i++) {
        g.setFont(f);
        Pin &p = pins[i];
        if (p.busZ > 0)
            continue;
        setVoltageColor(g, nodes[i]->v);
        const Point &a = p.post;
        const Point &b = p.stub;
        drawThickLine(g, a, b, p.busWidth > 1 ? 5 : 3);
        p.curcount = updateDotCount(p.current, p.curcount);
        drawDots(g, b, a, p.curcount);
        if (p.bubble) {
            g.setColor(app->getBackgroundColor());
            drawThickCircle(g, p.bubbleX, p.bubbleY, 1);
            g.setColor(lightGrayColor);
            drawThickCircle(g, p.bubbleX, p.bubbleY, 3);
        }
        if (!p.clockPointsX.empty()) {
            g.setColor(lightGrayColor);
            g.drawPolyline(p.clockPointsX, p.clockPointsY, 3);
        }
        g.setColor(p.selected ? selectColor : whiteColor);
        int fsz = 10 * csize;
        double availSpace = cspc * 2 - 8;
        if (!hasVertical && sizeX > 2)
            availSpace = cspc * 2.5 + cspc * (sizeX - 3);
        std::string text = p.busWidth > 1 ? p.text + "/" + std::to_string(p.busWidth) : p.text;
        while (true) {
            double sw = g.measureWidth(text);
            if (sw > availSpace) {
                fsz -= 1;
                g.setFont(Font("normal", 0, fsz));
                continue;
            }
            double asc = g.currentFontSize;
            double tx;
            if (p.side == flippedXSide(SIDE_W))
                tx = p.textloc.x - (cspc - 5);
            else if (p.side == flippedXSide(SIDE_E))
                tx = p.textloc.x + (cspc - 5) - sw;
            else
                tx = p.textloc.x - sw / 2;
            g.drawString(text, tx, p.textloc.y + asc / 3);
            if (p.lineOver) {
                double ya = p.textloc.y - asc + asc / 3;
                g.drawLine(tx, ya, tx + sw, ya);
            }
            break;
        }
    }
    drawLabel(g, labelX, labelY);
    g.setColor(needsHighlight() ? selectColor : lightGrayColor);
    drawThickPolygon(g, rectPointsX, rectPointsY, 4);
    drawPosts(g);
    g.restore();
}

void ChipElm::drag(int xx, int yy) {
    yy = snapGrid(yy);
    if (xx < x) {
        xx = x;
        yy = y;
    } else {
        y = y2 = yy;
        x2 = std::min(snapGrid(xx), x + (sizeX + 1) * cspc2);
    }
    setPoints();
}

void ChipElm::setPoints() {
    if (x2 - x > sizeX * cspc2 && isCreating())
        setSize(2);
    int x0 = x + cspc2;
    int y0 = y;
    int xr = x0 - cspc;
    int yr = y0 - cspc;
    flippedSizeX = sizeX;
    flippedSizeY = sizeY;
    if (isFlippedXY()) {
        flippedSizeX = sizeY;
        flippedSizeY = sizeX;
    }
    int xs = flippedSizeX * cspc2;
    int ys = flippedSizeY * cspc2;
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        p.side = p.side0;
        if ((flags & FLAG_FLIP_XY) != 0)
            p.side = sideFlipXY[p.side];
        switch (p.side) {
        case SIDE_N: p.setPoint(x0, y0, 1, 0, 0, -1, 0, 0); break;
        case SIDE_S: p.setPoint(x0, y0, 1, 0, 0, 1, 0, ys - cspc2); break;
        case SIDE_W: p.setPoint(x0, y0, 0, 1, -1, 0, 0, 0); break;
        case SIDE_E: p.setPoint(x0, y0, 0, 1, 1, 0, xs - cspc2, 0); break;
        }
    }
    rectPointsX = {xr, xr + xs, xr + xs, xr};
    rectPointsY = {yr, yr, yr + ys, yr + ys};
    setBbox(xr, yr, rectPointsX[2], rectPointsY[2]);
    labelX = xr + xs / 2;
    labelY = yr + ys / 2;
}

void ChipElm::initBoundingBox() {
    CircuitElm::initBoundingBox();
    if (pins.empty() || cspc == 0)
        return;
    int xr = x + cspc2 - cspc;
    int yr = y - cspc;
    int fsx = isFlippedXY() ? sizeY : sizeX;
    int fsy = isFlippedXY() ? sizeX : sizeY;
    int xs = fsx * cspc2;
    int ys = fsy * cspc2;
    setBbox(xr, yr, xr + xs, yr + ys);
}

int ChipElm::getOverlappingPin(int p1, int p2, int pin) {
    for (int i = 0; i != getPostCount(); i++) {
        if (pin == i || pins[i].busZ > 0)
            continue;
        if (pins[i].overlaps(p1, p2))
            return i;
    }
    return -1;
}

void ChipElm::setVoltageSource(int j, VoltageSource *vs) {
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        if (p.output && j-- == 0) {
            p.voltSource = vs;
            vs->setNodes(CircuitNode::ground, nodes[i]);
            return;
        }
    }
    SimulationManager::console("setVoltageSource failed for " + getClassName());
}

void ChipElm::stamp() {
    int vsc = 0;
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        if (p.output) {
            sim->stampVoltageSource(CircuitNode::ground, nodes[i], p.voltSource);
            vsc++;
        }
    }
    if (vsc != getVoltageSourceCount())
        SimulationManager::console("voltage source count does not match number of outputs");
}

void ChipElm::startIteration() {
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        if (!p.output)
            p.value = nodes[i]->v > getThreshold();
    }

    // Skip the first execute() after a load to preserve pin state we just
    // loaded.  analyzeCircuit() rebuilds fresh CircuitNode objects, setting
    // voltages to zero.  So an unguarded execute() here would read
    // stale/wrong input levels and can clobber restored sequential state (e.g.
    // CounterElm reading an inverted reset pin as asserted and zeroing its
    // count). The java version has no such guard and always calls execute()
    // immediately, so chip state doesn't get preserved.
    if (justLoaded)
        justLoaded = false;
    else
        execute();
}

void ChipElm::doStep() {
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        if (p.output)
            sim->updateVoltageSource(CircuitNode::ground, nodes[i], p.voltSource, p.value ? highVoltage : 0);
    }
}

void ChipElm::reset() {
    for (int i = 0; i != getPostCount(); i++) {
        pins[i].value = false;
        pins[i].curcount = 0;
    }
    lastClock = false;
}

std::string ChipElm::dump() {
    if (highVoltage == 5)
        flags &= ~FLAG_CUSTOM_VOLTAGE;
    else
        flags |= FLAG_CUSTOM_VOLTAGE;
    std::string s = CircuitElm::dump();
    if (needsBits())
        s += " " + std::to_string(bits);
    if (hasCustomVoltage())
        s += " " + jsNumberToString(highVoltage);
    for (int i = 0; i != getPostCount(); i++)
        if (pins[i].state)
            s += " " + jsNumberToString(nodes[i]->v);
    return s;
}

void ChipElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    CircuitElm::dumpXml(doc, elem);
    if (bits > 0)
        CircuitXMLSerializer::dumpAttr(elem, "bi", bits);
    if (highVoltage != 5)
        CircuitXMLSerializer::dumpAttr(elem, "hv", highVoltage);
    if (bitOrder != 0)
        CircuitXMLSerializer::dumpAttr(elem, "bo", bitOrder);
}

void ChipElm::dumpXmlState(XmlElement *, XmlElement *elem) {
    for (int i = 0; i != getPostCount(); i++)
        if (pins[i].state && nodes[i]->v > 0)
            CircuitXMLSerializer::dumpAttr(elem, "v" + std::to_string(i), nodes[i]->v);
}

void ChipElm::undumpXml(CircuitXMLDeserializer &xml) {
    // "ix" is present on state-restore calls (from CompositeElm.dumpXmlState/undumpXml).
    // In that case this element already exists with correct flags/pins (set up when the
    // containing model was loaded), and the state element has no "f" attribute, so
    // zeroing flags here would wipe FLAG_FLIP_X/Y/XY and any subclass flags (e.g.
    // DFlipFlopElm's reset/set) instead of restoring them.
    bool stateRestore = xml.parseStringAttr("ix", std::nullopt).has_value();
    if (!stateRestore)
        flags = 0;  // might get set by setSize() in constructor
    CircuitElm::undumpXml(xml);
    bits = xml.parseIntAttr("bi", bits);
    highVoltage = xml.parseDoubleAttr("hv", highVoltage);
    bitOrder = xml.parseIntAttr("bo", bitOrder);
    if (!stateRestore) {
        setupPins();
        allocNodes();
        setSize((flags & FLAG_SMALL) != 0 ? 1 : 2);
    }
    for (int i = 0; i != getPostCount(); i++) {
        double v = xml.parseDoubleAttr("v" + std::to_string(i), 0);
        if (!pins.empty())
            pins[i].value = v > getThreshold();
    }
    justLoaded = true;
}

void ChipElm::writeOutput(int n, bool value) {
    if (!pins[n].output)
        SimulationManager::console("pin " + std::to_string(n) + " is not an output!");
    pins[n].value = value;
}

void ChipElm::getInfo(std::vector<std::string> &arr) {
    arr.assign(1, getChipName());
    size_t a = 1;
    int shown = 0;
    for (int i = 0; i != getPostCount(); i++) {
        Pin &p = pins[i];
        if (arr.size() > a)
            arr[a] += "; ";
        else
            arr.resize(a + 1);
        std::string t = p.text;
        if (p.lineOver) t += "'";
        if (p.clock) t = "Clk";
        if (p.busWidth > 1) {
            int value = 0;
            for (int j = 0; j < p.busWidth; j++)
                if (nodes[i + j]->v > getThreshold())
                    value |= 1 << pins[i + j].busZ;
            char hex[16];
            std::snprintf(hex, sizeof hex, "%X", value);
            arr[a] += t + " = " + std::to_string(value) + " / 0x" + hex;
            i += p.busWidth - 1;
        } else
            arr[a] += t + " = " + getVoltageText(nodes[i]->v);
        if (++shown % 2 == 0)
            a++;
    }
}

void ChipElm::setCurrent(VoltageSource *vs, double c) {
    for (int i = 0; i != getPostCount(); i++)
        if (pins[i].output && pins[i].voltSource == vs)
            pins[i].current = c;
}

bool ChipElm::validate() {
    for (int i = 0; i != getPostCount(); i++)
        if (pins[i].output && !validateRailNode(i))
            return false;
    return true;
}

double ChipElm::getCurrentIntoNode(int n) {
    // n may be out of range if this chip's pin count changed (e.g. via edit dialog)
    // after a containing CompositeElm/subcircuit recorded its node mapping.
    if (n < 0 || n >= (int) pins.size())
        return 0;
    return pins[n].current;
}

int ChipElm::flippedXSide(int s) {
    if (!isFlippedX()) return s;
    if (s == SIDE_W) return SIDE_E;
    if (s == SIDE_E) return SIDE_W;
    return s;
}

void ChipElm::flipX(int center2, int count) {
    flags ^= FLAG_FLIP_X;
    if (count != 1) {
        int xs = (flippedSizeX + 1) * cspc2;
        x = center2 - x - xs;
        x2 = center2 - x2;
    }
    setPoints();
}

void ChipElm::flipY(int center2, int count) {
    flags ^= FLAG_FLIP_Y;
    if (count != 1) {
        int ys = (flippedSizeY - 1) * cspc2;
        y = center2 - y - ys;
        y2 = center2 - y2;
    }
    setPoints();
}

void ChipElm::flipXY(int xmy, int count) {
    flags ^= FLAG_FLIP_XY;
    if (isFlippedX() != isFlippedY())
        flags ^= FLAG_FLIP_X | FLAG_FLIP_Y;
    if (count != 1) {
        x += cspc2;
        CircuitElm::flipXY(xmy, count);
        x -= cspc2;
    }
    setPoints();
}

std::optional<EditInfo> ChipElm::getEditInfo(int n) {
    if (isDigitalChip()) {
        if (n == 0)
            return EditInfo("High Logic Voltage", highVoltage).setUnitStep();
        n--;
    }
    if (allowBus()) {
        if (n == 0) {
            EditInfo ei("Bit Order", 0, -1, -1);
            ei.choice.emplace();
            ei.choice->add("MSB First");
            ei.choice->add("LSB First");
            ei.choice->add("Bus");
            ei.choice->select(bitOrder);
            return ei;
        }
        n--;
    }
    return getChipEditInfo(n);
}

void ChipElm::setEditValue(int n, EditInfo &ei) {
    if (isDigitalChip()) {
        if (n == 0) {
            highVoltage = ei.value;
            return;
        }
        n--;
    }
    if (allowBus()) {
        if (n == 0) {
            bitOrder = ei.choice->getSelectedIndex();
            setupPins();
            setPoints();
            return;
        }
        n--;
    }
    setChipEditValue(n, ei);
}

void ChipElm::makeBitPins(int count, int pos, int side, int offset, const std::string &name, bool output,
                          bool state, bool reversed) {
    for (int i = 0; i != count; i++) {
        int ii = reversed ? offset + count - 1 - i : offset + i;
        if (useBus()) {
            pins[ii] = Pin(this, pos, side, name);
            pins[ii].busWidth = count;
            pins[ii].busZ = i;
        } else if (bitOrder == BIT_ORDER_LSB_FIRST) {
            pins[ii] = Pin(this, pos + i, side, name + std::to_string(i));
        } else {
            pins[ii] = Pin(this, pos + (count - 1 - i), side, name + std::to_string(i));
        }
        pins[ii].output = output;
        pins[ii].state = state;
    }
}

std::string ChipElm::writeBits(const std::vector<bool> &data) {
    std::string sb;
    int32_t integer = 0;
    int bitIndex = 0;
    for (size_t i = 0; i < data.size(); i++) {
        if (bitIndex >= 32) {
            sb += " " + std::to_string(integer);
            integer = 0;
            bitIndex = 0;
        }
        if (data[i])
            integer |= (int32_t) (1u << bitIndex);
        bitIndex++;
    }
    if (bitIndex > 0)
        sb += " " + std::to_string(integer);
    return sb;
}

void ChipElm::readBits(StringTokenizer &st, std::vector<bool> &output) {
    int32_t integer = 0;
    int bitIndex = 32;  // force load on first iteration
    for (size_t i = 0; i < output.size(); i++) {
        if (bitIndex >= 32) {
            if (st.hasMoreTokens()) {
                integer = parseIntStrict(st.nextToken());
                bitIndex = 0;
            } else
                break;
        }
        output[i] = (integer & (int32_t) (1u << bitIndex)) != 0;
        bitIndex++;
    }
}

std::string ChipElm::writeBitsToString(const std::vector<bool> &data) {
    std::string sb;
    int32_t integer = 0;
    int bitIndex = 0;
    for (size_t i = 0; i < data.size(); i++) {
        if (bitIndex >= 32) {
            if (!sb.empty()) sb += " ";
            sb += std::to_string(integer);
            integer = 0;
            bitIndex = 0;
        }
        if (data[i])
            integer |= (int32_t) (1u << bitIndex);
        bitIndex++;
    }
    if (!sb.empty()) sb += " ";
    sb += std::to_string(integer);
    return sb;
}

void ChipElm::readBitsFromString(const std::string &s, std::vector<bool> &output) {
    StringTokenizer st(s, " ");
    int32_t integer = 0;
    int bitIndex = 32;
    for (size_t i = 0; i < output.size(); i++) {
        if (bitIndex >= 32) {
            if (st.hasMoreTokens()) {
                integer = parseIntStrict(st.nextToken());
                bitIndex = 0;
            } else
                break;
        }
        output[i] = (integer & (int32_t) (1u << bitIndex)) != 0;
        bitIndex++;
    }
}

void ChipElm::addRoutingObstacle(WireRouter &wr) {
    wr.addObstacle(rectPointsX[0], rectPointsY[0], rectPointsX[2], rectPointsY[2]);
}
