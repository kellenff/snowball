# MCP Path-Resolution Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `<absolute-path-to-snowball>` placeholder in `extensions/snowball/mcp/mcp.json` with a runtime-resolution scheme — a pure resolver, a wrapper around `snowball-capture`, and a post-install rewriter — that works across marketplace, clone-and-point, and any future install surface.

**Architecture:** Three small files, one shared pure function. The resolver (`resolve-bundle-path.cjs`) is the unit of truth — pure, no side effects, fully unit-testable. The wrapper (`run.cjs`) is what `mcp/mcp.json` points at; it asks the resolver, forks Node, forwards signals. The install script (`install-path-fix.cjs`) is user-invoked once after install; it rewrites `mcp/mcp.json` with absolute paths for adapters that can't follow a relative path. Both the wrapper and the install script reference the same resolver file so the "what does the bundle path look like" logic has one definition.

**Tech Stack:** Node.js CommonJS (resolver, wrapper, install script — same runtime as the existing `snowball-capture` MCP server), Bash (stdlib-only tests, matching the existing `tests/junie-cli/validate-marketplace.sh` style), pre-commit (local hooks).

**Spec:** [`docs/snowball/specs/2026-06-17-mcp-path-resolution-fix-design.md`](../specs/2026-06-17-mcp-path-resolution-fix-design.md)

---

## Prerequisites

This plan assumes the **marketplace groundwork** from [`docs/snowball/plans/2026-06-16-junie-cli-marketplace.md`](./2026-06-16-junie-cli-marketplace.md) has been executed. Specifically, the following must be true at the start of Task 1:

- `.junie-extension/marketplace.json` exists at the repo root
- `extensions/snowball/mcp/mcp.json` exists (renamed from `mcp/.mcp.json`)
- `tests/junie-cli/validate-marketplace.sh` exists and passes
- `.pre-commit-config.yaml` has a `validate-junie-cli-marketplace` local hook
- `docs/snowball/specs/2026-06-16-junie-cli-marketplace-design.md` has Open Question 2 marked resolved (already done in the spec-writing turn; verified in Task 1)

**Task 1 verifies all five prerequisites; if any are missing, stop and execute the marketplace plan first.** Do not proceed with the path-resolution tasks until every check passes.

---

## File Structure

**Created:**

```text
extensions/snowball/snowball-capture/
├── resolve-bundle-path.cjs                # pure resolver, no side effects, exported error class
└── run.cjs                                # wrapper around dist/server.cjs (signal-forwarding)

extensions/snowball/scripts/
└── install-path-fix.cjs                   # post-install rewriter, cross-platform Node.js

tests/junie-cli/
├── test-resolve-bundle-path.sh            # 6 pure-function cases
├── test-run-wrapper.sh                    # 3 collaboration cases (basic spawn + env override + missing)
├── test-run-wrapper-signals.sh            # signal-forwarding regression test
└── test-install-path-fix.sh               # 4 cases incl. idempotence and missing-mcp.json negative
```

**Modified:**

- `extensions/snowball/mcp/mcp.json` — `args[0]` from `<absolute-path-to-snowball>/extensions/snowball/snowball-capture/dist/server.cjs` to `../snowball-capture/run.cjs`. No other content change.
- `.pre-commit-config.yaml` — append one new local hook entry that runs the four new test scripts.
- `README.md` — append a sub-bullet to the v6.3.0 row in the "What is different from upstream" changelog table.
- `RELEASE-NOTES.md` — append a sub-bullet under the v6.3.0 section.

**Not touched:**

- `extensions/snowball/snowball-capture/src/server.ts` and `dist/server.cjs` (the real MCP server is unchanged).
- `extensions/snowball/.junie/AGENTS.md`, `extensions/snowball/skills/`, `extensions/snowball/extension.json`.
- The `argdown` and `codebase-memory` MCP entries (their `<absolute-path-to-*>` placeholders stay — external user-installed servers).
- The marketplace spec (Open Question 2 and Known limitations were already updated in the spec-writing turn).
- `scripts/build-snowball-capture.sh` (the new files are committed as-is; no build step needed).

---

## Task 1: Verify prerequisites

**Goal:** Confirm the marketplace groundwork is in place and the marketplace spec is up to date. If anything is missing, stop and execute the marketplace plan first.

**Files:** none modified; this is a verification task.

- [ ] **Step 1: Check the marketplace manifest exists**

Run: `test -f .junie-extension/marketplace.json && echo "manifest present" || echo "manifest MISSING"`

Expected: `manifest present`.

- [ ] **Step 2: Check the canonical MCP config exists**

Run: `test -f extensions/snowball/mcp/mcp.json && echo "mcp.json present" || echo "mcp.json MISSING"`

Expected: `mcp.json present`.

- [ ] **Step 3: Check the marketplace test exists and passes**

Run: `test -x tests/junie-cli/validate-marketplace.sh && ./tests/junie-cli/validate-marketplace.sh || echo "marketplace test MISSING or FAILED"`

Expected: all three `[PASS]` lines, exit 0.

- [ ] **Step 4: Check the pre-commit hook is wired**

Run: `grep -q "validate-junie-cli-marketplace" .pre-commit-config.yaml && echo "hook wired" || echo "hook MISSING"`

Expected: `hook wired`.

- [ ] **Step 5: Verify the marketplace spec's Open Question 2 is marked resolved**

Run: `grep -A1 "Open Question 2" docs/snowball/specs/2026-06-16-junie-cli-marketplace-design.md | head -5`

Expected: the line `**2. Pre-existing MCP-path placeholder.**` followed by a `_Resolved by [2026-06-17-mcp-path-resolution-fix-design.md...`_ reference.

- [ ] **Step 6: Verify the resolver, wrapper, and install script do not yet exist**

Run:

```bash
test ! -f extensions/snowball/snowball-capture/resolve-bundle-path.cjs && \
test ! -f extensions/snowball/snowball-capture/run.cjs && \
test ! -f extensions/snowball/scripts/install-path-fix.cjs && \
echo "no prior path-resolution files" || echo "PATH-RESOLUTION FILES ALREADY EXIST — review before continuing"
```

