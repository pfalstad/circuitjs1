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

#include "ScopeSerializer.h"

#include <algorithm>
#include <cstdio>

#include "CircuitElm.h"
#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "JsNumber.h"
#include "Scope.h"
#include "SimApp.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

using namespace ScopeConstants;

static std::string toHex(int v) {
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%x", v);
    return buf;
}

int ScopeSerializer::getFlags() const {
    int flags = (scope->showI ? 1 : 0) | (scope->showV ? 2 : 0) |
        (scope->showMax ? 0 : 4) |  // showMax used to be always on
        (scope->showFreq ? 8 : 0) |
        // In this version we always dump manual settings using the PERPLOT format
        (scope->isManualScale() ? (FLAG_MAN_SCALE | FLAG_PERPLOT_MAN_SCALE) : 0) |
        (scope->plot2d.enabled ? 64 : 0) |
        (scope->plot2d.plotXY ? 128 : 0) | (scope->showMin ? 256 : 0) | (scope->showScale ? 512 : 0) |
        (scope->fftPlot.enabled ? 1024 : 0) | (scope->maxScale ? 8192 : 0) | (scope->showRMS ? 16384 : 0) |
        (scope->showDutyCycle ? 32768 : 0) | (scope->fftPlot.logSpectrum ? 65536 : 0) |
        (scope->showAverage ? (1 << 17) : 0) | (scope->showElmInfo ? (1 << 20) : 0) |
        (scope->showP2P ? (1 << 22) : 0) | (scope->fftPlot.showPhaseAngle ? (1 << 23) : 0);
    flags |= FLAG_PLOTS;  // 4096
    int allPlotFlags = 0;
    for (auto &p : scope->plots)
        allPlotFlags |= p->getPlotFlags();
    flags |= (allPlotFlags != 0) ? FLAG_PERPLOTFLAGS : 0;
    if (scope->isManualScale())
        flags |= FLAG_DIVISIONS;
    if (scope->trigger.isActive())
        flags |= FLAG_TRIGGER;
    return flags;
}

void ScopeSerializer::setFlags(int flags) {
    scope->showI = (flags & 1) != 0;
    scope->showV = (flags & 2) != 0;
    scope->showMax = (flags & 4) == 0;
    scope->showFreq = (flags & 8) != 0;
    scope->manualScale = (flags & FLAG_MAN_SCALE) != 0;
    scope->plot2d.enabled = (flags & 64) != 0;
    scope->plot2d.plotXY = (flags & 128) != 0;
    scope->showMin = (flags & 256) != 0;
    scope->showScale = (flags & 512) != 0;
    scope->fftPlot.show((flags & 1024) != 0);
    scope->maxScale = (flags & 8192) != 0;
    scope->showRMS = (flags & 16384) != 0;
    scope->showDutyCycle = (flags & 32768) != 0;
    scope->fftPlot.logSpectrum = (flags & 65536) != 0;
    scope->showAverage = (flags & (1 << 17)) != 0;
    scope->showElmInfo = (flags & (1 << 20)) != 0;
    scope->showP2P = (flags & (1 << 22)) != 0;
    scope->fftPlot.showPhaseAngle = (flags & (1 << 23)) != 0;
}

