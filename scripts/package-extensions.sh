#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/dist/extensions}"
RAW_VERSION="${EXT_VERSION:-$(cd "$ROOT_DIR" && node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")}"
VERSION="${RAW_VERSION#v}"
CHROME_ZIP="$DIST_DIR/clepsydre-extension-chrome-v${VERSION}.zip"
FIREFOX_ZIP="$DIST_DIR/clepsydre-extension-firefox-v${VERSION}.zip"

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR"/clepsydre-extension-chrome-v*.zip
rm -f "$DIST_DIR"/clepsydre-extension-firefox-v*.zip
rm -f "$DIST_DIR"/clepsydre-extension-chrome.zip
rm -f "$DIST_DIR"/clepsydre-extension-firefox.zip

if [ ! -f "$ROOT_DIR/extension/manifest.json" ]; then
  echo "Missing Chrome extension manifest at extension/manifest.json"
  exit 1
fi

if [ ! -f "$ROOT_DIR/extension-firefox/manifest.json" ]; then
  echo "Missing Firefox extension manifest at extension-firefox/manifest.json"
  exit 1
fi

(
  cd "$ROOT_DIR/extension"
  zip -r "$CHROME_ZIP" . -x "*.DS_Store"
)

(
  cd "$ROOT_DIR/extension-firefox"
  zip -r "$FIREFOX_ZIP" . -x "*.DS_Store"
)

echo "Packaged extensions:"
echo " - $CHROME_ZIP"
echo " - $FIREFOX_ZIP"
