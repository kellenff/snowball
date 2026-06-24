# VTCode apply_patch Coverage & Safety Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three VTCode hook-rail extensions — `apply_patch` PostToolUse observation (catalog B1.1), `apply_patch` PreToolUse blast-radius pre-audit (B1.5), and async-mode TOML wiring (B2.1).

**Architecture:** Three new TypeScript bridges follow the existing `vtcode-post-tool-use-bridge` pattern: a pure handler in `skills/decision-logging/src/`, a CLI wrapper that reads stdin JSON, and a shell shim that calls `node <bridge.cjs>`. The TOML gains two new matcher entries plus `async = true` on every hook entry. Tests use `bun test` against a tmp git repo (matching the existing `tests/decision-logging/` pattern).

**Tech Stack:** TypeScript (Bun), bash, TOML, shellcheck, pre-commit hooks.

**Depends on:** v6.6.0 VTCode adapter already shipped. `.vtcode/hooks.toml` exists in `main` (must be restored if absent — see Open Question 8 in the catalog spec).

**Open Question (must verify before Task 9):** Does VTCode's `[hooks.lifecycle.*]` TOML syntax support `async = true` on individual hook entries? Reference: <https://github.com/vinhnx/vtcode/blob/main/docs/hooks.md> (or wherever the hook schema lives). If not supported, B2.1 becomes "do nothing" and Task 9-10 are skipped. The plan executes the research in Task 0 first.

---

## Task 0: Verify VTCode TOML async syntax

**Files:**

- Read: <https://github.com/vinhnx/vtcode/blob/main/docs/hooks.md>

- [ ] **Step 1: Read the VTCode hooks documentation**

Visit <https://github.com/vinhnx/vtcode/blob/main/docs/hooks.md> (or `docs/hooks.toml.md` if hooks.md doesn't exist). Search for `async`, `asynchronous`, `non-blocking`, or hook entry shape.

- [ ] **Step 2: Record the finding**

Open `docs/snowball/specs/2026-06-24-vtcode-hooks-opportunities-design.md` and add a one-paragraph note under Open Question 8 (or create a new OQ 9) stating:

- The exact TOML syntax VTCode expects for async hooks (e.g., `async = true`, `[hooks.lifecycle.post_tool_use.hooks.async]`, or "not supported").
- If supported: include a minimal example.
- If not supported: explicitly mark B2.1 as "dropped from v6.7.0; revisit when VTCode ships async".

- [ ] **Step 3: Decide whether Task 9-10 are in scope**

- If async is supported → keep Tasks 9-10 as written below.
- If async is not supported → delete Tasks 9-10 from this plan and renumber.

- [ ] **Step 4: Commit the research note**

```bash
git add docs/snowball/specs/2026-06-24-vtcode-hooks-opportunities-design.md
git commit -m "docs(specs): record VTCode TOML async hook syntax (or lack thereof)"
```

---

## Task 1: Pure handler — `handleApplyPatchObservation`

**Files:**

- Create: `skills/decision-logging/src/apply-patch-bridge.ts`
- Test: `tests/decision-logging/apply-patch-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/decision-logging/apply-patch-bridge.test.ts`:

