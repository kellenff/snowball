---
name: syncing-decisions-to-memory
description: Use on demand to distill this repo's snowball decision logs (operator MADRs + filtered observations) into codebase-memory's project ADR via the manage_adr MCP tool. Owns the TRADEOFFS and PHILOSOPHY sections; leaves PURPOSE/STACK/ARCHITECTURE/PATTERNS untouched. Idempotent — a no-change re-run is a no-op.
---

# Syncing Decisions to codebase-memory

Project the snowball decision stream into codebase-memory's single project ADR. This is an on-demand projection: capture of the raw decisions is already automatic (the `decision-logging` hooks); this skill summarizes the accumulated logs into the ADR's prose sections.

## What this owns

- **Writes** the `TRADEOFFS` and `PHILOSOPHY` sections of the ADR. Re-running overwrites them.
- **Preserves** `PURPOSE`, `STACK`, `ARCHITECTURE`, `PATTERNS` verbatim. This skill never authors them.
- codebase-memory's parser only recognizes those 6 exact uppercase section names; everything else is dropped. Do not invent sections.

## Procedure

Run these steps in order. The deterministic work is done by `scripts/sync-decisions.cjs`; you (the agent) only resolve the project, call `manage_adr`, and synthesize prose.

1. **Resolve the repo root.** Run `git rev-parse --show-toplevel`. If it fails, stop — not a git repo.

2. **Resolve the codebase-memory project.** Call the `list_projects` MCP tool. Find the entry whose `root_path` equals the repo root from step 1; use its `name`. If none matches, STOP and tell the user: "This repo isn't indexed in codebase-memory yet — run `index_repository` first." Never reconstruct the project name by hand.

3. **Fetch the current ADR.** Call `manage_adr(project=<name>, mode="get")`. If it returns `status: "no_adr"` (or empty content), treat the ADR content as the empty string `""`.

4. **Prepare.** Pipe a JSON object to the prepare CLI:

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs prepare
   ```

   where `<json>` is `{"gitRoot": "<repo root>", "adrContent": "<current ADR content>"}`. Read the JSON result. Surface any `warnings` to the user.

5. **Branch on `action`:**
   - `noop` + `reason: "already-current"` → tell the user "ADR already current — no changes." STOP.
   - `noop` + `reason: "nothing-to-sync"` → tell the user "No qualifying decisions to sync." STOP.
   - `synthesize` → continue.

6. **Synthesize two sections** from the `brief` (its `madrs` and `observations`):
   - **TRADEOFFS**: for the notable decisions, what was chosen over what, and why. Group related decisions; don't just list them. Markdown prose/bullets, no section header line (the renderer adds `## TRADEOFFS`).
   - **PHILOSOPHY**: the recurring principles, constraints, and values that show up across decisions. Do NOT add a digest marker — the renderer does that.

7. **Render.** Pipe a JSON object to the render CLI:

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs render
   ```

   where `<json>` is `{"preserved": <prepare.preserved>, "tradeoffs": "<your TRADEOFFS prose>", "philosophy": "<your PHILOSOPHY prose>", "digest": "<prepare.digest>"}`. Capture stdout as the full ADR document.

8. **Write.** Call `manage_adr(project=<name>, mode="update", content=<rendered document>)` — one atomic write.

9. **Write disk cache.** After a successful `manage_adr(update)`, pipe the rendered document to the disk cache CLI:

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs write-cache
   ```

   where `<json>` is `{"gitRoot": "<repo root>", "content": "<rendered document from step 7>"}`. If this fails (permissions), report a warning — MCP write succeeded; tier-0 session-start may miss the cache until the next successful sync on this machine.

10. **Report.** Tell the user which sections were updated and echo any warnings from step 4.

## Notes

- Pass the prepare/render JSON via a tempfile if the content is large or has tricky quoting (`node ... prepare < /tmp/in.json`).
- `preserved` and `digest` from step 4 flow into step 7 unchanged — do not edit them.
- This skill is read-mostly on the codebase-memory side: one `get`, one conditional `update`.
