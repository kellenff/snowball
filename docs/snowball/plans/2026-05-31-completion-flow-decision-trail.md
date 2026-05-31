# Decision Trail in the Feature-Completion Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weave two behaviors into the feature-completion flow so decision records are committed with their work and the codebase-memory ADR can be refreshed at completion.

**Architecture:** A prose-only edit to a single skill file, `skills/finishing-a-development-branch/SKILL.md`. A shared "commit decision records" sub-step is added to Step 5 and referenced by the three preserve options; a new Step 7 offers ADR derivation via `syncing-decisions-to-memory`, gated on that skill's presence. Doc tables/flags are updated to match.

**Tech Stack:** Markdown (a Claude Code skill). No code, no automated tests — `markdownlint-cli2` (via pre-commit) plus a read-through are the verification.

**Spec:** `docs/snowball/specs/2026-05-31-completion-flow-decision-trail-design.md`

---

## Conventions (read once)

- **One file changes:** `skills/finishing-a-development-branch/SKILL.md`. Do not renumber Steps 5/6 — Step 6 (Cleanup) is referenced by name inside Step 5, so renumbering would cascade. New work is added as a sub-step inside Step 5 and a new Step 7 after Step 6.
- **The before/after blocks below use 4-backtick fences** so the inner 3-backtick code fences display literally. When you paste into the file, use normal 3-backtick fences.
- **Verify each task** with `pre-commit run markdownlint-cli2 --files skills/finishing-a-development-branch/SKILL.md` and a read-through, then commit. `end-of-file-fixer`/`trailing-whitespace` may adjust the file on commit — re-`git add` and re-commit if so.

## File Structure

- `skills/finishing-a-development-branch/SKILL.md` — the only file touched. Sections affected: Overview (core principle line), Step 5 (new sub-step + per-option wiring), new Step 7 after Step 6, Quick Reference table, Red Flags.

---

## Task 1: Add the shared "commit decision records" sub-step and wire it into the four options

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (Step 5 region)

- [ ] **Step 1: Insert the shared sub-step at the top of Step 5**

Find:

````markdown
### Step 5: Execute Choice

#### Option 1: Merge Locally
````

Replace with:

````markdown
### Step 5: Execute Choice

**Preserve paths commit the decision trail first.** Options 1, 2, and 3 run the
`commit-decision-records` sub-step below before their disposition actions, so the records ride into
the merge/PR/branch. Option 4 (Discard) skips it.

**`commit-decision-records` sub-step:**

1. Check for uncommitted decision artifacts:

   ```bash
   git status --short docs/snowball/decisions/
   ```

2. Empty output → no-op, continue.
3. Otherwise commit them on the **current feature branch** (untracked `*.md` and/or a modified
   `observations.jsonl`):

   ```bash
   git add docs/snowball/decisions/
   git commit -m "docs: decision records for <feature-branch>"
   ```

This operationalizes the standing practice: decision records ride with the work they document.
**Detached HEAD + "keep as-is":** there is no named branch to commit onto — leave the records
uncommitted and say so in the report; do not create a dangling commit.

#### Option 1: Merge Locally
````

- [ ] **Step 2: Wire Option 1 (Merge) — commit records while on the feature branch, before checkout**

Find:

````markdown
#### Option 1: Merge Locally

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```
````

Replace with:

````markdown
#### Option 1: Merge Locally

Run the `commit-decision-records` sub-step **while still on `<feature-branch>`** (before the
checkout below), so the merge carries the records into the base branch.

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```
````

- [ ] **Step 3: Wire Option 2 (PR) — commit records before pushing**

Find:

````markdown
#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>
```
````

Replace with:

````markdown
#### Option 2: Push and Create PR

Run the `commit-decision-records` sub-step on `<feature-branch>` before pushing, so the records are
part of the PR.

```bash
# Push branch
git push -u origin <feature-branch>
```
````

- [ ] **Step 4: Wire Option 3 (Keep) — commit records on the branch**

Find:

````markdown
#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."
````

Replace with:

````markdown
#### Option 3: Keep As-Is

Run the `commit-decision-records` sub-step on the branch first.

Report: "Keeping branch <name>. Worktree preserved at <path>."
````

- [ ] **Step 5: Wire Option 4 (Discard) — explicit skip note**

Find:

````markdown
#### Option 4: Discard

**Confirm first:**
````

Replace with:

````markdown
#### Option 4: Discard

**Skip `commit-decision-records`.** The records are untracked, so `git branch -D` does not remove
them — they remain in the working tree on the base branch, available to handle manually. Nothing is
lost.

**Confirm first:**
````

- [ ] **Step 6: Verify**

Run: `pre-commit run markdownlint-cli2 --files skills/finishing-a-development-branch/SKILL.md`
Expected: PASS. Read through Step 5: each of Options 1–3 references the sub-step at the right point (Option 1 before `checkout`, Option 2 before `push`, Option 3 before the report), and Option 4 has the skip note.

- [ ] **Step 7: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat: commit decision records as part of the completion flow"
```

---

## Task 2: Add Step 7 (offer ADR derivation) and update the core-principle line

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (after Step 6; Overview)

- [ ] **Step 1: Insert Step 7 after Step 6, before Quick Reference**

Find:

````markdown
**Otherwise:** The host environment (harness) owns this workspace. Do NOT remove it. If your platform provides a workspace-exit tool, use it. Otherwise, leave the workspace in place.

