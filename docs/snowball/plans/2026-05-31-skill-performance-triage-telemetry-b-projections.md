# Skill-Performance Triage Telemetry — Plan B: Projections & Operator Surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project the canonical candidate records to OTel (OTLP/HTTP+JSON) and Prometheus text, add the operator render with an honest caveat banner, wire transport selection + degraded states into the analyzer CLI, and ship the operator `SKILL.md` + Stage-2 `SCHEMA.md`.

**Architecture:** Pure exporters (`renderPrometheusText`, `buildOtlpMetricsPayload`, `renderCandidatesTable`) plus thin I/O (`writePromFile`, `postOtlp`). The CLI gains a `render` subcommand and an `emitProjections` step that picks OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, else writes the Prometheus file, degrading to the file on OTLP failure.

**Tech Stack:** TypeScript + Bun, `bun:test`, zero runtime deps (OTLP via `fetch`).

**Depends on:** **Plan A** (`…-a-core.md`) — its modules and `analyze.ts` must exist. This plan **replaces** `analyze.ts` with the full version (Task 4).

**Spec:** `docs/snowball/specs/2026-05-31-skill-performance-triage-telemetry-design.md`.

---

## File Structure (Plan B)

| File | Responsibility |
|---|---|
| `skills/measuring-skill-performance/src/exporters/prometheus-exporter.ts` | `renderPrometheusText()` + `writePromFile()` |
| `skills/measuring-skill-performance/src/exporters/otlp-exporter.ts` | `buildOtlpMetricsPayload()` + `postOtlp()` |
| `skills/measuring-skill-performance/src/render.ts` | `renderCandidatesTable()` |
| `skills/measuring-skill-performance/src/analyze.ts` | **replaced**: render subcommand + transport selection |
| `skills/measuring-skill-performance/SKILL.md` | operator skill doc |
| `skills/measuring-skill-performance/SCHEMA.md` | `CandidateRecord` + envelope contract (Stage 2 seam) |
| `tests/measuring-skill-performance/{prometheus,otlp,render,emit}.test.ts` | tests |

---

## Task 1: Prometheus text exporter

**Files:**
- Create: `skills/measuring-skill-performance/src/exporters/prometheus-exporter.ts`
- Test: `tests/measuring-skill-performance/prometheus-exporter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/prometheus-exporter.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { renderPrometheusText } from "../../skills/measuring-skill-performance/src/exporters/prometheus-exporter";
import type { CandidateRecord } from "../../skills/measuring-skill-performance/src/types";

const candidate: CandidateRecord = {
  skill_name: "snowball:blast-radius",
  invocation_count: 3,
  tokens: { marginal: { total: 90, p50: 30, p95: 50 }, billed_total: { p50: 180, p95: 200 } },
  reliability: { tool_calls: 12, tool_error_rate: 0.25, retry_rate: 0.1 },
  triage_score: 112.5,
  sample_windows: [],
  approximations: [],
};

describe("renderPrometheusText", () => {
  const text = renderPrometheusText([candidate]);
  test("emits HELP and TYPE per metric", () => {
    expect(text).toContain("# TYPE snowball_skill_marginal_tokens_p50 gauge");
    expect(text).toContain("# TYPE snowball_skill_invocations_total counter");
  });
  test("emits a labeled sample with the skill name", () => {
    expect(text).toContain('snowball_skill_marginal_tokens_p50{skill="snowball:blast-radius"} 30');
    expect(text).toContain('snowball_skill_invocations_total{skill="snowball:blast-radius"} 3');
  });
  test("ends with a newline", () => {
    expect(text.endsWith("\n")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test prometheus-exporter.test.ts`
Expected: FAIL — cannot find module `exporters/prometheus-exporter`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/exporters/prometheus-exporter.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { CandidateRecord } from "../types";

interface MetricDef {
  name: string;
  type: "gauge" | "counter";
  help: string;
  value: (c: CandidateRecord) => number;
}

