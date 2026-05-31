#!/usr/bin/env bash
# Build syncing-decisions-to-memory TypeScript source into a bundled .cjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/syncing-decisions-to-memory/src"
OUT_DIR="$SCRIPT_DIR/skills/syncing-decisions-to-memory/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building syncing-decisions-to-memory" >&2
  echo "install: https://bun.sh" >&2
  exit 1
fi

ENTRIES=(
  sync-decisions
)

for entry in "${ENTRIES[@]}"; do
  tmp="$(mktemp)"
  bun build "$SRC_DIR/$entry.ts" \
    --target=node \
    --format=cjs \
    --outfile="$tmp"
  dest="$OUT_DIR/$entry.cjs"
  if ! diff -q "$tmp" "$dest" >/dev/null 2>&1; then
    mv "$tmp" "$dest"
  else
    rm "$tmp"
  fi
done

echo "built ${#ENTRIES[@]} bundle(s) into $OUT_DIR/"
