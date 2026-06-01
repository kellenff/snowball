import { describe, expect, test } from "bun:test";
import { renderOperatorReport } from "../../skills/blast-radius/src/render";
import { shouldFlagDecomposition } from "../../skills/blast-radius/src/schema";
import { sampleEnvelope, sampleOutput } from "./test-helpers";

describe("renderOperatorReport", () => {
  test("design preset shows decomposition flag for wide scope", () => {
    const scope = {
      fileCount: 10,
      files: Array.from({ length: 10 }, (_, i) => `skills/m${i}/x.ts`),
      sharedInfraFileCount: 4,
      crossModuleEditCount: 3,
      level: "medium" as const,
    };
    expect(shouldFlagDecomposition(scope)).toBe(true);
    const text = renderOperatorReport(
      sampleEnvelope({ output: sampleOutput({ change_scope: scope }) }),
      "design",
    );
    expect(text).toContain("splitting into sub-plans");
    expect(text).toContain("Backend: heuristic");
  });

  test("pre-execution surfaces high action risk", () => {
    const text = renderOperatorReport(
      sampleEnvelope({
        output: sampleOutput({
          action_risk: {
            level: "high",
            tags: ["destructive-shell"],
            rationale: ["Matched destructive-shell"],
          },
        }),
      }),
      "pre-execution",
    );
    expect(text).toContain("Operator confirmation required");
    expect(text).toContain("destructive-shell");
  });

  test("error on pre-execution recommends confirmation", () => {
    const text = renderOperatorReport(
      sampleEnvelope({ status: "error", backend: "none", output: null, reason: "compute-error" }),
      "pre-execution",
    );
    expect(text).toContain("confirm with the operator");
  });
});
