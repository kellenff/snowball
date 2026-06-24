import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { normalizeQuestions, resolveSessionId, type BaseHookPayload } from "./hook-payload";
import { handleAskUserQuestion } from "./ask-user-question-bridge";
import { detectGitRoot } from "./git-root";

const ERROR_LOG = path.join(os.homedir(), ".snowball", "decision-logging-errors.log");

interface VtcodePostToolUsePayload extends BaseHookPayload {
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_output?: unknown;
}

interface NormalizedQuestion {
  id?: string;
  question: string;
  header?: string;
  options?: Array<{ id?: string; label: string; description?: string }>;
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
 * Pure: convert VTCode's `request_user_input` response shape to the
 * `{ question_text: label }` shape `handleAskUserQuestion` expects.
 *
 * VTCode answers wrap the label in `{ selected: [label, ...], other?: string }`
 * and key by question `id` (snake_case), not question text. When `selected`
 * is empty (or not a string), fall back to the freeform `other` field.
 */
export function normalizeVtcodeAnswers(
  questions: NormalizedQuestion[],
  rawAnswers: unknown,
): Record<string, string> {
  if (!rawAnswers || typeof rawAnswers !== "object") return {};
  const answers = (rawAnswers as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") return {};

  const out: Record<string, string> = {};
  for (const q of questions) {
    if (!q.id) continue;
    const answer = (answers as Record<string, unknown>)[q.id];
    if (!answer || typeof answer !== "object") continue;
    const selected = (answer as { selected?: unknown }).selected;
    const other = (answer as { other?: unknown }).other;
    const label =
      Array.isArray(selected) && typeof selected[0] === "string"
        ? selected[0]
        : typeof other === "string" && other.trim()
          ? other
          : null;
    if (!label) continue;
    out[q.question] = label;
  }
  return out;
}

export interface VtcodePostToolUseInput {
  toolInput: unknown;
  toolResponse: unknown;
  sessionId: string;
  sourceEventId: string;
  gitRoot: string;
}

/**
 * Pure: parse a VTCode PostToolUse payload for `request_user_input` and
 * write one MADR per answered question by delegating to the existing
 * `handleAskUserQuestion`. Returns the number of MADRs written.
 */
export function handleVtcodePostToolUse(input: VtcodePostToolUseInput): number {
  const questions = normalizeQuestions(input.toolInput);
  const answers = normalizeVtcodeAnswers(questions, input.toolResponse);
  return handleAskUserQuestion({
    questions,
    answers,
    sessionId: input.sessionId,
    sourceEventId: input.sourceEventId,
    gitRoot: input.gitRoot,
  });
}

// CLI entry: read the VTCode PostToolUse payload from stdin and capture.
// cwd is the project root (the shell shim `cd`s in), so detectGitRoot
// resolves correctly for this short-lived process.
function runCli(): void {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload: VtcodePostToolUsePayload;
    try {
      payload = JSON.parse(raw) as VtcodePostToolUsePayload;
    } catch (err) {
      logError(`vtcode-post-tool-use-bridge: bad JSON: ${(err as Error).message}`);
      process.exit(0);
      return;
    }

    // Defensive: only act on request_user_input events. The TOML matcher
    // already filters, but VTCode may evolve to share the hook entry
    // across tools in the future.
    if (payload.tool_name && payload.tool_name !== "request_user_input") {
      process.exit(0);
      return;
    }

    const gitRoot = detectGitRoot();
    if (!gitRoot) process.exit(0);

    handleVtcodePostToolUse({
      toolInput: payload.tool_input,
      toolResponse: payload.tool_response,
      sessionId: resolveSessionId(payload) || "unknown",
      sourceEventId: payload.tool_use_id ?? "unknown",
      gitRoot,
    });
    process.exit(0);
  });
}

if (import.meta.main || (typeof require !== "undefined" && require.main === module)) {
  runCli();
}
