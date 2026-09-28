#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-8000}
DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"
./dist-offline.sh

cd offline
rm -rf mac-arm-dmg/CircuitJS1.app/Contents/Resources/app/war
rm -f CircuitJS1-macarm.dmg
VERSION=`sed -n '/versionString/s/^.*"\(.*\)";.*/\1/p' ../ts/CirSim.ts | awk '{ print $1 }'`
sed 's/$VERSION/'$VERSION/ Info.plist > mac-arm-dmg/CircuitJS1.app/Contents/Info.plist
cp -r ../site mac-arm-dmg/CircuitJS1.app/Contents/Resources/app/war
cp ../app/* mac-arm-dmg/CircuitJS1.app/Contents/Resources/app
xattr -cr mac-arm-dmg/CircuitJS1.app
