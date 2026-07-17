# Contract: local ADR disk cache

This skill writes the project ADR to `.snowball/adr.md` via `write-cache` and reads it back
with `read-adr` / `resolveAdrPath`. No external MCP ADR store is used.

## Load-bearing assumptions

1. **Full-document write + read are verbatim.** Whatever string `writeDiskCache` stores is returned
   exactly by `readAdrContent`, including HTML-comment digest markers.
2. **Canonical sections only.** `src/adr.ts` (`parseAdrSections`) keeps the six uppercase names
   `PURPOSE STACK ARCHITECTURE PATTERNS TRADEOFFS PHILOSOPHY`. Non-canonical headers are dropped
   when preparing/preserving — fold decision content into `TRADEOFFS` / `PHILOSOPHY`.
3. **Legacy fallback (one release).** If `.snowball/adr.md` is missing but
   `.codebase-memory/adr.md` exists, readers use the legacy path. Writers always create
   `.snowball/adr.md`.

## Verification

Unit coverage:

- `tests/syncing-decisions-to-memory/disk-cache.test.ts` — write path, overwrite, legacy fallback
- `tests/syncing-decisions-to-memory/adr.test.ts` — section parse/render + digest marker
- `tests/recalling-project-context/disk-cache-contract.test.ts` — sync write → recall excerpt round-trip

Manual smoke:

```bash
printf '{"gitRoot":"%s","content":"%s"}' "$PWD" "$(cat <<'EOF'
## PURPOSE

Smoke purpose.

## TRADEOFFS

Smoke tradeoffs.

## PHILOSOPHY

<!-- snowball-decisions-digest: deadbeefdeadbeef -->
Smoke philosophy.
EOF
)" | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs write-cache

printf '{"gitRoot":"%s"}' "$PWD" \
  | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs read-adr
```

Assert `path` ends with `.snowball/adr.md` and `content` matches the written document.