void ScopeSerializer::dumpXml(XmlElement *root) {
    if (scope->plots.empty())
        return;
    ScopePlot &vPlot = *scope->plots[0];
    CircuitElm *elm = vPlot.elm;
    if (elm == nullptr)
        return;
    // sync scale[] from scaleX/scaleY for 2d plots so they get saved correctly
    if (scope->plot2d.enabled && scope->plots.size() >= 2) {
        int px = scope->plot2d.validPlotIndex(scope->plot2d.plotX, 0);
        int py = scope->plot2d.validPlotIndex(scope->plot2d.plotY, 1);
        scope->scale[scope->plots[px]->units] = scope->plot2d.scaleX;
        scope->scale[scope->plots[py]->units] = scope->plot2d.scaleY;
    }
    int flags = getFlags();
    int eno = scope->app->locateElm(elm);
    if (eno < 0)
        return;
    XmlElement *xmlElm = root->createChild("o");
    CircuitXMLSerializer::dumpAttr(xmlElm, "en", eno);
    CircuitXMLSerializer::dumpAttr(xmlElm, "sp", vPlot.scopePlotSpeed);
    // strip flags that belong to old text format or are superseded by explicit XML attributes
    int f = flags & ~(FLAG_PERPLOTFLAGS | FLAG_PERPLOT_MAN_SCALE | FLAG_PLOTS | FLAG_TRIGGER);
    CircuitXMLSerializer::dumpAttr(xmlElm, "f", exportAsDecOrHex(f, 0));
    CircuitXMLSerializer::dumpAttr(xmlElm, "p", scope->position);
    if (scope->manDivisions != 8)
        CircuitXMLSerializer::dumpAttr(xmlElm, "md", scope->manDivisions);
    scope->trigger.dumpXml(xmlElm);
    if (scope->plot2d.plotXY) {
        if (scope->plot2d.plotX != 0) CircuitXMLSerializer::dumpAttr(xmlElm, "xy2x", scope->plot2d.plotX);
        if (scope->plot2d.plotY != 1) CircuitXMLSerializer::dumpAttr(xmlElm, "xy2y", scope->plot2d.plotY);
        if (scope->plot2d.plotBrightness >= 0) CircuitXMLSerializer::dumpAttr(xmlElm, "xy2br", scope->plot2d.plotBrightness);
        if (scope->plot2d.plotColorR >= 0) CircuitXMLSerializer::dumpAttr(xmlElm, "xy2r", scope->plot2d.plotColorR);
        if (scope->plot2d.plotColorG >= 0) CircuitXMLSerializer::dumpAttr(xmlElm, "xy2g", scope->plot2d.plotColorG);
        if (scope->plot2d.plotColorB >= 0) CircuitXMLSerializer::dumpAttr(xmlElm, "xy2b", scope->plot2d.plotColorB);
    }
    for (auto &pp : scope->plots) {
        ScopePlot &p = *pp;
        XmlElement *pelm = xmlElm->createChild("p");
        if (p.getPlotFlags() > 0)
            CircuitXMLSerializer::dumpAttr(pelm, "f", toHex(p.getPlotFlags()));
        if (p.elm != elm)
            CircuitXMLSerializer::dumpAttr(pelm, "e", scope->app->locateElm(p.elm));
        CircuitXMLSerializer::dumpAttr(pelm, "v", p.value);
        CircuitXMLSerializer::dumpAttr(pelm, "sc", scope->scale[p.units]);
        if (scope->isManualScale()) {
            CircuitXMLSerializer::dumpAttr(pelm, "ms", p.manScale);
            CircuitXMLSerializer::dumpAttr(pelm, "mp", p.manVPosition);
        }
    }
    if (scope->text)
        xmlElm->setAttribute("x", *scope->text);
    if (scope->plot2d.trailPersistence != ScopePlot2d::DEFAULT_TRAIL_PERSISTENCE)
        CircuitXMLSerializer::dumpAttr(xmlElm, "tp", scope->plot2d.trailPersistence);
}

