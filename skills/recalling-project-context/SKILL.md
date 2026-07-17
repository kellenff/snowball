---
name: recalling-project-context
description: Use at the start of a non-trivial snowball cycle to recover project rationale from the local ADR and on-disk decision logs. Skip for pure typo/formatting tasks. Self-gates when the ADR is absent — falls back to recent MADRs on disk. Optional structural context via yactt MCP when indexed.
---

# Recalling Project Context

Recover distilled rationale at the **start of a non-trivial snowball cycle** — before brainstorming, plan mode, or design work. This closes the decision spine's recall loop: decisions captured in prior cycles are readable here without grepping `docs/snowball/decisions/`.

**Cycle-start recall:** tier-0 passive excerpt is injected at session start via the bootstrap hook; tier-1 is this skill (disk ADR + scoped MADRs + staleness + optional yactt graph).

**Skip when:** the task is trivial (typo, formatting, one-line fix with no design tradeoffs).

## What this reads

- **Primary:** local project ADR at `.snowball/adr.md` (legacy fallback: `.codebase-memory/adr.md`) — TRADEOFFS, PHILOSOPHY, and optionally PURPOSE/ARCHITECTURE when present.
- **Point decisions:** recent MADRs under `docs/snowball/decisions/`, optionally scoped to a subsystem path or keyword.
- **Optional graph:** yactt MCP tools when the repo is indexed (`detect_changes`, `find_symbol`, `find_referencing_symbols`).

Session start may already inject a capped ADR excerpt from disk via the bootstrap hook. This skill adds scoped MADR filtering, staleness, and targeted graph queries.

## Procedure

Run in order. Deterministic prep uses `scripts/recall-context.cjs`; you orchestrate optional yactt MCP and synthesize the summary.

1. **Resolve repo root.** Run `git rev-parse --show-toplevel`. If it fails, stop — not a git repo.

2. **Derive scope (optional).** From the user's task, pick a path prefix or keyword when the work is subsystem-specific (e.g. `decision-logging`, `hooks/`). Omit for repo-wide context.

3. **Prepare disk context.** Pipe JSON to the prepare CLI:

   ```bash
   echo '<json>' | node skills/recalling-project-context/scripts/recall-context.cjs prepare
   ```

   where `<json>` is `{"gitRoot": "<repo root>", "scope": "<optional scope>"}`. Read the JSON result. Use `staleness`, `adrDigest`, and `currentDigest` from the JSON — do not recompute digest comparison by hand. Surface any `warnings`.

4. **Scoped graph query (optional).** When the task names specific files or symbols and yactt has the repo indexed:
   - Resolve project as `file://` URI of the repo root (must match a `list_projects` entry's `path`).
   - `detect_changes({ project, since: "<base>" })` or `find_symbol` / `find_referencing_symbols` for targeted structural context.
   - Do not dump the full graph — one or two focused queries only.
   - If yactt is unreachable or the repo is not indexed, continue without graph context — **do not block the task**.

5. **Synthesize recall** in ≤10 bullets covering:
   - Recurring principles (PHILOSOPHY)
   - Relevant tradeoffs and constraints (TRADEOFFS + scoped MADRs)
   - Structural context if PURPOSE/ARCHITECTURE exist
   - ADR staleness: report `prepare.staleness` (`current` / `stale` / `unknown`)
   - Pointers to full MADRs on disk for point-decision detail

6. **Report** the summary to the user before continuing design or implementation.

## Notes

- `.snowball/` is typically gitignored — ADR on disk is per-machine unless your team shares it another way. MADRs under `docs/snowball/decisions/` ride with the branch.
- Pass JSON via a tempfile when quoting is awkward (`node ... prepare < /tmp/in.json`).
- For contradiction checks during planning, cross-check the spec against ADR TRADEOFFS after recall.

## For maintainers

Shipped artifacts in `scripts/*.cjs` are bundled from `src/*.ts`. Edit source and rebuild:

```bash
bash scripts/build-recalling-project-context.sh
```
