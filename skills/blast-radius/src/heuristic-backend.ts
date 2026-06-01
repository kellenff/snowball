import type { BlastRadiusOutput, RiskLevel } from "./envelope";
import {
  ACTION_RISK_RULES,
  countModuleBuckets,
  matchesAnyPattern,
  maxRiskLevel,
  riskLevelFromFileCount,
  SENSITIVE_PATH_PATTERNS,
  SHARED_INFRA_PATTERNS,
  THRESHOLDS,
} from "./schema";

export interface HeuristicInput {
  paths: string[];
  proposedAction?: string;
}

function scoreActionRisk(text: string | undefined): BlastRadiusOutput["action_risk"] {
  if (!text?.trim()) {
    return { level: "low", tags: [], rationale: [] };
  }
  let level: RiskLevel = "low";
  const tags: string[] = [];
  const rationale: string[] = [];
  for (const rule of ACTION_RISK_RULES) {
    if (rule.pattern.test(text)) {
      if (!tags.includes(rule.tag)) tags.push(rule.tag);
      level = maxRiskLevel(level, rule.level);
      rationale.push(`Matched ${rule.tag}`);
    }
  }
  return { level, tags, rationale };
}

function scoreChangeScope(paths: string[]): BlastRadiusOutput["change_scope"] {
  const sharedInfraFileCount = paths.filter((p) =>
    matchesAnyPattern(p, SHARED_INFRA_PATTERNS),
  ).length;
  const buckets = countModuleBuckets(paths);
  const crossModuleEditCount = Math.max(0, buckets - 1);
  const fileCount = paths.length;
  return {
    fileCount,
    files: paths,
    sharedInfraFileCount,
    crossModuleEditCount,
    level: riskLevelFromFileCount(fileCount),
  };
}

function scoreFailureImpact(paths: string[]): BlastRadiusOutput["failure_impact"] {
  const sensitivePaths = paths.filter((p) => matchesAnyPattern(p, SENSITIVE_PATH_PATTERNS));
  const buckets = countModuleBuckets(paths);
  const estimatedFanOut = sensitivePaths.length * 2 + Math.max(0, buckets - 1);
  let level: RiskLevel = "low";
  if (estimatedFanOut >= THRESHOLDS.failureImpact.highFanOut) level = "high";
  else if (estimatedFanOut >= THRESHOLDS.failureImpact.mediumFanOut || sensitivePaths.length > 0) {
    level = "medium";
  }
  return { estimatedFanOut, sensitivePaths, level };
}

export function computeHeuristic(input: HeuristicInput): BlastRadiusOutput {
  const paths = input.paths;
  return {
    change_scope: scoreChangeScope(paths),
    failure_impact: scoreFailureImpact(paths),
    action_risk: scoreActionRisk(input.proposedAction),
  };
}
