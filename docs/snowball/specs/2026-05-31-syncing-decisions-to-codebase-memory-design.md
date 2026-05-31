# Syncing Snowball Decisions to codebase-memory ADR

**Date:** 2026-05-31
**Status:** Draft
**Scope:** New skill `skills/syncing-decisions-to-memory/` (snowball side only)
**Depends on (optional, external):** `codebase-memory` MCP server (`list_projects`, `manage_adr` tools)

## Problem

Snowball already captures decisions to disk: operator decisions as MADR markdown in `docs/snowball/decisions/<timestamp>-<slug>.md`, and lower-confidence agent observations as `docs/snowball/decisions/observations.jsonl` (see `skills/decision-logging`). Separately, the `codebase-memory` MCP server maintains a per-project ADR document — a single architecture summary with a fixed set of canonical sections — reachable through its `manage_adr` tool.

These two systems are disconnected. codebase-memory has **no** code path that reads a decisions directory: a source scan of both the C implementation (`/Users/kellen/lib/codebase-memory-mcp`) and the Deno variant (`cbm-deno`) finds zero references to snowball, `observations.jsonl`, or `docs/snowball`. So "ensure codebase-memory decision parsing can read snowball logs" is **net-new wiring**, not a parser fix — and the two artifacts have opposite shapes: snowball produces a *stream of point-in-time decisions*; codebase-memory's ADR is a *single prose summary*.

The goal is to project the snowball decision stream into codebase-memory's ADR so that an agent exploring the repo through codebase-memory sees the distilled rationale, without leaving codebase-memory's internals.

## Hard constraints (verified against source)

1. **Canonical sections only.** `is_canonical_section` (`src/store/store.c:4450`) does an exact, case-sensitive `strcmp` against a fixed list: `PURPOSE`, `STACK`, `ARCHITECTURE`, `PATTERNS`, `TRADEOFFS`, `PHILOSOPHY`. `adr_try_section_header` returns `NULL` for any other `## Header`, so a non-canonical header (e.g. `## DECISIONS`) is **not** treated as a section boundary — its body is absorbed into the preceding section or dropped. A dedicated decisions section is therefore impossible without patching codebase-memory's C source, which is out of scope.
2. **Whole-document writes.** `manage_adr(mode='update', content=...)` replaces the entire stored ADR with the supplied string. There is no per-section write API. Any update must therefore carry the full intended document.
3. **codebase-memory stays untouched.** No C/Deno changes. We use only its public MCP surface (`list_projects`, `manage_adr`).

Consequence: decision content folds into the existing canonical sections — **TRADEOFFS** and **PHILOSOPHY**.

## Goals

1. An on-demand snowball skill that distills this repo's decision logs into codebase-memory's ADR via `manage_adr`.
2. Non-destructive: never overwrite the structural sections (`PURPOSE`/`STACK`/`ARCHITECTURE`/`PATTERNS`).
3. Idempotent: re-running with no new or changed decisions is a true no-op — no LLM call, no write.
4. Keep the messy shell (MCP + LLM) thin; put all logic in pure, unit-testable functions.

## Non-Goals

- **Modifying codebase-memory** (C or Deno). MCP surface only.
- **Authoring the structural sections.** This skill is a decision *feeder*, not the ADR author. `PURPOSE`/`STACK`/`ARCHITECTURE`/`PATTERNS` are left to a human or to `get_architecture`.
- **A hook / automatic capture.** Synthesis is LLM-driven and too costly to run silently; on-demand only. (Capture of the raw decisions is already automatic via `decision-logging` hooks.)
- **Preserving structured decision detail in the ADR.** The ADR is intentionally the *lossy projection*; the structured records remain on disk for structural consumers (e.g. flannel).
- **Hand-edited trade-off prose coexisting with machine prose.** Deferred; see Future work (marker-block variant).
- **Generality across arbitrary repos** beyond "a git repo with `docs/snowball/decisions/` that is indexed in codebase-memory." No multi-repo or registry features.

## Design

### Form factor

A new skill `skills/syncing-decisions-to-memory/`, invocable as `/snowball:syncing-decisions-to-memory`. It orchestrates deterministic scripts, one agent synthesis step, and codebase-memory MCP calls. Built with the same `src/*.ts` → `scripts/*.cjs` (Bun bundle) pipeline as `decision-logging`.

### The pure / impure boundary

- **Impure shell — the SKILL.md agent.** The only component that touches MCP or the LLM. It calls `git rev-parse`, `list_projects`, `manage_adr(get)`, performs the synthesis, and calls `manage_adr(update)`.
- **Pure core — a node script (`scripts/sync-decisions.cjs`).** Gathers + filters the logs, computes the digest, parses ADR sections, merges, renders. Reads the decision files; otherwise no I/O. Fully unit-testable.

### Data flow (one run)

