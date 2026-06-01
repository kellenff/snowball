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