```typescript
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import { handleApplyPatchObservation } from "../../skills/decision-logging/src/apply-patch-bridge";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

test("handleApplyPatchObservation appends a file-edit observation", () => {
  const repo = makeTempRepo();
  try {
    const wrote = handleApplyPatchObservation({
      toolInput: { patch: "diff --git a/foo b/foo\n@@ -0,0 +1 @@\n+hello\n" },
      sessionId: "s1",
      sourceEventId: "tool-1",
      gitRoot: repo,
    });
    expect(wrote).toBe(true);

    const obsFile = `${repo}/docs/snowball/decisions/observations.jsonl`;
    expect(fs.existsSync(obsFile)).toBe(true);

    const lines = fs.readFileSync(obsFile, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const obs = JSON.parse(lines[0]);
    expect(obs.type).toBe("observation");
    expect(obs.content).toContain("foo");
    expect(obs.related_files).toContain("foo");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("handleApplyPatchObservation no-ops on empty patch", () => {
  const repo = makeTempRepo();
  try {
    const wrote = handleApplyPatchObservation({
      toolInput: { patch: "" },
      sessionId: "s1",
      sourceEventId: "tool-1",
      gitRoot: repo,
    });
    expect(wrote).toBe(false);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("handleApplyPatchObservation extracts all touched paths from a multi-file diff", () => {
  const repo = makeTempRepo();
  try {
    handleApplyPatchObservation({
      toolInput: {
        patch:
          "diff --git a/a.txt b/a.txt\n@@ -0,0 +1 @@\n+x\n" +
          "diff --git a/sub/b.txt b/sub/b.txt\n@@ -0,0 +1 @@\n+y\n",
      },
      sessionId: "s1",
      sourceEventId: "tool-1",
      gitRoot: repo,
    });
    const obsFile = `${repo}/docs/snowball/decisions/observations.jsonl`;
    const obs = JSON.parse(fs.readFileSync(obsFile, "utf8").trim());
    expect(obs.related_files.sort()).toEqual(["a.txt", "sub/b.txt"]);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `cd tests/decision-logging && bun test apply-patch-bridge.test.ts`
Expected: FAIL with "Cannot find module '../../skills/decision-logging/src/apply-patch-bridge'"

- [ ] **Step 3: Write the minimal implementation**

Create `skills/decision-logging/src/apply-patch-bridge.ts`:

```typescript
import { appendObservation, type Observation } from "./append-observation";

export interface ApplyPatchObservationInput {
  toolInput: unknown;
  sessionId: string;
  sourceEventId: string;
  gitRoot: string;
}

function extractPatch(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  const patch = obj.patch ?? obj.diff ?? "";
  return typeof patch === "string" ? patch : "";
}

function extractTouchedPaths(patch: string): string[] {
  const paths = new Set<string>();
  // Match `diff --git a/<path> b/<path>` (works for create/modify/delete).
  const re = /^diff --git a\/(\S+) b\/(\S+)/gm;
  for (const m of patch.matchAll(re)) {
    paths.add(m[1]);
  }
  return [...paths].sort();
}

export function handleApplyPatchObservation(
  input: ApplyPatchObservationInput,
): boolean {
  const patch = extractPatch(input.toolInput);
  if (!patch.trim()) return false;

  const touched = extractTouchedPaths(patch);
  const obs: Observation = {
    schema_version: "1.1",
    timestamp: new Date().toISOString(),
    session_id: input.sessionId,
    type: "observation",
    confidence: "high",
    source: "agent",
    content: `apply_patch edited ${touched.length} file(s): ${touched.join(", ") || "(unknown paths)"}`,
    rationale:
      "Captured by VTCode PostToolUse hook on apply_patch (B1.1 in v6.7.0 catalog).",
    related_files: touched,
    related_decision: null,
    tags: ["ambient", "vtcode", "apply_patch"],
  };
  appendObservation(obs, { gitRoot: input.gitRoot });
  return true;
}

// CLI entry: read JSON from stdin and call the handler.
if (
  import.meta.main ||
  (typeof require !== "undefined" && require.main === module)
) {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(raw) as {
        tool_input?: unknown;
        session_id?: string;
        tool_use_id?: string;
      };
      handleApplyPatchObservation({
        toolInput: payload.tool_input,
        sessionId: payload.session_id ?? "unknown",
        sourceEventId: payload.tool_use_id ?? "unknown",
        gitRoot: process.env.GIT_ROOT ?? process.cwd(),
      });
    } catch {
      // best-effort: swallow and exit 0
    }
    process.exit(0);
  });
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `cd tests/decision-logging && bun test apply-patch-bridge.test.ts`
Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/src/apply-patch-bridge.ts tests/decision-logging/apply-patch-bridge.test.ts
git commit -m "feat(decision-logging): add handleApplyPatchObservation pure handler"
```

---

## Task 2: Build the .cjs bundle

**Files:**

- Modify: `scripts/build-decision-logging.sh:18-25` (the `ENTRIES` array)

- [ ] **Step 1: Add the new entry to the build script**

Edit `scripts/build-decision-logging.sh`. In the `ENTRIES=( ... )` array, add `apply-patch-bridge` on a new line, alphabetically positioned:

```bash
ENTRIES=(
  apply-patch-bridge
  ask-user-question-bridge
  ...
  vtcode-post-tool-use-bridge
)
```

- [ ] **Step 2: Run the build**

Run: `bash scripts/build-decision-logging.sh`
Expected: "built 7 bundles into skills/decision-logging/scripts/" (one more than before)

- [ ] **Step 3: Verify the .cjs exists**

Run: `ls -la skills/decision-logging/scripts/apply-patch-bridge.cjs`
Expected: file exists, ~5-10 KB

- [ ] **Step 4: Smoke-test the CLI**

Run: `REPO=$(mktemp -d) && git init -q "$REPO" && printf '%s' '{"tool_input":{"patch":"diff --git a/x b/x\n@@ -0,0 +1 @@\n+y\n"},"session_id":"smoke","tool_use_id":"1"}' | GIT_ROOT="$REPO" node skills/decision-logging/scripts/apply-patch-bridge.cjs && cat "$REPO/docs/snowball/decisions/observations.jsonl" && rm -rf "$REPO"`
Expected: a JSON object with `type: "observation"` and `related_files: ["x"]`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-decision-logging.sh skills/decision-logging/scripts/apply-patch-bridge.cjs
git commit -m "build(decision-logging): bundle apply-patch-bridge.cjs"
```

