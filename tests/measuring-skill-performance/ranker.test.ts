import { describe, expect, test } from "bun:test";
import {
  rankCandidates,
  defaultTriageScore,
} from "../../skills/measuring-skill-performance/src/ranker";
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
    const ranked = rankCandidates(
      [rec("cheap", 1, 10, 0), rec("pricey", 100, 1000, 0)],
      defaultTriageScore,
    );
    expect(ranked.map((r) => r.skill_name)).toEqual(["pricey", "cheap"]);
    expect(ranked[0].triage_score).toBe(100000);
  });
});