const METRICS: MetricDef[] = [
  { name: "snowball_skill_marginal_tokens_p50", type: "gauge", help: "Median marginal tokens (output + cache_creation) per skill window", value: (c) => c.tokens.marginal.p50 },
  { name: "snowball_skill_marginal_tokens_p95", type: "gauge", help: "p95 marginal tokens per skill window", value: (c) => c.tokens.marginal.p95 },
  { name: "snowball_skill_marginal_tokens_total", type: "counter", help: "Total marginal tokens across all windows", value: (c) => c.tokens.marginal.total },
  { name: "snowball_skill_billed_tokens_p50", type: "gauge", help: "Median billed-total tokens per window (diagnostic)", value: (c) => c.tokens.billed_total.p50 },
  { name: "snowball_skill_invocations_total", type: "counter", help: "Skill invocation count", value: (c) => c.invocation_count },
  { name: "snowball_skill_tool_calls_total", type: "counter", help: "Non-Skill tool calls", value: (c) => c.reliability.tool_calls },
  { name: "snowball_skill_tool_error_rate", type: "gauge", help: "Tool errors / tool calls", value: (c) => c.reliability.tool_error_rate },
  { name: "snowball_skill_retry_rate", type: "gauge", help: "Repeated tool calls / tool calls", value: (c) => c.reliability.retry_rate },
  { name: "snowball_skill_triage_score", type: "gauge", help: "Composite port-candidate ranking score", value: (c) => c.triage_score },
];

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Pre-aggregated summary gauges/counters (analyzer pre-percentiles; not native histograms). */
export function renderPrometheusText(candidates: CandidateRecord[]): string {
  const lines: string[] = [];
  for (const metric of METRICS) {
    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);
    for (const c of candidates) {
      lines.push(`${metric.name}{skill="${escapeLabel(c.skill_name)}"} ${metric.value(c)}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function writePromFile(gitRoot: string, candidates: CandidateRecord[]): string {
  const dir = path.join(gitRoot, ".snowball", "metrics");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "skills.prom");
  fs.writeFileSync(file, renderPrometheusText(candidates));
  return file;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test prometheus-exporter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/exporters/prometheus-exporter.ts tests/measuring-skill-performance/prometheus-exporter.test.ts
git commit -m "feat(skill-metrics): prometheus text-exposition exporter"
```

---

## Task 2: OTLP exporter

**Files:**
- Create: `skills/measuring-skill-performance/src/exporters/otlp-exporter.ts`
- Test: `tests/measuring-skill-performance/otlp-exporter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/otlp-exporter.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildOtlpMetricsPayload } from "../../skills/measuring-skill-performance/src/exporters/otlp-exporter";
import type { CandidateRecord } from "../../skills/measuring-skill-performance/src/types";

const candidate: CandidateRecord = {
  skill_name: "snowball:blast-radius",
  invocation_count: 3,
  tokens: { marginal: { total: 90, p50: 30, p95: 50 }, billed_total: { p50: 180, p95: 200 } },
  reliability: { tool_calls: 12, tool_error_rate: 0.25, retry_rate: 0.1 },
  triage_score: 112.5,
  sample_windows: [],
  approximations: [],
};

describe("buildOtlpMetricsPayload", () => {
  const payload = buildOtlpMetricsPayload([candidate], 1_700_000_000_000);
  test("nests resourceMetrics → scopeMetrics → metrics", () => {
    expect(payload.resourceMetrics[0].scopeMetrics[0].metrics.length).toBeGreaterThan(0);
  });
  test("gauge dataPoint carries the skill attribute and value", () => {
    const metric = payload.resourceMetrics[0].scopeMetrics[0].metrics.find(
      (m) => m.name === "snowball_skill_marginal_tokens_p50",
    )!;
    const dp = metric.gauge.dataPoints[0];
    expect(dp.asDouble).toBe(30);
    expect(dp.attributes[0]).toEqual({ key: "skill", value: { stringValue: "snowball:blast-radius" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test otlp-exporter.test.ts`
Expected: FAIL — cannot find module `exporters/otlp-exporter`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/exporters/otlp-exporter.ts`:

```ts
import type { CandidateRecord } from "../types";

interface OtlpDataPoint {
  asDouble: number;
  timeUnixNano: string;
  attributes: { key: string; value: { stringValue: string } }[];
}
interface OtlpMetric {
  name: string;
  unit: string;
  gauge: { dataPoints: OtlpDataPoint[] };
}
export interface OtlpPayload {
  resourceMetrics: {
    resource: { attributes: { key: string; value: { stringValue: string } }[] };
    scopeMetrics: { scope: { name: string }; metrics: OtlpMetric[] }[];
  }[];
}

const FIELDS: { name: string; value: (c: CandidateRecord) => number }[] = [
  { name: "snowball_skill_marginal_tokens_p50", value: (c) => c.tokens.marginal.p50 },
  { name: "snowball_skill_marginal_tokens_p95", value: (c) => c.tokens.marginal.p95 },
  { name: "snowball_skill_marginal_tokens_total", value: (c) => c.tokens.marginal.total },
  { name: "snowball_skill_invocations_total", value: (c) => c.invocation_count },
  { name: "snowball_skill_tool_calls_total", value: (c) => c.reliability.tool_calls },
  { name: "snowball_skill_tool_error_rate", value: (c) => c.reliability.tool_error_rate },
  { name: "snowball_skill_retry_rate", value: (c) => c.reliability.retry_rate },
  { name: "snowball_skill_triage_score", value: (c) => c.triage_score },
];

export function buildOtlpMetricsPayload(candidates: CandidateRecord[], nowMs: number): OtlpPayload {
  const timeUnixNano = String(nowMs * 1_000_000);
  const metrics: OtlpMetric[] = FIELDS.map((f) => ({
    name: f.name,
    unit: "1",
    gauge: {
      dataPoints: candidates.map((c) => ({
        asDouble: f.value(c),
        timeUnixNano,
        attributes: [{ key: "skill", value: { stringValue: c.skill_name } }],
      })),
    },
  }));

  return {
    resourceMetrics: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "snowball-skill-metrics" } }] },
        scopeMetrics: [{ scope: { name: "measuring-skill-performance" }, metrics }],
      },
    ],
  };
}

