import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true
  },
  build: {
    rolldownOptions: {
      input: {
        index: 'index.html',
        about: 'about.html',
        iframe: 'iframe.html',
        jsinterface: 'jsinterface.html',
      },
      output: {
        // Several element classes look up their own class name at runtime
        // (CircuitElm.getClassName() uses this.constructor.name) to resolve
        // types via ElementFactory. Minifying away class names breaks that.
        minify: {
          mangle: {
            keepNames: { class: true, function: true }
          }
        }
      }
    }
  },
  test: {
    // Several digital-optimization regression tests run real circuits out
    // to millions of ticks (comparing against an always-correct baseline)
    // and legitimately take longer than vitest's 5000ms default.
    testTimeout: 60000
  }
})
