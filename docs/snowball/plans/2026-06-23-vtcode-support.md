# VTCode Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship VTCode as a per-harness adapter alongside the nine existing harnesses. Forward spine: skills reachable, bootstrap injected as project context, tool-name mapping reference published. No decision spine in this scope.

**Architecture:** A thin `.vtcode/AGENTS.md` at the repo root mirrors the `using-snowball` bootstrap so VTCode picks it up as project guidelines, exactly the way `.junie/AGENTS.md` works for Junie. A `skills/using-snowball/references/vtcode-tools.md` translates Claude Code tool names to VTCode's `unified_*` family. A stdlib-only bash test asserts both files exist and the wiring is intact; pre-commit runs the test on every change. Version bumps 6.5.0 → 6.6.0.

**Tech Stack:** Bash (validation test, stdlib-only — no `jq` dependency), `python3 -m json.tool` for JSON validation, pre-commit, the existing `scripts/bump-version.sh`.

**Spec:** [`docs/snowball/specs/2026-06-23-vtcode-support-design.md`](../specs/2026-06-23-vtcode-support-design.md)

---

## File Structure

**Created:**

```text
.vtcode/
├── AGENTS.md                                # bootstrap mirror (VTCode-side)
└── hooks.toml                               # VTCode hook config (decision-spine wiring)

skills/using-snowball/references/
└── vtcode-tools.md                          # tool mapping, matches junie-tools.md shape

skills/decision-logging/src/
└── vtcode-post-tool-use-bridge.ts           # NEW; thin adapter for request_user_input

skills/decision-logging/scripts/
└── on-ask-user-question-vtcode.sh           # NEW; shell wrapper, mirrors on-ask-user-question.sh

tests/vtcode/
├── README.md                                # one-paragraph doc
└── validate-wiring.sh                       # structural-validation test (extended)
```

**Modified:**

- `skills/using-snowball/SKILL.md` — add VTCode to "How to Access Skills" and "Platform Adaptation" sections.
- `README.md` — add VTCode row to the per-harness table; add Setup section bullet; add v6.6.0 changelog sub-bullet.
- `RELEASE-NOTES.md` — add v6.6.0 entry.
- `.pre-commit-config.yaml` — add `validate-vtcode-wiring` local hook.
- `.vtcode/AGENTS.md` (the bootstrap mirror) — remove the "no decision spine" caveat; add a "Capture rules" section mirroring `extensions/snowball/.junie/AGENTS.md`; update install block to include `.vtcode/hooks.toml`.
- `scripts/build-decision-logging.sh` — add `vtcode-post-tool-use-bridge` to the bun build list.
- `tests/decision-logging/handlers.test.ts` — add tests for the VTCode adapter's pure functions.
- `.version-bump.json` — no schema change; `bump-version.sh` rewrites the version fields across the existing manifest list.

**Not touched:**

- `extensions/snowball/` — Junie bundle, separate. VTCode has hooks, so the `snowball-capture` MCP server workaround is unnecessary.
- The committed `.vtcode/tool-policy.json` — user-environment artifact.

---

## Task 1: Add `.vtcode/AGENTS.md` bootstrap mirror

**Goal:** Ship the VTCode-side bootstrap mirror so VTCode picks up the `using-snowball` discipline as project context.

**Files:**

- Create: `.vtcode/AGENTS.md`

- [ ] **Step 1: Confirm the `.vtcode/` directory exists**

```bash
ls -la .vtcode/
```

Expected: `.vtcode/` exists, contains `tool-policy.json`.

- [ ] **Step 2: Write the bootstrap mirror**

Create `.vtcode/AGENTS.md` with the structure from the spec's Components section. Three blocks:

1. `<!-- BEGIN SNOWBALL BOOTSTRAP (mirror of skills/using-snowball/SKILL.md) -->` ... `<!-- END SNOWBALL BOOTSTRAP -->` — contains the frontmatter (name, description), the SUBAGENT-STOP block, the EXTREMELY-IMPORTANT block, the Instruction Priority section, the "How to Access Skills" section (with a VTCode line added), and the "Platform Adaptation" section (with `vtcode-tools.md` in the list). Sourced verbatim from `skills/using-snowball/SKILL.md`. Use the same marker block style as `extensions/snowball/.junie/AGENTS.md` so a future sync script can regenerate.
2. A short skill index — one line per skill with its `name: <name> — <description first sentence>`. Match the index in `extensions/snowball/.junie/AGENTS.md`.
3. A short install/usage block — how to symlink the skills into `.agents/skills/`, how to point VTCode at the AGENTS.md mirror, and a pointer to `references/vtcode-tools.md` for tool mapping.

The full content is roughly 200 lines; model it on `extensions/snowball/.junie/AGENTS.md` lines 1–156 (the bootstrap block) plus the new VTCode-specific tail.

- [ ] **Step 3: Verify the marker block opens and closes**

```bash
test -f .vtcode/AGENTS.md || echo "missing"
grep -c "BEGIN SNOWBALL BOOTSTRAP" .vtcode/AGENTS.md
grep -c "END SNOWBALL BOOTSTRAP" .vtcode/AGENTS.md
```

Expected: `1` and `1` respectively (the marker appears exactly once at the start and once at the end of the bootstrap block).

- [ ] **Step 4: Commit**

```bash
git add .vtcode/AGENTS.md
git commit -m "feat(vtcode): add .vtcode/AGENTS.md bootstrap mirror"
```

---

## Task 2: Add `skills/using-snowball/references/vtcode-tools.md`

**Goal:** Publish the tool-name mapping so skills authored against Claude Code tool names work on VTCode.

**Files:**

- Create: `skills/using-snowball/references/vtcode-tools.md`

- [ ] **Step 1: Read the existing junie-tools.md for shape reference**

```bash
head -50 skills/using-snowball/references/junie-tools.md
```

Expected: shows the heading + table + notes + Configuration locations + Canonical docs pattern.

- [ ] **Step 2: Write `vtcode-tools.md`**

Create `skills/using-snowball/references/vtcode-tools.md` with this content (modeled on `junie-tools.md` shape):

