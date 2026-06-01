# Blast-Radius Plan 1 — Core Skill, Heuristic Backend, Brainstorming Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working vertical slice of `snowball:blast-radius` at the brainstorming gate — envelope contract, heuristic backend, design-preset render, envelope scratch writer, and the brainstorming skill patch.

**Architecture:** Pure TypeScript core bundled to `compute.cjs` (same Bun pipeline as `recalling-project-context`). The agent shell (`SKILL.md`) orchestrates CLI calls; all domain logic lives in tested modules. Plan 1 implements the heuristic backend only; the graph backend slot exists as a stub that always declines so Plan 3 can drop in real MCP queries without reshaping the orchestrator. One computation → status envelope → design-preset operator render; `.snowball/blast-radius/last.json` is written on every compute for Plan 4's audit hook to read later.

**Tech Stack:** TypeScript compiled with `bun build --target=node --format=cjs`, `bun:test`, `node:child_process` for git diff. No new npm dependencies.

**Spec:** [`docs/snowball/specs/2026-05-31-blast-radius-analysis-design.md`](../specs/2026-05-31-blast-radius-analysis-design.md)

**Out of scope (later plans):**

| Plan | Delivers |
|---|---|
| Plan 2 | Lifecycle integrations: `writing-plans`, `executing-plans`, `finishing-a-development-branch` |
| Plan 3 | codebase-memory graph backend (replaces the Plan 1 stub) |
| Plan 4 | Audit-channel hook (Stop + operator-approval phrase → `observations.jsonl`) |

---

## Conventions (read once before starting)

- **Pre-commit auto-fixers.** `oxfmt`, `end-of-file-fixer`, and `trailing-whitespace` may rewrite staged files and abort the commit. When that happens, re-run `git add <files>` and `git commit` again — expected, not an error.
- **The pre-commit hooks for THIS skill do not exist until Task 9.** Through Task 8, run `bun test` manually in each task.
- **Run tests from the test dir:** `cd tests/blast-radius && bun test`.
- **Graph backend in Plan 1 is a stub.** `tryGraphBackend()` always returns `{ ok: false, reason: "graph-unavailable" }`. Do not call MCP in this plan.
- **Bundled `.cjs` is generated.** Edit `skills/blast-radius/src/*.ts`, rebuild with `bash scripts/build-blast-radius.sh`. Never hand-edit `scripts/compute.cjs`.

## File Structure

**New skill source (pure core + agent shell):**

- `skills/blast-radius/SKILL.md` — agent orchestration; modeled on `recalling-project-context`.
- `skills/blast-radius/SCHEMA.md` — envelope shape, reason codes, thresholds, action-risk rubric, file-pattern heuristics.
- `skills/blast-radius/presets/design.md` — design-gate render template (change-scope + failure-impact loud).
- `skills/blast-radius/presets/pre-execution.md` — stub template for Plan 2 (action-risk loud); renderer tests cover it now.
- `skills/blast-radius/presets/completion.md` — stub template for Plan 2 (scope + failure-impact loud).
- `skills/blast-radius/src/envelope.ts` — typed envelope + validation.
- `skills/blast-radius/src/schema.ts` — thresholds, reason codes, file-pattern rules, action-risk rubric (mirrors SCHEMA.md).
- `skills/blast-radius/src/git-diff.ts` — parse `git diff --name-only` output into a path list.
- `skills/blast-radius/src/heuristic-backend.ts` — heuristic computation from paths and/or git diff.
- `skills/blast-radius/src/graph-backend-stub.ts` — Plan 1 stub; Plan 3 replaces this file.
- `skills/blast-radius/src/render.ts` — envelope → operator text per preset.
- `skills/blast-radius/src/write-envelope.ts` — write `.snowball/blast-radius/last.json`.
- `skills/blast-radius/src/compute.ts` — orchestrator + CLI entry (`compute`, `render`).
- `skills/blast-radius/scripts/compute.cjs` — generated bundle (do not hand-edit).

**Build + wiring:**

- `scripts/build-blast-radius.sh` — bun-bundle the entry.
- `.pre-commit-config.yaml` — add build + `bun test` hooks; extend oxlint/oxfmt excludes.
- `tsconfig.json` — add the new `src` + `tests` globs to `include`.
- `.gitignore` — add `.snowball/`

**Tests + fixtures:**

- `tests/blast-radius/package.json`
- `tests/blast-radius/test-helpers.ts`
- `tests/blast-radius/envelope.test.ts`
- `tests/blast-radius/heuristic-backend.test.ts`
- `tests/blast-radius/render.test.ts`
- `tests/blast-radius/compute.test.ts`
- `tests/blast-radius/fixtures/diffs/small-skill-edit.diff`
- `tests/blast-radius/fixtures/diffs/wide-cross-module.diff`

**Modified:**

- `skills/brainstorming/SKILL.md` — invoke blast-radius after approaches are stable (checklist step 5 + prose cross-reference).

---

## Task 1: Scaffold test harness + envelope types

**Files:**

- Create: `tests/blast-radius/package.json`
- Create: `tests/blast-radius/test-helpers.ts`
- Create: `tests/blast-radius/envelope.test.ts`
- Create: `skills/blast-radius/src/envelope.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Create the test package manifest**

Create `tests/blast-radius/package.json`:

```json
{
  "name": "blast-radius-tests",
  "version": "1.0.0",
  "scripts": {
    "test": "bun test"
  }
}
```

- [ ] **Step 2: Install test deps**

Run: `cd tests/blast-radius && bun install`
Expected: creates `bun.lock` (empty devDeps is fine).

- [ ] **Step 3: Extend tsconfig include**

In `tsconfig.json`, add blast-radius paths to `include`:

```json
  "include": [
    "skills/decision-logging/src/**/*",
    "tests/decision-logging/**/*.ts",
    "skills/syncing-decisions-to-memory/src/**/*",
    "tests/syncing-decisions-to-memory/**/*.ts",
    "skills/recalling-project-context/src/**/*",
    "tests/recalling-project-context/**/*.ts",
    "skills/blast-radius/src/**/*",
    "tests/blast-radius/**/*.ts"
  ]
```

- [ ] **Step 4: Write envelope types**

Create `skills/blast-radius/src/envelope.ts`:

```typescript
export type BlastRadiusStatus = "success" | "degraded" | "error";
export type BlastRadiusBackend = "graph" | "heuristic" | "none";
export type BlastRadiusPreset = "design" | "pre-execution" | "completion";
export type RiskLevel = "low" | "medium" | "high";

