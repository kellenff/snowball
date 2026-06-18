#!/usr/bin/env bash
#
# test-run-wrapper.sh — assert the run.cjs wrapper correctly resolves and
# spawns the real (or fake) server, propagates stdout, and reports the
# child's exit code. Signal handling is covered in test-run-wrapper-signals.sh.
#
# Run from the repo root: ./tests/junie-cli/test-run-wrapper.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WRAPPER_SRC="$REPO_ROOT/extensions/snowball/snowball-capture/run.cjs"
RESOLVER_SRC="$REPO_ROOT/extensions/snowball/snowball-capture/resolve-bundle-path.cjs"

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1" >&2
  exit 1
}

# Sanity: the wrapper and resolver must exist (created in Task 2 and Step 3).
[ -f "$WRAPPER_SRC" ] || fail "wrapper not found at $WRAPPER_SRC"
[ -f "$RESOLVER_SRC" ] || fail "resolver not found at $RESOLVER_SRC"

# --- Case 1: wrapper spawns the fake server, propagates stdout, exits 0 ---
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT
cp "$WRAPPER_SRC" "$FIXTURE/run.cjs"
cp "$RESOLVER_SRC" "$FIXTURE/resolve-bundle-path.cjs"
mkdir -p "$FIXTURE/dist"
cat >"$FIXTURE/dist/server.cjs" <<'FAKE'
process.stdout.write("hello from fake server\n");
process.exit(0);
FAKE

out=$(cd "$FIXTURE" && node run.cjs 2>&1)
if [ "$out" = "hello from fake server" ]; then
  pass "wrapper spawns fake server and propagates stdout"
else
  fail "wrapper output mismatch: got '$out'"
fi

# --- Case 2: SNOWBALL_BUNDLE_DIR override changes the resolution source ---
# Wrapper is in FIXTURE2. The fake server lives at FIXTURE2/snowball-capture/dist/server.cjs
# (the env-var branch's expected layout). The wrapper's __dirname is FIXTURE2, but the
# env-var branch should win because the fake server is in the env-var layout, not in
# FIXTURE2/dist/server.cjs. We verify by writing a different stdout from each location.
FIXTURE2="$(mktemp -d)"
mkdir -p "$FIXTURE2/dist"
cat >"$FIXTURE2/dist/server.cjs" <<'FAKE_DIRNAME'
process.stdout.write("from-dirname\n");
process.exit(0);
FAKE_DIRNAME
mkdir -p "$FIXTURE2/snowball-capture/dist"
cat >"$FIXTURE2/snowball-capture/dist/server.cjs" <<'FAKE_ENV'
process.stdout.write("from-env\n");
process.exit(0);
FAKE_ENV
cp "$WRAPPER_SRC" "$FIXTURE2/run.cjs"
cp "$RESOLVER_SRC" "$FIXTURE2/resolve-bundle-path.cjs"

out=$(cd "$FIXTURE2" && SNOWBALL_BUNDLE_DIR="$FIXTURE2" node run.cjs 2>&1)
if [ "$out" = "from-env" ]; then
  pass "SNOWBALL_BUNDLE_DIR override wins over __dirname"
else
  fail "env-var override mismatch: got '$out', expected 'from-env'"
fi

# --- Case 3: missing dist/server.cjs exits 1 with expected error ---
FIXTURE3="$(mktemp -d)"
cp "$WRAPPER_SRC" "$FIXTURE3/run.cjs"
cp "$RESOLVER_SRC" "$FIXTURE3/resolve-bundle-path.cjs"
# Intentionally do NOT create dist/server.cjs.

set +e
out=$(cd "$FIXTURE3" && node run.cjs 2>&1)
status=$?
set -e

trap 'rm -rf "$FIXTURE" "$FIXTURE2" "$FIXTURE3"' EXIT

if [ "$status" -ne 1 ]; then
  fail "expected exit 1, got $status (output: $out)"
fi
if ! echo "$out" | grep -q "cannot locate dist/server.cjs"; then
  fail "expected 'cannot locate dist/server.cjs' in stderr, got: $out"
fi
pass "missing dist/server.cjs exits 1 with expected error"

echo "All run-wrapper tests passed."
