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

#include "ModelRegistry.h"

class CircuitXMLDeserializer;
class XmlElement;

// position of one pin in a pin layout
struct PinLayoutPin {
    std::string name;
    int side = 0;
    int pos = 0;
};

// A pin layout ("part") for a built-in chip: the chip's size and where each of its pins goes,
// e.g. "74HC193" or "62256 SRAM DIP-28".  A chip that references one keeps its own settings and
// drawing; only the geometry comes from the model.  The layout only applies to chips of the
// same element type with the same pins (same names, in the same order), which is decided by
// the chip's settings (bit count etc.), so those settings are locked while a layout is attached.
// (Models are never freed: chips may still use one that's been removed from the registry.)
class PinLayoutModel : public RegistryModel {
public:
    static ModelRegistry<PinLayoutModel> &registry();

    // XML dump type of the element this layout is for (CircuitElm.getXmlDumpType())
    std::string elmType;
    int sizeX = 2;
    int sizeY = 2;
    // in the same order as the chip's pins
    std::vector<PinLayoutPin> pins;

    // pin names of the chips this layout applies to
    std::vector<std::string> pinNames() const;
    void copyLayout(int sx, int sy, const std::vector<PinLayoutPin> &p);
    void dumpXml(XmlElement *root);
    static PinLayoutModel *undumpModelXml(CircuitXMLDeserializer &xml);
    void undumpXml(CircuitXMLDeserializer &xml);
};
