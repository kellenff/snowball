#!/usr/bin/env bash
# Stop / operator-approval hook: appends blast_radius_envelope to observations.jsonl.
set -uo pipefail

git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

TRIGGER="${1:-}"
if [ "$TRIGGER" != "stop" ] && [ "$TRIGGER" != "operator-approval" ]; then
  exit 0
fi

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$HOOK_DIR/blast-radius-audit.cjs"

node "$BRIDGE" "$TRIGGER" || true
exit 0
