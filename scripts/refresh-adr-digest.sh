#!/usr/bin/env bash
# refresh-adr-digest.sh — regenerate the MADR digest consumed by
# recalling-project-context. Honors $GIT_ROOT when set, else falls back
# to git rev-parse. Safe to run repeatedly (idempotent).
set -euo pipefail

GIT_ROOT="${GIT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
if [ -z "$GIT_ROOT" ]; then
  echo "refresh-adr-digest: not in a git repo; skipping" >&2
  exit 0
fi

DECISIONS="$GIT_ROOT/docs/snowball/decisions"
DIGEST_DIR="$GIT_ROOT/.snowball"
DIGEST="$DIGEST_DIR/digest.txt"

mkdir -p "$DIGEST_DIR"

if [ ! -d "$DECISIONS" ]; then
  # No decisions yet — write an empty digest and exit.
  : >"$DIGEST"
  exit 0
fi

# Stable order by filename; extract title from each MADR's first H1.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
for f in "$DECISIONS"/*.md; do
  [ -f "$f" ] || continue
  title="$(awk '/^# / {sub(/^# /, ""); print; exit}' "$f" || true)"
  printf '%s\t%s\n' "$(basename "$f")" "${title:-untitled}" >>"$TMP"
done

# Atomic write: only replace if contents differ.
if ! cmp -s "$TMP" "$DIGEST"; then
  mv "$TMP" "$DIGEST"
else
  rm -f "$TMP"
fi

echo "refresh-adr-digest: $(wc -l < "$DIGEST") entries at $DIGEST" >&2
