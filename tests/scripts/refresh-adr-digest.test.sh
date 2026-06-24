#!/usr/bin/env bash
# Integration test: refresh-adr-digest.sh should regenerate the digest
# from current MADRs in docs/snowball/decisions/.
set -euo pipefail

REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
git init -q "$REPO"

SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/refresh-adr-digest.sh"
DECISIONS="$REPO/docs/snowball/decisions"
DIGEST="$REPO/.snowball/digest.txt"

# Seed one MADR file so the digest has something to summarize.
mkdir -p "$DECISIONS"
cat > "$DECISIONS/0001-test.md" <<'MADR'
---
schema_version: "1.1"
source: operator
confidence: high
capture_mechanism: ask-user-question
session_id: seed
source_event_id: seed-1
supersedes: null
tags: [brainstorming]
---

# Test decision

Context body.
MADR

# First run: should create the digest.
GIT_ROOT="$REPO" bash "$SCRIPT"
if [ ! -s "$DIGEST" ]; then
  echo "FAIL: digest not created at $DIGEST" >&2
  exit 1
fi

# Second run: should be idempotent (same digest content).
FIRST="$(cat "$DIGEST")"
GIT_ROOT="$REPO" bash "$SCRIPT"
SECOND="$(cat "$DIGEST")"
if [ "$FIRST" != "$SECOND" ]; then
  echo "FAIL: digest content differs across runs" >&2
  diff <(echo "$FIRST") <(echo "$SECOND") >&2 || true
  exit 1
fi

echo "PASS: refresh-adr-digest.sh creates and idempotently maintains digest"
