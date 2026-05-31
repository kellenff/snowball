# Syncing Snowball Decisions to codebase-memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new on-demand snowball skill, `syncing-decisions-to-memory`, that distills this repo's decision logs into codebase-memory's project ADR via the `manage_adr` MCP tool.

**Architecture:** A thin agent shell (`SKILL.md`) is the only part that touches MCP and the LLM; all logic lives in a pure, unit-tested TypeScript core bundled to a single `.cjs`. The agent fetches the current ADR, runs the core's `prepare` step (gather → filter → digest-compare), synthesizes two prose sections when stale, then runs the core's `render` step and writes the whole document back. A content-hash digest makes a no-change re-run a true no-op.

**Tech Stack:** TypeScript compiled with `bun build --target=node --format=cjs` (same pipeline as `skills/decision-logging`), `bun:test`, `js-yaml`, `node:crypto`. Consumes codebase-memory's `list_projects` and `manage_adr` MCP tools.

**Spec:** `docs/snowball/specs/2026-05-31-syncing-decisions-to-codebase-memory-design.md`

---

## Conventions (read once before starting)

- **Pre-commit auto-fixers.** `oxfmt`, `end-of-file-fixer`, and `trailing-whitespace` may rewrite staged files and abort the commit. When that happens, re-run `git add <files>` and `git commit` again — this is expected, not an error. Source `.ts` under `skills/syncing-decisions-to-memory/src/` is linted by `oxlint`/`oxfmt`; the generated `scripts/*.cjs` is excluded (Task 7 adds that exclusion).
- **The pre-commit hooks for THIS skill do not exist until Task 7.** Through Task 6, commits won't run this skill's build/test hooks. That's fine — you run `bun test` manually in each task.
- **Run tests from the test dir:** `cd tests/syncing-decisions-to-memory && bun test`.
- **No `Date.now()` in pure core.** Determinism matters for the digest; the core never reads the clock.

## File Structure

**New skill source (pure core + agent shell):**
- `skills/syncing-decisions-to-memory/SKILL.md` — agent orchestration (the impure shell).
- `skills/syncing-decisions-to-memory/src/gather.ts` — read + parse MADR `.md` files and `observations.jsonl`.
- `skills/syncing-decisions-to-memory/src/filter.ts` — keep accepted/proposed MADRs and high-confidence/`{constraint,implementation-choice}` observations.
- `skills/syncing-decisions-to-memory/src/digest.ts` — stable, order-independent content hash.
- `skills/syncing-decisions-to-memory/src/adr.ts` — canonical-section parse/extract/render (mirrors codebase-memory's parser).
- `skills/syncing-decisions-to-memory/src/sync-decisions.ts` — `prepare` + `render` orchestration and the `require.main` CLI (the single bundle entry).
- `skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs` — generated bundle (do not hand-edit).

**Build + wiring:**
- `scripts/build-syncing-decisions-to-memory.sh` — bun-bundle the entry.
- `.pre-commit-config.yaml` — add build + `bun test` hooks; extend the oxlint/oxfmt scripts-exclude.
- `tsconfig.json` — add the new `src` + `tests` globs to `include`.

**Tests:**
- `tests/syncing-decisions-to-memory/package.json` — local `js-yaml` devDep + `test` script.
- `tests/syncing-decisions-to-memory/test-helpers.ts` — temp-repo + fixture helpers.
- `tests/syncing-decisions-to-memory/gather.test.ts`
- `tests/syncing-decisions-to-memory/filter.test.ts`
- `tests/syncing-decisions-to-memory/digest.test.ts`
- `tests/syncing-decisions-to-memory/adr.test.ts`
- `tests/syncing-decisions-to-memory/prepare.test.ts`
- `tests/syncing-decisions-to-memory/CONTRACT.md` — live round-trip procedure against codebase-memory.

---

## Task 1: Scaffold the skill + test harness

**Files:**
- Create: `skills/syncing-decisions-to-memory/src/.gitkeep` (temporary; removed once real sources land)
- Create: `tests/syncing-decisions-to-memory/package.json`
- Create: `tests/syncing-decisions-to-memory/test-helpers.ts`
- Create: `tests/syncing-decisions-to-memory/smoke.test.ts`
- Modify: `tsconfig.json` (extend `include`)

- [ ] **Step 1: Create the test package manifest**

Create `tests/syncing-decisions-to-memory/package.json`:

```json
{
  "name": "syncing-decisions-to-memory-tests",
  "version": "1.0.0",
  "scripts": {
    "test": "bun test"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: Install the test deps**

Run: `cd tests/syncing-decisions-to-memory && bun install`
Expected: creates `node_modules/` and `bun.lock` (or `package-lock.json`) with `js-yaml` resolvable.

- [ ] **Step 3: Create the test helpers**

Create `tests/syncing-decisions-to-memory/test-helpers.ts`:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-sync-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

export function cleanupTempRepo(dir: string): void {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Write a file under <repo>/docs/snowball/decisions/, creating dirs. */
export function writeDecisionFile(repo: string, name: string, contents: string): void {
  const dir = path.join(repo, "docs", "snowball", "decisions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), contents);
}

/** Build a minimal MADR markdown string for fixtures. */
export function madrFixture(opts: {
  title: string;
  status: string;
  sourceEventId?: string;
  body?: string;
}): string {
  const fm = [
    "---",
    `title: ${opts.title}`,
    `status: ${opts.status}`,
    "date: '2026-05-30T20:35:25.481Z'",
    "deciders:",
    "  - kellen",
    "snowball:",
    "  schema_version: '1.0'",
    "  source: operator",
    "  confidence: high",
    "  capture_mechanism: ask-user-question",
    "  session_id: sess-1",
    `  source_event_id: ${opts.sourceEventId ?? "evt-1"}`,
    "  supersedes: null",
    "  tags:",
    "    - ambient",
    "---",
    "",
    `# ${opts.title}`,
    "",
    "## Decision Outcome",
    "",
    opts.body ?? "Chose the thing.",
    "",
  ];
  return fm.join("\n");
}
```

- [ ] **Step 4: Extend tsconfig include**

In `tsconfig.json`, replace the `include` array so it also covers the new skill and tests:

```json
  "include": [
    "skills/decision-logging/src/**/*",
    "tests/decision-logging/**/*.ts",
    "skills/syncing-decisions-to-memory/src/**/*",
    "tests/syncing-decisions-to-memory/**/*.ts"
  ]
