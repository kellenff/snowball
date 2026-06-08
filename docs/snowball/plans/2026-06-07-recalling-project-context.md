# Recalling Project Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the decision-spine recall loop with cycle-start recall, staleness in `prepare`, snowball-owned disk cache after sync, and B-bar dogfood verification.

**Architecture:** Extend the existing recall pure core (`recall-context.ts`) with a tested `computeStaleness` helper and wire it through `prepare` + `renderExcerptForHook`. Add `writeDiskCache` to the sync pure core with a new CLI subcommand the agent calls after `manage_adr(update)`. Prose-only updates to forward-spine skills and process docs make cycle-start recall explicit. Dogfood steps run after all tests pass.

**Tech Stack:** TypeScript bundled with `bun build --target=node --format=cjs` (existing pipelines), `bun:test`, reuse of sync `gather`/`filter`/`digest`/`adr` modules from recall tests.

**Spec:** `docs/snowball/specs/2026-06-07-recalling-project-context-design.md`

---

## Conventions (read once before starting)

- **Pre-commit auto-fixers** may rewrite staged files and abort the commit. Re-run `git add` + `git commit` when that happens.
- **Run recall tests:** `cd tests/recalling-project-context && bun test`
- **Run sync tests:** `cd tests/syncing-decisions-to-memory && bun test`
- **Rebuild bundles after TS edits:** `bash scripts/build-recalling-project-context.sh` and `bash scripts/build-syncing-decisions-to-memory.sh`
- **ADR cross-check:** passive before proactive — recall surfaces staleness only; never auto-invokes sync. Records ride with their work — dogfood commits include decision MADRs.

## File Structure

**Recall pure core (extend):**
- `skills/recalling-project-context/src/staleness.ts` — `computeStaleness(adrDigest, currentDigest)`
- `skills/recalling-project-context/src/recall-context.ts` — extend `PrepareOutput`, wire staleness into all `prepare` branches + `renderExcerptForHook`
- `skills/recalling-project-context/scripts/recall-context.cjs` — rebuilt bundle

**Sync pure core (extend):**
- `skills/syncing-decisions-to-memory/src/disk-cache.ts` — `writeDiskCache(gitRoot, content)` atomic write
- `skills/syncing-decisions-to-memory/src/sync-decisions.ts` — add `write-cache` CLI subcommand
- `skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs` — rebuilt bundle

**Agent shells + docs:**
- `skills/recalling-project-context/SKILL.md` — cycle-start framing, `prepare.staleness`
- `skills/syncing-decisions-to-memory/SKILL.md` — disk cache step after MCP update
- `skills/using-snowball/SKILL.md` — cycle-start gate prose
- `skills/brainstorming/SKILL.md` — step 1 prior-cycle wording
- `docs/design/snowball-process.md` — recall → forward spine entry
- `README.md` — diagram + shipped status (Task 7, after dogfood)

**Tests:**
- `tests/recalling-project-context/staleness.test.ts` — new
- `tests/recalling-project-context/recall-context.test.ts` — extend
- `tests/syncing-decisions-to-memory/disk-cache.test.ts` — new
- `tests/recalling-project-context/disk-cache-contract.test.ts` — cross-skill contract

---

## Task 1: `computeStaleness` pure helper

**Files:**
- Create: `skills/recalling-project-context/src/staleness.ts`
- Create: `tests/recalling-project-context/staleness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/recalling-project-context/staleness.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { computeStaleness } from "../../skills/recalling-project-context/src/staleness";

test("computeStaleness returns unknown when adrDigest is null", () => {
  expect(computeStaleness(null, "abc123")).toBe("unknown");
});

test("computeStaleness returns current when digests match", () => {
  expect(computeStaleness("abc123", "abc123")).toBe("current");
});

test("computeStaleness returns stale when digests differ", () => {
  expect(computeStaleness("abc123", "def456")).toBe("stale");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/recalling-project-context && bun test staleness.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `skills/recalling-project-context/src/staleness.ts`:

```typescript
export type Staleness = "current" | "stale" | "unknown";

