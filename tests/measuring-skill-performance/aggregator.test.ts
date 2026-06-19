import { describe, expect, test } from "bun:test";
import { aggregateCandidates } from "../../skills/measuring-skill-performance/src/aggregator";
import type { Message, SkillWindow } from "../../skills/measuring-skill-performance/src/types";

function win(
  skill: string,
  marginal: number,
  opts: { toolCalls?: number; toolErrors?: number } = {},
): SkillWindow {
  const messages: Message[] = [
    {
      index: 0,
      sessionId: "s1",
      role: "assistant",
      timestamp: "2026-05-31T00:00:00Z",
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: marginal,
      },
      hasUserText: false,
      toolUses: Array.from({ length: opts.toolCalls ?? 0 }, (_, i) => ({
        id: `t${i}`,
        name: "Bash",
        input: { i },
      })),
      toolResults: Array.from({ length: opts.toolErrors ?? 0 }, (_, i) => ({
        toolUseId: `t${i}`,
        isError: true,
      })),
    },
  ];
  return {
    skillName: skill,
    sessionId: "s1",
    startedAt: "2026-05-31T00:00:00Z",
    endedAt: null,
    messageSpan: [0, 0],
    messages,
  };
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
