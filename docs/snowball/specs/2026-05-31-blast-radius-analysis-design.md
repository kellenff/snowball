# Blast-Radius Analysis in the Snowball Lifecycle

Add a composite blast-radius analysis — surfacing change-scope, failure-impact, and action-risk — to three moments in the Snowball development lifecycle (design-time, pre-execution, completion-time), wired as a single agent-invoked skill plus a passive audit-channel hook.

## Motivation

Snowball's forward spine (brainstorming → writing-plans → executing-plans → finishing-a-development-branch) currently lacks a structured way to ask "how big is this change, what does it depend on, and how reversible is the next action?" The system prompt's "Executing actions with care" guidance describes this discipline in prose; nothing in the lifecycle operationalises it against the real codebase.

The gap matters in three places:

- **At design-time**, scope estimates are vibes. A plan with implicit broad reach gets approved before the operator sees how broad it is.
- **At pre-execution**, the agent decides per action whether to confirm with the operator using only its in-context judgment. The system prompt's destructive-action list is the only anchor.
- **At completion-time**, the PR description and review focus are reconstructed by hand from the diff. The decision spine has no structured record of what the merge's impact was.

This spec defines an analysis that fires at all three moments, produces one composite envelope, and renders it differently per gate.

## Architecture

Two pieces, one contract.

- A `snowball:blast-radius` skill the four lifecycle skills invoke. Active, agent-driven, semantic.
- A thin audit-channel hook on the operator-approval phrase pattern and the Stop event. Passive, observes only.

**Core decomposition: one computation, three renders, three invocation contexts.**

```text
                    ┌──────────────────────────────────────┐
agent at gate ─────▶│ blast_radius(change_set, params)     │
                    │ computation                          │
                    └──────────────────┬───────────────────┘
                                       │
                       status envelope: { status, output, reason, backend }
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
       operator render           agent render               audit render
   (gate-specific preset)    (structured delta)        (decision-spine JSONL)
            │                          │                          │
            ▼                          ▼                          ▼
     surfaced verbatim           shapes plan /            captured by
     at gate                     next action              approval-phrase hook
                                                          on Stop / approval
```

**The status envelope is the single contract.** Every render path consumes it. Fields:

- `status: success | degraded | error` — always set
- `backend: graph | heuristic | none` — always set, so renders can honestly report what they ran against
- `output: { change_scope, failure_impact, action_risk } | null` — present on `success` and `degraded`
- `reason: enum | null` — present on `degraded` and `error`; closed enum defined in `SCHEMA.md`

The hook does not trigger computation. It only observes the operator-approval phrase pattern (or Stop event at completion), reads the last-written envelope from a per-session scratch path, and appends it as a structured observation to `docs/snowball/decisions/observations.jsonl`. Reuses the operator-approval primitive from decision-logging hooks — no new confirmation paths.

### Design principles this satisfies

- **Passive before proactive (where it applies).** The hook is passive observation; the skill is active where it must be (relevance is a semantic question only the agent can answer).
- **Evidence before assertions.** Render banners state the backend honestly (`graph` vs `heuristic`); the operator knows the confidence level of every surfacing.
- **Skills self-gate.** The skill skips for trivial work (typo, formatting, one-line fix with no design tradeoffs), mirroring `recalling-project-context`.
- **Honest maturity boundaries.** Skill ships everywhere; hook ships Phase 1 on Claude Code + Cursor, inheriting the existing decision-logging boundary.

## Components

Six concrete artifacts.

| # | Artifact | Path | Role |
|---|---|---|---|
| 1 | Skill manifest | `skills/blast-radius/SKILL.md` | Description, procedure, self-gating rules. Modeled on `skills/recalling-project-context/SKILL.md`. |
| 2 | Computation library | `skills/blast-radius/scripts/compute.cjs` | Pure function: `(change_set, params) → envelope`. Bun-bundled from TypeScript source. Tries codebase-memory MCP first; falls back to heuristic (git diff + file-pattern rules + action-risk rubric). Always emits a complete envelope. |
| 3 | Lens presets | `skills/blast-radius/presets/{design,pre-execution,completion}.md` | Per-gate render templates declaring which lens dominates, which are quiet, and what threshold triggers louder treatment. One template per gate. |
| 4 | Envelope writer | embedded in `compute.cjs` | Writes the most-recent envelope to `.snowball/blast-radius/last.json` for the hook to read. Per-session, gitignored. |
| 5 | Audit-channel hook | `hooks/blast-radius-audit.{cjs,sh}` | Triggered by Stop event and by the operator-approval phrase pattern already matched by decision-logging. Reads `.snowball/blast-radius/last.json` and appends an observation to `docs/snowball/decisions/observations.jsonl` with a `blast_radius_envelope` payload. Phase 1: Claude Code + Cursor wiring. |
| 6 | Schema document | `skills/blast-radius/SCHEMA.md` | Documents the envelope, the observation shape, the action-risk rubric, the file-pattern heuristics, and the reason-code enum. Referenced from `SKILL.md`; consumed by maintainers. |

