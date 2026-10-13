#!/usr/bin/env bash
# Distribution build: clean GWT compile, output in ./site
set -euo pipefail

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
cd "$DIR"

# remove old output so stale permutations (*.cache.js) don't accumulate
echo "=== Cleaning site and GWT output ==="
rm -rf "$DIR/site" "$DIR/build/gwt"

echo "=== Compiling GWT ==="
$GRADLE compileGwt makeSite --console verbose

echo ""
echo "=== Distribution build in $DIR/site ==="
du -sh "$DIR/site"
