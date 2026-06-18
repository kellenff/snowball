# junie-tools.md Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `skills/using-snowball/references/junie-tools.md` so Junie CLI users have a Snowball-curated mapping between Claude Code tool names and Junie's tool surface, parallel to the existing `codex/copilot/gemini/gitlab-duo` references. Update `skills/using-snowball/SKILL.md` to list the new file in the Platform Adaptation line.

**Architecture:** One new file (a single, focused reference doc) plus a one-line edit to the using-snowball skill's Platform Adaptation line. No new tests, code, or scripts. Verification is the existing `markdownlint-cli2` pre-commit hook plus manual parity checks against the four existing reference files.

**Tech Stack:** Markdown (the file itself), bash (the pre-commit invocation), git (commits).

**Spec:** [`docs/snowball/specs/2026-06-18-junie-tools-reference-design.md`](../specs/2026-06-18-junie-tools-reference-design.md)

---

## Prerequisites

The spec is committed (this plan assumes `docs/snowball/specs/2026-06-18-junie-tools-reference-design.md` exists at the repo root). No other prerequisites — no marketplace groundwork, no MCP work, no skill changes outside the two files in this plan.

**Verify before starting Task 1:**

- [ ] `test -f docs/snowball/specs/2026-06-18-junie-tools-reference-design.md && echo "spec present" || echo "spec MISSING"`
- [ ] `test ! -f skills/using-snowball/references/junie-tools.md && echo "no prior file" || echo "junie-tools.md ALREADY EXISTS — review before continuing"`

If the second check fires (`junie-tools.md` already exists), stop and decide whether to keep, replace, or reset before proceeding. The plan assumes a clean slate.

---

## File Structure

**Created:**

```text
skills/using-snowball/references/
└── junie-tools.md                  # tool mapping reference, ~85 lines
```

**Modified:**

- `skills/using-snowball/SKILL.md` — one line in the body (Platform Adaptation section, line ~43). Adds `references/junie-tools.md` (Junie CLI) to the existing list of non-CC platform references.

**Not touched:**

- `extensions/snowball/.junie/AGENTS.md` — this is a generated mirror of `skills/using-snowball/SKILL.md`. The existing `scripts/install-into-project.sh` flow regenerates it as part of the marketplace install path. Regeneration is out of scope for this plan.
- The four existing reference files (`codex-tools.md`, `copilot-tools.md`, `gemini-tools.md`, `gitlab-duo-tools.md`).
- The marketplace spec, the path-resolution fix spec, or any of the other already-shipped work.

---

## Task 1: Create the new reference file

**Goal:** Ship `skills/using-snowball/references/junie-tools.md` with the exact content from the spec's Design section.

**Files:**

- Create: `skills/using-snowball/references/junie-tools.md`

- [ ] **Step 1: Write the file (TDD-shaped — content is the "test" of the spec)**

Create `skills/using-snowball/references/junie-tools.md` with the exact content below. The content is the same fenced code block from the spec's Design section, with the surrounding ```` ```markdown ```` fence stripped.

