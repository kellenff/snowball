# Junie (JetBrains IDE Plugin) Support

**Date:** 2026-06-16
**Status:** Accepted
**Scope:** New per-harness adapter + a new `snowball-capture` MCP server
**Depends on (optional, external):** JetBrains Junie (IDE plugin and/or CLI) installed in the user's environment
**Related:** [2026-06-07-chorus-companion-design.md](./2026-06-07-chorus-companion-design.md) (same harness-pattern precedent)

## Problem

Snowball currently ships per-harness adapters for Claude Code, Cursor, GitHub Copilot CLI, OpenCode, Codex CLI / Codex App, Gemini CLI, and GitLab Duo. Junie — JetBrains' AI coding agent for IntelliJ-based IDEs — is not on the list. Users running Junie in a JetBrains IDE get none of the snowball methodology, none of the decision spine, and no project-level guidelines.

The user wants **full** Junie support: skills loaded as agent context, the `using-snowball` bootstrap, AND decision-spine capture (operator MADRs and agent observations). The catch: Junie has a well-documented extension model and supports MCP servers, but **has no public hook/lifecycle event API**. The decision spine on Claude Code works via four hooks (`PostToolUse` on `AskUserQuestion`, `UserPromptSubmit` pattern match, `Stop`, `PreCompact`); none of those primitives exist on Junie.

## Goals

1. Ship Junie as a first-class per-harness adapter, alongside the seven already listed in the README.
2. Forward spine fully covered: the 18 skills are reachable as Junie skills, the `using-snowball` bootstrap is injected as project context, and existing MCP dependencies (argdown, codebase-memory) are wired.
3. Decision spine partially covered (the honest call): three capture paths via a new `snowball-capture` MCP server, the agent calls them at the right moments, output goes to the same `docs/snowball/decisions/` location and format every other harness uses.
4. Document the gap explicitly — Junie's missing hook rail means the decision spine is best-effort, not passive. We name this in the spec, in AGENTS.md, and in the README.
5. Reuse, don't rebuild. The capture pipeline (`writeMadr`, `appendObservation`, `matchesApproval`) is already implemented and tested under `skills/decision-logging/src/`. The MCP server is a thin boundary adapter; no new capture logic.

## Non-Goals

- **Building a Junie wrapper script.** A `snowball-junie` CLI shim could close the Stop/PreCompact gap by intercepting process exit, but it would only work for the CLI surface, would break on Junie updates, and would accrete over time. Rejected during brainstorming.
- **Hacking around the missing hook API.** No file-watchers, no log-scrapers, no reverse-engineered Junie internals. Capture is via MCP tools the agent calls. Anything else is brittle.
- **Modifying `skills/decision-logging/`.** The existing capture pipeline stays. The MCP server imports its pure functions; nothing changes upstream.
- **Distribution outside the clone-and-link model.** Junie extension is committed to this repo. Install path mirrors the others (point Junie at `extensions/snowball/`).
- **A new `staleness_check` MCP tool.** The agent can already invoke the `recalling-project-context` skill for staleness. Duplicating that in the MCP server accrets two ways to ask the same question.
- **Tests for "does Junie actually call the tools."** Agent invocation discipline is not a tool-correctness question and not automatable without a live Junie session. Documented in the manual verification section.
- **Manifest version bump.** This change is feature-additive; the README tracks feature versions independently of `package.json` / plugin manifests.

## Junie's surface (what the design assumes)

Verified against `github.com/JetBrains/junie`, `github.com/JetBrains/junie-guidelines`, and `github.com/JetBrains/junie-extensions`:

- **Extension layout** — `extensions/<name>/` with `extension.json` (manifest: `name` + `description`), `skills/`, `agents/`, `guidelines/`, `mcp/.mcp.json` (MCP server definitions).
- **Skill format** — YAML frontmatter + Markdown. **Identical to snowball's existing skill format**; no transformation needed.
- **Project guidelines** — `AGENTS.md` or `.junie/AGENTS.md` at the project root. Junie injects this as system-level project context.
- **MCP servers** — first-class via `mcp/.mcp.json`.
- **No public hook/lifecycle event API** — confirmed by absence in the public docs and repos. Junie has no `session-start`, no `Stop`, no `PreCompact`, no `PostToolUse` equivalent.

## Design

### Architecture

