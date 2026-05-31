#!/usr/bin/env bash
# Shared helper: read hook stdin and fork the extraction worker.
set -uo pipefail

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="$SCRIPT_DIR/extract-worker.sh"
LOG_DIR="$HOME/.snowball"
mkdir -p "$LOG_DIR"

PAYLOAD=$(cat)
read -r SESSION_ID TRANSCRIPT_PATH < <(
  # shellcheck disable=SC2016
  printf '%s' "$PAYLOAD" | node -e '
let s = "";
process.stdin.on("data", (c) => s += c);
process.stdin.on("end", () => {
  try {
    const p = JSON.parse(s);
    const sessionId = String(p.session_id || p.conversation_id || "");
    const transcriptPath =
      typeof p.transcript_path === "string" ? p.transcript_path : "";
    process.stdout.write(`${sessionId}\t${transcriptPath}\n`);
  } catch {
    process.stdout.write("\t\n");
  }
});
'
)

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

if [ -n "$TRANSCRIPT_PATH" ]; then
  nohup bash "$WORKER" "$SESSION_ID" "$GIT_ROOT" "$TRANSCRIPT_PATH" >>"$LOG_DIR/decision-logging.log" 2>&1 &
else
  nohup bash "$WORKER" "$SESSION_ID" "$GIT_ROOT" >>"$LOG_DIR/decision-logging.log" 2>&1 &
fi
disown

exit 0
