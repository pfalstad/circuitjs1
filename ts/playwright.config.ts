// UI tests: drive the real app in Chrome with the mouse and keyboard (ui-tests/).
//
//   npm run test:ui                      run them all, headless
//   npm run test:ui -- --headed          watch them run
//   SLOWMO=300 npm run test:ui -- --headed --workers=1   ...slowly, one at a time
//   npm run test:ui -- --ui              Playwright's interactive runner
//   npm run test:ui -- -g "undo"         just the tests whose names match
//   npm run test:ui -- --update-snapshots   accept new screenshots
//
// The regression tests of the simulator itself are elsewhere (npm run test:app).

import { defineConfig } from "@playwright/test";

const port = 5199;

export default defineConfig({
    testDir: "ui-tests",
    fullyParallel: true,
    reporter: [["list"], ["html", { open: "never", outputFolder: "ui-tests/report" }]],
    outputDir: "ui-tests/results",
    use: {
        baseURL: `http://localhost:${port}/`,
        viewport: { width: 1400, height: 900 },
        channel: "chrome",
        trace: "retain-on-failure",
        // fail when something to click isn't there, rather than waiting for it until the test
        // times out (which can be many minutes, for the tests that build whole circuits)
        actionTimeout: 10_000,
        screenshot: "only-on-failure",
        // SLOWMO=300 waits 300ms before each mouse/keyboard action, to watch with --headed
        launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
    },
    expect: {
        // the canvas is drawn with antialiasing, so allow for small differences
        toHaveScreenshot: { maxDiffPixelRatio: 0.002 },
    },
    webServer: {
        command: `npx vite --port ${port} --strictPort --open false`,
        url: `http://localhost:${port}/circuitjs.html`,
        reuseExistingServer: true,
    },
});
