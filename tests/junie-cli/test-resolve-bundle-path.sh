#!/usr/bin/env bash
#
# test-resolve-bundle-path.sh — assert the resolveBundlePath pure function
# handles all six cases from the spec at docs/snowball/specs/
# 2026-06-17-mcp-path-resolution-fix-design.md.
#
# Run from the repo root: ./tests/junie-cli/test-resolve-bundle-path.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESOLVER="$REPO_ROOT/extensions/snowball/snowball-capture/resolve-bundle-path.cjs"

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1" >&2
  exit 1
}

# Sanity: the resolver must exist (created in Step 3 of this task).
[ -f "$RESOLVER" ] || fail "resolver not found at $RESOLVER"

# Build a fixture: a temp dir with a real dist/server.cjs so the dirname
# branch can find a file when checkExists is true.
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/snowball-capture/dist"
printf 'module.exports = {};\n' >"$FIXTURE/snowball-capture/dist/server.cjs"

# Helper: run an inline node assertion; print PASS or fail with stderr.
assert_case() {
  local name="$1"
  local body="$2"
  local out
  if out=$(SNOWBALL_TEST_RESOLVER="$RESOLVER" \
    SNOWBALL_TEST_FIXTURE="$FIXTURE" \
    node -e "$body" 2>&1); then
    pass "$name"
  else
    fail "$name: $out"
  fi
}

# --- Case 1: env set + valid (checkExists: false) -> returns env path, source='env' ---
assert_case "env set + valid returns env path" '
  const r = require(process.env.SNOWBALL_TEST_RESOLVER);
  const out = r.resolveBundlePath(
    { env: process.env.SNOWBALL_TEST_FIXTURE, dirname: "/unused" },
    { checkExists: false }
  );
  if (out.source !== "env") throw new Error("expected env, got " + out.source);
  if (!out.path.endsWith("snowball-capture/dist/server.cjs")) {
    throw new Error("bad path: " + out.path);
  }
'

# --- Case 2: env set + path missing (checkExists: true) -> falls back to dirname ---
assert_case "env set + missing falls back to dirname" '
  const r = require(process.env.SNOWBALL_TEST_RESOLVER);
  const out = r.resolveBundlePath(
    { env: "/nonexistent/path/that/does/not/exist",
      dirname: process.env.SNOWBALL_TEST_FIXTURE + "/snowball-capture" },
    { checkExists: true }
  );
  if (out.source !== "dirname") throw new Error("expected dirname, got " + out.source);
'

# --- Case 3: env unset -> returns dirname path, source='dirname' ---
assert_case "env unset returns dirname path" '
  const r = require(process.env.SNOWBALL_TEST_RESOLVER);
  const out = r.resolveBundlePath(
    { env: undefined,
      dirname: process.env.SNOWBALL_TEST_FIXTURE + "/snowball-capture" },
    { checkExists: true }
  );
  if (out.source !== "dirname") throw new Error("expected dirname, got " + out.source);
  if (!out.path.endsWith("dist/server.cjs")) throw new Error("bad path: " + out.path);
'

# --- Case 4: both missing (checkExists: true) -> throws BundlePathNotFoundError ---
assert_case "both missing throws BundlePathNotFoundError" '
  const r = require(process.env.SNOWBALL_TEST_RESOLVER);
  let caught = null;
  try {
    r.resolveBundlePath(
      { env: undefined, dirname: "/nonexistent/snowball-capture" },
      { checkExists: true }
    );
  } catch (e) {
    caught = e;
  }
  if (!caught) throw new Error("expected throw, got nothing");
  if (!(caught instanceof r.BundlePathNotFoundError)) {
    throw new Error("wrong error class: " + caught.name);
  }
  if (!caught.hints) throw new Error("missing hints payload");
'

# --- Case 5: env empty string -> treated as unset ---
assert_case "env empty string treated as unset" '
  const r = require(process.env.SNOWBALL_TEST_RESOLVER);
  const out = r.resolveBundlePath(
    { env: "", dirname: process.env.SNOWBALL_TEST_FIXTURE + "/snowball-capture" },
    { checkExists: true }
  );
  if (out.source !== "dirname") throw new Error("empty env should be treated as unset");
'

# --- Case 6: dirname not a string -> throws (input-shape guard) ---
assert_case "dirname not a string throws" '
  const r = require(process.env.SNOWBALL_TEST_RESOLVER);
  let caught = null;
  try {
    r.resolveBundlePath({ env: undefined, dirname: 42 }, { checkExists: false });
  } catch (e) {
    caught = e;
  }
  if (!caught) throw new Error("expected throw on non-string dirname");
'

echo "All resolve-bundle-path tests passed."
