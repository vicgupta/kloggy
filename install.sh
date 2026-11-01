#!/usr/bin/env bash
set -euo pipefail

REPO="vicgupta/kloggy"
API="https://api.github.com/repos/${REPO}/releases/latest"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) ASSET="kloggy" ;;
  Linux)
    case "$ARCH" in
      x86_64|amd64) ASSET="kloggy-linux-x64" ;;
      aarch64|arm64) ASSET="kloggy-linux-arm64" ;;
      *) echo "Unsupported arch: $ARCH"; exit 1 ;;
    esac ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

echo "Fetching latest release info..."
URL=$(curl -s -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "$API" | grep -o "https://github.com/${REPO}/releases/download/[^\"]*/${ASSET}" | head -1)
if [ -z "$URL" ]; then
  echo "Could not find asset $ASSET"; exit 1
fi

if [ -n "${INSTALL_DIR:-}" ]; then
  DEST="$INSTALL_DIR/kloggy"
elif [ -w "$HOME/.local/bin" ] 2>/dev/null || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  DEST="$HOME/.local/bin/kloggy"
else
  DEST="./kloggy"
fi
echo "Downloading $ASSET -> $DEST"
mkdir -p "$(dirname "$DEST")"
curl -L -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' -o "$DEST" "$URL"
chmod +x "$DEST"
echo "Installed Kloggy to $DEST"
echo "Run: kloggy --version"