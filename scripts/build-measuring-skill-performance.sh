#!/usr/bin/env bash
# Build measuring-skill-performance TypeScript source into a bundled .cjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/measuring-skill-performance/src"
OUT_DIR="$SCRIPT_DIR/skills/measuring-skill-performance/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building measuring-skill-performance" >&2
  exit 1
fi

ENTRIES=(
  "analyze:$OUT_DIR/skill-metrics.cjs"
)

for spec in "${ENTRIES[@]}"; do
  entry="${spec%%:*}"
  dest="${spec#*:}"
  tmp="$(mktemp)"
  bun build "$SRC_DIR/$entry.ts" --target=node --format=cjs --outfile="$tmp"
  mkdir -p "$(dirname "$dest")"
  if ! diff -q "$tmp" "$dest" >/dev/null 2>&1; then
    mv "$tmp" "$dest"
  else
    rm "$tmp"
  fi
done

echo "built ${#ENTRIES[@]} measuring-skill-performance bundles"
