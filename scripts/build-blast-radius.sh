#!/usr/bin/env bash
# Build blast-radius TypeScript source into a bundled .cjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/blast-radius/src"
OUT_DIR="$SCRIPT_DIR/skills/blast-radius/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building blast-radius" >&2
  exit 1
fi

tmp="$(mktemp)"
bun build "$SRC_DIR/compute.ts" --target=node --format=cjs --outfile="$tmp"
dest="$OUT_DIR/compute.cjs"
mkdir -p "$OUT_DIR"
if ! diff -q "$tmp" "$dest" >/dev/null 2>&1; then
  mv "$tmp" "$dest"
else
  rm "$tmp"
fi

echo "built compute.cjs into $OUT_DIR/"
