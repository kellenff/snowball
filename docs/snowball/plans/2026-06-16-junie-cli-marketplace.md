# Junie CLI Marketplace Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `extensions/snowball/` Junie extension discoverable through Junie CLI's marketplace system so users can `/extensions marketplace add https://github.com/kellenff/snowball` and `/extensions install snowball`.

**Architecture:** A thin `.junie-extension/marketplace.json` at the repo root wraps the existing extension as a single entry. The marketplace is a list of pointers; per-extension metadata lives in `extensions/snowball/extension.json`, which gets enriched with `author`, `homepage`, `repository`, `license`, and `keywords`, and a version bump from `0.1.0` to `6.3.0` to match the rest of the repo. Inside the bundle, the MCP config is renamed from `mcp/.mcp.json` to `mcp/mcp.json` to align with the documented Junie convention. A stdlib-only bash test asserts the marketplace wiring is intact; pre-commit runs the test on every change.

**Tech Stack:** Bash (validation test, stdlib-only — no `jq` dependency), `python3 -m json.tool` for JSON validation, git, pre-commit.

**Spec:** [`docs/snowball/specs/2026-06-16-junie-cli-marketplace-design.md`](../specs/2026-06-16-junie-cli-marketplace-design.md)

---

## File Structure

**Created:**

```text
.junie-extension/
└── marketplace.json                              # thin wrapper, one extension entry

tests/junie-cli/
├── README.md                                     # one-paragraph doc
└── validate-marketplace.sh                       # the validation test
```

**Modified:**

- `extensions/snowball/extension.json` — enriched with `author`, `homepage`, `repository`, `license`, `keywords`; version `0.1.0` → `6.3.0`.
- `extensions/snowball/mcp/mcp.json` — created via `git mv` of `mcp/.mcp.json` (identical content).
- `extensions/snowball/mcp/.mcp.json` — deleted via the same `git mv`.
- `.pre-commit-config.yaml` — adds a `validate-junie-cli-marketplace` local hook entry.
- `README.md` — per-harness table annotation + changelog sub-bullet under v6.3.0.
- `RELEASE-NOTES.md` — sub-bullet under v6.3.0 noting the marketplace entry.

**Not touched:**

- `extensions/snowball/.junie/AGENTS.md`
- `extensions/snowball/skills/`
- `extensions/snowball/snowball-capture/`
- `skills/decision-logging/`
- `tests/snowball-capture/`
- `.claude-plugin/` (Claude Code marketplace; separate from Junie)
- `.codex-plugin/`, `.cursor-plugin/`, `gemini-extension.json`, `.gitlab/duo/`, `.opencode/`

---

## Task 1: Add `.junie-extension/marketplace.json`

**Goal:** Ship the thin marketplace wrapper that Junie CLI reads when a user registers the snowball repo as a custom marketplace.

**Files:**

- Create: `.junie-extension/marketplace.json`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .junie-extension
```

- [ ] **Step 2: Write the marketplace manifest**

Create `.junie-extension/marketplace.json` with the exact content from the spec's Components section:

```json
{
  "name": "snowball",
  "description": "Snowball: agentic skills that remember why. Decision-intelligent skills library with forward spine (TDD, debugging, collaboration) and decision spine (passive MADR capture).",
  "owner": {
    "name": "Kellen Frodelius-Fujimoto",
    "email": "kellen@kellenfujimoto.com"
  },
  "homepage": "https://github.com/kellenff/snowball",
  "repository": "https://github.com/kellenff/snowball",
  "license": "MIT",
  "extensions": [
    {
      "name": "snowball",
      "source": "./extensions/snowball",
      "description": "Snowball skills library: forward spine + snowball-capture MCP for decision spine"
    }
  ]
}
```

- [ ] **Step 3: Validate the JSON parses**

```bash
python3 -m json.tool .junie-extension/marketplace.json > /dev/null
```

Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add .junie-extension/marketplace.json
git commit -m "feat(junie-cli): add marketplace manifest wrapping extensions/snowball/"
```

