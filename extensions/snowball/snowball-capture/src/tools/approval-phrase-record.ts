import { writeMadr } from "../../../../../skills/decision-logging/src/write-madr.js";
import { matchesApproval } from "../../../../../skills/decision-logging/src/approval-phrases.js";
import { err, ok, type ToolResult } from "../errors.js";
import { ApprovalPhraseRecordInput, type ApprovalPhraseRecordInput as T } from "../schemas.js";
import { SESSION_ID } from "../session-id.js";
import { randomUUID } from "node:crypto";

export interface ApprovalPhraseRecordOutput {
  path: string;
  id: string;
}

export function runApprovalPhraseRecord(raw: unknown): ToolResult<ApprovalPhraseRecordOutput> {
  const parsed = ApprovalPhraseRecordInput.safeParse(raw);
  if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
  const input: T = parsed.data;

  if (!matchesApproval(input.phrase)) {
    return err("NOT_AN_APPROVAL", `"${input.phrase}" is not a recognized approval phrase`);
  }

  const now = new Date().toISOString();
  const title = `Approval: ${input.action}`;

  try {
    const filePath = writeMadr({
      title,
      status: "accepted",
      date: now,
      deciders: ["kellen"],
      snowball: {
        schema_version: "1.1",
        source: "operator",
        confidence: "high",
        capture_mechanism: "user-prompt-pattern",
        session_id: SESSION_ID,
        source_event_id: randomUUID(),
        supersedes: null,
        tags: ["ambient"],
      },
      body: {
        context:
          input.context ??
          `Operator submitted an approval phrase in a Junie session: "${input.phrase}".`,
        considered_options: [],
        decision_outcome: `Action taken on approval: ${input.action}.`,
        consequences: [],
        links: [],
      },
    });
    return ok({ path: filePath, id: SESSION_ID });
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
      const out = runApprovalPhraseRecord(input);
      process.stdout.write(JSON.stringify(out) + "\n");
      if (!out.ok) process.exit(1);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      process.stdout.write(JSON.stringify({ ok: false, code: "INTERNAL", error: msg }) + "\n");
      process.exit(1);
    }
  });
}
