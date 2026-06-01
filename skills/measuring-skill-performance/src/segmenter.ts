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
    if (current) {
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
