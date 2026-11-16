#!/bin/bash
# Builds the app and packages it as a disk image for distribution:
#   $BUILD_DIR/CircuitJS1-mac-<date>-<commit>.dmg
# holding CircuitJS1.app (a universal arm64/x86_64 binary, with the Qt frameworks and plugins
# it needs deployed by macdeployqt, and the resources) and an Applications link to drag it to.
# Runs on macOS 13.3 and later (CMAKE_OSX_DEPLOYMENT_TARGET).
#
# Signed ad hoc unless SIGN_ID names a "Developer ID Application" identity; an ad hoc signed
# app downloaded from the web has to be opened with right-click > Open the first time.
# With SIGN_ID and NOTARY_PROFILE (a profile stored with `xcrun notarytool store-credentials`),
# the disk image is also notarized and stapled, so it opens without a warning.
set -euo pipefail

cd "$(dirname "$0")"
BUILD_DIR="${BUILD_DIR:-$HOME/build/circuitjs1}"
QTDIR="${QTDIR:-$HOME/Qt/6.8.3/macos}"
SIGN_ID="${SIGN_ID:--}"

cmake -S . -B "$BUILD_DIR" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$QTDIR" \
    -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64"
cmake --build "$BUILD_DIR" --target CircuitJS1

# stage into a clean folder, so deploying Qt doesn't touch the build's own app bundle
STAGE="$BUILD_DIR/dist/CircuitJS1"
rm -rf "$BUILD_DIR/dist"
mkdir -p "$STAGE"
ditto "$BUILD_DIR/CircuitJS1.app" "$STAGE/CircuitJS1.app"
ln -s /Applications "$STAGE/Applications"

# Qt frameworks and plugins.  macdeployqt's own signing doesn't cover everything it copies,
# so sign afterwards: nested code first (--deep), then the bundle.  Apple silicon won't run
# unsigned code, so even an unsigned build needs the ad hoc signature.
"$QTDIR/bin/macdeployqt" "$STAGE/CircuitJS1.app"
SIGN_OPTS=(--force --deep --sign "$SIGN_ID")
[ "$SIGN_ID" != "-" ] && SIGN_OPTS+=(--options runtime --timestamp)
codesign "${SIGN_OPTS[@]}" "$STAGE/CircuitJS1.app"
codesign --verify --deep --strict "$STAGE/CircuitJS1.app"

NAME="CircuitJS1-mac-$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
DMG="$BUILD_DIR/$NAME.dmg"
rm -f "$DMG"
hdiutil create -quiet -volname CircuitJS1 -srcfolder "$STAGE" -format UDZO -fs HFS+ "$DMG"

if [ "$SIGN_ID" != "-" ]; then
    codesign --sign "$SIGN_ID" --timestamp "$DMG"
    if [ -n "${NOTARY_PROFILE:-}" ]; then
        xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
        xcrun stapler staple "$DMG"
    fi
fi
echo "$DMG"