```

- [ ] **Step 5: Add a smoke test that proves the harness runs**

Create `tests/syncing-decisions-to-memory/smoke.test.ts`:

```ts
import { test, expect } from "bun:test";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

test("harness can create a temp repo with a fixture decision", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(repo, "2026-05-30T2035-x.md", madrFixture({ title: "X", status: "accepted" }));
    expect(repo.length).toBeGreaterThan(0);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 6: Create the src placeholder so the dir exists**

Run: `mkdir -p skills/syncing-decisions-to-memory/src skills/syncing-decisions-to-memory/scripts && touch skills/syncing-decisions-to-memory/src/.gitkeep`

- [ ] **Step 7: Run the smoke test**

Run: `cd tests/syncing-decisions-to-memory && bun test`
Expected: PASS, 1 test.

- [ ] **Step 8: Commit**

```bash
git add tests/syncing-decisions-to-memory tsconfig.json skills/syncing-decisions-to-memory/src/.gitkeep
git commit -m "chore: scaffold syncing-decisions-to-memory skill + test harness"
```

---

## Task 2: `gather.ts` — parse decision logs

**Files:**
- Create: `skills/syncing-decisions-to-memory/src/gather.ts`
- Test: `tests/syncing-decisions-to-memory/gather.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/syncing-decisions-to-memory/gather.test.ts`:

```ts
import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { gatherDecisions, parseMadr, parseObservationLine } from "../../skills/syncing-decisions-to-memory/src/gather";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

test("parseMadr extracts status, title, source_event_id, and body", () => {
  const raw = madrFixture({ title: "Pick A", status: "accepted", sourceEventId: "evt-9", body: "Chose A over B." });
  const r = parseMadr("f.md", raw);
  expect("warning" in r).toBe(false);
  if ("warning" in r) return;
  expect(r.status).toBe("accepted");
  expect(r.title).toBe("Pick A");
  expect(r.sourceEventId).toBe("evt-9");
  expect(r.body).toContain("Chose A over B.");
});

test("parseMadr warns on missing frontmatter", () => {
  const r = parseMadr("bad.md", "# No frontmatter here\n");
  expect("warning" in r).toBe(true);
});

test("parseObservationLine keeps required string fields and skips blank lines", () => {
  expect(parseObservationLine("")).toBeNull();
  const good = JSON.stringify({
    schema_version: "1.0",
    timestamp: "2026-05-27T03:55:46Z",
    session_id: "s1",
    type: "constraint",
    confidence: "high",
    source: "subagent",
    content: "bare=true breaks worktree git",
    rationale: "...",
    related_files: [],
    related_decision: null,
    tags: ["systematic-debugging"],
  });
  const r = parseObservationLine(good);
  expect("warning" in r!).toBe(false);
});

test("parseObservationLine warns on unparseable JSON", () => {
  const r = parseObservationLine("{not json");
  expect(r && "warning" in r).toBe(true);
});

test("gatherDecisions reads md files and observations.jsonl, collecting warnings", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(repo, "2026-05-30T2035-a.md", madrFixture({ title: "A", status: "accepted" }));
    writeDecisionFile(repo, "2026-05-30T2036-b.md", "broken file no frontmatter");
    const dir = path.join(repo, "docs", "snowball", "decisions");
    fs.writeFileSync(
      path.join(dir, "observations.jsonl"),
      JSON.stringify({
        schema_version: "1.0",
        timestamp: "2026-05-27T03:55:46Z",
        session_id: "s1",
        type: "constraint",
        confidence: "high",
        source: "subagent",
        content: "c",
        rationale: "r",
        related_files: [],
        related_decision: null,
        tags: ["x"],
      }) + "\n{bad line\n",
    );
    const out = gatherDecisions(repo);
    expect(out.madrs.length).toBe(1);
    expect(out.observations.length).toBe(1);
    expect(out.warnings.length).toBe(2); // broken md + bad jsonl line
  } finally {
    cleanupTempRepo(repo);
  }
});

test("gatherDecisions returns empty result when decisions dir is absent", () => {
  const repo = makeTempRepo();
  try {
    const out = gatherDecisions(repo);
    expect(out.madrs).toEqual([]);
    expect(out.observations).toEqual([]);
    expect(out.warnings).toEqual([]);
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/syncing-decisions-to-memory && bun test gather.test.ts`
Expected: FAIL — cannot find module `../../skills/syncing-decisions-to-memory/src/gather`.

- [ ] **Step 3: Write the implementation**

Create `skills/syncing-decisions-to-memory/src/gather.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

export interface MadrRecord {
  filename: string;
  title: string;
  status: string;
  sourceEventId: string;
  body: string;
}

export interface ObservationRecord {
  sessionId: string;
  timestamp: string;
  type: string;
  confidence: string;
  content: string;
}

export interface GatherResult {
  madrs: MadrRecord[];
  observations: ObservationRecord[];
  warnings: string[];
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseMadr(filename: string, raw: string): MadrRecord | { warning: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { warning: `${filename}: no YAML frontmatter` };

  let fm: unknown;
  try {
    fm = yaml.load(m[1]);
  } catch (err) {
    return { warning: `${filename}: invalid YAML (${(err as Error).message})` };
  }
  if (!fm || typeof fm !== "object") return { warning: `${filename}: frontmatter is not a mapping` };

  const obj = fm as Record<string, unknown>;
  const status = typeof obj.status === "string" ? obj.status : "";
  if (!status) return { warning: `${filename}: missing status` };

  const snowball =
    obj.snowball && typeof obj.snowball === "object"
      ? (obj.snowball as Record<string, unknown>)
      : {};
  const sourceEventId =
    typeof snowball.source_event_id === "string" ? snowball.source_event_id : filename;

  return {
    filename,
    title: typeof obj.title === "string" ? obj.title : filename,
    status,
    sourceEventId,
    body: m[2].trim(),
  };
}

const OBS_REQUIRED = ["session_id", "timestamp", "type", "confidence", "content"] as const;

export function parseObservationLine(
  line: string,
): ObservationRecord | { warning: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { warning: "observations.jsonl: unparseable line" };
  }
  for (const f of OBS_REQUIRED) {
    if (typeof obj[f] !== "string") {
      return { warning: `observations.jsonl: line missing string field '${f}'` };
    }
  }
  return {
    sessionId: obj.session_id as string,
    timestamp: obj.timestamp as string,
    type: obj.type as string,
    confidence: obj.confidence as string,
    content: obj.content as string,
  };
}

export function gatherDecisions(gitRoot: string): GatherResult {
  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  const madrs: MadrRecord[] = [];
  const observations: ObservationRecord[] = [];
  const warnings: string[] = [];
  if (!fs.existsSync(dir)) return { madrs, observations, warnings };

  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const r = parseMadr(f, raw);
    if ("warning" in r) warnings.push(r.warning);
    else madrs.push(r);
  }

  const jsonlPath = path.join(dir, "observations.jsonl");
  if (fs.existsSync(jsonlPath)) {
    for (const line of fs.readFileSync(jsonlPath, "utf8").split("\n")) {
      const r = parseObservationLine(line);
      if (r === null) continue;
      if ("warning" in r) warnings.push(r.warning);
      else observations.push(r);
    }
  }
  return { madrs, observations, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/syncing-decisions-to-memory && bun test gather.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add skills/syncing-decisions-to-memory/src/gather.ts tests/syncing-decisions-to-memory/gather.test.ts
git commit -m "feat: gather + parse snowball decision logs"
```

---

## Task 3: `filter.ts` — keep the signal

**Files:**
- Create: `skills/syncing-decisions-to-memory/src/filter.ts`
- Test: `tests/syncing-decisions-to-memory/filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/syncing-decisions-to-memory/filter.test.ts`:

```ts
import { test, expect } from "bun:test";
import { filterRecords } from "../../skills/syncing-decisions-to-memory/src/filter";
import type { GatherResult } from "../../skills/syncing-decisions-to-memory/src/gather";

function gather(partial: Partial<GatherResult>): GatherResult {
  return { madrs: [], observations: [], warnings: [], ...partial };
}

test("keeps only accepted/proposed MADRs", () => {
  const out = filterRecords(
    gather({
      madrs: [
        { filename: "a", title: "A", status: "accepted", sourceEventId: "1", body: "x" },
        { filename: "b", title: "B", status: "proposed", sourceEventId: "2", body: "y" },
        { filename: "c", title: "C", status: "superseded", sourceEventId: "3", body: "z" },
        { filename: "d", title: "D", status: "rejected", sourceEventId: "4", body: "w" },
      ],
    }),
  );
  expect(out.madrs.map((m) => m.status).sort()).toEqual(["accepted", "proposed"]);
});

test("keeps observations that are high-confidence OR constraint/implementation-choice", () => {
  const out = filterRecords(
    gather({
      observations: [
        { sessionId: "s", timestamp: "t1", type: "hypothesis", confidence: "high", content: "kept: high" },
        { sessionId: "s", timestamp: "t2", type: "constraint", confidence: "low", content: "kept: constraint" },
        { sessionId: "s", timestamp: "t3", type: "implementation-choice", confidence: "medium", content: "kept: impl" },
        { sessionId: "s", timestamp: "t4", type: "hypothesis", confidence: "medium", content: "dropped" },
      ],
    }),
  );
  expect(out.observations.map((o) => o.content)).toEqual([
    "kept: high",
    "kept: constraint",
    "kept: impl",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/syncing-decisions-to-memory && bun test filter.test.ts`
Expected: FAIL — cannot find module `filter`.

- [ ] **Step 3: Write the implementation**

Create `skills/syncing-decisions-to-memory/src/filter.ts`:

```ts
import type { GatherResult, MadrRecord, ObservationRecord } from "./gather";

export const KEEP_MADR_STATUSES = new Set(["accepted", "proposed"]);
export const KEEP_OBS_TYPES = new Set(["constraint", "implementation-choice"]);

export interface FilteredInput {
  madrs: MadrRecord[];
  observations: ObservationRecord[];
}

export function filterRecords(input: GatherResult): FilteredInput {
  return {
    madrs: input.madrs.filter((m) => KEEP_MADR_STATUSES.has(m.status)),
    observations: input.observations.filter(
      (o) => o.confidence === "high" || KEEP_OBS_TYPES.has(o.type),
    ),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/syncing-decisions-to-memory && bun test filter.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add skills/syncing-decisions-to-memory/src/filter.ts tests/syncing-decisions-to-memory/filter.test.ts
git commit -m "feat: filter decision records to high-signal set"
```

---

## Task 4: `digest.ts` — the drift guard hash

**Files:**
- Create: `skills/syncing-decisions-to-memory/src/digest.ts`
- Test: `tests/syncing-decisions-to-memory/digest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/syncing-decisions-to-memory/digest.test.ts`:

```ts
import { test, expect } from "bun:test";
import { computeDigest } from "../../skills/syncing-decisions-to-memory/src/digest";
import type { FilteredInput } from "../../skills/syncing-decisions-to-memory/src/filter";

const base: FilteredInput = {
  madrs: [
    { filename: "a", title: "A", status: "accepted", sourceEventId: "evt-1", body: "Chose A." },
    { filename: "b", title: "B", status: "accepted", sourceEventId: "evt-2", body: "Chose B." },
  ],
  observations: [
    { sessionId: "s1", timestamp: "t1", type: "constraint", confidence: "high", content: "c1" },
  ],
};

test("digest is 16 lowercase hex chars", () => {
  expect(computeDigest(base)).toMatch(/^[0-9a-f]{16}$/);
});

test("digest is order-independent", () => {
  const shuffled: FilteredInput = {
    madrs: [base.madrs[1], base.madrs[0]],
    observations: base.observations,
  };
  expect(computeDigest(shuffled)).toBe(computeDigest(base));
});

test("editing a decision body changes the digest", () => {
  const edited: FilteredInput = {
    madrs: [base.madrs[0], { ...base.madrs[1], body: "Chose B differently." }],
    observations: base.observations,
  };
  expect(computeDigest(edited)).not.toBe(computeDigest(base));
});

test("adding a record changes the digest", () => {
  const more: FilteredInput = {
    madrs: base.madrs,
    observations: [
      ...base.observations,
      { sessionId: "s2", timestamp: "t2", type: "implementation-choice", confidence: "low", content: "c2" },
    ],
  };
  expect(computeDigest(more)).not.toBe(computeDigest(base));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/syncing-decisions-to-memory && bun test digest.test.ts`
Expected: FAIL — cannot find module `digest`.

- [ ] **Step 3: Write the implementation**

Create `skills/syncing-decisions-to-memory/src/digest.ts`:

```ts
import { createHash } from "node:crypto";
import type { FilteredInput } from "./filter";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function computeDigest(input: FilteredInput): string {
  const lines: string[] = [];
  for (const m of input.madrs) {
    lines.push(`madr:${m.sourceEventId}:${sha256(m.body)}`);
  }
  for (const o of input.observations) {
    lines.push(`obs:${o.sessionId}|${o.timestamp}:${sha256(o.content)}`);
  }
  lines.sort();
  return sha256(lines.join("\n")).slice(0, 16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/syncing-decisions-to-memory && bun test digest.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add skills/syncing-decisions-to-memory/src/digest.ts tests/syncing-decisions-to-memory/digest.test.ts
git commit -m "feat: order-independent content digest for idempotency"
```

---

## Task 5: `adr.ts` — canonical-section parse/extract/render

This module mirrors codebase-memory's `cbm_adr_parse_sections` (verified in spec): a `## NAME` line is a section boundary **only** when `NAME` is exactly one of the 6 canonical names (case-sensitive); non-canonical headers are absorbed into the current section; section content is trimmed.

**Files:**
- Create: `skills/syncing-decisions-to-memory/src/adr.ts`
- Test: `tests/syncing-decisions-to-memory/adr.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/syncing-decisions-to-memory/adr.test.ts`:

```ts
import { test, expect } from "bun:test";
import {
  parseAdrSections,
  extractDigest,
  digestMarker,
  renderAdr,
  CANONICAL_SECTIONS,
  OWNED_SECTIONS,
} from "../../skills/syncing-decisions-to-memory/src/adr";

test("parseAdrSections keeps only canonical sections, trims content", () => {
  const doc = [
    "## PURPOSE",
    "",
    "Do the thing.",
    "",
    "## ARCHITECTURE",
    "Layers.",
    "## TRADEOFFS",
    "Chose X.",
    "",
  ].join("\n");
  const s = parseAdrSections(doc);
  expect(s.PURPOSE).toBe("Do the thing.");
  expect(s.ARCHITECTURE).toBe("Layers.");
  expect(s.TRADEOFFS).toBe("Chose X.");
});

test("parseAdrSections absorbs a non-canonical header into the current section", () => {
  const doc = ["## TRADEOFFS", "Chose X.", "## DECISIONS", "this is not a real section", ""].join("\n");
  const s = parseAdrSections(doc);
  // "## DECISIONS" is NOT canonical, so its line + body stay inside TRADEOFFS.
  expect(s.DECISIONS).toBeUndefined();
  expect(s.TRADEOFFS).toContain("Chose X.");
  expect(s.TRADEOFFS).toContain("## DECISIONS");
  expect(s.TRADEOFFS).toContain("this is not a real section");
});

test("parseAdrSections is case-sensitive on section names", () => {
  const doc = ["## Tradeoffs", "lower", "## TRADEOFFS", "upper"].join("\n");
  const s = parseAdrSections(doc);
  expect(s.TRADEOFFS).toBe("upper");
  expect(Object.keys(s)).toEqual(["TRADEOFFS"]);
});

test("parseAdrSections returns empty for empty input", () => {
  expect(parseAdrSections("")).toEqual({});
});

test("extractDigest pulls a stored 16-hex digest, else null", () => {
  expect(extractDigest(`text ${digestMarker("a1b2c3d4e5f6a7b8")} more`)).toBe("a1b2c3d4e5f6a7b8");
  expect(extractDigest("no marker here")).toBeNull();
});

test("renderAdr preserves structural sections, replaces owned, appends marker, canonical order", () => {
  const out = renderAdr({
    preserved: { ARCHITECTURE: "Layers.", PURPOSE: "Do the thing." },
    tradeoffs: "Chose X over Y because Z.",
    philosophy: "Prefer simple.",
    digest: "0123456789abcdef",
  });
  // canonical order: PURPOSE before ARCHITECTURE before TRADEOFFS before PHILOSOPHY
  expect(out.indexOf("## PURPOSE")).toBeLessThan(out.indexOf("## ARCHITECTURE"));
  expect(out.indexOf("## ARCHITECTURE")).toBeLessThan(out.indexOf("## TRADEOFFS"));
  expect(out.indexOf("## TRADEOFFS")).toBeLessThan(out.indexOf("## PHILOSOPHY"));
  expect(out).toContain("Chose X over Y because Z.");
  // round-trips through our own parser with the digest recoverable
  expect(extractDigest(out)).toBe("0123456789abcdef");
  const reparsed = parseAdrSections(out);
  expect(reparsed.PURPOSE).toBe("Do the thing.");
  expect(reparsed.TRADEOFFS).toBe("Chose X over Y because Z.");
});

test("renderAdr bootstrap: only owned sections when no structural preserved", () => {
  const out = renderAdr({ preserved: {}, tradeoffs: "T", philosophy: "P", digest: "00000000deadbeef" });
  expect(out).toContain("## TRADEOFFS");
  expect(out).toContain("## PHILOSOPHY");
  expect(out).not.toContain("## PURPOSE");
});

test("constants are as specified", () => {
  expect(CANONICAL_SECTIONS).toEqual(["PURPOSE", "STACK", "ARCHITECTURE", "PATTERNS", "TRADEOFFS", "PHILOSOPHY"]);
  expect(OWNED_SECTIONS).toEqual(["TRADEOFFS", "PHILOSOPHY"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/syncing-decisions-to-memory && bun test adr.test.ts`
Expected: FAIL — cannot find module `adr`.

- [ ] **Step 3: Write the implementation**

Create `skills/syncing-decisions-to-memory/src/adr.ts`:

```ts
export const CANONICAL_SECTIONS = [
  "PURPOSE",
  "STACK",
  "ARCHITECTURE",
  "PATTERNS",
  "TRADEOFFS",
  "PHILOSOPHY",
] as const;
export type CanonicalSection = (typeof CANONICAL_SECTIONS)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_SECTIONS);

export const OWNED_SECTIONS: CanonicalSection[] = ["TRADEOFFS", "PHILOSOPHY"];

const DIGEST_RE = /<!--\s*snowball:decisions-digest:sha256:([0-9a-f]{16})\s*-->/;

export function digestMarker(digest: string): string {
  return `<!-- snowball:decisions-digest:sha256:${digest} -->`;
}

export function extractDigest(adrContent: string): string | null {
  const m = adrContent.match(DIGEST_RE);
  return m ? m[1] : null;
}

/** A "## NAME" line is a section boundary only when NAME is exactly canonical. */
function tryCanonicalHeader(line: string): string | null {
  if (!line.startsWith("## ")) return null;
  const name = line.slice(3).replace(/[ \t\r]+$/, "");
  return CANONICAL_SET.has(name) ? name : null;
}

/** Mirror of codebase-memory's cbm_adr_parse_sections (canonical-only, trimmed). */
export function parseAdrSections(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content) return result;

  let current: string | null = null;
  let buf: string[] = [];
  const save = () => {
    if (current) result[current] = buf.join("\n").trim();
  };

  for (const line of content.split("\n")) {
    const header = tryCanonicalHeader(line);
    if (header) {
      save();
      current = header;
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  save();
  return result;
}

export interface RenderInput {
  /** Non-owned canonical sections to preserve verbatim (e.g. PURPOSE/STACK/ARCHITECTURE/PATTERNS). */
  preserved: Record<string, string>;
  tradeoffs: string;
  philosophy: string;
  digest: string;
}

export function renderAdr(input: RenderInput): string {
  const sections: Record<string, string> = { ...input.preserved };
  sections.TRADEOFFS = input.tradeoffs.trim();
  sections.PHILOSOPHY = `${input.philosophy.trim()}\n\n${digestMarker(input.digest)}`;

  const parts: string[] = [];
  for (const name of CANONICAL_SECTIONS) {
    const body = sections[name];
    if (body === undefined || body === "") continue;
    parts.push(`## ${name}\n\n${body}`);
  }
  return parts.join("\n\n") + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/syncing-decisions-to-memory && bun test adr.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add skills/syncing-decisions-to-memory/src/adr.ts tests/syncing-decisions-to-memory/adr.test.ts