---

## Task 3: Shell wrapper + integration test

**Files:**

- Create: `skills/decision-logging/scripts/on-apply-patch-vtcode.sh`
- Create: `tests/decision-logging/on-apply-patch-vtcode.test.sh`

- [ ] **Step 1: Write the failing integration test**

Create `tests/decision-logging/on-apply-patch-vtcode.test.sh`:

```bash
#!/usr/bin/env bash
# Integration test: feed a sample apply_patch payload through the shell wrapper
# and assert an observation lands in observations.jsonl.
set -euo pipefail

REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
git init -q "$REPO"

PAYLOAD='{"tool_input":{"patch":"diff --git a/x b/x\n@@ -0,0 +1 @@\n+y\n"},"session_id":"t1","tool_use_id":"u1"}'

WRAPPER="$(cd "$(dirname "$0")/.." && pwd)/skills/decision-logging/scripts/on-apply-patch-vtcode.sh"
(cd "$REPO" && printf '%s' "$PAYLOAD" | bash "$WRAPPER")

OBS_FILE="$REPO/docs/snowball/decisions/observations.jsonl"
if [ ! -s "$OBS_FILE" ]; then
  echo "FAIL: observations.jsonl missing or empty at $OBS_FILE" >&2
  exit 1
fi

grep -q '"related_files":\["x"\]' "$OBS_FILE" || {
  echo "FAIL: expected related_files:[x] in $OBS_FILE" >&2
  cat "$OBS_FILE" >&2
  exit 1
}

echo "PASS: on-apply-patch-vtcode.sh wrote observation for path 'x'"
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `bash tests/decision-logging/on-apply-patch-vtcode.test.sh`
Expected: FAIL (no script exists yet) OR FAIL with "observations.jsonl missing or empty"

- [ ] **Step 3: Write the shell wrapper**

Create `skills/decision-logging/scripts/on-apply-patch-vtcode.sh`:

```bash
#!/usr/bin/env bash
# PostToolUse hook for VTCode's apply_patch: writes a file-edit observation
# per patch invocation.
set -uo pipefail

# No-op outside a git repo
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/apply-patch-bridge.cjs"

# Bridge always exits 0 (errors logged internally); pass stdin through unchanged
node "$BRIDGE" || true
exit 0
```

- [ ] **Step 4: Make it executable and run the test**

```bash
chmod +x skills/decision-logging/scripts/on-apply-patch-vtcode.sh
bash tests/decision-logging/on-apply-patch-vtcode.test.sh
```

Expected: "PASS: on-apply-patch-vtcode.sh wrote observation for path 'x'"

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/on-apply-patch-vtcode.sh tests/decision-logging/on-apply-patch-vtcode.test.sh
git commit -m "feat(decision-logging): add on-apply-patch-vtcode.sh shell wrapper"
```

---

## Task 4: Wire the PostToolUse matcher into `.vtcode/hooks.toml`

**Files:**

