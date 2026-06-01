#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HANDLER="$REPO_ROOT/hooks/blast-radius-audit.sh"
COMPUTE="$REPO_ROOT/skills/blast-radius/scripts/compute.cjs"
FAIL=0

TMP_REPO=$(mktemp -d)
(cd "$TMP_REPO" && git init -q && git config user.email t@t && git config user.name t)

# Seed scratch envelope
echo '{"gitRoot":"'"$TMP_REPO"'","preset":"pre-execution","changeSet":{"paths":["hooks/foo.sh"],"proposedAction":"git push"}}' \
  | (cd "$TMP_REPO" && node "$COMPUTE" compute-and-persist >/dev/null)

# Test 1: non-approval prompt → no observation
echo '{"prompt":"what about edge case X","session_id":"s1"}' \
  | (cd "$TMP_REPO" && bash "$HANDLER" operator-approval)

if [ -f "$TMP_REPO/docs/snowball/decisions/observations.jsonl" ]; then
  echo "[FAIL] non-approval prompt should not append observation"
  FAIL=1
else
  echo "[PASS] non-approval prompt no-ops"
fi

# Test 2: approval prompt → appends observation with blast_radius_envelope
echo '{"prompt":"lgtm","session_id":"s1"}' \
  | (cd "$TMP_REPO" && bash "$HANDLER" operator-approval)

if [ ! -f "$TMP_REPO/docs/snowball/decisions/observations.jsonl" ]; then
  echo "[FAIL] approval prompt should append observation"
  FAIL=1
else
  if grep -q '"blast_radius_envelope"' "$TMP_REPO/docs/snowball/decisions/observations.jsonl" \
    && grep -q '"capture_trigger":"operator-approval"' "$TMP_REPO/docs/snowball/decisions/observations.jsonl"; then
    echo "[PASS] approval prompt appends blast_radius_envelope observation"
  else
    echo "[FAIL] observation missing expected fields:"
    cat "$TMP_REPO/docs/snowball/decisions/observations.jsonl"
    FAIL=1
  fi
fi

# Test 3: stop trigger → appends observation
before=$(wc -l <"$TMP_REPO/docs/snowball/decisions/observations.jsonl" | tr -d ' ')
echo '{"session_id":"s1"}' | (cd "$TMP_REPO" && bash "$HANDLER" stop)
after=$(wc -l <"$TMP_REPO/docs/snowball/decisions/observations.jsonl" | tr -d ' ')

if [ "$after" -gt "$before" ] && tail -1 "$TMP_REPO/docs/snowball/decisions/observations.jsonl" | grep -q '"capture_trigger":"stop"'; then
  echo "[PASS] stop trigger appends observation"
else
  echo "[FAIL] stop trigger did not append observation (before=$before after=$after)"
  FAIL=1
fi

# Test 4: outside git repo → no-op
TMP_NONGIT=$(mktemp -d)
echo '{"prompt":"lgtm","session_id":"s1"}' \
  | (cd "$TMP_NONGIT" && bash "$HANDLER" operator-approval)
if [ ! -f "$TMP_NONGIT/docs/snowball/decisions/observations.jsonl" ]; then
  echo "[PASS] no-ops outside git repo"
else
  echo "[FAIL] wrote observation outside git repo"
  FAIL=1
fi

rm -rf "$TMP_REPO" "$TMP_NONGIT"
exit $FAIL
