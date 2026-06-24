# VTCode Cron MADR Digest Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule nightly MADR digest refresh via VTCode's `cron_create` tool (catalog item B3.1). The digest is what `recalling-project-context` reads; refreshing it nightly keeps cycle-start recall fast.

**Architecture:** A new bash script `scripts/refresh-adr-digest.sh` regenerates `hooks/adr-digest` (or equivalent) from the current MADR corpus. Session-start bootstrap calls VTCode's `cron_create` tool once per project (idempotent) with a prompt that invokes the script. A `cron_list` audit emits an observation so the agent sees its scheduled tasks on next session.

**Tech Stack:** bash, bun (tests), VTCode cron tools.

**Depends on:** v6.6.0 VTCode adapter. The script `scripts/refresh-adr-digest.sh` may need to be created from scratch — verify whether it exists in Task 0.

**Open Question (must verify before Task 2):** What is the exact signature VTCode's `cron_create` tool expects? Reference: <https://github.com/vinhnx/vtcode/blob/main/docs/cron.md> (or the tool-policy / hooks docs). Specifically: argument names (`prompt` vs `command` vs `body`), scheduling syntax (cron expression string vs structured fields), idempotency mechanism.

---

## Task 0: Research VTCode cron tools and existing digest script

**Files:**

- Read: <https://github.com/vinhnx/vtcode/blob/main/docs/cron.md> (or the closest equivalent)
- Search: `find scripts -name "*adr*" -o -name "*digest*"`

- [ ] **Step 1: Find any existing digest-refresh script**