---

## Task 2: Enrich `extensions/snowball/extension.json`

**Goal:** Bring the per-extension manifest up to the same metadata standard as `.claude-plugin/plugin.json` and bump the version to match the rest of the repo.

**Files:**

- Modify: `extensions/snowball/extension.json` (replace contents)

- [ ] **Step 1: Replace the manifest contents**

Write the new `extensions/snowball/extension.json`:

```json
{
  "name": "snowball",
  "version": "6.3.0",
  "description": "Snowball skills library: agentic skills that remember why. Loads as agent context in Junie; decision-spine capture via the bundled snowball-capture MCP server.",
  "author": {
    "name": "Kellen Frodelius-Fujimoto",
    "email": "kellen@kellenfujimoto.com"
  },
  "homepage": "https://github.com/kellenff/snowball",
  "repository": "https://github.com/kellenff/snowball",
  "license": "MIT",
  "keywords": [
    "skills",
    "tdd",
    "debugging",
    "collaboration",
    "decision-logging",
    "madr"
  ]
}
```

- [ ] **Step 2: Validate the JSON parses**

```bash
python3 -m json.tool extensions/snowball/extension.json > /dev/null
```

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add extensions/snowball/extension.json
git commit -m "feat(junie-cli): enrich extension.json with author, license, keywords; bump version to 6.3.0"
```

---

## Task 3: Rename `mcp/.mcp.json` → `mcp/mcp.json`

**Goal:** Align the bundle's MCP config filename with the documented Junie convention. Identical content; history preserved via `git mv`.

**Files:**

- Rename: `extensions/snowball/mcp/.mcp.json` → `extensions/snowball/mcp/mcp.json`

- [ ] **Step 1: Confirm the old file exists**

```bash
test -f extensions/snowball/mcp/.mcp.json && echo "old file present"
```

Expected: `old file present`.

- [ ] **Step 2: `git mv` the file**

```bash
git mv extensions/snowball/mcp/.mcp.json extensions/snowball/mcp/mcp.json
ls extensions/snowball/mcp/
```

Expected output: the directory contains only `mcp.json` (the old `.mcp.json` is gone, replaced by `mcp.json`).

- [ ] **Step 3: Confirm `git status` shows a rename, not a delete+add**

```bash
git status --short
```

Expected: `R  extensions/snowball/mcp/.mcp.json -> extensions/snowball/mcp/mcp.json` (or `RM` with staged content).

- [ ] **Step 4: Validate the renamed file still parses**

```bash
python3 -m json.tool extensions/snowball/mcp/mcp.json > /dev/null
```

Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(junie-cli): rename mcp/.mcp.json to mcp/mcp.json to match Junie convention"
```

---

## Task 4: Create `tests/junie-cli/validate-marketplace.sh`

**Goal:** Stdlib-only bash test that asserts the marketplace wiring is intact. Three checks: marketplace JSON is valid, every `source` resolves to a real `extension.json` with `name` + `version`, and every MCP config is at `mcp/mcp.json` with `mcpServers`.

**Files:**

- Create: `tests/junie-cli/validate-marketplace.sh`
- Create: `tests/junie-cli/README.md`

- [ ] **Step 1: Create the test directory**

```bash
mkdir -p tests/junie-cli
```

- [ ] **Step 2: Write the validation script**

Create `tests/junie-cli/validate-marketplace.sh` with the exact content below. The script is `set -euo pipefail`, prints each check's status, and exits non-zero on the first failure.

