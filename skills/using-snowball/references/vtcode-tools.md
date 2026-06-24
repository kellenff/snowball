# VTCode Tool Mapping

Skills use Claude Code tool names. When using [VTCode](https://github.com/vinhnx/vtcode), the harness exposes a unified tool family (`unified_file`, `unified_search`, `unified_exec`) plus planning and task-tracking tools. The table below maps Claude Code primitives to their VTCode equivalents.

## Tool Hierarchy

When multiple tools can achieve the same goal, follow this priority:

1. **Unified tools** (`unified_file`, `unified_search`, `unified_exec`) — handle file I/O, search, and shell execution under one roof.
2. **Specialized tools** (`apply_patch`, `request_user_input`, `task_tracker`) — use for the specific actions they describe.
3. **MCP tools** (when `<project>/.mcp.json` is configured) — fall back to MCP servers for tools VTCode does not provide natively.

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

VTCode has no explicit `Skill` tool. Skills auto-load: the agent scans `.agents/skills/<skill-name>/SKILL.md` (project, nearest CWD first) and `~/.agents/skills/<skill-name>/SKILL.md` (user) at session start, then selects skills whose frontmatter `name` and `description` match the current task. Reference a skill by name in your prompt and VTCode activates it.

Scope precedence: project-scope (`.agents/skills/<name>/`) wins over user-scope (`~/.agents/skills/<name>/`) on name collision.

Snowball's `SKILL.md` format is compatible as-is. The `allowed-tools` frontmatter field is recognized by VTCode and can be used to scope a skill to the unified tools it needs.

## Subagent dispatch

VTCode has no explicit `Task` tool. Subagents are configured through the `[[agents]]` table in `vtcode.toml` (project) or `~/.vtcode/agents.toml` (user). The main agent delegates when the configured subagent's description matches the task. The system-prompt body lives in a sibling Markdown file referenced by the agent's `prompt_file` field.

## Task tracking

VTCode's `task_tracker` tool replaces Claude Code's `TodoWrite`. `task_tracker` writes an ordered plan to the session that the agent updates in place. Snowball skills that rely on `TodoWrite` for visible progress should adapt their calls to `task_tracker` or surface structured progress through subagent returns.

## Web fetch

VTCode's `web_fetch` tool covers both `WebSearch` and `WebFetch` from Claude Code. When the restricted sandbox is active, `web_fetch` may be unavailable; fall back to connecting an MCP `fetch` or `context7` server via `mcp_connect_server` and use the MCP tools instead.

## Plan mode

Claude Code's `EnterPlanMode` / `ExitPlanMode` map to VTCode's `start_planning` / `finish_planning` tool pair. `start_planning` opens a plan-mode session; `finish_planning` closes it after the user confirms. The plan lives in the session, not on disk.

## Configuration locations

| Claude Code | VTCode |
|-------------|--------|
| `~/.claude/settings.json` (user) | `~/.vtcode/config.toml` (user) and `<project>/vtcode.toml` (project) |
| `~/.claude/skills/<name>/` (user) | `~/.agents/skills/<name>/` (user) and `<project>/.agents/skills/<name>/` (project) |
| `~/.claude/agents/<name>.md` (user) | `~/.vtcode/agents.toml` (user) and `<project>/vtcode.toml` (project) |
| `~/.claude/commands/<name>.md` (user) | n/a (VTCode uses slash commands via the CLI, not file-scoped) |
| `.mcp.json` (project root) | `<project>/.mcp.json` (project) — same `mcpServers` schema |
| `AGENTS.md` (project root) | `<project>/AGENTS.md` and `<project>/.vtcode/AGENTS.md` (project) |
| `.claude/tool-policy.json` | `<project>/.vtcode/tool-policy.json` (project) and `~/.vtcode/tool-policy.json` (user) |

The `.vtcode/tool-policy.json` file is a user-environment artifact (an `allow` / `prompt` matrix over `available_tools`). Snowball does not ship or maintain it.

## Canonical docs

- [VTCode repository](https://github.com/vinhnx/vtcode)
- [Skills guide](https://github.com/vinhnx/vtcode/blob/main/docs/skills/SKILLS_GUIDE.md)
- [Tool policy reference](https://github.com/vinhnx/vtcode/blob/main/docs/tool-policy.md)
