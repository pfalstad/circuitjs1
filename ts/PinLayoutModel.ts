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

import { CircuitXMLSerializer } from "./CircuitXMLSerializer";
import { CircuitXMLDeserializer } from "./CircuitXMLDeserializer";
import { ModelRegistry } from "./ModelRegistry";

// position of one pin in a pin layout
export interface PinLayoutPin {
    name: string;
    side: number;
    pos: number;
}

// A pin layout ("part") for a built-in chip: the chip's size and where each of its pins goes,
// e.g. "74HC193" or "62256 SRAM DIP-28".  A chip that references one keeps its own settings and
// drawing; only the geometry comes from the model.  The layout only applies to chips of the
// same element type with the same pins (same names, in the same order), which is decided by
// the chip's settings (bit count etc.), so those settings are locked while a layout is attached.
export class PinLayoutModel {
    static readonly registry = new ModelRegistry<PinLayoutModel>(
        null, "pinlayout:", (m, doc) => m.dumpXml(doc));

    name: string = "";
    dumped: boolean = false;
    // XML dump type of the element this layout is for (CircuitElm.getXmlDumpType())
    elmType: string = "";
    sizeX: number = 2;
    sizeY: number = 2;
    // in the same order as the chip's pins
    pins: PinLayoutPin[] = [];

    // pin names of the chips this layout applies to
    pinNames(): string[] {
        return this.pins.map(p => p.name);
    }

    copyLayout(src: { sizeX: number; sizeY: number; pins: PinLayoutPin[] }): void {
        this.sizeX = src.sizeX;
        this.sizeY = src.sizeY;
        this.pins = src.pins.map(p => ({ name: p.name, side: p.side, pos: p.pos }));
    }

    dumpXml(doc: Document): void {
        this.dumped = true;
        const elem = doc.createElement("plm");
        CircuitXMLSerializer.dumpAttr(elem, "nm", this.name);
        CircuitXMLSerializer.dumpAttr(elem, "et", this.elmType);
        CircuitXMLSerializer.dumpAttr(elem, "sx", this.sizeX);
        CircuitXMLSerializer.dumpAttr(elem, "sy", this.sizeY);
        for (const p of this.pins) {
            const pe = doc.createElement("p");
            CircuitXMLSerializer.dumpAttr(pe, "nm", p.name);
            CircuitXMLSerializer.dumpAttr(pe, "sd", p.side);
            CircuitXMLSerializer.dumpAttr(pe, "ps", p.pos);
            elem.appendChild(pe);
        }
        doc.documentElement.appendChild(elem);
    }

    static undumpModelXml(xml: CircuitXMLDeserializer): PinLayoutModel {
        const name = xml.parseStringAttr("nm", null);
        const m = PinLayoutModel.registry.getForLoad(name!, () => new PinLayoutModel());
        m.undumpXml(xml);
        return m;
    }

    undumpXml(xml: CircuitXMLDeserializer): void {
        this.elmType = xml.parseStringAttr("et", this.elmType)!;
        this.sizeX   = xml.parseIntAttr("sx", this.sizeX);
        this.sizeY   = xml.parseIntAttr("sy", this.sizeY);
        const elem = xml.currentXmlElement;
        this.pins = [];
        for (const child of xml.getChildElements()) {
            if (child.tagName !== "p")
                continue;
            xml.parseChildElement(child);
            this.pins.push({
                name: xml.parseStringAttr("nm", "")!,
                side: xml.parseIntAttr("sd", 0),
                pos:  xml.parseIntAttr("ps", 0),
            });
        }
        xml.currentXmlElement = elem;
    }
}
