# Pi Harness Adapter

**Date:** 2026-06-25
**Status:** Accepted
**Scope:** New per-harness adapter for [pi](https://github.com/badlogic/pi-mono). Forward spine complete; decision spine partial (no `AskUserQuestion` analog in pi).
**Depends on (optional, external):** [pi](https://github.com/badlogic/pi-mono) installed in the user's environment.
**Related:** [2026-06-23-vtcode-support-design.md](./2026-06-23-vtcode-support-design.md) (most recent harness adapter; the pi extension mirrors the opencode plugin's event-handler pattern). [2026-06-16-junie-support-design.md](./2026-06-16-junie-support-design.md) (precedent for partial decision spine).

## Problem

Snowball currently ships per-harness adapters for Claude Code, Cursor, GitHub Copilot CLI, OpenCode, Codex CLI / Codex App, Gemini CLI, GitLab Duo, Aider, Junie, and VTCode. Pi — a TypeScript-extensible terminal coding harness from `badlogic/pi-mono` — is not on the list. Pi users get none of the snowball methodology, no project guidelines, and no tool-name mapping reference.

The user runs pi and wants Snowball's skills reachable from pi sessions, install instructions in the README, and a documented posture on the decision spine (which cannot be fully replicated because pi lacks `AskUserQuestion`).

## Goals

1. Ship pi as a per-harness adapter, alongside the ten already listed in the README.
2. Forward spine fully covered: the snowball skills are reachable as pi skills, the `using-snowball` bootstrap is injected at session start, and a tool-name mapping reference (`skills/using-snowball/references/pi-tools.md`) lets skills authored against Claude Code tool names work in pi.
3. Install via `pi install git:github.com/kellenff/snowball` — pi's native package install path, no shell installer.
4. Reuse, don't rebuild. The bootstrap content is sourced from `skills/using-snowball/SKILL.md`. The CJS capture bundles (`hooks/blast-radius-audit.cjs`, `skills/decision-logging/scripts/user-prompt-bridge.cjs`, `skills/decision-logging/scripts/extract-worker.sh`) are reused unchanged from the opencode plugin's wiring.
5. Honest partial-coverage documentation. No silent failures, no fake coverage on the decision spine.

## Non-Goals

- **Full `AskUserQuestion` parity.** Pi has no native question-asking tool. The closest analog is `ctx.ui.select/confirm/input`, which is only reachable from inside an extension. Snowball's bootstrap does not add such a tool; skills that instruct the agent to ask the operator a question degrade to plain-text Q&A. The primary MADR source on Claude Code is unavailable in pi.
- **NPM publishing.** The pi package install works from a git URL — no npm publish required for v6.8.0. A future revision can add `keywords: ["pi-package"]` plus npm metadata if distribution through `pi install npm:...` becomes desirable.
- **Modifying `skills/decision-logging/` or the opencode plugin.** The pi extension is additive; the existing CJS bundles serve both harnesses.
- **A marketplace / extension wrapper.** Pi's `resources_discover` event returns skill paths directly; no wrapper is needed.
- **Headless pi as the extraction worker.** The `extract-worker.sh` script shells out to `claude -p` headlessly. That is intentional and harness-agnostic at the file level — pi users get extraction through a subprocess without needing pi to be the headless worker.

## Pi's surface (what the design assumes)

Verified against `github.com/badlogic/pi-mono` and its `docs/extensions.md`:

- **Skill discovery** — pi auto-discovers `SKILL.md` files from any path returned by a `resources_discover` extension handler. The snowball extension returns `<snowball>/skills`, so every snowball skill is available without symlinks or copy steps. Skill invocation is via `/skill:<name>` slash command; pi expands it to the skill body before agent processing.
- **Project guidelines** — `AGENTS.md` is loaded from `~/.pi/agent/`, walking up from cwd, and from the project root. Snowball's existing `AGENTS.md` (per the README's per-harness contract) is already in the right shape; no pi-specific file is needed.
- **Extension API** — TypeScript modules under `~/.pi/agent/extensions/` (user), `.pi/extensions/` (project), or inside a pi package's `extensions/` directory. The extension default-exports a factory function receiving `ExtensionAPI`. The factory can be synchronous or async; pi awaits async factories before startup.
- **Events used by this design:**
  - `resources_discover` — returns `{ skillPaths: [...] }`. Fires at session start and on `/reload`.
  - `before_agent_start` — returns `{ systemPrompt }` to extend the chained system prompt. Fires once per agent turn (after the user submits a prompt, before the LLM call).
  - `input` — fires when user input is received, before `/skill:` and `/template` expansion. Event has `{ text, images, source: "interactive" | "rpc" | "extension" }`. Can return `{ action: "continue" | "transform" | "handled" }`.
  - `session_shutdown` — fires before runtime teardown. Use for last-chance synchronous work and to spawn detached workers.
  - `session_compact` — fires after compaction completes (notification-only). Use to fork the extraction worker before the transcript tail is summarized away.
- **Tool surface** — pi's built-in tools are lowercase: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`. Pi has no `WebFetch`, `WebSearch`, `TodoWrite`, `Task` (subagent), `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion`, or `apply_patch`. The mapping reference documents each gap and the substitution pattern.
- **No hook rail.** Pi is "aggressively extensible" with extensions, no separate hook system. This is the explicit user constraint: "extensions instead of hooks."

## Design

### Architecture

```text
extensions/pi/snowball.ts                       (NEW; the bootstrap + decision-spine extension)

skills/using-snowball/references/
└── pi-tools.md                                 (NEW; tool-name mapping; matches vtcode-tools.md shape)

skills/decision-logging/scripts/
├── pi-session-reader.ts                        (NEW; serializes pi session JSONL tree to flat
│                                                {role, content} format the existing
│                                                extract-worker.sh consumes)
└── (existing: write-madr.cjs, append-observation.cjs, approval-phrases.cjs,
    ask-user-question-bridge.cjs, user-prompt-bridge.cjs, hook-payload.cjs,
    git-root.cjs, extract-worker.sh)

README.md                                       (per-harness row + Setup bullet + changelog sub-bullet)
skills/using-snowball/SKILL.md                  (Platform Adaptation: add pi-tools.md to the list)
RELEASE-NOTES.md                                (v6.8.0 entry)

tests/pi/                                       (NEW; pi extension smoke tests)
├── README.md
├── extension.test.ts                           (load with stub ExtensionAPI, assert key behaviors)
└── fixtures/                                   (minimal git repo + SKILL.md copy for bootstrap reads)
```

Three deliverables, each on a pi first-class surface:

1. **Bootstrap** — `extensions/pi/snowball.ts` injects the `using-snowball` text via the `before_agent_start` event, returning `{ systemPrompt: <chained> + "\n\n" + <bootstrap> }`. Same `<EXTREMELY_IMPORTANT>` framing the opencode plugin uses. Single injection per session.
2. **Skill discovery** — `resources_discover` returns `skillPaths: [<snowball>/skills]`. Pi walks the paths for `SKILL.md` files. No symlinks, no copy step. `pi install -f` updates instantly.
3. **Tool mapping** — `skills/using-snowball/references/pi-tools.md` translates Claude Code tool names to pi's lowercase built-ins. Same role as the existing `vtcode-tools.md` and `junie-tools.md`.

### Components

#### `extensions/pi/snowball.ts`

Default-export factory receiving `ExtensionAPI`. Subscribes to five events:

| Event | Purpose | Reuses |
|-------|---------|--------|
| `resources_discover` | Register `<snowball>/skills` for auto-discovery. | — |
| `before_agent_start` | Inject the bootstrap once per session. | `skills/using-snowball/SKILL.md` (read once, cached). |
| `input` | Capture operator approval phrases + blast-radius operator-approval audit. Skips `source !== "interactive"`. | `user-prompt-bridge.cjs`, `blast-radius-audit.cjs`. |
| `session_shutdown` | Blast-radius stop audit + detached extraction worker fork. | `blast-radius-audit.cjs`, `extract-worker.sh`, `pi-session-reader.ts`. |
| `session_compact` | Detached extraction worker fork (pre-compaction observation dump). | `extract-worker.sh`, `pi-session-reader.ts`. |

Single-source-of-truth capture: every event handler that needs to log a MADR or trigger an audit calls the same CJS bundles the opencode plugin loads. Updating decision-logging for Claude Code or OpenCode auto-updates pi.

#### Pi manifest on the root `package.json`

The pi package is the **repo root**, not `extensions/pi/`. The `pi` block lives on the root `package.json` (which is what `pi install git:github.com/kellenff/snowball` installs).

```json
{
  "pi": {
    "extensions": ["./extensions/pi/snowball.ts"],
    "skills": ["./skills"]
  }
}
```

Paths in the block are relative to the repo root. Pi's auto-discovery of conventional directories is one level deep (`extensions/*.ts`, not `extensions/pi/*.ts`); without the explicit manifest, the extension would never load. Pi bundles `@earendil-works/pi-coding-agent` and `typebox` at runtime, so they don't need to be declared as dependencies of the root package.

The root `package.json` is also tagged `keywords: ["pi-package"]` so the package is discoverable on npm if/when it gets published.

#### `skills/using-snowball/references/pi-tools.md`

Matches the existing `vtcode-tools.md` and `junie-tools.md` shape:

- Preamble explaining that skills use Claude Code tool names and the table maps them.
- A single table mapping each Claude Code primitive (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `LS`, `WebSearch`, `WebFetch`, `AskUserQuestion`, `TodoWrite`, `Skill`, `Task`, `EnterPlanMode`/`ExitPlanMode`, `apply_patch`) to its pi equivalent or to "none — see [section]".
- A "Skill loading" section explaining `/skill:name` slash command and frontmatter handling.
- A "Operator prompts" section documenting the AskUserQuestion gap and the plain-text Q&A workflow.
- A "Task tracking" section documenting the TODO.md substitution.
- A "Subagents" section documenting the tmux spawn / third-party package / custom extension options.
- A "Plan mode" section documenting the file-based plan workflow.
- A "Configuration locations" table mapping Claude Code config paths to pi's (`~/.pi/agent/settings.json`, `<project>/.pi/settings.json`, etc.).
- A "Canonical docs" section with the upstream pi links.

#### `skills/decision-logging/scripts/pi-session-reader.ts`

Serializes pi's session JSONL tree into the flat `{role, content}` JSONL format `extract-worker.sh` consumes. The opencode plugin performs equivalent capture via its bundled CJS path but does NOT export a separate `serializeMessages` function — `.opencode/plugins/snowball.js` exports `SnowballPlugin` only. The pi reader is therefore greenfield code, not a port.

```ts
// Sketch — implementation lives in the plan, not the spec.
export function serializePiSession(sessionFilePath: string): string {
  // 1. Read the JSONL tree from sessionFilePath.
  // 2. Walk the active branch (parentId chain) to the leaf.
  // 3. For each entry, extract role + flattened text content.
  //    - User/assistant text → role + joined text parts.
  //    - toolResult → role + joined text content.
  //    - Other (image-only, custom) → skip or include role-only marker.
  // 4. Emit flat JSONL: {"role": "...", "content": "..."} per line.
}
```

The worker shell script reads the flat format; it does not know which harness produced it. Reuse of `extract-worker.sh` is preserved across harnesses.

#### `tests/pi/extension.test.ts`

Stubbed-`ExtensionAPI` smoke test asserting the extension's contract. Eleven assertions, ~150 LoC:

| Test | Assertion |
|------|-----------|
| `bootstrap injected on first before_agent_start` | Returns `{ systemPrompt: "BASE\n\n<EXTREMELY_IMPORTANT>…" }`. |
| `bootstrap not re-injected` | Second invocation returns nothing. |
| `bootstrap missing → no injection` | When `SKILL.md` does not exist, handler returns undefined. |
| `approval phrase triggers capture` | `input` with "looks good" calls `handleUserPromptApproval` and `captureBlastRadiusAudit` once. |
| `non-approval text skipped` | `input` with "explain this code" does not call capture handlers. |
| `non-interactive source skipped` | `input` with `source: "rpc"` and an approval phrase does not call capture. |
| `session_shutdown fires stop audit + extraction` | Shutdown calls `captureBlastRadiusAudit({ trigger: "stop" })` and spawns the extract worker. |
| `session_compact fires extraction` | PreCompact analog fires the worker; stop audit is not called. |
| `resources_discover returns skill paths` | Returns `{ skillPaths: [<repo>/skills] }`. |
| `capture unavailable → no throw` | When the CJS bundle paths are missing, capture handlers silently no-op; chat-path handlers still return their action. |
| `shutdown extraction failure swallowed` | `spawn` throws; the handler returns without propagating. |

Test fakes:

- CJS bundles replaced with inline stubs that record calls.
- `child_process.spawn` replaced with a stub that records the script path.
- `ctx.sessionManager.getSessionFile()` returns a tmp path.
- Fixture: minimal git repo under `tests/pi/fixtures/` for `findGitRoot` to resolve.

### File structure

**Created:**

- `extensions/pi/snowball.ts` — the bootstrap + decision-spine extension.
- `skills/using-snowball/references/pi-tools.md` — tool mapping.
- `skills/decision-logging/scripts/pi-session-reader.ts` — pi session serializer for the extraction worker.
- `tests/pi/extension.test.ts` — extension smoke tests.
- `tests/pi/README.md` — one-paragraph doc.
- `tests/pi/fixtures/` — minimal git repo + SKILL.md copy.
- `docs/snowball/specs/2026-06-25-pi-harness-adapter-design.md` — this file.

**Modified:**

- `package.json` — add `keywords: ["pi-package"]` (for npm discoverability if/when published) and the `pi` block with paths relative to repo root.
- All version-bearing manifests (`package.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `gemini-extension.json`, `extensions/snowball/extension.json`) — bump via `scripts/bump-version.sh <next>`, where `<next>` is determined by the maintainer's release process at merge time. Current state: 6.6.0 in all manifests; vtcode follow-on work referenced as v6.7.0 in commit messages but not yet bumped.
- `README.md` — add pi row to the per-harness table; add Setup bullet; soften the "Not on any plugin marketplace" line to carve out pi; remove pi from "Known stale or broken" once shipped.
- `skills/using-snowball/SKILL.md` — add pi paragraph to "How to Access Skills" and "Platform Adaptation".
- `RELEASE-NOTES.md` — entry noting pi harness entry, decision-spine partial, new files. Version number matches the bump applied above.
- `tests/` — register the new test group alongside the existing 11.

**Not touched:**

- `extensions/snowball/` (Junie bundle) — Junie-specific, unrelated.
- `.opencode/plugins/snowball.js` — already serves OpenCode via its own event names.
- `hooks/` — the CJS bundles are reused as-is; no shell-side hook changes.

## Install path (what users run)

The README Setup section will document:

```bash
# One command — pi clones the repo into ~/.pi/agent/git/snowball/ and
# auto-discovers the extension and skills.
pi install git:github.com/kellenff/snowball
```

A more detailed doc at `docs/README.pi.md` covers verification, updating, uninstall, and local development workflow (clone + `pi -e ./extensions/pi/snowball.ts` for iteration).

## Testing

Automated (bun test runner, per the maintainer toolchain in README):

- `tests/pi/extension.test.ts` — eleven assertions listed above.

Manual (one-time, documented in the plan):

- `pi list` — snowball appears in the package list.
- `pi -p "list skills"` — every snowball skill is visible to the agent.
- Start a pi session, ask the agent to use `brainstorming` — verify the agent announces "Using brainstorming to [purpose]" and follows the skill's checklist.
- Ask the agent to read a file — verify it uses pi's `read` tool (lowercase), demonstrating the tool-name mapping works.
- Type "looks good" as a follow-up — verify a MADR appears in `docs/snowball/decisions/`.
- `/reload` then `/quit` — verify the session-shutdown extraction worker runs and observations land in `observations.jsonl`.

## Resolved design decisions

1. **NPM publishing deferred.** The pi package installs from a git URL only for this release. `keywords: ["pi-package"]` is added so the package is discoverable on npm if/when it gets published, but no publish step is in scope.
2. **Extension lives under `extensions/pi/`.** This matches the opencode plugin's `.opencode/plugins/snowball.js` pattern and keeps the extension's runtime deps in a sibling `package.json`, separate from the root's maintainer devDeps.
3. **Bootstrap dedup via per-extension boolean.** `before_agent_start` fires once per agent turn, not per step (unlike OpenCode's transform hook), so a per-extension boolean is sufficient. No need for a session-keyed Map.
4. **Extraction worker fires on both `session_shutdown` and `session_compact`.** `session_shutdown` captures end-of-session observations; `session_compact` captures pre-summarization observations. The worker is idempotent on its per-session cursor, so firing on both is safe and increases capture coverage.

## Open question (deferred)

- **Should the pi package be NPM-published in a future release?** Out of scope for this spec. The git-only install path works for `pi install git:...` and is consistent with Snowball's "clone-and-link" posture. Revisit if pi users request npm distribution.

## Known limitations

- **No `AskUserQuestion` parity.** Pi has no equivalent tool. Operator MADRs from structured questions are not capturable. Approval-phrase MADRs (free-text "looks good" / "ship it" / etc.) work via the `input` event. Documented as partial — same posture as Junie.
- **No MCP integration.** Pi does not have MCP. The Junie `snowball-capture` MCP server is the workaround for harnesses with no hook API. Pi has events (which are strictly more capable than MCP for this purpose), so the MCP workaround is unnecessary.
- **No subagent / Task tool parity.** Pi has no built-in subagent. Skills that reference the `Task` tool for parallel or sequential subagent dispatch (`dispatching-parallel-agents`, `subagent-driven-development`) are documented as partial in pi's tool mapping reference.
- **No plan mode.** Pi has no `EnterPlanMode` / `ExitPlanMode`. Skills that invoke plan mode substitute file-based plan writing. Documented in `pi-tools.md`.
- **`pi-session-reader.ts` is a new file.** The opencode plugin already has the equivalent for OpenCode's session format. The pi reader is duplicated logic in a different shape (pi's JSONL tree is structurally different from OpenCode's nested message tree). Future cleanup could extract a common "session-to-flat-transcript" interface, but YAGNI for v6.8.0.
- **Versioning across the existing manifests.** All version-bearing manifests currently carry 6.6.0; recent vtcode follow-on work is referenced as v6.7.0 in commit messages but not yet bumped. The release-time version is determined by the maintainer's release process at merge — not committed in this spec. The plan's first step runs `scripts/bump-version.sh <next>` to bump them all consistently.

## Open design points deferred to v6.9.0

- NPM publish of the pi package.
- Common "session-to-flat-transcript" interface for the opencode plugin and pi extension.
- A `tool_call` event subscription on pi's `bash` tool for permission gates (analog to VTCode's `unified_exec` blast-radius gate). No current capture need; flagged for future safety work.
