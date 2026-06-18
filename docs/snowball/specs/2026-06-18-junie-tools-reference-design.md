---
title: junie-tools.md reference for using-snowball
status: accepted
date: 2026-06-18
spec-for: skills/using-snowball/references/junie-tools.md
related:
  - docs/snowball/specs/2026-06-16-junie-cli-marketplace-design.md
  - docs/snowball/specs/2026-06-17-mcp-path-resolution-fix-design.md
---

# junie-tools.md reference for using-snowball

## Goal

Add `skills/using-snowball/references/junie-tools.md` so that skill authors and Junie CLI users have a single, Snowball-curated mapping between Claude Code tool names and Junie CLI's tool surface, alongside the existing `codex-tools.md`, `copilot-tools.md`, `gemini-tools.md`, and `gitlab-duo-tools.md` references. The new file is the entry point the using-snowball skill points Junie CLI users at.

## Background

The using-snowball skill establishes the rule that skills use Claude Code tool names, and points non-CC platforms at per-harness reference files for tool equivalents. The four existing reference files (`codex-tools.md`, `copilot-tools.md`, `gemini-tools.md`, `gitlab-duo-tools.md`) cover Codex, Copilot CLI, Gemini CLI, and GitLab Duo. **Junie CLI is the only shipped harness without a reference file**, which means skill authors writing skills that target Junie CLI have no single Snowball-curated source for the mapping.

The Junie CLI marketplace spec ([`2026-06-16-junie-cli-marketplace-design.md`](./2026-06-16-junie-cli-marketplace-design.md)) shipped the marketplace install path, and the path-resolution fix spec ([`2026-06-17-mcp-path-resolution-fix-design.md`](./2026-06-17-mcp-path-resolution-fix-design.md)) made the install surface path-agnostic. Both plans flagged `junie-tools.md` as a must-followup.

## Junie CLI's tool surface (from JetBrains's official docs)

Junie CLI's built-in tool group labels match Claude Code's tool names almost exactly. From the Junie CLI documentation (the `junie-cli-docs` skill bundle):

| Built-in tool group | Purpose |
|---------------------|---------|
| `Read` | Read-only file viewing actions |
| `Bash` | Running shell commands in the local environment |
| `Glob` | Searching for files by path pattern |
| `Grep` | Searching for text by regular expression |
| `Write` | Creating new files |
| `Edit` | Modifying existing files (search/replace, apply patch) |
| `WebSearch` | Searching the web for up-to-date information |
| `AskUserQuestion` | Asking the user for input or a choice |

These labels are used in subagent frontmatter (`tools` and `disallowedTools` fields). At runtime, Junie resolves them against its built-in tool implementations.

The interesting surface is what does **not** have a Claude Code equivalent:

- **`Skill` tool** — does not exist. Skills auto-load from `.junie/skills/<name>/SKILL.md` based on `name` + `description` match against the current task.
- **`Task` tool** — does not exist. Subagents are Markdown files in `.junie/agents/<name>.md`; the main agent delegates by name match.
- **`TodoWrite`** — no direct equivalent. Junie does not surface a task-tracking tool group.
- **`WebFetch`** — no direct equivalent in core tool groups. MCP servers (e.g. `fetch`, `context7`) fill the gap.
- **`EnterPlanMode` / `ExitPlanMode`** — no equivalent tools. Plan mode is a session-level state toggled by `/plan` slash command or `--plan` CLI flag.

## Design

The new file matches the depth and shape of the existing reference files (specifically `codex-tools.md` / `copilot-tools.md` / `gemini-tools.md` — three single-surface files of ~40-60 lines). It does **not** try to cover Allowlist, Hooks, Custom slash commands, or other Junie-specific features that aren't in scope for skill authors; those are one link to JetBrains's docs away and adding them risks drift from upstream.

### File: `skills/using-snowball/references/junie-tools.md`

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

### Edit: `skills/using-snowball/SKILL.md`

The "Platform Adaptation" line in the body (line ~43) currently reads:

> Skills use Claude Code tool names. Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.

It becomes:

> Skills use Claude Code tool names. Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex), `references/junie-tools.md` (Junie CLI) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.

The AGENTS.md mirror at `extensions/snowball/.junie/AGENTS.md` (a generated file) is regenerated from `skills/using-snowball/SKILL.md` by `scripts/install-into-project.sh`; that regeneration is **out of scope for this spec** — the marketplace install path copies the canonical file, and the generated mirror is updated as part of the existing install script's normal flow.

## Test strategy

There is no automated test for a markdown reference file. Verification is:

