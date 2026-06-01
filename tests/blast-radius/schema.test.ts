import { describe, expect, test } from "bun:test";
import {
  matchesAnyPattern,
  maxRiskLevel,
  riskLevelFromFileCount,
  shouldFlagDecomposition,
} from "../../skills/blast-radius/src/schema";

describe("schema thresholds", () => {
  test("riskLevelFromFileCount", () => {
    expect(riskLevelFromFileCount(2)).toBe("low");
    expect(riskLevelFromFileCount(5)).toBe("medium");
    expect(riskLevelFromFileCount(12)).toBe("high");
  });

  test("shouldFlagDecomposition", () => {
    expect(
      shouldFlagDecomposition({ fileCount: 3, sharedInfraFileCount: 0, crossModuleEditCount: 0 }),
    ).toBe(false);
    expect(
      shouldFlagDecomposition({ fileCount: 9, sharedInfraFileCount: 0, crossModuleEditCount: 0 }),
    ).toBe(true);
  });

  test("matchesAnyPattern shared infra", () => {
    expect(matchesAnyPattern("hooks/on-stop.sh", ["hooks/"])).toBe(true);
    expect(matchesAnyPattern("skills/foo/x.ts", ["hooks/"])).toBe(false);
  });

  test("maxRiskLevel", () => {
    expect(maxRiskLevel("low", "high")).toBe("high");
    expect(maxRiskLevel("medium", "medium")).toBe("medium");
  });
});