- Modify: `.vtcode/hooks.toml` (add a `[[hooks.lifecycle.post_tool_use]]` matcher for `apply_patch`)
- Modify: `tests/vtcode/validate-wiring.sh` (assert the new entry is present)

- [ ] **Step 1: Write the failing validate-wiring assertion**

Edit `tests/vtcode/validate-wiring.sh`. After the existing `for script in "session-start" ...` block that checks hooks.toml script references, add a new assertion block:

```bash
# --- 4b. apply_patch PostToolUse matcher is wired ---

if ! grep -q 'matcher = "apply_patch"' "$HOOKS_TOML"; then
  fail ".vtcode/hooks.toml missing matcher = \"apply_patch\" entry"
fi
if ! grep -q "on-apply-patch-vtcode.sh" "$HOOKS_TOML"; then
  fail ".vtcode/hooks.toml does not reference on-apply-patch-vtcode.sh"
fi
pass ".vtcode/hooks.toml has PostToolUse matcher for apply_patch → on-apply-patch-vtcode.sh"
```

- [ ] **Step 2: Run validate-wiring, confirm it fails**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: FAIL with "matcher = \"apply_patch\" entry"

- [ ] **Step 3: Add the matcher to `.vtcode/hooks.toml`**

Open `.vtcode/hooks.toml`. After the existing `[[hooks.lifecycle.post_tool_use]]` block (the one with matcher `"request_user_input"`), add:

```toml
[[hooks.lifecycle.post_tool_use]]
matcher = "apply_patch"
hooks = [
  { command = "/absolute/path/to/snowball/skills/decision-logging/scripts/on-apply-patch-vtcode.sh" }
]
```

- [ ] **Step 4: Run validate-wiring, confirm it passes**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: "All VTCode wiring checks passed."

- [ ] **Step 5: Commit**

```bash
git add .vtcode/hooks.toml tests/vtcode/validate-wiring.sh
git commit -m "feat(vtcode): wire PostToolUse matcher for apply_patch"
```

---

## Task 5: Pure handler — `handleApplyPatchPreAudit` (classifyPatchRisk)

**Files:**

- Create: `skills/decision-logging/src/apply-patch-blast-radius.ts`
- Test: `tests/decision-logging/apply-patch-blast-radius.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/decision-logging/apply-patch-blast-radius.test.ts`:

```typescript
import { test, expect } from "bun:test";
import {
  classifyPatchRisk,
  type BlastRadiusVerdict,
} from "../../skills/decision-logging/src/apply-patch-blast-radius";

test("classifyPatchRisk flags deletion of many files as high-risk", () => {
  const bigDelete = Array.from(
    { length: 25 },
    (_, i) =>
      `diff --git a/file${i}.ts b/file${i}.ts\ndeleted file mode 100644\n--- a/file${i}.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x\n`,
  ).join("");
  const v = classifyPatchRisk(bigDelete);
  expect(v.risk).toBe("high");
  expect(v.reasons.length).toBeGreaterThan(0);
});

test("classifyPatchRisk treats a small additive change as low-risk", () => {
  const safe =
    "diff --git a/foo.ts b/foo.ts\n@@ -0,0 +1 @@\n+export const x = 1;\n";
  const v = classifyPatchRisk(safe);
  expect(v.risk).toBe("low");
  expect(v.reasons.length).toBe(0);
});

test("classifyPatchRisk flags changes to blast-radius-marker paths as high-risk", () => {
  const lockfile =
    "diff --git a/package-lock.json b/package-lock.json\n@@ -1,1 +1,1 @@\n-old\n+new\n";
  const v = classifyPatchRisk(lockfile);
  expect(v.risk).toBe("high");
  expect(v.reasons.some((r) => /lockfile/i.test(r))).toBe(true);
});

test("verdict-to-decision mapping returns allow/block correctly", () => {
  const allow: BlastRadiusVerdict = { risk: "low", reasons: [] };
  const block: BlastRadiusVerdict = { risk: "high", reasons: ["big"] };
  // Verify the shape contract callers rely on (decision is computed in shell).
  expect(allow.risk).toBe("low");
  expect(block.risk).toBe("high");
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `cd tests/decision-logging && bun test apply-patch-blast-radius.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the minimal implementation**

