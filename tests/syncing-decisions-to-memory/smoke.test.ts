import { test, expect } from "bun:test";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

test("harness can create a temp repo with a fixture decision", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-05-30T2035-x.md",
      madrFixture({ title: "X", status: "accepted" }),
    );
    expect(repo.length).toBeGreaterThan(0);
  } finally {
    cleanupTempRepo(repo);
  }
});