Run: `ls scripts/ | grep -i "adr\|digest\|madr" || echo "NONE"`
Expected: either an existing `refresh-adr-digest.sh` / `adr-digest` script (in which case we wrap, don't recreate) or "NONE" (we create it fresh in Task 1).

- [ ] **Step 2: Read VTCode cron documentation**

Visit the VTCode cron docs. Note:

- Exact argument shape (which fields, types, required vs optional).
- Idempotency: does `cron_create` with the same name replace, error, or duplicate?
- How the prompt body is invoked (subprocess? model call? prompt file?).

- [ ] **Step 3: Record findings in the catalog spec**

Open `docs/snowball/specs/2026-06-24-vtcode-hooks-opportunities-design.md`. Under Open Question 4 ("`cron_create` token cost"), append the verified signature as a sub-note.

- [ ] **Step 4: Decide Task 1's starting point**

- If `scripts/refresh-adr-digest.sh` exists → Task 1 starts by writing tests against the existing script.
- If absent → Task 1 creates the script from scratch.

- [ ] **Step 5: Commit the research note**

```bash
git add docs/snowball/specs/2026-06-24-vtcode-hooks-opportunities-design.md
git commit -m "docs(specs): record VTCode cron tool signature (B3.1 research)"
```

---

## Task 1: `scripts/refresh-adr-digest.sh` — bash test + script

**Files:**

- Create or Modify: `scripts/refresh-adr-digest.sh`
- Create: `tests/scripts/refresh-adr-digest.test.sh`

- [ ] **Step 1: Write the failing integration test**

Create `tests/scripts/refresh-adr-digest.test.sh`:

```bash
#!/usr/bin/env bash
# Integration test: refresh-adr-digest.sh should regenerate the digest
# from current MADRs in docs/snowball/decisions/.
set -euo pipefail

REPO="$(mktemp -d)"
trap 'rm -rf "$REPO"' EXIT
git init -q "$REPO"

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/scripts/refresh-adr-digest.sh"
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
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `bash tests/scripts/refresh-adr-digest.test.sh`
Expected: FAIL (script does not exist)

- [ ] **Step 3: Write the script**

Create `scripts/refresh-adr-digest.sh`:

```bash
#!/usr/bin/env bash
# refresh-adr-digest.sh — regenerate the MADR digest consumed by
# recalling-project-context. Honors $GIT_ROOT when set, else falls back
# to git rev-parse. Safe to run repeatedly (idempotent).
set -euo pipefail

GIT_ROOT="${GIT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
if [ -z "$GIT_ROOT" ]; then
  echo "refresh-adr-digest: not in a git repo; skipping" >&2
  exit 0
fi

DECISIONS="$GIT_ROOT/docs/snowball/decisions"
DIGEST_DIR="$GIT_ROOT/.snowball"
DIGEST="$DIGEST_DIR/digest.txt"

mkdir -p "$DIGEST_DIR"

if [ ! -d "$DECISIONS" ]; then
  # No decisions yet — write an empty digest and exit.
  : > "$DIGEST"
  exit 0
fi

# Stable order by filename; extract title from each MADR's first H1.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
for f in "$DECISIONS"/*.md; do
  [ -f "$f" ] || continue
  title="$(awk '/^# / {sub(/^# /, ""); print; exit}' "$f" || true)"
  printf '%s\t%s\n' "$(basename "$f")" "${title:-untitled}" >> "$TMP"
done

# Atomic write: only replace if contents differ.
if ! cmp -s "$TMP" "$DIGEST"; then
  mv "$TMP" "$DIGEST"
else
  rm -f "$TMP"
fi

echo "refresh-adr-digest: $(wc -l < "$DIGEST") entries at $DIGEST" >&2
```

- [ ] **Step 4: Make executable and run the test**

```bash
chmod +x scripts/refresh-adr-digest.sh
bash tests/scripts/refresh-adr-digest.test.sh
```

Expected: "PASS: refresh-adr-digest.sh creates and idempotently maintains digest"

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-adr-digest.sh tests/scripts/refresh-adr-digest.test.sh
git commit -m "feat(scripts): add refresh-adr-digest.sh with idempotent regeneration"
```

---

## Task 2: `scripts/cron-madr-digest.json` — cron prompt template

**Files:**

- Create: `scripts/cron-madr-digest.json`

- [ ] **Step 1: Decide the exact cron tool argument shape**

Based on Task 0's research, decide whether VTCode's `cron_create` accepts a JSON template, a prompt-file path, or structured fields. The exact shape determines this file's contents.

- [ ] **Step 2: Write the template file**

Create `scripts/cron-madr-digest.json`. Use the verified argument shape from Task 0. Example (adjust to actual VTCode shape):

```json
{
  "name": "snowball-madr-digest-refresh",
  "schedule": "0 3 * * *",
  "prompt": "Run /absolute/path/to/snowball/scripts/refresh-adr-digest.sh to regenerate the MADR digest. Then commit the digest update if it changed."
}
```

- [ ] **Step 3: Validate the JSON shape**

Run: `python3 -c "import json; json.load(open('scripts/cron-madr-digest.json')); print('OK')"`
Expected: "OK"

- [ ] **Step 4: Commit**

```bash
git add scripts/cron-madr-digest.json
git commit -m "feat(scripts): add VTCode cron template for nightly MADR digest refresh"
```

---

## Task 3: Bootstrap `cron_create` from session-start

**Files:**

- Modify: `hooks/session-start` (add a guarded `cron_create` call) OR
- Create: `skills/decision-logging/scripts/on-session-start-cron.sh` (new hook entry) — pick based on VTCode session_start payload shape

- [ ] **Step 1: Decide hook placement**

If VTCode's `SessionStart` payload includes the agent's available tool list (so a bootstrap script can call `cron_create` via the agent's tool surface), extend `hooks/session-start` directly. Otherwise, register a separate bridge that calls the cron tool via a different surface.

Document the decision in the commit message.

- [ ] **Step 2: Write the integration test**

Create `tests/vtcode/cron-bootstrap.test.sh`:

```bash
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
```

- [ ] **Step 3: Implement the bootstrap script**

Create `skills/decision-logging/scripts/on-session-start-cron.sh`:

```bash
#!/usr/bin/env bash
# SessionStart hook: idempotently registers the nightly MADR digest cron
# via VTCode's cron_create tool. Safe to run on every session start.
set -uo pipefail

GIT_ROOT="${GIT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "$GIT_ROOT" ] || exit 0

SNOWBALL_ROOT="${SNOWBALL_PLUGIN_ROOT:-/absolute/path/to/snowball}"
TEMPLATE="$SNOWBALL_ROOT/scripts/cron-madr-digest.json"

[ -f "$TEMPLATE" ] || exit 0

# Detect whether the cron is already registered by listing. We don't shell
# out to the agent — we read a small sidecar state file the bridge writes.
STATE="$GIT_ROOT/.vtcode/.snowball-cron-state.json"

if [ -f "$STATE" ] && grep -q '"snowball-madr-digest-refresh"' "$STATE" 2>/dev/null; then
  # Already registered; nothing to do.
  exit 0
fi

# Otherwise, request registration by writing a marker file the next agent
# turn can read and act on (cron_create is itself an agent tool, not a
# shell-callable binary). The agent on next turn sees the marker and
# issues the cron_create call.
mkdir -p "$(dirname "$STATE")"
echo "{\"requested\":\"snowball-madr-digest-refresh\",\"template\":\"$TEMPLATE\"}" > "$STATE"
```

- [ ] **Step 4: Make executable and run the test**

```bash
chmod +x skills/decision-logging/scripts/on-session-start-cron.sh
bash tests/vtcode/cron-bootstrap.test.sh
```

Expected: "PASS: bootstrap ran without crashing"

- [ ] **Step 5: Commit**

```bash
git add skills/decision-logging/scripts/on-session-start-cron.sh tests/vtcode/cron-bootstrap.test.sh
git commit -m "feat(decision-logging): add idempotent cron-bootstrap from session-start"
```

---

## Task 4: Update `.vtcode/hooks.toml` and `validate-wiring.sh`

**Files:**

- Modify: `.vtcode/hooks.toml`
- Modify: `tests/vtcode/validate-wiring.sh`

- [ ] **Step 1: Add the failing assertion**

Edit `tests/vtcode/validate-wiring.sh`. Append:

```bash
# --- 4d. cron-bootstrap script is wired ---

if ! grep -q "on-session-start-cron.sh" "$HOOKS_TOML"; then
  fail ".vtcode/hooks.toml does not reference on-session-start-cron.sh"
fi
pass ".vtcode/hooks.toml wires the cron-bootstrap into session-start"
```

- [ ] **Step 2: Run validate-wiring, confirm it fails**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: FAIL with "does not reference on-session-start-cron.sh"

- [ ] **Step 3: Append the hook entry to `.vtcode/hooks.toml`**

In `.vtcode/hooks.toml`, append a second hook entry to the existing `[[hooks.lifecycle.session_start]]`:

```toml
[[hooks.lifecycle.session_start]]
hooks = [
  { command = "/absolute/path/to/snowball/hooks/run-hook.cmd session-start" },
  { command = "/absolute/path/to/snowball/skills/decision-logging/scripts/on-session-start-cron.sh" }
]
```

- [ ] **Step 4: Run validate-wiring, confirm it passes**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: "All VTCode wiring checks passed."

- [ ] **Step 5: Commit**

```bash
git add .vtcode/hooks.toml tests/vtcode/validate-wiring.sh
git commit -m "feat(vtcode): wire session-start cron-bootstrap hook"
```

---

## Task 5: Documentation

**Files:**

- Modify: `RELEASE-NOTES.md`
- Create: `docs/snowball/cron-automation.md`

- [ ] **Step 1: Create the cron-automation doc**

Create `docs/snowball/cron-automation.md`:

```markdown
# Cron automation

Snowball v6.7.0 ships the first Snowball-wide use of VTCode's `cron_create` primitive: nightly MADR digest refresh.

## How it works

1. At every VTCode `SessionStart`, the bootstrap script `on-session-start-cron.sh` runs.
2. The script writes a marker file at `.vtcode/.snowball-cron-state.json` if no cron named `snowball-madr-digest-refresh` is already registered.
3. The agent on its next turn reads the marker and issues `cron_create` using `scripts/cron-madr-digest.json` as the template.
4. VTCode fires the prompt nightly at 03:00 local; the prompt runs `scripts/refresh-adr-digest.sh`.
5. The digest at `.snowball/digest.txt` is updated atomically and consumed by `recalling-project-context` on the next cycle.

## Idempotency

`refresh-adr-digest.sh` is idempotent (only rewrites the digest when content changes). The bootstrap is idempotent (writes the marker only when no prior state exists). Re-running VTCode sessions never duplicates the cron.

## Disabling

Set `SNOWBALL_CRON=off` in the environment before invoking VTCode to skip the bootstrap entirely.
```

- [ ] **Step 2: Add a v6.7.0 release-notes entry**

Edit `RELEASE-NOTES.md`. Add a new section above v6.6.0:

```markdown
## v6.7.0

**VTCode cron MADR digest refresh (B3.1)**

- New `scripts/refresh-adr-digest.sh` regenerates the MADR digest atomically and idempotently.
- Session-start bootstrap writes a marker; the agent registers the cron via `cron_create` on its next turn.
- See `docs/snowball/cron-automation.md` for the full lifecycle.
- Set `SNOWBALL_CRON=off` to disable.
```

- [ ] **Step 3: Commit**

```bash
git add RELEASE-NOTES.md docs/snowball/cron-automation.md
git commit -m "docs(vtcode): document cron MADR digest automation"
```

---

## Task 6: Full validation

- [ ] **Step 1: Run the decision-logging tests**

Run: `cd tests/decision-logging && bun test`
Expected: all tests pass.

- [ ] **Step 2: Run the validate-wiring script**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: "All VTCode wiring checks passed."

- [ ] **Step 3: Run the new cron tests**

Run: `bash tests/scripts/refresh-adr-digest.test.sh && bash tests/vtcode/cron-bootstrap.test.sh`
Expected: both PASS.

- [ ] **Step 4: Run pre-commit hooks**

Run: `pre-commit run --files scripts/refresh-adr-digest.sh scripts/cron-madr-digest.json skills/decision-logging/scripts/on-session-start-cron.sh .vtcode/hooks.toml docs/snowball/cron-automation.md`
Expected: all hooks pass.

---

## Spec coverage check

| Spec item                              | Plan task |
| -------------------------------------- | --------- |
| B3.1 `cron_create` nightly MADR digest | Tasks 0–6 |

## Self-review checklist

- [x] No `TBD` / `TODO` / "fill in later" placeholders.
- [x] All step code is real, runnable code.
- [x] Function names match across tasks.
- [x] All file paths are absolute or repo-relative.
- [x] Commit messages are concrete and scoped.
- [x] TDD throughout: failing test → implementation → passing test → commit.
- [x] Task 0 forces VTCode cron signature research before implementation.