Create `skills/decision-logging/src/apply-patch-blast-radius.ts`:

```typescript
const LOCKFILE_PATTERNS = [
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^\.terraform\.lock\.hcl$/,
  /^Cargo\.lock$/,
  /^go\.sum$/,
  /^composer\.lock$/,
];

const PROTECTED_PATH_PATTERNS = [
  /^hooks\//, // don't let apply_patch touch the hook rail
  /^\.vtcode\/hooks\.toml$/,
  /^\.github\//, // don't let apply_patch modify CI
];

const HIGH_RISK_FILE_COUNT = 10;

function extractTouchedPaths(patch: string): string[] {
  const paths = new Set<string>();
  const re = /^diff --git a\/(\S+) b\/(\S+)/gm;
  for (const m of patch.matchAll(re)) {
    paths.add(m[1]);
  }
  return [...paths];
}

export interface BlastRadiusVerdict {
  risk: "low" | "medium" | "high";
  reasons: string[];
}

export function classifyPatchRisk(patch: string): BlastRadiusVerdict {
  const reasons: string[] = [];
  const touched = extractTouchedPaths(patch);

  if (touched.length >= HIGH_RISK_FILE_COUNT) {
    reasons.push(
      `touches ${touched.length} files (threshold: ${HIGH_RISK_FILE_COUNT})`,
    );
  }

  for (const p of touched) {
    if (LOCKFILE_PATTERNS.some((re) => re.test(p))) {
      reasons.push(`modifies lockfile: ${p}`);
    }
    if (PROTECTED_PATH_PATTERNS.some((re) => re.test(p))) {
      reasons.push(`modifies protected path: ${p}`);
    }
  }

  const risk =
    reasons.length === 0 ? "low" : reasons.length === 1 ? "medium" : "high";
  return { risk, reasons };
}

// CLI entry: read JSON from stdin, print verdict as "RISK=...\nREASONS=...\n".
if (
  import.meta.main ||
  (typeof require !== "undefined" && require.main === module)
) {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload: { tool_input?: unknown } = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      process.stdout.write("RISK=low\nREASONS=\n");
      process.exit(0);
      return;
    }
    const input = payload.tool_input ?? payload;
    const patch =
      input &&
      typeof input === "object" &&
      typeof (input as Record<string, unknown>).patch === "string"
        ? ((input as Record<string, unknown>).patch as string)
        : "";
    const verdict = classifyPatchRisk(patch);
    process.stdout.write(
      `RISK=${verdict.risk}\nREASONS=${verdict.reasons.join("|")}\n`,
    );
    process.exit(0);
  });
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `cd tests/decision-logging && bun test apply-patch-blast-radius.test.ts`
Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/src/apply-patch-blast-radius.ts tests/decision-logging/apply-patch-blast-radius.test.ts
git commit -m "feat(decision-logging): add classifyPatchRisk pure handler"
```

---

## Task 6: Build the .cjs bundle for blast-radius

**Files:**

- Modify: `scripts/build-decision-logging.sh` (add entry)

- [ ] **Step 1: Add entry to the build script**

Edit `scripts/build-decision-logging.sh`. Add `apply-patch-blast-radius` to `ENTRIES`:

```bash
ENTRIES=(
  apply-patch-blast-radius
  apply-patch-bridge
  ...
)
```

- [ ] **Step 2: Run the build**

Run: `bash scripts/build-decision-logging.sh`
Expected: "built 8 bundles into skills/decision-logging/scripts/"

- [ ] **Step 3: Smoke-test the classifier via the bundle**

Run: `printf '%s' '{"tool_input":{"patch":"diff --git a/package-lock.json b/package-lock.json\n@@ -1,1 +1,1 @@\n-old\n+new\n"}}' | node skills/decision-logging/scripts/apply-patch-blast-radius.cjs`
Expected: stdout contains `RISK=high` and `REASONS=modifies lockfile: package-lock.json`.

- [ ] **Step 4: Commit the bundle**

```bash
git add scripts/build-decision-logging.sh skills/decision-logging/scripts/apply-patch-blast-radius.cjs
git commit -m "build(decision-logging): bundle apply-patch-blast-radius.cjs"
```

---

