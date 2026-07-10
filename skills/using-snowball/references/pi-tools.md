---
name: pi-tools
description: Maps Claude Code tool names to pi equivalents. Use when reading snowball skills authored for Claude Code and adapting them to pi.
---

# Pi Tool Mapping

Skills use Claude Code tool names. Pi's built-in tools are lowercase (`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`). The table below maps Claude Code primitives to their pi equivalents.

## Mapping

| Skill references | Pi equivalent | Notes |
|------------------|---------------|-------|
| `Read` | `read` | Native. |
| `Write` | `write` | Native. |
| `Edit` | `edit` | Native. |
| `Bash` | `bash` | Native. |
| `Grep` | `grep` | Native. |
| `Glob` | `find` | Pi has no glob; `find` with `-name` is closest. |
| `LS` | `ls` | Native. |
| `WebSearch` | none — use `bash` + `curl` | Pi has no built-in web tool. |
| `WebFetch` | none — use `bash` + `curl` | Same. |
| `AskUserQuestion` | none — see [Operator prompts](#operator-prompts) | Pi exposes `ctx.ui.select/confirm/input` only inside extensions. Snowball skills that ask operator questions degrade to plain text. |
| `TodoWrite` | none — see [Task tracking](#task-tracking) | Pi has no built-in todo. Use a TODO.md file or write your own extension. |
| `Skill` | `/skill:<name>` (pi-native slash command) | Pi expands `/skill:foo` to the skill's content during input preprocessing. The agent never calls an explicit tool; the slash form is built into pi, not into snowball. |
| `Task` (subagent) | none — see [Subagents](#subagents) | Pi has no built-in subagent. Spawn a child pi process via tmux, or install a third-party subagent package. |
| `EnterPlanMode` / `ExitPlanMode` | none | Pi has no plan mode. Write plans to files (e.g., `plans/<topic>.md`). |
| `apply_patch` | `edit` | Pi has no `apply_patch`; use `edit` with explicit old/new text. |

## Skill loading

Pi auto-discovers `SKILL.md` files from any path returned by a `resources_discover` extension handler. The snowball extension returns `<snowball>/skills`, so every snowball skill is available without symlinks. The agent invokes a skill by typing `/skill:<name>`; pi expands the command to the skill body before the LLM sees the prompt. Skills can also be auto-loaded when their frontmatter `description` matches the task.

The `/skill:<name>` syntax is a pi-native feature (not a snowball mechanism) — every pi package responds to it. Snowball's role is to advertise the skill paths via `resources_discover`; pi itself handles the slash expansion.

Frontmatter `allowed-tools` is ignored by pi — it does not constrain tool calls. Skill content that says "use only X" still has access to every active tool.

## Operator prompts

Pi has no `AskUserQuestion` equivalent. When a snowball skill instructs the agent to ask the operator a question, the agent should:

1. Pose the question in plain text in its reply.
2. Wait for the operator's free-text answer in the next prompt.

This is the documented pi workflow for clarification questions. The snowball decision spine therefore **cannot** capture operator MADRs from structured questions in pi — only from free-text approval phrases detected by the extension's `input` event. See `docs/README.pi.md` for the partial decision-spine coverage.

## Task tracking

Pi has no built-in todo. For progress tracking, the agent writes a `TODO.md` file in the working directory and updates it as work progresses. Snowball skills that drive progress through `TodoWrite` should substitute `write`/`edit` on `TODO.md` and reference its path in the reply.

## Subagents

Pi has no built-in subagent. The supported patterns are:

1. Spawn a child `pi` process via tmux (the documented escape hatch).
2. Install a third-party subagent package via `pi install npm:...`.
3. Write a custom extension that registers a `delegate` tool.

Snowball skills that reference the `Task` tool for parallel or sequential subagent dispatch will not work in pi without one of the above. The `dispatching-parallel-agents` and `subagent-driven-development` skills are documented as partial in pi.

## Plan mode

Pi has no plan mode. Snowball skills that call `EnterPlanMode` / `ExitPlanMode` substitute the workflow used by `writing-plans` directly: write the plan to `docs/snowball/plans/<topic>-plan.md`, then begin execution.

## Configuration locations

| Claude Code | Pi |
|-------------|-----|
| `~/.claude/settings.json` | `~/.pi/agent/settings.json` |
| `<project>/.claude/settings.json` | `<project>/.pi/settings.json` |
| `~/.claude/skills/<name>/` | discovered from any `resources_discover` `skillPaths` |
| `<project>/.claude/skills/<name>/` | discovered from any `resources_discover` `skillPaths` |
| `~/.claude/agents/<name>.md` | none — subagent via extension or package |
| `.mcp.json` | none — pi has no MCP; use extensions |
| `CLAUDE.md` / `AGENTS.md` | `AGENTS.md` (loaded automatically from `~/.pi/agent/`, walking up from cwd, and project root) |

## Canonical docs

- [pi README](https://github.com/badlogic/pi-mono)
- [pi extensions](https://github.com/badlogic/pi-mono/blob/main/extensions.md)
- [pi packages](https://github.com/badlogic/pi-mono/blob/main/packages.md)
