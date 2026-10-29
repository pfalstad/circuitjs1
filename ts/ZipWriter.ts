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

// Builds an uncompressed (stored) zip archive, for downloading several files as one.

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array): number {
    if (crcTable === null) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++)
                c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++)
        crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

export function makeZip(files: { name: string; text: string }[]): Uint8Array {
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const f of files) {
        const name = enc.encode(f.name);
        const data = enc.encode(f.text);
        const crc = crc32(data);

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);          // version needed
        lv.setUint16(6, 0x0800, true);      // utf-8 names
        lv.setUint16(8, 0, true);           // stored
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, name.length, true);
        local.set(name, 30);

        const dir = new Uint8Array(46 + name.length);
        const dv = new DataView(dir.buffer);
        dv.setUint32(0, 0x02014b50, true);
        dv.setUint16(4, 20, true);          // version made by
        dv.setUint16(6, 20, true);
        dv.setUint16(8, 0x0800, true);
        dv.setUint16(10, 0, true);
        dv.setUint32(16, crc, true);
        dv.setUint32(20, data.length, true);
        dv.setUint32(24, data.length, true);
        dv.setUint16(28, name.length, true);
        dv.setUint32(42, offset, true);
        dir.set(name, 46);

        parts.push(local, data);
        central.push(dir);
        offset += local.length + data.length;
    }
    const dirSize = central.reduce((a, d) => a + d.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, dirSize, true);
    ev.setUint32(16, offset, true);

    const out = new Uint8Array(offset + dirSize + end.length);
    let pos = 0;
    for (const p of [...parts, ...central, end]) {
        out.set(p, pos);
        pos += p.length;
    }
    return out;
}
