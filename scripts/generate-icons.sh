#!/bin/bash
# Generate app icons from icon/rampart-icon.png (must be 512x512 square PNG)
# Output: icon/icon.icns (macOS), icon/icon.png (Linux), icon/icon.ico (Windows)
# Requires: macOS with sips and iconutil (both built-in)
# For multi-size Windows .ico: brew install imagemagick
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
SRC="$ROOT/icon/rampart-icon.png"
OUT_DIR="$ROOT/icon"
ICONSET="$ROOT/icon/rampart.iconset"

if [ ! -f "$SRC" ]; then
  echo "Error: $SRC not found"
  exit 1
fi

echo "Generating icons from: $SRC"

# ── Step 1: build macOS .icns ─────────────────────────────────────────────
mkdir -p "$ICONSET"

sips -z 16  16  "$SRC" --out "$ICONSET/icon_16x16.png"    > /dev/null
sips -z 32  32  "$SRC" --out "$ICONSET/icon_16x16@2x.png" > /dev/null
sips -z 32  32  "$SRC" --out "$ICONSET/icon_32x32.png"    > /dev/null
sips -z 64  64  "$SRC" --out "$ICONSET/icon_32x32@2x.png" > /dev/null
sips -z 128 128 "$SRC" --out "$ICONSET/icon_128x128.png"  > /dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_128x128@2x.png" > /dev/null
sips -z 256 256 "$SRC" --out "$ICONSET/icon_256x256.png"  > /dev/null
sips -z 512 512 "$SRC" --out "$ICONSET/icon_256x256@2x.png" > /dev/null
cp "$SRC"                    "$ICONSET/icon_512x512.png"

iconutil -c icns "$ICONSET" -o "$OUT_DIR/icon.icns"
echo "✓ Created icon/icon.icns"

# ── Step 2: 256x256 PNG for Linux ─────────────────────────────────────────
sips -z 256 256 "$SRC" --out "$OUT_DIR/icon.png" > /dev/null
echo "✓ Created icon/icon.png"

# ── Step 3: Windows .ico ──────────────────────────────────────────────────
if command -v magick &> /dev/null; then
    magick "$SRC" -define icon:auto-resize=256,128,64,48,32,16 "$OUT_DIR/icon.ico"
    echo "✓ Created icon/icon.ico (ImageMagick)"
elif command -v convert &> /dev/null && convert --version 2>&1 | grep -q ImageMagick; then
    convert "$SRC" -define icon:auto-resize=256,128,64,48,32,16 "$OUT_DIR/icon.ico"
    echo "✓ Created icon/icon.ico (ImageMagick convert)"
else
    sips -z 256 256 "$SRC" --out "$OUT_DIR/icon.ico" > /dev/null
    echo "⚠ Created icon/icon.ico (single-size fallback — brew install imagemagick for multi-size)"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────
rm -rf "$ICONSET"

echo ""
ls -lh "$OUT_DIR"/icon.*
