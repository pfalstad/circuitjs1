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

#include "ExtVoltageElm.h"

#include "../core/CircuitXMLDeserializer.h"
#include "../core/CircuitXMLSerializer.h"
#include "../core/CustomLogicModel.h"
#include "../core/Locale.h"
#include "../core/StringTokenizer.h"

ExtVoltageElm::ExtVoltageElm(int xa, int ya, int xb, int yb, int f, StringTokenizer &st)
    : RailElm(xa, ya, xb, yb, f, st) {
    name = CustomLogicModel::unescape(st.nextToken());
    waveform = WF_AC;
}

void ExtVoltageElm::dumpXml(XmlElement *doc, XmlElement *elem) {
    RailElm::dumpXml(doc, elem);
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
}

void ExtVoltageElm::undumpXml(CircuitXMLDeserializer &xml) {
    RailElm::undumpXml(xml);
    name = xml.parseStringAttr("nm", name).value_or(name);
}

std::optional<EditInfo> ExtVoltageElm::getEditInfo(int n) {
    if (n == 0) {
        EditInfo ei("Name", 0, -1, -1);
        ei.text = name;
        return ei;
    }
    return std::nullopt;
}

void ExtVoltageElm::setEditValue(int n, EditInfo &ei) {
    if (n == 0)
        name = ei.textf->value;
}

void ExtVoltageElm::getInfo(std::vector<std::string> &arr) {
    RailElm::getInfo(arr);
    arr[0] = Locale::LS("ext. voltage") + " (" + name + ")";
}