export function computeStaleness(
  adrDigest: string | null,
  currentDigest: string,
): Staleness {
  if (!adrDigest) return "unknown";
  return adrDigest === currentDigest ? "current" : "stale";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/recalling-project-context && bun test staleness.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add skills/recalling-project-context/src/staleness.ts tests/recalling-project-context/staleness.test.ts
git commit -m "feat(recall): add computeStaleness pure helper"
```

---

## Task 2: Wire staleness into `prepare`

**Files:**
- Modify: `skills/recalling-project-context/src/recall-context.ts`
- Modify: `tests/recalling-project-context/recall-context.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/recalling-project-context/recall-context.test.ts`:

```typescript
import { digestMarker } from "../../skills/syncing-decisions-to-memory/src/adr";
import { computeDigest } from "../../skills/syncing-decisions-to-memory/src/digest";
import { gatherDecisions } from "../../skills/syncing-decisions-to-memory/src/gather";
import { filterRecords } from "../../skills/syncing-decisions-to-memory/src/filter";

test("prepare reports staleness current when ADR digest matches decisions", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-06-07T1200-a.md",
      madrFixture({ title: "Recall loop", status: "accepted", body: "Cycle-start recall." }),
    );
    const filtered = filterRecords(gatherDecisions(repo));
    const digest = computeDigest(filtered);
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nPassive capture.\n\n${digestMarker(digest)}`,
    );

    const out = prepare({ gitRoot: repo });
    expect(out.staleness).toBe("current");
    expect(out.adrDigest).toBe(digest);
    expect(out.currentDigest).toBe(digest);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare reports staleness stale when decisions changed after sync", () => {
  const repo = makeTempRepo();
  try {
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nOld rationale.\n\n${digestMarker("deadbeefdeadbeef")}`,
    );
    writeDecisionFile(
      repo,
      "2026-06-07T1201-b.md",
      madrFixture({ title: "New decision", status: "accepted", body: "After sync." }),
    );

    const out = prepare({ gitRoot: repo });
    expect(out.staleness).toBe("stale");
    expect(out.adrDigest).toBe("deadbeefdeadbeef");
    expect(out.currentDigest).not.toBe("deadbeefdeadbeef");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare reports staleness unknown for madrs-only source", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-06-07T1202-c.md",
      madrFixture({ title: "No ADR yet", status: "accepted" }),
    );
    const out = prepare({ gitRoot: repo });
    expect(out.source).toBe("madrs-only");
    expect(out.staleness).toBe("unknown");
    expect(out.adrDigest).toBeNull();
  } finally {
    cleanupTempRepo(repo);
  }
});
```

Add the new imports at the top of the test file alongside existing imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/recalling-project-context && bun test recall-context.test.ts`
Expected: FAIL — `out.staleness` undefined

- [ ] **Step 3: Extend `PrepareOutput` and `prepare`**

In `skills/recalling-project-context/src/recall-context.ts`, add imports:

```typescript
import { gatherDecisions } from "../../syncing-decisions-to-memory/src/gather";
import { filterRecords } from "../../syncing-decisions-to-memory/src/filter";
import { computeDigest } from "../../skills/syncing-decisions-to-memory/src/digest";
import { extractDigest } from "../../syncing-decisions-to-memory/src/adr";
import { computeStaleness, type Staleness } from "./staleness";
```

Fix the digest import path — use `../../syncing-decisions-to-memory/src/digest` (no `skills/` prefix).

Extend `PrepareOutput`:

```typescript
export interface PrepareOutput {
  source: "adr-file" | "madrs-only" | "empty";
  adrPath: string | null;
  digest: string | null;
  adrDigest: string | null;
  currentDigest: string;
  staleness: Staleness;
  sections: Record<string, string>;
  sectionsTruncated: string[];
  madrs: Array<{ filename: string; title: string; status: string; excerpt: string }>;
  scope: string | null;
  warnings: string[];
}
```

Add helper inside the file:

```typescript
function stalenessFields(
  gitRoot: string,
  adrContent: string | null,
): Pick<PrepareOutput, "adrDigest" | "currentDigest" | "staleness" | "digest"> {
  const filtered = filterRecords(gatherDecisions(gitRoot));
  const currentDigest = computeDigest(filtered);
  const adrDigest = adrContent ? extractDigest(adrContent) : null;
  return {
    adrDigest,
    currentDigest,
    staleness: computeStaleness(adrDigest, currentDigest),
    digest: adrDigest,
  };
}
```

Update every `return` in `prepare` to spread `...stalenessFields(input.gitRoot, adrContentOrNull)`:

- `empty` branch: `adrContentOrNull = null`
- `madrs-only` branch: `adrContentOrNull = null`
- `adr-file` branch: pass `adrContent`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tests/recalling-project-context && bun test`
Expected: PASS (all tests including existing 3 + new 3)

- [ ] **Step 5: Commit**

```bash
git add skills/recalling-project-context/src/recall-context.ts tests/recalling-project-context/recall-context.test.ts
git commit -m "feat(recall): wire staleness into prepare output"
```

---

## Task 3: Staleness lines in `renderExcerptForHook`

**Files:**
- Modify: `skills/recalling-project-context/src/recall-context.ts`
- Modify: `tests/recalling-project-context/recall-context.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `recall-context.test.ts`:

