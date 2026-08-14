import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    port: 5173,
    open: true
  },
  test: {
    // Several digital-optimization regression tests run real circuits out
    // to millions of ticks (comparing against an always-correct baseline)
    // and legitimately take longer than vitest's 5000ms default.
    testTimeout: 60000
  }
})
