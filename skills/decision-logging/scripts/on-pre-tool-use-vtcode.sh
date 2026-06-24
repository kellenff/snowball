#!/usr/bin/env bash
# PreToolUse hook for VTCode's apply_patch: classifies risk via the
# apply-patch-blast-radius bridge; exits 0 (allow) for low-risk, 0 with
# additionalContext warning for medium-risk, 2 (block) for high-risk.
set -uo pipefail

# Honor opt-out
if [ "${SNOWBALL_BLAST_RADIUS:-on}" = "off" ]; then
  exit 0
fi

# No-op outside a git repo
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/apply-patch-blast-radius.cjs"

# Read patch from stdin; bridge prints "RISK=<...>\nREASONS=<csv>".
VERDICT="$(node "$BRIDGE")"

RISK="$(printf '%s' "$VERDICT" | sed -n 's/^RISK=//p' | head -1)"
REASONS="$(printf '%s' "$VERDICT" | sed -n 's/^REASONS=//p' | head -1)"

case "$RISK" in
  low)
    exit 0
    ;;
  medium)
    # Inject warning to stderr; allow the patch.
    echo "blast-radius: medium-risk patch — review before committing: $REASONS" >&2
    exit 0
    ;;
  high)
    echo "blast-radius: HIGH-risk patch blocked: $REASONS" >&2
    echo "Set SNOWBALL_BLAST_RADIUS=off to disable." >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
