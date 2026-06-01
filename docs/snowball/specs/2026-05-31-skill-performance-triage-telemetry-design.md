# Skill-Performance Triage Telemetry (Stage 1) — Design

**Status:** Accepted (design) · **Date:** 2026-05-31 · **Harness scope:** Claude Code first, portable boundary

## Purpose

Snowball implements most of its functionality as markdown skills an LLM reads and follows; only a
small deterministic surface is Bun-bundled `.cjs` + hooks. The operator wants to know **which
markdown/LLM skills are expensive or flaky enough to justify rewriting as deterministic code** — a
*port decision*. This spec covers the first sub-project of that effort: a telemetry layer that
ranks skills as port candidates and emits OTel/Grafana-compatible metrics for conventional
observability tooling.

## The funnel reframe (why this is Stage 1, not the whole thing)

A second-model brain-jam (MiniMax-M2, transcript at
`.brainstorm/perf-telemetry-port-decision-20260531T224913.json`) reframed the project. Its
load-bearing conclusions:

1. **Token cost and portability are orthogonal.** Cost sets the *ROI* of a port; it never
   establishes *feasibility*. Feasibility is governed by **reducibility of the reasoning** — can the
   work be expressed as rules/lookup, or does it need a neural component?
2. **The decision-grade test is a "naive-alternative" probe, not telemetry.** For each candidate,
   build a cheap rule/retrieval alternative, run it and the LLM on the same input corpus, score
   parity, and **tag failures by category** (acceptable-divergence / genuine-gap / malformed-input /
   unfilterable-edge) rather than counting them.
3. **"Porting" is usually fast-path + LLM fallback, not replacement** — which collapses the parity
   threshold (often 70–80% is enough) and empties the high-cost/irreversible quadrant.

Consequence: the OTel/Grafana layer is the **mouth of a funnel, not the decision instrument**. It
ranks candidates by volume × cost × reliability; a separate Stage 2 harness actually decides. Because
telemetry is only triage, **per-skill attribution fidelity barely matters** — we need to know which
5–10 skills dominate, not exact spans.

## Decomposition

| Sub-project | Role | This spec |
|---|---|---|
| **Stage 1 — Triage telemetry** | Measure & rank candidates; emit metrics; produce `CandidateRecord`s | ✅ designed here |
| **Stage 2 — Reducibility harness** | Naive-alternative parity test + failure tagging + port-decision records | seam documented here; own spec/plan cycle next |

The two are built in sequence: Stage 1 is Stage 2's dependency **and** its corpus source. The only
thing crossing the boundary is the `CandidateRecord` (schema frozen below).

## Approaches considered

| | A — OTLP-native hooks | B — File-first capture + exporter | C — Offline transcript analyzer |
|---|---|---|---|
| Capture | live, in hot path | passive hook → JSONL → exporter | post-hoc read of CC transcripts |
| Hot-path cost | network emit per tool call | none | none |
| Liveness | live | near-live after export | snapshot per run |
| Backfill from history | no | no | **yes** |
| Blast-radius (graph backend) | 13 files, high, 5 sensitive `hooks/` | 15 files, high, 4 sensitive `hooks/` | **9 files, medium, 0 `hooks/`** |

**Chosen: C.** The funnel makes C the natural fit, not a compromise — Stage 2 needs a corpus of
*real historical invocations*, which **are** the transcript windows C reads. One offline pass over
`~/.claude/projects/**/*.jsonl` yields both the ranking and the `sample_windows` corpus. C is also
the structurally safest (zero `hooks/` touches — cannot destabilize the decision-spine or
blast-radius rails). B's standing capture is recorded as a future extension for ongoing monitoring;
it is **not** built now (YAGNI for a finite port-decision project). Snowball's philosophy is
preserved: the analyzer writes canonical JSON beside the repo and OTel/Grafana is a *projection*.

## Stage 1 design

### Capture & segmentation

`ClaudeCodeTranscriptReader` reads CC transcripts and yields normalized `Message` records (confirmed
schema: assistant messages carry `usage:{input_tokens, cache_creation_input_tokens,
cache_read_input_tokens, output_tokens}`; skill invocations appear as
`tool_use{name:"Skill", input:{skill:"..."}}`).

