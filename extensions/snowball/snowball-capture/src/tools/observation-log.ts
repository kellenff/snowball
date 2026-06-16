import { appendObservation } from "../../../../../skills/decision-logging/src/append-observation.js";
import { err, ok, type ToolResult } from "../errors.js";
import { ObservationLogInput, type ObservationLogInput as T } from "../schemas.js";
import { SESSION_ID } from "../session-id.js";

export interface ObservationLogOutput {
  path: string;
}

export function runObservationLog(raw: unknown): ToolResult<ObservationLogOutput> {
  const parsed = ObservationLogInput.safeParse(raw);
  if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
  const input: T = parsed.data;

  const now = new Date().toISOString();
  const sessionId = input.session_id ?? SESSION_ID;
  const timestamp = input.timestamp ?? now;

  try {
    const filePath = appendObservation({
      schema_version: "1.1",
      timestamp,
      session_id: sessionId,
      type: input.type,
      confidence: input.confidence,
      source: "agent",
      content: input.content,
      rationale: input.rationale,
      related_files: input.related_files ?? [],
      related_decision: null,
      tags: ["ambient", ...(input.tags ?? [])],
    });
    return ok({ path: filePath });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("not in a git repo")) return err("NOT_IN_GIT_REPO", msg);
    if (msg.includes("EACCES") || msg.includes("ENOSPC")) return err("WRITE_FAILED", msg);
    return err("INTERNAL", msg);
  }
}

if (import.meta.main) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c.toString()));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const out = runObservationLog(input);
      process.stdout.write(JSON.stringify(out) + "\n");
      if (!out.ok) process.exit(1);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      process.stdout.write(JSON.stringify({ ok: false, code: "INTERNAL", error: msg }) + "\n");
      process.exit(1);
    }
  });
}
