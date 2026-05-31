#!/usr/bin/env bash
# Detached background worker: reads transcript, calls claude -p, appends observations.
set -uo pipefail

SESSION_ID="$1"
GIT_ROOT="$2"
TRANSCRIPT_OVERRIDE="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/extract-observations.md"
APPENDER="$SCRIPT_DIR/append-observation.cjs"
ERROR_LOG="$HOME/.snowball/decision-logging-errors.log"
mkdir -p "$(dirname "$ERROR_LOG")"

CHECKPOINT_DIR="$HOME/.snowball/checkpoints"
mkdir -p "$CHECKPOINT_DIR"
CURSOR="$CHECKPOINT_DIR/${SESSION_ID}.cursor"
LOCK="$CHECKPOINT_DIR/${SESSION_ID}.lock"

# Non-blocking lock: if another worker is running, bail silently.
# It will pick up new transcript lines when it iterates.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  flock -n 9 || exit 0
fi

resolve_transcript() {
  if [ -n "$TRANSCRIPT_OVERRIDE" ] && [ -f "$TRANSCRIPT_OVERRIDE" ]; then
    printf '%s' "$TRANSCRIPT_OVERRIDE"
    return 0
  fi

  # Claude Code: ~/.claude/projects/-Users-foo-bar/<session>.jsonl
  local claude_encoded="-$(echo "$GIT_ROOT" | sed 's|^/||; s|/|-|g')"
  local claude_transcript="$HOME/.claude/projects/$claude_encoded/$SESSION_ID.jsonl"
  if [ -f "$claude_transcript" ]; then
    printf '%s' "$claude_transcript"
    return 0
  fi

  # Cursor: ~/.cursor/projects/Users-foo-bar/agent-transcripts/<session>/<session>.jsonl
  local cursor_encoded
  cursor_encoded="$(echo "$GIT_ROOT" | sed 's|^/||; s|/|-|g')"
  local cursor_transcript="$HOME/.cursor/projects/$cursor_encoded/agent-transcripts/$SESSION_ID/$SESSION_ID.jsonl"
  if [ -f "$cursor_transcript" ]; then
    printf '%s' "$cursor_transcript"
    return 0
  fi

  return 1
}

TRANSCRIPT="$(resolve_transcript)" || {
  echo "[$(date)] transcript not found for session $SESSION_ID (git root: $GIT_ROOT)" >>"$ERROR_LOG"
  exit 0
}

PROCESSED=$(cat "$CURSOR" 2>/dev/null || echo 0)
TOTAL=$(wc -l <"$TRANSCRIPT" | tr -d ' ')

if [ "$TOTAL" -le "$PROCESSED" ]; then
  exit 0
fi

CLAUDE_BIN="${SNOWBALL_CLAUDE_BIN:-claude}"

# Slice transcript to unprocessed tail and pipe to headless claude
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")
EXTRACTION=$(tail -n +$((PROCESSED + 1)) "$TRANSCRIPT" | "$CLAUDE_BIN" -p \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --output-format text 2>>"$ERROR_LOG") || {
  echo "[$(date)] claude -p failed for session $SESSION_ID" >>"$ERROR_LOG"
  exit 0
}

# Pipe extracted JSONL to the appender (it skips invalid lines internally)
echo "$EXTRACTION" | (cd "$GIT_ROOT" && node "$APPENDER") 2>>"$ERROR_LOG"

# Atomic cursor update: write to tmp, then rename
echo "$TOTAL" >"${CURSOR}.tmp" && mv "${CURSOR}.tmp" "$CURSOR"