**Two reuse points:**

- The **action-risk rubric** in artifact 6 is seeded from the system prompt's "Executing actions with care" list (destructive ops, hard-to-reverse, shared/visible, third-party uploads). Codified once, not duplicated per gate.
- The **hook in artifact 5** inherits its phrase-matching from existing decision-logging hooks. No second operator-approval primitive; the existing one is extended with a `blast_radius_envelope` payload tag.

**Where it does not live:** no edits to `executing-plans`' core runtime, no edits to TaskCreate/TaskUpdate semantics, no new MCP server. The skill + hook pair sits alongside existing snowball artifacts without touching their internals.

## Lifecycle integration

Four sub-step insertions. Each is a single new step in the calling skill's procedure — the same pattern brainstorming already uses for `recalling-project-context` and `m2-brainstorm:brain-jam`. No internal-logic edits.

| Calling skill | Insertion point | Lens preset | What the skill does with the envelope |
|---|---|---|---|
| `snowball:brainstorming` | At the end of "Propose 2-3 approaches", once alternatives are stable | `design` preset: **change-scope + failure-impact loud**, action-risk quiet | Attaches a per-approach scope/impact estimate to the approach presentation. Right-sizes the decision before the user picks. |
| `snowball:writing-plans` | At plan completion, before the user-review gate | `design` preset, finer granularity | Validates the plan against the design's scope estimate. If the plan's projected diff crosses the decomposition threshold, flags for "consider splitting into sub-plans" before the user reviews. |
| `snowball:executing-plans` | Before every plan step (the envelope determines whether to surface) | `pre-execution` preset: **action-risk loud**, scope/impact summarized | Invokes `blast_radius` for each step. If the envelope's `action_risk` is `medium` or higher, surfaces it to the operator and waits for the operator-approval phrase before proceeding. Low-risk steps run without surfacing. The hook captures the envelope at the approval moment. |
| `snowball:finishing-a-development-branch` | Before the merge/PR/cleanup decision | `completion` preset: **failure-impact + change-scope loud** (now grounded in actual diff), action-risk loud only if next action is push/force-push/release | Renders a completion summary covering the actual diff against merge target. Becomes input to PR description and review focus. The Stop event triggers the hook to capture a completion envelope to the decision spine. |

**Threshold tuning lives in `SCHEMA.md`, not in each calling skill.** The calling skills just say "invoke blast-radius with this preset." Thresholds for "louder treatment" and "decomposition flag" are defined once in `SCHEMA.md` and consumed by `compute.cjs`. One source of truth for what counts as risky.

**Explicit-skip escape hatch.** If the operator wants to skip blast-radius for a specific step (known-safe refactor, etc.), they say so in natural language; the calling skill respects it. The skill writes an envelope with `status: degraded`, `reason: explicit-skip`, so the audit hook still captures *why* analysis didn't run. Silent skipping is disallowed.

## Failure modes and graceful degradation

Three failure cases, three render policies, one envelope shape. Analysis always runs; failure changes the render, not the gate.

| Status | Backend that ran | When it happens | What renders show |
|---|---|---|---|
| `success` | `graph` or `heuristic` | Computation completed and the resolved backend was sufficient | Full composite report with the gate's lens preset applied; `backend` field stated honestly so the operator knows the confidence level |
| `degraded` | `heuristic` | codebase-memory MCP unreachable, repo not indexed, some resources untracked, or operator explicit-skip | Heuristic output with a banner stating the limitation; operator decides whether the partial answer is enough |
| `error` | `none` | `compute.cjs` itself failed (bug, malformed change-set, both backends exhausted) | Minimal envelope with reason code; calling skill surfaces "blast-radius unavailable" — does not block at design/completion, but does pause for confirmation at pre-execution |

