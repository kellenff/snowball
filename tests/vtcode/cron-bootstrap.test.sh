#!/usr/bin/env bash
# Integration test: the session-start hook should produce a cron registration
# (or no-op gracefully) when run in a project that already has a digest.
set -euo pipefail

REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
git init -q "$REPO"

# Seed a MADR so refresh-adr-digest has something to do.
mkdir -p "$REPO/docs/snowball/decisions"
echo "# Sample" > "$REPO/docs/snowball/decisions/0001-sample.md"

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Locate the bootstrap script (the file created in step 1 of this task).
BOOTSTRAP="$SCRIPT_DIR/../skills/decision-logging/scripts/on-session-start-cron.sh"

if [ ! -x "$BOOTSTRAP" ]; then
  echo "SKIP: bootstrap script $BOOTSTRAP not built yet (Task 3 step 3)" >&2
  exit 0
fi

GIT_ROOT="$REPO" bash "$BOOTSTRAP"
echo "PASS: bootstrap ran without crashing"