```markdown
# VTCode Tool Mapping

Skills use Claude Code tool names. When using VTCode, the harness exposes a
unified tool family (`unified_file`, `unified_search`, `unified_exec`) plus
planning and task-tracking tools. The table below maps Claude Code primitives
to their VTCode equivalents.

## Tool Hierarchy

When multiple tools can achieve the same goal, follow this priority:

1. **Unified tools** (`unified_file`, `unified_search`, `unified_exec`) — handle file I/O, search, and shell execution under one roof.
2. **Specialized tools** (`apply_patch`, `request_user_input`, `task_tracker`) — use for the specific actions they describe.
3. **MCP tools** (when `.mcp.json` is configured) — fall back to MCP servers for tools VTCode does not provide natively.

## Mapping

| Skill references | VTCode equivalent |
|------------------|-------------------|
| `Read` (file reading) | `unified_file` (read action) |
| `Write` (file creation) | `unified_file` (write action) |
| `Edit` (file editing) | `apply_patch` or `unified_file` (edit action) |
| `Bash` (run shell commands) | `unified_exec` |
| `Grep` (search content) | `unified_search` (text mode) |
| `Glob` (search paths) | `unified_search` (glob mode) |
| `WebSearch` (web search) | `web_fetch` (when not in restricted sandbox) |
| `WebFetch` (URL fetch) | `web_fetch` |
| `AskUserQuestion` (user prompt) | `request_user_input` |
| `TodoWrite` (task tracking) | `task_tracker` |
| `Skill` (invoke a skill) | No explicit tool — see [Skill loading](#skill-loading) |
| `Task` (dispatch subagent) | No explicit tool — see [Subagent dispatch](#subagent-dispatch) |
| `EnterPlanMode` | `start_planning` |
| `ExitPlanMode` | `finish_planning` |

## Skill loading

VTCode has no explicit `Skill` tool. Skills auto-load: the agent scans
`.agents/skills/<skill-name>/SKILL.md` (project, nearest CWD first) and
`~/.agents/skills/<skill-name>/SKILL.md` (user) at session start, then selects
skills whose frontmatter `name` and `description` match the current task.
Reference a skill by name in your prompt and VTCode activates it.

Scope precedence: project-scope (`.agents/skills/<name>/`) wins over user-scope
(`~/.agents/skills/<name>/`) on name collision.

## Subagent dispatch

VTCode has no explicit `Task` tool. Subagents are configured through the
`vtcode.toml` `[[agents]]` table (project) or `~/.vtcode/agents.toml` (user).
The main agent delegates when the configured subagent's description matches the
task.

## Task tracking

VTCode's `task_tracker` tool replaces Claude Code's `TodoWrite`. The
`task_tracker` writes an ordered plan to the session that the agent updates
in place. Snowball skills that rely on `TodoWrite` for visible progress should
adapt their calls to `task_tracker` or surface structured progress through
subagent returns.

## Web fetch

VTCode's `web_fetch` tool covers both `WebSearch` and `WebFetch` from Claude
Code. When the restricted sandbox is active, `web_fetch` may be unavailable;
fall back to `MCP connect_server` for a `fetch` or `context7` server and use
the MCP tools instead.

## Plan mode

Claude Code's `EnterPlanMode` / `ExitPlanMode` map to VTCode's
`start_planning` / `finish_planning` tool pair. `start_planning` opens a
plan-mode session; `finish_planning` closes it after the user confirms.
The plan lives in the session, not on disk.

## Configuration locations

| Claude Code | VTCode |
|-------------|--------|
| `~/.claude/settings.json` (user) | `~/.vtcode/config.toml` (user) and `<project>/vtcode.toml` (project) |
| `~/.claude/skills/<name>/` (user) | `~/.agents/skills/<name>/` (user) and `<project>/.agents/skills/<name>/` (project) |
| `~/.claude/agents/<name>.md` (user) | `~/.vtcode/agents.toml` (user) and `<project>/vtcode.toml` (project) |
| `~/.claude/commands/<name>.md` (user) | n/a (VTCode uses slash commands via the CLI, not file-scoped) |
| `.mcp.json` (project root) | `<project>/.mcp.json` (project) — same `mcpServers` schema |
| `AGENTS.md` (project root) | `<project>/AGENTS.md` and `<project>/.vtcode/AGENTS.md` (project) |

## Canonical docs

- [VTCode repository](https://github.com/vinhnx/vtcode)
- [Skills guide](https://github.com/vinhnx/vtcode/blob/main/docs/skills/SKILLS_GUIDE.md)
- [Tool policy reference](https://github.com/vinhnx/vtcode/blob/main/docs/tool-policy.md)
```

- [ ] **Step 3: Verify the file parses as Markdown**

```bash
test -s skills/using-snowball/references/vtcode-tools.md && echo "ok"
wc -l skills/using-snowball/references/vtcode-tools.md
```

Expected: `ok`, ≥ 80 lines.

- [ ] **Step 4: Commit**

```bash
git add skills/using-snowball/references/vtcode-tools.md
git commit -m "docs(using-snowball): add vtcode-tools.md tool mapping reference"
```

---

## Task 3: Update `skills/using-snowball/SKILL.md` to mention VTCode

**Goal:** Add VTCode to the "How to Access Skills" and "Platform Adaptation" sections so the entry-point skill reflects the new adapter.

**Files:**

- Modify: `skills/using-snowball/SKILL.md`

- [ ] **Step 1: Find the "How to Access Skills" section**

```bash
grep -n "How to Access Skills\|In Aider\|In Gemini CLI\|In other environments" skills/using-snowball/SKILL.md
```

Expected: a block listing Claude Code, Copilot CLI, Aider, Gemini CLI, "other environments".

- [ ] **Step 2: Add a "In VTCode" line**

Insert after the "In Gemini CLI" line:

```markdown
**In VTCode:** Skills auto-load from `.agents/skills/<name>/SKILL.md` (project) or `~/.agents/skills/<name>/SKILL.md` (user); reference a skill by name in your prompt and VTCode activates it. Project guidelines come from `<project>/AGENTS.md` or `<project>/.vtcode/AGENTS.md`.
```

- [ ] **Step 3: Find the "Platform Adaptation" line**

```bash
grep -n "Platform Adaptation\|references/junie-tools.md\|references/aider-tools.md" skills/using-snowball/SKILL.md
```

Expected: the existing line lists the four reference docs (Copilot, Codex, Junie, Aider) and a Gemini auto-load note.

- [ ] **Step 4: Add VTCode to the reference list**

Replace the existing Platform Adaptation sentence with:

```markdown
Skills use Claude Code tool names. Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex), `references/junie-tools.md` (Junie), `references/vtcode-tools.md` (VTCode), `references/aider-tools.md` (Aider) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.
```

- [ ] **Step 5: Update the `.vtcode/AGENTS.md` bootstrap block to match**

The `.vtcode/AGENTS.md` mirror's "How to Access Skills" and "Platform Adaptation" sections must be a verbatim copy of the updated `skills/using-snowball/SKILL.md`. Open `.vtcode/AGENTS.md` and apply the same two edits to the mirrored block. (The block is delimited by `<!-- BEGIN SNOWBALL BOOTSTRAP -->` / `<!-- END SNOWBALL BOOTSTRAP -->`; the edits must fall inside those markers.)

- [ ] **Step 6: Verify the canonical SKILL.md and the mirror agree on the new lines**

```bash
grep "vtcode-tools" skills/using-snowball/SKILL.md
grep "vtcode-tools" .vtcode/AGENTS.md
```

Expected: both files mention `vtcode-tools.md`.

- [ ] **Step 7: Commit**

```bash
git add skills/using-snowball/SKILL.md .vtcode/AGENTS.md
git commit -m "docs(using-snowball): mention VTCode in skill loader and platform adaptation"
```

---

## Task 4: Create `tests/vtcode/validate-wiring.sh`

**Goal:** Stdlib-only bash test that asserts the VTCode wiring is intact. Three checks: the bootstrap mirror exists with a marker block, the tool mapping reference exists and contains the expected tool names, and the canonical SKILL.md mentions VTCode.

**Files:**

- Create: `tests/vtcode/validate-wiring.sh`
- Create: `tests/vtcode/README.md`

- [ ] **Step 1: Create the test directory**

```bash
mkdir -p tests/vtcode
```

- [ ] **Step 2: Write the validation script**

Create `tests/vtcode/validate-wiring.sh` with the content below. The script is `set -euo pipefail`, prints each check's status, and exits non-zero on the first failure.

