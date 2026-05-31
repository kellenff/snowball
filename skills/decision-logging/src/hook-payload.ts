export interface BaseHookPayload {
  session_id?: string;
  conversation_id?: string;
  transcript_path?: string | null;
}

export interface NormalizedQuestion {
  id?: string;
  question: string;
  header?: string;
  options?: Array<{ id?: string; label: string; description?: string }>;
}

export function resolveSessionId(payload: BaseHookPayload): string {
  return (payload.session_id ?? payload.conversation_id ?? "").toString();
}

export function resolveTranscriptPath(payload: BaseHookPayload): string {
  const path = payload.transcript_path;
  return typeof path === "string" ? path : "";
}

export function parseToolOutput(toolOutput: unknown): Record<string, unknown> | null {
  if (toolOutput == null) return null;
  if (typeof toolOutput === "object" && !Array.isArray(toolOutput)) {
    return toolOutput as Record<string, unknown>;
  }
  if (typeof toolOutput !== "string" || !toolOutput.trim()) return null;
  try {
    const parsed = JSON.parse(toolOutput) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

export function normalizeQuestions(toolInput: unknown): NormalizedQuestion[] {
  if (!toolInput || typeof toolInput !== "object") return [];
  const raw = (toolInput as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return [];

  const out: NormalizedQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const question = String(q.question ?? q.prompt ?? "").trim();
    if (!question) continue;

    const optionsRaw = q.options;
    const options = Array.isArray(optionsRaw)
      ? optionsRaw
          .map((opt) => {
            if (!opt || typeof opt !== "object") return null;
            const o = opt as Record<string, unknown>;
            const label = String(o.label ?? o.id ?? "").trim();
            if (!label) return null;
            return {
              id: typeof o.id === "string" ? o.id : undefined,
              label,
              description: typeof o.description === "string" ? o.description : "",
            };
          })
          .filter((opt): opt is { id?: string; label: string; description: string } => opt !== null)
      : undefined;

    out.push({
      id: typeof q.id === "string" ? q.id : undefined,
      question,
      header: typeof q.header === "string" ? q.header : undefined,
      options,
    });
  }
  return out;
}

function optionLabelForId(
  questions: NormalizedQuestion[],
  questionKey: string,
  answerValue: string,
): string {
  for (const q of questions) {
    if (q.id !== questionKey && q.question !== questionKey) continue;
    const byLabel = q.options?.find((o) => o.label === answerValue);
    if (byLabel) return byLabel.label;
    const byId = q.options?.find((o) => o.id === answerValue);
    if (byId) return byId.label;
  }
  return answerValue;
}

export function normalizeAnswers(
  questions: NormalizedQuestion[],
  toolResponse: unknown,
  toolOutput: unknown,
): Record<string, string> {
  const fromResponse =
    toolResponse &&
    typeof toolResponse === "object" &&
    (toolResponse as { answers?: unknown }).answers &&
    typeof (toolResponse as { answers?: unknown }).answers === "object"
      ? ((toolResponse as { answers: Record<string, string> }).answers ?? {})
      : null;
  if (fromResponse) return fromResponse;

  const parsed = parseToolOutput(toolOutput);
  if (!parsed) return {};

  const nested =
    parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)
      ? (parsed.answers as Record<string, string>)
      : null;
  const raw = nested ?? parsed;

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string" || !value.trim()) continue;
    const question = questions.find((q) => q.id === key || q.question === key);
    const questionText = question?.question ?? key;
    out[questionText] = optionLabelForId(questions, key, value);
  }
  return out;
}
