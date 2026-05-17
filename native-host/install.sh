#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/clepsydre-bridge"
HOST_NAME="com.clepsydre.bridge"

# Detect OS
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
  *)
    echo "Unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

echo "Installing Clepsydre Native Messaging Host..."
echo "  Host script: $HOST_SCRIPT"

# --- Chrome ---
install_chrome() {
  local manifest
  manifest=$(cat "$SCRIPT_DIR/$HOST_NAME.chrome.json" | sed "s|__NATIVE_HOST_PATH__|$HOST_SCRIPT|g")

  local chrome_dir
  if [ "$OS" = "macos" ]; then
    chrome_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  else
    chrome_dir="$HOME/.config/google-chrome/NativeMessagingHosts"
  fi

  if [ -n "${1:-}" ]; then
    manifest=$(echo "$manifest" | sed "s|__EXTENSION_ID__|$1|g")
  fi

  mkdir -p "$chrome_dir"
  echo "$manifest" > "$chrome_dir/$HOST_NAME.json"
  echo "  Chrome manifest: $chrome_dir/$HOST_NAME.json"
}

# --- Firefox ---
install_firefox() {
  local manifest
  manifest=$(cat "$SCRIPT_DIR/$HOST_NAME.firefox.json" | sed "s|__NATIVE_HOST_PATH__|$HOST_SCRIPT|g")

  local firefox_dir
  if [ "$OS" = "macos" ]; then
    firefox_dir="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
  else
    firefox_dir="$HOME/.mozilla/native-messaging-hosts"
  fi

  mkdir -p "$firefox_dir"
  echo "$manifest" > "$firefox_dir/$HOST_NAME.json"
  echo "  Firefox manifest: $firefox_dir/$HOST_NAME.json"
}

CHROME_EXT_ID="${1:-__EXTENSION_ID__}"

install_chrome "$CHROME_EXT_ID"
install_firefox

echo ""
echo "Done! Native messaging host installed for Chrome and Firefox."
echo ""
if [ "$CHROME_EXT_ID" = "__EXTENSION_ID__" ]; then
  echo "NOTE: Replace __EXTENSION_ID__ in the Chrome manifest with your"
  echo "actual extension ID after loading the extension in chrome://extensions."
fi