1. **Resolve project.** Agent runs `git rev-parse --show-toplevel`, calls `list_projects`, and matches the entry whose `root_path` equals the repo root → project name. Match the real list; never reconstruct the path-slug by hand. Not found → stop with "run `index_repository` first."
2. **Fetch current ADR.** Agent calls `manage_adr(mode='get')`. A `no_adr` / empty result is the bootstrap case.
3. **Gather + filter (pure).** Read `docs/snowball/decisions/*.md` (frontmatter + body) and `observations.jsonl`. Keep MADRs with `status ∈ {accepted, proposed}` (drop `superseded`/`rejected`/`deprecated`). Keep observations where `confidence == "high"` OR `type ∈ {constraint, implementation-choice}` (drop speculative hypotheses).
4. **Digest guard (pure).** Compute a stable hash over the filtered set; extract the prior digest marker from the current ADR. **Equal → no-op** ("ADR already current"), exit. Unequal → continue.
5. **Synthesize (agent).** From the filtered records, write two sections of prose only: **TRADEOFFS** (what was chosen over what, and why) and **PHILOSOPHY** (recurring principles/constraints across decisions). The agent does not handle the digest marker.
6. **Merge + render (pure).** Parse the current ADR into canonical sections; replace only TRADEOFFS + PHILOSOPHY with the agent's prose; preserve the structural four byte-for-byte; deterministically append the digest marker (computed in step 4) to the end of PHILOSOPHY; re-render in canonical order. Keeping the marker out of the agent's hands guarantees the stored hash exactly matches the hashed input.
7. **Write.** Agent calls `manage_adr(mode='update', content=<rendered doc>)` — one atomic write.

### Idempotency: the digest guard

The pure script hashes the *filtered input set*, order-independently:

- For each MADR: a tuple of `snowball.source_event_id` + a hash of the decision body.
- For each kept observation: `session_id|timestamp` + a hash of `content`.

Sort the tuples, `sha256`, keep the first 16 hex chars. Stored as a single line at the end of PHILOSOPHY:

```text
<!-- snowball:decisions-digest:sha256:a1b2c3d4e5f6a7b8 -->
```

Extracted by regex from the raw ADR string *before* section parsing. Equal digest → the whole synthesis + write is skipped, so re-running with no new/changed decisions never calls the LLM and never churns the doc. Editing a decision changes its body hash and correctly re-triggers.

### Section ownership

**TRADEOFFS + PHILOSOPHY are machine-owned** — re-running overwrites them. The structural four are never touched. This contract is documented in the SKILL.md so overwrite is not a surprise. Hand-edited trade-off prose is not supported in this version (see Future work).

### Bootstrap (empty ADR)

`no_adr` → the rendered doc contains only `## TRADEOFFS` and `## PHILOSOPHY` (+ digest marker). The structural sections stay absent until a human or `get_architecture` populates them; `manage_adr` accepts a partial document.

### Error handling

Parse external input into precise records at the boundary; prefer data over try/catch; one atomic write means no partial state.

| Situation | Behavior |
|---|---|
| Repo not indexed in codebase-memory | Stop; instruct the user to run `index_repository`. No write. |
| `manage_adr` get/update MCP error | Report and abort; single atomic write → no partial state. |
| Malformed MADR frontmatter / bad JSONL line | Skip that record; collect into a warnings list surfaced at the end; never abort the whole run. |
| No qualifying decisions after filtering | No-op; report "nothing to sync" (distinct from "already current"). |
| Digest unchanged | No-op; report "ADR already current." |

### Concurrency

Single-user, on-demand, last-write-wins on the ADR — no locking. The digest guard, not a lock, prevents redundant writes.

## Testing

The shell is thin enough to need no integrated tests; all logic is pure functions with fast unit tests, plus one contract test guarding the codebase-memory assumption.

### Pure unit tests (fast, against committed fixture logs)

- **Filtering:** MADR `status` filter; observation `confidence`/`type` filter.
- **Digest:** order-independent (shuffle input → same hash); edit-sensitive (change a body → different hash); addition-sensitive.
- **ADR parse:** canonical-only sections; non-canonical headers absorbed; whitespace trimmed — mirroring `cbm_adr_parse_sections`.
- **Merge / render:** structural sections preserved byte-for-byte; owned sections replaced; canonical order; marker placement + re-extraction.

### Contract test (critical)

The pure merge code assumes codebase-memory parses sections a specific way (exact uppercase canonical names, `##`-prefixed headers, drops the rest). That assumption is a stub, so it needs a contract test proving the *real* parser behaves that way. Live round-trip: render a doc → `manage_adr(update)` → `manage_adr(get)` + `mode='sections'` → assert TRADEOFFS/PHILOSOPHY return intact and the structural sections are preserved. Runs against the live MCP (or a pinned codebase-memory build) in CI/manual, not the fast suite. This catches any future change to codebase-memory's canonical set.

### Not tested

LLM synthesis prose quality (non-deterministic, out of scope) and agent orchestration (kept thin on purpose).

## Future work

- **Marker-block variant.** If hand-written trade-off prose ever needs to coexist with machine output in the same section, wrap the machine content in `<!-- snowball:decisions:start -->` / `…:end -->` markers inside TRADEOFFS and rewrite only between them.
- **Patch codebase-memory for a real DECISIONS section.** If a first-class decisions section is wanted, add it to `canonical_sections` in `src/store/store.c` (and the Deno variant) — a larger, cross-repo change.