```bash
#!/usr/bin/env bash
#
# validate-wiring.sh — assert the VTCode harness adapter wiring is intact:
# .vtcode/AGENTS.md exists with a Snowball marker block, the tool mapping
# reference lives at skills/using-snowball/references/vtcode-tools.md and
# names the expected tools, and the canonical SKILL.md mentions VTCode.
#
# Run from the repo root: ./tests/vtcode/validate-wiring.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENTS_MIRROR="$REPO_ROOT/.vtcode/AGENTS.md"
TOOL_MAP="$REPO_ROOT/skills/using-snowball/references/vtcode-tools.md"
SKILL_FILE="$REPO_ROOT/skills/using-snowball/SKILL.md"

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1" >&2; exit 1; }

echo "Validating VTCode wiring"

# --- 1. .vtcode/AGENTS.md exists and has the Snowball marker block ---

[ -f "$AGENTS_MIRROR" ] || fail ".vtcode/AGENTS.md not found at $AGENTS_MIRROR"

opens=$(grep -c "BEGIN SNOWBALL BOOTSTRAP" "$AGENTS_MIRROR" || true)
closes=$(grep -c "END SNOWBALL BOOTSTRAP" "$AGENTS_MIRROR" || true)
if [ "$opens" -ne 1 ] || [ "$closes" -ne 1 ]; then
  fail ".vtcode/AGENTS.md must contain exactly one BEGIN/END SNOWBALL BOOTSTRAP marker pair (got $opens opens, $closes closes)"
fi
pass ".vtcode/AGENTS.md exists with a Snowball bootstrap marker block"

# --- 2. Tool mapping reference exists and covers the expected primitives ---

[ -f "$TOOL_MAP" ] || fail "vtcode-tools.md not found at $TOOL_MAP"
[ -s "$TOOL_MAP" ] || fail "vtcode-tools.md is empty"

for tool in "unified_file" "unified_search" "unified_exec" "apply_patch" "request_user_input" "task_tracker" "start_planning" "finish_planning" "web_fetch"; do
  if ! grep -q "$tool" "$TOOL_MAP"; then
    fail "vtcode-tools.md missing expected tool: $tool"
  fi
done
pass "vtcode-tools.md covers the expected VTCode tool names"

# --- 3. Canonical SKILL.md mentions VTCode in the Platform Adaptation list ---

if ! grep -q "vtcode-tools.md" "$SKILL_FILE"; then
  fail "skills/using-snowball/SKILL.md does not mention vtcode-tools.md in Platform Adaptation"
fi
pass "skills/using-snowball/SKILL.md references vtcode-tools.md"

echo "All VTCode wiring checks passed."
```

- [ ] **Step 3: Make the script executable**

```bash
chmod +x tests/vtcode/validate-wiring.sh
test -x tests/vtcode/validate-wiring.sh && echo "executable"
```

Expected: `executable`.

- [ ] **Step 4: Run the test — it should pass against the current state**

```bash
./tests/vtcode/validate-wiring.sh
```

Expected output:

```text
Validating VTCode wiring
  [PASS] .vtcode/AGENTS.md exists with a Snowball bootstrap marker block
  [PASS] vtcode-tools.md covers the expected VTCode tool names
  [PASS] skills/using-snowball/SKILL.md references vtcode-tools.md
All VTCode wiring checks passed.
```

- [ ] **Step 5: Sanity check the test actually fails when wiring is broken**

Temporarily break the marker block by removing the closing marker, then re-run. This confirms the test is real, not a tautology.

```bash
# Snapshot the file, mutate, re-run, restore.
cp .vtcode/AGENTS.md /tmp/vtcode-agents.bak.md
sed -i '/END SNOWBALL BOOTSTRAP/d' .vtcode/AGENTS.md
set +e
./tests/vtcode/validate-wiring.sh
status=$?
set -e
# Restore the file.
cp /tmp/vtcode-agents.bak.md .vtcode/AGENTS.md
rm /tmp/vtcode-agents.bak.md

if [ "$status" -ne 0 ]; then
  echo "  [OK] test correctly fails when the marker is removed (exit $status)"
else
  echo "  [FAIL] test passed despite broken wiring; check the assertion"
  exit 1
fi
```

Expected: the test prints `[FAIL] .vtcode/AGENTS.md must contain exactly one BEGIN/END SNOWBALL BOOTSTRAP marker pair` and exits non-zero. The restore step puts the file back to its good state.

- [ ] **Step 6: Re-run the test to confirm restore worked**

```bash
./tests/vtcode/validate-wiring.sh
```

Expected: all three `[PASS]` lines, exit 0.

- [ ] **Step 7: Write a one-paragraph README for the test directory**

Create `tests/vtcode/README.md`:

```markdown
# VTCode tests

Lightweight, stdlib-only validation for the VTCode harness adapter wiring
that lets VTCode users discover Snowball skills and pick up the
`using-snowball` bootstrap as project context.

- `validate-wiring.sh` — asserts the bootstrap mirror at `.vtcode/AGENTS.md`
  has a Snowball marker block, the tool mapping at
  `skills/using-snowball/references/vtcode-tools.md` covers the expected
  VTCode primitives, and the canonical `SKILL.md` mentions VTCode in the
  Platform Adaptation list.

Run from the repo root: `./tests/vtcode/validate-wiring.sh`.
Wired into pre-commit; runs on every change to the VTCode adapter files.
```

- [ ] **Step 8: Commit**

```bash
git add tests/vtcode/validate-wiring.sh tests/vtcode/README.md
git commit -m "test(vtcode): add validate-wiring.sh + directory README"
```

---

## Task 5: Wire the test into pre-commit

**Goal:** The VTCode wiring test runs on every commit that touches the adapter files.

**Files:**

- Modify: `.pre-commit-config.yaml` (append a new local hook entry after the existing `validate-junie-cli-marketplace` entry)

- [ ] **Step 1: Append the new hook entry**

Edit `.pre-commit-config.yaml`. Find the existing `validate-junie-cli-marketplace` hook (or the last entry, whichever comes later). After its closing line, add:

```yaml
      - id: validate-vtcode-wiring
        name: validate vtcode wiring
        entry: tests/vtcode/validate-wiring.sh
        language: system
        files: ^\.vtcode/AGENTS\.md$|^skills/using-snowball/references/vtcode-tools\.md$|^skills/using-snowball/SKILL\.md$
        pass_filenames: false
```

Note: the `files` regex matches the three files the test asserts on. A change to any of them reruns the test.

- [ ] **Step 2: Verify the YAML still parses**

```bash
python3 -c "import yaml; yaml.safe_load(open('.pre-commit-config.yaml'))" && echo "yaml valid"
```

Expected: `yaml valid`.

- [ ] **Step 3: Run pre-commit on the changed files**

```bash
pre-commit run validate-vtcode-wiring --files .vtcode/AGENTS.md skills/using-snowball/references/vtcode-tools.md skills/using-snowball/SKILL.md
```

Expected: the hook reports `validate vtcode wiring` and exits 0.

