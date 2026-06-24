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

export interface AskUserQuestionInput {
  questions: NormalizedQuestion[];
  answers: Record<string, string>;
  sessionId: string;
  sourceEventId: string;
  gitRoot: string;
}

function logError(msg: string): void {
  try {
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // last-resort: nothing
  }
}

/**
 * Pure handler: write one MADR per answered question. `gitRoot` is required
 * (callers resolve it explicitly). Returns the number of MADRs written.
 */
export function handleAskUserQuestion(input: AskUserQuestionInput): number {
  const { questions, answers, sessionId, sourceEventId, gitRoot } = input;
  const isoDate = new Date().toISOString();
  let written = 0;

  for (const q of questions) {
    const answer = answers[q.question];
    if (!answer) continue;

    const chosen = q.options?.find((o) => o.label === answer) ?? {
      label: answer,
      description: "",
    };

    const madr: MadrInput = {
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
      writeMadr(madr, { gitRoot });
      written += 1;
    } catch (err) {
      logError(`ask-user-question-bridge: writeMadr failed: ${(err as Error).message}`);
    }
  }

  return written;
}

// CLI entry: read the Claude/Cursor PostToolUse payload from stdin. cwd is the
// project root (the shell shim `cd`s in), so detectGitRoot resolves correctly.
function runCli(): void {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload: AskUserQuestionPayload;
    try {
      const parsed = JSON.parse(raw);
      payload = parsed as AskUserQuestionPayload;
    } catch (err) {
      logError(`ask-user-question-bridge: bad JSON payload: ${(err as Error).message}`);
      process.exit(0);
      return;
    }

    const questions = normalizeQuestions(payload.tool_input);
    const answers = normalizeAnswers(questions, payload.tool_response, payload.tool_output);
    const sessionId = resolveSessionId(payload) || "unknown";
    const sourceEventId = payload.tool_use_id ?? "unknown";

    const gitRoot = detectGitRoot();
    if (!gitRoot) process.exit(0);

    handleAskUserQuestion({ questions, answers, sessionId, sourceEventId, gitRoot });
    process.exit(0);
  });
}

if (import.meta.main || (typeof require !== "undefined" && require.main === module)) {
  runCli();
}
