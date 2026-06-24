# VTCode Support

**Date:** 2026-06-23
**Status:** Accepted
**Scope:** New per-harness adapter for VTCode (vinhnx/vtcode). Forward spine only — no decision spine.
**Depends on (optional, external):** [VTCode](https://github.com/vinhnx/vtcode) installed in the user's environment.
**Related:** [2026-06-18-junie-tools-reference-design.md](./2026-06-18-junie-tools-reference-design.md) (same per-harness reference-doc precedent).

## Problem

Snowball currently ships per-harness adapters for Claude Code, Cursor, GitHub Copilot CLI, OpenCode, Codex CLI / Codex App, Gemini CLI, GitLab Duo, Aider, and Junie. VTCode — a Rust-based CLI coding agent from `vinhnx/vtcode` — is not on the list. Users running VTCode get none of the snowball methodology, no project guidelines, and no path to the per-harness tool mapping.

The user has a VTCode install already (a `.vtcode/tool-policy.json` is committed in this repo's working tree) and wants Snowball's skills reachable from VTCode sessions, plus install instructions in the README.

## Goals

1. Ship VTCode as a per-harness adapter, alongside the nine already listed in the README.
2. Forward spine fully covered: the 18 skills are reachable as VTCode skills, the `using-snowball` bootstrap is injected as project context.
3. Tool-name mapping reference (`skills/using-snowball/references/vtcode-tools.md`) so skills authored against Claude Code tool names work on VTCode.
4. Install instructions in README so a VTCode user can wire up Snowball in one copy-paste.
5. Reuse, don't rebuild. The bootstrap content is sourced from `skills/using-snowball/SKILL.md` and any drift is a spec violation — keep them in sync, exactly like the Junie mirror.

## Non-Goals

- **MCP-based capture.** The Junie bundle's `snowball-capture` MCP server is the workaround for harnesses with no hook API. VTCode has hooks, so the MCP workaround is unnecessary; capture runs over the same hook rail Claude Code and Cursor already use.
- **A `request_user_input` schema migration.** VTCode's question/answer shapes are very close to Claude Code's but not identical (the answer side wraps the label in `{selected: [...]}` instead of a bare string). The adapter layer absorbs that one difference; the upstream `SKILL.md` format and the on-disk MADR layout stay unchanged.
- **A new marketplace / extension wrapper.** VTCode has no marketplace. Skills are installed by writing `SKILL.md` files under `~/.agents/skills/` (user) or `.agents/skills/` (project) and VTCode discovers them at session start. A wrapper would be ceremony with no benefit.
- **Modifying `skills/decision-logging/` or `extensions/snowball/snowball-capture/`.** The forward-spine change is purely additive.
- **Tool policy file management.** The committed `.vtcode/tool-policy.json` is a user-environment artifact, not a Snowball deliverable. This spec does not promise to maintain it.

## VTCode's surface (what the design assumes)

Verified against `github.com/vinhnx/vtcode` and its `docs/skills/SKILLS_GUIDE.md`:

- **Skill discovery** — VTCode scans in order: `.agents/skills/<name>/SKILL.md` (project, nearest CWD first), then `~/.agents/skills/<name>/`, then `/etc/codex/skills/`, then bundled system skills. Snowball's `SKILL.md` format (YAML frontmatter with `name` + `description`, plus optional `references/`, `scripts/`, `assets/`) is compatible.
- **Skill frontmatter extras** — VTCode reads `allowed-tools` (whitespace-separated tool allowlist), `disable-model-invocation`, `compatibility`, `metadata`, and `license`. Snowball's skills do not currently set these; nothing to migrate.
- **Project guidelines** — `AGENTS.md` at the project root is injected as system-level context. Convention: scope-guidelines live under `.vtcode/AGENTS.md` so they group with the rest of the `.vtcode/` config; VTCode also reads the project-root `AGENTS.md`. The existing Junie pattern uses `.junie/AGENTS.md`; we mirror that with `.vtcode/AGENTS.md`.
- **MCP** — VTCode uses `.mcp.json` at the project root (same shape as Claude Code's `mcpServers` key). Out of scope for the forward spine; documented for future use.
- **CLI** — `vtcode init`, `vtcode skills list`, `vtcode skills info <name>`, `vtcode skills validate <path>`, `vtcode skills create <name>`. Useful for install verification.
- **Tool surface** — VTCode's tool names are the `available_tools` from `.vtcode/tool-policy.json` (e.g. `unified_file`, `unified_search`, `unified_exec`, `request_user_input`, `apply_patch`, `task_tracker`, `start_planning`, `finish_planning`, `cron_*`, `mcp_*`, `web_fetch`). The mapping reference translates Claude Code tool names to these.
- **Hooks** — full Claude-Code-shaped lifecycle rail: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `PreCompact`, plus `PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`. Hook input is JSON on stdin; output is JSON on stdout; matcher regex selects which tool/event the hook fires for. Configuration lives in `vtcode.toml` (`[hooks.lifecycle]`) or in a project-scoped `hooks.toml`. See the decision-spine section below for how Snowball uses them.

## Design

### Architecture

```text
.vtcode/AGENTS.md                            (the VTCode-side bootstrap mirror)
                                             (mirrors .vtcode/tool-policy.json at the same level)
.vtcode/hooks.toml                           (the VTCode-side hook config)

skills/using-snowball/references/
└── vtcode-tools.md                          (tool-name mapping; matches junie-tools.md shape)

skills/decision-logging/src/
├── vtcode-post-tool-use-bridge.ts           (NEW; thin adapter for request_user_input)
└── (existing: write-madr, append-observation, approval-phrases,
    ask-user-question-bridge, user-prompt-bridge, hook-payload, git-root)

skills/decision-logging/scripts/
├── on-ask-user-question-vtcode.sh           (NEW; thin shell wrapper, mirrors on-ask-user-question.sh)
└── (existing: on-user-prompt.sh, on-stop.sh, on-pre-compact.sh,
    on-ask-user-question.sh, fork-extract-worker.sh, the *.cjs bundles)

README.md                                    (per-harness row + Setup bullet + changelog sub-bullet)
skills/using-snowball/SKILL.md               (Platform Adaptation: add vtcode-tools.md to the list)
tests/vtcode/                                (stdlib-only bash test that asserts the wiring)
├── README.md
└── validate-wiring.sh
tests/decision-logging/handlers.test.ts      (additions: VTCode adapter pure-function tests)
```

Three deliverables, each on a VTCode first-class surface:

1. **Bootstrap** — `.vtcode/AGENTS.md` carries the `using-snowball` text verbatim, plus a short index of available skills. Replaces the `session-start` hook on Claude Code. `AGENTS.md` is the only context VTCode guarantees to inject, so the bootstrap has to live there.
2. **Skill discovery** — no Snowball-side change required. VTCode reads `.agents/skills/<name>/SKILL.md`. Snowball's existing skill layout (`skills/<name>/SKILL.md` + `references/` + `scripts/`) drops in. The install step is to copy or symlink `skills/` into `.agents/skills/` (project) or `~/.agents/skills/` (user).
3. **Tool mapping** — `skills/using-snowball/references/vtcode-tools.md` translates Claude Code tool names to VTCode's `unified_*` family plus the planning/track tools. Same role as the existing `junie-tools.md` and `copilot-tools.md`.

### Components

#### `.vtcode/AGENTS.md`

Three sections, in this order:

1. **Bootstrap** — the `using-snowball` text verbatim, with a marker block delimiting the mirrored content so the mirror can be regenerated by tooling. The same shape as `extensions/snowball/.junie/AGENTS.md`.
2. **Skill index** — one line per skill with its trigger description. VTCode does not auto-activate skills by name in the same way Claude Code's `Skill` tool does, so the index tells the agent what's available without enumerating.
3. **Tool mapping pointer** — a one-liner pointing at `references/vtcode-tools.md` in the snowball skills directory, so the agent knows where to look up unfamiliar Claude Code tool names.

#### `skills/using-snowball/references/vtcode-tools.md`

Matches the existing `junie-tools.md` shape:

- A short preamble explaining that skills use Claude Code tool names and the table maps them.
- A single table mapping each Claude Code primitive (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `AskUserQuestion`, `TodoWrite`, `Skill`, `Task`, `EnterPlanMode`/`ExitPlanMode`) to its VTCode equivalent.
- Notes for missing primitives (e.g. `EnterPlanMode` / `ExitPlanMode` map to VTCode's `start_planning` / `finish_planning`).
- A "Configuration locations" table mapping Claude Code config paths to VTCode's (`.vtcode/tool-policy.json`, `.vtcode/AGENTS.md`, `.mcp.json`, etc.).
- A "Canonical docs" section with the upstream VTCode links.

#### `tests/vtcode/validate-wiring.sh`

Stdlib-only bash test that asserts:

1. `.vtcode/AGENTS.md` exists, has a Snowball marker block, and references the right skill directory.
2. `skills/using-snowball/references/vtcode-tools.md` exists, is non-empty, and contains the expected tool mappings.
3. `skills/using-snowball/SKILL.md` mentions VTCode in the Platform Adaptation list.
4. `.vtcode/hooks.toml` exists, parses as valid TOML, has a `[hooks.lifecycle]` table, and references the five expected hook scripts (`session-start`, `on-user-prompt.sh`, `on-ask-user-question-vtcode.sh`, `on-stop.sh`, `on-pre-compact.sh`).

Wired into pre-commit alongside the existing `validate-junie-cli-marketplace` hook.

#### `.vtcode/hooks.toml`

VTCode's hook config is TOML under `[hooks.lifecycle]`. Five event registrations, each pointing at an existing shell script. `user_prompt_submit` and `stop` also wire the existing `hooks/blast-radius-audit.sh` so VTCode gets the same operator-approval and stop audits Claude Code and OpenCode get.

```toml
[hooks.lifecycle]

[[hooks.lifecycle.user_prompt_submit]]
hooks = [
  { command = "/path/to/snowball/skills/decision-logging/scripts/on-user-prompt.sh" },
  { command = "/path/to/snowball/hooks/blast-radius-audit.sh operator-approval" }
]

[[hooks.lifecycle.post_tool_use]]
matcher = "request_user_input"
hooks = [
  { command = "/path/to/snowball/skills/decision-logging/scripts/on-ask-user-question-vtcode.sh" }
]

[[hooks.lifecycle.session_start]]
hooks = [
  { command = "/path/to/snowball/hooks/run-hook.cmd session-start" }
]

[[hooks.lifecycle.stop]]
hooks = [
  { command = "/path/to/snowball/skills/decision-logging/scripts/on-stop.sh" },
  { command = "/path/to/snowball/hooks/blast-radius-audit.sh stop" }
]

[[hooks.lifecycle.pre_compact]]
hooks = [
  { command = "/path/to/snowball/skills/decision-logging/scripts/on-pre-compact.sh" }
]
```

The matcher regex `request_user_input` selects VTCode's HITL tool. All other PostToolUse events pass through unsampled.

#### Decision spine (additions to the forward spine)

**Hook coverage parity.** VTCode's hook rail is a near-clone of Claude Code's, so the existing shell scripts (`on-user-prompt.sh`, `on-stop.sh`, `on-pre-compact.sh`, `session-start`) can be reused unchanged. Their stdin payload is JSON, the field names match Claude Code's: `session_id` on every event, `prompt` on `UserPromptSubmit`, `last_assistant_message` on `Stop`. The existing CJS bridges (`user-prompt-bridge.cjs`, `append-observation.cjs`) parse them without modification.

**One adapter needed.** The `request_user_input` PostToolUse response differs from Claude Code's `AskUserQuestion` response in one place: answers are wrapped in an object with a `selected: [label, ...]` array (plus an optional `other` freeform note), not a bare string. The existing `normalizeAnswers` reads `answers: { question_text: string }`. A new thin adapter, `skills/decision-logging/src/vtcode-post-tool-use-bridge.ts`, converts `payload.tool_response.answers[id].selected[0]` (with a fallback to `.other`) into `answers[question_text]` and calls the existing `handleAskUserQuestion` pure function in-process — the same in-process reuse pattern the OpenCode plugin uses.

**Why not bundle `snowball-capture` for VTCode.** The Junie bundle ships a `snowball-capture` MCP server because Junie has no hook API; the agent has to remember to call the MCP tool. VTCode has hooks, so the passive hook-driven path is available and the MCP workaround is unnecessary.

#### Mirror updates

The `.vtcode/AGENTS.md` bootstrap mirror gains a "Capture rules" section that mirrors the one in `extensions/snowball/.junie/AGENTS.md`: three short paragraphs, one per capture path (`approval_phrase_record`, `madr_capture` from the `request_user_input` adapter, `observation_log` from the agent's choice). The "no decision spine in this scope" caveat from v6.6.0 draft 1 is removed; the mirror now promises the same decision spine Claude Code and Cursor get.

The install block in the mirror also gains `.vtcode/hooks.toml`: same symlink-into-project pattern as `AGENTS.md`.

### File structure

**Created:**

- `.vtcode/AGENTS.md` — bootstrap mirror.
- `.vtcode/hooks.toml` — VTCode hook config (the decision-spine wiring).
- `skills/using-snowball/references/vtcode-tools.md` — tool mapping.
- `skills/decision-logging/src/vtcode-post-tool-use-bridge.ts` — PostToolUse adapter for `request_user_input`.
- `skills/decision-logging/scripts/on-ask-user-question-vtcode.sh` — shell wrapper that calls the adapter.
- `tests/vtcode/validate-wiring.sh` — pre-commit test.
- `tests/vtcode/README.md` — one-paragraph doc.
- `docs/snowball/specs/2026-06-23-vtcode-support-design.md` — this file.
- `docs/snowball/plans/2026-06-23-vtcode-support.md` — the plan.

**Modified:**

- `skills/using-snowball/SKILL.md` — add VTCode to "How to Access Skills" and "Platform Adaptation".
- `README.md` — add VTCode row to the per-harness table; add Setup bullet; add v6.6.0 changelog sub-bullet.
- `RELEASE-NOTES.md` — add v6.6.0 entry referencing the new adapter.
- `.pre-commit-config.yaml` — add the `validate-vtcode-wiring` hook.
- `.version-bump.json` — bump version 6.5.0 → 6.6.0.

**Not touched:**

- `extensions/snowball/` — Junie-only bundle, leave alone.
- `extensions/snowball/snowball-capture/` — VTCode has hooks, so the MCP workaround is unnecessary.
- The committed `.vtcode/tool-policy.json` — user-environment artifact, do not regenerate.

## Install path (what users run)

The README Setup section will document:

```bash
# 1. Clone the repo (or reuse the existing clone).
git clone https://github.com/kellenff/snowball.git ~/Projects/snowball

# 2. Symlink the skills into VTCode's user-scope skills directory so they
#    show up in every project. Use a project-scope symlink instead if you
#    want Snowball to differ per-project.
mkdir -p ~/.agents/skills
for skill in ~/Projects/snowball/skills/*/; do
  ln -sfn "$skill" "$HOME/.agents/skills/$(basename "$skill")"
done

# 3. Drop the bootstrap mirror into your project. Optional but recommended:
#    it gives VTCode the "skills come first" instruction without re-reading
#    the SKILL.md every session.
ln -sfn ~/Projects/snowball/.vtcode/AGENTS.md <your-project>/AGENTS.md
#    (or copy the contents of .vtcode/AGENTS.md into your project's
#    AGENTS.md if you already have one)
```

The README will call out that VTCode does not yet have a decision-spine integration, and that the existing `.vtcode/tool-policy.json` is the user's environment config (not a Snowball-managed file).

## Testing

Automated (pre-commit):

- `tests/vtcode/validate-wiring.sh` — stdlib-only bash test that asserts the three structural checks listed above.

Manual (one-time, documented in the plan):

- `vtcode skills list` — should show all 18 snowball skills.
- `vtcode skills info brainstorming` — should show name + description from the frontmatter.
- Start a VTCode session in a project with `AGENTS.md` mirroring `.vtcode/AGENTS.md`, ask "use the brainstorming skill," and verify the agent announces it.
- Verify a tool mapping from `references/vtcode-tools.md` works (e.g. ask the agent to read a file; it should use `unified_file`).

## Open questions

1. **Symlink or copy for skills install?** Symlinking is consistent with the OpenCode model and avoids drift. The `install-into-project.sh` script writes real files for GitLab Duo and Aider because those harnesses do not follow symlinks; VTCode's skill discovery is symlink-friendly (no documented restriction). Recommendation: symlink, with a README note that the user can `cp -R` instead if their filesystem refuses symlinks.
2. **Should `.vtcode/AGENTS.md` live in the repo or be generated?** The Junie mirror (`extensions/snowball/.junie/AGENTS.md`) is checked in. The VTCode mirror (`.vtcode/AGENTS.md`) is also checked in for the same reason: it's the bootstrap, and the file needs to be present at the expected path for VTCode to pick it up. A generator could be added later, mirroring the Junie sync story.
3. **Should the bootstrap mirror use a marker block for auto-regeneration?** Yes — `<!-- BEGIN SNOWBALL BOOTSTRAP (mirror of skills/using-snowball/SKILL.md) --> ... <!-- END SNOWBALL BOOTSTRAP -->` and `<!--- BEGIN VTCode INSTALL NOTES --> ... <!--- END -->`, matching the Junie pattern. A future sync script can then re-emit the marked block from the canonical source.

## Known limitations

- **No MCP integration in this scope.** The reference doc mentions `.mcp.json` for future use, but no MCP server is shipped as part of VTCode support in v6.6.0. The decision spine runs over hooks; MCP capture is the Junie workaround for missing hooks and is not needed here.
- **Tool policy is a user artifact.** The committed `.vtcode/tool-policy.json` shows the user's environment, not a Snowball-managed file. Out of scope.
- **`PreToolUse` is exposed but unused.** Snowball's existing capture bridges run on `PostToolUse` (for completed tool calls with responses) and on `UserPromptSubmit` (for free-text approvals). VTCode's `PreToolUse` rail is registered for future use (e.g. permission-policy enforcement or input validation) but no Snowball hook targets it in v6.6.0.
- **One small answer-format gap.** The adapter hardcodes `selected[0]` as the chosen label. VTCode's `request_user_input` allows multi-select (`selected` is an array), but Snowball's MADR format assumes a single choice per question. Multi-select answers land in the MADR with the first selected label; the other selections are dropped. A future revision can extend the MADR format to carry multi-select.
