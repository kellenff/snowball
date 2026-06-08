# Chorus Companion in Brainstorming

**Date:** 2026-06-07
**Status:** Accepted
**Scope:** Repo documentation consistency (skill wiring already shipped on `main`)
**Depends on (optional, external):** `chorus` plugin (`chorus:chorus` skill + `bin/chorus` CLI)
**Supersedes:** [2026-05-30-m2-brainstorm-companion-design.md](./2026-05-30-m2-brainstorm-companion-design.md)

## Problem

Snowball's brainstorming skill shipped an M2 brain-jam companion (v5.3.0) that delegated
to the external `m2-brainstorm:brain-jam` skill for a second-model perspective on
cross-cutting trade-offs. The separately-maintained `chorus` plugin now offers a
strictly better fit: multi-model round-robin debate across several providers, with an
optional Argdown critic that surfaces which arguments survive.

The skill wiring swap (`skills/brainstorming/SKILL.md` — Chorus Companion section,
checklist step, process-flow digraph) is already on `main`. What remains is repo
documentation that still describes M2 as the live companion or lists chorus as
"in progress."

## Goals

1. Mark chorus as **shipped** in the README changelog (new `v6.2.0` row; keep the
   historical `v5.3.0` M2 row intact).
2. Align the two argdown process maps with the live `snowball-process.md` prose
   (chorus, not M2 brain-jam).
3. Record this swap as the canonical design artifact (this file).
4. Point the superseded M2 spec at this file via a header; leave its body untouched.
5. Add a `RELEASE-NOTES.md` entry for `v6.2.0`.

## Non-Goals

- **Re-editing `skills/brainstorming/SKILL.md`.** Already rewired; this spec references
  it, does not re-spec it.
- **Re-editing `docs/design/snowball-process.md`.** Already describes chorus in the
  cross-cutting sub-skills section.
- **Updating historical specs** (`blast-radius`, `skill-metrics`, etc.) that mention M2
  in passing as context from when they were written.
- **GRFP plugin-cache edits** (`claudikins-grfp` readme-brain-jam → chorus). Lives
  outside this repo; fragile on plugin update.
- **Bundling or installing chorus.** Detection is skill-presence only; chorus owns
  its own CLI and API-key errors.
- **Extending the pattern to other skills** (e.g., `systematic-debugging`).
- **Manifest version bump.** Prose/doc-only change; README tracks feature versions
  independently of `package.json` / plugin manifests.
- **New automated tests.** Prose change; same bar as the original M2 companion spec.

## Decisions (locked during brainstorming, 2026-06-06)

| Decision | Outcome |
| --- | --- |
| How brainstorming reaches chorus | Invoke `chorus:chorus` skill (delegate-then-reclaim) |
| Availability detection | Skill presence only — no binary path check |
| M2 fate | Fully replace; no fallback |
| Historical M2 spec | Supersession header; body retained |
| Doc scope | Live docs + new spec + RELEASE-NOTES; historical cross-references untouched |

## Architecture

Unchanged from the M2 companion pattern — only the external dependency swapped:

```text
brainstorming (driver)
  ├─ Visual Companion offer (optional, session-level)
  ├─ Chorus Companion offer (optional, session-level; skill-presence gated)
  ├─ clarifying questions → approaches
  └─ at "Propose 2-3 approaches" (cross-cutting trade-offs stable):
        └─ OPTIONAL: delegate to chorus:chorus → read transcript → continue
```

Brainstorming stays the driver. Chorus is a sub-routine that returns angles. Failure
(missing skill, API key, CLI error) never blocks design progress.

## Concrete edits

### 1. `README.md`

Replace the `in progress` changelog row:

```markdown
| in progress | chorus companion: ... |
```

with:

```markdown
| v6.2.0 | chorus companion: brainstorming delegates to `chorus:chorus` for multi-model debate (replacing M2 brain-jam) |
```

Leave the `v5.3.0` M2 row unchanged.

### 2. `docs/design/snowball-process.argdown`

In `[Scaled-Ceremony]`, replace `M2 brain-jam` with `chorus`.

### 3. `docs/design/snowball-process-steelman.argdown`

In `<Scaled-Ceremony>`, replace `M2 jam` with `chorus`.

### 4. `docs/snowball/specs/2026-05-30-m2-brainstorm-companion-design.md`

Prepend above the `#` title:

```markdown
> **Superseded** by [2026-06-07-chorus-companion-design.md](./2026-06-07-chorus-companion-design.md).
> Retained for historical context. The live companion is `chorus:chorus`.
```

### 5. `RELEASE-NOTES.md`

New section at top:

```markdown
## v6.2.0 (2026-06-07)

Documentation release marking the **chorus companion** swap as shipped.

- **Brainstorming** — already delegates to `chorus:chorus` for multi-model debate
  on cross-cutting trade-offs (replaces M2 brain-jam). Degrades silently when the
  chorus skill is not installed.
- **Docs** — README changelog, argdown process maps, and this spec brought into
  alignment with the live skill wiring.
```

## Error handling

No runtime changes. Documentation-only pass.

## Testing

1. **Read-through** — confirm README row, supersession link, and RELEASE-NOTES entry
   are accurate and internally consistent.
2. **Argdown validation** — run `structured-argumentation` validator on both updated
   `.argdown` maps; both must parse clean.
3. **Stale-reference scan** — `rg 'in progress.*chorus|M2 brain-jam|M2 jam'` over
   live docs (`README.md`, `docs/design/*.argdown`, `skills/brainstorming/SKILL.md`)
   should return zero hits after implementation (historical `docs/snowball/specs/` and
   `docs/snowball/decisions/` excluded).

## Open questions

None. All decisions resolved during brainstorming.
