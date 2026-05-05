#!/usr/bin/env bash
# bitbank CLI installer (Linux / macOS).
#
# Runs npm install (so tsx is available as a local devDependency) and
# `npm link` to put the `bitbank` command on PATH. After running this you
# can invoke `bitbank <cmd>` from any directory.
#
# Uninstall: npm unlink -g bitbank
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Checking Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "Error: 'node' not found in PATH. Install Node.js 20+ first." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >=20 required (engines.node). Found: $(node --version)" >&2
  exit 1
fi
echo "    $(node --version) ok."

echo "==> Installing dependencies (npm install)..."
npm install

echo "==> Linking 'bitbank' command globally (npm link)..."
npm link

echo "==> Verifying installation..."
if ! command -v bitbank >/dev/null 2>&1; then
  GLOBAL_BIN="$(npm bin -g 2>/dev/null || npm prefix -g 2>/dev/null)/bin"
  echo "Error: 'bitbank' is not on PATH after 'npm link'." >&2
  echo "Add the npm global bin directory to PATH and try again:" >&2
  echo "  $GLOBAL_BIN" >&2
  exit 1
fi
if ! bitbank --help >/dev/null 2>&1; then
  echo "Error: 'bitbank --help' failed. Run it directly to see the error:" >&2
  echo "  bitbank --help" >&2
  exit 1
fi

echo ""
echo "Installed. Try:"
echo "  bitbank ticker btc_jpy"
echo "  bitbank candles btc_jpy --type=1day --format=table"
echo ""
echo "Uninstall: npm unlink -g bitbank"
