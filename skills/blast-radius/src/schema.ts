import type { RiskLevel } from "./envelope";

export const THRESHOLDS = {
  changeScope: {
    mediumFiles: 5,
    highFiles: 12,
    decompositionFiles: 8,
    decompositionSharedInfra: 3,
    decompositionCrossModule: 5,
  },
  failureImpact: {
    mediumFanOut: 3,
    highFanOut: 8,
  },
  actionRisk: {
    surfaceAt: "medium" as RiskLevel,
  },
} as const;

export const SHARED_INFRA_PATTERNS = [
  ".pre-commit-config.yaml",
  "package.json",
  "tsconfig.json",
  "scripts/",
  "hooks/",
] as const;

export const SENSITIVE_PATH_PATTERNS = [
  "hooks/",
  "skills/decision-logging/",
  ".pre-commit-config.yaml",
] as const;

export const MODULE_BUCKETS = ["skills/", "tests/", "hooks/", "scripts/", "docs/"] as const;

export interface ActionRiskRule {
  tag: string;
  pattern: RegExp;
  level: RiskLevel;
}

export const ACTION_RISK_RULES: ActionRiskRule[] = [
  { tag: "destructive-shell", pattern: /\brm\s+-rf\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bgit\s+push\s+--force\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bgit\s+reset\s+--hard\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bdrop\s+table\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\btruncate\b/i, level: "high" },
  { tag: "hard-to-reverse", pattern: /\bmigrate\b.*\bdown\b/i, level: "high" },
  { tag: "hard-to-reverse", pattern: /\bchmod\s+000\b/i, level: "high" },
  { tag: "shared-visible", pattern: /\bgit\s+push\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\bgh\s+pr\s+create\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\bdeploy\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\brelease\b/i, level: "medium" },
  { tag: "third-party-upload", pattern: /\bcurl\b.*\b(-d|--data)\b/i, level: "medium" },
  { tag: "schema-change", pattern: /\bdbmate\b/i, level: "medium" },
  { tag: "schema-change", pattern: /\bALTER\s+TABLE\b/i, level: "medium" },
];

const LEVEL_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export function riskLevelFromFileCount(count: number): RiskLevel {
  if (count >= THRESHOLDS.changeScope.highFiles) return "high";
  if (count >= THRESHOLDS.changeScope.mediumFiles) return "medium";
  return "low";
}

export function shouldFlagDecomposition(scope: {
  fileCount: number;
  sharedInfraFileCount: number;
  crossModuleEditCount: number;
}): boolean {
  return (
    scope.fileCount > THRESHOLDS.changeScope.decompositionFiles ||
    scope.sharedInfraFileCount > THRESHOLDS.changeScope.decompositionSharedInfra ||
    scope.crossModuleEditCount > THRESHOLDS.changeScope.decompositionCrossModule
  );
}

export function matchesAnyPattern(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

export function countModuleBuckets(paths: string[]): number {
  const hit = new Set<string>();
  for (const file of paths) {
    for (const bucket of MODULE_BUCKETS) {
      if (file.startsWith(bucket)) hit.add(bucket);
    }
  }
  return hit.size;
}