A **skill window** opens at a `Skill` tool_use (tagged with `input.skill`) and closes at the next
`Skill` tool_use, a fresh user turn (non-`tool_result` user message), or session end. Segmentation
is **flat**: a CC transcript carries no end-of-skill marker, so a nested sub-skill cannot be
distinguished from a sequential one — it is attributed as its own sibling window. The invoking
turn's tokens attribute to whichever window is open when the `Skill` call is made (the parent), and
messages before the first skill in a session are unattributed root work.

> **Why not stack/innermost?** An earlier draft proposed stack-based innermost attribution. There is
> no observable "skill returned" event in the transcript, so a stack has no reliable pop trigger.
> Flat segmentation is what the data actually supports; the fuzziness is acceptable because Stage 1
> only needs relative dominance, not exact spans.

**Documented approximations** (stamped on every `CandidateRecord` and stated in every render, never
hidden):
- `flat-segmentation-no-nesting` — nested skills become sequential sibling windows; a parent's
  post-child work is attributed to the child.
- `subagent-lumped` — subagent token usage lives in a separate transcript and is attributed as a
  lump to the dispatching window.
- A user-interrupted skill closes early.

These are acceptable for *triage ranking* — only relative dominance matters.

### Cost definition (the confounder, handled in the metric)

Per-message `input_tokens` includes the entire conversation prefix, so summing it across a window
conflates "what the skill cost" with "how deep in the session it ran" — a confounding variable baked
into the naive metric. Therefore:

> **Headline cost = `output_tokens + cache_creation_input_tokens`** — the marginal generation plus
> the new context the skill *caused* to be written.

`cache_read_input_tokens` and uncached `input_tokens` are amortized shared prefix; kept only as
secondary diagnostics (`billed_total`). This makes "expensive skill" mean *the skill*, not *its
position in a long session*. The dashboard cannot un-confound a bad metric — the definition does it.

### Signals & metric set (OTel metrics, Prometheus/Grafana-native)

All labeled by `skill`. Histograms so Grafana derives p50/p95/variance — this is how the chosen
cross-run variance signal is computed.

| Metric | Type | Meaning |
|---|---|---|
| `snowball_skill_marginal_tokens` | histogram | `output + cache_creation` per window — headline cost |
| `snowball_skill_total_tokens` | histogram | incl. input/cache_read — diagnostic |
| `snowball_skill_invocations_total` | counter | volume |
| `snowball_skill_tool_calls_total` | counter | denominator for rates |
| `snowball_skill_tool_errors_total` | counter | reliability proxy (`is_error` tool_results) |
| `snowball_skill_retries_total` | counter | reliability proxy (repeated near-identical tool_use in window) |

Latency/duration is **omitted** by choice (not a selected signal), though trivially available from
timestamps if revisited. Percentiles are also precomputed into each `CandidateRecord` so Stage 2 has
no backend dependency.

### Transport (both paths, JSON canonical)

- **Canonical (source of truth):** `.snowball/metrics/candidates.json` + `windows.jsonl`, beside the
  repo. Everything else is a projection.
- **Projection A — OTel:** if `OTEL_EXPORTER_OTLP_ENDPOINT` is set, push OTLP metrics
  (collector → Prometheus/Grafana, or Grafana Cloud OTLP).
- **Projection B — Grafana-without-a-collector:** otherwise write a Prometheus text-exposition file
  `.snowball/metrics/skills.prom` (textfile-collector scrape or direct import).

Analysis is offline, so each run emits a **snapshot** at analysis time; per-window timestamps in
`windows.jsonl` keep a future time-series backfill possible without redesign. The render states which
transport path was used.

### Candidate-ranking score (tunable knob)

Orders which skills earn the expensive Stage 2 test. Default:

```text
triage_score = invocation_count × marginal_tokens_p50 × (1 + tool_error_rate)
```

Volume × typical marginal cost (p50, outlier-resistant) amplified by unreliability. A *ranking*
heuristic, never a verdict. The scoring function is **injected** into the `Ranker` and is the
operator's policy to own — it encodes whether frequency, raw cost, or unreliability is weighted
hardest. To be written/confirmed by the operator at implementation time.

## Component architecture

Messy-small, pure-big, simple data between (per `boundaries.md`).