```typescript
test("renderExcerptForHook surfaces stale ADR warning", () => {
  const repo = makeTempRepo();
  try {
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nStale.\n\n${digestMarker("deadbeefdeadbeef")}`,
    );
    writeDecisionFile(
      repo,
      "2026-06-07T1300-d.md",
      madrFixture({ title: "Newer", status: "accepted" }),
    );
    const text = renderExcerptForHook({ gitRoot: repo });
    expect(text).toContain("ADR may be stale");
    expect(text).toContain("syncing-decisions-to-memory");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("renderExcerptForHook surfaces current ADR line", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-06-07T1301-e.md",
      madrFixture({ title: "Synced", status: "accepted", body: "In sync." }),
    );
    const filtered = filterRecords(gatherDecisions(repo));
    const digest = computeDigest(filtered);
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nCurrent.\n\n${digestMarker(digest)}`,
    );
    const text = renderExcerptForHook({ gitRoot: repo });
    expect(text).toContain("ADR is current");
    expect(text).toContain(digest);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/recalling-project-context && bun test recall-context.test.ts`
Expected: FAIL — excerpt missing "ADR may be stale"

- [ ] **Step 3: Update `renderExcerptForHook`**

Replace the block that starts with `if (out.digest)` through the `madrs-only` branch with:

```typescript
  if (out.staleness === "current" && out.adrDigest) {
    lines.push(`ADR is current (digest: ${out.adrDigest}).`);
    lines.push("");
  } else if (out.staleness === "stale") {
    lines.push("ADR may be stale — run syncing-decisions-to-memory to refresh.");
    if (out.adrDigest) {
      lines.push(`Last synced digest: ${out.adrDigest}; current decisions digest: ${out.currentDigest}.`);
    }
    lines.push("");
  } else if (out.source === "madrs-only") {
    lines.push(
      "No local ADR file — showing recent on-disk MADRs only.",
      "Run syncing-decisions-to-memory after finish to populate .codebase-memory/adr.md.",
    );
    lines.push("");
  } else if (out.digest) {
    lines.push(`ADR last synced from decision logs: ${out.digest}`);
    lines.push(
      "Re-run syncing-decisions-to-memory if new decisions were merged since this digest.",
    );
    lines.push("");
  }
```

- [ ] **Step 4: Run tests**

Run: `cd tests/recalling-project-context && bun test`
Expected: PASS

- [ ] **Step 5: Rebuild recall bundle**

Run: `bash scripts/build-recalling-project-context.sh`
Expected: `built 1 bundle(s)`

- [ ] **Step 6: Commit**

```bash
git add skills/recalling-project-context/src/recall-context.ts skills/recalling-project-context/scripts/recall-context.cjs tests/recalling-project-context/recall-context.test.ts
git commit -m "feat(recall): surface staleness in session-start excerpt"
```

---

## Task 4: `writeDiskCache` in sync skill

**Files:**
- Create: `skills/syncing-decisions-to-memory/src/disk-cache.ts`
- Modify: `skills/syncing-decisions-to-memory/src/sync-decisions.ts`
- Create: `tests/syncing-decisions-to-memory/disk-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/syncing-decisions-to-memory/disk-cache.test.ts`:

```typescript
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeDiskCache, diskCachePath } from "../../skills/syncing-decisions-to-memory/src/disk-cache";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

test("writeDiskCache creates .codebase-memory/adr.md", () => {
  const repo = makeTempRepo();
  try {
    const content = "## PHILOSOPHY\n\nCached ADR.\n";
    writeDiskCache(repo, content);
    const p = diskCachePath(repo);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, "utf8")).toBe(content);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("writeDiskCache overwrites existing cache", () => {
  const repo = makeTempRepo();
  try {
    writeDiskCache(repo, "v1");
    writeDiskCache(repo, "v2");
    expect(fs.readFileSync(diskCachePath(repo), "utf8")).toBe("v2");
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/syncing-decisions-to-memory && bun test disk-cache.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `disk-cache.ts`**

Create `skills/syncing-decisions-to-memory/src/disk-cache.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

export function diskCachePath(gitRoot: string): string {
  return path.join(gitRoot, ".codebase-memory", "adr.md");
}

