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


cd offline
rm -rf mac-arm-dmg/CircuitJS1.app/Contents/Resources/app/war
rm -f CircuitJS1-macarm.dmg
VERSION=`sed -n '/versionString/s/^.*"\(.*\)";.*/\1/p' ../src/com/lushprojects/circuitjs1/client/circuitjs1.java | awk '{ print $1 }'`
sed 's/$VERSION/'$VERSION/ Info.plist > mac-arm-dmg/CircuitJS1.app/Contents/Info.plist
cp -r ../site mac-arm-dmg/CircuitJS1.app/Contents/Resources/app/war
cp ../app/* mac-arm-dmg/CircuitJS1.app/Contents/Resources/app
xattr -cr mac-arm-dmg/CircuitJS1.app