```text
extensions/snowball/                          (the Junie extension)
├── extension.json                            (manifest, ~6 lines)
├── .junie/AGENTS.md                          (bootstrap + capture rules, ~80 lines)
├── skills/                                   (18 skills, copied or symlinked)
└── mcp/.mcp.json                             (MCP server wiring)

skills/decision-logging/src/                  (existing, unchanged)
├── write-madr.ts                             (pure: MadrInput → writes MADR file)
├── append-observation.ts                     (pure: Observation → appends to JSONL)
├── approval-phrases.ts                       (pure: string → boolean)
└── ...                                       (other helpers, unchanged)

extensions/snowball/snowball-capture/         (NEW, Bun/TS MCP server)
├── package.json
├── src/
│   ├── server.ts                             (MCP server entry, wires tools)
│   ├── tools/
│   │   ├── madr-capture.ts
│   │   ├── approval-phrase-record.ts
│   │   └── observation-log.ts
│   └── schemas/                              (zod or hand-rolled type guards)
└── tests/
    ├── tools/                                (Layer 1: pure unit tests)
    └── integration/                          (Layer 2 + 3: tmpdir + contract)
```

Three layers, each on Junie's first-class surfaces:

1. **Forward spine** — skills are the substrate. Junie loads `extensions/snowball/skills/...` on demand; the agent invokes them via the skill mechanism. Zero transformation needed.
2. **Bootstrap** — `extensions/snowball/.junie/AGENTS.md` carries the `using-snowball` text verbatim plus a short index of available skills. This replaces the `session-start` hook on Claude Code. AGENTS.md is the only context Junie guarantees to inject, so the bootstrap has to live there.
3. **Decision spine** — `snowball-capture` MCP server exposes three tools the agent calls at the right moments. AGENTS.md tells the agent when. Output lands in `docs/snowball/decisions/` in the same MADR/observation format every other harness uses, so downstream tooling (`syncing-decisions-to-memory`, `recalling-project-context`) stays harness-agnostic.

### Components

#### `extensions/snowball/extension.json`

Six lines, mirroring the discovered extension convention:

```json
{
  "name": "snowball",
  "version": "0.1.0",
  "description": "Snowball skills library: agentic skills that remember why. Loads as agent context in Junie; decision-spine capture via the bundled snowball-capture MCP server."
}
```

#### `extensions/snowball/.junie/AGENTS.md`

Two sections, in this order:

