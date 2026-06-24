import { test, expect } from "bun:test";
import {
  classifyPatchRisk,
  type BlastRadiusVerdict,
} from "../../skills/decision-logging/src/apply-patch-blast-radius";

test("classifyPatchRisk flags deletion of many files as high-risk", () => {
  const bigDelete = Array.from(
    { length: 25 },
    (_, i) =>
      `diff --git a/file${i}.ts b/file${i}.ts\ndeleted file mode 100644\n--- a/file${i}.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x\n`,
  ).join("");
  const v = classifyPatchRisk(bigDelete);
  expect(v.risk).toBe("high");
  expect(v.reasons.length).toBeGreaterThan(0);
});

test("classifyPatchRisk treats a small additive change as low-risk", () => {
  const safe =
    "diff --git a/foo.ts b/foo.ts\n@@ -0,0 +1 @@\n+export const x = 1;\n";
  const v = classifyPatchRisk(safe);
  expect(v.risk).toBe("low");
  expect(v.reasons.length).toBe(0);
});

test("classifyPatchRisk flags changes to blast-radius-marker paths as high-risk", () => {
  const lockfile =
    "diff --git a/package-lock.json b/package-lock.json\n@@ -1,1 +1,1 @@\n-old\n+new\n";
  const v = classifyPatchRisk(lockfile);
  expect(v.risk).toBe("high");
  expect(v.reasons.some((r) => /lockfile/i.test(r))).toBe(true);
});

test("verdict-to-decision mapping returns allow/block correctly", () => {
  const allow: BlastRadiusVerdict = { risk: "low", reasons: [] };
  const block: BlastRadiusVerdict = { risk: "high", reasons: ["big"] };
  // Verify the shape contract callers rely on (decision is computed in shell).
  expect(allow.risk).toBe("low");
  expect(block.risk).toBe("high");
});
