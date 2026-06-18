#!/usr/bin/env bash
#
# test-install-path-fix.sh — assert install-path-fix.cjs correctly rewrites
# mcp/mcp.json's snowball-capture entry to use an absolute path to the
# wrapper (run.cjs), is idempotent, and fails clearly when mcp.json is
# missing.
#
# Run from the repo root: ./tests/junie-cli/test-install-path-fix.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_SCRIPT_SRC="$REPO_ROOT/extensions/snowball/scripts/install-path-fix.cjs"

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1" >&2
  exit 1
}

# Sanity: the install script must exist (created in this task).
[ -f "$INSTALL_SCRIPT_SRC" ] || fail "install script not found at $INSTALL_SCRIPT_SRC"

# Helper: build a minimal bundle layout in $1.
# Layout: $1/extensions/snowball/{snowball-capture/run.cjs,mcp/mcp.json}
# The install script writes an absolute path to run.cjs into mcp.json,
# so the wrapper must exist in the fixture for the existence check to pass.
build_fixture() {
  local root="$1"
  mkdir -p "$root/extensions/snowball/snowball-capture"
  mkdir -p "$root/extensions/snowball/mcp"
  printf '#!/usr/bin/env node\n' >"$root/extensions/snowball/snowball-capture/run.cjs"
  cat >"$root/extensions/snowball/mcp/mcp.json" <<'JSON'
{
  "mcpServers": {
    "snowball-capture": {
      "command": "node",
      "args": ["../snowball-capture/run.cjs"]
    },
    "argdown": { "command": "node", "args": ["/absolute/path/to/argdown"] }
  }
}
JSON
}

# --- Case 1: rewrite replaces args[0] with absolute path to run.cjs ---
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT
build_fixture "$FIXTURE"

# Create scripts/ first, then copy the install script into it. The script's
# __dirname will be $FIXTURE/extensions/snowball/scripts/, from which it
# looks for ../mcp/mcp.json (the fixture) and computes the absolute path
# to ../snowball-capture/run.cjs.
mkdir -p "$FIXTURE/extensions/snowball/scripts"
cp "$INSTALL_SCRIPT_SRC" "$FIXTURE/extensions/snowball/scripts/install-path-fix.cjs"

set +e
(cd "$FIXTURE/extensions/snowball/scripts" && node install-path-fix.cjs) >"$FIXTURE/out" 2>&1
status=$?
set -e

if [ "$status" -ne 0 ]; then
  fail "install script exited $status, output: $(cat "$FIXTURE/out")"
fi

# Verify the rewrite. On macOS, /var is a symlink to /private/var so the
# script's __dirname may resolve to a path with a different prefix than
# mktemp's output. Asserting the rewritten path is the same string the
# script itself computed (so the test is path-agnostic on macOS), then
# asserting that path actually exists.
args0=$(python3 -c "import json; print(json.load(open('$FIXTURE/extensions/snowball/mcp/mcp.json'))['mcpServers']['snowball-capture']['args'][0])")
if [ ! -e "$args0" ]; then
  fail "rewrite: args[0]=$args0 does not exist on disk"
fi
# Sanity: the rewritten path should point at run.cjs, the wrapper.
case "$args0" in
  */snowball-capture/run.cjs) ;;
  *) fail "rewrite: args[0]=$args0 does not end with snowball-capture/run.cjs" ;;
esac
# Argdown entry should be unchanged.
argdown_args=$(python3 -c "import json; print(json.load(open('$FIXTURE/extensions/snowball/mcp/mcp.json'))['mcpServers']['argdown']['args'][0])")
if [ "$argdown_args" != "/absolute/path/to/argdown" ]; then
  fail "rewrite: argdown entry changed, got $argdown_args"
fi
pass "rewrite replaces args[0] with absolute path to run.cjs, leaves other entries alone"

# --- Case 2: idempotent (second run produces no diff) ---
before_hash=$(shasum "$FIXTURE/extensions/snowball/mcp/mcp.json" | awk '{print $1}')
set +e
(cd "$FIXTURE/extensions/snowball/scripts" && node install-path-fix.cjs) >/dev/null 2>&1
status=$?
set -e
if [ "$status" -ne 0 ]; then
  fail "second run exited $status"
fi
after_hash=$(shasum "$FIXTURE/extensions/snowball/mcp/mcp.json" | awk '{print $1}')
if [ "$before_hash" != "$after_hash" ]; then
  fail "idempotence: second run changed mcp.json (before=$before_hash, after=$after_hash)"
fi
pass "second run is a no-op (no diff in mcp.json)"

# --- Case 3: missing mcp.json -> exits 1 with clear message ---
MISSING_FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE" "$MISSING_FIXTURE"' EXIT
mkdir -p "$MISSING_FIXTURE/extensions/snowball/scripts"
cp "$INSTALL_SCRIPT_SRC" "$MISSING_FIXTURE/extensions/snowball/scripts/install-path-fix.cjs"
# Intentionally do NOT create mcp/mcp.json.

set +e
(cd "$MISSING_FIXTURE/extensions/snowball/scripts" && node install-path-fix.cjs) >"$MISSING_FIXTURE/out" 2>&1
status=$?
set -e

if [ "$status" -ne 1 ]; then
  fail "expected exit 1 for missing mcp.json, got $status (output: $(cat "$MISSING_FIXTURE/out"))"
fi
if ! grep -q "mcp.json" "$MISSING_FIXTURE/out"; then
  fail "expected error message to mention mcp.json, got: $(cat "$MISSING_FIXTURE/out")"
fi
pass "missing mcp.json exits 1 with a clear error message"

echo "All install-path-fix tests passed."