1. **Bootstrap** — the `using-snowball` text verbatim, plus a one-line index of the 18 skills with their triggers (so the agent knows what's available without enumerating). Bootstrap content is sourced from `skills/using-snowball/SKILL.md` and any drift is a spec violation — keep them in sync.
2. **Capture rules** — three short paragraphs, one per MCP tool, telling the agent when to call it. The rules are short on purpose: AGENTS.md is read once at session start and the agent has to act on it across the whole session.

#### `extensions/snowball/skills/`

The 18 skills from `skills/`, copied or symlinked. Symlinking is preferred (single source of truth); the install path picks the right mode per harness.

#### `extensions/snowball/mcp/.mcp.json`

```json
{
  "mcpServers": {
    "snowball-capture": {
      "command": "node",
      "args": ["<abs-path-to-snowball-capture>/dist/server.cjs"]
    },
    "argdown": { /* same shape, points at the argdown MCP server */ },
    "codebase-memory": { /* same shape, points at the codebase-memory MCP server */ }
  }
}
```

Argdown and codebase-memory are referenced because the existing snowball skills (e.g., `structured-argumentation`, `recalling-project-context`, `syncing-decisions-to-memory`) depend on them. Snowball-capture is new.

#### `snowball-capture` MCP server — three tools

The server is a Bun/TS project that bundles to a single `.cjs` (matching the project's "zero `npm install` for consumers" posture, though MCP servers are an exception because Junie spawns them). It imports the existing capture pipeline and exposes it as MCP tools.

##### `madr_capture` (MCP tool)

- **Does:** writes a MADR markdown file under `docs/snowball/decisions/` capturing an `AskUserQuestion`-equivalent exchange.
- **Input schema (zod):** `{ question: string, options: { name, description }[], chosen: string, context?: string, tags?: string[] }`.
- **Output schema:** `{ ok: true, path: string, id: string } | { ok: false, error: string, code: ErrorCode }`.
- **Depends on:** `writeMadr` from `skills/decision-logging/src/write-madr.ts`. Injects `snowball.capture_mechanism = "ask-user-question"`, `snowball.source = "operator"`, synthesizes a `source_event_id` (uuidv4) since MCP has no event ID.
- **Pure/impure split:** tool handler parses + validates input (pure), then calls `writeMadr` (impure boundary). Test the parser with sample inputs; integration-test the boundary with a tmpdir.

##### `approval_phrase_record` (MCP tool)

- **Does:** writes a MADR for an approval phrase (`lgtm`, `ship it`, etc.) detected by the agent.
- **Input schema:** `{ phrase: string, action: string, context?: string }`.
- **Output schema:** `{ ok: true, path: string, id: string } | { ok: false, error: string, code: ErrorCode }`.
- **Depends on:** `matchesApproval` from `approval-phrases.ts` (refuses non-matching phrases) and `writeMadr` (mechanism = `user-prompt-pattern`). Refuses to write a MADR if the phrase doesn't match — that's a precondition, not a warning. Reusing the existing matcher is non-negotiable: the same phrases the Claude Code hook recognizes are the ones Junie captures. Drift would silently break the decision spine.
- **Pure/impure split:** matcher call is pure; write is impure boundary.

##### `observation_log` (MCP tool)

- **Does:** appends a single observation line to `docs/snowball/decisions/observations.jsonl`.
- **Input schema:** `{ content: string, type: "observation"|"implementation-choice"|"hypothesis"|"constraint", confidence: "high"|"medium"|"low", rationale: string, related_files?: string[], tags?: string[] }`.
- **Output schema:** `{ ok: true, path: string } | { ok: false, error: string, code: ErrorCode }`.
- **Depends on:** `appendObservation`. Injects `source = "agent"`, synthesizes `session_id` and `timestamp` from process-stable random or accepts them as optional inputs.
- **Pure/impure split:** validate → call append. Identical pattern.

### Data flow

```text
INSTALL
  user → installs extensions/snowball/ into Junie's extension store
  junie → scans mcp/.mcp.json, registers snowball-capture as available MCP server

SESSION START (per session, in IDE)
  junie → reads extensions/snowball/.junie/AGENTS.md
  junie → injects AGENTS.md content as system-level project context
         (includes: using-snowball bootstrap, capture rules, skill index)
  agent → has ambient context for the entire session

DURING SESSION (per task)
  agent → may invoke any skill in extensions/snowball/skills/
         via the skill mechanism (same as any other Junie skill)

  A) AGENT ASKS USER A MULTI-CHOICE QUESTION
       agent → asks question (Junie's native mechanism)
       user → picks an option
       agent → (per AGENTS.md rule) calls madr_capture
                 with { question, options, chosen, context? }
       madr_capture → validates input
                     → writeMadr({ title, status: "accepted",
                                   capture_mechanism: "ask-user-question",
                                   source: "operator", ... })
                     → fs.writeFile to docs/snowball/decisions/<date>-<slug>.md
                     → returns { ok: true, path, id }

  B) USER SENDS AN APPROVAL PHRASE
       user → "lgtm" / "ship it" / etc.
       agent → (per AGENTS.md rule) calls approval_phrase_record
                 with { phrase, action, context? }
       approval_phrase_record → matchesApproval(phrase)
                              → if false, returns { ok: false, code: "NOT_AN_APPROVAL" }
                              → writeMadr({ capture_mechanism: "user-prompt-pattern", ... })
                              → returns { ok: true, path, id }

  C) AGENT MAKES A NON-OBVIOUS CHOICE
       agent → (per AGENTS.md rule) calls observation_log
                 with { content, type, confidence, rationale, ... }
       observation_log → validates input
                       → appendObservation({ type, confidence, source: "agent", ... })
                       → fs.appendFile to docs/snowball/decisions/observations.jsonl
                       → returns { ok: true, path }

  ─── end of session ──────────────────────────────────────────

  junie → no Stop hook fires (gap, named below)
  no automatic flush; whatever was captured is on disk

LATER (could be next session, could be days)
  user → invokes syncing-decisions-to-memory
       → reads docs/snowball/decisions/ (Junie-written records are indistinguishable from
         Claude Code-written ones — same MADR format, same observations.jsonl shape)
       → distills into codebase-memory project ADR
  user → invokes recalling-project-context
       → reads .codebase-memory/adr.md + scoped MADRs (Junie captures included)
```

**Key data invariants:**

1. **One canonical output format.** Every record Junie writes has the same MADR/observations schema as every other harness. The capture pipeline (`writeMadr`, `appendObservation`) is shared, not duplicated.
2. **AGENTS.md is the only always-on context.** Capture rules live there because Junie has no `session-start` hook equivalent. If the agent doesn't read AGENTS.md, capture degrades silently — which is the documented behavior.
3. **Refusal beats silent capture.** `approval_phrase_record` refuses non-matching phrases. The agent's "did capture work?" signal is the `ok` flag, not a missing file.
4. **No flush step at session end.** Documented gap. The next `syncing-decisions-to-memory` invocation picks up whatever's there.

### Error handling

**Layer A — MCP server startup / runtime errors**

| Error | Policy | Why |
| --- | --- | --- |
| `snowball-capture` MCP server fails to start | Junie logs a warning; AGENTS.md is still injected; capture simply never fires. | Forward spine unaffected. |
| MCP server crashes mid-session | Junie's MCP client reconnects (out of our control); tool unavailable for the rest of the session. | Fail-soft. |
| `decision-logging` import fails (missing dep, broken build) | MCP server fails to start (Layer A row 1). | Bundled output per project convention. |

**Layer B — Per-tool errors (structured result, never throws across MCP)**

```ts
type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode };

const ErrorCode = [
  "INVALID_INPUT",     // zod/type-guard validation failed
  "NOT_AN_APPROVAL",   // approval_phrase_record got a non-matching phrase
  "NOT_IN_GIT_REPO",   // detectGitRoot returned non-zero
  "WRITE_FAILED",      // fs.writeFile / fs.appendFile threw
  "INTERNAL",          // unexpected throw
] as const;
```

| Code | When | Recommended agent behavior |
| --- | --- | --- |
| `INVALID_INPUT` | validation fails | Correct the call. |
| `NOT_AN_APPROVAL` | matcher rejected the phrase | Drop the call. |
| `NOT_IN_GIT_REPO` | no `.git` ancestor | Surface a one-line notice; capture skipped silently. |
| `WRITE_FAILED` | filesystem error | Surface a one-line notice; the choice that triggered the call is still acted on, just unrecorded. |
| `INTERNAL` | unexpected throw | Surface and continue. |

**What the tool never does:** throws across the MCP boundary, logs to stdout/stderr (diagnostics go to `~/.snowball/junie-capture.log` if `SNOWBALL_CAPTURE_LOG` is set), retries, or silently succeeds when validation failed.

**Layer C — Capture wasn't called (documented gap)**

| Sub-case | Outcome | What we do |
| --- | --- | --- |
| Agent didn't call `madr_capture` after a question | That MADR is missing. | Documented; not a bug, not retried. |
| Agent called with bad input | Error returned; MADR not written. | Agent can retry. |
| Session ends with no capture | `docs/snowball/decisions/` has no new files for that session. | Nothing automatic. Acceptable — Junie has no hook rail. |

### Testing

**Five layers, smallest at the bottom to largest at the top:**

| Layer | Speed | Coverage | Run |
| --- | --- | --- | --- |
| 1. Pure unit | <100ms | input validation, gating, `matchesApproval` boundaries | every commit (CI) |
| 2. Integration | ~1s | write/read round-trip against tmpdir | every commit (CI) |
| 3. Contract | ~1s | shape parity with Claude Code hook-bridge output | every commit (CI) |
| 4. MCP smoke | ~2s | server starts, tools respond to JSON-RPC | every commit (CI) |
| 5. Manual E2E | minutes | real Junie + IDE, observe captures | pre-release, dogfood |

**Layer 1** — pure unit tests, no I/O, no MCP, no filesystem. Each tool's input parser/validator is tested with valid and invalid inputs. `approval_phrase_record` tests use the same `matchesApproval` boundary cases as the existing tests, plus more.

**Layer 2** — integration tests against a tmpdir. Each test creates a tmpdir with `.git/HEAD`, calls the tool handler, asserts on the filesystem. Key assertion: **shape parity with the existing hook-bridge output** — the file produced by `madr_capture` must be byte-equivalent (modulo timestamp/event-id) to what `ask-user-question-bridge.ts` would have written. If this drifts, the distiller silently drops records.

**Layer 3** — contract test. A fixture is generated by calling `writeMadr` and `appendObservation` with a known input, stored as a checked-in file under `tests/integration/fixtures/`. The MCP tools, called with the same input, must produce output that matches the fixture modulo normalized fields (timestamp, event_id, session_id). If we change `writeMadr`, this test fails and we update the fixture deliberately.

**Layer 4** — `extensions/snowball/snowball-capture/scripts/smoke.sh`. Builds the MCP server bundle, spawns it, sends three MCP `tools/call` messages, asserts each returns `{ ok: true, ... }`. CI-friendly.

**Layer 5** — manual end-to-end, documented below in "Manual verification." The only test that exercises Junie's actual behavior; we don't try to automate it.

**What we explicitly do NOT test:** "Does Junie call the MCP tools at the right moments?" (agent invocation discipline, not a tool question) and "Does the AGENTS.md text actually get read?" (trust the discovery convention; smoke test confirms the file is in the right place).

## Decisions (locked during brainstorming, 2026-06-16)

| Decision | Outcome |
| --- | --- |
| Scope of "full" | Forward spine fully covered; decision spine partially covered via MCP tools, gap documented |
| Capture substrate | MCP tools the agent calls, not a CLI wrapper script |
| Wrapper script | Rejected (would only help CLI, would rot on Junie updates) |
| Reuse existing capture pipeline | Yes — `writeMadr` / `appendObservation` / `matchesApproval` are the data layer; MCP server is a boundary adapter |
| Distribution model | Clone-and-link, mirroring the other harnesses; extension lives at `extensions/snowball/` in this repo |
| AGENTS.md as bootstrap | Yes — only always-on context Junie guarantees |
| New `staleness_check` MCP tool | Rejected (duplicates `recalling-project-context`) |
| Approval phrase matcher | Reused from `approval-phrases.ts`; no separate Junie matcher |
| Manifest version bump | No (feature-additive; README tracks versions independently) |

## Concrete edits

### 1. New directory: `extensions/snowball/`

```text
extensions/snowball/
├── extension.json
├── .junie/AGENTS.md
├── skills/   (copied or symlinked from skills/)
└── mcp/.mcp.json
```

### 2. New directory: `extensions/snowball/snowball-capture/`

Bun/TS MCP server, three tools, bundled to `dist/server.cjs`. Source under `src/`, tests under `tests/`.

### 3. `README.md` — Per-harness adapters table

Add a row:

```markdown
| Junie (JetBrains IDE plugin) | `extensions/snowball/extension.json` | bundled `snowball-capture` MCP server + `.junie/AGENTS.md` for context | `AGENTS.md` |
```

And a new row in the "What is different from upstream" changelog table:

```markdown
| v6.3.0 | Junie (JetBrains IDE) support: forward spine via skills + AGENTS.md; decision spine via snowball-capture MCP server (partial — Junie has no hook rail) |
```

### 4. `README.md` — Setup section

Add an install snippet for Junie:

```markdown
- **Junie (JetBrains IDE)**: in the IDE, install the local extension pointing at
  `extensions/snowball/` in this clone. Restart the IDE so Junie picks up the
  `mcp/.mcp.json` server definitions. The `.junie/AGENTS.md` is read automatically
  as project guidelines.
```

### 5. `RELEASE-NOTES.md`

New section at top:

```markdown
## v6.3.0 (2026-06-16)

First-class support for Junie (JetBrains IDE plugin).

- **Forward spine** — all 18 skills load as Junie skills; the `using-snowball` bootstrap is injected via `.junie/AGENTS.md`.
- **Decision spine (partial)** — `snowball-capture` MCP server exposes `madr_capture`, `approval_phrase_record`, and `observation_log`. The Junie agent calls them at decision points; output lands in `docs/snowball/decisions/` in the same format every other harness uses.
- **Honest constraint** — Junie has no public hook/lifecycle event API. The decision spine is best-effort (the agent has to remember to call the tools); the forward spine is fully covered. See the spec for the gap explanation.
```

## Manual verification

The only end-to-end check that exercises real Junie. Run on a developer machine with a JetBrains IDE and Junie installed.

1. **Install the extension** — point Junie at `extensions/snowball/` in this clone. Restart the IDE.
2. **Verify AGENTS.md injection** — start a Junie session in a project where the extension is installed. Open the project guidelines view; confirm the bootstrap text and the three capture rules are visible.
3. **Exercise `madr_capture`** — ask Junie a multi-choice question (e.g., "Which approach should we take: A, B, or C?"); answer it. Check `docs/snowball/decisions/` for a new MADR file with `capture_mechanism: ask-user-question`.
4. **Exercise `approval_phrase_record`** — after a substantive Junie answer, send "lgtm". Check for a new MADR with `capture_mechanism: user-prompt-pattern` and a non-empty `action` field.
5. **Exercise `observation_log`** — give Junie a task that requires a non-obvious choice (e.g., "refactor this module"). Watch the agent's output; when it makes a choice it explains, verify a new line was appended to `docs/snowball/decisions/observations.jsonl`.
6. **Run sync** — invoke `syncing-decisions-to-memory`. Verify the new MADRs are picked up and the project ADR reflects them.
7. **Negative test** — send a non-approval phrase (e.g., "do that thing you mentioned earlier"). Verify the agent's `approval_phrase_record` call returned `NOT_AN_APPROVAL` and **no** MADR was written.

## Open questions

None. All design decisions resolved during brainstorming.