```markdown
# Junie CLI Tool Mapping

Skills use Claude Code tool names. Junie CLI accepts the same tool-group labels
in subagent frontmatter and resolves them at runtime, so the table below
maps Claude Code tool names to the Junie surface that handles them.

| Skill references | Junie CLI surface |
|-----------------|-------------------|
| `Read` (file reading) | `Read` tool group — read-only file viewing actions |
| `Write` (file creation) | `Write` tool group — creating new files |
| `Edit` (file editing) | `Edit` tool group — modifying existing files |
| `Bash` (run shell commands) | `Bash` tool group — running shell commands |
| `Grep` (search content) | `Grep` tool group — searching for text by regex |
| `Glob` (search paths) | `Glob` tool group — searching for files by path pattern |
| `WebSearch` (web search) | `WebSearch` tool group — searching the web for up-to-date info |
| `AskUserQuestion` (user prompt) | `AskUserQuestion` tool group — asking the user for input or a choice |
| `Skill` (invoke a skill) | No explicit tool — see [Skill loading](#skill-loading) |
| `Task` (dispatch subagent) | No explicit tool — see [Subagent dispatch](#subagent-dispatch) |
| `TodoWrite` (task tracking) | No direct equivalent — see [Task tracking](#task-tracking) |
| `WebFetch` (URL fetch) | No direct equivalent in core tool groups — see [Web fetch](#web-fetch) |
| `EnterPlanMode` / `ExitPlanMode` | No equivalent tools — see [Plan mode](#plan-mode) |

## Skill loading

Junie CLI has no explicit `Skill` tool. Skills auto-load: the main agent scans
`.junie/skills/<skill-name>/SKILL.md` (project + user scope) at session start
and selects skills whose frontmatter `name` and `description` match the
current task. Reference a skill by name in your prompt and Junie activates it.

Scope precedence: project-scope (`<project>/.junie/skills/<name>/`) wins over
user-scope (`~/.junie/skills/<name>/`) on name collision.

## Subagent dispatch

Junie CLI has no explicit `Task` tool. Subagents are Markdown files in
`.junie/agents/<name>.md` (project) or `~/.junie/agents/<name>.md` (user)
with YAML frontmatter declaring `name`, `description`, optional `tools` /
`disallowedTools` / `mcpServers` / `model` / `reasoningLevel` / `maxTurns` /
`skills` / `allowPromptArgument`, and the system-prompt body. The main agent
delegates to a subagent when its name and description match the task.

> **Name constraint.** The `name` field must match `[a-z][a-z0-9-]*` (lowercase
> letters, digits, hyphens only — no colons). Snowball's `snowball:*` convention
> does not work directly; rename to `snowball-<role>` (e.g. `snowball-impl-reviewer`)
> when shipping a subagent in a Junie extension.

> **Tool group labels** in subagent frontmatter (`tools` / `disallowedTools`)
> use the same names as Claude Code: `Read`, `Bash`, `Glob`, `Grep`, `Write`,
> `Edit`, `WebSearch`, `AskUserQuestion`. These map cleanly to Junie's built-in
> tool groups.

## Task tracking

Junie CLI does not expose a `TodoWrite` tool group. Track task progress in
the chat itself, or use `AskUserQuestion` for confirmation patterns that need
an explicit user ack. Snowball skills that rely on TodoWrite for visible
progress should adapt to the in-chat flow or surface structured progress via
subagent returns.

## Web fetch

Junie CLI does not expose a `WebFetch` tool group. For URL fetching, attach
a relevant MCP server (e.g. `fetch`, `context7`) in the project or user
`mcp.json`, or use the `WebSearch` tool group to find the URL first and then
ask the user to confirm the content. The `--brave` slash command does not
re-enable `WebFetch`.

## Plan mode

Claude Code's `EnterPlanMode` / `ExitPlanMode` tools do not exist in Junie.
Plan mode is a session-level state toggled by the `/plan` slash command (or
`--plan` CLI flag, or `Shift+Tab` shortcut). When active, Junie produces a
design document before editing files and waits for explicit confirmation
before implementing. The plan-mode plan lives next to the session, not in
`.junie/`.

## Configuration locations

| Claude Code | Junie CLI |
|-------------|-----------|
| `~/.claude/settings.json` (user) | `~/.junie/config.json` (user) and `<project>/.junie/config.json` (project) |
| `~/.claude/skills/<name>/` (user) | `~/.junie/skills/<name>/` (user) and `<project>/.junie/skills/<name>/` (project) |
| `~/.claude/agents/<name>.md` (user) | `~/.junie/agents/<name>.md` (user) and `<project>/.junie/agents/<name>.md` (project) |
| `~/.claude/commands/<name>.md` (user) | `~/.junie/commands/<name>.md` (user) and `<project>/.junie/commands/<name>.md` (project) |
| `.mcp.json` (project root) | `<project>/.junie/mcp/mcp.json` (project) and `~/.junie/mcp/mcp.json` (user) |

MCP config uses the standard MCP JSON schema (same `mcpServers` key as
Claude Code, same `command` / `args` / `env` / `url` / `headers` per-server
shape). Junie CLI uses the same MCP configuration as Junie in JetBrains IDEs.

## Canonical docs

- [Junie CLI documentation index](https://junie.jetbrains.com/docs)
- [Agent skills](https://junie.jetbrains.com/docs/agent-skills)
- [MCP configuration](https://junie.jetbrains.com/docs/mcp)
- [Custom subagents](https://junie.jetbrains.com/docs/subagents)
- [Plan mode](https://junie.jetbrains.com/docs/plan-mode)
- [Configuration files](https://junie.jetbrains.com/docs/configuration)
```