Expected: `no prior path-resolution files`. If files exist, stop and decide whether to keep, replace, or reset before proceeding.

If any check fails, stop and execute [`docs/snowball/plans/2026-06-16-junie-cli-marketplace.md`](./2026-06-16-junie-cli-marketplace.md) first. Do not proceed with the path-resolution tasks until every check passes.

---

## Task 2: Resolver — write failing tests, then implement

**Goal:** Ship a pure function `resolveBundlePath({ env, dirname }, { checkExists })` that returns `{ path, source }` or throws `BundlePathNotFoundError`. The unit of truth for the whole path-resolution scheme.

**Files:**

- Create: `tests/junie-cli/test-resolve-bundle-path.sh`
- Create: `extensions/snowball/snowball-capture/resolve-bundle-path.cjs`

- [ ] **Step 1: Write the failing test (TDD red)**

Create `tests/junie-cli/test-resolve-bundle-path.sh` with the exact content below. The test exercises all six cases from the spec; it will fail at the sanity check (the resolver file doesn't exist yet) until Task 2 Step 3 creates the implementation.

```bash
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
fail() { echo "  [FAIL] $1" >&2; exit 1; }

# Sanity: the resolver must exist (created in Step 3 of this task).
[ -f "$RESOLVER" ] || fail "resolver not found at $RESOLVER"

# Build a fixture: a temp dir with a real dist/server.cjs so the dirname
# branch can find a file when checkExists is true.
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/snowball-capture/dist"
printf 'module.exports = {};\n' > "$FIXTURE/snowball-capture/dist/server.cjs"

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
```

- [ ] **Step 2: Run the test — it should fail (TDD red)**

Run: `chmod +x tests/junie-cli/test-resolve-bundle-path.sh && ./tests/junie-cli/test-resolve-bundle-path.sh`

Expected: the script prints `[FAIL] resolver not found at /<repo>/extensions/snowball/snowball-capture/resolve-bundle-path.cjs` and exits non-zero. This is correct — the implementation doesn't exist yet.

- [ ] **Step 3: Write the implementation (TDD green)**

Create `extensions/snowball/snowball-capture/resolve-bundle-path.cjs` with the exact content below. The module exports both `resolveBundlePath` (the function) and `BundlePathNotFoundError` (the error class). The input-shape guard on `dirname` is included to satisfy test case 6.

```js
"use strict";

const fs = require("fs");
const path = require("path");

class BundlePathNotFoundError extends Error {
  constructor(message, { hints }) {
    super(message);
    this.name = "BundlePathNotFoundError";
    this.hints = hints;
  }
}

function resolveBundlePath(hints, options) {
  const checkExists = options == null ? true : options.checkExists !== false;
  const env = hints == null ? undefined : hints.env;
  const dirname = hints == null ? undefined : hints.dirname;

  // Input-shape guard: dirname must be a string (or undefined) when the env
  // branch is unavailable. A non-string dirname is a programmer error, not a
  // runtime "I can't find the file" error, so we throw a TypeError.
  if (dirname !== undefined && typeof dirname !== "string") {
    throw new TypeError("dirname must be a string or undefined");
  }

  // 1. Try SNOWBALL_BUNDLE_DIR (bundle root -> <root>/snowball-capture/dist/server.cjs).
  if (env) {
    const candidate = path.join(env, "snowball-capture", "dist", "server.cjs");
    if (!checkExists || fs.existsSync(candidate)) {
      return { path: candidate, source: "env" };
    }
  }

  // 2. Fall back to dirname (wrapper's directory -> <dirname>/dist/server.cjs).
  if (dirname) {
    const candidate = path.join(dirname, "dist", "server.cjs");
    if (!checkExists || fs.existsSync(candidate)) {
      return { path: candidate, source: "dirname" };
    }
  }

  throw new BundlePathNotFoundError("Cannot resolve snowball-capture server", {
    hints: { env, dirname },
  });
}

module.exports = { resolveBundlePath, BundlePathNotFoundError };
```

- [ ] **Step 4: Run the test — it should pass (TDD green)**

Run: `./tests/junie-cli/test-resolve-bundle-path.sh`

Expected output:

```text
  [PASS] env set + valid returns env path
  [PASS] env set + missing falls back to dirname
  [PASS] env unset returns dirname path
  [PASS] both missing throws BundlePathNotFoundError
  [PASS] env empty string treated as unset
  [PASS] dirname not a string throws
All resolve-bundle-path tests passed.
```

If any case fails, the resolver implementation is wrong. Re-read the spec's "Components" section for the resolver and fix the code in Step 3; do not weaken the test to match a buggy implementation.

- [ ] **Step 5: Run shellcheck and the existing pre-commit hooks on the new file**

Run:

```bash
shellcheck tests/junie-cli/test-resolve-bundle-path.sh
pre-commit run shellcheck --files tests/junie-cli/test-resolve-bundle-path.sh || true
```

Expected: `shellcheck` reports no issues. The `pre-commit` invocation is best-effort — the new test file has no hook wired yet (that's Task 7), so a "no hook configured" message is acceptable here.

- [ ] **Step 6: Commit**

```bash
git add tests/junie-cli/test-resolve-bundle-path.sh extensions/snowball/snowball-capture/resolve-bundle-path.cjs
git commit -m "feat(junie-cli): add pure resolve-bundle-path resolver with six-case test"
```

---

## Task 3: Wrapper — write failing tests, then implement (basic spawn + env override + missing-server)

**Goal:** Ship `run.cjs` — the wrapper the MCP config points at — that resolves the real server's path, forks Node, and mirrors the child's exit. Covers the three collaboration cases from the spec. Signal handling is added in Task 4 as a separate regression test.

**Files:**

- Create: `tests/junie-cli/test-run-wrapper.sh`
- Create: `extensions/snowball/snowball-capture/run.cjs`

- [ ] **Step 1: Write the failing test (TDD red)**

Create `tests/junie-cli/test-run-wrapper.sh` with the exact content below. Three cases: (1) wrapper spawns the fake server and propagates stdout + exit 0, (2) `SNOWBALL_BUNDLE_DIR` env var overrides `__dirname`, (3) missing `dist/server.cjs` exits 1 with the expected error. The test fails at the sanity check (the wrapper file doesn't exist yet) until Step 3.

```bash
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
fail() { echo "  [FAIL] $1" >&2; exit 1; }

# Sanity: the wrapper and resolver must exist (created in Task 2 and Step 3).
[ -f "$WRAPPER_SRC" ] || fail "wrapper not found at $WRAPPER_SRC"
[ -f "$RESOLVER_SRC" ] || fail "resolver not found at $RESOLVER_SRC"

# --- Case 1: wrapper spawns the fake server, propagates stdout, exits 0 ---
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT
cp "$WRAPPER_SRC" "$FIXTURE/run.cjs"
cp "$RESOLVER_SRC" "$FIXTURE/resolve-bundle-path.cjs"
mkdir -p "$FIXTURE/dist"
cat > "$FIXTURE/dist/server.cjs" <<'FAKE'
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
cat > "$FIXTURE2/dist/server.cjs" <<'FAKE_DIRNAME'
process.stdout.write("from-dirname\n");
process.exit(0);
FAKE_DIRNAME
mkdir -p "$FIXTURE2/snowball-capture/dist"
cat > "$FIXTURE2/snowball-capture/dist/server.cjs" <<'FAKE_ENV'
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
```

- [ ] **Step 2: Run the test — it should fail (TDD red)**

Run: `chmod +x tests/junie-cli/test-run-wrapper.sh && ./tests/junie-cli/test-run-wrapper.sh`

Expected: the script prints `[FAIL] wrapper not found at /<repo>/extensions/snowball/snowball-capture/run.cjs` and exits non-zero.

- [ ] **Step 3: Write the implementation (TDD green)**

Create `extensions/snowball/snowball-capture/run.cjs` with the exact content below. This is the wrapper — it resolves the server's path, forks Node, mirrors the child's exit. Signal forwarding is added in Task 4 by replacing this file with the signal-aware version.

```js
#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const {
  resolveBundlePath,
  BundlePathNotFoundError,
} = require("./resolve-bundle-path.cjs");

let resolved;
try {
  resolved = resolveBundlePath({
    env: process.env.SNOWBALL_BUNDLE_DIR,
    dirname: __dirname,
  });
} catch (err) {
  if (err instanceof BundlePathNotFoundError) {
    process.stderr.write("snowball-capture: cannot locate dist/server.cjs\n");
    process.stderr.write(`  tried SNOWBALL_BUNDLE_DIR=${err.hints.env || "<unset>"}\n`);
    process.stderr.write(`  tried dirname=${err.hints.dirname || "<unset>"}\n`);
    process.exit(1);
  }
  throw err;
}

const child = spawn(process.execPath, [resolved.path, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

// Mirror the child's exit so the loader sees the real outcome.
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code == null ? 1 : code);
  }
});
```

- [ ] **Step 4: Make the wrapper executable**

Run: `chmod +x extensions/snowball/snowball-capture/run.cjs && test -x extensions/snowball/snowball-capture/run.cjs && echo "executable"`

Expected: `executable`.

- [ ] **Step 5: Run the test — it should pass (TDD green)**

Run: `./tests/junie-cli/test-run-wrapper.sh`

Expected output:

```text
  [PASS] wrapper spawns fake server and propagates stdout
  [PASS] SNOWBALL_BUNDLE_DIR override wins over __dirname
  [PASS] missing dist/server.cjs exits 1 with expected error
All run-wrapper tests passed.
```

If any case fails, the wrapper implementation is wrong. Re-read the spec's "Components" section for the wrapper and fix the code in Step 3; do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add tests/junie-cli/test-run-wrapper.sh extensions/snowball/snowball-capture/run.cjs
git commit -m "feat(junie-cli): add run.cjs wrapper that resolves and spawns snowball-capture"
```

---

## Task 4: Signal forwarding — write failing test, then add handling to the wrapper

**Goal:** Make the wrapper forward `SIGTERM`/`SIGINT`/`SIGHUP` to the child server, wait for the child's exit, and exit with the child's exit code. The regression the chorus pragmatist flagged as load-bearing: a naive `child.kill(); process.exit()` leaves an orphan that survives its parent's death and looks like a server bug.

**Files:**

- Create: `tests/junie-cli/test-run-wrapper-signals.sh`
- Modify: `extensions/snowball/snowball-capture/run.cjs` (replace file with the signal-aware version)

- [ ] **Step 1: Write the failing test (TDD red)**

Create `tests/junie-cli/test-run-wrapper-signals.sh` with the exact content below. One case: start the wrapper, send `SIGTERM`, verify (a) the child received the signal (marker file written) and (b) the wrapper's exit code matches the child's exit code (0, not `128+15=143`).

```bash
#!/usr/bin/env bash
#
# test-run-wrapper-signals.sh — assert the run.cjs wrapper forwards
# SIGTERM to the child server. The regression the chorus pragmatist
# flagged as load-bearing: a naive child.kill(); process.exit() races
# and leaves an orphan that survives its parent's death.
#
# Run from the repo root: ./tests/junie-cli/test-run-wrapper-signals.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WRAPPER_SRC="$REPO_ROOT/extensions/snowball/snowball-capture/run.cjs"
RESOLVER_SRC="$REPO_ROOT/extensions/snowball/snowball-capture/resolve-bundle-path.cjs"

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1" >&2; exit 1; }

# Sanity: the wrapper and resolver must exist.
[ -f "$WRAPPER_SRC" ] || fail "wrapper not found at $WRAPPER_SRC"
[ -f "$RESOLVER_SRC" ] || fail "resolver not found at $RESOLVER_SRC"

# Build a fixture: a fake server that traps SIGTERM, writes a marker file,
# then exits 0. We construct the marker path via printf %q so the embedded
# path survives Node.js string-literal escaping.
FIXTURE="$(mktemp -d)"
MARKER="$FIXTURE/marker"
trap 'rm -rf "$FIXTURE"' EXIT
cp "$WRAPPER_SRC" "$FIXTURE/run.cjs"
cp "$RESOLVER_SRC" "$FIXTURE/resolve-bundle-path.cjs"
mkdir -p "$FIXTURE/dist"
cat > "$FIXTURE/dist/server.cjs" <<FAKE
process.on('SIGTERM', () => {
  require('fs').writeFileSync(${MARKER@Q}, 'got-sigterm');
  process.exit(0);
});
setInterval(() => {}, 1000);
FAKE

# Start the wrapper in the background. Use exec so the wrapper's PID is the
# node process's PID (kill targets the right thing).
node "$FIXTURE/run.cjs" &
WRAPPER_PID=$!

# Give the wrapper + child a moment to start.
sleep 0.5

# Send SIGTERM to the wrapper.
kill -TERM "$WRAPPER_PID"

# Wait for the wrapper to exit.
wait "$WRAPPER_PID"
status=$?

# Assert: marker file exists — child received SIGTERM.
if [ ! -f "$MARKER" ]; then
  fail "marker file not created — child did not receive SIGTERM (wrapper status=$status)"
fi

# Assert: wrapper exit code is 0 (matches child's exit), not 143 (128+SIGTERM).
# If the wrapper exited via process.kill before the child finished, we'd see 143.
if [ "$status" -ne 0 ]; then
  fail "wrapper exit code was $status, expected 0 (child's exit); orphan-after-SIGTERM regression"
fi

pass "wrapper forwards SIGTERM to child; child writes marker; wrapper exits 0"

echo "All run-wrapper-signals tests passed."
```

- [ ] **Step 2: Run the test — it should fail (TDD red)**

Run: `chmod +x tests/junie-cli/test-run-wrapper-signals.sh && ./tests/junie-cli/test-run-wrapper-signals.sh`

Expected: the test either hangs (the wrapper never exits because it doesn't forward the signal) or fails because the marker file is not created or the wrapper exits with a non-zero code. Either outcome is correct — the wrapper doesn't have signal handling yet.

- [ ] **Step 3: Replace the wrapper with the signal-aware version**

Overwrite `extensions/snowball/snowball-capture/run.cjs` with the exact content below. The diff from the Task 3 wrapper is the addition of the signal-forwarding loop and the use of `process.on` to forward each signal to the child before the child exits naturally.

```js
#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const {
  resolveBundlePath,
  BundlePathNotFoundError,
} = require("./resolve-bundle-path.cjs");

let resolved;
try {
  resolved = resolveBundlePath({
    env: process.env.SNOWBALL_BUNDLE_DIR,
    dirname: __dirname,
  });
} catch (err) {
  if (err instanceof BundlePathNotFoundError) {
    process.stderr.write("snowball-capture: cannot locate dist/server.cjs\n");
    process.stderr.write(`  tried SNOWBALL_BUNDLE_DIR=${err.hints.env || "<unset>"}\n`);
    process.stderr.write(`  tried dirname=${err.hints.dirname || "<unset>"}\n`);
    process.exit(1);
  }
  throw err;
}

const child = spawn(process.execPath, [resolved.path, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

// Forward signals the loader sends us. We register exactly one handler per
// signal to avoid Node's "warning: possible memory leak" — registering the
// same signal multiple times is a programmer error.
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => {
    try {
      child.kill(sig);
    } catch {
      // Child may have already exited; ignore.
    }
  });
}

// Mirror the child's exit (signal or code) so the loader sees the real
// outcome. This is the load-bearing detail: we wait for the child to
// actually exit (handled by the 'exit' event) before re-raising the signal
// on our own process. A naive child.kill(); process.exit() races.
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code == null ? 1 : code);
  }
});
```

- [ ] **Step 4: Re-run all three wrapper tests — they should still pass**

Run:

```bash
chmod +x extensions/snowball/snowball-capture/run.cjs
./tests/junie-cli/test-run-wrapper.sh
./tests/junie-cli/test-run-wrapper-signals.sh
```

Expected: both scripts print all `[PASS]` lines, exit 0. The basic-wrapper test must still pass after the signal-handling additions (no regression).

- [ ] **Step 5: Commit**

```bash
git add tests/junie-cli/test-run-wrapper-signals.sh extensions/snowball/snowball-capture/run.cjs
git commit -m "feat(junie-cli): forward SIGTERM/SIGINT/SIGHUP in run.cjs wrapper"
```

---

## Task 5: Install script — write failing test, then implement

**Goal:** Ship `install-path-fix.cjs` — the user-invoked post-install rewriter that replaces the relative path in `mcp/mcp.json` with an absolute path. Cross-platform Node.js so Windows is covered. Calls the same resolver file as the wrapper.

**Files:**

- Create: `tests/junie-cli/test-install-path-fix.sh`
- Create: `extensions/snowball/scripts/install-path-fix.cjs`

- [ ] **Step 1: Write the failing test (TDD red)**

Create `tests/junie-cli/test-install-path-fix.sh` with the exact content below. Four cases: (1) rewrites `mcp.json` with an absolute path, (2) idempotent (second run produces no diff), (3) rewritten config parses and the path inside it actually exists, (4) missing `mcp.json` exits 1 with the expected error.

```bash
#!/usr/bin/env bash
#
# test-install-path-fix.sh — assert the install-path-fix.cjs script
# correctly rewrites mcp/mcp.json with absolute paths to the wrapper,
# is idempotent, and handles the missing-config error case.
#
# Run from the repo root: ./tests/junie-cli/test-install-path-fix.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_SRC="$REPO_ROOT/extensions/snowball/scripts/install-path-fix.cjs"
RESOLVER_SRC="$REPO_ROOT/extensions/snowball/snowball-capture/resolve-bundle-path.cjs"

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1" >&2; exit 1; }