**Per-gate × status rendering:**

- **`design` and `completion` gates:** `success` and `degraded` render with the gate preset; `error` renders a one-line "analysis unavailable, reason: X" and the spec or completion summary proceeds. The operator's existing decision authority is unchanged.
- **`pre-execution` gate:** same on `success` and `degraded`. On `error`, `executing-plans` pauses for explicit operator confirmation before the action — treating unknown risk as "ask" rather than "proceed silently." This is the only place where failure to compute changes whether confirmation is requested.

**Why the asymmetry.** At design and completion, an unavailable analysis is not a safety problem — the operator is already in the loop reading the spec or reviewing the diff. At pre-execution, an unavailable analysis means the reversibility of the action is unknown, and "evidence before assertions" applies: no evidence → ask.

**Reason codes are a closed enum**, defined in `SCHEMA.md`:

- `graph-unavailable`
- `repo-not-indexed`
- `change-untracked`
- `mcp-timeout`
- `compute-error`
- `explicit-skip`

Hooks and downstream tooling pattern-match on these; no free-text reason fields.

## Phase 1 maturity boundary

Snowball already labels decision-logging as "Phase 1 = Claude Code + Cursor." Same discipline applies here.

### In scope

| Artifact | Harness portability | Status |
|---|---|---|
| `snowball:blast-radius` skill (manifest + procedure + `compute.cjs`) | All harnesses that load snowball skills (CC, Cursor, Codex, Gemini CLI) | Ships everywhere |
| Lens presets (design / pre-execution / completion) | Portable — pure markdown templates | Ships everywhere |
| Codebase-memory backend (graph queries via MCP) | Portable — uses MCP, same as `recalling-project-context` | Ships everywhere; degrades to heuristic if MCP absent |
| Heuristic backend (git diff + file-pattern rules + action-risk rubric) | Portable — no harness dependency | Ships everywhere |
| Integration patches into the four lifecycle skills | Portable — skill files are platform-neutral | Ships everywhere |
| Audit-channel hook (Stop + operator-approval phrase) | CC + Cursor first | Ships on CC + Cursor; absent on other harnesses |
| `SCHEMA.md` (envelope, observation shape, rubric, heuristics, reason codes) | Portable docs | Ships everywhere |

### Explicitly out of scope (deferred to Phase 2+)

- **Operator-tunable thresholds per project.** Phase 1 thresholds live in `SCHEMA.md` as canonical defaults. A project-level override mechanism (e.g. `.snowball/blast-radius.config.json`) is a Phase 2 question, not a launch blocker.
- **Hook ports to Codex / Gemini CLI / other harnesses.** Matches the existing decision-logging maturity boundary. Agents on those harnesses get the full agent-invoked spine and lose only the passive audit capture at the operator-approval moment. Documented as a known limitation in `SKILL.md`.
- **codebase-memory graph annotations** ("this file is risk-sensitive"). Currently the file-pattern heuristics encode the operator-defined risk surface. Phase 2 could let the graph carry first-class risk metadata.
- **Cross-session pattern detection** ("you keep hitting the same blast-radius warning on this module"). The decision spine accumulates the data; reading it back is a separate skill, not bundled into Phase 1.
- **Visual blast-radius diagrams** (call-graph rendering, dependency tree visualizations). Out of scope for Phase 1. Renders are text. A future sub-skill could read the envelope and render diagrams.

### Known consequence of the maturity boundary

On a Codex or Gemini session, an operator who approves a risky action will not see the envelope captured to the decision spine — they will see it surfaced at the gate (because the skill ran), but it scrolls off. Decision-spine continuity is degraded; the safety surface (the gate itself) is intact. Same trade-off as existing decision-logging; we inherit it, not create it.

## Testing strategy

The envelope is the parse boundary (per `parse-do-not-validate`): external MCP responses and git-diff parsing convert into a typed envelope at the edge; everything downstream operates on the precise envelope type. That shape drives the test architecture.

