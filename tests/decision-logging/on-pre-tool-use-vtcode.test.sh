#!/usr/bin/env bash
# Integration test: feed a high-risk apply_patch payload; assert exit 2 + stderr.
# Feed a safe payload; assert exit 0.
set -euo pipefail

REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
git init -q "$REPO"

WRAPPER="$(cd "$(dirname "$0")/../.." && pwd)/skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh"
HIGH='{"tool_input":{"patch":"diff --git a/package-lock.json b/package-lock.json\n@@ -1,1 +1,1 @@\n-old\n+new\n"}}'
SAFE='{"tool_input":{"patch":"diff --git a/foo.ts b/foo.ts\n@@ -0,0 +1 @@\n+x\n"}}'

set +e
OUT=$(cd "$REPO" && printf '%s' "$HIGH" | bash "$WRAPPER" 2>&1)
HIGH_RC=$?
set -e
if [ "$HIGH_RC" -ne 2 ]; then
  echo "FAIL: high-risk patch should exit 2 (got $HIGH_RC)" >&2
  echo "$OUT" >&2
  exit 1
fi
echo "$OUT" | grep -qi "lockfile" || {
  echo "FAIL: expected lockfile reason in stderr" >&2
  exit 1
}

set +e
OUT=$(cd "$REPO" && printf '%s' "$SAFE" | bash "$WRAPPER" 2>&1)
SAFE_RC=$?
set -e
if [ "$SAFE_RC" -ne 0 ]; then
  echo "FAIL: safe patch should exit 0 (got $SAFE_RC)" >&2
  echo "$OUT" >&2
  exit 1
fi

echo "PASS: on-pre-tool-use-vtcode.sh blocks lockfile and allows safe patch"
