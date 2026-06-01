---
name: blast-radius
description: Use at lifecycle gates to surface change-scope, failure-impact, and action-risk for a proposed change set. Self-gates on trivial work. Degrades to heuristic when codebase-memory graph is unavailable (Plan 1); graph backend ships in a later plan.
---

# Blast-Radius Analysis

Composite blast-radius analysis for Snowball lifecycle gates. Produces a **status envelope** (see `SCHEMA.md`) and an operator-facing render for the calling gate's lens preset.

**Skip when:** the task is trivial (typo, formatting, one-line fix with no design tradeoffs) — same self-gating as `recalling-project-context`.

**Explicit skip:** if the operator asks to skip for this step, honor it and call compute with `"explicitSkip": true` (records `reason: explicit-skip` for the audit hook in Plan 4).

## Procedure

1. **Resolve repo root.** `git rev-parse --show-toplevel`. Stop if not a git repo.

2. **Build `changeSet`.** Per gate:
   - **Design (brainstorming):** projected paths for each approach being presented.
   - **Pre-execution (Plan 2):** paths the step will touch + `proposedAction` command text if any.
   - **Completion (Plan 2):** actual diff paths (`gitRef` defaults to merge base / HEAD as appropriate).

3. **Compute and persist.** Pipe JSON to the CLI:

   ```bash
   echo '<json>' | node skills/blast-radius/scripts/compute.cjs compute-and-persist
   ```

   where `<json>` matches `ComputeInput` in `SCHEMA.md` (includes `gitRoot`, `preset`, `changeSet`).

4. **Render for the operator.** Pipe envelope + preset:

   ```bash
   echo '<json>' | node skills/blast-radius/scripts/compute.cjs render
   ```

   where `<json>` is `{"envelope": <from step 3>, "preset": "<design|pre-execution|completion>"}`.

5. **Report** the rendered markdown to the operator. At the **design** gate this is report-only (no gating authority). State the `backend` field honestly.

## Phase 1 notes

- **Graph backend:** not yet wired (Plan 3). Expect `degraded` + `reason: graph-unavailable` + `backend: heuristic` on every run until then.
- **Audit hook:** Plan 4 reads `.snowball/blast-radius/last.json` on operator approval / Stop — do not delete that file during the session.
- **Harness portability:** this skill file ships everywhere; the audit hook is CC + Cursor only (Plan 4).

## For maintainers

Edit `skills/blast-radius/src/*.ts`, then:

```bash
bash scripts/build-blast-radius.sh
```

Bundled with Bun; consumers invoke `node` against committed `scripts/compute.cjs`.