- [ ] **Step 2: Verify the file exists and line count is in range**

Run:

```bash
test -f skills/using-snowball/references/junie-tools.md && \
wc -l skills/using-snowball/references/junie-tools.md
```

Expected: a single line count between 80 and 100. The exact count varies by editor; 80-100 covers the content above plus or minus a few lines. If the line count is outside that range, re-read the file — the content may have been truncated or duplicated.

- [ ] **Step 3: Verify all seven required section headings are present**

Run:

```bash
grep -c '^## ' skills/using-snowball/references/junie-tools.md
```

Expected: `7` (the introductory tool mapping table is part of the file but uses pipe-rows, not `##` headings, so it does not count toward this grep). The seven `##` headings are: Skill loading, Subagent dispatch, Task tracking, Web fetch, Plan mode, Configuration locations, Canonical docs.

If the count is not 7, list the headings to find the missing one:

```bash
grep '^## ' skills/using-snowball/references/junie-tools.md
```

Compare against the seven sections in Step 1's content.

- [ ] **Step 4: Commit (provisional — final commit happens in Task 4)**

```bash
git add skills/using-snowball/references/junie-tools.md
git commit -m "docs(using-snowball): add junie-tools.md reference for Junie CLI

Parallel to the existing codex/copilot/gemini/gitlab-duo references.
Maps Claude Code tool names to Junie CLI's tool surface; documents
the genuine gaps (Skill/Task/TodoWrite/WebFetch/EnterPlanMode) and
the subagent name constraint ([a-z][a-z0-9-]*).

Co-authored-by: Junie <junie@jetbrains.com>"
```

---

## Task 2: Edit `skills/using-snowball/SKILL.md`

**Goal:** Add `references/junie-tools.md` (Junie CLI) to the Platform Adaptation line, parallel to the existing `copilot-tools.md` and `codex-tools.md` references.

**Files:**

- Modify: `skills/using-snowball/SKILL.md` — one line in the body (Platform Adaptation section, around line 43)

- [ ] **Step 1: Verify the current line text matches what the spec says to replace**

Run:

```bash
grep -n "Non-CC platforms" skills/using-snowball/SKILL.md
```

Expected: a single line like:

```text
43:Skills use Claude Code tool names. Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.
```

The exact line number may differ. Confirm the text after `Non-CC platforms:` is:

> see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.

If the text differs (e.g., the file has been updated since the spec was written), stop and reconcile with the spec before continuing.

- [ ] **Step 2: Apply the edit**