# Sanity: the install script and resolver must exist.
[ -f "$INSTALL_SRC" ] || fail "install script not found at $INSTALL_SRC"
[ -f "$RESOLVER_SRC" ] || fail "resolver not found at $RESOLVER_SRC"

# --- Case 1: rewrites mcp.json with absolute path to wrapper ---
FIXTURE="$(mktemp -d)"
mkdir -p "$FIXTURE/extensions/snowball/scripts"
mkdir -p "$FIXTURE/extensions/snowball/snowball-capture"
mkdir -p "$FIXTURE/extensions/snowball/mcp"
cp "$INSTALL_SRC" "$FIXTURE/extensions/snowball/scripts/install-path-fix.cjs"
cp "$RESOLVER_SRC" "$FIXTURE/extensions/snowball/snowball-capture/resolve-bundle-path.cjs"
# Fake wrapper so the install script's wrapperPath exists on disk.
printf '// fake wrapper\n' > "$FIXTURE/extensions/snowball/snowball-capture/run.cjs"
# Initial mcp.json with the relative path the spec prescribes.
cat > "$FIXTURE/extensions/snowball/mcp/mcp.json" <<'INITIAL'
{
  "mcpServers": {
    "snowball-capture": {
      "command": "node",
      "args": ["../snowball-capture/run.cjs"]
    },
    "argdown": {
      "command": "argdown-mcp",
      "args": []
    }
  }
}
INITIAL