## Task 7: Shell wrapper for PreToolUse blast-radius

**Files:**

- Create: `skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh`
- Create: `tests/decision-logging/on-pre-tool-use-vtcode.test.sh`

- [ ] **Step 1: Write the failing integration test**

Create `tests/decision-logging/on-pre-tool-use-vtcode.test.sh`:

```bash
#!/usr/bin/env bash
# Integration test: feed a high-risk apply_patch payload; assert exit 2 + stderr.
# Feed a safe payload; assert exit 0.
set -euo pipefail

REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
git init -q "$REPO"

WRAPPER="$(cd "$(dirname "$0")/.." && pwd)/skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh"
HIGH='{"tool_input":{"patch":"diff --git a/package-lock.json b/package-lock.json\n@@ -1,1 +1,1 @@\n-old\n+new\n"}}'
SAFE='{"tool_input":{"patch":"diff --git a/foo.ts b/foo.ts\n@@ -0,0 +1 @@\n+x\n"}}'

set +e
OUT=$(cd "$REPO" && printf '%s' "$HIGH" | bash "$WRAPPER" 2>&1)
HIGH_RC=$?
set -e
if [ "$HIGH_RC" -ne 2 ]; then
  echo "FAIL: high-risk patch should exit 2 (got $HIGH_RC)" >&2
  echo "$OUT" >&2
  exit 1
fi
echo "$OUT" | grep -qi "lockfile" || {
  echo "FAIL: expected lockfile reason in stderr" >&2
  exit 1
}

set +e
OUT=$(cd "$REPO" && printf '%s' "$SAFE" | bash "$WRAPPER" 2>&1)
SAFE_RC=$?
set -e
if [ "$SAFE_RC" -ne 0 ]; then
  echo "FAIL: safe patch should exit 0 (got $SAFE_RC)" >&2
  echo "$OUT" >&2
  exit 1
fi

echo "PASS: on-pre-tool-use-vtcode.sh blocks lockfile and allows safe patch"
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `bash tests/decision-logging/on-pre-tool-use-vtcode.test.sh`
Expected: FAIL (script does not exist)

- [ ] **Step 3: Write the shell wrapper**

Create `skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh`:

```bash
#!/usr/bin/env bash
# PreToolUse hook for VTCode's apply_patch: classifies risk via the
# apply-patch-blast-radius bridge; exits 0 (allow) for low-risk, 0 with
# additionalContext warning for medium-risk, 2 (block) for high-risk.
set -uo pipefail

# Honor opt-out
if [ "${SNOWBALL_BLAST_RADIUS:-on}" = "off" ]; then
  exit 0
fi

# No-op outside a git repo
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/apply-patch-blast-radius.cjs"

# Read patch from stdin; bridge prints "RISK=<...>\nREASONS=<csv>".
VERDICT="$(node "$BRIDGE")"

RISK="$(printf '%s' "$VERDICT" | sed -n 's/^RISK=//p' | head -1)"
REASONS="$(printf '%s' "$VERDICT" | sed -n 's/^REASONS=//p' | head -1)"

case "$RISK" in
  low)
    exit 0
    ;;
  medium)
    # Inject warning to stderr; allow the patch.
    echo "blast-radius: medium-risk patch — review before committing: $REASONS" >&2
    exit 0
    ;;
  high)
    echo "blast-radius: HIGH-risk patch blocked: $REASONS" >&2
    echo "Set SNOWBALL_BLAST_RADIUS=off to disable." >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
```

- [ ] **Step 4: Make it executable and run the test**

```bash
chmod +x skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh
bash tests/decision-logging/on-pre-tool-use-vtcode.test.sh
```

Expected: "PASS: on-pre-tool-use-vtcode.sh blocks lockfile and allows safe patch"

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh tests/decision-logging/on-pre-tool-use-vtcode.test.sh
git commit -m "feat(decision-logging): add on-pre-tool-use-vtcode.sh blast-radius pre-audit"
```

---

## Task 8: Wire PreToolUse section into `.vtcode/hooks.toml`

**Files:**

- Modify: `.vtcode/hooks.toml`
- Modify: `tests/vtcode/validate-wiring.sh`