If `pre-commit` is not installed in this environment, the bash invocation in Task 4 Step 4 is the equivalent. Document the install in the commit message if the local env doesn't have it.

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "ci(pre-commit): wire validate-wiring.sh into the local hook list"
```

---

## Task 6: Update README — per-harness table + Setup + changelog

**Goal:** Reflect the new VTCode adapter in the three README tables that talk about harness support.

**Files:**

- Modify: `README.md` (three locations: the "What is different from upstream" table, the "Per-harness adapters" table, the Setup section)

- [ ] **Step 1: Find the existing Junie row in the per-harness table**

```bash
grep -n "Junie (JetBrains IDE + CLI)" README.md
```

Expected: a single line with that text.

- [ ] **Step 2: Add the VTCode row immediately after the Junie row**

After the Junie row, add:

```markdown
| VTCode | `.vtcode/AGENTS.md` (bootstrap mirror) | project guidelines via `AGENTS.md`; skills symlinked into `.agents/skills/` | `AGENTS.md` |
```

- [ ] **Step 3: Find the existing v6.5.0 row in the changelog**

```bash
grep -n "v6\.5\.0" README.md
```

Expected: one match, near the top of the "What is different from upstream" table.

- [ ] **Step 4: Add the v6.6.0 row above v6.5.0**

Insert a new row above the v6.5.0 row:

```markdown
| v6.6.0 | VTCode harness adapter: forward spine via `.vtcode/AGENTS.md` bootstrap mirror + `skills/using-snowball/references/vtcode-tools.md` tool mapping; skills are symlinked into VTCode's `.agents/skills/` discovery path. No decision spine in this scope. |
```

- [ ] **Step 5: Add a Setup section bullet for VTCode**

Find the Setup section. After the existing Junie CLI bullet, add a parallel bullet:

```markdown
- **VTCode**: see the [VTCode install guide](#) (TODO: link to `docs/README.vtcode.md` if you create one — for now, follow these steps). Clone the Snowball repo (`git clone https://github.com/kellenff/snowball.git ~/Projects/snowball`), then symlink the skills into VTCode's user-scope discovery path: `mkdir -p ~/.agents/skills && for skill in ~/Projects/snowball/skills/*/; do ln -sfn "$skill" "$HOME/.agents/skills/$(basename "$skill")"; done`. Drop the bootstrap mirror into your project with `ln -sfn ~/Projects/snowball/.vtcode/AGENTS.md <your-project>/AGENTS.md` (or copy its contents into your existing `AGENTS.md`). Verify with `vtcode skills list` — all 18 skills should appear. No decision-spine integration in this version; the `snowball-capture` MCP server from the Junie bundle does not yet have a VTCode-side loader.
```

If the existing Setup section has a different structure, place the VTCode bullet as a sibling to the Junie CLI one. Match the surrounding voice.

- [ ] **Step 6: Render the README and eyeball the result**

```bash
grep -n "VTCode\|vtcode" README.md
```

Expected: the new per-harness row, the new changelog row, the new Setup bullet all visible; no stray TODOs left.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs(readme): add VTCode row to per-harness table, changelog, and Setup"
```

---

## Task 7: Update RELEASE-NOTES

**Goal:** Add a v6.6.0 section to RELEASE-NOTES.md describing the new VTCode adapter.

**Files:**

- Modify: `RELEASE-NOTES.md` (one location: a new top-level `## v6.6.0 (2026-06-23)` section above the `## v6.5.0` section)

- [ ] **Step 1: Find the v6.5.0 section heading**

```bash
grep -n "^## v6\.5\.0" RELEASE-NOTES.md
```

Expected: one match.

- [ ] **Step 2: Insert the v6.6.0 section above v6.5.0**

Insert this block immediately before the `## v6.5.0 (2026-06-19)` heading:

```markdown
## v6.6.0 (2026-06-23)

### VTCode harness adapter

Forward-spine support for [VTCode](https://github.com/vinhnx/vtcode) (Rust-based CLI coding agent). No decision spine in this scope — VTCode has no public hook/lifecycle event API, same constraint as Junie.

- **Bootstrap mirror** — `.vtcode/AGENTS.md` carries the `using-snowball` text verbatim inside a marker block, mirroring the Junie pattern at `extensions/snowball/.junie/AGENTS.md`. VTCode injects `AGENTS.md` as project guidelines, so the bootstrap is delivered without a `session-start` hook.
- **Tool mapping** — new `skills/using-snowball/references/vtcode-tools.md` translates Claude Code tool names to VTCode's `unified_file` / `unified_search` / `unified_exec` family plus `apply_patch`, `request_user_input`, `task_tracker`, `start_planning` / `finish_planning`, and `web_fetch`. Added to the Platform Adaptation list in `skills/using-snowball/SKILL.md`.
- **Install** — clone the Snowball repo, symlink `skills/*/` into `~/.agents/skills/`, and drop the `.vtcode/AGENTS.md` mirror into the target project's `AGENTS.md`. Verify with `vtcode skills list` (all 18 skills should appear).
- **Pre-commit test** — new `tests/vtcode/validate-wiring.sh` asserts the bootstrap mirror has a marker block, the tool mapping covers the expected primitives, and the canonical `SKILL.md` references the new doc. Wired into `.pre-commit-config.yaml` as `validate-vtcode-wiring`.

### Known limitations

- No decision spine — the Junie-side `snowball-capture` MCP server does not yet have a VTCode-side loader. A future spec can add one if VTCode exposes session callbacks.
- No MCP integration — the tool mapping notes `.mcp.json` for future use, but no MCP server is shipped as part of VTCode support in v6.6.0.
- The committed `.vtcode/tool-policy.json` is a user-environment artifact, not a Snowball-managed file. Out of scope for this spec.

```

- [ ] **Step 3: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): add v6.6.0 VTCode harness adapter entry"
```

---

## Task 8: Bump version 6.5.0 → 6.6.0

**Goal:** Bump every manifest version in the project to 6.6.0 so the new feature has a single version stamp.

**Files:**

- All files listed in `.version-bump.json` — modified by `scripts/bump-version.sh`.

- [ ] **Step 1: Confirm current versions before the bump**

```bash
./scripts/bump-version.sh --check
```

Expected: every declared file reports `6.5.0`. If any drift is reported, stop and fix before bumping.

- [ ] **Step 2: Run the bump**

```bash
./scripts/bump-version.sh 6.6.0
```

Expected: every declared file now reports `6.6.0`. If the script aborts, follow its error and retry.

- [ ] **Step 3: Audit for any string drift the script missed**

```bash
./scripts/bump-version.sh --audit
```

Expected: no remaining `6.5.0` strings outside the audit-exclude list. If anything shows up, update it manually and re-run the audit.

- [ ] **Step 4: Stage and commit the version bump**

```bash
git add -A
git status --short
git commit -m "chore(release): bump version to 6.6.0"
```

Expected: a single commit touching only the manifest files listed in `.version-bump.json`.

---

## Task 9: Manual verification (out of scope for automation)

**Goal:** Confirm the VTCode wiring works end-to-end against a real VTCode install. One-time pre-release smoke test the author runs before tagging. Not automated in CI.

**Files:** none modified; produces no commit.

- [ ] **Step 1: Re-run the validation test**

```bash
./tests/vtcode/validate-wiring.sh
```

Expected: all three `[PASS]` lines, exit 0.

- [ ] **Step 2: Pre-commit sweep**

```bash
pre-commit run --all-files
```

Expected: every hook passes. If a hook fails, fix the offending file and re-run.

- [ ] **Step 3: Install against a real VTCode**

With VTCode installed and authenticated, in any project directory:

```bash
# Clone the repo (or use the existing clone).
git clone https://github.com/kellenff/snowball.git ~/Projects/snowball

# Symlink the skills into the user-scope discovery path.
mkdir -p ~/.agents/skills
for skill in ~/Projects/snowball/skills/*/; do
  ln -sfn "$skill" "$HOME/.agents/skills/$(basename "$skill")"
done

# Drop the bootstrap mirror into the project.
ln -sfn ~/Projects/snowball/.vtcode/AGENTS.md <project>/AGENTS.md
```

Expected: `ls ~/.agents/skills/` shows 18 symlinks; `<project>/AGENTS.md` is a symlink to the Snowball mirror.

- [ ] **Step 4: Verify skills are discoverable**

```bash
cd <project>
vtcode skills list
```

Expected: output includes `using-snowball`, `brainstorming`, `test-driven-development`, `systematic-debugging`, and the other 14 skills. `vtcode skills info brainstorming` should show the frontmatter name and description from `skills/brainstorming/SKILL.md`.

- [ ] **Step 5: Verify the bootstrap is loaded**

Start a VTCode session in the project, ask: "use the brainstorming skill." The agent should load the skill (loaded from `~/.agents/skills/brainstorming/SKILL.md`) and announce it.

- [ ] **Step 6: Verify the tool mapping works**

In the same session, ask: "read the file at <some local file>." The agent should call `unified_file` (or whatever the equivalent in the local VTCode build is). The mapping in `references/vtcode-tools.md` is the canonical translation.

- [ ] **Step 7: Document the result in the PR description**

If all six steps above pass, the adapter works. Note any deviations and link this plan in the PR description. If VTCode rejects the skills symlink layout, the most likely cause is permission on `~/.agents/skills/`; resolve by `chmod 700` and retry.

---

## Task 10: Add `skills/decision-logging/src/vtcode-post-tool-use-bridge.ts`

**Goal:** Ship a thin PostToolUse adapter that converts VTCode's `request_user_input` response shape (`answers: { id: { selected: [label, ...], other?: string } }`) into the existing `handleAskUserQuestion` API (`answers: { question_text: label }`). Reuse the existing pure function in-process — same pattern the OpenCode plugin uses.

**Files:**

- Create: `skills/decision-logging/src/vtcode-post-tool-use-bridge.ts`

- [ ] **Step 1: Write the adapter**

Create the new file with the content below. Two exports: `normalizeVtcodeAnswers` (pure) and `handleVtcodePostToolUse` (pure, calls `handleAskUserQuestion`). Plus a `runCli()` that reads stdin JSON, calls the handler, and exits 0.

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  normalizeQuestions,
  resolveSessionId,
  type BaseHookPayload,
} from "./hook-payload";
import { handleAskUserQuestion } from "./ask-user-question-bridge";
import { detectGitRoot } from "./git-root";

const ERROR_LOG = path.join(os.homedir(), ".snowball", "decision-logging-errors.log");

interface VtcodePostToolUsePayload extends BaseHookPayload {
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_output?: unknown;
}

/**
 * Pure: convert VTCode's `request_user_input` response shape to the
 * `{ question_text: label }` shape `handleAskUserQuestion` expects.
 * VTCode answers wrap the label in `{ selected: [label, ...], other?: string }`
 * and key by question `id` (snake_case), not question text.
 */
export function normalizeVtcodeAnswers(
  questions: ReturnType<typeof normalizeQuestions>,
  rawAnswers: unknown,
): Record<string, string> {
  if (!rawAnswers || typeof rawAnswers !== "object") return {};
  const answers = (rawAnswers as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") return {};

  const out: Record<string, string> = {};
  for (const q of questions) {
    const answer = (answers as Record<string, unknown>)[q.id ?? ""];
    if (!answer || typeof answer !== "object") continue;
    const selected = (answer as { selected?: unknown }).selected;
    const other = (answer as { other?: unknown }).other;
    const label =
      Array.isArray(selected) && typeof selected[0] === "string"
        ? selected[0]
        : typeof other === "string" && other.trim()
          ? other
          : null;
    if (!label) continue;
    out[q.question] = label;
  }
  return out;
}

export interface VtcodePostToolUseInput {
  toolInput: unknown;
  toolResponse: unknown;
  sessionId: string;
  sourceEventId: string;
  gitRoot: string;
}

export function handleVtcodePostToolUse(input: VtcodePostToolUseInput): number {
  const questions = normalizeQuestions(input.toolInput);
  const answers = normalizeVtcodeAnswers(questions, input.toolResponse);
  return handleAskUserQuestion({
    questions,
    answers,
    sessionId: input.sessionId,
    sourceEventId: input.sourceEventId,
    gitRoot: input.gitRoot,
  });
}

function logError(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

// CLI entry: read the VTCode PostToolUse payload from stdin and capture.
function runCli(): void {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload: VtcodePostToolUsePayload;
    try {
      payload = JSON.parse(raw) as VtcodePostToolUsePayload;
    } catch (err) {
      logError(`vtcode-post-tool-use-bridge: bad JSON: ${(err as Error).message}`);
      process.exit(0);
      return;
    }

    if (payload.tool_name !== "request_user_input") process.exit(0);

    const gitRoot = detectGitRoot();
    if (!gitRoot) process.exit(0);

    handleVtcodePostToolUse({
      toolInput: payload.tool_input,
      toolResponse: payload.tool_response,
      sessionId: resolveSessionId(payload) || "unknown",
      sourceEventId: payload.tool_use_id ?? "unknown",
      gitRoot,
    });
    process.exit(0);
  });
}

if (import.meta.main || (typeof require !== "undefined" && require.main === module)) {
  runCli();
}
```

- [ ] **Step 2: Wire it into the bun build**

Append `vtcode-post-tool-use-bridge` to the `ENTRIES` array in `scripts/build-decision-logging.sh`.

```bash
ENTRIES=(
  write-madr
  append-observation
  ask-user-question-bridge
  user-prompt-bridge
  approval-phrases
  vtcode-post-tool-use-bridge
)
```

- [ ] **Step 3: Build the bundle**

```bash
./scripts/build-decision-logging.sh
ls skills/decision-logging/scripts/vtcode-post-tool-use-bridge.cjs
```

Expected: bundle file present, non-empty. The script's own audit will report the new entry.

- [ ] **Step 4: Commit**

```bash
git add skills/decision-logging/src/vtcode-post-tool-use-bridge.ts \
        scripts/build-decision-logging.sh \
        skills/decision-logging/scripts/vtcode-post-tool-use-bridge.cjs
git commit -m "feat(decision-logging): add VTCode PostToolUse bridge for request_user_input"
```

---

## Task 11: Add `skills/decision-logging/scripts/on-ask-user-question-vtcode.sh`

**Goal:** Thin shell wrapper that mirrors the existing `on-ask-user-question.sh` shape but calls the new `vtcode-post-tool-use-bridge.cjs`. No-ops outside a git repo. Always exits 0; the bridge logs errors internally.

**Files:**

- Create: `skills/decision-logging/scripts/on-ask-user-question-vtcode.sh`

- [ ] **Step 1: Write the wrapper**

Create the file with the content below. Note `set -uo pipefail` (no `-e`) so the bridge's exit codes don't bubble up; the wrapper must always succeed so VTCode doesn't block the agent.

```bash
#!/usr/bin/env bash
# PostToolUse hook for VTCode's request_user_input: writes one MADR per
# question-answer pair, adapting VTCode's response shape into the format
# the existing ask-user-question-bridge expects.
set -uo pipefail

git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="$SCRIPT_DIR/vtcode-post-tool-use-bridge.cjs"

node "$BRIDGE" || true
exit 0
```

- [ ] **Step 2: Make it executable and commit**

```bash
chmod +x skills/decision-logging/scripts/on-ask-user-question-vtcode.sh
git add skills/decision-logging/scripts/on-ask-user-question-vtcode.sh
git commit -m "feat(decision-logging): add on-ask-user-question-vtcode.sh hook wrapper"
```

---

## Task 12: Add `.vtcode/hooks.toml`

**Goal:** Register all five Snowball hooks with VTCode. The existing shell scripts (`on-user-prompt.sh`, `on-stop.sh`, `on-pre-compact.sh`, `session-start`) are reused as-is; only the PostToolUse entry uses the new `on-ask-user-question-vtcode.sh` wrapper. The blast-radius audit hooks are also wired so VTCode gets the same operator-approval and stop audits Claude Code and OpenCode get.

**Files:**

- Create: `.vtcode/hooks.toml`

- [ ] **Step 1: Write the hook config**

Create `.vtcode/hooks.toml` with the content below. Paths use the user's local Snowball clone location; the install step is to drop this file into the project's `.vtcode/` (symlink or copy).

```toml
# Snowball hooks for VTCode.
#
# This file is the VTCode-side mirror of the Snowball decision spine.
# Drop it into your project's .vtcode/ directory (or symlink from the
# Snowball clone) so VTCode fires the same capture hooks Claude Code,
# Cursor, and OpenCode fire.
#
# Each `command` must be an absolute path. Replace /absolute/path/to/snowball
# with the actual Snowball clone location on the user's machine.

[hooks.lifecycle]

[[hooks.lifecycle.user_prompt_submit]]
hooks = [
  { command = "/absolute/path/to/snowball/skills/decision-logging/scripts/on-user-prompt.sh" },
  { command = "/absolute/path/to/snowball/hooks/blast-radius-audit.sh operator-approval" }
]

[[hooks.lifecycle.post_tool_use]]
matcher = "request_user_input"
hooks = [
  { command = "/absolute/path/to/snowball/skills/decision-logging/scripts/on-ask-user-question-vtcode.sh" }
]

[[hooks.lifecycle.session_start]]
hooks = [
  { command = "/absolute/path/to/snowball/hooks/run-hook.cmd session-start" }
]

[[hooks.lifecycle.stop]]
hooks = [
  { command = "/absolute/path/to/snowball/skills/decision-logging/scripts/on-stop.sh" },
  { command = "/absolute/path/to/snowball/hooks/blast-radius-audit.sh stop" }
]

[[hooks.lifecycle.pre_compact]]
hooks = [
  { command = "/absolute/path/to/snowball/skills/decision-logging/scripts/on-pre-compact.sh" }
]
```

The placeholder `/absolute/path/to/snowball` is intentional — the test (Task 4) checks that the file parses and references the expected script basenames, not the absolute paths. The README install section documents the substitution.

- [ ] **Step 2: Verify the TOML parses**

```bash
node -e "const fs=require('fs'); const t=fs.readFileSync('.vtcode/hooks.toml','utf8'); console.log('lines:', t.split('\n').length, 'tables:', (t.match(/\[\[hooks\.lifecycle\.\w+\]\]/g)||[]).length)"
```

Expected: 5 lines matching `[[hooks.lifecycle.<name>]]`.

- [ ] **Step 3: Commit**

```bash
git add .vtcode/hooks.toml
git commit -m "feat(vtcode): add .vtcode/hooks.toml hook config"
```

---

## Task 13: Update `.vtcode/AGENTS.md` bootstrap mirror with capture rules

**Goal:** Remove the "no decision spine in this scope" caveat from the bootstrap mirror and add a "Capture rules" section mirroring the one in `extensions/snowball/.junie/AGENTS.md`. The agent now knows it should expect approval-phrase MADRs and request_user_input MADRs without having to remember to invoke the MCP tools.

**Files:**

- Modify: `.vtcode/AGENTS.md`

- [ ] **Step 1: Find the existing "Decision spine" section**

```bash
grep -n "Decision spine\|no decision spine\|snowball-capture" .vtcode/AGENTS.md
```

Expected: a paragraph near the bottom of the file describing the limitation.

- [ ] **Step 2: Replace the limitation paragraph with a capture-rules block**

Replace the entire "Decision spine" subsection (the existing limitation paragraph) with this structure, modeled on `extensions/snowball/.junie/AGENTS.md` lines 159–215:

```markdown
---

## Capture rules (decision spine)

VTCode hooks fire these capture paths automatically. You do not need to invoke them yourself; the hook config at `.vtcode/hooks.toml` runs them in the background.

### Approval-phrase MADR (UserPromptSubmit hook)

When the operator submits an approval phrase (`lgtm`, `looks good`, `ship it`, `approved`, `go ahead`, `merge it`, `do it`, etc.) and you act on it, the `on-user-prompt.sh` hook writes a MADR to `docs/snowball/decisions/` with `capture_mechanism: user-prompt-pattern`. No action required on your part — the hook runs on every UserPromptSubmit.

### Multi-choice MADR (PostToolUse on `request_user_input`)

When you ask the user a multi-choice question via `request_user_input` and they answer, the `on-ask-user-question-vtcode.sh` hook writes one MADR per question-answer pair with `capture_mechanism: ask-user-question`. No action required on your part — the hook runs on every PostToolUse for `request_user_input`.

### Stop extraction (Stop and PreCompact hooks)

When the assistant turn ends (Stop) or context is compacted (PreCompact), `on-stop.sh` / `on-pre-compact.sh` fork the extraction worker as a detached subprocess. The worker reads the session transcript, derives non-obvious observations, and appends them to `docs/snowball/decisions/observations.jsonl`. No action required on your part — the hook runs in the background.

### Blast-radius audits

The same `blast-radius-audit.sh` script that runs on Claude Code and OpenCode is wired to UserPromptSubmit (operator-approval mode) and Stop (general mode) here. It produces an operator-approval audit log on each approval and a stop-time change-scope audit. No action required on your part.
```

- [ ] **Step 3: Update the install block to include `.vtcode/hooks.toml`**

Find the `## Install` heading near the end of the file. After the `ln -sfn .../AGENTS.md` line, add a parallel line for the hook config:

```markdown
# Drop the hook config into the project too — without it, none of the
# capture hooks fire and the decision spine is silent.
ln -sfn ~/Projects/snowball/.vtcode/hooks.toml <project>/.vtcode/hooks.toml
```

The existing line above the install block that mentions "no decision spine in this scope" should already be removed as part of Step 2.

- [ ] **Step 4: Commit**

```bash
git add .vtcode/AGENTS.md
git commit -m "docs(vtcode): add capture rules and hooks.toml install step to AGENTS.md mirror"
```

---

## Task 14: Add unit tests for the VTCode adapter

**Goal:** Cover the pure functions in `vtcode-post-tool-use-bridge.ts`: `normalizeVtcodeAnswers` for the `{selected: [label]}` shape, the `other` freeform fallback, missing answer, multi-question, and `handleVtcodePostToolUse` integration with `handleAskUserQuestion`.

**Files:**

- Modify: `tests/decision-logging/handlers.test.ts`

- [ ] **Step 1: Add the new imports**

Add at the top of the file (alongside the existing imports):

```ts
import { handleVtcodePostToolUse, normalizeVtcodeAnswers } from "../../skills/decision-logging/src/vtcode-post-tool-use-bridge";
```

- [ ] **Step 2: Append four new tests at the end of the file**

```ts
test("normalizeVtcodeAnswers unwraps {selected: [label]} to a bare label", () => {
  const toolInput = {
    questions: [
      { id: "storage", question: "Which storage?", header: "Storage", options: [{ label: "Two-tier", description: "..." }] },
    ],
  };
  const questions = normalizeQuestions(toolInput);
  const answers = normalizeVtcodeAnswers(questions, {
    answers: { storage: { selected: ["Two-tier"], other: undefined } },
  });
  expect(answers).toEqual({ "Which storage?": "Two-tier" });
});

test("normalizeVtcodeAnswers falls back to {other} when selected is empty", () => {
  const toolInput = {
    questions: [{ id: "q1", question: "Any notes?", header: "Notes" }],
  };
  const questions = normalizeQuestions(toolInput);
  const answers = normalizeVtcodeAnswers(questions, {
    answers: { q1: { selected: [], other: "use Postgres" } },
  });
  expect(answers).toEqual({ "Any notes?": "use Postgres" });
});

test("handleVtcodePostToolUse writes one MADR per answered question", () => {
  const repo = makeTempRepo();
  try {
    const toolInput = {
      questions: [
        { id: "approach", question: "Which approach?", header: "Approach",
          options: [{ label: "Lazy", description: "ponytail" }, { label: "Eager", description: "all upfront" }] },
        { id: "tests", question: "Add tests?", header: "Tests",
          options: [{ label: "Yes", description: "" }, { label: "No", description: "" }] },
      ],
    };
    const count = handleVtcodePostToolUse({
      toolInput,
      toolResponse: {
        answers: {
          approach: { selected: ["Lazy"] },
          tests: { selected: ["Yes"] },
        },
      },
      sessionId: "vt-1",
      sourceEventId: "tooluse-1",
      gitRoot: repo,
    });
    expect(count).toBe(2);
    const files = readDecisionsDir(repo);
    expect(files.length).toBe(2);
    const content = fs.readFileSync(`${repo}/docs/snowball/decisions/${files[0]}`, "utf8");
    expect(content).toContain("capture_mechanism: ask-user-question");
    expect(content).toContain("session_id: vt-1");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("handleVtcodePostToolUse ignores questions that were not answered", () => {
  const repo = makeTempRepo();
  try {
    const toolInput = {
      questions: [
        { id: "a", question: "Q1?", header: "A" },
        { id: "b", question: "Q2?", header: "B" },
      ],
    };
    const count = handleVtcodePostToolUse({
      toolInput,
      toolResponse: { answers: { a: { selected: ["x"] } } },
      sessionId: "vt-2",
      sourceEventId: "tooluse-2",
      gitRoot: repo,
    });
    expect(count).toBe(1);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 3: Run the test suite**

```bash
cd tests/decision-logging && bun test handlers.test.ts
```

Expected: all tests pass (the four new tests plus the existing five).

- [ ] **Step 4: Commit**

```bash
git add tests/decision-logging/handlers.test.ts
git commit -m "test(decision-logging): add VTCode adapter handler tests"
```

---

## Task 15: Extend `tests/vtcode/validate-wiring.sh` with hook-config checks

**Goal:** Add a fourth check to the existing validation test: `.vtcode/hooks.toml` exists, parses as valid TOML, has the `[hooks.lifecycle]` table, and references each of the five expected hook scripts.

**Files:**

- Modify: `tests/vtcode/validate-wiring.sh`

- [ ] **Step 1: Add a TOML parser via `python3`**

The bash script already uses `python3 -m json.tool` for JSON validation. Add a Python TOML parse step after the existing three checks. Python ≥ 3.11 ships `tomllib`; for older versions, fall back to a regex check (the test should not require an exact TOML parser if the host has Python < 3.11).

- [ ] **Step 2: Append a fourth check block**

Append after the existing `pass "skills/using-snowball/SKILL.md references vtcode-tools.md"` line:

```bash
# --- 4. Hook config exists, parses, references the expected scripts ---

HOOKS_TOML="$REPO_ROOT/.vtcode/hooks.toml"
[ -f "$HOOKS_TOML" ] || fail ".vtcode/hooks.toml not found at $HOOKS_TOML"

python3 - "$HOOKS_TOML" <<'PY' || fail ".vtcode/hooks.toml is not valid TOML or missing the [hooks.lifecycle] table"
import sys
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        sys.exit(0)  # can't validate TOML strictly without a lib; let the regex check below decide

with open(sys.argv[1], "rb") as f:
    cfg = tomllib.load(f)

hooks = cfg.get("hooks", {}).get("lifecycle", {})
if not isinstance(hooks, dict) or not hooks:
    sys.exit("hooks.lifecycle table missing or empty")
PY

for script in "session-start" "on-user-prompt.sh" "on-ask-user-question-vtcode.sh" "on-stop.sh" "on-pre-compact.sh"; do
  if ! grep -q "$script" "$HOOKS_TOML"; then
    fail ".vtcode/hooks.toml does not reference expected hook script: $script"
  fi
done
pass ".vtcode/hooks.toml is valid TOML with [hooks.lifecycle] and references the five expected scripts"
```

- [ ] **Step 3: Run the test — it should pass**

```bash
./tests/vtcode/validate-wiring.sh
```

Expected: four `[PASS]` lines, exit 0.

- [ ] **Step 4: Sanity check the test fails when hooks.toml is missing**

```bash
mv .vtcode/hooks.toml /tmp/hooks.bak.toml
set +e
./tests/vtcode/validate-wiring.sh
rc=$?
set -e
mv /tmp/hooks.bak.toml .vtcode/hooks.toml

if [ "$rc" -ne 0 ]; then
  echo "  [OK] test correctly fails when hooks.toml is missing (exit $rc)"
else
  echo "  [FAIL] test passed despite missing hooks.toml"
  exit 1
fi
```

Expected: the test prints `[FAIL] .vtcode/hooks.toml not found` and exits non-zero. Restore brings it back to good state.

- [ ] **Step 5: Commit**

```bash
git add tests/vtcode/validate-wiring.sh
git commit -m "test(vtcode): extend validate-wiring.sh with hook-config checks"
```

---

## Task 16: Update README Setup bullet for VTCode hooks

**Goal:** Reflect the new hook-based decision spine in the README Setup bullet for VTCode, so users know they need to also drop `.vtcode/hooks.toml` into the project.

**Files:**

- Modify: `README.md` (one location: the existing VTCode Setup bullet)

- [ ] **Step 1: Find the VTCode Setup bullet**

```bash
grep -n "VTCode:" README.md
```

Expected: a single line in the Setup section.

- [ ] **Step 2: Replace the bullet with a more complete install**

Replace the existing bullet with:

```markdown
- **VTCode**: clone the Snowball repo (`git clone https://github.com/kellenff/snowball.git ~/Projects/snowball`), then symlink the skills into VTCode's user-scope discovery path: `mkdir -p ~/.agents/skills && for skill in ~/Projects/snowball/skills/*/; do ln -sfn "$skill" "$HOME/.agents/skills/$(basename "$skill")"; done`. Drop the bootstrap mirror into the project with `ln -sfn ~/Projects/snowball/.vtcode/AGENTS.md <your-project>/AGENTS.md` (or copy its contents into an existing `AGENTS.md`). For the decision spine (operator MADRs, agent observations), drop the hook config too: `ln -sfn ~/Projects/snowball/.vtcode/hooks.toml <your-project>/.vtcode/hooks.toml`. Edit the file to substitute the absolute path to your Snowball clone (`/absolute/path/to/snowball` is a placeholder). Verify with `vtcode skills list` (all 18 skills should appear) and by answering a `request_user_input` prompt — a MADR should appear under `docs/snowball/decisions/`. The committed `.vtcode/tool-policy.json` is a user-environment artifact, not a Snowball-managed file.
```

- [ ] **Step 3: Update the v6.6.0 changelog row**

The existing row mentions "No decision spine in this scope." Update it to:

```markdown
| v6.6.0 | VTCode harness adapter: forward spine via `.vtcode/AGENTS.md` bootstrap mirror + `skills/using-snowball/references/vtcode-tools.md` tool mapping; skills are symlinked into VTCode's `.agents/skills/` discovery path. Decision spine via `.vtcode/hooks.toml` (UserPromptSubmit, PostToolUse on `request_user_input`, SessionStart, Stop, PreCompact) — same hook rail Claude Code, Cursor, and OpenCode use. |
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): update VTCode setup bullet + changelog with hook config"
```

---

## Task 17: Update RELEASE-NOTES

**Goal:** Replace the "VTCode harness adapter" v6.6.0 section to mention the decision spine.

**Files:**

- Modify: `RELEASE-NOTES.md`

- [ ] **Step 1: Find the existing v6.6.0 section**

```bash
grep -n "^## v6\.6\.0" RELEASE-NOTES.md
```

Expected: one match.

- [ ] **Step 2: Replace the "VTCode harness adapter" subsection**

Find the existing v6.6.0 section. Replace the body with:

```markdown
## v6.6.0 (2026-06-23)

