import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { matchesApproval } from "../../decision-logging/src/approval-phrases";
import { appendObservation, type Observation } from "../../decision-logging/src/append-observation";
import { detectGitRoot } from "../../decision-logging/src/git-root";
import { resolveSessionId, type BaseHookPayload } from "../../decision-logging/src/hook-payload";
import type { BlastRadiusEnvelope } from "./envelope";
import { readLastEnvelope } from "./read-envelope";

const ERROR_LOG = path.join(os.homedir(), ".snowball", "blast-radius-audit-errors.log");

export type AuditTrigger = "stop" | "operator-approval";

export interface BlastRadiusAuditObservation extends Observation {
  blast_radius_envelope: BlastRadiusEnvelope;
  capture_trigger: AuditTrigger;
}

interface UserPromptPayload extends BaseHookPayload {
  prompt?: string;
}

function logError(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

function envelopeSummary(envelope: BlastRadiusEnvelope): string {
  const parts = [`status=${envelope.status}`, `backend=${envelope.backend}`];
  if (envelope.reason) parts.push(`reason=${envelope.reason}`);
  if (envelope.output?.action_risk.level) {
    parts.push(`action_risk=${envelope.output.action_risk.level}`);
  }
  return parts.join(", ");
}

export function buildAuditObservation(input: {
  sessionId: string;
  trigger: AuditTrigger;
  envelope: BlastRadiusEnvelope;
  prompt?: string;
}): BlastRadiusAuditObservation {
  const summary = envelopeSummary(input.envelope);
  const content =
    input.trigger === "stop"
      ? `Blast-radius envelope captured at session Stop (${summary}).`
      : `Blast-radius envelope captured at operator approval (${summary}).`;

  const rationale =
    input.trigger === "operator-approval" && input.prompt?.trim()
      ? `Operator submitted approval phrase: "${input.prompt.trim()}". Envelope: ${summary}.`
      : `Passive audit capture on ${input.trigger}. Envelope: ${summary}.`;

  return {
    schema_version: "1.0",
    timestamp: new Date().toISOString(),
    session_id: input.sessionId,
    type: "observation",
    confidence: "high",
    source: "agent",
    content,
    rationale,
    related_files: [".snowball/blast-radius/last.json"],
    related_decision: null,
    tags: ["ambient", "blast-radius", input.trigger],
    blast_radius_envelope: input.envelope,
    capture_trigger: input.trigger,
  };
}

export function captureBlastRadiusAudit(input: {
  gitRoot: string;
  sessionId: string;
  trigger: AuditTrigger;
  prompt?: string;
}): boolean {
  if (input.trigger === "operator-approval" && !matchesApproval(input.prompt ?? "")) {
    return false;
  }

  const envelope = readLastEnvelope(input.gitRoot);
  if (!envelope) return false;

  const obs = buildAuditObservation({
    sessionId: input.sessionId,
    trigger: input.trigger,
    envelope,
    prompt: input.prompt,
  });

  appendObservation(obs, { gitRoot: input.gitRoot });
  return true;
}

function runCli(trigger: AuditTrigger): void {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload: UserPromptPayload = {};
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw) as UserPromptPayload;
      } catch (err) {
        logError(`audit-hook: bad JSON: ${(err as Error).message}`);
        process.exit(0);
        return;
      }
    }

    const gitRoot = detectGitRoot();
    if (!gitRoot) process.exit(0);

    const sessionId = resolveSessionId(payload) || "unknown";
    const prompt = payload.prompt ?? "";

    try {
      captureBlastRadiusAudit({
        gitRoot,
        sessionId,
        trigger,
        prompt: trigger === "operator-approval" ? prompt : undefined,
      });
    } catch (err) {
      logError(`audit-hook: capture failed: ${(err as Error).message}`);
    }

    process.exit(0);
  });
}

if (require.main === module) {
  const trigger = process.argv[2];
  if (trigger !== "stop" && trigger !== "operator-approval") {
    logError(`audit-hook: invalid trigger "${trigger ?? ""}"`);
    process.exit(0);
  }
  runCli(trigger);
}
