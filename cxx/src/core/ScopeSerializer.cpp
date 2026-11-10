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
#include <cctype>
#include <cmath>
#include <cstring>
#include <map>
#include <optional>
#include <stdexcept>
#include <cstdio>

#include "CircuitElm.h"
#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "CustomLogicModel.h"
#include "JsNumber.h"
#include "Scope.h"
#include "SimApp.h"
#include "Storage.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

using namespace ScopeConstants;

static std::string toHex(int v) {
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%x", v);
    return buf;
}

namespace {

// just enough JSON for the scope defaults (same format as the TS version's)
struct JsonValue {
    enum Type { NUL, BOOL, NUMBER, STRING, ARRAY, OBJECT } type = NUL;
    bool b = false;
    double n = 0;
    std::string s;
    std::vector<JsonValue> arr;
    std::map<std::string, JsonValue> obj;

    const JsonValue *get(const std::string &key) const {
        if (type != OBJECT)
            return nullptr;
        auto it = obj.find(key);
        return it == obj.end() ? nullptr : &it->second;
    }
    bool isNumber() const { return type == NUMBER; }
    // JS truthiness, for "!!x"
    bool truthy() const {
        switch (type) {
        case BOOL: return b;
        case NUMBER: return n != 0 && n == n;
        case STRING: return !s.empty();
        case ARRAY: case OBJECT: return true;
        default: return false;
        }
    }
    // JS "x | 0"
    int toInt32() const {
        double v = type == NUMBER ? n : type == BOOL ? (b ? 1 : 0) : 0;
        if (!(v == v) || std::isinf(v))
            return 0;
        return (int) (int64_t) std::trunc(v);
    }
};

class JsonParser {
public:
    explicit JsonParser(const std::string &str) : str(str) {}
    JsonValue parse() {
        JsonValue v = value();
        ws();
        if (pos != str.size())
            fail();
        return v;
    }

private:
    const std::string &str;
    size_t pos = 0;

    [[noreturn]] void fail() { throw std::runtime_error("bad JSON"); }
    void ws() {
        while (pos < str.size() && (str[pos] == ' ' || str[pos] == '\t' || str[pos] == '\n' || str[pos] == '\r'))
            pos++;
    }
    bool match(const char *lit) {
        size_t len = std::strlen(lit);
        if (str.compare(pos, len, lit) != 0)
            return false;
        pos += len;
        return true;
    }
    std::string string() {
        if (str[pos] != '"')
            fail();
        pos++;
        std::string out;
        while (pos < str.size() && str[pos] != '"') {
            char c = str[pos++];
            if (c == '\\') {
                if (pos >= str.size())
                    fail();
                char e = str[pos++];
                switch (e) {
                case 'n': out += '\n'; break;
                case 't': out += '\t'; break;
                case 'r': out += '\r'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                case 'u': pos += 4; out += '?'; break;  // (not needed here)
                default: out += e;
                }
            } else
                out += c;
        }
        if (pos >= str.size())
            fail();
        pos++;
        return out;
    }
    JsonValue value() {
        ws();
        if (pos >= str.size())
            fail();
        JsonValue v;
        char c = str[pos];
        if (c == '{') {
            v.type = JsonValue::OBJECT;
            pos++;
            ws();
            if (pos < str.size() && str[pos] == '}') {
                pos++;
                return v;
            }
            for (;;) {
                ws();
                std::string key = string();
                ws();
                if (pos >= str.size() || str[pos++] != ':')
                    fail();
                v.obj[key] = value();
                ws();
                if (pos >= str.size())
                    fail();
                if (str[pos] == ',') { pos++; continue; }
                if (str[pos] == '}') { pos++; break; }
                fail();
            }
        } else if (c == '[') {
            v.type = JsonValue::ARRAY;
            pos++;
            ws();
            if (pos < str.size() && str[pos] == ']') {
                pos++;
                return v;
            }
            for (;;) {
                v.arr.push_back(value());
                ws();
                if (pos >= str.size())
                    fail();
                if (str[pos] == ',') { pos++; continue; }
                if (str[pos] == ']') { pos++; break; }
                fail();
            }
        } else if (c == '"') {
            v.type = JsonValue::STRING;
            v.s = string();
        } else if (match("true")) {
            v.type = JsonValue::BOOL;
            v.b = true;
        } else if (match("false")) {
            v.type = JsonValue::BOOL;
        } else if (match("null")) {
        } else {
            size_t start = pos;
            while (pos < str.size() && (std::isdigit((unsigned char) str[pos]) || std::strchr("+-.eE", str[pos])))
                pos++;
            if (start == pos)
                fail();
            v.type = JsonValue::NUMBER;
            v.n = parseFloatStrict(str.substr(start, pos - start));
        }
        return v;
    }
};

}  // namespace

