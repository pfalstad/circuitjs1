import { describe, it, expect } from "vitest";
import { Color } from "./Color";

describe("Color", () => {
    it("constructs from rgb", () => {
        expect(Color.red.getRed()).toBe(255);
        expect(Color.red.getGreen()).toBe(0);
        expect(Color.red.getBlue()).toBe(0);
    });

    it("constructs from hex string", () => {
        const c = new Color("#ff8000");
        expect(c.getRed()).toBe(255);
        expect(c.getGreen()).toBe(128);
        expect(c.getBlue()).toBe(0);
    });

    it("getHexValue round-trips", () => {
        expect(Color.blue.getHexValue()).toBe("#0000ff");
        expect(Color.white.getHexValue()).toBe("#ffffff");
        expect(Color.black.getHexValue()).toBe("#000000");
    });

    it("mixes two colors", () => {
        const mid = new Color(Color.black, Color.white, 0.5);
        expect(mid.getRed()).toBe(127);
        expect(mid.getGreen()).toBe(127);
        expect(mid.getBlue()).toBe(127);
    });

    it("NONE returns empty string", () => {
        expect(Color.NONE.getHexValue()).toBe("");
        expect(Color.NONE.toString()).toBe("");
    });

    it("toString for rgb color", () => {
        expect(Color.red.toString()).toBe("red=255, green=0, blue=0");
    });
});
