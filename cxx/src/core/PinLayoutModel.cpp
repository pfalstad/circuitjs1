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

#include "PinLayoutModel.h"

#include "CircuitXMLDeserializer.h"
#include "CircuitXMLSerializer.h"
#include "XmlDoc.h"

ModelRegistry<PinLayoutModel> &PinLayoutModel::registry() {
    static ModelRegistry<PinLayoutModel> r(nullptr, "pinlayout:",
                                           [](PinLayoutModel *m, XmlElement *root) { m->dumpXml(root); });
    return r;
}

std::vector<std::string> PinLayoutModel::pinNames() const {
    std::vector<std::string> names;
    for (const PinLayoutPin &p : pins)
        names.push_back(p.name);
    return names;
}

void PinLayoutModel::copyLayout(int sx, int sy, const std::vector<PinLayoutPin> &p) {
    sizeX = sx;
    sizeY = sy;
    pins = p;
}

void PinLayoutModel::dumpXml(XmlElement *root) {
    dumped = true;
    XmlElement *elem = root->createChild("plm");
    CircuitXMLSerializer::dumpAttr(elem, "nm", name);
    CircuitXMLSerializer::dumpAttr(elem, "et", elmType);
    CircuitXMLSerializer::dumpAttr(elem, "sx", sizeX);
    CircuitXMLSerializer::dumpAttr(elem, "sy", sizeY);
    for (const PinLayoutPin &p : pins) {
        XmlElement *pe = elem->createChild("p");
        CircuitXMLSerializer::dumpAttr(pe, "nm", p.name);
        CircuitXMLSerializer::dumpAttr(pe, "sd", p.side);
        CircuitXMLSerializer::dumpAttr(pe, "ps", p.pos);
    }
}

PinLayoutModel *PinLayoutModel::undumpModelXml(CircuitXMLDeserializer &xml) {
    std::string name = xml.parseStringAttr("nm", std::nullopt).value_or("");
    PinLayoutModel *m = registry().getForLoad(name, [] { return new PinLayoutModel(); });
    m->undumpXml(xml);
    return m;
}

void PinLayoutModel::undumpXml(CircuitXMLDeserializer &xml) {
    elmType = xml.parseStringAttr("et", elmType).value_or("");
    sizeX = xml.parseIntAttr("sx", sizeX);
    sizeY = xml.parseIntAttr("sy", sizeY);
    const XmlElement *elem = xml.currentXmlElement;
    pins.clear();
    for (const XmlElement *child : xml.getChildElements()) {
        if (child->tagName != "p")
            continue;
        xml.parseChildElement(child);
        PinLayoutPin p;
        p.name = xml.parseStringAttr("nm", std::string()).value_or("");
        p.side = xml.parseIntAttr("sd", 0);
        p.pos = xml.parseIntAttr("ps", 0);
        pins.push_back(p);
    }
    xml.currentXmlElement = elem;
}
