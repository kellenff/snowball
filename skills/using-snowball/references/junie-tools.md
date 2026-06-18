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