# Run the install script.
node "$FIXTURE/extensions/snowball/scripts/install-path-fix.cjs"

# Assert: mcp.json now has an absolute path to run.cjs, and the argdown
# entry is unchanged.
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$FIXTURE/extensions/snowball/mcp/mcp.json', 'utf8'));
  const arg = cfg.mcpServers['snowball-capture'].args[0];
  if (!arg.startsWith('/')) throw new Error('expected absolute path, got: ' + arg);
  if (!arg.endsWith('snowball-capture/run.cjs')) throw new Error('expected path to run.cjs, got: ' + arg);
  if (!cfg.mcpServers['argdown']) throw new Error('argdown entry was removed');
"
pass "rewrites mcp.json with absolute path to wrapper (preserves other servers)"

# --- Case 2: idempotent (second run produces no diff) ---
cp "$FIXTURE/extensions/snowball/mcp/mcp.json" "$FIXTURE/before.json"
node "$FIXTURE/extensions/snowball/scripts/install-path-fix.cjs"
if diff -q "$FIXTURE/before.json" "$FIXTURE/extensions/snowball/mcp/mcp.json" >/dev/null; then
  pass "second run is idempotent (no diff)"
else
  fail "second run produced a diff — install script is not idempotent"
fi

# --- Case 3: rewritten config parses and the path inside it actually exists ---
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('$FIXTURE/extensions/snowball/mcp/mcp.json', 'utf8'));
  const arg = cfg.mcpServers['snowball-capture'].args[0];
  if (!fs.existsSync(arg)) throw new Error('rewritten path does not exist: ' + arg);
