#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-8000}
DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"
./dist-offline.sh

echo ""
echo "=== Starting server on http://localhost:$PORT/circuitjs.html ==="
cd "$DIR/site"
open "http://localhost:$PORT/circuitjs.html" 2>/dev/null \
  || xdg-open "http://localhost:$PORT/circuitjs.html" 2>/dev/null \
  || echo "Open http://localhost:$PORT/circuitjs.html in your browser"
python3 -m http.server "$PORT"