| Test layer | What's tested | Style | Why it's the right shape |
|---|---|---|---|
| Envelope contract | `compute.cjs` produces a structurally valid envelope for every status / backend combination | Unit, no I/O | Domain logic, fully isolated. Fast. |
| Heuristic backend | File-pattern rubric + git-diff parsing produces the expected envelope for fixture diffs | Contract test against canned diffs | Heuristic is pure; the fixture diffs are the contract. No mocks. |
| Graph backend (stubbed) | Stubbed MCP client returns canned `search_graph` / `detect_changes` responses; backend assembles the envelope correctly | Collaboration test | Paired with the live contract below. |
| Graph backend (live) | Same backend hit against a real, small, indexed test repo using the actual codebase-memory MCP server | Contract test | Proves the stub values are achievable. Satisfies the rule that every stub has a paired contract test. |
| Lens preset renders | Envelope → rendered text for each `(gate, lens-prominence, status)` combination | Pure transformation tests, snapshot-style | Render is a pure function of the envelope. No mocks. |
| Audit hook | Stop event and operator-approval phrase trigger the hook; observation gets appended with `blast_radius_envelope` payload | Same harness used by existing decision-logging hook tests | Reuses the proven pattern; no new infra. |
| Integration patches (the four lifecycle skills) | The patched skill's procedure mentions the blast-radius invocation point and the right preset | Smoke check (grep-style assertion on `SKILL.md` content) | Skills are markdown; this is the right granularity. Real behavior is covered by the e2e smoke. |
| End-to-end smoke | One fixture session walks brainstorm → plan → execute → finish; the test asserts envelopes were produced at each gate and the completion envelope was captured to `observations.jsonl` | Single golden-path test | One e2e per snowball lifecycle is the existing convention. |

**Not tested as integrated:** the four calling skills end-to-end with every status × every preset × every threshold permutation. The envelope-and-render contract tests cover the cross-product directly and stay fast; the one e2e proves the wiring holds. Avoids the "integrated tests are a scam" trap.

**Fixture management.** All fixture diffs and the small test repo for the live graph contract live under `skills/blast-radius/test/fixtures/`. The small test repo is checked in (not synthesized at test time) so the live contract test is deterministic and re-runnable offline once codebase-memory has indexed it.

**No mocks of codebase-memory above the backend layer.** The renderer never sees the MCP; it sees the envelope. The boundary stays thin.

## What changes

| Before | After |
|---|---|
| No structured blast-radius surfacing at any lifecycle gate | `snowball:blast-radius` skill called at all four gate-skills' integration points |
| System prompt's "Executing actions with care" is the only anchor for action-risk | Action-risk codified in `SCHEMA.md` and consulted programmatically per `executing-plans` step |
| `docs/snowball/decisions/observations.jsonl` carries decisions and operator approvals | Now also carries `blast_radius_envelope` payloads tagged at operator-approval and Stop events |
| `.snowball/` carries brainstorming session state | Adds `.snowball/blast-radius/last.json` per-session scratch (gitignored) |

## What stays the same

- The four lifecycle skills' existing procedures are *augmented* by one sub-step each; nothing is removed or restructured.
- Decision-logging hooks' phrase-matching is unchanged; they grow one new payload tag.
- `recalling-project-context` is untouched. Blast-radius is a sibling, not an extension.
- The `m2-brainstorm` companion integration is untouched.
- Operator-approval primitive (free-text approval phrases) is unchanged.

## Open questions deferred to the implementation plan

These are real decisions that the plan must make; the spec deliberately leaves them open because they belong in plan-level granularity, not architecture-level.

- The exact threshold values in `SCHEMA.md` (file count, fan-out cardinality, etc.) — needs calibration against this repo's existing diffs before pinning.
- The TypeScript-to-CJS bundling toolchain choice (Bun vs. esbuild) — should match what `recalling-project-context` uses today; the plan confirms.
- The exact action-risk taxonomy (low / medium / high vs. a richer scale) — the spec assumes a three-level scale; the plan can refine.
- Whether the heuristic backend ships with a curated default file-pattern list or starts narrower and expands based on observed false positives — the plan should pick one.
- Performance budget on `compute.cjs` at design and pre-execution gates — needs a target so the plan can decide whether streaming MCP results matters.

## References

- `docs/snowball/specs/2026-02-19-visual-brainstorming-refactor-design.md` — sibling-skill integration pattern reference
- `skills/recalling-project-context/SKILL.md` — analogous skill shape (MCP-backed with graceful fallback)
- `skills/decision-logging/` — operator-approval phrase pattern and hook reuse target
- `.brainstorm/blast-radius-wiring-20260531T175844.json` — M2 brain-jam transcript that shifted the design from "hooks-as-trigger" to "hooks-as-audit-channel"
