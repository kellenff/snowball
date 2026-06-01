---
name: recalling-project-context
description: Use at session start or before non-trivial design work to recover project rationale from codebase-memory's ADR and on-disk snowball decision logs. Skip for pure typo/formatting tasks. Self-gates when codebase-memory is absent — falls back to recent MADRs on disk.
---

# Recalling Project Context

Recover distilled rationale before design or implementation work. This closes the decision spine's recall loop: decisions captured passively during prior sessions are readable here without grepping `docs/snowball/decisions/`.

**Skip when:** the task is trivial (typo, formatting, one-line fix with no design tradeoffs).

## What this reads

- **Primary:** codebase-memory project ADR via `manage_adr(mode="get")` — TRADEOFFS, PHILOSOPHY, and optionally PURPOSE/ARCHITECTURE when present.
- **Fallback:** `.codebase-memory/adr.md` on disk (same file MCP writes; may exist after a prior sync on this machine).
- **Point decisions:** recent MADRs under `docs/snowball/decisions/`, optionally scoped to a subsystem path or keyword.

Session start may already inject a capped ADR excerpt from disk via the bootstrap hook. This skill adds live MCP resolution, scoped MADR filtering, and targeted graph queries.

## Procedure

Run in order. Deterministic prep uses `scripts/recall-context.cjs`; you orchestrate MCP and synthesize the summary.

1. **Resolve repo root.** Run `git rev-parse --show-toplevel`. If it fails, stop — not a git repo.

2. **Derive scope (optional).** From the user's task, pick a path prefix or keyword when the work is subsystem-specific (e.g. `decision-logging`, `hooks/`). Omit for repo-wide context.

3. **Prepare disk context.** Pipe JSON to the prepare CLI:

   ```bash
   echo '<json>' | node skills/recalling-project-context/scripts/recall-context.cjs prepare
   ```

   where `<json>` is `{"gitRoot": "<repo root>", "scope": "<optional scope>"}`. Read the JSON result. Surface any `warnings`.

4. **Try live ADR via MCP (when available).**
   - Call `list_projects`. Find the entry whose `root_path` equals the repo root; use its `name`.
   - If a match exists, call `manage_adr(project=<name>, mode="get")`.
   - Prefer live ADR sections over disk `prepare.sections` when both exist (live is authoritative).
   - If MCP is unreachable or repo not indexed, continue with disk/MADR fallback from step 3 — **do not block the task**.

5. **Scoped graph query (optional).** When the task names specific files or symbols and the project is indexed:
   - `search_graph(query="<keyword>")` or `detect_changes(scope="<path prefix>")` for targeted structural context.
   - Do not dump the full graph — one or two focused queries only.

6. **Synthesize recall** in ≤10 bullets covering:
   - Recurring principles (PHILOSOPHY)
   - Relevant tradeoffs and constraints (TRADEOFFS + scoped MADRs)
   - Structural context if PURPOSE/ARCHITECTURE exist
   - ADR digest staleness: if `prepare.digest` or live ADR digest differs from recent commits under `docs/snowball/decisions/`, note that `syncing-decisions-to-memory` may be due
   - Pointers to full MADRs on disk for point-decision detail

7. **Report** the summary to the user before continuing design or implementation.

## Notes

- `.codebase-memory/` is typically gitignored — ADR on disk is per-machine unless your team commits it or always uses MCP at session start.
- Pass JSON via a tempfile when quoting is awkward (`node ... prepare < /tmp/in.json`).
- For contradiction checks during planning, cross-check the spec against ADR TRADEOFFS after recall.

## For maintainers

Shipped artifacts in `scripts/*.cjs` are bundled from `src/*.ts`. Edit source and rebuild:

```bash
bash scripts/build-recalling-project-context.sh
```

Bundled with Bun; consumers invoke `node` against committed `.cjs` files.