/** POSTs OTLP/HTTP+JSON to <endpoint>/v1/metrics. Returns true on 2xx, false on any failure. */
export async function postOtlp(endpoint: string, payload: OtlpPayload): Promise<boolean> {
  const url = endpoint.replace(/\/$/, "") + "/v1/metrics";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test otlp-exporter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/exporters/otlp-exporter.ts tests/measuring-skill-performance/otlp-exporter.test.ts
git commit -m "feat(skill-metrics): OTLP/HTTP+JSON metrics exporter"
```

---

## Task 3: Operator render (`render.ts`)

**Files:**
- Create: `skills/measuring-skill-performance/src/render.ts`
- Test: `tests/measuring-skill-performance/render.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/render.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { renderCandidatesTable } from "../../skills/measuring-skill-performance/src/render";
import type { AnalyzerEnvelope } from "../../skills/measuring-skill-performance/src/types";

function envelope(overrides: Partial<AnalyzerEnvelope> = {}): AnalyzerEnvelope {
  return {
    status: "success",
    source: "claude-code",
    windowCount: 5,
    droppedWindowCount: 2,
    transport: "prometheus-file",
    reason: null,
    candidates: [
      {
        skill_name: "snowball:blast-radius",
        invocation_count: 3,
        tokens: { marginal: { total: 90, p50: 30, p95: 50 }, billed_total: { p50: 180, p95: 200 } },
        reliability: { tool_calls: 12, tool_error_rate: 0.25, retry_rate: 0.1 },
        triage_score: 112.5,
        sample_windows: [],
        approximations: ["flat-segmentation-no-nesting"],
      },
    ],
    ...overrides,
  };
}

describe("renderCandidatesTable", () => {
  test("renders a top-N table with the skill row", () => {
    const md = renderCandidatesTable(envelope());
    expect(md).toContain("snowball:blast-radius");
    expect(md).toContain("| Skill |");
  });
  test("banner states transport, window count, dropped count, approximations", () => {
    const md = renderCandidatesTable(envelope());
    expect(md).toContain("prometheus-file");
    expect(md).toContain("5 window");
    expect(md).toContain("2 dropped");
    expect(md).toContain("flat-segmentation-no-nesting");
  });
  test("surfaces degraded reason", () => {
    const md = renderCandidatesTable(envelope({ status: "degraded", reason: "otlp-unreachable" }));
    expect(md).toContain("degraded");
    expect(md).toContain("otlp-unreachable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test render.test.ts`
Expected: FAIL — cannot find module `render`.

- [ ] **Step 3: Write minimal implementation**

`skills/measuring-skill-performance/src/render.ts`:

```ts
import type { AnalyzerEnvelope } from "./types";

const TOP_N = 15;

export function renderCandidatesTable(envelope: AnalyzerEnvelope): string {
  const lines: string[] = [];
  lines.push("## Skill-performance triage");
  lines.push("");

  if (envelope.status !== "success") {
    lines.push(`> Status: **${envelope.status}**${envelope.reason ? ` (${envelope.reason})` : ""}`);
    lines.push("");
  }

  lines.push("| Skill | Invocations | Marginal p50 | Marginal p95 | Error rate | Retry rate | Triage score |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const c of envelope.candidates.slice(0, TOP_N)) {
    lines.push(
      `| ${c.skill_name} | ${c.invocation_count} | ${c.tokens.marginal.p50} | ${c.tokens.marginal.p95} | ` +
        `${(c.reliability.tool_error_rate * 100).toFixed(1)}% | ${(c.reliability.retry_rate * 100).toFixed(1)}% | ` +
        `${Math.round(c.triage_score)} |`,
    );
  }
  lines.push("");

  const approx = Array.from(new Set(envelope.candidates.flatMap((c) => c.approximations)));
  lines.push(
    `_Source: ${envelope.source} · ${envelope.windowCount} window(s), ${envelope.droppedWindowCount} dropped · ` +
      `transport: ${envelope.transport}${approx.length ? ` · approximations: ${approx.join(", ")}` : ""}._`,
  );
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests/measuring-skill-performance && bun test render.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add skills/measuring-skill-performance/src/render.ts tests/measuring-skill-performance/render.test.ts
git commit -m "feat(skill-metrics): operator render with honest caveat banner"
```

---

## Task 4: Extend the analyzer CLI — transport selection + render subcommand

**Files:**
- Replace: `skills/measuring-skill-performance/src/analyze.ts`
- Create: `tests/measuring-skill-performance/emit.test.ts`
- Rebuild: `skills/measuring-skill-performance/scripts/skill-metrics.cjs`

> Plan A's `analyze.ts` only did JSON-only emit. This replaces it: `analyze()` becomes pure (no I/O), and a new `emitProjections()` writes canonical JSON, then pushes OTLP when an endpoint is set (degrading to the Prometheus file on failure) or writes the Prometheus file otherwise. The CLI gains a `render` subcommand. `AnalyzeOptions` keeps `gitRoot?`/`emit?` optional for source-compatibility with Plan A's `analyze.test.ts`.

- [ ] **Step 1: Write the failing test**

`tests/measuring-skill-performance/emit.test.ts`:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { emitProjections } from "../../skills/measuring-skill-performance/src/analyze";
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
        sample_windows: [],
        approximations: ["flat-segmentation-no-nesting"],
      },
    ],
  };
}

describe("emitProjections", () => {
  test("no endpoint → writes prometheus file and reports prometheus-file transport", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emit-"));
    try {
      const final = await emitProjections(dir, envelope(), undefined, 1_700_000_000_000);
      expect(final.transport).toBe("prometheus-file");
      expect(fs.existsSync(path.join(dir, ".snowball/metrics/skills.prom"))).toBe(true);
      expect(fs.existsSync(path.join(dir, ".snowball/metrics/candidates.json"))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("unreachable endpoint → degrades to otlp-unreachable + prometheus file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emit-"));
    try {
      const final = await emitProjections(dir, envelope(), "http://127.0.0.1:0", 1_700_000_000_000);
      expect(final.status).toBe("degraded");
      expect(final.reason).toBe("otlp-unreachable");
      expect(final.transport).toBe("prometheus-file");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests/measuring-skill-performance && bun test emit.test.ts`
Expected: FAIL — `emitProjections` is not exported.

- [ ] **Step 3: Replace `analyze.ts`**

`skills/measuring-skill-performance/src/analyze.ts` (full replacement):

```ts
import * as fs from "node:fs";
import type { AnalyzerEnvelope } from "./types";
import { ClaudeCodeTranscriptReader, type TranscriptSource } from "./transcript-reader";
import { segmentSkillWindows } from "./segmenter";
import { aggregateCandidates } from "./aggregator";
import { rankCandidates, defaultTriageScore, type TriageScoreFn } from "./ranker";
import { writeCanonical } from "./exporters/json-exporter";
import { writePromFile } from "./exporters/prometheus-exporter";
import { buildOtlpMetricsPayload, postOtlp } from "./exporters/otlp-exporter";
import { renderCandidatesTable } from "./render";

export interface AnalyzeOptions {
  transcriptPaths: string[];
  gitRoot?: string; // retained for source compat (Plan A); emit handled by emitProjections
  emit?: boolean; // retained for source compat; ignored — analyze() is now pure
  reader?: TranscriptSource;
  score?: TriageScoreFn;
}

/** Pure: read + segment + aggregate + rank. No I/O. */
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

  return {
    status: "success",
    source: "claude-code",
    windowCount: windows.length,
    droppedWindowCount: dropped,
    transport: "json-only",
    reason: null,
    candidates: rankCandidates(aggregateCandidates(windows), score),
  };
}

/** Writes canonical JSON, then pushes OTLP (degrading to the Prometheus file) or writes the file. */
export async function emitProjections(
  gitRoot: string,
  envelope: AnalyzerEnvelope,
  endpoint: string | undefined,
  nowMs: number,
): Promise<AnalyzerEnvelope> {
  writeCanonical(gitRoot, envelope);
  if (envelope.candidates.length === 0) return envelope;

  if (endpoint) {
    const ok = await postOtlp(endpoint, buildOtlpMetricsPayload(envelope.candidates, nowMs));
    if (ok) return { ...envelope, transport: "otlp" };
    writePromFile(gitRoot, envelope.candidates);
    return { ...envelope, status: "degraded", reason: "otlp-unreachable", transport: "prometheus-file" };
  }

  writePromFile(gitRoot, envelope.candidates);
  return { ...envelope, transport: "prometheus-file" };
}

// CLI:
//   node skill-metrics.cjs analyze  < { "transcriptPaths": [...], "gitRoot": "...", "otlpEndpoint": "..." }
//   node skill-metrics.cjs render   < AnalyzerEnvelope JSON
if (require.main === module) {
  const cmd = process.argv[2];
  const raw = fs.readFileSync(0, "utf8");

  if (cmd === "analyze") {
    const input = JSON.parse(raw || "{}") as AnalyzeOptions & { gitRoot?: string; otlpEndpoint?: string };
    const envelope = analyze(input);
    const endpoint = input.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    emitProjections(input.gitRoot ?? process.cwd(), envelope, endpoint, Date.now()).then((final) => {
      process.stdout.write(JSON.stringify(final, null, 2) + "\n");
    });
  } else if (cmd === "render") {
    const env = JSON.parse(raw || "{}") as AnalyzerEnvelope;
    process.stdout.write(renderCandidatesTable(env) + "\n");
  } else {
    process.stderr.write("usage: node skill-metrics.cjs <analyze|render>\n");
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run the new test + confirm Plan A's analyze test still passes**

Run: `cd tests/measuring-skill-performance && bun test emit.test.ts analyze.test.ts`
Expected: PASS — `emit.test.ts` (2) green; `analyze.test.ts` (2) still green (it only asserts the returned envelope, and `emit: false` still type-checks).

- [ ] **Step 5: Rebuild the bundle**

Run: `bash scripts/build-measuring-skill-performance.sh`
Expected: bundle rebuilds (now includes `render` + projections).

- [ ] **Step 6: Smoke-test the full pipeline (analyze → render) on real transcripts**

Run:

```bash
TX="$HOME/.claude/projects/-Users-kellen-Projects-snowball"
node -e 'const fs=require("fs");const d=process.argv[1];const ps=fs.readdirSync(d).filter(f=>f.endsWith(".jsonl")).map(f=>d+"/"+f);process.stdout.write(JSON.stringify({transcriptPaths:ps,gitRoot:process.cwd()}))' "$TX" \
  | node skills/measuring-skill-performance/scripts/skill-metrics.cjs analyze \
  | node skills/measuring-skill-performance/scripts/skill-metrics.cjs render
```

Expected: a markdown triage table of real snowball skills + a caveat banner reading `transport: prometheus-file` (no OTLP endpoint set). Confirms `.snowball/metrics/{candidates.json,windows.jsonl,skills.prom}` were written.

- [ ] **Step 7: Commit**

```bash
git add skills/measuring-skill-performance/src/analyze.ts \
  skills/measuring-skill-performance/scripts/skill-metrics.cjs \
  tests/measuring-skill-performance/emit.test.ts
git commit -m "feat(skill-metrics): transport selection, render subcommand, degraded states"
```

---

## Task 5: Operator skill doc + schema + full verification

**Files:**
- Create: `skills/measuring-skill-performance/SKILL.md`
- Create: `skills/measuring-skill-performance/SCHEMA.md`

- [ ] **Step 1: Write `SKILL.md`**

`skills/measuring-skill-performance/SKILL.md`:

````markdown
---
name: measuring-skill-performance
description: Use to rank snowball skills as port candidates by token cost and reliability from Claude Code transcripts, emitting OTel/Prometheus metrics. Stage 1 of the markdown/LLM port-decision funnel.
---

# Measuring Skill Performance (Triage Telemetry)

Offline analyzer that reads Claude Code transcripts, segments per-skill execution
windows, and ranks skills as port candidates by `invocations × marginal-token-cost
× (1 + tool-error-rate)`. Emits OTel/Prometheus projections; canonical records land
in `.snowball/metrics/`.

This is **Stage 1** — triage only. It ranks which skills deserve the expensive Stage 2
reducibility test; it does not decide ports. Attribution is deliberately coarse (flat
window segmentation; subagent tokens lumped to the dispatching window).

## Procedure

1. Resolve repo root: `git rev-parse --show-toplevel`.
2. Collect transcript paths (default: `~/.claude/projects/<encoded-repo>/*.jsonl`).
3. Analyze:

   ```bash
   echo '{"transcriptPaths": ["…"], "gitRoot": "<root>"}' \
     | node skills/measuring-skill-performance/scripts/skill-metrics.cjs analyze > /tmp/skill-metrics.json
   ```

4. Render the operator table:

   ```bash
   node skills/measuring-skill-performance/scripts/skill-metrics.cjs render < /tmp/skill-metrics.json
   ```

5. Report the table. State `transport`, `windowCount`, `droppedWindowCount`, and
   `approximations` honestly — they are in the banner.

## Transport

- Canonical JSON: `.snowball/metrics/candidates.json` + `windows.jsonl` (source of truth).
- If `OTEL_EXPORTER_OTLP_ENDPOINT` is set: OTLP/HTTP+JSON push to `<endpoint>/v1/metrics`;
  on failure it degrades to the Prometheus file and reports `otlp-unreachable`.
- Otherwise: Prometheus text file `.snowball/metrics/skills.prom`.

## Seam to Stage 2

Each `CandidateRecord.sample_windows` references real historical invocations — those
double as Stage 2's parity-test corpus. See `SCHEMA.md`.

## For maintainers

Edit `src/*.ts`, then `bash scripts/build-measuring-skill-performance.sh`.
````

- [ ] **Step 2: Write `SCHEMA.md`**

`skills/measuring-skill-performance/SCHEMA.md` — document the contract exactly as in `src/types.ts`:

````markdown
# Skill-Metrics Schema

The frozen Stage-1 → Stage-2 contract. `CandidateRecord` is the only type that crosses
into the reducibility harness.

## CandidateRecord

```json
{
  "skill_name": "snowball:blast-radius",
  "invocation_count": 42,
  "tokens": {
    "marginal": { "total": 51234, "p50": 980, "p95": 3400 },
    "billed_total": { "p50": 18500, "p95": 42000 }
  },
  "reliability": { "tool_calls": 130, "tool_error_rate": 0.04, "retry_rate": 0.02 },
  "triage_score": 42806,
  "sample_windows": [
    { "sessionId": "…", "startedAt": "…", "messageSpan": [12, 28], "marginalTokens": 980 }
  ],
  "approximations": ["flat-segmentation-no-nesting", "subagent-lumped"]
}
```

- `tokens.marginal` = `output_tokens + cache_creation_input_tokens` (headline cost).
- `tokens.billed_total` = incl. input + cache_read (diagnostic only).
- `sample_windows` double as Stage 2's input corpus.

## AnalyzerEnvelope

```json
{ "status": "success|degraded|error", "source": "claude-code", "windowCount": 0,
  "droppedWindowCount": 0, "transport": "otlp|prometheus-file|json-only",
  "reason": null, "candidates": [] }
```

### Reason codes (closed enum)

| Code | When |
|---|---|
| `transcript-unreadable` | a transcript file could not be read/parsed |
| `schema-drift` | transcript lines did not match the expected shape; dropped windows counted |
| `no-skill-invocations` | no Skill tool_use found in any transcript |
| `otlp-unreachable` | OTLP push failed; fell back to the Prometheus file |
````

- [ ] **Step 3: Run the full skill suite**

Run: `cd tests/measuring-skill-performance && bun test`
Expected: PASS — every suite green (stats, segmenter, window-metrics, aggregator, ranker, transcript-reader contract, json/prometheus/otlp exporters, render, analyze, emit).

- [ ] **Step 4: Type-check + build**

Run: `bunx tsc --noEmit && bash scripts/build-measuring-skill-performance.sh`
Expected: no type errors; bundle up to date.

- [ ] **Step 5: Pre-commit on the module**

Run: `pre-commit run --files skills/measuring-skill-performance/src/*.ts skills/measuring-skill-performance/src/exporters/*.ts skills/measuring-skill-performance/SKILL.md skills/measuring-skill-performance/SCHEMA.md`
Expected: all hooks pass (build + bun test run automatically; markdownlint clean).

- [ ] **Step 6: Commit**

```bash
git add skills/measuring-skill-performance/SKILL.md skills/measuring-skill-performance/SCHEMA.md
git commit -m "feat(skill-metrics): operator skill doc + Stage 2 seam schema"
```

---

## Self-review (Plan B)

- **Spec coverage:** metric set (T1 Prometheus, T2 OTLP names match spec table), operator render with honest banner (T3), dual transport + JSON canonical + degraded states (T4), SKILL.md/SCHEMA.md surfaces + frozen seam (T5).
- **Placeholder scan:** none; the only escaped block is the `SCHEMA.md` body (T5 Step 2), with an explicit un-escape instruction.
- **Type consistency:** metric names identical between Prometheus (T1) and OTLP (T2); `emitProjections` signature `(gitRoot, envelope, endpoint, nowMs)` used identically in `emit.test.ts` (T4 Step 1) and `analyze.ts` (T4 Step 3); `AnalyzeOptions` widening is additive over Plan A.

## Done

After Plan B, Stage 1 is complete: a runnable analyzer with OTel/Prometheus projections, an operator skill, and a frozen `CandidateRecord` seam ready for the Stage 2 reducibility-harness brainstorm.