```bash
#!/usr/bin/env bash
#
# validate-marketplace.sh — assert the .junie-extension/marketplace.json
# wiring is intact: the JSON parses, the schema fields are present, every
# extension `source` resolves to a real extension manifest, and the MCP
# config lives at the canonical mcp/mcp.json path.
#
# Run from the repo root: ./tests/junie-cli/validate-marketplace.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARKETPLACE="$REPO_ROOT/.junie-extension/marketplace.json"

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1" >&2; exit 1; }

echo "Validating $MARKETPLACE"

# --- 1. Marketplace JSON parses and has the required top-level shape ---

[ -f "$MARKETPLACE" ] || fail "marketplace file not found at $MARKETPLACE"

python3 -m json.tool "$MARKETPLACE" > /dev/null \
  || fail "marketplace file is not valid JSON"

python3 - <<'PY' "$MARKETPLACE"
import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    m = json.load(f)

for field in ("name", "description", "extensions"):
    if field not in m:
        sys.exit(f"marketplace missing top-level field: {field}")

if not isinstance(m["extensions"], list) or not m["extensions"]:
    sys.exit("marketplace extensions[] must be a non-empty list")

for i, ext in enumerate(m["extensions"]):
    for field in ("name", "source"):
        if field not in ext:
            sys.exit(f"extensions[{i}] missing field: {field}")
PY
pass "marketplace JSON is valid and has required top-level fields"

# --- 2. Every extensions[i].source resolves to a real extension.json ---

python3 - <<'PY' "$MARKETPLACE" "$REPO_ROOT"
import json, os, sys
marketplace_path, repo_root = sys.argv[1], sys.argv[2]
with open(marketplace_path, "r", encoding="utf-8") as f:
    m = json.load(f)

marketplace_dir = os.path.dirname(marketplace_path)
for i, ext in enumerate(m["extensions"]):
    source = ext["source"]
    # Source paths are relative to the marketplace file's directory.
    if os.path.isabs(source):
        resolved = source
    else:
        resolved = os.path.normpath(os.path.join(marketplace_dir, source))
    manifest = os.path.join(resolved, "extension.json")
    if not os.path.isfile(manifest):
        sys.exit(f"extensions[{i}].source={source!r} does not resolve to extension.json ({manifest} missing)")
    with open(manifest, "r", encoding="utf-8") as f:
        man = json.load(f)
    for field in ("name", "version"):
        if field not in man:
            sys.exit(f"{manifest} missing field: {field}")
PY
pass "every extensions[].source resolves to a real extension.json with name + version"

# --- 3. MCP config is at mcp/mcp.json (not mcp/.mcp.json) and is valid ---

python3 - <<'PY' "$MARKETPLACE" "$REPO_ROOT"
import json, os, sys
marketplace_path, repo_root = sys.argv[1], sys.argv[2]
with open(marketplace_path, "r", encoding="utf-8") as f:
    m = json.load(f)

marketplace_dir = os.path.dirname(marketplace_path)
for i, ext in enumerate(m["extensions"]):
    source = ext["source"]
    if os.path.isabs(source):
        resolved = source
    else:
        resolved = os.path.normpath(os.path.join(marketplace_dir, source))
    mcp_canonical = os.path.join(resolved, "mcp", "mcp.json")
    if not os.path.isfile(mcp_canonical):
        sys.exit(f"extensions[{i}].source={source!r} missing canonical MCP config at {mcp_canonical}")
    with open(mcp_canonical, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    if "mcpServers" not in cfg:
        sys.exit(f"{mcp_canonical} missing mcpServers key")
PY
pass "MCP config present at mcp/mcp.json with mcpServers key for every extension"

echo "All marketplace checks passed."
```

- [ ] **Step 3: Make the script executable**

```bash
chmod +x tests/junie-cli/validate-marketplace.sh
test -x tests/junie-cli/validate-marketplace.sh && echo "executable"
```

Expected: `executable`.

- [ ] **Step 4: Run the test — it should pass against the current state**

```bash
./tests/junie-cli/validate-marketplace.sh
```

Expected output:

```text
Validating /<repo>/.junie-extension/marketplace.json
  [PASS] marketplace JSON is valid and has required top-level fields
  [PASS] every extensions[].source resolves to a real extension.json with name + version
  [PASS] MCP config present at mcp/mcp.json with mcpServers key for every extension
All marketplace checks passed.
```

