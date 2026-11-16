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

#include "CustomLogicModel.h"

#include <algorithm>

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "JsNumber.h"
#include "SimApp.h"
#include "StringTokenizer.h"
#include "XmlDoc.h"

SimApp *CustomLogicModel::app = nullptr;

ModelRegistry<CustomLogicModel> &CustomLogicModel::registry() {
    static ModelRegistry<CustomLogicModel> r(nullptr, "customlogicmodel:",
                                             [](CustomLogicModel *m, XmlElement *root) { m->dumpXml(root); });
    return r;
}

CustomLogicModel *CustomLogicModel::getModelWithName(const std::string &name) {
    if (CustomLogicModel *lm = registry().get(name))
        return lm;
    CustomLogicModel *lm = new CustomLogicModel();
    lm->name = name;
    lm->infoText = (name == "default") ? "custom logic" : name;
    registry().setLocal(lm);
    return lm;
}

CustomLogicModel *CustomLogicModel::getModelWithNameOrCopy(const std::string &name, const CustomLogicModel *oldmodel) {
    if (CustomLogicModel *lm = registry().get(name))
        return lm;
    CustomLogicModel *copy = oldmodel ? new CustomLogicModel(*oldmodel) : new CustomLogicModel();
    copy->dumped = false;
    copy->triState = oldmodel ? oldmodel->triState : false;
    copy->name = name;
    copy->infoText = name;
    registry().setLocal(copy);
    return copy;
}

CustomLogicModel::CustomLogicModel() {
    inputs = listToArray("A,B");
    outputs = listToArray("C,D");
}

void CustomLogicModel::undumpModel(StringTokenizer &st) {
    std::string name = unescape(st.nextToken());
    CustomLogicModel *model = getModelForLoad(name);
    model->undump(st);
}

void CustomLogicModel::undump(StringTokenizer &st) {
    flags = parseIntStrict(st.nextToken());
    inputs = listToArray(unescape(st.nextToken()));
    outputs = listToArray(unescape(st.nextToken()));
    infoText = unescape(st.nextToken());
    rules = unescape(st.nextToken());
    parseRules(nullptr);
}

CustomLogicModel *CustomLogicModel::undumpModelXml(CircuitXMLDeserializer &xml) {
    std::optional<std::string> name = xml.parseStringAttr("nm", std::nullopt);
    CustomLogicModel *model = getModelForLoad(name.value_or(""));
    model->undumpXml(xml);
    return model;
}

// the model to load a definition into (see ModelRegistry.getForLoad)
CustomLogicModel *CustomLogicModel::getModelForLoad(const std::string &name) {
    return registry().getForLoad(name, [&name] {
        CustomLogicModel *lm = new CustomLogicModel();
        lm->infoText = (name == "default") ? "custom logic" : name;
        return lm;
    });
}

static std::string jsTrim(const std::string &s) {
    const char *ws = " \t\n\r\f\v";
    size_t a = s.find_first_not_of(ws);
    if (a == std::string::npos)
        return "";
    size_t b = s.find_last_not_of(ws);
    return s.substr(a, b - a + 1);
}

void CustomLogicModel::undumpXml(CircuitXMLDeserializer &xml) {
    flags = xml.parseIntAttr("f", flags);
    inputs = listToArray(xml.parseStringAttr("in", std::nullopt).value_or(""));
    outputs = listToArray(xml.parseStringAttr("o", std::nullopt).value_or(""));
    infoText = xml.parseStringAttr("if", std::nullopt).value_or("");
    rules = jsTrim(xml.parseContents().value_or(""));
    parseRules(nullptr);
}

std::string CustomLogicModel::arrayToList(const std::vector<std::string> &arr) {
    std::string s;
    for (size_t i = 0; i != arr.size(); i++)
        s += (i ? "," : "") + arr[i];
    return s;
}

// like JS split(","): "" gives [""]
std::vector<std::string> CustomLogicModel::listToArray(const std::string &arr) {
    std::vector<std::string> out;
    size_t start = 0;
    while (true) {
        size_t p = arr.find(',', start);
        out.push_back(arr.substr(start, p == std::string::npos ? std::string::npos : p - start));
        if (p == std::string::npos)
            return out;
        start = p + 1;
    }
}

std::optional<EditInfo> CustomLogicModel::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Inputs", 0, -1, -1);
        ei.text = arrayToList(inputs);
        return ei;
    }
    if (n == 1) {
        EditInfo ei("Outputs", 0, -1, -1);
        ei.text = arrayToList(outputs);
        return ei;
    }
    if (n == 2) {
        EditInfo ei("Info Text", 0, -1, -1);
        ei.text = infoText;
        return ei;
    }
    if (n == 3) {
        EditInfo ei(EditInfo::makeLink("customlogic.html", "Definition"), 0, -1, -1);
        ei.setErrorFieldName("Definition");
        ei.textArea = TextArea{rules};
        return ei;
    }
    // (n == 4, a Schmitt checkbox, is not implemented)
    return std::nullopt;
}

