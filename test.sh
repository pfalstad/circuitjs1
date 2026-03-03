#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-8000}
DIR="$(cd "$(dirname "$0")" && pwd)"

# Find Gradle — prefer wrapper, then local install, then /tmp
if [ -x "$DIR/gradlew" ]; then
    GRADLE="$DIR/gradlew"
elif [ -x /tmp/gradle-8.7/bin/gradle ]; then
    GRADLE=/tmp/gradle-8.7/bin/gradle
elif command -v gradle &>/dev/null; then
    GRADLE=gradle
else
    echo "Gradle not found. Install it or download 8.7:"
    echo "  curl -sL https://services.gradle.org/distributions/gradle-8.7-bin.zip -o /tmp/g.zip && unzip -qo /tmp/g.zip -d /tmp"
    exit 1
fi

echo "=== Using: $GRADLE ==="

echo "=== Compiling GWT ==="
cd "$DIR"
$GRADLE compileGwt makeSite --console verbose

echo ""
echo "=== Starting server on http://localhost:$PORT/circuitjs.html ==="
cd "$DIR/site"
open "http://localhost:$PORT/circuitjs.html" 2>/dev/null \
  || xdg-open "http://localhost:$PORT/circuitjs.html" 2>/dev/null \
  || echo "Open http://localhost:$PORT/circuitjs.html in your browser"
python3 -m http.server "$PORT"