"
pass "rewritten config parses and path inside it exists"

# --- Case 4: missing mcp.json exits 1 with expected error ---
FIXTURE4="$(mktemp -d)"
mkdir -p "$FIXTURE4/extensions/snowball/scripts"
mkdir -p "$FIXTURE4/extensions/snowball/snowball-capture"
cp "$INSTALL_SRC" "$FIXTURE4/extensions/snowball/scripts/install-path-fix.cjs"
cp "$RESOLVER_SRC" "$FIXTURE4/extensions/snowball/snowball-capture/resolve-bundle-path.cjs"
# Intentionally do NOT create mcp.json.

set +e
out=$(node "$FIXTURE4/extensions/snowball/scripts/install-path-fix.cjs" 2>&1)
status=$?
set -e

trap 'rm -rf "$FIXTURE" "$FIXTURE4"' EXIT

if [ "$status" -ne 1 ]; then
  fail "expected exit 1, got $status (output: $out)"
fi
if ! echo "$out" | grep -q "cannot find"; then
  fail "expected 'cannot find' in stderr, got: $out"
fi
pass "missing mcp.json exits 1 with expected error"

echo "All install-path-fix tests passed."
```

- [ ] **Step 2: Run the test — it should fail (TDD red)**

Run: `chmod +x tests/junie-cli/test-install-path-fix.sh && ./tests/junie-cli/test-install-path-fix.sh`

Expected: the script prints `[FAIL] install script not found at /<repo>/extensions/snowball/scripts/install-path-fix.cjs` and exits non-zero.

- [ ] **Step 3: Write the implementation (TDD green)**

Create `extensions/snowball/scripts/install-path-fix.cjs` with the exact content below. Cross-platform Node.js. Reads `mcp/mcp.json` relative to the script's own location, replaces the `snowball-capture` entry's `args[0]` with the absolute path to `run.cjs`, writes the config back, and prints what it did.

```js
#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const bundleRoot = path.join(__dirname, "..");
const configPath = path.join(bundleRoot, "mcp", "mcp.json");