- [ ] **Step 5: Sanity check the test actually fails when wiring is broken**

Temporarily break the marketplace by removing a required field, then re-run. This confirms the test is real, not a tautology.

```bash
# Snapshot the current marketplace, mutate, re-run, restore.
cp .junie-extension/marketplace.json /tmp/marketplace.bak.json
python3 -c "
import json
with open('.junie-extension/marketplace.json') as f: m = json.load(f)
del m['extensions']
with open('.junie-extension/marketplace.json', 'w') as f: json.dump(m, f)
"
set +e
./tests/junie-cli/validate-marketplace.sh
status=$?
set -e
# Restore the file.
cp /tmp/marketplace.bak.json .junie-extension/marketplace.json
rm /tmp/marketplace.bak.json

if [ "$status" -ne 0 ]; then
  echo "  [OK] test correctly fails when extensions[] is removed (exit $status)"
else
  echo "  [FAIL] test passed despite broken wiring; check the assertion"
  exit 1
fi
```

Expected: the test prints `[FAIL] marketplace missing top-level field: extensions` and exits non-zero. The restore step puts the marketplace back to its good state.

- [ ] **Step 6: Re-run the test to confirm restore worked**

```bash
./tests/junie-cli/validate-marketplace.sh
```

Expected: all three `[PASS]` lines, exit 0.

- [ ] **Step 7: Write a one-paragraph README for the test directory**

Create `tests/junie-cli/README.md`:

```markdown
# Junie CLI tests

Lightweight, stdlib-only validation for the `.junie-extension/marketplace.json`
wiring that lets Junie CLI users discover and install the snowball extension.

- `validate-marketplace.sh` — asserts the marketplace JSON parses, every
  `extensions[].source` resolves to a real `extension.json` with `name` +
  `version`, and every MCP config is at the canonical `mcp/mcp.json` path
  with an `mcpServers` key.

Run from the repo root: `./tests/junie-cli/validate-marketplace.sh`.
Wired into pre-commit; runs on every change to the marketplace or the
extensions it points at.
```

- [ ] **Step 8: Commit**

```bash
git add tests/junie-cli/validate-marketplace.sh tests/junie-cli/README.md
git commit -m "test(junie-cli): add validate-marketplace.sh + directory README"
```

---

## Task 5: Wire the test into pre-commit

**Goal:** The marketplace test runs on every commit that touches the marketplace or the extensions it points at.

**Files:**

- Modify: `.pre-commit-config.yaml` (append a new local hook entry after the existing `bun-test-snowball-capture` entry)

- [ ] **Step 1: Append the new hook entry**

Edit `.pre-commit-config.yaml`. Find the existing `bun-test-snowball-capture` hook (the last entry in the file). After its closing line, add:

```yaml
      - id: validate-junie-cli-marketplace
        name: validate junie-cli marketplace
        entry: tests/junie-cli/validate-marketplace.sh
        language: system
        files: ^\.junie-extension/marketplace\.json$|^extensions/snowball/(extension\.json|mcp/mcp\.json)$
        pass_filenames: false
```

Note: the `files` regex matches the marketplace file plus the two extension files the marketplace points at. A change to any of them reruns the test.

- [ ] **Step 2: Verify the YAML still parses**

```bash
python3 -c "import yaml; yaml.safe_load(open('.pre-commit-config.yaml'))" && echo "yaml valid"
```

Expected: `yaml valid`.

- [ ] **Step 3: Run pre-commit on the changed files**

```bash
pre-commit run validate-junie-cli-marketplace --files .junie-extension/marketplace.json extensions/snowball/extension.json extensions/snowball/mcp/mcp.json
```

Expected: the hook reports `validate junie-cli marketplace` and exits 0.