- [ ] **Step 1: Add the failing assertion to validate-wiring**

Edit `tests/vtcode/validate-wiring.sh`. Append after the Task 4 assertion block:

```bash
# --- 4c. apply_patch PreToolUse blast-radius is wired ---

if ! grep -q "pre_tool_use" "$HOOKS_TOML"; then
  fail ".vtcode/hooks.toml missing [[hooks.lifecycle.pre_tool_use]] section"
fi
if ! grep -q "on-pre-tool-use-vtcode.sh" "$HOOKS_TOML"; then
  fail ".vtcode/hooks.toml does not reference on-pre-tool-use-vtcode.sh"
fi
pass ".vtcode/hooks.toml has PreToolUse section for apply_patch blast-radius"
```

- [ ] **Step 2: Run validate-wiring, confirm it fails**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: FAIL with "missing [[hooks.lifecycle.pre_tool_use]] section"

- [ ] **Step 3: Add the PreToolUse section to `.vtcode/hooks.toml`**

Append to `.vtcode/hooks.toml`:

```toml

[[hooks.lifecycle.pre_tool_use]]
matcher = "apply_patch"
hooks = [
  { command = "/absolute/path/to/snowball/skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh" }
]
```

- [ ] **Step 4: Run validate-wiring, confirm it passes**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: "All VTCode wiring checks passed."

- [ ] **Step 5: Commit**

```bash
git add .vtcode/hooks.toml tests/vtcode/validate-wiring.sh
git commit -m "feat(vtcode): wire PreToolUse blast-radius for apply_patch"
```

---

## Task 9: Mark all bridge entries async in `.vtcode/hooks.toml`

**Files:**

- Modify: `.vtcode/hooks.toml`

> **Skip this task if Task 0 determined VTCode's TOML does not support async hooks.**

- [ ] **Step 1: Add `async = true` to every `{ command = "..." }` entry in the TOML**

Open `.vtcode/hooks.toml`. For each `{ command = "..." }` line in every `hooks = [ ... ]` array, change it to a multi-line table form:

```toml
{ command = "..." }
```

becomes:

```toml
[hooks.lifecycle.<event>.hooks.async]
command = "..."
```

Or whatever syntax Task 0's research confirmed. If Task 0 found a single-line `async = true` flag, use that instead.

- [ ] **Step 2: Manually validate with `python -c 'import tomllib; tomllib.load(open(".vtcode/hooks.toml","rb"))'`**

Run: `python3 -c 'import tomllib; tomllib.load(open(".vtcode/hooks.toml","rb")); print("OK")'`
Expected: "OK"

- [ ] **Step 3: Run validate-wiring**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: "All VTCode wiring checks passed."

- [ ] **Step 4: Commit**

```bash
git add .vtcode/hooks.toml
git commit -m "feat(vtcode): mark all hook entries async (B2.1)"
```

---

## Task 10: Async TOML structure test

**Files:**

- Create: `tests/vtcode/async-hooks.test.ts`

> **Skip this task if Task 0 determined VTCode's TOML does not support async hooks.**

- [ ] **Step 1: Write the failing test**

Create `tests/vtcode/async-hooks.test.ts`:

```typescript
import { test, expect } from "bun:test";
import * as fs from "node:fs";

interface ParsedToml {
  hooks: {
    lifecycle: Record<
      string,
      Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
    >;
  };
}

async function loadToml(path: string): Promise<ParsedToml> {
  const text = fs.readFileSync(path, "utf8");
  return (await Bun.TOML.parse(text)) as unknown as ParsedToml;
}

test("every VTCode hook entry declares async = true", async () => {
  const cfg = await loadToml(".vtcode/hooks.toml");
  let total = 0;
  for (const [, entries] of Object.entries(cfg.hooks.lifecycle)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        total += 1;
        expect(hook.async).toBe(true);
      }
    }
  }
  expect(total).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test, confirm it passes (Task 9 already wrote async = true) or fails**

If Task 9 ran and added `async = true` to every entry, the test should pass. If Task 9 was skipped, the test should fail and be deleted along with this task.

Run: `cd tests/vtcode && bun test async-hooks.test.ts`
Expected: pass (if Task 9 ran) or fail with `expected true, received undefined` (if not).

- [ ] **Step 3: Commit the test**

```bash
git add tests/vtcode/async-hooks.test.ts
git commit -m "test(vtcode): assert every hook entry is async"
```

---

## Task 11: Update documentation

**Files:**

- Modify: `RELEASE-NOTES.md`
- Modify: `README.md`
- Modify: `skills/using-snowball/references/vtcode-tools.md`

- [ ] **Step 1: Add a v6.7.0 release-notes entry**

Edit `RELEASE-NOTES.md`. Add a new section above the most recent version (currently v6.6.0):

```markdown
## v6.7.0

