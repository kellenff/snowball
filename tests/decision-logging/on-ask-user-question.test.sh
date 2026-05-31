#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HANDLER="$REPO_ROOT/skills/decision-logging/scripts/on-ask-user-question.sh"
FAIL=0

# Test 1: handler no-ops outside a git repo
TMP_NONGIT=$(mktemp -d)
echo '{"tool_input":{},"tool_response":{},"session_id":"s","tool_use_id":"t"}' \
  | (cd "$TMP_NONGIT" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER")
status=$?
if [ "$status" -ne 0 ]; then
  echo "[FAIL] handler should exit 0 outside git repo (got $status)"
  FAIL=1
else
  echo "[PASS] handler exits 0 outside git repo"
fi
rm -rf "$TMP_NONGIT"

# Test 2: handler writes a MADR for a synthetic PostToolUse payload
TMP_REPO=$(mktemp -d)
(cd "$TMP_REPO" && git init -q && git config user.email t@t && git config user.name t)

PAYLOAD='{
  "session_id": "test-session-1",
  "tool_use_id": "tooluse-1",
  "tool_input": {
    "questions": [{
      "question": "Which storage approach should we use?",
      "header": "Storage",
      "multiSelect": false,
      "options": [
        {"label": "Two-tier", "description": "MADR + JSONL"},
        {"label": "Uniform", "description": "all MADR"}
      ]
    }]
  },
  "tool_response": {
    "answers": {"Which storage approach should we use?": "Two-tier"}
  }
}'

echo "$PAYLOAD" | (cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER")

# Test 3: Cursor AskQuestion payload (conversation_id + tool_output)
CURSOR_PAYLOAD='{
  "conversation_id": "cursor-session-1",
  "tool_use_id": "tooluse-2",
  "tool_input": {
    "questions": [{
      "id": "scope",
      "prompt": "Which branch strategy?",
      "options": [
        {"id": "feature", "label": "Feature branch"},
        {"id": "main", "label": "Main"}
      ]
    }]
  },
  "tool_output": "{\"answers\":{\"scope\":\"feature\"}}"
}'

echo "$CURSOR_PAYLOAD" | (cd "$TMP_REPO" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$HANDLER")

DECISIONS_DIR="$TMP_REPO/docs/snowball/decisions"
if [ ! -d "$DECISIONS_DIR" ]; then
  echo "[FAIL] decisions dir not created"
  FAIL=1
else
  count=$(find "$DECISIONS_DIR" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  if [ "$count" -ne 2 ]; then
    echo "[FAIL] expected 2 MADR files, got $count"
    FAIL=1
  else
    echo "[PASS] MADR files written for Claude and Cursor payloads"
    if grep -rq 'capture_mechanism: ask-user-question' "$DECISIONS_DIR" \
      && grep -rq 'Two-tier' "$DECISIONS_DIR" \
      && grep -rq 'Feature branch' "$DECISIONS_DIR"; then
      echo "[PASS] MADR content includes both chosen options"
    else
      echo "[FAIL] MADR content unexpected"
      FAIL=1
    fi
  fi
fi
rm -rf "$TMP_REPO"

exit $FAIL