If `pre-commit` is not installed in this environment, the bash invocation in Task 4 Step 4 is the equivalent. Document the install in the commit message if the local env doesn't have it.

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "ci(pre-commit): wire validate-marketplace.sh into the local hook list"
```

---

## Task 6: Update README — per-harness table + changelog

**Goal:** Reflect the new marketplace entry in the two README tables that talk about harness support.

**Files:**

- Modify: `README.md` (two locations: the "What is different from upstream" table and the "Per-harness adapters" table)

- [ ] **Step 1: Find the existing Junie row in the per-harness table**

The row reads:

```markdown
| Junie (JetBrains IDE plugin) | `extensions/snowball/extension.json` | bundled `snowball-capture` MCP server + `.junie/AGENTS.md` for context | `AGENTS.md` |
```

Replace it with:

```markdown
| Junie (JetBrains IDE + CLI) | `extensions/snowball/extension.json` + `.junie-extension/marketplace.json` (CLI only) | bundled `snowball-capture` MCP server + `.junie/AGENTS.md` for context; CLI users register the repo as a custom Junie marketplace | `AGENTS.md` |
```

- [ ] **Step 2: Add the sub-bullet under the v6.3.0 row in the changelog table**

In the "What is different from upstream" table, the v6.3.0 row currently reads:

```markdown
| v6.3.0 | Junie (JetBrains IDE plugin) support: forward spine via skills + AGENTS.md; decision spine via `snowball-capture` MCP server (partial — Junie has no hook rail) |
```

Replace the description in the second column with a two-line entry — keep the original line and add the marketplace sub-bullet:

```markdown
| v6.3.0 | Junie (JetBrains IDE plugin) support: forward spine via skills + AGENTS.md; decision spine via `snowball-capture` MCP server (partial — Junie has no hook rail). Junie CLI discoverability: `.junie-extension/marketplace.json` lets Junie CLI users `/extensions marketplace add https://github.com/kellenff/snowball` and install via `/extensions install snowball`. |
```

- [ ] **Step 3: Add a brief install note to the Setup section**

Find the Setup section. After the existing Junie (JetBrains IDE) install snippet, add a parallel snippet for Junie CLI:

```markdown
- **Junie CLI**: in any project, in a Junie CLI session, run `/extensions marketplace add https://github.com/kellenff/snowball` and then `/extensions install snowball`. The extension content is cached under `~/.junie/extensions/`; no project files are modified. After install, the `snowball-capture`, `argdown`, and `codebase-memory` MCP servers should appear as `Active` in `/mcp`. The `<absolute-path-to-snowball>` placeholder in the bundled MCP config is a known limitation — see the spec.
```

If the existing Setup section has a different structure, place the Junie CLI note as a sibling bullet to the JetBrains IDE one. The exact text can be adjusted to match the surrounding voice.

- [ ] **Step 4: Render the README and eyeball the result**

```bash
grep -n -E "Junie" README.md
```

Expected: the per-harness row, the changelog row, and the new Setup bullet all visible; the original Junie references intact.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): note Junie CLI marketplace entry in per-harness table + Setup"
```

---

## Task 7: Update RELEASE-NOTES

**Goal:** Sub-bullet under the existing v6.3.0 section noting the marketplace entry.

**Files:**

- Modify: `RELEASE-NOTES.md` (one location: inside the v6.3.0 section)

- [ ] **Step 1: Append the sub-bullet to the v6.3.0 section**

In the v6.3.0 section, after the existing three bullets, add:

```markdown
- **Junie CLI marketplace entry** — `.junie-extension/marketplace.json` wraps the existing `extensions/snowball/` bundle for Junie CLI discovery. Install with `/extensions marketplace add https://github.com/kellenff/snowball` then `/extensions install snowball`. Bundle's MCP config renamed to `mcp/mcp.json` (Junie's canonical filename); no content change.
```

- [ ] **Step 2: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): note Junie CLI marketplace entry under v6.3.0"
```

---

## Task 8: Manual verification (out of scope for automation)

**Goal:** Confirm the marketplace wiring works end-to-end against a real Junie CLI install. This is a one-time pre-release smoke test the author runs before tagging. Not automated in CI.