export type ReasonCode =
  | "graph-unavailable"
  | "repo-not-indexed"
  | "change-untracked"
  | "mcp-timeout"
  | "compute-error"
  | "explicit-skip";

export interface ChangeScope {
  fileCount: number;
  files: string[];
  sharedInfraFileCount: number;
  crossModuleEditCount: number;
  level: RiskLevel;
}

export interface FailureImpact {
  estimatedFanOut: number;
  sensitivePaths: string[];
  level: RiskLevel;
}

export interface ActionRisk {
  level: RiskLevel;
  tags: string[];
  rationale: string[];
}

export interface BlastRadiusOutput {
  change_scope: ChangeScope;
  failure_impact: FailureImpact;
  action_risk: ActionRisk;
}

export interface BlastRadiusEnvelope {
  status: BlastRadiusStatus;
  backend: BlastRadiusBackend;
  output: BlastRadiusOutput | null;
  reason: ReasonCode | null;
}

export interface ComputeInput {
  gitRoot: string;
  preset: BlastRadiusPreset;
  changeSet: {
    /** Hypothetical or actual paths relative to repo root. */
    paths?: string[];
    /** When set, merge git diff paths against this ref (default: HEAD). */
    gitRef?: string;
    /** Proposed shell/command text for action-risk scoring (pre-execution). */
    proposedAction?: string;
  };
  explicitSkip?: boolean;
  skipReason?: string;
}

const REASON_CODES: ReasonCode[] = [
  "graph-unavailable",
  "repo-not-indexed",
  "change-untracked",
  "mcp-timeout",
  "compute-error",
  "explicit-skip",
];

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as string[]).includes(value);
}

export function assertEnvelope(envelope: BlastRadiusEnvelope): void {
  if (!["success", "degraded", "error"].includes(envelope.status)) {
    throw new Error(`invalid status: ${envelope.status}`);
  }
  if (!["graph", "heuristic", "none"].includes(envelope.backend)) {
    throw new Error(`invalid backend: ${envelope.backend}`);
  }
  if (envelope.status === "error") {
    if (envelope.backend !== "none") throw new Error("error status requires backend none");
    if (!envelope.reason) throw new Error("error status requires reason");
    if (envelope.output !== null) throw new Error("error status requires null output");
    return;
  }
  if (envelope.status === "success") {
    if (!envelope.output) throw new Error("success status requires output");
  }
  if (envelope.status === "degraded" && envelope.reason !== "explicit-skip") {
    if (!envelope.output) throw new Error("degraded status requires output unless explicit-skip");
  }
  if (envelope.reason && !isReasonCode(envelope.reason)) {
    throw new Error(`invalid reason: ${envelope.reason}`);
  }
}
```

- [ ] **Step 5: Write the failing envelope test**

Create `tests/blast-radius/test-helpers.ts`:

```typescript
import type { BlastRadiusEnvelope, BlastRadiusOutput } from "../../skills/blast-radius/src/envelope";

export function sampleOutput(overrides: Partial<BlastRadiusOutput> = {}): BlastRadiusOutput {
  return {
    change_scope: {
      fileCount: 2,
      files: ["skills/foo/SKILL.md", "tests/foo/smoke.test.ts"],
      sharedInfraFileCount: 0,
      crossModuleEditCount: 1,
      level: "low",
      ...(overrides.change_scope ?? {}),
    },
    failure_impact: {
      estimatedFanOut: 1,
      sensitivePaths: [],
      level: "low",
      ...(overrides.failure_impact ?? {}),
    },
    action_risk: {
      level: "low",
      tags: [],
      rationale: [],
      ...(overrides.action_risk ?? {}),
    },
    ...overrides,
  };
}

export function sampleEnvelope(
  overrides: Partial<BlastRadiusEnvelope> = {},
): BlastRadiusEnvelope {
  return {
    status: "success",
    backend: "heuristic",
    output: sampleOutput(),
    reason: null,
    ...overrides,
  };
}
```

Create `tests/blast-radius/envelope.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { assertEnvelope } from "../../skills/blast-radius/src/envelope";
import { sampleEnvelope } from "./test-helpers";

