#!/usr/bin/env bash
# SessionStart hook: idempotently registers the nightly MADR digest cron
# via VTCode's cron_create tool. Safe to run on every session start.
set -uo pipefail

# Allow operators to disable the bootstrap without removing the wiring.
if [ "${SNOWBALL_CRON:-on}" = "off" ]; then
  exit 0
fi

GIT_ROOT="${GIT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "$GIT_ROOT" ] || exit 0

SNOWBALL_ROOT="${SNOWBALL_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
TEMPLATE="$GIT_ROOT/.vtcode/cron-madr-digest.json"
[ -f "$TEMPLATE" ] || TEMPLATE="$SNOWBALL_ROOT/scripts/cron-madr-digest.json"

[ -f "$TEMPLATE" ] || exit 0

# Detect whether the cron is already registered by listing. We don't shell
# out to the agent — we read a small sidecar state file the bridge writes.
STATE="$GIT_ROOT/.vtcode/.snowball-cron-state.json"

if [ -f "$STATE" ] && grep -q '"snowball-madr-digest-refresh"' "$STATE" 2>/dev/null; then
  # Already registered; nothing to do.
  exit 0
fi

# Otherwise, request registration by writing a marker file the next agent
# turn can read and act on (cron_create is itself an agent tool, not a
# shell-callable binary). The agent on next turn sees the marker and
# issues the cron_create call.
mkdir -p "$(dirname "$STATE")"
echo "{\"requested\":\"snowball-madr-digest-refresh\",\"template\":\"$TEMPLATE\"}" >"$STATE"
