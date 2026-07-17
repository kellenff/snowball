---
name: blast-radius
description: Use at lifecycle gates to surface change-scope, failure-impact, and action-risk for a proposed change set. Self-gates on trivial work. Tries yactt graph first via HTTP MCP; degrades to git-diff heuristics when the graph is unavailable or the repo is not indexed.
---

# Blast-Radius Analysis

Composite blast-radius analysis for Snowball lifecycle gates. Produces a **status envelope** (see `SCHEMA.md`) and an operator-facing render for the calling gate's lens preset.

**Skip when:** the task is trivial (typo, formatting, one-line fix with no design tradeoffs) — same self-gating as `recalling-project-context`.

**Explicit skip:** if the operator asks to skip for this step, honor it and call compute with `"explicitSkip": true` (records `reason: explicit-skip` for the audit hook).

## Procedure

1. **Resolve repo root.** `git rev-parse --show-toplevel`. Stop if not a git repo.

2. **Build `changeSet`.** Per gate:
   - **Design (brainstorming, writing-plans):** projected paths for each approach or for all paths listed in the plan's file structure.
   - **Pre-execution (executing-plans):** paths the step will touch + `proposedAction` command text if any.
   - **Completion (finishing-a-development-branch):** actual diff via `gitRef` (merge base) plus optional explicit `paths`.

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

## Notes

- **Graph backend:** `compute.cjs` calls the yactt Streamable HTTP MCP (`list_projects`, `detect_changes`, `get_symbols_overview`, `find_referencing_symbols`). Expect `backend: graph` when the repo is indexed; `degraded` + `backend: heuristic` with reason `repo-not-indexed`, `graph-unavailable`, or `mcp-timeout` when not. Override endpoint with `YACTT_MCP_URL` (default `http://127.0.0.1:57812/mcp`); optional `YACTT_MCP_TOKEN` for bearer auth; set `BLAST_RADIUS_DISABLE_GRAPH=1` to skip graph attempts.
- **Audit hook:** `hooks/blast-radius-audit.sh` reads `.snowball/blast-radius/last.json` on operator approval / Stop and appends a `blast_radius_envelope` observation — do not delete that file during the session.
- **Harness portability:** this skill file ships everywhere; the audit hook ships on Claude Code + Cursor only (see `hooks/hooks.json` and `hooks/hooks-cursor.json`).

## For maintainers

Edit `skills/blast-radius/src/*.ts`, then:

```bash
bash scripts/build-blast-radius.sh
```

Bundled with Bun; consumers invoke `node` against committed `scripts/compute.cjs`.
