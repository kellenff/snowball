#!/usr/bin/env bash
# PostToolUse hook for VTCode's request_user_input: writes one MADR per
# question-answer pair, adapting VTCode's response shape into the format
# the existing ask-user-question-bridge expects.
set -uo pipefail

# No-op outside a git repo
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/vtcode-post-tool-use-bridge.cjs"

# Bridge always exits 0 (errors logged internally); pass stdin through unchanged
node "$BRIDGE" || true
exit 0
