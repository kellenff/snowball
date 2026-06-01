# Blast-Radius Plan 2 — Lifecycle Skill Integrations

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `snowball:blast-radius` into `writing-plans`, `executing-plans`, and `finishing-a-development-branch` per the spec lifecycle table — design preset at plan handoff, pre-execution preset per plan step, completion preset before merge/PR options.

**Architecture:** Documentation-only patches to three lifecycle `SKILL.md` files, mirroring the Plan 1 brainstorming integration pattern. No changes to `compute.cjs` internals. Contract tests assert each skill mentions the correct preset and gate behavior.

**Tech Stack:** Markdown; `bun:test` for integration contract tests; `pre-commit` markdownlint.

**Spec:** [`docs/snowball/specs/2026-05-31-blast-radius-analysis-design.md`](../specs/2026-05-31-blast-radius-analysis-design.md)

**Depends on:** Plan 1 (`feat/blast-radius-plan-1` / v6.0.0) — `snowball:blast-radius` skill, presets, and CLI must already exist.

**Out of scope (later plans):** graph MCP backend (Plan 3), audit hook (Plan 4).

---

## Verification approach

This plan modifies skill prose, not compute logic. Gates:

1. `cd tests/blast-radius && bun test lifecycle-integration.test.ts`
2. `pre-commit run markdownlint-cli2 --files` on each touched `SKILL.md`
3. Structural `rg` checks per task

---

## File structure

**Modified:**

- `skills/writing-plans/SKILL.md` — design preset before execution handoff
- `skills/executing-plans/SKILL.md` — pre-execution preset before each plan task
- `skills/finishing-a-development-branch/SKILL.md` — completion preset after tests, before options menu
- `skills/blast-radius/SKILL.md` — remove Plan 2 placeholder notes in procedure

**Created:**

- `tests/blast-radius/lifecycle-integration.test.ts`

---

### Task 1: `writing-plans` integration

**Files:**

- Modify: `skills/writing-plans/SKILL.md`

- [ ] **Step 1: Add blast-radius section before Execution Handoff**

Insert a new `## Blast-radius before handoff` section immediately before `## Execution Handoff` with the prose in the implementation (design preset, projected paths from plan File Structure, decomposition flag, report-only).

- [ ] **Step 2: Verify**

```bash
pre-commit run markdownlint-cli2 --files skills/writing-plans/SKILL.md
rg -n 'Blast-radius before handoff|snowball:blast-radius|design preset' skills/writing-plans/SKILL.md
```

- [ ] **Step 3: Commit**

```bash
git add skills/writing-plans/SKILL.md
git commit -m "feat(writing-plans): invoke blast-radius before execution handoff"
```

---

### Task 2: `executing-plans` integration

**Files:**

- Modify: `skills/executing-plans/SKILL.md`

- [ ] **Step 1: Add pre-execution blast-radius sub-step**

Extend `### Step 2: Execute Tasks` so each task loop includes blast-radius with `pre-execution` preset before following plan steps.

- [ ] **Step 2: Verify**

```bash
pre-commit run markdownlint-cli2 --files skills/executing-plans/SKILL.md
rg -n 'pre-execution|snowball:blast-radius|Operator confirmation' skills/executing-plans/SKILL.md
```

- [ ] **Step 3: Commit**

```bash
git add skills/executing-plans/SKILL.md
git commit -m "feat(executing-plans): blast-radius gate before each plan step"
```

---

### Task 3: `finishing-a-development-branch` integration

**Files:**

- Modify: `skills/finishing-a-development-branch/SKILL.md`

- [ ] **Step 1: Add completion blast-radius step**

Insert `### Step 1b: Blast-radius completion summary` after Step 1 (Verify Tests), before Step 2 (Detect Environment).

- [ ] **Step 2: Verify**

```bash
pre-commit run markdownlint-cli2 --files skills/finishing-a-development-branch/SKILL.md
rg -n 'completion preset|snowball:blast-radius|merge-base' skills/finishing-a-development-branch/SKILL.md
```

- [ ] **Step 3: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(finishing-a-development-branch): blast-radius completion summary"
```

---

### Task 4: Update `blast-radius` SKILL.md + contract tests

**Files:**

- Modify: `skills/blast-radius/SKILL.md`
- Create: `tests/blast-radius/lifecycle-integration.test.ts`

- [ ] **Step 1: Remove Plan 2 placeholder wording in procedure**

- [ ] **Step 2: Add lifecycle-integration.test.ts**

- [ ] **Step 3: Run tests**

```bash
cd tests/blast-radius && bun test lifecycle-integration.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add skills/blast-radius/SKILL.md tests/blast-radius/lifecycle-integration.test.ts
git commit -m "feat(blast-radius): lifecycle integration contract tests"
```

---

### Task 5: Plan 2 smoke + spec coverage

- [ ] **Step 1: Full blast-radius test suite**

```bash
cd tests/blast-radius && bun test
```

- [ ] **Step 2: Spec coverage checklist**

| Spec row | Task |
|---|---|
| `writing-plans` at plan completion | Task 1 |
| `executing-plans` before every step | Task 2 |
| `finishing-a-development-branch` before merge/PR | Task 3 |
| Integration patch smoke tests | Task 4 |