1. **Content parity check (manual).** Open the four existing reference files and the new one side-by-side. Verify the new file's table format matches (`Skill references | Harness equivalent`), the section structure is similar, and the canonical-docs block points at official Junie URLs.
2. **Junie tool-group coverage check (manual).** Read the official Junie CLI docs (`junie-cli-docs` skill) and confirm every built-in tool group label listed there (`Read`, `Bash`, `Glob`, `Grep`, `Write`, `Edit`, `WebSearch`, `AskUserQuestion`) appears in the new file's table.
3. **`using-snowball` cross-reference check (manual).** Open `skills/using-snowball/SKILL.md` and confirm the new file is listed in the Platform Adaptation line, parallel to the existing three references.
4. **Markdown lint check (automated).** The existing `.pre-commit-config.yaml` runs `markdownlint-cli2` on markdown files. The new file should pass with the project's default rules; if it doesn't, fix inline (e.g. line-length violations in the table are tolerated by markdownlint-cli2's defaults).

## Manual verification

After the spec is implemented:

1. Open `skills/using-snowball/references/junie-tools.md` and skim the table — every Claude Code tool name from the four existing reference files should have a row.
2. Open `skills/using-snowball/SKILL.md` and confirm the Platform Adaptation line lists `junie-tools.md` next to `codex-tools.md` and `copilot-tools.md`.
3. Run `pre-commit run --all-files` and confirm the new file passes markdownlint-cli2 and any other relevant hooks (the existing hooks list should auto-pick the new file via the `markdownlint-cli2` glob).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Junie CLI only, no IDE-plugin coverage | Matches `codex/copilot/gemini` single-surface pattern. Marketplace spec is CLI-only. A second surface would double the file length for a 1% audience. |
| 2 | Standard depth (~80 lines) | Matches existing reference files. Avoids drift from upstream docs by deferring Allowlist / Hooks / Custom commands to canonical docs. |
| 3 | Call out the subagent name constraint (`[a-z][a-z0-9-]*`) | Snowball's `snowball:*` convention would silently fail in Junie. The note catches it at write time, not at deploy time. |
| 4 | Document `TodoWrite` and `WebFetch` as "no direct equivalent" with workarounds | These are real gaps skill authors will hit. Saying "use the closest substitute" is more useful than omitting them. |
| 5 | Cite JetBrains's `junie.jetbrains.com/docs` URLs at the bottom | Single canonical anchor; readers can navigate from there. Avoids brittle deep-link maintenance. |
| 6 | Single edit to `using-snowball/SKILL.md` (one line in Platform Adaptation) | The AGENTS.md mirror is generated and regenerated by the existing install script flow, not by this spec. |

## Out of scope

- **Allowlist (`~/.junie/allowlist.json`)** — Junie-specific, not relevant to skill authors. Referenced via canonical docs.
- **Hooks (EAP, `SessionStart` only)** — Junie-specific, not relevant to skill authors. Referenced via canonical docs.
- **Custom slash commands (`.junie/commands/<name>.md`)** — Junie-specific. Documented in the Configuration locations table at a high level; deep coverage deferred.
- **JetBrains IDE plugin's agent surface** — Different install path, different configuration model. CLI is the marketplace target. Defer to a follow-up if Snowball ever ships for the IDE plugin.
- **AGENTS.md regeneration** — Handled by `scripts/install-into-project.sh` as part of the existing marketplace install path.

## Open questions

1. **Exact Junie docs URLs.** The exact page paths under `junie.jetbrains.com/docs/*` are inferred from the docs I read; they may not match the live URL structure. **Action:** verify each URL on first implementation; if a URL 404s, point at the docs index instead.
2. **`TodoWrite` and `WebFetch` runtime support.** The official docs list eight built-in tool group labels and don't include `TodoWrite` or `WebFetch`. This spec treats that as "no direct equivalent." If a future Junie release adds them, this spec's table needs an update.
3. **Snowball subagent naming for Junie.** The marketplace spec ships a `snowball-capture` MCP server, not a subagent. The note in the Subagent dispatch section is forward-looking — it will become load-bearing the first time a Snowball skill ships a subagent in a Junie extension.

## Self-review

- **Placeholder scan:** No TBD / TODO / FIXME in the file content or the spec body. All sections have concrete text.
- **Internal consistency:** Table, prose sections, and configuration-locations table all agree. The "No explicit tool" rows in the table are explained in the matching prose sections.
- **Scope check:** Single file + one-line edit to `using-snowball/SKILL.md`. Small enough for one implementation plan; no decomposition needed.
- **Ambiguity check:** The "no direct equivalent" wording is paired with a workaround in every case. The subagent-name constraint is given an explicit regex and an example rename. Configuration locations are two-column tables with concrete paths.
