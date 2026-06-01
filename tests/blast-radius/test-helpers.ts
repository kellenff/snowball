import type {
  BlastRadiusEnvelope,
  BlastRadiusOutput,
} from "../../skills/blast-radius/src/envelope";

export function sampleOutput(overrides: Partial<BlastRadiusOutput> = {}): BlastRadiusOutput {
  return {
    change_scope: {
      fileCount: 2,
      files: ["skills/foo/SKILL.md", "tests/foo/smoke.test.ts"],
      sharedInfraFileCount: 0,
      crossModuleEditCount: 1,
      level: "low",
      ...(overrides.change_scope ?? {}),
    },
    failure_impact: {
      estimatedFanOut: 1,
      sensitivePaths: [],
      level: "low",
      ...(overrides.failure_impact ?? {}),
    },
    action_risk: {
      level: "low",
      tags: [],
      rationale: [],
      ...(overrides.action_risk ?? {}),
    },
    ...overrides,
  };
}

export function sampleEnvelope(overrides: Partial<BlastRadiusEnvelope> = {}): BlastRadiusEnvelope {
  return {
    status: "success",
    backend: "heuristic",
    output: sampleOutput(),
    reason: null,
    ...overrides,
  };
}
