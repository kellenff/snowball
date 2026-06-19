import * as fs from "node:fs";
import type { Message, ToolResult, ToolUse, TokenUsage } from "./types";

export interface TranscriptSource {
  read(transcriptPath: string): Message[];
}

interface RawContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  text?: string;
}

interface RawLine {
  type?: string;
  sessionId?: string;
  timestamp?: string;
  message?: { usage?: Partial<TokenUsage>; content?: RawContentBlock[] | string };
}

function normalizeUsage(usage: Partial<TokenUsage> | undefined): TokenUsage | null {
  if (!usage) return null;
  return {
    input_tokens: usage.input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  };
}

export class ClaudeCodeTranscriptReader implements TranscriptSource {
  read(transcriptPath: string): Message[] {
    const raw = fs.readFileSync(transcriptPath, "utf8");
    const messages: Message[] = [];
    let index = 0;

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: RawLine;
      try {
        parsed = JSON.parse(trimmed) as RawLine;
      } catch {
        continue;
      }
      if (parsed.type !== "assistant" && parsed.type !== "user" && parsed.type !== "system")
        continue;

      const content = parsed.message?.content;
      const blocks: RawContentBlock[] = Array.isArray(content) ? content : [];
      const toolUses: ToolUse[] = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input ?? {} }));
      const toolResults: ToolResult[] = blocks
        .filter((b) => b.type === "tool_result")
        .map((b) => ({ toolUseId: b.tool_use_id ?? "", isError: b.is_error === true }));
      const hasUserText =
        parsed.type === "user" &&
        (typeof content === "string"
          ? content.trim().length > 0
          : blocks.some((b) => b.type === "text"));

      messages.push({
        index: index++,
        sessionId: parsed.sessionId ?? "",
        role: parsed.type,
        timestamp: parsed.timestamp ?? null,
        usage: normalizeUsage(parsed.message?.usage),
        hasUserText,
        toolUses,
        toolResults,
      });
    }

    return messages;
  }
}