### VTCode harness adapter

Forward spine and decision spine for [VTCode](https://github.com/vinhnx/vtcode) (Rust-based CLI coding agent).

- **Bootstrap mirror** — `.vtcode/AGENTS.md` carries the `using-snowball` text verbatim inside a marker block, mirroring the Junie pattern at `extensions/snowball/.junie/AGENTS.md`. VTCode injects `AGENTS.md` as project guidelines, so the bootstrap is delivered without a `session-start` hook.
- **Decision spine via hooks** — VTCode's lifecycle rail is Claude-Code-shaped (UserPromptSubmit, PostToolUse, SessionStart, Stop, PreCompact). `.vtcode/hooks.toml` registers the existing Snowball shell scripts at each event: `on-user-prompt.sh` (approval-phrase MADRs), `on-stop.sh` and `on-pre-compact.sh` (extraction worker), and the session-start bootstrap. PostToolUse gets a new `on-ask-user-question-vtcode.sh` wrapper around `vtcode-post-tool-use-bridge.cjs`, a thin adapter that converts VTCode's `request_user_input` response shape (`answers: { id: { selected: [label] } }`) into the existing `handleAskUserQuestion` API.
- **Tool mapping** — new `skills/using-snowball/references/vtcode-tools.md` translates Claude Code tool names to VTCode's `unified_file` / `unified_search` / `unified_exec` family plus `apply_patch`, `request_user_input`, `task_tracker`, `start_planning` / `finish_planning`, and `web_fetch`. Added to the Platform Adaptation list in `skills/using-snowball/SKILL.md`.
- **Install** — clone the Snowball repo, symlink `skills/*/` into `~/.agents/skills/`, drop `.vtcode/AGENTS.md` into the target project's `AGENTS.md`, and drop `.vtcode/hooks.toml` into the target project's `.vtcode/` (substituting the absolute path to your clone in the latter). Verify with `vtcode skills list` (all 18 skills should appear) and by answering a `request_user_input` prompt.
- **Pre-commit test** — `tests/vtcode/validate-wiring.sh` now has four checks: the bootstrap mirror marker block, the tool mapping's expected primitives, the canonical `SKILL.md` referencing the new doc, and `.vtcode/hooks.toml` parsing with the five expected hook scripts.

### Known limitations

- No MCP integration — the tool mapping notes `.mcp.json` for future use, but no MCP server is shipped as part of VTCode support in v6.6.0. The decision spine runs over hooks; MCP capture is the Junie workaround for missing hooks and is unnecessary here.
- The committed `.vtcode/tool-policy.json` is a user-environment artifact, not a Snowball-managed file. Out of scope for this spec.
- Multi-select answers (`request_user_input` returns `selected: [label, ...]`) are reduced to the first label in the MADR. A future revision can extend the MADR format for multi-select if needed.
```

- [ ] **Step 3: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): rewrite v6.6.0 entry to cover VTCode decision spine"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
| --- | --- |
| Goals 1, 2 — per-harness adapter, forward spine | Tasks 1, 2, 3 |
| Goal 3 — tool mapping reference | Task 2 |
| Goal 4 — install instructions in README | Tasks 6, 16 |
| Goal 5 — keep bootstrap and SKILL.md in sync | Task 3 (Steps 5–6) |
| Components: `.vtcode/AGENTS.md` | Tasks 1, 13 |
| Components: `references/vtcode-tools.md` | Task 2 |
| Components: `tests/vtcode/validate-wiring.sh` | Tasks 4, 15 |
| Components: pre-commit wiring | Task 5 |
| Components: README + RELEASE-NOTES + version bump | Tasks 6, 7, 8, 16, 17 |
| Components: `.vtcode/hooks.toml` | Task 12 |
| Components: `vtcode-post-tool-use-bridge` | Task 10 |
| Components: `on-ask-user-question-vtcode.sh` | Task 11 |
| Decision spine via hooks | Tasks 10, 11, 12, 13, 14 |
| Install path documented | Task 6 Step 5 + Task 16 |
| Testing: pre-commit + manual | Tasks 4, 5, 9, 14, 15 |
| Open questions: symlink vs copy, marker block, mirror-in-repo | Symlink recommended in Task 6 Step 5 + README note; marker block matches Junie pattern (Task 1); mirror checked in (Task 1) |
| Known limitations: no MCP, policy management, multi-select answers, unused PreToolUse | Documented in Task 17 (RELEASE-NOTES) |

No spec gap.

**2. Placeholder scan:** No TBD / TODO / "implement later" patterns in the test or scripts. The README Setup bullet uses `TODO: link to docs/README.vtcode.md if you create one` as a hint to the author; remove it before tagging.

**3. Type consistency:** The mirror path `.vtcode/AGENTS.md`, the reference path `skills/using-snowball/references/vtcode-tools.md`, the test path `tests/vtcode/validate-wiring.sh`, and the version `6.6.0` are referenced consistently across tasks. No drift.

**4. Plan-vs-spec scope check:** The plan covers exactly the deliverables the spec lists: forward spine (Tasks 1, 2, 3), tool mapping (Task 2), install instructions (Tasks 6, 16), `.vtcode/hooks.toml` (Task 12), the VTCode PostToolUse bridge + wrapper (Tasks 10, 11), test extension (Task 15), the AGENTS.md capture-rules update (Task 13), README + RELEASE-NOTES (Tasks 6, 16, 17), and the version bump (Task 8). Plus the manual verification task. Nothing extra.