## Quick Reference
````

Replace with:

````markdown
**Otherwise:** The host environment (harness) owns this workspace. Do NOT remove it. If your platform provides a workspace-exit tool, use it. Otherwise, leave the workspace in place.

### Step 7: Offer ADR Derivation

Runs only after a **preserve** disposition (Options 1–3, or detached Options 1–2), never after Discard.

**Availability gate** — only offer when the sync skill is installed:

```bash
[ -d skills/syncing-decisions-to-memory ]
```

If absent, say nothing and finish (no dangling offer).

If present, make a single offer:

> "Derive/update codebase-memory's ADR from the decision logs now? (runs `syncing-decisions-to-memory`)"

- **Yes** → invoke the `syncing-decisions-to-memory` skill via the Skill tool. It self-gates: if
  codebase-memory is unreachable or the repo isn't indexed, it stops with a clear message, so
  completion never breaks on a missing dependency.
- **No** → finish.

For a merge (Option 1) this runs while on `<base-branch>` with the records already merged in, so the
ADR reflects the integrated state.

## Quick Reference
````

- [ ] **Step 2: Update the Overview core-principle line**

Find:

````markdown
**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.
````

Replace with:

````markdown
**Core principle:** Verify tests → Detect environment → Present options → Execute choice (commit the decision trail on preserve paths) → Clean up → Offer ADR sync.
````

- [ ] **Step 3: Verify**

Run: `pre-commit run markdownlint-cli2 --files skills/finishing-a-development-branch/SKILL.md`
Expected: PASS. Read through: Step 7 sits after Step 6 and before Quick Reference; the gate and self-gating degradation are unambiguous; the Overview line reflects both new behaviors.

- [ ] **Step 4: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat: offer ADR derivation at completion"
```

---

## Task 3: Update Quick Reference and Red Flags

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (Quick Reference; Red Flags)

- [ ] **Step 1: Add a "Commit records" column to the Quick Reference table**

Find:

````markdown
| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| 4. Discard | - | - | - | yes (force) |
````

Replace with:

````markdown
| Option | Commit records | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|----------------|-------|------|---------------|----------------|
| 1. Merge locally | yes | yes | - | - | yes |
| 2. Create PR | yes | - | yes | yes | - |
| 3. Keep as-is | yes | - | - | yes | - |
| 4. Discard | no (skip) | - | - | - | yes (force) |

After any preserve disposition, Step 7 offers ADR derivation (when `syncing-decisions-to-memory` is installed).
````

- [ ] **Step 2: Add Red Flags entries**

Find:

````markdown
**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request
- Remove a worktree before confirming merge success
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree

**Always:**
- Verify tests before offering options
- Detect environment before presenting menu
- Present exactly 4 options (or 3 for detached HEAD)
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only
- `cd` to main repo root before worktree removal
- Run `git worktree prune` after removal
````

Replace with:

````markdown
**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request
- Remove a worktree before confirming merge success
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree
- Leave decision records uncommitted on a preserve path (merge/PR/keep) — they ride with the work
- Assume discarding loses decision records — they are untracked and survive on the base branch

**Always:**
- Verify tests before offering options
- Detect environment before presenting menu
- Present exactly 4 options (or 3 for detached HEAD)
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only
- `cd` to main repo root before worktree removal
- Run `git worktree prune` after removal
- Commit the decision trail before merging/pushing on preserve paths
- Offer ADR derivation after a preserve disposition when the sync skill is installed
````

- [ ] **Step 3: Verify**

Run: `pre-commit run markdownlint-cli2 --files skills/finishing-a-development-branch/SKILL.md`
Expected: PASS. Confirm the table renders (6 columns, header separator has 6 cells) and the Red Flags lists read cleanly.

- [ ] **Step 4: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "docs: quick-reference + red-flags for the decision trail"
```

---

## Self-Review

**Spec coverage:**
- Goal 1 (commit dangling records with the work) → Task 1 (sub-step + Options 1–3 wiring; Option 4 skip). ✓
- Goal 2 (offer ADR derivation) → Task 2 (Step 7). ✓
- Goal 3 (respect disposition semantics: merge ride-along, clean discard) → Task 1 Steps 2 & 5. ✓
- Goal 4 (silent degradation) → Task 2 availability gate + self-gating note. ✓
- Goal 5 (one edit point) → all tasks touch only `finishing-a-development-branch/SKILL.md`. ✓
- Detached-HEAD edge case → Task 1 Step 1 sub-step note + Task 2 Step 7 "detached Options 1–2". ✓
- No-dangling-records no-op → Task 1 Step 1 sub-step point 2. ✓
- Doc updates (Quick Reference, Red Flags) → Task 3. ✓
- Testing = markdownlint + read-through → every task's Verify step. ✓

**Placeholder scan:** No TBD/TODO; every edit shows exact before/after text. The `<feature-branch>`/`<base-branch>`/`<name>` tokens are the file's existing placeholder convention, not plan gaps. ✓

**Type consistency:** The sub-step is named `commit-decision-records` everywhere it is referenced (Task 1 Steps 1–4). The new section is "Step 7: Offer ADR Derivation" in both the insertion (Task 2) and the Overview line / Quick Reference references. Column header "Commit records" matches between table and prose. ✓
