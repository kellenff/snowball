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
    expect(windows[0].messages.map((m) => m.index)).toEqual([1, 2]);
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