if (!fs.existsSync(configPath)) {
  process.stderr.write(`snowball install-path-fix: cannot find ${configPath}\n`);
  process.stderr.write("  expected: extensions/snowball/scripts/install-path-fix.cjs\n");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const wrapperPath = path.join(bundleRoot, "snowball-capture", "run.cjs");

config.mcpServers["snowball-capture"] = {
  command: "node",
  args: [wrapperPath],
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
process.stdout.write(`snowball install-path-fix: rewrote ${configPath}\n`);
process.stdout.write(`  snowball-capture -> ${wrapperPath}\n`);
```

Note: the `require("../snowball-capture/resolve-bundle-path.cjs")` import shown in the spec's install-script snippet is intentionally omitted here. The install script's job is to rewrite the config to an absolute path; the resolver is for the *wrapper* to find the inner server at start time, not for the install script. Importing the resolver from the install script would create a coupling that adds no value (the resolver doesn't know how to find the wrapper; it only knows how to find `dist/server.cjs` from the wrapper's `__dirname`).

- [ ] **Step 4: Make the install script executable**

Run: `chmod +x extensions/snowball/scripts/install-path-fix.cjs && test -x extensions/snowball/scripts/install-path-fix.cjs && echo "executable"`

Expected: `executable`.

- [ ] **Step 5: Run the test — it should pass (TDD green)**

Run: `./tests/junie-cli/test-install-path-fix.sh`

Expected output:

```text
  [PASS] rewrites mcp.json with absolute path to wrapper (preserves other servers)
  [PASS] second run is idempotent (no diff)
  [PASS] rewritten config parses and path inside it exists
  [PASS] missing mcp.json exits 1 with expected error
All install-path-fix tests passed.
```

If any case fails, the install script implementation is wrong. Re-read the spec's "Components" section for `install-path-fix.cjs` and fix the code; do not weaken the test.

- [ ] **Step 6: Commit**

```bash
git add tests/junie-cli/test-install-path-fix.sh extensions/snowball/scripts/install-path-fix.cjs
git commit -m "feat(junie-cli): add install-path-fix.cjs post-install rewriter"
```

---

## Task 6: Update `mcp/mcp.json` to point at the wrapper

**Goal:** Change the `snowball-capture` server's `args[0]` from the `<absolute-path-to-snowball>` placeholder to the relative path to the wrapper. No other content changes.

**Files:**

- Modify: `extensions/snowball/mcp/mcp.json`

- [ ] **Step 1: Read the current file**

Run: `cat extensions/snowball/mcp/mcp.json`

Expected: the file contains the `snowball-capture` server with `args[0]` set to `"<absolute-path-to-snowball>/extensions/snowball/snowball-capture/dist/server.cjs"`.

- [ ] **Step 2: Confirm only `args[0]` needs to change**

Run: `python3 -m json.tool extensions/snowball/mcp/mcp.json | grep -A4 "snowball-capture" | head -10`

Expected: shows the `snowball-capture` server block with the placeholder. The other two servers (`argdown`, `codebase-memory`) are unchanged.

- [ ] **Step 3: Replace the placeholder with the relative path to the wrapper**

Using `multi_edit` (or the equivalent in your editor), change `args[0]` from:

```json
        "args": ["<absolute-path-to-snowball>/extensions/snowball/snowball-capture/dist/server.cjs"]
```

to:

```json
        "args": ["../snowball-capture/run.cjs"]
```

Leave the `argdown` and `codebase-memory` entries exactly as they are. Do not reformat the file (preserve the existing indentation and key order).

- [ ] **Step 4: Verify the JSON still parses and the change is correct**

Run: `python3 -m json.tool extensions/snowball/mcp/mcp.json | grep -A4 "snowball-capture" | head -10`

Expected: shows the `snowball-capture` server block with `"args": ["../snowball-capture/run.cjs"]`. The other two servers are unchanged.

- [ ] **Step 5: Re-run the marketplace validation test to confirm the change doesn't break it**

Run: `./tests/junie-cli/validate-marketplace.sh`

Expected: all three `[PASS]` lines, exit 0. The marketplace test only checks the file's existence and the presence of `mcpServers`; the placeholder change doesn't affect it.

- [ ] **Step 6: Commit**

```bash
git add extensions/snowball/mcp/mcp.json
git commit -m "refactor(junie-cli): point mcp/mcp.json at run.cjs wrapper instead of dist/server.cjs placeholder"
```

---

## Task 7: Wire the four new tests into pre-commit

**Goal:** The four new bash tests run on every commit that touches the path-resolution files. Single hook entry that runs all four; mirrors the pattern in the existing pre-commit config.

**Files:**

- Modify: `.pre-commit-config.yaml` (append one new local hook entry)

- [ ] **Step 1: Append the new hook entry**

Edit `.pre-commit-config.yaml`. Find the last hook entry in the file (the `bun-test-snowball-capture` entry, which ends at line 143 with `pass_filenames: false`). After its closing line, append a new local hook entry:

```yaml
      - id: test-junie-cli-path-resolution
        name: test junie-cli path-resolution
        entry: bash -c 'set -e; for t in tests/junie-cli/test-resolve-bundle-path.sh tests/junie-cli/test-run-wrapper.sh tests/junie-cli/test-run-wrapper-signals.sh tests/junie-cli/test-install-path-fix.sh; do echo "==> $t"; "$t"; done'
        language: system
        files: ^tests/junie-cli/test-(resolve-bundle-path|run-wrapper|run-wrapper-signals|install-path-fix)\.sh$|^extensions/snowball/(snowball-capture/(run|resolve-bundle-path)\.cjs|scripts/install-path-fix\.cjs|mcp/mcp\.json)$
        pass_filenames: false
```

The hook re-runs on changes to the test files plus the four code files they exercise (`run.cjs`, `resolve-bundle-path.cjs`, `install-path-fix.cjs`, `mcp/mcp.json`). The `entry` runs all four tests in sequence; the first failure exits non-zero and aborts the commit.

- [ ] **Step 2: Verify the YAML still parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.pre-commit-config.yaml'))" && echo "yaml valid"`

Expected: `yaml valid`.

- [ ] **Step 3: Run the new hook against the changed files**

Run: `pre-commit run test-junie-cli-path-resolution --files tests/junie-cli/test-resolve-bundle-path.sh tests/junie-cli/test-run-wrapper.sh tests/junie-cli/test-run-wrapper-signals.sh tests/junie-cli/test-install-path-fix.sh extensions/snowball/snowball-capture/run.cjs extensions/snowball/snowball-capture/resolve-bundle-path.cjs extensions/snowball/scripts/install-path-fix.cjs extensions/snowball/mcp/mcp.json`

Expected: the hook prints `test junie-cli path-resolution` and exits 0. The output should show all four sub-tests passing:

```text
==> tests/junie-cli/test-resolve-bundle-path.sh
  [PASS] env set + valid returns env path
  ...
==> tests/junie-cli/test-run-wrapper.sh
  [PASS] wrapper spawns fake server and propagates stdout
  ...
==> tests/junie-cli/test-run-wrapper-signals.sh
  [PASS] wrapper forwards SIGTERM to child; child writes marker; wrapper exits 0
==> tests/junie-cli/test-install-path-fix.sh
  [PASS] rewrites mcp.json with absolute path to wrapper (preserves other servers)
  ...
test junie-cli path-resolution...............................................Passed
```

If `pre-commit` is not installed in this environment, run the four bash tests directly:

```bash
for t in tests/junie-cli/test-resolve-bundle-path.sh tests/junie-cli/test-run-wrapper.sh tests/junie-cli/test-run-wrapper-signals.sh tests/junie-cli/test-install-path-fix.sh; do
  echo "==> $t"
  "$t"
done
```

Expected: all four pass.

- [ ] **Step 4: Confirm the existing pre-commit hooks still pass on the new files**

Run: `pre-commit run --files tests/junie-cli/test-resolve-bundle-path.sh tests/junie-cli/test-run-wrapper.sh tests/junie-cli/test-run-wrapper-signals.sh tests/junie-cli/test-install-path-fix.sh extensions/snowball/snowball-capture/run.cjs extensions/snowball/snowball-capture/resolve-bundle-path.cjs extensions/snowball/scripts/install-path-fix.cjs || true`

Expected: shellcheck, shfmt, oxlint, and oxfmt all report the new files as clean. The `oxlint` and `oxfmt` exclude regex (in pre-commit-config.yaml lines 38 and 45) explicitly excludes `extensions/snowball/snowball-capture/dist/`, but not the new `.cjs` files at the same level — the new files WILL be linted/formatted. If oxlint/oxfmt reports issues, fix them in the new files.

- [ ] **Step 5: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "ci(pre-commit): wire junie-cli path-resolution tests into the local hook list"
```

---

## Task 8: Update README — changelog sub-bullet

**Goal:** Reflect the path-resolution fix in the README's "What is different from upstream" changelog table. One-line sub-bullet under the v6.3.0 row.

**Files:**

- Modify: `README.md` (one location)

- [ ] **Step 1: Find the v6.3.0 row in the changelog table**

Run: `grep -n "v6.3.0" README.md`

Expected: a line number pointing at the v6.3.0 row in the "What is different from upstream" table.

- [ ] **Step 2: Read the row's current text**

Run: `sed -n '<line_number>p' README.md`

Expected: a markdown table row that mentions Junie (JetBrains IDE plugin) support, the marketplace entry, and the snowball-capture MCP server. The second column is the description.

- [ ] **Step 3: Append the sub-bullet to the row's description**

The second column is a long sentence. Replace the trailing period with a new sentence that documents the fix. For example, if the row currently reads:

```markdown
| v6.3.0 | Junie (JetBrains IDE plugin) support: forward spine via skills + AGENTS.md; decision spine via `snowball-capture` MCP server (partial — Junie has no hook rail). Junie CLI discoverability: `.junie-extension/marketplace.json` lets Junie CLI users `/extensions marketplace add https://github.com/kellenff/snowball` and install via `/extensions install snowball`. |
```

Replace it with:

```markdown
| v6.3.0 | Junie (JetBrains IDE plugin) support: forward spine via skills + AGENTS.md; decision spine via `snowball-capture` MCP server (partial — Junie has no hook rail). Junie CLI discoverability: `.junie-extension/marketplace.json` lets Junie CLI users `/extensions marketplace add https://github.com/kellenff/snowball` and install via `/extensions install snowball`. MCP path-resolution fix: `mcp/mcp.json` now uses a runtime-resolution wrapper; works after marketplace install without manual path edits. |
```

If the row's current text differs (because the marketplace groundwork is in a different state on disk), append the same trailing sentence regardless. The exact text can be adjusted to match the surrounding voice.

- [ ] **Step 4: Render the README and confirm the change is in place**

Run: `grep -n "MCP path-resolution fix" README.md`

Expected: one line containing the new sub-bullet text.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): note MCP path-resolution fix in v6.3.0 changelog row"
```

---

## Task 9: Update RELEASE-NOTES — sub-bullet under v6.3.0

**Goal:** Sub-bullet under the existing v6.3.0 section noting the path-resolution fix.

**Files:**

- Modify: `RELEASE-NOTES.md` (one location)

- [ ] **Step 1: Find the v6.3.0 section**

Run: `grep -n "^## v6.3.0" RELEASE-NOTES.md`

Expected: a line number pointing at the v6.3.0 heading.

- [ ] **Step 2: Read the section's current bullets**

Run: `sed -n '<line_number>,+20p' RELEASE-NOTES.md`

Expected: three or four existing bullets describing the marketplace entry, the IDE-plugin support, and the snowball-capture MCP server.

- [ ] **Step 3: Append the new sub-bullet**

After the last existing bullet in the v6.3.0 section, add:

```markdown
- **MCP path-resolution fix** — `extensions/snowball/mcp/mcp.json` no longer carries a `<absolute-path-to-snowball>` placeholder. A new `run.cjs` wrapper around `snowball-capture` resolves the server's path at start time from `SNOWBALL_BUNDLE_DIR` or its own `__dirname`; an optional `scripts/install-path-fix.cjs` rewrites the config with absolute paths for adapters that don't resolve relative paths. Works after marketplace install without manual path edits.
```

- [ ] **Step 4: Confirm the change is in place**

Run: `grep -n "MCP path-resolution fix" RELEASE-NOTES.md`

Expected: one line containing the new sub-bullet text.

- [ ] **Step 5: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): note MCP path-resolution fix under v6.3.0"
```

---

## Task 10: End-to-end smoke test (out of scope for automation)

**Goal:** Confirm the path-resolution fix works against a real Junie CLI install. This is a one-time pre-release smoke test the author runs before tagging. Not automated in CI; the spec's "Manual verification" section is the source of truth.

**Files:** none modified; produces no commit.

- [ ] **Step 1: Re-run all four junie-cli tests and the marketplace test**

Run:

```bash
for t in tests/junie-cli/validate-marketplace.sh tests/junie-cli/test-resolve-bundle-path.sh tests/junie-cli/test-run-wrapper.sh tests/junie-cli/test-run-wrapper-signals.sh tests/junie-cli/test-install-path-fix.sh; do
  echo "==> $t"
  "$t"
done
```

Expected: all five scripts pass. Any failure here blocks the manual verification below.

- [ ] **Step 2: Run the pre-commit hook end-to-end**

Run: `pre-commit run --all-files`

Expected: every hook (including the new `test-junie-cli-path-resolution`) reports `Passed`. The pre-commit framework runs the same hooks the new files would run in CI.

- [ ] **Step 3: Manual verification against Junie CLI** (requires Junie CLI installed and authenticated)

If you have Junie CLI available, follow the spec's "Manual verification" section (steps 1-9). The key checks are:

- Step 5: `/mcp` shows `snowball-capture` Active after a fresh marketplace install (no manual path edit).
- Step 6: Running the install script twice produces no diff (idempotence).
- Step 8: Sending `SIGTERM` to the wrapper's child shuts down cleanly with no orphan error.

If Junie CLI is not available in this environment, document that the smoke test is deferred to a developer machine in the PR description.

- [ ] **Step 4: Document the result in the PR description**

When opening the PR, link the spec (`docs/snowball/specs/2026-06-17-mcp-path-resolution-fix-design.md`), this plan, and note any deviations from the manual verification steps. If any pre-commit hook failed in Step 2, fix the underlying code and re-run before opening the PR.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
| --- | --- |
| Goals 1, 2 — marketplace + clone-and-point both work | Tasks 6, 7, 10 |
| Goal 3 — path-agnostic resolution | Tasks 2, 3 (env + dirname both work; future paths covered by the resolver's two-hint strategy) |
| Goal 4 — three new files, no installer coupling | Tasks 2, 3, 5 |
| Goal 5 — resolver is unit-testable in isolation | Task 2 (6-case matrix) |
| Component 1: `resolve-bundle-path.cjs` | Task 2 |
| Component 2: `run.cjs` wrapper | Tasks 3, 4 (basic + signal) |
| Component 3: `install-path-fix.cjs` | Task 5 |
| Updated `mcp/mcp.json` | Task 6 |
| Test 1: `test-resolve-bundle-path.sh` | Task 2 |
| Test 2: `test-run-wrapper.sh` | Task 3 |
| Test 3: `test-run-wrapper-signals.sh` | Task 4 |
| Test 4: `test-install-path-fix.sh` | Task 5 |
| Pre-commit integration | Task 7 |
| Marketplace spec (Open Question 2) | Already done in spec-writing turn; verified in Task 1 Step 5 |
| README + RELEASE-NOTES updates | Tasks 8, 9 |
| Manual verification | Task 10 |
| Open Question 1 (adapter survey) | Deferred per spec; not in this plan |
| Open Question 2 (JAR packaging) | Deferred per spec; not in this plan |
| Open Question 3 (env-var semantics) | Documented in the spec's "Decisions" table; the resolver treats empty string as unset (Task 2 case 5 verifies) |

No spec gap.

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "add appropriate error handling" patterns. Every code block is complete. Every command has expected output. The one inline note in Task 5 Step 3 explains the deliberate omission of the `resolve-bundle-path.cjs` import from the install script (the resolver is for the wrapper, not the install script) and is not a placeholder.

**3. Type consistency:**

| Symbol | Defined in | Used in |
| --- | --- | --- |
| `resolveBundlePath` | Task 2 (`resolve-bundle-path.cjs`) | Tasks 3, 4 (`run.cjs`) |
| `BundlePathNotFoundError` | Task 2 (`resolve-bundle-path.cjs`) | Task 3 (`run.cjs`, `instanceof` check) |
| `SNOWBALL_BUNDLE_DIR` | Task 2 (resolver reads) | Tasks 3, 4 (test sets), 5 (mentioned in RELEASE-NOTES) |
| `run.cjs` | Task 3 (basic), Task 4 (signal-aware) | Tasks 5, 6 (config points at it), 7 (pre-commit watches it), 8 (mentioned in README) |
| `install-path-fix.cjs` | Task 5 | Tasks 7 (pre-commit), 9 (RELEASE-NOTES) |
| `mcp/mcp.json` | Marketplace plan | Task 6 (path change) |

No drift. The wrapper file is created in Task 3 and replaced (not duplicated) in Task 4 — Task 4's Step 3 overwrites Task 3's output with the signal-aware version. Both tests run against the same final file.

**4. Test isolation:**

- The resolver test (`test-resolve-bundle-path.sh`) runs the real resolver against a temp-dir fixture; it does not mock the file system. The `checkExists: false` flag in cases 1 and 6 is the only escape hatch, and it's a documented API.
- The wrapper test (`test-run-wrapper.sh`) copies the real wrapper and resolver into a temp dir, runs a fake `dist/server.cjs` there, and asserts the wrapper's behavior. No mocking layer.
- The signal test (`test-run-wrapper-signals.sh`) uses a fake `dist/server.cjs` that traps SIGTERM and writes a marker file; the test asserts the marker file exists and the wrapper exits 0. The marker file is the contract test for "child got the signal" — no mocks.
- The install-script test (`test-install-path-fix.sh`) copies the real install script and resolver into a temp-dir bundle layout, runs the script, and asserts the rewrite. No mocks.

All four tests run against the real binaries; failures point at real bugs.

**5. Pre-commit integration:**

The single hook entry added in Task 7 runs all four tests. The `files` regex matches the test files plus the four code files they exercise. The hook aborts the commit on the first failure. Existing hooks (shellcheck, shfmt, oxlint, oxfmt, markdownlint-cli2) continue to run on the new files because none of them match the `extensions/snowball/snowball-capture/dist/` exclude pattern.
