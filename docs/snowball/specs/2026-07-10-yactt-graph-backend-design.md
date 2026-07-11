# YACTT as Graph Backend (Replacing codebase-memory-mcp Graph Path)

**Date:** 2026-07-10
**Status:** Accepted
**Scope:** Phased graph-layer cutover in `blast-radius` and across graph-side skill prose. **ADR storage (`manage_adr`) stays on codebase-memory** under a separate follow-up MADR.
**Depends on:** [yactt](https://github.com/kellenff/yactt) installed in the user's environment (binary or marketplace plugin). yactt's MCP-native CLI (`yactt mcp serve`) reachable; `deno` v2+ reachable for the snowball-owned shim.
**Related:** `2026-05-31-syncing-decisions-to-codebase-memory-design.md` (ADR layer; not modified by this design). `2026-05-31-blast-radius-analysis-design.md` and `skills/blast-radius/SCHEMA.md` (envelope contract; `backend_attempts` is the only schema addition).

## Problem

`codebase-memory-mcp` currently serves two architecturally distinct roles in snowball: a **graph backend** (code symbol/call/reference index) consumed by `blast-radius` for `change_scope.failure_impact` estimates, and an **ADR storage** (project ADR via `manage_adr`) consumed by `recalling-project-context`, `syncing-decisions-to-memory`, and `finishing-a-development-branch`.

[yactt](https://github.com/kellenff/yactt) is a separate code-intelligence MCP server (lossless source, resolved semantics via tree-sitter + opportunistic LSP fall-back, 21 MCP tools, read-only, Go binary). yactt does **not** provide ADR storage; it positions itself at `[0.85, 0.82]` on the code-intelligence quadrant chart versus codebase-memory-mcp at `[0.55, 0.70]`. yactt's CLI is intentionally thin (`help` / `version` / `overview` / `mcp serve`) — all 21 tools are reachable only via the MCP server.

Goals:

1. Replace codebase-memory's **graph path** with yactt across all surfaces where snowball currently invokes a graph backend (or where a future maintainer might reach for one).
2. Land the cutover everywhere a graph backend might be invoked — `.claude/settings.local.json` allowlist, marketplace install hooks, top-of-skill callouts in `systematic-debugging`, `recalling-project-context` (operator-tip line), `using-snowball/references/junie-tools.md`, and `brainstorming/SKILL.md`.
3. Preserve a tested, opt-out rollback path (`SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory`) that codifies "codebase-memory graph is on life support," and a `SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK=0` opt-out for operators who want yactt-only.
4. Keep the codebase-memory ADR side untouched. The follow-up MADR for ADR storage is a separate spec and plan; this design deliberately ends before that line.
5. Bounded parity tests. yactt and codebase-memory measure fan-out differently — the suite asserts bounded agreement, not exact match.

Non-Goals:

- **Replacing `manage_adr` / ADR storage.** Out of scope; explicitly behind a follow-up MADR.
- **Touching `recalling-project-context`, `syncing-decisions-to-memory`, or their tests.** Pure ADR-side; not modified by this design.
- **Touching `.codebase-memory/adr.md` cache or its disk cache conventions** (`.codebase-memory/` directory is per-machine gitignored state). Untouched.
- **Reshaping the snowball MCP wiring strategy beyond registering yactt.** Codebase-memory remains registered because `manage_adr` is still in active use.
- **A Go binary for the shim.** Rejected — uses the Deno shim instead (see Components, decision rationale below).
- **MCP-native blast-radius.** yactt's MCP server is reachable via stdin/stdout by the shim; blast-radius does not need to become an MCP client itself.
- **Per-release parity reporting dashboards.** yagni — operators run `BLAST_RADIUS_GRAPH_BACKEND` comparisons manually during the transition window.

## Surface assumptions

Verified during brainstorming:

- **yactt CLI surface** (`/Users/kellen/Projects/yactt/bin/yactt --help`): thin — `help` / `version` / `overview` / `mcp serve [path]`. The 21 tools are only reachable via `yactt mcp serve`. No `cli list-projects`, no `cli search`, no `cli detect-changes` analog.
- **yactt MCP server name** (`yactt/docs/design.md`): `yactt`. Single-repo mode `yactt mcp serve <path>` exposes all 21 tools (16 code-intel + 4 registry + `persisted_query`); registry mode drops the 16 to expose only the registry.
- **yactt cache:** `$XDG_CACHE_HOME/yactt/<root-hash>/` for parsed entries, `projects.json` for the registry. User-scoped; never overlaps the target repo.
- **codebase-memory graph tools used by snowball** (from `.claude/settings.local.json`): `search_graph`, `query_graph`, `search_code`, `get_code_snippet`, `get_architecture`, `index_repository`, `index_status`, `list_projects`, `delete_project`. **Excluded from this design:** `manage_adr` (ADR layer — out of scope).
- **codebase-memory CLI:** `codebase-memory-mcp cli <tool> <json-args>` shape; `runCliTool` in `blast-radius/src/mcp-cli.ts` shells out via `execFileSync` with a 15s timeout.
- **blast-radius architecture:** `compute.cjs` orchestrates via `tryGraphBackend(input, client=createDefaultCodebaseMemoryClient())`; `client` interface is `{isAvailable, listProjects, detectChanges, searchGraph}`. The factory pattern is the seam where yactt slots in.
- **blast-radius envelope schema** (`skills/blast-radius/SCHEMA.md`): `status` ∈ `success|degraded|error`; `backend` ∈ `graph|heuristic|none`; `reason` ∈ `graph-unavailable|repo-not-indexed|change-untracked|mcp-timeout|compute-error|explicit-skip|null`. **One schema addition:** optional `backend_attempts: string[]` (null-safe — older readers ignore it).
- **deno:** `deno 2.7.11` (or newer) on `PATH` is a baseline assumption. Deno is already on this machine; the rollout assumes operators have it too. Documented in the README install section.

## Design

### Architecture

```text
extensions/snowball/yactt-cli/                   (NEW; Deno shim speaking stdin/stdout JSON-RPC)
└── cli.ts                                       — subcommands: list-loaded-repos, search-symbols,
                                                  references-for-symbol, etc.; each shells a
                                                  child yactt mcp serve <repo>, talks JSON-RPC.

extensions/snowball/mcp/mcp.json                 (EDITED; +yactt entry; codebase-memory stays)

skills/blast-radius/src/mcp-cli.ts               (EDITED; +resolveBackendClient; +yactt client factory;
                                                  codebase-memory client factory preserved.)

skills/blast-radius/src/graph-backend.ts         (EDITED; chained yactt → codebase-memory → heuristic.)

skills/blast-radius/scripts/compute.cjs          (REBUILT; bundled output of src/, no manual edits.)

skills/blast-radius/SKILL.md                     (EDITED; graph-backend paragraph rewritten.)
skills/blast-radius/SCHEMA.md                    (EDITED; reason-code table updated;
                                                  backend_attempts field added.)

skills/systematic-debugging/SKILL.md             (EDITED; one-line graph-backend preference.)
skills/recalling-project-context/SKILL.md        (EDITED; the operator-tip line referencing
                                                  search_graph/detect_changes reframed.)
skills/brainstorming/SKILL.md                    (EDITED; line 200 reference.)
skills/using-snowball/references/junie-tools.md  (EDITED; the Codebase-Memory-MCP bullet
                                                  reframed for yactt.)

.claude/settings.local.json                      (EDITED; drop codebase-memory graph tool allowlist;
                                                  keep manage_adr + delete_project.)

scripts/install.sh                               (EDITED; Junie/Junie-CLI pointer paragraphs.)

tests/blast-radius/yactt-cli/                    (NEW; Deno shim unit tests.)
tests/blast-radius/compute.test.ts               (NEW; blast-radius contract tests.)
tests/blast-radius/parity.test.ts                (NEW; parity tests — bounded agreement only.)

docs/snowball/specs/2026-07-10-yactt-graph-backend-design.md
                                                 (NEW; this spec.)
README.md / RELEASE-NOTES.md                     (EDITED; install + per-release notes.)
```

Three deliverables, plus the spec and tests:

1. **yactt-cli Deno shim.** The seam between blast-radius and yactt's MCP-only surface. Single file `cli.ts` exposing subcommands that mirror what blast-radius currently asks codebase-memory for.
2. **blast-radius selector + chained fallback.** One env var + one fallback chain + one stderr-log-once behavior; otherwise the existing `tryGraphBackend` shape is preserved.
3. **Surface sweep.** Permission allowlist, install pointer prose, and top-of-skill callouts all updated so future maintainers never default to codebase-memory for graph queries.

### Components

#### `extensions/snowball/yactt-cli/cli.ts` (Deno shim)

A Deno program that wraps yactt's MCP server in a CLI shape blast-radius can shell out to.

```ts
// Sketch — implementation lives in the plan, not the spec.
//
// Invocation (per call, blast-radius shells via execFileSync):
//   deno run --quiet --allow-net --allow-read=... \
//     extensions/snowball/yactt-cli/cli.ts \
//     list-loaded-repos --repo /abs/repo
//   deno run --quiet --allow-net --allow-read=... \
//     extensions/snowball/yactt-cli/cli.ts \
//     search-symbols --repo /abs/repo --query '<name>' --limit 50
//
// Output: parsed JSON to stdout, exit-code 0 on success.
// Failure modes: exit 1 + stderr `mcp-timeout` / `graph-unavailable` /
// `repo-not-indexed` to match blast-radius's closed enum.
```

Implementation notes (not prescriptive for the plan, but the seam matters):

- Per-invocation spawn a `yactt mcp serve <repo>` child (single repo at a time), talk JSON-RPC over stdio, send the `tools/call` request, capture the response, exit.
- Cache the child-process lifecycle only if a process is short-lived; per-invocation spawn is the simplest and matches blast-radius's existing `execFileSync` shape.
- Honor `YACTT_CLI_PATH` (mirrors `CBM_CLI_PATH`) for binary override. If the project-wide `SNOWBALL_` prefix is meant to apply uniformly, this becomes `SNOWBALL_YACTT_CLI_PATH`.
- The shim does not hold any policy — it is mechanical translation. All policy lives in blast-radius.

Why Deno (and not a Go binary or Node shim):

- snowball is otherwise a TypeScript/Node repo. Adding a Go binary just for the shim introduces a second toolchain to maintain.
- The shim is a few hundred LoC. A Node shim would re-enter snowball's own runtime, with risks around the spawn/thin-client boundary.
- Deno's `--allow-net` / `--allow-read` flags give the shim explicit, auditable permissions; easier security posture than Node. Deno is already on the operator's machine (verified v2.7.11).

#### `skills/blast-radius/src/mcp-cli.ts` — `resolveBackendClient`

Replaces `resolveCliBinary` (the codebase-memory-only path). New shape:

```ts
// Sketch — implementation in the plan.
export function resolveBackendClient(): GraphClient | null {
  const sel = process.env.SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND ?? "yactt";
  if (sel === "heuristic") return null;
  if (sel === "codebase-memory") return createCodebaseMemoryClient();
  return createYacttClient(); // default
}
```

Where `createYacttClient()` resolves `YACTT_CLI_PATH ?? "yactt-cli"` and exposes the same interface `{isAvailable, listProjects, detectChanges, searchGraph}` as before — so `tryGraphBackend` doesn't need to be reshaped.

Method mapping (initial; the plan refines):

| codebase-memory CLI call | yactt shim equivalent |
|--------------------------|-----------------------|
| `codebase-memory-mcp cli list_projects {}` | `yactt-cli list-loaded-repos --repo <gitRoot>` (registry mode) |
| `codebase-memory-mcp cli detect_changes --project <p> --scope impact` | `yactt-cli impacted-symbols --repo <gitRoot> --paths <paths>` |
| `codebase-memory-mcp cli search_graph --project <p> --file_pattern <f> --label Function --limit 50` | `yactt-cli search-symbols --repo <gitRoot> --file-pattern <f> --limit 50` |

The exact mapping is provisional — the implementation plan experiments against a fixture and locks it down. The shim's *shape* (CLI subcommand per blast-radius call) is the only invariant the spec asserts.

Backwards compatibility:

- `BLAST_RADIUS_DISABLE_GRAPH=1` keeps its semantics — maps internally to `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic`.
- `CBM_CLI_PATH` keeps its semantics — still honored when selector is `codebase-memory`.

#### `skills/blast-radius/src/graph-backend.ts` — chained fallback

The fallback chain runs in this order:

```text
yactt client   (selector-driven first attempt)
   ↓ ok → return success / graph
   ↓ fail (one of {graph-unavailable, repo-not-indexed, mcp-timeout})
       remember reason r1
       if SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK=0 → skip to heuristic with r1
codebase-memory client   (auto-fallback; gated by SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK, default 1)
   ↓ ok → return success / graph
   ↓ fail → remember reason r2 (override r1 if r1 was graph-unavailable)
computeHeuristic → return degraded + heuristic with reason = r1 || r2, + one stderr line if a fallback fired
```

When `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory`, the yactt step is skipped entirely.
When `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic`, both graph steps are skipped.
`SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK` defaults to `1` (auto-fallback on).

The envelope's `reason` is **last-attempt wins** — if yactt failed and codebase-memory also failed, the reason is whichever the codebase-memory attempt produced. The plan should discuss whether to carry `r1` in metadata; for the spec we land on "last-attempt wins, `backend_attempts` records the order."

#### New env vars

| Var | Default | Values | Effect |
|-----|---------|--------|--------|
| `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND` | `yactt` | `yactt` \| `codebase-memory` \| `heuristic` | First-attempt backend selector. |
| `SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK` | `1` | `0` \| `1` | Opt-out of auto-fallback from yactt to codebase-memory. |
| `YACTT_CLI_PATH` | — | absolute path | Override the yactt-cli shim binary location. |

The `SNOWBALL_` prefix on the selector and fallback env vars is consistent with the project-wide prefix that newer snowball knobs use, and scopes those variables to their blast-radius effect — no other skill is confused by an unrelated global. `YACTT_CLI_PATH` follows the existing unprefixed binary-path override convention (`CBM_CLI_PATH`); the implementation plan can fold it under `SNOWBALL_YACTT_CLI_PATH` if the project-wide prefix rule is meant to apply uniformly.

#### `skills/blast-radius/SCHEMA.md` — schema delta

One addition: `backend_attempts: string[]` (optional, null-safe). Example:

```json
{
  "status": "success",
  "backend": "graph",
  "backend_attempts": ["yactt"],
  "output": { ... },
  "reason": null
}
```

When fallback fires: `"backend_attempts": ["yactt", "codebase-memory"]`. The audit hook (`hooks/blast-radius-audit.sh`) and `.snowball/blast-radius/last.json` consumers that don't know the field ignore it.

### Data flow

For a typical `blast-radius` invocation:

1. `compute.ts:computeBlastRadius(input)` resolves the diff (git + explicit paths → `paths`).
2. Calls `tryGraphBackend({gitRoot, paths, proposedAction}, resolveBackendClient())`.
3. **Selector resolution** (`mcp-cli.ts`):
   - `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic` (or `BLAST_RADIUS_DISABLE_GRAPH=1`) → `null` client → graph attempts skipped → straight to heuristic.
   - `=codebase-memory` → codebase-memory client (`execFileSync("codebase-memory-mcp", ["cli", ...])`).
   - default / `=yactt` → yactt client (`execFileSync("deno", ["run", "--quiet", ...cli.ts, ...])`).
4. **Graph attempt 1:**
   - `client.isAvailable()` probes binary version; returns false on timeout.
   - `client.listProjects()` (or yactt equivalent `list-loaded-repos`) → resolved project name (or null → `repo-not-indexed`).
   - `client.detectChanges(project, {scope: "impact"})` → `impacted_symbols` (or null → `mcp-timeout`).
   - `client.searchGraph(project, {file_pattern, label: "Function", limit: 50})` per `paths[i]` → fan-out estimate.
5. **Auto-fallback** if first attempt failed and `SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK != 0`:
   - Repeat step 4 with the other client's binary (codebase-memory if yactt first; or heuristic shortcut if heuristic fallback is itself disabled — though that's nonsense).
   - On success: return `success / graph` with `backend_attempts: ["yactt","codebase-memory"]`.
6. **Heuristic fallback** (always available):
   - `computeHeuristic({paths, proposedAction})` → `change_scope`, `failure_impact` (sensitive-paths only — no graph fan-out), `action_risk`.
   - Envelope: `status: degraded` if any graph attempt ran, else `status: success`. `reason` = last graph attempt's reason, or `null`.
7. Persist envelope to `.snowball/blast-radius/last.json`; audit hook reads it on operator-approval / Stop.

### Error handling

The blast-radius envelope's `reason` is a closed enum, unchanged. Mapping:

| Source failure | Mapped reason |
|---|---|
| yactt binary not on PATH / `YACTT_CLI_PATH` wrong / version probe fails | `graph-unavailable` |
| yactt registry has no entry for `gitRoot` / `list-loaded-repos` returns empty | `repo-not-indexed` |
| yactt MCP call times out or returns error | `mcp-timeout` |
| Internal shim crash / JSON parse error | `compute-error` |
| Same for codebase-memory | (same codes) |

`BLAST_RADIUS_DISABLE_GRAPH=1` (or `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic`) → no graph attempt, no reason emitted, `backend: heuristic` with `status: success`.

Reason-code table in `SCHEMA.md` is updated to call out yactt in the same row that names codebase-memory; the closed enum doesn't change.

**Stderr behavior on fallback.** When a fallback fires (yactt → codebase-memory), `graph-backend.ts` writes exactly one line to `process.stderr`:

```text
blast-radius: yactt failed (graph-unavailable); falling back to codebase-memory
```

This is not part of the envelope. It is operator-visible chat-side diagnostic. Tests should allow it (don't choke on stderr).

**Backward compat assertion.** `BLAST_RADIUS_DISABLE_GRAPH=1` produces the same envelope as `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic`. Locked in via a test.

### Testing

Four layers, with explicit pass criteria.

#### A. `tests/blast-radius/yactt-cli/` — yactt-cli Deno shim unit tests

A small stub MCP server (Go or Deno) serves a frozen fixture set: 3 repos, 12 symbols, 4 reference edges.

| Test | Assertion |
|------|-----------|
| `list-loaded-repos against stub returns parsed {repos: [...]}` | Same shape blast-radius expects. |
| `not-indexed repo returns {repos: []}` | No throw. |
| `stub returns timeout → shim exits non-zero with stderr mcp-timeout` | Closed-enum reason codes flow through. |
| `YACTT_CLI_PATH override honored` | execFileSync sees the override. |
| `missing --repo flag → exit 2 + usage` | Conventional CLI failure. |

#### B. `tests/blast-radius/compute.test.ts` — blast-radius contract tests

Bun test runner (`bun test` already wired). Coverage:

| Test | Assertion |
|------|-----------|
| 9 selector-matrix cases (3 selectors × 3 backend states) | `backend_attempts` and final `backend` / `reason` per failure-mode matrix. |
| `SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK=1` and yactt returns `mcp-timeout` | Next attempt is codebase-memory; asserted by stub call ordering. |
| `SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK=0` suppresses codebase-memory | Skips straight to heuristic with the yactt reason. |
| `BLAST_RADIUS_DISABLE_GRAPH=1` ≡ `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic` | Backwards compat — same envelope. |
| `CBM_CLI_PATH=/path/to/stub` redirects codebase-memory binary | Backwards compat — works. |
| Heuristic-only runs (selector=heuristic) | `change_scope.fileCount ≥ fileCount` matching the git diff. Sanity floor. |

≥80% line coverage on the new resolver and fallback chain is a plan acceptance gate.

#### C. `tests/blast-radius/parity.test.ts` — bounded parity

Fixture repo: `/tmp/snowball-blast-radius-parity-<hash>/` git repo with known files + import edges.

- Run `compute.cjs compute-and-persist` once with `=yactt` against a yactt-loaded fixture.
- Run again with `=codebase-memory` against a codebase-memory-loaded fixture (same paths).
- Both envelopes should be `status: success` and `backend: graph`.
- Bounded agreement: `abs(yactt.failure_impact.estimatedFanOut − cbm.failure_impact.estimatedFanOut) ≤ 4`. Failure-impact level agrees.
- The bound is a *plan-time* tuning; the spec asserts only that the parity test exists and the bound is bounded.

The test is *bounded*, not exact. yactt and codebase-memory measure fan-out differently (resolved-symbol graph vs heuristics); we want to flag a 10× divergence, not fail the suite on cosmetic deltas.

#### D. `tests/blast-radius/SMOKE.md` — manual

Captured in this spec's "Smoke test" section below; mirrored to a `tests/blast-radius/SMOKE.md` file so an operator can curl it.

### Rollout

A 3-PR sequence; each PR is independently landable.

#### PR 1 — `feat(yactt-cli): add Deno shim and selector` (additive, no behavior change)

- New: `extensions/snowball/yactt-cli/` (Deno shim).
- Edited: `mcp-cli.ts` adds yactt client factory and selector resolver.
- Edited: `graph-backend.ts` adds the auto-fallback chain.
- Edited: `mcp.json` — adds yactt entry alongside codebase-memory.
- Default: `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND` resolves to `yactt` (unset env var) in shipped code; per-machine allowlist for MCP-direct consumers stays `codebase-memory`-flavored until PR 2.
- Tests: `yactt-cli/`, `compute.test.ts`, parity-test scaffold (not asserted yet).
- Dogfooded via: explicit `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=yactt` invocations on the maintainer's machine during PR 1; default-per-machine flip lands in PR 2.
- Rollback: revert PR; codebase-memory path is unchanged.
- Gate to land: parity test passes with `=yactt` and `=codebase-memory` against fixture.

#### PR 2 — `feat(blast-radius): default to yactt; keep codebase-memory callable` (default flip)

- Edited: `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND` defaults to `yactt` in shipped config.
- Edited: top-of-skill notes (`systematic-debugging`, `recalling-project-context` operator-tip line, `using-snowball/references/junie-tools.md`, `brainstorming/SKILL.md:200`).
- Edited: `scripts/install.sh` (Junie / Junie-CLI pointer paragraphs list yactt alongside codebase-memory).
- Tests: parity test promoted from scaffold → asserted bounds; cross-checked across two minor versions of snowball.
- Dogfooded via: snowball itself uses yactt by default for one minor version before PR 3 lands.
- Rollback: an operator pins `=codebase-memory`.

#### PR 3 — `chore(blast-radius): drop codebase-memory graph tools from local allowlist` (cleanup)

- Edited: `.claude/settings.local.json` removes codebase-memory graph tool allowlist entries (`search_graph`, `query_graph`, `search_code`, `get_code_snippet`, `get_architecture`, `index_repository`, `index_status`, `list_projects`); keeps `manage_adr` and `delete_project` (still used by the ADR side).
- Edited: `docs/snowball/specs/2026-07-10-yactt-graph-backend-design.md` committed alongside PR 1.
- Behavior: no observable change. Paperwork pass that drops now-unused permissions.
- Rollback: re-add the allowlist entries.

### Cleanup horizon (post-rollout)

`SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory` remains valid until **both**:

1. The follow-up ADR MADR has shipped; `manage_adr` no longer routes through codebase-memory.
2. At least one minor release of snowball has run with yactt as default and observed parity.

When both conditions hold, a separate PR removes the codebase-memory client from `mcp-cli.ts`, tightens the selector to `{yactt|heuristic}`, and deletes `CBM_CLI_PATH` handling. That PR is **not** in scope for this design and is the cleanup horizon only.

## File structure summary

**Created:**

- `extensions/snowball/yactt-cli/cli.ts` — Deno shim.
- `extensions/snowball/yactt-cli/deno.json` — runtime config / tasks.
- `tests/blast-radius/yactt-cli/cli.test.ts` — Deno shim tests.
- `tests/blast-radius/yactt-cli/stub-server.ts` — Go or Deno stub MCP server for fixture data.
- `tests/blast-radius/compute.test.ts` — blast-radius contract tests.
- `tests/blast-radius/parity.test.ts` — bounded parity tests.
- `docs/snowball/specs/2026-07-10-yactt-graph-backend-design.md` — this spec.
- `tests/blast-radius/SMOKE.md` — operator smoke checklist.

**Edited:**

- `extensions/snowball/mcp/mcp.json` — add yactt entry.
- `skills/blast-radius/SKILL.md` — graph-backend paragraph.
- `skills/blast-radius/SCHEMA.md` — reason-code table + `backend_attempts` field.
- `skills/blast-radius/src/mcp-cli.ts` — selector resolver + yactt client factory.
- `skills/blast-radius/src/graph-backend.ts` — chained fallback.
- `skills/blast-radius/scripts/compute.cjs` — regenerated (`bash scripts/build-blast-radius.sh`).
- `skills/systematic-debugging/SKILL.md` — line 71 graph-backend callout.
- `skills/recalling-project-context/SKILL.md` — line 45 operator-tip on graph queries.
- `skills/brainstorming/SKILL.md` — line 200 reference.
- `skills/using-snowball/references/junie-tools.md` — Codebase-Memory-MCP bullet.
- `.claude/settings.local.json` — drop codebase-memory graph tool allowlist entries.
- `scripts/install.sh` — Junie / Junie-CLI install-pointer paragraphs.
- `README.md` — install section mentions yactt alongside codebase-memory.
- `RELEASE-NOTES.md` — per-release entries.

**Untouched (explicit):**

- `skills/recalling-project-context/src/recall-context.ts` and `scripts/recall-context.cjs` — only the SKILL.md text changes; ADR-side logic is unchanged.
- `skills/syncing-decisions-to-memory/`, including its scripts and tests.
- `tests/syncing-decisions-to-memory/CONTRACT.md`, `disk-cache.test.ts`.
- `tests/recalling-project-context/recall-context.test.ts`.
- `.codebase-memory/adr.md` and the `.codebase-memory/` directory's gitignore posture.
- `package.json` scripts that route MADR capture through `mcp__codebase-memory-mcp__manage_adr`.

## Smoke test (operator quick path)

After PR 2 lands, an operator can verify the rollout in 30 seconds:

```bash
# 1. Install yactt and snowball (one-time).
gh extension install kellenff/yactt          # or: marketplace / brew / ...

# 2. Run blast-radius against your own repo with the default backend.
echo '{"gitRoot":"'$(pwd)'","changeSet":{"paths":["skills/blast-radius/SKILL.md"],"proposedAction":""}}' \
  | deno run --allow-read --allow-net extensions/snowball/yactt-cli/cli.ts list-loaded-repos \
    --repo "$(pwd)"                            # confirms yactt is reachable

echo '<above-json>' | node skills/blast-radius/scripts/compute.cjs compute-and-persist
# Expect: status: success, backend: graph, backend_attempts: ["yactt"]

# 3. Run again with the codebase-memory fallback to prove it still works.
SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory \
  bash -c '<same command>'
# Expect: backend_attempts: ["codebase-memory"]

# 4. Run again with heuristic only.
SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic \
  bash -c '<same command>'
# Expect: backend: heuristic, status: success.

# 5. Run on a fresh checkout where neither backend is installed (e.g., CI).
unset SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND
<same command>
# Expect: backend: heuristic, status: degraded, reason: graph-unavailable, backend_attempts: ["yactt"]
```

## Risk register

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **R1.** yactt installation burden. New operators must install it (binary or marketplace plugin), separate from snowball. | Medium | Install hooks (PR 2) point operators at the yactt plugin in addition to snowball. README install section is updated in lockstep. |
| **R2.** Output-shape drift in yactt's tool surface across minor versions. | Medium | The `yactt-cli` Deno shim is the *only* place that holds output-shape knowledge — upstream changes are absorbed there, not in blast-radius. The plan's contract tests pin behavior at the shim boundary. |
| **R3.** Auto-fallback masks real yactt config bugs (operator never sees them — codebase-memory "saves" the run). | Medium | The single stderr line per fallback is the canary. The plan optionally suggests `BLAST_RADIUS_GRAPH_FALLBACK=0` for one release to verify first-attempt yactt success rate. |
| **R4.** `manage_adr` accidentally removed during PR 3 allowlist cleanup. | Low | PR 3 explicitly diff-checks the allowlist and tests `recalling-project-context` round-trip after the change. The reason-code schema and `manage_adr` mention in `recalling-project-context/SKILL.md` are untouched. |
| **R5.** yactt MCP doesn't expose the exact analog of `detect_changes(scope: "impact")`. | Medium | The plan refines the method-mapping table above during implementation. If no direct analog exists, the shim composes a yactt equivalent (e.g., fan-out via `references-for-symbol` + `search-symbols` over the diff). |
| **R6.** Parity test "bounded agreement" threshold (4) is wrong. | Low | If the bound is too tight, parity tests fail in CI — that's the *point* of the bound. If too lax, the suite passes for cases that would surprise operators in production; the plan should run parity sweeps against multiple real repos before locking the bound. |

## Open questions

None blocking the spec. The implementation plan refines these:

1. Exact yactt-tool-to-shim-subcommand mapping (provisional table in Components section).
2. Parity-test bound (currently `≤4`; tuned during implementation against real repos).
3. Whether `BLAST_RADIUS_GRAPH_FALLBACK=0` should be default for one release to flush yactt-first-attempt bugs — operator decision in the plan.

## Follow-up MADR

This design ends before the `manage_adr` cutover. A separate MADR will surface the ADR-storage replacement (most likely a simpler file-based store or a third-party MCP ADR server). Out of scope here. Once that MADR lands and the implementation ships, the codebase-memory graph path can be fully removed (see Cleanup horizon).
