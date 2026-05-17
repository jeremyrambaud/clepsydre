#!/bin/bash
set -euo pipefail

HOST_NAME="com.clepsydre.bridge"

case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
  *)
    echo "Unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

echo "Uninstalling Clepsydre Native Messaging Host..."

# Chrome
if [ "$OS" = "macos" ]; then
  CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
else
  CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi
if [ -f "$CHROME_DIR/$HOST_NAME.json" ]; then
  rm "$CHROME_DIR/$HOST_NAME.json"
  echo "  Removed Chrome manifest"
fi

# Firefox
if [ "$OS" = "macos" ]; then
  FIREFOX_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
else
  FIREFOX_DIR="$HOME/.mozilla/native-messaging-hosts"
fi
if [ -f "$FIREFOX_DIR/$HOST_NAME.json" ]; then
  rm "$FIREFOX_DIR/$HOST_NAME.json"
  echo "  Removed Firefox manifest"
fi

echo "Done!"
