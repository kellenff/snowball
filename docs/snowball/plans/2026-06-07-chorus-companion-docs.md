# Chorus Companion Docs Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring live repo documentation into alignment with the already-shipped chorus companion wiring in `skills/brainstorming/SKILL.md`.

**Architecture:** Five targeted prose edits across README, two argdown maps, the superseded M2 spec header, and RELEASE-NOTES. No code, no manifest bumps. Design spec (`docs/snowball/specs/2026-06-07-chorus-companion-design.md`) is already committed.

**Tech Stack:** Markdown, Argdown (`node skills/structured-argumentation/scripts/validate-argdown.cjs`)

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `README.md` | Modify | Ship chorus as v6.2.0 in fork changelog |
| `docs/design/snowball-process.argdown` | Modify | Live process map — chorus not M2 |
| `docs/design/snowball-process-steelman.argdown` | Modify | Steelman map — chorus not M2 |
| `docs/snowball/specs/2026-05-30-m2-brainstorm-companion-design.md` | Modify | Supersession header only |
| `RELEASE-NOTES.md` | Modify | v6.2.0 release entry at top |

**Pre-complete:** `docs/snowball/specs/2026-06-07-chorus-companion-design.md` (committed on branch).

---

### Task 1: README changelog row

**Files:**
- Modify: `README.md:74`

- [ ] **Step 1: Replace the in-progress row**

Find line 74:

```markdown
| in progress | chorus companion: brainstorming's second-model partner now delegates to the multi-model `chorus:chorus` skill, replacing the M2/MiniMax brain-jam |
```

Replace with:

```markdown
| v6.2.0 | chorus companion: brainstorming delegates to `chorus:chorus` for multi-model debate (replacing M2 brain-jam) |
```

- [ ] **Step 2: Verify v5.3.0 M2 row is untouched**

Run:

```bash
rg -n "v5.3.0.*M2 brain-jam" README.md
```

Expected: one match on the historical row (line ~71).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: mark chorus companion shipped in README changelog"
```

---

### Task 2: Process argdown map

**Files:**
- Modify: `docs/design/snowball-process.argdown:72`

- [ ] **Step 1: Update Scaled-Ceremony argument**

Find:

```argdown
[Scaled-Ceremony]: The gates scale to the work — a "design" can be a few sentences, worktrees fall back to the current dir, and argdown / M2 brain-jam / blast-radius are opt-in or self-gating sub-skills reached only when the work warrants them.
```

Replace `M2 brain-jam` with `chorus`:

```argdown
[Scaled-Ceremony]: The gates scale to the work — a "design" can be a few sentences, worktrees fall back to the current dir, and argdown / chorus / blast-radius are opt-in or self-gating sub-skills reached only when the work warrants them.
```

- [ ] **Step 2: Validate argdown**

Run:

```bash
node skills/structured-argumentation/scripts/validate-argdown.cjs docs/design/snowball-process.argdown
```

Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add docs/design/snowball-process.argdown
git commit -m "docs: replace M2 brain-jam with chorus in process argdown"
```

---

### Task 3: Steelman argdown map

**Files:**
- Modify: `docs/design/snowball-process-steelman.argdown:28`

- [ ] **Step 1: Update Scaled-Ceremony rebuttal**

Find:

```argdown
<Scaled-Ceremony>: The enforced gate is only "present a design + get approval" — explicitly a few sentences for simple work; worktrees fall back to cwd, argdown and the M2 jam and blast-radius are opt-in or self-gating, and user instructions outrank every skill, so the floor is one sentence the operator can lower further while still leaving a reviewable artifact.
```

Replace `the M2 jam` with `chorus`:

```argdown
<Scaled-Ceremony>: The enforced gate is only "present a design + get approval" — explicitly a few sentences for simple work; worktrees fall back to cwd, argdown and chorus and blast-radius are opt-in or self-gating, and user instructions outrank every skill, so the floor is one sentence the operator can lower further while still leaving a reviewable artifact.
```

- [ ] **Step 2: Validate argdown**

Run:

```bash
node skills/structured-argumentation/scripts/validate-argdown.cjs docs/design/snowball-process-steelman.argdown
```

Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add docs/design/snowball-process-steelman.argdown
git commit -m "docs: replace M2 jam with chorus in steelman argdown"
```

---

### Task 4: M2 spec supersession header

**Files:**
- Modify: `docs/snowball/specs/2026-05-30-m2-brainstorm-companion-design.md:1`

- [ ] **Step 1: Prepend supersession block**

Insert above `# M2 Brain-Jam Companion in Brainstorming`:

```markdown
> **Superseded** by [2026-06-07-chorus-companion-design.md](./2026-06-07-chorus-companion-design.md).
> Retained for historical context. The live companion is `chorus:chorus`.

```

Leave everything below the `#` title unchanged.

- [ ] **Step 2: Verify link resolves**

Run:

```bash
test -f docs/snowball/specs/2026-06-07-chorus-companion-design.md && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add docs/snowball/specs/2026-05-30-m2-brainstorm-companion-design.md
git commit -m "docs: supersede M2 brain-jam spec with chorus companion spec"
```

---

### Task 5: RELEASE-NOTES entry

**Files:**
- Modify: `RELEASE-NOTES.md:3` (insert before existing `## v6.0.0`)

- [ ] **Step 1: Add v6.2.0 section at top**

Insert immediately after `# Snowball Release Notes` and the blank line, before `## v6.0.0`:

```markdown
## v6.2.0 (2026-06-07)

Documentation release marking the **chorus companion** swap as shipped.

- **Brainstorming** — already delegates to `chorus:chorus` for multi-model debate on cross-cutting trade-offs (replaces M2 brain-jam). Degrades silently when the chorus skill is not installed.
- **Docs** — README changelog, argdown process maps, and the chorus companion design spec brought into alignment with the live skill wiring.

```

- [ ] **Step 2: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs: add v6.2.0 release notes for chorus companion swap"
```

---

### Task 6: Final verification

**Files:**
- Verify: all five modified files

- [ ] **Step 1: Stale-reference scan on live docs**

Run:

```bash
rg 'in progress.*chorus|M2 brain-jam|M2 jam' \
  README.md docs/design/snowball-process.argdown docs/design/snowball-process-steelman.argdown \
  skills/brainstorming/SKILL.md
```

Expected: no matches.

- [ ] **Step 2: Re-validate both argdown maps**

Run:

```bash
node skills/structured-argumentation/scripts/validate-argdown.cjs docs/design/snowball-process.argdown && \
node skills/structured-argumentation/scripts/validate-argdown.cjs docs/design/snowball-process-steelman.argdown
```

Expected: both exit 0.

- [ ] **Step 3: Confirm git log**

Run:

```bash
git log --oneline -6
```

Expected: five new commits from Tasks 1–5 (plus the pre-existing design-spec commit).
