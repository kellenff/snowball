# VTCode Tool-Policy Auto-Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `.vtcode/tool-policy.json`'s `approval_cache.prefixes` with `unified_search` so the agent is auto-approved for read-only searches (catalog item B6.1).

**Architecture:** A single config-file edit + a JSON shape test. No new code paths; the existing VTCode `tool-policy.json` schema is already in place. The change is bounded: one entry in one array.

**Tech Stack:** JSON, bun (tests).

**Depends on:** v6.6.0 VTCode adapter.

**Risk:** M — audit that no `unified_search` action mutates. The test verifies the prefix is present and the policy didn't regress.

---

## Task 1: Write the failing JSON shape test

**Files:**

- Create: `tests/vtcode/tool-policy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/vtcode/tool-policy.test.ts`:

```typescript
import { test, expect } from "bun:test";
import * as fs from "node:fs";

interface ToolPolicy {
  version: number;
  policies: Record<string, string>;
  approval_cache: {
    allowed: string[];
    prefixes: string[];
    regexes: string[];
  };
}

function loadPolicy(): ToolPolicy {
  const text = fs.readFileSync(".vtcode/tool-policy.json", "utf8");
  return JSON.parse(text) as ToolPolicy;
}

test(".vtcode/tool-policy.json declares v6.7.0 prefix auto-approval for unified_search", () => {
  const policy = loadPolicy();
  expect(policy.version).toBeGreaterThanOrEqual(1);
  expect(policy.approval_cache.prefixes).toContain("unified_search");
});

test("every available tool either has a policy entry or is allowed by prefix/regex", () => {
  const policy = loadPolicy();
  const cache = policy.approval_cache;
  const autoApproved = new Set<string>(cache.allowed);
  for (const prefix of cache.prefixes) autoApproved.add(prefix);
  for (const re of cache.regexes) {
    // Smoke: each regex must compile.
    new RegExp(re);
  }
  const declared = new Set(Object.keys(policy.policies));
  for (const tool of [
    "unified_search",
    "unified_file",
    "unified_exec",
    "apply_patch",
  ]) {
    expect(declared.has(tool) || autoApproved.has(tool)).toBe(true);
  }
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `cd tests/vtcode && bun test tool-policy.test.ts`
Expected: FAIL with "expected ... to contain 'unified_search'"

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/vtcode/tool-policy.test.ts
git commit -m "test(vtcode): assert unified_search is auto-approved via prefix cache"
```

---

## Task 2: Edit `.vtcode/tool-policy.json`

**Files:**

- Modify: `.vtcode/tool-policy.json`

- [ ] **Step 1: Add `unified_search` to `approval_cache.prefixes`**

Open `.vtcode/tool-policy.json`. Locate the `approval_cache` block:

```json
"approval_cache": {
  "allowed": [],
  "prefixes": [],
  "regexes": []
}
```

Change it to:

```json
"approval_cache": {
  "allowed": [],
  "prefixes": ["unified_search"],
  "regexes": []
}
```

- [ ] **Step 2: Validate JSON shape**

Run: `python3 -c "import json; json.load(open('.vtcode/tool-policy.json')); print('OK')"`
Expected: "OK"

- [ ] **Step 3: Run the test, confirm it passes**

Run: `cd tests/vtcode && bun test tool-policy.test.ts`
Expected: 2 passing

- [ ] **Step 4: Commit**

```bash
git add .vtcode/tool-policy.json
git commit -m "feat(vtcode): auto-approve unified_search via prefix cache (B6.1)"
```

---

## Task 3: Document the policy change

**Files:**

- Modify: `RELEASE-NOTES.md`
- Modify: `.vtcode/tool-policy.json` (top-level comment) — or add a sibling README

- [ ] **Step 1: Add a v6.7.0 release-notes entry**

Edit `RELEASE-NOTES.md`. Add a new section above v6.6.0:

```markdown
## v6.7.0

**VTCode tool-policy auto-approval (B6.1)**

- `.vtcode/tool-policy.json`'s `approval_cache.prefixes` now includes `unified_search`. Read-only searches no longer require per-call approval.
- A new `tests/vtcode/tool-policy.test.ts` regression test pins this contract.
```

- [ ] **Step 2: Update the policy file with a top-of-file note**

`.vtcode/tool-policy.json` is JSON without comments. Either:

- Add a sibling `tool-policy.README.md` documenting the rationale, OR
- Note the change in `README.md`'s VTCode row (preferred — keeps docs in one place).

Add to `README.md`'s VTCode row: ", unified_search auto-approved via prefix cache".

- [ ] **Step 3: Commit**

```bash
git add RELEASE-NOTES.md README.md
git commit -m "docs(vtcode): document unified_search auto-approval (B6.1)"
```

---

## Task 4: Full validation

- [ ] **Step 1: Run all vtcode tests**

Run: `cd tests/vtcode && bun test`
Expected: all tests pass.

- [ ] **Step 2: Run the validate-wiring script**

Run: `bash tests/vtcode/validate-wiring.sh`
Expected: "All VTCode wiring checks passed."

- [ ] **Step 3: Run pre-commit hooks**

Run: `pre-commit run --files .vtcode/tool-policy.json tests/vtcode/tool-policy.test.ts`
Expected: all hooks pass.

---

## Spec coverage check

| Spec item                                   | Plan task |
| ------------------------------------------- | --------- |
| B6.1 Auto-approve `unified_search` (prefix) | Tasks 1–4 |

## Self-review checklist

- [x] No `TBD` / `TODO` / "fill in later" placeholders.
- [x] All step code is real, runnable code.
- [x] File paths are absolute or repo-relative.
- [x] Commit messages are concrete and scoped.
- [x] TDD throughout: failing test → JSON edit → passing test → commit.
- [x] Risk = M noted in plan header; test asserts no policy regression on related tools.
