#!/usr/bin/env bash
# Test: OpenCode decision-logging + blast-radius capture hooks
# Verifies chat.message / event:session.idle capture, dedup, and gitRoot from
# the plugin context (not cwd). Runs against the installed plugin layout so it
# also exercises the hooks/ copy added to setup.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Test: OpenCode capture hooks (decision-logging + blast-radius) ==="

# shellcheck disable=SC1091
source "$SCRIPT_DIR/setup.sh"
trap cleanup_test_env EXIT

# Keep extraction hermetic and fast (worker shells out to this instead of claude)
export SNOWBALL_CLAUDE_BIN=true

node "$SCRIPT_DIR/test-capture.mjs" "$SNOWBALL_PLUGIN_FILE"

echo ""
echo "=== All OpenCode capture tests passed ==="
