export type BlastRadiusStatus = "success" | "degraded" | "error";
export type BlastRadiusBackend = "graph" | "heuristic" | "none";
export type BlastRadiusPreset = "design" | "pre-execution" | "completion";
export type RiskLevel = "low" | "medium" | "high";

export type ReasonCode =
  | "graph-unavailable"
  | "repo-not-indexed"
  | "change-untracked"
  | "mcp-timeout"
  | "compute-error"
  | "explicit-skip";

export interface ChangeScope {
  fileCount: number;
  files: string[];
  sharedInfraFileCount: number;
  crossModuleEditCount: number;
  level: RiskLevel;
}

export interface FailureImpact {
  estimatedFanOut: number;
  sensitivePaths: string[];
  level: RiskLevel;
}

export interface ActionRisk {
  level: RiskLevel;
  tags: string[];
  rationale: string[];
}

export interface BlastRadiusOutput {
  change_scope: ChangeScope;
  failure_impact: FailureImpact;
  action_risk: ActionRisk;
}

export interface BlastRadiusEnvelope {
  status: BlastRadiusStatus;
  backend: BlastRadiusBackend;
  output: BlastRadiusOutput | null;
  reason: ReasonCode | null;
}

export interface ComputeInput {
  gitRoot: string;
  preset: BlastRadiusPreset;
  changeSet: {
    /** Hypothetical or actual paths relative to repo root. */
    paths?: string[];
    /** When set, merge git diff paths against this ref (default: HEAD). */
    gitRef?: string;
    /** Proposed shell/command text for action-risk scoring (pre-execution). */
    proposedAction?: string;
  };
  explicitSkip?: boolean;
  skipReason?: string;
}

const REASON_CODES: ReasonCode[] = [
  "graph-unavailable",
  "repo-not-indexed",
  "change-untracked",
  "mcp-timeout",
  "compute-error",
  "explicit-skip",
];

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as string[]).includes(value);
}

export function assertEnvelope(envelope: BlastRadiusEnvelope): void {
  if (!["success", "degraded", "error"].includes(envelope.status)) {
    throw new Error(`invalid status: ${envelope.status}`);
  }
  if (!["graph", "heuristic", "none"].includes(envelope.backend)) {
    throw new Error(`invalid backend: ${envelope.backend}`);
  }
  if (envelope.status === "error") {
    if (envelope.backend !== "none") throw new Error("error status requires backend none");
    if (!envelope.reason) throw new Error("error status requires reason");
    if (envelope.output !== null) throw new Error("error status requires null output");
    return;
  }
  if (envelope.status === "success") {
    if (!envelope.output) throw new Error("success status requires output");
  }
  if (envelope.status === "degraded" && envelope.reason !== "explicit-skip") {
    if (!envelope.output) throw new Error("degraded status requires output unless explicit-skip");
  }
  if (envelope.reason && !isReasonCode(envelope.reason)) {
    throw new Error(`invalid reason: ${envelope.reason}`);
  }
}
