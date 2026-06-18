#!/usr/bin/env bash
#
# test-run-wrapper-signals.sh — assert the run.cjs wrapper forwards signals
# (SIGTERM, SIGINT, SIGHUP) to its child and exits with the child's exit
# code, not 128+signal. This is the regression test for the orphan-after-
# SIGTERM failure mode: without forwarding, child.kill(); process.exit()
# races and leaves an orphan that survives its parent's death.
#
# Run from the repo root: ./tests/junie-cli/test-run-wrapper-signals.sh
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

# Sanity: the wrapper and resolver must exist.
[ -f "$WRAPPER_SRC" ] || fail "wrapper not found at $WRAPPER_SRC"
[ -f "$RESOLVER_SRC" ] || fail "resolver not found at $RESOLVER_SRC"

FIXTURE="$(mktemp -d)"
MARKER="$FIXTURE/marker"
WRAPPER_OUT="$FIXTURE/wrapper.out"
trap 'rm -rf "$FIXTURE"' EXIT

cp "$WRAPPER_SRC" "$FIXTURE/run.cjs"
cp "$RESOLVER_SRC" "$FIXTURE/resolve-bundle-path.cjs"
mkdir -p "$FIXTURE/dist"

# Fake server: install a SIGTERM handler that writes a marker file, then
# stays alive long enough to receive the signal. A SIGINT and SIGHUP
# handler also write to the same marker so a single test exercises all
# three signals in series.
cat >"$FIXTURE/dist/server.cjs" <<'FAKE'
const fs = require("fs");
const marker = process.env.SNOWBALL_TEST_MARKER;

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => {
    if (marker) {
      try { fs.writeFileSync(marker, sig + "\n"); } catch {}
    }
    // Exit 0 after the handler runs so the wrapper has a clean exit code
    // to mirror. The test re-uses the same fixture for all three signals.
    process.exit(0);
  });
}

// Keep the process alive. setInterval with a long delay is deterministic
// and doesn't depend on stdin state (process.stdin.resume() alone is a
// no-op when stdin is at EOF, e.g. < /dev/null).
setInterval(() => {}, 1 << 30);
FAKE

# Run the wrapper for each signal. Each iteration:
#  - clears the marker
#  - starts the wrapper with stdin closed (so the child's resume() doesn't
#    keep the process alive forever if signals don't fire)
#  - waits a moment for spawn to settle
#  - sends the signal
#  - waits for the wrapper to exit
#  - asserts the marker exists (child got the signal) and the wrapper's
#    exit code is 0 (not 128+sig)
for SIG in SIGTERM SIGINT SIGHUP; do
  rm -f "$MARKER"
  : >"$WRAPPER_OUT"

  set +e
  # Run the wrapper directly (no subshell) so $! captures the node PID, not
  # a bash subshell. The wrapper's __dirname is $FIXTURE, so its requires
  # resolve to $FIXTURE/resolve-bundle-path.cjs and the resolver finds
  # $FIXTURE/dist/server.cjs regardless of CWD.
  SNOWBALL_TEST_MARKER="$MARKER" node "$FIXTURE/run.cjs" </dev/null >"$WRAPPER_OUT" 2>&1 &
  WRAPPER_PID=$!
  # Give the spawn a moment to settle before signaling.
  sleep 0.2
  kill -"$SIG" "$WRAPPER_PID"
  wait "$WRAPPER_PID"
  status=$?
  set -e

  if [ ! -f "$MARKER" ]; then
    fail "$SIG: child did not receive the signal (no marker file). wrapper output: $(cat "$WRAPPER_OUT")"
  fi
  recorded=$(cat "$MARKER")
  if [ "$recorded" != "$SIG" ]; then
    fail "$SIG: marker recorded '$recorded', expected '$SIG'"
  fi
  if [ "$status" -ne 0 ]; then
    fail "$SIG: wrapper exited with $status, expected 0 (child's exit code). output: $(cat "$WRAPPER_OUT")"
  fi
  pass "$SIG forwarded to child, wrapper exited 0 (child's exit code)"
done

echo "All run-wrapper signal tests passed."