void ScopeSerializer::undumpXml(CircuitXMLDeserializer &xml) {
    int e = xml.parseIntAttr("en", -1);
    if (e == -1)
        return;
    CircuitElm *ce = scope->app->getElm(e);
    if (ce == nullptr)
        return;
    scope->setElm(ce);
    scope->plots.clear();
    scope->visiblePlots.clear();
    scope->speed = xml.parseIntAttr("sp", 64);
    std::string fs = xml.parseStringAttr("f", std::string("0")).value_or("0");
    int flags = importDecOrHex(fs);
    scope->position = xml.parseIntAttr("p", 0);
    scope->manDivisions = xml.parseIntAttr("md", 8);
    scope->text = xml.parseStringAttr("x", std::nullopt);
    scope->plot2d.trailPersistence = xml.parseIntAttr("tp", ScopePlot2d::DEFAULT_TRAIL_PERSISTENCE);
    // All of these must be read before parseChildElement() changes the XML context
    // to a child <p> element.
    scope->trigger.undumpXml(xml);
    int xy2x = xml.parseIntAttr("xy2x", 0);
    int xy2y = xml.parseIntAttr("xy2y", 1);
    int xy2br = xml.parseIntAttr("xy2br", -1);
    int xy2r = xml.parseIntAttr("xy2r", -1);
    int xy2g = xml.parseIntAttr("xy2g", -1);
    int xy2b = xml.parseIntAttr("xy2b", -1);
    for (const XmlElement *elem : xml.getChildElements()) {
        xml.parseChildElement(elem);
        int plotFlags = (int) std::strtol(xml.parseStringAttr("f", std::string("0")).value_or("0").c_str(), nullptr, 16);
        CircuitElm *plotElm = scope->app->getElm(xml.parseIntAttr("e", e));
        if (plotElm == nullptr)
            continue;
        int val = xml.parseIntAttr("v", -1);
        int u = plotElm->getScopeUnits(val);
        double sc = xml.parseDoubleAttr("sc", -1);
        if (sc >= 0)
            scope->scale[u] = sc;
        auto p = std::make_unique<ScopePlot>(plotElm, u, val, scope->getManScaleFromMaxScale(u, false));
        p->acCoupled = (plotFlags & ScopePlot::FLAG_AC) != 0;
        double ms = xml.parseDoubleAttr("ms", -1);
        if (ms >= 0) {
            p->manScaleSet = true;
            p->manScale = ms;
            p->manVPosition = xml.parseIntAttr("mp", 0);
        }
        scope->plots.push_back(std::move(p));
    }
    // setFlags after plots are loaded so hasPlotValue checks work correctly
    setFlags(flags);
    // restore XY plot indices (parsed above before child loop changed context)
    if (scope->plot2d.plotXY) {
        scope->plot2d.plotX = xy2x;
        scope->plot2d.plotY = xy2y;
        scope->plot2d.plotBrightness = xy2br;
        scope->plot2d.plotColorR = xy2r;
        scope->plot2d.plotColorG = xy2g;
        scope->plot2d.plotColorB = xy2b;
    }
    // restore scaleX/scaleY for 2d plots
    if (scope->plot2d.enabled && !scope->plots.empty()) {
        int px = scope->plot2d.validPlotIndex(scope->plot2d.plotX, 0);
        int py = scope->plot2d.validPlotIndex(scope->plot2d.plotY, std::min(1, (int) scope->plots.size() - 1));
        scope->plot2d.scaleX = scope->scale[scope->plots[px]->units];
        scope->plot2d.scaleY = scope->scale[scope->plots[py]->units];
    }
}

