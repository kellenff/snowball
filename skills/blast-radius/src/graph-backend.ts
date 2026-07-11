import type { BackendAttempt, BlastRadiusOutput, ReasonCode, RiskLevel } from "./envelope";
import { computeHeuristic } from "./heuristic-backend";
import { matchesAnyPattern, SENSITIVE_PATH_PATTERNS, THRESHOLDS } from "./schema";
import {
  createDefaultCodebaseMemoryClient,
  createYacttClient,
  fallbackEnabled,
  resolveBackendId,
  resolveProjectName,
  type CodebaseMemoryClient,
  type DetectChangesResult,
} from "./mcp-cli";

export interface GraphAttempt {
  ok: boolean;
  output?: BlastRadiusOutput;
  reason?: ReasonCode;
  /** Ordered list of backend attempts. Empty on heuristic-only path. */
  backend_attempts?: BackendAttempt[];
}

function failureImpactFromFanOut(
  estimatedFanOut: number,
  sensitivePaths: string[],
): BlastRadiusOutput["failure_impact"] {
  let level: RiskLevel = "low";
  if (estimatedFanOut >= THRESHOLDS.failureImpact.highFanOut) level = "high";
  else if (
    estimatedFanOut >= THRESHOLDS.failureImpact.mediumFanOut ||
    sensitivePaths.length > 0
  ) {
    level = "medium";
  }
  return { estimatedFanOut, sensitivePaths, level };
}

function estimateGraphFanOut(
  client: CodebaseMemoryClient,
  project: string,
  paths: string[],
  detect: DetectChangesResult | null,
): number {
  const seen = new Set<string>();
  let fanOut = 0;

  for (const sym of detect?.impacted_symbols ?? []) {
    const key = sym.name ?? sym.file ?? "";
    if (key && !seen.has(key)) {
      seen.add(key);
      fanOut += 1;
    }
  }

  for (const filePath of paths) {
    const graph = client.searchGraph(project, {
      file_pattern: filePath,
      label: "Function",
      limit: 50,
    });
    if (graph === null) continue;
    for (const node of graph.results ?? []) {
      const qn = node.qualified_name ?? node.name;
      if (!qn || seen.has(qn)) continue;
      seen.add(qn);
      fanOut += Math.max(1, node.in_degree ?? 0);
    }
  }

  return fanOut;
}

interface AttemptResult {
  ok: boolean;
  reason?: ReasonCode;
  output?: BlastRadiusOutput;
}

/** Run a single backend attempt. Returns failure with reason on non-ok path. */
function attemptOne(
  label: BackendAttempt,
  client: CodebaseMemoryClient | null,
  input: { gitRoot: string; paths: string[]; proposedAction?: string },
): AttemptResult {
  if (client === null || !client.isAvailable()) {
    return { ok: false, reason: "graph-unavailable" };
  }
  const projects = client.listProjects();
  const project = resolveProjectName(projects, input.gitRoot);
  if (!project) return { ok: false, reason: "repo-not-indexed" };

  const detect = client.detectChanges(project, { scope: "impact" });
  if (detect === null) return { ok: false, reason: "mcp-timeout" };

  const base = computeHeuristic({
    paths: input.paths,
    proposedAction: input.proposedAction,
  });
  const sensitivePaths = input.paths.filter((p) =>
    matchesAnyPattern(p, SENSITIVE_PATH_PATTERNS),
  );
  const estimatedFanOut = estimateGraphFanOut(client, project, input.paths, detect);

  return {
    ok: true,
    output: {
      ...base,
      failure_impact: failureImpactFromFanOut(estimatedFanOut, sensitivePaths),
    },
  };
}

/**
 * Walk the chained fallback: try the selector's first backend; on failure (and
 * auto-fallback enabled), retry with the other graph backend; finally fall
 * through to heuristic. `backend_attempts` records what was tried in order.
 *
 * When `injectedClient` is provided, the chained fallback is bypassed and only
 * that client is attempted. Used by graph-backend.test.ts to avoid shelling out
 * to a real backend. (Outside test code, omit this argument.)
 */
export function tryGraphBackend(
  input: { gitRoot: string; paths: string[]; proposedAction?: string },
  injectedClient?: CodebaseMemoryClient,
): GraphAttempt {
  const sel = resolveBackendId();
  const attempts: BackendAttempt[] = [];
  let firstReason: ReasonCode | undefined;
  let secondReason: ReasonCode | undefined;

  // In test mode we bypass the chained fallback.
  if (injectedClient) {
    const r = attemptOne("codebase-memory", injectedClient, input);
    if (r.ok && r.output) {
      return { ok: true, output: r.output };
    }
    return { ok: false, reason: r.reason };
  }

  // Step 1: selector-driven first attempt.
  if (sel !== "heuristic") {
    const firstLabel: BackendAttempt = sel === "codebase-memory" ? "codebase-memory" : "yactt";
    const client = sel === "codebase-memory"
      ? createDefaultCodebaseMemoryClient()
      : createYacttClient(input.gitRoot);
    const r = attemptOne(firstLabel, client, input);
    attempts.push(firstLabel);
    if (r.ok && r.output) {
      return { ok: true, output: r.output, backend_attempts: attempts };
    }
    firstReason = r.reason;
  }

  // Step 2: auto-fallback to the *other* graph backend, if enabled.
  if (fallbackEnabled() && sel !== "heuristic") {
    const secondLabel: BackendAttempt =
      sel === "yactt" ? "codebase-memory" : "yactt";
    const client = secondLabel === "codebase-memory"
      ? createDefaultCodebaseMemoryClient()
      : createYacttClient(input.gitRoot);
    const r = attemptOne(secondLabel, client, input);
    attempts.push(secondLabel);
    if (r.ok && r.output) {
      return { ok: true, output: r.output, backend_attempts: attempts };
    }
    secondReason = r.reason;
  }

  // Step 3: heuristic fallback (always available).
  const output = computeHeuristic({
    paths: input.paths,
    proposedAction: input.proposedAction,
  });
  // Last-attempt wins for the reason code; override a weaker
  // `graph-unavailable` when the second attempt produced something more
  // specific.
  const reason: ReasonCode | undefined =
    secondReason ?? firstReason;
  return {
    ok: false,
    reason,
    output,
    backend_attempts: attempts,
  };
}