Run `search_replace` (the IDE's search-and-replace tool) to update the line. The `search` text is the current line; the `replace` text inserts the new reference between `codex-tools.md` and `for tool equivalents`.

- Search (full line, exact match):

```text
Skills use Claude Code tool names. Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.
```

- Replace (full line):

```text
Skills use Claude Code tool names. Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex), `references/junie-tools.md` (Junie CLI) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.
```

Expected: the search returns exactly one match, the replace is applied, and the file now references all three reference files on the same line.

- [ ] **Step 3: Verify the edit**

Run:

```bash
grep -n "junie-tools.md" skills/using-snowball/SKILL.md
```

Expected: a single line containing the string `junie-tools.md`. If zero matches, the edit did not land. If more than one match, the file has been edited since the spec was written — investigate.

- [ ] **Step 4: Commit (provisional — final commit happens in Task 4)**

```bash
git add skills/using-snowball/SKILL.md
git commit -m "docs(using-snowball): reference junie-tools.md in Platform Adaptation

Adds the new junie-tools.md reference to the list of non-CC platform
mappings, parallel to copilot-tools.md and codex-tools.md.

Co-authored-by: Junie <junie@jetbrains.com>"
```

---

## Task 3: Run pre-commit on the changed files

**Goal:** Catch any markdown lint, line-ending, trailing-whitespace, or other style issues before the final verification. This is the closest thing to a "test" for a markdown file in this repo.

**Files:**

- Modify: none (verification only)

- [ ] **Step 1: Run pre-commit on the two files**

Run:

```bash
pre-commit run --files \
  skills/using-snowball/references/junie-tools.md \
  skills/using-snowball/SKILL.md
```

Expected: every hook reports `Passed` (or `Skipped` for hooks with no files to check). The 12 active hooks are: `check yaml`, `check json`, `fix end of files`, `trim trailing whitespace`, `check for merge conflicts`, `check for added large files`, `shfmt`, `shellcheck`, `markdownlint-cli2`, `oxlint`, `oxfmt`, plus the snowball-specific `build snowball-capture bundle`, `bun test snowball-capture`, `validate junie-cli marketplace`, `junie-cli path resolution`. For two markdown files, most of these will report "no files to check / Skipped". The ones that actually run are: `fix end of files`, `trim trailing whitespace`, `check for merge conflicts`, `check for added large files`, `markdownlint-cli2`.

If any of the active hooks reports `Failed`, fix inline (most likely candidates: trailing whitespace, line length in a table row, missing blank line around a heading) and re-run. The pre-commit hooks may also auto-fix; if so, re-stage the auto-fixed files with `git add -u` before re-running.

- [ ] **Step 2: Verify nothing new was staged**

Run:

```bash
git status --short
```

Expected: only the two files from Tasks 1 and 2 are listed, with no other modifications. If pre-commit auto-fixed something, the file will appear in the status — that's expected; the auto-fixes will be included in the final commit.

---

## Task 4: Final verification and consolidation commit

**Goal:** Confirm both changes are in place, the pre-commit hooks pass, and the work is committed as a single coherent unit (or two commits, one per file, if Tasks 1/2 already committed).

**Files:**

- Modify: none (verification + optional consolidation)

- [ ] **Step 1: Inspect the final diff for `skills/using-snowball/SKILL.md`**

Run:

```bash
git log -p -1 -- skills/using-snowball/SKILL.md | head -30
```

Expected: the most recent commit on `skills/using-snowball/SKILL.md` is the Task 2 commit, and its diff shows the single-line change to the Platform Adaptation section. The diff should add `, \`references/junie-tools.md\` (Junie CLI)` between the existing `codex-tools.md` and `for tool equivalents`.

- [ ] **Step 2: Inspect the final diff for `skills/using-snowball/references/junie-tools.md`**

Run:

```bash
git log -p -1 -- skills/using-snowball/references/junie-tools.md | head -20
```

Expected: the most recent commit on the new file is the Task 1 commit, and the diff shows the full file as added (no prior history).

- [ ] **Step 3: Re-run pre-commit on the full repo to confirm nothing else broke**

Run:

```bash
pre-commit run --all-files
```

Expected: all hooks pass. This is a wider sweep than Task 3; it catches any side effects on other files (e.g., the regenerated `extensions/snowball/.junie/AGENTS.md` mirror if a prior regen landed in the worktree).

If any hook reports `Failed`, the failure is unrelated to this plan's work (the plan only touched two files); fix or report separately.

- [ ] **Step 4: Manual parity check against the four existing reference files**

Open all five reference files in your editor:

- `skills/using-snowball/references/codex-tools.md`
- `skills/using-snowball/references/copilot-tools.md`
- `skills/using-snowball/references/gemini-tools.md`
- `skills/using-snowball/references/gitlab-duo-tools.md`
- `skills/using-snowball/references/junie-tools.md`

Confirm:

- The new file's table format is `| Skill references | Junie CLI surface |` — same two-column structure as the others.
- The new file's "Canonical docs" section lists the same kind of official-docs links the others do.
- The new file is shorter than 150 lines (target: ~85).

If any check fails, the file is out of pattern — fix inline and re-run pre-commit.

- [ ] **Step 5: No-op commit if everything is clean**

If Tasks 1 and 2 already committed and Task 3's pre-commit pass produced no auto-fixes, there's nothing to do. Skip to the Self-Review below.

If pre-commit auto-fixed something (a trailing whitespace, a line length, etc.), stage and commit the fix:

```bash
git add -u
git diff --cached --quiet || git commit -m "style: pre-commit auto-fixes for junie-tools reference

Co-authored-by: Junie <junie@jetbrains.com>"
```

---

## Self-Review

**1. Spec coverage.** Skim each requirement in `docs/snowball/specs/2026-06-18-junie-tools-reference-design.md` and confirm a task covers it:

| Spec section | Covered by |
|--------------|------------|
| Goal (one file + one line edit) | Task 1 + Task 2 |
| Background (Junie is the only shipped harness without a reference) | n/a — this is rationale, not implementation |
| Tool surface (8 tool group labels match Claude Code) | Task 1 Step 1 (the file's content) |
| Design — file content (table + 6 prose sections + canonical docs) | Task 1 Step 1 |
| Design — `using-snowball/SKILL.md` one-line edit | Task 2 |
| Test strategy (content parity, tool-group coverage, cross-ref, markdownlint) | Task 3 + Task 4 Step 4 |
| Manual verification (open files, pre-commit, etc.) | Task 4 Step 4 |
| Decisions (6 rows) | n/a — rationale baked into the file content from Task 1 |
| Out of scope (Allowlist, Hooks, Custom commands, IDE plugin, AGENTS.md regen) | Out of scope: no task needed |
| Open questions (URLs to verify, TodoWrite/WebFetch future support, subagent naming) | Forward-looking; not blocking this plan |

No spec requirement is missing a task. The three open questions are intentional deferred work, not plan gaps.

**2. Placeholder scan.** Search the plan for the red-flag patterns:

- `TBD` / `TODO` / `FIXME` / `XXX` in task content: none. (The plan uses "TDD-shaped" and "expected" but no unresolved placeholders.)
- "Add appropriate error handling" / "similar to Task N" / vague "validate" steps: none. Every step has explicit commands and expected output.
- "Write tests for the above" without test code: none. The plan's "tests" are pre-commit invocations and grep assertions — both with full commands.

**3. Type consistency.** The plan references the following names consistently across tasks:

- File path: `skills/using-snowball/references/junie-tools.md` (Tasks 1, 3, 4).
- Edit target: `skills/using-snowball/SKILL.md` Platform Adaptation line (Tasks 2, 3, 4).
- Pre-commit invocation: `pre-commit run --files ...` (Task 3 Step 1) and `pre-commit run --all-files` (Task 4 Step 3). Same tool, different scope.
- Commit subject: `docs(using-snowball): ...` for both files. Same prefix, parallel commits.
- Co-author trailer: `Co-authored-by: Junie <junie@jetbrains.com>` on every commit. Consistent.

No name drift. No function called two different ways. No symbol referenced in one task and undefined in another.

**4. Plan integrity.** Each task is self-contained and 2-5 minutes. The plan is small (4 tasks) because the spec is small (one file + one line edit). No task depends on context that isn't established in a prior task. The optional Step 5 in Task 4 handles the auto-fix case explicitly so the executor doesn't have to guess.

**5. Things deliberately not in the plan:**

- AGENTS.md regeneration. The `extensions/snowball/.junie/AGENTS.md` file is a generated mirror; regeneration is owned by `scripts/install-into-project.sh` as part of the marketplace install path. Pulling it into this plan would create a second owner.
- URL verification. The `junie.jetbrains.com/docs/*` URLs are documented as open question 1 in the spec. Verification is the implementer's responsibility on first read; if a URL 404s, point at the docs index.
- Tests for the content itself. The spec's test strategy is manual + pre-commit; there's no reasonable automated test for prose content parity.
