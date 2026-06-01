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
