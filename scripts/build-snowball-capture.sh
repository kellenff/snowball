#!/usr/bin/env bash
# Build the snowball-capture MCP server from TypeScript into a single CJS bundle.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$SCRIPT_DIR/extensions/snowball/snowball-capture/src/server.ts"
OUT="$SCRIPT_DIR/extensions/snowball/snowball-capture/dist/server.cjs"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building snowball-capture" >&2
  echo "install: https://bun.sh" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
tmp="$(mktemp)"
bun build "$SRC" \
  --target=node \
  --format=cjs \
  --outfile="$tmp"

if ! diff -q "$tmp" "$OUT" >/dev/null 2>&1; then
  mv "$tmp" "$OUT"
else
  rm "$tmp"
fi

echo "built snowball-capture bundle into $OUT"
