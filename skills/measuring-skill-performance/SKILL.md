---
name: measuring-skill-performance
description: Use to rank snowball skills as port candidates by token cost and reliability from Claude Code transcripts. Stage 1 of the markdown/LLM port-decision funnel — triage telemetry only.
---

# Measuring Skill Performance (Triage Telemetry)

Offline analyzer that reads Claude Code transcripts, segments per-skill execution
windows, and ranks skills as port candidates by `invocations × marginal-token-cost
× (1 + tool-error-rate)`. Canonical records land in `.snowball/metrics/`.

This is **Stage 1** — triage only. It ranks which skills deserve the expensive Stage 2
reducibility test; it does not decide ports. Attribution is deliberately coarse (flat
window segmentation; subagent tokens lumped to the dispatching window).

## Procedure

1. Resolve repo root: `git rev-parse --show-toplevel`.
2. Collect transcript paths (default: `~/.claude/projects/<encoded-repo>/*.jsonl`).
3. Analyze:

   ```bash
   echo '{"transcriptPaths": ["…"], "gitRoot": "<root>"}' \
     | node skills/measuring-skill-performance/scripts/skill-metrics.cjs analyze
   ```

   Set `"emit": false` in the JSON when you only want stdout and must not write
   `.snowball/metrics/`.

4. Read the JSON envelope on stdout. Candidates are pre-ranked by `triage_score`.
   Report top candidates with `invocation_count`, marginal token stats, reliability,
   and each record's `approximations`.

5. State `status`, `transport`, `windowCount`, `droppedWindowCount`, and
   `approximations` honestly — they are part of the contract.

## Transport

- **Shipped (Plan A):** canonical JSON at `.snowball/metrics/candidates.json` plus
  `windows.jsonl` (source of truth). Envelope `transport` is `json-only`.
- **Planned (Plan B):** OTLP/HTTP push when `OTEL_EXPORTER_OTLP_ENDPOINT` is set;
  otherwise Prometheus text at `.snowball/metrics/skills.prom`, plus a `render`
  subcommand for an operator table.

## Seam to Stage 2

Each `CandidateRecord.sample_windows` references real historical invocations — those
double as Stage 2's parity-test corpus. Field definitions live in `src/types.ts`.

## For maintainers

Edit `src/*.ts`, then:

```bash
bash scripts/build-measuring-skill-performance.sh
```

Run tests: `cd tests/measuring-skill-performance && bun test`.
