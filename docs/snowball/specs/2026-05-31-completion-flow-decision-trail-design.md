# Decision Trail in the Feature-Completion Flow

**Date:** 2026-05-31
**Status:** Draft
**Scope:** `skills/finishing-a-development-branch/SKILL.md` only
**Depends on (optional):** `syncing-decisions-to-memory` skill + `codebase-memory` MCP (for the ADR step; degrades silently when absent)

## Problem

Snowball's decision-logging hooks emit decision records (`docs/snowball/decisions/*.md` + `observations.jsonl`) continuously and asynchronously — inline on `AskUserQuestion`/approval phrases, and on session end via `Stop`/`PreCompact`. Because they land out of band, the records pile up untracked and get swept into catch-all commits that mix unrelated work, and codebase-memory's ADR (which the new `syncing-decisions-to-memory` skill derives from those records) only updates when someone remembers to run the skill by hand.

The standing practice — *commit decision records as part of the work they document* (recorded in agent memory) — needs an operational home. The natural one is the **feature-completion flow**: the `finishing-a-development-branch` skill, the terminal step that `executing-plans` and `subagent-driven-development` both funnel into. Baking the two steps in there means every completion path picks them up from a single edit.

## Goals

1. When a feature is completed, **commit any dangling decision records + `observations.jsonl`** as part of the work — landing them where the work lands (into the merge, the PR, or the kept branch).
2. After the disposition, **offer** to derive/update codebase-memory's ADR by running `syncing-decisions-to-memory`.
3. Respect the disposition semantics: records ride into merge/PR, and `discard` is left clean.
4. Degrade silently when the ADR dependency (the sync skill / codebase-memory) isn't available.
5. One edit point: `skills/finishing-a-development-branch/SKILL.md`.

## Non-Goals

- **Auto-deriving the ADR.** Derivation is an LLM-synthesis run with a codebase-memory dependency — the reason the sync skill is on-demand, not a hook. It is offered, not automatic.
- **Editing `executing-plans` / `subagent-driven-development`.** They invoke the completion flow; the shared terminal is the only edit.
- **Rewriting history** to attribute already-committed catch-all records. Forward-only.
- **New automated tests.** Prose change to a skill (mirrors the m2-brainstorm-companion change).
- **Changing the decision-logging hooks** or the sync skill itself.

## Design

All changes are in `skills/finishing-a-development-branch/SKILL.md`. The flow's shape is unchanged: Verify tests → Detect environment → Determine base → Present options → Execute choice → Cleanup. Two behaviors are woven in.

### 1. Commit decision records (inside Step 5, Execute Choice)

A small shared sub-step, referenced by the three preserve options:

> **Commit dangling decision records.** Check for uncommitted items under `docs/snowball/decisions/` (untracked `*.md` and a modified `observations.jsonl`). If none, silent no-op. If present, `git add docs/snowball/decisions/` and commit with a message tying them to the work, e.g. `docs: decision records for <feature-branch>`.

Placement per option:

- **Option 1 (Merge locally):** run the sub-step **while still on the feature branch**, before the existing `git checkout <base>`. The subsequent `checkout base → merge` carries the records into base as part of the integrated history.
- **Option 2 (Create PR):** run the sub-step before the existing `git push`, so the records are part of the PR.
- **Option 3 (Keep as-is):** run the sub-step on the branch.
- **Option 4 (Discard):** skip. The records are untracked, so `git branch -D` does not remove them — they remain in the working tree on the base branch, available to handle manually. Nothing is lost.

### 2. Offer ADR derivation (new Step 7, after Step 6 Cleanup)

- Applies only on **preserve paths** (merge / keep / PR), never discard.
- **Availability gate:** offer only when `skills/syncing-decisions-to-memory/` exists. If absent, say nothing (no dangling offer — the Visual/M2 companion pattern).
- When present, make one offer: *"Derive/update codebase-memory's ADR from the decision logs now? (runs `syncing-decisions-to-memory`)"*. On yes, invoke the skill via the Skill tool; on no, finish.
- The sync skill self-gates: if codebase-memory is unreachable or the repo isn't indexed, it stops with a clear message, so the completion flow never breaks on a missing dependency.
- After-cleanup placement means that for a merge, derivation runs on `base` with the records already merged in, so the ADR reflects the integrated state.

### Edge cases

- **No dangling records:** record-commit no-ops; the ADR offer still applies (other sessions may have added decisions).
- **Detached HEAD (reduced 3-option flow):** the record-commit applies to "push as new branch + PR" (a branch exists to carry them); for "keep as-is" on a detached HEAD there is no named branch, so records are left uncommitted with a one-line note rather than creating a dangling commit. The ADR offer applies on the PR path.

### Documentation updates within the SKILL.md

- Extend the **Quick Reference** table to note which options commit decision records.
- Add a **Red Flag:** *"Never force-delete a branch (discard) assuming decision records are lost — they are untracked and survive on base; conversely, never leave records uncommitted on a preserve path."*

## Testing

Prose-only change to a skill — no code, no automated tests (mirrors the m2-brainstorm-companion change). Verification is an inline read-through confirming the woven steps are unambiguous, the per-option placement preserves the merge/PR ride-along and the clean discard, and the availability gate / self-gating degrade correctly.