**Files:** none modified; produces no commit.

- [ ] **Step 1: Verify the marketplace wiring in the local clone**

Run the validation test once more to confirm the current state of the repo passes:

```bash
./tests/junie-cli/validate-marketplace.sh
```

Expected: all three `[PASS]` lines, exit 0.

- [ ] **Step 2: Local marketplace install against Junie CLI**

With Junie CLI installed and authenticated, in any project directory:

```text
> /extensions marketplace add ./
```

Expected: Junie accepts the local path, shows "snowball" in the catalog under the marketplace name "snowball".

```text
> /extensions install snowball
```

Expected: install completes without errors; reference written to `~/.junie/extensions/extensions.json`.

```text
> /mcp
```

Expected: `snowball-capture`, `argdown`, and `codebase-memory` all show `Active`. **KNOWN LIMITATION:** the `snowball-capture` server will fail to start on first run because the bundled `mcp/mcp.json` carries a `<absolute-path-to-snowball>` placeholder. Resolve by editing `~/.junie/extensions/<marketplace-id>/snowball/mcp/mcp.json` to point at the actual local path where you cloned the repo, then `/extensions update` and re-check `/mcp`. This is a pre-existing issue not introduced by this change; fixing it is a separate spec.

- [ ] **Step 3: Verify a skill is reachable**

Start a new session with `/new` and ask: "use the brainstorming skill." The agent should load the skill and announce it.

- [ ] **Step 4: Verify the decision spine (if you completed the manual MCP path fix in Step 2)**

Ask a multi-choice question, answer it, and confirm a MADR file appears under `docs/snowball/decisions/`. This is end-to-end proof that the `madr_capture` MCP tool is wired and the agent invokes it.

- [ ] **Step 5: Document the result in the PR description**

If all four steps above pass, the marketplace entry works. Note any deviations and link this spec in the PR description. If Junie rejects the manifest, the most likely cause is the field name `extensions[]` (vs `plugins[]`) — see Open Question 1 in the spec; the fix is a one-character rename and a republish.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
| --- | --- |
| Goals 1, 2 — discoverable marketplace, install works | Tasks 1, 4, 5, 8 |
| Goal 3 — extension.json as authoritative manifest | Task 2 |
| Goal 4 — MCP filename alignment | Task 3 |
| Goal 5 — pre-commit validation test | Tasks 4, 5 |
| Goal 6 — README + RELEASE-NOTES updates | Tasks 6, 7 |
| Components: `.junie-extension/marketplace.json` | Task 1 |
| Components: enriched `extensions/snowball/extension.json` | Task 2 |
| Components: renamed `mcp/mcp.json` | Task 3 |
| Testing: `tests/junie-cli/validate-marketplace.sh` | Task 4 |
| Testing: pre-commit wiring | Task 5 |
| Open questions: schema field name, MCP path placeholder | Documented in spec; Task 8 Step 5 covers schema field name fallout; placeholder noted in Task 8 Step 2 |
| Known limitations: MCP path placeholder | Task 6 Step 3 (README note) + Task 8 Step 2 (verification) |

No spec gap.

**2. Placeholder scan:** No TBD / TODO / "implement later" / "add appropriate error handling" patterns. Every code block is complete. Every command has expected output.

**3. Type consistency:** No function or symbol names cross tasks. The script (`tests/junie-cli/validate-marketplace.sh`) is referenced consistently in Tasks 4, 5, 6, 8. The marketplace path (`.junie-extension/marketplace.json`) is consistent. The extension path (`extensions/snowball/extension.json`) and MCP path (`extensions/snowball/mcp/mcp.json`) are consistent. No drift.

**4. Plan-vs-spec scope check:** The plan covers exactly the seven concrete edits the spec lists (one new marketplace file, one enriched extension.json, one renamed MCP file, one new test, one pre-commit wiring edit, one README edit, one RELEASE-NOTES edit). Plus the manual verification task from the spec. Nothing extra.
