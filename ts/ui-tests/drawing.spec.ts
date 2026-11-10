import { test, expect } from "./fixtures";

// screenshots of the canvas: run with --update-snapshots once to make the reference images
test.describe("drawing", () => {
    test.use({ circuit: "$ 1 5.0E-6 10 50 5.0\nr 256 176 256 304 0 100.0\nc 352 176 352 304 0 1e-5 0\nw 256 304 352 304 1\n" });

    test("resistor and capacitor", async ({ sim }) => {
        await expect(sim.canvas).toHaveScreenshot("rc.png");
    });
});
