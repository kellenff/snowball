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
    expect(messages[0].toolUses[0]).toMatchObject({
      name: "Skill",
      input: { skill: "snowball:brainstorming" },
    });
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
