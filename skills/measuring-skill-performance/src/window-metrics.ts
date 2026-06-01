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
