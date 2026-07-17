import type { BlastRadiusOutput, ReasonCode, RiskLevel } from "./envelope";
import { computeHeuristic } from "./heuristic-backend";
import { matchesAnyPattern, SENSITIVE_PATH_PATTERNS, THRESHOLDS } from "./schema";
import {
  createDefaultYacttGraphClient,
  isRepoIndexed,
  projectUriFromRoot,
  type YacttDetectChangesResult,
  type YacttGraphClient,
} from "./yactt-http-client";

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

async function estimateGraphFanOut(
  client: YacttGraphClient,
  projectUri: string,
  paths: string[],
  detect: YacttDetectChangesResult | null,
): Promise<number> {
  const seen = new Set<string>();
  let fanOut = 0;

  for (const change of detect?.changes ?? []) {
    const key = change.symbol?.id ?? change.file;
    if (key && !seen.has(key)) {
      seen.add(key);
      fanOut += 1;
    }
    for (const caller of change.callers ?? []) {
      const ck = caller.targetId ?? caller.location?.file;
      if (ck && !seen.has(ck)) {
        seen.add(ck);
        fanOut += 1;
      }
    }
  }

  for (const filePath of paths) {
    const overview = await client.getSymbolsOverview(projectUri, filePath);
    if (!overview) continue;
    for (const sym of overview.symbols ?? []) {
      if (!["FUNCTION", "METHOD"].includes(sym.kind)) continue;
      if (seen.has(sym.id)) continue;
      seen.add(sym.id);
      const refs = await client.findReferencingSymbols(projectUri, sym.id, {
        kinds: ["callers"],
        limit: 50,
      });
      const callerCount = refs?.references?.filter((r) => r.edgeKind === "callers").length ?? 0;
      fanOut += Math.max(1, callerCount);
    }
  }

  return fanOut;
}

export async function tryGraphBackend(
  input: {
    gitRoot: string;
    paths: string[];
    proposedAction?: string;
    gitRef?: string;
  },
  client: YacttGraphClient = createDefaultYacttGraphClient(),
): Promise<GraphAttempt> {
  if (!(await client.isAvailable())) {
    return { ok: false, reason: "graph-unavailable" };
  }

  const projects = await client.listProjects();
  if (!isRepoIndexed(projects, input.gitRoot)) {
    return { ok: false, reason: "repo-not-indexed" };
  }

  const projectUri = projectUriFromRoot(input.gitRoot);
  let detect: YacttDetectChangesResult | null = null;
  if (input.gitRef) {
    detect = await client.detectChanges(projectUri, { since: input.gitRef });
    if (detect === null) {
      return { ok: false, reason: "mcp-timeout" };
    }
  }

  const base = computeHeuristic({
    paths: input.paths,
    proposedAction: input.proposedAction,
  });
  const sensitivePaths = input.paths.filter((p) => matchesAnyPattern(p, SENSITIVE_PATH_PATTERNS));
  const estimatedFanOut = await estimateGraphFanOut(client, projectUri, input.paths, detect);

  return {
    ok: true,
    output: {
      ...base,
      failure_impact: failureImpactFromFanOut(estimatedFanOut, sensitivePaths),
    },
  };
}