git commit -m "feat: canonical-section ADR parse/extract/render"
```

---

## Task 6: `sync-decisions.ts` — prepare/render orchestration + CLI

**Files:**
- Create: `skills/syncing-decisions-to-memory/src/sync-decisions.ts`
- Modify: delete `skills/syncing-decisions-to-memory/src/.gitkeep`
- Test: `tests/syncing-decisions-to-memory/prepare.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/syncing-decisions-to-memory/prepare.test.ts`:

```ts
import { test, expect } from "bun:test";
import { prepare } from "../../skills/syncing-decisions-to-memory/src/sync-decisions";
import { renderAdr, digestMarker } from "../../skills/syncing-decisions-to-memory/src/adr";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

function repoWithOneDecision(): string {
  const repo = makeTempRepo();
  writeDecisionFile(
    repo,
    "2026-05-30T2035-a.md",
    madrFixture({ title: "Pick A", status: "accepted", sourceEventId: "evt-1", body: "Chose A over B." }),
  );
  return repo;
}

test("prepare returns synthesize with a brief when ADR is empty and decisions exist", () => {
  const repo = repoWithOneDecision();
  try {
    const out = prepare({ gitRoot: repo, adrContent: "" });
    expect(out.action).toBe("synthesize");
    expect(out.reason).toBe("stale");
    expect(out.brief.madrs.length).toBe(1);
    expect(out.brief.madrs[0].title).toBe("Pick A");
    expect(out.digest).toMatch(/^[0-9a-f]{16}$/);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare returns noop/already-current when the stored digest matches", () => {
  const repo = repoWithOneDecision();
  try {
    const first = prepare({ gitRoot: repo, adrContent: "" });
    // Simulate a written ADR carrying the digest produced for the same inputs.
    const adr = renderAdr({ preserved: {}, tradeoffs: "x", philosophy: "y", digest: first.digest });
    const second = prepare({ gitRoot: repo, adrContent: adr });
    expect(second.action).toBe("noop");
    expect(second.reason).toBe("already-current");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare returns noop/nothing-to-sync when no qualifying decisions", () => {
  const repo = makeTempRepo();
  try {
    // Only a superseded MADR → filtered out.
    writeDecisionFile(repo, "2026-05-30T2035-s.md", madrFixture({ title: "Old", status: "superseded" }));
    const out = prepare({ gitRoot: repo, adrContent: "" });
    expect(out.action).toBe("noop");
    expect(out.reason).toBe("nothing-to-sync");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare preserves structural sections and excludes owned ones from preserved", () => {
  const repo = repoWithOneDecision();
  try {
    const adr = [
      "## PURPOSE",
      "",
      "Existing purpose.",
      "",
      "## TRADEOFFS",
      "",
      `Old machine prose. ${digestMarker("ffffffffffffffff")}`,
      "",
    ].join("\n");
    const out = prepare({ gitRoot: repo, adrContent: adr });
    expect(out.preserved.PURPOSE).toBe("Existing purpose.");
    expect(out.preserved.TRADEOFFS).toBeUndefined(); // owned, not preserved
  } finally {
    cleanupTempRepo(repo);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/syncing-decisions-to-memory && bun test prepare.test.ts`
Expected: FAIL — cannot find module `sync-decisions`.

- [ ] **Step 3: Write the implementation**

Create `skills/syncing-decisions-to-memory/src/sync-decisions.ts`:

```ts
import { gatherDecisions } from "./gather";
import { filterRecords } from "./filter";
import { computeDigest } from "./digest";
import { parseAdrSections, extractDigest, renderAdr, OWNED_SECTIONS, CANONICAL_SECTIONS } from "./adr";

export interface PrepareInput {
  gitRoot: string;
  adrContent: string; // "" when codebase-memory reports no_adr
}

export interface DecisionBrief {
  madrs: Array<{ title: string; status: string; body: string }>;
  observations: Array<{ type: string; confidence: string; content: string }>;
}

export interface PrepareOutput {
  action: "noop" | "synthesize";
  reason: "stale" | "already-current" | "nothing-to-sync";
  digest: string;
  warnings: string[];
  preserved: Record<string, string>;
  brief: DecisionBrief;
}

const EMPTY_BRIEF: DecisionBrief = { madrs: [], observations: [] };

export function prepare(input: PrepareInput): PrepareOutput {
  const gathered = gatherDecisions(input.gitRoot);
  const filtered = filterRecords(gathered);
  const digest = computeDigest(filtered);

  const owned = new Set<string>(OWNED_SECTIONS);
  const sections = parseAdrSections(input.adrContent);
  const preserved: Record<string, string> = {};
  for (const name of CANONICAL_SECTIONS) {
    if (!owned.has(name) && sections[name]) preserved[name] = sections[name];
  }

  const base = { digest, warnings: gathered.warnings, preserved };

  if (filtered.madrs.length === 0 && filtered.observations.length === 0) {
    return { action: "noop", reason: "nothing-to-sync", brief: EMPTY_BRIEF, ...base };
  }
  if (extractDigest(input.adrContent) === digest) {
    return { action: "noop", reason: "already-current", brief: EMPTY_BRIEF, ...base };
  }

  return {
    action: "synthesize",
    reason: "stale",
    brief: {
      madrs: filtered.madrs.map((m) => ({ title: m.title, status: m.status, body: m.body })),
      observations: filtered.observations.map((o) => ({
        type: o.type,
        confidence: o.confidence,
        content: o.content,
      })),
    },
    ...base,
  };
}

export interface RenderCliInput {
  preserved: Record<string, string>;
  tradeoffs: string;
  philosophy: string;
  digest: string;
}

// CLI:
//   node sync-decisions.cjs prepare   < {gitRoot, adrContent}        > PrepareOutput JSON
//   node sync-decisions.cjs render    < {preserved,tradeoffs,...}    > ADR document text
if (require.main === module) {
  const sub = process.argv[2];
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      if (sub === "prepare") {
        process.stdout.write(JSON.stringify(prepare(JSON.parse(raw) as PrepareInput)));
      } else if (sub === "render") {
        process.stdout.write(renderAdr(JSON.parse(raw) as RenderCliInput));
      } else {
        process.stderr.write(`unknown subcommand: ${String(sub)} (expected 'prepare' or 'render')\n`);
        process.exit(2);
      }
    } catch (err) {
      process.stderr.write(`sync-decisions error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });
}
```

- [ ] **Step 4: Remove the scaffolding placeholder**

Run: `git rm skills/syncing-decisions-to-memory/src/.gitkeep`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tests/syncing-decisions-to-memory && bun test prepare.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the full unit suite**

Run: `cd tests/syncing-decisions-to-memory && bun test`
Expected: PASS — all files (smoke, gather, filter, digest, adr, prepare).

- [ ] **Step 7: Commit**

```bash
git add skills/syncing-decisions-to-memory/src/sync-decisions.ts tests/syncing-decisions-to-memory/prepare.test.ts
git commit -m "feat: prepare/render orchestration + CLI for decision sync"
```

---

## Task 7: Build script + bundle + pre-commit wiring

**Files:**
- Create: `scripts/build-syncing-decisions-to-memory.sh`
- Create (generated): `skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs`
- Modify: `.pre-commit-config.yaml`

- [ ] **Step 1: Create the build script**

Create `scripts/build-syncing-decisions-to-memory.sh`:

```bash
#!/usr/bin/env bash
# Build syncing-decisions-to-memory TypeScript source into a bundled .cjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/syncing-decisions-to-memory/src"
OUT_DIR="$SCRIPT_DIR/skills/syncing-decisions-to-memory/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building syncing-decisions-to-memory" >&2
  echo "install: https://bun.sh" >&2
  exit 1
fi

ENTRIES=(
  sync-decisions
)

for entry in "${ENTRIES[@]}"; do
  tmp="$(mktemp)"
  bun build "$SRC_DIR/$entry.ts" \
    --target=node \
    --format=cjs \
    --outfile="$tmp"
  dest="$OUT_DIR/$entry.cjs"
  if ! diff -q "$tmp" "$dest" >/dev/null 2>&1; then
    mv "$tmp" "$dest"
  else
    rm "$tmp"
  fi
done

echo "built ${#ENTRIES[@]} bundle(s) into $OUT_DIR/"
```

- [ ] **Step 2: Make it executable and run it**

Run: `chmod +x scripts/build-syncing-decisions-to-memory.sh && ./scripts/build-syncing-decisions-to-memory.sh`
Expected: prints `built 1 bundle(s)...`; creates `skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs`.

- [ ] **Step 3: Smoke-test the bundle end-to-end**

Run:
```bash
printf '{"preserved":{"PURPOSE":"P"},"tradeoffs":"Chose X.","philosophy":"Simple.","digest":"0123456789abcdef"}' \
  | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs render
```
Expected: prints an ADR doc containing `## PURPOSE`, `## TRADEOFFS`, `## PHILOSOPHY`, and the digest marker.

- [ ] **Step 4: Wire pre-commit — extend the oxlint/oxfmt exclude**

In `.pre-commit-config.yaml`, update BOTH the `oxlint` and `oxfmt` hooks' `exclude` lines from:

```yaml
        exclude: ^skills/(decision-logging|structured-argumentation)/scripts/
```

to:

```yaml
        exclude: ^skills/(decision-logging|structured-argumentation|syncing-decisions-to-memory)/scripts/
```

- [ ] **Step 5: Wire pre-commit — add build + test hooks**

In `.pre-commit-config.yaml`, under the `- repo: local` `hooks:` list (after the structured-argumentation hooks), add:

```yaml
      - id: build-syncing-decisions-to-memory
        name: build syncing-decisions-to-memory bundle
        entry: scripts/build-syncing-decisions-to-memory.sh
        language: system
        files: ^skills/syncing-decisions-to-memory/src/.*\.ts$
        pass_filenames: false

      - id: bun-test-syncing-decisions-to-memory
        name: bun test syncing-decisions-to-memory
        entry: bash -c 'cd tests/syncing-decisions-to-memory && bun test'
        language: system
        files: ^skills/syncing-decisions-to-memory/(src|scripts)/|^tests/syncing-decisions-to-memory/
        pass_filenames: false
```

- [ ] **Step 6: Verify pre-commit accepts the new config**

Run: `pre-commit run build-syncing-decisions-to-memory --all-files && pre-commit run bun-test-syncing-decisions-to-memory --all-files`
Expected: both PASS (build is a no-op since the bundle is current; tests pass).

- [ ] **Step 7: Commit**

```bash
git add scripts/build-syncing-decisions-to-memory.sh skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs .pre-commit-config.yaml
git commit -m "build: bundle + pre-commit wiring for decision sync"
```

---

## Task 8: `SKILL.md` — the agent shell

**Files:**
- Create: `skills/syncing-decisions-to-memory/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/syncing-decisions-to-memory/SKILL.md`:

````markdown
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

9. **Report.** Tell the user which sections were updated and echo any warnings from step 4.

## Notes

- Pass the prepare/render JSON via a tempfile if the content is large or has tricky quoting (`node ... prepare < /tmp/in.json`).
- `preserved` and `digest` from step 4 flow into step 7 unchanged — do not edit them.
- This skill is read-mostly on the codebase-memory side: one `get`, one conditional `update`.
````

- [ ] **Step 2: Lint the markdown**

Run: `pre-commit run markdownlint-cli2 --files skills/syncing-decisions-to-memory/SKILL.md`
Expected: PASS (fix any reported issues, e.g. fenced-code languages, then re-run).

- [ ] **Step 3: Commit**

```bash
git add skills/syncing-decisions-to-memory/SKILL.md
git commit -m "feat: SKILL.md agent shell for decision sync"
```

---

## Task 9: Contract test — live round-trip against codebase-memory

Our pure `parseAdrSections`/`renderAdr` encode an assumption about codebase-memory's parser. The `adr.test.ts` golden cases (Task 5) are the fast proxy; this task adds the **real** contract check — a documented live round-trip through the actual `manage_adr` tool — because it is the only thing that proves the real C parser still behaves as assumed. It is run manually / in CI (it needs the MCP server), not in the `bun test` unit suite.

**Files:**
- Create: `tests/syncing-decisions-to-memory/CONTRACT.md`

- [ ] **Step 1: Write the contract procedure**

Create `tests/syncing-decisions-to-memory/CONTRACT.md`:

````markdown
# Contract: codebase-memory ADR parsing

`skills/syncing-decisions-to-memory/src/adr.ts` assumes codebase-memory's ADR parser:

1. treats `## NAME` as a section boundary **only** for the 6 exact, case-sensitive names
   `PURPOSE STACK ARCHITECTURE PATTERNS TRADEOFFS PHILOSOPHY`;
2. absorbs any other `## Header` into the current section;
3. trims section content;
4. `manage_adr(mode="update")` replaces the whole document.

`adr.test.ts` encodes these as golden cases. This procedure re-verifies them against the **live**
server whenever codebase-memory is upgraded.

## Procedure (manual / CI, requires the codebase-memory MCP server)

Use a throwaway indexed project so no real ADR is clobbered (e.g. the `scratch` project from
`list_projects`, or index a temp repo first).

1. `manage_adr(project=<scratch>, mode="get")` → save the original `content` (to restore at the end).
2. `manage_adr(project=<scratch>, mode="update", content=$DOC)` where `$DOC` is the output of:
   ```bash
   printf '{"preserved":{"PURPOSE":"P-marker","ARCHITECTURE":"A-marker"},"tradeoffs":"T-marker","philosophy":"PH-marker","digest":"0123456789abcdef"}' \
     | node skills/syncing-decisions-to-memory/scripts/sync-decisions.cjs render
   ```
3. `manage_adr(project=<scratch>, mode="sections", sections=["PURPOSE","ARCHITECTURE","TRADEOFFS","PHILOSOPHY"])`.
   **Assert:** each returns its `*-marker` content intact, and the digest marker survives inside PHILOSOPHY.
4. Add `## DECISIONS\nshould-be-absorbed` to the end of `$DOC`, update again, and `get`.
   **Assert:** there is no DECISIONS section; the text is absorbed into PHILOSOPHY.
5. Restore: `manage_adr(project=<scratch>, mode="update", content=<original from step 1>)`.

If any assertion fails, codebase-memory's canonical set or parsing changed — update
`CANONICAL_SECTIONS` / `parseAdrSections` and the `adr.test.ts` golden cases to match.
````

- [ ] **Step 2: Execute the contract procedure once now (live)**

Follow `CONTRACT.md` against the live `manage_adr` tool using a scratch project. Confirm all assertions hold against the current codebase-memory build. If they don't, fix `adr.ts` + `adr.test.ts` before proceeding.

- [ ] **Step 3: Commit**

```bash
git add tests/syncing-decisions-to-memory/CONTRACT.md
git commit -m "test: live contract procedure for codebase-memory ADR parsing"
```

---

## Self-Review

**Spec coverage:**
- On-demand skill via `manage_adr` → Tasks 6, 8. ✓
- Non-destructive to structural sections → `prepare.preserved` + `renderAdr` (Tasks 5, 6); golden test asserts preservation. ✓
- Idempotent no-op (digest guard) → Tasks 4, 6; `prepare.test.ts` asserts `already-current`. ✓
- Thin shell / pure core → all logic in `src/*.ts` with unit tests; SKILL.md only does MCP + synthesis. ✓
- Input scope (accepted/proposed MADRs + high-confidence/`{constraint,implementation-choice}` observations) → Task 3. ✓
- Canonical-only sections, fold into TRADEOFFS/PHILOSOPHY → Task 5 (`parseAdrSections`, `OWNED_SECTIONS`). ✓
- Bootstrap (empty ADR) → `renderAdr` bootstrap test (Task 5), `prepare` empty-`adrContent` path (Task 6). ✓
- Error handling (not indexed; malformed records → warnings; nothing-to-sync; digest unchanged) → SKILL.md step 2 + `gather` warnings (Task 2) + `prepare` reasons (Task 6). ✓
- Project resolution by matching `root_path` (never reconstruct slug) → SKILL.md step 2. ✓
- Pure unit tests + one contract test → Tasks 2-6 unit; Task 9 contract. ✓
- Marker written by render step, not the agent → `renderAdr` appends marker; SKILL.md step 6 says "do NOT add a digest marker." ✓
- `manage_adr` whole-document write → SKILL.md step 8 single update. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `GatherResult`/`MadrRecord`/`ObservationRecord` (Task 2) consumed by `filterRecords` (Task 3) and `computeDigest` via `FilteredInput` (Tasks 3-4); `PrepareOutput.preserved`/`digest`/`brief` (Task 6) consumed by `renderAdr`'s `RenderInput` (Task 5) and the SKILL.md render call (Task 8). `CANONICAL_SECTIONS`/`OWNED_SECTIONS` defined once in `adr.ts`. Names consistent across tasks. ✓
