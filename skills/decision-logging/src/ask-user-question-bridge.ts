import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  normalizeAnswers,
  normalizeQuestions,
  resolveSessionId,
  type BaseHookPayload,
} from "./hook-payload";
import { writeMadr, type MadrInput } from "./write-madr";

const ERROR_LOG = path.join(os.homedir(), ".snowball", "decision-logging-errors.log");

interface AskUserQuestionPayload extends BaseHookPayload {
  tool_use_id?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_output?: unknown;
}

function logError(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

let raw = "";
process.stdin.on("data", (chunk: Buffer | string) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let payload: AskUserQuestionPayload;
  try {
    payload = JSON.parse(raw) as AskUserQuestionPayload;
  } catch (err) {
    logError(`ask-user-question-bridge: bad JSON payload: ${(err as Error).message}`);
    process.exit(0);
    return;
  }

  const questions = normalizeQuestions(payload.tool_input);
  const answers = normalizeAnswers(questions, payload.tool_response, payload.tool_output);
  const sessionId = resolveSessionId(payload) || "unknown";
  const sourceEventId = payload.tool_use_id ?? "unknown";

  const isoDate = new Date().toISOString();

  for (const q of questions) {
    const answer = answers[q.question];
    if (!answer) continue;

    const chosen = q.options?.find((o) => o.label === answer) ?? {
      label: answer,
      description: "",
    };

    const input: MadrInput = {
      title: String(q.question).replace(/\?+$/, ""),
      status: "accepted",
      date: isoDate,
      deciders: [process.env.USER ?? "unknown"],
      snowball: {
        schema_version: "1.0",
        source: "operator",
        confidence: "high",
        capture_mechanism: "ask-user-question",
        session_id: sessionId,
        source_event_id: sourceEventId,
        supersedes: null,
        tags: ["ambient"],
      },
      body: {
        context: q.header ? `Question category: ${q.header}.` : "",
        considered_options: (q.options ?? []).map((o) => ({
          name: o.label,
          description: o.description ?? "",
        })),
        decision_outcome: `Chose **${chosen.label}**. ${chosen.description ?? ""}`,
      },
    };

    try {
      writeMadr(input);
    } catch (err) {
      logError(`ask-user-question-bridge: writeMadr failed: ${(err as Error).message}`);
    }
  }

  process.exit(0);
});
