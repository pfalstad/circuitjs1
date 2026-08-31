// TypeScript equivalent of chip_desc.h's ChipDesc struct and the CHIP_DESC/CHIP_START/... macros.
// Ported verbatim from dice-ts/src/chip_desc.ts.
//
// A real chip catalog entry (chips/7400.cpp etc.) built a C array of ChipDesc via chained
// "macro calls" like:
//   CHIP_START(7400A) INPUT_PINS(1,2) OUTPUT_PIN(3) OUTPUT_DELAY_NS(11.0, 7.0)
// Here that becomes:
//   chipStart(logic_7400A).inputPins(1, 2).outputPin(3).outputDelayNs(11.0, 7.0)
//
// There is no sentinel end-of-array entry (CHIP_DESC_END) -- plain JS arrays already know
// their own length.

import type { Chip } from "./chip";

// Internal pin numbers i1..i24 (InternalPin enum in chip_desc.h). These share the pin number
// space with external pins 1..24, but are used for connections between the "logic function"
// portion of a multi-entry chip description and the LUT/custom-chip machinery.
export const i1 = 25, i2 = 26, i3 = 27, i4 = 28, i5 = 29, i6 = 30, i7 = 31, i8 = 32,
    i9 = 33, i10 = 34, i11 = 35, i12 = 36, i13 = 37, i14 = 38, i15 = 39, i16 = 40,
    i17 = 41, i18 = 42, i19 = 43, i20 = 44, i21 = 45, i22 = 46, i23 = 47, i24 = 48;

export const MAX_PINS = 48;

// pin/prevPin/eventPin arrays are indexed 1..MAX_PINS (index 0 unused, mirrors the C++ arrays).
export type ChipLogic = (pin: Int32Array, prevPin: Int32Array, eventPin: Int32Array, customData: unknown) => void;
export type CustomLogic = (chip: Chip, mask: number) => void;

// Field names deliberately differ from the fluent builder method names below them
// (e.g. `outPin` the field vs. `.outputPin(...)` the method) since a class can't have
// a property and a method share a name.
export interface ChipDesc {
    logic: ChipLogic | null;
    custom: CustomLogic | null;
    delay: [number, number]; // seconds [tp_lh, tp_hl]
    inPins: number[];
    evPins: number[];
    outPin: number;
    prevOutPin: number;
}

export class ChipDescBuilder implements ChipDesc {
    logic: ChipLogic | null;
    custom: CustomLogic | null;
    delay: [number, number] = [0.0, 0.0];
    inPins: number[] = [];
    evPins: number[] = [];
    outPin = 0;
    prevOutPin = 0;

    constructor(logic: ChipLogic | null, custom: CustomLogic | null) {
        this.logic = logic;
        this.custom = custom;
    }

    inputPins(...pins: number[]): this { this.inPins = pins; return this; }
    eventPins(...pins: number[]): this { this.evPins = pins; return this; }
    outputPin(pin: number): this { this.outPin = pin; return this; }
    prevOutputPin(pin: number): this { this.prevOutPin = pin; return this; }
    outputDelayS(lh: number, hl: number): this { this.delay = [lh, hl]; return this; }
    outputDelayMs(lh: number, hl: number): this { return this.outputDelayS(lh * 1e-3, hl * 1e-3); }
    outputDelayUs(lh: number, hl: number): this { return this.outputDelayS(lh * 1e-6, hl * 1e-6); }
    outputDelayNs(lh: number, hl: number): this { return this.outputDelayS(lh * 1e-9, hl * 1e-9); }
    outputDelayPs(lh: number, hl: number): this { return this.outputDelayS(lh * 1e-12, hl * 1e-12); }
}

export function chipStart(logic: ChipLogic): ChipDescBuilder {
    return new ChipDescBuilder(logic, null);
}

export function customChipStart(custom: CustomLogic): ChipDescBuilder {
    return new ChipDescBuilder(null, custom);
}

export function POS_EDGE_PIN(pin: Int32Array, eventPin: Int32Array, p: number): boolean {
    return pin[p] !== 0 && eventPin[p] !== 0;
}
export function NEG_EDGE_PIN(pin: Int32Array, eventPin: Int32Array, p: number): boolean {
    return pin[p] === 0 && eventPin[p] !== 0;
}

// double(val) style unit helpers (OHM/K_OHM/etc. in circuit_desc.h)
export const OHM = (v: number) => v;
export const K_OHM = (v: number) => v * 1e3;
export const M_OHM = (v: number) => v * 1e6;
export const M_FARAD = (v: number) => v * 1e-3;
export const U_FARAD = (v: number) => v * 1e-6;
export const N_FARAD = (v: number) => v * 1e-9;
export const P_FARAD = (v: number) => v * 1e-12;
export const DELAY_MS = (v: number) => v * 1e-3;
export const DELAY_US = (v: number) => v * 1e-6;
export const DELAY_NS = (v: number) => v * 1e-9;
export const DELAY_PS = (v: number) => v * 1e-12;
