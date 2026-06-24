#!/usr/bin/env bash
# Integration test: feed a sample apply_patch payload through the shell wrapper
# and assert an observation lands in observations.jsonl.
set -euo pipefail

REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
git init -q "$REPO"

PAYLOAD='{"tool_input":{"patch":"diff --git a/x b/x\n@@ -0,0 +1 @@\n+y\n"},"session_id":"t1","tool_use_id":"u1"}'

WRAPPER="$(cd "$(dirname "$0")/../.." && pwd)/skills/decision-logging/scripts/on-apply-patch-vtcode.sh"
(cd "$REPO" && printf '%s' "$PAYLOAD" | bash "$WRAPPER")

OBS_FILE="$REPO/docs/snowball/decisions/observations.jsonl"
if [ ! -s "$OBS_FILE" ]; then
  echo "FAIL: observations.jsonl missing or empty at $OBS_FILE" >&2
  exit 1
fi

grep -q '"related_files":\["x"\]' "$OBS_FILE" || {
  echo "FAIL: expected related_files:[x] in $OBS_FILE" >&2
  cat "$OBS_FILE" >&2
  exit 1
}

echo "PASS: on-apply-patch-vtcode.sh wrote observation for path 'x'"
