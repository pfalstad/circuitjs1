import { defineConfig, type Plugin } from 'vitest/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}

// Serves the legacy war/ pages (index.html, e-*.html, and friends) during
// `npm run dev`, without copying them into ts/. Files that ts/ already has
// (circuitjs.html, about.html, etc.) are always served from ts/ instead —
// this only fills in the gaps. A bare "/" is treated as "/index.html", so
// the dev server's landing page is the same one used in production.
function serveWarDir(): Plugin {
  const tsRoot = path.dirname(fileURLToPath(import.meta.url))
  const warDir = path.resolve(tsRoot, '../war')
  return {
    name: 'serve-war-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.method !== 'GET') return next()
        let urlPath = decodeURIComponent(req.url.split('?')[0]!)
        if (urlPath === '/') urlPath = '/index.html'
        const filePath = path.join(warDir, urlPath)
        if (!filePath.startsWith(warDir)) return next()
        if (fs.existsSync(path.join(tsRoot, urlPath)) || fs.existsSync(path.join(tsRoot, 'public', urlPath))) return next()
        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) return next()
          res.setHeader('Content-Type', mimeTypes[path.extname(filePath)] ?? 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        })
      })
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [serveWarDir()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    rolldownOptions: {
      input: {
        circuitjs: 'circuitjs.html',
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
