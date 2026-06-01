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
