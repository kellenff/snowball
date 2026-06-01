import type { BlastRadiusOutput, ReasonCode, RiskLevel } from "./envelope";
import { computeHeuristic } from "./heuristic-backend";
import { matchesAnyPattern, SENSITIVE_PATH_PATTERNS, THRESHOLDS } from "./schema";
import {
  createDefaultCodebaseMemoryClient,
  resolveProjectName,
  type CodebaseMemoryClient,
  type DetectChangesResult,
} from "./mcp-cli";

export interface GraphAttempt {
  ok: boolean;
  output?: BlastRadiusOutput;
  reason?: ReasonCode;
}

function failureImpactFromFanOut(
  estimatedFanOut: number,
  sensitivePaths: string[],
): BlastRadiusOutput["failure_impact"] {
  let level: RiskLevel = "low";
  if (estimatedFanOut >= THRESHOLDS.failureImpact.highFanOut) level = "high";
  else if (estimatedFanOut >= THRESHOLDS.failureImpact.mediumFanOut || sensitivePaths.length > 0) {
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

export function tryGraphBackend(
  input: { gitRoot: string; paths: string[]; proposedAction?: string },
  client: CodebaseMemoryClient = createDefaultCodebaseMemoryClient(),
): GraphAttempt {
  if (!client.isAvailable()) {
    return { ok: false, reason: "graph-unavailable" };
  }

  const project = resolveProjectName(client.listProjects(), input.gitRoot);
  if (!project) {
    return { ok: false, reason: "repo-not-indexed" };
  }

  const detect = client.detectChanges(project, { scope: "impact" });
  if (detect === null) {
    return { ok: false, reason: "mcp-timeout" };
  }

  const base = computeHeuristic({
    paths: input.paths,
    proposedAction: input.proposedAction,
  });
  const sensitivePaths = input.paths.filter((p) => matchesAnyPattern(p, SENSITIVE_PATH_PATTERNS));
  const estimatedFanOut = estimateGraphFanOut(client, project, input.paths, detect);

  return {
    ok: true,
    output: {
      ...base,
      failure_impact: failureImpactFromFanOut(estimatedFanOut, sensitivePaths),
    },
  };
}
