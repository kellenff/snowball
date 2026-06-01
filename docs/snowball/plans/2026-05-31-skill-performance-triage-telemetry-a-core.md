# Skill-Performance Triage Telemetry — Plan A: Core Analyzer

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure analyzer core — read CC transcripts, segment skill windows (flat), compute marginal-token + reliability metrics, aggregate into `CandidateRecord`s, rank by a tunable triage score, and write canonical JSON. Produces the ranked port-candidate data; OTel/Prometheus projections and the operator skill are **Plan B**.

**Architecture:** Pure functional core (segment → measure → aggregate → rank) behind a `TranscriptSource` edge and a `JsonExporter` edge. A minimal `analyze` CLI wires them and emits `candidates.json`. Mirrors the `skills/blast-radius` module layout.

**Tech Stack:** TypeScript bundled with Bun (`bun build --target=node --format=cjs`), `bun:test`, zero runtime deps.

**Spec:** `docs/snowball/specs/2026-05-31-skill-performance-triage-telemetry-design.md` (segmentation is **flat** — the spec's "Capture & segmentation" section explains why a stack is not implementable; no end-of-skill marker exists in the transcript).

**Depended on by:** Plan B (`…-b-projections.md`) consumes the modules and extends `analyze.ts`.

---

## File Structure (Plan A)

| File | Responsibility |
|---|---|
| `skills/measuring-skill-performance/src/types.ts` | Shared types incl. the `CandidateRecord` seam |
| `skills/measuring-skill-performance/src/stats.ts` | `percentile()` |
| `skills/measuring-skill-performance/src/segmenter.ts` | `Message[] → SkillWindow[]` (flat) |
| `skills/measuring-skill-performance/src/window-metrics.ts` | `SkillWindow → WindowMetrics` |
| `skills/measuring-skill-performance/src/aggregator.ts` | `SkillWindow[] → CandidateRecord[]` |
| `skills/measuring-skill-performance/src/ranker.ts` | rank + `defaultTriageScore` |
| `skills/measuring-skill-performance/src/transcript-reader.ts` | `TranscriptSource` + `ClaudeCodeTranscriptReader` |
| `skills/measuring-skill-performance/src/exporters/json-exporter.ts` | canonical `candidates.json` + `windows.jsonl` |
| `skills/measuring-skill-performance/src/analyze.ts` | minimal CLI (JSON-only); extended in Plan B |
| `skills/measuring-skill-performance/scripts/skill-metrics.cjs` | built bundle |
| `scripts/build-measuring-skill-performance.sh` | build script |
| `tests/measuring-skill-performance/**` | tests + fixtures |

Modified shared infra: `tsconfig.json`, `.pre-commit-config.yaml`, `.gitignore`.

---

## Task 1: Scaffolding & shared types

**Files:**
- Create: `skills/measuring-skill-performance/src/types.ts`
- Create: `tests/measuring-skill-performance/package.json`
- Create: `scripts/build-measuring-skill-performance.sh`
- Modify: `tsconfig.json`, `.pre-commit-config.yaml`, `.gitignore`

- [ ] **Step 1: Create the shared types**

`skills/measuring-skill-performance/src/types.ts`:

```ts
export interface TokenUsage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolUseId: string;
  isError: boolean;
}

export interface Message {
  index: number;
  sessionId: string;
  role: "user" | "assistant" | "system";
  timestamp: string | null;
  usage: TokenUsage | null;
  hasUserText: boolean;
  toolUses: ToolUse[];
  toolResults: ToolResult[];
}

export interface SkillWindow {
  skillName: string;
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  messageSpan: [number, number];
  messages: Message[];
}

export interface WindowMetrics {
  marginalTokens: number; // output_tokens + cache_creation_input_tokens
  totalTokens: number; // + input_tokens + cache_read_input_tokens
  toolCalls: number;
  toolErrors: number;
  retries: number;
}

export interface TokenStats {
  total: number;
  p50: number;
  p95: number;
}

export interface SampleWindowRef {
  sessionId: string;
  startedAt: string | null;
  messageSpan: [number, number];
  marginalTokens: number;
}

export interface CandidateRecord {
  skill_name: string;
  invocation_count: number;
  tokens: {
    marginal: TokenStats;
    billed_total: { p50: number; p95: number };
  };
  reliability: {
    tool_calls: number;
    tool_error_rate: number;
    retry_rate: number;
  };
  triage_score: number;
  sample_windows: SampleWindowRef[];
  approximations: string[];
}

export type AnalyzerStatus = "success" | "degraded" | "error";

export type AnalyzerReason =
  | "transcript-unreadable"
  | "schema-drift"
  | "no-skill-invocations"
  | "otlp-unreachable";

export type TransportPath = "otlp" | "prometheus-file" | "json-only";

export interface AnalyzerEnvelope {
  status: AnalyzerStatus;
  source: string;
  windowCount: number;
  droppedWindowCount: number;
  transport: TransportPath;
  reason: AnalyzerReason | null;
  candidates: CandidateRecord[];
}

export const FLAT_SEGMENTATION_APPROX = "flat-segmentation-no-nesting";
export const SUBAGENT_LUMPED_APPROX = "subagent-lumped";
```

- [ ] **Step 2: Create the test package**

`tests/measuring-skill-performance/package.json`:

```json
{
  "name": "measuring-skill-performance-tests",
  "private": true
}
```

- [ ] **Step 3: Create the build script**

`scripts/build-measuring-skill-performance.sh`:

```bash
#!/usr/bin/env bash
# Build measuring-skill-performance TypeScript source into a bundled .cjs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/skills/measuring-skill-performance/src"
OUT_DIR="$SCRIPT_DIR/skills/measuring-skill-performance/scripts"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building measuring-skill-performance" >&2
  exit 1
fi

ENTRIES=(
  "analyze:$OUT_DIR/skill-metrics.cjs"
)

for spec in "${ENTRIES[@]}"; do
  entry="${spec%%:*}"
  dest="${spec#*:}"
  tmp="$(mktemp)"
  bun build "$SRC_DIR/$entry.ts" --target=node --format=cjs --outfile="$tmp"
  mkdir -p "$(dirname "$dest")"
  if ! diff -q "$tmp" "$dest" >/dev/null 2>&1; then
    mv "$tmp" "$dest"
  else
    rm "$tmp"
  fi
done

echo "built ${#ENTRIES[@]} measuring-skill-performance bundles"
```

Then: `chmod +x scripts/build-measuring-skill-performance.sh`

- [ ] **Step 4: Wire tsconfig include**

In `tsconfig.json`, append to the `include` array (after the `blast-radius` entries):

```json
    "skills/measuring-skill-performance/src/**/*",
    "tests/measuring-skill-performance/**/*.ts"
```

- [ ] **Step 5: Add pre-commit hooks**

In `.pre-commit-config.yaml`, after the `bun-test-blast-radius` block:

```yaml
      - id: build-measuring-skill-performance
        name: build measuring-skill-performance bundle
        entry: scripts/build-measuring-skill-performance.sh
        language: system
        files: ^skills/measuring-skill-performance/src/.*\.ts$
        pass_filenames: false

      - id: bun-test-measuring-skill-performance
        name: bun test measuring-skill-performance
        entry: bash -c 'cd tests/measuring-skill-performance && bun test'
        language: system
        files: ^skills/measuring-skill-performance/(src|scripts)/|^tests/measuring-skill-performance/
        pass_filenames: false
```

- [ ] **Step 6: Ignore runtime output**

Ensure `.gitignore` covers `.snowball/metrics/` (add `.snowball/metrics/` if `.snowball/` is not already ignored).

- [ ] **Step 7: Verify type-check passes**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add skills/measuring-skill-performance/src/types.ts \
  tests/measuring-skill-performance/package.json \
  scripts/build-measuring-skill-performance.sh \
  tsconfig.json .pre-commit-config.yaml .gitignore
git commit -m "feat(skill-metrics): scaffold types, build script, test harness"
```

---

## Task 2: percentile helper (`stats.ts`)

**Files:**
- Create: `skills/measuring-skill-performance/src/stats.ts`
- Test: `tests/measuring-skill-performance/stats.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/stats.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { percentile } from "../../skills/measuring-skill-performance/src/stats";

describe("percentile (nearest-rank)", () => {
  test("returns 0 for empty input", () => {
    expect(percentile([], 50)).toBe(0);
  });
  test("p50 of 1..10 is the 5th value", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });
  test("p95 of 1..10 is the 10th value", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });
  test("sorts unsorted input first", () => {
    expect(percentile([10, 1, 5], 50)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test stats.test.ts`
Expected: FAIL — cannot find module `stats`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/stats.ts`:

```ts
/** Nearest-rank percentile. p in [0, 100]. Returns 0 for empty input. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test stats.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/stats.ts tests/measuring-skill-performance/stats.test.ts
git commit -m "feat(skill-metrics): nearest-rank percentile helper"
```

---

## Task 3: SkillSegmenter (`segmenter.ts`)

**Files:**
- Create: `skills/measuring-skill-performance/src/segmenter.ts`
- Test: `tests/measuring-skill-performance/segmenter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/segmenter.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { segmentSkillWindows } from "../../skills/measuring-skill-performance/src/segmenter";
import type { Message, ToolUse } from "../../skills/measuring-skill-performance/src/types";

function msg(partial: Partial<Message> & { index: number }): Message {
  return {
    sessionId: "s1",
    role: "assistant",
    timestamp: null,
    usage: null,
    hasUserText: false,
    toolUses: [],
    toolResults: [],
    ...partial,
  };
}

function skillUse(skill: string): ToolUse {
  return { id: `tu-${skill}`, name: "Skill", input: { skill } };
}

describe("segmentSkillWindows (flat)", () => {
  test("no Skill tool_use yields no windows", () => {
    expect(segmentSkillWindows([msg({ index: 0 }), msg({ index: 1 })])).toEqual([]);
  });

  test("two sequential skills become two windows", () => {
    const messages = [
      msg({ index: 0, toolUses: [skillUse("a")] }),
      msg({ index: 1 }),
      msg({ index: 2, toolUses: [skillUse("b")] }),
      msg({ index: 3 }),
    ];
    const windows = segmentSkillWindows(messages);
    expect(windows.map((w) => w.skillName)).toEqual(["a", "b"]);
    expect(windows[0].messages.map((m) => m.index)).toEqual([1]);
    expect(windows[1].messages.map((m) => m.index)).toEqual([3]);
  });

  test("a user-text turn closes the open window", () => {
    const messages = [
      msg({ index: 0, toolUses: [skillUse("a")] }),
      msg({ index: 1 }),
      msg({ index: 2, role: "user", hasUserText: true }),
      msg({ index: 3 }),
    ];
    const windows = segmentSkillWindows(messages);
    expect(windows).toHaveLength(1);
    expect(windows[0].messages.map((m) => m.index)).toEqual([1]);
  });

  test("the invoking message attributes to the prior (parent) window", () => {
    const messages = [
      msg({ index: 0, toolUses: [skillUse("outer")] }),
      msg({ index: 1, toolUses: [skillUse("inner")] }),
      msg({ index: 2 }),
    ];
    const windows = segmentSkillWindows(messages);
    expect(windows.map((w) => w.skillName)).toEqual(["outer", "inner"]);
    expect(windows[0].messages.map((m) => m.index)).toEqual([1]);
    expect(windows[1].messages.map((m) => m.index)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test segmenter.test.ts`
Expected: FAIL — cannot find module `segmenter`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/segmenter.ts`:

```ts
import type { Message, SkillWindow, ToolUse } from "./types";

function skillName(use: ToolUse): string | null {
  if (use.name !== "Skill") return null;
  const input = use.input as { skill?: unknown } | null;
  return input && typeof input.skill === "string" ? input.skill : null;
}

/**
 * Flat segmentation: a window runs from one Skill tool_use to the next Skill
 * tool_use, a user-text turn, or session end. The invoking message's tokens
 * attribute to the open (parent) window before the new one opens. Messages
 * before the first skill are unattributed root work.
 */
export function segmentSkillWindows(messages: Message[]): SkillWindow[] {
  const windows: SkillWindow[] = [];
  let current: SkillWindow | null = null;

  const close = () => {
    if (current) windows.push(current);
    current = null;
  };

  for (const m of messages) {
    if (m.role === "user" && m.hasUserText) {
      close();
      continue;
    }
    if (current && m.usage) {
      current.messages.push(m);
      current.endedAt = m.timestamp;
      current.messageSpan = [current.messageSpan[0], m.index];
    }
    for (const use of m.toolUses) {
      const name = skillName(use);
      if (name === null) continue;
      close();
      current = {
        skillName: name,
        sessionId: m.sessionId,
        startedAt: m.timestamp,
        endedAt: m.timestamp,
        messageSpan: [m.index, m.index],
        messages: [],
      };
    }
  }

  close();
  return windows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test segmenter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/segmenter.ts tests/measuring-skill-performance/segmenter.test.ts
git commit -m "feat(skill-metrics): flat skill-window segmentation"
```

---

## Task 4: WindowMetrics (`window-metrics.ts`)

**Files:**
- Create: `skills/measuring-skill-performance/src/window-metrics.ts`
- Test: `tests/measuring-skill-performance/window-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/window-metrics.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { computeWindowMetrics } from "../../skills/measuring-skill-performance/src/window-metrics";
import type { Message, SkillWindow } from "../../skills/measuring-skill-performance/src/types";

function assistant(index: number, partial: Partial<Message> = {}): Message {
  return {
    index,
    sessionId: "s1",
    role: "assistant",
    timestamp: null,
    usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 50, output_tokens: 10 },
    hasUserText: false,
    toolUses: [],
    toolResults: [],
    ...partial,
  };
}

function window(messages: Message[]): SkillWindow {
  return {
    skillName: "a",
    sessionId: "s1",
    startedAt: null,
    endedAt: null,
    messageSpan: [messages[0]?.index ?? 0, messages.at(-1)?.index ?? 0],
    messages,
  };
}

describe("computeWindowMetrics", () => {
  test("marginal = output + cache_creation; total adds input + cache_read", () => {
    const m = computeWindowMetrics(window([assistant(1)]));
    expect(m.marginalTokens).toBe(30);
    expect(m.totalTokens).toBe(180);
  });

  test("counts tool calls and errors", () => {
    const w = window([
      assistant(1, { toolUses: [{ id: "t1", name: "Bash", input: { command: "ls" } }] }),
      assistant(2, { toolResults: [{ toolUseId: "t1", isError: true }] }),
    ]);
    const m = computeWindowMetrics(w);
    expect(m.toolCalls).toBe(1);
    expect(m.toolErrors).toBe(1);
  });

  test("retry = repeated identical (name+input) tool_use within the window", () => {
    const w = window([
      assistant(1, { toolUses: [{ id: "t1", name: "Bash", input: { command: "ls" } }] }),
      assistant(2, { toolUses: [{ id: "t2", name: "Bash", input: { command: "ls" } }] }),
    ]);
    const m = computeWindowMetrics(w);
    expect(m.toolCalls).toBe(2);
    expect(m.retries).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test window-metrics.test.ts`
Expected: FAIL — cannot find module `window-metrics`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/window-metrics.ts`:

```ts
import type { SkillWindow, WindowMetrics } from "./types";

export function computeWindowMetrics(window: SkillWindow): WindowMetrics {
  let marginalTokens = 0;
  let totalTokens = 0;
  let toolCalls = 0;
  let toolErrors = 0;
  let retries = 0;
  const seen = new Set<string>();

  for (const m of window.messages) {
    if (m.usage) {
      const marginal = m.usage.output_tokens + m.usage.cache_creation_input_tokens;
      marginalTokens += marginal;
      totalTokens += marginal + m.usage.input_tokens + m.usage.cache_read_input_tokens;
    }
    for (const use of m.toolUses) {
      if (use.name === "Skill") continue;
      toolCalls += 1;
      const key = `${use.name}:${JSON.stringify(use.input)}`;
      if (seen.has(key)) retries += 1;
      else seen.add(key);
    }
    for (const res of m.toolResults) {
      if (res.isError) toolErrors += 1;
    }
  }

  return { marginalTokens, totalTokens, toolCalls, toolErrors, retries };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test window-metrics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/window-metrics.ts tests/measuring-skill-performance/window-metrics.test.ts
git commit -m "feat(skill-metrics): per-window token + reliability metrics"
```

---

## Task 5: Aggregator (`aggregator.ts`)

**Files:**
- Create: `skills/measuring-skill-performance/src/aggregator.ts`
- Test: `tests/measuring-skill-performance/aggregator.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/aggregator.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { aggregateCandidates } from "../../skills/measuring-skill-performance/src/aggregator";
import type { Message, SkillWindow } from "../../skills/measuring-skill-performance/src/types";

function win(skill: string, marginal: number, opts: { toolCalls?: number; toolErrors?: number } = {}): SkillWindow {
  const messages: Message[] = [
    {
      index: 0,
      sessionId: "s1",
      role: "assistant",
      timestamp: "2026-05-31T00:00:00Z",
      usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: marginal },
      hasUserText: false,
      toolUses: Array.from({ length: opts.toolCalls ?? 0 }, (_, i) => ({ id: `t${i}`, name: "Bash", input: { i } })),
      toolResults: Array.from({ length: opts.toolErrors ?? 0 }, (_, i) => ({ toolUseId: `t${i}`, isError: true })),
    },
  ];
  return { skillName: skill, sessionId: "s1", startedAt: "2026-05-31T00:00:00Z", endedAt: null, messageSpan: [0, 0], messages };
}

describe("aggregateCandidates", () => {
  test("groups by skill and counts invocations", () => {
    const records = aggregateCandidates([win("a", 100), win("a", 300), win("b", 50)]);
    const a = records.find((r) => r.skill_name === "a")!;
    expect(a.invocation_count).toBe(2);
    expect(a.tokens.marginal.total).toBe(400);
    expect(a.tokens.marginal.p50).toBe(100);
  });

  test("computes error rate over tool calls", () => {
    const records = aggregateCandidates([win("a", 10, { toolCalls: 4, toolErrors: 1 })]);
    expect(records[0].reliability.tool_calls).toBe(4);
    expect(records[0].reliability.tool_error_rate).toBeCloseTo(0.25, 5);
  });

  test("stamps the flat-segmentation approximation and caps sample windows", () => {
    const records = aggregateCandidates(Array.from({ length: 10 }, () => win("a", 10)));
    expect(records[0].approximations).toContain("flat-segmentation-no-nesting");
    expect(records[0].sample_windows.length).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test aggregator.test.ts`
Expected: FAIL — cannot find module `aggregator`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/aggregator.ts`:

```ts
import type { CandidateRecord, SampleWindowRef, SkillWindow } from "./types";
import { FLAT_SEGMENTATION_APPROX } from "./types";
import { computeWindowMetrics } from "./window-metrics";
import { percentile } from "./stats";

const MAX_SAMPLE_WINDOWS = 5;

export function aggregateCandidates(windows: SkillWindow[]): CandidateRecord[] {
  const bySkill = new Map<string, SkillWindow[]>();
  for (const w of windows) {
    const list = bySkill.get(w.skillName) ?? [];
    list.push(w);
    bySkill.set(w.skillName, list);
  }

  const records: CandidateRecord[] = [];
  for (const [skill, group] of bySkill) {
    const metrics = group.map((w) => ({ window: w, m: computeWindowMetrics(w) }));
    const marginal = metrics.map((x) => x.m.marginalTokens);
    const billed = metrics.map((x) => x.m.totalTokens);
    const toolCalls = metrics.reduce((s, x) => s + x.m.toolCalls, 0);
    const toolErrors = metrics.reduce((s, x) => s + x.m.toolErrors, 0);
    const retries = metrics.reduce((s, x) => s + x.m.retries, 0);

    const sample_windows: SampleWindowRef[] = metrics
      .slice()
      .sort((a, b) => b.m.marginalTokens - a.m.marginalTokens)
      .slice(0, MAX_SAMPLE_WINDOWS)
      .map((x) => ({
        sessionId: x.window.sessionId,
        startedAt: x.window.startedAt,
        messageSpan: x.window.messageSpan,
        marginalTokens: x.m.marginalTokens,
      }));

    records.push({
      skill_name: skill,
      invocation_count: group.length,
      tokens: {
        marginal: {
          total: marginal.reduce((s, v) => s + v, 0),
          p50: percentile(marginal, 50),
          p95: percentile(marginal, 95),
        },
        billed_total: { p50: percentile(billed, 50), p95: percentile(billed, 95) },
      },
      reliability: {
        tool_calls: toolCalls,
        tool_error_rate: toolCalls === 0 ? 0 : toolErrors / toolCalls,
        retry_rate: toolCalls === 0 ? 0 : retries / toolCalls,
      },
      triage_score: 0,
      sample_windows,
      approximations: [FLAT_SEGMENTATION_APPROX],
    });
  }

  return records;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test aggregator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/aggregator.ts tests/measuring-skill-performance/aggregator.test.ts
git commit -m "feat(skill-metrics): aggregate windows into candidate records"
```

---

## Task 6: Ranker + triage score (`ranker.ts`) — OPERATOR CONTRIBUTION

**Files:**
- Create: `skills/measuring-skill-performance/src/ranker.ts`
- Test: `tests/measuring-skill-performance/ranker.test.ts`

> **Operator contribution (learning mode):** `defaultTriageScore` encodes *your* port-priority policy. The default below matches the spec; confirm or tune it. The signature is fixed (`(c: CandidateRecord) => number`).

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/ranker.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { rankCandidates, defaultTriageScore } from "../../skills/measuring-skill-performance/src/ranker";
import type { CandidateRecord } from "../../skills/measuring-skill-performance/src/types";

function rec(name: string, invocations: number, p50: number, errorRate: number): CandidateRecord {
  return {
    skill_name: name,
    invocation_count: invocations,
    tokens: { marginal: { total: 0, p50, p95: 0 }, billed_total: { p50: 0, p95: 0 } },
    reliability: { tool_calls: 10, tool_error_rate: errorRate, retry_rate: 0 },
    triage_score: 0,
    sample_windows: [],
    approximations: [],
  };
}

describe("defaultTriageScore", () => {
  test("= invocations × marginal_p50 × (1 + error_rate)", () => {
    expect(defaultTriageScore(rec("a", 42, 980, 0.04))).toBeCloseTo(42806.4, 1);
  });
});

describe("rankCandidates", () => {
  test("sorts descending by score and writes triage_score onto each record", () => {
    const ranked = rankCandidates([rec("cheap", 1, 10, 0), rec("pricey", 100, 1000, 0)], defaultTriageScore);
    expect(ranked.map((r) => r.skill_name)).toEqual(["pricey", "cheap"]);
    expect(ranked[0].triage_score).toBe(100000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test ranker.test.ts`
Expected: FAIL — cannot find module `ranker`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/ranker.ts`:

```ts
import type { CandidateRecord } from "./types";

export type TriageScoreFn = (candidate: CandidateRecord) => number;

/** OPERATOR-OWNED POLICY. Default per spec: volume × marginal p50 × (1 + error rate). */
export const defaultTriageScore: TriageScoreFn = (c) =>
  c.invocation_count * c.tokens.marginal.p50 * (1 + c.reliability.tool_error_rate);

export function rankCandidates(
  candidates: CandidateRecord[],
  score: TriageScoreFn,
): CandidateRecord[] {
  return candidates
    .map((c) => ({ ...c, triage_score: score(c) }))
    .sort((a, b) => b.triage_score - a.triage_score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test ranker.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/ranker.ts tests/measuring-skill-performance/ranker.test.ts
git commit -m "feat(skill-metrics): triage ranking with operator-owned score"
```

---

## Task 7: ClaudeCodeTranscriptReader + contract test

**Files:**
- Create: `skills/measuring-skill-performance/src/transcript-reader.ts`
- Create: `tests/measuring-skill-performance/fixtures/sample-transcript.jsonl`
- Test: `tests/measuring-skill-performance/transcript-reader.contract.test.ts`

- [ ] **Step 1: Build the fixture**

`tests/measuring-skill-performance/fixtures/sample-transcript.jsonl` (one JSON object per line; exercises usage, two Skill calls, a non-Skill tool with an error, and a user-text boundary):

```jsonl
{"type":"assistant","sessionId":"sess-1","timestamp":"2026-05-31T00:00:01Z","message":{"usage":{"input_tokens":1000,"cache_creation_input_tokens":200,"cache_read_input_tokens":0,"output_tokens":50},"content":[{"type":"tool_use","id":"u1","name":"Skill","input":{"skill":"snowball:brainstorming"}}]}}
{"type":"assistant","sessionId":"sess-1","timestamp":"2026-05-31T00:00:02Z","message":{"usage":{"input_tokens":1200,"cache_creation_input_tokens":0,"cache_read_input_tokens":1000,"output_tokens":80},"content":[{"type":"tool_use","id":"u2","name":"Bash","input":{"command":"ls"}}]}}
{"type":"user","sessionId":"sess-1","timestamp":"2026-05-31T00:00:03Z","message":{"content":[{"type":"tool_result","tool_use_id":"u2","is_error":true,"content":"error"}]}}
{"type":"assistant","sessionId":"sess-1","timestamp":"2026-05-31T00:00:04Z","message":{"usage":{"input_tokens":1300,"cache_creation_input_tokens":0,"cache_read_input_tokens":1100,"output_tokens":40},"content":[{"type":"tool_use","id":"u3","name":"Skill","input":{"skill":"snowball:blast-radius"}}]}}
{"type":"assistant","sessionId":"sess-1","timestamp":"2026-05-31T00:00:05Z","message":{"usage":{"input_tokens":1400,"cache_creation_input_tokens":0,"cache_read_input_tokens":1200,"output_tokens":30},"content":[{"type":"text","text":"done"}]}}
{"type":"user","sessionId":"sess-1","timestamp":"2026-05-31T00:00:06Z","message":{"content":[{"type":"text","text":"next task please"}]}}
```

> Optional: also replace this with a real trimmed transcript later to confirm `is_error`'s exact shape against production data; the synthetic fixture above matches the schema verified during design.

- [ ] **Step 2: Write the failing contract test**

`tests/measuring-skill-performance/transcript-reader.contract.test.ts`:

```ts
import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { ClaudeCodeTranscriptReader } from "../../skills/measuring-skill-performance/src/transcript-reader";

const FIXTURE = path.join(import.meta.dir, "fixtures", "sample-transcript.jsonl");

describe("ClaudeCodeTranscriptReader (contract)", () => {
  const messages = new ClaudeCodeTranscriptReader().read(FIXTURE);

  test("normalizes assistant usage", () => {
    expect(messages[0].usage).toEqual({
      input_tokens: 1000,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 0,
      output_tokens: 50,
    });
  });
  test("extracts Skill tool_use with skill name", () => {
    expect(messages[0].toolUses[0]).toMatchObject({ name: "Skill", input: { skill: "snowball:brainstorming" } });
  });
  test("flags tool errors and user-text boundaries", () => {
    expect(messages.find((m) => m.toolResults.some((r) => r.isError))).toBeDefined();
    expect(messages.find((m) => m.role === "user" && m.hasUserText)).toBeDefined();
  });
  test("assigns monotonic indices and the session id", () => {
    expect(messages.map((m) => m.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(messages.every((m) => m.sessionId === "sess-1")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test transcript-reader.contract.test.ts`
Expected: FAIL — cannot find module `transcript-reader`.

- [ ] **Step 4: Write minimal implementation**

`skills/measuring-skill-performance/src/transcript-reader.ts`:

```ts
import * as fs from "node:fs";
import type { Message, ToolResult, ToolUse, TokenUsage } from "./types";

export interface TranscriptSource {
  read(transcriptPath: string): Message[];
}

interface RawContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  text?: string;
}

interface RawLine {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  message?: { usage?: Partial<TokenUsage>; content?: RawContentBlock[] | string };
}

function normalizeUsage(usage: Partial<TokenUsage> | undefined): TokenUsage | null {
  if (!usage) return null;
  return {
    input_tokens: usage.input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  };
}

export class ClaudeCodeTranscriptReader implements TranscriptSource {
  read(transcriptPath: string): Message[] {
    const raw = fs.readFileSync(transcriptPath, "utf8");
    const messages: Message[] = [];
    let index = 0;

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: RawLine;
      try {
        parsed = JSON.parse(trimmed) as RawLine;
      } catch {
        continue;
      }
      if (parsed.type !== "assistant" && parsed.type !== "user" && parsed.type !== "system") continue;

      const content = parsed.message?.content;
      const blocks: RawContentBlock[] = Array.isArray(content) ? content : [];
      const toolUses: ToolUse[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input ?? {} }));
      const toolResults: ToolResult[] = blocks
        .filter((b) => b.type === "tool_result")
        .map((b) => ({ toolUseId: b.tool_use_id ?? "", isError: b.is_error === true }));
      const hasUserText =
        parsed.type === "user" &&
        (typeof content === "string" ? content.trim().length > 0 : blocks.some((b) => b.type === "text"));

      messages.push({
        index: index++,
        sessionId: parsed.sessionId ?? "",
        role: parsed.type,
        timestamp: parsed.timestamp ?? null,
        usage: normalizeUsage(parsed.message?.usage),
        hasUserText,
        toolUses,
        toolResults,
      });
    }

    return messages;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test transcript-reader.contract.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add skills/measuring-skill-performance/src/transcript-reader.ts \
  tests/measuring-skill-performance/transcript-reader.contract.test.ts \
  tests/measuring-skill-performance/fixtures/sample-transcript.jsonl
git commit -m "feat(skill-metrics): CC transcript reader + contract test"
```

---

## Task 8: JSON exporter (canonical) (`exporters/json-exporter.ts`)

**Files:**
- Create: `skills/measuring-skill-performance/src/exporters/json-exporter.ts`
- Test: `tests/measuring-skill-performance/json-exporter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/json-exporter.test.ts`:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { writeCanonical } from "../../skills/measuring-skill-performance/src/exporters/json-exporter";
import type { AnalyzerEnvelope } from "../../skills/measuring-skill-performance/src/types";

function envelope(): AnalyzerEnvelope {
  return {
    status: "success",
    source: "claude-code",
    windowCount: 1,
    droppedWindowCount: 0,
    transport: "json-only",
    reason: null,
    candidates: [
      {
        skill_name: "a",
        invocation_count: 1,
        tokens: { marginal: { total: 30, p50: 30, p95: 30 }, billed_total: { p50: 180, p95: 180 } },
        reliability: { tool_calls: 0, tool_error_rate: 0, retry_rate: 0 },
        triage_score: 30,
        sample_windows: [{ sessionId: "s1", startedAt: null, messageSpan: [1, 1], marginalTokens: 30 }],
        approximations: ["flat-segmentation-no-nesting"],
      },
    ],
  };
}

describe("writeCanonical", () => {
  test("writes candidates.json and windows.jsonl under the metrics dir", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-metrics-"));
    try {
      writeCanonical(dir, envelope());
      const candidates = JSON.parse(fs.readFileSync(path.join(dir, ".snowball/metrics/candidates.json"), "utf8"));
      expect(candidates.candidates[0].skill_name).toBe("a");
      const windows = fs.readFileSync(path.join(dir, ".snowball/metrics/windows.jsonl"), "utf8").trim().split("\n");
      expect(JSON.parse(windows[0]).skill_name).toBe("a");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test json-exporter.test.ts`
Expected: FAIL — cannot find module `exporters/json-exporter`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/exporters/json-exporter.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { AnalyzerEnvelope } from "../types";

/** Writes the canonical record set under <gitRoot>/.snowball/metrics/. */
export function writeCanonical(gitRoot: string, envelope: AnalyzerEnvelope): string {
  const dir = path.join(gitRoot, ".snowball", "metrics");
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "candidates.json"), JSON.stringify(envelope, null, 2) + "\n");

  const lines = envelope.candidates.flatMap((c) =>
    c.sample_windows.map((w) =>
      JSON.stringify({
        skill_name: c.skill_name,
        sessionId: w.sessionId,
        startedAt: w.startedAt,
        messageSpan: w.messageSpan,
        marginalTokens: w.marginalTokens,
      }),
    ),
  );
  fs.writeFileSync(path.join(dir, "windows.jsonl"), lines.join("\n") + (lines.length ? "\n" : ""));

  return dir;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test json-exporter.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/exporters/json-exporter.ts tests/measuring-skill-performance/json-exporter.test.ts
git commit -m "feat(skill-metrics): canonical JSON exporter"
```

---

## Task 9: Minimal analyzer CLI (`analyze.ts`) + build

> This is the JSON-only entry. **Plan B replaces `analyze.ts`** with a version that adds the `render` subcommand and OTel/Prometheus transport selection. Keeping it minimal here lets Plan A ship a runnable analyzer.

**Files:**
- Create: `skills/measuring-skill-performance/src/analyze.ts`
- Create: `tests/measuring-skill-performance/analyze.test.ts`
- Create: `tests/measuring-skill-performance/fixtures/empty.jsonl`
- Generate: `skills/measuring-skill-performance/scripts/skill-metrics.cjs`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/analyze.test.ts`:

```ts
import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { analyze } from "../../skills/measuring-skill-performance/src/analyze";

const FIX = path.join(import.meta.dir, "fixtures");

describe("analyze", () => {
  test("produces ranked candidates from a transcript", () => {
    const env = analyze({ transcriptPaths: [path.join(FIX, "sample-transcript.jsonl")], emit: false });
    expect(env.status).toBe("success");
    expect(env.candidates.map((c) => c.skill_name).sort()).toEqual([
      "snowball:blast-radius",
      "snowball:brainstorming",
    ]);
    expect(env.candidates[0].triage_score).toBeGreaterThanOrEqual(env.candidates[1].triage_score);
  });

  test("degrades with no-skill-invocations when there are none", () => {
    const env = analyze({ transcriptPaths: [path.join(FIX, "empty.jsonl")], emit: false });
    expect(env.status).toBe("degraded");
    expect(env.reason).toBe("no-skill-invocations");
  });
});
```

`tests/measuring-skill-performance/fixtures/empty.jsonl`:

```jsonl
{"type":"assistant","sessionId":"x","message":{"usage":{"input_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":1},"content":[{"type":"text","text":"hi"}]}}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test analyze.test.ts`
Expected: FAIL — cannot find module `analyze`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/analyze.ts`:

```ts
import * as fs from "node:fs";
import type { AnalyzerEnvelope } from "./types";
import { ClaudeCodeTranscriptReader, type TranscriptSource } from "./transcript-reader";
import { segmentSkillWindows } from "./segmenter";
import { aggregateCandidates } from "./aggregator";
import { rankCandidates, defaultTriageScore, type TriageScoreFn } from "./ranker";
import { writeCanonical } from "./exporters/json-exporter";

export interface AnalyzeOptions {
  transcriptPaths: string[];
  gitRoot?: string;
  emit?: boolean;
  reader?: TranscriptSource;
  score?: TriageScoreFn;
}

export function analyze(opts: AnalyzeOptions): AnalyzerEnvelope {
  const reader = opts.reader ?? new ClaudeCodeTranscriptReader();
  const score = opts.score ?? defaultTriageScore;

  const windows = [];
  let dropped = 0;
  for (const p of opts.transcriptPaths) {
    try {
      windows.push(...segmentSkillWindows(reader.read(p)));
    } catch {
      dropped += 1;
    }
  }

  if (windows.length === 0) {
    return {
      status: "degraded",
      source: "claude-code",
      windowCount: 0,
      droppedWindowCount: dropped,
      transport: "json-only",
      reason: "no-skill-invocations",
      candidates: [],
    };
  }

  const candidates = rankCandidates(aggregateCandidates(windows), score);
  const envelope: AnalyzerEnvelope = {
    status: "success",
    source: "claude-code",
    windowCount: windows.length,
    droppedWindowCount: dropped,
    transport: "json-only",
    reason: null,
    candidates,
  };

  if (opts.emit !== false) writeCanonical(opts.gitRoot ?? process.cwd(), envelope);
  return envelope;
}

// CLI:  node skill-metrics.cjs analyze  < { "transcriptPaths": [...], "gitRoot": "..." }
if (require.main === module) {
  const cmd = process.argv[2];
  const raw = fs.readFileSync(0, "utf8");
  if (cmd === "analyze") {
    const input = JSON.parse(raw || "{}") as AnalyzeOptions;
    process.stdout.write(JSON.stringify(analyze({ ...input, emit: input.emit ?? true }), null, 2) + "\n");
  } else {
    process.stderr.write("usage: node skill-metrics.cjs analyze\n");
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test analyze.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Build the bundle**

Run: `bash scripts/build-measuring-skill-performance.sh`
Expected: `built 1 measuring-skill-performance bundles`.

- [ ] **Step 6: Smoke-test on real transcripts**

Run:

```bash
TX="$HOME/.claude/projects/-Users-kellen-Projects-snowball"
node -e 'const fs=require("fs");const d=process.argv[1];const ps=fs.readdirSync(d).filter(f=>f.endsWith(".jsonl")).map(f=>d+"/"+f);process.stdout.write(JSON.stringify({transcriptPaths:ps,gitRoot:process.cwd(),emit:false}))' "$TX" \
  | node skills/measuring-skill-performance/scripts/skill-metrics.cjs analyze | head -40
```

Expected: a JSON envelope with `"status": "success"` and ranked `candidates` naming real snowball skills. (Manual sanity check.)

- [ ] **Step 7: Run the full Plan A suite + type-check + pre-commit**

```bash
cd tests/measuring-skill-performance && bun test && cd - && \
bunx tsc --noEmit && \
pre-commit run --files skills/measuring-skill-performance/src/*.ts skills/measuring-skill-performance/src/exporters/*.ts
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add skills/measuring-skill-performance/src/analyze.ts \
  skills/measuring-skill-performance/scripts/skill-metrics.cjs \
  tests/measuring-skill-performance/analyze.test.ts \
  tests/measuring-skill-performance/fixtures/empty.jsonl
git commit -m "feat(skill-metrics): minimal analyzer CLI + bundle"
```

---

## Self-review (Plan A)

- **Spec coverage:** reader (T7), flat segmentation (T3), marginal-cost confounder fix (T4), aggregation + sample-window seam (T5), tunable score (T6), canonical JSON (T8), runnable analyzer + `no-skill-invocations` degraded (T9). Projections/render/SKILL.md are intentionally **Plan B**.
- **Placeholder scan:** none; every code step is complete.
- **Type consistency:** `Message`/`SkillWindow`/`WindowMetrics`/`CandidateRecord`/`AnalyzerEnvelope`/`TriageScoreFn` consistent across tasks; `analyze.ts` `AnalyzeOptions` here is a subset that Plan B widens (additive: `otlpEndpoint`, `nowMs`).

## Handoff

Plan A delivers a runnable analyzer producing ranked `candidates.json`. Proceed to **Plan B** (`2026-05-31-skill-performance-triage-telemetry-b-projections.md`) for OTel/Prometheus projections, the operator render, and the `SKILL.md`/`SCHEMA.md` surfaces.