void CustomLogicModel::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        inputs = listToArray(ei.textf->value);
    if (n == 1)
        outputs = listToArray(ei.textf->value);
    if (n == 2)
        infoText = ei.textf->value;
    if (n == 3) {
        rules = ei.textArea->value;
        parseRules(&ei);
    }
    if (n == 4) {
        if (ei.checkbox->getState())
            flags |= FLAG_SCHMITT;
        else
            flags &= ~FLAG_SCHMITT;
    }
    registry().resave(this);
    if (app != nullptr)
        app->updateModels();
}

void CustomLogicModel::parseRules(EditInfo *ei) {
    std::vector<std::string> lines;
    size_t start = 0;
    while (true) {
        size_t p = rules.find('\n', start);
        lines.push_back(rules.substr(start, p == std::string::npos ? std::string::npos : p - start));
        if (p == std::string::npos)
            break;
        start = p + 1;
    }
    rulesLeft.clear();
    rulesRight.clear();
    triState = false;
    for (size_t i = 0; i != lines.size(); i++) {
        std::string s = lines[i];
        std::transform(s.begin(), s.end(), s.begin(), [](char c) { return (c >= 'A' && c <= 'Z') ? (char) (c - 'A' + 'a') : c; });
        s = jsTrim(s);
        if (s.empty() || s[0] == '#')
            continue;
        std::string nospace;
        for (char c : s)
            if (c != ' ')
                nospace += c;
        std::vector<std::string> s0;
        {
            size_t st = 0;
            while (true) {
                size_t p = nospace.find('=', st);
                s0.push_back(nospace.substr(st, p == std::string::npos ? std::string::npos : p - st));
                if (p == std::string::npos)
                    break;
                st = p + 1;
            }
        }
        std::string line = std::to_string(i + 1);
        if (s0.size() != 2) {
            if (ei != nullptr)
                ei->setError("error on line " + line);
            return;
        }
        if (s0[0].size() < inputs.size()) {
            if (ei != nullptr)
                ei->setError("must have >= " + std::to_string(inputs.size()) + " digits on left side (line " + line + ")");
            return;
        }
        if (s0[0].size() > inputs.size() + outputs.size()) {
            if (ei != nullptr)
                ei->setError("must have <= " + std::to_string(inputs.size() + outputs.size()) +
                             " digits on left side (line " + line + ")");
            return;
        }
        if (s0[1].size() != outputs.size()) {
            if (ei != nullptr)
                ei->setError("must have " + std::to_string(outputs.size()) + " digits on right side (line " + line + ")");
            return;
        }
        const std::string &rl = s0[0];
        bool used[26] = {};
        std::string newRl;
        for (char xc : rl) {
            if (xc == '?' || xc == '+' || xc == '-' || xc == '0' || xc == '1') {
                newRl += xc;
                continue;
            }
            if (xc < 'a' || xc > 'z') {
                if (ei != nullptr)
                    ei->setError("error on line " + line);
                return;
            }
            // if a letter appears twice, capitalize it the 2nd time so we can compare
            int idx = xc - 'a';
            if (used[idx]) {
                newRl += (char) (xc - 'a' + 'A');
                continue;
            }
            used[idx] = true;
            newRl += xc;
        }
        const std::string &rr = s0[1];
        if (rr.find('_') != std::string::npos)
            triState = true;
        rulesLeft.push_back(newRl);
        rulesRight.push_back(rr);
    }
}

void CustomLogicModel::dumpXml(XmlElement *root) {
    dumped = true;
    XmlElement *elem = root->createChild("clm");
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
    CircuitXMLSerializer::dumpAttr(elem, "f", flags);
    CircuitXMLSerializer::dumpAttr(elem, "in", arrayToList(inputs));
    CircuitXMLSerializer::dumpAttr(elem, "o", arrayToList(outputs));
    CircuitXMLSerializer::dumpAttr(elem, "if", infoText);
    elem->text = rules;
}

std::string CustomLogicModel::escape(const std::string &s) {
    if (s.empty())
        return "\\0";
    std::string out;
    for (char c : s) {
        switch (c) {
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case ' ': out += "\\s"; break;
        case '+': out += "\\p"; break;
        case '=': out += "\\q"; break;
        case '#': out += "\\h"; break;
        case '&': out += "\\a"; break;
        case '\r': out += "\\r"; break;
        default: out += c;
        }
    }
    return out;
}

std::string CustomLogicModel::unescape(const std::string &str) {
    if (str == "\\0")
        return "";
    std::string s = str;
    size_t i = 0;
    while (i < s.size()) {
        if (s[i] == '\\') {
            char c = i + 1 < s.size() ? s[i + 1] : '\0';
            const char *rep = nullptr;
            switch (c) {
            case 'n': rep = "\n"; break;
            case 'r': rep = "\r"; break;
            case 's': rep = " "; break;
            case 'p': rep = "+"; break;
            case 'q': rep = "="; break;
            case 'h': rep = "#"; break;
            case 'a': rep = "&"; break;
            }
            if (rep)
                s = s.substr(0, i) + rep + s.substr(i + 2);
            else
                s = s.substr(0, i) + s.substr(i + 1);
        }
        i++;
    }
    return s;
}

