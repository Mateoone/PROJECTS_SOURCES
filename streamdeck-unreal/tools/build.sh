#!/usr/bin/env bash
# Builds both distributables into streamdeck-unreal/dist/ :
#   - dev.mip.unreal.streamDeckPlugin   (the plugin, ws bundled)
#   - UnrealBridge.streamDeckProfile    (the 5-button profile)
#
# Usage:  ./tools/build.sh [deviceModel]   (deviceModel forwarded to make_profile.js)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT/streamdeck-plugin"
SDPLUGIN="dev.mip.unreal.sdPlugin"
DIST="$ROOT/dist"
mkdir -p "$DIST"

echo "==> Ensuring plugin dependencies (ws) are installed next to plugin.js"
( cd "$PLUGIN_DIR/$SDPLUGIN" && npm install --silent )

echo "==> Packaging .streamDeckPlugin"
rm -f "$DIST/dev.mip.unreal.streamDeckPlugin"
( cd "$PLUGIN_DIR" && zip -rqX "$DIST/dev.mip.unreal.streamDeckPlugin" "$SDPLUGIN" -x "*/.DS_Store" )

echo "==> Generating .streamDeckProfile"
node "$ROOT/tools/make_profile.js" "${1:-20GBA9901}"

echo "==> Done:"
ls -lh "$DIST"
