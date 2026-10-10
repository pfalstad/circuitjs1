/*
    Copyright (C) Paul Falstad

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

#include "XmlDoc.h"

#include <cstdlib>
#include <stdexcept>

const std::string *XmlElement::getAttribute(const std::string &name) const {
    for (auto &a : attrs)
        if (a.first == name)
            return &a.second;
    return nullptr;
}

void XmlElement::setAttribute(const std::string &name, const std::string &value) {
    for (auto &a : attrs)
        if (a.first == name) {
            a.second = value;
            return;
        }
    attrs.emplace_back(name, value);
}

void XmlElement::removeAttribute(const std::string &name) {
    for (size_t i = 0; i < attrs.size(); i++)
        if (attrs[i].first == name) {
            attrs.erase(attrs.begin() + i);
            return;
        }
}

XmlElement *XmlElement::appendChild(std::unique_ptr<XmlElement> child) {
    children.push_back(std::move(child));
    return children.back().get();
}

XmlElement *XmlElement::createChild(const std::string &tag) {
    return appendChild(std::make_unique<XmlElement>(tag));
}

static void appendUtf8(std::string &out, unsigned long cp) {
    if (cp < 0x80) {
        out += (char) cp;
    } else if (cp < 0x800) {
        out += (char) (0xC0 | (cp >> 6));
        out += (char) (0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
        out += (char) (0xE0 | (cp >> 12));
        out += (char) (0x80 | ((cp >> 6) & 0x3F));
        out += (char) (0x80 | (cp & 0x3F));
    } else {
        out += (char) (0xF0 | (cp >> 18));
        out += (char) (0x80 | ((cp >> 12) & 0x3F));
        out += (char) (0x80 | ((cp >> 6) & 0x3F));
        out += (char) (0x80 | (cp & 0x3F));
    }
}

static std::string decodeEntities(const std::string &s) {
    std::string out;
    out.reserve(s.size());
    for (size_t i = 0; i < s.size(); i++) {
        if (s[i] != '&') {
            out += s[i];
            continue;
        }
        size_t semi = s.find(';', i);
        if (semi == std::string::npos) {
            out += s[i];
            continue;
        }
        std::string ent = s.substr(i + 1, semi - i - 1);
        if (ent == "amp") out += '&';
        else if (ent == "lt") out += '<';
        else if (ent == "gt") out += '>';
        else if (ent == "quot") out += '"';
        else if (ent == "apos") out += '\'';
        else if (!ent.empty() && ent[0] == '#') {
            unsigned long cp = (ent.size() > 1 && (ent[1] == 'x' || ent[1] == 'X'))
                ? std::strtoul(ent.c_str() + 2, nullptr, 16)
                : std::strtoul(ent.c_str() + 1, nullptr, 10);
            appendUtf8(out, cp);
        } else {
            // unknown entity; keep it as-is
            out += s.substr(i, semi - i + 1);
        }
        i = semi;
    }
    return out;
}

namespace {

struct Parser {
    const std::string &s;
    size_t pos = 0;

    explicit Parser(const std::string &text) : s(text) {}

    [[noreturn]] void fail(const std::string &msg) {
        throw std::runtime_error("xml parse error at " + std::to_string(pos) + ": " + msg);
    }

    bool isNameChar(char c) {
        return isalnum((unsigned char) c) || c == '_' || c == '-' || c == '.' || c == ':' || (unsigned char) c >= 0x80;
    }

    void skipSpace() {
        while (pos < s.size() && isspace((unsigned char) s[pos]))
            pos++;
    }

    std::string readName() {
        size_t start = pos;
        while (pos < s.size() && isNameChar(s[pos]))
            pos++;
        if (pos == start)
            fail("expected name");
        return s.substr(start, pos - start);
    }

    // skip <?...?>, <!--...-->, <!DOCTYPE...>; returns false if not at one of those
    bool skipMisc() {
        if (s.compare(pos, 2, "<?") == 0) {
            size_t e = s.find("?>", pos);
            if (e == std::string::npos) fail("unterminated <?");
            pos = e + 2;
            return true;
        }
        if (s.compare(pos, 4, "<!--") == 0) {
            size_t e = s.find("-->", pos);
            if (e == std::string::npos) fail("unterminated comment");
            pos = e + 3;
            return true;
        }
        if (s.compare(pos, 2, "<!") == 0 && s.compare(pos, 9, "<![CDATA[") != 0) {
            size_t e = s.find('>', pos);
            if (e == std::string::npos) fail("unterminated <!");
            pos = e + 1;
            return true;
        }
        return false;
    }

    std::unique_ptr<XmlElement> parseElement() {
        if (pos >= s.size() || s[pos] != '<')
            fail("expected <");
        pos++;
        auto elem = std::make_unique<XmlElement>(readName());
        for (;;) {
            skipSpace();
            if (pos >= s.size())
                fail("unterminated tag");
            if (s[pos] == '/') {
                if (s.compare(pos, 2, "/>") != 0) fail("expected />");
                pos += 2;
                return elem;
            }
            if (s[pos] == '>') {
                pos++;
                break;
            }
            std::string name = readName();
            skipSpace();
            if (pos >= s.size() || s[pos] != '=') fail("expected =");
            pos++;
            skipSpace();
            if (pos >= s.size() || (s[pos] != '"' && s[pos] != '\'')) fail("expected quote");
            char q = s[pos++];
            size_t e = s.find(q, pos);
            if (e == std::string::npos) fail("unterminated attribute");
            elem->attrs.emplace_back(name, decodeEntities(s.substr(pos, e - pos)));
            pos = e + 1;
        }

        // content
        for (;;) {
            size_t lt = s.find('<', pos);
            if (lt == std::string::npos)
                fail("unterminated element " + elem->tagName);
            if (lt > pos)
                elem->text += decodeEntities(s.substr(pos, lt - pos));
            pos = lt;
            if (s.compare(pos, 2, "</") == 0) {
                pos += 2;
                std::string name = readName();
                if (name != elem->tagName)
                    fail("mismatched end tag " + name + " for " + elem->tagName);
                skipSpace();
                if (pos >= s.size() || s[pos] != '>') fail("expected >");
                pos++;
                return elem;
            }
            if (s.compare(pos, 9, "<![CDATA[") == 0) {
                size_t e = s.find("]]>", pos);
                if (e == std::string::npos) fail("unterminated CDATA");
                elem->text += s.substr(pos + 9, e - pos - 9);
                pos = e + 3;
                continue;
            }
            if (skipMisc())
                continue;
            elem->children.push_back(parseElement());
        }
    }

    std::unique_ptr<XmlElement> parseDocument() {
        for (;;) {
            skipSpace();
            if (!skipMisc())
                break;
        }
        return parseElement();
    }
};

}  // namespace

std::unique_ptr<XmlElement> parseXml(const std::string &text) {
    Parser p(text);
    return p.parseDocument();
}

std::string escapeXml(const std::string &s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
        case '&': out += "&amp;"; break;
        case '<': out += "&lt;"; break;
        case '>': out += "&gt;"; break;
        case '"': out += "&quot;"; break;
        default: out += c;
        }
    }
    return out;
}