**Pure core (testable in isolation):**
- `SkillSegmenter`: `Message[] → SkillWindow[]` (stack-based windowing)
- `WindowMetrics`: `SkillWindow → {marginal_tokens, total_tokens, tool_calls, tool_errors, retries}`
- `Aggregator`: `SkillWindow[] → CandidateRecord[]` (p50/p95, rates, variance, `sample_windows`)
- `Ranker`: `CandidateRecord[] → Ranked[]` via injected scoring fn

**Messy edges (I/O only):**
- `TranscriptSource` interface → `ClaudeCodeTranscriptReader` (the only CC-coupled unit)
- `JsonExporter` (canonical), `OtlpMetricsExporter`, `PrometheusTextExporter`

**Surfaces:** `skills/measuring-skill-performance/SKILL.md` (operator-facing) + CLI
`scripts/skill-metrics.cjs` (`analyze` / `render` subcommands), bundled from
`skills/measuring-skill-performance/src/*.ts` via Bun — same pattern as blast-radius's `compute.cjs`.
Skill name is adjustable; Stage 2 will be a sibling skill.

## Seam contract — `CandidateRecord` (frozen for Stage 2)

```json
{
  "skill_name": "snowball:blast-radius",
  "invocation_count": 42,
  "tokens": {
    "marginal": { "total": 51234, "p50": 980, "p95": 3400 },
    "billed_total": { "p50": 18500, "p95": 42000 }
  },
  "reliability": { "tool_calls": 130, "tool_error_rate": 0.04, "retry_rate": 0.02 },
  "triage_score": 42806,
  "sample_windows": [
    { "session_id": "…", "started_at": "…", "message_span": [12, 28], "marginal_tokens": 980 }
  ],
  "approximations": ["nested-skill-innermost-attribution", "subagent-lumped"]
}
```

`sample_windows` double as Stage 2's input corpus — real historical invocations, no synthetic
inputs. `windows.jsonl` holds one record per window with the full per-window breakdown.

## Testing strategy

- **Pure core → fast collaboration/unit tests** against hand-built `Message[]` fixtures; no I/O.
- **`ClaudeCodeTranscriptReader` → one contract test** against a trimmed, committed real-transcript
  fixture (`tests/fixtures/`), proving the reader emits the `Message` values the core's tests stub —
  closing the stub↔contract gap.
- **Exporters → contract tests:** OTLP output validates against OTLP metric shape; Prometheus output
  parses as valid exposition format.
- **No end-to-end "analyze → check dashboard" integrated test.** Domain logic (segmentation,
  attribution, scoring) is proven by collaboration tests + the thin reader contract test.
- Fixture deliberately includes ≥2 skills, a nested skill, and a tool error (locking down the
  `is_error` shape).

## Degraded states (blast-radius envelope pattern)

Analyzer output carries `status: success|degraded|error`, `source`, `windowCount`, and a closed
`reason` enum: `transcript-unreadable`, `schema-drift`, `no-skill-invocations`, `otlp-unreachable`.

- Schema drift → affected windows dropped, `degraded`; render **names how many were skipped** (no
  silent truncation).
- OTLP unreachable → fall back to the Prometheus file, `degraded`; still writes canonical JSON.
- Every render states approximations, transport path, and dropped-window count. Evidence before
  assertions, end to end.

## Known limitations

- CC-transcript-coupled at the reader; mitigated by the `TranscriptSource` interface (Cursor/Codex
  readers added later without touching the core).
- Attribution is heuristic by design — adequate for triage, **not** for decision-grade claims (that
  is Stage 2's job).
- Snapshot-per-run, not live time-series (acceptable for a finite port-decision study; B is the
  future path if standing monitoring is wanted).

## Open decisions (carried to implementation)

- Final `triage_score` formula — operator writes/confirms (learning-mode contribution).
- Skill name (`measuring-skill-performance` proposed).
- Exact `is_error` tool_result shape — confirmed against an error-bearing fixture during planning.

## References

- Brain-jam transcript: `.brainstorm/perf-telemetry-port-decision-20260531T224913.json`
- Blast-radius envelopes (graph backend) computed at design time for A/B/C scope sizing.
- `boundaries.md`, `parse-do-not-validate.md`, `integrated-tests-are-a-scam.md` (operator standards).