void ScopeSerializer::undump(StringTokenizer &st) {
    scope->initialize();
    int e = parseIntStrict(st.nextToken());
    if (e == -1)
        return;
    CircuitElm *ce = scope->app->getElm(e);
    if (ce == nullptr)
        return;
    scope->setElm(ce);
    scope->speed = parseIntStrict(st.nextToken());
    int value = parseIntStrict(st.nextToken());
    // fix old value for VAL_POWER which doesn't work for transistors
    if (!ce->isTransistorElm() && value == VAL_POWER_OLD)
        value = VAL_POWER;
    int flags = importDecOrHex(st.nextToken());
    scope->scale[UNITS_V] = parseFloatStrict(st.nextToken());
    scope->scale[UNITS_A] = parseFloatStrict(st.nextToken());
    if (scope->scale[UNITS_V] == 0)
        scope->scale[UNITS_V] = 0.5;
    if (scope->scale[UNITS_A] == 0)
        scope->scale[UNITS_A] = 1;
    scope->plot2d.scaleX = scope->scale[UNITS_V];
    scope->plot2d.scaleY = scope->scale[UNITS_A];
    scope->scale[UNITS_OHMS] = scope->scale[UNITS_W] = scope->scale[UNITS_C] = scope->scale[UNITS_V];
    scope->text.reset();
    bool plot2dFlag = (flags & 64) != 0;
    bool hasPlotFlags = (flags & FLAG_PERPLOTFLAGS) != 0;
    if ((flags & FLAG_PLOTS) != 0) {
        // new-style dump
        try {
            scope->position = parseIntStrict(st.nextToken());
            int sz = parseIntStrict(st.nextToken());
            scope->manDivisions = 8;
            if ((flags & FLAG_DIVISIONS) != 0)
                scope->manDivisions = Scope::lastManDivisions = parseIntStrict(st.nextToken());
            int u = ce->getScopeUnits(value);
            if (u > UNITS_A)
                scope->scale[u] = parseFloatStrict(st.nextToken());
            scope->setValue(value);
            // setValue(0) creates an extra plot for current, so remove that
            while (scope->plots.size() > 1)
                scope->plots.erase(scope->plots.begin() + 1);
            int plotFlags = 0;
            for (int i = 0; i != sz; i++) {
                if (hasPlotFlags)
                    plotFlags = (int) std::strtol(st.nextToken().c_str(), nullptr, 16);
                if (i != 0) {
                    int ne = parseIntStrict(st.nextToken());
                    int val = parseIntStrict(st.nextToken());
                    CircuitElm *elm2 = scope->app->getElm(ne);
                    if (elm2 == nullptr)
                        break;
                    u = elm2->getScopeUnits(val);
                    if (u > UNITS_A)
                        scope->scale[u] = parseFloatStrict(st.nextToken());
                    scope->plots.push_back(std::make_unique<ScopePlot>(elm2, u, val, scope->getManScaleFromMaxScale(u, false)));
                }
                if (i >= (int) scope->plots.size())
                    break;
                ScopePlot &p = *scope->plots[i];
                p.acCoupled = (plotFlags & ScopePlot::FLAG_AC) != 0;
                if ((flags & FLAG_PERPLOT_MAN_SCALE) != 0) {
                    p.manScaleSet = true;
                    p.manScale = parseFloatStrict(st.nextToken());
                    p.manVPosition = parseIntStrict(st.nextToken());
                }
            }
            while (st.hasMoreTokens()) {
                if (!scope->text)
                    scope->text = st.nextToken();
                else
                    *scope->text += " " + st.nextToken();
            }
        } catch (std::exception &) {
        }
    } else {
        // old-style dump
        CircuitElm *yElm = nullptr;
        int ivalue = 0;
        scope->manDivisions = 8;
        try {
            scope->position = parseIntStrict(st.nextToken());
            int ye = -1;
            if ((flags & FLAG_YELM) != 0) {
                ye = parseIntStrict(st.nextToken());
                if (ye != -1)
                    yElm = scope->app->getElm(ye);
                // sinediode.txt has yElm set to something even though there's no xy plot
                if (!plot2dFlag)
                    yElm = nullptr;
            }
            if ((flags & FLAG_IVALUE) != 0)
                ivalue = parseIntStrict(st.nextToken());
            while (st.hasMoreTokens()) {
                if (!scope->text)
                    scope->text = st.nextToken();
                else
                    *scope->text += " " + st.nextToken();
            }
        } catch (std::exception &) {
        }
        scope->setValues(value, ivalue, scope->app->getElm(e), yElm);
    }
    if (scope->text)
        scope->text = CustomLogicModel::unescape(*scope->text);
    scope->plot2d.enabled = plot2dFlag;
    setFlags(flags);
}

std::string ScopeSerializer::exportAsDecOrHex(int v, int thresh) {
    if (v >= thresh)
        return "x" + toHex(v);
    return std::to_string(v);
}

int ScopeSerializer::importDecOrHex(const std::string &s) {
    if (!s.empty() && s[0] == 'x')
        return (int) std::strtol(s.c_str() + 1, nullptr, 16);
    return parseIntStrict(s);
}
