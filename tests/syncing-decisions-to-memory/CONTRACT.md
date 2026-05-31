# Contract: codebase-memory ADR storage + parsing

This skill writes a full ADR document with `manage_adr(mode="update")` and reads it back with
`manage_adr(mode="get")`. The behavior the skill **depends on** (verified live 2026-05-31 against
codebase-memory at `/Users/kellen/lib/codebase-memory-mcp`):

1. **Full-content `update` + `get` are verbatim.** Whatever string you `update` comes back exactly
   from `get`, including HTML-comment markers. This is what makes the digest marker and the
   merge-a-slice round-trip work. **(This is the load-bearing assumption.)**
2. **`mode="sections"` (read) is a naive `##` header scan** (`adr_list_sections`) — it lists every
   `##` line, canonical or not. Do **not** rely on it to filter to canonical sections.

Separately, codebase-memory has a *canonical* section model — the 6 exact, case-sensitive names
`PURPOSE STACK ARCHITECTURE PATTERNS TRADEOFFS PHILOSOPHY` (`is_canonical_section`). That filtering
governs the **section-targeted update path** (`cbm_store_adr_update_sections`) and **content
validation** (`cbm_adr_validate_content`) — *not* full-document storage. A non-canonical header such
as `## DECISIONS` therefore **survives a full-content round-trip verbatim**, but is invisible to
codebase-memory's structured section model. That is why this skill folds decision content into the
canonical `TRADEOFFS` / `PHILOSOPHY` sections rather than inventing a `## DECISIONS` section: it
keeps the content inside the model codebase-memory actually structures.

`src/adr.ts` (`parseAdrSections`) mirrors the canonical-only rule for the skill's *own* internal use
(computing which structural sections to preserve and extracting the digest). `adr.test.ts` is the
fast golden-case proxy for that. This procedure re-verifies the load-bearing storage behavior against
the **live** server whenever codebase-memory is upgraded.

## Procedure (manual / CI, requires the codebase-memory MCP server)

Use a throwaway indexed project so no real ADR is clobbered — the cleanest path is to index a temp
repo, test, then `delete_project`:

1. Create a temp git repo with one source file; `index_repository(repo_path=<temp>, mode="fast")`.
   Note the returned `project` name.
2. `manage_adr(project=<temp>, mode="update", content=$DOC)` where `$DOC` is the output of:
   ```bash
   printf '{"preserved":{"PURPOSE":"P-marker","ARCHITECTURE":"A-marker"},"tradeoffs":"T-marker","philosophy":"PH-marker","digest":"0123456789abcdef"}' \
     | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs render
   ```
3. `manage_adr(project=<temp>, mode="get")`.
   **Assert (load-bearing):** the returned `content` equals `$DOC` byte-for-byte — every `*-marker`
   intact and the digest comment preserved inside PHILOSOPHY.
4. `manage_adr(project=<temp>, mode="sections", sections=["PURPOSE","ARCHITECTURE","TRADEOFFS","PHILOSOPHY"])`.
   **Assert:** the four canonical headers are listed.
5. Append `\n## DECISIONS\nshould-be-absorbed\n` to `$DOC`, `update`, then `get`.
   **Assert (informational):** the `## DECISIONS` text round-trips verbatim — codebase-memory does
   NOT strip it. (The skill still never writes such a section; this documents that full-content
   storage is verbatim, not canonical-filtered.)
6. `delete_project(project=<temp>)` and remove the temp repo.

If assertion 3 ever fails, the storage layer changed — re-examine the merge-a-slice approach and the
digest round-trip before shipping. If the canonical set changes, update `CANONICAL_SECTIONS` /
`parseAdrSections` and the `adr.test.ts` golden cases.

## Last live run

2026-05-31 — assertions 3 and 4 PASS; assertion 5 confirmed `## DECISIONS` survives verbatim
(full-content storage is not canonical-filtered). Skill behavior unaffected: it only ever writes the
canonical sections.
