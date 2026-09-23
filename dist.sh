#!/usr/bin/env bash
set -euo pipefail

num=$1
DIR="$(pwd)"

TESTMANAGER="$DIR/src/com/lushprojects/circuitjs1/client/TestManager.java"
EXPECTED_MD5=dd6e33051df814cf6b4a605293089db4
ACTUAL_MD5=$(md5 -q "$TESTMANAGER" 2>/dev/null || md5sum "$TESTMANAGER" | cut -d' ' -f1)
if [ "$ACTUAL_MD5" != "$EXPECTED_MD5" ]; then
    echo "ERROR: client/TestManager.java has unexpected md5 ($ACTUAL_MD5, expected $EXPECTED_MD5)"
    exit 1
fi

rm -rf site

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
$GRADLE clean compileGwt makeSite --console verbose

cp dist/* site
( cd site
  mv circuitjs1 circuitjs$num
  sh update-service-worker.sh circuitjs$num
)

echo I changed service worker to take control of all tabs immediately, test that
