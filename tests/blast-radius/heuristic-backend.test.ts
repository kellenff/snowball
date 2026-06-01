import { describe, expect, test } from "bun:test";
import { computeHeuristic } from "../../skills/blast-radius/src/heuristic-backend";
import { shouldFlagDecomposition } from "../../skills/blast-radius/src/schema";

describe("computeHeuristic", () => {
  test("small skill edit stays low", () => {
    const out = computeHeuristic({
      paths: ["skills/example/SKILL.md", "tests/example/smoke.test.ts"],
    });
    expect(out.change_scope.level).toBe("low");
    expect(out.failure_impact.level).toBe("low");
    expect(out.action_risk.level).toBe("low");
  });

  test("wide cross-module edit flags decomposition", () => {
    const paths = [
      "skills/blast-radius/src/compute.ts",
      "tests/blast-radius/compute.test.ts",
      "hooks/blast-radius-audit.sh",
      "scripts/build-blast-radius.sh",
      ".pre-commit-config.yaml",
      "package.json",
      "tsconfig.json",
    ];
    const out = computeHeuristic({ paths });
    expect(out.change_scope.sharedInfraFileCount).toBeGreaterThan(3);
    expect(shouldFlagDecomposition(out.change_scope)).toBe(true);
  });

  test("destructive shell action scores high", () => {
    const out = computeHeuristic({
      paths: [],
      proposedAction: "git push --force origin main",
    });
    expect(out.action_risk.level).toBe("high");
    expect(out.action_risk.tags).toContain("destructive-shell");
  });
});