describe("assertEnvelope", () => {
  test("accepts a success envelope", () => {
    expect(() => assertEnvelope(sampleEnvelope())).not.toThrow();
  });

  test("rejects error envelope with output", () => {
    expect(() =>
      assertEnvelope(
        sampleEnvelope({
          status: "error",
          backend: "none",
          output: null,
          reason: "compute-error",
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertEnvelope(
        sampleEnvelope({
          status: "error",
          backend: "none",
          output: sampleEnvelope().output,
          reason: "compute-error",
        }),
      ),
    ).toThrow(/null output/);
  });

  test("rejects degraded without output unless explicit-skip", () => {
    expect(() =>
      assertEnvelope(
        sampleEnvelope({ status: "degraded", backend: "heuristic", output: null, reason: "graph-unavailable" }),
      ),
    ).toThrow(/requires output/);

    expect(() =>
      assertEnvelope(
        sampleEnvelope({ status: "degraded", backend: "none", output: null, reason: "explicit-skip" }),
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd tests/blast-radius && bun test envelope.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json skills/blast-radius/src/envelope.ts tests/blast-radius/
git commit -m "feat(blast-radius): scaffold envelope types and test harness"
```

---

## Task 2: SCHEMA.md + schema.ts (thresholds, rubric, patterns)

**Files:**

- Create: `skills/blast-radius/SCHEMA.md`
- Create: `skills/blast-radius/src/schema.ts`
- Create: `tests/blast-radius/schema.test.ts`

- [ ] **Step 1: Write SCHEMA.md**

Create `skills/blast-radius/SCHEMA.md`:

````markdown
# Blast-Radius Schema

Canonical definitions for the status envelope, reason codes, thresholds, and heuristics. `compute.cjs` imports thresholds from `src/schema.ts` — keep this document and that module in sync.

## Status envelope

```json
{
  "status": "success | degraded | error",
  "backend": "graph | heuristic | none",
  "output": {
    "change_scope": { "fileCount", "files", "sharedInfraFileCount", "crossModuleEditCount", "level" },
    "failure_impact": { "estimatedFanOut", "sensitivePaths", "level" },
    "action_risk": { "level", "tags", "rationale" }
  },
  "reason": "ReasonCode | null"
}
```

- `success` + `graph` or `heuristic`: full output, no reason required.
- `degraded` + `heuristic`: partial output; `reason` explains the limitation (e.g. `graph-unavailable`).
- `error` + `none`: `output` is null; `reason` is required.

## Reason codes (closed enum)

| Code | When |
|---|---|
| `graph-unavailable` | codebase-memory MCP not reachable (Plan 1: always, until Plan 3) |
| `repo-not-indexed` | Project not in codebase-memory index |
| `change-untracked` | Requested paths have no git history / not in repo |
| `mcp-timeout` | Graph query timed out |
| `compute-error` | Internal bug or malformed input |
| `explicit-skip` | Operator asked to skip; `skipReason` captured in render banner |

## Risk levels

Three levels: `low`, `medium`, `high`. Used in each lens output and in preset "louder treatment" rules.

## Thresholds (Phase 1 defaults)

| Key | Value | Used for |
|---|---|---|
| `changeScope.mediumFiles` | 5 | change_scope.level |
| `changeScope.highFiles` | 12 | change_scope.level |
| `changeScope.decompositionFiles` | 8 | design gate decomposition flag |
| `changeScope.decompositionSharedInfra` | 3 | design gate decomposition flag |
| `changeScope.decompositionCrossModule` | 5 | design gate decomposition flag |
| `failureImpact.mediumFanOut` | 3 | failure_impact.level (heuristic estimate) |
| `failureImpact.highFanOut` | 8 | failure_impact.level |
| `actionRisk.surfaceAt` | `medium` | pre-execution gate surfaces to operator |

## Shared-infra file patterns

Glob-style prefixes (matched from repo root):

- `.pre-commit-config.yaml`
- `package.json`
- `tsconfig.json`
- `scripts/`
- `hooks/`

## Sensitive path patterns

- `hooks/`
- `skills/decision-logging/`
- `.pre-commit-config.yaml`

## Cross-module buckets

Count distinct buckets touched among: `skills/`, `tests/`, `hooks/`, `scripts/`, `docs/`. `crossModuleEditCount` = buckets − 1 (minimum 0).

## Action-risk rubric

Seeded from the system prompt's "Executing actions with care" list. Each matching rule adds a tag and may raise `action_risk.level`.

| Tag | Pattern (case-insensitive) | Default level |
|---|---|---|
| `destructive-shell` | `\brm\s+-rf\b`, `\bgit\s+push\s+--force\b`, `\bgit\s+reset\s+--hard\b`, `\bdrop\s+table\b`, `\btruncate\b` | high |
| `hard-to-reverse` | `\bmigrate\b.*\bdown\b`, `\bchmod\s+000\b`, `\bshred\b` | high |
| `shared-visible` | `\bgit\s+push\b`, `\bgh\s+pr\s+create\b`, `\bdeploy\b`, `\brelease\b` | medium |
| `third-party-upload` | `\bcurl\b.*\b(-d|--data)\b`, `\bwget\b.*\b--post\b` | medium |
| `schema-change` | `\bdbmate\b`, `\bmigration\b`, `\bALTER\s+TABLE\b` | medium |

When multiple rules match, level = max(severity). Severity order: `low` < `medium` < `high`.

## Lens preset prominence

| Preset | Loud lenses | Quiet lenses |
|---|---|---|
| `design` | change_scope, failure_impact | action_risk |
| `pre-execution` | action_risk | change_scope, failure_impact (summarized) |
| `completion` | change_scope, failure_impact | action_risk (unless next action is push/force-push/release) |

## Scratch envelope path

`.snowball/blast-radius/last.json` — per-session, gitignored. Written on every successful `compute` invocation.
````

- [ ] **Step 2: Write schema.ts mirroring SCHEMA.md**

Create `skills/blast-radius/src/schema.ts`:

```typescript
import type { RiskLevel } from "./envelope";

export const THRESHOLDS = {
  changeScope: {
    mediumFiles: 5,
    highFiles: 12,
    decompositionFiles: 8,
    decompositionSharedInfra: 3,
    decompositionCrossModule: 5,
  },
  failureImpact: {
    mediumFanOut: 3,
    highFanOut: 8,
  },
  actionRisk: {
    surfaceAt: "medium" as RiskLevel,
  },
} as const;

export const SHARED_INFRA_PATTERNS = [
  ".pre-commit-config.yaml",
  "package.json",
  "tsconfig.json",
  "scripts/",
  "hooks/",
] as const;

export const SENSITIVE_PATH_PATTERNS = [
  "hooks/",
  "skills/decision-logging/",
  ".pre-commit-config.yaml",
] as const;

export const MODULE_BUCKETS = [
  "skills/",
  "tests/",
  "hooks/",
  "scripts/",
  "docs/",
] as const;

export interface ActionRiskRule {
  tag: string;
  pattern: RegExp;
  level: RiskLevel;
}

export const ACTION_RISK_RULES: ActionRiskRule[] = [
  { tag: "destructive-shell", pattern: /\brm\s+-rf\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bgit\s+push\s+--force\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bgit\s+reset\s+--hard\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bdrop\s+table\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\btruncate\b/i, level: "high" },
  { tag: "hard-to-reverse", pattern: /\bmigrate\b.*\bdown\b/i, level: "high" },
  { tag: "hard-to-reverse", pattern: /\bchmod\s+000\b/i, level: "high" },
  { tag: "shared-visible", pattern: /\bgit\s+push\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\bgh\s+pr\s+create\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\bdeploy\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\brelease\b/i, level: "medium" },
  { tag: "third-party-upload", pattern: /\bcurl\b.*\b(-d|--data)\b/i, level: "medium" },
  { tag: "schema-change", pattern: /\bdbmate\b/i, level: "medium" },
  { tag: "schema-change", pattern: /\bALTER\s+TABLE\b/i, level: "medium" },
];

const LEVEL_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export function riskLevelFromFileCount(count: number): RiskLevel {
  if (count >= THRESHOLDS.changeScope.highFiles) return "high";
  if (count >= THRESHOLDS.changeScope.mediumFiles) return "medium";
  return "low";
}

export function shouldFlagDecomposition(scope: {
  fileCount: number;
  sharedInfraFileCount: number;
  crossModuleEditCount: number;
}): boolean {
  return (
    scope.fileCount > THRESHOLDS.changeScope.decompositionFiles ||
    scope.sharedInfraFileCount > THRESHOLDS.changeScope.decompositionSharedInfra ||
    scope.crossModuleEditCount > THRESHOLDS.changeScope.decompositionCrossModule
  );
}

export function matchesAnyPattern(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

export function countModuleBuckets(paths: string[]): number {
  const hit = new Set<string>();
  for (const file of paths) {
    for (const bucket of MODULE_BUCKETS) {
      if (file.startsWith(bucket)) hit.add(bucket);
    }
  }
  return hit.size;
}
```

- [ ] **Step 3: Write schema tests**

Create `tests/blast-radius/schema.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  matchesAnyPattern,
  riskLevelFromFileCount,
  shouldFlagDecomposition,
  maxRiskLevel,
} from "../../skills/blast-radius/src/schema";

describe("schema thresholds", () => {
  test("riskLevelFromFileCount", () => {
    expect(riskLevelFromFileCount(2)).toBe("low");
    expect(riskLevelFromFileCount(5)).toBe("medium");
    expect(riskLevelFromFileCount(12)).toBe("high");
  });

  test("shouldFlagDecomposition", () => {
    expect(shouldFlagDecomposition({ fileCount: 3, sharedInfraFileCount: 0, crossModuleEditCount: 0 })).toBe(false);
    expect(shouldFlagDecomposition({ fileCount: 9, sharedInfraFileCount: 0, crossModuleEditCount: 0 })).toBe(true);
  });

  test("matchesAnyPattern shared infra", () => {
    expect(matchesAnyPattern("hooks/on-stop.sh", ["hooks/"])).toBe(true);
    expect(matchesAnyPattern("skills/foo/x.ts", ["hooks/"])).toBe(false);
  });

  test("maxRiskLevel", () => {
    expect(maxRiskLevel("low", "high")).toBe("high");
    expect(maxRiskLevel("medium", "medium")).toBe("medium");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd tests/blast-radius && bun test schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint markdown**

Run: `pre-commit run markdownlint-cli2 --files skills/blast-radius/SCHEMA.md`
Expected: PASS (fix MD040 if any bare fences).

- [ ] **Step 6: Commit**

```bash
git add skills/blast-radius/SCHEMA.md skills/blast-radius/src/schema.ts tests/blast-radius/schema.test.ts
git commit -m "feat(blast-radius): SCHEMA.md and threshold constants"
```

---

## Task 3: Git diff parser + heuristic backend

**Files:**

- Create: `skills/blast-radius/src/git-diff.ts`
- Create: `skills/blast-radius/src/heuristic-backend.ts`
- Create: `tests/blast-radius/heuristic-backend.test.ts`
- Create: `tests/blast-radius/fixtures/diffs/small-skill-edit.diff`
- Create: `tests/blast-radius/fixtures/diffs/wide-cross-module.diff`

- [ ] **Step 1: Write git-diff.ts**

Create `skills/blast-radius/src/git-diff.ts`:

```typescript
import { execFileSync } from "node:child_process";

export function listChangedFiles(gitRoot: string, gitRef = "HEAD"): string[] {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", gitRef],
      { cwd: gitRoot, stdio: ["ignore", "pipe", "ignore"] },
    );
    return out
      .toString()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function mergePathLists(...lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const p of list ?? []) {
      const norm = p.replace(/^\.\//, "");
      if (!seen.has(norm)) {
        seen.add(norm);
        merged.push(norm);
      }
    }
  }
  return merged;
}
```

- [ ] **Step 2: Write heuristic-backend.ts**

Create `skills/blast-radius/src/heuristic-backend.ts`:

```typescript
import type { BlastRadiusOutput, RiskLevel } from "./envelope";
import {
  ACTION_RISK_RULES,
  countModuleBuckets,
  matchesAnyPattern,
  maxRiskLevel,
  riskLevelFromFileCount,
  SENSITIVE_PATH_PATTERNS,
  SHARED_INFRA_PATTERNS,
  THRESHOLDS,
} from "./schema";

export interface HeuristicInput {
  paths: string[];
  proposedAction?: string;
}

function scoreActionRisk(text: string | undefined): BlastRadiusOutput["action_risk"] {
  if (!text?.trim()) {
    return { level: "low", tags: [], rationale: [] };
  }
  let level: RiskLevel = "low";
  const tags: string[] = [];
  const rationale: string[] = [];
  for (const rule of ACTION_RISK_RULES) {
    if (rule.pattern.test(text)) {
      if (!tags.includes(rule.tag)) tags.push(rule.tag);
      level = maxRiskLevel(level, rule.level);
      rationale.push(`Matched ${rule.tag}`);
    }
  }
  return { level, tags, rationale };
}

function scoreChangeScope(paths: string[]): BlastRadiusOutput["change_scope"] {
  const sharedInfraFileCount = paths.filter((p) =>
    matchesAnyPattern(p, SHARED_INFRA_PATTERNS),
  ).length;
  const buckets = countModuleBuckets(paths);
  const crossModuleEditCount = Math.max(0, buckets - 1);
  const fileCount = paths.length;
  return {
    fileCount,
    files: paths,
    sharedInfraFileCount,
    crossModuleEditCount,
    level: riskLevelFromFileCount(fileCount),
  };
}

function scoreFailureImpact(paths: string[]): BlastRadiusOutput["failure_impact"] {
  const sensitivePaths = paths.filter((p) => matchesAnyPattern(p, SENSITIVE_PATH_PATTERNS));
  // Heuristic fan-out: sensitive paths weigh more; cross-module edits add breadth.
  const buckets = countModuleBuckets(paths);
  const estimatedFanOut = sensitivePaths.length * 2 + Math.max(0, buckets - 1);
  let level: RiskLevel = "low";
  if (estimatedFanOut >= THRESHOLDS.failureImpact.highFanOut) level = "high";
  else if (estimatedFanOut >= THRESHOLDS.failureImpact.mediumFanOut || sensitivePaths.length > 0) {
    level = "medium";
  }
  return { estimatedFanOut, sensitivePaths, level };
}

export function computeHeuristic(input: HeuristicInput): BlastRadiusOutput {
  const paths = input.paths;
  return {
    change_scope: scoreChangeScope(paths),
    failure_impact: scoreFailureImpact(paths),
    action_risk: scoreActionRisk(input.proposedAction),
  };
}
```

- [ ] **Step 3: Write heuristic tests + fixtures**

Create `tests/blast-radius/fixtures/diffs/small-skill-edit.diff` (content is documentation-only; tests use inline paths):

```text
skills/example/SKILL.md
tests/example/smoke.test.ts
```

Create `tests/blast-radius/fixtures/diffs/wide-cross-module.diff`:

```text
skills/blast-radius/src/compute.ts
tests/blast-radius/compute.test.ts
hooks/blast-radius-audit.sh
scripts/build-blast-radius.sh
.pre-commit-config.yaml
```

Create `tests/blast-radius/heuristic-backend.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { computeHeuristic } from "../../skills/blast-radius/src/heuristic-backend";
import { shouldFlagDecomposition } from "../../skills/blast-radius/src/schema";

describe("computeHeuristic", () => {
  test("small skill edit stays low", () => {
    const out = computeHeuristic({
      paths: ["skills/example/SKILL.md", "tests/example/smoke.test.ts"],
    });
    expect(out.change_scope.level).toBe("low");
    expect(out.failure_impact.level).toBe("low");
    expect(out.action_risk.level).toBe("low");
  });

  test("wide cross-module edit flags decomposition", () => {
    const paths = [
      "skills/blast-radius/src/compute.ts",
      "tests/blast-radius/compute.test.ts",
      "hooks/blast-radius-audit.sh",
      "scripts/build-blast-radius.sh",
      ".pre-commit-config.yaml",
    ];
    const out = computeHeuristic({ paths });
    expect(out.change_scope.sharedInfraFileCount).toBeGreaterThan(0);
    expect(shouldFlagDecomposition(out.change_scope)).toBe(true);
  });

  test("destructive shell action scores high", () => {
    const out = computeHeuristic({
      paths: [],
      proposedAction: "git push --force origin main",
    });
    expect(out.action_risk.level).toBe("high");
    expect(out.action_risk.tags).toContain("destructive-shell");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd tests/blast-radius && bun test heuristic-backend.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/blast-radius/src/git-diff.ts skills/blast-radius/src/heuristic-backend.ts tests/blast-radius/heuristic-backend.test.ts tests/blast-radius/fixtures/
git commit -m "feat(blast-radius): heuristic backend for scope and action-risk"
```

---

## Task 4: Graph stub + compute orchestrator + envelope writer

**Files:**

- Create: `skills/blast-radius/src/graph-backend-stub.ts`
- Create: `skills/blast-radius/src/write-envelope.ts`
- Create: `skills/blast-radius/src/compute.ts`
- Create: `tests/blast-radius/compute.test.ts`

- [ ] **Step 1: Write graph stub (Plan 3 replaces this file)**

Create `skills/blast-radius/src/graph-backend-stub.ts`:

```typescript
import type { BlastRadiusOutput, ReasonCode } from "./envelope";

export interface GraphAttempt {
  ok: boolean;
  output?: BlastRadiusOutput;
  reason?: ReasonCode;
}

/** Plan 1 stub — always unavailable. Plan 3 implements real MCP queries. */
export function tryGraphBackend(_input: {
  gitRoot: string;
  paths: string[];
}): GraphAttempt {
  return { ok: false, reason: "graph-unavailable" };
}
```

- [ ] **Step 2: Write envelope writer**

Create `skills/blast-radius/src/write-envelope.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { BlastRadiusEnvelope } from "./envelope";

export function envelopeScratchPath(gitRoot: string): string {
  return path.join(gitRoot, ".snowball", "blast-radius", "last.json");
}

export function writeLastEnvelope(gitRoot: string, envelope: BlastRadiusEnvelope): string {
  const target = envelopeScratchPath(gitRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(envelope, null, 2) + "\n", "utf8");
  return target;
}
```

- [ ] **Step 3: Write compute orchestrator**

Create `skills/blast-radius/src/compute.ts`:

```typescript
import type { BlastRadiusEnvelope, ComputeInput, ReasonCode } from "./envelope";
import { assertEnvelope } from "./envelope";
import { tryGraphBackend } from "./graph-backend-stub";
import { computeHeuristic } from "./heuristic-backend";
import { listChangedFiles, mergePathLists } from "./git-diff";
import { renderOperatorReport } from "./render";
import { writeLastEnvelope } from "./write-envelope";

function errorEnvelope(reason: ReasonCode): BlastRadiusEnvelope {
  return { status: "error", backend: "none", output: null, reason };
}

export function computeBlastRadius(input: ComputeInput): BlastRadiusEnvelope {
  if (input.explicitSkip) {
    return {
      status: "degraded",
      backend: "none",
      output: null,
      reason: "explicit-skip",
    };
  }

  const gitPaths = input.changeSet.gitRef
    ? listChangedFiles(input.gitRoot, input.changeSet.gitRef)
    : listChangedFiles(input.gitRoot, "HEAD");
  const paths = mergePathLists(input.changeSet.paths, gitPaths);

  if (paths.length === 0 && !input.changeSet.proposedAction?.trim()) {
    const env = errorEnvelope("change-untracked");
    assertEnvelope(env);
    return env;
  }

  const graph = tryGraphBackend({ gitRoot: input.gitRoot, paths });
  if (graph.ok && graph.output) {
    const env: BlastRadiusEnvelope = {
      status: "success",
      backend: "graph",
      output: graph.output,
      reason: null,
    };
    assertEnvelope(env);
    return env;
  }

  try {
    const output = computeHeuristic({
      paths,
      proposedAction: input.changeSet.proposedAction,
    });
    const env: BlastRadiusEnvelope = {
      status: graph.reason ? "degraded" : "success",
      backend: "heuristic",
      output,
      reason: graph.reason ?? null,
    };
    assertEnvelope(env);
    return env;
  } catch {
    const env = errorEnvelope("compute-error");
    assertEnvelope(env);
    return env;
  }
}

export function computeAndPersist(input: ComputeInput): {
  envelope: BlastRadiusEnvelope;
  scratchPath: string;
} {
  const envelope = computeBlastRadius(input);
  const scratchPath = writeLastEnvelope(input.gitRoot, envelope);
  return { envelope, scratchPath };
}

// CLI (single bundle entry — render lives here too):
//   node compute.cjs compute              < ComputeInput JSON
//   node compute.cjs compute-and-persist  < ComputeInput JSON
//   node compute.cjs render               < { envelope, preset } JSON
if (require.main === module) {
  const cmd = process.argv[2];
  const raw = require("node:fs").readFileSync(0, "utf8");

  if (cmd === "compute") {
    const input = JSON.parse(raw || "{}") as ComputeInput;
    process.stdout.write(JSON.stringify(computeBlastRadius(input), null, 2) + "\n");
  } else if (cmd === "compute-and-persist") {
    const input = JSON.parse(raw || "{}") as ComputeInput;
    process.stdout.write(JSON.stringify(computeAndPersist(input), null, 2) + "\n");
  } else if (cmd === "render") {
    const { envelope, preset } = JSON.parse(raw || "{}") as {
      envelope: import("./envelope").BlastRadiusEnvelope;
      preset: import("./envelope").BlastRadiusPreset;
    };
    process.stdout.write(renderOperatorReport(envelope, preset) + "\n");
  } else {
    process.stderr.write("usage: node compute.cjs <compute|compute-and-persist|render>\n");
    process.exit(1);
  }
}
```

- [ ] **Step 4: Write compute tests**

Create `tests/blast-radius/compute.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { computeBlastRadius, computeAndPersist } from "../../skills/blast-radius/src/compute";

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blast-radius-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  const file = path.join(dir, "README.md");
  fs.writeFileSync(file, "# test\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

describe("computeBlastRadius", () => {
  test("heuristic success with explicit paths", () => {
    const repo = makeTempRepo();
    try {
      const env = computeBlastRadius({
        gitRoot: repo,
        preset: "design",
        changeSet: { paths: ["skills/foo/SKILL.md", "tests/foo/x.test.ts"] },
      });
      expect(env.status).toBe("degraded");
      expect(env.backend).toBe("heuristic");
      expect(env.reason).toBe("graph-unavailable");
      expect(env.output?.change_scope.fileCount).toBe(2);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("explicit skip returns degraded with reason", () => {
    const repo = makeTempRepo();
    try {
      const env = computeBlastRadius({
        gitRoot: repo,
        preset: "design",
        changeSet: {},
        explicitSkip: true,
      });
      expect(env.status).toBe("degraded");
      expect(env.reason).toBe("explicit-skip");
      expect(env.output).toBeNull();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("computeAndPersist writes scratch file", () => {
    const repo = makeTempRepo();
    try {
      const { scratchPath } = computeAndPersist({
        gitRoot: repo,
        preset: "design",
        changeSet: { paths: ["hooks/foo.sh"] },
      });
      expect(fs.existsSync(scratchPath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(scratchPath, "utf8"));
      expect(parsed.backend).toBe("heuristic");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd tests/blast-radius && bun test compute.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/blast-radius/src/graph-backend-stub.ts skills/blast-radius/src/write-envelope.ts skills/blast-radius/src/compute.ts tests/blast-radius/compute.test.ts
git commit -m "feat(blast-radius): compute orchestrator and envelope scratch writer"
```

---

## Task 5: Lens presets + renderer

**Files:**

- Create: `skills/blast-radius/presets/design.md`
- Create: `skills/blast-radius/presets/pre-execution.md`
- Create: `skills/blast-radius/presets/completion.md`
- Create: `skills/blast-radius/src/render.ts`
- Create: `tests/blast-radius/render.test.ts`

- [ ] **Step 1: Write preset markdown files**

Create `skills/blast-radius/presets/design.md`:

```markdown
# Design preset

**Loud:** change_scope, failure_impact
**Quiet:** action_risk (one-line summary only)

**Decomposition flag:** when `change_scope` crosses SCHEMA decomposition thresholds, append:
> ⚠️ Scope may warrant splitting into sub-plans — review before approving the approach.

**Backend banner:** always state `backend` field honestly at the top.
```

Create `skills/blast-radius/presets/pre-execution.md`:

```markdown
# Pre-execution preset

**Loud:** action_risk
**Quiet:** change_scope, failure_impact (one-line each)

**Surface when:** `action_risk.level` >= SCHEMA `actionRisk.surfaceAt` (medium).

**Error policy:** when status is `error`, render "blast-radius unavailable" and recommend operator confirmation before proceeding.
```

Create `skills/blast-radius/presets/completion.md`:

```markdown
# Completion preset

**Loud:** change_scope, failure_impact (grounded in actual diff)
**Quiet:** action_risk unless next action matches push/force-push/release patterns
```

- [ ] **Step 2: Write render.ts**

Create `skills/blast-radius/src/render.ts`:

```typescript
import type { BlastRadiusEnvelope, BlastRadiusPreset } from "./envelope";
import { shouldFlagDecomposition, THRESHOLDS } from "./schema";

function backendBanner(envelope: BlastRadiusEnvelope): string {
  if (envelope.status === "error") {
    return `Blast-radius unavailable (reason: ${envelope.reason}).`;
  }
  const note =
    envelope.status === "degraded" && envelope.reason
      ? ` — ${envelope.reason}`
      : "";
  return `Backend: ${envelope.backend}${note}`;
}

export function renderOperatorReport(
  envelope: BlastRadiusEnvelope,
  preset: BlastRadiusPreset,
): string {
  const lines: string[] = ["## Blast-radius", "", backendBanner(envelope), ""];

  if (envelope.status === "error" || !envelope.output) {
    if (preset === "pre-execution") {
      lines.push("Unknown action risk — confirm with the operator before proceeding.");
    }
    return lines.join("\n");
  }

  const { change_scope, failure_impact, action_risk } = envelope.output;

  if (preset === "design" || preset === "completion") {
    lines.push(
      `**Change scope:** ${change_scope.fileCount} file(s), level ${change_scope.level}`,
      `- Shared infra touches: ${change_scope.sharedInfraFileCount}`,
      `- Cross-module edits: ${change_scope.crossModuleEditCount}`,
      `**Failure impact:** level ${failure_impact.level}, estimated fan-out ${failure_impact.estimatedFanOut}`,
    );
    if (failure_impact.sensitivePaths.length) {
      lines.push(`- Sensitive paths: ${failure_impact.sensitivePaths.join(", ")}`);
    }
    if (preset === "design" && shouldFlagDecomposition(change_scope)) {
      lines.push(
        "",
        "> ⚠️ Scope may warrant splitting into sub-plans — review before approving the approach.",
      );
    }
    lines.push("", `_Action risk (quiet): ${action_risk.level}_`);
  }

  if (preset === "pre-execution") {
    lines.push(
      `**Action risk:** ${action_risk.level}`,
      action_risk.tags.length ? `- Tags: ${action_risk.tags.join(", ")}` : "- Tags: (none)",
    );
    if (action_risk.rationale.length) {
      lines.push(...action_risk.rationale.map((r) => `- ${r}`));
    }
    const surface =
      action_risk.level === "high" ||
      (action_risk.level === "medium" && THRESHOLDS.actionRisk.surfaceAt === "medium");
    if (surface) {
      lines.push("", "**Operator confirmation required before this step.**");
    }
    lines.push(
      "",
      `_Scope: ${change_scope.fileCount} file(s), ${change_scope.level}; impact: ${failure_impact.level}_`,
    );
  }

  return lines.join("\n");
}
```

- [ ] **Step 3: Write render tests**

Create `tests/blast-radius/render.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { renderOperatorReport } from "../../skills/blast-radius/src/render";
import { sampleEnvelope, sampleOutput } from "./test-helpers";
import { shouldFlagDecomposition } from "../../skills/blast-radius/src/schema";

describe("renderOperatorReport", () => {
  test("design preset shows decomposition flag for wide scope", () => {
    const scope = {
      fileCount: 10,
      files: Array.from({ length: 10 }, (_, i) => `skills/m${i}/x.ts`),
      sharedInfraFileCount: 4,
      crossModuleEditCount: 3,
      level: "medium" as const,
    };
    expect(shouldFlagDecomposition(scope)).toBe(true);
    const text = renderOperatorReport(
      sampleEnvelope({ output: sampleOutput({ change_scope: scope }) }),
      "design",
    );
    expect(text).toContain("splitting into sub-plans");
    expect(text).toContain("Backend: heuristic");
  });

  test("pre-execution surfaces high action risk", () => {
    const text = renderOperatorReport(
      sampleEnvelope({
        output: sampleOutput({
          action_risk: { level: "high", tags: ["destructive-shell"], rationale: ["Matched destructive-shell"] },
        }),
      }),
      "pre-execution",
    );
    expect(text).toContain("Operator confirmation required");
    expect(text).toContain("destructive-shell");
  });

  test("error on pre-execution recommends confirmation", () => {
    const text = renderOperatorReport(
      sampleEnvelope({ status: "error", backend: "none", output: null, reason: "compute-error" }),
      "pre-execution",
    );
    expect(text).toContain("confirm with the operator");
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd tests/blast-radius && bun test render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/blast-radius/presets/ skills/blast-radius/src/render.ts tests/blast-radius/render.test.ts
git commit -m "feat(blast-radius): lens presets and operator renderer"
```

---

## Task 6: Bundle compute.cjs + .gitignore

**Files:**

- Create: `scripts/build-blast-radius.sh`
- Create: `skills/blast-radius/scripts/compute.cjs` (generated)
- Modify: `.gitignore`

- [ ] **Step 1: Write build script**

Create `scripts/build-blast-radius.sh`:

```bash
#!/usr/bin/env bash
# Build blast-radius TypeScript source into a bundled .cjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/blast-radius/src"
OUT_DIR="$SCRIPT_DIR/skills/blast-radius/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building blast-radius" >&2
  exit 1
fi

tmp="$(mktemp)"
bun build "$SRC_DIR/compute.ts" --target=node --format=cjs --outfile="$tmp"
dest="$OUT_DIR/compute.cjs"
mkdir -p "$OUT_DIR"
if ! diff -q "$tmp" "$dest" >/dev/null 2>&1; then
  mv "$tmp" "$dest"
else
  rm "$tmp"
fi

echo "built compute.cjs into $OUT_DIR/"
```

- [ ] **Step 2: Build and smoke-test CLI**

Run:
```bash
chmod +x scripts/build-blast-radius.sh
./scripts/build-blast-radius.sh
printf '{"gitRoot":"%s","preset":"design","changeSet":{"paths":["skills/a/SKILL.md"]}}' "$(git rev-parse --show-toplevel)" \
  | node skills/blast-radius/scripts/compute.cjs compute
```
Expected: JSON envelope with `"backend":"heuristic"` and `"reason":"graph-unavailable"`.

- [ ] **Step 3: Add .snowball/ to .gitignore**

Append to `.gitignore`:

```text
.snowball/
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build-blast-radius.sh skills/blast-radius/scripts/compute.cjs .gitignore
git commit -m "build: bundle blast-radius compute.cjs"
```

---

## Task 7: SKILL.md agent shell

**Files:**

- Create: `skills/blast-radius/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `skills/blast-radius/SKILL.md`:

````markdown
---
name: blast-radius
description: Use at lifecycle gates to surface change-scope, failure-impact, and action-risk for a proposed change set. Self-gates on trivial work. Degrades to heuristic when codebase-memory graph is unavailable (Plan 1); graph backend ships in a later plan.
---

# Blast-Radius Analysis

Composite blast-radius analysis for Snowball lifecycle gates. Produces a **status envelope** (see `SCHEMA.md`) and an operator-facing render for the calling gate's lens preset.

**Skip when:** the task is trivial (typo, formatting, one-line fix with no design tradeoffs) — same self-gating as `recalling-project-context`.

**Explicit skip:** if the operator asks to skip for this step, honor it and call compute with `"explicitSkip": true` (records `reason: explicit-skip` for the audit hook in Plan 4).

## Procedure

1. **Resolve repo root.** `git rev-parse --show-toplevel`. Stop if not a git repo.

2. **Build `changeSet`.** Per gate:
   - **Design (brainstorming):** projected paths for each approach being presented.
   - **Pre-execution (Plan 2):** paths the step will touch + `proposedAction` command text if any.
   - **Completion (Plan 2):** actual diff paths (`gitRef` defaults to merge base / HEAD as appropriate).

3. **Compute and persist.** Pipe JSON to the CLI:
   ```bash
   echo '<json>' | node skills/blast-radius/scripts/compute.cjs compute-and-persist
   ```
   where `<json>` matches `ComputeInput` in `SCHEMA.md` (includes `gitRoot`, `preset`, `changeSet`).

4. **Render for the operator.** Pipe envelope + preset:
   ```bash
   echo '<json>' | node skills/blast-radius/scripts/compute.cjs render
   ```
   where `<json>` is `{"envelope": <from step 3>, "preset": "<design|pre-execution|completion>"}`.

   Alternatively import `renderOperatorReport` logic by re-running render via a small inline node one-liner after compute — the bundled CLI is the supported path.

5. **Report** the rendered markdown to the operator. At the **design** gate this is report-only (no gating authority). State the `backend` field honestly.

## Phase 1 notes

- **Graph backend:** not yet wired (Plan 3). Expect `degraded` + `reason: graph-unavailable` + `backend: heuristic` on every run until then.
- **Audit hook:** Plan 4 reads `.snowball/blast-radius/last.json` on operator approval / Stop — do not delete that file during the session.
- **Harness portability:** this skill file ships everywhere; the audit hook is CC + Cursor only (Plan 4).

## For maintainers

Edit `skills/blast-radius/src/*.ts`, then:

```bash
bash scripts/build-blast-radius.sh
```

Bundled with Bun; consumers invoke `node` against committed `scripts/compute.cjs`.
````

- [ ] **Step 2: Lint markdown**

Run: `pre-commit run markdownlint-cli2 --files skills/blast-radius/SKILL.md`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add skills/blast-radius/SKILL.md
git commit -m "feat(blast-radius): SKILL.md agent shell"
```

---

## Task 8: Brainstorming integration

**Files:**

- Modify: `skills/brainstorming/SKILL.md`

- [ ] **Step 1: Add blast-radius invocation to checklist step 5**

In the checklist, replace step 5's line. `old_string`:

```text
5. **Propose 2-3 approaches** — with trade-offs and your recommendation
```

`new_string`:

```text
5. **Propose 2-3 approaches** — with trade-offs and your recommendation; once alternatives are stable, invoke `snowball:blast-radius` with the `design` preset and attach per-approach scope/impact estimates (see Blast-Radius at design-time below)
```

- [ ] **Step 2: Add prose section after "Exploring approaches" bullets**

Find this bullet under **Exploring approaches:**

```text
- **OPTIONAL SUB-SKILL (second-model perspective):** At the same decision point, if the M2 brain-jam companion was offered and accepted this session, you may delegate to `m2-brainstorm:brain-jam` for a second-model perspective on the stable alternatives. See the M2 Brain-Jam Companion section below. Complementary to structured-argumentation: argdown structures your own reasoning, the jam brings MiniMax's.
```

Append immediately after it:

```text
- **OPTIONAL SUB-SKILL (scope sizing):** At the same decision point, invoke `snowball:blast-radius` with preset `design`. For each approach, pass projected `changeSet.paths` to `compute-and-persist`, render, and attach the scope/impact summary to the approach presentation. Report-only at this gate — it right-sizes the decision before the user picks. Skip for trivial brainstorms (same self-gating as the blast-radius skill). If the operator skips, use `explicitSkip: true`.
```

- [ ] **Step 3: Add "Blast-Radius at design-time" section at end of file**

Append before the final line of the file (or at end if no trailing section):

````markdown
## Blast-Radius at design-time

After alternatives are stable and before the user picks one:

1. Invoke `snowball:blast-radius` once per approach (or once for the recommended approach if the others are clearly smaller — use judgment, but never skip for non-trivial cross-cutting work).
2. Pass projected paths the approach would touch as `changeSet.paths`.
3. Surface the rendered report under each approach heading. The operator should see `backend: heuristic` honestly until the graph backend lands (Plan 3).
4. If the decomposition flag appears, call it out explicitly when making your recommendation.

This is **report-only** at design-time — it does not block brainstorming.
````

- [ ] **Step 4: Verify markdownlint + structural checks**

Run:
```bash
pre-commit run markdownlint-cli2 --files skills/brainstorming/SKILL.md
rg -n 'snowball:blast-radius' skills/brainstorming/SKILL.md
rg -n 'Blast-Radius at design-time' skills/brainstorming/SKILL.md
```
Expected: markdownlint PASS; both `rg` lines match exactly once.

- [ ] **Step 5: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat(brainstorming): invoke blast-radius at approach presentation"
```

---

## Task 9: Pre-commit wiring + full test suite

**Files:**

- Modify: `.pre-commit-config.yaml`

- [ ] **Step 1: Extend oxlint/oxfmt excludes**

Update BOTH `oxlint` and `oxfmt` exclude lines to add `blast-radius`:

```yaml
        exclude: ^skills/(decision-logging|structured-argumentation|syncing-decisions-to-memory|recalling-project-context|blast-radius)/scripts/
```

- [ ] **Step 2: Add build + test hooks**

After the `recalling-project-context` hooks, add:

```yaml
      - id: build-blast-radius
        name: build blast-radius bundle
        entry: scripts/build-blast-radius.sh
        language: system
        files: ^skills/blast-radius/src/.*\.ts$
        pass_filenames: false

      - id: bun-test-blast-radius
        name: bun test blast-radius
        entry: bash -c 'cd tests/blast-radius && bun test'
        language: system
        files: ^skills/blast-radius/(src|scripts)/|^tests/blast-radius/
        pass_filenames: false
```

- [ ] **Step 3: Run full test suite**

Run: `cd tests/blast-radius && bun test`
Expected: all tests PASS.

- [ ] **Step 4: Run pre-commit hooks**

Run: `pre-commit run build-blast-radius --all-files && pre-commit run bun-test-blast-radius --all-files`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "build: pre-commit wiring for blast-radius"
```

---

## Task 10: Plan 1 smoke verification

**Files:** (none — verification only)

- [ ] **Step 1: End-to-end CLI smoke**

Run:
```bash
ROOT="$(git rev-parse --show-toplevel)"
JSON=$(printf '{"gitRoot":"%s","preset":"design","changeSet":{"paths":["skills/brainstorming/SKILL.md","tests/brainstorming/smoke.sh"]}}' "$ROOT")
echo "$JSON" | node skills/blast-radius/scripts/compute.cjs compute-and-persist | tee /tmp/br-envelope.json
ENVELOPE=$(echo "$JSON" | node skills/blast-radius/scripts/compute.cjs compute)
printf '{"envelope":%s,"preset":"design"}' "$ENVELOPE" | node skills/blast-radius/scripts/compute.cjs render
test -f "$ROOT/.snowball/blast-radius/last.json" && echo "scratch ok"
```
Expected: envelope JSON printed; render contains `## Blast-radius` and `Backend: heuristic`; scratch file exists.

- [ ] **Step 2: Brainstorming integration smoke**

Run:
```bash
rg -n 'snowball:blast-radius|Blast-Radius at design-time|design preset' skills/brainstorming/SKILL.md
```
Expected: at least 3 matches.

- [ ] **Step 3: Spec coverage checklist (self-review)**

Confirm Plan 1 implements these spec items (others deferred to Plans 2–4):

| Spec requirement | Plan 1 task |
|---|---|
| Envelope contract (`status`, `backend`, `output`, `reason`) | Task 1 |
| Reason-code closed enum | Task 2 |
| Heuristic backend (git diff + file patterns + action-risk rubric) | Task 2–3 |
| Graph backend tries first, falls back | Task 4 (stub + fallback) |
| `.snowball/blast-radius/last.json` writer | Task 4 |
| Design preset render | Task 5 |
| `snowball:blast-radius` skill manifest | Task 7 |
| Brainstorming integration at approach step | Task 8 |
| Envelope + heuristic + render tests | Tasks 1–5, 9 |
| Audit hook | Plan 4 |
| Other lifecycle skills | Plan 2 |
| Real graph MCP backend | Plan 3 |

- [ ] **Step 4: Final commit if any fixups**

Only if Step 1–2 exposed issues. Otherwise, no commit needed.

---

## Self-review (plan author checklist)

- [x] Spec coverage table above — every Plan 1 scope item maps to a task.
- [x] No placeholders — thresholds pinned in Task 2; code shown for every implementation step.
- [x] Type consistency — `ComputeInput`, `BlastRadiusEnvelope`, and CLI commands match across tasks.
- [x] Plan 1 produces working software: brainstorming can invoke blast-radius with heuristic output before Plans 2–4 land.
