---
name: syncing-decisions-to-memory
description: Use on demand to distill this repo's snowball decision logs (operator MADRs + filtered observations) into the local project ADR at .snowball/adr.md. Owns the TRADEOFFS and PHILOSOPHY sections; leaves PURPOSE/STACK/ARCHITECTURE/PATTERNS untouched. Idempotent — a no-change re-run is a no-op.
---

# Syncing Decisions to Local ADR

Project the snowball decision stream into the on-disk project ADR (`.snowball/adr.md`). This is an on-demand projection: capture of the raw decisions is already automatic (the `decision-logging` hooks); this skill summarizes the accumulated logs into the ADR's prose sections.

## What this owns

- **Writes** the `TRADEOFFS` and `PHILOSOPHY` sections of the ADR. Re-running overwrites them.
- **Preserves** `PURPOSE`, `STACK`, `ARCHITECTURE`, `PATTERNS` verbatim. This skill never authors them — edit those sections in `.snowball/adr.md` manually when needed.
- The ADR parser only recognizes those 6 exact uppercase section names; everything else is dropped. Do not invent sections.

## Procedure

Run these steps in order. The deterministic work is done by `scripts/sync-decisions.cjs`; you (the agent) synthesize prose and write the cache.

1. **Resolve the repo root.** Run `git rev-parse --show-toplevel`. If it fails, stop — not a git repo.

2. **Read the current ADR from disk.** Prefer `.snowball/adr.md`; if missing, fall back to legacy `.codebase-memory/adr.md`. If neither exists, treat the ADR content as the empty string `""`.

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs read-adr
   ```

   where `<json>` is `{"gitRoot": "<repo root>"}`. Use the returned `content` field (empty string when no file).

3. **Prepare.** Pipe a JSON object to the prepare CLI:

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs prepare
   ```

   where `<json>` is `{"gitRoot": "<repo root>", "adrContent": "<current ADR content>"}`. Read the JSON result. Surface any `warnings` to the user.

4. **Branch on `action`:**
   - `noop` + `reason: "already-current"` → tell the user "ADR already current — no changes." STOP.
   - `noop` + `reason: "nothing-to-sync"` → tell the user "No qualifying decisions to sync." STOP.
   - `synthesize` → continue.

5. **Synthesize two sections** from the `brief` (its `madrs` and `observations`):
   - **TRADEOFFS**: for the notable decisions, what was chosen over what, and why. Group related decisions; don't just list them. Markdown prose/bullets, no section header line (the renderer adds `## TRADEOFFS`).
   - **PHILOSOPHY**: the recurring principles, constraints, and values that show up across decisions. Do NOT add a digest marker — the renderer does that.

6. **Render.** Pipe a JSON object to the render CLI:

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs render
   ```

   where `<json>` is `{"preserved": <prepare.preserved>, "tradeoffs": "<your TRADEOFFS prose>", "philosophy": "<your PHILOSOPHY prose>", "digest": "<prepare.digest>"}`. Capture stdout as the full ADR document.

7. **Write disk ADR.** Pipe the rendered document to the write-cache CLI (writes `.snowball/adr.md` only — no external MCP):

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs write-cache
   ```

   where `<json>` is `{"gitRoot": "<repo root>", "content": "<rendered document from step 6>"}`. If this fails (permissions), report the error and stop.

8. **Report.** Tell the user which sections were updated and echo any warnings from step 3.

## Notes

- Pass the prepare/render JSON via a tempfile if the content is large or has tricky quoting (`node ... prepare < /tmp/in.json`).
- `preserved` and `digest` from step 3 flow into step 6 unchanged — do not edit them.
- MADRs under `docs/snowball/decisions/` remain the durable source of truth; `.snowball/adr.md` is a derived per-machine cache (gitignored).
