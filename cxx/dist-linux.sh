#!/bin/bash
# Builds the app and packages it as an AppImage for distribution:
#   $BUILD_DIR/CircuitJS1-x86_64-<date>-<commit>.AppImage
# One file holding the app, its resources and the Qt libraries and plugins it needs
# (deployed by linuxdeploy-plugin-qt), so it runs on other distros with nothing to install.
# It needs glibc at least as new as the one it was built with, so build on the oldest
# distro you want to support (Qt 6.8 itself needs glibc 2.28).
set -euo pipefail

cd "$(dirname "$0")"
BUILD_DIR="${BUILD_DIR:-$HOME/build/circuitjs1}"
QTDIR="${QTDIR:-$HOME/Qt/6.8.3/gcc_64}"
TOOLS="${XDG_CACHE_HOME:-$HOME/.cache}/circuitjs1-dist"

cmake -S . -B "$BUILD_DIR" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$QTDIR"
cmake --build "$BUILD_DIR" --target CircuitJS1

# linuxdeploy and its Qt plugin (the Linux counterpart of windeployqt), fetched once
mkdir -p "$TOOLS"
for tool in linuxdeploy/linuxdeploy-x86_64.AppImage linuxdeploy-plugin-qt/linuxdeploy-plugin-qt-x86_64.AppImage; do
    file="$TOOLS/$(basename "$tool")"
    if [ ! -x "$file" ]; then
        curl -fL -o "$file" "https://github.com/linuxdeploy/${tool%%/*}/releases/download/continuous/$(basename "$tool")"
        chmod +x "$file"
    fi
done

# stage into a clean AppDir, so nothing left over from the build (tools, objects) goes in
APPDIR="$BUILD_DIR/dist/AppDir"
rm -rf "$BUILD_DIR/dist"
mkdir -p "$APPDIR/usr/bin"
cp "$BUILD_DIR/CircuitJS1" "$APPDIR/usr/bin/"
# the app looks for resources next to its executable
cp -r "$BUILD_DIR/resources" "$APPDIR/usr/bin/"

# (safe.directory: on a mounted share the repo belongs to another user)
NAME="CircuitJS1-x86_64-$(date +%Y%m%d)-$(git -c safe.directory="*" rev-parse --short HEAD)"
# the plugin finds Qt through qmake; extract-and-run because WSL and containers often lack FUSE
export QMAKE="$QTDIR/bin/qmake"
export LD_LIBRARY_PATH="$QTDIR/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export APPIMAGE_EXTRACT_AND_RUN=1
export OUTPUT="$BUILD_DIR/$NAME.AppImage"
"$TOOLS/linuxdeploy-x86_64.AppImage" --appdir "$APPDIR" \
    --executable "$APPDIR/usr/bin/CircuitJS1" \
    --desktop-file src/app/CircuitJS1.desktop \
    --icon-file src/app/CircuitJS1.png \
    --plugin qt --output appimage
echo "$OUTPUT"