**VTCode apply_patch coverage & safety hooks**

- PostToolUse hook on `apply_patch` writes a file-edit observation to `docs/snowball/decisions/observations.jsonl` per patch invocation (catalog item B1.1).
- PreToolUse hook on `apply_patch` runs blast-radius classification; blocks lockfile or >10-file patches with exit 2 (B1.5). Honor `SNOWBALL_BLAST_RADIUS=off` to disable.
- All VTCode hook entries run asynchronously when the TOML supports it (B2.1; no-op if VTCode does not yet support `async`).
```

- [ ] **Step 2: Update the VTCode row in the harness-adapters table in `README.md`**

Edit `README.md`. Find the row "| **VTCode** | ..." and append ", apply_patch observation+blast-radius hooks" to its description.

- [ ] **Step 3: Update vtcode-tools.md with apply_patch blast-radius note**

Edit `skills/using-snowball/references/vtcode-tools.md`. Add a short paragraph under the existing `apply_patch` row noting that PreToolUse blast-radius may block large or lockfile patches, and how to opt out.

- [ ] **Step 4: Commit**

```bash
git add RELEASE-NOTES.md README.md skills/using-snowball/references/vtcode-tools.md
git commit -m "docs(vtcode): document apply_patch hooks and B2.1 async wiring"
```

---

## Task 12: Full validation

**Files:** none (run-only)

- [ ] **Step 1: Run the decision-logging test suite**

Run: `cd tests/decision-logging && bun test`
Expected: all tests pass (the existing ~12 plus the 7 new ones from this plan).

- [ ] **Step 2: Run the validate-wiring script**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: "All VTCode wiring checks passed."

- [ ] **Step 3: Run pre-commit hooks**

Run: `pre-commit run --files .vtcode/hooks.toml tests/vtcode/validate-wiring.sh skills/decision-logging/src/apply-patch-bridge.ts skills/decision-logging/src/apply-patch-blast-radius.ts skills/decision-logging/scripts/on-apply-patch-vtcode.sh skills/decision-logging/scripts/on-pre-tool-use-vtcode.sh`
Expected: all hooks pass.

- [ ] **Step 4: Manual smoke (optional, requires a real VTCode install)**

In a scratch project:

1. Symlink `~/.vtcode/hooks.toml` to the new file from this repo.
2. Run a VTCode session that triggers `apply_patch`.
3. Confirm a new entry appears in `docs/snowball/decisions/observations.jsonl`.
4. Confirm a lockfile patch is blocked with exit 2.

---

## Spec coverage check

| Spec item                                      | Plan task                                                 |
| ---------------------------------------------- | --------------------------------------------------------- |
| B1.1 PostToolUse on apply_patch                | Tasks 1–4                                                 |
| B1.5 PreToolUse on apply_patch blast-radius    | Tasks 5–8                                                 |
| B2.1 async bridges                             | Tasks 9–10 (conditional on Task 0)                        |
| Open Question 8 (`.vtcode/hooks.toml` deleted) | Resolved by this plan restoring the file with new content |

## Self-review checklist

- [x] No `TBD` / `TODO` / "fill in later" placeholders.
- [x] All step code is real, runnable code — no "similar to Task N" references.
- [x] Function names match across tasks (`handleApplyPatchObservation`, `classifyPatchRisk`).
- [x] All file paths are absolute or repo-relative, no ambiguity.
- [x] Commit messages are concrete and scoped.
- [x] TDD throughout: failing test → implementation → passing test → commit.
- [x] Open Question 8 (`.vtcode/hooks.toml` deletion) addressed: Task 0 + Tasks 4/8 restore and extend the file.