export function writeDiskCache(gitRoot: string, content: string): void {
  const target = diskCachePath(gitRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, target);
}
```

- [ ] **Step 4: Add `write-cache` CLI subcommand**

In `skills/syncing-decisions-to-memory/src/sync-decisions.ts`, add import:

```typescript
import { writeDiskCache } from "./disk-cache";
```

Add interface before the CLI block:

```typescript
export interface WriteCacheInput {
  gitRoot: string;
  content: string;
}

export function writeCache(input: WriteCacheInput): void {
  writeDiskCache(input.gitRoot, input.content);
}
```

In the `require.main` CLI handler, add branch:

```typescript
      } else if (sub === "write-cache") {
        writeCache(JSON.parse(raw) as WriteCacheInput);
      } else {
        process.stderr.write(
          `unknown subcommand: ${String(sub)} (expected 'prepare', 'render', or 'write-cache')\n`,
        );
```

Update the CLI comment at top of file to list `write-cache`.

- [ ] **Step 5: Run tests**

Run: `cd tests/syncing-decisions-to-memory && bun test disk-cache.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 6: Rebuild sync bundle**

Run: `bash scripts/build-syncing-decisions-to-memory.sh`

- [ ] **Step 7: Commit**

```bash
git add skills/syncing-decisions-to-memory/src/disk-cache.ts skills/syncing-decisions-to-memory/src/sync-decisions.ts skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs tests/syncing-decisions-to-memory/disk-cache.test.ts
git commit -m "feat(sync): add writeDiskCache and write-cache CLI"
```

---

## Task 5: Cross-skill contract test (disk → excerpt)

**Files:**
- Create: `tests/recalling-project-context/disk-cache-contract.test.ts`

- [ ] **Step 1: Write the contract test**

Create `tests/recalling-project-context/disk-cache-contract.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { renderAdr } from "../../skills/syncing-decisions-to-memory/src/adr";
import { writeDiskCache } from "../../skills/syncing-decisions-to-memory/src/disk-cache";
import { renderExcerptForHook } from "../../skills/recalling-project-context/src/recall-context";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

test("sync disk cache is readable by recall excerpt hook", () => {
  const repo = makeTempRepo();
  try {
    const doc = renderAdr({
      preserved: {},
      tradeoffs: "Prefer passive hooks over active logging.",
      philosophy: "Capture is a side effect of working.",
      digest: "abc123def4567890",
    });
    writeDiskCache(repo, doc);
    const excerpt = renderExcerptForHook({ gitRoot: repo });
    expect(excerpt).toContain("<project-memory>");
    expect(excerpt).toContain("passive hooks");
    expect(excerpt).toContain("side effect");
    expect(excerpt).toContain("abc123def4567890");
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run test**

Run: `cd tests/recalling-project-context && bun test disk-cache-contract.test.ts`
Expected: PASS

- [ ] **Step 3: Run full recall + sync test suites**

Run: `cd tests/recalling-project-context && bun test && cd ../syncing-decisions-to-memory && bun test`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add tests/recalling-project-context/disk-cache-contract.test.ts
git commit -m "test(recall): contract test sync disk cache to session excerpt"
```

---

## Task 6: SKILL.md and process doc updates

**Files:**
- Modify: `skills/recalling-project-context/SKILL.md`
- Modify: `skills/syncing-decisions-to-memory/SKILL.md`
- Modify: `skills/using-snowball/SKILL.md`
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `docs/design/snowball-process.md`

- [ ] **Step 1: Update recall SKILL.md opening**

Replace the paragraph after the title with:

```markdown
Recover distilled rationale at the **start of a non-trivial snowball cycle** — before brainstorming, plan mode, or design work. This closes the decision spine's recall loop: decisions captured in prior cycles are readable here without grepping `docs/snowball/decisions/`.

**Cycle-start recall:** tier-0 passive excerpt is injected at session start via the bootstrap hook; tier-1 is this skill (live MCP + scoped MADRs + staleness).
```

In procedure step 3, after "Read the JSON result", add: "Use `staleness`, `adrDigest`, and `currentDigest` from the JSON — do not recompute digest comparison by hand."

In step 6, replace the staleness bullet with:

```markdown
   - ADR staleness: report `prepare.staleness` (`current` / `stale` / `unknown`); when live MCP ADR is available, compare its digest to `prepare.currentDigest` the same way
```

- [ ] **Step 2: Update sync SKILL.md — add step after Write**

After step 8 (Write), insert new step 9 and renumber Report to 10:

````markdown
9. **Write disk cache.** After a successful `manage_adr(update)`, pipe the rendered document to the disk cache CLI:

   ```bash
   echo '<json>' | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs write-cache
   ```

   where `<json>` is `{"gitRoot": "<repo root>", "content": "<rendered document from step 7>"}`. If this fails (permissions), report a warning — MCP write succeeded; tier-0 session-start may miss the cache until the next successful sync on this machine.

10. **Report.** Tell the user which sections were updated and echo any warnings from step 4.
````

- [ ] **Step 3: Update using-snowball flowchart prose**

After the flowchart dot block, add:

```markdown
**Cycle-start recall:** For non-trivial work, invoke `recalling-project-context` before other skills — it opens the current cycle by recovering rationale distilled from prior cycles. The session-start hook already injected a passive tier-0 excerpt; tier-1 adds live MCP recall, scoped MADRs, and staleness.
```

- [ ] **Step 4: Update brainstorming step 1**

Change checklist item 1 opening to:

```markdown
1. **Explore project context** — when the task is non-trivial, invoke `snowball:recalling-project-context` first (if installed) to recover **prior-cycle rationale** before exploring this cycle's design; then check files, docs, recent commits
```

Same change in the "Understanding the idea" bullet that references step 1.

- [ ] **Step 5: Update snowball-process.md Recall section**

In the **Recall** subsection under "Decision spine", prepend before the numbered list:

```markdown
Recall closes the decision spine and **opens** the forward spine at cycle start: tier-0 passive excerpt at session bootstrap, tier-1 active gate before non-trivial design work (`using-snowball` → `recalling-project-context` → `brainstorming`).
```

Add to the mermaid forward spine diagram an arrow from `H4` to `A` (using-snowball) labeled `cycle start`.

- [ ] **Step 6: Commit**

```bash
git add skills/recalling-project-context/SKILL.md skills/syncing-decisions-to-memory/SKILL.md skills/using-snowball/SKILL.md skills/brainstorming/SKILL.md docs/design/snowball-process.md
git commit -m "docs: make cycle-start recall explicit in skills and process doc"
```

---

## Task 7: Dogfood (B-bar) and README shipped status

**Manual verification — operator required for step 6.**

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Commit any dangling decision records from this feature**

Run:

```bash
git status docs/snowball/decisions/
```

If untracked/modified `*.md` or `observations.jsonl` exist:

```bash
git add docs/snowball/decisions/
git commit -m "docs: decision records for recalling-project-context loop"
```

- [ ] **Step 2: Run ADR sync**

Invoke `syncing-decisions-to-memory` via the Skill tool (or manually follow its procedure). Pass criteria:

- `manage_adr(update)` succeeds
- `.codebase-memory/adr.md` exists on disk with updated TRADEOFFS/PHILOSOPHY mentioning recall loop
- Digest marker changed

- [ ] **Step 3: Verify tier-0 excerpt locally**

Run:

```bash
git rev-parse --show-toplevel | xargs -I{} bash -c 'echo "{\"gitRoot\":\"{}\"}" | node skills/recalling-project-context/scripts/recall-context.cjs excerpt | head -20'
```

Expected: `<project-memory>` block with recall-related rationale and `ADR is current` or stale line.

- [ ] **Step 4: Cross-session check (operator)**

Open a **new** Cursor/Claude session on this repo. Confirm session-start context includes `<project-memory>` with recall-loop rationale from step 2. Record pass/fail in your merge/PR notes.

- [ ] **Step 5: Update README shipped status**

In README "What is different from upstream" table, change:

```markdown
| in progress | `recalling-project-context` (ADR/MADR recall loop) + completion-flow decision trail |
```

to:

```markdown
| v5.5.0 | `recalling-project-context` — cycle-start recall loop (tier-0 hook + tier-1 skill, staleness, sync disk cache) |
```

(Adjust version if `RELEASE-NOTES` / version files use a different next number — keep them consistent.)

Add to the decision-spine mermaid in README an arrow from recall back to forward spine entry if not already present (match `snowball-process.md`).

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: mark recalling-project-context recall loop as shipped"
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Staleness in `prepare` | Task 1–2 |
| Staleness in tier-0 excerpt | Task 3 |
| `writeDiskCache` after sync | Task 4 |
| Sync SKILL disk step | Task 6 |
| Contract test disk → excerpt | Task 5 |
| Cycle-start recall explicit | Task 6 |
| Recall SKILL updates | Task 6 |
| B-bar dogfood | Task 7 |
| README shipped | Task 7 |
| Deferred shared package | Not in plan (future work) |

No placeholders remain. Type names consistent: `Staleness`, `writeDiskCache`, `computeStaleness`, `write-cache` CLI.
