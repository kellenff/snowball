export interface TokenUsage {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolUseId: string;
  isError: boolean;
}

export interface Message {
  index: number;
  sessionId: string;
  role: "user" | "assistant" | "system";
  timestamp: string | null;
  usage: TokenUsage | null;
  hasUserText: boolean;
  toolUses: ToolUse[];
  toolResults: ToolResult[];
}

export interface SkillWindow {
  skillName: string;
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  messageSpan: [number, number];
  messages: Message[];
}

export interface WindowMetrics {
  marginalTokens: number; // output_tokens + cache_creation_input_tokens
  totalTokens: number; // + input_tokens + cache_read_input_tokens
  toolCalls: number;
  toolErrors: number;
  retries: number;
}

export interface TokenStats {
  total: number;
  p50: number;
  p95: number;
}

export interface SampleWindowRef {
  sessionId: string;
  startedAt: string | null;
  messageSpan: [number, number];
  marginalTokens: number;
}

export interface CandidateRecord {
  skill_name: string;
  invocation_count: number;
  tokens: {
    marginal: TokenStats;
    billed_total: { p50: number; p95: number };
  };
  reliability: {
    tool_calls: number;
    tool_error_rate: number;
    retry_rate: number;
  };
  triage_score: number;
  sample_windows: SampleWindowRef[];
  approximations: string[];
}

export type AnalyzerStatus = "success" | "degraded" | "error";

export type AnalyzerReason =
  | "transcript-unreadable"
  | "schema-drift"
  | "no-skill-invocations"
  | "otlp-unreachable";

export type TransportPath = "otlp" | "prometheus-file" | "json-only";

export interface AnalyzerEnvelope {
  status: AnalyzerStatus;
  source: string;
  windowCount: number;
  droppedWindowCount: number;
  transport: TransportPath;
  reason: AnalyzerReason | null;
  candidates: CandidateRecord[];
}

export const FLAT_SEGMENTATION_APPROX = "flat-segmentation-no-nesting";
export const SUBAGENT_LUMPED_APPROX = "subagent-lumped";