void ScopeSerializer::saveAsDefault() {
    Storage *stor = Storage::localStorage;
    if (stor == nullptr)
        return;
    ScopeTrigger &trig = scope->trigger;
    // JSON, the same as the TS version
    std::string s = "{\"v\":2,\"flags\":" + std::to_string(getFlags());
    s += ",\"speed\":" + std::to_string(!scope->plots.empty() ? scope->plots[0]->scopePlotSpeed : scope->speed);
    s += ",\"md\":" + std::to_string(scope->manDivisions);
    s += ",\"plots\":[";
    for (size_t i = 0; i < scope->plots.size(); i++) {
        const ScopePlot &p = *scope->plots[i];
        if (i > 0)
            s += ",";
        s += "{\"u\":" + std::to_string(p.units) + ",\"ms\":" + jsNumberToString(p.manScale) +
             ",\"mp\":" + std::to_string(p.manVPosition) + ",\"ac\":" + (p.acCoupled ? "true" : "false") + "}";
    }
    s += "],\"trig\":{\"mode\":" + std::to_string(trig.mode) + ",\"edge\":" + std::to_string(trig.edge) +
         ",\"level\":" + jsNumberToString(trig.level) + ",\"source\":" + std::to_string(trig.source) + "}}";
    stor->setItem("scopeDefaults", s);
}

void ScopeSerializer::loadDefaultsJson(const std::string &str) {
    JsonValue d = JsonParser(str).parse();
    const JsonValue *jv;
    int flags = (jv = d.get("flags")) ? jv->toInt32() : 0;
    setFlags(flags);
    if ((jv = d.get("speed")) && jv->isNumber() && jv->n > 0)
        scope->speed = (int) jv->n;
    if ((jv = d.get("md")) && jv->isNumber() && jv->n > 0)
        scope->manDivisions = (int) jv->n;
    std::vector<const JsonValue *> saved;
    if ((jv = d.get("plots")) && jv->type == JsonValue::ARRAY)
        for (const JsonValue &x : jv->arr)
            saved.push_back(&x);
    bool manual = (flags & FLAG_MAN_SCALE) != 0;
    auto unitsOf = [](const JsonValue *x) -> std::optional<double> {
        const JsonValue *u = x ? x->get("u") : nullptr;
        if (u && u->isNumber())
            return u->n;
        return std::nullopt;
    };
    for (size_t i = 0; i < scope->plots.size(); i++) {
        ScopePlot &p = *scope->plots[i];
        // prefer the saved plot in the same slot; otherwise any saved plot with the same units
        const JsonValue *sp = i < saved.size() ? saved[i] : nullptr;
        if (!sp || unitsOf(sp) != std::optional<double>(p.units)) {
            sp = nullptr;
            for (const JsonValue *x : saved)
                if (unitsOf(x) == std::optional<double>(p.units)) {
                    sp = x;
                    break;
                }
        }
        if (!sp)
            continue;
        const JsonValue *ac = sp->get("ac");
        p.acCoupled = ac && ac->truthy();
        const JsonValue *ms = sp->get("ms");
        if (manual && ms && ms->isNumber() && ms->n > 0) {
            p.manScale = ms->n;
            const JsonValue *mp = sp->get("mp");
            p.manVPosition = mp ? mp->toInt32() : 0;
            p.manScaleSet = true;
        }
    }
    if (const JsonValue *t = d.get("trig")) {
        ScopeTrigger &trig = scope->trigger;
        if ((jv = t->get("mode")) && jv->isNumber()) trig.mode = (int) jv->n;
        if ((jv = t->get("edge")) && jv->isNumber()) trig.edge = (int) jv->n;
        if ((jv = t->get("level")) && jv->isNumber()) trig.level = jv->n;
        if ((jv = t->get("source")) && jv->isNumber()) trig.source = (int) jv->n;
    }
}

bool ScopeSerializer::loadDefaults() {
    Storage *stor = Storage::localStorage;
    if (stor == nullptr)
        return false;
    std::optional<std::string> str = stor->getItem("scopeDefaults");
    if (!str)
        return false;
    try {
        if (!str->empty() && (*str)[0] == '{')
            loadDefaultsJson(*str);
        else {
            // old format: "1 flags speed [triggerLevel]"
            std::vector<std::string> arr;
            StringTokenizer st(*str, " ");
            while (st.hasMoreTokens())
                arr.push_back(st.nextToken());
            if (arr.size() < 3)
                return false;
            int flags = parseIntStrict(arr[1]);
            setFlags(flags);
            scope->speed = parseIntStrict(arr[2]);
            if (arr.size() > 3 && (flags & FLAG_TRIGGER) != 0)
                scope->trigger.level = parseFloatStrict(arr[3]);
        }
    } catch (std::exception &) {
        return false;
    }
    return true;
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
    // the scope's speed: the plots only get it when the scopes are next set up, so until
    // then (saving a circuit straight after loading it) theirs is still 0
    CircuitXMLSerializer::dumpAttr(xmlElm, "sp", scope->speed);
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
    if (!scope->plot2d.includeOrigin)
        CircuitXMLSerializer::dumpAttr(xmlElm, "xyo", 0);
    if (scope->plot2d.alignX)
        CircuitXMLSerializer::dumpAttr(xmlElm, "xya", 1);
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
    scope->plot2d.includeOrigin = xml.parseIntAttr("xyo", 1) != 0;
    scope->plot2d.alignX = xml.parseIntAttr("xya", 0) != 0;
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
    // the text format has no trigger settings, so don't inherit them from the saved defaults
    scope->trigger.mode = ScopeTrigger::TRIGGER_FREERUN;
    scope->trigger.edge = ScopeTrigger::TRIGGER_EDGE_RISING;
    scope->trigger.level = 0;
    scope->trigger.source = 0;
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
