#!/usr/bin/env bash
set -euo pipefail

DIR="$(pwd)"

echo "=== Building TypeScript app ==="
( cd "$DIR/ts" && npm run build )

rm -rf site
mkdir site
cp -r "$DIR/ts/dist/." site

echo "=== Done: site/ (entry: site/circuitjs.html) ==="
